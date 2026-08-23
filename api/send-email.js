import { getSupabase, requireSession, applyCors } from './_lib/auth.js';
import {
  sendEmailViaResend,
  extractResendErrorMessage,
  isValidResendApiKey,
  isVerifiedSenderDomain,
  DEFAULT_FROM,
  EMAIL_PATTERN
} from './_lib/resend-sender.js';

const MAX_BODY_LENGTH = 1024 * 1024;

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const session = requireSession(req, res, ['student', 'admin']);
  if (!session) return;

  const { to, subject, html, text } = req.body || {};
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

  try {
    const supabase = getSupabase({ allowAnon: true });

    // Quota Guard: Enforce 100 emails/day Resend limit.
    // Counting window is IST-aligned (Asia/Kolkata midnight) to match the
    // billing schedule; UTC-date windows leaked sends across the 05:30 offset.
    let totalSentToday = 0;
    if (supabase) {
      const istParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' })
        .formatToParts(new Date())
        .reduce((all, part) => ({ ...all, [part.type]: part.value }), {});
      const startIso = new Date(`${istParts.year}-${istParts.month}-${istParts.day}T00:00:00+05:30`).toISOString();
      const endIso = new Date(new Date(startIso).getTime() + 24 * 60 * 60 * 1000).toISOString();
      const { data: ledgerSent } = await supabase
        .from('fee_billing_ledger')
        .select('id')
        .gte('email_sent_at', startIso)
        .lt('email_sent_at', endIso);
      const { data: receiptsSent } = await supabase
        .from('fee_receipts')
        .select('receipt_no')
        .gte('created_at', startIso)
        .lt('created_at', endIso);
      totalSentToday = (ledgerSent?.length || 0) + (receiptsSent?.length || 0);

      const remainingSlots = Math.max(0, 100 - totalSentToday);
      if (totalSentToday + recipients.length > 100) {
        return res.status(429).json({
          success: false,
          error: `Daily email limit exceeded. Today's usage is ${totalSentToday}/100 with only ${remainingSlots} slots remaining.`,
          totalSentToday,
          remainingQuota: remainingSlots
        });
      }
    }

    if (session.role === 'student') {
      if (supabase) {
        const { data: student } = await supabase.from('students').select('email').eq('student_id', session.sub).maybeSingle();
        if (student?.email && recipients[0].toLowerCase() !== student.email.toLowerCase()) {
          return res.status(403).json({ error: 'Students may email receipts only to their registered address' });
        }
      }
    }

    const result = await sendEmailViaResend({ from, to: recipients, subject: cleanSubject, html: cleanHtml || undefined, text: cleanText || undefined });
    if (!result.success) {
      const errMsg = extractResendErrorMessage(result.error);
      const isDomainError = errMsg.includes('domain') || errMsg.includes('verify') || errMsg.includes('testing emails');
      return res.status(isDomainError ? 400 : 502).json({ success: false, error: errMsg });
    }
    const newRemainingQuota = Math.max(0, 100 - (totalSentToday + recipients.length));
    return res.status(200).json({ success: true, data: result.data, remainingQuota: newRemainingQuota });
  } catch (error) {
    const errMsg = extractResendErrorMessage(error);
    console.error('Send email error:', errMsg);
    const isDomainError = errMsg.includes('domain') || errMsg.includes('verify') || errMsg.includes('from') || errMsg.includes('testing emails');
    const statusCode = isDomainError || error.statusCode === 400 || error.status === 400 ? 400 : 502;
    return res.status(statusCode).json({ success: false, error: errMsg });
  }
}
