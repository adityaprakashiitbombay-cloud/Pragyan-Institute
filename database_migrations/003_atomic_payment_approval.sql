-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 3: Atomic Payment Approval Function
-- ═══════════════════════════════════════════════════════════════
-- Priority: CRITICAL
-- Impact: Prevents race condition in payment approvals (₹10,000+ double credits)
-- Execute in: Supabase SQL Editor
-- Date: 2026-08-18

-- Drop function if exists (for re-deployment)
DROP FUNCTION IF EXISTS approve_payment_request(TEXT, TEXT);

-- Create atomic payment approval function
CREATE OR REPLACE FUNCTION approve_payment_request(
  p_request_id TEXT,
  p_verifier TEXT
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  student_id TEXT,
  amount NUMERIC,
  new_pending NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request RECORD;
  v_student RECORD;
  v_amount NUMERIC;
  v_new_paid NUMERIC;
  v_new_pending NUMERIC;
  v_receipt_no TEXT;
BEGIN
  -- Step 1: Lock and update request status atomically
  -- This prevents two admins from approving the same request
  UPDATE student_requests
  SET
    status = 'Approved',
    approved_at = NOW(),
    approved_by = p_verifier,
    updated_at = NOW()
  WHERE request_id = p_request_id
    AND status = 'Pending'
  RETURNING * INTO v_request;

  -- If no row updated, request was already processed or doesn't exist
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Request not found or already processed', NULL::TEXT, NULL::NUMERIC, NULL::NUMERIC;
    RETURN;
  END IF;

  -- Step 2: Extract payment amount from new_data
  v_amount := (v_request.new_data->>'amount')::NUMERIC;

  IF v_amount IS NULL OR v_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, 'Invalid payment amount', v_request.student_id, NULL::NUMERIC, NULL::NUMERIC;
    RETURN;
  END IF;

  -- Step 3: Lock student row and update fee balances atomically
  UPDATE students
  SET
    paid_fee = paid_fee + v_amount,
    pending_fee = GREATEST(0, pending_fee - v_amount),
    updated_at = NOW()
  WHERE student_id = v_request.student_id
  RETURNING * INTO v_student;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student not found: %', v_request.student_id;
  END IF;

  v_new_paid := v_student.paid_fee;
  v_new_pending := v_student.pending_fee;

  -- Step 4: Create fee receipt with conflict handling
  v_receipt_no := 'REC-' || REPLACE(p_request_id, 'REQ-', '');

  INSERT INTO fee_receipts (
    receipt_no,
    student_id,
    amount,
    payment_mode,
    payment_date,
    status,
    collected_by,
    note,
    created_at
  ) VALUES (
    v_receipt_no,
    v_student.id,
    v_amount,
    COALESCE((v_request.new_data->>'mode')::TEXT, 'Online Payment'),
    CURRENT_DATE,
    'Paid',
    p_verifier,
    'Auto-approved online payment (UTR: ' || COALESCE((v_request.new_data->>'utr')::TEXT, 'N/A') || ')',
    NOW()
  )
  ON CONFLICT (receipt_no) DO NOTHING;

  -- Step 5: Update new_data with verification details
  UPDATE student_requests
  SET new_data = jsonb_set(
    jsonb_set(
      COALESCE(new_data, '{}'::jsonb),
      '{verifiedBy}',
      to_jsonb(p_verifier)
    ),
    '{verifiedAt}',
    to_jsonb(NOW()::TEXT)
  )
  WHERE request_id = p_request_id;

  -- Return success
  RETURN QUERY SELECT TRUE, 'Payment approved successfully', v_request.student_id, v_amount, v_new_pending;
END;
$$;

-- Grant execute permission to service role
GRANT EXECUTE ON FUNCTION approve_payment_request(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION approve_payment_request(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION approve_payment_request(TEXT, TEXT) TO authenticated;

-- Verification: Test the function (optional)
-- SELECT * FROM approve_payment_request('TEST_REQ_001', 'admin_test');
