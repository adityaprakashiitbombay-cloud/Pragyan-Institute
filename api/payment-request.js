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
import { sendEmailViaResend, DEFAULT_FROM } from './_lib/resend-sender.js';
import { dispatchWithQuota, EMAIL_CATEGORIES } from './_lib/email-quota.js';

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
  const contactEmail = String(body.email || body.contactEmail || '').trim().slice(0, 120);

  // Optional payment-proof URL (portal uploads the file first via
  // /api/upload-file). Only same-project storage or https URLs are accepted,
  // and never interpolated anywhere without escaping downstream.
  let proofUrl = String(body.proofUrl ?? '').trim().slice(0, 500);
  if (proofUrl && !/^https:\/\/[^\s"']+$/.test(proofUrl)) proofUrl = '';

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
    let query = supabase.from('students').select('id, student_id, roll_no, name, email, class_name, pending_fee');
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

    const finalEmail = (student.email || contactEmail || '').trim();

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
        email: finalEmail,
        paymentDetails: { amount, mode, utr, note, ...(proofUrl ? { proofUrl, proof: proofUrl } : {}) },
        paymentType,
        claimedTotalDueBefore,
        remainingDueAfter,
        verifiedStudentPendingFee: Number(student.pending_fee) || 0,
        submittedAt: nowIso,
        submittedVia: 'pay-gateway'
      }
    });
    if (insertErr) throw insertErr;

    // Best-effort email acknowledgment to student/parent
    if (finalEmail && finalEmail.includes('@')) {
      const emailSubject = `Fee Payment Request Received (₹${amount.toLocaleString('en-IN')}) — Pragyan Institute`;
      const emailHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 580px; margin: 0 auto; border: 1px solid #E2E8F0; border-radius: 12px; overflow: hidden; background: #FFFFFF;">
          <div style="background: linear-gradient(135deg, #064E3B 0%, #022C22 100%); padding: 24px 20px; color: #FFFFFF; text-align: center;">
            <h1 style="margin: 0; font-size: 20px; font-weight: 800; letter-spacing: 0.5px;">PRAGYAN INSTITUTE</h1>
            <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.9;">Online Payment Verification Acknowledgement</p>
          </div>
          <div style="padding: 24px 20px; color: #1E293B;">
            <p style="font-size: 15px; margin-top: 0;">Dear <strong>${student.name}</strong>,</p>
            <p style="font-size: 14px; line-height: 1.5; color: #334155;">We have received your online fee payment submission. Our administration team will verify the bank transaction and approve your official receipt shortly.</p>
            
            <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 16px; margin: 18px 0;">
              <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
                <tr><td style="padding: 6px 0; color: #64748B;">Request ID:</td><td style="padding: 6px 0; font-weight: 700; text-align: right; font-family: monospace;">${requestId}</td></tr>
                <tr><td style="padding: 6px 0; color: #64748B;">Student ID / Roll:</td><td style="padding: 6px 0; font-weight: 700; text-align: right;">${student.student_id}</td></tr>
                <tr><td style="padding: 6px 0; color: #64748B;">Submitted Amount:</td><td style="padding: 6px 0; font-weight: 800; text-align: right; color: #059669;">₹${amount.toLocaleString('en-IN')}</td></tr>
                <tr><td style="padding: 6px 0; color: #64748B;">UTR / Reference:</td><td style="padding: 6px 0; font-weight: 700; text-align: right; font-family: monospace;">${utr}</td></tr>
                <tr><td style="padding: 6px 0; color: #64748B;">Payment Mode:</td><td style="padding: 6px 0; font-weight: 700; text-align: right;">${mode}</td></tr>
              </table>
            </div>

            <p style="font-size: 13px; color: #64748B; margin-bottom: 20px;">Once approved, your computerized stamped receipt will be sent directly to this email and will be available in the Student Portal.</p>
            
            <div style="text-align: center; margin: 20px 0 10px;">
              <a href="https://www.pragyaninstitute.com/portal.html" style="display: inline-block; background: #064E3B; color: #FFFFFF; text-decoration: none; padding: 10px 22px; border-radius: 6px; font-weight: 700; font-size: 13px;">View Student Portal</a>
            </div>
          </div>
          <div style="background: #F1F5F9; padding: 12px; font-size: 11px; color: #64748B; text-align: center;">
            Pragyan Institute • At Moti Market, Near Jagdamba Sthan, Lalganj, Vaishali, Bihar
          </div>
        </div>
      `;

      dispatchWithQuota({
        category: EMAIL_CATEGORIES.RECEIPT,
        items: [{ email: finalEmail, student_id: student.student_id }],
        getEmail: (it) => it.email,
        getDedupeKey: (it) => `REQ-ACK-${requestId}-${it.student_id}`,
        reference: `REQ-ACK-${requestId}`,
        send: async (item) => {
          const resendKey = process.env.RESEND_API_KEY;
          const resendFrom = process.env.RESEND_FROM_EMAIL || DEFAULT_FROM;
          const sendRes = await sendEmailViaResend({
            apiKey: resendKey,
            from: resendFrom,
            to: item.email,
            subject: emailSubject,
            html: emailHtml
          });
          return { result: sendRes, report: { email: item.email } };
        }
      }).catch(mailErr => console.warn('[payment-request] student acknowledgment email error:', mailErr?.message));
    }

    return res.status(200).json({ success: true, requestId, studentName: student.name });
  } catch (err) {
    console.error('[payment-request] failed:', err?.message || err);
    return res.status(500).json({ success: false, error: 'The submission could not be recorded. Please try again.' });
  }
}
