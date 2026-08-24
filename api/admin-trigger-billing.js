// ============================================================================
// POST /api/admin-trigger-billing — manual billing / reminder run
// ----------------------------------------------------------------------------
// The dashboard's "generate invoices now" and "chase pending dues" buttons. Same
// money path as the cron, but operator-initiated and scoped to a batch or a
// single student.
//
// Three defects this file used to carry:
//
//   1. Batch resolution was `if (str.includes('10')) … else 'all'`, and no
//      branch matched 'Class 12th', 'Class 11th' or any Special English name.
//      Choosing "Class 12th" in the UI therefore resolved to 'all' and billed
//      EVERY student in the institute, and a senior's fee fell through to the
//      1000 default instead of 1500.
//
//   2. The non-atomic fallback incremented students.pending_fee BEFORE writing
//      the ledger row, and the ledger upsert named only the idempotency_key
//      index. A row already present under the other unique index
//      (student_id, billing_month) made that insert raise — after the balance
//      had already gone up — so the charge existed with no ledger entry and the
//      next click did it again. That fallback is gone: apply_monthly_fee takes a
//      FOR UPDATE lock on the student row and is the only billing path.
//
//   3. Emails went straight to Resend with no quota accounting, so an operator
//      clicking "generate invoices" on a day the cron had already run would
//      silently push past the 100/day cap and the last families would get
//      nothing.
// ============================================================================

import { getSupabase, requireCronOrAdmin, applyCors } from './_lib/auth.js';
import {
  sendEmailViaResend,
  extractResendErrorMessage,
  isValidResendApiKey,
  isVerifiedSenderDomain,
  DEFAULT_FROM,
  EMAIL_PATTERN
} from './_lib/resend-sender.js';
import { feeEmail, reminderEmail, formatMonthLabel } from './_lib/email-templates.js';
import { dispatchWithQuota, EMAIL_CATEGORIES } from './_lib/email-quota.js';
import {
  BATCHES,
  BATCH_BY_ID,
  resolveBatch,
  monthlyFeeFor,
  istMonthKey
} from './_lib/academic-config.js';

const MAX_EMAIL_ATTEMPTS = 3;
const monthLabel = formatMonthLabel;

const isActive = student => !student.status || String(student.status).toLowerCase() === 'active';
const hasEmail = student => typeof student.email === 'string' && EMAIL_PATTERN.test(student.email.trim());

/**
 * Which batch ids a `targetClass` request covers.
 *
 * Accepts a batch id ('BAT-12PCM'), a free-text class name ('Class 12th PCM'),
 * or 'all'. Returns null for 'all' meaning "do not filter", and an empty array
 * for an unrecognised target — which must NOT be treated as 'all', since that is
 * precisely how the old code turned a Class 12th request into a bill-everybody
 * run.
 *
 * A request that names a class but not a stream covers both streams of that
 * class: "Class 12th" means PCM and PCB, because an operator picking it from the
 * dashboard means the whole year group. Widening is deliberately limited to the
 * PCM/PCB pair — the three Special English batches share a class code, so
 * widening on that would turn a 1st-5th English request into all three tiers.
 */
function resolveTargetBatchIds(targetClass) {
  const raw = String(targetClass || 'all').trim();
  if (!raw || raw.toLowerCase() === 'all') return null;

  const batch = resolveBatch(raw);
  if (!batch) return [];

  // An explicit batch id is exact and never widened. Note this cannot be folded
  // into the stream test below: \b does not match inside "BAT-11PCB", so the
  // regex sees no stream there and would widen an exact id to both cohorts.
  if (BATCH_BY_ID.has(raw.toUpperCase())) return [batch.batchId];

  const namesStream = /(pcm|pcb|math|bio)/i.test(raw);
  const isStreamed = batch.stream === 'PCM' || batch.stream === 'PCB';
  if (!namesStream && isStreamed) {
    return BATCHES
      .filter(b => b.classCode === batch.classCode && (b.stream === 'PCM' || b.stream === 'PCB'))
      .map(b => b.batchId);
  }
  return [batch.batchId];
}

