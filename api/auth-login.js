import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { getSupabase, createSession, publicAdmin, applyCors } from './_lib/auth.js';
import { parseDeviceInfo, getClientIp } from './_lib/device-parser.js';

// In-memory rate limiter (use Redis in production for multi-instance deployments)
const loginAttempts = new Map(); // key: identifier, value: { count, resetTime }

/**
 * Canonical rate-limit key: strips formatting so `98765-43210`,
 * `+91 98765 43210`, ` 9876543210 ` and mixed-case usernames all land in
 * ONE bucket per real identity. Applied ONLY to limiter keys; credential
 * comparison still uses the raw sanitized input.
 */
function normalizeRateLimitKey(identifier) {
  const raw = String(identifier || '').trim().toLowerCase();
  // Keep a leading + for international numbers, strip every other separator.
  const compact = raw.startsWith('+') ? '+' + raw.slice(1).replace(/[\s\-()]/g, '') : raw.replace(/[\s\-()]/g, '');
  return compact || raw;
}

function cleanupExpiredAttempts() {
  const now = Date.now();
  if (loginAttempts.size > 50) {
    for (const [key, value] of loginAttempts.entries()) {
      if (value.resetTime < now) {
        loginAttempts.delete(key);
      }
    }
  }
}

function checkRateLimit(identifier) {
  cleanupExpiredAttempts();
  const now = Date.now();
  const window = 15 * 60 * 1000; // 15 minutes
  const maxAttempts = 5;

  const attempts = loginAttempts.get(identifier);
  if (attempts && attempts.resetTime > now) {
    if (attempts.count >= maxAttempts) {
      const remainingTime = Math.ceil((attempts.resetTime - now) / 60000);
      return {
        allowed: false,
        message: `Too many login attempts. Please try again in ${remainingTime} minute(s).`
      };
    }
    attempts.count++;
    return { allowed: true };
  } else {
    loginAttempts.set(identifier, { count: 1, resetTime: now + window });
    return { allowed: true };
  }
}

function resetRateLimit(identifier) {
  loginAttempts.delete(identifier);
}

// ── BUG-05: forensic login auditing ─────────────────────────────────────────
// Successes always log; failures are throttled to the first hit per identifier
// per warm instance so brute-force floods cannot also flood the audit table.
// Best-effort: auth must never 500 because telemetry did. Uses its own
// service-role client (the 429 path fires before any handler client exists).
const loginFailSeen = new Map();

function clientIpHash(req) {
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
    .toString().split(',')[0].trim();
  const salt = process.env.PORTAL_SESSION_SECRET || 'pragyan-ip-salt';
  return crypto.createHash('sha256').update(ip + salt).digest('hex').slice(0, 16);
}

