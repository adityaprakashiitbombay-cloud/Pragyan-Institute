<<<<<<< HEAD
import { getSupabase, applyCors, requireSession } from './_lib/auth.js';
=======
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
>>>>>>> claude/admiring-kepler-50a04f

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

<<<<<<< HEAD
  const session = requireSession(req, res, ['admin']);
  if (!session) return;

  try {
    const supabase = getSupabase({ allowAnon: true });
    // IST-aligned day window (Asia/Kolkata midnight) to match the billing cron;
    // UTC-day counting mis-reported quota across the +05:30 offset.
    const istParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(new Date())
      .reduce((all, part) => ({ ...all, [part.type]: part.value }), {});
    const todayStr = `${istParts.year}-${istParts.month}-${istParts.day}`;
    const startIso = new Date(`${todayStr}T00:00:00+05:30`).toISOString();
    const endIso = new Date(new Date(startIso).getTime() + 24 * 60 * 60 * 1000).toISOString();

    let totalSentToday = 0;
    let receiptsSent = 0;
    let billingSent = 0;

    if (supabase) {
      // 1. Check fee_billing_ledger emails sent today
      const { data: ledgerSent, error: lErr } = await supabase
        .from('fee_billing_ledger')
        .select('id, amount, email_sent_at')
        .gte('email_sent_at', startIso)
        .lt('email_sent_at', endIso);

      if (!lErr && Array.isArray(ledgerSent)) {
        billingSent = ledgerSent.length;
      }

      // 2. Check fee_receipts created & emailed today
      const { data: receipts, error: rErr } = await supabase
        .from('fee_receipts')
        .select('receipt_no, created_at')
        .gte('created_at', startIso)
        .lt('created_at', endIso);

      if (!rErr && Array.isArray(receipts)) {
        receiptsSent = receipts.length;
      }
    }

    totalSentToday = billingSent + receiptsSent;
    const dailyLimit = 100;
    const remainingQuota = Math.max(0, dailyLimit - totalSentToday);
    const quotaPercent = Math.min(100, Math.round((totalSentToday / dailyLimit) * 100));

    let status = 'healthy';
    if (remainingQuota < 20) status = 'critical';
    else if (remainingQuota < 50) status = 'moderate';

    return res.status(200).json({
      success: true,
      date: todayStr,
      dailyLimit,
      totalSentToday,
      remainingQuota,
      quotaPercent,
      breakdown: {
        billingSent,
        receiptsSent,
        manualSent: 0
      },
      status
    });
  } catch (error) {
    console.error('Error fetching email quota:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch email quota',
      dailyLimit: 100,
      totalSentToday: 0,
      remainingQuota: 100,
      quotaPercent: 0,
      status: 'healthy'
    });
=======
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
>>>>>>> claude/admiring-kepler-50a04f
  }
}
