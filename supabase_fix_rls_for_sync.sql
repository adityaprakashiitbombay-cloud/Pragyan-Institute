-- ============================================================================
-- PRAGYAN INSTITUTE — Fix RLS Policies for Direct Browser Sync
-- Run this in Supabase SQL Editor to ensure all tables are readable/writable
-- ============================================================================

-- Drop ALL existing policies first to avoid conflicts
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('students', 'notices', 'fee_receipts', 'student_requests', 'batches', 'admins', 'audit_logs')
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- Enable RLS on all tables (idempotent)
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Create permissive full-access policies for anon and authenticated roles
-- This allows the browser (using anon key) to read and write all tables
CREATE POLICY "allow_all_students" ON public.students FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_notices" ON public.notices FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_fee_receipts" ON public.fee_receipts FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_student_requests" ON public.student_requests FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_batches" ON public.batches FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_admins" ON public.admins FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_audit_logs" ON public.audit_logs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Also add all tables to realtime publication
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
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'batches') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.batches;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'admins') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.admins;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'audit_logs') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_logs;
  END IF;
END $$;

-- Seed default admin if empty
INSERT INTO public.admins (admin_id, username, name, password, role, mobile, email, is_head)
SELECT 'ADM001', 'admin', 'Pragyan Admin', '123', 'admin', '9999999999', 'admin@pragyaninstitute.com', true
WHERE NOT EXISTS (SELECT 1 FROM public.admins LIMIT 1);

-- Seed default batches if empty
INSERT INTO public.batches (batch_id, name, monthly_fee, timing, room)
SELECT * FROM (VALUES
  ('BATCH001', 'Morning Batch', 1000, '6:00 AM - 8:00 AM', 'Room 1'),
  ('BATCH002', 'Day Batch', 1200, '10:00 AM - 12:00 PM', 'Room 2'),
  ('BATCH003', 'Evening Batch', 1000, '4:00 PM - 6:00 PM', 'Room 3'),
  ('BATCH004', 'Weekend Batch', 1500, 'Sat-Sun 9:00 AM - 12:00 PM', 'Room 4')
) AS t(batch_id, name, monthly_fee, timing, room)
WHERE NOT EXISTS (SELECT 1 FROM public.batches LIMIT 1);
