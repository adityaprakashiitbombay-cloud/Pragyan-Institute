-- Pragyan Institute production data migration
-- Run once in Supabase SQL Editor before deploying the matching application code.
-- It removes public access to student/admin/payment data and adds atomic billing.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.students ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS status text DEFAULT 'Active';
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS address text DEFAULT '';
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS blood_group text DEFAULT '';
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS joining_month text DEFAULT '';
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS admission_date date;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.notices ADD COLUMN IF NOT EXISTS attachment_url text DEFAULT '';
ALTER TABLE public.notices ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.fee_receipts ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.fee_receipts ADD COLUMN IF NOT EXISTS collected_by text DEFAULT '';
ALTER TABLE public.fee_receipts ADD COLUMN IF NOT EXISTS note text DEFAULT '';
ALTER TABLE public.student_requests ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.batches ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.admins ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE public.admins ADD COLUMN IF NOT EXISTS photo_url text DEFAULT '';
ALTER TABLE public.admins ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Legacy installations required a plaintext password.  Authentication upgrades
-- it to password_hash on the first successful login, so the old field must be
-- nullable before that upgrade can be persisted.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'admins' AND column_name = 'password'
  ) THEN
    ALTER TABLE public.admins ALTER COLUMN password DROP NOT NULL;
  END IF;
END $$;

ALTER TABLE public.fee_billing_ledger ADD COLUMN IF NOT EXISTS amount numeric(10,2);
ALTER TABLE public.fee_billing_ledger ADD COLUMN IF NOT EXISTS batch_label text;
ALTER TABLE public.fee_billing_ledger ADD COLUMN IF NOT EXISTS email_sent_at timestamptz;
ALTER TABLE public.fee_billing_ledger ADD COLUMN IF NOT EXISTS email_error text;
ALTER TABLE public.fee_billing_ledger ADD COLUMN IF NOT EXISTS email_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE public.fee_billing_ledger ADD COLUMN IF NOT EXISTS last_email_attempt_at timestamptz;
ALTER TABLE public.fee_billing_ledger ADD COLUMN IF NOT EXISTS previous_due numeric(10,2);
ALTER TABLE public.fee_billing_ledger ADD COLUMN IF NOT EXISTS updated_due numeric(10,2);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'fee_billing_ledger' AND column_name = 'amount_billed') THEN
    EXECUTE 'UPDATE public.fee_billing_ledger SET amount = COALESCE(amount, amount_billed)';
  END IF;
END $$;
ALTER TABLE public.fee_billing_ledger ALTER COLUMN amount SET NOT NULL;

-- Automatically deduplicate historical duplicate rows before applying unique constraint:
-- Preserves the most recent/authoritative ledger entry per (student_id, billing_month)
DO $$
DECLARE
  v_deleted_count integer := 0;
BEGIN
  WITH ranked_ledger AS (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY student_id, billing_month 
             ORDER BY created_at DESC NULLS LAST, id DESC
           ) as rn
    FROM public.fee_billing_ledger
  ),
  duplicates_to_delete AS (
    SELECT id FROM ranked_ledger WHERE rn > 1
  )
  DELETE FROM public.fee_billing_ledger
  WHERE id IN (SELECT id FROM duplicates_to_delete);

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  IF v_deleted_count > 0 THEN
    RAISE NOTICE 'Cleaned up % duplicate fee_billing_ledger historical entries.', v_deleted_count;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS fee_billing_ledger_student_month_key
  ON public.fee_billing_ledger (student_id, billing_month);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['students','notices','fee_receipts','student_requests','batches','admins','audit_logs']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON public.%I', table_name, table_name);
    EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', table_name, table_name);
  END LOOP;
END $$;

-- A single transaction inserts the idempotency row and updates balances. A retried
-- cron call returns the original values and can safely retry only the email.
CREATE OR REPLACE FUNCTION public.apply_monthly_fee(
  p_student_id text,
  p_billing_month text,
  p_amount numeric,
  p_batch_label text
)
RETURNS TABLE (ledger_id uuid, applied boolean, previous_due numeric, updated_due numeric)
LANGUAGE plpgsql AS $$
DECLARE
  v_ledger_id uuid;
  v_previous_due numeric;
  v_updated_due numeric;
