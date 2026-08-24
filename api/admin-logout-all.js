import { getSupabase, requireSession, createSession, applyCors } from './_lib/auth.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const session = requireSession(req, res, ['admin']);
  if (!session) return;

  const supabase = getSupabase();
  if (!supabase) {
    return res.status(503).json({ success: false, error: 'Database service unavailable' });
  }

  try {
    const adminId = session.sub;
    const { data: admin, error: fetchErr } = await supabase
      .from('admins')
      .select('admin_id, token_version, name, username')
      .or(`admin_id.eq.${adminId},id.eq.${adminId},username.eq.${adminId}`)
      .single();

    if (fetchErr && fetchErr.code !== 'PGRST116') {
      throw fetchErr;
    }

    const currentVersion = Number(admin?.token_version) || 1;
    const newVersion = currentVersion + 1;

    const { error: updateErr } = await supabase
      .from('admins')
      .update({
        token_version: newVersion,
        updated_at: new Date().toISOString()
      })
      .or(`admin_id.eq.${adminId},id.eq.${adminId},username.eq.${adminId}`);

    if (updateErr) throw updateErr;

    // Revoke all other active device session records in database
    try {
      if (session.sid) {
        await supabase
          .from('admin_sessions')
          .update({ is_revoked: true, updated_at: new Date().toISOString() })
          .eq('admin_id', adminId)
          .neq('session_id', session.sid);
      } else {
        await supabase
          .from('admin_sessions')
          .update({ is_revoked: true, updated_at: new Date().toISOString() })
          .eq('admin_id', adminId);
      }
    } catch (_) {}

    // Log the security event to audit trail
    try {
      await supabase.from('audit_logs').insert([{
        log_id: `LOG-REVOKE-${Date.now()}`,
        action_type: 'ADMIN_SESSIONS_REVOKED',
        actor_name: session.name || admin?.name || 'Administrator',
        target: adminId,
        details: {
          description: 'Logged out all other active admin devices',
          previous_version: currentVersion,
          new_token_version: newVersion,
          revoked_at: new Date().toISOString()
        }
      }]);
    } catch (_) {}

    // Mint a new valid JWT token with the incremented token_version for the current browser session
    const newToken = createSession({
      sub: adminId,
      role: 'admin',
      name: session.name || admin?.name,
      tv: newVersion,
      sid: session.sid
    });

    return res.status(200).json({
      success: true,
      message: 'All other device sessions have been terminated successfully.',
      token: newToken,
      token_version: newVersion
    });
  } catch (err) {
    console.error('[admin-logout-all] Error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to revoke other sessions: ' + err.message });
  }
}
