import { getSupabase, requireSession, applyCors } from './_lib/auth.js';
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
  EMAIL_CATEGORIES,
  DAILY_EMAIL_LIMIT,
  EmailQuotaUnavailableError
} from './_lib/email-quota.js';

const MAX_BODY_LENGTH = 1024 * 1024;

// Which categories may consume the last of the day's quota. Receipts are
// interactive — a parent is waiting on the download — and a billing statement is
// the whole point of the run, so those two get through. A notice or an ad-hoc
// admin blast is not worth the slot that tomorrow's reminders need, so it is
// refused once the day is spent rather than pushing the total over 100.
const CRITICAL_CATEGORIES = new Set([
  EMAIL_CATEGORIES.BILLING,
  EMAIL_CATEGORIES.RECEIPT,
  EMAIL_CATEGORIES.REMINDER
]);

function resolveCategory(raw, role) {
  if (typeof raw === 'string' && Object.values(EMAIL_CATEGORIES).includes(raw)) return raw;
  // A student can only ever be emailing themselves a receipt.
  return role === 'student' ? EMAIL_CATEGORIES.RECEIPT : EMAIL_CATEGORIES.ADMIN;
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
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
      // getSupabase is service-role only; there is no anon fallback to opt into.
      const supabase = getSupabase();
      if (supabase) {
        const { data: student } = await supabase.from('students').select('email').eq('student_id', session.sub).maybeSingle();
        if (student?.email && recipients[0].toLowerCase() !== student.email.toLowerCase()) {
          return res.status(403).json({ error: 'Students may email receipts only to their registered address' });
        }
      }
    }

    // ---- Quota gate -------------------------------------------------------
    // Reserve before sending, never count-then-send: two concurrent callers both
    // reading 99 used would both decide there was room. reserve_email_quota
    // serialises on an advisory lock for the IST day and hands out real slots.
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
        // Fail closed. Sending blind would burn slots with no record, and the
        // next run would then overshoot the cap and be rejected by Resend.
        console.error('Email quota ledger unavailable:', quotaError.message);
        return res.status(503).json({ success: false, error: 'Email quota is temporarily unavailable; please retry shortly' });
      }
      throw quotaError;
    }

    if (!reservation.granted_count) {
      // 429 with the numbers, so the dashboard can say exactly what is left
      // rather than showing a generic failure.
      return res.status(429).json({
        success: false,
        error: `Daily email limit of ${reservation.limit} reached. ${reservation.deferred_count} message(s) were not sent.`,
        quota: {
          limit: reservation.limit,
          used: reservation.used_before,
          remaining: 0,
          deferred: reservation.deferred
        }
      });
    }

    // A non-critical send is refused outright rather than partially delivered:
    // half a notice going out is more confusing than none, and the remaining
    // slots belong to billing.
    if (reservation.deferred_count && !CRITICAL_CATEGORIES.has(emailCategory)) {
      await settleQuota(reservation.granted.map(g => g.dispatch_id), 'deferred');
      return res.status(429).json({
        success: false,
        error: `Only ${reservation.granted_count} of ${recipients.length} slots remain today. Non-critical email was not sent so the remaining quota stays available for fee statements.`,
        quota: { limit: reservation.limit, remaining: reservation.granted_count, deferred: reservation.deferred }
      });
    }

    const granted = reservation.granted;

    // One Resend call per recipient, never a single call with an array of
    // addresses. Resend puts every address in that array into the To header, so
    // a 60-parent billing batch would show all 60 addresses to each family — and
    // the quota ledger reserves one slot per recipient, which only matches
    // reality if each is its own message. Sending individually also means one
    // bad address bounces alone instead of taking the batch with it.
    //
    // Two at a time: Resend's free tier rate-limits at roughly 2 requests per
    // second, and going wider just earns 429s that look like delivery failures.
    const CONCURRENCY = 2;
    const outcomes = [];
    for (let i = 0; i < granted.length; i += CONCURRENCY) {
      const slice = granted.slice(i, i + CONCURRENCY);
      const settled = await Promise.all(slice.map(async (slot) => {
        // Per-recipient ref ID, or Resend would dedupe the whole batch down to
        // one delivery because every message carried the same key.
        const refId = cleanReference ? `${cleanReference}-${slot.recipient}` : null;
        const sendResult = await sendEmailViaResend({
          from,
          to: [slot.recipient],
          subject: cleanSubject,
          html: cleanHtml || undefined,
          text: cleanText || undefined,
          headers: refId ? { 'X-Entity-Ref-ID': refId } : undefined
        });
        const status = statusForSendResult(sendResult);
        await settleQuota([slot.dispatch_id], status, {
          messageId: sendResult?.data?.id || null,
          error: sendResult?.success ? null : extractResendErrorMessage(sendResult.error)
        });
        return {
          recipient: slot.recipient,
          status,
          messageId: sendResult?.data?.id || null,
          error: sendResult?.success ? null : extractResendErrorMessage(sendResult.error)
        };
      }));
      outcomes.push(...settled);
    }

    const sent = outcomes.filter(o => o.status === 'sent');
    const unconfirmed = outcomes.filter(o => o.status === 'unknown');
    const failed = outcomes.filter(o => o.status === 'failed');

    // Nothing got through at all — surface the first provider message, and keep
    // the domain-misconfiguration case as a 400 so the admin sees a setup error
    // rather than a transient one.
    if (!sent.length && !unconfirmed.length) {
      const errMsg = failed[0]?.error || 'Email delivery failed';
      const isDomainError = errMsg.includes('domain') || errMsg.includes('verify') || errMsg.includes('testing emails');
      return res.status(isDomainError ? 400 : 502).json({
        success: false,
        error: errMsg,
        failed: failed.map(f => f.recipient)
      });
    }

    // 200 on a partial batch: the delivered messages really were delivered.
    // `deferred` lists addresses the quota could not cover and `failed` the ones
    // the provider rejected, so a run that lands on slot 99 of 100 reports one
    // success plus the remainder instead of reading as a total failure.
    return res.status(200).json({
      success: true,
      data: sent[0]?.messageId ? { id: sent[0].messageId } : undefined,
      sent: sent.length,
      unconfirmed: unconfirmed.map(o => o.recipient),
      failed: failed.map(o => o.recipient),
      partial: reservation.deferred_count > 0 || failed.length > 0,
      deferred: reservation.deferred,
      quota: { limit: reservation.limit, remaining: reservation.remaining_after }
    });
  } catch (error) {
    const errMsg = extractResendErrorMessage(error);
    console.error('Send email error:', errMsg);
    const isDomainError = errMsg.includes('domain') || errMsg.includes('verify') || errMsg.includes('from') || errMsg.includes('testing emails');
    const statusCode = isDomainError || error.statusCode === 400 || error.status === 400 ? 400 : 502;
    return res.status(statusCode).json({ success: false, error: errMsg });
  }
}
