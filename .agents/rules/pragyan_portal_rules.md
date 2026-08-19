# Pragyan Institute Portal — Strict Workspace Invariants & Architecture Rules

## 1. Branching, Safety & Release Protocol
- **Production Branch (`main`)**: Connected directly to live production at `pragyaninstitute.com`. NEVER push unverified or experimental code to `main`.
- **Active Development Branch (`v2-development`)**: All Version 2.0 feature development, live lecture engines, and storage integrations MUST be done on `v2-development`.
- **Git Push Policy**: Do NOT push to GitHub automatically after every single local edit. Only commit locally and push when explicitly confirmed by the user.

## 2. Core Technology Stack & Design System
- **Frontend**: Vanilla HTML5, Vanilla JavaScript (ES6 Modules & IIFE architecture in `portal.js`, `app.js`, `chat.js`), and Vanilla CSS tokens in `css/variables.css`, `css/main.css`, `css/portal.css`.
- **Design Tokens**: Emerald (`#064E3B`), Terracotta (`#C2410C`), Sand (`#FAF9F6`), Slate (`#0F172A`).
- **No Heavy Frameworks**: Do NOT introduce TailwindCSS, React, or heavy build runtimes unless explicitly requested.
- **Cache Busting**: Always run `node scripts/cache_bust.js` and `npm test` after modifying frontend files (`index.html`, `pay.html`, `portal.js`, `portal.css`, `chat.js`) to guarantee 0 stale browser cache bugs.

## 3. Database, Cloud Sync & Storage Architecture ($0 Server Cost)
- **Primary Database**: Supabase PostgreSQL with real-time replication (`supabase-js` v2).
- **Sub-50ms Sync**: All data mutations use optimistic client-side updates with instant Supabase delta syncing.
- **100% Free Video Hosting**: YouTube Unlisted / Private Cloud CDN for unlimited 1080p live streams & recorded video library.
- **100% Free PDF Storage**: Cloudflare R2 Object Storage (10 GB free, 10M requests/mo, $0 egress fees) for student notes & test papers.
- **100% Free Transactional Emails**: Resend API (`@pragyaninstitute.com`) for receipts and payment reminders.

## 4. Authentication, Security & Passwords
- **Irreversible Password Hashing**: All student and administrator passwords MUST be hashed with BCrypt (`bcryptjs` with salt rounds = 10, producing `$2a$10$...`). Plain text passwords MUST NEVER be stored, logged, or displayed in the UI.
- **Universal Student Login**: Student login supports dual credentials:
  1. Primary: 8-digit DOB (`YYYY-MM-DD`).
  2. Custom: Student-created 4+ character password (hashed with BCrypt).
- **Admin Password Reset**: Single-click password reset wank-clears the custom hash and falls back to default DOB.
- **Mandatory Admin Authorization**: Sensitive admin profile/credential updates require entering the current password.

## 5. Billing Engine & Financial Rules
- **Monthly Billing Accrual**: 1st of every month (Days 1–4) standard tuition accrual (`₹800` for 8th, `₹1,000` for 9th/10th).
- **Billing Idempotency**: All billing operations MUST verify the `accrued_YYYY-MM` lock to prevent duplicate billing runs.
- **Teacher Collection Breakdown**: Total Collected Revenue MUST 100% equal the exact sum of Chandan Kumar collections + Prof. Ravi Ranjan collections across Cash and UPI.
- **Cascade Deletion Guardrail**: A student record with uncleared dues (`pendingFee > 0`) CANNOT be deleted or purged. Dues must be explicitly settled or waived first.

## 6. Pragyan AI Academic Mentor
- **Engine**: Google Gemini 3.6 Flash / 3.5 Flash via serverless proxy (`/api/gemini-proxy`) with direct client fallback.
- **Strict Format**: Answers MUST be 3 to 4 crisp bullet points with bold emoji headers (`🐾`, `🌱`, `💡`, `🧠`, `📚`).
