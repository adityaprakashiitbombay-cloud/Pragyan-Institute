import bcrypt from 'bcryptjs';
import { getSupabase, requireSession, applyCors } from './_lib/auth.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const session = requireSession(req, res, ['admin']);
  if (!session) return;

  const { currentPassword, newPassword } = req.body || {};
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || newPassword.length < 12) {
    return res.status(400).json({ error: 'Use your current password and a new password of at least 12 characters' });
  }

  const supabase = getSupabase();
  if (!supabase) return res.status(503).json({ error: 'Server database configuration is missing' });
  try {
    const { data: admin, error } = await supabase.from('admins').select('admin_id,password,password_hash').eq('admin_id', session.sub).maybeSingle();
    if (error) throw error;
    const valid = admin?.password_hash ? await bcrypt.compare(currentPassword, admin.password_hash) : admin?.password === currentPassword;
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    const password_hash = await bcrypt.hash(newPassword, 12);
    const { error: updateError } = await supabase.from('admins').update({ password_hash, password: null }).eq('admin_id', session.sub);
    if (updateError) throw updateError;
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Admin password update failed:', error.message);
    return res.status(500).json({ error: 'Unable to update password' });
  }
}
