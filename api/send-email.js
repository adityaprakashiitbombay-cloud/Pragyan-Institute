import { getSupabase, requireSession, applyCors } from './_lib/auth.js';
import { sendEmailViaResend, extractResendErrorMessage } from './_lib/resend-sender.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_FROM = 'Pragyan Institute <noreply@pragyaninstitute.com>';

// Domains verified with Resend. Any sender outside this list is rejected
// pre-flight rather than letting the API return a 400 validation_error.
const VERIFIED_SENDER_DOMAINS = new Set([
  'pragyaninstitute.com',
  'resend.dev', // Resend onboarding sandbox domain
]);

/**
 * Extract the bare domain from a From address such as
 * "Display Name <user@domain.tld>" or "user@domain.tld".
 * Returns null when the address cannot be parsed.
 */
function extractSenderDomain(fromStr) {
  const match = fromStr.match(/<([^>]+)>/) || [null, fromStr];
  const email = (match[1] || fromStr).trim();
  if (!EMAIL_PATTERN.test(email)) return null;
  return email.split('@')[1].toLowerCase();
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const session = requireSession(req, res, ['student', 'admin']);
  if (!session) return;

  const { to, subject, html, text, from: customFrom } = req.body || {};
  const recipients = (Array.isArray(to) ? to : [to]).filter(value => typeof value === 'string' && EMAIL_PATTERN.test(value));
  const maxRecipients = session.role === 'admin' ? 100 : 1;
  if (!recipients.length || recipients.length > maxRecipients || typeof subject !== 'string' || subject.length > 200 || (!html && !text)) {
    return res.status(400).json({ error: 'Invalid email request' });
  }

  const rawFrom = customFrom || process.env.RESEND_FROM_EMAIL || DEFAULT_FROM;

  // Pre-validate sender domain against the verified whitelist before hitting
  // the Resend API. An unverified domain would cause a 400 validation_error;
  // catching it here lets us silently substitute the default sender instead.
  const senderDomain = extractSenderDomain(rawFrom);
  const from = senderDomain && VERIFIED_SENDER_DOMAINS.has(senderDomain)
    ? rawFrom
    : DEFAULT_FROM;

  try {
    if (session.role === 'student') {
      const supabase = getSupabase({ allowAnon: true });
      if (supabase) {
        const { data: student } = await supabase.from('students').select('email').eq('student_id', session.sub).maybeSingle();
        if (student?.email && recipients[0].toLowerCase() !== student.email.toLowerCase()) {
          return res.status(403).json({ error: 'Students may email receipts only to their registered address' });
        }
      }
    }

    const result = await sendEmailViaResend({ from, to: recipients, subject, html, text });
    if (!result.success) {
      const errMsg = extractResendErrorMessage(result.error);
      const isDomainError = errMsg.includes('domain') || errMsg.includes('verify') || errMsg.includes('testing emails');
      return res.status(isDomainError ? 400 : 502).json({ success: false, error: errMsg });
    }
    return res.status(200).json({ success: true, data: result.data });
  } catch (error) {
    const errMsg = extractResendErrorMessage(error);
    console.error('Send email error:', errMsg);
    const isDomainError = errMsg.includes('domain') || errMsg.includes('verify') || errMsg.includes('from') || errMsg.includes('testing emails');
    const statusCode = isDomainError || error.statusCode === 400 || error.status === 400 ? 400 : 502;
    return res.status(statusCode).json({ success: false, error: errMsg });
  }
}
