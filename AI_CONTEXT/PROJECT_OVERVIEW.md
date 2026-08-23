# 🏛️ Pragyan Institute — Project Overview & Requirements

---

## 1. Executive Summary

Pragyan Institute is a coaching institute located in Lalganj, Vaishali, Bihar, providing specialized coaching in Mathematics and Science for students from Class 6th to 12th, Foundation batches, and Board exam preparation.

The **Pragyan Institute Portal** is a Progressive Web Application (PWA) with zero server-dependent build requirements that serves both **Students/Parents** and **Institute Administrators (Directors & Faculty)**.

---

## 2. User Roles & Capabilities

### 🎓 Student & Parent Portal
- **Authentication**: Zero-friction login with `YYCCSS` Student ID (e.g. `261001`) or registered 10-digit mobile number + Date of Birth / Student PIN.
- **3D VIP Identity Card**: Interactive 3D metallic card with student photo, name, class batch, admission year, QR code, and standard Code-128 logical barcode.
- **Fee Management & Receipts**:
  - Live view of Total Fee, Paid Fee, and Monthly Pending Due.
  - Interactive payment breakdown and downloadable GST-compliant Fee Receipts.
  - Payment proof upload (UPI / Bank Transfer screenshot) with UTR number submission.
- **Profile Detail & Photo Update Requests**:
  - Students can request edits to phone, address, blood group, email, and upload new profile photos.
  - Real-time **Amber Pending Review Banner** with instant photo preview thumbnail and Edit/Cancel controls.
- **Notices & Broadcasts**: Instant access to exam schedules, mock test dates, and holiday circulars with file attachments.
- **Community Chat & AI Assistant**: Integrated bottom-left AI assistant and peer community discussion room.

### 🛡️ Admin Dashboard (Directors & Faculty)
- **Role-Based Login**: Protected authentication using password hashes with verification via `/api/admin-password`.
- **Administrative Requests Center**:
  - **Payment Verification Sub-Tab**: View uploaded payment screenshots, match UTR numbers, select verifying educator, and click "Verify & Approve Payment" to instantly update ledger.
  - **Profile Detail Requests Sub-Tab**: Side-by-side diff of student changes (e.g. `<s>Old Address</s> ➔ New Address`) and photo preview, with 1-click Approval/Decline.
  - **Latest Requests First**: All pending requests automatically sorted to the top (#1 position) in descending chronological order.
- **Student Management Suite**:
  - Register new students with automatic `YYCCSS` ID generation.
  - Live filtering by batch, search by name/roll/phone.
  - CSV bulk student import with automatic carryover balance ledgering.
  - Direct student profile editing, photo upload, fee adjustments, and student deletion.
- **Notice Board Manager**: Publish announcements with target batch filters and media attachments.
- **Batch & Automated Billing Manager**:
  - Monthly fee billing rules per batch (Class 6th–12th).
  - One-click manual billing trigger and automated Vercel Cron billing on scheduled batch days.
- **Audit Logs**: Comprehensive event trail of every administrative action, payment verification, and profile edit.

---

## 3. UI/UX Design System

- **Color Palette**:
  - Primary Emerald: `#059669` / `#10B981` (growth, academics, verified state)
  - Deep Mahogany / Dark Slate: `#1E293B` / `#0F172A` (typography, high contrast)
  - Sand / Pearl Neutral: `#FAF9F6` / `#F1F5F9` (card backgrounds, subtle borders)
  - Warm Amber: `#F59E0B` / `#FEF3C7` (pending review badges, attention banners)
  - Crimson Alert: `#DC2626` / `#FEE2E2` (unpaid dues, decline actions)
- **Visual Features**:
  - 3D CSS perspective card flip for student ID pass.
  - Glassmorphic modal overlays with `calc(100dvh - 2rem)` on-screen keyboard protection.
  - Touch-friendly tap targets (`min-height: 42px`) and zero horizontal viewport overflows on mobile devices.
