import { getSupabase, applyCors } from './_lib/auth.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  let dbStatus = 'unconfigured';
  try {
    const supabase = getSupabase();
    if (supabase) {
      const { error } = await supabase.from('batches').select('*').limit(1);
      dbStatus = error ? `query_error: ${error.message}` : 'connected';
    }
  } catch (e) {
    dbStatus = 'connection_exception';
  }

  const now = new Date();
  const isHealthy = dbStatus === 'connected' || dbStatus === 'unconfigured';
  const uptimePayload = {
    status: isHealthy ? 'online' : 'degraded',
    database: dbStatus,
    timestamp: now.toISOString(),
    service: 'Pragyan Institute Portal Engine',
    location: 'Lalganj, Vaishali, Bihar',
    heartbeat: 'active',
    version: '80.1'
  };

  return res.status(200).json(uptimePayload);
}
