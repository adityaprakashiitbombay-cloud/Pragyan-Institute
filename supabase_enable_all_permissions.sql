-- ============================================================================
-- PRAGYAN INSTITUTE — SUPABASE ROW LEVEL SECURITY (RLS) INSERT & UPDATE FIX
-- Run this in your Supabase Dashboard -> SQL Editor -> Click 'Run'
-- ============================================================================

DO $$ BEGIN RAISE EXCEPTION 'OBSOLETE: use supabase_production_hardening.sql; this script deliberately grants unsafe public permissions.'; END $$;

-- 1. Enable RLS on all 3 tables
ALTER TABLE IF EXISTS public.notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.fee_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.students ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing restrictive policies if present
DROP POLICY IF EXISTS "Allow Public Insert Notices" ON public.notices;
DROP POLICY IF EXISTS "Allow Public Update Notices" ON public.notices;
DROP POLICY IF EXISTS "Allow Public Insert Students" ON public.students;
DROP POLICY IF EXISTS "Allow Public Update Students" ON public.students;
DROP POLICY IF EXISTS "Allow Public Insert Fee Receipts" ON public.fee_receipts;
DROP POLICY IF EXISTS "Allow Public Update Fee Receipts" ON public.fee_receipts;

-- 3. Create Full Access Policies for Notices (Allows Website & Portal Writes)
CREATE POLICY "Allow Public Insert Notices"
ON public.notices FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Allow Public Update Notices"
ON public.notices FOR UPDATE
TO anon, authenticated
USING (true);

-- 4. Create Full Access Policies for Students
CREATE POLICY "Allow Public Insert Students"
ON public.students FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Allow Public Update Students"
ON public.students FOR UPDATE
TO anon, authenticated
USING (true);

-- 5. Create Full Access Policies for Fee Receipts
CREATE POLICY "Allow Public Insert Fee Receipts"
ON public.fee_receipts FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Allow Public Update Fee Receipts"
ON public.fee_receipts FOR UPDATE
TO anon, authenticated
USING (true);

-- 6. Verify Table RLS Status
SELECT tablename, policyname, roles, cmd 
FROM pg_policies 
WHERE schemaname = 'public';
