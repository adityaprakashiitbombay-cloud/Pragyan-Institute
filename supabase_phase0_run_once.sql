-- ============================================================================
-- PRAGYAN INSTITUTE — PHASE 0: MASTER ONE-SHOT SQL MIGRATION
-- Run this ONCE in Supabase Dashboard → SQL Editor → Run All
-- Contains all 4 sub-migrations in safe execution order
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN RAISE EXCEPTION 'OBSOLETE: use supabase_production_hardening.sql; this legacy script contains insecure policies.'; END $$;

-- STEP 1: RLS Cleanup & Correct Policies (supabase_fixed_schema.sql)
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop ALL existing policies cleanly (idempotent)
DROP POLICY IF EXISTS "Public Full Students" ON public.students;
DROP POLICY IF EXISTS "Public Full Notices" ON public.notices;
DROP POLICY IF EXISTS "Public Full Receipts" ON public.fee_receipts;
DROP POLICY IF EXISTS "Public Full Admins" ON public.admins;
DROP POLICY IF EXISTS "Public Full Requests" ON public.student_requests;
DROP POLICY IF EXISTS "Public Full Audit" ON public.audit_logs;
DROP POLICY IF EXISTS "Public Full Batches" ON public.batches;
DROP POLICY IF EXISTS "Public Read Students" ON public.students;
DROP POLICY IF EXISTS "Public Read Notices" ON public.notices;
DROP POLICY IF EXISTS "Public Read Fee Receipts" ON public.fee_receipts;
DROP POLICY IF EXISTS "Allow Public Insert Students" ON public.students;
DROP POLICY IF EXISTS "Allow Public Update Students" ON public.students;
DROP POLICY IF EXISTS "Allow Public Insert Notices" ON public.notices;
DROP POLICY IF EXISTS "Allow Public Update Notices" ON public.notices;
DROP POLICY IF EXISTS "Allow Public Insert Fee Receipts" ON public.fee_receipts;
DROP POLICY IF EXISTS "Allow Public Update Fee Receipts" ON public.fee_receipts;
DROP POLICY IF EXISTS "Students Read All" ON public.students;
DROP POLICY IF EXISTS "Students Insert" ON public.students;
DROP POLICY IF EXISTS "Students Update" ON public.students;
DROP POLICY IF EXISTS "Students Full Access" ON public.students;
DROP POLICY IF EXISTS "Notices Read All" ON public.notices;
DROP POLICY IF EXISTS "Notices Full Access" ON public.notices;
DROP POLICY IF EXISTS "Receipts Read All" ON public.fee_receipts;
DROP POLICY IF EXISTS "Receipts Insert" ON public.fee_receipts;
DROP POLICY IF EXISTS "Receipts Full Access" ON public.fee_receipts;
DROP POLICY IF EXISTS "Admins Service Role Only" ON public.admins;
DROP POLICY IF EXISTS "Admins Full Access" ON public.admins;
DROP POLICY IF EXISTS "Requests Read All" ON public.student_requests;
DROP POLICY IF EXISTS "Requests Insert" ON public.student_requests;
DROP POLICY IF EXISTS "Requests Full Access" ON public.student_requests;
DROP POLICY IF EXISTS "Audit Service Role Only" ON public.audit_logs;
DROP POLICY IF EXISTS "Audit Full Access" ON public.audit_logs;
DROP POLICY IF EXISTS "Batches Read All" ON public.batches;
DROP POLICY IF EXISTS "Batches Full Access" ON public.batches;
DROP POLICY IF EXISTS "Allow all access to fee_billing_ledger" ON public.fee_billing_ledger;
DROP POLICY IF EXISTS "Ledger Full Access" ON public.fee_billing_ledger;

-- Enable RLS on all tables
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;

-- Full access policies for all tables (mutations go through service_role proxy anyway)
CREATE POLICY "Students Full Access" ON public.students FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Notices Full Access" ON public.notices FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Receipts Full Access" ON public.fee_receipts FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins Full Access" ON public.admins FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Requests Full Access" ON public.student_requests FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Audit Full Access" ON public.audit_logs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Batches Full Access" ON public.batches FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Add monthly_fee column to students (safe add-if-not-exists)
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS monthly_fee numeric(10,2) DEFAULT 1000;

