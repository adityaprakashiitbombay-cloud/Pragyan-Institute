# AGENTS.md — Pragyan Institute Portal

Vanilla HTML/CSS/JS PWA + Vercel serverless APIs (`/api/*.js`, Node 20+) + cloud Supabase Postgres. No bundler, no framework, `"type": "module"`. A single canonical config module defines the academic data: **`api/_lib/academic-config.js`** (server) mirrored by **`js/academic-config.js`** (browser) — kept in lockstep by a parity test; edit BOTH or CI fails. Root-level `*_REPORT.md` / `*_LOG.md` files are historical audit artifacts, not specs. `AUDIT_FIX_LIST.md` tracks open findings.

## Commands
- `npm test` — the ONLY verification gate (~268 checks). Runs `scripts/syntax_check.js` (a directory walker over `api/`, `js/`, `.github/scripts/`, `tests/`, `scripts/` — new files are picked up automatically) then `scripts/run_all_tests.js` (T1–T24 assertion suites). All must pass.
- `npm run build` (= `build:hash`) — runs `scripts/cache_bust.js`, which rewrites the `?v=<version>.<sha8>` tags in `index.html`, `pay.html`, and `sw.js` (`CACHE_NAME`). Run after every change, before commit/deploy. CI (`.github/workflows/ci.yml`) runs `npm ci && npm run test && npm run build`.
- Local serve: `npx serve -p 8080`. `/api/*` only works on Vercel — there is no local function runtime.
- The old hand-maintained `node --check` chain and the four dead ESM modules (`tabs/contact/gallery/counter`) are gone; `vite.config.js` is dead too — never "fix" builds through Vite.

## Build-hash gotcha (stale-cache trap)
`cache_bust.js` hashes ONLY: `index.html`, `features.html`, `pay.html`, `css/{variables,main,components,animations,portal}.css`, `js/{academic-config,config,supabase-sync,chat,app,portal}.js`. Editing anything else does **not** change the build hash — bump something hashed or touch that file's `?v=` tag manually, else the service worker serves stale copies. New `<script>`/`<link>` tags must include a literal `?v=` suffix or the regex won't version them. sw.js serves cached copies when a hashed asset 404s online (version-skew guard).

