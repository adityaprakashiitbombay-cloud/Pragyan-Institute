// ============================================================================
// POST /api/payment-request — public submission endpoint for pay.html
// ----------------------------------------------------------------------------
// The payment gateway is used by parents clicking email links; they hold no
// portal session, so under RLS lockdown they cannot insert into
// student_requests themselves. This endpoint is the one sanctioned anonymous
// write: it validates every field, resolves the student SERVER-SIDE from the
// roll number (the browser is never trusted for identity), mints a
// high-entropy request_id, and rejects duplicate UTR claims.
// ============================================================================

import crypto from 'crypto';
import { getSupabase, applyCors } from './_lib/auth.js';

const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_MAX = 10;
const rateBuckets = new Map(); // ip -> { count, windowStart }

function isRateLimited(ip) {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || bucket.windowStart + RATE_WINDOW_MS < now) {
    rateBuckets.set(ip, { count: 1, windowStart: now });
    if (rateBuckets.size > 5000) {
      for (const [key, value] of rateBuckets) {
        if (value.windowStart + RATE_WINDOW_MS < now) rateBuckets.delete(key);
      }
    }
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_MAX;
}

const ID_PATTERN = /^[A-Za-z0-9_-]{3,24}$/;
const UTR_PATTERN = /^[0-9A-Za-z]{6,22}$/;

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
    .toString().split(',')[0].trim();
  if (isRateLimited(ip)) {
    return res.status(429).json({ success: false, error: 'Too many submissions from this network. Please try again later.' });
  }

  const supabase = getSupabase();
  if (!supabase) return res.status(503).json({ success: false, error: 'Server database configuration is missing' });

  const body = req.body || {};
  const roll = String(body.roll ?? body.studentId ?? '').trim();
  const amount = Math.round(Number(body.amount));
  const utr = String(body.utr ?? '').trim();
  const mode = String(body.mode ?? 'Online UPI').slice(0, 40);
  const note = String(body.note ?? '').slice(0, 300);
  const paymentType = String(body.paymentType ?? 'full').slice(0, 16);
  const claimedTotalDueBefore = Math.max(0, Math.round(Number(body.claimedTotalDueBefore) || 0));
  const remainingDueAfter = Math.max(0, Math.round(Number(body.remainingDueAfter) || 0));

  if (!ID_PATTERN.test(roll)) {
    return res.status(400).json({ success: false, error: 'A valid roll number or student ID is required' });
  }
  if (!(amount > 0 && amount <= 10000000)) {
    return res.status(400).json({ success: false, error: 'Payment amount must be between ₹1 and ₹1,00,00,000' });
  }
  if (!UTR_PATTERN.test(utr)) {
    return res.status(400).json({ success: false, error: 'A valid UTR / transaction reference (6–22 characters) is required' });
  }

  try {
    // Identity resolution happens HERE — the client-supplied name/batch are
    // display-only and never stored as authoritative.
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let query = supabase.from('students').select('id, student_id, roll_no, name, class_name, pending_fee');
    query = uuidPattern.test(roll)
      ? query.or(`student_id.eq.${roll},id.eq.${roll}`)
      : query.or(`student_id.eq.${roll},roll_no.eq.${roll}`);
    const { data: students, error: stuErr } = await query.limit(1);
    if (stuErr) throw stuErr;
    const student = students?.[0];
    if (!student) {
      return res.status(404).json({ success: false, error: 'No student found for that roll number. Please check and retry.' });
    }

    // Server-side duplicate-UTR guard: one transfer may only ever be claimed
    // once, regardless of device or browser profile.
    const { data: dupes } = await supabase
      .from('student_requests')
      .select('request_id, student_id')
      .contains('new_data', { paymentDetails: { utr } })
      .limit(1);
    if (dupes && dupes.length > 0) {
      const mine = dupes[0].student_id === student.student_id;
      return res.status(409).json({
        success: false,
        code: 'DUPLICATE_UTR',
        error: mine
          ? 'This UTR has already been submitted. Your payment is already recorded.'
          : 'This UTR has already been used on another submission.',
        alreadyMine: mine
      });
    }

    const requestId = `REQ-PAY-${crypto.randomBytes(9).toString('hex').toUpperCase()}`;
    const nowIso = new Date().toISOString();

    const { error: insertErr } = await supabase.from('student_requests').insert({
      request_id: requestId,
      student_id: student.student_id,
      student_name: student.name,
      roll_no: student.roll_no || student.student_id,
      class_name: student.class_name || '',
      req_type: 'PAYMENT_VERIFICATION',
      status: 'Pending',
      request_date: nowIso.slice(0, 10),
      old_data: {},
      new_data: {
        amount,
        paymentDetails: { amount, mode, utr, note },
        paymentType,
        claimedTotalDueBefore,
        remainingDueAfter,
        verifiedStudentPendingFee: Number(student.pending_fee) || 0,
        submittedAt: nowIso,
        submittedVia: 'pay-gateway'
      }
    });
    if (insertErr) throw insertErr;

    return res.status(200).json({ success: true, requestId, studentName: student.name });
  } catch (err) {
    console.error('[payment-request] failed:', err?.message || err);
    return res.status(500).json({ success: false, error: 'The submission could not be recorded. Please try again.' });
  }
}
