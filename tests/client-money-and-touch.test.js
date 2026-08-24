// T24 — two invariants that regress silently, so they get structural guards.
//
// A. The browser does not bill. api/cron-monthly-fees.js and
//    api/admin-trigger-billing.js call apply_monthly_fee, which takes a
//    `FOR UPDATE` lock on the student row and dedupes on the composite key
//    'BILL-<SID>-<YYYY-MM>'. js/portal.js used to run a second engine from
//    DOMContentLoaded keyed on 'fee_<SID>_<YYYY-MM>' — a key that can never
//    collide with the server's, so every student who opened the portal after the
//    cron ran was charged for the month twice. The engine is gone; these
//    assertions are what stop it growing back.
//
// B. Every tap target clears 44px on a coarse pointer. The floor lives in one
//    @media (pointer: coarse) block in css/main.css. Fifteen controls in the
//    admin panes carry an inline `height: 36px` / `height: 38px`; min-height
//    clamps the used height, so it beats those without !important. If someone
//    switches the rule to `height`, the inline styles win again and the fee
//    filters go back to being 36px on a phone.

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// Strip whole-line comments. This file asserts that code shapes are ABSENT, and
// the fixes deliberately document the shape they removed — without this, the
// comment explaining a deleted bug fails the test proving it is deleted.
const codeOnly = src => src
  .split(/\r?\n/)
  .filter(line => {
    const t = line.trim();
    return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('*/'));
  })
  .join('\n');

