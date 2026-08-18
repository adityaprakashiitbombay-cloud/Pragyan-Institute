-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 2: Add Performance Indexes
-- ═══════════════════════════════════════════════════════════════
-- Priority: HIGH
-- Impact: Improves query performance by 10-100x on large tables
-- Execute in: Supabase SQL Editor
-- Date: 2026-08-18

-- ═══════════════════════════════════════════════════════════════
-- STUDENTS TABLE INDEXES
-- ═══════════════════════════════════════════════════════════════

-- Primary lookup columns
CREATE INDEX IF NOT EXISTS idx_students_student_id
ON students(student_id);

CREATE INDEX IF NOT EXISTS idx_students_roll_no
ON students(roll_no);

CREATE INDEX IF NOT EXISTS idx_students_mobile
ON students(mobile);

CREATE INDEX IF NOT EXISTS idx_students_email
ON students(email);

-- Filtered index for active students
CREATE INDEX IF NOT EXISTS idx_students_status
ON students(status)
WHERE status IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════
-- FEE_RECEIPTS TABLE INDEXES
-- ═══════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_receipts_receipt_no
ON fee_receipts(receipt_no);

CREATE INDEX IF NOT EXISTS idx_receipts_student_id
ON fee_receipts(student_id);

CREATE INDEX IF NOT EXISTS idx_receipts_payment_date
ON fee_receipts(payment_date DESC);

CREATE INDEX IF NOT EXISTS idx_receipts_status
ON fee_receipts(status);

-- ═══════════════════════════════════════════════════════════════
-- FEE_BILLING_LEDGER TABLE INDEXES
-- ═══════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_ledger_student_id
ON fee_billing_ledger(student_id);

CREATE INDEX IF NOT EXISTS idx_ledger_billing_month
ON fee_billing_ledger(billing_month);

CREATE INDEX IF NOT EXISTS idx_ledger_created_at
ON fee_billing_ledger(created_at DESC);

-- Idempotency tracking
CREATE INDEX IF NOT EXISTS idx_ledger_idempotency
ON fee_billing_ledger(idempotency_key)
WHERE idempotency_key IS NOT NULL;

-- Composite index for monthly billing queries
CREATE INDEX IF NOT EXISTS idx_ledger_student_month
ON fee_billing_ledger(student_id, billing_month);

-- ═══════════════════════════════════════════════════════════════
-- STUDENT_REQUESTS TABLE INDEXES
-- ═══════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_requests_request_id
ON student_requests(request_id);

CREATE INDEX IF NOT EXISTS idx_requests_student_id
ON student_requests(student_id);

CREATE INDEX IF NOT EXISTS idx_requests_status
ON student_requests(status);

CREATE INDEX IF NOT EXISTS idx_requests_created_at
ON student_requests(created_at DESC);

-- Composite index for password update queries
CREATE INDEX IF NOT EXISTS idx_requests_pwd_update
ON student_requests(req_type, student_id, status)
WHERE req_type = 'PASSWORD_UPDATE';

-- Composite index for pending payment approvals
CREATE INDEX IF NOT EXISTS idx_requests_pending_payments
ON student_requests(req_type, status)
WHERE req_type = 'PAYMENT_APPROVAL' AND status = 'Pending';

-- ═══════════════════════════════════════════════════════════════
-- ADMINS TABLE INDEXES
-- ═══════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_admins_admin_id
ON admins(admin_id);

CREATE INDEX IF NOT EXISTS idx_admins_username
ON admins(username);

CREATE INDEX IF NOT EXISTS idx_admins_email
ON admins(email);

CREATE INDEX IF NOT EXISTS idx_admins_mobile
ON admins(mobile);

-- ═══════════════════════════════════════════════════════════════
-- AUDIT_LOGS TABLE INDEXES
-- ═══════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_audit_log_id
ON audit_logs(log_id);

CREATE INDEX IF NOT EXISTS idx_audit_timestamp
ON audit_logs(timestamp DESC);

-- ═══════════════════════════════════════════════════════════════
-- VERIFICATION QUERY
-- ═══════════════════════════════════════════════════════════════

SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'students',
    'fee_receipts',
    'fee_billing_ledger',
    'student_requests',
    'admins',
    'audit_logs'
  )
ORDER BY tablename, indexname;
