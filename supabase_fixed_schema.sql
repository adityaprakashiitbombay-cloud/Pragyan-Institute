-- ============================================================================
-- PRAGYAN INSTITUTE — CORRECTED SUPABASE SCHEMA (RUN ONCE)
-- Handles "relation already member of publication" error
-- ============================================================================

DO $$ BEGIN RAISE EXCEPTION 'OBSOLETE: use supabase_production_hardening.sql; this legacy script contains insecure policies.'; END $$;

-- 1. Drop ALL existing policies cleanly
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

-- 2. Enable RLS on all tables
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;

-- 3. Create CORRECT policies: anon can READ all, WRITE only specific tables
-- Students: Allow anon SELECT + INSERT (registration) + UPDATE (profile edits)
CREATE POLICY "Students Read All" ON public.students FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Students Insert" ON public.students FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Students Update" ON public.students FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- Notices: Allow anon SELECT only (admins post via service_role)
CREATE POLICY "Notices Read All" ON public.notices FOR SELECT TO anon, authenticated USING (true);

-- Fee Receipts: Allow anon SELECT + INSERT (payment recording)
CREATE POLICY "Receipts Read All" ON public.fee_receipts FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Receipts Insert" ON public.fee_receipts FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Admins: No anon access (use service_role for admin ops)
CREATE POLICY "Admins Service Role Only" ON public.admins FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Requests: Allow anon SELECT + INSERT (student requests)
CREATE POLICY "Requests Read All" ON public.student_requests FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Requests Insert" ON public.student_requests FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Audit Logs: Service role only
CREATE POLICY "Audit Service Role Only" ON public.audit_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Batches: Allow anon SELECT
CREATE POLICY "Batches Read All" ON public.batches FOR SELECT TO anon, authenticated USING (true);

-- 4. Add missing monthly_fee column to students (if not exists)
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS monthly_fee numeric(10,2) DEFAULT 1000;

-- 5. Add tables to realtime publication (ignore if already added)
DO $$
BEGIN
    -- Add notices table
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notices'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.notices;
    END IF;

    -- Add fee_receipts table
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'fee_receipts'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.fee_receipts;
    END IF;

    -- Add student_requests table
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'student_requests'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.student_requests;
    END IF;

    -- students table is already in publication (per error), skip it
END $$;

-- 6. Verify policies created
SELECT tablename, policyname, roles, cmd 
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
