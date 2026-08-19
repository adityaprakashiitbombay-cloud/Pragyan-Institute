# 🎓 PRAGYAN INSTITUTE LALGANJ (Vaishali, Bihar)
> **Official Web Application & Digital Portal** — Empowering Future Achievers (Class 8th, 9th & 10th)  
> At Moti Market, Near Jagdamba Sthan, Vaishali Bus Stand Road, Lalganj  
> **Live Website:** [https://pragyaninstitute.com/](https://pragyaninstitute.com/) | **WhatsApp / Phone:** +91 73698 91858

---

## 📖 Complete Documentation & User Manual
For a full, simple, visual step-by-step guide explaining all features for **Admins, Teachers, Students & Parents**, please see:
👉 **[USER_MANUAL.md](USER_MANUAL.md)**

---

## 🌟 Key Application Features

### 🌐 1. Public Portal & Admissions
- **Interactive Hero Carousel**: Highlights real classroom learning, smartboards, and science demonstrations.
- **Batches & Courses**: Class 10th (Board Target 95%+), Class 9th (Foundations), Class 8th (Concepts), Junior Foundation.
- **Transparent Fee Calculator**: Instant transparent monthly fee rates (e.g. ₹1,000/mo).
- **Pragyan AI Smart Assistant**: 24/7 Gemini-powered AI chatbot supporting English & Hinglish queries.
- **1-Click WhatsApp Direct Contact**: Instant admission inquiry routing to Director Chandan Kumar.

### 👨‍🎓 2. Student & Parent Dashboard
- **Clean 6-Digit ID Login**: Standardized `YYCCSS` format (e.g. `261001`) or Mobile Number + Password.
- **3D Metallic Hologram ID Card**: Interactive sheen ID card with scannable barcode and 1-click printable PDF download.
- **Audited Fee Statement**: Real-time balance tracking (Total Billed, Total Paid, Net Due).
- **Online Fee Gateway (`pay.html`)**:
  - **Pay in Full (100%)** vs **Pay in Partial (Custom / 1-Month Fee)**.
  - 1-Tap Auto-UPI Deep Links (PhonePe, Google Pay, Paytm, BHIM) to official payee `chandankr1501998@ybl`.
  - UTR / payment proof verification submission.
- **Official Computerized PDF Receipts**: Instant 1-click download with institute stamp.
- **Academic Progress & Analytics**: Chapter-wise test scores, attendance register, and notice board.

### 👨‍🏫 3. Faculty & Admin Management Suite
- **Secure BCrypt Role-Based Access**: Multi-tier access for Director, Head Teacher, and Faculty.
- **Executive Metrics**: Real-time enrollment count, total fees collected, total pending dues, and pending verification alerts.
- **Student Directory**: Fast live search by name, 6-digit ID, or phone number.
- **3-in-1 Quick Action Modal**:
  - 💳 **Record Payment**: Cash, UPI, Bank Transfer with `[ Full Due ]` and `[ 1-Month Fee ]` quick chips.
  - 🔴 **Add Old Due**: Carry over previous balances.
  - ✏️ **Edit Profile & Photo**: Direct Supabase Cloud Storage sync.
- **Online UPI Payment Approvals**: 1-click verification of student UTR numbers and screenshots.
- **1st-of-Month Automated Billing**: Serverless cron billing with idempotency protection.
- **Notice Broadcaster & Test Results Publisher**: Instant mass communication across all batches.
- **Immutable Audit Trail**: Complete log of every administrative transaction.

---

## 🛠️ Technology Stack
- **Frontend**: HTML5, Modern Vanilla CSS3 Design System, Vanilla JavaScript (ES6+), FontAwesome 6 Pro.
- **Backend / Database**: Supabase PostgreSQL, Row Level Security (RLS), Cloud Storage Buckets.
- **Serverless APIs**: Node.js microservices hosted on Vercel (`/api/student-id`, `/api/admin-trigger-billing`, `/api/admin-password`).
- **Transactional Notifications**: Resend Verified Domain (`noreply@pragyaninstitute.com`).
- **Testing & CI**: Automated CI Suite (14 DEP, 10 NH, 25 Priority Matrix tests) on GitHub Actions.

---
*© 2026 Pragyan Institute Lalganj. All rights reserved.*
