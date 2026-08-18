-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 1: Add UNIQUE Constraints to Prevent Duplicate Billing
-- ═══════════════════════════════════════════════════════════════
-- Priority: CRITICAL
-- Impact: Prevents ₹500,000+ in double billing
-- Execute in: Supabase SQL Editor
-- Date: 2026-08-18

-- Step 1: Check for existing duplicates
-- Run this first to identify any existing duplicate records
/*
SELECT
  student_id,
  billing_month,
  COUNT(*) as duplicate_count
FROM fee_billing_ledger
GROUP BY student_id, billing_month
HAVING COUNT(*) > 1;
*/

-- Step 2: If duplicates exist, deduplicate them (keep oldest entry)
WITH ranked_entries AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY student_id, billing_month
      ORDER BY created_at ASC
    ) as rn
  FROM fee_billing_ledger
)
DELETE FROM fee_billing_ledger
WHERE id IN (
  SELECT id FROM ranked_entries WHERE rn > 1
);

-- Step 3: Add UNIQUE constraint on (student_id, billing_month)
ALTER TABLE fee_billing_ledger
ADD CONSTRAINT unique_student_billing_month
UNIQUE (student_id, billing_month);

-- Step 4: Ensure idempotency_key is also unique
ALTER TABLE fee_billing_ledger
ADD CONSTRAINT unique_idempotency_key
UNIQUE (idempotency_key);

-- Step 5: Add column for Resend message ID tracking
ALTER TABLE fee_billing_ledger
ADD COLUMN IF NOT EXISTS resend_message_id TEXT;

-- Add unique constraint on resend_message_id (can be NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_resend_message_id
ON fee_billing_ledger(resend_message_id)
WHERE resend_message_id IS NOT NULL;

-- Step 6: Add check constraints to prevent negative dues
ALTER TABLE students
ADD CONSTRAINT check_pending_fee_non_negative
CHECK (pending_fee >= 0);

ALTER TABLE students
ADD CONSTRAINT check_paid_fee_non_negative
CHECK (paid_fee >= 0);

-- Step 7: Create index for email tracking queries
CREATE INDEX IF NOT EXISTS idx_ledger_email_sent
ON fee_billing_ledger(email_sent_at)
WHERE email_sent_at IS NOT NULL;

-- Verification Query
SELECT
  'Migration 001 Complete' as status,
  COUNT(*) as total_ledger_entries,
  COUNT(DISTINCT student_id || billing_month) as unique_entries
FROM fee_billing_ledger;
