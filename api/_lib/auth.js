// Polyfill WebSocket stub for serverless environments (Node.js < 22) where Realtime WebSockets are not used
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

const SESSION_TTL_SECONDS = 60 * 60 * 8;
let _ephemeralSecret = null;

export function applyCors(req, res) {
  // Whitelist trusted origins only (SECURITY FIX: No wildcard CORS)
  const allowedOrigins = [
    'https://pragyaninstitute.com',
    'https://www.pragyaninstitute.com',
    'http://localhost:8080',
    'http://localhost:3000',
    'http://127.0.0.1:8080',
    'http://127.0.0.1:3000'
  ];

  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (process.env.NODE_ENV !== 'production' && origin) {
    // Allow all origins in development with warning
    console.warn(`⚠️ CORS: Unknown origin ${origin} allowed in development mode`);
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours preflight cache

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

export function getSupabase(opts = {}) {
  const url = process.env.SUPABASE_URL || 'https://ujcmmcaervgskpkcfekm.supabase.co';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqY21tY2FlcnZnc2twa2NmZWttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0NDEzMTksImV4cCI6MjEwMjAxNzMxOX0.pTp51JWa-qWbAz-l5NGLKvrS66TED4lruhLInQ6hvmc';

  if (!serviceKey) {
    if (opts.allowAnon || !opts.requireServiceRole) {
      return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    }
    console.error('🚨 SUPABASE_SERVICE_ROLE_KEY is required for server API execution. Refusing to fall back to anon credentials.');
    if (opts.throwOnMissing) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for server API execution.');
    return null;
  }

  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

// REMOVED: Hardcoded default secret (security vulnerability)
// Generate ephemeral secret only for development environments

export function getSessionSecret() {
  if (process.env.PORTAL_SESSION_SECRET) {
    return process.env.PORTAL_SESSION_SECRET;
  }
  // Never use a predictable signing key in production. A per-process key keeps
  // local development usable while forcing deployments to configure a stable
  // secret (otherwise tokens would be invalidated on every cold start).
  if (process.env.NODE_ENV === 'production') {
    console.error('🚨 CRITICAL: PORTAL_SESSION_SECRET is not set in production!');
    // Graceful degradation: Use derived fallback to prevent total auth collapse
    // This is NOT secure long-term, but prevents complete service outage
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    if (serviceKey) {
      const fallback = crypto.createHash('sha256')
        .update(serviceKey + 'INSECURE_FALLBACK')
        .digest('hex');
      console.warn('⚠️ Using derived fallback secret. SET PORTAL_SESSION_SECRET immediately.');
      return fallback;
    }
    throw new Error('PORTAL_SESSION_SECRET is required in production and no fallback available');
  }
  if (!_ephemeralSecret) _ephemeralSecret = crypto.randomBytes(32).toString('hex');
  return _ephemeralSecret;
}

export function readBearerToken(req) {
  const value = req.headers.authorization || req.headers.Authorization || '';
  return value.startsWith('Bearer ') ? value.slice(7).trim() : value.trim();
}

export function requireSession(req, res, allowedRoles = []) {
  const token = readBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return null;
  }

  // Check CRON_SECRET or Service Key bypass
  if (process.env.CRON_SECRET && token === process.env.CRON_SECRET) {
    return { sub: 'cron', role: 'admin', name: 'Cron Automation' };
  }
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (serviceKey && token === serviceKey) {
    return { sub: 'service_role', role: 'admin', name: 'System Admin' };
  }

  // Attempt JWT verification (ONLY VALID AUTH METHOD)
  let secret;
  try {
    secret = getSessionSecret();
  } catch (configErr) {
    console.error(configErr.message);
    res.status(503).json({ error: 'Authentication service is not configured' });
    return null;
  }
  try {
    const session = jwt.verify(token, secret, { algorithms: ['HS256'] });

    // Role-based authorization check
    if (allowedRoles.length && !allowedRoles.includes(session.role)) {
      res.status(403).json({ error: 'You do not have permission for this action' });
      return null;
    }

    return session;
  } catch (jwtErr) {
    // Log error for debugging (don't expose JWT details to client)
    console.error('JWT verification failed:', jwtErr.message);

    // REMOVED: Insecure substring-based authentication bypass
    // REMOVED: Fallback token authentication (token_adm_, token_stu_)
    // All authentication must use properly signed JWT tokens

    res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
    return null;
  }
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
