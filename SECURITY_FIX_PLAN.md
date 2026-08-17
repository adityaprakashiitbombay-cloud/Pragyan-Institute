# 🛠️ Security Fix Implementation Plan — Pragyan Institute Portal

**Created**: 2026-08-17  
**Status**: Ready for Implementation  
**Estimated Effort**: 16-24 hours total  
**Risk Level**: High (Critical security patches required)

---

## 📋 Table of Contents

1. [Phase 0: Pre-Implementation Preparation](#phase-0-pre-implementation-preparation)
2. [Phase 1: Critical Fixes (P0 - Deploy Immediately)](#phase-1-critical-fixes-p0---deploy-immediately)
3. [Phase 2: High Priority Fixes (P1 - Deploy This Week)](#phase-2-high-priority-fixes-p1---deploy-this-week)
4. [Phase 3: Medium Priority Fixes (P2 - Deploy This Sprint)](#phase-3-medium-priority-fixes-p2---deploy-this-sprint)
5. [Phase 4: Low Priority Fixes (P3-P4 - Backlog)](#phase-4-low-priority-fixes-p3-p4---backlog)
6. [Phase 5: Post-Deployment Validation](#phase-5-post-deployment-validation)
7. [Rollback Plan](#rollback-plan)

---

## Phase 0: Pre-Implementation Preparation

### 0.1 Environment Setup
**Duration**: 30 minutes

**Tasks**:
- [ ] Create a new git branch: `security-fix-2026-08-17`
- [ ] Backup current production database
- [ ] Document all current environment variables
- [ ] Set up a staging environment for testing
- [ ] Notify team members of upcoming security patches

**Commands**:
```powershell
# Create and switch to security fix branch
git checkout -b security-fix-2026-08-17

# Verify all environment variables are documented
echo $env:SUPABASE_SERVICE_ROLE_KEY
echo $env:PORTAL_SESSION_SECRET
echo $env:CRON_SECRET
echo $env:RESEND_API_KEY
```

### 0.2 Generate New Secrets
**Duration**: 15 minutes

**Tasks**:
- [ ] Generate a new strong JWT secret (64+ characters)
- [ ] Generate a new CRON_SECRET
- [ ] Document secrets in secure password manager
- [ ] Prepare environment variable updates for Vercel and GitHub Actions

**Commands**:
```powershell
# Generate cryptographically secure secrets using Node.js
node -e "console.log('PORTAL_SESSION_SECRET=' + require('crypto').randomBytes(64).toString('hex'))"
node -e "console.log('CRON_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
```

**Example Output**:
```
PORTAL_SESSION_SECRET=a1b2c3d4e5f6...128_character_hex_string
CRON_SECRET=x1y2z3w4v5u6...64_character_hex_string
```

---

## Phase 1: Critical Fixes (P0 - Deploy Immediately)

**Total Duration**: 2-3 hours  
**Risk Level**: High  
**Testing Required**: Extensive

---

### FIX-CRITICAL-1: Remove Authentication Bypass

**File**: `api/auth.js`  
**Lines**: 72-77  
**Severity**: CRITICAL  
**Effort**: 30 minutes

#### Current Code:
```javascript
// If token is an admin direct token format
if (token.startsWith('token_adm_') || token.startsWith('admin_') || token.toLowerCase().includes('admin')) {
  if (!allowedRoles.length || allowedRoles.includes('admin')) {
    return { sub: 'admin', role: 'admin', name: 'Main Admin' };
  }
}
```

#### Fixed Code:
```javascript
// REMOVED: Insecure substring-based authentication bypass
// Only JWT verification and explicit service keys are now accepted
// No fallback authentication tokens allowed
```

#### Implementation Steps:
1. **Remove lines 72-87** entirely (both admin and student token fallback logic)
2. **Update error handling** to be consistent
3. **Test all authentication flows**

#### Complete Fixed Function:
```javascript
export function requireSession(req, res, allowedRoles = []) {
  const token = readBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return null;
  }

  // Check CRON_SECRET or Service Key bypass (server-to-server only)
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
    // Log the error for debugging (don't expose details to client)
    console.error('JWT verification failed:', jwtErr.message);
    
    res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
    return null;
  }
}
```

#### Testing Checklist:
- [ ] Valid JWT token works for admin
- [ ] Valid JWT token works for student
- [ ] Expired JWT token is rejected
- [ ] Malformed JWT token is rejected
- [ ] Token with "admin" substring is rejected
- [ ] CRON_SECRET still works for automation
- [ ] Service role key still works for system operations

---

### FIX-CRITICAL-2: Enforce Environment-Based JWT Secret

**File**: `api/auth.js`  
**Lines**: 35-39  
**Severity**: CRITICAL  
**Effort**: 45 minutes

#### Current Code:
```javascript
const STABLE_DEFAULT_SECRET = 'pragyan_portal_session_sec_98f7a2b4c1d6e8f0a3b5c7d9e1f2a4b6c8d0e2f4a6b8c0d2';

export function getSessionSecret() {
  return process.env.PORTAL_SESSION_SECRET || STABLE_DEFAULT_SECRET;
}
```

#### Fixed Code:
```javascript
// REMOVED: Hardcoded default secret
// Generate ephemeral secret if env var is missing (development only)
let _ephemeralSecret = null;

export function getSessionSecret() {
  if (process.env.PORTAL_SESSION_SECRET) {
    return process.env.PORTAL_SESSION_SECRET;
  }
  
  // Production: Fail fast if secret is not configured
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL === '1') {
    throw new Error('PORTAL_SESSION_SECRET environment variable is required in production');
  }
  
  // Development: Generate ephemeral secret with warning
  if (!_ephemeralSecret) {
    _ephemeralSecret = require('crypto').randomBytes(64).toString('hex');
    console.warn('⚠️  SECURITY WARNING: Using ephemeral JWT secret for development.');
    console.warn('⚠️  Set PORTAL_SESSION_SECRET environment variable for production.');
    console.warn(`⚠️  Ephemeral secret: ${_ephemeralSecret.slice(0, 16)}...`);
  }
  
  return _ephemeralSecret;
}
```

#### Implementation Steps:
1. **Remove hardcoded STABLE_DEFAULT_SECRET constant**
2. **Add ephemeral secret generation for development**
3. **Add production environment check**
4. **Update Vercel environment variables**
5. **Update GitHub Actions secrets**
6. **Deploy and verify**

#### Environment Variable Configuration:

**Vercel Dashboard**:
```
Settings > Environment Variables > Add New

Name: PORTAL_SESSION_SECRET
Value: [paste generated 128-char hex string]
Scope: Production, Preview, Development
```

**GitHub Actions**:
```
Repository > Settings > Secrets and variables > Actions > New repository secret

Name: PORTAL_SESSION_SECRET
Value: [paste generated 128-char hex string]
```

#### Testing Checklist:
- [ ] Production deployment fails if PORTAL_SESSION_SECRET is missing
- [ ] Development mode generates ephemeral secret with warning
- [ ] Tokens signed with new secret are accepted
- [ ] Old tokens (if any) are rejected after secret rotation
- [ ] GitHub Actions can access the secret
- [ ] Vercel deployment has the secret configured

---

### FIX-CRITICAL-3: Rotate All Exposed Secrets

**Files**: Multiple  
**Severity**: CRITICAL  
**Effort**: 1 hour

#### Secrets to Rotate:

1. **JWT Session Secret** (already done in FIX-CRITICAL-2)
2. **CRON_SECRET** (used for GitHub Actions authentication)
3. **Supabase Service Role Key** (if exposed publicly)

#### Implementation Steps:

**Step 1: Rotate CRON_SECRET**
```powershell
# Generate new CRON_SECRET
$NEW_CRON_SECRET = node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Update in Vercel
# Vercel Dashboard > Settings > Environment Variables > CRON_SECRET > Edit

# Update in GitHub Actions
# Repository > Settings > Secrets > CRON_SECRET > Update
```

**Step 2: Verify Supabase Service Key Security**
- [ ] Check if SUPABASE_SERVICE_ROLE_KEY is in any public files
- [ ] Verify it's only in environment variables
- [ ] If exposed: Regenerate in Supabase Dashboard

**Step 3: Update .github/workflows/*.yml**
```yaml
# Ensure secrets are used, not hardcoded values
env:
  SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
  PORTAL_SESSION_SECRET: ${{ secrets.PORTAL_SESSION_SECRET }}
  CRON_SECRET: ${{ secrets.CRON_SECRET }}
```

#### Verification:
- [ ] No secrets in git history (use `git log --all -p | grep -i "secret"`)
- [ ] No secrets in public files
- [ ] All secrets stored in secure environment variables
- [ ] GitHub Actions successfully authenticate with new CRON_SECRET

---

## Phase 2: High Priority Fixes (P1 - Deploy This Week)

**Total Duration**: 4-6 hours  
**Risk Level**: Medium-High  
**Testing Required**: Moderate

---

### FIX-HIGH-1: Strengthen Input Sanitization

**File**: `js/supabase-sync.js`  
**Lines**: 55-65  
**Severity**: HIGH  
**Effort**: 2 hours

#### Current Code:
```javascript
_sanitizeForQuery(value) {
  if (value == null) return '';
  // Remove any characters that could be used for SQL injection
  // Allow alphanumeric, hyphens, underscores, @, dots (for UUIDs, emails, UPI IDs)
  return String(value).replace(/[^\w\-@.]/g, '').trim();
}
```

#### Fixed Code:
```javascript
_sanitizeForQuery(value) {
  if (value == null) return '';
  
  // Strict allowlist: ASCII alphanumeric, hyphen, underscore only
  // Dots and @ symbols are validated separately for specific use cases
  const sanitized = String(value)
    .replace(/[^a-zA-Z0-9\-_]/g, '')
    .trim();
  
  // Limit length to prevent DoS via oversized inputs
  if (sanitized.length > 100) {
    console.warn('Sanitized input exceeds 100 characters:', sanitized.slice(0, 20));
    return sanitized.slice(0, 100);
  }
  
  return sanitized;
}

// Add specialized sanitizers for different data types
_sanitizeEmail(value) {
  if (value == null) return '';
  const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  const cleaned = String(value).trim().toLowerCase();
  return emailPattern.test(cleaned) ? cleaned : '';
}

_sanitizeUUID(value) {
  if (value == null) return '';
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const cleaned = String(value).trim().toLowerCase();
  return uuidPattern.test(cleaned) ? cleaned : '';
}

_sanitizeMobile(value) {
  if (value == null) return '';
  // Only digits, max 12 characters (for international format)
  const digits = String(value).replace(/\D/g, '').slice(0, 12);
  return digits;
}
```

#### Update All Query Building:
```javascript
// Example: Line 271-276 in supabase-sync.js
if (table === 'students') {
  // Use specialized sanitizers
  const sStuId = this._sanitizeForQuery(String(currentStudent.student_id || ''));
  const sRoll = this._sanitizeForQuery(String(currentStudent.roll_no || ''));
  
  if (this._sanitizeUUID(sStuId)) {
    // UUID-based query
    filter = `id.eq.${this._encodeFilterValue(sStuId)}`;
  } else {
    // Alphanumeric ID-based query
    filter = `student_id.eq.${this._encodeFilterValue(sStuId)}`;
    if (sRoll && sRoll !== sStuId) {
      filter = `or=(student_id.eq.${this._encodeFilterValue(sStuId)},roll_no.eq.${this._encodeFilterValue(sRoll)})`;
    }
  }
}
```

#### Testing Checklist:
- [ ] Normal UUIDs work correctly
- [ ] Normal student IDs (alphanumeric) work correctly
- [ ] Email addresses are validated properly
- [ ] Mobile numbers are sanitized correctly
- [ ] Special characters are rejected
- [ ] Oversized inputs are truncated
- [ ] SQL injection attempts are blocked

---

### FIX-HIGH-2: Remove Plaintext Password Fallback

**File**: `js/supabase-sync.js`  
**Lines**: 1138, 1155  
**Severity**: HIGH  
**Effort**: 1.5 hours

#### Current Code:
```javascript
// Line 1138
if (String(admin.password || '').trim() === cleanCred) {
  console.warn('⚠️ Using fallback plain-text admin authentication. This is insecure for production!');
  const norm = this.normalizeAdmin(admin);
  const token = `token_adm_${admin.id || admin.admin_id}_${Date.now()}`;
  await this.setSession(token, 'admin');
  await this.pullAll().catch(() => {});
  return { success: true, user: norm, token };
}
```

#### Fixed Code:
```javascript
// REMOVED: Plaintext password comparison
// All authentication MUST go through /api/auth-login endpoint
// which uses bcrypt for secure password hashing
```

#### Update login() function:
```javascript
async login(role, identifier, credential) {
  // SECURITY: Sanitize all inputs before processing
  const cleanId = this._sanitizeForQuery(String(identifier || '').trim());
  const cleanCred = String(credential || '').trim();

  if (!cleanId || !cleanCred) {
    return { success: false, error: 'Please enter all credentials.' };
  }

  // Input validation: Prevent excessively long inputs (potential DoS)
  if (cleanId.length > 100 || cleanCred.length > 100) {
    return { success: false, error: 'Invalid credential format.' };
  }

  // ONLY use serverless JWT authentication endpoint (bcrypt verification)
  try {
    const apiBase = (typeof window !== 'undefined' && window.PRAGYAN_API_BASE) ? window.PRAGYAN_API_BASE : '';
    const authRes = await fetch(`${apiBase}/api/auth-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, identifier: cleanId, credential: cleanCred })
    });
    
    if (authRes.ok) {
      const authData = await authRes.json().catch(() => ({}));
      if (authData.success && authData.token) {
        await this.setSession(authData.token, role);
        await this.pullAll().catch(() => {});
        return { success: true, user: authData.user, token: authData.token };
      }
    }
    
    // Return generic error (don't leak whether user exists)
    return { success: false, error: 'Invalid credentials. Please check your username and password.' };
  } catch (apiErr) {
    console.error('Authentication service unavailable:', apiErr.message);
    return { success: false, error: 'Authentication service is currently unavailable. Please try again later.' };
  }
  
  // REMOVED: All direct database authentication fallback logic
  // No plaintext password comparison
  // No local authentication
}
```

#### Testing Checklist:
- [ ] Admin login works through /api/auth-login
- [ ] Student login works through /api/auth-login
- [ ] Plaintext passwords are never compared
- [ ] bcrypt hashing is always used
- [ ] Failed login attempts return generic error messages
- [ ] No direct database authentication fallback exists

---

### FIX-HIGH-3: Implement Rate Limiting

**New File**: `api/_middleware.js` or use Vercel Edge Middleware  
**Severity**: HIGH  
**Effort**: 2 hours

#### Create Rate Limiting Middleware:

**File**: `middleware.js` (root directory for Vercel Edge Middleware)
```javascript
import { NextResponse } from 'next/server';

// Simple in-memory rate limiter (use Redis/Upstash for production)
const rateLimitMap = new Map();

const RATE_LIMITS = {
  '/api/auth-login': { maxAttempts: 5, windowMs: 15 * 60 * 1000 }, // 5 attempts per 15 min
  '/api/student-password': { maxAttempts: 3, windowMs: 60 * 60 * 1000 }, // 3 attempts per hour
  '/api/admin-password': { maxAttempts: 3, windowMs: 60 * 60 * 1000 },
  default: { maxAttempts: 100, windowMs: 60 * 1000 } // 100 requests per minute for other endpoints
};

function getRateLimit(pathname) {
  return RATE_LIMITS[pathname] || RATE_LIMITS.default;
}

function getClientIdentifier(request) {
  // Use multiple identifiers for better accuracy
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const ip = forwarded?.split(',')[0] || realIp || 'unknown';
  return ip;
}

export function middleware(request) {
  const { pathname } = request.nextUrl;
  
  // Only rate limit API endpoints
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next();
  }
  
  const clientId = getClientIdentifier(request);
  const rateLimit = getRateLimit(pathname);
  const key = `${clientId}:${pathname}`;
  
  const now = Date.now();
  const record = rateLimitMap.get(key) || { attempts: 0, resetTime: now + rateLimit.windowMs };
  
  // Reset if window has passed
  if (now > record.resetTime) {
    record.attempts = 0;
    record.resetTime = now + rateLimit.windowMs;
  }
  
  // Increment attempts
  record.attempts++;
  rateLimitMap.set(key, record);
  
  // Check if rate limit exceeded
  if (record.attempts > rateLimit.maxAttempts) {
    const retryAfter = Math.ceil((record.resetTime - now) / 1000);
    return new NextResponse(
      JSON.stringify({ 
        error: 'Too many requests. Please try again later.',
        retryAfter 
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(retryAfter),
          'X-RateLimit-Limit': String(rateLimit.maxAttempts),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(record.resetTime)
        }
      }
    );
  }
  
  // Add rate limit headers to response
  const response = NextResponse.next();
  response.headers.set('X-RateLimit-Limit', String(rateLimit.maxAttempts));
  response.headers.set('X-RateLimit-Remaining', String(rateLimit.maxAttempts - record.attempts));
  response.headers.set('X-RateLimit-Reset', String(record.resetTime));
  
  return response;
}

// Configure which paths the middleware runs on
export const config = {
  matcher: '/api/:path*'
};

// Cleanup old entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitMap.entries()) {
    if (now > record.resetTime + 60000) { // 1 minute grace period
      rateLimitMap.delete(key);
    }
  }
}, 10 * 60 * 1000);
```

#### Alternative: Use Upstash Rate Limit (Production-Ready)

**Install**:
```powershell
npm install @upstash/ratelimit @upstash/redis
```

**File**: `middleware.js`
```javascript
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';

// Create Redis instance
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Create rate limiters for different endpoints
const authLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '15 m'), // 5 requests per 15 minutes
  analytics: true,
});

const apiLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, '1 m'), // 100 requests per minute
  analytics: true,
});

export async function middleware(request) {
  const { pathname } = request.nextUrl;
  
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next();
  }
  
  const ip = request.headers.get('x-forwarded-for') || 'anonymous';
  const limiter = pathname.includes('auth') || pathname.includes('password') 
    ? authLimiter 
    : apiLimiter;
  
  const { success, limit, reset, remaining } = await limiter.limit(ip);
  
  if (!success) {
    return new NextResponse(
      JSON.stringify({ error: 'Too many requests', retryAfter: Math.floor((reset - Date.now()) / 1000) }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': String(remaining),
          'X-RateLimit-Reset': String(reset),
        }
      }
    );
  }
  
  const response = NextResponse.next();
  response.headers.set('X-RateLimit-Limit', String(limit));
  response.headers.set('X-RateLimit-Remaining', String(remaining));
  return response;
}

export const config = {
  matcher: '/api/:path*'
};
```

#### Testing Checklist:
- [ ] Login endpoint limited to 5 attempts per 15 minutes
- [ ] Password reset limited to 3 attempts per hour
- [ ] Rate limit headers are returned
- [ ] Retry-After header indicates when to retry
- [ ] Rate limits reset after time window
- [ ] Different IPs have independent limits

---

## Phase 3: Medium Priority Fixes (P2 - Deploy This Sprint)

**Total Duration**: 4-6 hours  
**Risk Level**: Medium  
**Testing Required**: Moderate

---

### FIX-MEDIUM-1: Move Storage Operations to Server-Side

**Current Issue**: Storage key exposed in `js/supabase-sync.js:954`

#### Create New Server-Side Upload Endpoint:

The existing `/api/upload-file.js` already handles uploads properly. The issue is the exposed `_getStorageKey()` function in client-side code.

**File**: `js/supabase-sync.js`  
**Action**: Remove lines 954-1025 (uploadFile method with embedded storage key)

#### Replace with API call:
```javascript
// Remove _getStorageKey() method entirely

// Update uploadFile to use API endpoint
async uploadFile(file, folder = 'profile_pictures') {
  if (!file) return null;
  
  const isPdf = file.type === 'application/pdf' || (file.name && file.name.toLowerCase().endsWith('.pdf'));
  const compressed = isPdf ? file : await this.compressMobileImage(file, 600, 0.85);
  
  if (compressed.size > 10 * 1024 * 1024) {
    throw new Error('Please choose a file smaller than 10 MB');
  }
  
  // Convert file to base64
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(compressed);
  });
  
  // Use authenticated API endpoint
  const apiBase = (typeof window !== 'undefined' && window.PRAGYAN_API_BASE) ? window.PRAGYAN_API_BASE : '';
  const token = this.sessionToken || localStorage.getItem('pragyan_portal_token');
  
  const response = await fetch(`${apiBase}/api/upload-file`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      folder,
      fileName: compressed.name,
      contentType: compressed.type,
      base64
    })
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(error.error || 'Upload failed');
  }
  
  const result = await response.json();
  return result.url;
}
```

#### Testing Checklist:
- [ ] No storage keys in client-side code
- [ ] File uploads work through API
- [ ] Authentication required for uploads
- [ ] Students can only upload to allowed folders
- [ ] Admins can upload to all folders

---

### FIX-MEDIUM-2: Strengthen Password Requirements

**File**: `api/student-password.js`  
**Lines**: 24, 152

#### Current Code:
```javascript
if (typeof newPassword !== 'string' || newPassword.trim().length < 4) {
  return res.status(400).json({ success: false, error: 'Password must be at least 4 characters long' });
}
```

#### Fixed Code:
```javascript
function validatePassword(password, minLength = 8) {
  if (typeof password !== 'string') {
    return { valid: false, error: 'Password must be a text string' };
  }
  
  const trimmed = password.trim();
  
  if (trimmed.length < minLength) {
    return { valid: false, error: `Password must be at least ${minLength} characters long` };
  }
  
  // Optional: Add complexity requirements
  // Uncomment for production
  /*
  const hasLetter = /[a-zA-Z]/.test(trimmed);
  const hasNumber = /[0-9]/.test(trimmed);
  
  if (!hasLetter || !hasNumber) {
    return { valid: false, error: 'Password must contain both letters and numbers' };
  }
  */
  
  // Check for common weak passwords
  const commonPasswords = ['12345678', 'password', 'qwerty123', 'admin123'];
  if (commonPasswords.includes(trimmed.toLowerCase())) {
    return { valid: false, error: 'This password is too common. Please choose a stronger password.' };
  }
  
  return { valid: true };
}

// Update student password validation (line 24)
const validation = validatePassword(newPassword, 8); // Changed from 4 to 8
if (!validation.valid) {
  return res.status(400).json({ success: false, error: validation.error });
}

// Update admin password validation (already 12, keep it)
const adminValidation = validatePassword(newPassword, 12);
if (!adminValidation.valid) {
  return res.status(400).json({ success: false, error: adminValidation.error });
}
```

#### Update Client-Side UI:

**File**: `portal-student.html` or relevant form file
```html
<input 
  type="password" 
  id="newPassword" 
  minlength="8" 
  required 
  pattern=".{8,}" 
  title="Password must be at least 8 characters long"
  placeholder="New password (min 8 characters)"
>
<small class="password-requirements">
  ✓ At least 8 characters<br>
  ✓ Mix of letters and numbers recommended<br>
  ✓ Avoid common passwords
</small>
```

#### Testing Checklist:
- [ ] 4-character passwords are rejected
- [ ] 8+ character passwords are accepted
- [ ] Common weak passwords are rejected
- [ ] Password validation works on both client and server
- [ ] Existing users with weak passwords are prompted to update

---

### FIX-MEDIUM-3: Enhance File Upload Validation

**File**: `api/upload-file.js`  
**Lines**: 14-25

#### Current Code:
```javascript
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
if (!ALLOWED_FOLDERS.has(folder) || typeof base64 !== 'string' || !ALLOWED_TYPES.has(contentType)) {
  return res.status(400).json({ error: 'Unsupported upload' });
}
```

#### Enhanced Code:
```javascript
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'pdf']);

// Validate folder
if (!ALLOWED_FOLDERS.has(folder)) {
  return res.status(400).json({ error: 'Invalid upload folder' });
}

// Validate base64 string
if (typeof base64 !== 'string' || !base64) {
  return res.status(400).json({ error: 'Invalid file data' });
}

// Validate content type from client
if (!ALLOWED_TYPES.has(contentType)) {
  return res.status(400).json({ error: 'Unsupported file type. Only JPEG, PNG, WebP, and PDF files are allowed.' });
}

// Validate file extension
const extension = (fileName || '').split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '');
if (!extension || !ALLOWED_EXTENSIONS.has(extension)) {
  return res.status(400).json({ error: 'Invalid file extension' });
}

// Ensure content type matches extension
const extensionTypeMap = {
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'png': 'image/png',
  'webp': 'image/webp',
  'pdf': 'application/pdf'
};

if (extensionTypeMap[extension] !== contentType) {
  return res.status(400).json({ 
    error: 'File extension does not match content type. Possible file type spoofing detected.' 
  });
}

// Decode base64 and validate file signature (magic bytes)
const raw = base64.includes(',') ? base64.split(',').pop() : base64;
if (raw.length > 7 * 1024 * 1024) {
  return res.status(413).json({ error: 'File size exceeds 5 MB limit' });
}

const bytes = Buffer.from(raw, 'base64');
if (!bytes.length || bytes.length > MAX_BYTES) {
  return res.status(413).json({ error: 'File size exceeds 5 MB limit' });
}

// Validate file signature (magic bytes) to prevent file type spoofing
const signature = bytes.slice(0, 8).toString('hex').toUpperCase();
const validSignatures = {
  'FFD8FF': 'image/jpeg',         // JPEG
  '89504E47': 'image/png',         // PNG
  '52494646': 'image/webp',        // WebP (starts with RIFF)
  '25504446': 'application/pdf'    // PDF
};

let signatureMatch = false;
for (const [sig, type] of Object.entries(validSignatures)) {
  if (signature.startsWith(sig) && type === contentType) {
    signatureMatch = true;
    break;
  }
}

if (!signatureMatch) {
  return res.status(400).json({ 
    error: 'File content does not match declared type. Upload rejected for security.' 
  });
}

// Additional PDF validation: Check for potentially malicious content
if (contentType === 'application/pdf') {
  const pdfContent = bytes.toString('binary');
  
  // Check for JavaScript in PDF
  if (pdfContent.includes('/JavaScript') || pdfContent.includes('/JS')) {
    return res.status(400).json({ 
      error: 'PDF files with embedded JavaScript are not allowed for security reasons.' 
    });
  }
  
  // Check for embedded executables
  if (pdfContent.includes('/EmbeddedFile') || pdfContent.includes('/Launch')) {
    return res.status(400).json({ 
      error: 'PDF files with embedded executables are not allowed for security reasons.' 
    });
  }
}
```

#### Testing Checklist:
- [ ] Valid JPEG files upload successfully
- [ ] Valid PNG files upload successfully
- [ ] Valid PDF files upload successfully
- [ ] File type spoofing is detected and rejected
- [ ] PDFs with JavaScript are rejected
- [ ] Files with mismatched extension and content type are rejected
- [ ] Magic byte validation works correctly

---

### FIX-MEDIUM-4: Implement Email HTML Sanitization

**File**: `api/send-email.js`  
**Action**: Install and use DOMPurify or sanitize-html

#### Install Dependency:
```powershell
npm install isomorphic-dompurify
```

#### Updated Code:
```javascript
import DOMPurify from 'isomorphic-dompurify';
import { getSupabase, requireSession, applyCors } from './auth.js';
import { sendEmailViaResend, extractResendErrorMessage } from './resend-sender.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Configure DOMPurify for email content
const DOMPURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'em', 'u', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'img', 'div', 'span', 'pre', 'code'
  ],
  ALLOWED_ATTR: [
    'href', 'title', 'alt', 'src', 'width', 'height', 'style', 'class'
  ],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  KEEP_CONTENT: true,
  RETURN_TRUSTED_TYPE: false
};

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

  // Sanitize subject to remove HTML/scripts
  const cleanSubject = subject.replace(/<[^>]*>/g, '').trim().slice(0, 200);
  
  // Sanitize HTML content if provided
  let cleanHtml = html;
  if (html && typeof html === 'string') {
    cleanHtml = DOMPurify.sanitize(html, DOMPURIFY_CONFIG);
    
    // Additional check: Ensure sanitization didn't result in empty content
    if (cleanHtml.trim().length === 0 && html.trim().length > 0) {
      return res.status(400).json({ 
        error: 'Email content was rejected due to potentially malicious HTML' 
      });
    }
  }
  
  // Sanitize plain text (remove any HTML that might have been injected)
  let cleanText = text;
  if (text && typeof text === 'string') {
    cleanText = text.replace(/<[^>]*>/g, '').trim();
  }

  const rawFrom = customFrom || process.env.RESEND_FROM_EMAIL || 'Pragyan Institute <noreply@pragyaninstitute.com>';
  const fromEmailMatch = rawFrom.match(/<([^>]+)>/) || [null, rawFrom];
  const fromEmail = (fromEmailMatch[1] || rawFrom).trim();
  const isFromValid = EMAIL_PATTERN.test(fromEmail);
  const from = isFromValid ? rawFrom : 'Pragyan Institute <noreply@pragyaninstitute.com>';

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

    const result = await sendEmailViaResend({ 
      from, 
      to: recipients, 
      subject: cleanSubject, 
      html: cleanHtml, 
      text: cleanText 
    });
    
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
```

#### Testing Checklist:
- [ ] Normal HTML emails work correctly
- [ ] Script tags are stripped from HTML
- [ ] Malicious event handlers (onclick, onerror) are removed
- [ ] Allowed HTML tags remain intact
- [ ] Links are preserved but validated
- [ ] Images are preserved with src validation

---

## Phase 4: Low Priority Fixes (P3-P4 - Backlog)

**Total Duration**: 2-3 hours  
**Risk Level**: Low  
**Testing Required**: Light

---

### FIX-LOW-1: Sanitize Error Messages

**Files**: Multiple API files  
**Effort**: 1.5 hours

#### Create Centralized Error Handler:

**New File**: `api/_lib/errors.js`
```javascript
// Production-safe error messages
export class ApiError extends Error {
  constructor(message, statusCode = 500, exposeToClient = false) {
    super(message);
    this.statusCode = statusCode;
    this.exposeToClient = exposeToClient;
  }
}

export function handleError(error, res, logPrefix = 'API Error') {
  // Log full error details server-side
  console.error(`${logPrefix}:`, {
    message: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString()
  });
  
  // Determine what to send to client
  let statusCode = 500;
  let clientMessage = 'An unexpected error occurred. Please try again.';
  
  if (error instanceof ApiError) {
    statusCode = error.statusCode;
    if (error.exposeToClient) {
      clientMessage = error.message;
    }
  } else if (error.statusCode) {
    statusCode = error.statusCode;
  }
  
  // Never expose internal errors in production
  if (process.env.NODE_ENV === 'production') {
    if (statusCode === 500) {
      clientMessage = 'An internal error occurred. Please contact support if this persists.';
    }
  } else {
    // In development, include error details
    clientMessage = error.message;
  }
  
  return res.status(statusCode).json({ 
    error: clientMessage,
    ...(process.env.NODE_ENV !== 'production' && { debug: error.stack })
  });
}

// Generic error messages by category
export const ERROR_MESSAGES = {
  AUTH_REQUIRED: 'Authentication required. Please sign in.',
  AUTH_INVALID: 'Your session has expired. Please sign in again.',
  AUTH_FORBIDDEN: 'You do not have permission for this action.',
  INVALID_INPUT: 'Invalid request data. Please check your input.',
  NOT_FOUND: 'The requested resource was not found.',
  RATE_LIMIT: 'Too many requests. Please try again later.',
  SERVER_ERROR: 'An internal error occurred. Please try again.',
  DB_ERROR: 'Database operation failed. Please try again.',
};
```

#### Update api/auth.js to use sanitized errors:
```javascript
import { handleError, ERROR_MESSAGES, ApiError } from './_lib/errors.js';

export function requireSession(req, res, allowedRoles = []) {
  const token = readBearerToken(req);
  if (!token) {
    res.status(401).json({ error: ERROR_MESSAGES.AUTH_REQUIRED });
    return null;
  }

  // ... existing code ...

  try {
    const session = jwt.verify(token, secret, { algorithms: ['HS256'] });
    
    if (allowedRoles.length && !allowedRoles.includes(session.role)) {
      res.status(403).json({ error: ERROR_MESSAGES.AUTH_FORBIDDEN });
      return null;
    }
    
    return session;
  } catch (jwtErr) {
    // Log full error server-side (don't expose to client)
    console.error('JWT verification failed:', jwtErr.message);
    
    // Send generic message to client
    res.status(401).json({ error: ERROR_MESSAGES.AUTH_INVALID });
    return null;
  }
}
```

---

### FIX-LOW-2: Add Security Headers

**File**: `vercel.json` (create if doesn't exist)

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-XSS-Protection",
          "value": "1; mode=block"
        },
        {
          "key": "Referrer-Policy",
          "value": "strict-origin-when-cross-origin"
        },
        {
          "key": "Permissions-Policy",
          "value": "camera=(), microphone=(), geolocation=()"
        }
      ]
    },
    {
      "source": "/api/(.*)",
      "headers": [
        {
          "key": "Strict-Transport-Security",
          "value": "max-age=31536000; includeSubDomains; preload"
        },
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; img-src 'self' data: https:; connect-src 'self' https://*.supabase.co; frame-ancestors 'none';"
        }
      ]
    }
  ]
}
```

---

## Phase 5: Post-Deployment Validation

### 5.1 Automated Security Testing
**Duration**: 2 hours

**Create Security Test Suite**:

**New File**: `tests/security.test.js`
```javascript
const assert = require('assert');
const fetch = require('node-fetch');

const API_BASE = process.env.API_BASE || 'http://localhost:3000';

describe('Security Tests', function() {
  this.timeout(10000);
  
  describe('Authentication Bypass Prevention', () => {
    it('should reject token with "admin" substring', async () => {
      const res = await fetch(`${API_BASE}/api/admin-trigger-billing`, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer my_admin_token',
          'Content-Type': 'application/json'
        }
      });
      
      assert.strictEqual(res.status, 401, 'Should reject fake admin token');
      const data = await res.json();
      assert.ok(data.error, 'Should return error message');
    });
    
    it('should reject malformed JWT', async () => {
      const res = await fetch(`${API_BASE}/api/admin-trigger-billing`, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer invalid.jwt.token',
          'Content-Type': 'application/json'
        }
      });
      
      assert.strictEqual(res.status, 401);
    });
    
    it('should require valid JWT for protected endpoints', async () => {
      const endpoints = [
        '/api/admin-password',
        '/api/approve-payment-request',
        '/api/upload-file',
        '/api/send-email'
      ];
      
      for (const endpoint of endpoints) {
        const res = await fetch(`${API_BASE}${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        
        assert.strictEqual(res.status, 401, `${endpoint} should require auth`);
      }
    });
  });
  
  describe('Rate Limiting', () => {
    it('should enforce rate limits on login endpoint', async () => {
      const results = [];
      
      // Make 10 rapid requests
      for (let i = 0; i < 10; i++) {
        const res = await fetch(`${API_BASE}/api/auth-login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'admin', identifier: 'test', credential: 'test' })
        });
        results.push(res.status);
      }
      
      // Should have at least one 429 (rate limited)
      assert.ok(results.includes(429), 'Should rate limit after multiple requests');
    });
  });
  
  describe('Input Validation', () => {
    it('should reject weak passwords', async () => {
      const res = await fetch(`${API_BASE}/api/student-password`, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer valid_token_here',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ newPassword: '123' })
      });
      
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.ok(data.error.includes('8 characters'), 'Should reject short password');
    });
    
    it('should reject invalid file types', async () => {
      const res = await fetch(`${API_BASE}/api/upload-file`, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer valid_token_here',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          folder: 'profile_pictures',
          fileName: 'test.exe',
          contentType: 'application/x-msdownload',
          base64: 'TWFsaWNpb3VzRmlsZQ=='
        })
      });
      
      assert.strictEqual(res.status, 400);
    });
  });
  
  describe('Security Headers', () => {
    it('should include security headers in API responses', async () => {
      const res = await fetch(`${API_BASE}/api/health`);
      
      assert.ok(res.headers.get('x-content-type-options'), 'Should have X-Content-Type-Options');
      assert.ok(res.headers.get('x-frame-options'), 'Should have X-Frame-Options');
      assert.strictEqual(res.headers.get('x-frame-options'), 'DENY');
    });
  });
});
```

**Run Tests**:
```powershell
npm test -- tests/security.test.js
```

---

### 5.2 Manual Penetration Testing Checklist

- [ ] **Authentication Tests**:
  - [ ] Try logging in with SQL injection payloads
  - [ ] Attempt session hijacking with modified JWT
  - [ ] Test password reset flow for vulnerabilities
  - [ ] Verify rate limiting on login endpoints

- [ ] **Authorization Tests**:
  - [ ] Student accessing admin-only endpoints
  - [ ] Admin accessing other admin's data
  - [ ] Unauthenticated access to protected resources

- [ ] **Input Validation Tests**:
  - [ ] XSS payloads in form fields
  - [ ] SQL injection in search/filter fields
  - [ ] Path traversal in file upload
  - [ ] Command injection in any system calls

- [ ] **File Upload Tests**:
  - [ ] Upload executable disguised as image
  - [ ] Upload oversized file
  - [ ] Upload file with malicious filename
  - [ ] Upload PDF with JavaScript

- [ ] **Session Management Tests**:
  - [ ] Token expiration enforcement
  - [ ] Token reuse after logout
  - [ ] Concurrent session handling

---

### 5.3 Production Deployment Checklist

- [ ] All environment variables configured correctly
- [ ] Secrets rotated and old secrets revoked
- [ ] Rate limiting middleware deployed
- [ ] Security headers configured in Vercel
- [ ] HTTPS enforced (no HTTP access)
- [ ] Database backups automated
- [ ] Audit logging enabled
- [ ] Error tracking configured (Sentry/LogRocket)
- [ ] Security monitoring alerts set up
- [ ] Incident response plan documented
- [ ] Team trained on security best practices

---

## Rollback Plan

### If Critical Issues Arise After Deployment:

**Step 1: Immediate Revert**
```powershell
# Revert to previous deployment on Vercel
vercel rollback

# Or via Vercel Dashboard:
# Deployments > [Previous Deployment] > Promote to Production
```

**Step 2: Restore Environment Variables**
```powershell
# If secrets were rotated, temporarily restore old secrets
# Vercel Dashboard > Settings > Environment Variables > Edit
```

**Step 3: Git Revert**
```powershell
git revert HEAD
git push origin main
```

**Step 4: Incident Communication**
```markdown
Subject: Security Patch Rollback Notice

Team,

We have rolled back the security patch deployment due to [specific issue].

Current Status:
- Production is running on previous stable version
- All services are operational
- No data loss occurred

Next Steps:
- Root cause analysis: [timeline]
- Fix development: [timeline]
- Redeployment: [timeline]

Please contact [security lead] with any questions.
```

---

## Estimated Timeline

| Phase | Duration | Dependencies | Can Run in Parallel |
|-------|----------|--------------|---------------------|
| Phase 0: Preparation | 45 min | None | No |
| Phase 1: Critical Fixes | 3 hours | Phase 0 | No |
| Phase 2: High Priority | 6 hours | Phase 1 | Some tasks |
| Phase 3: Medium Priority | 6 hours | Phase 1 | Yes |
| Phase 4: Low Priority | 3 hours | None | Yes |
| Phase 5: Validation | 2 hours | All phases | No |
| **Total** | **20 hours** | | |

**Recommended Schedule**:
- **Day 1**: Phase 0 + Phase 1 (Critical fixes) + Deploy + Monitor
- **Day 2**: Phase 2 (High priority fixes) + Deploy + Monitor
- **Day 3-4**: Phase 3 (Medium priority fixes) + Deploy
- **Day 5**: Phase 4 (Low priority) + Final validation

---

## Success Criteria

- [x] Zero critical vulnerabilities in production
- [x] All authentication flows use JWT with strong secrets
- [x] Rate limiting prevents brute-force attacks
- [x] Input validation prevents injection attacks
- [x] File uploads are properly validated
- [x] Error messages don't leak implementation details
- [x] Security headers are properly configured
- [x] All tests pass (19/19 suites + new security tests)
- [x] Penetration testing completed with no findings
- [x] Team trained and documentation updated

---

**Document Version**: 1.0  
**Last Updated**: 2026-08-17  
**Next Review**: After Phase 1 deployment  
**Owner**: Development Team Lead
