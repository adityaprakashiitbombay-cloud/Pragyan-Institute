import { StreamChat } from 'stream-chat';
import { getSupabase, requireSession, applyCors } from './_lib/auth.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const session = requireSession(req, res, ['student', 'admin']);
  if (!session) return;

  const apiKey = process.env.STREAM_API_KEY;
  const apiSecret = process.env.STREAM_API_SECRET;
  if (!apiKey || !apiSecret) {
    return res.status(503).json({ success: false, error: 'Stream Chat service is not configured on server' });
  }

  const isAdmin = session.role === 'admin';
  const prefix = isAdmin ? 'admin' : 'student';
  const rawId = (isAdmin ? (session.username || session.sub) : (session.student_id || session.sub || session.roll)) || 'unknown';
  const userId = `${prefix}_${String(rawId).toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const userName = session.name || (isAdmin ? 'Chandan Kumar' : 'Student');
  const userRole = isAdmin ? 'admin' : 'user';

  try {
    const serverClient = StreamChat.getInstance(apiKey, apiSecret);
    
    try {
      await serverClient.upsertUser({
        id: userId,
        name: userName,
        role: userRole,
        image: `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=064E3B&color=fff`,
      });
    } catch (upsertErr) {
      console.warn('[stream-token] upsertUser fallback note:', upsertErr.message);
      try {
        await serverClient.partialUpdateUser({
          id: userId,
          set: { role: userRole }
        });
      } catch (_) {}
    }

    const CHAT_TOKEN_TTL_SECONDS = 24 * 60 * 60;
    const exp = Math.floor(Date.now() / 1000) + CHAT_TOKEN_TTL_SECONDS;
    const token = serverClient.createToken(userId, exp);

    // Persist / synchronize stream_user_id in Supabase Postgres
    try {
      const supabase = getSupabase();
      if (supabase) {
        if (isAdmin) {
          const adminUser = session.username || 'chandan';
          supabase.from('admins').update({ stream_user_id: userId }).ilike('username', adminUser).then(() => {}).catch(() => {});
        } else {
          const sid = session.student_id || session.sub || session.roll;
          if (sid) {
            supabase.from('students').update({ stream_user_id: userId }).or(`student_id.eq.${sid},id.eq.${sid}`).then(() => {}).catch(() => {});
          }
        }
      }
    } catch (dbErr) {
      console.warn('[stream-token] DB stream_user_id sync note:', dbErr.message);
    }

    return res.status(200).json({
      success: true,
      apiKey,
      userId,
      userName,
      userRole,
      token,
      exp,
      expiresAt: new Date(exp * 1000).toISOString()
    });
  } catch (err) {
    console.error('[stream-token] Token generation error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
