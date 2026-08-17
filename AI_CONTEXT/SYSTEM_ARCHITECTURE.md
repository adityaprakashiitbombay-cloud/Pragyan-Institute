# 🏗️ Pragyan Institute — System Architecture & Sync Engine

---

## 1. High-Level Architecture Diagram

```
[ Browser Client / Mobile PWA ]
  │
  ├── Local State & Cache (AppState + localStorage)
  │     ├── BroadcastChannel ('pragyan_sync_bus') [Multi-tab instant sync]
  │     └── Service Worker ('sw.js') [PWA offline shell & cache busting]
  │
  ├── Supabase Direct Sync Engine ('js/supabase-sync.js')
  │     ├── Bidirectional Auto-Sync (init, polling interval, focus triggers)
  │     ├── Type-Safe PostgREST Queries (Zero 22P02 UUID errors)
  │     ├── AbortController Signal Cancellation (Stale fetch termination)
  │     └── Automatic Photo Lifecycle (Upload, CDN delivery, Old photo purge)
  │
  ├── Supabase Cloud Backend (ujcmmcaervgskpkcfekm.supabase.co)
  │     ├── PostgreSQL Database (7 Master Tables + RLS Policies)
  │     ├── Storage Bucket ('pragyan-media' ➔ profile_pictures, notifications)
  │     └── Database Stored Procedures (apply_monthly_fee RPC)
  │
  └── Vercel Serverless Backend (api/)
        ├── /api/cron-monthly-fees.js (Monthly fee batch automation)
        ├── /api/admin-password.js (Secure SHA-256 password hash mutation)
        └── /api/upload-file.js (Service-key fallback storage uploader)
```

---

## 2. Synchronization Lifecycle (`SupabaseSync`)

1. **Initialization (`SupabaseSync.init`)**:
   - Reads active role (`'student'` or `'admin'`) and identity from session/local storage.
   - Executes `pullAll()` with parallel `Promise.allSettled()` across `ALL_TABLES`.
   - Normalizes remote snake_case fields into app camelCase while preserving canonical ID links (`normalizeStudent`, `normalizeRequest`, `normalizeAdmin`).

2. **Student Scoped Syncing**:
   - For logged-in students, queries are filtered by student roll / ID (`student_id.eq.` or `roll_no.eq.`).
   - For `fee_receipts`, queries use `student_id.eq.<db_uuid>` to prevent Postgres UUID cast errors.

3. **Multi-Tab Real-Time Sync**:
   - Utilizes `BroadcastChannel('pragyan_sync_bus')` to notify other open tabs when mutations occur locally, keeping all windows synchronized without full page reloads.

4. **Offline Resilience & Optimistic Updates**:
   - Every mutation updates local `AppState` immediately.
   - If the network is offline, mutations queue and sync automatically upon reconnection (`online` window event listener).

---

## 3. PWA & Service Worker Cache Invalidation

- **Service Worker (`sw.js`)**:
  - Implements `Stale-While-Revalidate` for static assets.
  - Implements `Network-First` for database queries and real-time requests.
- **Automated Cache Busting (`scripts/cache_bust.js`)**:
  - Automatically updates version hashes (`?v=XXXX`) on `index.html` asset tags and `CACHE_NAME` in `sw.js` during `npm run build:hash`.
