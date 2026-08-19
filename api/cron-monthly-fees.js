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
  // Days 1-4: Monthly Tuition Fee Generation & Statements (Day 1 covers ALL active batches; Days 2-4 provide redundant idempotent catch-up)
  1: { key: 'all', label: 'All Batches (1st-of-Month Unified Fee Accrual)', type: 'billing' },
  2: { key: 'all', label: 'All Batches (Day 2 Idempotent Billing Catch-Up)', type: 'billing' },
  3: { key: 'all', label: 'All Batches (Day 3 Idempotent Billing Catch-Up)', type: 'billing' },
  4: { key: 'all', label: 'All Batches (Day 4 Idempotent Billing Catch-Up)', type: 'billing' },

  // Days 15-19: Mid-Month Pending Due Reminders (Only for students with pending_fee > 0)
  15: { key: '10th', label: 'Class 10th (ACHIEVER)', type: 'reminder' },
  16: { key: '9th', label: 'Class 9th (NURTURE)', type: 'reminder' },
  17: { key: '8th', label: 'Class 8th (ALPHA)', type: 'reminder' },
  18: { key: 'junior', label: 'Junior Batch (JUNIO)', type: 'reminder' },
  19: { key: 'all', label: 'All Batches (Pending Dues Reminder)', type: 'reminder' }
};

function getStudentDefaultMonthlyFee(className) {
  const str = String(className || '').toLowerCase();
  if (str.includes('10')) return 1000;
  if (str.includes('9')) return 1000;
  if (str.includes('8')) return 800;
  if (str.includes('junior') || str.includes('junio') || str.includes('6') || str.includes('7')) return 700;
  return 1000;
}

function indiaDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(date)
    .reduce((all, part) => ({ ...all, [part.type]: part.value }), {});
  return { day: Number(parts.day), monthKey: `${parts.year}-${parts.month}` };
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

async function retryUnsentEmails(supabase, from) {
  const MAX_RETRY_ATTEMPTS = 3;
  const BASE_DELAY_MS = 2000; // Start with 2 seconds

  const { data: pending, error } = await supabase
    .from('fee_billing_ledger')
    .select('id,student_id,billing_month,amount,previous_due,updated_due,email_attempts')
    .is('email_sent_at', null)
    .lt('email_attempts', MAX_RETRY_ATTEMPTS) // Only retry if under max attempts
    .order('created_at', { ascending: true })
    .limit(100);
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
      let query = supabase
        .from('students')
        .select('student_id,name,roll_no,class_name,monthly_fee,status,pending_fee,email');
      if (target.key && target.key !== 'all') {
        if (target.key === 'junior') {
          query = query.or('class_name.ilike.%junior%,class_name.ilike.%junio%,class_name.ilike.%6%,class_name.ilike.%7%');
        } else {
          query = query.ilike('class_name', `%${target.key}%`);
        }
      }
      const { data: students, error } = await query;
      if (error) throw error;
      const activeStudents = (students || []).filter(s => !s.status || s.status === 'Active' || s.status === 'active');

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
        // --- DAYS 15 to 18: MID-MONTH PENDING DUE REMINDERS ---
        const pendingStudents = activeStudents.filter(s => Number(s.pending_fee) > 0 && s.email && s.email.includes('@'));

        console.log(`📧 Sending ${pendingStudents.length} reminder emails...`);
        let successCount = 0;
        let failureCount = 0;
        const CIRCUIT_BREAKER_THRESHOLD = Number(process.env.CIRCUIT_BREAKER_THRESHOLD) || 5;
        let consecutiveFailures = 0;

        for (const student of pendingStudents) {
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
            const result = await sendEmailViaResend({
              from,
              to: student.email,
              subject: `⚠️ Fee Reminder (${currentMonthName}) — ${student.name} (Roll #${student.roll_no})`,
              html: reminderEmail(student, currentMonthName)
            });

            if (result.success) {
              results.push({ studentId: student.student_id, status: 'reminder_sent', emailId: result.data?.id });
              successCount++;
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
