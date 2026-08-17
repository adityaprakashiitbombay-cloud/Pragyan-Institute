# Security Policy & Best Practices

## 🔒 Security Overview

This document outlines the security measures implemented in the Pragyan Institute portal system and provides guidelines for secure deployment and maintenance.

## Critical Security Requirements

### ✅ **IMPLEMENTED (Fixed)**

1. **Environment Variables Protection**
   - All API keys removed from source code
   - Configuration uses environment variables only
   - `.env.example` contains only placeholders
   - Real credentials must be set via hosting platform

2. **Input Sanitization**
   - All database queries use sanitized and encoded inputs
   - XSS protection via HTML escaping
   - SQL injection prevention with proper encoding

3. **Rate Limiting Recommendations**
   - Polling interval reduced from 4s to 30s
   - Login attempts should be rate-limited server-side
   - API endpoints should implement rate limiting

4. **localStorage Security**
   - Quota management with automatic cleanup
   - User warnings when storage is full
   - Critical data prioritization

5. **Payment Validation**
   - UTR duplicate checking
   - Amount range validation (₹100 - ₹100,000)
   - Input format validation (alphanumeric only)

### ⚠️ **REQUIRES SERVER-SIDE IMPLEMENTATION**

The following security measures MUST be implemented server-side before production deployment:

#### 1. **Password Hashing**
**Status**: ❌ Currently using plain text (INSECURE)

**Required Implementation**:
```javascript
// In api/auth-login.js (or similar server endpoint)
const bcrypt = require('bcryptjs');

// Hash password on registration
const hashedPassword = await bcrypt.hash(password, 10);

// Verify password on login
const isValid = await bcrypt.compare(inputPassword, user.password_hash);
```

**Action Items**:
- Install bcryptjs: `npm install bcryptjs`
- Hash all existing admin passwords in database
- Update login API to use bcrypt verification
- Never send password hashes to client

#### 2. **JWT Token Authentication**
**Status**: ⚠️ Basic tokens without encryption

**Required Implementation**:
```javascript
const jwt = require('jsonwebtoken');

// Generate secure token
const token = jwt.sign(
  { userId, role, exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24) },
  process.env.PORTAL_SESSION_SECRET,
  { algorithm: 'HS256' }
);

// Verify token on protected routes
const decoded = jwt.verify(token, process.env.PORTAL_SESSION_SECRET);
```

#### 3. **Row Level Security (RLS)**
**Status**: ❌ Using ANON key bypasses RLS

**Required Configuration** (Supabase SQL):
```sql
-- Enable RLS on all tables
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE notices ENABLE ROW LEVEL SECURITY;

-- Student can only see their own data
CREATE POLICY "Students can view own data"
  ON students FOR SELECT
  USING (auth.uid() = id OR mobile = current_setting('request.jwt.claims')::json->>'phone');

-- Admin can see all data
CREATE POLICY "Admins can view all"
  ON students FOR ALL
  USING (auth.role() = 'admin');
```

#### 4. **CSRF Protection**
**Status**: ❌ Not implemented

**Required Implementation**:
```javascript
// Install: npm install csurf
const csrf = require('csurf');
const csrfProtection = csrf({ cookie: true });

app.use(csrfProtection);

// Send token with forms
res.render('form', { csrfToken: req.csrfToken() });
```

#### 5. **Rate Limiting**
**Status**: ❌ Not implemented

**Required Implementation**:
```javascript
// Install: npm install express-rate-limit
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: 'Too many login attempts. Please try again after 15 minutes.'
});

app.post('/api/auth-login', loginLimiter, authController.login);
```

## Environment Variables Setup

### Production Deployment Checklist

- [ ] Set all environment variables in hosting platform (Vercel/Netlify)
- [ ] Generate secure secrets: `openssl rand -hex 32`
- [ ] Never commit `.env` file to git
- [ ] Rotate API keys regularly (every 90 days)
- [ ] Use different keys for development/staging/production

### Required Environment Variables

