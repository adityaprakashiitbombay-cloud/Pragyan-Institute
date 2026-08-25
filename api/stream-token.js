import { StreamChat } from 'stream-chat';
import { getSupabase, requireSession, applyCors } from './_lib/auth.js';

const STREAM_API_KEY = process.env.STREAM_API_KEY;
const STREAM_API_SECRET = process.env.STREAM_API_SECRET;

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const session = requireSession(req, res, ['student', 'admin']);
  if (!session) return;

  // Fail closed: no embedded credentials exist.
  if (!STREAM_API_KEY || !STREAM_API_SECRET) {
    return res.status(503).json({ success: false, error: 'Stream Chat credentials are not configured on server.' });
  }

  try {
    const serverClient = StreamChat.getInstance(STREAM_API_KEY, STREAM_API_SECRET);

    const isAdmin = session.role === 'admin';
    const rawId = session.sub || 'unknown';
    const userId = `${isAdmin ? 'admin' : 'student'}_${String(rawId).toLowerCase().replace(/[^a-z0-9_]/g, '_')}`;
    const userName = session.name || (isAdmin ? 'Institute Admin' : 'Student');
    const userRole = isAdmin ? 'admin' : 'user';

    await serverClient.upsertUser({
      id: userId,
      name: userName,
      role: userRole,
      image: `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=064E3B&color=fff`,
    });

    const exp = Math.floor(Date.now() / 1000) + (24 * 60 * 60);
    const token = serverClient.createToken(userId, exp);

    return res.status(200).json({
      success: true,
      apiKey: STREAM_API_KEY,
      userId,
      userName,
      userRole,
      token,
      exp,
    });
  } catch (err) {
    console.error('[stream-token] Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
