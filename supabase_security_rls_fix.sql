-- ============================================================================
-- PRAGYAN INSTITUTE — SUPABASE ZERO-WARNING LINTER PERFECTION
-- Run this in your Supabase SQL Editor -> Click 'Run'
-- ============================================================================

DO $$ BEGIN RAISE EXCEPTION 'OBSOLETE: use supabase_production_hardening.sql; this legacy script can re-open protected data.'; END $$;

-- 1. Enable RLS on all tables
ALTER TABLE IF EXISTS public.notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.fee_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.students ENABLE ROW LEVEL SECURITY;

-- 2. Drop all previous modify/write policies that triggered linter warnings
DROP POLICY IF EXISTS "Allow public read notices" ON public.notices;
DROP POLICY IF EXISTS "Allow admin modify notices" ON public.notices;
DROP POLICY IF EXISTS "Service and Authenticated Modify Notices" ON public.notices;
DROP POLICY IF EXISTS "Public Read Notices" ON public.notices;

DROP POLICY IF EXISTS "Allow read fee_receipts" ON public.fee_receipts;
DROP POLICY IF EXISTS "Allow modify fee_receipts" ON public.fee_receipts;
DROP POLICY IF EXISTS "Service and Authenticated Modify Fee Receipts" ON public.fee_receipts;
DROP POLICY IF EXISTS "Public Read Fee Receipts" ON public.fee_receipts;

DROP POLICY IF EXISTS "Allow read students" ON public.students;
DROP POLICY IF EXISTS "Allow modify students" ON public.students;
DROP POLICY IF EXISTS "Public Insert Access" ON public.students;
DROP POLICY IF EXISTS "Service and Authenticated Modify Students" ON public.students;
DROP POLICY IF EXISTS "Public Read Students" ON public.students;

-- ============================================================================
-- 3. CLEAN SELECT-ONLY POLICIES (100% Linter Compliant)
-- (Note: service_role automatically bypasses RLS for all writes & admin tasks)
-- ============================================================================

-- Public read for notices
CREATE POLICY "Public Read Notices"
ON public.notices
FOR SELECT
TO anon, authenticated
USING (true);

-- Public read for fee receipts
CREATE POLICY "Public Read Fee Receipts"
ON public.fee_receipts
FOR SELECT
TO anon, authenticated
USING (true);

-- Public read for students (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'students') THEN
    EXECUTE 'CREATE POLICY "Public Read Students" ON public.students FOR SELECT TO anon, authenticated USING (true)';
  END IF;
END $$;
