// GET /api/email-quota
//
// Live view of today's Resend consumption for the admin dashboard: how many of
// the day's 100 messages are gone and what used them. Without this the admin has
// no way to know whether triggering a manual billing run will fit, and the first
// sign of trouble is parents reporting they never got a statement.
//
// X in the spec is "billing statement emails sent today + computerized receipts
// sent today", and remaining is max(0, 100 - X). Both come straight from
// email_quota_status(), which counts pending, sent and unknown — pending because
// a send is in flight and its slot is already committed, unknown because a timed
// out request may have been delivered.

import { applyCors, requireSession, isSupabaseConfigured } from './_lib/auth.js';
import { getQuotaStatus, DAILY_EMAIL_LIMIT, EMAIL_CATEGORIES } from './_lib/email-quota.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Admin only. The count reveals institute-wide activity volume, and a student
  // session has no use for it.
  const session = requireSession(req, res, ['admin']);
  if (!session) return;

  if (!isSupabaseConfigured()) {
    return res.status(503).json({ success: false, error: 'Database is not configured' });
  }

  try {
    const status = await getQuotaStatus(DAILY_EMAIL_LIMIT);
    const breakdown = status?.breakdown || {};

    // X from the spec: statements plus receipts. Reported separately from `used`
    // (which counts every category) so the dashboard can show both the spec
    // figure and the true remaining headroom without recomputing either.
    const billingAndReceipts =
      (breakdown[EMAIL_CATEGORIES.BILLING] || 0) +
      (breakdown[EMAIL_CATEGORIES.RECEIPT] || 0);

    return res.status(200).json({
      success: true,
      day: status?.day ?? null,
      limit: status?.limit ?? DAILY_EMAIL_LIMIT,
      used: status?.used ?? 0,
      remaining: status?.remaining ?? 0,
      billingAndReceiptsToday: billingAndReceipts,
      breakdown
    });
  } catch (error) {
    console.error('Email quota lookup failed:', error?.message || error);
    // 503, not 200-with-zeros. A dashboard showing "100 remaining" because the
    // lookup failed would invite an admin to fire a batch that then gets
    // rejected mid-run.
    return res.status(503).json({ success: false, error: 'Email quota is temporarily unavailable' });
  }
}
