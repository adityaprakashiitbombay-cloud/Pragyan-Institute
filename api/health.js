import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getSupabase, optionalSession, applyCors } from './_lib/auth.js';

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