export function runClientMoneyAndTouchTests(assert) {
  // ── A. The browser does not bill ─────────────────────────────────────────
  const portal = codeOnly(read('js/portal.js'));

  // The client's key format. Its whole problem was that it does not match the
  // server's, so a match here means two engines are minting non-colliding keys
  // for the same charge again.
  assert(!/idempotency_key:\s*idKey|idempotencyKey:\s*idKey/.test(portal),
    'T24.1: js/portal.js writes no fee_billing_ledger idempotency key of its own — the server\'s is BILL-<SID>-<YYYY-MM> and a second format never collides, so the same month bills twice');

  assert(!/mutate\(\s*'fee_billing_ledger'\s*,\s*'upsert'/.test(portal),
    'T24.2: js/portal.js does not upsert into fee_billing_ledger — apply_monthly_fee owns that table under a row lock');

  // The read-modify-write on a cached balance, which is what made two admins
  // with the dashboard open on the 1st each write their own sum.
  const accrualArithmetic = /(pendingFee|pending_fee)\s*=\s*(prevDue|Number\(\s*s\.(pendingFee|pending_fee)[^)]*\)\s*\+)/.test(portal);
  assert(!accrualArithmetic,
    'T24.3: js/portal.js does not compute a new pending balance by adding a monthly fee to a cached one');

  // The startup call must be read-only. `accrued: 0` is the signature of the
  // reconciliation-only version.
  assert(/checkAndAccrueMonthlyFees/.test(portal), 'T24.4: the billing status check still exists');
  const fnIdx = portal.indexOf('async checkAndAccrueMonthlyFees()');
  assert(fnIdx !== -1, 'T24.5: found checkAndAccrueMonthlyFees in js/portal.js');
  const fnBody = portal.slice(fnIdx, fnIdx + 4000);
  assert(/serverOwned:\s*true/.test(fnBody),
    'T24.6: checkAndAccrueMonthlyFees reports that billing is server-owned rather than performing it');
  assert(!/safeSetItem\(\s*'pragyan_db_students_master'/.test(fnBody),
    'T24.7: the startup billing check writes no student record — it runs on the student dashboard too, where a write would let a student bill themselves');
  assert(!/addAuditLog/.test(fnBody),
    'T24.8: the startup billing check writes no audit entry — every browser opening the portal would add one for a charge it did not make');

  // The server side of the same invariant: exactly one key format.
  const sql = read('supabase_production_hardening.sql');
  assert(/'BILL-'\s*\|\|\s*upper\(v_sid\)\s*\|\|\s*'-'\s*\|\|\s*v_month/.test(sql),
    'T24.9: apply_monthly_fee derives the idempotency key as BILL-<SID>-<YYYY-MM>');
  assert(/FOR UPDATE/.test(sql.slice(sql.indexOf('FUNCTION public.apply_monthly_fee'), sql.indexOf('FUNCTION public.apply_monthly_fee') + 3000)),
    'T24.10: apply_monthly_fee locks the student row FOR UPDATE before touching the balance');

  // ── B. Non-cash receipts survive a sync ──────────────────────────────────
  // normalizeReceipt used to `return null` for every adjustment, carryover and
  // billing accrual, and updateLocalState filtered those nulls out — so a
  // concession the admin recorded vanished from the local cache on the next
  // pullAll(), leaving a balance change nobody could account for.
  const sync = codeOnly(read('js/supabase-sync.js'));
  const nrIdx = sync.indexOf('normalizeReceipt(r) {');
  assert(nrIdx !== -1, 'T24.11: found normalizeReceipt in js/supabase-sync.js');
  const nrEnd = sync.indexOf('normalizeRequest(r) {', nrIdx);
  const nrBody = sync.slice(nrIdx, nrEnd === -1 ? nrIdx + 3000 : nrEnd);
  assert(/isNonCash/.test(nrBody),
    'T24.12: normalizeReceipt tags a non-cash entry rather than deleting it — the fee history renders those rows with their own badge');
  assert(!/startsWith\('REC-BILL-'\)[\s\S]{0,400}return null/.test(nrBody),
    'T24.13: normalizeReceipt does not discard a receipt by prefix — the exclusion belongs where money is summed, not where data is cached');

  // The summing sites are where the exclusion has to live.
  assert(/function isRealCollectedPayment/.test(portal),
    'T24.14: js/portal.js still has isRealCollectedPayment, which is what every revenue total filters through');

  // ── B2. The delete cascade checks its own writes ─────────────────────────
  // Nine unchecked deletes used to run inside a `try` that could never catch
  // anything (mutate returns failures), then the local copy was wiped and success
  // reported. The student reappeared on the next pullAll() with receipts intact.
  const delIdx = portal.indexOf('async deleteStudent(studentId)');
  assert(delIdx !== -1, 'T24.14b: found deleteStudent in js/portal.js');
  const delBody = portal.slice(delIdx, portal.indexOf('\n    },', delIdx + 3000));
  assert(/result\.success !== true/.test(delBody) || /failures\.push/.test(delBody),
    'T24.14c: deleteStudent checks the result of each cascade delete — mutate returns failures rather than throwing, so a try/catch around them catches nothing');
  assert(/return\s*\{\s*success:\s*false/.test(delBody),
    'T24.14d: deleteStudent refuses and leaves the local record intact when the cascade fails, rather than wiping it and reporting success');
  // The photo delete is irreversible; it must not precede the row deletion that
  // justifies it, or a failed cascade leaves a live student pointing at nothing.
  const photoIdx = delBody.indexOf('deleteFile');
  const cascadeIdx = delBody.indexOf("'students', { student_id: cleanStuId }");
  assert(photoIdx === -1 || cascadeIdx === -1 || cascadeIdx < photoIdx,
    'T24.14e: deleteStudent removes the database rows before the storage photo — deleting the photo first leaves a surviving student row pointing at a deleted object');

  // ── C. 44px touch targets on coarse pointers ─────────────────────────────
  const css = read('css/main.css');
  const coarseBlocks = [...css.matchAll(/@media\s*\(pointer:\s*coarse\)\s*\{/g)].map(m => m.index);
  assert(coarseBlocks.length >= 1, 'T24.15: css/main.css has a coarse-pointer block');

  // Anchor on the LAST `min-height: 44px`, not the first: `.tab-btn` carries one
  // outside any media query, and taking that one made the block slice empty.
  const floorIdx = css.lastIndexOf('min-height: 44px');
  assert(floorIdx !== -1, 'T24.16: the 44px touch-target floor exists');
  const earlier = coarseBlocks.filter(i => i < floorIdx);
  assert(earlier.length > 0, 'T24.16b: the 44px floor sits inside a coarse-pointer block, so it cannot shrink a desktop control');
  const floorBlock = css.slice(Math.max(...earlier), floorIdx + 200);

  for (const sel of ['button', '[role="button"]', '[role="tab"]', 'select', 'textarea', '.req-verifier-chip']) {
    assert(floorBlock.includes(sel), `T24.17: the touch-target floor covers ${sel}`);
  }
  // Anchors styled as buttons: min-height does nothing on a non-replaced inline
  // element, so these only work because .btn sets display: inline-flex.
  for (const sel of ['a.btn', 'a.app-btn', 'a.action-btn', 'a.float-btn', 'a.upi-btn-main']) {
    assert(floorBlock.includes(sel), `T24.18: the touch-target floor covers ${sel}`);
  }
  assert(/\.btn\s*\{[^}]*display:\s*inline-flex/.test(css),
    'T24.19: .btn is display:inline-flex — min-height has no effect on a non-replaced inline element, so the anchor-button floor depends on this');

  // `height` would lose to the inline height: 38px the admin panes set.
  const usesHeightNotMin = /@media\s*\(pointer:\s*coarse\)[\s\S]{0,2000}?\n\s{2}height:\s*44px/.test(css);
  assert(!usesHeightNotMin,
    'T24.20: the floor uses min-height, not height — min-height clamps the used height and therefore beats the inline height: 36px/38px on the fee and audit filter selects without !important');

  // The iOS zoom floor is a separate rule and must stay separate: it applies to
  // text-entry controls only.
  assert(/font-size:\s*16px\s*!important/.test(css),
    'T24.21: the 16px font floor for touch devices is present — Mobile Safari zooms the viewport on any focused field below it and does not zoom back out');

  // ── D. No duplicate element ids in a rendered pane ───────────────────────
  // getElementById returns the FIRST match in the document, so a duplicate id
  // across two mounted panes silently wires a handler to the wrong element.
  // Ternary branches are excluded: only one arm is ever emitted.
  // Scan the code, not the comments: this file's own fix notes quote the retired
  // `id="btnRemoveAttachment"` while explaining why the notice-modal copy was
  // renamed, and a raw scan counts that quotation as a second live element.
  const idCounts = new Map();
  for (const m of portal.matchAll(/\sid="([A-Za-z][\w:.-]*)"/g)) {
    idCounts.set(m[1], (idCounts.get(m[1]) || 0) + 1);
  }
  // These three are mutually-exclusive ternary arms of one control, verified by
  // reading the template. Any id NOT on this list appearing twice is a real bug.
  const KNOWN_TERNARY_ARMS = new Set(['studentPasswordStatusPill', 'btnDispatchEmailCampaign']);
  const dupes = [...idCounts.entries()]
    .filter(([id, n]) => n > 1 && !KNOWN_TERNARY_ARMS.has(id))
    .map(([id, n]) => `${id}×${n}`);
  assert(dupes.length === 0,
    `T24.22: js/portal.js emits no duplicate element id outside a ternary — getElementById returns the first match, so a handler binds to the wrong pane (found: ${dupes.join(', ') || 'none'})`);
}
