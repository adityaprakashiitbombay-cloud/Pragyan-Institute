import bcrypt from 'bcryptjs';
import { getSupabase, createSession, publicAdmin, applyCors } from './auth.js';

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
        .or(`username.eq.${safeAdminId},email.eq.${safeAdminId},admin_id.eq.${safeAdminId}`);

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
        return res.status(401).json({ success: false, error: 'Invalid admin username or password' });
      }

      const adminId = admin.admin_id || admin.id;
      const token = createSession({ sub: adminId, role: 'admin', name: admin.name });
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
        const str = d.toString().trim();
        const results = [];
        if (/^\d{4}-\d{2}-\d{2}$/.test(str)) results.push(str);
        const parts = str.split(/[-/.]/);
        if (parts.length === 3) {
          if (parts[2].length === 4) {
            results.push(`${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`);
            results.push(`${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`);
          } else if (parts[0].length === 4) {
            results.push(`${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`);
          }
        }
        const parsed = new Date(str);
        if (!isNaN(parsed.getTime())) results.push(parsed.toISOString().split('T')[0]);
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

        // 2. Check Date of Birth (DOB) as default / fallback
        const studentNorms = normalizeDob(s.dob);
        const dobMatch = inputNorms.some(i => studentNorms.includes(i));
        const dobDigits = String(s.dob || '').replace(/\D/g, '');
        const rawDigitsMatch = inputDigits.length >= 6 && (inputDigits === dobDigits || dobDigits.includes(inputDigits));
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

      const student = matchedStudent;
      const studentId = student.student_id || student.id;
      const token = createSession({ sub: studentId, role: 'student', name: student.name });
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