/** Statement for a ledger row, gated on the atomic claim. */
async function sendStatement(supabase, from, { student, ledger }) {
  const { data: claim, error: claimError } = await supabase.rpc('claim_ledger_email', {
    p_ledger_id: ledger.ledger_id,
    p_max_attempts: MAX_EMAIL_ATTEMPTS
  });
  if (claimError) {
    console.error('[admin-billing] claim_ledger_email failed:', claimError.message);
    return null;
  }
  // Lost the claim to the cron or a double-clicked button, already sent, or the
  // attempt budget is spent. Returning null releases the quota slot.
  if (!claim?.claimed) return null;

  const result = await sendEmailViaResend({
    from,
    to: [student.email],
    subject: `Monthly Fee Statement — ${student.name} (${monthLabel(ledger.billing_month)})`,
    html: feeEmail(student, ledger),
    headers: { 'X-Entity-Ref-ID': ledger.idempotency_key || `ledger-${ledger.ledger_id}` }
  });

  const success = Boolean(result?.success) || Boolean(result?.timedOut);
  await supabase.rpc('settle_ledger_email', {
    p_ledger_id: ledger.ledger_id,
    p_success: success,
    p_message_id: result?.data?.id || null,
    p_error: result?.success ? null : extractResendErrorMessage(result?.error).slice(0, 500)
  });

  return {
    result,
    error: result?.success ? null : extractResendErrorMessage(result?.error),
    report: { studentId: student.student_id, name: student.name, email: student.email, action: 'statement' }
  };
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const session = requireCronOrAdmin(req, res);
  if (!session) return;
  const adminUser = session.isCron ? 'System Cron' : (session.name || session.username || 'Admin');

  const supabase = getSupabase();
  if (!supabase) return res.status(503).json({ error: 'Database service is not configured' });

  const rawFrom = process.env.RESEND_FROM_EMAIL || DEFAULT_FROM;
  const from = isVerifiedSenderDomain(rawFrom) ? rawFrom : DEFAULT_FROM;
  const isEmailConfigured = Boolean(isValidResendApiKey(process.env.RESEND_API_KEY) && isVerifiedSenderDomain(from));

  const { targetClass = 'all', action = 'invoice', studentId = 'all', toEmail = '' } = req.body || {};
  if (action !== 'invoice' && action !== 'reminder' && action !== 'test') {
    return res.status(400).json({ success: false, error: `Unknown action "${action}"` });
  }

  // A one-off deliverability probe, used by the trigger-billing workflow to prove
  // the Resend key and the verified sender still work. It goes through the same
  // quota ledger as everything else: a smoke test that quietly consumed slot 100
  // would cost a family their fee statement.
  if (action === 'test') {
    const probe = String(toEmail || '').trim().toLowerCase();
    if (!EMAIL_PATTERN.test(probe)) {
      return res.status(400).json({ success: false, error: 'A valid toEmail is required for action "test"' });
    }
    if (!isEmailConfigured) {
      return res.status(503).json({ success: false, error: 'Resend is not configured on this deployment' });
    }
    const outcome = await dispatchWithQuota({
      items: [{ email: probe }],
      category: EMAIL_CATEGORIES.ADMIN,
      getEmail: item => item.email,
      reference: 'SMOKE-TEST',
      send: async (item) => {
        const result = await sendEmailViaResend({
          from,
          to: [item.email],
          subject: 'Pragyan Institute — email delivery test',
          text: `Resend dispatch from ${from} is working. Triggered by ${adminUser}.`
        });
        return {
          result,
          error: result?.success ? null : extractResendErrorMessage(result?.error),
          report: { email: item.email, action: 'test' }
        };
      }
    }).catch(error => {
      console.error('[admin-billing] test dispatch failed:', error?.message || error);
      return { results: [], deferred: [probe], quotaError: 'Test dispatch failed' };
    });
    const delivered = outcome.results.some(r => r.status === 'sent');
    return res.status(delivered ? 200 : 502).json({
      success: delivered,
      action: 'test',
      results: outcome.results,
      deferred: outcome.deferred,
      quotaError: outcome.quotaError,
      error: delivered ? undefined : (outcome.quotaError || outcome.results[0]?.error || 'Test email was not delivered')
    });
  }

  const monthKey = istMonthKey();
  const currentMonthName = monthLabel(monthKey);
  // An explicit student wins outright; the class selector is then irrelevant and
  // applying it too could silently narrow the request to nobody.
  const singleStudent = Boolean(studentId && studentId !== 'all');
  const targetBatchIds = singleStudent ? null : resolveTargetBatchIds(targetClass);
  const wholeInstitute = !singleStudent && targetBatchIds === null;

  // An unrecognised batch is refused rather than silently widened. The operator
  // gets told their selection did not resolve instead of billing everyone.
  if (Array.isArray(targetBatchIds) && targetBatchIds.length === 0) {
    return res.status(400).json({
      success: false,
      error: `Could not resolve "${targetClass}" to any of the 12 academic batches. Nothing was billed.`,
      knownBatches: BATCHES.map(b => ({ batchId: b.batchId, className: b.className }))
    });
  }

  try {
    let query = supabase
      .from('students')
      .select('id,student_id,name,roll_no,class_name,monthly_fee,status,pending_fee,total_fee,email');
    if (singleStudent) {
      query = query.eq('student_id', studentId);
    }
    const { data: rawStudents, error: fetchErr } = await query;
    if (fetchErr) throw fetchErr;

    // Filter in JS against the canonical resolver rather than with an ilike:
    // `ilike('%10%')` matched any class name containing a 10, and the junior
    // branch matched every name containing a 6 or a 7.
    const activeStudents = (rawStudents || [])
      .filter(isActive)
      .filter(s => {
        if (targetBatchIds === null) return true;
        const batch = resolveBatch(s.class_name);
        return batch ? targetBatchIds.includes(batch.batchId) : false;
      });

    const results = [];
    let billedCount = 0;
    let deferred = [];
    let quotaError = null;

    if (action === 'invoice') {
      const pendingStatements = [];

      for (const student of activeStudents) {
        const explicit = Number(student.monthly_fee);
        const amount = explicit > 0 ? explicit : monthlyFeeFor(student.class_name, null);
        if (!(amount > 0)) {
          results.push({ studentId: student.student_id, name: student.name, status: 'billing_skipped', error: `Cannot resolve a fee for class "${student.class_name || ''}"` });
          continue;
        }

        const { data: response, error: billingError } = await supabase.rpc('apply_monthly_fee', {
          p_student_id: student.student_id,
          p_billing_month: monthKey,
          p_amount: amount,
          p_batch_label: student.class_name || resolveBatch(student.class_name)?.name || null
        });

        if (billingError || !response || response.success === false) {
          results.push({
            studentId: student.student_id,
            name: student.name,
            status: 'billing_failed',
            error: billingError?.message || response?.error || 'apply_monthly_fee returned no result'
          });
          continue;
        }

        if (response.applied) {
          billedCount++;
          // Mirror row for the receipts ledger. Best-effort: it is a reporting
          // convenience, and apply_monthly_fee already holds the real record.
          if (student.id) {
            const { error: receiptErr } = await supabase.from('fee_receipts').upsert({
              receipt_no: `REC-BILL-${student.student_id}-${monthKey}`,
              student_id: student.id,
              amount,
              payment_mode: 'System Monthly Billing',
              payment_date: new Date().toISOString().split('T')[0],
              status: 'Billed',
              collected_by: adminUser,
              note: `Monthly tuition fee for ${currentMonthName} generated by ${adminUser}`
            }, { onConflict: 'receipt_no', ignoreDuplicates: true });
            if (receiptErr) console.warn('[admin-billing] fee_receipts upsert note:', receiptErr.message);
          }
        }

        results.push({ studentId: student.student_id, name: student.name, status: response.applied ? 'billed' : 'already_billed' });

        if (response.email_sent_at) continue;
        if (Number(response.email_attempts || 0) >= MAX_EMAIL_ATTEMPTS) continue;
        if (!hasEmail(student)) {
          results.push({ studentId: student.student_id, name: student.name, status: 'billed_no_email' });
          continue;
        }
        pendingStatements.push({
          student: { ...student, email: student.email.trim(), monthly_fee: amount },
          ledger: {
            ledger_id: response.ledger_id,
            billing_month: response.billing_month || monthKey,
            amount: response.amount ?? amount,
            previous_due: response.previous_due,
            updated_due: response.updated_due,
            idempotency_key: response.idempotency_key
          }
        });
      }

      if (!isEmailConfigured) {
        if (pendingStatements.length) {
          results.push({ status: 'email_skipped', message: 'Resend is not configured; statements were billed but not emailed', count: pendingStatements.length });
        }
      } else if (pendingStatements.length) {
        const outcome = await dispatchWithQuota({
          items: pendingStatements,
          category: EMAIL_CATEGORIES.BILLING,
          getEmail: item => item.student.email,
          reference: `BILL-${monthKey}`,
          send: item => sendStatement(supabase, from, item)
        });
        results.push(...outcome.results);
        deferred = outcome.deferred;
        quotaError = outcome.quotaError;
      }
    } else {
      const owing = activeStudents
        .filter(s => Number(s.pending_fee) > 0)
        .map(s => ({
          ...s,
          email: hasEmail(s) ? s.email.trim() : '',
          monthly_fee: Number(s.monthly_fee) > 0 ? Number(s.monthly_fee) : monthlyFeeFor(s.class_name, 0)
        }));

      for (const s of owing.filter(s => !s.email)) {
        results.push({ studentId: s.student_id, name: s.name, status: 'pending_no_email', pendingDue: Number(s.pending_fee) });
      }
      for (const s of activeStudents.filter(s => !(Number(s.pending_fee) > 0))) {
        results.push({ studentId: s.student_id, name: s.name, status: 'no_dues' });
      }

      const reachable = owing.filter(s => s.email);
      if (!isEmailConfigured) {
        if (reachable.length) {
          results.push({ status: 'email_skipped', message: 'Resend is not configured; reminders were not sent', count: reachable.length });
        }
      } else if (reachable.length) {
        const outcome = await dispatchWithQuota({
          items: reachable,
          category: EMAIL_CATEGORIES.REMINDER,
          getEmail: student => student.email,
          reference: `REMIND-${monthKey}`,
          // Same key the cron uses, so a manual chase and the scheduled one
          // cannot both reach a parent on the same day. Two clicks of the
          // dashboard button now cost nothing.
          getDedupeKey: student => `REMIND-${student.student_id}-${monthKey}`,
          send: async (student) => {
            const result = await sendEmailViaResend({
              from,
              to: [student.email],
              subject: `Fee Reminder: Outstanding Balance ₹${Number(student.pending_fee).toLocaleString('en-IN')} — ${student.name}`,
              html: reminderEmail(student, currentMonthName),
              headers: { 'X-Entity-Ref-ID': `REMIND-${student.student_id}-${monthKey}` }
            });
            return {
              result,
              error: result?.success ? null : extractResendErrorMessage(result?.error),
              report: { studentId: student.student_id, name: student.name, email: student.email, action: 'reminder' }
            };
          }
        });
        results.push(...outcome.results);
        deferred = outcome.deferred;
        quotaError = outcome.quotaError;
      }
    }

    const deferredList = deferred;
    const summary = results.reduce((acc, r) => {
      const key = r.status || 'unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    try {
      await supabase.from('audit_logs').insert([{
        log_id: `AUD-MANUAL-${monthKey}-${Date.now()}`,
        timestamp: new Date().toISOString(),
        actor: adminUser,
        actor_name: adminUser,
        action_type: action === 'reminder' ? 'MANUAL_FEE_REMINDER' : 'MANUAL_FEE_GENERATION',
        target: wholeInstitute ? 'All Batches' : String(targetClass),
        student_name: wholeInstitute ? 'All Batches' : String(targetClass),
        student_roll: studentId && studentId !== 'all' ? String(studentId) : 'N/A',
        description: `Manual ${action} run for ${wholeInstitute ? 'all batches' : targetClass} (${monthKey}) by ${adminUser}`,
        details: { summary, deferred: deferredList, quotaError: quotaError || null, results: results.slice(0, 200) }
      }]);
    } catch (auditError) {
      console.error('[admin-billing] audit log write failed:', auditError.message);
    }

    return res.status(200).json({
      success: true,
      action,
      targetClass,
      targetBatchIds: targetBatchIds || 'all',
      month: monthKey,
      totalStudents: activeStudents.length,
      billedCount,
      emailedCount: results.filter(r => r.status === 'sent').length,
      summary,
      // Non-empty means the 100/day cap was hit: these students were billed but
      // not emailed, and the cron's retry sweep will pick their statements up.
      partial: deferredList.length > 0,
      deferred: deferredList,
      quotaError: quotaError || null,
      results
    });
  } catch (error) {
    console.error('Admin billing trigger error:', error);
    return res.status(500).json({ success: false, error: 'Billing run failed' });
  }
}
