# AGENTS.md — Pragyan Institute Portal

Vanilla HTML/CSS/JS PWA + Vercel serverless APIs (`/api/*.js`, Node 20+) + cloud Supabase Postgres. No bundler, no framework, `"type": "module"`. `AI_CONTEXT/` is the documentation hub; root-level `*_REPORT.md` / `*_LOG.md` files are historical audit artifacts, not specs.

## Commands
- `npm test` — the ONLY verification gate. Runs `node --check` on a hardcoded file list, then `scripts/run_all_tests.js` (T1–T19 assertion suite, ~120 checks). All must pass. Adding a new `api/*.js` or `js/*.js` file requires adding it to the `test` chain in `package.json` or it is never syntax-checked.
- `npm run build` (= `build:hash`) — runs `scripts/cache_bust.js`, which **rewrites** `index.html`, `pay.html`, and `sw.js` (bumps `?v=<version>.<sha8>` tags and SW `CACHE_NAME`). Run after every change, before commit/deploy. CI (`.github/workflows/ci.yml`) runs `npm ci && npm run test && npm run build`.
- Local serve: `npx serve -p 8080`. `/api/*` only works on Vercel — there is no local function runtime.
- `tests/vitest-shim.js` and `tests/*.test.js` are plain-Node modules whose exports are consumed by `run_all_tests.js`; there is no vitest runner installed.

## Build-hash gotcha (stale-cache trap)
`cache_bust.js` hashes ONLY: `index.html`, `pay.html`, `css/{variables,main,components,animations,portal}.css`, `js/{config,supabase-sync,chat,app,portal}.js`. Editing `js/tabs.js`, `js/contact.js`, `js/gallery.js`, `js/counter.js`, or `js/fee-calculator.js` does **not** change the build hash — bump something hashed or touch those files' `?v=` tags manually, else the service worker serves stale copies. New `<script>`/`<link>` tags must include a literal `?v=` suffix or the regex won't version them.

## Database (Supabase)
- Migrations are applied MANUALLY by pasting `database_migrations/00X_*.sql` into the Supabase SQL Editor. There is no migration runner; committing SQL here does nothing until someone runs it. Backend code assumes RPCs `approve_payment_request()` and `apply_monthly_fee()` exist (billing/approval fall back to guarded direct updates if absent). **Migration 005** (`005_concurrency_hardening.sql`) must be applied for: lock-first billing RPC, amount-before-approve approval RPC, anon EXECUTE revocation, `fee_email_log` reminder dedup table, `students.student_id` UNIQUE.
- Schema: `students`, `fee_receipts`, `fee_billing_ledger`, `student_requests`, `notices`, `batches`, `admins`, `audit_logs`, `fee_email_log` (see `api/_lib/supabase-client.js`).
- **UUID vs text**: `students.id` is UUID; `students.student_id` / `roll_no` are TEXT (6-digit `YYCCSS`). Never build `.eq('id', '<6-digit>')` queries — Postgres throws `22P02`.
- Match students across identifiers (`student_id`, `id`, `rollNo`, mobile) using the frontend's `isStudentRequestMatch` helper — never naive `r.studentId === s.id`.
- Idempotency keys: billing ledger `BILL-${studentId}-${YYYY-MM}` (monthKey computed in **Asia/Kolkata**, see `indiaDateParts()` in `api/cron-monthly-fees.js`) — do not switch to UTC dates.
- Money prefixes are semantic, not cash: receipt numbers starting `REC-BILL-`, `OLD-DUE`, `ADJ-`, `RATE-`, `EDIT-`, `DUE-`, `NTC-`, `DISC-`, `ADDON-` are ledger/adjustment entries and MUST be excluded from collected-revenue totals (see `isRealCollectedPaymentTest` logic in `run_all_tests.js` T12). Only status Paid/completed/verified counts as money in.
- Fee policy: exactly 12 canonical batches (`BAT-12PCM`…`BAT-ENG-15`), 5% discount applies to annual lump-sum only. Default-rate resolution lives in `getStudentDefaultMonthlyFee()` (cron) and `js/fee-calculator.js` — keep them in sync.
- Sole administrator: `chandan` (ADM-01). Audit-log purge and head-admin gates check username/name/`is_head` — do not weaken this.

