-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 4: Atomic Monthly Fee Billing Function
-- ═══════════════════════════════════════════════════════════════
-- Priority: HIGH
-- Impact: Ensures atomic, idempotent monthly tuition fee application
-- Execute in: Supabase SQL Editor
-- Date: 2026-08-18

-- Drop function if exists (for re-deployment)
DROP FUNCTION IF EXISTS apply_monthly_fee(TEXT, TEXT, NUMERIC, TEXT);

-- Create atomic monthly fee application function
CREATE OR REPLACE FUNCTION apply_monthly_fee(
  p_student_id TEXT,
  p_billing_month TEXT,
  p_amount NUMERIC,
  p_batch_label TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing_ledger RECORD;
  v_student RECORD;
  v_previous_due NUMERIC;
  v_new_due NUMERIC;
  v_new_total NUMERIC;
  v_idempotency_key TEXT;
  v_ledger_id BIGINT;
BEGIN
  -- Validate inputs
  IF p_student_id IS NULL OR TRIM(p_student_id) = '' THEN
    RETURN jsonb_build_object('applied', FALSE, 'error', 'Student ID is required');
  END IF;

  IF p_billing_month IS NULL OR TRIM(p_billing_month) = '' THEN
    RETURN jsonb_build_object('applied', FALSE, 'error', 'Billing month is required');
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('applied', FALSE, 'error', 'Billing amount must be greater than zero');
  END IF;

  -- Step 1: Check if fee already billed for this month (Idempotency check)
  v_idempotency_key := 'BILL-' || p_student_id || '-' || p_billing_month;

  SELECT * INTO v_existing_ledger
  FROM fee_billing_ledger
  WHERE (student_id = p_student_id AND billing_month = p_billing_month)
     OR idempotency_key = v_idempotency_key
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'applied', FALSE,
      'already_billed', TRUE,
      'message', 'Fee already billed for ' || p_billing_month,
      'student_id', p_student_id,
      'billing_month', p_billing_month,
      'amount', v_existing_ledger.amount,
      'previous_due', v_existing_ledger.previous_due,
      'updated_due', v_existing_ledger.updated_due
    );
  END IF;

  -- Step 2: Lock student row and retrieve current balances
  SELECT * INTO v_student
  FROM students
  WHERE student_id = p_student_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'applied', FALSE,
      'error', 'Student not found: ' || p_student_id
    );
  END IF;

  v_previous_due := COALESCE(v_student.pending_fee, 0);
  v_new_due := v_previous_due + p_amount;
  v_new_total := COALESCE(v_student.total_fee, 0) + p_amount;

  -- Step 3: Update student fee balances atomically
  UPDATE students
  SET
    pending_fee = v_new_due,
    total_fee = v_new_total,
    updated_at = NOW()
  WHERE student_id = p_student_id;

  -- Step 4: Insert billing record into fee_billing_ledger
  INSERT INTO fee_billing_ledger (
    student_id,
    billing_month,
    batch_label,
    amount,
    previous_due,
    updated_due,
    idempotency_key,
    created_at
  ) VALUES (
    p_student_id,
    p_billing_month,
    COALESCE(p_batch_label, v_student.class_name, 'General'),
    p_amount,
    v_previous_due,
    v_new_due,
    v_idempotency_key,
    NOW()
  )
  RETURNING id INTO v_ledger_id;

  -- Return success response
  RETURN jsonb_build_object(
    'applied', TRUE,
    'success', TRUE,
    'message', 'Monthly fee applied successfully',
    'student_id', p_student_id,
    'billing_month', p_billing_month,
    'amount', p_amount,
    'previous_due', v_previous_due,
    'updated_due', v_new_due,
    'ledger_id', v_ledger_id
  );
END;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION apply_monthly_fee(TEXT, TEXT, NUMERIC, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION apply_monthly_fee(TEXT, TEXT, NUMERIC, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION apply_monthly_fee(TEXT, TEXT, NUMERIC, TEXT) TO authenticated;
