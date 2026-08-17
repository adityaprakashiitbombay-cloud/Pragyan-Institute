import { getSupabase, requireSession, applyCors } from './_lib/auth.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const session = requireSession(req, res, ['admin']);
  if (!session) return;

  const { requestId, verifierName } = req.body || {};
  if (typeof requestId !== 'string' || !requestId.trim() || typeof verifierName !== 'string' || !verifierName.trim()) {
    return res.status(400).json({ error: 'A payment request and verifier are required' });
  }

  const supabase = getSupabase();
  if (!supabase) return res.status(503).json({ error: 'Server database configuration is missing' });

  const p_req_id = requestId.trim();
  const p_verifier = verifierName.trim();

  try {
    // 1. Attempt RPC call if SQL function exists in database
    const { data: rpcData, error: rpcError } = await supabase.rpc('approve_payment_request', {
      p_request_id: p_req_id,
      p_verifier: p_verifier
    });

    if (!rpcError && rpcData) {
      const approved = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      return res.status(200).json({ success: true, data: approved });
    }

    // 2. Resilient Direct Execution Fallback
    const { data: reqRows, error: fetchErr } = await supabase
      .from('student_requests')
      .select('*')
      .eq('request_id', p_req_id)
      .eq('status', 'Pending')
      .limit(1);

    if (fetchErr) throw fetchErr;
    if (!reqRows || reqRows.length === 0) {
      return res.status(404).json({ error: 'Request not found or already processed' });
    }

    const reqData = reqRows[0];
    const newData = reqData.new_data || reqData.newData || {};
    newData.verifiedBy = p_verifier;
    newData.verifiedAt = new Date().toISOString();

    const { error: updateReqErr } = await supabase
      .from('student_requests')
      .update({ status: 'Approved', new_data: newData })
      .eq('request_id', p_req_id);

    if (updateReqErr) throw updateReqErr;

    const isPaymentReq = reqData.type === 'payment' || reqData.req_type === 'PAYMENT_VERIFICATION' || reqData.req_type === 'PAYMENT' || !!(newData && (newData.amount || newData.paymentDetails));
    if (isPaymentReq) {
      const paymentDetails = newData.paymentDetails || (newData.amount ? newData : {});
      const amount = Number(paymentDetails.amount || reqData.amount || 0);
      const studentId = reqData.student_id || reqData.studentId;

      if (studentId && amount > 0) {
        const safeStudentId = String(studentId).replace(/[^a-zA-Z0-9_-]/g, '').trim();
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(safeStudentId);

        let studentQuery = supabase.from('students').select('id, total_fee, paid_fee, pending_fee, student_id, class_name, roll_no');
        if (isUuid) {
          studentQuery = studentQuery.or(`id.eq.${safeStudentId},student_id.eq.${safeStudentId}`);
        } else {
          studentQuery = studentQuery.or(`student_id.eq.${safeStudentId},roll_no.eq.${safeStudentId}`);
        }

        const { data: stuRows, error: stuErr } = await studentQuery.limit(1);

        if (stuRows && stuRows.length > 0) {
          const stu = stuRows[0];
          const stuUuid = stu.id || stu.student_id;
          const currentTotal = Number(stu.total_fee || 0);
          const currentPaid = Number(stu.paid_fee || 0);
          const previousPending = Number(stu.pending_fee || Math.max(0, currentTotal - currentPaid));
          const newPaid = currentPaid + amount;
          const newPending = Math.max(0, currentTotal - newPaid);

          const updateStudent = stu.id
            ? supabase.from('students').update({ paid_fee: newPaid, pending_fee: newPending }).eq('id', stu.id)
            : supabase.from('students').update({ paid_fee: newPaid, pending_fee: newPending }).eq('student_id', stu.student_id);

          await updateStudent;

          const receiptNo = `REC-${p_req_id.replace(/^REQ-/, '')}`;
          await supabase
            .from('fee_receipts')
            .upsert([{
              receipt_no: receiptNo,
              student_id: stuUuid,
              amount: amount,
              payment_mode: paymentDetails.mode || 'Online UPI',
              payment_date: new Date().toISOString().split('T')[0],
              status: 'Paid',
              collected_by: p_verifier,
              note: `Auto-approved online payment (UTR: ${paymentDetails.utr || 'N/A'})`
            }], { onConflict: 'receipt_no' });

          // Record in fee_billing_ledger
          const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' })
            .formatToParts(new Date())
            .reduce((all, part) => ({ ...all, [part.type]: part.value }), {});
          const currentMonth = `${parts.year}-${parts.month}`;
          await supabase
            .from('fee_billing_ledger')
            .upsert([{
              student_id: stu.student_id || studentId,
              billing_month: currentMonth,
              batch_label: stu.class_name || 'General',
              amount: amount,
              previous_due: previousPending,
              updated_due: newPending,
              idempotency_key: `LEDGER-${receiptNo}`
            }], { onConflict: 'idempotency_key' })
            .catch(err => { console.warn('fee_billing_ledger log error:', err.message); });
        }

        // Update student_fee_accounts
        try {
          const { data: feeAccRows } = await supabase
            .from('student_fee_accounts')
            .select('*')
            .eq('student_id', studentId)
            .limit(1);

          if (feeAccRows && feeAccRows.length > 0) {
            const acc = feeAccRows[0];
            const updatedTotalDue = Math.max(0, Number(acc.total_due || 0) - amount);
            const updatedPaidThisMonth = Number(acc.paid_this_month || 0) + amount;
            const currMonthFee = Number(acc.current_month_fee || 0);
            const updatedPrevDue = Math.max(0, updatedTotalDue - currMonthFee);

            await supabase
              .from('student_fee_accounts')
              .update({
                total_due: updatedTotalDue,
                previous_due: updatedPrevDue,
                paid_this_month: updatedPaidThisMonth,
                last_updated_at: new Date().toISOString()
              })
              .eq('student_id', studentId);
          }
        } catch(accErr) {
          console.warn('Fee account update note:', accErr.message);
        }
      }
    }

    return res.status(200).json({ success: true, data: { request_id: p_req_id, status: 'Approved' } });
  } catch (error) {
    console.error('Payment approval failed:', error.message);
    return res.status(409).json({ error: error.message || 'Payment approval could not be completed' });
  }
}