function logAuditEvent({ ok, role, actor, identifier, reason = '', req }) {
  try {
    const supa = getSupabase();
    if (!supa) return;
    const key = `${role}:${identifier}`;
    if (!ok) {
      const n = (loginFailSeen.get(key) || 0) + 1;
      loginFailSeen.set(key, n);
      if (n > 1 && n % 5 !== 0) return; // 1st failure, then every 5th
    } else {
      loginFailSeen.delete(key);
    }
    supa.from('audit_logs').insert({
      log_id: `AUD-LOGIN-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      actor: actor || identifier,
      action_type: ok ? 'LOGIN_SUCCESS' : 'LOGIN_FAILED',
      student_name: role === 'student' ? (actor || identifier) : 'N/A',
      student_roll: identifier,
      description: `${ok ? 'Successful' : 'Failed'} ${role} login${reason ? ` (${reason})` : ''} · ip_hash=${clientIpHash(req)}`,
      details: { role, identifier, ip_hash: clientIpHash(req), outcome: ok ? 'success' : 'failure' }
    }).then(({ error }) => {
      if (error) console.warn('[auth-login] audit insert note:', error.message);
    });
  } catch (e) {
    console.warn('[auth-login] audit error:', e.message);
  }
}


export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { role, identifier, credential } = req.body || {};
    if (!role || !identifier || !credential) {
      return res.status(400).json({ success: false, error: 'Missing required login fields' });
    }
    if (role !== 'admin' && role !== 'student') {
      return res.status(400).json({ success: false, error: 'Invalid login role' });
    }

    const safeId = String(identifier || '').replace(/[\r\n,()"']/g, '').trim();

    // Check rate limit
    const rateLimitCheck = checkRateLimit(normalizeRateLimitKey(safeId));
    if (!rateLimitCheck.allowed) {
      logAuditEvent({ ok: false, role, actor: safeId, identifier: safeId, reason: 'rate-limited', req });
        return res.status(429).json({ success: false, error: rateLimitCheck.message });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return res.status(503).json({ success: false, error: 'Database configuration missing' });
    }

    if (role === 'admin') {
      const safeAdminId = String(identifier || '').replace(/[^a-zA-Z0-9@._-]/g, '').trim();
      if (!safeAdminId) {
        return res.status(400).json({ success: false, error: 'Valid username or email is required' });
      }

      const { data: admins, error } = await supabase
        .from('admins')
        .select('*')
        .or(`username.ilike.${safeAdminId},email.ilike.${safeAdminId},admin_id.ilike.${safeAdminId},mobile.eq.${safeAdminId}`);

      if (error) throw error;

      let admin = null;
      for (const a of (admins || [])) {
        if (a.password_hash) {
          const isMatch = await bcrypt.compare(String(credential), a.password_hash).catch(() => false);
          if (isMatch) { admin = a; break; }
        }
        if (a.password && String(a.password).trim() === String(credential).trim()) {
          admin = a;
          break;
        }
      }

      if (!admin) {
        logAuditEvent({ ok: false, role: 'admin', actor: safeAdminId, identifier: safeAdminId, reason: 'bad credentials', req });
      return res.status(401).json({ success: false, error: 'Invalid admin username or password' });
      }

      // Reset rate limit on successful login
      resetRateLimit(normalizeRateLimitKey(safeId));

      const adminId = admin.admin_id || admin.id;
      const tokenVersion = Number(admin.token_version) || 1;
      const sessionId = 'ADM-SES-' + crypto.randomUUID();
      const ip = getClientIp(req);
      const userAgent = req.headers['user-agent'] || '';
      const device = parseDeviceInfo(userAgent, ip);

      // Record active device session in public.admin_sessions table
      try {
        await supabase.from('admin_sessions').insert([{
          session_id: sessionId,
          admin_id: adminId,
          device_name: device.name,
          device_type: device.type,
          browser: device.browser,
          os: device.os,
          ip_address: device.ip,
          user_agent: userAgent.slice(0, 500),
          is_revoked: false,
          last_active_at: new Date().toISOString(),
          created_at: new Date().toISOString()
        }]);
      } catch (sesErr) {
        console.warn('[auth-login] Failed to record admin_session:', sesErr.message);
      }

      // Ensure both password (plaintext for admin view) and password_hash are synchronized in Supabase
      try {
        const syncUpdates = {};
        if (!admin.password || admin.password !== String(credential)) {
          syncUpdates.password = String(credential);
        }
        if (!admin.password_hash) {
          syncUpdates.password_hash = await bcrypt.hash(String(credential), 12);
        }
        if (Object.keys(syncUpdates).length > 0) {
          await supabase.from('admins').update(syncUpdates).or(`admin_id.eq.${adminId},id.eq.${adminId}`);
        }
      } catch (syncErr) {
        console.warn('[auth-login] Admin password sync notice:', syncErr.message);
      }

      const token = createSession({
        sub: adminId,
        role: 'admin',
        name: admin.name,
        username: admin.username || adminId,
        is_head: admin.is_head === true || String(admin.username || '').toLowerCase() === 'chandan',
        head: admin.is_head === true || String(admin.username || '').toLowerCase() === 'chandan',
        tv: tokenVersion,
        sid: sessionId
      });
      // BUG-05: forensic login audit (best-effort, never blocks auth).
      logAuditEvent({
        ok: true, role: 'admin', actor: admin.name || adminId,
        identifier: safeAdminId, req
      });
      return res.status(200).json({
        success: true,
        role: 'admin',
        token,
        user: publicAdmin({ ...admin, admin_id: adminId, id: adminId })
      });

    } else {
      // Student login with strictly validated identifier filters
      const safeStudentId = String(identifier || '').replace(/[^a-zA-Z0-9+_-]/g, '').trim();
      if (!safeStudentId) {
        return res.status(400).json({ success: false, error: 'Valid student ID, Roll No, or Mobile number is required' });
      }

      const orFilters = [
        `roll_no.eq.${safeStudentId}`,
        `student_id.eq.${safeStudentId}`
      ];

      const digitsOnly = safeStudentId.replace(/\D/g, '');
      if (digitsOnly.length >= 10) {
        const tenDigitMobile = digitsOnly.slice(-10);
        orFilters.push(`mobile.eq.${tenDigitMobile}`);
        orFilters.push(`mobile.eq.91${tenDigitMobile}`);
      }

      const { data: students, error } = await supabase
        .from('students')
        .select('*')
        .or(orFilters.join(','));

      function normalizeDob(d) {
        if (!d) return [];
        const str = String(d).trim();
        const results = [];

        // 1. ISO format: YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
          results.push(str);
        }

        // 2. 8 continuous digits: DDMMYYYY (Primary) or YYYYMMDD
        if (/^\d{8}$/.test(str)) {
          // DDMMYYYY
          const day = str.slice(0, 2);
          const month = str.slice(2, 4);
          const year = str.slice(4, 8);
          const yNum = parseInt(year, 10);
          const mNum = parseInt(month, 10);
          const dNum = parseInt(day, 10);
          if (yNum >= 1970 && yNum <= 2035 && mNum >= 1 && mNum <= 12 && dNum >= 1 && dNum <= 31) {
            results.push(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
          }

          // YYYYMMDD
          const y2 = str.slice(0, 4);
          const m2 = str.slice(4, 6);
          const d2 = str.slice(6, 8);
          const yNum2 = parseInt(y2, 10);
          const mNum2 = parseInt(m2, 10);
          const dNum2 = parseInt(d2, 10);
          if (yNum2 >= 1970 && yNum2 <= 2035 && mNum2 >= 1 && mNum2 <= 12 && dNum2 >= 1 && dNum2 <= 31) {
            results.push(`${y2}-${m2.padStart(2, '0')}-${d2.padStart(2, '0')}`);
          }
        }

        // 3. Separator-based dates: DD-MM-YYYY, DD/MM/YYYY, YYYY-MM-DD, etc.
        const parts = str.split(/[-/.]/);
        if (parts.length === 3) {
          if (parts[2].length === 4) {
            const y = parts[2];
            const m = parts[1].padStart(2, '0');
            const day = parts[0].padStart(2, '0');
            results.push(`${y}-${m}-${day}`);
          } else if (parts[0].length === 4) {
            const y = parts[0];
            const m = parts[1].padStart(2, '0');
            const day = parts[2].padStart(2, '0');
            results.push(`${y}-${m}-${day}`);
          }
        }

        // 4. Standard Date parse
        const parsed = new Date(str);
        if (!isNaN(parsed.getTime())) {
          try {
            results.push(parsed.toISOString().split('T')[0]);
          } catch(e) {}
        }

        return [...new Set(results)];
      }

      const inputNorms = normalizeDob(credential);
      const inputTrimmed = String(credential || '').trim();
      const inputDigits = inputTrimmed.replace(/\D/g, '');

      let matchedStudent = null;

      for (const s of (students || [])) {
        // 1. Check custom password in student_requests
        const sId = s.student_id || s.id;
        const sRoll = s.roll_no || sId;
        const { data: pwdReqs } = await supabase
          .from('student_requests')
          .select('*')
          .eq('req_type', 'PASSWORD_UPDATE')
          .or(`student_id.eq.${sId},student_id.eq.${sRoll},roll_no.eq.${sRoll}`)
          .order('created_at', { ascending: false })
          .limit(1);

        const activePwdReq = pwdReqs && pwdReqs[0] && pwdReqs[0].status === 'Active' ? pwdReqs[0] : null;

        if (activePwdReq && activePwdReq.new_data) {
          if (activePwdReq.new_data.password_hash) {
            const isMatch = await bcrypt.compare(inputTrimmed, activePwdReq.new_data.password_hash).catch(() => false);
            if (isMatch) {
              matchedStudent = s;
              break;
            }
          }
          if (activePwdReq.new_data.password && activePwdReq.new_data.password === inputTrimmed) {
            matchedStudent = s;
            break;
          }
        }

        // 2. Check Date of Birth (DOB) as default / fallback (with DDMMYYYY support)
        // SECURITY: comparison must be EXACT. A substring test here
        // (`dobDigits.includes(inputDigits)`) let any 6+ consecutive digits of
        // a student's DOB authenticate — a ~6-guess credential.
        const studentNorms = normalizeDob(s.dob);
        const dobMatch = inputNorms.some(i => studentNorms.includes(i));
        const dobDigits = String(s.dob || '').replace(/\D/g, '');
        let rawDigitsMatch = inputDigits.length >= 6 && inputDigits === dobDigits;

        // Check if input DDMMYYYY digits match student's DOB
        const stuNorm = studentNorms[0];
        if (!rawDigitsMatch && stuNorm && /^\d{4}-\d{2}-\d{2}$/.test(stuNorm)) {
          const [y, m, d] = stuNorm.split('-');
          const stuDDMMYYYY = `${d}${m}${y}`;
          const stuYYYYMMDD = `${y}${m}${d}`;
          if (inputDigits === stuDDMMYYYY || inputDigits === stuYYYYMMDD) {
            rawDigitsMatch = true;
          }
        }

        const rawStringMatch = inputTrimmed.toLowerCase() === String(s.dob || '').trim().toLowerCase();

        if (dobMatch || rawDigitsMatch || rawStringMatch) {
          matchedStudent = s;
          break;
        }
      }

      if (!matchedStudent) {
        return res.status(401).json({
          success: false,
          error: 'Student not found or incorrect Password / Date of Birth (DOB)'
        });
      }

      // Reset rate limit on successful login
      resetRateLimit(normalizeRateLimitKey(safeId));

      const student = matchedStudent;
      const studentId = student.student_id || student.id;
      const token = createSession({ sub: studentId, role: 'student', name: student.name });
      logAuditEvent({
        ok: true, role: 'student', actor: student.name || studentId,
        identifier: safeStudentId, req
      });
      return res.status(200).json({
        success: true,
        role: 'student',
        token,
        user: {
          student_id: studentId,
          id: studentId,
          name: student.name,
          mobile: student.mobile,
          dob: student.dob,
          email: student.email || '',
          roll_no: student.roll_no || studentId,
          rollNo: student.roll_no || studentId,
          class_name: student.class_name,
          className: student.class_name,
          guardian_name: student.guardian_name,
          guardianName: student.guardian_name,
          guardian_mobile: student.guardian_mobile,
          guardianMobile: student.guardian_mobile,
          blood_group: student.blood_group,
          bloodGroup: student.blood_group,
          address: student.address,
          photo: student.photo_url || student.photo || '',
          photo_url: student.photo_url || student.photo || '',
          photoUrl: student.photo_url || student.photo || '',
          paid_fee: Number(student.paid_fee) || 0,
          paidFee: Number(student.paid_fee) || 0,
          pending_fee: Number(student.pending_fee) || 0,
          pendingFee: Number(student.pending_fee) || 0,
          total_fee: Number(student.total_fee) || 0,
          totalFee: Number(student.total_fee) || 0,
          monthly_fee: Number(student.monthly_fee) || 1000,
          monthlyFee: Number(student.monthly_fee) || 1000
        }
      });
    }
  } catch (err) {
    console.error('/api/auth-login error:', err);
    return res.status(500).json({ success: false, error: 'Server authentication exception' });
  }
}
