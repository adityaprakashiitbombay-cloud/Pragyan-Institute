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

  // Magic-byte sniffing: the declared content-type is a client hint, and the
  // bucket is publicly readable, so a polyglot mislabeled as image/png must not
  // be storable. The sniffed type wins; mismatches are rejected outright.
  const sniffed = sniffType(bytes);
  if (!sniffed || sniffed !== contentType) {
    return res.status(400).json({ error: 'File contents do not match the declared type' });
  }

  const extension = (fileName || '').split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const extByType = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
  const safeFolder = session.role === 'student' ? `${folder}/${session.sub}` : folder;
  const path = `${safeFolder}/${crypto.randomUUID()}.${extByType[contentType] || extension}`;
  const supabase = getSupabase();
  if (!supabase) return res.status(503).json({ error: 'Server storage configuration is missing' });

  try {
    const { error } = await supabase.storage.from('pragyan-media').upload(path, bytes, { contentType, upsert: false, cacheControl: '3600' });
    if (error) throw error;
    const { data } = supabase.storage.from('pragyan-media').getPublicUrl(path);
    return res.status(200).json({ success: true, url: data.publicUrl });
  } catch (error) {
    console.error('[upload] Upload failed:', error.message);
    return res.status(500).json({ error: 'Upload could not be completed' });
  }
}

/** Identify a file by its leading magic bytes. Returns null for unknown. */
function sniffType(bytes) {
  const b = bytes;
  if (b.length >= 12 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'image/jpeg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 &&
      b[4] === 0x0D && b[5] === 0x0A && b[6] === 0x1A && b[7] === 0x0A) return 'image/png';
  if (b.length >= 12 && b.slice(0, 4).toString('ascii') === 'RIFF' &&
      b.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (b.length >= 5 && b.slice(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  return null;
}