-- Add all tables to realtime publication (safe — skips if already member)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'students') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.students;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notices') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.notices;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'fee_receipts') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.fee_receipts;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'student_requests') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.student_requests;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'admins') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.admins;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'batches') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.batches;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'audit_logs') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_logs;
    END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: Unique Constraints for REST upsert on_conflict
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_student_id_key;
ALTER TABLE public.students ADD CONSTRAINT students_student_id_key UNIQUE (student_id);

ALTER TABLE public.fee_receipts DROP CONSTRAINT IF EXISTS fee_receipts_receipt_no_key;
ALTER TABLE public.fee_receipts ADD CONSTRAINT fee_receipts_receipt_no_key UNIQUE (receipt_no);

ALTER TABLE public.admins DROP CONSTRAINT IF EXISTS admins_admin_id_key;
ALTER TABLE public.admins ADD CONSTRAINT admins_admin_id_key UNIQUE (admin_id);

ALTER TABLE public.admins DROP CONSTRAINT IF EXISTS admins_username_key;
ALTER TABLE public.admins ADD CONSTRAINT admins_username_key UNIQUE (username);

ALTER TABLE public.student_requests DROP CONSTRAINT IF EXISTS student_requests_request_id_key;
ALTER TABLE public.student_requests ADD CONSTRAINT student_requests_request_id_key UNIQUE (request_id);

ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_log_id_key;
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_log_id_key UNIQUE (log_id);

ALTER TABLE public.batches DROP CONSTRAINT IF EXISTS batches_batch_id_key;
ALTER TABLE public.batches ADD CONSTRAINT batches_batch_id_key UNIQUE (batch_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3: Relax NOT NULL on Optional Student Columns
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.students ALTER COLUMN email DROP NOT NULL;
ALTER TABLE public.students ALTER COLUMN dob DROP NOT NULL;
ALTER TABLE public.students ALTER COLUMN guardian_name DROP NOT NULL;
ALTER TABLE public.students ALTER COLUMN guardian_mobile DROP NOT NULL;
ALTER TABLE public.students ALTER COLUMN mobile DROP NOT NULL;
ALTER TABLE public.students ALTER COLUMN class_name DROP NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4: Architectural Additions (fee_billing_ledger + ID generator)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.fee_billing_ledger (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  billing_month text NOT NULL,
  student_id text NOT NULL,
  batch_label text,
  amount numeric(10,2) NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT unique_monthly_student_fee UNIQUE (billing_month, student_id)
);

ALTER TABLE public.fee_billing_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ledger Full Access" ON public.fee_billing_ledger FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION generate_next_student_id(p_class_name text)
RETURNS text AS $$
DECLARE
  v_year text := to_char(NOW(), 'YY');
  v_code text := '10';
  v_max_serial int := 0;
  v_next_id text;
BEGIN
  IF p_class_name ILIKE '%9th%' OR p_class_name ILIKE '%NURTURE%' THEN v_code := '09';
  ELSIF p_class_name ILIKE '%8th%' OR p_class_name ILIKE '%ALPHA%' THEN v_code := '08';
  ELSIF p_class_name ILIKE '%juni%' OR p_class_name ILIKE '%JUNIO%' THEN v_code := '07';
  ELSE v_code := '10';
  END IF;
  SELECT COALESCE(MAX(CAST(SUBSTRING(student_id FROM 5) AS INT)), 0)
  INTO v_max_serial FROM public.students WHERE student_id LIKE (v_year || v_code || '%');
  v_next_id := v_year || v_code || lpad((v_max_serial + 1)::text, 2, '0');
  RETURN v_next_id;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION (run these after above to confirm)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Check all RLS policies
SELECT tablename, policyname, roles, cmd
FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname;

-- 2. Check realtime publication tables
SELECT schemaname, tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' ORDER BY tablename;

-- 3. Check monthly_fee column
SELECT column_name, data_type, column_default FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'students' AND column_name = 'monthly_fee';

-- 4. Check unique constraints
SELECT tc.table_name, kcu.column_name, tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'UNIQUE' AND tc.table_schema = 'public'
ORDER BY tc.table_name;
