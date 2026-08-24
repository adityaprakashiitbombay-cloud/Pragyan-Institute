// Resend free tier is a hard 100 messages per calendar day. Going over does not
// queue — the provider rejects, and on a billing run that means a batch of
// parents silently never receive their statement.
//
// The arithmetic lives in PostgreSQL (reserve_email_quota / settle_email_dispatch
// / email_quota_status in supabase_production_hardening.sql section 11) because
// three different callers send mail — the cron billing run, the admin manual
// trigger, and student receipt downloads — and they can run concurrently. Doing
// `SELECT count(*)` then `if (count + n <= 100)` in Node is a textbook race: two
// callers both read 99, both decide there is room, and the day ends at 101 with
// one silent rejection. reserve_email_quota takes an advisory lock for the IST
// day and hands out slots atomically.
//
// This module is the single Node-side entry point to that ledger, so the three
// callers cannot drift in how they reserve, settle, or report a partial batch.

import { getSupabase } from './auth.js';

/** Resend's free-tier ceiling. Override per-deployment if the plan changes. */
export const DAILY_EMAIL_LIMIT = Number(process.env.EMAIL_DAILY_LIMIT) || 100;

/**
 * Categories are recorded per dispatch so the dashboard can show what consumed
 * the day's quota. Kept as a closed set: a typo'd category would silently create
 * a new bucket in the breakdown and make the numbers unexplainable.
 */
export const EMAIL_CATEGORIES = Object.freeze({
  BILLING: 'billing_statement',
  RECEIPT: 'computerized_receipt',
  REMINDER: 'fee_reminder',
  NOTICE: 'notice',
  ADMIN: 'admin_manual',
  OTHER: 'other'
});

const VALID_CATEGORIES = new Set(Object.values(EMAIL_CATEGORIES));

export class EmailQuotaUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EmailQuotaUnavailableError';
  }
}

export function normaliseCategory(category) {
  if (typeof category !== 'string') return EMAIL_CATEGORIES.OTHER;
  const lower = category.trim().toLowerCase();
  if (VALID_CATEGORIES.has(lower)) return lower;
  if (lower === 'billing' || lower === 'invoice' || lower === 'monthly_invoice' || lower === 'fee_invoice') return EMAIL_CATEGORIES.BILLING;
  if (lower === 'reminder' || lower === 'fee_reminder' || lower === 'dues' || lower === 'due_notice') return EMAIL_CATEGORIES.REMINDER;
  if (lower === 'receipt' || lower === 'payment' || lower === 'payment_receipt' || lower === 'computerized_receipt') return EMAIL_CATEGORIES.RECEIPT;
  if (lower === 'notice' || lower === 'circular' || lower === 'exam_circular' || lower === 'announcement') return EMAIL_CATEGORIES.NOTICE;
  if (lower === 'admin' || lower === 'admin_manual' || lower === 'custom_announcement') return EMAIL_CATEGORIES.ADMIN;
  return EMAIL_CATEGORIES.OTHER;
}

/**
 * Live quota for today. Shape:
 *   { day, limit, used, remaining, breakdown: { category: count } }
 *
 * `remaining` is already floored at 0, matching max(0, 100 - X) from the spec.
 */
export async function getQuotaStatus(limit = DAILY_EMAIL_LIMIT) {
  const supabase = getSupabase();
  if (!supabase) throw new EmailQuotaUnavailableError('Database is not configured');

  const { data, error } = await supabase.rpc('email_quota_status', { p_limit: limit });
  if (error) throw new EmailQuotaUnavailableError(error.message || 'Quota lookup failed');
  return data;
}

/**
 * Reserve one slot per recipient, atomically.
 *
 * Returns { granted: [{dispatch_id, recipient}], deferred: [email], ... }. When
 * the cap is reached mid-batch the granted list is short and the remainder comes
 * back in `deferred` — the caller is expected to send to `granted` and report
 * `deferred` to the operator, NOT to abort the whole run. A run that lands on
 * slot 99 of 100 must still deliver that one statement.
 *
 * `dedupeKeys`, when given, must align 1:1 with `recipients`. Anything whose key
 * already has a live row today comes back under `duplicate` and takes no slot —
 * that is what stops a parent being chased twice in one day. Note that supplying
 * keys also disables the address-level collapse below, because two rows for one
 * address are then legitimate (siblings) and the key decides what is a repeat.
 *
 * Fails closed: if the ledger is unreachable, nothing is sent. Sending blind
 * would be worse than a delayed statement, because it burns quota that the
 * following day's reminders depend on and the operator has no record of it.
 */
