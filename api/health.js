import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { StreamChat } from 'stream-chat';
import { getSupabase, requireSession, optionalSession, applyCors } from './_lib/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function packageVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    return pkg.version || 'unknown';
  } catch (_) {
    return 'unknown';
  }
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  // Stream token generator sub-route
  const isStreamToken = (req.url && (req.url.includes('stream-token') || req.url.includes('action=stream-token') || req.url.includes('route=stream-token'))) ||
    req.query?.action === 'stream-token' ||
    req.query?.route === 'stream-token' ||
    (req.headers['x-matched-path'] && req.headers['x-matched-path'].includes('stream-token')) ||
    (req.headers['x-vercel-matched-path'] && req.headers['x-vercel-matched-path'].includes('stream-token'));

  if (isStreamToken) {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    const session = requireSession(req, res, ['student', 'admin']);
    if (!session) return;

    const apiKey = process.env.STREAM_API_KEY || 'w9gs6k2jh9wg';
    const apiSecret = process.env.STREAM_API_SECRET || '76mehp9ua5k2dr65g2na5p52gr34a3thzgkjncbd56u7arvggdhgpnnpc4df4c7s';
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
        console.warn('[health/stream-token] upsertUser fallback note:', upsertErr.message);
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
        console.warn('[health/stream-token] DB stream_user_id sync note:', dbErr.message);
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
      console.error('[health/stream-token] Token generation error:', err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // Stream channel purge / clear sub-route (Admin Only)
  const isStreamClear = (req.url && (req.url.includes('stream-clear') || req.url.includes('action=stream-clear') || req.url.includes('route=stream-clear'))) ||
    req.query?.action === 'stream-clear' ||
    req.query?.route === 'stream-clear' ||
    (req.headers['x-matched-path'] && req.headers['x-matched-path'].includes('stream-clear')) ||
    (req.headers['x-vercel-matched-path'] && req.headers['x-vercel-matched-path'].includes('stream-clear'));

  if (isStreamClear) {
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    const session = requireSession(req, res, ['admin']);
    if (!session) return;

    const apiKey = process.env.STREAM_API_KEY || 'w9gs6k2jh9wg';
    const apiSecret = process.env.STREAM_API_SECRET || '76mehp9ua5k2dr65g2na5p52gr34a3thzgkjncbd56u7arvggdhgpnnpc4df4c7s';
    if (!apiKey || !apiSecret) {
      return res.status(503).json({ success: false, error: 'Stream Chat service is not configured on server' });
    }

    const { channelId, channelType = 'livestream', hardDelete = true } = req.body || {};
    if (!channelId) {
      return res.status(400).json({ success: false, error: 'channelId is required' });
    }

    try {
      const serverClient = StreamChat.getInstance(apiKey, apiSecret);
      const channel = serverClient.channel(channelType, channelId);

      const adminName = session.name || 'Chandan Kumar';
      const adminId = `admin_${String(session.username || 'chandan').toLowerCase()}`;

      // Truncate the channel history on Stream cloud
      await channel.truncate({
        hard_delete: hardDelete,
        message: {
          text: `🧹 Group chat history was cleared by Administrator (${adminName}).`,
          user: {
            id: adminId,
            name: adminName,
            role: 'admin'
          }
        }
      });

      return res.status(200).json({
        success: true,
        message: `Group chat ${channelId} successfully cleared.`
      });
    } catch (err) {
      console.error('[health/stream-clear] Channel clear error:', err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // Health check route
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  let dbOnline = false;
  let dbDetail = 'unconfigured';
  let rawError = null;
  try {
    const supabase = getSupabase();
    if (supabase) {
      const { error } = await supabase.from('batches').select('*').limit(1);
      if (error) {
        dbDetail = 'query_error';
        rawError = error.message;
      } else {
        dbDetail = 'connected';
        dbOnline = true;
      }
    }
  } catch (_) {
    dbDetail = 'connection_exception';
  }

  let showDetail = false;
  try {
    const adminSession = optionalSession(req);
    showDetail = Boolean(adminSession && adminSession.role === 'admin');
  } catch (_) {
    showDetail = false;
  }

  const now = new Date();
  const uptimePayload = {
    status: dbOnline ? 'online' : 'degraded',
    database: dbDetail,
    ...(showDetail && rawError ? { databaseError: rawError } : {}),
    timestamp: now.toISOString(),
    service: 'Pragyan Institute Portal Engine',
    location: 'Lalganj, Vaishali, Bihar',
    heartbeat: dbOnline ? 'active' : 'stalled',
    version: packageVersion()
  };

  return res.status(200).json(uptimePayload);
}
