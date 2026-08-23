import { getSupabase, applyCors, requireSession } from './_lib/auth.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

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
  }
}
