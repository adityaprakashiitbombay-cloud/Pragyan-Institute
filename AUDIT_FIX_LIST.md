# 🔥 AUDIT FIX LIST — Pragyan Institute Portal
**Generated:** 2026-08-23 · **Scope:** full-codebase audit of the post-merge working tree (`fa740c9` + uncommitted fixes)
**Verification baseline:** `npm test` = 268/268 pass **against the working tree only** — committed `main` is broken (see F-01).

> ## ✅ STATUS UPDATE — 2026-08-23 (post-remediation)
> Four fix phases landed on `main`: `07d72ff` (Phase 1), `bae31e3` (Phase 2), `6ac1f0d` (Phase 3), `2d52217` (Phase 4). Suite: **268/268 green**, build re-stamped.
>
> **FIXED:** F-01, F-02, F-05, F-06, F-07 (gateway wired + payment endpoint), F-13–F-18, F-21 (all sites checked), F-22, F-23, F-24, F-25, F-27 (outbox flush covers post-logout risk partially), F-31, F-32, F-33, F-34, F-35, F-36, F-38, F-39, F-42 (key-in-header; model-ID verification still open), F-43, F-44, F-45, F-46, F-48, F-49 (vite.config deleted; fee-calculator kept — tests import it), F-50.
>
> **STILL OPEN (operator action / later work):**
> - F-03/F-04/F-05-rotation: move the Resend key txt out of the folder and rotate ALL leaked credentials (anon key in git history, Gemini key historically committed). Code no longer ships any embedded secret except the anon-key inline fallbacks pending rotation.
> - Apply `supabase_production_hardening.sql` in Supabase SQL Editor (safe now — client is on the gateway), then verify login + payments live.
> - F-10 rate-limit shared store; F-11 Stream token TTL; F-12 ilike `_` escape.
> - F-19 verify legacy UUID-keyed receipts visible after deploy (scope widening shipped server-side).
> - F-20 legacy SQL files left as historical archive; canonical = hardening file.
> - F-26 student-pull cache clobber on shared browsers; F-28 keyset pagination; F-29 partial-sync badge nuance; F-30 batch-transfer product gap; F-37 storage-folder doc decision (code whitelist is authoritative); F-40 boot-time version gate; F-41 SW cache size caps; F-42 model-ID verification against live API.
> - Day-15 reminder removal confirmed deliberate and documented in AGENTS.md.

Legend: **[P0]** deploy/security blocker · **[P1]** money/data-integrity · **[P2]** reliability/UX · **[P3]** hygiene/docs

---

## A. REPO & DEPLOYMENT STATE

| ID | Sev | Item | Location | Fix |
|----|-----|------|----------|-----|
| F-01 | P0 | **Committed `main` tip is an unresolved merge** — raw `<<<<<<<` conflict markers in ~17 files (portal.js ×84 lines, cron ×15, sw.js ×12, vercel.json ×3 ⇒ invalid JSON at HEAD). Every clone/deploy/CI from `main` gets garbage; the ₹700-underbilling engine also reverted at HEAD in `.github/scripts/trigger-billing.js`. | commit `fa740c9` | After F-02, commit the resolved working tree; redo or clearly fixup-mark the merge commit; run CI on the result before any deploy. |
| F-02 | P0 | **Passwordless head-admin login** — localhost/127.0.0.1/`file:` + username `chandan`/`ADM-01` returns a full `is_head:true` admin session with **any password** when `/api/auth-login` is unreachable. | `js/supabase-sync.js:~1762-1791` | Delete the block outright (dev bypass belongs behind a server flag, not the shipped bundle). Do this BEFORE committing F-01. |
| F-03 | P0 | **Live Resend sending key sitting untracked in repo folder** (`resend.com  re_hf2p8xHA_*.txt`) — one `git add -A` away from being committed. | repo root | Move out of workspace, add pattern to `.gitignore`, **rotate the key**. |
| F-04 | P0 | **Supabase anon key hardcoded** in browser bundles (public by design but currently the operative credential for an open DB) and present in git history. | `js/config.js:15`, `js/supabase-sync.js:11`, git history | Rotate after RLS lockdown lands; inject via build/env instead of inline literal. |
| F-05 | P0 | **Gemini API key committed** (base64-obfuscated) as server fallback; endpoint is also unauthenticated. | `api/gemini-proxy.js:12`, `:3-13` | Remove embedded key, rotate it, add session gate or rate limit + prompt-size cap; stop echoing upstream error text to anonymous callers. |

