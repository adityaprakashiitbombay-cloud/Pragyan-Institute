import bcrypt from 'bcryptjs';
import { getSupabase, requireSession, applyCors } from './_lib/auth.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Allow both student and admin roles
  const session = requireSession(req, res, ['student', 'admin']);
  if (!session) return;

  const supabase = getSupabase();
  if (!supabase) {
    return res.status(503).json({ success: false, error: 'Server database configuration is missing' });
  }

  try {
    const { newPassword, studentId, resetToDob } = req.body || {};

    if (session.role === 'student') {
      // Student updating their own password (no verification needed)
      if (typeof newPassword !== 'string' || newPassword.trim().length < 8) {
        return res.status(400).json({ success: false, error: 'Password must be at least 8 characters long' });
      }

      const cleanPassword = newPassword.trim();

      // Enforce password complexity
      const hasNumber = /\d/.test(cleanPassword);
      const hasLetter = /[a-zA-Z]/.test(cleanPassword);

      if (!hasNumber || !hasLetter) {
        return res.status(400).json({
          success: false,
          error: 'Password must contain both letters and numbers for security'
        });
      }

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
        // Update the existing record
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
        // Insert new password request record
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
      // Admin resetting student password to DOB or custom password
      const targetStudentId = String(studentId || '').trim();
      if (!targetStudentId) {
        return res.status(400).json({ success: false, error: 'Target student ID is required' });
      }

      // Lookup student to get roll number and DOB
      const { data: student } = await supabase
        .from('students')
        .select('*')
        .or(`student_id.eq.${targetStudentId},roll_no.eq.${targetStudentId},id.eq.${targetStudentId}`)
        .maybeSingle();

      if (!student) {
        return res.status(404).json({ success: false, error: 'Student record not found' });
      }

      const sId = student.student_id || student.id;
      const rollNo = student.roll_no || sId;

      if (resetToDob) {
        // Reset password to DOB by marking password requests as RESET_TO_DOB
        const { data: existingRecords } = await supabase
          .from('student_requests')
          .select('id')
          .eq('req_type', 'PASSWORD_UPDATE')
          .or(`student_id.eq.${sId},student_id.eq.${rollNo},roll_no.eq.${rollNo}`);

        if (existingRecords && existingRecords.length > 0) {
          for (const rec of existingRecords) {
            await supabase
              .from('student_requests')
              .update({
                status: 'RESET_TO_DOB',
                new_data: {
                  password_hash: null,
                  reset_to_dob: true,
                  reset_at: new Date().toISOString(),
                  reset_by: session.name || 'Admin'
                },
                updated_at: new Date().toISOString()
              })
              .eq('id', rec.id);
          }
        }

        return res.status(200).json({
          success: true,
          message: `Password for ${student.name} has been reset to official Date of Birth.`
        });
      } else if (newPassword) {
        // Admin setting specific password for student
        if (typeof newPassword !== 'string' || newPassword.trim().length < 8) {
          return res.status(400).json({ success: false, error: 'Password must be at least 8 characters long' });
        }

        const cleanPassword = newPassword.trim();

        // Enforce password complexity
        const hasNumber = /\d/.test(cleanPassword);
        const hasLetter = /[a-zA-Z]/.test(cleanPassword);

        if (!hasNumber || !hasLetter) {
          return res.status(400).json({
            success: false,
            error: 'Password must contain both letters and numbers for security'
          });
        }

        const password_hash = await bcrypt.hash(cleanPassword, 10);
        const { data: existingRecords } = await supabase
          .from('student_requests')
          .select('id')
          .eq('req_type', 'PASSWORD_UPDATE')
          .or(`student_id.eq.${sId},student_id.eq.${rollNo},roll_no.eq.${rollNo}`);

        if (existingRecords && existingRecords.length > 0) {
          await supabase
            .from('student_requests')
            .update({
              status: 'Active',
              new_data: {
                password_hash,
                updated_at: new Date().toISOString(),
                updated_by: session.name || 'Admin'
              },
              updated_at: new Date().toISOString()
            })
            .eq('id', existingRecords[0].id);
        } else {
          await supabase
            .from('student_requests')
            .insert({
              request_id: `PWD-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
              student_id: sId,
              student_name: student.name,
              roll_no: rollNo,
              class_name: student.class_name || 'General',
              req_type: 'PASSWORD_UPDATE',
              status: 'Active',
              request_date: new Date().toISOString().split('T')[0],
              old_data: {},
              new_data: {
                password_hash,
                updated_at: new Date().toISOString(),
                updated_by: session.name || 'Admin'
              }
            });
        }

        return res.status(200).json({
          success: true,
          message: `Password for ${student.name} updated successfully.`
        });
      }

      return res.status(400).json({ success: false, error: 'Please specify resetToDob or newPassword' });
    }
  } catch (error) {
    console.error('Student password management error:', error);
    return res.status(500).json({ success: false, error: 'Server exception updating student password' });
  }
}