export async function reserveQuota({ category, recipients, reference = null, limit = DAILY_EMAIL_LIMIT, dedupeKeys = null }) {
  const supabase = getSupabase();
  if (!supabase) throw new EmailQuotaUnavailableError('Database is not configured');

  const list = Array.isArray(recipients) ? recipients : [recipients];
  const keys = Array.isArray(dedupeKeys) ? dedupeKeys : null;
  if (keys && keys.length !== list.length) {
    throw new EmailQuotaUnavailableError('reserveQuota: dedupeKeys must align 1:1 with recipients');
  }

  const clean = [];
  const cleanKeys = [];
  const seen = new Set();
  list.forEach((value, index) => {
    if (typeof value !== 'string') return;
    const email = value.trim().toLowerCase();
    if (!email) return;
    if (!keys) {
      if (seen.has(email)) return;
      seen.add(email);
    }
    clean.push(email);
    if (keys) cleanKeys.push(keys[index] == null ? null : String(keys[index]).slice(0, 200));
  });

  if (!clean.length) {
    return { day: null, limit, used_before: null, granted: [], granted_count: 0, deferred: [], deferred_count: 0, duplicate: [], duplicate_count: 0, remaining_after: null };
  }

  const { data, error } = await supabase.rpc('reserve_email_quota', {
    p_category: normaliseCategory(category),
    p_recipients: clean,
    p_reference: reference,
    p_limit: limit,
    p_dedupe_keys: keys ? cleanKeys : null
  });
  if (error) throw new EmailQuotaUnavailableError(error.message || 'Quota reservation failed');

  return {
    day: data?.day ?? null,
    limit: data?.limit ?? limit,
    used_before: data?.used_before ?? null,
    granted: Array.isArray(data?.granted) ? data.granted : [],
    granted_count: data?.granted_count ?? 0,
    deferred: Array.isArray(data?.deferred) ? data.deferred : [],
    deferred_count: data?.deferred_count ?? 0,
    duplicate: Array.isArray(data?.duplicate) ? data.duplicate : [],
    duplicate_count: data?.duplicate_count ?? 0,
    remaining_after: data?.remaining_after ?? null
  };
}

/**
 * Close out reserved slots.
 *
 *   'sent'     delivered; slot stays consumed
 *   'failed'   provider rejected it; slot is released for reuse today
 *   'deferred' never attempted; slot released
 *   'unknown'  request timed out; slot STAYS consumed, because Resend may have
 *              delivered it and we must not hand the same slot out twice
 *
 * Never throws. A settle failure must not turn a delivered email into a 500 —
 * the mail is already gone, and the worst case of a lost settle is one slot
 * stuck in 'pending' for the rest of the day, which errs toward under-sending.
 */
export async function settleQuota(dispatchIds, status, { messageId = null, error = null } = {}) {
  const ids = (Array.isArray(dispatchIds) ? dispatchIds : [dispatchIds])
    .map(Number)
    .filter(Number.isFinite);
  if (!ids.length) return 0;

  try {
    const supabase = getSupabase();
    if (!supabase) return 0;
    const { data, error: rpcError } = await supabase.rpc('settle_email_dispatch', {
      p_dispatch_ids: ids,
      p_status: status,
      p_message_id: messageId,
      p_error: error ? String(error).slice(0, 500) : null
    });
    if (rpcError) {
      console.error('settle_email_dispatch failed:', rpcError.message);
      return 0;
    }
    return data ?? 0;
  } catch (err) {
    console.error('settle_email_dispatch threw:', err?.message || err);
    return 0;
  }
}

/**
 * Map a sendEmailViaResend result onto a settle status.
 * A timeout is 'unknown', not 'failed' — see settleQuota above.
 */
export function statusForSendResult(result) {
  if (result?.success) return 'sent';
  if (result?.timedOut) return 'unknown';
  return 'failed';
}

// Resend's free tier rate-limits at roughly 2 requests/second. Going wider just
// earns 429s that are indistinguishable from real delivery failures.
export const SEND_CONCURRENCY = 2;

/**
 * Split items into waves such that no wave contains the same email twice.
 *
 * reserveQuota() deduplicates recipients, which is right for one message to one
 * address but wrong for a batch: siblings share a parent's email, and two
 * students each need their own statement and therefore their own slot.
 * Collapsing them would grant one slot, send one email, and leave the second
 * child's ledger row looking permanently unsent. Almost every real run produces
 * exactly one wave.
 */
