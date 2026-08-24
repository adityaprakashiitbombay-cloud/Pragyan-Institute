// ============================================================================
// /api/cron-monthly-fees — the 10-day rolling billing engine
// ----------------------------------------------------------------------------
// Vercel cron hits this once a day. The calendar in api/_lib/academic-config.js
// decides what "today" means: days 1-6 accrue the monthly tuition fee for that
// day's batches and email the statement, days 7-10 chase whoever still has a
// balance, and days 11-31 are a deliberate rest state where the handler does
// nothing but report that fact.
//
// Four defects this file used to carry, all fixed here:
//
//   1. `supabase.raw('email_attempts + 1')` — supabase-js has no .raw(). Every
//      call threw a TypeError inside retryUnsentEmails(), which runs after
//      billing on EVERY invocation, so the handler returned 500 and skipped its
//      audit-log write even on days when the money side had fully succeeded.
//      Replaced with the claim_ledger_email RPC, which does the increment
//      atomically and reports whether this process won the claim.
//
//   2. Fees were guessed from substrings of class_name, and 'Class 12th PCM'
//      matched none of the branches: a senior with no explicit monthly_fee was
//      billed 1000 instead of 1500, and Special English 1st-5th was billed 1000
//      instead of 500. Amounts now resolve through the canonical batch table.
//
//   3. The schedule had drifted to "all batches on days 1-4, reminders on days
//      15-19", which bills every batch four times over (idempotently, but it
//      also means a day-1 outage silently rebills nothing) and puts reminders
//      outside the specified window. Now derived from BILLING_CALENDAR.
//
//   4. No quota accounting whatsoever. This is the highest-volume sender in the
//      system and it posted straight to Resend, so a billing day landing on top
//      of a busy receipt day would blow the 100/day cap and the last families
//      in the loop would silently never receive a statement. Every send now
//      reserves a slot first, and anything that does not fit is reported as
//      `deferred` rather than lost.
// ============================================================================

import { getSupabase, requireCronOrAdmin } from './_lib/auth.js';
import {
  sendEmailViaResend,
  extractResendErrorMessage,
  isValidResendApiKey,
  isVerifiedSenderDomain,
  DEFAULT_FROM,
  EMAIL_PATTERN
} from './_lib/resend-sender.js';
import { feeEmail, reminderEmail, formatMonthLabel } from './_lib/email-templates.js';
import {
  dispatchWithQuota,
  statusForSendResult,
  EMAIL_CATEGORIES
} from './_lib/email-quota.js';
import {
  scheduleForDay,
  isStudentInScope,
  monthlyFeeFor,
  istMonthKey,
  istDayOfMonth
} from './_lib/academic-config.js';

const MAX_EMAIL_ATTEMPTS = 3;

const monthLabel = formatMonthLabel;

const isActive = student => !student.status || String(student.status).toLowerCase() === 'active';
const hasEmail = student => typeof student.email === 'string' && EMAIL_PATTERN.test(student.email.trim());

/**
 * Send one statement for an already-written ledger row.
 *
 * Ordering matters: the quota slot is reserved by dispatchWithQuota BEFORE this
 * runs, and the ledger claim is taken here. Doing it the other way round would
 * burn one of the three email attempts every time the day's quota was exhausted,
 * so a busy day would permanently retire the retry budget for those rows.
 */