## Data path & database (Supabase)
- **All browser table access goes through the authenticated gateway `POST /api/db`** (`SupabaseSync._apiDb`). Row scoping for student sessions is enforced SERVER-SIDE (session.sub, widened to UUID+6-digit ids for child tables); students may self-edit only whitelisted profile fields (markup stripped server-side) and may only INSERT (never upsert/update/delete) their own Pending requests. Admins may update only their own admins row.
- **Canonical SQL deployment file: `supabase_production_hardening.sql`** (RLS lockdown, all money/quota/id-sequence RPCs, `fee_email_log`/`email_dispatch_log`). It must be pasted into the Supabase SQL Editor manually — there is no migration runner, and committing SQL deploys nothing. `database_migrations/001–005` are HISTORICAL (their money-RPC definitions are superseded; do not paste them after hardening). Deploying the RLS lockdown is safe ONLY because the client uses the gateway — never revert the client to direct PostgREST.
- Money RPCs are SECURITY DEFINER with EXECUTE granted to `service_role` only. Payments NEVER go into `fee_billing_ledger` (`UNIQUE(student_id,billing_month)` would block that month's accrual) — they live in `fee_receipts`.
- Schema: `students`, `fee_receipts`, `fee_billing_ledger`, `student_requests`, `notices`, `batches`, `admins`, `audit_logs`, `email_dispatch_log`. `students.id` is UUID; `student_id`/`roll_no` are TEXT (6-digit `YYCCSS`). Match students across identifiers — never naive `r.studentId === s.id`.
- Billing idempotency: ledger key `BILL-<SID>-<YYYY-MM>`, month/day computed in **Asia/Kolkata** (`istMonthKey()`/`istDayOfMonth()` in academic-config) — never UTC dates.
- Money prefixes are semantic, not cash: receipt numbers starting `REC-BILL-`, `OLD-DUE`, `ADJ-`, `RATE-`, `EDIT-`, `DUE-`, `NTC-`, `DISC-`, `ADDON-` are ledger/adjustment entries excluded from collected revenue (see `isRealCollectedPayment`). Only Paid/completed/verified counts as money in.
- Sole administrator: `chandan` (ADM-01, head-admin gates check username/name/is_head) — do not weaken.

## Email pipeline (Resend, hard 100/day)
- Quota is an ATOMIC DB ledger: `reserve_email_quota` (advisory-locked per IST day, dedupe keys per recipient/student) → send (max 2 concurrent) → `settle_email_dispatch` ('sent'/'failed' releases slot/'unknown' keeps it). JS entry point: `api/_lib/email-quota.js` (`dispatchWithQuota`); ALL three sender paths (cron billing, admin trigger, send-email endpoint) go through it and FAIL CLOSED if the ledger is unreachable. `/api/email-quota` reads `email_quota_status`.
- Sender domain whitelist: `api/_lib/resend-sender.js` (`noreply@pragyaninstitute.com`); production rejects sandbox `resend.dev`.

## Cron / billing schedule
- Single scheduler: `vercel.json` cron `0 4 1-10 * *` → `api/cron-monthly-fees.js`. Days 1–6 staggered billing, 7–10 reminders (deduped same-day per student via quota dedupe keys), rest state otherwise. Day-15 follow-up was REMOVED deliberately (calendar covers 1–10 only).
- `.github/workflows/monthly-fees.yml` is a MANUAL backstop only (no schedule); both engines share the same RPC + calendar via `_call-api.js` thin triggers with `forceDay` replay support. Do not add a second scheduler — reminders dedupe per day but two schedulers still double-send across midnight boundaries and drift.
- Batch-day scoping uses `isStudentInScope()` on resolved batch ids from `BILLING_CALENDAR` — NEVER `ilike %N%` on class_name.
- Fee resolution lives ONLY in academic-config (`monthlyFeeFor`/`resolveBatch`); Special English resolves before any numeric class rule ("Special English: Class 9th to 12th" contains '9' AND '12'). Browser/server parity is test-enforced.
- Cron endpoints require `Authorization: Bearer <CRON_SECRET>` (or a signed admin session).

## Frontend conventions
- Design tokens in `css/variables.css`; vanilla CSS only. Escape ALL interpolated markup with `sanitizeInput()` (portal) / `window.escapeHtml`; URLs through `sanitizeUrl()`. Modals: use `wireModalA11y()` (focus trap, Escape, reference-counted scroll lock) and close via its handle — never bare `modalEl.remove()`.
- Offline sync engine: `js/supabase-sync.js` (gateway transport, pull mutex/debounce, BroadcastChannel echo suppression via `_tabId`, transient-failure mutation OUTBOX `pragyan_mutation_outbox` flushed on reconnect/post-sync, `CRITICAL_KEYS` protects masters + outbox + undelivered payments under quota pressure). Don't bypass it with raw Supabase calls in UI code.
- Client config: `js/config.js` reads `window.__ENV__` then falls back to inline defaults (public-by-design anon key; ROTATION still pending — see audit). `.env.local` is NOT injected into the browser; only Vercel functions read `process.env`.
- Public payment submissions (pay.html, portal) go through `/api/payment-request`: server-resolved identity, UTR dedupe, server-minted request ids. Approval UI shows claimed-vs-LIVE dues cross-check; approve via `/api/approve-payment-request` only.

## Environment variables (Vercel dashboard)
`PORTAL_SESSION_SECRET` (128+ hex), `CRON_SECRET` (64+), `SUPABASE_URL`+`SUPABASE_ANON_KEY` (+`VITE_` twins), `SUPABASE_SERVICE_ROLE_KEY` (server-only), `RESEND_API_KEY` (`re_` prefix, validated), `RESEND_FROM_EMAIL`, `GEMINI_API_KEY` (gemini-proxy fails closed without it — no embedded fallback). Template: `.env.example`.

## Storage rule
Bucket `pragyan-media` folders currently used: `profile_pictures/`, `notifications/`, `admin_avatars/`, `notice_attachments/`, `payment_proofs/` (upload proxy enforces this whitelist + magic-byte sniffing; declared content-type mismatches are rejected).

## Known issues / open work
1. **Credential rotation pending (operator action)**: anon key (git history + inline fallbacks), Gemini key (removed from code but leaked historically), Resend key found untracked in repo root (ignored by git, move it out).
2. **RLS lockdown**: apply `supabase_production_hardening.sql` in Supabase SQL Editor — safe now that the client is on the gateway. Verify login/payments right after.
3. Auth-login rate limiting is per-instance/per-identifier only (no shared store).
4. Student receipt pulls depend on receipts carrying TEXT `student_id`; legacy UUID-keyed rows pre-date the gateway scope widening — verify live data after deploy.
5. Mid-month batch transfers remain a product gap (no adjustment flow).
6. Gemini model IDs unverifiable offline; chat silently falls back to the local knowledge base if all models fail.
7. `package.json` version drives the cache-bust base (`126.9.x`); bump major.minor deliberately.
