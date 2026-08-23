// T23 — the payment-approval path.
//
// A student uploads a UPI screenshot from pay.html; an admin verifies it and the
// money moves. Until this pass the money moved *in the browser*: the admin's
// portal read paid_fee out of a localStorage cache, added the amount, and wrote
// it back. The atomic RPC that exists for exactly this job had no callers.
//
// These are structural assertions rather than unit tests, because the defects
// were not bad arithmetic — they were the arithmetic happening in the wrong
// place, with the wrong lock, under a non-deterministic receipt number.
//
// Locked in here:
//   * the endpoint calls approve_payment_request and has no second implementation
//   * a {success:false} payload from the RPC is never reported as HTTP 200
//   * no payment is ever written into fee_billing_ledger (that table records
//     charges; its (student_id, billing_month) unique index collides with the
//     month's real bill)
//   * nothing chains .catch() onto a PostgREST query builder — the builder has no
//     .catch, so the expression throws instead of handling the error
//   * the portal does no fee arithmetic on the approval path
//   * the receipt number is derived from the request id, not from a clock or RNG

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/**
 * Drop whole-line comments before scanning.
 *
 * Necessary rather than fastidious: this file's job is to assert that certain
 * code shapes are ABSENT, and the fixes deliberately document the shape they
 * removed. Without this, a comment explaining "the old code did
 * `s.paidFee = s.paidFee + payVal`" fails the very test that proves it no longer
 * does. Only full-line comments are removed — enough for the documentation
 * blocks here, and it cannot mangle a regex literal or a URL the way a general
 * comment stripper would.
 */
const codeOnly = src => src
  .split(/\r?\n/)
  .filter(line => {
    const t = line.trim();
    return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('*/'));
  })
  .join('\n');