async function sendLedgerStatement(supabase, from, { ledger, student }) {
  const { data: claim, error: claimError } = await supabase.rpc('claim_ledger_email', {
    p_ledger_id: ledger.ledger_id,
    p_max_attempts: MAX_EMAIL_ATTEMPTS
  });

  if (claimError) {
    console.error('[cron] claim_ledger_email failed:', claimError.message);
    return null;
  }
  if (!claim?.claimed) {
    // Another invocation owns this row, it is already sent, or the attempt
    // budget is spent. Either way this process must not send.
    return null;
  }

  const result = await sendEmailViaResend({
    from,
    to: [student.email],
    subject: `Monthly Fee Statement — ${student.name} (${monthLabel(ledger.billing_month)})`,
    html: feeEmail(student, ledger),
    // Resend's own idempotency key. The ledger's idempotency_key stops a retried
    // cron from billing twice; this stops it emailing twice when the retry lands
    // before the first response was recorded.
    headers: { 'X-Entity-Ref-ID': `${ledger.idempotency_key || `ledger-${ledger.ledger_id}`}` }
  });

  const status = statusForSendResult(result);
  // 'unknown' counts as sent for the ledger: the message may well have been
  // delivered, and re-sending a fee statement to a parent is worse than not
  // recording a message id.
  await supabase.rpc('settle_ledger_email', {
    p_ledger_id: ledger.ledger_id,
    p_success: status === 'sent' || status === 'unknown',
    p_message_id: result?.data?.id || null,
    p_error: status === 'sent' ? null : extractResendErrorMessage(result?.error).slice(0, 500)
  });

  return {
    result,
    error: status === 'sent' ? null : extractResendErrorMessage(result?.error),
    report: { studentId: student.student_id, action: 'statement' }
  };
}

/** Statements for ledger rows this run just created or found already pending. */
async function dispatchStatements(supabase, from, pending, monthKey) {
  if (!pending.length) return { results: [], deferred: [], quotaError: null };
  return dispatchWithQuota({
    items: pending,
    category: EMAIL_CATEGORIES.BILLING,
    getEmail: item => item.student.email,
    reference: `BILL-${monthKey}`,
    send: (item) => sendLedgerStatement(supabase, from, item)
  });
}

/** Mid-month chase for students still carrying a balance. */
async function dispatchReminders(supabase, from, students, monthKey, isFinal) {
  if (!students.length) return { results: [], deferred: [], quotaError: null };
  const monthName = monthLabel(monthKey);
  return dispatchWithQuota({
    items: students,
    category: EMAIL_CATEGORIES.REMINDER,
    getEmail: student => student.email,
    reference: `REMIND-${monthKey}`,
    // Reminders have no ledger row to claim, so this is their only duplicate
    // guard: keyed per student per IST day, it survives a cron retry and an
    // admin pressing the button on the same day, while still allowing the day-7
    // chase and the day-10 final notice to both go out.
    getDedupeKey: student => `REMIND-${student.student_id}-${monthKey}`,
    send: async (student) => {
      const result = await sendEmailViaResend({
        from,
        to: [student.email],
        subject: `${isFinal ? 'Final Reminder' : 'Fee Reminder'} (${monthName}) — ${student.name} (Roll #${student.roll_no})`,
        html: reminderEmail(student, monthName),
        headers: { 'X-Entity-Ref-ID': `REMIND-${student.student_id}-${monthKey}` }
      });
      return {
        result,
        error: result?.success ? null : extractResendErrorMessage(result?.error),
        report: { studentId: student.student_id, action: 'reminder' }
      };
    }
  });
}

/**
 * Sweep ledger rows whose statement never went out — a quota-exhausted day, a
 * provider outage, a run that timed out mid-batch. Bounded and ordered oldest
 * first so the same rows cannot starve behind newer ones.
 */
async function retryUnsentStatements(supabase, from) {
  const { data: rows, error } = await supabase
    .from('fee_billing_ledger')
    .select('id,student_id,billing_month,amount,previous_due,updated_due,idempotency_key,email_attempts')
    .is('email_sent_at', null)
    .lt('email_attempts', MAX_EMAIL_ATTEMPTS)
    .order('created_at', { ascending: true })
    .limit(60);
  if (error) throw error;
  if (!rows?.length) return { results: [], deferred: [], quotaError: null };

  const studentIds = [...new Set(rows.map(row => row.student_id))];
  const { data: students, error: studentsError } = await supabase
    .from('students')
    .select('student_id,name,roll_no,class_name,monthly_fee,pending_fee,email')
    .in('student_id', studentIds);
  if (studentsError) throw studentsError;

  const byStudentId = new Map((students || []).map(s => [s.student_id, s]));
  const items = [];
  for (const row of rows) {
    const student = byStudentId.get(row.student_id);
    if (!student || !hasEmail(student)) continue;
    items.push({
      student: { ...student, email: student.email.trim() },
      ledger: {
        ledger_id: row.id,
        billing_month: row.billing_month,
        amount: row.amount,
        previous_due: row.previous_due,
        updated_due: row.updated_due,
        idempotency_key: row.idempotency_key
      }
    });
  }
  if (!items.length) return { results: [], deferred: [], quotaError: null };

  return dispatchWithQuota({
    items,
    category: EMAIL_CATEGORIES.BILLING,
    getEmail: item => item.student.email,
    reference: 'BILL-RETRY',
    send: (item) => sendLedgerStatement(supabase, from, item)
  });
}

