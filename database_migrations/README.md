# Database Migrations Guide

This directory contains SQL migration scripts to fix critical security and data integrity issues identified in the comprehensive audit.

## ⚠️ IMPORTANT: Run These Migrations Immediately

All migrations must be executed in **Supabase SQL Editor** in the following order:

## Migration Order

### 1. `001_add_unique_constraints.sql` - **CRITICAL**
**Priority**: IMMEDIATE (Fix within 24 hours)  
**Impact**: Prevents duplicate monthly billing (₹500,000+ risk)

**What it does**:
- Adds UNIQUE constraints on `(student_id, billing_month)` in `fee_billing_ledger`
- Adds UNIQUE constraint on `idempotency_key`
- Adds `resend_message_id` column for email tracking
- Adds CHECK constraints to prevent negative fee balances
- Deduplicates any existing duplicate entries

**Run this first!**

### 2. `002_add_performance_indexes.sql` - **HIGH**
**Priority**: Within 1 week  
**Impact**: Improves query performance by 10-100x on large tables

**What it does**:
- Creates indexes on all frequently queried columns
- Adds composite indexes for common query patterns
- Uses `CREATE INDEX CONCURRENTLY` to avoid table locks

**Safe to run on production** - will not block other operations.

### 3. `003_atomic_payment_approval.sql` - **CRITICAL**
**Priority**: IMMEDIATE (Fix within 24 hours)  
**Impact**: Prevents race condition in payment approvals (₹10,000+ double credits)

**What it does**:
- Creates PostgreSQL function `approve_payment_request()`
- Implements atomic transactions with row-level locking
- Prevents concurrent approvals of the same payment

**Backend code already updated** to use this function.

### 4. `004_apply_monthly_fee.sql` - **HIGH**
**Priority**: IMMEDIATE (Fix within 24 hours)  
**Impact**: Enforces atomic, idempotent monthly fee billing and prevents duplicate debit ledger corruption

**What it does**:
- Creates PostgreSQL function `apply_monthly_fee()`
- Atomically locks student rows, updates dues, and records idempotent ledger rows (`BILL-${studentId}-${monthKey}`)

**Backend code already updated** (`api/cron-monthly-fees.js` and `api/admin-trigger-billing.js`) to use this function.

---

## How to Run Migrations

### Step 1: Access Supabase SQL Editor
1. Go to https://app.supabase.com
2. Select your project: **Pragyan Institute Portal**
3. Navigate to **SQL Editor** in the left sidebar

### Step 2: Execute Each Migration
1. Open `001_add_unique_constraints.sql`
2. Copy the entire contents
3. Paste into Supabase SQL Editor
4. Click **Run** button
5. Verify success (should see "Migration 001 Complete")
6. Repeat for migrations 002 and 003

### Step 3: Verify Migrations
After running all migrations, execute this verification query:

```sql
-- Check that all constraints were created
SELECT
  conname as constraint_name,
  conrelid::regclass as table_name,
  pg_get_constraintdef(oid) as definition
FROM pg_constraint
WHERE conname IN (
  'unique_student_billing_month',
  'unique_idempotency_key',
  'check_pending_fee_non_negative',
  'check_paid_fee_non_negative'
);

-- Check that indexes were created
SELECT
  schemaname,
  tablename,
  indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

-- Check that the function was created
SELECT
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_name = 'approve_payment_request';
```

---

## Rollback Procedures

If you need to rollback a migration (only if critical issues arise):

### Rollback Migration 001:
```sql
ALTER TABLE fee_billing_ledger DROP CONSTRAINT IF EXISTS unique_student_billing_month;
ALTER TABLE fee_billing_ledger DROP CONSTRAINT IF EXISTS unique_idempotency_key;
ALTER TABLE fee_billing_ledger DROP COLUMN IF EXISTS resend_message_id;
ALTER TABLE students DROP CONSTRAINT IF EXISTS check_pending_fee_non_negative;
ALTER TABLE students DROP CONSTRAINT IF EXISTS check_paid_fee_non_negative;
```

### Rollback Migration 002:
```sql
-- Drop all created indexes (will not affect data)
DROP INDEX IF EXISTS idx_students_student_id;
DROP INDEX IF EXISTS idx_students_roll_no;
-- (continue for all indexes listed in the migration)
```

### Rollback Migration 003:
```sql
DROP FUNCTION IF EXISTS approve_payment_request(TEXT, TEXT);
```

---

## Post-Migration Checklist

- [ ] All 3 migrations executed successfully
- [ ] Verification queries return expected results
- [ ] No duplicate billing entries exist
- [ ] Application code deployed with updated logic
- [ ] Environment variables set (see main README)
- [ ] Monitor logs for any constraint violation errors
- [ ] Test payment approval in staging/dev first
- [ ] Test monthly billing in staging/dev first

---

## Monitoring After Migration

### Check for Constraint Violations:
```sql
-- This should return 0 rows (no duplicates)
SELECT
  student_id,
  billing_month,
  COUNT(*) as count
FROM fee_billing_ledger
GROUP BY student_id, billing_month
HAVING COUNT(*) > 1;
```

### Check Index Usage:
```sql
-- Run after 24 hours to see index usage stats
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan as index_scans,
  idx_tup_read as tuples_read
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;
```

---

## Support

If you encounter any issues during migration:
1. **DO NOT** continue to next migration
2. Check Supabase logs for error details
3. Take a database snapshot before retrying
4. Contact technical lead immediately for critical migrations

---

**Last Updated**: 2026-08-18  
**Migration Scripts Version**: 1.0.0