export function partitionByUniqueRecipient(items, getEmail) {
  const waves = [];
  const seenPerWave = [];
  for (const item of items) {
    const email = String(getEmail(item) || '').trim().toLowerCase();
    let index = 0;
    while (index < seenPerWave.length && seenPerWave[index].has(email)) index++;
    if (index === seenPerWave.length) {
      seenPerWave.push(new Set());
      waves.push([]);
    }
    seenPerWave[index].add(email);
    waves[index].push(item);
  }
  return waves;
}

/**
 * Reserve quota for `items`, then hand each granted slot to `send`.
 *
 * `send(item, slot)` returns `{ result, report }` where `result` is a
 * sendEmailViaResend-shaped object, or a falsy value to abandon that slot (e.g.
 * a ledger claim lost to a concurrent run).
 *
 * This helper owns settling in both directions so no caller can leak a reserved
 * slot: a granted slot is always closed as sent/failed/unknown, and an abandoned
 * one is released as 'deferred' so the day's remaining quota is not lost.
 *
 * `getDedupeKey(item)`, when supplied, opts the batch into same-day duplicate
 * suppression: an item whose key already went out today is reported as
 * `skipped_duplicate` and never re-sent. Use it for reminders, which have no
 * other guard — statements are already protected by claim_ledger_email.
 *
 * Returns `{ results, deferred, quotaError }`. A quota outage is reported rather
 * than thrown, because the caller has usually already written money to the
 * ledger by this point and must not unwind that over an email problem.
 */
export async function dispatchWithQuota({ items, category, getEmail, reference, send, limit = DAILY_EMAIL_LIMIT, getDedupeKey = null }) {
  const results = [];
  const deferred = [];

  for (const wave of partitionByUniqueRecipient(items, getEmail)) {
    const byEmail = new Map(wave.map(item => [String(getEmail(item)).trim().toLowerCase(), item]));
    const keys = getDedupeKey ? wave.map(item => getDedupeKey(item)) : null;

    let reservation;
    try {
      reservation = await reserveQuota({
        category,
        recipients: wave.map(item => String(getEmail(item) || '')),
        reference,
        limit,
        dedupeKeys: keys
      });
    } catch (error) {
      if (error instanceof EmailQuotaUnavailableError) {
        // Fail closed. Sending blind burns slots with no record, and the next
        // run would then overshoot the cap and be rejected by Resend outright.
        return { results, deferred: deferred.concat(wave.map(getEmail)), quotaError: error.message };
      }
      throw error;
    }

    deferred.push(...reservation.deferred);

    // Suppressed, not failed and not deferred: these are deliberately not sent
    // and must not be retried, so they are reported rather than queued.
    for (const dup of reservation.duplicate) {
      results.push({ email: dup.recipient, dedupeKey: dup.dedupe_key, status: 'skipped_duplicate' });
    }

    for (let i = 0; i < reservation.granted.length; i += SEND_CONCURRENCY) {
      const slice = reservation.granted.slice(i, i + SEND_CONCURRENCY);
      const settled = await Promise.all(slice.map(async (slot) => {
        const item = byEmail.get(slot.recipient);
        const outcome = item ? await send(item, slot) : null;
        if (!outcome) {
          await settleQuota([slot.dispatch_id], 'deferred');
          return null;
        }
        const status = statusForSendResult(outcome.result);
        await settleQuota([slot.dispatch_id], status, {
          messageId: outcome.result?.data?.id || null,
          error: outcome.result?.success ? null : outcome.error || 'Email delivery failed'
        });
        // Carry the provider message on a non-delivery so callers can put a reason
        // in the audit log and the operator response instead of a bare 'failed'.
        return status === 'sent'
          ? { ...outcome.report, status }
          : { ...outcome.report, status, error: outcome.error || 'Email delivery failed' };
      }));
      results.push(...settled.filter(Boolean));
    }

    // Once one wave has run out of quota, later waves cannot possibly fit.
    // Their recipients must still be REPORTED as deferred, though — a day-10
    // final reminder that silently vanished from the results would never be
    // retried by anything (statements self-heal via retryUnsentStatements;
    // reminders do not).
    if (reservation.deferred_count) {
      const currentIdx = waves.indexOf(wave);
      for (let w = currentIdx + 1; w < waves.length; w++) {
        deferred.push(...waves[w].map(getEmail).filter(Boolean));
      }
      break;
    }
  }

  return { results, deferred, quotaError: null };
}
