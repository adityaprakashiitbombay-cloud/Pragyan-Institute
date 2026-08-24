import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

export async function runFeeLedgerEmailTests(assert) {
  const sql = read('supabase_production_hardening.sql');
  const sendEmailJs = read('api/send-email.js');
  const dbJs = read('api/db.js');
  const cronJs = read('api/cron-monthly-fees.js');
  const adminBillingJs = read('api/admin-trigger-billing.js');
  const quotaJs = read('api/_lib/email-quota.js');
  const portalJs = read('js/portal.js');
  const syncJs = read('js/supabase-sync.js');

  // 1. Database Schema & Hardening: fee_billing_ledger
  assert(sql.includes('CREATE TABLE IF NOT EXISTS public.fee_billing_ledger'), 'T34.1: fee_billing_ledger table is defined in SQL hardening');
  assert(sql.includes('idempotency_key text') && sql.includes('billing_month text'), 'T34.2: fee_billing_ledger defines idempotency_key and billing_month');
  assert(sql.includes('email_sent_at timestamptz') && sql.includes('email_attempts integer'), 'T34.3: fee_billing_ledger tracks email_sent_at and email_attempts');
  assert(sql.includes('FUNCTION public.claim_ledger_email('), 'T34.4: claim_ledger_email RPC is defined for atomic invoice claiming');
  assert(sql.includes('FUNCTION public.settle_ledger_email('), 'T34.5: settle_ledger_email RPC is defined to update email status in fee_billing_ledger');
  assert(sql.includes('FUNCTION public.apply_monthly_fee('), 'T34.6: apply_monthly_fee RPC is defined for atomic billing');

  // 2. Database Schema & Hardening: email_dispatch_log & fee_email_log
  assert(sql.includes('CREATE TABLE IF NOT EXISTS public.email_dispatch_log'), 'T34.7: email_dispatch_log table is defined in SQL hardening');
  assert(sql.includes('VIEW public.fee_email_log'), 'T34.8: fee_email_log compatibility view aliases email_dispatch_log');
  assert(sql.includes('FUNCTION public.reserve_email_quota('), 'T34.9: reserve_email_quota RPC is defined in SQL hardening');
  assert(sql.includes('FUNCTION public.settle_email_dispatch('), 'T34.10: settle_email_dispatch RPC is defined in SQL hardening');
  assert(sql.includes('FUNCTION public.email_quota_status('), 'T34.11: email_quota_status RPC is defined in SQL hardening');

  // 3. API Dispatcher: api/send-email.js
  assert(sendEmailJs.includes('const toList = Array.isArray(to) ? to :'), 'T34.12: api/send-email.js supports to whether string or array');
  assert(sendEmailJs.includes('recipients: cleanTo'), 'T34.13: api/send-email.js passes recipients array to reserveQuota');
  assert(sendEmailJs.includes('await settleQuota(dispatchIds, finalStatus'), 'T34.14: api/send-email.js calls settleQuota with positional arguments');
  assert(sendEmailJs.includes('sendResult?.data?.id'), 'T34.15: api/send-email.js correctly reads messageId from sendResult.data.id');

  // 4. API Gateway: api/db.js
  assert(dbJs.includes('!PUBLIC_TABLES.has(table)'), 'T34.16: api/db.js exempts PUBLIC_TABLES from student_id scoping');
  assert(dbJs.includes("'fee_billing_ledger'"), 'T34.17: api/db.js allowlists fee_billing_ledger in TABLES and STUDENT_TABLES');

  // 5. Cron & Manual Billing Dispatch Engines
  assert(cronJs.includes("rpc('claim_ledger_email'"), 'T34.18: api/cron-monthly-fees.js claims ledger email before sending');
  assert(cronJs.includes("rpc('settle_ledger_email'"), 'T34.19: api/cron-monthly-fees.js settles ledger email status after sending');
  assert(adminBillingJs.includes("rpc('claim_ledger_email'"), 'T34.20: api/admin-trigger-billing.js claims ledger email before sending');
  assert(adminBillingJs.includes("rpc('settle_ledger_email'"), 'T34.21: api/admin-trigger-billing.js settles ledger email status after sending');

  // 6. Client Sync & Portal Integration
  assert(syncJs.includes('normalizeLedger('), 'T34.22: js/supabase-sync.js normalizes fee_billing_ledger rows');
  assert(portalJs.includes('sendLiveResendEmail('), 'T34.23: js/portal.js provides sendLiveResendEmail helper');
}