## B. AUTHENTICATION & ACCESS CONTROL

| ID | Sev | Item | Location | Fix |
|----|-----|------|----------|-----|
| F-06 | P0 | **DOB-substring auth bypass** — any ≥6-digit *substring* of a student's DOB digits authenticates (`dobDigits.includes(inputDigits)`). Default credential space collapses to ~6 guesses/student; per-identifier rate limit doesn't stop rotation and is per-lambda-instance. | `api/auth-login.js:238` | Exact-match normalized DOB only (keep DDMMYYYY variants); add IP-level throttling or captcha on student login. |
| F-07 | P0 | **RLS lockdown fork** — `/api/db` gateway exists (JWT-gated, scoped) but has **zero call sites**; client still speaks PostgREST with the anon key. Hardening SQL revokes anon ⇒ applying it bricks the live portal; not applying leaves every table open (`FOR ALL TO anon`). | `js/supabase-sync.js:16,387-388`; `supabase_production_hardening.sql` | Retarget `SupabaseSync._rest()` through `POST /api/db` (Bearer session token) FIRST, then apply the hardening SQL. |
| F-08 | P1 | **Client-side fallback auth stack** — bcrypt verified in-browser against anon-fetched `password_hash`, plaintext column comparisons (`admins.password`, `new_data.password`), forgeable `token_adm_/token_stu_` offline tokens, direct-anon DB queries. | `js/supabase-sync.js:1616-1904` | Remove all fallback branches; on gateway failure show "sign-in unavailable", never degrade locally. |
| F-09 | P1 | **Eternal sessions** — localStorage session `{role,user,savedAt}` restored with no TTL check (`savedAt` written, never read); hand-editing storage renders full admin UI. Server APIs are safe (HMAC JWT); data-plane writes ride the anon key until F-07. | `js/portal.js:2987-3000` | Enforce 8h expiry on restore; after F-07 the data plane is server-authorized anyway. |
| F-10 | P2 | Rate limiter keyed only on submitted identifier (formatting variants reset the bucket); in-memory Map resets per lambda instance. | `api/auth-login.js:5,63` | Normalize identifier (digits-only for mobiles) + shared store (Upstash/Redis) or per-IP complement. |
| F-11 | P2 | Stream Chat tokens never expire (`createToken(userId)` without TTL). | `api/stream-token.js:16` | Pass exp = portal-session TTL. |
| F-12 | P2 | `ilike` `_` wildcard survives admin identifier sanitization (`ch_ndan` matches `chandan`). | `api/auth-login.js:74,82` | Escape `_`/`%` before `.or(ilike…)`. |

## C. MONEY PATHS

