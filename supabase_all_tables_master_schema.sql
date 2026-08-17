-- ============================================================================
-- PRAGYAN INSTITUTE — MASTER SUPABASE DATABASE SCHEMA (ALL 7 TABLES + LEDGER)
-- Run this in Supabase Dashboard -> SQL Editor -> Click 'Run'
-- ============================================================================

DO $$ BEGIN RAISE EXCEPTION 'OBSOLETE: use supabase_production_hardening.sql; this legacy script contains insecure policies.'; END $$;

-- 1. Create Students Table
CREATE TABLE IF NOT EXISTS public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id varchar(50) UNIQUE NOT NULL,
  name varchar(255) NOT NULL,
  mobile varchar(20),
  dob date,
  roll_no varchar(50),
  class_name varchar(100),
  guardian_name varchar(255),
  guardian_mobile varchar(20),
  email varchar(255),
  monthly_fee numeric(10,2) DEFAULT 1000,
  total_fee numeric(10,2) DEFAULT 5000,
  paid_fee numeric(10,2) DEFAULT 0,
  pending_fee numeric(10,2) DEFAULT 5000,
  created_at timestamptz DEFAULT now()
);

-- Ensure monthly_fee column exists if table was created previously
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'students' AND column_name = 'monthly_fee') THEN
    ALTER TABLE public.students ADD COLUMN monthly_fee numeric(10,2) DEFAULT 1000;
  END IF;
END $$;

-- 2. Create Notices Table
CREATE TABLE IF NOT EXISTS public.notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title varchar(255) NOT NULL,
  category varchar(50) DEFAULT 'general',
  message text NOT NULL,
  target_batch varchar(100) DEFAULT 'All Batches',
  created_at timestamptz DEFAULT now()
);

-- 3. Create Fee Receipts Table
CREATE TABLE IF NOT EXISTS public.fee_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_no varchar(100) UNIQUE NOT NULL,
  student_id varchar(50) REFERENCES public.students(student_id) ON DELETE CASCADE ON UPDATE CASCADE,
  amount numeric(10,2) NOT NULL,
  payment_mode varchar(100) DEFAULT 'Cash Collected',
  payment_date varchar(100) DEFAULT CURRENT_DATE::text,
  status varchar(50) DEFAULT 'Paid'
);

-- 4. Create Admins Table
CREATE TABLE IF NOT EXISTS public.admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id varchar(50) UNIQUE NOT NULL,
  username varchar(100) UNIQUE NOT NULL,
  password varchar(255) NOT NULL,
  name varchar(255) NOT NULL,
  role varchar(255),
  mobile varchar(20),
  email varchar(255),
  upi_id varchar(255) DEFAULT 'pragyanlalganj@upi',
  is_head boolean DEFAULT false
);

-- 5. Create Student Requests Table
CREATE TABLE IF NOT EXISTS public.student_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id varchar(50) UNIQUE NOT NULL,
  student_id varchar(50),
  student_name varchar(255),
  roll_no varchar(50),
  class_name varchar(100),
  req_type varchar(100) DEFAULT 'PROFILE_UPDATE',
  status varchar(50) DEFAULT 'Pending',
  request_date varchar(100),
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz DEFAULT now()
);

-- 6. Create Audit Logs Table
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  log_id varchar(50) UNIQUE NOT NULL,
  timestamp varchar(100),
  actor varchar(255),
  action_type varchar(100),
  student_name varchar(255),
  student_roll varchar(50),
  description text,
  details jsonb,
  created_at timestamptz DEFAULT now()
);

-- 7. Create Batches Table
CREATE TABLE IF NOT EXISTS public.batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id varchar(50) UNIQUE NOT NULL,
  name varchar(255) NOT NULL,
  monthly_fee numeric(10,2) DEFAULT 1000,
  timing varchar(100),
  room varchar(100),
  teacher varchar(255)
);

-- 8. Create Fee Billing Ledger Table (Idempotency control for cron)
CREATE TABLE IF NOT EXISTS public.fee_billing_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id varchar(50) NOT NULL,
  billing_month varchar(20) NOT NULL,
  amount_billed numeric(10,2) NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(student_id, billing_month)
);

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY (RLS) & FULL PERMISSIONS
-- ============================================================================
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_billing_ledger ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Public Full Students" ON public.students;
DROP POLICY IF EXISTS "Public Full Notices" ON public.notices;
DROP POLICY IF EXISTS "Public Full Receipts" ON public.fee_receipts;
DROP POLICY IF EXISTS "Public Full Admins" ON public.admins;
DROP POLICY IF EXISTS "Public Full Requests" ON public.student_requests;
DROP POLICY IF EXISTS "Public Full Audit" ON public.audit_logs;
DROP POLICY IF EXISTS "Public Full Batches" ON public.batches;
DROP POLICY IF EXISTS "Public Full Ledger" ON public.fee_billing_ledger;

-- Create ALL (SELECT, INSERT, UPDATE, DELETE) policies for anon & authenticated
CREATE POLICY "Public Full Students" ON public.students FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public Full Notices" ON public.notices FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public Full Receipts" ON public.fee_receipts FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public Full Admins" ON public.admins FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public Full Requests" ON public.student_requests FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public Full Audit" ON public.audit_logs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public Full Batches" ON public.batches FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public Full Ledger" ON public.fee_billing_ledger FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Enable Supabase Realtime for all 7 tables
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.students, public.notices, public.fee_receipts, public.student_requests, public.batches, public.admins, public.audit_logs;
  EXCEPTION
    WHEN OTHERS THEN NULL;
  END;
END $$;
