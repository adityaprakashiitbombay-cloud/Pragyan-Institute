# 📋 Previous Failed Sync Audit & Diagnostic Roadmap (13-Aug-2026)

This document contains the complete historical audit and failure report from the previous diagnostic run.

---

## 1. 🔍 Root Causes of Previous Failures

### 1.1 Double Initialization Conflict
* `js/supabase-sync.js` was auto-initializing on `DOMContentLoaded`.
* `js/portal.js` was simultaneously calling `RealtimeEngine.init()` -> `SupabaseSync.init()`, creating duplicate subscriptions and event collisions.

### 1.2 Undefined REST Properties in Save Handlers (DF-1 to DF-8)
* `AppState.saveStudents()`, `saveAdmins()`, `saveNotices()`, `saveBatches()`, and `saveRequests()` in `portal.js` were attempting direct `fetch()` calls to `RealtimeEngine.supabaseUrl` and `RealtimeEngine.anonKey`.
* Both properties were `undefined`, causing all write operations from the browser to silently fail before reaching Supabase.

### 1.3 Missing Internal Methods in Sync Engine
* `SupabaseSync.mutate()` was calling `this.broadcastChange()`, which was never defined in `supabase-sync.js`.

### 1.4 RLS & SQL Policy Chaos
* 4 conflicting migration files existed simultaneously:
  1. `supabase_all_tables_master_schema.sql`
  2. `supabase_security_rls_fix.sql`
  3. `supabase_enable_all_permissions.sql`
  4. `supabase_fixed_schema.sql`
* If a read-only policy (`security_rls_fix.sql`) was applied last, all anonymous client writes were rejected by Supabase with 403 Forbidden.

---

## 2. 📊 Current Remediation Status

| Bug ID | Component | Issue | Remediation Status |
| :--- | :--- | :--- | :---: |
| **DF-1 to DF-6** | `portal.js` | Undefined `supabaseUrl` in save handlers | ✅ Fixed in `supabase-sync.js` v87 |
| **DF-7 & DF-8** | `supabase-sync.js` | Double init race condition | ✅ Unified initialization |
| **RLS-1** | Supabase SQL | Multiple conflicting RLS migrations | ✅ Consolidated into master schema |
| **SEC-1** | `api/auth.js` | Insecure `.includes('admin')` bypass | ✅ Identified in latest audit |