| ID | Sev | Item | Location | Fix |
|----|-----|------|----------|-----|
| F-13 | P1 | **Admin payment modal phantom success** — local balances/receipt mutated first; cloud failure swallowed (`mutate` returns `{success:false}`, never throws); ✅ alert fires regardless. Offline cash entry silently vanishes on next pull. | `js/portal.js:6748-6771` | Check result; block success UI on failure; use `mutateOrThrow` + user-visible error. |
| F-14 | P1 | **Low-entropy receipt_no with destructive upsert** — `REC-<4 time chars>-<3 random>`; collision **replaces** an existing receipt row (possibly another student's). | `js/portal.js:6708` | Use server-side sequence/RPC-generated receipt numbers; upsert → plain insert with unique-violation handling. |
| F-15 | P1 | **Old-Due form accepts negative/zero amounts** — `-500` reduces dues under an `OLD-DUE-*` label with an audit entry claiming money added. No upper bound either (overpay ⇒ paid > total). | `js/portal.js:6697-6782` | Validate `amount > 0` and cap at sensible ceiling; same bounds as the pay modal. |
| F-16 | P1 | **pay.html tamper trust chain** — amount/roll authored via URL; approval credits whatever the request claims; verifier card shows only claimed figure (`claimedTotalDueBefore`/`remainingDueAfter` stored but never rendered); impersonation via arbitrary roll. Overclaim scenario: genuine ₹500 transfer + crafted ₹17,100 link passes human UTR check. | `pay.html:1464-1491`; `js/portal.js:10684+` | Render claimed-dues fields in the approval card; add server-side sanity check at approval (amount ≤ pending_fee + grace, or require amount match to bank-entry echo field). |
| F-17 | P1 | **request_id entropy + merge-duplicates** — `REQ-PAY-<ts36>-<≤3 rand chars>` (~16 bits) with ON CONFLICT DO UPDATE ⇒ silent overwrite of another pending request. | `pay.html:1464`; sync insert `resolution=merge-duplicates` | Longer random suffix (≥128 bits); switch inserts to `ignoreDuplicates`/plain insert with 409 surfacing. |
| F-18 | P2 | **UTR uniqueness enforced only within one browser** — duplicate claims across devices/siblings undetected server-side. | `pay.html:1413-1422` | Unique index on `new_data->paymentDetails->utr` (partial WHERE utr not null) or RPC-level dedupe check. |
| F-19 | P2 | `fee_receipts.student_id` written as UUID by some server paths while gateway/pull scoping keys on 6-digit `session.sub` — students may not see server-created receipts. Verify live data shape. | cron/approve writers vs `api/db.js:117` | Standardize receipts on TEXT `student_id` everywhere (or scope by both columns). |
| F-20 | P2 | Money-RPC deployment hazards — old migrations 003/004 still grant EXECUTE to `anon`; **three divergent `approve_payment_request` definitions** (003/005 RETURNS TABLE vs hardening jsonb that the UI parses); quota SQL exists only in root hardening file, absent from `database_migrations/`. | `database_migrations/*`, `supabase_production_hardening.sql` | Declare ONE canonical SQL source (recommend hardening file split into numbered migrations incl. new 006_quota_ledger.sql); delete/retire conflicting copies; update operator guidance (F-46). |

## D. DATA INTEGRITY & SYNC ENGINE

| ID | Sev | Item | Location | Fix |
|----|-----|------|----------|-----|
| F-21 | P1 | **~19 bare-`await SupabaseSync.mutate(...)` sites discard results** — dead `catch` blocks (mutate resolves `{success:false}` instead of throwing): student delete cascade, recordReceipt, notice delete, profile-request handlers, etc. UI reports success while cloud keeps old value; next `pullAll()` resurrects it. | `js/portal.js` (delete cascade ~1690-1717, recordReceipt ~1905, notice delete ~9017, others) | Sweep all call sites: branch on `.success`, restore button state + toast on failure (pattern already applied to payment-approve/status handlers — extend to the rest). |
| F-22 | P1 | **No outbox/retry queue** — failed mutation is lost; reconnect only re-pulls. pay.html's undelivered queue is written but nothing auto-flushes it. | `js/supabase-sync.js` (by design, comment at ~896); `pay.html` undelivered queue | Add minimal mutation outbox flushed on `online`/login; or at minimum surface persistent-failure banner per table. |
| F-23 | P1 | **Delete cascade fail-open** — if sync layer missing, entire cloud cascade skipped, local wipe + success alert, student resurrects with children intact. Ledger deleted only by 6-digit id (not UUID); fully-paid student deletable without typed confirmation. | `js/portal.js:1688-1733`, `:1691-1699` | Require cascade success before local wipe; delete ledger by both identifiers; typed confirmation always. |
| F-24 | P2 | Sync `update` path PATCHes **raw un-normalized payload** (camelCase/virtual fields ⇒ silent 400). | `js/supabase-sync.js:854` | Route updates through the same row-mapping as insert/upsert. |
| F-25 | P2 | localStorage-quota eviction Stage-1 wipes every non-critical key **including `pragyan_undelivered_payment_submissions`** (offline payment outbox destroyed under pressure). | `js/supabase-sync.js:1016-1021` | Add the outbox key (+chat settings if desired) to protected set; consider IndexedDB for money-adjacent queues. |
| F-26 | P2 | Student-role pull replaces shared master caches with that one student's rows — admin on a shared browser sees 1-student roster until own pull completes. | `js/supabase-sync.js:485-512,967` | Namespace caches per session role/sub, or skip cache-replace for student pulls of shared tables. |
| F-27 | P2 | `destroy()` abort is dead code — per-page AbortController overrides the pull signal; post-logout in-flight pull still writes localStorage + fires callbacks. | `js/supabase-sync.js:435-438 vs 191-193` | Chain signals (`AbortSignal.any`) or check destroyed-flag after await. |
| F-28 | P2 | Offset pagination can skip/duplicate rows written mid-pull (ordered offset windows). | `js/supabase-sync.js:407-454` | Keyset pagination (`order col > last`) per table. |
| F-29 | P2 | Partial sync failure (e.g., students table fails, rest OK) flips badge to "Cloud synced" while freezing stale roster indefinitely. | `js/supabase-sync.js:477-499` | Per-table staleness timestamps; degraded badge state; retry priority for failed tables. |
| F-30 | P1 | **Mid-month batch transfer unhandled anywhere** — changing class leaves old ledger label/dues structure; no adjustment flow; barcode class-code staleness. | product gap | Admin "Transfer Batch" action writing an `ADJ-` adjustment receipt + updating class_name/monthly_fee atomically. |
| F-31 | P2 | Profile-request handlers delete uploaded photo **before** cloud write records outcome — failed write leaves Pending request pointing at deleted file (approve & decline paths). | `js/portal.js` profile-request section | Reorder: persist reference first, delete old blob only after confirmed success. |
| F-32 | P2 | Decline path: `update … where request_id` matching 0 rows still resolves success — request stays Pending in cloud while UI says declined. | `js/portal.js:11000-11011` | Use `mutateOrThrow` + returned-row count check. |
| F-33 | P2 | `db.js` student `student_requests` insert/upsert checks row ownership but runs query unscoped — crafted `request_id` could reset another student's pending row. | `api/db.js:133-143` | Pin `filters.where.student_id = session.sub` for student writes. |
| F-34 | P2 | `dispatchWithQuota` breaks after first deferred wave without reporting later waves — day-10 final reminders deferred are lost for the month (statements self-heal via retry sweep; reminders don't). | `api/_lib/email-quota.js:292-294` | Push remaining waves' recipients into `deferred` before break. |

## E. INJECTION / INPUT TRUST

| ID | Sev | Item | Location | Fix |
|----|-----|------|----------|-----|
| F-35 | P1 | **Stored XSS via approved profile updates** — approved request fields copied raw into student record, then rendered unescaped in directory table, notice titles, fee-history notes, receipts table, avatar attribute sink. One malicious guardianName executes in every admin view post-approval. | writers `js/portal.js:11065-11075`; sinks `6029-6036, 4190, 4401, 5000-5016, 3121` | Sanitize on write (server-side validation in `/api/db` for self-edit fields) AND escape at render sinks (escapeHtml exists — apply). |
| F-36 | P2 | Upload proxy trusts declared content-type (magic-byte sniffing absent) onto a **public** bucket; error.message echoed to client; no per-user quota. Path traversal itself is properly prevented. | `api/upload-file.js` | Sniff content bytes server-side; generic error text; signed URLs or private bucket for proofs. |
| F-37 | P2 | Storage-rule contradiction — upload whitelist allows `admin_avatars/`, `notice_attachments/`, `payment_proofs/`; AGENTS.md mandates bucket contain ONLY `profile_pictures/` + `notifications/`. Decide which is true; align code/docs. | `api/upload-file.js:5` vs AGENTS.md | Pick canonical folder set; update the other. |
| F-38 | P3 | `health.js` exposes raw driver errors publicly and counts `unconfigured` DB as `online`; version string stuck at `'80.1'`. | `api/health.js:10-27` | Generic status text; gate detail behind admin session. |

## F. FRONTEND / PWA / MOBILE / A11Y (residual)

| ID | Sev | Item | Location | Fix |
|----|-----|------|----------|-----|
| F-39 | P2 | SW serves **online 404 bodies** for old-`?v=` assets after a deploy (fallback triggers only on network rejection) — flaky-network deploy skew window. | `sw.js:160-167` | Treat 404 on hashed assets as cache-miss → `ignoreSearch` fallback. |
| F-40 | P2 | No boot-time version gate — stale cached shell keeps issuing writes in legacy shapes against migrated DB. | portal bootstrap | Compare embedded build hash vs served hash; force reload or disable mutations on mismatch. |
| F-41 | P3 | No cache size controls (unbounded runtime growth within a generation); CDN fonts/icons uncached offline (cosmetic loss); SW precaches app/chat/portal that pay.html never loads (harmless surplus). | `sw.js` | LRU trim on activate + periodic cap. |
| F-42 | P2 | Gemini model IDs unverifiable (`gemini-3.6-flash`…); if invalid, chat silently degrades to canned KB while header claims "Active • Gemini 3.6 Flash". System prompt shipped twice per request (contents[0] + systemInstruction). Custom key stored plaintext + sent as URL query. | `js/chat.js:7-12,1213-1229,1252` | Verify IDs against live API once; single systemInstruction channel; drop query-string key usage. |
| F-43 | P2 | UPI VPA is dead config — admin-editable `upi_id` writable via gateway but every link builder hardcodes `PAYEE.upiId`; third stray VPA `pragyanlalganj@upi`. Changing Settings never changes where students pay. | `js/academic-config.js:231`; `js/portal.js:10239,1988`; `pay.html` | Read effective payee from admins.upi_id (gateway-masked column already exposed) with PAYEE as fallback; delete stray literal. |
| F-44 | P3 | `MIN_PAYMENT=100` makes sub-₹100 balances unpayable (full-mode blocked; partial clamps UP to 100 overpaying residual). Negative URL amount sign-flips to positive (fabricated due). | `pay.html:1036,1051,1358,1443` | Allow full-mode below floor when paying exact balance; reject negatives explicitly. |

## G. DOCS & HYGIENE

| ID | Sev | Item | Fix |
|----|-----|------|-----|
| F-45 | P2 | **AGENTS.md stale post-merge**: references deleted `tabs/contact/gallery/counter`, `supabase-client.js` (now `supabase-config.js`), migration 005 as active fix (superseded), old `BATCH_SCHEDULE` name (now `BILLING_CALENDAR`), day-15 entry, pre-merge cron facts. | Rewrite sections: Commands (syntax_check walker), Database (canonical SQL source), Cron (single scheduler days 1-10), Frontend (academic-config module). |
| F-46 | P2 | Operator guidance mismatch — `approve-payment-request.js:88` says run root hardening SQL; AGENTS.md points operators at `database_migrations/`. | Pick one canonical instruction (tie to F-20 decision). |
| F-47 | P3 | Day-15 follow-up reminder removed from calendar+cron silently — confirm intended; document in AGENTS.md or restore. | Decision + doc/code alignment. |
| F-48 | P3 | Legacy doc drift: README (Classes 8–10 only), AI_CONTEXT (YYCCXX naming, obsolete cron, wrong sender address), DEPLOYMENT_GUIDE/SECRETS_GUIDE instructing Actions secrets that changed; `API_BASE_URL` Actions variable undocumented. | Batch doc refresh after code decisions land. |
| F-49 | P3 | Dead code/artifacts: `vite.config.js`, orphaned `js/fee-calculator.js` (only tests import), legacy root `supabase_*.sql` contradicting hardening file, `scratch_payload*` clutter. | Delete or archive. |
| F-50 | P3 | Stale worktree `.claude/worktrees/admiring-kepler-50a04f` + its branch after F-01 lands. | `git worktree remove` + `git branch -D` + `prune`. |

---

## ✅ VERIFIED SOUND — do not regress these

- Canonical config module (`js/api academic-config.js` mirrors + parity test) drives ALL fee surfaces; the ₹500-Class-10th / ENG-9-12-₹1500 bug family is gone.
- Billing: lock-first `apply_monthly_fee` (bare `ON CONFLICT DO NOTHING` absorbing both unique indexes), RPC-only callers (JS fallback deleted), claim/settle-gated statement emails, IST-day reminder dedupe, atomic quota reserve/settle with advisory lock, waves @ concurrency 2, fail-closed on quota-outage, partial-batch `deferred` reporting, `forceDay` replay safety.
- Approval: single-RPC endpoint, failure payloads mapped to non-200, client uses atomic call with mirror-not-arithmetic reconciliation + double-click guard.
- Single scheduler (Vercel days 1–10); GH Actions reduced to thin manual trigger needing only CRON_SECRET.
- Browser billing engine read-only; non-cash receipts preserved through pulls (`isNonCash`).
- Email templates: all interpolations escaped/encoded; amounts number-coerced.
- Syntax checking is a directory walker (can't drift); T20–T24 guards wired into `npm test`.

## Recommended execution order

1. **F-02** (backdoor) → **F-01** (commit resolved tree) → CI green on new tip.
2. **F-03/F-04/F-05** credential rotation + removal.
3. **F-07** gateway wiring → then apply RLS hardening (canonical SQL per F-20).
4. **F-13-F-18** money-path hardening batch.
5. **F-21-F-34** integrity batch (start with the 19 unchecked-mutate sweep).
6. **F-35** XSS batch, then P2/P3 sweeps + docs (**F-45** immediately after decisions in 3-4).