## Email pipeline (Resend, hard 100/day)
- Quota X = billing-ledger emails sent today + receipts emailed today; `send-email.js` rejects when `X + recipients.length > 100`; `/api/email-quota` exposes the count. Counting windows are IST-aligned (`istDayBoundsIso()` in cron, same logic inline in send-email/email-quota) — keep them that way; UTC-day windows leaked across the 05:30 offset.
- Sender domain whitelist lives in `api/_lib/resend-sender.js` (`VERIFIED_SENDER_DOMAINS`, `noreply@pragyaninstitute.com`); production rejects sandbox `resend.dev`.

## Cron / billing schedule
- `api/cron-monthly-fees.js` `BATCH_SCHEDULE` implements the 10-day staggered plan (days 1–6 billing, 7–10 reminders, 15 follow-up) keyed on IST day-of-month. Triggers: `vercel.json` cron `0 4 1-10,15 * *` and `.github/workflows/monthly-fees.yml` `30 0 1-10 * *` + `30 0 15 * *` — keep all three in sync when editing the schedule.
- Batch-day selection uses precise JS matching (`batchKeyMatches()`), NOT `ilike %N%` — substring filters matched Class 10/11/12 into the Day-5 (`%1%`) run and Special English onto Days 2/4.
- Canonical fee resolver exists in 4 copies (no bundler): `getStudentDefaultMonthlyFee()` (cron), `canonicalMonthlyFee()` (admin-trigger), `resolveMonthlyFee()` (js/portal.js), inline chain (pay.html) — plus GH scripts. **Special English must be tested before raw digit matching**: "Special English: Class 9th to 12th" contains both '9' and '12' → ₹1,000 not ₹1,500; '1' occurs inside 'Class 10th'.
- Reminder emails are deduped via `fee_email_log` claims; billing is idempotent per `(student_id, billing_month)` — safe to retry. Cron endpoints require `Authorization: Bearer <CRON_SECRET>`.
- Payments must NEVER be written to `fee_billing_ledger` — its `UNIQUE(student_id, billing_month)` means one payment row permanently blocks that student's monthly accrual. Payments live in `fee_receipts`.

## Frontend conventions
- Design tokens in `css/variables.css`; vanilla CSS only (no Tailwind/frameworks). Escape any injected HTML with `window.escapeHtml` (defined in `js/config.js`).
- Offline sync engine: `js/supabase-sync.js` (pull mutex/debounce queue, BroadcastChannel cross-tab echo suppression via `_tabId`, `CRITICAL_KEYS` localStorage protection under quota pressure). Don't bypass it with raw `supabase.from()` calls in UI code.
- Client config: `js/config.js` reads `window.__ENV__` then falls back to hardcoded defaults (incl. an inline anon key — public by design, but contradicts `FIX_PROGRESS_LOG.md` which claims it was removed). `.env.local` is NOT injected into the browser; only Vercel functions read `process.env`.
- Service worker skips `/api/*` and `*.supabase.co`; navigations are network-first with offline fallback to cached `index.html`.

## Environment variables (Vercel dashboard / GitHub Secrets)
`PORTAL_SESSION_SECRET` (128+ hex chars), `CRON_SECRET` (64+), `SUPABASE_URL`+`SUPABASE_ANON_KEY` (+`VITE_` prefixed twins for client), `SUPABASE_SERVICE_ROLE_KEY` (server-only — bypasses RLS), `RESEND_API_KEY` (`re_` prefix, validated at startup), `RESEND_FROM_EMAIL`, `GEMINI_API_KEY`. Template: `.env.example`.

## Storage rule
Supabase bucket `pragyan-media` contains ONLY two folders: `profile_pictures/` and `notifications/`. Never add more.

## Known issues / open work (verified in code)
1. Email quota counters count ALL receipts created today (emailed or not) — conservative by design; reminder/admin-trigger sends are not individually logged (only ledger statements and receipts are).
2. Doc drift: `AI_CONTEXT/DEPLOYMENT_AND_SERVICES.md` cites an obsolete cron schedule and `billing@pragyaninstitute.in` sender; README describes only Classes 8–10 (system now has 12 batches); AI_CONTEXT calls IDs `YYCCXX`, current spec/code use `YYCCSS`.
3. `vite.config.js` is dead — Vite is not a dependency and never runs; build is `cache_bust.js`. Don't "fix" builds through it.
4. `package.json` version drives the cache-bust base version (`90.0.x`); bump major.minor deliberately.
5. Client-side accrual engine (`checkAndAccrueMonthlyFees` in js/portal.js, runs on every portal load) still writes `REC-BILL-*` receipts + ledger rows via anon-key REST with last-write-wins PATCHes — it can race the server cron on month rollover. Server RPC wins on idempotency once migration 005 is applied, but the client path remains a lost-update risk (see sync engine notes above).
