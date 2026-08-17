# 🚀 Production Deployment Checklist

## Pre-Deployment Security Audit

### ✅ **Critical Security Items**

- [ ] **Remove all hardcoded credentials from code**
  - Check `js/config.js` - should NOT contain real API keys
  - Verify `.env.example` contains only placeholders
  - Ensure `.env` is in `.gitignore`

- [ ] **Set up environment variables in hosting platform**
  - Vercel: Project Settings → Environment Variables
  - Netlify: Site Settings → Build & Deploy → Environment
  - Set all variables from `.env.example`

- [ ] **Generate secure secrets**
  ```bash
  # Generate PORTAL_SESSION_SECRET
  openssl rand -hex 32
  
  # Generate CRON_SECRET
  openssl rand -hex 32
  ```

- [ ] **Enable Supabase Row Level Security (RLS)**
  - Run SQL scripts from `supabase_security_rls_fix.sql`
  - Test policies with student and admin accounts
  - Verify data isolation works correctly

- [ ] **Implement server-side password hashing**
  - Install bcryptjs: `npm install bcryptjs`
  - Update all API authentication endpoints
  - Migrate existing passwords to hashed format
  - Test login with hashed passwords

### 🔒 **Authentication & Authorization**

- [ ] **Implement JWT authentication properly**
  - Install jsonwebtoken: `npm install jsonwebtoken`
  - Update `/api/auth-login` endpoint
  - Add token verification middleware
  - Set secure token expiration (24 hours recommended)

- [ ] **Add rate limiting to APIs**
  - Install express-rate-limit: `npm install express-rate-limit`
  - Limit login attempts: 5 per 15 minutes
  - Limit API calls: 100 per 15 minutes
  - Test rate limiting works

- [ ] **Implement CSRF protection**
  - Install csurf: `npm install csurf`
  - Add CSRF tokens to forms
  - Verify protection works

### 📊 **Database & Data**

- [ ] **Backup current database**
  - Export all tables from Supabase
  - Store backups securely
  - Test restore procedure

- [ ] **Set up automated backups**
  - Enable daily backups in Supabase
  - Configure backup retention (30 days minimum)
  - Test backup restoration

- [ ] **Audit data permissions**
  - Review all RLS policies
  - Test student can only see own data
  - Test admin can see all data
  - Verify no data leaks between students

- [ ] **Add database constraints**
  - Unique constraint on UTR numbers
  - Unique constraint on student IDs
  - Check constraints on amount ranges
  - Test constraints work

### 🌐 **Frontend Security**

- [ ] **Enable HTTPS only**
  - Force HTTPS redirects
  - Set HSTS headers
  - Test mixed content warnings

- [ ] **Add Content Security Policy (CSP)**
  ```html
  <meta http-equiv="Content-Security-Policy" 
        content="default-src 'self'; 
                 script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net;
                 style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com;
                 img-src 'self' data: https:;
                 font-src 'self' https://fonts.gstatic.com;">
  ```

- [ ] **Implement Subresource Integrity (SRI)**
  - Add SRI hashes to CDN links
  - Test all external resources load correctly

- [ ] **Add security headers**
  ```javascript
  // In vercel.json or _headers file
  {
    "headers": [
      {
        "source": "/(.*)",
        "headers": [
          { "key": "X-Content-Type-Options", "value": "nosniff" },
          { "key": "X-Frame-Options", "value": "DENY" },
          { "key": "X-XSS-Protection", "value": "1; mode=block" },
          { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" }
        ]
      }
    ]
  }
  ```

### 🧪 **Testing**

- [ ] **Security testing**
  - Test SQL injection attempts
  - Test XSS attempts
  - Test CSRF attacks
  - Test rate limiting
  - Test authentication bypass attempts

- [ ] **Functional testing**
  - Test student login with DOB
  - Test admin login with password
  - Test fee payment submission
  - Test UTR duplicate detection
  - Test amount validation

