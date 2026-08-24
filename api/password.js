import bcrypt from 'bcryptjs';
import { getSupabase, requireSession, applyCors } from './_lib/auth.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Determine if this is an admin self-password change or student password management
  const isAdminSelfChange = (req.url && req.url.includes('admin-password')) || (req.body && typeof req.body.currentPassword === 'string');

  if (isAdminSelfChange) {
    const session = requireSession(req, res, ['admin']);
    if (!session) return;

    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || newPassword.length < 12) {
      return res.status(400).json({ error: 'Use your current password and a new password of at least 12 characters' });
    }

    const supabase = getSupabase();
    if (!supabase) return res.status(503).json({ error: 'Server database configuration is missing' });
    try {
      const { data: admin, error } = await supabase
        .from('admins')
        .select('admin_id,password,password_hash')
        .eq('admin_id', session.sub)
        .maybeSingle();
      if (error) throw error;
      const valid = admin?.password_hash
        ? await bcrypt.compare(currentPassword, admin.password_hash)
        : admin?.password === currentPassword;
      if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

      const password_hash = await bcrypt.hash(newPassword, 12);
      const { error: updateError } = await supabase
        .from('admins')
        .update({ password_hash, password: null })
        .eq('admin_id', session.sub);
      if (updateError) throw updateError;
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Admin password update failed:', error.message);
      return res.status(500).json({ error: 'Unable to update password' });
    }
  }

  // Student password update or Admin resetting student password
  const session = requireSession(req, res, ['student', 'admin']);
  if (!session) return;

  const supabase = getSupabase();
  if (!supabase) {
    return res.status(503).json({ success: false, error: 'Server database configuration is missing' });
  }

  try {
    const { newPassword, studentId, resetToDob } = req.body || {};

    if (session.role === 'student') {
      // Student updating their own password
      if (typeof newPassword !== 'string' || newPassword.trim().length < 4) {
        return res.status(400).json({ success: false, error: 'Password must be at least 4 characters long' });
      }

      const cleanPassword = newPassword.trim();
      const password_hash = await bcrypt.hash(cleanPassword, 10);
      const studentSub = session.sub;

      // Find student record to get full metadata
      const { data: student } = await supabase
        .from('students')
        .select('*')
        .or(`student_id.eq.${studentSub},roll_no.eq.${studentSub},id.eq.${studentSub}`)
        .maybeSingle();

      const rollNo = student?.roll_no || studentSub;
      const sId = student?.student_id || student?.id || studentSub;
      const sName = student?.name || session.name || 'Student';
      const sClass = student?.class_name || 'General';

      // Check for existing password request record
      const { data: existingRecords } = await supabase
        .from('student_requests')
        .select('id')
        .eq('req_type', 'PASSWORD_UPDATE')
        .or(`student_id.eq.${sId},student_id.eq.${rollNo},roll_no.eq.${rollNo}`)
        .order('created_at', { ascending: false });

      if (existingRecords && existingRecords.length > 0) {
        const { error: updateError } = await supabase
          .from('student_requests')
          .update({
            status: 'Active',
            new_data: {
              password_hash,
              updated_at: new Date().toISOString(),
              updated_by: 'student'
            },
            updated_at: new Date().toISOString()
          })
          .eq('id', existingRecords[0].id);

        if (updateError) throw updateError;
      } else {
        const reqId = `PWD-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const { error: insertError } = await supabase
          .from('student_requests')
          .insert({
            request_id: reqId,
            student_id: sId,
            student_name: sName,
            roll_no: rollNo,
            class_name: sClass,
            req_type: 'PASSWORD_UPDATE',
            status: 'Active',
            request_date: new Date().toISOString().split('T')[0],
            old_data: {},
            new_data: {
              password_hash,
              updated_at: new Date().toISOString(),
              updated_by: 'student'
            }
          });

        if (insertError) throw insertError;
      }

      return res.status(200).json({
        success: true,
        message: 'Password updated successfully. You can now log in with your new password.'
      });

    } else if (session.role === 'admin') {
      // Admin resetting student password
      const targetStudentId = String(studentId || '').trim();
      if (!targetStudentId) {
        return res.status(400).json({ success: false, error: 'Student ID is required for admin password reset' });
      }

      const { data: student, error: studentError } = await supabase
        .from('students')
        .select('*')
        .or(`student_id.eq.${targetStudentId},roll_no.eq.${targetStudentId},id.eq.${targetStudentId}`)
        .maybeSingle();

      if (studentError || !student) {
        return res.status(404).json({ success: false, error: 'Student record not found' });
      }

      const rollNo = student.roll_no || student.student_id || student.id;
      const sId = student.student_id || student.id;
      const sName = student.name || 'Student';
      const sClass = student.class_name || 'General';

      if (resetToDob) {
        const { data: existingRecords } = await supabase
          .from('student_requests')
          .select('id')
          .eq('req_type', 'PASSWORD_UPDATE')
          .or(`student_id.eq.${sId},student_id.eq.${rollNo},roll_no.eq.${rollNo}`);

        if (existingRecords && existingRecords.length > 0) {
          const ids = existingRecords.map(r => r.id);
          const { error: updateError } = await supabase
            .from('student_requests')
            .update({
              status: 'RESET_TO_DOB',
              new_data: {
                password_hash: null,
                reset_to_dob: true,
                reset_at: new Date().toISOString(),
                reset_by: 'admin'
              },
              updated_at: new Date().toISOString()
            })
            .in('id', ids);

          if (updateError) throw updateError;
        }

        return res.status(200).json({
          success: true,
          message: `Password for ${student.name} (${student.student_id}) has been reset to Date of Birth (DDMMYYYY format).`
        });

      } else {
        if (typeof newPassword !== 'string' || newPassword.trim().length < 4) {
          return res.status(400).json({ success: false, error: 'Password must be at least 4 characters long' });
        }

        const cleanPassword = newPassword.trim();
        const password_hash = await bcrypt.hash(cleanPassword, 10);

        const { data: existingRecords } = await supabase
          .from('student_requests')
          .select('id')
          .eq('req_type', 'PASSWORD_UPDATE')
          .or(`student_id.eq.${sId},student_id.eq.${rollNo},roll_no.eq.${rollNo}`)
          .order('created_at', { ascending: false });

        if (existingRecords && existingRecords.length > 0) {
          const { error: updateError } = await supabase
            .from('student_requests')
            .update({
              status: 'Active',
              new_data: {
                password_hash,
                updated_at: new Date().toISOString(),
                updated_by: 'admin'
              },
              updated_at: new Date().toISOString()
            })
            .eq('id', existingRecords[0].id);

          if (updateError) throw updateError;
        } else {
          const reqId = `PWD-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
          const { error: insertError } = await supabase
            .from('student_requests')
            .insert({
              request_id: reqId,
              student_id: sId,
              student_name: sName,
              roll_no: rollNo,
              class_name: sClass,
              req_type: 'PASSWORD_UPDATE',
              status: 'Active',
              request_date: new Date().toISOString().split('T')[0],
              old_data: {},
              new_data: {
                password_hash,
                updated_at: new Date().toISOString(),
                updated_by: 'admin'
              }
            });

          if (insertError) throw insertError;
        }

        return res.status(200).json({
          success: true,
          message: `Password for ${student.name} (${student.student_id}) has been updated successfully.`
        });
      }
    }
  } catch (error) {
    console.error('Password operation failed:', error.message || error);
    return res.status(500).json({ success: false, error: 'Internal server error processing password update' });
  }
}
