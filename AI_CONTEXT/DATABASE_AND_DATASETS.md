# 🗄️ Pragyan Institute — Database & Datasets Reference

---

## 1. Supabase PostgreSQL Schema Overview

The database is hosted on **Supabase** (`https://ujcmmcaervgskpkcfekm.supabase.co`).
All tables have Row Level Security (RLS) configured and are queried directly via the PostgREST API using the Supabase Anonymous key for client reads/mutations and Service Key for admin endpoints.

---

## 2. Master Tables & Column Definitions

### 1. `students` Table
Stores student enrollment records, contact information, class batches, and real-time fee balances.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | Primary Key, `default gen_random_uuid()` | Internal PostgreSQL row UUID |
| `student_id` | `text` | Unique, Not Null | Canonical 6-digit `YYCCXX` ID (e.g. `'261001'`) |
| `roll_no` | `text` | Not Null | Student Roll Number (matches `student_id`) |
| `name` | `text` | Not Null | Student full name (e.g. `'Virat Kohli'`) |
| `mobile` | `text` | Not Null | Student / Primary contact number (10 digits) |
| `email` | `text` | | Student email address |
| `dob` | `text` | | Date of Birth (`YYYY-MM-DD`) |
| `class_name` | `text` | Not Null | Batch / Class name (e.g. `'Class 10th (ACHIEVER)'`) |
| `batch_name` | `text` | | Normalized batch name |
| `guardian_name` | `text` | | Parent / Guardian full name |
| `guardian_mobile` | `text` | | Parent contact phone number |
| `address` | `text` | | Residential address |
| `gender` | `text` | | Gender (`'Male'`, `'Female'`, etc.) |
| `blood_group` | `text` | | Blood group (`'O+'`, `'B+'`, etc.) |
| `total_fee` | `numeric` | Default `0` | Cumulative total fee billed |
| `paid_fee` | `numeric` | Default `0` | Cumulative total fee paid |
| `pending_fee` | `numeric` | Default `0` | Outstanding pending fee |
| `monthly_fee` | `numeric` | Default `0` | Monthly tuition rate for this student |
| `photo_url` | `text` | | Public CDN URL from `pragyan-media/profile_pictures/` |
| `status` | `text` | Default `'Active'` | Status (`'Active'`, `'Inactive'`) |
| `created_at` | `timestamptz` | Default `now()` | Registration timestamp |

---

### 2. `student_requests` Table
Stores administrative requests initiated by students (Profile detail updates & Payment proof verifications).

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `request_id` | `text` | Primary Key | Unique Request ID (e.g. `'REQ-mstbtz5r-ana'`) |
| `student_id` | `text` | Not Null | Associated `YYCCXX` Student ID or Table UUID |
| `student_name` | `text` | Not Null | Student Name |
| `roll_no` | `text` | | Student Roll Number |
| `class_name` | `text` | | Student Class Batch |
| `req_type` | `text` | Not Null | `'PROFILE_UPDATE'` or `'PAYMENT_VERIFICATION'` |
| `status` | `text` | Default `'Pending'` | `'Pending'`, `'Approved'`, `'Rejected'` |
| `request_date` | `text` | | Submission date (`YYYY-MM-DD`) |
| `old_data` | `jsonb` | | Snapshot of student data prior to request |
| `new_data` | `jsonb` | | Requested changes or `{ paymentDetails: { amount, utr, proofUrl } }` |
| `created_at` | `timestamptz` | Default `now()` | Submission timestamp (used for descending sort) |

---

### 3. `fee_receipts` Table
Official ledger of fee payments, carryover balances, and automated monthly invoices.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `receipt_no` | `text` | Primary Key | Unique Receipt # (e.g. `'REC-202608-001'`) |
| `student_id` | `uuid` | Foreign Key `students(id)` | Linked student database UUID |
| `date` | `text` | Not Null | Transaction date (`YYYY-MM-DD`) |
| `amount` | `numeric` | Not Null | Transaction amount in INR (₹) |
| `mode` | `text` | Not Null | Payment Mode (`'UPI'`, `'Cash'`, `'Bank Transfer'`, etc.) |
| `status` | `text` | Default `'Paid'` | Status (`'Paid'`, `'Pending Due'`, `'Partial'`) |
| `by` | `text` | | Verifying Educator / Officer |
| `note` | `text` | | Remarks / Transaction ID / UTR |
| `created_at` | `timestamptz` | Default `now()` | Record creation timestamp |

---

### 4. `fee_billing_ledger` Table
Idempotency table that ensures automated cron billing never charges a student twice in the same billing month.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `idempotency_key` | `text` | Primary Key | Format: `FEE-{student_id}-{billing_month}` |
| `student_id` | `text` | Not Null | Student `YYCCXX` ID |
| `billing_month` | `text` | Not Null | Month identifier (e.g. `'2026-08'`) |
| `amount` | `numeric` | Not Null | Billed fee amount |
| `status` | `text` | Default `'billed'` | Status |
| `created_at` | `timestamptz` | Default `now()` | Billing timestamp |

---

### 5. `notices` Table
Circulars and broadcasts sent to all students or specific batches.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | Primary Key, `default gen_random_uuid()` | Notice UUID |
| `title` | `text` | Not Null | Announcement Headline |
| `category` | `text` | Default `'general'` | `'exam'`, `'fees'`, `'holiday'`, `'general'` |
| `message` | `text` | Not Null | Body content |
| `target_batch` | `text` | Default `'All Batches'` | Target audience filter |
| `attachment_url` | `text` | | Public URL in `pragyan-media/notifications/` |
| `created_at` | `timestamptz` | Default `now()` | Published timestamp |

---

### 6. `batches` Table
Master registry of institute academic batches and their billing schedules.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `batch_id` | `text` | Primary Key | e.g. `'BATCH-10'` |
| `name` | `text` | Not Null | e.g. `'Class 10th (ACHIEVER)'` |
| `schedule` | `text` | | Class timing |
| `monthly_fee` | `numeric` | Default `0` | Standard monthly tuition fee |
| `billing_day` | `integer` | | Day of month billing triggers (e.g. `10`) |
| `billing_active`| `boolean` | Default `true` | Automated billing toggle |

---

### 7. `admins` Table
Institute administrator credentials and profile metadata.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `admin_id` | `text` | Primary Key | e.g. `'ADM-001'` |
| `username` | `text` | Unique, Not Null | Login username |
| `name` | `text` | Not Null | Administrator name |
| `role` | `text` | Default `'Admin'` | Role (`'Director'`, `'Teacher'`, `'Admin'`) |
| `password_hash`| `text` | Not Null | SHA-256 password hash |
| `photo_url` | `text` | | Avatar image URL |

---

### 8. `audit_logs` Table
Immutable log of system modifications and administrative actions.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `log_id` | `text` | Primary Key | e.g. `'LOG-1786735209238'` |
| `action` | `text` | Not Null | Action type (`'STUDENT_REGISTER'`, `'PAYMENT_VERIFY'`, etc.) |
| `performed_by` | `text` | Not Null | Admin user or Student ID |
| `details` | `text` | | Action description and affected entity |
| `created_at` | `timestamptz` | Default `now()` | Event timestamp |

---

## 3. Dataset Sizing & Traffic Expectations

- **Active Students**: Typically 50 to 500 active enrollments.
- **Monthly Receipts**: ~100 to 1,000 transactions per month.
- **Storage Footprint**: Light (<50 MB total for compressed JPEG avatars and PDF notice circulars).
- **Latency Target**: Edge REST responses <80ms; Storage CDN cache hits <20ms.
