import { getSupabase, requireSession, createSession, applyCors } from './_lib/auth.js';
import { parseDeviceInfo, getClientIp } from './_lib/device-parser.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const session = requireSession(req, res, ['admin']);
  if (!session) return;

  const supabase = getSupabase();
  if (!supabase) {
    return res.status(503).json({ success: false, error: 'Database service unavailable' });
  }

  const adminId = session.sub;

  if (req.method === 'GET') {
    try {
      // Query active non-revoked sessions for this administrator
      let { data: sessions, error } = await supabase
        .from('admin_sessions')
        .select('id, session_id, admin_id, device_name, device_type, browser, os, ip_address, is_revoked, last_active_at, created_at')
        .eq('admin_id', adminId)
        .eq('is_revoked', false)
        .order('last_active_at', { ascending: false })
        .limit(20);

      if (error && error.code !== 'PGRST116') {
        console.warn('[admin-sessions] Select warning:', error.message);
      }

      sessions = sessions || [];

      // If current session is not in the list (e.g. first query after migration), insert it
      const currentSid = session.sid;
      const hasCurrent = currentSid && sessions.some(s => s.session_id === currentSid);

      if (currentSid && !hasCurrent) {
        const ip = getClientIp(req);
        const userAgent = req.headers['user-agent'] || '';
        const device = parseDeviceInfo(userAgent, ip);
        const fallbackSession = {
          session_id: currentSid,
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
        };

        try {
          const { data: inserted } = await supabase
            .from('admin_sessions')
            .upsert([fallbackSession], { onConflict: 'session_id' })
            .select();
          if (inserted && inserted.length) {
            sessions.unshift(inserted[0]);
          } else {
            sessions.unshift(fallbackSession);
          }
        } catch (_) {
          sessions.unshift(fallbackSession);
        }
      } else if (!sessions.length) {
        // Fallback synthetic current device representation if no sid in token
        const ip = getClientIp(req);
        const userAgent = req.headers['user-agent'] || '';
        const device = parseDeviceInfo(userAgent, ip);
        sessions.push({
          session_id: 'CURRENT',
          admin_id: adminId,
          device_name: device.name,
          device_type: device.type,
          browser: device.browser,
          os: device.os,
          ip_address: device.ip,
          is_revoked: false,
          last_active_at: new Date().toISOString(),
          created_at: new Date().toISOString()
        });
      }

      const formatted = sessions.map(s => ({
        id: s.id || s.session_id,
        session_id: s.session_id,
        device_name: s.device_name || 'Unknown Device',
        device_type: s.device_type || 'desktop',
        browser: s.browser || 'Web Browser',
        os: s.os || 'Unknown OS',
        ip_address: s.ip_address || '127.0.0.1',
        last_active_at: s.last_active_at || s.created_at || new Date().toISOString(),
        created_at: s.created_at || new Date().toISOString(),
        is_current: currentSid ? s.session_id === currentSid : (s.session_id === 'CURRENT' || sessions[0] === s)
      }));

      return res.status(200).json({
        success: true,
        sessions: formatted,
        count: formatted.length
      });
    } catch (err) {
      console.error('[admin-sessions GET] Error:', err.message);
      return res.status(500).json({ success: false, error: 'Failed to retrieve active sessions: ' + err.message });
    }
  }

  if (req.method === 'POST') {
    const { action, session_id: targetSid } = req.body || {};

    if (action === 'revoke_device') {
      if (!targetSid) {
        return res.status(400).json({ success: false, error: 'Target session_id is required' });
      }

      try {
        // Revoke the specified device session
        await supabase
          .from('admin_sessions')
          .update({ is_revoked: true, updated_at: new Date().toISOString() })
          .eq('admin_id', adminId)
          .eq('session_id', targetSid);

        // Audit log entry
        try {
          await supabase.from('audit_logs').insert([{
            log_id: `LOG-DEV-REVOKE-${Date.now()}`,
            action_type: 'ADMIN_DEVICE_REVOKED',
            actor_name: session.name || 'Administrator',
            target: adminId,
            details: {
              target_session_id: targetSid,
              revoked_at: new Date().toISOString()
            }
          }]);
        } catch (_) {}

        return res.status(200).json({
          success: true,
          message: 'Device session terminated successfully.',
          is_current_revoked: Boolean(session.sid && session.sid === targetSid)
        });
      } catch (err) {
        return res.status(500).json({ success: false, error: 'Failed to terminate device session: ' + err.message });
      }
    }

    // Default action: revoke_other (log out all other devices)
    try {
      const currentSid = session.sid;

      // 1. Mark all other sessions in database as revoked
      if (currentSid) {
        await supabase
          .from('admin_sessions')
          .update({ is_revoked: true, updated_at: new Date().toISOString() })
          .eq('admin_id', adminId)
          .neq('session_id', currentSid);
      } else {
        await supabase
          .from('admin_sessions')
          .update({ is_revoked: true, updated_at: new Date().toISOString() })
          .eq('admin_id', adminId);
      }

      // 2. Increment token_version in public.admins
      const { data: admin } = await supabase
        .from('admins')
        .select('admin_id, token_version, name, username')
        .or(`admin_id.eq.${adminId},id.eq.${adminId},username.eq.${adminId}`)
        .single();

      const currentVersion = Number(admin?.token_version) || 1;
      const newVersion = currentVersion + 1;

      await supabase
        .from('admins')
        .update({
          token_version: newVersion,
          updated_at: new Date().toISOString()
        })
        .or(`admin_id.eq.${adminId},id.eq.${adminId},username.eq.${adminId}`);

      // 3. Log security event
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
            preserved_session_id: currentSid || null,
            revoked_at: new Date().toISOString()
          }
        }]);
      } catch (_) {}

      // 4. Mint new valid JWT token with newVersion and preserved sid
      const newToken = createSession({
        sub: adminId,
        role: 'admin',
        name: session.name || admin?.name,
        tv: newVersion,
        sid: currentSid
      });

      return res.status(200).json({
        success: true,
        message: 'All other device sessions have been logged out successfully.',
        token: newToken,
        token_version: newVersion
      });
    } catch (err) {
      console.error('[admin-sessions POST] Error:', err.message);
      return res.status(500).json({ success: false, error: 'Failed to revoke other sessions: ' + err.message });
    }
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