export async function runPaymentApprovalTests(assert) {
  const api = codeOnly(read('api/approve-payment-request.js'));
  const sql = read('supabase_production_hardening.sql');
  const portal = codeOnly(read('js/portal.js'));

  // --- The endpoint delegates, and only delegates ---------------------------
  assert(/\.rpc\(\s*'approve_payment_request'/.test(api), 'T23.1: the endpoint calls the approve_payment_request RPC');
  assert(/FUNCTION public\.approve_payment_request\s*\(/.test(sql), 'T23.2: approve_payment_request is defined in the hardening SQL');

  // The fallback was a full second money path. Any write to students, receipts
  // or the ledger from this file means it has grown back.
  const writeVerbs = [...api.matchAll(/\.from\(\s*'([a-z_]+)'\s*\)\s*\n?\s*\.(update|upsert|insert)\(/g)].map(m => `${m[1]}.${m[2]}`);
  assert(writeVerbs.length === 0, `T23.3: the endpoint performs no direct table writes — the RPC owns the transaction (found: ${writeVerbs.join(', ') || 'none'})`);
  assert(!/student_fee_accounts/.test(api), 'T23.4: the endpoint does not maintain student_fee_accounts as a third source of truth for a balance the students table already holds');

  // --- A failure payload must not read as success ---------------------------
  // The exact bug: `if (!rpcError && rpcData)` — rpcData is {success:false,...},
  // a truthy object, so an uncredited payment returned 200 success:true.
  assert(/result\.success === false/.test(api) || /=== false/.test(api), 'T23.5: the endpoint explicitly tests for a {success:false} payload from the RPC');
  const badGuard = /if\s*\(\s*!rpcError\s*&&\s*rpcData\s*\)/.test(api);
  assert(!badGuard, 'T23.6: the endpoint does not treat "RPC returned any object" as approval — a failure payload is truthy');
  // Every documented failure code needs an HTTP mapping, or a real refusal
  // arrives at the browser wearing a 200.
  for (const code of ['NOT_FOUND', 'WRONG_TYPE', 'ALREADY_PROCESSED', 'BAD_AMOUNT', 'NO_STUDENT']) {
    assert(sql.includes(`'${code}'`), `T23.7: the RPC still reports ${code}`);
    assert(api.includes(code), `T23.8: the endpoint maps ${code} to an HTTP status`);
  }

  // --- A payment is not a billing event ------------------------------------
  assert(!/fee_billing_ledger/.test(api), 'T23.9: no payment is written into fee_billing_ledger — that table records charges, and its (student_id, billing_month) uniqueness collides with the month\'s real bill');

  // --- .catch() on a query builder ----------------------------------------
  // PostgrestBuilder implements `then` but not `catch`, so `builder.catch(fn)` is
  // a TypeError at evaluation time, not an error handler. The old code had one
  // chained after the balance had already been written, which is why a fully
  // successful payment reported 409.
  for (const file of ['api/approve-payment-request.js', 'api/cron-monthly-fees.js', 'api/admin-trigger-billing.js']) {
    const lines = codeOnly(read(file)).split(/\r?\n/);
    // Only the lines that actually chain a .catch are interesting; asserting on
    // every other line would bury the suite in a thousand passes.
    const offenders = lines
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(entry => /\.catch\(/.test(entry.line))
      .filter(entry => /\.(from|select|insert|update|upsert|delete|eq|in|is|lt|order|limit|maybeSingle|single)\([^)]*\)\s*\.catch\(/.test(entry.line));
    assert(offenders.length === 0, `T23.10: ${file} does not chain .catch() onto a PostgREST query builder — the builder implements then but not catch, so the expression throws instead of handling (found: ${offenders.map(o => o.n).join(', ') || 'none'})`);
  }

  // --- The portal must not compute money ----------------------------------
  // Isolate the approval handler so an unrelated fee display elsewhere in this
  // 11k-line file cannot fail the assertion.
  const startIdx = portal.indexOf(".btn-approve-pay-req'");
  assert(startIdx !== -1, 'T23.11: found the payment-approval handler in js/portal.js');
  const handler = portal.slice(startIdx, startIdx + 6000);

  assert(/postToApi\(\s*'\/api\/approve-payment-request'/.test(handler), 'T23.12: the approval handler posts to /api/approve-payment-request rather than mutating the tables from the browser');

  // The precise shape that lost money: read the cache, add, write back.
  const clientArithmetic = /(paidFee|pendingFee)\s*=\s*(Number\()?[^;\n]*\b(paidFee|pendingFee)\b[^;\n]*[+-]/.test(handler);
  assert(!clientArithmetic, 'T23.13: the approval handler does not add to or subtract from a cached paidFee/pendingFee — two admins clearing one queue would both read the same stale value');

  assert(/approved\.paid_fee/.test(handler) && /approved\.pending_fee/.test(handler), 'T23.14: balances are copied from the RPC response, i.e. from the row the transaction committed');

  // A random receipt number means a retry mints a second receipt and credits the
  // payment twice, with nothing to tell the two apart.
  const randomReceipt = /rec(?:eipt)?No\s*=\s*`[^`]*(?:Date\.now|Math\.random)/i.test(handler);
  assert(!randomReceipt, 'T23.15: the approval handler does not mint a receipt number from a clock or RNG — a dropped response would then double-credit on retry');
  assert(/REC-'\s*\|\|\s*upper\(regexp_replace/.test(sql), 'T23.16: the RPC derives the receipt number from the request id, so a replay reproduces it');

  // A replay must be reported, not celebrated as a fresh payment, or the audit
  // log grows an entry and the family gets a notice for money already credited.
  assert(/idempotent/.test(handler), 'T23.17: the approval handler distinguishes an idempotent replay from a fresh approval');

  // --- Lock ordering ------------------------------------------------------
  // Request first, then student — the same order everywhere, or two admins
  // approving two requests for one student can deadlock.
  const fn = sql.slice(sql.indexOf('FUNCTION public.approve_payment_request'));
  const body = fn.slice(0, fn.indexOf('$fn$;'));
  const reqLock = body.indexOf('student_requests');
  const stuLock = body.indexOf('FOR UPDATE', body.indexOf('public.students'));
  assert(/student_requests[\s\S]{0,200}FOR UPDATE/.test(body), 'T23.18: the RPC locks the request row FOR UPDATE');
  assert(stuLock !== -1, 'T23.19: the RPC locks the student row FOR UPDATE before touching the balance');
  assert(reqLock < body.indexOf('public.students'), 'T23.20: the request is locked before the student — a consistent lock order is what keeps two concurrent approvals from deadlocking');
}