```bash
# Critical - Must be set
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=  # Keep secret, server-only
PORTAL_SESSION_SECRET=       # Generate: openssl rand -hex 32
CRON_SECRET=                 # Generate: openssl rand -hex 32

# Optional but recommended
RESEND_API_KEY=
GEMINI_API_KEY=
STREAM_API_KEY=
STREAM_API_SECRET=
```

## Secure Coding Practices

### Input Validation
```javascript
// Always sanitize user inputs
function sanitizeInput(str) {
  return String(str).replace(/[^\w\-@.]/g, '').trim();
}

// Validate before database operations
if (!validateEmail(email) || !validatePhone(phone)) {
  throw new Error('Invalid input format');
}
```

### Output Encoding
```javascript
// Always escape HTML output
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;',
    '"': '&quot;', "'": '&#39;'
  }[m]));
}
```

### Secure File Uploads
```javascript
// Validate file type and size
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

if (!ALLOWED_TYPES.includes(file.type)) {
  throw new Error('Invalid file type');
}

if (file.size > MAX_FILE_SIZE) {
  throw new Error('File too large');
}
```

## Database Security

### Supabase Security Checklist

- [ ] Enable Row Level Security (RLS) on all tables
- [ ] Create appropriate policies for each role
- [ ] Use service role key only in secure server environments
- [ ] Never expose service role key to client
- [ ] Regularly audit access logs
- [ ] Enable audit logging in Supabase dashboard

### Backup Strategy

- [ ] Enable automated daily backups in Supabase
- [ ] Export critical data weekly
- [ ] Test restore procedures monthly
- [ ] Keep backups encrypted

## API Security

### Server-Side Validation

All API endpoints must:
1. Validate authentication token
2. Verify user permissions
3. Sanitize all inputs
4. Rate limit requests
5. Log security events

### Example Secure API Endpoint
```javascript
async function secureEndpoint(req, res) {
  try {
    // 1. Verify JWT token
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = jwt.verify(token, process.env.PORTAL_SESSION_SECRET);

    // 2. Check permissions
    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    // 3. Sanitize inputs
    const sanitizedInput = sanitizeInput(req.body.data);

    // 4. Validate inputs
    if (!isValid(sanitizedInput)) {
      return res.status(400).json({ error: 'Invalid input' });
    }

    // 5. Process request
    const result = await processData(sanitizedInput);

    // 6. Return response
    res.json({ success: true, data: result });

  } catch (error) {
    // 7. Log error (don't expose details to client)
    console.error('Endpoint error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
```

## Monitoring & Incident Response

### Security Monitoring

1. **Enable Logging**
   - All authentication attempts
   - Failed login attempts
   - Database modifications
   - API errors

2. **Set Up Alerts**
   - Multiple failed login attempts
   - Unusual database activity
   - API rate limit violations
   - Storage quota warnings

3. **Regular Audits**
   - Review access logs weekly
   - Check for suspicious patterns
   - Audit user permissions monthly
   - Review API usage statistics

### Incident Response Plan

1. **Detection**: Monitor logs and alerts
2. **Containment**: Disable compromised accounts
3. **Investigation**: Identify breach scope
4. **Remediation**: Fix vulnerabilities
5. **Recovery**: Restore normal operations
6. **Post-Incident**: Document lessons learned

## Compliance & Privacy

### Data Protection

- Collect only necessary user data
- Store sensitive data encrypted
- Implement data retention policies
- Provide data export/deletion on request
- Follow local data protection laws

### Student Data Privacy

- Obtain parental consent for minors
- Protect student personal information
- Limit staff access to need-to-know basis
- Secure communication channels
- Regular privacy training for staff

## Contact

For security concerns or to report vulnerabilities:
- **Email**: security@pragyaninstitute.com
- **Emergency**: Contact director immediately

## Version History

- **v2.0** (2026-08-17): Comprehensive security fixes
- **v1.0** (Initial): Basic implementation

---

**Last Updated**: 2026-08-17
**Next Review**: 2026-11-17 (Quarterly review recommended)
