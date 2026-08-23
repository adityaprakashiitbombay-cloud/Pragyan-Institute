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
<<<<<<< HEAD
  feeEmail,
  reminderEmail,
  escapeHtml,
  formatMonthLabel
} from './_lib/email-templates.js';

const BATCH_MAP = {
  '12th_pcm': { key: '12th_pcm', label: 'Class 12th PCM (I.Sc)', defaultAmount: 1500 },
  '12th_pcb': { key: '12th_pcb', label: 'Class 12th PCB (I.Sc)', defaultAmount: 1500 },
  '11th_pcm': { key: '11th_pcm', label: 'Class 11th PCM (I.Sc Foundation)', defaultAmount: 1500 },
  '11th_pcb': { key: '11th_pcb', label: 'Class 11th PCB (I.Sc Foundation)', defaultAmount: 1500 },
  '10th': { key: '10th', label: 'Class 10th (ACHIEVER / Matric)', defaultAmount: 1000 },
  '9th':  { key: '9th',  label: 'Class 9th (NURTURE / Foundation)', defaultAmount: 1000 },
  '8th':  { key: '8th',  label: 'Class 8th (ALPHA / Middle)',    defaultAmount: 800 },
  '6th_7th': { key: '6th_7th', label: 'Class 6th & 7th (PIONEER)', defaultAmount: 700 },
  '1st_5th': { key: '1st_5th', label: 'Class 1st to 5th (Junior Foundation)', defaultAmount: 500 },
  'junior': { key: '1st_5th', label: 'Class 1st to 5th (Junior Foundation)', defaultAmount: 500 },
  'special_english': { key: 'special_english', label: 'Special English Batches by Aditi Singh', defaultAmount: 1000 },
  'eng_912': { key: 'eng_912', label: 'Special English (9th–12th)', defaultAmount: 1000 },
  'eng_68':  { key: 'eng_68',  label: 'Special English (6th–8th)',  defaultAmount: 700 },
  'eng_15':  { key: 'eng_15',  label: 'Special English (1st–5th)',  defaultAmount: 500 }
};

// Canonical batch-rate resolver for all 12 batches. Keep in sync with
// api/cron-monthly-fees.js getStudentDefaultMonthlyFee() and js/portal.js.
// Special English MUST be tested before raw digit matching ("Special English:
// Class 9th to 12th" contains both '9' and '12'; "Class 12th PCM" contains no
// 10/9/8 at all, so an else-chain would misprice it).
function classNumberMatches(str, n) {
  if (n === 1 && str.includes('1st')) return true;
  if (n === 2 && str.includes('2nd')) return true;
  if (n === 3 && str.includes('3rd')) return true;
  if (n >= 4 && str.includes(`${n}th`)) return true;
  return new RegExp(`(^|[^0-9])${n}([^0-9]|$)`).test(str);
}

function canonicalMonthlyFee(className) {
  const str = String(className || '').toLowerCase();
  if (str.includes('special english')) {
    if ([12, 11, 10, 9].some(n => classNumberMatches(str, n))) return 1000;
    if ([8, 7, 6].some(n => classNumberMatches(str, n))) return 700;
    return 500;
  }
  if (classNumberMatches(str, 12) || classNumberMatches(str, 11)) return 1500;
  if (classNumberMatches(str, 10) || classNumberMatches(str, 9)) return 1000;
  if (classNumberMatches(str, 8)) return 800;
  if (classNumberMatches(str, 6) || classNumberMatches(str, 7)) return 700;
  if (str.includes('junior') || str.includes('junio') || [5, 4, 3, 2, 1].some(n => classNumberMatches(str, n))) return 500;
  return 1000;
}

function batchKeyMatches(key, className) {
  const str = String(className || '').toLowerCase();
  const isEng = str.includes('special english');
  const has = n => classNumberMatches(str, n);
  switch (key) {
    case '12th':
    case '12th_pcm':
    case '12th_pcb':
      return !isEng && has(12);
    case '11th':
    case '11th_pcm':
    case '11th_pcb':
      return !isEng && has(11);
    case '10th_12th': return !isEng && (has(10) || has(12));
    case '9th_11th': return !isEng && (has(9) || has(11));
    case '10th': return !isEng && has(10);
    case '9th': return !isEng && has(9);
    case '8th': return !isEng && has(8);
    case '6th_7th':
    case '6th':
    case '7th':
      return !isEng && (has(6) || has(7));
    case '1st_5th':
    case 'junior':
    case 'junio':
      return !isEng && (str.includes('junior') || [1, 2, 3, 4, 5].some(has));
    case 'special_english':
    case 'english':
      return isEng;
    case 'eng_912': return isEng && (has(9) || has(10) || has(11) || has(12));
    case 'eng_68': return isEng && (has(6) || has(7) || has(8));
    case 'eng_15': return isEng && [1, 2, 3, 4, 5].some(has);
    case 'all': return true;
    default: return str.includes(String(key).toLowerCase());
  }
}

const DAILY_EMAIL_LIMIT = 100;

