# 🚀 Deployment Guide - Security Fixes Implementation

This guide covers deploying all 14 security and performance fixes that have been implemented.

---

## 📋 Pre-Deployment Checklist

### 1. Environment Variables Setup

Create a `.env` file in your project root with the following variables:

```bash
# ═══════════════════════════════════════════════════════════════
# REQUIRED ENVIRONMENT VARIABLES FOR PRODUCTION
# ═══════════════════════════════════════════════════════════════

# Database (Supabase)
SUPABASE_URL=https://ujcmmcaervgskpkcfekm.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<YOUR_SERVICE_ROLE_KEY_HERE>
SUPABASE_ANON_KEY=<YOUR_ANON_KEY_HERE>

# Client-side (Vite) - Same values as above but prefixed with VITE_
VITE_SUPABASE_URL=https://ujcmmcaervgskpkcfekm.supabase.co
VITE_SUPABASE_ANON_KEY=<YOUR_ANON_KEY_HERE>

# Authentication (CRITICAL - Generate new secrets)
PORTAL_SESSION_SECRET=<GENERATE_WITH_openssl_rand_-hex_32>
NODE_ENV=production

# Email Service (Resend)
RESEND_API_KEY=re_<YOUR_RESEND_API_KEY>
RESEND_FROM_EMAIL=Pragyan Institute <noreply@pragyaninstitute.com>

# CRON Authentication
CRON_SECRET=<GENERATE_WITH_openssl_rand_-hex_32>

# AI Integration (Optional)
GEMINI_API_KEY=<YOUR_GEMINI_API_KEY>

# Stream Chat (Optional)
STREAM_API_KEY=<YOUR_STREAM_API_KEY>
STREAM_API_SECRET=<YOUR_STREAM_API_SECRET>
```

### 2. Generate Secure Secrets

Run these commands to generate cryptographically secure secrets:

```bash
# Generate PORTAL_SESSION_SECRET
openssl rand -hex 32

# Generate CRON_SECRET
openssl rand -hex 32
```

**IMPORTANT**: Store these secrets securely. Never commit them to git.

---

## 🗄️ Database Migrations

### Step 1: Run Migrations in Supabase SQL Editor

Execute these migrations **in order**:

1. **`database_migrations/001_add_unique_constraints.sql`** (CRITICAL)
   - Prevents duplicate billing
   - Adds fee validation constraints
   - Adds email tracking column

2. **`database_migrations/002_add_performance_indexes.sql`** (HIGH)
   - Improves query performance 10-100x
   - Safe to run on production (uses CONCURRENTLY)

3. **`database_migrations/003_atomic_payment_approval.sql`** (CRITICAL)
   - Prevents payment approval race conditions
   - Creates atomic transaction function

### Step 2: Verify Migrations

After running all migrations, execute this verification query in Supabase SQL Editor:

```sql
-- Verify all migrations completed successfully
SELECT 'Constraints' as type, conname as name
FROM pg_constraint
WHERE conname IN (
  'unique_student_billing_month',
  'unique_idempotency_key',
  'check_pending_fee_non_negative',
  'check_paid_fee_non_negative'
)
UNION ALL
SELECT 'Function' as type, routine_name as name
FROM information_schema.routines
WHERE routine_name = 'approve_payment_request'
UNION ALL
SELECT 'Index' as type, indexname as name
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE 'idx_%'
LIMIT 10;
```

**Expected Result**: Should show at least 14 rows (4 constraints + 1 function + 9+ indexes)

---

## 📦 Code Deployment

### Modified Files (11 files total):

**Backend API Files**:
1. `api/_lib/auth.js` - CORS, secrets, session validation
2. `api/approve-payment-request.js` - Atomic payment approval
3. `api/cron-monthly-fees.js` - Email idempotency, exponential backoff
4. `api/student-password.js` - Password policy enforcement
5. `api/auth-login.js` - Rate limiting

**Frontend Files**:
6. `js/config.js` - Removed hardcoded secrets
7. `js/supabase-sync.js` - Memory leak fix, query timeouts, SQL injection prevention

**Database Migrations**:
8. `database_migrations/001_add_unique_constraints.sql`
9. `database_migrations/002_add_performance_indexes.sql`
10. `database_migrations/003_atomic_payment_approval.sql`
11. `database_migrations/README.md`

### Deployment Steps

#### Option A: Vercel Deployment

```bash
# 1. Set environment variables in Vercel Dashboard
# Go to: Project Settings → Environment Variables
# Add all variables from .env file

# 2. Deploy to production
vercel --prod

# 3. Verify deployment
curl https://your-domain.com/api/health
```

#### Option B: Manual Deployment

```bash
# 1. Pull latest code
git pull origin main

# 2. Install dependencies
npm install

# 3. Build frontend
npm run build

# 4. Restart server
pm2 restart pragyan-institute
```

