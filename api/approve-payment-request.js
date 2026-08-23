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

  try {
    const { data, error } = await supabase.rpc('approve_payment_request', {
      p_request_id: p_req_id,
      p_verifier: p_verifier
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
      const status = STATUS_FOR_CODE[result.code] || 400;
      return res.status(status).json({
        success: false,
        code: result.code || null,
        error: result.error || 'Payment request could not be approved'
      });
    }

    // idempotent:true means this request had already been approved and the
    // original receipt is being returned unchanged — a safe replay, not an error,
    // so the caller can reconcile its local copy either way.
    return res.status(200).json({ success: true, data: result, idempotent: Boolean(result.idempotent) });
  } catch (err) {
    console.error('[approve-payment] unexpected failure:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Payment approval could not be completed' });
  }
}
