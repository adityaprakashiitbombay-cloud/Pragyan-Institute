-- ============================================================================
-- PRAGYAN INSTITUTE — CANONICAL PRODUCTION SCHEMA & HARDENING MIGRATION
-- ----------------------------------------------------------------------------
-- This is the ONLY SQL script that should ever be run against the project.
-- Every other .sql file in the repository root is obsolete and raises on run.
--
-- Safe to re-run: every statement is idempotent.
--
-- DEPLOY ORDER MATTERS. Section 12 revokes anonymous write access, which the
-- old browser client depended on. Deploy the application code that routes all
-- database traffic through /api/db (service-role gateway) in the SAME release,
-- or the portal will start rejecting writes.
--
-- Sections
--   1. Extensions and helper functions
--   2. Tables (fresh installs) and column convergence (existing installs)
--   3. Historical data repair
--   4. Idempotency: billing_month normalisation + BILL- keys
--   5. Unique constraints
--   6. Indexes
--   7. updated_at triggers
--   8. Student ID generation (YYCCSS) with advisory locking
--   9. Atomic billing:  apply_monthly_fee
--  10. Atomic payment:  approve_payment_request
--  11. Email quota ledger and 100/day reservation RPCs
--  12. Batch catalogue seed (12 canonical batches)
--  13. RLS lockdown and grants
--  14. Realtime publication
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 1. HELPER FUNCTIONS
-- ============================================================================

-- Casts text to numeric without aborting the transaction on malformed input.
-- Payment payloads arrive as operator-typed JSON, so a stray "1,500" or "abc"
-- must degrade to NULL rather than kill an approval.
CREATE OR REPLACE FUNCTION public.safe_numeric(p_value text)
RETURNS numeric
LANGUAGE plpgsql IMMUTABLE
SET search_path = public, pg_temp
AS $fn$
BEGIN
  RETURN btrim(COALESCE(p_value, ''))::numeric;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$fn$;

