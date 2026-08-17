-- ==========================================================
-- Pragyan ERP Architectural & Data Integrity Migrations
-- ==========================================================

DO $$ BEGIN RAISE EXCEPTION 'OBSOLETE: use supabase_production_hardening.sql; this legacy script contains insecure policies.'; END $$;

-- 1. Add monthly_fee column to students table if not exists
ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS monthly_fee numeric(10,2) DEFAULT 1000.00;

-- 2. Create Fee Billing Idempotency Ledger to prevent double billing
CREATE TABLE IF NOT EXISTS public.fee_billing_ledger (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  billing_month text NOT NULL,
  student_id text NOT NULL,
  batch_label text,
  amount numeric(10,2) NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT unique_monthly_student_fee UNIQUE (billing_month, student_id)
);

-- 3. Enable RLS and permissions on fee_billing_ledger
ALTER TABLE public.fee_billing_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to fee_billing_ledger" ON public.fee_billing_ledger;
CREATE POLICY "Allow all access to fee_billing_ledger" ON public.fee_billing_ledger FOR ALL USING (true) WITH CHECK (true);

-- 4. Atomic Server-Side Student ID Generator Function
CREATE OR REPLACE FUNCTION generate_next_student_id(p_class_name text)
RETURNS text AS $$
DECLARE
  v_year text := to_char(NOW(), 'YY');
  v_code text := '10';
  v_max_serial int := 0;
  v_next_id text;
BEGIN
  IF p_class_name ILIKE '%9th%' OR p_class_name ILIKE '%NURTURE%' THEN
    v_code := '09';
  ELSIF p_class_name ILIKE '%8th%' OR p_class_name ILIKE '%ALPHA%' THEN
    v_code := '08';
  ELSIF p_class_name ILIKE '%juni%' OR p_class_name ILIKE '%JUNIO%' THEN
    v_code := '07';
  ELSE
    v_code := '10';
  END IF;

  SELECT COALESCE(MAX(CAST(SUBSTRING(student_id FROM 5) AS INT)), 0)
  INTO v_max_serial
  FROM public.students
  WHERE student_id LIKE (v_year || v_code || '%');

  v_next_id := v_year || v_code || lpad((v_max_serial + 1)::text, 2, '0');
  RETURN v_next_id;
END;
$$ LANGUAGE plpgsql;
