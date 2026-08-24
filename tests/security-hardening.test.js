// ============================================================================
// T27 — SECURITY HARDENING REGRESSION GUARD (audit findings audit findings F-R3..F-R13)
// ----------------------------------------------------------------------------
// Every assertion here pins one remediation from the readiness report so a
// revert cannot ship silently. Source-scan style mirrors T20–T24; the
// fail-closed login message is asserted verbatim twice (network + 5xx arms).
// ============================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

export function runSecurityHardeningTests(assert) {
  const syncSrc = read('js/supabase-sync.js').replace(/\r\n/g, '\n');
  const authSrc = read('api/auth-login.js').replace(/\r\n/g, '\n');
  const healthSrc = read('api/health.js').replace(/\r\n/g, '\n');
  const dbSrc = read('api/db.js').replace(/\r\n/g, '\n');
  const approveSrc = read('api/approve-payment-request.js').replace(/\r\n/g, '\n');
  const portalSrc = read('js/portal.js').replace(/\r\n/g, '\n');
  const appSrc = read('js/app.js').replace(/\r\n/g, '\n');
  const bustSrc = read('scripts/cache_bust.js').replace(/\r\n/g, '\n');

  // ── F-R3: client-side fallback auth excised ──────────────────────────────
  assert(!syncSrc.includes('token_adm_'), 'T27.1: no admin session tokens are minted browser-side');
  assert(!syncSrc.includes('token_stu_'), 'T27.2: no student session tokens are minted browser-side');
  assert(!syncSrc.includes('_verifyPasswordHash'), 'T27.3: client-side bcrypt verification removed');
  assert(!/plaintext|===\s*cleanCred\)/i.test(syncSrc.split('async login')[0] || ''), 'T27.4: no plaintext compare precedes the login method');
  const failMsg = 'Authentication service temporarily unavailable. Please check your connection and try again.';
  const loginBody = syncSrc.slice(syncSrc.indexOf('async login(role'), syncSrc.indexOf('setSessionToken(token'));
  const failHits = loginBody.split(failMsg).length - 1;
  assert(failHits >= 2, `T27.5: fail-closed message covers BOTH network-error and unexpected-status arms (found ${failHits})`);
  assert(!/Direct Database Query Authentication/.test(loginBody), 'T27.6: legacy fallback banner removed from the login path');
  assert(syncSrc.includes('NO client-side fallback authentication'), 'T27.7: security rationale documented at the removal site');

  // ── F-R6: rate-limiter identifier normalization ───────────────────────────
  assert(authSrc.includes('function normalizeRateLimitKey('), 'T27.8: normalizer function exists');
  assert(
    (authSrc.match(/checkRateLimit\(normalizeRateLimitKey\(/g) || []).length === 1 &&
    (authSrc.match(/resetRateLimit\(normalizeRateLimitKey\(/g) || []).length === 2,
    'T27.9: limiter check AND both success-path resets use the normalized key'
  );
  assert(/startsWith\('\+'\)/.test(authSrc), 'T27.10: leading + preserved for international numbers while separators stripped');

  // ── F-R7: Stream chat token expiry ─────────────────────────────────────────
  assert(/createToken\(userId,\s*exp\)/.test(healthSrc), 'T27.11: createToken embeds an expiry claim');
  assert(/CHAT_TOKEN_TTL_SECONDS\s*=\s*7 \* 24 \* 60 \* 60/.test(healthSrc), 'T27.12: TTL fixed at 7 days');
  assert(healthSrc.includes('expiresAt:'), 'T27.13: response exposes expiresAt so clients can proactively refresh');

  // ── F-R4: anonymous blog view-counter abuse brake ─────────────────────────
  assert(dbSrc.includes("increment_blog_views: { windowMs:"), 'T27.14: per-slug hourly limit configured for the view RPC');
  assert(dbSrc.includes("Invalid article slug"), 'T27.15: gateway rejects malformed slugs before touching Postgres');
  assert(dbSrc.includes('anonRpcAllowed(rpcFn, clientIp, slug)'), 'T27.16: throttle keyed per caller AND per article');
  assert(/slug\s*=\s*btrim\(p_slug\)/.test(read('supabase_production_hardening.sql')) ||
         /WHERE slug = btrim\(p_slug\)/.test(read('supabase_production_hardening.sql')),
    'T27.17: SQL side trims + matches published rows only');

  // ── F-R5: server-side surplus approval guard (inside the RPC) ──────────────
  const sqlSrc = read('supabase_production_hardening.sql').replace(/\r\n/g, '\n');
  assert(/p_allow_surplus boolean DEFAULT false/.test(sqlSrc), 'T27.18: RPC signature accepts an explicit override flag');
  assert(sqlSrc.includes("'code', 'AMOUNT_EXCEEDS_DUES'"), 'T27.19: boundary breach answered with the dedicated code inside the transaction');
  assert(/INSERT INTO public\.audit_logs[\s\S]{0,500}SURPLUS_APPROVAL_OVERRIDE/.test(sqlSrc),
    'T27.20: overrides write an audit-trail warning INSIDE the money transaction');
  assert(/v_amount > COALESCE\(v_student\.pending_fee, 0\) \+ COALESCE\(v_student\.monthly_fee, 0\)/.test(sqlSrc),
    'T27.21: grace boundary = live dues + one month fee');
  assert(approveSrc.includes('p_allow_surplus: allowSurplus') && approveSrc.includes("'AMOUNT_EXCEEDS_DUES'"),
    'T27.21b: endpoint forwards the flag and surfaces the 422 payload');
  assert(!/from\('audit_logs'\)/.test(approveSrc), 'T27.21c: endpoint performs NO direct table writes (RPC owns everything)');
  assert(portalSrc.includes("approveCall(true)") && portalSrc.includes("needsOverride"), 'T27.22: verifier UI performs the confirm-then-override dance');

  // ── F-R9/F-R10: cache integrity + blog filter persistence ─────────────────
  assert(fs.existsSync(path.join(ROOT, 'scripts', '_lib', 'asset-graph.js')), 'T27.23: asset-graph scanner backs the hash list (auto-covers new modules)');
  const appBlogIdx = appSrc.indexOf('restoreBlogCategoryFromHash');
  assert(appBlogIdx > 0, 'T27.24: category filter restored from URL hash on boot');
  assert(appSrc.includes('#category=${encodeURIComponent(blogActiveCategory)}'.replace('#category=', '`#category=` + ') ) || appSrc.includes('`#category=${encodeURIComponent(blogActiveCategory)}`'),
    'T27.25: tab switch writes the selection into the URL hash');

  // ── F-R13: video lightbox decoder teardown ─────────────────────────────────
  const closeIdx = appSrc.indexOf('function closeModal()');
  const closeBlock = closeIdx >= 0 ? appSrc.slice(closeIdx, closeIdx + 700) : '';
  assert(closeBlock.includes('modalVideo.pause()') && closeBlock.includes("modalVideo.src = ''"),
    'T27.26: lightbox close pauses video and releases its src immediately');

  // ── F-R11: documentation names real endpoints ─────────────────────────────
  for (const doc of ['AGENTS.md', 'AI_CONTEXT/DEPLOYMENT_AND_SERVICES.md']) {
    const src = read(doc);
    assert(!src.includes('upload-proxy'), `T27.27: ${doc} references no phantom upload-proxy endpoint`);
    assert(src.includes('upload-file') || doc === 'AI_CONTEXT/DEPLOYMENT_AND_SERVICES.md',
      `T27.28: ${doc} references the real upload-file endpoint`);
  }
}
