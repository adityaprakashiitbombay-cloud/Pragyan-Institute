-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 5: Concurrency, Quota & Security Hardening
-- ═══════════════════════════════════════════════════════════════
-- Priority: CRITICAL
-- Impact: Closes double-billing race, anon-RPC abuse, payment-approval
--         money-loss bug, and reminder duplicate sends.
-- Execute in: Supabase SQL Editor (idempotent — safe to re-run)
--
-- Fixes addressed:
--   A. apply_monthly_fee() locked the student row AFTER the ledger existence
--      check → two concurrent cron runs could both pass the check. Lock-first
--      ordering makes the check race-free.
--   B. Both SECURITY DEFINER RPCs were granted to `anon` → anyone with the
--      public anon key could bill arbitrary amounts or approve requests.
--   C. approve_payment_request() marked requests Approved BEFORE validating
--      the amount → amount-less requests got stuck Approved with no money
--      applied. Also wrote payments into fee_billing_ledger, whose
--      UNIQUE(student_id, billing_month) then BLOCKED that student's monthly
--      accrual for the whole month.
--   D. Reminder emails had no send-log → double-triggered crons sent
--      duplicate reminders (billing is idempotent; reminders were not).

-- ───────────────────────────────────────────────────────────────
-- STEP 1: Lock down SECURITY DEFINER functions (fix B)
-- ───────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION apply_monthly_fee(TEXT, TEXT, NUMERIC, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION apply_monthly_fee(TEXT, TEXT, NUMERIC, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION apply_monthly_fee(TEXT, TEXT, NUMERIC, TEXT) FROM authenticated;
GRANT  EXECUTE ON FUNCTION apply_monthly_fee(TEXT, TEXT, NUMERIC, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION approve_payment_request(TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION approve_payment_request(TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION approve_payment_request(TEXT, TEXT) FROM authenticated;
GRANT  EXECUTE ON FUNCTION approve_payment_request(TEXT, TEXT) TO service_role;

-- ───────────────────────────────────────────────────────────────
-- STEP 2: apply_monthly_fee v2 — lock BEFORE existence check (fix A)
-- ───────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS apply_monthly_fee(TEXT, TEXT, NUMERIC, TEXT);

CREATE OR REPLACE FUNCTION apply_monthly_fee(
  p_student_id TEXT,
  p_billing_month TEXT,
  p_amount NUMERIC,
  p_batch_label TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  IF p_student_id IS NULL OR TRIM(p_student_id) = '' THEN
    RETURN jsonb_build_object('applied', FALSE, 'error', 'Student ID is required');
  END IF;

  IF p_billing_month IS NULL OR TRIM(p_billing_month) = '' THEN
    RETURN jsonb_build_object('applied', FALSE, 'error', 'Billing month is required');
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('applied', FALSE, 'error', 'Billing amount must be greater than zero');
  END IF;

  -- STEP 1 (was 2): take the row lock FIRST. Every billing path for this
  -- student serializes here, so the existence check below can never race.
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

  -- STEP 2 (was 1): idempotency check — now race-free behind the lock.
  -- Accepts legacy keys ('fee_...' written by JS fallbacks / client accrual).
  v_idempotency_key := 'BILL-' || p_student_id || '-' || p_billing_month;

  SELECT * INTO v_existing_ledger
  FROM fee_billing_ledger
  WHERE (student_id = p_student_id AND billing_month = p_billing_month)
     OR idempotency_key = v_idempotency_key
     OR idempotency_key = 'fee_' || p_student_id || '-' || p_billing_month
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

  v_previous_due := COALESCE(v_student.pending_fee, 0);
  v_new_due := v_previous_due + p_amount;
  v_new_total := COALESCE(v_student.total_fee, 0) + p_amount;

  UPDATE students
  SET
    pending_fee = v_new_due,
    total_fee = v_new_total,
    updated_at = NOW()
  WHERE student_id = p_student_id;

  BEGIN
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
  EXCEPTION
    WHEN unique_violation THEN
      -- Belt-and-braces: another writer inserted between unlock paths.
      RETURN jsonb_build_object(
        'applied', FALSE,
        'already_billed', TRUE,
        'message', 'Fee already billed for ' || p_billing_month,
        'student_id', p_student_id,
        'billing_month', p_billing_month
      );
  END;

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

GRANT EXECUTE ON FUNCTION apply_monthly_fee(TEXT, TEXT, NUMERIC, TEXT) TO service_role;

-- ───────────────────────────────────────────────────────────────
-- STEP 3: approve_payment_request v2 — validate BEFORE approving (fix C)
-- ───────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS approve_payment_request(TEXT, TEXT);

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
SET search_path = public
AS $$
DECLARE
  v_request RECORD;
  v_student RECORD;
  v_amount NUMERIC;
  v_receipt_no TEXT;
BEGIN
  -- STEP 1: Read + validate the request WITHOUT mutating anything yet.
  SELECT * INTO v_request
  FROM student_requests
  WHERE request_id = p_request_id
    AND status = 'Pending';

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Request not found or already processed', NULL::TEXT, NULL::NUMERIC, NULL::NUMERIC;
    RETURN;
  END IF;

  -- STEP 2: Extract amount from every known payload shape BEFORE approving.
  v_amount := NULLIF(v_request.new_data->>'amount', '')::NUMERIC;
  IF v_amount IS NULL THEN
    v_amount := NULLIF(v_request.new_data->'paymentDetails'->>'amount', '')::NUMERIC;
  END IF;
  IF v_amount IS NULL THEN
    v_amount := NULLIF(v_request.old_data->>'amount', '')::NUMERIC;
  END IF;

  IF v_amount IS NULL OR v_amount <= 0 THEN
    -- Request stays Pending so the admin can fix/reject it — it is NOT stuck Approved.
    RETURN QUERY SELECT FALSE, 'Invalid or missing payment amount — request left Pending', v_request.student_id, NULL::NUMERIC, NULL::NUMERIC;
    RETURN;
  END IF;

  -- STEP 3: Atomic claim (Pending → Approved). Concurrent callers lose here.
  UPDATE student_requests
  SET
    status = 'Approved',
    approved_at = NOW(),
    approved_by = p_verifier,
    updated_at = NOW()
  WHERE request_id = p_request_id
    AND status = 'Pending'
  RETURNING * INTO v_request;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Request already processed by another approver', NULL::TEXT, NULL::NUMERIC, NULL::NUMERIC;
    RETURN;
  END IF;

  -- STEP 4: Lock the student row and apply balances RELATIVELY (safe under lock).
  SELECT * INTO v_student
  FROM students
  WHERE student_id = v_request.student_id
     OR id::text = v_request.student_id
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student not found: %', v_request.student_id;
  END IF;

  UPDATE students
  SET
    paid_fee = COALESCE(paid_fee, 0) + v_amount,
    pending_fee = GREATEST(0, COALESCE(pending_fee, 0) - v_amount),
    updated_at = NOW()
  WHERE id = v_student.id;

  -- STEP 5: Receipt (idempotent on receipt_no).
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
    COALESCE(NULLIF(v_request.new_data->>'mode', ''), 'Online Payment'),
    CURRENT_DATE,
    'Paid',
    p_verifier,
    'Auto-approved online payment (UTR: ' || COALESCE(NULLIF(v_request.new_data->>'utr', ''), 'N/A') || ')',
    NOW()
  )
  ON CONFLICT (receipt_no) DO NOTHING;

  -- NOTE (fix C): payments are deliberately NOT written to fee_billing_ledger.
  -- Its UNIQUE(student_id, billing_month) means one payment row would block the
  -- monthly billing accrual for that student/month. Payments live in
  -- fee_receipts; the ledger is for billing accruals only.

  -- STEP 6: Stamp verification metadata on the request.
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

  RETURN QUERY SELECT TRUE, 'Payment approved successfully', v_request.student_id, v_amount, (SELECT pending_fee FROM students WHERE id = v_student.id);
END;
$$;

GRANT EXECUTE ON FUNCTION approve_payment_request(TEXT, TEXT) TO service_role;

-- ───────────────────────────────────────────────────────────────
-- STEP 4: Reminder email log — makes reminder sends idempotent (fix D)
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fee_email_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ref_key TEXT NOT NULL,
  email_kind TEXT NOT NULL DEFAULT 'reminder',
  recipient TEXT,
  resend_message_id TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_fee_email_log_ref UNIQUE (ref_key)
);

CREATE INDEX IF NOT EXISTS idx_fee_email_log_sent_at
ON fee_email_log(sent_at DESC);

-- ───────────────────────────────────────────────────────────────
-- STEP 5: Data-integrity constraints
-- ───────────────────────────────────────────────────────────────
-- Pre-check duplicates first (run manually if this step warns):
--   SELECT student_id, COUNT(*) FROM students GROUP BY student_id HAVING COUNT(*) > 1;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_students_student_id'
  ) THEN
    BEGIN
      ALTER TABLE students ADD CONSTRAINT uq_students_student_id UNIQUE (student_id);
    EXCEPTION WHEN others THEN
      RAISE WARNING 'Could not add uq_students_student_id (duplicate student_ids exist?): %', SQLERRM;
    END;
  END IF;
END $$;

-- Rollup index for the cron's unsent-email retry query
CREATE INDEX IF NOT EXISTS idx_ledger_email_retry
ON fee_billing_ledger(email_attempts, created_at)
WHERE email_sent_at IS NULL;

-- Requests triage queries (admin approval queue)
CREATE INDEX IF NOT EXISTS idx_requests_type_status
ON student_requests(req_type, status);

-- Batch-day selection queries
CREATE INDEX IF NOT EXISTS idx_students_class_name
ON students(class_name);

-- ═══════════════════════════════════════════════════════════════
-- Verification
-- ═══════════════════════════════════════════════════════════════
SELECT routine_name, security_type
FROM information_schema.routines
WHERE routine_name IN ('apply_monthly_fee', 'approve_payment_request');

SELECT grantee, privilege_type
FROM information_schema.role_routine_grants
WHERE specific_name LIKE 'apply_monthly_fee%'
   OR specific_name LIKE 'approve_payment_request%';

SELECT 'Migration 005 Complete' AS status;
