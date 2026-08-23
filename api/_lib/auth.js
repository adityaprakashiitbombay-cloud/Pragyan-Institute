// Shared server-side auth, CORS and Supabase access for every /api function.
//
// SECURITY MODEL
//   * The browser holds no database credential. Every read and write goes
//     through an /api endpoint that authenticates the caller and then uses the
//     service-role key server-side.
//   * There is no anonymous fallback. Row Level Security denies anon all access
//     to private tables (see supabase_production_hardening.sql section 13), so a
//     silent anon downgrade would fail confusingly at the query layer instead of
//     failing loudly here at configuration time.

// Realtime is never used server-side, but @supabase/supabase-js references the
// global WebSocket during module init on Node < 22.
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = class StubWebSocket {
    constructor() {}
    addEventListener() {}
    removeEventListener() {}
    send() {}
    close() {}
  };
}

import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export const SESSION_TTL_SECONDS = 60 * 60 * 8;
let _ephemeralSecret = null;
let _cachedClient = null;

const PRODUCTION_ORIGINS = [
  'https://pragyaninstitute.com',
  'https://www.pragyaninstitute.com'
];

// Development convenience without opening the door to arbitrary sites: only
// loopback origins on any port are echoed back, and only outside production.
const LOOPBACK_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

const DEV_ORIGINS = [
  'http://localhost:8080',
  'http://localhost:3000',
  'http://127.0.0.1:8080',
  'http://127.0.0.1:3000'
];

// The loopback entries used to sit in one unconditional list, so a production
// deploy still echoed Access-Control-Allow-Origin: http://localhost:8080 with
// credentials — anything a developer happened to be running locally could read
// an authenticated response. They are now gated on the same check as the regex.
function allowedOrigins() {
  return process.env.NODE_ENV === 'production'
    ? PRODUCTION_ORIGINS
    : PRODUCTION_ORIGINS.concat(DEV_ORIGINS);
}

export function applyCors(req, res) {
  const origin = req.headers.origin;

  if (origin && allowedOrigins().includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else if (origin && process.env.NODE_ENV !== 'production' && LOOPBACK_ORIGIN.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  // An unrecognised origin gets no ACAO header at all, so the browser blocks the
  // response. Credentials are only ever advertised alongside a concrete origin —
  // "*" plus credentials is rejected by every browser anyway.
  //
  // This function is the only place CORS is decided. vercel.json used to add a
  // second, hardcoded Access-Control-Allow-Origin for /api/(.*) that contradicted
  // this one (no www., no loopback, and GET/POST/OPTIONS only, which broke every
  // DELETE preflight); that block has been removed.

  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

function serviceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
}

function supabaseUrl() {
  return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
}

/**
 * The service-role Supabase client, or null when the environment is not
 * configured. Callers must treat null as HTTP 503 — never as "use anon".
 */
export function getSupabase(opts = {}) {
  if (_cachedClient) return _cachedClient;

  const url = supabaseUrl();
  const key = serviceRoleKey();

  if (!url || !key) {
    const missing = [!url && 'SUPABASE_URL', !key && 'SUPABASE_SERVICE_ROLE_KEY'].filter(Boolean).join(' and ');
    console.error(`Supabase is not configured: ${missing} missing. Refusing to fall back to anonymous credentials.`);
    if (opts.throwOnMissing) throw new Error(`${missing} is required for server API execution.`);
    return null;
  }

  _cachedClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'X-Client-Info': 'pragyan-portal-api' } }
  });
  return _cachedClient;
}

/** True when the deployment has everything it needs to serve database traffic. */
export function isSupabaseConfigured() {
  return Boolean(supabaseUrl() && serviceRoleKey());
}

export function getSessionSecret() {
  if (process.env.PORTAL_SESSION_SECRET) return process.env.PORTAL_SESSION_SECRET;

  if (process.env.NODE_ENV === 'production') {
    // Deriving a secret from the service-role key was worse than an outage: the
    // key is shared with every other server process and rotating it would
    // silently invalidate all sessions, while anyone who ever saw it could mint
    // admin tokens. Fail closed instead.
    throw new Error('PORTAL_SESSION_SECRET is required in production.');
  }

  // Per-process key for local development. Tokens do not survive a restart,
  // which is the desired signal that a real secret must be configured.
  if (!_ephemeralSecret) _ephemeralSecret = crypto.randomBytes(32).toString('hex');
  return _ephemeralSecret;
}

export function readBearerToken(req) {
  const value = req.headers.authorization || req.headers.Authorization || '';
  return value.startsWith('Bearer ') ? value.slice(7).trim() : value.trim();
}

/** Constant-time comparison so a shared secret cannot be recovered byte by byte. */
function secretEquals(a, b) {
  if (!a || !b) return false;
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verify the caller's session. Returns the decoded session, or null after
 * having already written the error response.
 *
 * The only non-JWT credential accepted is CRON_SECRET, and only for handlers
 * that opt in with { allowCron: true }. The service-role key is deliberately
 * NOT accepted: it is a database credential, and honouring it as a bearer token
 * turned any server-side key leak into full admin access over the public API.
 */
export function requireSession(req, res, allowedRoles = [], opts = {}) {
  const token = readBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return null;
  }

  if (opts.allowCron && process.env.CRON_SECRET && secretEquals(token, process.env.CRON_SECRET)) {
    return { sub: 'cron', role: 'admin', name: 'Cron Automation', isCron: true };
  }

  let secret;
  try {
    secret = getSessionSecret();
  } catch (configErr) {
    console.error(configErr.message);
    res.status(503).json({ error: 'Authentication service is not configured' });
    return null;
  }

  let session;
  try {
    session = jwt.verify(token, secret, { algorithms: ['HS256'] });
  } catch (jwtErr) {
    console.error('JWT verification failed:', jwtErr.message);
    res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
    return null;
  }

  if (allowedRoles.length && !allowedRoles.includes(session.role)) {
    res.status(403).json({ error: 'You do not have permission for this action' });
    return null;
  }
  return session;
}

/** Authorise a Vercel cron invocation (or an admin session) for scheduled jobs. */
export function requireCronOrAdmin(req, res) {
  const token = readBearerToken(req);
  if (process.env.CRON_SECRET && secretEquals(token, process.env.CRON_SECRET)) {
    return { sub: 'cron', role: 'admin', name: 'Cron Automation', isCron: true };
  }
  return requireSession(req, res, ['admin']);
}

export function createSession(user) {
  const secret = getSessionSecret();
  return jwt.sign(user, secret, { algorithm: 'HS256', expiresIn: SESSION_TTL_SECONDS });
}

export function publicAdmin(admin) {
  if (!admin) return null;
  const { password, password_hash, ...safe } = admin;
  return safe;
}
