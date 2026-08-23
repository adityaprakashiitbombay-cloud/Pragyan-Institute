import { getSupabase, requireSession, applyCors } from './_lib/auth.js';
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

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Security: Require Admin session OR CRON_SECRET authorization
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  const isCronAuth = process.env.CRON_SECRET && (authHeader === `Bearer ${process.env.CRON_SECRET}` || authHeader === process.env.CRON_SECRET);
  
  let adminUser = 'Admin';
  if (!isCronAuth) {
    const session = requireSession(req, res, ['admin']);
    if (!session) return;
    adminUser = session.name || session.username || 'Admin';
  }

  const supabase = getSupabase();
  if (!supabase) return res.status(503).json({ error: 'Database service is not configured' });

  const resendApiKey = process.env.RESEND_API_KEY;
  const rawFrom = process.env.RESEND_FROM_EMAIL || DEFAULT_FROM;
  const from = isVerifiedSenderDomain(rawFrom) ? rawFrom : DEFAULT_FROM;
  const isEmailConfigured = Boolean(isValidResendApiKey(resendApiKey) && isVerifiedSenderDomain(from));

  const { targetClass = 'all', action = 'invoice', studentId = 'all' } = req.body || {};
  const targetKey = String(targetClass || 'all').toLowerCase();
  const { monthKey } = indiaDateParts();
  const currentMonthName = monthLabel(monthKey);

  try {
    // 1. Query live students from Supabase database
    let query = supabase.from('students').select('id,student_id,name,roll_no,class_name,monthly_fee,status,pending_fee,total_fee,email');
    if (studentId && studentId !== 'all') {
      query = query.or(`student_id.eq.${studentId},id.eq.${studentId}`);
    }

    const { data: rawStudents, error: fetchErr } = await query;
    if (fetchErr) throw fetchErr;

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

            if (isApplied) {
              billedCount++;
              const receiptId = `REC-BILL-${student.student_id}-${monthKey}`;
              const studentUuid = student.id;
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
            }
          }
        } catch (rpcErr) {
          console.warn('RPC note, falling back to direct table operation:', rpcErr.message);
        }

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
          }
        } else {
          results.push({ studentId: student.student_id, name: student.name, status: 'no_dues' });
        }
      }
    }

    return res.status(200).json({
      success: true,
      action,
      targetClass,
      targetKey,
      totalStudents: activeStudents.length,
      billedCount,
      emailedCount,
      results
    });
  } catch (error) {
    console.error('Admin billing trigger error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
