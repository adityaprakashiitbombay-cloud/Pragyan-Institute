import crypto from 'crypto';
import { getSupabase, requireSession, applyCors } from './_lib/auth.js';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_FOLDERS = new Set(['admin_avatars', 'notice_attachments', 'profile_pictures', 'payment_proofs']);
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const session = requireSession(req, res, ['student', 'admin']);
  if (!session) return;

  const { folder, fileName, contentType, base64 } = req.body || {};
  if (!ALLOWED_FOLDERS.has(folder) || typeof base64 !== 'string' || !ALLOWED_TYPES.has(contentType)) {
    return res.status(400).json({ error: 'Unsupported upload' });
  }
  if (session.role !== 'admin' && !['profile_pictures', 'payment_proofs'].includes(folder)) {
    return res.status(403).json({ error: 'Only administrators can upload this file' });
  }

  const raw = base64.includes(',') ? base64.split(',').pop() : base64;
  if (raw.length > 7 * 1024 * 1024) return res.status(413).json({ error: 'Uploads must be smaller than 5 MB' });
  const bytes = Buffer.from(raw, 'base64');
  if (!bytes.length || bytes.length > MAX_BYTES) return res.status(413).json({ error: 'Uploads must be smaller than 5 MB' });

  const extension = (fileName || '').split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const safeFolder = session.role === 'student' ? `${folder}/${session.sub}` : folder;
  const path = `${safeFolder}/${crypto.randomUUID()}.${extension}`;
  const supabase = getSupabase();
  if (!supabase) return res.status(503).json({ error: 'Server storage configuration is missing' });

  try {
    const { error } = await supabase.storage.from('pragyan-media').upload(path, bytes, { contentType, upsert: false, cacheControl: '3600' });
    if (error) throw error;
    const { data } = supabase.storage.from('pragyan-media').getPublicUrl(path);
    return res.status(200).json({ success: true, url: data.publicUrl });
  } catch (error) {
    console.error('[upload] Upload failed:', error.message);
    return res.status(500).json({ error: error.message || 'Upload failed' });
  }
}
