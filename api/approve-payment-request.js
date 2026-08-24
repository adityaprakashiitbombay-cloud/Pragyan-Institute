// ============================================================================
// POST /api/approve-payment-request — verify a student's online fee payment
// ----------------------------------------------------------------------------
// One RPC call and nothing else. approve_payment_request() takes a FOR UPDATE
// lock on the request row, then on the student row, credits the payment, writes
// the receipt and flips the request to Approved inside one transaction.
//
// This file used to carry a 150-line JavaScript "resilient fallback" that ran
// whenever the RPC was missing or errored. Four separate defects lived in it:
//
//   1. `if (!rpcError && rpcData)` treated a *failure payload* as success. The
//      RPC reports problems as {success:false, code:'NOT_FOUND'}, which is a
//      truthy object, so a payment that was never credited returned HTTP 200
//      with success:true and the operator was told it had gone through.
//
//   2. The fallback did read-then-write arithmetic on paid_fee/pending_fee with
//      no lock. Two admins clearing the same queue, or one admin double-clicking,
//      both read the same paid_fee and the second write silently discarded the
//      first payment.
//
//   3. It wrote the payment into fee_billing_ledger. That table records charges,
//      not credits, and its (student_id, billing_month) unique index means a
//      payment row collides with the month's actual bill — while the upsert named
//      only the idempotency_key index, so the conflict raised instead of merging.
//
//   4. That raise was swallowed by `.catch()` chained onto the query builder —
//      but PostgrestBuilder has no .catch method, so the expression itself threw
//      a TypeError *after* the balance and receipt were already written. Every
//      fallback approval therefore reported 409 for a payment that had fully
//      succeeded, and the operator's natural response was to click again.
//
// If the RPC is absent the correct answer is 503 "deploy the SQL", not a second
// implementation of the money path that nobody tests.
// ============================================================================

import { getSupabase, requireSession, applyCors } from './_lib/auth.js';
import { pushToSubscription } from './_lib/webpush.js';

// How each documented failure code from the RPC maps onto HTTP. Anything the
// function might grow later falls through to 400 rather than being reported as
// a success.
const STATUS_FOR_CODE = {
  NOT_FOUND: 404,
  NO_STUDENT: 404,
  WRONG_TYPE: 400,
  BAD_AMOUNT: 400,
  ALREADY_PROCESSED: 409
};

// PostgREST's code for "no such function in the exposed schema". Distinguishing
// it matters: a missing deployment is an operator problem with a clear fix, and
// reporting it as a generic 500 sends people looking for a bug in the payment.
const MISSING_FUNCTION_CODES = new Set(['PGRST202', 'PGRST203', '42883']);

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const session = requireSession(req, res, ['admin']);
  if (!session) return;

  const { requestId, verifierName } = req.body || {};
  if (typeof requestId !== 'string' || !requestId.trim()) {
    return res.status(400).json({ success: false, error: 'A payment request id is required' });
  }

  const p_req_id = requestId.trim();
  // Fall back to the signed session rather than rejecting: the verifier is an
  // audit field, and the session already proves who is acting.
  const p_verifier = (typeof verifierName === 'string' && verifierName.trim())
    || session.name
    || session.username
    || 'Admin';

  const supabase = getSupabase();
  if (!supabase) return res.status(503).json({ success: false, error: 'Server database configuration is missing' });

  // F-R5: the surplus boundary lives INSIDE approve_payment_request (the RPC
  // owns the transaction and writes its own audit warning). The endpoint only
  // forwards the verifier's explicit override flag.
  const allowSurplus = req.body?.allow_surplus === true;

  try {
    const { data, error } = await supabase.rpc('approve_payment_request', {
      p_request_id: p_req_id,
      p_verifier: p_verifier,
      p_allow_surplus: allowSurplus
    });

    if (error) {
      const missing = MISSING_FUNCTION_CODES.has(error.code) || /could not find the function/i.test(error.message || '');
      console.error('[approve-payment] RPC failed:', error.code || '', error.message);
      return res.status(missing ? 503 : 500).json({
        success: false,
        error: missing
          ? 'The atomic approval function is not deployed. Run supabase_production_hardening.sql against the database — no payment was credited.'
          : 'Payment approval could not be completed',
        code: error.code || null
      });
    }

    // The RPC returns a single jsonb object; a set-returning shape would arrive
    // as a one-element array.
    const result = Array.isArray(data) ? data[0] : data;
    if (!result) {
      return res.status(500).json({ success: false, error: 'approve_payment_request returned no result' });
    }

    // A failure payload is a failure. This is the check whose absence let a
    // NOT_FOUND read as an approved payment.
    if (result.success === false) {
      const status = result.code === 'AMOUNT_EXCEEDS_DUES' ? 422 : (STATUS_FOR_CODE[result.code] || 400);
      return res.status(status).json({
        success: false,
        code: result.code || null,
        error: result.error || 'Payment request could not be approved',
        requestedAmount: result.requested_amount ?? null,
        livePending: result.live_pending ?? null,
        needsOverride: Boolean(result.needs_override)
      });
    }

    // idempotent:true means this request had already been approved and the
    // original receipt is being returned unchanged — a safe replay, not an error,
    // so the caller can reconcile its local copy either way.

    // Best-effort push notification to student device
    try {
      const studentId = result.student_id;
      const receiptNo = result.receipt_no || (result.receipt && result.receipt.receipt_no);
      const amountPaid = result.amount_paid || (result.receipt && result.receipt.amount);
      if (studentId) {
        const { data: subs } = await supabase
          .from('push_subscriptions')
          .select('endpoint, p256dh_key, auth_key, student_id')
          .eq('student_id', studentId);

        if (subs && subs.length > 0) {
          const vapidKeys = {
            publicKey: process.env.VAPID_PUBLIC_KEY || 'BP3tVwB7SjSNTEn7SsPHvzeTySIm17F7AA8Kdcbc0FMUHGBdE8K0tmvEmVVLY3dw9ypIMIG4oOKFNGJAZ1sndMQ',
            privateKey: process.env.VAPID_PRIVATE_KEY || 'MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQglvAU5VuajVTFhOoC4EmlieeCySWkSuzcnoyU6MEPixShRANCAAT97VcAe0o0jUxJ-0rDx783k8kiJtexewAPCnXG3NBTFBxgXRPCtLZrxJlVS2N3cPcqSDCBuKDihTRiQGdbJ3TE'
          };
          const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:pragyan.lalganj@gmail.com';
          const pushPayload = {
            title: '✅ Fee Payment Verified!',
            body: `Your payment of ₹${Number(amountPaid || 0).toLocaleString('en-IN')} has been verified. Official Receipt #${receiptNo || 'REC'} is ready.`,
            icon: '/assets/images/logo.png',
            url: '/portal.html',
            actions: [{ action: 'receipt', title: '📄 View Receipt', url: '/portal.html' }],
            priority: 'high'
          };
          for (const sub of subs) {
            pushToSubscription(sub, pushPayload, { vapidKeys, vapidSubject, ttlSeconds: 86400, urgency: 'high' }).catch(() => {});
          }
        }
      }
    } catch (_) { /* push notification is best-effort */ }

    return res.status(200).json({ success: true, data: result, idempotent: Boolean(result.idempotent) });
  } catch (err) {
    console.error('[approve-payment] unexpected failure:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Payment approval could not be completed' });
  }
}
