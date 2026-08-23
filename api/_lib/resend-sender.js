import https from 'https';

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const DEFAULT_FROM = 'Pragyan Institute <noreply@pragyaninstitute.com>';

// Domains verified with Resend for production delivery.
export const VERIFIED_PRODUCTION_DOMAINS = new Set([
  'pragyaninstitute.com'
]);

// Sandbox domain only usable during local/non-production testing.
export const SANDBOX_DOMAINS = new Set([
  'resend.dev'
]);

// Backward compatibility export
export const VERIFIED_SENDER_DOMAINS = new Set([
  'pragyaninstitute.com',
  'resend.dev'
]);

/**
 * Extract bare email domain from format like:
 * "Display Name <user@domain.tld>" or "user@domain.tld"
 */
export function extractSenderDomain(fromStr) {
  if (!fromStr || typeof fromStr !== 'string') return null;
  const match = fromStr.match(/<([^>]+)>/) || [null, fromStr];
  const email = (match[1] || fromStr).trim();
  if (!EMAIL_PATTERN.test(email)) return null;
  return email.split('@')[1].toLowerCase();
}

/**
 * Validates if a sender address is from an authorized / verified domain
 */
export function isVerifiedSenderDomain(fromStr) {
  const domain = extractSenderDomain(fromStr);
  if (!domain) return false;
  // In production, strictly reject sandbox resend.dev to prevent silent email drops to students/parents
  if (process.env.NODE_ENV === 'production') {
    return VERIFIED_PRODUCTION_DOMAINS.has(domain);
  }
  return VERIFIED_PRODUCTION_DOMAINS.has(domain) || SANDBOX_DOMAINS.has(domain);
}

/**
 * Validate that a string matches Resend API key format (starts with 're_', alphanumeric/hyphens, non-placeholder)
 */
export function isValidResendApiKey(key) {
  if (typeof key !== 'string') return false;
  const trimmed = key.trim();
  if (!trimmed.startsWith('re_') || trimmed.length < 15) return false;
  if (trimmed.includes('<') || trimmed.includes('>') || /YOUR_/i.test(trimmed) || /PLACEHOLDER/i.test(trimmed)) {
    return false;
  }
  return /^re_[a-zA-Z0-9_-]+$/.test(trimmed);
}

/**
 * POST one message to Resend.
 *
 * `headers` is passed through to Resend's `headers` payload field. It exists so
 * callers can set X-Entity-Ref-ID, which is Resend's own idempotency key: two
 * sends carrying the same ref ID are deduplicated provider-side. That is the
 * outer guard for the cron-runs-twice case — the ledger's idempotency_key stops
 * the second billing row, and this stops the second email if the retry happens
 * before the first response was recorded.
 *
 * On timeout the result carries `timedOut: true`. That distinction matters for
 * quota accounting: Resend may well have accepted and delivered the message, so
 * the reserved slot has to stay consumed ('unknown') rather than be released
 * ('failed'). Releasing it would let the day's 101st mail through.
 */
export async function sendEmailViaResend({ from, to, subject, html, text, apiKey, headers }) {
  const key = (apiKey || process.env.RESEND_API_KEY || '').trim();
  if (!isValidResendApiKey(key)) {
    throw new Error('RESEND_API_KEY is not configured or is invalid (must start with "re_")');
  }

  // Pre-validate sender domain against whitelist
  const rawFrom = from || process.env.RESEND_FROM_EMAIL || DEFAULT_FROM;
  const senderFrom = isVerifiedSenderDomain(rawFrom) ? rawFrom : DEFAULT_FROM;

  const recipients = Array.isArray(to) ? to : [to];
  const customHeaders = headers && typeof headers === 'object'
    ? Object.fromEntries(Object.entries(headers)
        .filter(([name, value]) => name && value !== undefined && value !== null)
        .map(([name, value]) => [String(name), String(value)]))
    : null;
  const payload = {
    from: senderFrom,
    to: recipients,
    subject,
    html,
    ...(text ? { text } : {}),
    ...(customHeaders && Object.keys(customHeaders).length ? { headers: customHeaders } : {})
  };

  function doRequest(postData, authKey) {
    return new Promise((resolve) => {
      const dataStr = JSON.stringify(postData);
      const req = https.request('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(dataStr)
        },
        timeout: 15000
      }, (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ success: true, data: json });
            } else {
              resolve({ success: false, error: json, statusCode: res.statusCode });
            }
          } catch (e) {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ success: true, data: { id: 'sent' } });
            } else {
              resolve({ success: false, error: { message: body || `HTTP ${res.statusCode}` }, statusCode: res.statusCode });
            }
          }
        });
      });

      req.on('error', (err) => resolve({ success: false, error: err }));
      req.on('timeout', () => {
        req.destroy();
        // timedOut, not just an error: the request may have reached Resend and
        // been accepted. Callers must treat this as "slot consumed, delivery
        // unconfirmed", never as a failure that frees the slot.
        resolve({ success: false, timedOut: true, error: { message: 'Resend request timed out after 15s' } });
      });

      req.write(dataStr);
      req.end();
    });
  }

  return doRequest(payload, key);
}

export function extractResendErrorMessage(err) {
  if (!err) return 'Email delivery failed';
  if (typeof err === 'string') return err;
  if (err.message && typeof err.message === 'string') return err.message;
  if (err.error?.message && typeof err.error.message === 'string') return err.error.message;
  if (err.error && typeof err.error === 'string') return err.error;
  try {
    const str = JSON.stringify(err);
    return str !== '{}' ? str : 'Email delivery failed';
  } catch (e) {
    return 'Email delivery failed';
  }
}