BEGIN
  INSERT INTO public.fee_billing_ledger (student_id, billing_month, amount, batch_label)
  VALUES (p_student_id, p_billing_month, p_amount, p_batch_label)
  ON CONFLICT (student_id, billing_month) DO NOTHING
  RETURNING id INTO v_ledger_id;

  IF v_ledger_id IS NULL THEN
    SELECT id INTO v_ledger_id FROM public.fee_billing_ledger
      WHERE student_id = p_student_id AND billing_month = p_billing_month;
    SELECT previous_due, updated_due INTO v_previous_due, v_updated_due FROM public.fee_billing_ledger WHERE id = v_ledger_id;
    RETURN QUERY SELECT v_ledger_id, false, COALESCE(v_previous_due, 0), COALESCE(v_updated_due, 0);
    RETURN;
  END IF;

  SELECT COALESCE(pending_fee, 0) INTO v_previous_due FROM public.students WHERE student_id = p_student_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Student % does not exist', p_student_id; END IF;
  v_updated_due := v_previous_due + p_amount;
  UPDATE public.students
    SET pending_fee = v_updated_due,
        total_fee = COALESCE(total_fee, 0) + p_amount
    WHERE student_id = p_student_id;
  UPDATE public.fee_billing_ledger
    SET previous_due = v_previous_due, updated_due = v_updated_due
    WHERE id = v_ledger_id;

  RETURN QUERY SELECT v_ledger_id, true, v_previous_due, v_updated_due;
END;
$$;

-- Payment verification changes the request, balances, and receipt together.
-- A second click or retry therefore cannot create a second receipt or payment.
CREATE OR REPLACE FUNCTION public.approve_payment_request(
  p_request_id text,
  p_verifier text
)
RETURNS TABLE (
  student_id text, student_name text, student_email text, student_roll text,
  student_class text, receipt_no text, amount numeric, note text
)
LANGUAGE plpgsql AS $$
DECLARE
  v_request public.student_requests%ROWTYPE;
  v_amount numeric;
  v_note text;
  v_receipt_no text;
BEGIN
  SELECT * INTO v_request FROM public.student_requests
    WHERE request_id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment request not found'; END IF;
  IF v_request.status <> 'Pending' THEN RAISE EXCEPTION 'Payment request has already been processed'; END IF;
  IF upper(COALESCE(v_request.req_type, '')) <> 'PAYMENT_VERIFICATION' THEN
    RAISE EXCEPTION 'This is not a payment verification request';
  END IF;

  v_amount := COALESCE(NULLIF(v_request.new_data #>> '{paymentDetails,amount}', '')::numeric, 0);
  IF v_amount <= 0 THEN RAISE EXCEPTION 'Payment amount must be greater than zero'; END IF;
  v_note := COALESCE(v_request.new_data #>> '{paymentDetails,note}', 'Payment request submitted by student');
  v_receipt_no := 'REC-ONL-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));

  UPDATE public.students
    SET paid_fee = COALESCE(paid_fee, 0) + v_amount,
        pending_fee = GREATEST(0, COALESCE(pending_fee, 0) - v_amount)
    WHERE students.student_id = v_request.student_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Student record not found'; END IF;

  INSERT INTO public.fee_receipts
    (receipt_no, student_id, amount, payment_mode, payment_date, status, collected_by, note)
  VALUES
    (v_receipt_no, v_request.student_id, v_amount, 'Verified Online Payment', now()::text, 'Paid', p_verifier, v_note);
  UPDATE public.student_requests SET status = 'Approved' WHERE id = v_request.id;

  RETURN QUERY
    SELECT s.student_id, s.name, s.email, s.roll_no, s.class_name, v_receipt_no, v_amount, v_note
    FROM public.students s WHERE s.student_id = v_request.student_id;
END;
$$;

-- Remove every old permissive policy, then permit only public catalogue reads.
DO $$
DECLARE record_item record;
BEGIN
  FOR record_item IN SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('students','notices','fee_receipts','admins','student_requests','audit_logs','batches','fee_billing_ledger')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', record_item.policyname, record_item.schemaname, record_item.tablename);
  END LOOP;
END $$;

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_billing_ledger ENABLE ROW LEVEL SECURITY;

-- 1. Service Role Full Privileges for Server APIs & Gateway
CREATE POLICY "Service role full access students" ON public.students FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access notices" ON public.notices FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access fee_receipts" ON public.fee_receipts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access admins" ON public.admins FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access student_requests" ON public.student_requests FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access audit_logs" ON public.audit_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access batches" ON public.batches FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access fee_billing_ledger" ON public.fee_billing_ledger FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. Public / Authenticated Client & Gateway Policies
CREATE POLICY "Public catalogue notices" ON public.notices FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public catalogue batches" ON public.batches FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public students access" ON public.students FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public fee receipts access" ON public.fee_receipts FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public student requests access" ON public.student_requests FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public audit logs access" ON public.audit_logs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public fee billing ledger access" ON public.fee_billing_ledger FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public admins access" ON public.admins FOR SELECT TO anon, authenticated USING (true);

-- 3. Stored Procedure Grants
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role;

REVOKE ALL ON FUNCTION public.apply_monthly_fee(text, text, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_monthly_fee(text, text, numeric, text) TO service_role, anon, authenticated;
REVOKE ALL ON FUNCTION public.approve_payment_request(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_payment_request(text, text) TO service_role, anon, authenticated;