async function countEmailsSentToday(supabase) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date())
    .reduce((all, part) => ({ ...all, [part.type]: part.value }), {});
  const startIso = new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00+05:30`).toISOString();
  const endIso = new Date(new Date(startIso).getTime() + 24 * 60 * 60 * 1000).toISOString();
  let sent = 0;
  try {
    const { data: ledgerSent } = await supabase
      .from('fee_billing_ledger')
      .select('id')
      .gte('email_sent_at', startIso)
      .lt('email_sent_at', endIso);
    sent += ledgerSent?.length || 0;
    const { data: receiptsSent } = await supabase
      .from('fee_receipts')
      .select('receipt_no')
      .gte('created_at', startIso)
      .lt('created_at', endIso);
    sent += receiptsSent?.length || 0;
  } catch (e) {
    console.warn('[quota] count failed, assuming worst case:', e.message);
    return DAILY_EMAIL_LIMIT; // fail closed
  }
  return sent;
}

function indiaDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(date)
    .reduce((all, part) => ({ ...all, [part.type]: part.value }), {});
  return {
    year: Number(parts.year),
    month: parts.month,
    day: Number(parts.day),
    monthKey: `${parts.year}-${parts.month}`
  };
}
=======
  BATCHES,
  BATCH_BY_ID,
  resolveBatch,
  monthlyFeeFor,
  istMonthKey
} from './_lib/academic-config.js';
>>>>>>> claude/admiring-kepler-50a04f

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

<<<<<<< HEAD
  const { targetClass = 'all', action = 'invoice', studentId = 'all' } = req.body || {};
  const targetKey = String(targetClass || 'all').toLowerCase();
  const { monthKey } = indiaDateParts();
=======
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
>>>>>>> claude/admiring-kepler-50a04f
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
<<<<<<< HEAD
    // 1. Query live students from Supabase database
    let query = supabase.from('students').select('id,student_id,name,roll_no,class_name,monthly_fee,status,pending_fee,total_fee,email');
    if (studentId && studentId !== 'all') {
      query = query.or(`student_id.eq.${studentId},id.eq.${studentId}`);
=======
    let query = supabase
      .from('students')
      .select('id,student_id,name,roll_no,class_name,monthly_fee,status,pending_fee,total_fee,email');
    if (singleStudent) {
      query = query.eq('student_id', studentId);
>>>>>>> claude/admiring-kepler-50a04f
    }
    const { data: rawStudents, error: fetchErr } = await query;
    if (fetchErr) throw fetchErr;

<<<<<<< HEAD
    const activeStudents = (rawStudents || []).filter(s => {
      const isActive = !s.status || s.status.toLowerCase() === 'active';
      if (!isActive) return false;
      if (studentId && studentId !== 'all') return true;
      if (targetKey === 'all') return true;
      return batchKeyMatches(targetKey, s.class_name);
    });
    const results = [];
    let billedCount = 0;
    let emailedCount = 0;
    let remainingQuota = isEmailConfigured
      ? Math.max(0, DAILY_EMAIL_LIMIT - await countEmailsSentToday(supabase))
      : 0;

    for (const student of activeStudents) {
      if (action === 'invoice') {
        // Canonical per-batch rate: explicit monthly_fee wins; otherwise resolve
        // from the canonical 12-batch table (never the old else-chain defaults).
        const amount = Number(student.monthly_fee) > 0
          ? Number(student.monthly_fee)
          : canonicalMonthlyFee(student.class_name);
        const batchLabel = student.class_name || 'General';

        let handled = false;
        try {
          const { data: response, error: billingError } = await supabase.rpc('apply_monthly_fee', {
            p_student_id: student.student_id,
            p_billing_month: monthKey,
            p_amount: amount,
            p_batch_label: batchLabel
=======
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
>>>>>>> claude/admiring-kepler-50a04f
          });
          continue;
        }

<<<<<<< HEAD
        if (!handled) {
          // Fallback direct billing logic
          const { data: existingLedger } = await supabase
            .from('fee_billing_ledger')
            .select('id, billing_month')
            .eq('student_id', student.student_id)
            .in('billing_month', [monthKey, currentMonthName])
            .maybeSingle();

          if (!existingLedger) {
            const { data: freshStudent } = await supabase
              .from('students')
              .select('id,student_id,name,roll_no,class_name,pending_fee,total_fee')
              .eq('student_id', student.student_id)
              .single();

            const studentUuid = freshStudent?.id || student.id;
            const currentPending = Number(freshStudent?.pending_fee ?? 0);
            const currentTotal = Number(freshStudent?.total_fee ?? 0);
            const newPending = currentPending + amount;
            const newTotal = currentTotal + amount;

            if (studentUuid) {
              await supabase
                .from('students')
                .update({ pending_fee: newPending, total_fee: newTotal, updated_at: new Date().toISOString() })
                .eq('id', studentUuid);
            }

            const idempotencyKey = `fee_${student.student_id}_${monthKey}`;
            await supabase
              .from('fee_billing_ledger')
              .upsert({
                student_id: student.student_id,
                billing_month: monthKey,
                amount,
                previous_due: currentPending,
                updated_due: newPending,
                batch_label: batchLabel,
                idempotency_key: idempotencyKey
              }, { onConflict: 'idempotency_key' });

            const receiptId = `REC-BILL-${student.student_id}-${monthKey}`;
            if (studentUuid) {
              try {
                await supabase
                  .from('fee_receipts')
                  .upsert({
                    receipt_no: receiptId,
                    student_id: studentUuid,
                    amount,
                    payment_mode: 'System Monthly Billing',
                    payment_date: new Date().toISOString().split('T')[0],
                    status: 'Billed',
                    collected_by: adminUser || 'Main Admin Trigger',
                    note: `Monthly tuition fee for ${currentMonthName} generated by ${adminUser}`
                  }, { onConflict: 'receipt_no', ignoreDuplicates: true });
              } catch (receiptErr) {
                console.warn('[admin-billing] fee_receipts upsert note:', receiptErr.message);
              }
            }

            billedCount++;
          }
        }

        // Send email via Resend (quota-guarded)
        if (student.email && student.email.includes('@')) {
          if (!isEmailConfigured || remainingQuota <= 0) {
            results.push({ studentId: student.student_id, name: student.name, status: 'billed_email_deferred', reason: isEmailConfigured ? 'daily email quota exhausted' : 'email service not configured' });
            continue;
          }
          try {
            const { data: ledger } = await supabase
              .from('fee_billing_ledger')
              .select('*')
              .eq('student_id', student.student_id)
              .eq('billing_month', monthKey)
              .maybeSingle();

            const emailRes = await sendEmailViaResend({
              from,
              to: student.email.trim(),
              subject: `Monthly Fee Statement — ${student.name} (${currentMonthName})`,
              html: feeEmail(student, ledger || { billing_month: monthKey, amount, previous_due: 0, updated_due: amount })
            });

            if (emailRes.success) {
              emailedCount++;
              remainingQuota--;
              results.push({ studentId: student.student_id, name: student.name, email: student.email, status: 'emailed', emailId: emailRes.data?.id });
            } else {
              results.push({ studentId: student.student_id, name: student.name, email: student.email, status: 'email_error', error: extractResendErrorMessage(emailRes.error) });
            }
            await new Promise(resolve => setTimeout(resolve, 100)); // Throttle
          } catch (eErr) {
            results.push({ studentId: student.student_id, name: student.name, email: student.email, status: 'email_error', error: extractResendErrorMessage(eErr) });
          }
        } else {
          results.push({ studentId: student.student_id, name: student.name, status: student.email ? 'billed' : 'billed_no_email' });
        }
      } else if (action === 'reminder') {
        const pendingDue = Number(student.pending_fee || 0);
        if (pendingDue > 0) {
          if (student.email && student.email.includes('@')) {
            if (!isEmailConfigured || remainingQuota <= 0) {
              results.push({ studentId: student.student_id, name: student.name, status: 'reminder_deferred', reason: isEmailConfigured ? 'daily email quota exhausted' : 'email service not configured', pendingDue });
              continue;
            }
            try {
              const emailRes = await sendEmailViaResend({
                from,
                to: student.email.trim(),
                subject: `⚠️ Fee Reminder: Outstanding Balance ₹${pendingDue.toLocaleString('en-IN')} — ${student.name}`,
                html: reminderEmail(student, currentMonthName)
              });

              if (emailRes.success) {
                emailedCount++;
                remainingQuota--;
                results.push({ studentId: student.student_id, name: student.name, email: student.email, status: 'reminder_sent', emailId: emailRes.data?.id });
              } else {
                results.push({ studentId: student.student_id, name: student.name, email: student.email, status: 'reminder_error', error: extractResendErrorMessage(emailRes.error) });
              }
              await new Promise(resolve => setTimeout(resolve, 100)); // Throttle
            } catch (eErr) {
              results.push({ studentId: student.student_id, name: student.name, email: student.email, status: 'reminder_error', error: extractResendErrorMessage(eErr) });
            }
          } else {
            results.push({ studentId: student.student_id, name: student.name, status: 'pending_no_email', pendingDue });
=======
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
>>>>>>> claude/admiring-kepler-50a04f
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
      await supabase.from('audit_logs').insert({
        log_id: `AUD-MANUAL-${monthKey}-${Date.now()}`,
        timestamp: new Date().toISOString(),
        actor: adminUser,
        action_type: action === 'reminder' ? 'MANUAL_FEE_REMINDER' : 'MANUAL_FEE_GENERATION',
        student_name: wholeInstitute ? 'All Batches' : String(targetClass),
        student_roll: studentId && studentId !== 'all' ? String(studentId) : 'N/A',
        description: `Manual ${action} run for ${wholeInstitute ? 'all batches' : targetClass} (${monthKey}) by ${adminUser}`,
        details: { summary, deferred: deferredList, quotaError: quotaError || null, results: results.slice(0, 200) }
      });
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
