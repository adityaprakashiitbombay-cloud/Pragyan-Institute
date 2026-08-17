# 🧠 PRAGYAN INSTITUTE — AI MASTER CONTEXT & ARCHITECTURE GUIDE
> **Notice for AI Assistants & LLMs**: This directory is the single source of truth for the Pragyan Institute Web Portal codebase. Read this context before modifying code, schemas, or deployment pipelines.

---

## 📌 1. Project Snapshot

- **Project Name**: Pragyan Institute Portal
- **Organization**: Pragyan Institute of Education
- **Location**: Lalganj, Vaishali, Bihar, India (PIN: 844121)
- **Leadership**:
  - **Prof. Ravi Ranjan** (Director & Mathematics Lead)
  - **Chandan Kumar** (Director & Science Lead)
- **Live Production URL**: [https://adityaprakashiitbombay-cloud.github.io/pragyan-institute-portal/](https://adityaprakashiitbombay-cloud.github.io/pragyan-institute-portal/)
- **GitHub Repository**: `adityaprakashiitbombay-cloud/pragyan-institute-portal` (`main` branch)
- **Database / Backend**: Supabase Cloud PostgreSQL + REST API + Supabase Storage
- **Serverless Automation**: Vercel Serverless Functions (`/api/cron-monthly-fees.js`, `/api/admin-password.js`, `/api/upload-file.js`)

---

## 📂 2. AI Context Documentation Map

| Document | Description |
| :--- | :--- |
| **[PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md)** | Full business requirements, coaching model, student/admin portal capabilities, UI design system. |
| **[DATABASE_AND_DATASETS.md](./DATABASE_AND_DATASETS.md)** | Complete PostgreSQL database schemas, 7 master tables, column types, sizes, relationships, and queries. |
| **[SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md)** | Frontend architecture, bidirectional Supabase syncing engine, PWA Service Worker cache-busting, and offline ledger. |
| **[STORAGE_AND_MEDIA.md](./STORAGE_AND_MEDIA.md)** | Supabase Storage bucket (`pragyan-media`), 2-folder structure, CDN delivery, and automatic photo lifecycle cleanup. |
| **[STUDENT_ID_AND_NUMBERING.md](./STUDENT_ID_AND_NUMBERING.md)** | Canonical `YYCCXX` format, Code-128 logical barcodes, and multi-identifier student matching logic. |
| **[DEPLOYMENT_AND_SERVICES.md](./DEPLOYMENT_AND_SERVICES.md)** | All live websites, API endpoints, environment variables, GitHub automation scripts, and deployment steps. |

---

## ⚡ 3. Critical Rules for Any AI Modifying This Project

1. **Do NOT Break the Standardized Student ID (`YYCCXX`)**:
   - Every student primary key is strictly 6 digits: `YY` (2-digit Year e.g. `26`), `CC` (2-digit Class code e.g. `10`), `XX` (2-digit Serial e.g. `01`).
   - Example: Class 10th student #1 in 2026 = `261001`.

2. **Respect Storage 2-Folder Constraint**:
   - Supabase Storage bucket `pragyan-media` must contain **ONLY 2 folders**:
     - 📁 `profile_pictures/`
     - 📁 `notifications/`
   - Never scaffold additional folders.

3. **Multi-Identifier Matching (`isStudentRequestMatch`)**:
   - When matching student requests, fee receipts, or session records, NEVER use naive `r.studentId === s.id`.
   - Always use `isStudentRequestMatch(req, student)` to match across `student_id`, `id`, `rollNo`, and 10-digit `mobile`.

4. **UUID vs Text Safety**:
   - `students.id` is `UUID`, while `students.student_id` and `students.roll_no` are `TEXT`.
   - Never send `id.eq.<TEXT_STRING>` in PostgREST queries (it throws Postgres `22P02: invalid input syntax for type uuid`).

5. **Maintain Master Test Suite (122 Audits)**:
   - Before deploying any changes, always run:
     ```bash
     npm run build:hash
     npm test
     ```
   - All 122 automated test suite audits across P0 to P5, NH1-NH10, F1-F25, and DEP1-DEP6 must pass with 0 failures.
