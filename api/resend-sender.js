import https from 'https';

const DEFAULT_RESEND_KEY = '';

export async function sendEmailViaResend({ from, to, subject, html, text, apiKey }) {
  const key = apiKey || process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not configured');

  const recipients = Array.isArray(to) ? to : [to];
  const defaultSender = 'Pragyan Institute <noreply@pragyaninstitute.com>';
  const payload = {
    from: from || defaultSender,
    to: recipients,
    subject,
    html,
    ...(text ? { text } : {})
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
        resolve({ success: false, error: { message: 'Resend request timed out after 15s' } });
      });

      req.write(dataStr);
      req.end();
    });
  }

  let result = await doRequest(payload, key);
  // If domain verification issue or testing note occurs, fallback to onboarding@resend.dev
  if (!result.success && result.error) {
    const errMsg = String(result.error.message || '').toLowerCase();
    if (errMsg.includes('domain') || errMsg.includes('verify') || errMsg.includes('testing emails')) {
      const fallbackPayload = {
        ...payload,
        from: 'Pragyan Institute <onboarding@resend.dev>'
      };
      result = await doRequest(fallbackPayload, key);
    }
  }

  return result;
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
