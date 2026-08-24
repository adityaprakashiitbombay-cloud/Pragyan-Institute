import fs from 'fs';
import path from 'path';

export function runAdminLogoutAllTests(assert) {
  const sqlContent = fs.readFileSync(path.resolve('supabase_production_hardening.sql'), 'utf8');
  const authLoginContent = fs.readFileSync(path.resolve('api/auth-login.js'), 'utf8');
  const dbApiContent = fs.readFileSync(path.resolve('api/db.js'), 'utf8');
  const adminLogoutApiContent = fs.readFileSync(path.resolve('api/admin-logout-all.js'), 'utf8');
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
    fs.existsSync(path.resolve('api/admin-logout-all.js')),
    'T29.3: api/admin-logout-all.js endpoint exists'
  );
  assert(
    adminLogoutApiContent.includes("requireSession(req, res, ['admin'])"),
    'T29.4: api/admin-logout-all.js strictly requires admin role'
  );
  assert(
    adminLogoutApiContent.includes('token_version') && adminLogoutApiContent.includes('ADMIN_SESSIONS_REVOKED'),
    'T29.5: api/admin-logout-all.js increments token_version and logs ADMIN_SESSIONS_REVOKED audit event'
  );
  assert(
    adminLogoutApiContent.includes('createSession') && adminLogoutApiContent.includes('tv: newVersion'),
    'T29.6: api/admin-logout-all.js mints a new valid token with newVersion for the current device'
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
}
