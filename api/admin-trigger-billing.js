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
  '10th': { key: '10th', label: 'Class 10th (ACHIEVER)', defaultAmount: 1000 },
  '9th':  { key: '9th',  label: 'Class 9th (NURTURE)',  defaultAmount: 1000 },
  '8th':  { key: '8th',  label: 'Class 8th (ALPHA)',    defaultAmount: 800 },
  'junior': { key: 'junior', label: 'Junior Batch (JUNIO)', defaultAmount: 700 },
  'junio': { key: 'junior', label: 'Junior Batch (JUNIO)', defaultAmount: 700 }
};

function getBatchKey(classStr = '') {
  const str = String(classStr).toLowerCase();
  if (str.includes('10')) return '10th';
  if (str.includes('9')) return '9th';
  if (str.includes('8')) return '8th';
  if (str.includes('junio') || str.includes('junior') || str.includes('6') || str.includes('7')) return 'junior';
  return 'all';
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
  const targetKey = getBatchKey(targetClass);
  const { monthKey } = indiaDateParts();
  const currentMonthName = monthLabel(monthKey);

  try {
    // 1. Query live students from Supabase database
    let query = supabase.from('students').select('id,student_id,name,roll_no,class_name,monthly_fee,status,pending_fee,total_fee,email');
    if (studentId && studentId !== 'all') {
      query = query.or(`student_id.eq.${studentId},id.eq.${studentId}`);
    } else if (targetKey !== 'all') {
      query = query.ilike('class_name', `%${targetKey}%`);
    }

    const { data: rawStudents, error: fetchErr } = await query;
    if (fetchErr) throw fetchErr;

    const activeStudents = (rawStudents || []).filter(s => !s.status || s.status.toLowerCase() === 'active');
    const results = [];
    let billedCount = 0;
    let emailedCount = 0;

    for (const student of activeStudents) {
      if (action === 'invoice') {
        const stuBatchKey = getBatchKey(student.class_name);
        const batchInfo = BATCH_MAP[stuBatchKey] || { defaultAmount: 1000, label: student.class_name };
        const amount = Number(student.monthly_fee || batchInfo.defaultAmount);

        let handled = false;
        try {
          const { data: response, error: billingError } = await supabase.rpc('apply_monthly_fee', {
            p_student_id: student.student_id,
            p_billing_month: monthKey,
            p_amount: amount,
            p_batch_label: student.class_name || batchInfo.label
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
                batch_label: student.class_name || batchInfo.label,
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

        // Send email via Resend
        if (student.email && student.email.includes('@')) {
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
            try {
              const emailRes = await sendEmailViaResend({
                from,
                to: student.email.trim(),
                subject: `⚠️ Fee Reminder: Outstanding Balance ₹${pendingDue.toLocaleString('en-IN')} — ${student.name}`,
                html: reminderEmail(student, currentMonthName)
              });

              if (emailRes.success) {
                emailedCount++;
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
