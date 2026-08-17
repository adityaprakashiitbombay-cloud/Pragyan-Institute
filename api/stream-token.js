import { StreamChat } from 'stream-chat';
import { requireSession, applyCors } from './_lib/auth.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const session = requireSession(req, res, ['student', 'admin']);
  if (!session) return;

  const apiKey = process.env.STREAM_API_KEY;
  const apiSecret = process.env.STREAM_API_SECRET;
  if (!apiKey || !apiSecret) return res.status(503).json({ error: 'Chat is not configured' });

  const prefix = session.role === 'admin' ? 'admin' : 'student';
  const userId = `${prefix}_${String(session.sub).replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const token = StreamChat.getInstance(apiKey, apiSecret).createToken(userId);
  return res.status(200).json({ apiKey, userId, token });
}