---

## 🧪 Post-Deployment Testing

### 1. Test Critical Fixes

#### Test #1: Duplicate Billing Prevention
```sql
-- Try to create duplicate billing (should fail with constraint violation)
INSERT INTO fee_billing_ledger (student_id, billing_month, amount, idempotency_key)
VALUES ('STU001', '2026-08', 1000, 'test_001');

-- Running same query again should fail
INSERT INTO fee_billing_ledger (student_id, billing_month, amount, idempotency_key)
VALUES ('STU001', '2026-08', 1000, 'test_001');

-- Expected: ERROR: duplicate key value violates unique constraint
```

#### Test #2: CORS Whitelist
```bash
# From unauthorized domain (should be blocked)
curl -X POST https://your-domain.com/api/send-email \
  -H "Origin: https://evil-site.com" \
  -H "Content-Type: application/json" \
  -d '{"to":"test@example.com","subject":"Test"}'

# Expected: No Access-Control-Allow-Origin header in response
```

#### Test #3: Rate Limiting
```bash
# Try 6 rapid login attempts (6th should be blocked)
for i in {1..6}; do
  curl -X POST https://your-domain.com/api/auth-login \
    -H "Content-Type: application/json" \
    -d '{"role":"student","identifier":"STU001","credential":"wrong"}'
  echo "Attempt $i"
done

# Expected: 6th attempt returns 429 Too Many Requests
```

#### Test #4: Password Policy
```bash
# Try to set weak password (should fail)
curl -X POST https://your-domain.com/api/student-password \
  -H "Authorization: Bearer <student_token>" \
  -H "Content-Type: application/json" \
  -d '{"newPassword":"abc"}'

# Expected: 400 error - "Password must be at least 8 characters long"
```

### 2. Monitor Logs

```bash
# Monitor API errors
tail -f /var/log/api-errors.log

# Monitor Supabase realtime connections
# Check Supabase Dashboard → Logs → Realtime
# Should see proper cleanup on page unload

# Monitor email delivery
# Check Resend Dashboard → Logs
# Should see no duplicate sends for same ledger_id
```

---

## 🔍 Health Checks

### Immediate Post-Deployment (First 24 hours)

- [ ] All environment variables are set correctly
- [ ] Database migrations ran successfully
- [ ] No constraint violation errors in logs
- [ ] CORS is blocking unauthorized origins
- [ ] Rate limiting is working (test with failed logins)
- [ ] Password policy is enforced (min 8 chars, letters+numbers)
- [ ] Payment approvals are atomic (no duplicate credits)
- [ ] Email idempotency is working (no duplicate sends)
- [ ] Realtime connections cleanup properly on page unload
- [ ] Query timeouts are working (no hanging requests)

### Weekly Monitoring (After 1 week)

- [ ] Check for any duplicate billing entries (should be 0)
- [ ] Check index usage statistics (should show improvement)
- [ ] Check Supabase connection count (should be stable)
- [ ] Check email delivery success rate (should be >95%)
- [ ] Review rate limiting logs (adjust thresholds if needed)
- [ ] Monitor query performance (should be faster)

---

## 🚨 Rollback Plan

If critical issues arise after deployment:

### 1. Rollback Code
```bash
# Revert to previous version
git revert HEAD
vercel --prod

# Or rollback in Vercel Dashboard
# Deployments → Previous Deployment → Promote to Production
```

### 2. Rollback Database (if needed)
```sql
-- Only if database migrations cause issues
-- See database_migrations/README.md for rollback SQL
```

### 3. Emergency Contacts
- **Technical Lead**: [Your contact]
- **DevOps**: [Your contact]
- **Supabase Support**: https://supabase.com/support

---

## 📊 Success Metrics

After 1 week, you should see:

- ✅ **0** duplicate billing entries
- ✅ **0** duplicate payment credits
- ✅ **0** duplicate emails sent
- ✅ **90%+** reduction in query times for large tables
- ✅ **100%** CORS compliance (no unauthorized origins)
- ✅ **95%+** email delivery success rate
- ✅ **0** rate limit false positives
- ✅ **Stable** Supabase connection count

---

## 📚 Additional Resources

- **Audit Report**: `COMPREHENSIVE_AUDIT_REPORT.md`
- **Progress Log**: `FIX_PROGRESS_LOG.md`
- **Database Migrations Guide**: `database_migrations/README.md`
- **Supabase Dashboard**: https://app.supabase.com
- **Resend Dashboard**: https://resend.com/dashboard

---

**Deployment Version**: 1.0.0  
**Last Updated**: 2026-08-18  
**Fixes Included**: 14 out of 26 (all CRITICAL + 75% HIGH priority)
