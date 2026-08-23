import crypto from 'crypto';
import { getSupabase, requireSession, applyCors } from './_lib/auth.js';
import { resolveBatch } from './_lib/academic-config.js';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_FOLDERS = new Set(['admin_avatars', 'notice_attachments', 'profile_pictures', 'payment_proofs']);
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  // Student ID generator route
  if ((req.url && req.url.includes('student-id')) || req.body?.className || req.query?.className) {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    const session = requireSession(req, res, ['admin']);
    if (!session) return;

    const supabase = getSupabase();
    if (!supabase) {
      return res.status(503).json({ success: false, error: 'Database configuration missing' });
    }

    const className = String((req.method === 'POST' ? req.body?.className : req.query?.className) || '').trim();
    if (!className) {
      return res.status(400).json({ success: false, error: 'A className is required to derive the YYCCSS class code' });
    }

    const batch = resolveBatch(className);
    if (!batch) {
      return res.status(400).json({
        success: false,
        error: `"${className}" does not resolve to any of the 12 canonical batches, so no barcode id can be derived.`
      });
    }

    try {
      const { data, error } = await supabase.rpc('generate_next_student_id', { p_class_name: className });
      if (error) {
        const missing = error.code === 'PGRST202' || /could not find the function/i.test(error.message || '');
        const isRefusal = error.code === '22023' || /serial range exhausted|cannot derive/i.test(error.message || '');
        console.error('[student-id] generate_next_student_id failed:', error.code || '', error.message);
        return res.status(missing ? 503 : (isRefusal ? 409 : 500)).json({
          success: false,
          error: missing
            ? 'The id allocator is not deployed. Run supabase_production_hardening.sql against the database.'
            : (isRefusal ? error.message : 'Could not allocate a student id')
        });
      }

      const studentId = typeof data === 'string' ? data : String(data || '');
      if (!/^\d{6}$/.test(studentId)) {
        return res.status(500).json({ success: false, error: 'The allocator returned a malformed id' });
      }

      return res.status(200).json({
        success: true,
        studentId,
        prefix: studentId.slice(0, 4),
        year: studentId.slice(0, 2),
        classCode: studentId.slice(2, 4),
        serial: Number(studentId.slice(4)),
        batchId: batch.batchId,
        className: batch.className
      });
    } catch (err) {
      console.error('[student-id] unexpected failure:', err?.message || err);
      return res.status(500).json({ success: false, error: 'Could not allocate a student id' });
    }
  }

  // File upload route
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
