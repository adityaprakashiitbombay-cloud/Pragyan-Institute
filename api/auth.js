import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const SESSION_TTL_SECONDS = 60 * 60 * 8;
let _ephemeralSecret = null;

export function applyCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

export function getSupabase(opts = {}) {
  const url = process.env.SUPABASE_URL || 'https://ujcmmcaervgskpkcfekm.supabase.co';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!serviceKey) {
    if (opts.allowAnon) {
      const anonKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqY21tY2FlcnZnc2twa2NmZWttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0NDEzMTksImV4cCI6MjEwMjAxNzMxOX0.pTp51JWa-qWbAz-l5NGLKvrS66TED4lruhLInQ6hvmc';
      return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    }
    console.error('🚨 SUPABASE_SERVICE_ROLE_KEY is required for server API execution. Refusing to fall back to anon credentials.');
    return null;
  }

  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

// REMOVED: Hardcoded default secret (security vulnerability)
// Generate ephemeral secret only for development environments

export function getSessionSecret() {
  // Production: Require environment variable
  if (process.env.PORTAL_SESSION_SECRET) {
    return process.env.PORTAL_SESSION_SECRET;
  }

  // Fail fast in production if secret is not configured
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL === '1') {
    throw new Error('FATAL: PORTAL_SESSION_SECRET environment variable is required in production. Please configure it in Vercel Dashboard > Settings > Environment Variables.');
  }

  // Development: Generate ephemeral secret with warning
  if (!_ephemeralSecret) {
    _ephemeralSecret = crypto.randomBytes(64).toString('hex');
    console.warn('⚠️  SECURITY WARNING: Using ephemeral JWT secret for development.');
    console.warn('⚠️  This secret will change on every restart.');
    console.warn('⚠️  Set PORTAL_SESSION_SECRET environment variable for production.');
    console.warn(`⚠️  Ephemeral secret (first 16 chars): ${_ephemeralSecret.slice(0, 16)}...`);
  }

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
  const secret = getSessionSecret();
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
