// Shared caller for the GitHub Actions billing triggers.
//
// These scripts used to be full billing engines: each one had its own Supabase
// client, its own Resend transport, its own copy of the email templates and its
// own fee ladder. That was a live money bug, not just duplication — the ladder
// here ended in `: 700`, so whichever engine reached a Class 12th student first
// decided whether they were charged 1500 or 700. It also meant billing ran
// outside the atomic apply_monthly_fee path and outside the 100/day quota
// ledger, and it required SUPABASE_SERVICE_ROLE_KEY to exist in Actions.
//
// Both scripts are now thin triggers. The serverless API is the single billing
// engine; Actions only supplies a schedule and a button.

const DEFAULT_BASE_URL = 'https://pragyaninstitute.com';

/** Where the API lives. Set API_BASE_URL for a preview deployment. */
export function apiBaseUrl() {
  const raw = String(process.env.API_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
  return /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
}

/**
 * POST to an API endpoint with the cron bearer secret.
 *
 * Exits non-zero on anything but a 2xx so a failed billing night shows as a red
 * run in the Actions tab rather than a green one with an error buried in the log.
 */
export async function callApi(path, body = {}) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('CRON_SECRET is not set. Add it to the repository secrets and to the Vercel environment (they must match).');
    process.exit(1);
  }

  const url = `${apiBaseUrl()}${path}`;
  console.log(`POST ${url}`);
  console.log(`   body: ${JSON.stringify(body)}`);

  // Serverless billing runs can be slow with a large roster; give it room but
  // never hang the workflow forever.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300000);

  let response;
  let payload;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secret}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const text = await response.text();
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text.slice(0, 2000) };
    }
  } catch (error) {
    const reason = error?.name === 'AbortError' ? 'request timed out after 5 minutes' : (error?.message || error);
    console.error(`Request failed: ${reason}`);
    // A timeout is genuinely ambiguous: the run may have completed server-side.
    // Do not retry blindly — the ledger's idempotency key makes a rerun safe for
    // charges, but it would burn another day of email quota on the statements.
    process.exit(1);
  } finally {
    clearTimeout(timeout);
  }

  console.log(`   HTTP ${response.status}`);
  console.log(JSON.stringify(payload, null, 2));

  if (!response.ok) {
    console.error(`API returned ${response.status}: ${payload?.error || 'unknown error'}`);
    process.exit(1);
  }

  // A partial run is a warning, not a failure: the money side succeeded and the
  // API's retry sweep owns the undelivered statements.
  if (payload?.partial) {
    console.warn(`WARNING: partial delivery — ${(payload.deferred || []).length} address(es) deferred by the 100/day email cap.`);
  }
  if (payload?.quotaError) {
    console.warn(`WARNING: quota ledger reported: ${payload.quotaError}`);
  }

  return payload;
}
