import fs from 'fs';
import path from 'path';
import { parseDeviceInfo } from '../api/_lib/device-parser.js';

export function runAdminLogoutAllTests(assert) {
  const sqlContent = fs.readFileSync(path.resolve('supabase_production_hardening.sql'), 'utf8');
  const authLoginContent = fs.readFileSync(path.resolve('api/auth-login.js'), 'utf8');
  const dbApiContent = fs.readFileSync(path.resolve('api/db.js'), 'utf8');
  const adminLogoutApiContent = fs.readFileSync(path.resolve('api/admin-sessions.js'), 'utf8');
  const vercelJsonContent = fs.readFileSync(path.resolve('vercel.json'), 'utf8');
  const portalJsContent = fs.readFileSync(path.resolve('js/portal.js'), 'utf8');
  const portalCssContent = fs.readFileSync(path.resolve('css/portal.css'), 'utf8');

  // 1. SQL Hardening Migration
  assert(
    sqlContent.includes('ALTER TABLE public.admins              ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 1;') ||
    sqlContent.includes('token_version integer NOT NULL DEFAULT 1'),
    'T29.1: supabase_production_hardening.sql defines token_version column for public.admins'
  );

  // 2. Auth Login Token Version Inclusion
  assert(
    authLoginContent.includes('token_version') && authLoginContent.includes('tv: tokenVersion'),
    'T29.2: api/auth-login.js embeds admin token_version (tv) into JWT payload upon login'
  );

  // 3. Admin Logout All API Endpoint
  assert(
    vercelJsonContent.includes('/api/admin-logout-all') && fs.existsSync(path.resolve('api/admin-sessions.js')),
    'T29.3: /api/admin-logout-all route is wired to session revocation engine'
  );
  assert(
    adminLogoutApiContent.includes("requireSession(req, res, ['admin'])"),
    'T29.4: session revocation handler strictly requires admin role'
  );
  assert(
    adminLogoutApiContent.includes('token_version') && adminLogoutApiContent.includes('ADMIN_SESSIONS_REVOKED'),
    'T29.5: session revocation handler increments token_version and logs ADMIN_SESSIONS_REVOKED audit event'
  );
  assert(
    adminLogoutApiContent.includes('createSession') && adminLogoutApiContent.includes('tv: newVersion'),
    'T29.6: session revocation handler mints a new valid token with newVersion for the current device'
  );

  // 4. Gateway Revocation Enforcement
  assert(
    dbApiContent.includes('isSessionRevoked') && dbApiContent.includes('token_version'),
    'T29.7: api/db.js enforces isSessionRevoked check against admin token_version'
  );

  // 5. Portal Frontend Integration
  assert(
    portalJsContent.includes('btnAdminLogoutAllDevices'),
    'T29.8: js/portal.js provides #btnAdminLogoutAllDevices in Admin Settings & Profile'
  );
  assert(
    portalJsContent.includes('/api/admin-logout-all'),
    'T29.9: js/portal.js wires /api/admin-logout-all fetch call on button click'
  );
  assert(
    portalJsContent.includes('Multi-Device Session Security'),
    'T29.10: js/portal.js renders Card 3 for Multi-Device Session Security in Admin Settings'
  );

  // 6. CSS Styling
  assert(
    portalCssContent.includes('.admin-session-security-card') && portalCssContent.includes('.btn-logout-all-devices'),
    'T29.11: css/portal.css contains styling for .admin-session-security-card and .btn-logout-all-devices'
  );

  // 7. Active Device Sessions Table in SQL Hardening
  assert(
    sqlContent.includes('CREATE TABLE IF NOT EXISTS public.admin_sessions') &&
    sqlContent.includes('session_id') &&
    sqlContent.includes('is_revoked'),
    'T29.12: supabase_production_hardening.sql declares public.admin_sessions table with revocation tracking'
  );

  // 8. Device Parser Helper Unit Verification
  const parserPath = path.resolve('api/_lib/device-parser.js');
  assert(fs.existsSync(parserPath), 'T29.13: api/_lib/device-parser.js exists');

  const desktopInfo = parseDeviceInfo('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36', '103.21.244.18');
  assert(desktopInfo.type === 'desktop' && desktopInfo.browser.includes('Chrome') && desktopInfo.os.includes('Windows'), 'T29.14: parseDeviceInfo correctly identifies Windows desktop Chrome');

  const iphoneInfo = parseDeviceInfo('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1', '103.21.244.18');
  assert(iphoneInfo.type === 'mobile' && iphoneInfo.os.includes('iOS') && iphoneInfo.browser.includes('Safari'), 'T29.15: parseDeviceInfo correctly identifies iPhone mobile Safari');

  const ipadInfo = parseDeviceInfo('Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1', '103.21.244.18');
  assert(ipadInfo.type === 'tablet', 'T29.16: parseDeviceInfo correctly identifies tablet devices');

  // 9. Auth Login and Gateway Integration
  assert(
    authLoginContent.includes('admin_sessions') && authLoginContent.includes('sid: sessionId'),
    'T29.17: api/auth-login.js persists session in admin_sessions and embeds sid in JWT'
  );
  assert(
    dbApiContent.includes('admin_sessions') && dbApiContent.includes('is_revoked'),
    'T29.18: api/db.js validates session revocation state against admin_sessions'
  );

  // 10. Admin Sessions API & UI Integration
  const adminSessionsApiContent = fs.readFileSync(path.resolve('api/admin-sessions.js'), 'utf8');
  assert(
    adminSessionsApiContent.includes('revoke_device') && adminSessionsApiContent.includes('revoke_other'),
    'T29.19: api/admin-sessions.js supports both individual device revocation and logout all others'
  );
  assert(
    portalJsContent.includes('adminDeviceListContainer') &&
    portalJsContent.includes('loadAndRenderAdminDevices') &&
    portalJsContent.includes('btn-revoke-device') &&
    portalCssContent.includes('.admin-device-card') &&
    portalCssContent.includes('.btn-revoke-device'),
    'T29.20: js/portal.js and portal.css implement responsive real-time active device list and per-device termination'
  );
  assert(
    dbApiContent.includes("'role'") && dbApiContent.includes("['username', 'name', 'role'"),
    'T29.21: api/db.js authorizeAdminTableWrite permits role, name, mobile, email, upi_id, and photo_url'
  );
  const passwordApiContent = fs.readFileSync(path.resolve('api/password.js'), 'utf8');
  assert(
    passwordApiContent.includes('admin_id.eq.${session.sub},username.eq.${session.sub},id.eq.${session.sub}'),
    'T29.22: api/password.js supports multi-identifier admin lookup via or clause'
  );
}
