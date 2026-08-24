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

  // Stream token generator route
  const isStreamToken = (req.url && req.url.includes('stream-token')) ||
    (req.headers['x-matched-path'] && req.headers['x-matched-path'].includes('stream-token')) ||
    (req.headers['x-vercel-matched-path'] && req.headers['x-vercel-matched-path'].includes('stream-token'));

  if (isStreamToken) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const session = requireSession(req, res, ['student', 'admin']);
    if (!session) return;

    const apiKey = process.env.STREAM_API_KEY;
    const apiSecret = process.env.STREAM_API_SECRET;
    if (!apiKey || !apiSecret) return res.status(503).json({ error: 'Chat is not configured' });

    const prefix = session.role === 'admin' ? 'admin' : 'student';
    const userId = `${prefix}_${String(session.sub).replace(/[^a-zA-Z0-9_-]/g, '')}`;
    // F-R7: tokens expire with a predictable 7-day window instead of living
    // forever. stream-chat's createToken(userId, exp) embeds the claim.
    const CHAT_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
    const exp = Math.floor(Date.now() / 1000) + CHAT_TOKEN_TTL_SECONDS;
    const token = StreamChat.getInstance(apiKey, apiSecret).createToken(userId, exp);
    return res.status(200).json({ apiKey, userId, token, expiresAt: new Date(exp * 1000).toISOString() });
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