-- Coerces any legacy billing_month spelling to the canonical YYYY-MM.
-- Legacy rows used 'August 2026' / 'Aug 2026' / full ISO dates; the billing
-- idempotency key is derived from this value, so the formats must converge or
-- the same month could be billed twice under two different keys.
CREATE OR REPLACE FUNCTION public.normalize_billing_month(p_value text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v text := btrim(COALESCE(p_value, ''));
BEGIN
  IF v = '' THEN RETURN NULL; END IF;
  IF v ~ '^\d{4}-\d{2}$' THEN RETURN v; END IF;
  IF v ~ '^\d{4}-\d{2}-\d{2}' THEN RETURN substr(v, 1, 7); END IF;

  BEGIN RETURN to_char(to_date(v, 'FMMonth YYYY'), 'YYYY-MM'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN RETURN to_char(to_date(v, 'FMMon YYYY'),   'YYYY-MM'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN RETURN to_char(to_date(v, 'YYYY-FMMonth'), 'YYYY-MM'); EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN v;
END;
$fn$;

-- Maps a free-text class name to the CC pair of the YYCCSS student barcode.
-- Mirrors resolveBatch() in api/_lib/academic-config.js and js/academic-config.js.
-- Special English is tested before any numeric rule so that
-- 'Special English 9th to 12th' resolves to 01 and never to 12.
CREATE OR REPLACE FUNCTION public.resolve_class_code(p_class_name text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v text := lower(btrim(COALESCE(p_class_name, '')));
BEGIN
  IF v = '' THEN RETURN NULL; END IF;

  -- Explicit canonical batch ids.
  IF v ~ '^bat-12pc[mb]$'      THEN RETURN '12'; END IF;
  IF v ~ '^bat-11pc[mb]$'      THEN RETURN '11'; END IF;
  IF v = 'bat-10'              THEN RETURN '10'; END IF;
  IF v = 'bat-09'              THEN RETURN '09'; END IF;
  IF v = 'bat-08'              THEN RETURN '08'; END IF;
  IF v ~ '^bat-(67|junio)$'    THEN RETURN '07'; END IF;
  IF v = 'bat-15'              THEN RETURN '05'; END IF;
  IF v ~ '^bat-eng-(912|68|15)$' THEN RETURN '01'; END IF;

  -- Special English before every numeric rule.
  IF v ~ '(english|grammar|spoken)' THEN RETURN '01'; END IF;

  -- Longest alternative first: '\m12\M' would not match '12th'.
  IF v ~ '\m(12th|12|xii|twelfth)\M' OR v ~ 'ascend' THEN RETURN '12'; END IF;
  IF v ~ '\m(11th|11|xi|eleventh)\M'                 THEN RETURN '11'; END IF;
  IF v ~ '\m(10th|10|x|tenth)\M' OR v ~ '(achiever|matric)' THEN RETURN '10'; END IF;
  IF v ~ '\m(9th|9|ix|ninth)\M'  OR v ~ 'nurture'    THEN RETURN '09'; END IF;
  IF v ~ '\m(8th|8|viii|eighth)\M' OR v ~ 'alpha'    THEN RETURN '08'; END IF;
  IF v ~ '\m(6th|7th|6|7|vi|vii|sixth|seventh)\M' OR v ~ '(pioneer|junio)' THEN RETURN '07'; END IF;
  IF v ~ '\m(1st|2nd|3rd|4th|5th|[1-5]|i|ii|iii|iv|v|first|second|third|fourth|fifth)\M'
     OR v ~ '(primary|junior)' THEN RETURN '05'; END IF;

  RETURN NULL;
END;
$fn$;

-- Current calendar day / month in Asia/Kolkata. Vercel cron fires in UTC, and
-- a 04:00 UTC run on the 1st is already 09:30 IST on the 1st -- but a late-UTC
-- run would otherwise bill the wrong day. All date logic goes through here.
CREATE OR REPLACE FUNCTION public.ist_today()
RETURNS date
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $fn$ SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date $fn$;

CREATE OR REPLACE FUNCTION public.ist_month_key()
RETURNS text
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $fn$ SELECT to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM') $fn$;

-- ============================================================================
-- 2. TABLES (fresh installs) + COLUMN CONVERGENCE (existing installs)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.students (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id text NOT NULL,
  name text NOT NULL,
  roll_no text,
  class_name text,
  email text,
  mobile text,
  dob text,
  guardian_name text,
  guardian_mobile text,
  address text DEFAULT '',
  blood_group text DEFAULT '',
  photo_url text,
  status text DEFAULT 'Active',
  joining_month text DEFAULT '',
  admission_date date,
  monthly_fee numeric(10,2) DEFAULT 1000,
  total_fee numeric(10,2) DEFAULT 0,
  paid_fee numeric(10,2) DEFAULT 0,
  pending_fee numeric(10,2) DEFAULT 0,
  password_hash text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notices (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  body text,
  category text DEFAULT 'General',
  attachment_url text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.batches (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_id text NOT NULL,
  name text NOT NULL,
  class_name text,
  monthly_fee numeric(10,2) NOT NULL,
  annual_fee numeric(10,2),
  class_code text,
  billing_day smallint,
  teachers jsonb DEFAULT '[]'::jsonb,
  schedule jsonb DEFAULT '[]'::jsonb,
  subjects jsonb DEFAULT '[]'::jsonb,
  timing text DEFAULT '',
  room text DEFAULT '',
  capacity integer DEFAULT 40,
  tagline text,
  status text DEFAULT 'Active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fee_receipts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  receipt_no text NOT NULL,
  student_id text NOT NULL,
  amount numeric(10,2) NOT NULL,
  payment_mode text DEFAULT 'Cash',
  payment_date text,
  status text DEFAULT 'Paid',
  collected_by text DEFAULT '',
  note text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fee_billing_ledger (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id text NOT NULL,
  billing_month text NOT NULL,
  amount numeric(10,2) NOT NULL,
  batch_label text,
  idempotency_key text,
  previous_due numeric(10,2),
  updated_due numeric(10,2),
  email_sent_at timestamptz,
  email_error text,
  email_attempts integer NOT NULL DEFAULT 0,
  last_email_attempt_at timestamptz,
  resend_message_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.student_requests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id text NOT NULL,
  student_id text NOT NULL,
  req_type text NOT NULL,
  status text DEFAULT 'Pending',
  old_data jsonb DEFAULT '{}'::jsonb,
  new_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admins (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id text NOT NULL,
  username text NOT NULL,
  name text NOT NULL,
  role text DEFAULT 'Admin',
  mobile text,
  email text,
  upi_id text,
  is_head boolean DEFAULT false,
  photo_url text DEFAULT '',
  password text,
  password_hash text,
  token_version integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  log_id text NOT NULL,
  action_type text,
  actor_name text,
  target text,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- --- Column convergence for installs created by earlier scripts -------------
ALTER TABLE public.students            ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE public.students            ADD COLUMN IF NOT EXISTS status text DEFAULT 'Active';
ALTER TABLE public.students            ADD COLUMN IF NOT EXISTS address text DEFAULT '';
ALTER TABLE public.students            ADD COLUMN IF NOT EXISTS blood_group text DEFAULT '';
ALTER TABLE public.students            ADD COLUMN IF NOT EXISTS joining_month text DEFAULT '';
ALTER TABLE public.students            ADD COLUMN IF NOT EXISTS admission_date date;
ALTER TABLE public.students            ADD COLUMN IF NOT EXISTS monthly_fee numeric(10,2) DEFAULT 1000;
ALTER TABLE public.students            ADD COLUMN IF NOT EXISTS total_fee numeric(10,2) DEFAULT 0;
ALTER TABLE public.students            ADD COLUMN IF NOT EXISTS paid_fee numeric(10,2) DEFAULT 0;
ALTER TABLE public.students            ADD COLUMN IF NOT EXISTS pending_fee numeric(10,2) DEFAULT 0;
ALTER TABLE public.students            ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE public.students            ADD COLUMN IF NOT EXISTS stream_user_id text;
ALTER TABLE public.students            ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.students            ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.notices             ADD COLUMN IF NOT EXISTS attachment_url text DEFAULT '';
ALTER TABLE public.notices             ADD COLUMN IF NOT EXISTS category text DEFAULT 'General';
ALTER TABLE public.notices             ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.notices             ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.batches             ADD COLUMN IF NOT EXISTS annual_fee numeric(10,2);
ALTER TABLE public.batches             ADD COLUMN IF NOT EXISTS class_code text;
ALTER TABLE public.batches             ADD COLUMN IF NOT EXISTS class_name text;
ALTER TABLE public.batches             ADD COLUMN IF NOT EXISTS stream text DEFAULT '';
ALTER TABLE public.batches             ADD COLUMN IF NOT EXISTS teacher text DEFAULT '';
ALTER TABLE public.batches             ADD COLUMN IF NOT EXISTS billing_day smallint;
ALTER TABLE public.batches             ADD COLUMN IF NOT EXISTS teachers jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.batches             ADD COLUMN IF NOT EXISTS schedule jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.batches             ADD COLUMN IF NOT EXISTS subjects jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.batches             ADD COLUMN IF NOT EXISTS timing text DEFAULT '';
ALTER TABLE public.batches             ADD COLUMN IF NOT EXISTS room text DEFAULT '';
ALTER TABLE public.batches             ADD COLUMN IF NOT EXISTS capacity integer DEFAULT 40;
ALTER TABLE public.batches             ADD COLUMN IF NOT EXISTS tagline text;
ALTER TABLE public.batches             ADD COLUMN IF NOT EXISTS status text DEFAULT 'Active';
ALTER TABLE public.batches             ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.batches             ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS idx_batches_batch_id ON public.batches (batch_id);

ALTER TABLE public.fee_receipts        ADD COLUMN IF NOT EXISTS collected_by text DEFAULT '';
ALTER TABLE public.fee_receipts        ADD COLUMN IF NOT EXISTS note text DEFAULT '';
ALTER TABLE public.fee_receipts        ADD COLUMN IF NOT EXISTS status text DEFAULT 'Paid';
ALTER TABLE public.fee_receipts        ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.fee_receipts        ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.fee_billing_ledger  ADD COLUMN IF NOT EXISTS amount numeric(10,2);
ALTER TABLE public.fee_billing_ledger  ADD COLUMN IF NOT EXISTS batch_label text;
ALTER TABLE public.fee_billing_ledger  ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE public.fee_billing_ledger  ADD COLUMN IF NOT EXISTS previous_due numeric(10,2);
ALTER TABLE public.fee_billing_ledger  ADD COLUMN IF NOT EXISTS updated_due numeric(10,2);
ALTER TABLE public.fee_billing_ledger  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz;
ALTER TABLE public.fee_billing_ledger  ADD COLUMN IF NOT EXISTS email_error text;
ALTER TABLE public.fee_billing_ledger  ADD COLUMN IF NOT EXISTS email_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE public.fee_billing_ledger  ADD COLUMN IF NOT EXISTS last_email_attempt_at timestamptz;
ALTER TABLE public.fee_billing_ledger  ADD COLUMN IF NOT EXISTS resend_message_id text;
ALTER TABLE public.fee_billing_ledger  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.fee_billing_ledger  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.student_requests    ADD COLUMN IF NOT EXISTS old_data jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.student_requests    ADD COLUMN IF NOT EXISTS new_data jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.student_requests    ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.student_requests    ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.admins              ADD COLUMN IF NOT EXISTS password text;
ALTER TABLE public.admins              ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE public.admins              ADD COLUMN IF NOT EXISTS photo_url text DEFAULT '';
ALTER TABLE public.admins              ADD COLUMN IF NOT EXISTS upi_id text;
ALTER TABLE public.admins              ADD COLUMN IF NOT EXISTS is_head boolean DEFAULT false;
ALTER TABLE public.admins              ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 1;
ALTER TABLE public.admins              ADD COLUMN IF NOT EXISTS stream_user_id text;
ALTER TABLE public.admins              ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.admins              ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.audit_logs          ADD COLUMN IF NOT EXISTS log_id text;
ALTER TABLE public.audit_logs          ADD COLUMN IF NOT EXISTS action_type text;
ALTER TABLE public.audit_logs          ADD COLUMN IF NOT EXISTS actor text;
ALTER TABLE public.audit_logs          ADD COLUMN IF NOT EXISTS actor_name text;
ALTER TABLE public.audit_logs          ADD COLUMN IF NOT EXISTS target text;
ALTER TABLE public.audit_logs          ADD COLUMN IF NOT EXISTS student_name text;
ALTER TABLE public.audit_logs          ADD COLUMN IF NOT EXISTS student_roll text;
ALTER TABLE public.audit_logs          ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.audit_logs          ADD COLUMN IF NOT EXISTS details jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.audit_logs          ADD COLUMN IF NOT EXISTS timestamp text;
ALTER TABLE public.audit_logs          ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.audit_logs          ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Authentication upgrades a legacy plaintext password to password_hash on the
-- first successful login, so the old column must be nullable to persist that.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'admins' AND column_name = 'password') THEN
    ALTER TABLE public.admins ALTER COLUMN password DROP NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'students' AND column_name = 'password') THEN
    ALTER TABLE public.students ALTER COLUMN password DROP NOT NULL;
  END IF;
END $do$;

-- Optional student fields must not block admission of a partially known record.
DO $do$
DECLARE c text;
BEGIN
  FOREACH c IN ARRAY ARRAY['email','dob','guardian_name','guardian_mobile','mobile','class_name','roll_no']
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='students' AND column_name=c AND is_nullable='NO') THEN
      EXECUTE format('ALTER TABLE public.students ALTER COLUMN %I DROP NOT NULL', c);
    END IF;
  END LOOP;
END $do$;

-- ============================================================================
-- 3. HISTORICAL DATA REPAIR
-- ============================================================================

-- Balance columns must be non-negative before the CHECK constraints below can
-- be validated; earlier read-modify-write code could drive them negative.
UPDATE public.students SET pending_fee = 0 WHERE pending_fee < 0;
UPDATE public.students SET paid_fee    = 0 WHERE paid_fee    < 0;
UPDATE public.students SET total_fee   = 0 WHERE total_fee   < 0;
UPDATE public.students SET monthly_fee = NULL WHERE monthly_fee IS NOT NULL AND monthly_fee <= 0;

-- Ledger rows written before `amount` existed.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='fee_billing_ledger' AND column_name='amount_billed') THEN
    EXECUTE 'UPDATE public.fee_billing_ledger SET amount = COALESCE(amount, amount_billed)';
  END IF;
END $do$;
UPDATE public.fee_billing_ledger SET amount = 0 WHERE amount IS NULL;
ALTER TABLE public.fee_billing_ledger ALTER COLUMN amount SET NOT NULL;

-- Payment rows that earlier code mis-filed into the BILLING ledger. A payment
-- shares a (student_id, billing_month) pair with that month's genuine invoice,
-- so leaving them here makes the unique index below impossible to create and
-- corrupts every "amount billed this month" report. Receipts already hold the
-- authoritative payment record, so these rows are redundant, not data loss.
DELETE FROM public.fee_billing_ledger
 WHERE idempotency_key LIKE 'LEDGER-%'
    OR batch_label ILIKE '%payment%'
    OR batch_label ILIKE '%receipt%';

-- ============================================================================
-- 4. IDEMPOTENCY: billing_month normalisation + BILL- keys
-- ============================================================================

-- Converge every legacy billing_month spelling to YYYY-MM first, so that
-- 'August 2026' and '2026-08' collapse into one row instead of two invoices.
UPDATE public.fee_billing_ledger
   SET billing_month = public.normalize_billing_month(billing_month)
 WHERE billing_month IS DISTINCT FROM public.normalize_billing_month(billing_month);

-- Keep the most recent authoritative row per (student_id, billing_month).
DO $do$
DECLARE v_deleted integer := 0;
BEGIN
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (
             PARTITION BY student_id, billing_month
             ORDER BY (email_sent_at IS NOT NULL) DESC, created_at DESC NULLS LAST, id DESC
           ) AS rn
      FROM public.fee_billing_ledger
  )
  DELETE FROM public.fee_billing_ledger
   WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted > 0 THEN
    RAISE NOTICE 'Collapsed % duplicate fee_billing_ledger rows after month normalisation.', v_deleted;
  END IF;
END $do$;

-- Backfill the canonical key. Derived from (student_id, billing_month), which
-- is now unique, so the backfill cannot itself produce a collision.
UPDATE public.fee_billing_ledger
   SET idempotency_key = 'BILL-' || upper(btrim(student_id)) || '-' || billing_month
 WHERE idempotency_key IS NULL
    OR idempotency_key <> 'BILL-' || upper(btrim(student_id)) || '-' || billing_month;

ALTER TABLE public.fee_billing_ledger ALTER COLUMN idempotency_key SET NOT NULL;

-- ============================================================================
-- 5. UNIQUE CONSTRAINTS
-- ============================================================================

DO $do$
DECLARE
  r record;
  spec text[][] := ARRAY[
    ARRAY['students',         'students_student_id_key',              'student_id'],
    ARRAY['fee_receipts',     'fee_receipts_receipt_no_key',          'receipt_no'],
    ARRAY['admins',           'admins_admin_id_key',                  'admin_id'],
    ARRAY['admins',           'admins_username_key',                  'username'],
    ARRAY['student_requests', 'student_requests_request_id_key',      'request_id'],
    ARRAY['audit_logs',       'audit_logs_log_id_key',                'log_id'],
    ARRAY['batches',          'batches_batch_id_key',                 'batch_id']
  ];
  i integer;
BEGIN
  FOR i IN 1 .. array_length(spec, 1) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conname = spec[i][2] AND conrelid = format('public.%I', spec[i][1])::regclass
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I UNIQUE (%I)', spec[i][1], spec[i][2], spec[i][3]);
    END IF;
  END LOOP;
END $do$;

CREATE UNIQUE INDEX IF NOT EXISTS fee_billing_ledger_student_month_key
  ON public.fee_billing_ledger (student_id, billing_month);

CREATE UNIQUE INDEX IF NOT EXISTS fee_billing_ledger_idempotency_key
  ON public.fee_billing_ledger (idempotency_key);

-- Server-side UTR uniqueness. The browser previously de-duplicated UTRs against
-- a localStorage key it never wrote, so the guard was dead on any fresh device
-- and the same transaction reference could be submitted -- and approved -- any
-- number of times. Rejected requests are excluded so a genuine typo can be
-- corrected and re-submitted after the admin rejects it.
CREATE UNIQUE INDEX IF NOT EXISTS student_requests_payment_utr_key
  ON public.student_requests (
    (upper(btrim(COALESCE(new_data #>> '{paymentDetails,utr}', new_data ->> 'utr'))))
  )
  WHERE upper(COALESCE(req_type, '')) = 'PAYMENT_VERIFICATION'
    AND COALESCE(new_data #>> '{paymentDetails,utr}', new_data ->> 'utr') IS NOT NULL
    AND btrim(COALESCE(new_data #>> '{paymentDetails,utr}', new_data ->> 'utr')) <> ''
    AND COALESCE(status, 'Pending') <> 'Rejected';

-- Balance sanity. Added NOT VALID so an existing install is not blocked by a
-- historical row; section 3 already repaired the known offenders, and VALIDATE
-- runs immediately after so genuine corruption still surfaces here.
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'students_pending_fee_non_negative') THEN
    ALTER TABLE public.students ADD CONSTRAINT students_pending_fee_non_negative CHECK (pending_fee >= 0) NOT VALID;
    ALTER TABLE public.students VALIDATE CONSTRAINT students_pending_fee_non_negative;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'students_paid_fee_non_negative') THEN
    ALTER TABLE public.students ADD CONSTRAINT students_paid_fee_non_negative CHECK (paid_fee >= 0) NOT VALID;
    ALTER TABLE public.students VALIDATE CONSTRAINT students_paid_fee_non_negative;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fee_billing_ledger_amount_positive') THEN
    ALTER TABLE public.fee_billing_ledger ADD CONSTRAINT fee_billing_ledger_amount_positive CHECK (amount >= 0) NOT VALID;
    ALTER TABLE public.fee_billing_ledger VALIDATE CONSTRAINT fee_billing_ledger_amount_positive;
  END IF;
END $do$;

-- ============================================================================
-- 6. INDEXES
-- ============================================================================

-- The cron's unsent-email retry sweep. Partial, so it stays tiny: once an
-- invoice mail is delivered the row leaves the index for good.
CREATE INDEX IF NOT EXISTS idx_ledger_unsent_email
  ON public.fee_billing_ledger (created_at)
  WHERE email_sent_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ledger_student        ON public.fee_billing_ledger (student_id);
CREATE INDEX IF NOT EXISTS idx_ledger_month          ON public.fee_billing_ledger (billing_month);

-- Batch sweeps select by class and skip inactive students.
CREATE INDEX IF NOT EXISTS idx_students_class_status ON public.students (class_name, status);

-- Reminder sweeps only ever look at students who owe money.
CREATE INDEX IF NOT EXISTS idx_students_pending
  ON public.students (pending_fee)
  WHERE pending_fee > 0;

-- Daily receipt-email quota count and the collection reports.
CREATE INDEX IF NOT EXISTS idx_receipts_date_status  ON public.fee_receipts (payment_date, status);
CREATE INDEX IF NOT EXISTS idx_receipts_student      ON public.fee_receipts (student_id);
CREATE INDEX IF NOT EXISTS idx_receipts_created      ON public.fee_receipts (created_at DESC);

-- Audit history screen filters by action then pages by recency.
CREATE INDEX IF NOT EXISTS idx_audit_action_created  ON public.audit_logs (action_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_created         ON public.audit_logs (created_at DESC);

-- The admin approvals queue.
CREATE INDEX IF NOT EXISTS idx_requests_status_type  ON public.student_requests (status, req_type);
CREATE INDEX IF NOT EXISTS idx_requests_student      ON public.student_requests (student_id);

-- ============================================================================
-- 7. updated_at TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$fn$;

DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['students','notices','fee_receipts','fee_billing_ledger','student_requests','batches','admins','audit_logs']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t, t);
  END LOOP;
END $do$;

-- ============================================================================
-- 8. STUDENT ID GENERATION -- YYCCSS with advisory locking
-- ============================================================================

DROP FUNCTION IF EXISTS public.generate_next_student_id(text);

CREATE OR REPLACE FUNCTION public.generate_next_student_id(p_class_name text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_year   text := to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YY');
  v_code   text := public.resolve_class_code(p_class_name);
  v_prefix text;
  v_next   integer;
BEGIN
  IF v_code IS NULL THEN
    RAISE EXCEPTION 'Cannot derive a YYCCSS class code from class name "%". Assign the student to one of the 12 canonical batches first.', p_class_name
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_prefix := v_year || v_code;

  -- Serialise serial allocation per (intake year, class). Without this two
  -- simultaneous admissions both read the same MAX and mint the same barcode;
  -- the unique constraint then fails the second admission outright.
  PERFORM pg_advisory_xact_lock(hashtext('pragyan_student_id_' || v_prefix));

  SELECT COALESCE(MAX(substring(student_id FROM 5 FOR 2)::integer), 0) + 1
    INTO v_next
    FROM public.students
   WHERE student_id ~ ('^' || v_prefix || '[0-9]{2}$');

  IF v_next > 99 THEN
    RAISE EXCEPTION 'Serial range exhausted for prefix % -- YYCCSS allows 01 to 99 only. Split the batch or start a new intake year.', v_prefix
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  RETURN v_prefix || lpad(v_next::text, 2, '0');
END;
$fn$;

-- ============================================================================
-- 9. ATOMIC BILLING -- apply_monthly_fee
-- ============================================================================
-- Replaces two mutually incompatible definitions (one RETURNS TABLE, one
-- RETURNS JSONB) that silently overwrote each other depending on which script
-- ran last.
--
-- LOCK ORDER (project-wide invariant): student_requests -> students -> child
-- tables. Both money-moving RPCs obey it, so they cannot deadlock each other.
DROP FUNCTION IF EXISTS public.apply_monthly_fee CASCADE;
DROP FUNCTION IF EXISTS apply_monthly_fee CASCADE;
DROP FUNCTION IF EXISTS public.apply_monthly_fee(text, text, numeric, text);
DROP FUNCTION IF EXISTS public.apply_monthly_fee(text, text, numeric);

CREATE OR REPLACE FUNCTION public.apply_monthly_fee(
  p_student_id     text,
  p_billing_month  text,
  p_amount         numeric,
  p_batch_label    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_sid      text := btrim(COALESCE(p_student_id, ''));
  v_month    text := public.normalize_billing_month(p_billing_month);
  v_key      text;
  v_ledger   public.fee_billing_ledger%ROWTYPE;
  v_student  public.students%ROWTYPE;
  v_previous numeric;
  v_updated  numeric;
BEGIN
  IF v_sid = '' THEN
    RETURN jsonb_build_object('success', false, 'code', 'BAD_STUDENT', 'error', 'student_id is required');
  END IF;
  IF v_month IS NULL OR v_month !~ '^\d{4}-\d{2}$' THEN
    RETURN jsonb_build_object('success', false, 'code', 'BAD_MONTH',
      'error', format('billing_month "%s" is not a YYYY-MM value', p_billing_month));
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'code', 'BAD_AMOUNT', 'error', 'amount must be greater than zero');
  END IF;

  v_key := 'BILL-' || upper(v_sid) || '-' || v_month;

  -- Take the student row lock FIRST and hold it for the whole transaction. Two
  -- concurrent cron retries therefore serialise here rather than racing on the
  -- read-modify-write of pending_fee.
  SELECT * INTO v_student FROM public.students WHERE student_id = v_sid FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'NO_STUDENT',
      'error', format('Student %s does not exist', v_sid));
  END IF;

  v_previous := COALESCE(v_student.pending_fee, 0);
  v_updated  := v_previous + p_amount;

  -- Bare ON CONFLICT DO NOTHING (no inference target) so that a clash on
  -- EITHER unique index -- idempotency_key or (student_id, billing_month) --
  -- is absorbed. Naming one index would let the other raise.
  INSERT INTO public.fee_billing_ledger
    (student_id, billing_month, amount, batch_label, idempotency_key, previous_due, updated_due)
  VALUES
    (v_sid, v_month, p_amount, p_batch_label, v_key, v_previous, v_updated)
  ON CONFLICT DO NOTHING
  RETURNING * INTO v_ledger;

  IF v_ledger.id IS NULL THEN
    -- Already billed this month: a retried cron invocation, a double-clicked
    -- admin trigger, or a network retry. Report the original figures so the
    -- caller can still retry ONLY the email.
    SELECT * INTO v_ledger FROM public.fee_billing_ledger
      WHERE student_id = v_sid AND billing_month = v_month;

    RETURN jsonb_build_object(
      'success', true, 'applied', false, 'idempotent', true,
      'ledger_id',       v_ledger.id,
      'idempotency_key', v_ledger.idempotency_key,
      'billing_month',   v_month,
      'amount',          v_ledger.amount,
      'batch_label',     v_ledger.batch_label,
      'previous_due',    COALESCE(v_ledger.previous_due, 0),
      'updated_due',     COALESCE(v_ledger.updated_due, COALESCE(v_student.pending_fee, 0)),
      'email_sent_at',   v_ledger.email_sent_at,
      'email_attempts',  v_ledger.email_attempts
    );
  END IF;

  UPDATE public.students
     SET pending_fee = v_updated,
         total_fee   = COALESCE(total_fee, 0) + p_amount
   WHERE student_id = v_sid;

  RETURN jsonb_build_object(
    'success', true, 'applied', true, 'idempotent', false,
    'ledger_id',       v_ledger.id,
    'idempotency_key', v_key,
    'billing_month',   v_month,
    'amount',          p_amount,
    'batch_label',     p_batch_label,
    'previous_due',    v_previous,
    'updated_due',     v_updated,
    'email_sent_at',   NULL,
    'email_attempts',  0
  );
END;
$fn$;

-- Claims the email-send slot for one ledger row. Returns TRUE to exactly one
-- caller; a concurrent duplicate cron run gets FALSE and sends nothing. This
-- replaces the `supabase.raw('email_attempts + 1')` call that threw a
-- TypeError on every invocation and took the whole cron handler down with it.
CREATE OR REPLACE FUNCTION public.claim_ledger_email(p_ledger_id uuid, p_max_attempts integer DEFAULT 3)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE v_row public.fee_billing_ledger%ROWTYPE;
BEGIN
  UPDATE public.fee_billing_ledger
     SET email_attempts        = email_attempts + 1,
         last_email_attempt_at = now()
   WHERE id = p_ledger_id
     AND email_sent_at IS NULL
     AND email_attempts < p_max_attempts
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('claimed', false);
  END IF;
  RETURN jsonb_build_object('claimed', true, 'email_attempts', v_row.email_attempts);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.settle_ledger_email(
  p_ledger_id  uuid,
  p_success    boolean,
  p_message_id text DEFAULT NULL,
  p_error      text DEFAULT NULL
)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  UPDATE public.fee_billing_ledger
     SET email_sent_at      = CASE WHEN p_success THEN COALESCE(email_sent_at, now()) ELSE email_sent_at END,
         resend_message_id  = COALESCE(p_message_id, resend_message_id),
         email_error        = CASE WHEN p_success THEN NULL ELSE COALESCE(p_error, email_error) END,
         updated_at         = now()
   WHERE id = p_ledger_id;
$fn$;

-- ============================================================================
-- 10. ATOMIC PAYMENT -- approve_payment_request
-- ============================================================================
-- Replaces two incompatible definitions. The migration-003 variant read the
-- amount from new_data->>'amount', but pay.html writes it to
-- new_data.paymentDetails.amount, so every online payment approval failed with
-- "Invalid payment amount". This version accepts both shapes.
DROP FUNCTION IF EXISTS public.approve_payment_request CASCADE;
DROP FUNCTION IF EXISTS approve_payment_request CASCADE;
DROP FUNCTION IF EXISTS public.approve_payment_request(text, text, boolean);
DROP FUNCTION IF EXISTS public.approve_payment_request(text, text);
DROP FUNCTION IF EXISTS public.approve_payment_request(text);

CREATE OR REPLACE FUNCTION public.approve_payment_request(
p_request_id    text,
p_verifier      text DEFAULT 'ADMIN',
p_allow_surplus boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_request    public.student_requests%ROWTYPE;
  v_student    public.students%ROWTYPE;
  v_receipt    public.fee_receipts%ROWTYPE;
  v_amount     numeric;
  v_note       text;
  v_mode       text;
  v_utr        text;
  v_receipt_no text;
  v_paid       numeric;
  v_pending    numeric;
BEGIN
  -- Lock order step 1: the request.
  SELECT * INTO v_request FROM public.student_requests
    WHERE request_id = btrim(p_request_id) FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'error', 'Payment request not found');
  END IF;

  -- A payment request is one that says so, or -- for rows written by an older
  -- client that recorded no type at all -- one that carries nested payment
  -- details. The second arm is deliberately narrow: a PROFILE_UPDATE row has its
  -- req_type set, so it can never reach here, and a row needs an actual
  -- paymentDetails object rather than merely some top-level 'amount' key.
  IF upper(COALESCE(v_request.req_type, '')) NOT IN ('PAYMENT_VERIFICATION', 'PAYMENT')
     AND NOT (
       btrim(COALESCE(v_request.req_type, '')) = ''
       AND (v_request.new_data #> '{paymentDetails}') IS NOT NULL
     ) THEN
    RETURN jsonb_build_object('success', false, 'code', 'WRONG_TYPE',
      'error', format('Request %s is not a payment verification request (type: %s)',
                      btrim(p_request_id), COALESCE(NULLIF(btrim(COALESCE(v_request.req_type, '')), ''), 'none')));
  END IF;

  -- Deterministic receipt number: derived from the request id, so a retry after
  -- a dropped response reproduces the same receipt instead of a duplicate.
  v_receipt_no := 'REC-' || upper(regexp_replace(btrim(v_request.request_id), '^REQ-', ''));

  IF COALESCE(v_request.status, 'Pending') <> 'Pending' THEN
    -- Idempotent replay. The previous approval committed; the admin merely lost
    -- the response. Return the original receipt rather than an error, so the UI
    -- can stop reporting failure on payments that actually succeeded.
    SELECT * INTO v_receipt FROM public.fee_receipts WHERE receipt_no = v_receipt_no;
    SELECT * INTO v_student FROM public.students WHERE student_id = v_request.student_id;

    IF v_receipt.id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'code', 'ALREADY_PROCESSED',
        'error', format('Payment request was already marked %s', v_request.status));
    END IF;

    RETURN jsonb_build_object(
      'success', true, 'idempotent', true,
      'receipt_no',    v_receipt.receipt_no,
      'amount',        v_receipt.amount,
      'note',          v_receipt.note,
      'payment_mode',  v_receipt.payment_mode,
      'student_id',    v_student.student_id,
      'student_uuid',  v_student.id,
      'student_name',  v_student.name,
      'student_email', v_student.email,
      'student_roll',  v_student.roll_no,
      'student_class', v_student.class_name,
      'paid_fee',      COALESCE(v_student.paid_fee, 0),
      'pending_fee',   COALESCE(v_student.pending_fee, 0)
    );
  END IF;

  -- Accept both payload shapes: nested paymentDetails (pay.html) and flat
  -- top-level keys (portal admin form).
  v_amount := COALESCE(
    public.safe_numeric(v_request.new_data #>> '{paymentDetails,amount}'),
    public.safe_numeric(v_request.new_data #>> '{payment_details,amount}'),
    public.safe_numeric(v_request.new_data ->> 'amount')
  );
  IF v_amount IS NULL OR v_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'code', 'BAD_AMOUNT',
      'error', 'Payment amount must be a number greater than zero');
  END IF;

  v_note := COALESCE(
    NULLIF(btrim(COALESCE(v_request.new_data #>> '{paymentDetails,note}', '')), ''),
    NULLIF(btrim(COALESCE(v_request.new_data ->> 'note', '')), ''),
    'Online payment verified by ' || COALESCE(p_verifier, 'ADMIN')
  );
  v_mode := COALESCE(
    NULLIF(btrim(COALESCE(v_request.new_data #>> '{paymentDetails,mode}', '')), ''),
    NULLIF(btrim(COALESCE(v_request.new_data ->> 'mode', '')), ''),
    'Verified Online Payment'
  );
  v_utr := NULLIF(btrim(COALESCE(
    v_request.new_data #>> '{paymentDetails,utr}',
    v_request.new_data ->> 'utr', '')), '');

  -- Lock order step 2: the student.
  SELECT * INTO v_student FROM public.students
    WHERE student_id = v_request.student_id FOR UPDATE;
IF NOT FOUND THEN
RETURN jsonb_build_object('success', false, 'code', 'NO_STUDENT',
'error', format('Student record %s not found', v_request.student_id));
END IF;

-- F-R5: FINANCIAL BOUNDARY. A credit above live dues + one month's fee is a
-- surplus and demands an explicit admin override. Every override is journalled
-- to audit_logs INSIDE this transaction, so the money path stays single-owner.
IF v_amount > COALESCE(v_student.pending_fee, 0) + COALESCE(v_student.monthly_fee, 0) THEN
  IF NOT COALESCE(p_allow_surplus, false) THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'AMOUNT_EXCEEDS_DUES',
      'error', format('Amount %s exceeds recorded dues %s; re-confirm with an explicit surplus override',
                      v_amount, COALESCE(v_student.pending_fee, 0)),
      'requested_amount', v_amount,
      'live_pending', COALESCE(v_student.pending_fee, 0),
      'needs_override', true);
  END IF;

  INSERT INTO public.audit_logs
    (log_id, timestamp, actor, action_type, student_name, student_roll, description, details)
  VALUES
    ('AUD-SURPLUS-' || v_receipt_no || '-' || extract(epoch FROM now())::bigint,
     now(),
     COALESCE(p_verifier, 'ADMIN'),
     'SURPLUS_APPROVAL_OVERRIDE',
     COALESCE(v_request.student_name, ''),
     COALESCE(v_request.roll_no, 'N/A'),
     format('Approved %s against live dues of %s with explicit surplus override',
            v_amount, COALESCE(v_student.pending_fee, 0)),
     jsonb_build_object('request_id', btrim(p_request_id),
                        'requested_amount', v_amount,
                        'live_pending', COALESCE(v_student.pending_fee, 0),
                        'override_by', COALESCE(p_verifier, 'ADMIN')));
END IF;

  v_paid    := COALESCE(v_student.paid_fee, 0) + v_amount;
  v_pending := GREATEST(0, COALESCE(v_student.pending_fee, 0) - v_amount);

  UPDATE public.students
     SET paid_fee = v_paid, pending_fee = v_pending
   WHERE student_id = v_request.student_id;

  -- Lock order step 3: child tables. Receipts only -- a payment is NOT a
  -- billing event and must never enter fee_billing_ledger, whose
  -- (student_id, billing_month) uniqueness a payment row would violate.
  INSERT INTO public.fee_receipts
    (receipt_no, student_id, amount, payment_mode, payment_date, status, collected_by, note)
  VALUES
    (v_receipt_no, v_student.student_id, v_amount, v_mode,
     to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD'), 'Paid',
     COALESCE(p_verifier, 'ADMIN'),
     CASE WHEN v_utr IS NULL THEN v_note ELSE v_note || ' (UTR: ' || v_utr || ')' END)
  ON CONFLICT (receipt_no) DO NOTHING;

  UPDATE public.student_requests
     SET status = 'Approved'
   WHERE id = v_request.id;

  RETURN jsonb_build_object(
    'success', true, 'idempotent', false,
    'receipt_no',    v_receipt_no,
    'amount',        v_amount,
    'note',          v_note,
    'payment_mode',  v_mode,
    'utr',           v_utr,
    'student_id',    v_student.student_id,
    'student_uuid',  v_student.id,
    'student_name',  v_student.name,
    'student_email', v_student.email,
    'student_roll',  v_student.roll_no,
    'student_class', v_student.class_name,
    'paid_fee',      v_paid,
    'pending_fee',   v_pending
  );
END;
$fn$;

-- ============================================================================
-- 11. EMAIL QUOTA LEDGER -- Resend free tier is a hard 100/day
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.email_dispatch_log (
  id bigserial PRIMARY KEY,
  dispatch_day date NOT NULL,
  category text NOT NULL,
  recipient text NOT NULL,
  reference text,
  -- Optional per-message identity for same-day duplicate suppression, e.g.
  -- 'REMIND-260112-2026-08'. Deliberately NOT the email address: two siblings
  -- share a parent's inbox and each needs their own reminder, so the key is
  -- per-student. NULL means "no suppression" -- the default.
  dedupe_key text,
  -- pending: slot reserved, send in flight.  sent: delivered.
  -- unknown: timed out, provider may have delivered -- still consumes a slot.
  -- failed / deferred: provider never accepted it, slot released.
  status text NOT NULL DEFAULT 'pending',
  provider_message_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz
);

-- Idempotent for deployments that already created the table.
ALTER TABLE public.email_dispatch_log ADD COLUMN IF NOT EXISTS dedupe_key text;

CREATE INDEX IF NOT EXISTS idx_email_dispatch_day_status
  ON public.email_dispatch_log (dispatch_day, status);
CREATE INDEX IF NOT EXISTS idx_email_dispatch_reference
  ON public.email_dispatch_log (reference)
  WHERE reference IS NOT NULL;

-- One live message per key per IST day. Partial on status so that a send which
-- FAILED leaves the index and can be retried the same day, while one that was
-- sent (or timed out, and may have been delivered) blocks a repeat.
--
-- This is what stops a parent being chased twice in one day when the cron and an
-- admin button both fire -- the statement path is protected by
-- claim_ledger_email, but reminders had no such guard.
CREATE UNIQUE INDEX IF NOT EXISTS uq_email_dispatch_dedupe_live
  ON public.email_dispatch_log (dispatch_day, dedupe_key)
  WHERE dedupe_key IS NOT NULL AND status IN ('pending', 'sent', 'unknown');

-- Adding p_dedupe_keys would otherwise create an OVERLOAD rather than replace the
-- function: a 4-argument call would still resolve to the old body (exact arity
-- beats a default), silently disabling duplicate suppression, and PostgREST would
-- have two candidates to choose between. Drop the old signature first.
DROP FUNCTION IF EXISTS public.reserve_email_quota(text, text[], text, integer);

-- Atomically reserve up to p_limit slots for the current IST day.
-- Returns the granted recipients and, when the cap is hit mid-batch, the
-- deferred remainder -- so a run that lands on slot 99 of 100 delivers 1 mail
-- and reports the rest as deferred instead of silently 429-ing.
--
-- p_dedupe_keys, when supplied, must align 1:1 with p_recipients. A recipient
-- whose key already has a live row today is returned under 'duplicate' and
-- consumes no slot. That is how a second reminder run on the same day is
-- suppressed without blocking the day-7 -> day-10 escalation (different days) or
-- collapsing two siblings who share one inbox (different keys).
CREATE OR REPLACE FUNCTION public.reserve_email_quota(
  p_category    text,
  p_recipients  text[],
  p_reference   text DEFAULT NULL,
  p_limit       integer DEFAULT 100,
  p_dedupe_keys text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_day       date := public.ist_today();
  v_used      integer;
  v_remaining integer;
  v_taken     integer := 0;
  v_granted   jsonb := '[]'::jsonb;
  v_deferred  jsonb := '[]'::jsonb;
  v_duplicate jsonb := '[]'::jsonb;
  v_recipients text[] := COALESCE(p_recipients, ARRAY[]::text[]);
  v_clean     text;
  v_key       text;
  v_id        bigint;
  i           integer;
BEGIN
  IF p_limit IS NULL OR p_limit < 0 THEN p_limit := 100; END IF;

  IF p_dedupe_keys IS NOT NULL
     AND array_length(p_dedupe_keys, 1) IS DISTINCT FROM array_length(v_recipients, 1) THEN
    RAISE EXCEPTION 'reserve_email_quota: p_dedupe_keys must align 1:1 with p_recipients'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Serialise all quota arithmetic for this IST day across every concurrent
  -- caller -- cron retry, admin trigger, student receipt -- so the last slot
  -- can never be handed to two senders at once.
  PERFORM pg_advisory_xact_lock(hashtext('pragyan_email_quota_' || v_day::text));

  SELECT count(*) INTO v_used
    FROM public.email_dispatch_log
   WHERE dispatch_day = v_day AND status IN ('pending', 'sent', 'unknown');

  v_remaining := GREATEST(0, p_limit - v_used);

  FOR i IN 1 .. COALESCE(array_length(v_recipients, 1), 0)
  LOOP
    v_clean := lower(btrim(COALESCE(v_recipients[i], '')));
    CONTINUE WHEN v_clean = '';
    v_key := CASE WHEN p_dedupe_keys IS NULL THEN NULL ELSE nullif(btrim(COALESCE(p_dedupe_keys[i], '')), '') END;

    -- Already sent (or in flight) today under this key: not a slot, not an error.
    IF v_key IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.email_dispatch_log
       WHERE dispatch_day = v_day
         AND dedupe_key = v_key
         AND status IN ('pending', 'sent', 'unknown')
    ) THEN
      v_duplicate := v_duplicate || jsonb_build_object('recipient', v_clean, 'dedupe_key', v_key);
      CONTINUE;
    END IF;

    IF v_taken < v_remaining THEN
      INSERT INTO public.email_dispatch_log (dispatch_day, category, recipient, reference, dedupe_key, status)
      VALUES (v_day, p_category, v_clean, p_reference, v_key, 'pending')
      RETURNING id INTO v_id;
      v_granted := v_granted || jsonb_build_object('dispatch_id', v_id, 'recipient', v_clean);
      v_taken := v_taken + 1;
    ELSE
      v_deferred := v_deferred || to_jsonb(v_clean);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'day',             v_day,
    'limit',           p_limit,
    'used_before',     v_used,
    'granted',         v_granted,
    'granted_count',   v_taken,
    'deferred',        v_deferred,
    'deferred_count',  jsonb_array_length(v_deferred),
    'duplicate',       v_duplicate,
    'duplicate_count', jsonb_array_length(v_duplicate),
    'remaining_after', GREATEST(0, p_limit - v_used - v_taken)
  );
END;
$fn$;

-- Settle reserved slots after the provider responds. 'failed' and 'deferred'
-- release the slot; 'unknown' (a timeout) keeps it consumed, because the
-- provider may well have delivered the message.
CREATE OR REPLACE FUNCTION public.settle_email_dispatch(
  p_dispatch_ids bigint[],
  p_status       text,
  p_message_id   text DEFAULT NULL,
  p_error        text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE v_count integer;
BEGIN
  IF p_status NOT IN ('sent', 'failed', 'deferred', 'unknown') THEN
    RAISE EXCEPTION 'settle_email_dispatch: status must be sent, failed, deferred or unknown (got %)', p_status
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE public.email_dispatch_log
     SET status = p_status,
         provider_message_id = COALESCE(p_message_id, provider_message_id),
         error = p_error,
         settled_at = now()
   WHERE id = ANY(COALESCE(p_dispatch_ids, ARRAY[]::bigint[]))
     AND status = 'pending';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$fn$;

-- Live quota for the admin dashboard and /api/email-quota.
CREATE OR REPLACE FUNCTION public.email_quota_status(p_limit integer DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_day       date := public.ist_today();
  v_used      integer;
  v_breakdown jsonb;
BEGIN
  IF p_limit IS NULL OR p_limit < 0 THEN p_limit := 100; END IF;

  SELECT count(*) INTO v_used
    FROM public.email_dispatch_log
   WHERE dispatch_day = v_day AND status IN ('pending', 'sent', 'unknown');

  SELECT COALESCE(jsonb_object_agg(category, cnt), '{}'::jsonb) INTO v_breakdown
    FROM (
      SELECT category, count(*) AS cnt
        FROM public.email_dispatch_log
       WHERE dispatch_day = v_day AND status IN ('pending', 'sent', 'unknown')
       GROUP BY category
    ) s;

  RETURN jsonb_build_object(
    'day',       v_day,
    'limit',     p_limit,
    'used',      v_used,
    'remaining', GREATEST(0, p_limit - v_used),
    'breakdown', v_breakdown
  );
END;
$fn$;

-- Housekeeping: the quota only cares about today, so keep 90 days for auditing
-- and drop the rest. Called opportunistically by /api/email-quota.
CREATE OR REPLACE FUNCTION public.prune_email_dispatch_log(p_keep_days integer DEFAULT 90)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE v_count integer;
BEGIN
  DELETE FROM public.email_dispatch_log
   WHERE dispatch_day < public.ist_today() - GREATEST(1, COALESCE(p_keep_days, 90));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$fn$;

-- Compatibility view: fee_email_log aliasing email_dispatch_log
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'fee_email_log') THEN
    EXECUTE 'DROP VIEW public.fee_email_log CASCADE';
  ELSIF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'fee_email_log') THEN
    EXECUTE 'DROP TABLE public.fee_email_log CASCADE';
  END IF;
END $$;
CREATE OR REPLACE VIEW public.fee_email_log AS
  SELECT
    id,
    COALESCE(reference, dedupe_key, 'EMAIL-' || id::text) AS ref_key,
    COALESCE(settled_at, created_at) AS sent_at,
    status,
    error AS error_message,
    jsonb_build_object(
      'recipient', recipient,
      'category', category,
      'dispatch_day', dispatch_day,
      'provider_message_id', provider_message_id,
      'reference', reference,
      'dedupe_key', dedupe_key
    ) AS metadata
  FROM public.email_dispatch_log;


-- ============================================================================
-- 12. BATCH CATALOGUE -- the 12 canonical batches
-- ============================================================================
-- Mirrors api/_lib/academic-config.js. Fees are the authoritative monthly rate;
-- annual_fee is the 5% scholarship price on a full-year advance.
INSERT INTO public.batches
  (batch_id, name, class_name, monthly_fee, annual_fee, class_code, billing_day, teachers, tagline, timing, room, subjects, capacity, status)
VALUES
  ('BAT-12PCM',   'Class 12th PCM',                      'Class 12th PCM',              1500, 17100, '12', 1, '["PROF. RAVI RANJAN","CHANDAN KUMAR"]'::jsonb, 'ASCEND — I.Sc. Physics, Chemistry & Higher Mathematics', '6:30 AM – 8:30 AM',  'Room 101 (Senior Hall)', '["Physics", "Chemistry", "Higher Mathematics"]'::jsonb, 40, 'Active'),
  ('BAT-12PCB',   'Class 12th PCB',                      'Class 12th PCB',              1500, 17100, '12', 1, '["CHANDAN KUMAR","PROF. RAVI RANJAN"]'::jsonb, 'ASCEND — I.Sc. Physics, Chemistry & Biology',            '6:30 AM – 8:30 AM',  'Room 101 (Senior Hall)', '["Physics", "Chemistry", "Biology"]'::jsonb,            40, 'Active'),
  ('BAT-11PCM',   'Class 11th PCM',                      'Class 11th PCM',              1500, 17100, '11', 2, '["PROF. RAVI RANJAN","CHANDAN KUMAR"]'::jsonb, 'ASCEND — I.Sc. Foundation with Higher Mathematics',      '8:30 AM – 10:30 AM', 'Room 101 (Senior Hall)', '["Physics", "Chemistry", "Higher Mathematics"]'::jsonb, 40, 'Active'),
  ('BAT-11PCB',   'Class 11th PCB',                      'Class 11th PCB',              1500, 17100, '11', 2, '["CHANDAN KUMAR","PROF. RAVI RANJAN"]'::jsonb, 'ASCEND — I.Sc. Foundation with Biology',                 '8:30 AM – 10:30 AM', 'Room 101 (Senior Hall)', '["Physics", "Chemistry", "Biology"]'::jsonb,            40, 'Active'),
  ('BAT-10',      'Class 10th (ACHIEVER)',               'Class 10th',                  1000, 11400, '10', 1, '["CHANDAN KUMAR","PROF. RAVI RANJAN"]'::jsonb, 'ACHIEVER — Matric Board intensive',                      '4:00 PM – 6:00 PM',  'Room 102 (Smart Lab)',   '["Mathematics", "Science", "Social Science"]'::jsonb,  45, 'Active'),
  ('BAT-09',      'Class 9th (NURTURE)',                 'Class 9th',                   1000, 11400, '09', 2, '["CHANDAN KUMAR","PROF. RAVI RANJAN"]'::jsonb, 'NURTURE — Board foundation',                             '5:30 PM – 7:30 PM',  'Room 102 (Smart Lab)',   '["Mathematics", "Science", "English"]'::jsonb,         45, 'Active'),
  ('BAT-08',      'Class 8th (ALPHA)',                    'Class 8th',                    800,  9120, '08', 3, '["CHANDAN KUMAR","PROF. RAVI RANJAN"]'::jsonb, 'ALPHA — Middle school mastery',                          '3:00 PM – 4:30 PM',  'Room 103 (Main Hall)',   '["Mathematics", "Science", "English"]'::jsonb,         40, 'Active'),
  ('BAT-67',      'Class 6th & 7th (PIONEER)',            'Class 6th & 7th',              700,  7980, '07', 4, '["CHANDAN KUMAR","ADITI SINGH"]'::jsonb,       'PIONEER — Early foundation',                             '2:00 PM – 3:30 PM',  'Room 103 (Main Hall)',   '["Science", "Maths", "English Basics"]'::jsonb,        35, 'Active'),
  ('BAT-15',      'Class 1st to 5th (Junior Foundation)', 'Class 1st to 5th',             500,  5700, '05', 5, '["ADITI SINGH","CHANDAN KUMAR"]'::jsonb,       'Junior Foundation — primary all-subject care',           '3:30 PM – 5:00 PM',  'Room 104 (Junior Wing)', '["Basic Science", "Numeracy", "Reading"]'::jsonb,      30, 'Active'),
  ('BAT-ENG-912', 'Special English 9th to 12th',          'Special English 9th to 12th', 1000, 11400, '01', 6, '["ADITI SINGH"]'::jsonb,                       'English & Grammar mastery with Aditi Singh',             '6:00 PM – 7:00 PM',  'Room 105 (Language Lab)','["English Grammar", "Spoken English"]'::jsonb,         35, 'Active'),
  ('BAT-ENG-68',  'Special English 6th to 8th',           'Special English 6th to 8th',   700,  7980, '01', 6, '["ADITI SINGH"]'::jsonb,                       'English & Grammar foundation with Aditi Singh',          '5:00 PM – 6:00 PM',  'Room 105 (Language Lab)','["Grammar Basics", "Vocabulary", "Phonics"]'::jsonb,   35, 'Active'),
  ('BAT-ENG-15',  'Special English 1st to 5th',           'Special English 1st to 5th',   500,  5700, '01', 6, '["ADITI SINGH"]'::jsonb,                       'Early English & phonics with Aditi Singh',               '2:30 PM – 3:30 PM',  'Room 105 (Language Lab)','["Phonics", "Reading", "Handwriting"]'::jsonb,        30, 'Active')
ON CONFLICT (batch_id) DO UPDATE SET
  name        = EXCLUDED.name,
  class_name  = EXCLUDED.class_name,
  monthly_fee = EXCLUDED.monthly_fee,
  annual_fee  = EXCLUDED.annual_fee,
  class_code  = EXCLUDED.class_code,
  billing_day = EXCLUDED.billing_day,
  teachers    = EXCLUDED.teachers,
  tagline     = EXCLUDED.tagline,
  timing      = EXCLUDED.timing,
  room        = EXCLUDED.room,
  subjects    = EXCLUDED.subjects,
  capacity    = EXCLUDED.capacity,
  status      = EXCLUDED.status;

-- Retire the four placeholder batches earlier client builds seeded locally.
UPDATE public.batches SET status = 'Retired'
 WHERE batch_id IN ('BAT-01', 'BAT-02', 'BAT-03', 'BAT-04', 'BAT-JUNIO');

-- Sole administrator. Password is set by the application on first login; this
-- row only guarantees the identity and the audit-purge authority exist.
INSERT INTO public.admins (admin_id, username, name, role, is_head)
VALUES ('ADM-01', 'chandan', 'CHANDAN KUMAR', 'Managing Director & Science Lead', true)
ON CONFLICT (admin_id) DO UPDATE SET
  username = EXCLUDED.username,
  name     = EXCLUDED.name,
  role     = EXCLUDED.role,
  is_head  = true;

-- ============================================================================
-- 13. RLS LOCKDOWN AND GRANTS
-- ============================================================================
-- Previous scripts claimed to "remove public access" while creating
--   FOR ALL TO anon USING (true) WITH CHECK (true)
-- on students, fee_receipts, student_requests, audit_logs and
-- fee_billing_ledger, and FOR SELECT TO anon on admins (which exposes
-- password_hash). Combined with the anon key shipped in js/config.js that let
-- anyone read every student's PII, rewrite balances, forge receipts and purge
-- the audit trail.
--
-- New model: the browser holds NO write capability. All mutations and all
-- private reads go through /api/db, which authenticates the session and uses
-- the service-role key server-side. anon keeps SELECT on the two public
-- catalogue tables so the marketing site still renders without a session.

DO $do$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('students','notices','fee_receipts','admins','student_requests',
                         'audit_logs','batches','fee_billing_ledger','email_dispatch_log')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
  END LOOP;
END $do$;

DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['students','notices','fee_receipts','admins','student_requests',
                           'audit_logs','batches','fee_billing_ledger','email_dispatch_log']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY "service_role_full_%s" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $do$;

-- The only anonymous capability in the system: read the public catalogue.
CREATE POLICY "anon_read_notices" ON public.notices
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_read_batches" ON public.batches
  FOR SELECT TO anon, authenticated USING (true);

-- Table-level privileges. RLS alone is not enough: PostgREST connects as the
-- anon role, which Supabase grants broadly by default, so the GRANTs must be
-- withdrawn too.
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON public.notices TO anon, authenticated;
GRANT SELECT ON public.batches TO anon, authenticated;

GRANT ALL ON ALL TABLES     IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES  IN SCHEMA public TO service_role;
GRANT ALL ON ALL ROUTINES   IN SCHEMA public TO service_role;

-- Money-moving routines are server-only. They were previously granted to anon,
-- so anyone holding the public key could call approve_payment_request directly
-- and credit an arbitrary amount to any student.
DO $do$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.apply_monthly_fee(text, text, numeric, text)',
    'public.approve_payment_request(text, text, boolean)',
    'public.generate_next_student_id(text)',
    'public.claim_ledger_email(uuid, integer)',
    'public.settle_ledger_email(uuid, boolean, text, text)',
    'public.reserve_email_quota(text, text[], text, integer, text[])',
    'public.settle_email_dispatch(bigint[], text, text, text)',
    'public.email_quota_status(integer)',
    'public.prune_email_dispatch_log(integer)'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $do$;

-- Future objects default to server-only as well.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

-- ============================================================================
-- 14. REALTIME PUBLICATION
-- ============================================================================
-- Realtime respects RLS, so with the policies above an anonymous subscriber
-- receives events only for notices and batches.
DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['students','notices','fee_receipts','student_requests','batches','audit_logs','fee_billing_ledger']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
EXCEPTION WHEN undefined_object THEN
  RAISE NOTICE 'Publication supabase_realtime not present; skipping realtime registration.';
END $do$;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- Expect: only service_role policies, plus anon_read_notices / anon_read_batches.
SELECT tablename, policyname, roles, cmd
  FROM pg_policies WHERE schemaname = 'public'
 ORDER BY tablename, policyname;

-- Expect: exactly one apply_monthly_fee and one approve_payment_request.
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.prosecdef AS security_definer
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('apply_monthly_fee','approve_payment_request','generate_next_student_id',
                     'reserve_email_quota','email_quota_status')
 ORDER BY p.proname;

-- Expect: 12 Active batches with the published fee tiers.
SELECT batch_id, monthly_fee, annual_fee, class_code, billing_day
  FROM public.batches WHERE status = 'Active' ORDER BY billing_day, batch_id;

-- Expect: zero rows -- every ledger entry carries a canonical BILL- key.
SELECT count(*) AS ledger_rows_missing_canonical_key
  FROM public.fee_billing_ledger
 WHERE idempotency_key <> 'BILL-' || upper(btrim(student_id)) || '-' || billing_month;


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 14: BLOG & ACADEMIC INSIGHTS HUB  (public.blog_posts)
-- ----------------------------------------------------------------------------
-- Public readers get published rows only; every write path is admin-only and
-- flows through the /api/db gateway (service_role). The anon SELECT policy is
-- the single public surface, mirroring notices/batches but with a predicate.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.blog_posts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              text UNIQUE NOT NULL,
  title             text NOT NULL,
  excerpt           text NOT NULL,
  content_markdown  text NOT NULL,
  cover_image_url   text,
  category          text NOT NULL DEFAULT 'Study Tips'
                    CHECK (category IN ('Board Exams','English Speaking','Study Tips','Institute News')),
  tags              text[] NOT NULL DEFAULT ARRAY[]::text[],
  author_name       text NOT NULL DEFAULT 'Chandan Kumar',
  author_role       text NOT NULL DEFAULT 'Science Lead & Head Admin',
  is_published      boolean NOT NULL DEFAULT false,
  read_time_minutes integer NOT NULL DEFAULT 3,
  views_count       integer NOT NULL DEFAULT 0,
  published_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT blog_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT blog_read_time_sane CHECK (read_time_minutes BETWEEN 1 AND 120)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_blog_posts_slug
  ON public.blog_posts (slug);
CREATE UNIQUE INDEX IF NOT EXISTS uq_blog_posts_id
  ON public.blog_posts (id);
CREATE INDEX IF NOT EXISTS idx_blog_published_feed
  ON public.blog_posts (published_at DESC) WHERE is_published;
CREATE INDEX IF NOT EXISTS idx_blog_category
  ON public.blog_posts (category) WHERE is_published;

ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS views_count integer NOT NULL DEFAULT 0;

DROP TRIGGER IF EXISTS trg_blog_posts_updated_at ON public.blog_posts;
CREATE TRIGGER trg_blog_posts_updated_at
  BEFORE UPDATE ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS: join the standard loop machinery (drop-then-recreate keeps re-runs idempotent)
DO $do$
DECLARE p record;
BEGIN
  FOR p IN SELECT schemaname, tablename, policyname FROM pg_policies
           WHERE schemaname='public' AND tablename='blog_posts'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
  END LOOP;
END $do$;

ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_posts FORCE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_blog_posts" ON public.blog_posts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Public surface: published rows only, read-only.
CREATE POLICY "anon_read_published_blog_posts" ON public.blog_posts
  FOR SELECT TO anon, authenticated USING (is_published = true);

-- Admin sessions (portal JWTs authorize via the gateway; this authenticated
-- grant is the documented admin capability should Supabase auth ever front it).
CREATE POLICY "authenticated_admin_blog_posts" ON public.blog_posts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

REVOKE ALL ON public.blog_posts FROM anon, authenticated;
GRANT SELECT ON public.blog_posts TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blog_posts TO authenticated;

-- Atomic public view counter. Callable ONLY through the gateway's allowlisted
-- rpc passthrough; direct PostgREST rpc stays revoked from anon/authenticated.
CREATE OR REPLACE FUNCTION public.increment_blog_views(p_slug text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE v_views integer;
BEGIN
  UPDATE public.blog_posts
     SET views_count = COALESCE(views_count, 0) + 1,
         updated_at = now()
   WHERE lower(btrim(slug)) = lower(btrim(p_slug))
      OR id::text = btrim(p_slug)
  RETURNING views_count INTO v_views;
  RETURN COALESCE(v_views, 0);
END;
$fn$;

REVOKE ALL ON FUNCTION public.increment_blog_views(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_blog_views(text) TO service_role, anon, authenticated;

-- Canonical Preloaded Articles (Editable & Deletable by Admin)
INSERT INTO public.blog_posts (id, slug, title, excerpt, content_markdown, category, tags, author_name, author_role, is_published, read_time_minutes, views_count, published_at)
VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    'class-10-cbse-bseb-board-exam-strategy-2026',
    'Top 5 Strategies to Score 95%+ in Class 10th Board Exams (CBSE & BSEB)',
    'A step-by-step revision routine by Chandan Sir covering NCERT mastery, time management in 3-hour papers, and daily self-assessment.',
    E'### The Golden Formula for Board Exam Success\n\nEvery year, students ask: *"How many hours should I study to get 95%+ in Class 10th?"*\nThe truth is that **strategy beats sheer hours**. Here is the exact roadmap we follow at Pragyan Institute.\n\n---\n\n#### 1. Master NCERT Exemplar & Concept Clarity\n- **Science**: Focus heavily on Chemical Reactions, Electricity numericals, and Life Processes diagrams.\n- **Maths**: Solve every single NCERT exercise problem twice before touching reference books.\n\n:::tip\nAlways practice with a real stopwatch. Completing the paper 15 minutes before time gives you crucial revision margin.\n:::\n\n#### 2. Weekly Timed Mock Tests\nTake full 80-mark mock tests every Sunday. Analyze your silly mistakes in a separate **Error Notebook**.\n\n> "Mistakes made in practice are lessons; mistakes made in final exams are lost marks."\n\n#### 3. Answer Presentation Matters\n- Write in clean bullet points.\n- Highlight final numerical answers with neat boxes.\n- Draw diagrams with sharp pencils and clear labels.',
    'Board Exams',
    ARRAY['class-10', 'board-exams', 'revision-strategy', 'toppers-guide'],
    'Chandan Kumar',
    'Science Lead & Head Admin',
    true,
    4,
    0,
    '2026-08-20 10:00:00+05:30'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'spoken-english-confidence-guide-for-school-students',
    'How to Speak English Fluently Without Fear: A Guide for Hindi Medium Students',
    'Overcoming hesitations in group discussions, building daily 10-minute vocabulary habits, and practical conversational drills.',
    E'### Overcoming the Hesitation Barrier\n\nMost students understand written English well, but when asked to speak in front of a class, fear of grammatical mistakes takes over.\n\n---\n\n#### 3 Simple Daily Habits for Fluency:\n1. **The 2-Minute Mirror Drill**: Pick any topic (e.g. *"My favorite science topic"*) and speak continuously for 2 minutes without stopping.\n2. **Think in English**: Instead of translating Hindi sentences in your mind, practice naming objects and thoughts directly in simple English.\n3. **Weekly Group Discussions**: Participate actively in Pragyan\'s free Saturday GD sessions.\n\n:::info\nFluency is not about using complex words — it is about expressing your ideas clearly and confidently.\n:::',
    'English Speaking',
    ARRAY['spoken-english', 'personality-development', 'communication-skills'],
    'Aditi Singh',
    'Language Mentor',
    true,
    3,
    0,
    '2026-08-21 12:00:00+05:30'
  ),
  (
    '00000000-0000-0000-0000-000000000003',
    'class-12-pcm-higher-mathematics-calculus-blueprint',
    'Class 12th PCM: How to Master Calculus & Differential Equations',
    'Prof. Ravi Ranjan explains the highest weightage calculus topics, standard integration patterns, and shortcut methods for competitive exams.',
    E'### Calculus Accounts for 35%+ of Higher Mathematics\n\nIn Class 12th board exams, Calculus carries the highest single weightage. If you master differentiation and integration fundamentals, scoring 90+ in Maths becomes guaranteed.\n\n---\n\n#### Focus Areas for 12th Board Exams:\n- **Definite Integrals**: Properties of definite integrals are guaranteed 5-mark questions.\n- **Differential Equations**: Linear differential equations with integrating factors.\n- **Application of Derivatives**: Maxima & Minima word problems.\n\n:::tip\nDraw rough sketches for Area Under Curves problems — it prevents coordinate sign errors!\n:::',
    'Board Exams',
    ARRAY['class-12', 'mathematics', 'calculus', 'integration'],
    'Prof. Ravi Ranjan',
    'Higher Mathematics Specialist',
    true,
    5,
    0,
    '2026-08-22 14:30:00+05:30'
  )
ON CONFLICT (slug) DO UPDATE SET
  views_count = GREATEST(blog_posts.views_count, EXCLUDED.views_count),
  updated_at = now();

-- Verification:
SELECT count(*) AS blog_posts_ready FROM pg_tables
 WHERE schemaname='public' AND tablename='blog_posts';


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 15: INTERACTIVE MENTOR RATINGS & REVIEWS (public.mentor_ratings)
-- ----------------------------------------------------------------------------
-- Students and public visitors submit 1-5 star ratings for faculty mentors.
-- Ratings are deduplicated per client_id and aggregated atomically in SQL.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.mentor_ratings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_id   text NOT NULL CHECK (mentor_id IN ('chandan-kumar', 'ravi-ranjan', 'aditi-singh')),
  rating      integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  client_id   text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_mentor_client UNIQUE (mentor_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_mentor_ratings_mentor
  ON public.mentor_ratings (mentor_id);

ALTER TABLE public.mentor_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentor_ratings FORCE ROW LEVEL SECURITY;

DO $do$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
           WHERE schemaname='public' AND tablename='mentor_ratings'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.mentor_ratings', p.policyname);
  END LOOP;
END $do$;

CREATE POLICY "service_role_full_mentor_ratings" ON public.mentor_ratings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON public.mentor_ratings FROM PUBLIC, anon, authenticated;

-- Atomic submission RPC (Upserts client rating and returns new aggregated average)
CREATE OR REPLACE FUNCTION public.submit_mentor_rating(
  p_mentor_id text,
  p_rating integer,
  p_client_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_mentor text := btrim(p_mentor_id);
  v_client text := btrim(p_client_id);
  v_score integer := p_rating;
  v_avg numeric(3,1);
  v_count integer;
BEGIN
  IF v_mentor NOT IN ('chandan-kumar', 'ravi-ranjan', 'aditi-singh') THEN
    RAISE EXCEPTION 'Invalid mentor identifier: %', v_mentor;
  END IF;
  IF v_score < 1 OR v_score > 5 THEN
    RAISE EXCEPTION 'Rating must be between 1 and 5 (got %)', v_score;
  END IF;
  IF length(v_client) < 4 THEN
    v_client := 'anon-' || substr(md5(random()::text), 1, 12);
  END IF;

  INSERT INTO public.mentor_ratings (mentor_id, rating, client_id, updated_at)
  VALUES (v_mentor, v_score, v_client, now())
  ON CONFLICT (mentor_id, client_id)
  DO UPDATE SET rating = EXCLUDED.rating, updated_at = now();

  -- Calculate real live average and total review count
  SELECT
    COALESCE(ROUND(AVG(rating)::numeric, 1), 0.0),
    COUNT(*)::integer
    INTO v_avg, v_count
    FROM public.mentor_ratings
   WHERE mentor_id = v_mentor;

  RETURN jsonb_build_object(
    'mentor_id', v_mentor,
    'average_rating', COALESCE(v_avg, 0.0),
    'total_ratings', COALESCE(v_count, 0)
  );
END;
$fn$;

-- Query aggregated ratings for all mentors
CREATE OR REPLACE FUNCTION public.get_mentor_ratings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_res jsonb;
BEGIN
  WITH mentors AS (
    SELECT 'chandan-kumar' AS mentor_id
    UNION ALL
    SELECT 'ravi-ranjan'   AS mentor_id
    UNION ALL
    SELECT 'aditi-singh'   AS mentor_id
  ),
  aggregated AS (
    SELECT
      m.mentor_id,
      COALESCE(ROUND(AVG(r.rating)::numeric, 1), 0.0) AS average_rating,
      COUNT(r.id)::integer AS total_ratings
      FROM mentors m
      LEFT JOIN public.mentor_ratings r ON r.mentor_id = m.mentor_id
     GROUP BY m.mentor_id
  )
  SELECT jsonb_object_agg(
    mentor_id,
    jsonb_build_object('average_rating', average_rating, 'total_ratings', total_ratings)
  ) INTO v_res FROM aggregated;

  RETURN COALESCE(v_res, '{}'::jsonb);
END;
$fn$;

REVOKE ALL ON FUNCTION public.submit_mentor_rating(text, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_mentor_rating(text, integer, text) TO service_role;

REVOKE ALL ON FUNCTION public.get_mentor_ratings() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_mentor_ratings() TO service_role;

-- Verification:
SELECT count(*) AS mentor_ratings_ready FROM pg_tables
 WHERE schemaname='public' AND tablename='mentor_ratings';

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 15: WEB PUSH SUBSCRIPTIONS & BROADCAST JOURNAL
-- ----------------------------------------------------------------------------
-- push_subscriptions : device endpoints. Students manage ONLY their own rows;
--                      anonymous visitors register into a NULL-student pool.
-- push_broadcast_logs: dispatch journal, admin-read-only via the gateway;
--                      writes happen exclusively through /api/send-push.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint      text UNIQUE NOT NULL,
  p256dh_key    text NOT NULL,
  auth_key      text NOT NULL,
  student_id    text,
  anon_id       text,
  batch_id      text,
  device_os     text,
  browser       text,
  user_agent    text,
  expires_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_endpoint_https CHECK (endpoint LIKE 'https://%')
);

ALTER TABLE public.push_subscriptions DROP CONSTRAINT IF EXISTS push_subscriptions_student_id_fkey;
CREATE INDEX IF NOT EXISTS idx_push_sub_student ON public.push_subscriptions(student_id);
CREATE INDEX IF NOT EXISTS idx_push_sub_batch   ON public.push_subscriptions(batch_id);

CREATE TABLE IF NOT EXISTS public.push_broadcast_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text NOT NULL,
  body            text NOT NULL,
  target_type     text NOT NULL CHECK (target_type IN ('ALL','BATCHES','STUDENT','DUES')),
  target_filter   jsonb NOT NULL DEFAULT '{}'::jsonb,
  audience_size   integer NOT NULL DEFAULT 0,
  sent_count      integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  failed_count    integer NOT NULL DEFAULT 0,
  pruned_count    integer NOT NULL DEFAULT 0,
  dispatched_by   text NOT NULL DEFAULT 'CHANDAN KUMAR',
  source          text NOT NULL DEFAULT 'admin',
  payload_meta    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_logs_recent ON public.push_broadcast_logs(created_at DESC);

DROP TRIGGER IF EXISTS trg_push_sub_updated_at ON public.push_subscriptions;
CREATE TRIGGER trg_push_sub_updated_at
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DO $do$
DECLARE p record;
BEGIN
  FOR p IN SELECT schemaname, tablename, policyname FROM pg_policies
           WHERE schemaname='public' AND tablename IN ('push_subscriptions','push_broadcast_logs')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
  END LOOP;
END $do$;

ALTER TABLE public.push_subscriptions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions  FORCE ROW LEVEL SECURITY;
ALTER TABLE public.push_broadcast_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_broadcast_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_push_subs"  ON public.push_subscriptions  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_push_logs"  ON public.push_broadcast_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_push_subs"      ON public.push_subscriptions  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_insert_push_subs"        ON public.push_subscriptions  FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_push_subs"        ON public.push_subscriptions  FOR UPDATE TO anon USING (true) WITH CHECK (true);

REVOKE ALL ON public.push_subscriptions  FROM anon, authenticated;
REVOKE ALL ON public.push_broadcast_logs FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.push_subscriptions TO anon;
GRANT SELECT ON public.push_broadcast_logs TO authenticated;

-- Verification:
SELECT tablename FROM pg_tables WHERE schemaname='public'
  AND tablename IN ('push_subscriptions','push_broadcast_logs');


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 17: ADMIN ACTIVE DEVICE SESSIONS (public.admin_sessions)
-- ----------------------------------------------------------------------------
-- Maintains active device login roster for administrator profiles with IP,
-- browser, OS, and timestamp metadata. Supports single-device and multi-device revocation.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.admin_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      text UNIQUE NOT NULL,
  admin_id        text NOT NULL,
  device_name     text NOT NULL DEFAULT 'Unknown Device',
  device_type     text NOT NULL DEFAULT 'desktop',
  browser         text NOT NULL DEFAULT 'Web Browser',
  os              text NOT NULL DEFAULT 'Unknown OS',
  ip_address      text,
  user_agent      text,
  is_revoked      boolean NOT NULL DEFAULT false,
  last_active_at  timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin_active ON public.admin_sessions(admin_id, last_active_at DESC) WHERE NOT is_revoked;
CREATE INDEX IF NOT EXISTS idx_admin_sessions_sid ON public.admin_sessions(session_id);

ALTER TABLE public.admin_sessions ADD COLUMN IF NOT EXISTS device_name text NOT NULL DEFAULT 'Unknown Device';
ALTER TABLE public.admin_sessions ADD COLUMN IF NOT EXISTS device_type text NOT NULL DEFAULT 'desktop';
ALTER TABLE public.admin_sessions ADD COLUMN IF NOT EXISTS browser text NOT NULL DEFAULT 'Web Browser';
ALTER TABLE public.admin_sessions ADD COLUMN IF NOT EXISTS os text NOT NULL DEFAULT 'Unknown OS';
ALTER TABLE public.admin_sessions ADD COLUMN IF NOT EXISTS ip_address text;
ALTER TABLE public.admin_sessions ADD COLUMN IF NOT EXISTS user_agent text;
ALTER TABLE public.admin_sessions ADD COLUMN IF NOT EXISTS is_revoked boolean NOT NULL DEFAULT false;
ALTER TABLE public.admin_sessions ADD COLUMN IF NOT EXISTS last_active_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_admin_sessions_updated_at ON public.admin_sessions;
CREATE TRIGGER trg_admin_sessions_updated_at
  BEFORE UPDATE ON public.admin_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DO $do$
DECLARE p record;
BEGIN
  FOR p IN SELECT schemaname, tablename, policyname FROM pg_policies
           WHERE schemaname='public' AND tablename='admin_sessions'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
  END LOOP;
END $do$;

ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_admin_sessions" ON public.admin_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON public.admin_sessions FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_sessions TO authenticated;

-- Final Hardening Verification:
SELECT tablename FROM pg_tables WHERE schemaname='public'
  AND tablename IN ('push_subscriptions','push_broadcast_logs','admin_sessions','class_schedules','institute_holidays');


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 18: DYNAMIC CLASS TIMETABLES & INSTITUTE HOLIDAYS
-- ----------------------------------------------------------------------------
-- Manages day-wise class schedules for all batches with whole-week repetition,
-- day-off/class cancellation toggles, teacher assignments, and institute holidays.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.class_schedules (
  id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  batch_id      text NOT NULL,
  day_of_week   text NOT NULL,
  subject       text NOT NULL,
  start_time    text NOT NULL,
  end_time      text NOT NULL,
  teacher       text DEFAULT '',
  room          text DEFAULT 'Classroom 1',
  is_cancelled  boolean NOT NULL DEFAULT false,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.institute_holidays (
  id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title         text NOT NULL,
  start_date    date NOT NULL,
  end_date      date NOT NULL,
  target_batch  text NOT NULL DEFAULT 'ALL',
  description   text DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_class_schedules_batch_day ON public.class_schedules(batch_id, day_of_week, sort_order);
CREATE INDEX IF NOT EXISTS idx_institute_holidays_dates ON public.institute_holidays(start_date, end_date);

-- Ensure primary key columns are text for cross-platform string and uuid ID compatibility
ALTER TABLE public.class_schedules ALTER COLUMN id TYPE text;
ALTER TABLE public.institute_holidays ALTER COLUMN id TYPE text;

ALTER TABLE public.class_schedules ADD COLUMN IF NOT EXISTS batch_id text;
ALTER TABLE public.class_schedules ADD COLUMN IF NOT EXISTS day_of_week text;
ALTER TABLE public.class_schedules ADD COLUMN IF NOT EXISTS subject text;
ALTER TABLE public.class_schedules ADD COLUMN IF NOT EXISTS start_time text;
ALTER TABLE public.class_schedules ADD COLUMN IF NOT EXISTS end_time text;
ALTER TABLE public.class_schedules ADD COLUMN IF NOT EXISTS teacher text DEFAULT '';
ALTER TABLE public.class_schedules ADD COLUMN IF NOT EXISTS room text DEFAULT 'Classroom 1';
ALTER TABLE public.class_schedules ADD COLUMN IF NOT EXISTS is_cancelled boolean NOT NULL DEFAULT false;
ALTER TABLE public.class_schedules ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

ALTER TABLE public.institute_holidays ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.institute_holidays ADD COLUMN IF NOT EXISTS start_date date;
ALTER TABLE public.institute_holidays ADD COLUMN IF NOT EXISTS end_date date;
ALTER TABLE public.institute_holidays ADD COLUMN IF NOT EXISTS target_batch text DEFAULT 'ALL';
ALTER TABLE public.institute_holidays ADD COLUMN IF NOT EXISTS description text DEFAULT '';

DROP TRIGGER IF EXISTS trg_class_schedules_updated_at ON public.class_schedules;
CREATE TRIGGER trg_class_schedules_updated_at
  BEFORE UPDATE ON public.class_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_institute_holidays_updated_at ON public.institute_holidays;
CREATE TRIGGER trg_institute_holidays_updated_at
  BEFORE UPDATE ON public.institute_holidays
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DO $do$
DECLARE p record;
BEGIN
  FOR p IN SELECT schemaname, tablename, policyname FROM pg_policies
           WHERE schemaname='public' AND tablename IN ('class_schedules', 'institute_holidays')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
  END LOOP;
END $do$;

ALTER TABLE public.class_schedules  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_schedules  FORCE ROW LEVEL SECURITY;
ALTER TABLE public.institute_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institute_holidays FORCE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_schedules" ON public.class_schedules FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_holidays"  ON public.institute_holidays FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON public.class_schedules  FROM anon, authenticated;
REVOKE ALL ON public.institute_holidays FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_schedules  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.institute_holidays TO authenticated;

-- ============================================================================
-- SECTION 21: SUPABASE STORAGE BUCKETS & POLICIES (pragyan-media)
-- ----------------------------------------------------------------------------
-- Creates and hardens the public media storage bucket 'pragyan-media' used for:
-- - blog_covers/ and blog_photos/ (Article covers and in-post photography)
-- - profile_pictures/ (Student ID card photos)
-- - admin_avatars/ (Faculty profile portraits)
-- - notice_attachments/ (PDF & image notices)
-- - payment_proofs/ (Student payment verification slips)
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pragyan-media',
  'pragyan-media',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

-- Clean and recreate storage policies for pragyan-media
DO $do$
BEGIN
  DROP POLICY IF EXISTS "Public Access pragyan-media" ON storage.objects;
  DROP POLICY IF EXISTS "Service Role Access pragyan-media" ON storage.objects;
  DROP POLICY IF EXISTS "Authenticated Upload pragyan-media" ON storage.objects;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $do$;

CREATE POLICY "Public Access pragyan-media"
ON storage.objects FOR SELECT
USING (bucket_id = 'pragyan-media');

CREATE POLICY "Service Role Access pragyan-media"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'pragyan-media')
WITH CHECK (bucket_id = 'pragyan-media');

CREATE POLICY "Authenticated Upload pragyan-media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'pragyan-media');