export default async function handler(req, res) {
  // Accepts the cron bearer secret (constant-time compared) or a signed admin
  // session, so the same engine backs both the schedule and a manual re-run.
  const session = requireCronOrAdmin(req, res);
  if (!session) return;

  const supabase = getSupabase();
  if (!supabase) return res.status(503).json({ error: 'Billing service is not configured' });

  const rawFrom = process.env.RESEND_FROM_EMAIL || DEFAULT_FROM;
  const from = isVerifiedSenderDomain(rawFrom) ? rawFrom : DEFAULT_FROM;
  const emailConfigured = Boolean(isValidResendApiKey(process.env.RESEND_API_KEY) && isVerifiedSenderDomain(from));

  const day = istDayOfMonth();
  const monthKey = istMonthKey();

  // A caller may replay a specific calendar day for testing. Safe to expose:
  // this endpoint already requires the cron secret or an admin session, and the
  // ledger's idempotency key means replaying a day cannot bill anyone twice.
  const requestedDay = Number((req.body || {}).forceDay);
  const effectiveDay = Number.isInteger(requestedDay) && requestedDay >= 1 && requestedDay <= 31
    ? requestedDay
    : day;
  if (effectiveDay !== day) {
    console.log(`[cron] forceDay override: running day ${effectiveDay} instead of ${day}`);
  }

  const schedule = scheduleForDay(effectiveDay);

  const results = [];
  const deferred = [];
  let quotaError = null;

  try {
    if (schedule) {
      const { data: allStudents, error } = await supabase
        .from('students')
        .select('student_id,name,roll_no,class_name,monthly_fee,status,pending_fee,email');
      if (error) throw error;

      // Scope by resolved batch, not by an ilike on class_name. The old
      // `ilike('%10%')` matched 'Class 10th' but equally 'Class 1st to 5th (10
      // students)' and any free text containing 10, and its junior branch
      // matched every class name containing a 6 or a 7.
      const inScope = (allStudents || [])
        .filter(isActive)
        .filter(s => isStudentInScope(s.class_name, schedule.batchIds));

      if (schedule.type === 'billing') {
        const pendingStatements = [];

        for (const student of inScope) {
          // An explicit per-student monthly_fee wins (scholarships, siblings
          // concessions); otherwise the canonical batch rate.
          const explicit = Number(student.monthly_fee);
          const amount = explicit > 0 ? explicit : monthlyFeeFor(student.class_name, null);
          if (!(amount > 0)) {
            results.push({ studentId: student.student_id, status: 'billing_skipped', error: `Cannot resolve a fee for class "${student.class_name || ''}"` });
            continue;
          }

          const { data: response, error: billingError } = await supabase.rpc('apply_monthly_fee', {
            p_student_id: student.student_id,
            p_billing_month: monthKey,
            p_amount: amount,
            p_batch_label: schedule.label
          });

          // No non-atomic fallback. The previous version fell back to a
          // read-then-write ledger upsert whenever the RPC errored, which is
          // exactly the race apply_monthly_fee's FOR UPDATE lock exists to
          // prevent — two retries could both read the same pending_fee and
          // double-bill. A failure is now recorded and left for the next run.
          if (billingError || !response || response.success === false) {
            results.push({
              studentId: student.student_id,
              status: 'billing_failed',
              error: billingError?.message || response?.error || 'apply_monthly_fee returned no result'
            });
            continue;
          }

          results.push({ studentId: student.student_id, status: response.applied ? 'billed' : 'already_billed' });

          // Queue the statement when the row has no email recorded yet. That
          // covers both a fresh charge and an idempotent re-run whose earlier
          // email never made it out.
          if (response.email_sent_at) continue;
          if (Number(response.email_attempts || 0) >= MAX_EMAIL_ATTEMPTS) continue;
          if (!hasEmail(student)) {
            results.push({ studentId: student.student_id, status: 'billed_no_email' });
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

        if (emailConfigured) {
          const outcome = await dispatchStatements(supabase, from, pendingStatements, monthKey);
          results.push(...outcome.results);
          deferred.push(...outcome.deferred);
          quotaError = quotaError || outcome.quotaError;
        } else if (pendingStatements.length) {
          results.push({ status: 'email_skipped', message: 'Resend is not configured; statements were billed but not emailed', count: pendingStatements.length });
        }
      } else if (schedule.type === 'reminder') {
        const owing = inScope
          .filter(s => Number(s.pending_fee) > 0 && hasEmail(s))
          .map(s => ({
            ...s,
            email: s.email.trim(),
            // reminderEmail() falls back to 1000 for a missing rate, which is
            // wrong for every batch except 9th/10th. Resolve it up front.
            monthly_fee: Number(s.monthly_fee) > 0 ? Number(s.monthly_fee) : monthlyFeeFor(s.class_name, 0)
          }));

        if (!emailConfigured) {
          results.push({ status: 'email_skipped', message: 'Resend is not configured; reminders were not sent', count: owing.length });
        } else {
          const outcome = await dispatchReminders(supabase, from, owing, monthKey, Boolean(schedule.final));
          results.push(...outcome.results);
          deferred.push(...outcome.deferred);
          quotaError = quotaError || outcome.quotaError;
        }
      }
    }

    // Runs on every day of the month, including the rest state — an unsent
    // statement from a quota-exhausted day should not wait for the next cycle.
    if (emailConfigured) {
      const retry = await retryUnsentStatements(supabase, from);
      results.push(...retry.results);
      deferred.push(...retry.deferred);
      quotaError = quotaError || retry.quotaError;
    }

    const summary = results.reduce((acc, r) => {
      const key = r.status || 'unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    // Audit-log write is best-effort: it must never turn a successful billing
    // run into a 500, because the caller would retry a run that already charged.
    try {
      const actorName = session.isCron ? 'System Cron' : (session.name || 'Admin');
      await supabase.from('audit_logs').insert([{
        log_id: `AUD-CRON-${monthKey}-${effectiveDay}-${Date.now()}`,
        timestamp: new Date().toISOString(),
        actor: actorName,
        actor_name: actorName,
        action_type: schedule?.type === 'reminder' ? 'MONTHLY_FEE_REMINDER' : 'MONTHLY_FEE_GENERATION',
        target: schedule?.label || 'Cron Queue',
        student_name: schedule?.label || 'Cron Queue',
        student_roll: 'N/A',
        description: schedule
          ? `Day ${effectiveDay} ${schedule.type === 'reminder' ? 'reminder sweep' : 'billing run'} for ${schedule.label} (${monthKey})`
          : `Day ${effectiveDay} rest state — retry sweep only (${monthKey})`,
        details: { summary, deferred, quotaError, results: results.slice(0, 200) }
      }]);
    } catch (auditError) {
      console.error('[cron] audit log write failed:', auditError.message);
    }

    return res.status(200).json({
      success: true,
      day: effectiveDay,
      month: monthKey,
      restState: !schedule,
      batch: schedule?.label || null,
      type: schedule?.type || null,
      summary,
      // Non-empty `deferred` means the 100/day cap was reached: these addresses
      // were billed but not emailed, and the retry sweep will pick them up.
      partial: deferred.length > 0,
      deferred,
      quotaError,
      results
    });
  } catch (error) {
    console.error('Monthly billing error:', error.message);
    return res.status(500).json({ success: false, error: 'Monthly billing execution failed' });
  }
}
