import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { StreamChat } from 'stream-chat';
import { getSupabase, requireSession, applyCors } from './_lib/auth.js';

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

  // Stream token generator route
  if (req.url && req.url.includes('stream-token')) {
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
    showDetail = Boolean(requireSession(req, res, ['admin']));
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
