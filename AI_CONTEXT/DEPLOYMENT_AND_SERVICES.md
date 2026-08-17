# 🚀 Pragyan Institute — Deployment, Services & Endpoints

---

## 1. Live Websites & Environments

| Service | Environment | URL |
| :--- | :--- | :--- |
| **Frontend Web Portal** | Production (GitHub Pages) | [https://adityaprakashiitbombay-cloud.github.io/pragyan-institute-portal/](https://adityaprakashiitbombay-cloud.github.io/pragyan-institute-portal/) |
| **Database & Auth** | Supabase Project | `https://ujcmmcaervgskpkcfekm.supabase.co` |
| **Storage CDN** | Supabase Storage CDN | `https://ujcmmcaervgskpkcfekm.supabase.co/storage/v1/object/public/pragyan-media/` |
| **GitHub Repository** | Source Control (`main`) | `https://github.com/adityaprakashiitbombay-cloud/pragyan-institute-portal` |

---

## 2. API Endpoints & Serverless Functions

### 1. Monthly Fee Cron Billing
- **Path**: `GET /api/cron-monthly-fees`
- **Schedule**: `0 0 1,10,15,20,25 * *` (Runs on scheduled batch billing dates)
- **Headers**: `Authorization: Bearer <CRON_SECRET>`
- **Functionality**: Idempotent batch billing that charges active students according to batch rates and records entries in `fee_billing_ledger`.

### 2. Secure Admin Password Change
- **Path**: `POST /api/admin-password`
- **Payload**: `{ "adminId": "ADM-001", "oldPassword": "...", "newPassword": "..." }`
- **Functionality**: Validates current password SHA-256 hash before updating PostgreSQL credentials.

### 3. File Upload Proxy
- **Path**: `POST /api/upload-file`
- **Functionality**: Service-key fallback uploader for administrative file operations.

---

## 3. Environment Variables (Redacted for Security)

```ini
# Supabase Configuration
SUPABASE_URL=https://ujcmmcaervgskpkcfekm.supabase.co
SUPABASE_ANON_KEY=<SUPABASE_ANON_JWT_TOKEN>
SUPABASE_SERVICE_ROLE_KEY=<SUPABASE_SERVICE_ROLE_SECRET>

# Automation & Email
CRON_SECRET=<SECURE_CRON_SECRET>
RESEND_API_KEY=<RESEND_API_KEY>
RESEND_FROM_EMAIL=billing@pragyaninstitute.in
```

---

## 4. Standard Build, Test & Deployment Workflow

Whenever you make code updates to the portal, execute the following three steps:

```bash
# 1. Build cache-busted asset hashes & verify all 122 tests pass
npm run build:hash
npm test

# 2. Push updated files to GitHub main branch
node scratch/push_vXX.js

# 3. Verify live production deployment
node scratch/test_live_portal_e2e.js
```
