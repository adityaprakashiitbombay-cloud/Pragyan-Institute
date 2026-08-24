import { getSupabase, requireSession, applyCors, isSupabaseConfigured } from './_lib/auth.js';
import {
  sendEmailViaResend,
  extractResendErrorMessage,
  isValidResendApiKey,
  isVerifiedSenderDomain,
  DEFAULT_FROM,
  EMAIL_PATTERN
} from './_lib/resend-sender.js';
import {
  reserveQuota,
  settleQuota,
  statusForSendResult,
  getQuotaStatus,
  EMAIL_CATEGORIES,
  DAILY_EMAIL_LIMIT,
  EmailQuotaUnavailableError
} from './_lib/email-quota.js';

const MAX_BODY_LENGTH = 1024 * 1024;

const CRITICAL_CATEGORIES = new Set([
  EMAIL_CATEGORIES.BILLING,
  EMAIL_CATEGORIES.RECEIPT,
  EMAIL_CATEGORIES.REMINDER
]);

function resolveCategory(raw, role) {
  if (typeof raw === 'string' && Object.values(EMAIL_CATEGORIES).includes(raw)) return raw;
  return role === 'student' ? EMAIL_CATEGORIES.RECEIPT : EMAIL_CATEGORIES.ADMIN;
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  // GET /api/email-quota or GET /api/send-email: Live quota lookup for admin
  if (req.method === 'GET' || (req.url && req.url.includes('email-quota'))) {
    const session = requireSession(req, res, ['admin']);
    if (!session) return;

    if (!isSupabaseConfigured()) {
      return res.status(503).json({ success: false, error: 'Database is not configured' });
    }

    try {
      const status = await getQuotaStatus(DAILY_EMAIL_LIMIT);
      const breakdown = status?.breakdown || {};
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
      return res.status(503).json({ success: false, error: 'Email quota is temporarily unavailable' });
    }
  }

  // POST: Send email
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const session = requireSession(req, res, ['student', 'admin']);
  if (!session) return;

  const { to, subject, html, text, category, reference } = req.body || {};
  const recipients = [...new Set((Array.isArray(to) ? to : [to])
    .filter(value => typeof value === 'string')
    .map(value => value.trim().toLowerCase())
    .filter(value => EMAIL_PATTERN.test(value)))];
  const maxRecipients = session.role === 'admin' ? 100 : 1;
  const cleanSubject = typeof subject === 'string' ? subject.trim() : '';
  const cleanHtml = typeof html === 'string' ? html : '';
  const cleanText = typeof text === 'string' ? text : '';
  if (!recipients.length || recipients.length > maxRecipients || !cleanSubject || cleanSubject.length > 200 || (!cleanHtml && !cleanText) || cleanHtml.length > MAX_BODY_LENGTH || cleanText.length > MAX_BODY_LENGTH) {
    return res.status(400).json({ error: 'Invalid email request' });
  }

  if (!isValidResendApiKey(process.env.RESEND_API_KEY)) {
    return res.status(503).json({ success: false, error: 'Email service is not properly configured on the server (invalid or missing RESEND_API_KEY)' });
  }
  const rawFrom = process.env.RESEND_FROM_EMAIL || DEFAULT_FROM;
  const from = isVerifiedSenderDomain(rawFrom) ? rawFrom : DEFAULT_FROM;

  const emailCategory = resolveCategory(category, session.role);
  const cleanReference = typeof reference === 'string' && reference.trim()
    ? reference.trim().slice(0, 120)
    : null;

  try {
    if (session.role === 'student') {
      const supabase = getSupabase();
      if (supabase) {
        const { data: student } = await supabase.from('students').select('email').eq('student_id', session.sub).maybeSingle();
        if (student?.email && recipients[0].toLowerCase() !== student.email.toLowerCase()) {
          return res.status(403).json({ error: 'Students may email receipts only to their registered address' });
        }
      }
    }

    let reservation;
    try {
      reservation = await reserveQuota({
        category: emailCategory,
        recipients,
        reference: cleanReference,
        limit: DAILY_EMAIL_LIMIT
      });
    } catch (quotaError) {
      if (quotaError instanceof EmailQuotaUnavailableError) {
        console.error('Email quota ledger unavailable:', quotaError.message);
        return res.status(503).json({ success: false, error: 'Email quota is temporarily unavailable; please retry shortly' });
      }
      throw quotaError;
    }

    if (!reservation.allowed) {
      const { available, required } = reservation;
      if (!CRITICAL_CATEGORIES.has(emailCategory)) {
        return res.status(429).json({
          success: false,
          error: `Daily email limit reached (${DAILY_EMAIL_LIMIT} emails/day). Reserved for receipts and billing.`
        });
      }
      return res.status(429).json({
        success: false,
        error: `Daily email limit would be exceeded. Available: ${available}, Required: ${required}`
      });
    }

    const { dispatchRows } = reservation;
    const results = [];
    for (let i = 0; i < recipients.length; i += 1) {
      const recipient = recipients[i];
      const row = dispatchRows[i];
      const result = await sendEmailViaResend({
        from,
        to: [recipient],
        subject: cleanSubject,
        html: cleanHtml || undefined,
        text: cleanText || undefined
      });
      results.push({ recipient, result, dispatchId: row?.id || null });
    }

    const successful = [];
    const failed = [];
    for (const { recipient, result, dispatchId } of results) {
      const status = statusForSendResult(result);
      const resendId = result.success ? (result.data?.id || null) : null;
      const errorMessage = result.success ? null : extractResendErrorMessage(result.error);

      if (dispatchId) {
        await settleQuota({
          dispatchId,
          status,
          resendId,
          errorMessage
        });
      }

      if (result.success) {
        successful.push({ recipient, messageId: result.data?.id });
      } else {
        failed.push({ recipient, error: errorMessage });
      }
    }

    const anySent = successful.length > 0;
    const allSent = failed.length === 0;

    return res.status(allSent ? 200 : anySent ? 207 : 502).json({
      success: anySent,
      sentCount: successful.length,
      failedCount: failed.length,
      successful,
      failed,
      from
    });

  } catch (error) {
    console.error('Email dispatch failed unexpectedly:', error?.message || error);
    return res.status(500).json({ error: 'Failed to send email' });
  }
}
