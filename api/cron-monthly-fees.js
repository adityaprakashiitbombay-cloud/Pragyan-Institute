import { getSupabase } from './_lib/auth.js';
import {
  sendEmailViaResend,
  extractResendErrorMessage,
  isValidResendApiKey,
  isVerifiedSenderDomain,
  DEFAULT_FROM
} from './_lib/resend-sender.js';
import {
  feeEmail,
  reminderEmail,
  escapeHtml,
  formatMonthLabel
} from './_lib/email-templates.js';

const BATCH_SCHEDULE = {
  // Days 1-6: 1st to 10th Rolling Monthly Billing (Staggered to preserve 100 emails/day quota)
  1: { key: '10th_12th', label: 'Class 10th & Class 12th PCM/PCB (Day 1 Accrual & Billing)', type: 'billing' },
  2: { key: '9th_11th', label: 'Class 9th & Class 11th PCM/PCB (Day 2 Accrual & Billing)', type: 'billing' },
  3: { key: '8th', label: 'Class 8th ALPHA (Day 3 Accrual & Billing)', type: 'billing' },
  4: { key: '6th_7th', label: 'Class 6th & 7th PIONEER (Day 4 Accrual & Billing)', type: 'billing' },
  5: { key: '1st_5th', label: 'Class 1st to 5th Junior Foundation (Day 5 Accrual & Billing)', type: 'billing' },
  6: { key: 'special_english', label: 'Special English Batches by Aditi Singh (Day 6 Accrual & Billing)', type: 'billing' },

  // Days 7-10: Gentle Mid-Window Reminders (Only for students with pending_fee > 0)
  7: { key: '10th_12th', label: 'Class 10th & 12th (Unpaid Dues Reminder)', type: 'reminder' },
  8: { key: '9th_11th', label: 'Class 9th & 11th (Unpaid Dues Reminder)', type: 'reminder' },
  9: { key: '6th_8th', label: 'Class 6th to 8th (Unpaid Dues Reminder)', type: 'reminder' },
  10: { key: 'all', label: 'All Batches (Final Grace Period Dues Reminder)', type: 'reminder' },

  // Days 15-20: Mid-Month Follow-Up
  15: { key: 'all', label: 'All Batches Mid-Month Pending Ledger Sync', type: 'reminder' }
};

// Canonical batch-rate resolver — keep in sync with js/portal.js resolveMonthlyFee()
// and pay.html resolveDefaultMonthly(). Special English MUST be checked before raw
// digit matching: "Special English: Class 9th to 12th" contains both '9' and '12'.
function classNumberMatches(str, n) {
  const ord = `${n}th`;
  if (n === 1 && str.includes('1st')) return true;
  if (n === 2 && str.includes('2nd')) return true;
  if (n === 3 && str.includes('3rd')) return true;
  if (n >= 4 && n <= 20 && str.includes(ord)) return true;
  return new RegExp(`(^|[^0-9])${n}([^0-9]|$)`).test(str);
}

function getStudentDefaultMonthlyFee(className) {
  const str = String(className || '').toLowerCase();
  if (str.includes('special english')) {
    if ([12, 11, 10, 9].some(n => classNumberMatches(str, n))) return 1000;
    if ([8, 7, 6].some(n => classNumberMatches(str, n))) return 700;
    return 500;
  }
  if (classNumberMatches(str, 12) || classNumberMatches(str, 11)) return 1500;
  if (classNumberMatches(str, 10)) return 1000;
  if (classNumberMatches(str, 9)) return 1000;
  if (classNumberMatches(str, 8)) return 800;
  if (classNumberMatches(str, 6) || classNumberMatches(str, 7)) return 700;
  if (str.includes('junior') || str.includes('junio') || [5, 4, 3, 2, 1].some(n => classNumberMatches(str, n))) return 500;
  return 1000;
}

// Precise batch-key matcher for the staggered schedule. Replaces the old
// ilike-%N% PostgREST chains where '%1%' also matched Class 10th/11th/12th and
// Special English batches, pulling foreign batches into the wrong billing day.
function batchKeyMatches(key, className) {
  const str = String(className || '').toLowerCase();
  const isEng = str.includes('special english');
  const has = n => classNumberMatches(str, n);
  switch (key) {
    case '10th_12th': return !isEng && (has(10) || has(12));
    case '9th_11th': return !isEng && (has(9) || has(11));
    case '8th': return !isEng && has(8);
    case '6th_7th': return !isEng && (has(6) || has(7));
    case '1st_5th': return !isEng && (str.includes('junior') || [1, 2, 3, 4, 5].some(has));
    case 'special_english': return isEng;
    case '6th_8th': return has(6) || has(7) || has(8);
    case 'all': return true;
    default: return str.includes(String(key).toLowerCase());
  }
}

function indiaDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(date)
    .reduce((all, part) => ({ ...all, [part.type]: part.value }), {});
  return { day: Number(parts.day), monthKey: `${parts.year}-${parts.month}`, year: parts.year, month: parts.month };
}

// IST-aligned UTC ISO bounds for "today" in Asia/Kolkata. The Resend 100/day
// limit resets on IST midnight for this institute's schedule, so all quota
// counting MUST use these bounds (UTC-date counting leaks across the 05:30 offset).
function istDayBoundsIso(date = new Date()) {
  const p = indiaDateParts(date);
  const start = new Date(`${p.year}-${p.month}-${String(p.day).padStart(2, '0')}T00:00:00+05:30`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

const DAILY_EMAIL_LIMIT = 100;

async function countEmailsSentToday(supabase) {
  const { startIso, endIso } = istDayBoundsIso();
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
    // Conservative by design: every receipt created today reserves a slot,
    // because receipts may be emailed on demand later today.
    sent += receiptsSent?.length || 0;
  } catch (e) {
    console.warn('[quota] count failed, assuming worst case:', e.message);
    return DAILY_EMAIL_LIMIT; // fail closed: no sends if we cannot count
  }
  return sent;
}

const monthLabel = formatMonthLabel;

function extractErrorMessage(err) {
  if (!err) return 'Email delivery failed';
  if (typeof err === 'string') return err;
  if (err.message && typeof err.message === 'string') return err.message;
  if (err.error?.message && typeof err.error.message === 'string') return err.error.message;
  if (err.error && typeof err.error === 'string') return err.error;
  try {
    const str = JSON.stringify(err);
    return str !== '{}' ? str : 'Email delivery failed';
  } catch (e) {
    return 'Email delivery failed';
  }
}

async function sendLedgerEmail(supabase, from, ledger, student) {
  // STEP 1: Acquire exclusive lock by updating email_attempts atomically
  const lockResult = await supabase
    .from('fee_billing_ledger')
    .update({
      email_attempts: supabase.raw('email_attempts + 1'),
      last_email_attempt_at: new Date().toISOString()
    })
    .eq('id', ledger.id)
    .is('email_sent_at', null) // Only lock if not already sent
    .select('id, email_attempts')
    .maybeSingle();

  if (lockResult.error || !lockResult.data) {
    // Another process already locked this record or email was sent
    return { studentId: ledger.student_id, status: 'already_processing_or_sent' };
  }

  const attempt = Number(ledger.email_attempts || 0) + 1;
  const attemptedAt = new Date().toISOString();

  if (!student?.email) {
    await supabase.from('fee_billing_ledger')
      .update({ email_error: 'No registered email address' })
      .eq('id', ledger.id);
    return { studentId: ledger.student_id, status: 'billed_no_email' };
  }

  try {
    // STEP 2: Generate idempotency key from ledger ID + billing month
    const idempotencyKey = `ledger_${ledger.id}_${ledger.billing_month}`;

    const result = await sendEmailViaResend({
      from,
      to: student.email,
      subject: `Monthly Fee Statement — ${student.name} (${monthLabel(ledger.billing_month)})`,
      html: feeEmail(student, ledger),
      headers: {
        'X-Entity-Ref-ID': idempotencyKey // Resend custom header for tracking
      }
    });

    if (!result.success) {
      const finalError = extractResendErrorMessage(result.error).slice(0, 500);
      await supabase.from('fee_billing_ledger')
        .update({ email_error: finalError })
        .eq('id', ledger.id);
      return { studentId: ledger.student_id, status: 'email_failed', error: finalError };
    }

    // STEP 3: Mark as sent with Resend message ID for audit trail
    await supabase.from('fee_billing_ledger')
      .update({
        email_sent_at: attemptedAt,
        email_error: null,
        resend_message_id: result.data?.id || null
      })
      .eq('id', ledger.id);

    return { studentId: ledger.student_id, status: 'emailed', emailId: result.data?.id || null };
  } catch (error) {
    const finalError = extractResendErrorMessage(error).slice(0, 500);
    await supabase.from('fee_billing_ledger')
      .update({ email_error: finalError })
      .eq('id', ledger.id);
    return { studentId: ledger.student_id, status: 'email_failed', error: finalError };
  }
}

// Reminder idempotency: claims a send slot in fee_email_log (migration 005).
// Returns true=claimed (caller must send), false=already sent this cycle,
// null=no dedup available (table missing / unknown error) — caller proceeds.
async function claimReminderSend(supabase, refKey) {
  const { data, error } = await supabase
    .from('fee_email_log')
    .insert({ ref_key: refKey, email_kind: 'reminder' })
    .select('id');
  if (!error && Array.isArray(data) && data.length) return true;
  const msg = String(error?.message || '');
  if (error?.code === '23505' || /duplicate|unique/i.test(msg)) return false;
  console.warn('[reminder-dedup] claim unavailable, proceeding without dedup:', msg);
  return null;
}

async function retryUnsentEmails(supabase, from) {
  const MAX_RETRY_ATTEMPTS = 3;
  const BASE_DELAY_MS = 2000; // Start with 2 seconds

  const remainingQuota = Math.max(0, DAILY_EMAIL_LIMIT - await countEmailsSentToday(supabase));
  if (remainingQuota <= 0) {
    console.log('[Retry] Daily email quota exhausted; deferring unsent statements to next run.');
    return [];
  }

  const { data: pending, error } = await supabase
    .from('fee_billing_ledger')
    .select('id,student_id,billing_month,amount,previous_due,updated_due,email_attempts')
    .is('email_sent_at', null)
    .lt('email_attempts', MAX_RETRY_ATTEMPTS) // Only retry if under max attempts
    .order('created_at', { ascending: true })
    .limit(Math.min(100, remainingQuota));
  if (error) throw error;
  if (!pending?.length) return [];

  const studentIds = [...new Set(pending.map(row => row.student_id))];
  const { data: students, error: studentsError } = await supabase.from('students').select('student_id,name,roll_no,class_name,email').in('student_id', studentIds);
  if (studentsError) throw studentsError;
  const byStudentId = new Map((students || []).map(student => [student.student_id, student]));
  const results = [];

  for (const ledger of pending) {
    // Re-verify that email hasn't been sent in parallel by another process
    const { data: currentRecord } = await supabase
      .from('fee_billing_ledger')
      .select('email_sent_at,email_attempts')
      .eq('id', ledger.id)
      .maybeSingle();

    if (currentRecord?.email_sent_at) {
      console.log(`[Retry] Skipped ledger ${ledger.id} (already sent by another process)`);
      continue;
    }

    const attemptNumber = Number(currentRecord?.email_attempts ?? ledger.email_attempts ?? 0);
    if (attemptNumber >= MAX_RETRY_ATTEMPTS) {
      continue;
    }

    // Exponential backoff: 2s, 4s, 8s, 16s, 32s...
    const delayMs = BASE_DELAY_MS * Math.pow(2, attemptNumber);
    const jitter = Math.random() * 1000; // Add 0-1s random jitter
    const totalDelay = Math.min(delayMs + jitter, 60000); // Cap at 60 seconds

    console.log(`[Retry ${attemptNumber + 1}/${MAX_RETRY_ATTEMPTS}] Waiting ${Math.round(totalDelay)}ms before retry for student ${ledger.student_id}...`);
    await new Promise(resolve => setTimeout(resolve, totalDelay));

    results.push(await sendLedgerEmail(supabase, from, ledger, byStudentId.get(ledger.student_id)));
  }
  return results;
}

export default async function handler(req, res) {
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  const expectedBearer = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || (authHeader !== expectedBearer && authHeader !== process.env.CRON_SECRET)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabase = getSupabase();
  const resendKey = process.env.RESEND_API_KEY;
  const rawFrom = process.env.RESEND_FROM_EMAIL || DEFAULT_FROM;
  const from = isVerifiedSenderDomain(rawFrom) ? rawFrom : DEFAULT_FROM;
  if (!supabase) return res.status(503).json({ error: 'Billing service is not configured' });
  const emailConfigured = Boolean(isValidResendApiKey(resendKey) && isVerifiedSenderDomain(from));

  const { day, monthKey } = indiaDateParts();
  const target = BATCH_SCHEDULE[day];
  const results = [];
  const currentMonthName = monthLabel(monthKey);

  try {
    if (target) {
      // Fetch all active students once and filter precisely in JS — the old
      // ilike-%N% chains matched foreign batches (e.g. '%1%' hit Class 10/11/12).
      const { data: students, error } = await supabase
        .from('students')
        .select('student_id,name,roll_no,class_name,monthly_fee,status,pending_fee,email');
      if (error) throw error;
      const activeStudents = (students || []).filter(s =>
        (!s.status || s.status === 'Active' || s.status === 'active') &&
        batchKeyMatches(target.key, s.class_name)
      );

      if (target.type === 'billing') {
        // --- DAYS 1 to 4: MONTHLY FEE ADDITION & STATEMENT GENERATION ---
        for (const student of activeStudents) {
          const amount = Number(student.monthly_fee) > 0 ? Number(student.monthly_fee) : getStudentDefaultMonthlyFee(student.class_name);
          let handled = false;

          try {
            const { data: response, error: billingError } = await supabase.rpc('apply_monthly_fee', {
              p_student_id: student.student_id,
              p_billing_month: monthKey,
              p_amount: amount,
              p_batch_label: target.label
            });
            if (!billingError && response !== null && response !== undefined) {
              handled = true;
              let isApplied = true;
              let resObj = response;

              if (typeof resObj === 'string') {
                try {
                  resObj = JSON.parse(resObj);
                } catch {
                  resObj = { applied: true };
                }
              }

              if (Array.isArray(resObj)) {
                resObj = resObj[0] || {};
              }

              if (resObj && typeof resObj === 'object') {
                if ('applied' in resObj) {
                  isApplied = Boolean(resObj.applied);
                } else if ('is_applied' in resObj) {
                  isApplied = Boolean(resObj.is_applied);
                } else if ('success' in resObj) {
                  isApplied = Boolean(resObj.success);
                }
              } else if (typeof resObj === 'boolean') {
                isApplied = resObj;
              }

              results.push({ studentId: student.student_id, status: isApplied ? 'billed' : 'already_billed' });
            }
          } catch (rpcErr) {
            // Fall back to direct ledger upsert
          }

          if (!handled) {
            try {
              // Use UPSERT with UNIQUE constraint - database will prevent duplicates
              const { data: freshStudent } = await supabase
                .from('students')
                .select('id,student_id,name,roll_no,class_name,pending_fee,total_fee')
                .eq('student_id', student.student_id)
                .single();

              const studentUuid = freshStudent?.id || student.id;
              const previousDue = Number(freshStudent?.pending_fee || 0);
              const updatedDue = previousDue + amount;
              const receiptNo = `REC-BILL-${student.student_id}-${monthKey}`;

              // ATOMIC: Insert ledger entry with UNIQUE constraint enforcement
              const { data: ledgerResult, error: ledgerError } = await supabase
                .from('fee_billing_ledger')
                .upsert({
                  student_id: student.student_id,
                  billing_month: monthKey,
                  amount: amount,
                  previous_due: previousDue,
                  updated_due: updatedDue,
                  batch_label: target.label,
                  idempotency_key: `fee_${student.student_id}_${monthKey}`
                }, {
                  onConflict: 'student_id,billing_month',
                  ignoreDuplicates: true
                })
                .select();

              if (ledgerError) {
                throw ledgerError;
              }

              // Check if this was a duplicate (no rows returned)
              if (!ledgerResult || ledgerResult.length === 0) {
                results.push({ studentId: student.student_id, status: 'already_billed' });
                continue;
              }

              // Only update student fees if ledger entry was actually created
              const { error: updateError } = await supabase.from('students').update({
                pending_fee: updatedDue,
                total_fee: Number(freshStudent?.total_fee || 0) + amount,
                updated_at: new Date().toISOString()
              }).eq('id', studentUuid);

              if (updateError) {
                throw updateError;
              }

              if (studentUuid) {
                try {
                  await supabase.from('fee_receipts').upsert({
                    receipt_no: receiptNo,
                    student_id: studentUuid,
                    amount: amount,
                    payment_mode: 'System Monthly Billing',
                    payment_date: new Date().toISOString().split('T')[0],
                    status: 'Billed',
                    collected_by: 'System Monthly Engine',
                    note: `Monthly tuition fee for ${currentMonthName}`
                  }, { onConflict: 'receipt_no', ignoreDuplicates: true });
                } catch (receiptErr) {
                  console.warn('[cron] fee_receipts upsert note:', receiptErr.message);
                }
              }

              results.push({ studentId: student.student_id, status: 'billed', receiptNo });
            } catch (dbErr) {
              results.push({ studentId: student.student_id, status: 'billing_failed', error: dbErr.message });
            }
          }
        }
      } else if (target.type === 'reminder') {
        // --- REMINDER DAYS: PENDING DUE REMINDERS (quota-guarded) ---
        let remainingQuota = Math.max(0, DAILY_EMAIL_LIMIT - await countEmailsSentToday(supabase));
        const pendingStudents = activeStudents.filter(s => Number(s.pending_fee) > 0 && s.email && s.email.includes('@'));

        console.log(`📧 Sending ${pendingStudents.length} reminder emails... (remaining quota today: ${remainingQuota})`);
        let successCount = 0;
        let failureCount = 0;
        const CIRCUIT_BREAKER_THRESHOLD = Number(process.env.CIRCUIT_BREAKER_THRESHOLD) || 5;
        let consecutiveFailures = 0;

        for (const student of pendingStudents) {
          // Hard Resend quota guard: stop before exceeding 100/day instead of
          // burning failures; leftovers are reported for manual follow-up.
          if (remainingQuota <= 0) {
            results.push({
              status: 'skipped_quota_exhausted',
              message: `Daily ${DAILY_EMAIL_LIMIT}-email limit reached; ${pendingStudents.length - successCount - failureCount} reminders not sent`,
            });
            break;
          }

          // Circuit breaker: Stop if too many consecutive failures
          if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
            console.error(`🚨 Circuit breaker triggered after ${consecutiveFailures} failures. Stopping email batch.`);
            results.push({
              status: 'circuit_breaker_open',
              message: `Stopped after ${consecutiveFailures} consecutive failures`,
              remainingCount: pendingStudents.length - results.filter(r => r.status && r.status.includes('reminder')).length
            });
            break;
          }

          try {
            // Skip students already reminded in this cycle (double-triggered
            // crons — Vercel + GitHub Actions on the same day — must not
            // send duplicate reminders; billing is idempotent, this makes
            // reminders so too).
            const claimKey = `reminder_${target.type}_${target.key}_${monthKey}_${student.student_id}`;
            const claimed = await claimReminderSend(supabase, claimKey);
            if (claimed === false) {
              results.push({ studentId: student.student_id, status: 'reminder_already_sent' });
              continue;
            }

            const result = await sendEmailViaResend({
              from,
              to: student.email,
              subject: `⚠️ Fee Reminder (${currentMonthName}) — ${student.name} (Roll #${student.roll_no})`,
              html: reminderEmail(student, currentMonthName)
            });

            if (result.success) {
              results.push({ studentId: student.student_id, status: 'reminder_sent', emailId: result.data?.id });
              successCount++;
              remainingQuota--;
              consecutiveFailures = 0; // Reset on success
            } else {
              results.push({ studentId: student.student_id, status: 'reminder_failed', error: extractResendErrorMessage(result.error) });
              failureCount++;
              consecutiveFailures++;
            }
          } catch (remErr) {
            // Catch ALL errors to prevent loop from crashing
            console.error(`❌ Unexpected error sending reminder to ${student.student_id}:`, remErr);
            results.push({ studentId: student.student_id, status: 'reminder_failed', error: extractResendErrorMessage(remErr) });
            failureCount++;
            consecutiveFailures++;
          } finally {
            // Always throttle, even on error (100ms base delay)
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }

        console.log(`✅ Reminder emails complete: ${successCount} sent, ${failureCount} failed`);
      }
    }

    const emailResults = await retryUnsentEmails(supabase, from);
    results.push(...emailResults);

    await supabase.from('audit_logs').insert({
      log_id: `AUD-CRON-${monthKey}-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: 'System Cron',
      action_type: target?.type === 'reminder' ? 'MONTHLY_FEE_REMINDER' : 'MONTHLY_FEE_GENERATION',
      student_name: target?.label || 'Cron Queue',
      student_roll: 'N/A',
      description: target ? `${target.type === 'reminder' ? 'Mid-Month Reminder' : 'Monthly Billing'} executed for ${target.label} (${monthKey})` : 'Cron execution',
      details: { results }
    });

    return res.status(200).json({ success: true, batch: target?.label || null, type: target?.type || null, month: monthKey, results });
  } catch (error) {
    console.error('Monthly billing error:', error.message);
    return res.status(500).json({ success: false, error: 'Monthly billing execution failed' });
  }
}
