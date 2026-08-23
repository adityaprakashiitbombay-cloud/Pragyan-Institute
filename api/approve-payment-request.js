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

    // 2. Resilient Direct Execution Fallback.
    // ORDER MATTERS: validate the payment payload BEFORE flipping status to
    // Approved — otherwise an amount-less request is approved with no money
    // ever applied and is stuck (the old bug).
    const { data: pendingRows, error: fetchErr } = await supabase
      .from('student_requests')
      .select('*')
      .eq('request_id', p_req_id)
      .maybeSingle();

    if (fetchErr || !pendingRows) {
      return res.status(404).json({ error: 'Request not found' });
    }
    if (String(pendingRows.status || '').toLowerCase() !== 'pending') {
      return res.status(404).json({ error: 'Request not found or already processed' });
    }

    const previewData = pendingRows.new_data || pendingRows.newData || {};
    const isPaymentReq = pendingRows.type === 'payment' || pendingRows.req_type === 'PAYMENT_VERIFICATION' || pendingRows.req_type === 'PAYMENT' || !!(previewData && (previewData.amount || previewData.paymentDetails));
    let previewAmount = 0;
    if (isPaymentReq) {
      const previewDetails = previewData.paymentDetails || (previewData.amount ? previewData : {});
      previewAmount = Number(previewDetails.amount || pendingRows.amount || 0);
    }
    if (!isPaymentReq || !(previewAmount > 0)) {
      // Non-payment requests (profile edits etc.) can be approved safely.
      const { data: claimedNonPayment, error: claimErr } = await supabase
        .from('student_requests')
        .update({
          status: 'Approved',
          approved_at: new Date().toISOString(),
          approved_by: p_verifier,
          updated_at: new Date().toISOString()
        })
        .eq('request_id', p_req_id)
        .eq('status', 'Pending')
        .select('*')
        .maybeSingle();
      if (claimErr || !claimedNonPayment) {
        return res.status(404).json({ error: 'Request not found or already processed' });
      }
      return res.status(200).json({ success: true, data: { request_id: p_req_id, status: 'Approved' } });
    }

    // ATOMIC claim: only one caller can flip Pending → Approved.
    const { data: reqRows, error: updateErr } = await supabase
      .from('student_requests')
      .update({
        status: 'Approved',
        approved_at: new Date().toISOString(),
        approved_by: p_verifier,
        updated_at: new Date().toISOString()
      })
      .eq('request_id', p_req_id)
      .eq('status', 'Pending')
      .select('*')
      .maybeSingle();

    if (updateErr || !reqRows) {
      // Request was already approved by another admin OR doesn't exist
      return res.status(404).json({ error: 'Request not found or already processed' });
    }

    const reqData = reqRows;
    const newData = reqData.new_data || reqData.newData || {};
    newData.verifiedBy = p_verifier;
    newData.verifiedAt = new Date().toISOString();

    // Update new_data separately (already marked as Approved above)
    const { error: updateDataErr } = await supabase
      .from('student_requests')
      .update({ new_data: newData })
      .eq('request_id', p_req_id);

    if (updateDataErr) {
      console.warn('Failed to update new_data, but request is already approved:', updateDataErr.message);
    }

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
          const receiptNo = `REC-${p_req_id.replace(/^REQ-/, '')}`;

          // IDEMPOTENCY: Check if receipt was already generated for this payment request
          const { data: existingReceipt } = await supabase
            .from('fee_receipts')
            .select('receipt_no')
            .eq('receipt_no', receiptNo)
            .maybeSingle();

          if (existingReceipt) {
            console.log(`[approve-payment] Receipt ${receiptNo} already exists. Skipping duplicate balance adjustment.`);
            return res.status(200).json({
              success: true,
              message: 'Request approved (receipt already issued)',
              receipt_no: receiptNo
            });
          }

          const currentTotal = Number(stu.total_fee || 0);
          const currentPaid = Number(stu.paid_fee || 0);
          const previousPending = Number(stu.pending_fee || Math.max(0, currentTotal - currentPaid));
          const newPaid = currentPaid + amount;
          const newPending = Math.max(0, currentTotal - newPaid);

          const updateStudent = stu.id
            ? supabase.from('students').update({ paid_fee: newPaid, pending_fee: newPending }).eq('id', stu.id)
            : supabase.from('students').update({ paid_fee: newPaid, pending_fee: newPending }).eq('student_id', stu.student_id);

          await updateStudent;

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

          // NOTE: payments are deliberately NOT written to fee_billing_ledger —
          // its UNIQUE(student_id, billing_month) means one payment row would
          // permanently block that student's monthly billing accrual. Payments
          // live in fee_receipts above (matches migration 005 RPC behavior).
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