- [ ] **Performance testing**
  - Test with 100+ concurrent users
  - Check database query performance
  - Monitor localStorage usage
  - Test on slow networks (3G)

- [ ] **Browser compatibility**
  - Test on Chrome, Firefox, Safari, Edge
  - Test on mobile browsers
  - Test on older browsers (IE11 if needed)
  - Fix any compatibility issues

### 📱 **Mobile & Responsive**

- [ ] **Test all features on mobile**
  - Login flows
  - Payment submission
  - Gallery touch events
  - Form inputs (especially date picker)

- [ ] **Optimize for mobile**
  - Compress images
  - Minify CSS/JS
  - Enable lazy loading
  - Test on slow connections

- [ ] **PWA features**
  - Test service worker caching
  - Test offline functionality
  - Add to home screen
  - Test push notifications (if enabled)

### 🎯 **Performance Optimization**

- [ ] **Optimize assets**
  - Compress all images (use WebP if possible)
  - Minify CSS and JavaScript
  - Enable Gzip/Brotli compression
  - Optimize font loading

- [ ] **CDN & Caching**
  - Set appropriate cache headers
  - Use CDN for static assets
  - Implement cache busting
  - Test cache invalidation

- [ ] **Database optimization**
  - Add indexes to frequently queried columns
  - Reduce polling frequency (already set to 30s)
  - Implement pagination for large datasets
  - Monitor query performance

### 📝 **Monitoring & Logging**

- [ ] **Set up error monitoring**
  - Integrate Sentry or similar service
  - Monitor client-side errors
  - Monitor API errors
  - Set up alerts for critical errors

- [ ] **Set up analytics**
  - Track page views
  - Track user interactions
  - Monitor conversion funnels
  - Privacy-compliant analytics only

- [ ] **Set up uptime monitoring**
  - Monitor main website
  - Monitor API endpoints
  - Monitor database connectivity
  - Set up alerts for downtime

### 🔄 **Post-Deployment**

- [ ] **Verify deployment**
  - Check all pages load correctly
  - Test login functionality
  - Submit test payment
  - Verify database writes

- [ ] **Monitor for 24 hours**
  - Watch error logs
  - Monitor performance metrics
  - Check for security alerts
  - Be ready to rollback if needed

- [ ] **Update documentation**
  - Document any configuration changes
  - Update API documentation
  - Update user manual
  - Update admin guide

- [ ] **Notify stakeholders**
  - Announce to staff
  - Send email to users (if applicable)
  - Update social media
  - Prepare support team

### 🔐 **Ongoing Maintenance**

- [ ] **Weekly tasks**
  - Review access logs
  - Check error reports
  - Monitor performance
  - Update content as needed

- [ ] **Monthly tasks**
  - Security audit
  - Database cleanup
  - Backup verification
  - Performance review

- [ ] **Quarterly tasks**
  - Update dependencies
  - Rotate API keys
  - Review permissions
  - Penetration testing

- [ ] **Annual tasks**
  - Comprehensive security audit
  - Disaster recovery drill
  - Update security policies
  - Staff security training

## Emergency Procedures

### If Security Breach Detected

1. **Immediate Actions**
   - Disable affected accounts
   - Revoke compromised API keys
   - Enable maintenance mode if needed

2. **Investigation**
   - Check access logs
   - Identify breach scope
   - Document timeline

3. **Remediation**
   - Fix vulnerabilities
   - Reset passwords
   - Notify affected users

4. **Prevention**
   - Update security measures
   - Review procedures
   - Document lessons learned

### If Site Goes Down

1. **Check status page**: https://status.supabase.com
2. **Verify environment variables** in hosting platform
3. **Check error logs** in hosting dashboard
4. **Test database connectivity**
5. **Rollback** to last working version if needed

## Contact Information

- **Technical Lead**: [Name & Email]
- **Database Admin**: [Name & Email]
- **Security Contact**: security@pragyaninstitute.com
- **Emergency**: [Phone Number]

---

**Last Updated**: 2026-08-17
**Next Review**: Before each major deployment
