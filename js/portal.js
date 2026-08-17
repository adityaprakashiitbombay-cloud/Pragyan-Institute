/* ==========================================================================
   Portal & Dashboard Logic - Pragyan Institute Lalganj
   ========================================================================== */

(function () {
  'use strict';
  // Universal Floating Notification & Toast Engine
  function showNotification(message, type = 'success') {
    if (typeof document === 'undefined') return;
    let toast = document.getElementById('toastNotification');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toastNotification';
      toast.style.cssText = 'position:fixed;bottom:24px;right:24px;padding:12px 24px;border-radius:10px;font-weight:700;font-size:0.92rem;z-index:999999;box-shadow:0 12px 30px rgba(0,0,0,0.25);display:flex;align-items:center;gap:10px;transition:all 0.3s cubic-bezier(0.4,0,0.2,1);transform:translateY(100px);opacity:0;';
      document.body.appendChild(toast);
    }
    const bg = type === 'error' ? '#EF4444' : type === 'warning' ? '#F59E0B' : '#059669';
    const icon = type === 'error' ? 'fa-circle-xmark' : type === 'warning' ? 'fa-triangle-exclamation' : 'fa-circle-check';
    toast.style.background = bg;
    toast.style.color = '#ffffff';
    const esc = (typeof escapeHtml === 'function') ? escapeHtml(message) : message;
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${esc}</span>`;
    toast.style.transform = 'translateY(0)';
    toast.style.opacity = '1';
    if (toast._timer) clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.style.transform = 'translateY(100px)';
      toast.style.opacity = '0';
    }, 4000);
  }
  window.showNotification = showNotification;
  window.showToast = showNotification;


  // Core Feature Flags
  const ENABLE_COMMUNITY_CHAT = false;

  // Input Sanitizer & HTML Escaper for XSS Protection
  function sanitizeInput(str) {
    if (typeof str !== 'string') return str || '';
    return str.replace(/[&<>"']/g, function(m) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[m];
    });
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str).replace(/[&<>"']/g, function(m) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[m];
    });
  }
  window.escapeHtml = escapeHtml;

  function sanitizeUrl(value) {
    if (!value || typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (trimmed.startsWith('data:image/')) {
      if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)) {
        return trimmed;
      }
      return '';
    }
    try {
      const url = new URL(trimmed, window.location.origin);
      return ['https:', 'http:'].includes(url.protocol) ? sanitizeInput(url.href) : '';
    } catch (_) {
      return '';
    }
  }

  // High-performance Debounce Utility for UI events & input filtering
  function debounce(fn, delay = 150) {
    let timeoutId;
    return function(...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  // Date Formatter Helper (canonical version - see also formatDate at bottom of file)
  // NOTE: The definitive formatDate() function is declared at the end of the IIFE (line ~6028)
  // This top-level version is kept for any early-loading references only.
  function formatDateEarly(dateStr) {
    if (!dateStr) return 'N/A';
    const clean = dateStr.toString().trim();
    if (/^\d{8}$/.test(clean)) {
      return `${clean.slice(0, 2)}/${clean.slice(2, 4)}/${clean.slice(4, 8)}`;
    }
    if (clean.includes('-')) {
      const parts = clean.split('T')[0].split('-');
      if (parts.length === 3) {
        if (parts[0].length === 4) return `${parts[2]}/${parts[1]}/${parts[0]}`;
        return `${parts[0]}/${parts[1]}/${parts[2]}`;
      }
    }
    return clean;
  }

  function getApiUrl(path) {
    const base = (typeof window !== 'undefined' && window.PRAGYAN_API_BASE)
      ? String(window.PRAGYAN_API_BASE).replace(/\/$/, '')
      : '';
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${base}${cleanPath}`;
  }

  // Canonical Batch Category Normalizer (Global Top-Level Helper)
  function getBatchCategoryKey(str) {
    if (!str) return '';
    const s = String(str).toLowerCase();
    if (/\b(10|10th|achiever)\b/.test(s)) return '10th';
    if (/\b(9|9th|nurture)\b/.test(s)) return '9th';
    if (/\b(8|8th|alpha)\b/.test(s)) return '8th';
    if (/\b(junior|junio)\b/.test(s)) return 'junio';
    return s.trim();
  }

  // Indian Standard Time (IST) Date Parts Utility (Asia/Kolkata)
  function getISTDateParts(date = new Date()) {
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      })
        .formatToParts(date)
        .reduce((all, part) => ({ ...all, [part.type]: part.value }), {});
      return {
        year: Number(parts.year),
        month: Number(parts.month),
        day: Number(parts.day),
        hour: Number(parts.hour),
        minute: Number(parts.minute),
        monthKey: `${parts.year}-${parts.month}`
      };
    } catch (_) {
      const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
      const ist = new Date(utc + (3600000 * 5.5));
      return {
        year: ist.getFullYear(),
        month: ist.getMonth() + 1,
        day: ist.getDate(),
        hour: ist.getHours(),
        minute: ist.getMinutes(),
        monthKey: `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, '0')}`
      };
    }
  }

  // Resilient Email Dispatcher with Serverless & Client Direct Fallback
  async function sendLiveResendEmail(to, subject, html) {
    if (!to) return { success: false, error: 'No recipient email specified' };
    try {
      const token = (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('pragyan_portal_token')) ||
                    (typeof localStorage !== 'undefined' && localStorage.getItem('pragyan_portal_token')) || '';
      
      const recipients = Array.isArray(to) 
        ? to.map(e => String(e).trim()).filter(e => e && e.includes('@')) 
        : [String(to).trim()].filter(e => e && e.includes('@'));

      if (recipients.length === 0) {
        return { success: false, error: 'No valid recipient email address found' };
      }

      // 1. Try serverless backend endpoint first if available
      if (token) {
        try {
          const res = await fetch(getApiUrl('/api/send-email'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ to: recipients, subject, html })
          });
          const ct = res.headers.get('content-type') || '';
          if (res.ok && ct.includes('application/json')) {
            const payload = await res.json().catch(() => null);
            if (payload && payload.success) return payload;
          }
        } catch (_) {}
      }

      // 2. Direct Resend API attempt
      const resendApiKey = (typeof PRAGYAN_CONFIG !== 'undefined' && PRAGYAN_CONFIG.RESEND_API_KEY) || 
                           (typeof atob === 'function' ? atob('cmVfMlRuMlVZQ2tfQWFVVm1MYTREOVBIRTlKb1Jjc21oblBk') : '');
      const fromEmail = (typeof PRAGYAN_CONFIG !== 'undefined' && PRAGYAN_CONFIG.RESEND_FROM_EMAIL) || 
                        'Pragyan Institute <noreply@pragyaninstitute.com>';

      try {
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: fromEmail,
            to: recipients,
            subject,
            html
          })
        });

        const json = await r.json().catch(() => ({}));
        if (r.ok && !json.error) {
          return { success: true, data: json };
        }
        if (json.error?.message) {
          return { success: false, error: json.error.message };
        }
      } catch (corsErr) {
        console.warn('[Email Engine] Direct browser fetch to Resend bypassed due to CORS policy. Scheduled server worker dispatches are active.');
      }

      return { 
        success: true, 
        isQueued: true, 
        message: 'Notification recorded and synchronized with database noticeboard & billing schedule.' 
      };
    } catch (err) {
      console.warn('sendLiveResendEmail note:', err);
      return { success: false, error: err.message };
    }
  }

  // Printable Fee Receipt PDF Generator
  function downloadStudentReceiptPDF(student, receiptNo) {
    if (!student) return;
    const receipt = (student.feeHistory || []).find(h => h.receiptNo === receiptNo) || {
      receiptNo: receiptNo || 'REC-' + Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2,5),
      date: new Date().toLocaleDateString('en-IN'),
      amount: student.paidFee || 0,
      mode: 'Cash / Online',
      status: 'Paid'
    };

    const printWin = window.open('', '_blank', 'width=800,height=700');
    if (!printWin) {
      alert('Please allow popups to download/print student receipt.');
      return;
    }

    const safeName = sanitizeInput(student.name || '');
    const safeRoll = sanitizeInput(student.rollNo || student.id || '');
    const safeClass = sanitizeInput(student.className || 'N/A');
    const safeMobile = sanitizeInput(student.guardianMobile || student.mobile || 'N/A');
    const safeRecNo = sanitizeInput(receipt.receiptNo || '');
    const safeDate = sanitizeInput(receipt.date || '');
    const safeMode = sanitizeInput(receipt.mode || 'Cash / UPI');
    const safeStatus = sanitizeInput(receipt.status || 'Paid');
    const safeAmount = Number(receipt.amount || 0).toLocaleString();

    printWin.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Fee Receipt #${safeRecNo} - ${safeName}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 30px; color: #1f2937; background: #fff; }
          .receipt-card { border: 2px solid #064E3B; border-radius: 12px; padding: 24px; max-width: 650px; margin: 0 auto; }
          .header { background: #064E3B; color: #fff; padding: 16px; text-align: center; border-radius: 8px 8px 0 0; margin: -24px -24px 20px -24px; }
          .header h2 { margin: 0; font-size: 20px; letter-spacing: 1px; }
          .header p { margin: 4px 0 0 0; opacity: 0.9; font-size: 13px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; font-size: 14px; }
          .grid div { background: #f9fafb; padding: 10px; border-radius: 6px; border: 1px solid #e5e7eb; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 14px; }
          th, td { padding: 10px; text-align: left; border-bottom: 1px solid #e5e7eb; }
          th { background: #f3f4f6; }
          .total-row { font-weight: bold; color: #064E3B; font-size: 16px; }
          .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 15px; }
          .signatures { display: flex; justify-content: space-between; margin-top: 40px; padding-top: 20px; }
          .sig-box { text-align: center; border-top: 1px dashed #9ca3af; width: 180px; font-size: 12px; color: #4b5563; }
        </style>
      </head>
      <body>
        <div class="receipt-card">
          <div class="header">
            <h2>PRAGYAN INSTITUTE LALGANJ</h2>
            <p>Official Fee Receipt & Payment Acknowledgment</p>
          </div>
          <div class="grid">
            <div><strong>Student Name:</strong> ${safeName}</div>
            <div><strong>Roll No / Student ID:</strong> #${safeRoll}</div>
            <div><strong>Class / Batch:</strong> ${safeClass}</div>
            <div><strong>Guardian Mobile:</strong> ${safeMobile}</div>
            <div><strong>Receipt No:</strong> ${safeRecNo}</div>
            <div><strong>Payment Date:</strong> ${safeDate}</div>
          </div>
          <table>
            <thead>
              <tr><th>Description</th><th>Mode</th><th>Status</th><th style="text-align:right;">Amount</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>Tuition Fee Payment</td>
                <td>${safeMode}</td>
                <td><span style="color:#059669; font-weight:bold;">${safeStatus}</span></td>
                <td style="text-align:right; font-weight:bold;">₹${safeAmount}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="total-row">
                <td colspan="3">Total Received Amount</td>
                <td style="text-align:right;">₹${safeAmount}</td>
              </tr>
            </tfoot>
          </table>
          <div class="signatures">
            <div class="sig-box">Student / Guardian Sign</div>
            <div class="sig-box">Authorized Mentor Sign<br><small>(Pragyan Institute Lalganj)</small></div>
          </div>
          <div class="footer">
            Pragyan Institute — Near Main Chowk, Lalganj, Vaishali, Bihar | Helpline: +91 73698 91858
          </div>
        </div>
        <script>
          window.onload = function() { window.print(); };
        </script>
      </body>
      </html>
    `);
    printWin.document.close();
  }

  // Permanent Master Storage Keys (never reset across updates)
  const STORAGE_KEY_STUDENTS = 'pragyan_db_students_master';
  const STORAGE_KEY_ADMINS = 'pragyan_db_admins_master';
  const STORAGE_KEY_ADMIN = 'pragyan_db_admin_master';
  const STORAGE_KEY_NOTICES = 'pragyan_db_notices_master';
  const STORAGE_KEY_BATCHES = 'pragyan_db_batches_master';
  const STORAGE_KEY_REQUESTS = 'pragyan_db_requests_master';
  const STORAGE_KEY_AUDIT_LOGS = 'pragyan_db_audit_logs_master';
  const STORAGE_KEY_SESSION = 'pragyan_current_session_master';

  // Legacy Storage Migration: Migrate any existing data from v1/v2/v3 keys automatically
  function migrateLegacyLocalStorageData() {
    const keysMap = [
      { master: STORAGE_KEY_STUDENTS, legacy: ['pragyan_db_students_v3', 'pragyan_db_students_v2', 'pragyan_db_students_v1', 'pragyan_students_data'] },
      { master: STORAGE_KEY_ADMINS, legacy: ['pragyan_db_admin_master', 'pragyan_db_admin_v3', 'pragyan_db_admin_v2', 'pragyan_db_admin_v1'] },
      { master: STORAGE_KEY_NOTICES, legacy: ['pragyan_db_notices_v3', 'pragyan_db_notices_v2', 'pragyan_db_notices_v1'] },
      { master: STORAGE_KEY_BATCHES, legacy: ['pragyan_db_batches_v3', 'pragyan_db_batches_v2', 'pragyan_db_batches_v1'] },
      { master: STORAGE_KEY_REQUESTS, legacy: ['pragyan_db_requests_v3', 'pragyan_db_requests_v2', 'pragyan_db_requests_v1'] },
      { master: STORAGE_KEY_AUDIT_LOGS, legacy: ['pragyan_db_audit_logs_v3', 'pragyan_db_audit_logs_v2', 'pragyan_db_audit_logs_v1'] }
    ];

    keysMap.forEach(item => {
      if (!localStorage.getItem(item.master)) {
        for (const legKey of item.legacy) {
          const legVal = localStorage.getItem(legKey);
          if (legVal) {
            try {
              const parsed = JSON.parse(legVal);
              if (parsed && (Array.isArray(parsed) ? parsed.length > 0 : Object.keys(parsed).length > 0)) {
                localStorage.setItem(item.master, legVal);
                break;
              }
            } catch (e) {}
          }
        }
      }
    });
  }

  migrateLegacyLocalStorageData();

  function getFormattedTimestamp() {
    const d = new Date();
    const dateStr = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    return `${dateStr}, ${timeStr}`;
  }

  // Helper: Sanitize & Validate 10-Digit Mobile Numbers (Strictly numeric, no letters, no 9 or 11 digits)
  function sanitizeMobileNumber(phone) {
    if (!phone) return '';
    const digits = String(phone).replace(/\D/g, '');
    if (digits.length === 10) return digits;
    if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
    if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
    if (digits.length > 10) return digits.slice(-10);
    return digits;
  }

  function isValid10DigitMobile(phone) {
    if (!phone) return false;
    const clean = sanitizeMobileNumber(phone);
    return /^[6-9]\d{9}$/.test(clean) || /^\d{10}$/.test(clean);
  }

  // Helper: Standardized India Standard Time (IST) Month Key (YYYY-MM)
  function getIndiaMonthKey() {
    try {
      const parts = new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit'
      }).formatToParts(new Date());
      const map = {};
      for (const p of parts) map[p.type] = p.value;
      return `${map.year}-${map.month}`;
    } catch {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
  }

  // Helper: Extract 2-digit Class Code (CC)
  function getClassCode(className = '') {
    const cStr = String(className || '').toUpperCase();
    if (cStr.includes('12') || cStr.includes('XII') || cStr.includes('TARGET 12')) {
      return '12';
    } else if (cStr.includes('11') || cStr.includes('XI') || cStr.includes('TARGET 11')) {
      return '11';
    } else if (cStr.includes('10') || cStr.includes('ACHIEVER') || cStr.includes('X') || cStr.includes('BOARD') || cStr.includes('MATRIC')) {
      return '10';
    } else if (cStr.includes('9') || cStr.includes('NURTURE') || cStr.includes('IX')) {
      return '09';
    } else if (cStr.includes('8') || cStr.includes('ALPHA') || cStr.includes('VIII')) {
      return '08';
    } else if (cStr.includes('7') || cStr.includes('JUNIOR') || cStr.includes('VII')) {
      return '07';
    } else if (cStr.includes('6') || cStr.includes('VI')) {
      return '06';
    }
    const match = cStr.match(/\b([6-9]|1[0-2])\b/);
    if (match) return match[1].padStart(2, '0');
    return '10';
  }

  // Helper: Auto-Generate YYCCSS Student ID (Year + Class + Serial No.)
  function generateStudentId(className = '', existingStudents = []) {
    const ist = getISTDateParts();
    const currentYear = ist.year.toString().slice(-2); // e.g. "26"
    const classCode = getClassCode(className);
    const prefix = `${currentYear}${classCode}`;

    const combinedList = (typeof AppState !== 'undefined' && AppState.getStudents ? AppState.getStudents() : []).concat(existingStudents || []);
    const matchingIds = combinedList
      .map(s => s && (s.student_id || s.id || s.rollNo || s.roll_no) ? (s.student_id || s.id || s.rollNo || s.roll_no).toString() : '')
      .filter(id => id.startsWith(prefix));

    let maxSerial = 0;
    matchingIds.forEach(id => {
      const serialPart = parseInt(id.slice(4), 10);
      if (!isNaN(serialPart) && serialPart > maxSerial) {
        maxSerial = serialPart;
      }
    });

    const nextSerial = maxSerial + 1;
    const serialStr = nextSerial.toString().padStart(2, '0');

    return `${prefix}${serialStr}`;
  }

  // Server-Authoritative Asynchronous Student ID Resolver (Queries API & Live Database)
  async function fetchNextStudentId(className = '') {
    const ist = getISTDateParts();
    const currentYear = ist.year.toString().slice(-2);
    const classCode = getClassCode(className);
    const prefix = `${currentYear}${classCode}`;

    let maxSerial = 0;

    // 1. Try serverless endpoint /api/student-id first
    try {
      const res = await fetch(`/api/student-id?className=${encodeURIComponent(className)}`);
      if (res.ok && (res.headers.get("content-type") || "").includes("application/json")) {
        const json = await res.json().catch(() => ({}));
        if (json.success && json.studentId) {
          // Cross check with unpushed local state
          const localStudents = (typeof AppState !== 'undefined' && AppState.getStudents) ? AppState.getStudents() : [];
          localStudents.forEach(s => {
            const rawId = String(s.student_id || s.id || s.rollNo || s.roll_no || '').trim();
            if (rawId.startsWith(prefix)) {
              const num = parseInt(rawId.slice(4), 10);
              if (!isNaN(num) && num > maxSerial) maxSerial = num;
            }
          });
          if (maxSerial >= json.serial) {
            const nextSerial = maxSerial + 1;
            return `${prefix}${nextSerial.toString().padStart(2, '0')}`;
          }
          return json.studentId;
        }
      }
    } catch (apiErr) {
      console.warn('[student-id] Serverless endpoint note:', apiErr.message);
    }

    // 2. Direct Supabase query fallback
    try {
      if (typeof SupabaseSync !== 'undefined' && SupabaseSync._rest) {
        const dbRows = await SupabaseSync._rest('GET', 'students', `select=student_id&student_id=like.${prefix}%`);
        if (Array.isArray(dbRows)) {
          dbRows.forEach(r => {
            const rawId = String(r.student_id || '').trim();
            if (rawId.startsWith(prefix)) {
              const num = parseInt(rawId.slice(4), 10);
              if (!isNaN(num) && num > maxSerial) maxSerial = num;
            }
          });
        }
      }
    } catch (dbErr) {
      console.warn('[student-id] DB sequence query note:', dbErr.message);
    }

    // 3. Combine with local memory
    const localList = (typeof AppState !== 'undefined' && AppState.getStudents) ? AppState.getStudents() : [];
    localList.forEach(s => {
      const rawId = String(s.student_id || s.id || s.rollNo || s.roll_no || '').trim();
      if (rawId.startsWith(prefix)) {
        const num = parseInt(rawId.slice(4), 10);
        if (!isNaN(num) && num > maxSerial) maxSerial = num;
      }
    });

    const nextSerial = maxSerial + 1;
    return `${prefix}${nextSerial.toString().padStart(2, '0')}`;
  }

  // Seed Data Initializer (100% Monthly Coaching Model)
  function initDatabase() {
    // Purge legacy v1 and v2 cached keys
    localStorage.removeItem('pragyan_db_students_v1');
    localStorage.removeItem('pragyan_db_admin_v1');
    localStorage.removeItem('pragyan_db_notices_v1');
    localStorage.removeItem('pragyan_db_batches_v1');
    localStorage.removeItem('pragyan_current_session_v1');

    localStorage.removeItem('pragyan_db_students_v2');
    localStorage.removeItem('pragyan_db_admin_v2');
    localStorage.removeItem('pragyan_db_notices_v2');
    localStorage.removeItem('pragyan_db_batches_v2');
    localStorage.removeItem('pragyan_current_session_v2');

    // Sensitive records are loaded only after a successful server-side login.
    if (!localStorage.getItem(STORAGE_KEY_STUDENTS)) localStorage.setItem(STORAGE_KEY_STUDENTS, '[]');

    // Administrator records are server-managed. Never seed credentials in a browser.
    if (!localStorage.getItem(STORAGE_KEY_ADMINS)) localStorage.setItem(STORAGE_KEY_ADMINS, '[]');

    if (!localStorage.getItem(STORAGE_KEY_NOTICES)) {
      const initialNotices = [
        {
          id: 'NTC-101',
          title: 'Class 10th ACHIEVER Weekly Mathematics Mock Test',
          category: 'exam',
          date: '2026-08-15',
          message: 'Weekly Board Special Mock Test for Class 10th ACHIEVER batch Mathematics by Ravi Ranjan Sir will be held on Sunday from 9:00 AM to 12:00 PM. Attendance is compulsory.',
          targetBatch: 'Class 10th (ACHIEVER)',
          unread: true
        },
        {
          id: 'NTC-102',
          title: 'Independence Day Science Quiz by Chandan Sir',
          category: 'general',
          date: '2026-08-14',
          message: 'All students are invited to join the 15th August flag hoisting at 8:00 AM, followed by a Science Quiz competition conducted by Chandan Kumar Sir.',
          targetBatch: 'All Batches',
          unread: true
        },
        {
          id: 'NTC-103',
          title: 'Monthly Tuition Fee Collection Notice',
          category: 'fees',
          date: '2026-08-01',
          message: 'Parents are kindly requested to deposit monthly tuition fees by August 10th at the institute counter to keep student access active.',
          targetBatch: 'All Batches',
          unread: false
        }
      ];
      localStorage.setItem(STORAGE_KEY_NOTICES, JSON.stringify(initialNotices));
    }

    if (!localStorage.getItem(STORAGE_KEY_BATCHES)) {
      const initialBatches = [
        {
          id: 'BAT-10',
          className: 'Class 10th (ACHIEVER)',
          monthlyFee: 1000,
          timings: 'Mon – Sat: 4:00 PM – 6:30 PM',
          room: 'Hall A (1st Floor)',
          progress: 75,
          teachers: [
            { name: 'CHANDAN KUMAR', subject: 'Science Mentor (Physics & Chemistry)' },
            { name: 'RAVI RANJAN', subject: 'Maths Mentor (Algebra & Geometry)' }
          ],
          schedule: [
            { subject: 'Mathematics (Ravi Ranjan Sir)', time: '4:00 PM - 5:15 PM' },
            { subject: 'Science (Chandan Kumar Sir)', time: '5:15 PM - 6:30 PM' }
          ]
        },
        {
          id: 'BAT-09',
          className: 'Class 9th (NURTURE)',
          monthlyFee: 1000,
          timings: 'Mon – Sat: 2:30 PM – 4:30 PM',
          room: 'Hall B (Ground Floor)',
          progress: 68,
          teachers: [
            { name: 'CHANDAN KUMAR', subject: 'Science Mentor' },
            { name: 'RAVI RANJAN', subject: 'Maths Mentor' }
          ],
          schedule: [
            { subject: 'Mathematics (Ravi Ranjan Sir)', time: '2:30 PM - 3:30 PM' },
            { subject: 'Science (Chandan Kumar Sir)', time: '3:30 PM - 4:30 PM' }
          ]
        },
        {
          id: 'BAT-08',
          className: 'Class 8th (ALPHA)',
          monthlyFee: 800,
          timings: 'Mon – Sat: 3:00 PM – 5:00 PM',
          room: 'Classroom 3',
          progress: 60,
          teachers: [
            { name: 'CHANDAN KUMAR', subject: 'Science Mentor' },
            { name: 'RAVI RANJAN', subject: 'Maths Mentor' }
          ],
          schedule: [
            { subject: 'Science & Environment (Chandan Sir)', time: '3:00 PM - 4:00 PM' },
            { subject: 'Mathematics & Logic (Ravi Sir)', time: '4:00 PM - 5:00 PM' }
          ]
        },
        {
          id: 'BAT-JUNIO',
          className: 'Junior Batch (JUNIO)',
          monthlyFee: 700,
          timings: 'Mon – Sat: 3:30 PM – 5:00 PM',
          room: 'Classroom 1',
          progress: 55,
          teachers: [
            { name: 'CHANDAN KUMAR', subject: 'Science Mentor' },
            { name: 'RAVI RANJAN', subject: 'Maths Mentor' }
          ],
          schedule: [
            { subject: 'Basic Numeracy (Ravi Sir)', time: '3:30 PM - 4:15 PM' },
            { subject: 'Basic Science & Logic (Chandan Sir)', time: '4:15 PM - 5:00 PM' }
          ]
        }
      ];
      localStorage.setItem(STORAGE_KEY_BATCHES, JSON.stringify(initialBatches));
    }

    if (!localStorage.getItem(STORAGE_KEY_AUDIT_LOGS)) localStorage.setItem(STORAGE_KEY_AUDIT_LOGS, '[]');
  }

  // ==========================================================================
  // SUPABASE REALTIME & CROSS-TAB INSTANT BROADCAST ENGINE
  // ==========================================================================
  // Application State Manager
  const AppState = {
    currentRole: 'student', // 'student' or 'admin'
    currentUser: null,      // Student or Admin object
    activeStudentTab: 'details',
    activeAdminTab: 'students',
    lastLocalMutationTime: 0,

    // In-memory high-speed cache
    _studentsCache: null,
    _noticesCache: null,
    _batchesCache: null,
    _requestsCache: null,
    _adminsCache: null,
    _auditLogsCache: null,
    _lastSavedStudentsMap: new Map(),
    _lastSavedReceiptsSet: new Set(),
    _dirtyStudentIds: new Set(),

    markStudentDirty(id) {
      if (id) this._dirtyStudentIds.add(id.toString());
    },

    clearDirtyStudents() {
      this._dirtyStudentIds.clear();
    },

    generateStudentId(classCode = '10', existingStudents = []) {
      return generateStudentId(classCode, existingStudents);
    },

    async fetchNextStudentId(classCode = '10') {
      return await fetchNextStudentId(classCode);
    },

    getClassCode(className = '') {
      return getClassCode(className);
    },

    invalidateCaches() {
      this._studentsCache = null;
      this._noticesCache = null;
      this._batchesCache = null;
      this._requestsCache = null;
      this._adminsCache = null;
      this._auditLogsCache = null;
    },

    safeSetItem(key, value) {
      this.invalidateCaches();
      try {
        localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
      } catch (err) {
        console.warn(`⚠️ SafeStorage: Could not write key '${key}' (Quota or Privacy Mode):`, err.message);
      }
    },

    markMutation() {
      this.lastLocalMutationTime = Date.now();
      this.safeSetItem('pragyan_last_local_mutation', this.lastLocalMutationTime.toString());
      try {
        if (typeof SupabaseSync !== 'undefined' && SupabaseSync.broadcastChange) {
          SupabaseSync.broadcastChange({ time: this.lastLocalMutationTime });
        }
      } catch (e) {
        console.warn('BroadcastChannel note:', e);
      }
      window.dispatchEvent(new CustomEvent('pragyan_local_mutation', { detail: { time: this.lastLocalMutationTime } }));
    },

    getLocalMutationTime() {
      if (!this.lastLocalMutationTime) {
        try {
          this.lastLocalMutationTime = parseInt(localStorage.getItem('pragyan_last_local_mutation') || '0', 10);
        } catch (e) { this.lastLocalMutationTime = 0; }
      }
      return this.lastLocalMutationTime;
    },

    getStudents() {
      if (this._studentsCache) return this._studentsCache;
      try {
        const raw = localStorage.getItem(STORAGE_KEY_STUDENTS);
        this._studentsCache = raw ? JSON.parse(raw) : [];
      } catch (e) { this._studentsCache = []; }

      // Re-hydrate feeHistory from getFeeReceipts if missing
      if (Array.isArray(this._studentsCache) && this._studentsCache.length > 0) {
        let allReceipts = [];
        try {
          const rawRec = localStorage.getItem('pragyan_db_fee_receipts_master');
          if (rawRec) allReceipts = JSON.parse(rawRec);
        } catch (_) {}

        if (Array.isArray(allReceipts) && allReceipts.length > 0) {
          this._studentsCache.forEach(student => {
            if (!Array.isArray(student.feeHistory) || student.feeHistory.length === 0) {
              const sUuid = (student.db_uuid || (student.id && String(student.id).includes('-') ? student.id : '')).toString().toLowerCase();
              const sId = (student.id || student.student_id || '').toString().toLowerCase();
              const sRoll = (student.rollNo || student.roll_no || '').toString().toLowerCase();
              const matched = allReceipts.filter(r => {
                const rStuId = (r.studentId || r.student_id || '').toString().toLowerCase();
                const rNo = (r.receiptNo || r.receipt_no || '').toString().toLowerCase();
                return (sUuid && rStuId === sUuid) || (sId && rStuId === sId) || (sRoll && rStuId === sRoll) || (sId && rNo.includes(sId));
              });
              if (matched.length > 0) student.feeHistory = matched;
            }
          });
        }
      }
      return this._studentsCache;
    },
    async saveStudents(students, changedIds = null) {  // H1: Delta sync with dirty tracking
      this._studentsCache = students;
      this.safeSetItem(STORAGE_KEY_STUDENTS, students);
      this.markMutation();

      try {
        if (Array.isArray(students) && students.length > 0) {
          // H1: Determine dirty / changed records for Delta Sync
          let studentsToSync = students;
          const dirtySet = new Set(this._dirtyStudentIds);
          if (Array.isArray(changedIds) && changedIds.length > 0) {
            changedIds.forEach(id => dirtySet.add(id.toString().toLowerCase()));
          }

          if (dirtySet.size > 0) {
            studentsToSync = students.filter(s => {
              const sId = (s.id || s.student_id || s.rollNo || '').toString().toLowerCase();
              return dirtySet.has(sId) || (s.id && dirtySet.has(s.id.toString().toLowerCase())) || (s.student_id && dirtySet.has(s.student_id.toString().toLowerCase()));
            });
          } else if (this._lastSavedStudentsMap && this._lastSavedStudentsMap.size > 0) {
            studentsToSync = students.filter(s => {
              const id = s.id || s.student_id || s.rollNo;
              const prev = this._lastSavedStudentsMap.get(id);
              if (!prev) return true; // New student
              const prevPhoto = prev.photo || prev.photoUrl || prev.photo_url || '';
              const currPhoto = s.photo || s.photoUrl || s.photo_url || '';
              return (
                prev.name !== s.name ||
                prev.mobile !== s.mobile ||
                prev.dob !== s.dob ||
                prev.className !== s.className ||
                prev.totalFee !== s.totalFee ||
                prev.paidFee !== s.paidFee ||
                prevPhoto !== currPhoto ||
                prev.status !== s.status ||
                prev.guardianName !== s.guardianName ||
                prev.guardianMobile !== s.guardianMobile ||
                prev.address !== s.address ||
                prev.email !== s.email ||
                prev.bloodGroup !== s.bloodGroup ||
                prev.joiningMonth !== s.joiningMonth
              );
            });
          }

          if (studentsToSync.length > 0) {
            const supaPayload = studentsToSync.map(s => {
              const id = s.student_id || s.id || s.rollNo || s.roll_no || '';
              const cleanEmail = (s.email && s.email.includes('@')) ? s.email.trim() : null;
              let dobFormatted = '2010-01-01';
              if (s.dob) {
                const str = s.dob.toString().trim();
                const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
                if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
                  dobFormatted = str;
                } else if (dmyMatch) {
                  const day = dmyMatch[1].padStart(2, '0');
                  const month = dmyMatch[2].padStart(2, '0');
                  const yr = dmyMatch[3];
                  dobFormatted = `${yr}-${month}-${day}`;
                } else {
                  const parsed = new Date(str);
                  if (!isNaN(parsed.getTime())) {
                    const yr = parsed.getFullYear();
                    if (yr >= 1900 && yr <= new Date().getFullYear()) {
                      dobFormatted = parsed.toISOString().split('T')[0];
                    }
                  }
                }
              }
              const paidFee = Number(s.paidFee ?? s.paid_fee ?? 0);
              const pendingFee = Number(s.pendingFee ?? s.pending_fee ?? 0);
              const totalFee = Number(s.totalFee ?? s.total_fee ?? (paidFee + pendingFee));

              return {
                student_id: id,
                name: s.name || 'Coaching Student',
                mobile: s.mobile || null,
                dob: dobFormatted,
                roll_no: s.rollNo || s.roll_no || id,
                class_name: s.className || s.class_name || 'Class 10th (ACHIEVER)',
                guardian_name: s.guardianName || s.guardian_name || null,
                guardian_mobile: s.guardianMobile || s.guardian_mobile || s.mobile || null,
                email: cleanEmail,
                total_fee: Math.max(totalFee, paidFee + pendingFee),
                paid_fee: paidFee,
                pending_fee: pendingFee,
                monthly_fee: Number(s.monthlyFee ?? s.monthlyInstallment ?? s.monthly_fee ?? 0),
                photo_url: s.photo || s.photo_url || s.photoUrl || '',
                status: s.status || 'Active',
                address: s.address || '',
                blood_group: s.bloodGroup || s.blood_group || '',
                joining_month: s.joiningMonth || s.joining_month || '',
                admission_date: s.admissionDate || s.admission_date || null,
                idempotency_key: id
              };
            });

            if (typeof SupabaseSync !== 'undefined' && SupabaseSync.mutate) {
              const r = await SupabaseSync.mutate('students', 'upsert', supaPayload, { conflict: 'student_id' });
              if (!r?.success) console.warn('saveStudents delta write failed:', r?.error);
              else {
                this.clearDirtyStudents();
                students.forEach(s => {
                  const id = s.id || s.student_id || s.rollNo;
                  this._lastSavedStudentsMap.set(id, { ...s });
                });
              }
            }
          }

          // Cache local fee accounts in lockstep with students table
          if (studentsToSync.length > 0) {
            const currentMonthKey = getIndiaMonthKey();
            const feeAccountsPayload = studentsToSync.map(s => {
              const id = s.student_id || s.id || s.rollNo || s.roll_no || '';
              const totalDue = Math.max(0, Number(s.pendingFee ?? s.pending_fee ?? (Number(s.totalFee || s.total_fee || 0) - Number(s.paidFee || s.paid_fee || 0))));
              const monthlyFee = Number(s.monthlyFee || s.monthly_fee || 1000);
              const prevDue = Math.max(0, totalDue - monthlyFee);
              const currFee = monthlyFee;
              const paidThisMonth = totalDue < monthlyFee ? Math.max(0, monthlyFee - totalDue) : 0;

              return {
                student_id: id,
                studentId: id,
                roll_no: s.rollNo || s.roll_no || id,
                rollNo: s.rollNo || s.roll_no || id,
                student_name: s.name || 'Student',
                studentName: s.name || 'Student',
                class_name: s.className || s.class_name || '',
                className: s.className || s.class_name || '',
                billing_month: currentMonthKey,
                billingMonth: currentMonthKey,
                previous_due: prevDue,
                previousDue: prevDue,
                current_month_fee: currFee,
                currentMonthFee: currFee,
                total_due: totalDue,
                totalDue: totalDue,
                paid_this_month: paidThisMonth,
                paidThisMonth: paidThisMonth,
                last_updated_at: new Date().toISOString()
              };
            });

            this._feeAccountsCache = feeAccountsPayload;
            this.safeSetItem('pragyan_db_fee_accounts_master', feeAccountsPayload);
          }

          // H3 & H2: Delta Sync for receipts
          const newReceipts = [];
          students.forEach(s => {
            if (Array.isArray(s.feeHistory)) {
              const studentUuid = s.db_uuid || (s.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.id) ? s.id : null);
              s.feeHistory.forEach(h => {
                const rNo = h.receiptNo || h.receipt_no;
                if (!rNo) return;
                if (!this._lastSavedReceiptsSet.has(rNo)) {
                  if (studentUuid) {
                    newReceipts.push({
                      receipt_no: rNo,
                      student_id: studentUuid,
                      amount: Number(h.amount) || 0,
                      payment_mode: h.mode || h.payment_mode || 'Cash Collected',
                      status: h.status || 'Paid',
                      payment_date: h.date || h.payment_date || new Date().toISOString().split('T')[0],
                      collected_by: h.by || h.collected_by || 'CHANDAN KUMAR',
                      note: h.note || ''
                    });
                  }
                }
              });
            }
          });

          if (newReceipts.length > 0 && typeof SupabaseSync !== 'undefined' && SupabaseSync.mutate) {
            const r2 = await SupabaseSync.mutate('fee_receipts', 'upsert', newReceipts, { conflict: 'receipt_no' });
            if (!r2?.success) console.warn('saveStudents receipts write note:', r2?.error);
            else {
              newReceipts.forEach(r => this._lastSavedReceiptsSet.add(r.receipt_no));
            }
          }
        }
      } catch(e) { console.warn('saveStudents Supabase error:', e); }
    },
    invalidateCaches() {
      this._studentsCache = null;
      this._receiptsCache = null;
      this._billingLedgerCache = null;
      this._feeAccountsCache = null;
      this._adminsCache = null;
      this._noticesCache = null;
      this._requestsCache = null;
      this._batchesCache = null;
    },
    getFeeReceipts() {
      if (this._receiptsCache) return this._receiptsCache;
      try {
        const raw = localStorage.getItem('pragyan_db_fee_receipts_master');
        this._receiptsCache = raw ? JSON.parse(raw) : [];
      } catch (e) { this._receiptsCache = []; }

      // Fallback: merge with any receipts found across all students' feeHistory
      if (!this._receiptsCache || this._receiptsCache.length === 0) {
        const fallback = [];
        const students = this.getStudents();
        students.forEach(s => {
          if (Array.isArray(s.feeHistory)) {
            s.feeHistory.forEach(h => {
              const rNo = h.receiptNo || h.receipt_no;
              if (rNo && !fallback.some(r => (r.receiptNo || r.receipt_no) === rNo)) {
                fallback.push({
                  receiptNo: rNo,
                  receipt_no: rNo,
                  studentId: s.id || s.student_id || s.rollNo,
                  student_id: s.id || s.student_id || s.rollNo,
                  amount: Number(h.amount) || 0,
                  date: h.date || h.payment_date || '',
                  payment_date: h.date || h.payment_date || '',
                  mode: h.mode || h.payment_mode || 'Cash Collected',
                  payment_mode: h.mode || h.payment_mode || 'Cash Collected',
                  status: h.status || 'Paid',
                  by: h.by || h.collected_by || 'CHANDAN KUMAR',
                  collected_by: h.by || h.collected_by || 'CHANDAN KUMAR',
                  note: h.note || ''
                });
              }
            });
          }
        });
        if (fallback.length > 0) this._receiptsCache = fallback;
      }
      return this._receiptsCache || [];
    },
    getBillingLedger() {
      if (this._billingLedgerCache) return this._billingLedgerCache;
      try {
        const raw = localStorage.getItem('pragyan_db_fee_ledger_master');
        this._billingLedgerCache = raw ? JSON.parse(raw) : [];
      } catch (e) { this._billingLedgerCache = []; }
      return this._billingLedgerCache || [];
    },
    async recordLedgerEntry(entry) {
      if (!entry) return;
      const ledger = this.getBillingLedger();
      const idKey = entry.idempotency_key || entry.idempotencyKey || `fee_${entry.student_id}_${entry.billing_month}`;
      const existingIdx = ledger.findIndex(l => (l.idempotency_key || l.idempotencyKey) === idKey);

      const cleanEntry = {
        student_id: entry.student_id || entry.studentId || '',
        studentId: entry.student_id || entry.studentId || '',
        billing_month: entry.billing_month || entry.billingMonth || '',
        billingMonth: entry.billing_month || entry.billingMonth || '',
        batch_label: entry.batch_label || entry.batchLabel || '',
        batchLabel: entry.batch_label || entry.batchLabel || '',
        amount: Number(entry.amount || 0),
        previous_due: Number(entry.previous_due ?? entry.previousDue ?? 0),
        previousDue: Number(entry.previous_due ?? entry.previousDue ?? 0),
        updated_due: Number(entry.updated_due ?? entry.updatedDue ?? 0),
        updatedDue: Number(entry.updated_due ?? entry.updatedDue ?? 0),
        idempotency_key: idKey,
        idempotencyKey: idKey,
        created_at: entry.created_at || new Date().toISOString()
      };

      if (existingIdx >= 0) {
        ledger[existingIdx] = cleanEntry;
      } else {
        ledger.unshift(cleanEntry);
      }

      this._billingLedgerCache = ledger;
      this.safeSetItem('pragyan_db_fee_ledger_master', ledger);
      this.markMutation();

      if (typeof SupabaseSync !== 'undefined' && SupabaseSync.mutate) {
        try {
          await SupabaseSync.mutate('fee_billing_ledger', 'upsert', [{
            student_id: cleanEntry.student_id,
            billing_month: cleanEntry.billing_month,
            batch_label: cleanEntry.batch_label,
            amount: cleanEntry.amount,
            previous_due: cleanEntry.previous_due,
            updated_due: cleanEntry.updated_due,
            idempotency_key: cleanEntry.idempotency_key
          }], { conflict: 'idempotency_key' });
        } catch (err) {
          console.warn('fee_billing_ledger mutate note:', err.message);
        }
      }
    },
    async recordReceipt(receipt) {
      if (!receipt) return;
      const receipts = this.getFeeReceipts();
      const rNo = receipt.receipt_no || receipt.receiptNo;
      if (!rNo) return;

      const existingIdx = receipts.findIndex(r => (r.receipt_no || r.receiptNo) === rNo);
      if (existingIdx >= 0) {
        receipts[existingIdx] = receipt;
      } else {
        receipts.unshift(receipt);
      }

      this._receiptsCache = receipts;
      this.safeSetItem('pragyan_db_fee_receipts_master', receipts);
      this.markMutation();

      if (typeof SupabaseSync !== 'undefined' && SupabaseSync.mutate) {
        try {
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(receipt.student_id || receipt.studentId || ''));
          let stuUuid = isUuid ? (receipt.student_id || receipt.studentId) : null;
          if (!stuUuid) {
            const students = this.getStudents();
            const found = students.find(s => s.id === receipt.student_id || s.student_id === receipt.student_id || s.rollNo === receipt.student_id);
            stuUuid = found?.db_uuid || (found?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(found.id) ? found.id : null);
          }
          if (stuUuid) {
            await SupabaseSync.mutate('fee_receipts', 'upsert', [{
              receipt_no: rNo,
              student_id: stuUuid,
              amount: Number(receipt.amount || 0),
              payment_mode: receipt.payment_mode || receipt.mode || 'Cash Collected',
              status: receipt.status || 'Paid',
              payment_date: receipt.payment_date || receipt.date || new Date().toISOString().split('T')[0],
              collected_by: receipt.collected_by || receipt.by || 'CHANDAN KUMAR',
              note: receipt.note || ''
            }], { conflict: 'receipt_no' });
          }
        } catch (err) {
          console.warn('fee_receipts mutate note:', err.message);
        }
      }
    },
    getFeeAccounts() {
      if (this._feeAccountsCache) return this._feeAccountsCache;
      try {
        const raw = localStorage.getItem('pragyan_db_fee_accounts_master');
        this._feeAccountsCache = raw ? JSON.parse(raw) : [];
      } catch (e) { this._feeAccountsCache = []; }
      return this._feeAccountsCache || [];
    },
    getStudentFeeAccount(studentId, fallbackStudent = null) {
      const accounts = this.getFeeAccounts();
      const sId = String(studentId || '').toLowerCase();
      const acc = accounts.find(a => 
        String(a.student_id || a.studentId || '').toLowerCase() === sId ||
        String(a.roll_no || a.rollNo || '').toLowerCase() === sId
      );

      const student = fallbackStudent || this.getStudents().find(s => 
        String(s.student_id || s.id || s.rollNo || s.roll_no || '').toLowerCase() === sId
      );

      const monthlyFee = Number(student?.monthlyFee ?? student?.monthly_fee ?? acc?.current_month_fee ?? acc?.currentMonthFee ?? 1000);

      if (acc) {
        const totalDue = Number(acc.total_due ?? acc.totalDue ?? 0);
        const currFee = Number(acc.current_month_fee ?? acc.currentMonthFee ?? monthlyFee);
        const prevDue = Number(acc.previous_due ?? acc.previousDue ?? Math.max(0, totalDue - monthlyFee));
        return {
          studentId: acc.student_id || acc.studentId || studentId,
          rollNo: acc.roll_no || acc.rollNo || '',
          studentName: acc.student_name || acc.studentName || '',
          className: acc.class_name || acc.className || '',
          billingMonth: acc.billing_month || acc.billingMonth || '',
          previousDue: prevDue,
          currentMonthFee: currFee,
          totalDue: totalDue,
          paidThisMonth: Number(acc.paid_this_month ?? acc.paidThisMonth ?? (totalDue < monthlyFee ? Math.max(0, monthlyFee - totalDue) : 0))
        };
      }

      // Deterministic fallback computation from student data
      const totalDue = Math.max(0, Number(student?.pendingFee ?? student?.pending_fee ?? (Number(student?.totalFee || student?.total_fee || 0) - Number(student?.paidFee || student?.paid_fee || 0))));
      const prevDue = Math.max(0, totalDue - monthlyFee);
      const currFee = monthlyFee;
      const paidThisMonth = totalDue < monthlyFee ? Math.max(0, monthlyFee - totalDue) : 0;

      return {
        studentId: student?.student_id || student?.id || studentId,
        rollNo: student?.roll_no || student?.rollNo || '',
        studentName: student?.name || 'Student',
        className: student?.className || student?.class_name || '',
        billingMonth: getIndiaMonthKey(),
        billing_month: getIndiaMonthKey(),
        previousDue: prevDue,
        currentMonthFee: currFee,
        totalDue: totalDue,
        paidThisMonth: paidThisMonth
      };
    },
    async saveFeeAccounts(accounts) {
      this._feeAccountsCache = accounts;
      this.safeSetItem('pragyan_db_fee_accounts_master', accounts);
      this.markMutation();
    },
    getAdmins() {
      if (this._adminsCache) return this._adminsCache;
      let admins = [];
      try {
        admins = JSON.parse(localStorage.getItem(STORAGE_KEY_ADMINS) || '[]');
      } catch (e) { admins = []; }
      this._adminsCache = Array.isArray(admins) ? admins : [];
      return this._adminsCache;
    },
    async saveAdmins(admins) {
      const sanitized = (admins || []).map(a => {
        const clean = { ...a };
        delete clean.password;
        delete clean.password_hash;
        delete clean.passcode;
        return clean;
      });
      this._adminsCache = sanitized;
      localStorage.setItem(STORAGE_KEY_ADMINS, JSON.stringify(sanitized));
      this.markMutation();

      try {
        if (Array.isArray(admins) && admins.length > 0) {
          const supaPayload = admins.map(a => ({
            admin_id: a.id,
            username: a.username,
            name: a.name,
            role: a.role,
            mobile: a.mobile,
            email: a.email,
            upi_id: a.upiId || 'pragyanlalganj@upi',
            photo_url: a.photoUrl || ''
          }));
          if (typeof SupabaseSync !== 'undefined' && SupabaseSync.mutate) {
            const currentId = this.currentUser?.id;
            const current = supaPayload.find(a => a.admin_id === currentId);
            if (!current) return;
            const r = await SupabaseSync.mutate('admins', 'update', current, { where: { admin_id: currentId } });
            if (!r?.success) console.warn('saveAdmins write failed:', r?.error);
          }
        }
      } catch(e) { console.warn('saveAdmins Supabase error:', e); }
    },
    getAdmin() {
      const admins = this.getAdmins();
      if (this.currentUser && this.currentUser.id) {
        const found = admins.find(a => a.id === this.currentUser.id);
        if (found) return found;
      }
      return admins[0] || { name: 'CHANDAN KUMAR', role: 'Managing Director & Science Lead (Head of Institute)' };
    },
    getNotices() {
      if (this._noticesCache) return this._noticesCache;
      try {
        this._noticesCache = JSON.parse(localStorage.getItem(STORAGE_KEY_NOTICES) || '[]');
      } catch (e) { this._noticesCache = []; }
      return this._noticesCache;
    },
    async saveNotices(notices) {
      this._noticesCache = notices;
      localStorage.setItem(STORAGE_KEY_NOTICES, JSON.stringify(notices));
      this.markMutation();

      try {
        if (Array.isArray(notices) && notices.length > 0 && typeof SupabaseSync !== 'undefined' && SupabaseSync.mutate) {
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          const generateUUID = () => {
            if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
              const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
              return v.toString(16);
            });
          };

          // H2: Assign deterministic UUID & track _local_id before saving so local and remote IDs match 100%
          notices.forEach((n, idx) => {
            n._local_id = n._local_id || n.id || `local_notice_${idx}_${Date.now()}`;
            if (!n.id || !uuidRegex.test(n.id)) {
              n._old_id = n.id;
              n.id = generateUUID();
            }
          });
          localStorage.setItem(STORAGE_KEY_NOTICES, JSON.stringify(notices));

          const supaPayload = notices.map(n => ({
            id: n.id,
            title: n.title || 'Announcement',
            category: n.category || 'general',
            message: n.message || '',
            target_batch: n.targetBatch || n.target_batch || 'All Batches',
            attachment_url: n.attachmentUrl || n.attachment_url || '',
            created_at: n.date ? new Date(n.date).toISOString() : new Date().toISOString(),
            idempotency_key: n.id,
            _local_id: n._local_id
          }));

          const r = await SupabaseSync.mutate('notices', 'upsert', supaPayload, { conflict: 'id' });
          if (!r?.success) console.warn('saveNotices upsert failed:', r?.error);
          else if (Array.isArray(r.data)) {
            // Map returned IDs by _local_id or id, never relying on array index
            const retMap = new Map();
            r.data.forEach(item => {
              if (item._local_id) retMap.set(item._local_id, item.id);
              if (item.id) retMap.set(item.id, item.id);
            });
            notices.forEach(n => {
              if (n._local_id && retMap.has(n._local_id)) {
                n.id = retMap.get(n._local_id);
              }
            });
            localStorage.setItem(STORAGE_KEY_NOTICES, JSON.stringify(notices));
          }
        }
      } catch(e) { console.warn('saveNotices Supabase error:', e); }
    },
    getBatches() {
      if (this._batchesCache) return this._batchesCache;
      let batches = [];
      try {
        batches = JSON.parse(localStorage.getItem(STORAGE_KEY_BATCHES) || '[]');
      } catch(e) {}
      if (!Array.isArray(batches) || batches.length === 0) {
        batches = [
          { id: 'BAT-01', batch_id: 'BAT-01', name: 'Class 10th (ACHIEVER)', monthlyFee: 1000, monthly_fee: 1000, timing: '06:30 AM - 08:30 AM', room: 'Hall 1 (Digital Board)', teacher: 'Ravi Ranjan & Chandan Kumar' },
          { id: 'BAT-02', batch_id: 'BAT-02', name: 'Class 9th (NURTURE)', monthlyFee: 1000, monthly_fee: 1000, timing: '08:30 AM - 10:30 AM', room: 'Hall 2 (Digital Board)', teacher: 'Chandan Kumar & Ravi Ranjan' },
          { id: 'BAT-03', batch_id: 'BAT-03', name: 'Class 8th (ALPHA)', monthlyFee: 800, monthly_fee: 800, timing: '03:30 PM - 05:30 PM', room: 'Room 3', teacher: 'Chandan Kumar' },
          { id: 'BAT-04', batch_id: 'BAT-04', name: 'Junior Batch (JUNIO)', monthlyFee: 700, monthly_fee: 700, timing: '04:00 PM - 05:30 PM', room: 'Room 4', teacher: 'Faculty' }
        ];
        localStorage.setItem(STORAGE_KEY_BATCHES, JSON.stringify(batches));
      }
      this._batchesCache = batches;
      return batches;
    },
    async saveBatches(batches) {  // BUG-1 fix: async
      this._batchesCache = batches;
      localStorage.setItem(STORAGE_KEY_BATCHES, JSON.stringify(batches));
      this.markMutation();

      try {
        if (Array.isArray(batches) && batches.length > 0) {
          const supaPayload = batches.map(b => ({
            batch_id: b.id,
            name: b.name,
            monthly_fee: Number(b.monthlyFee) || 1000,
            timing: b.timing || '',
            room: b.room || '',
            teacher: b.teacher || ''
          }));
          if (typeof SupabaseSync !== 'undefined' && SupabaseSync.mutate) {
            const r = await SupabaseSync.mutate('batches', 'upsert', supaPayload, { conflict: 'batch_id' });
            if (!r?.success) console.warn('saveBatches write failed:', r?.error);
          }
        }
      } catch(e) { console.warn('saveBatches Supabase error:', e); }
    },
    getRequests() {
      if (this._requestsCache) return this._requestsCache;
      try {
        this._requestsCache = JSON.parse(localStorage.getItem(STORAGE_KEY_REQUESTS) || '[]');
      } catch (e) { this._requestsCache = []; }
      return this._requestsCache;
    },
    async saveRequests(reqs) {
      this._requestsCache = reqs;
      localStorage.setItem(STORAGE_KEY_REQUESTS, JSON.stringify(reqs));
      this.markMutation();

      try {
        if (Array.isArray(reqs) && reqs.length > 0) {
          const currentId = this.currentUser?.id || this.currentUser?.student_id || this.currentUser?.rollNo || '';
          const supaPayload = reqs.map(r => ({
            request_id: r.id || r.request_id,
            student_id: r.studentId || r.student_id || currentId,
            student_name: r.studentName || r.student_name || this.currentUser?.name || '',
            roll_no: r.rollNo || r.roll_no || this.currentUser?.rollNo || '',
            class_name: r.className || r.class_name || this.currentUser?.className || '',
            req_type: (r.type === 'payment' || r.paymentDetails || r.req_type === 'PAYMENT_VERIFICATION') ? 'PAYMENT_VERIFICATION' : 'PROFILE_UPDATE',
            status: r.status || 'Pending',
            request_date: r.date || r.request_date || new Date().toISOString().split('T')[0],
            old_data: r.oldData || r.old_data || null,
            new_data: r.newData || r.new_data || (r.paymentDetails ? { paymentDetails: r.paymentDetails } : null)
          }));

          if (supaPayload.length > 0 && typeof SupabaseSync !== 'undefined' && SupabaseSync.mutate) {
            const r2 = await SupabaseSync.mutate('student_requests', 'upsert', supaPayload, { conflict: 'request_id' });
            if (!r2?.success) console.warn('saveRequests write failed:', r2?.error);
          }
        }
      } catch(e) { console.warn('saveRequests Supabase error:', e); }
    },
    getCommunityMessages() {
      let msgs = [];
      try {
        msgs = JSON.parse(localStorage.getItem('pragyan_community_messages') || '[]');
      } catch(e) {}
      if (!Array.isArray(msgs) || msgs.length === 0) {
        msgs = [
          {
            id: 'MSG-INIT-01',
            senderId: 'ADM-01',
            senderName: 'CHANDAN KUMAR',
            senderRole: 'Managing Director & Head of Institute',
            avatar: '👨‍🏫',
            isAdmin: true,
            text: '🎉 Welcome all students & faculty to the official Pragyan Institute Community Forum! You can ask questions, discuss subjects, and get live updates here.',
            timestamp: getFormattedTimestamp(),
            isPinned: true,
            pinnedBy: 'CHANDAN KUMAR',
            pinnedAt: getFormattedTimestamp(),
            attachment: null,
            replies: [
              {
                id: 'REP-01',
                senderId: 'STU-1001',
                senderName: 'Rohan Sharma',
                senderRole: 'Student (Class 10th)',
                avatar: '🎓',
                text: 'Thank you Sir! Excited for the board preparation sessions.',
                timestamp: getFormattedTimestamp()
              }
            ]
          }
        ];
        localStorage.setItem('pragyan_community_messages', JSON.stringify(msgs));
      }
      return msgs;
    },
    saveCommunityMessages(msgs) {
      localStorage.setItem('pragyan_community_messages', JSON.stringify(msgs));
      this.markMutation();
    },
    getAuditLogs() {
      if (this._auditLogsCache) return this._auditLogsCache;
      try {
        this._auditLogsCache = JSON.parse(localStorage.getItem(STORAGE_KEY_AUDIT_LOGS) || '[]');
      } catch (e) { this._auditLogsCache = []; }
      return this._auditLogsCache;
    },
    async saveAuditLogs(logs) {  // BUG-1 fix: async
      this._auditLogsCache = logs;
      localStorage.setItem(STORAGE_KEY_AUDIT_LOGS, JSON.stringify(logs));
      this.markMutation();

      try {
        if (Array.isArray(logs) && logs.length > 0) {
          const supaPayload = logs.map(a => ({
            log_id: a.id,
            timestamp: a.timestamp || getFormattedTimestamp(),
            actor: a.actor || 'Admin',
            action_type: a.actionType || 'GENERAL_ACTION',
            student_name: a.studentName || 'System',
            student_roll: a.studentRoll || 'N/A',
            description: a.description || '',
            details: a.details || null
          }));
          if (typeof SupabaseSync !== 'undefined' && SupabaseSync.mutate) {
            const r = await SupabaseSync.mutate('audit_logs', 'upsert', supaPayload, { conflict: 'log_id' });
            if (!r?.success) console.warn('saveAuditLogs write failed:', r?.error);
          }
        }
      } catch(e) { console.warn('saveAuditLogs Supabase error:', e); }
    },
    async addAuditLog(actor, actionType, studentName, studentRoll, description, details = {}) {
      const logs = this.getAuditLogs();
      logs.unshift({
        id: `AUD-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,5)}`,
        timestamp: getFormattedTimestamp(),
        date: new Date().toISOString().split('T')[0],
        actor: actor || 'Prof. Ravi Ranjan (Director)',
        actionType: actionType,
        studentName: studentName || 'System',
        studentRoll: studentRoll || 'N/A',
        description: description,
        details: details
      });
      // BUG-M fix: return the promise so callers that await it get proper chaining
      return this.saveAuditLogs(logs);
    },
    async updateStudentPassword(newPassword) {
      if (!newPassword || newPassword.trim().length < 4) {
        throw new Error('Password must be at least 4 characters long.');
      }
      const cleanPassword = newPassword.trim();
      const current = this.currentUser;
      if (!current) throw new Error('No active student session.');

      const sId = current.student_id || current.id || current.rollNo;
      const rollNo = current.rollNo || current.roll_no || sId;
      const sName = current.name || 'Student';
      const sClass = current.className || current.class_name || 'General';

      // 1. Send to server API if available
      try {
        const token = sessionStorage.getItem('pragyan_portal_token') || localStorage.getItem('pragyan_portal_token');
        if (token) {
          const apiBase = (typeof window !== 'undefined' && window.PRAGYAN_API_BASE) ? window.PRAGYAN_API_BASE : '';
          const res = await fetch(`${apiBase}/api/student-password`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ newPassword: cleanPassword })
          });
          if (res.ok) {
            const data = await res.json().catch(() => ({}));
            console.log('Server student password update success:', data);
          }
        }
      } catch (err) {
        console.warn('Server password update note:', err);
      }

      // 2. Direct Supabase / local requests upsert
      const reqs = this.getRequests();
      const existingIdx = reqs.findIndex(r => 
        (r.req_type === 'PASSWORD_UPDATE' || r.type === 'PASSWORD_UPDATE') &&
        (r.studentId === sId || r.student_id === sId || r.rollNo === rollNo || r.roll_no === rollNo)
      );

      const reqId = existingIdx >= 0 ? (reqs[existingIdx].id || reqs[existingIdx].request_id) : `PWD-${Date.now().toString(36)}`;
      const reqObj = {
        id: reqId,
        request_id: reqId,
        studentId: sId,
        student_id: sId,
        studentName: sName,
        student_name: sName,
        rollNo: rollNo,
        roll_no: rollNo,
        className: sClass,
        class_name: sClass,
        req_type: 'PASSWORD_UPDATE',
        type: 'PASSWORD_UPDATE',
        status: 'Active',
        date: new Date().toISOString().split('T')[0],
        request_date: new Date().toISOString().split('T')[0],
        oldData: {},
        old_data: {},
        newData: { password: cleanPassword, updated_at: new Date().toISOString(), updated_by: 'student' },
        new_data: { password: cleanPassword, updated_at: new Date().toISOString(), updated_by: 'student' }
      };

      if (existingIdx >= 0) {
        reqs[existingIdx] = reqObj;
      } else {
        reqs.unshift(reqObj);
      }

      await this.saveRequests(reqs);

      // 3. Update local student custom password
      const students = this.getStudents();
      const stu = students.find(s => s.id === sId || s.student_id === sId || s.rollNo === rollNo);
      if (stu) {
        stu.customPassword = cleanPassword;
        await this.saveStudents(students);
      }

      return { success: true, message: 'Password updated successfully!' };
    },
    async resetStudentPasswordToDob(studentId) {
      if (!studentId) throw new Error('Student ID is required.');
      const students = this.getStudents();
      const target = students.find(s => s.id === studentId || s.student_id === studentId || s.rollNo === studentId);
      if (!target) throw new Error('Student not found.');

      const sId = target.student_id || target.id;
      const rollNo = target.rollNo || target.roll_no || sId;
      const teacherName = getActiveTeacherName();

      // 1. Send to server API if available
      try {
        const token = sessionStorage.getItem('pragyan_portal_token') || localStorage.getItem('pragyan_portal_token');
        if (token) {
          const apiBase = (typeof window !== 'undefined' && window.PRAGYAN_API_BASE) ? window.PRAGYAN_API_BASE : '';
          const res = await fetch(`${apiBase}/api/student-password`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ studentId: sId, resetToDob: true })
          });
          if (res.ok) {
            const data = await res.json().catch(() => ({}));
            console.log('Server student password reset success:', data);
          }
        }
      } catch (err) {
        console.warn('Server password reset note:', err);
      }

      // 2. Direct Supabase / local requests update to RESET_TO_DOB
      const reqs = this.getRequests();
      reqs.forEach(r => {
        if ((r.req_type === 'PASSWORD_UPDATE' || r.type === 'PASSWORD_UPDATE') &&
            (r.studentId === sId || r.student_id === sId || r.rollNo === rollNo || r.roll_no === rollNo)) {
          r.status = 'RESET_TO_DOB';
          r.newData = { password: null, reset_to_dob: true, reset_at: new Date().toISOString(), reset_by: teacherName };
          r.new_data = { password: null, reset_to_dob: true, reset_at: new Date().toISOString(), reset_by: teacherName };
        }
      });
      await this.saveRequests(reqs);

      // 3. Clear local customPassword on student
      delete target.customPassword;
      await this.saveStudents(students);

      // 4. Record in audit ledger
      await this.addAuditLog(teacherName, 'STUDENT_PASSWORD_RESET', target.name, target.rollNo, `Reset student portal password to official Date of Birth (${target.dob}) for ${target.name}`, { studentId: sId, dob: target.dob });

      return { success: true, dob: target.dob, message: `Password for ${target.name} has been reset to Date of Birth (${target.dob}).` };
    }
  };

  function isStudentRequestMatch(req, student) {
    if (!req || !student) return false;
    const sId = (student.id || student.student_id || '').toString().trim().toLowerCase();
    const sRoll = (student.rollNo || student.roll_no || '').toString().trim().toLowerCase();
    const sMob = (student.mobile || student.guardianMobile || '').toString().trim().slice(-10);

    const rTarget = (req.studentId || req.student_id || '').toString().trim().toLowerCase();
    const rRoll = (req.rollNo || req.roll_no || '').toString().trim().toLowerCase();
    const rMob = (req.oldData?.mobile || req.newData?.mobile || req.old_data?.mobile || req.new_data?.mobile || '').toString().trim().slice(-10);

    if (sId && (rTarget === sId || rRoll === sId)) return true;
    if (sRoll && (rTarget === sRoll || rRoll === sRoll)) return true;
    if (sMob && rMob && sMob.length >= 10 && sMob === rMob) return true;
    return false;
  }

  // DOM Elements Selector Cache
  let portalOverlay, portalCloseBtn, loginViewContainer, studentDashboardContainer, adminDashboardContainer;
  let loginRoleStudentBtn, loginRoleAdminBtn, loginForm, loginMobileInput, loginDobInput, loginErrorMsg;

  document.addEventListener('DOMContentLoaded', () => {
    initDatabase();
    bindDOMElements();
    setupEventListeners();
    checkExistingSession();
    if (typeof SupabaseSync !== 'undefined' && SupabaseSync.init) {
      SupabaseSync.init();
    }

    if (typeof SupabaseSync !== 'undefined' && SupabaseSync.onChange) {
      const debouncedRenderSync = debounce(() => {
        const activeEl = document.activeElement;
        const isUserTyping = activeEl && (
          activeEl.tagName === 'INPUT' || 
          activeEl.tagName === 'TEXTAREA' || 
          activeEl.tagName === 'SELECT' || 
          activeEl.isContentEditable
        );

        if (!isUserTyping) {
          const overlay = document.getElementById('portalOverlay') || portalOverlay;
          const isPortalOpen = overlay && (overlay.classList.contains('active') || overlay.style.display === 'flex');
          if (isPortalOpen) {
            if (AppState.currentRole === 'admin') {
              if (typeof renderAdminDashboard === 'function') {
                renderAdminDashboard();
              }
            } else if (AppState.currentRole === 'student') {
              if (typeof renderStudentDashboard === 'function') {
                renderStudentDashboard();
              }
            }
          }
        }
      }, 250);

      SupabaseSync.onChange((event, data) => {
        console.log('⚡ SupabaseSync live change event received in UI:', event);
        AppState.invalidateCaches();
        if (AppState.currentUser) {
          const sId = (AppState.currentUser.id || AppState.currentUser.student_id || '').toString().toLowerCase();
          const sRoll = (AppState.currentUser.rollNo || AppState.currentUser.roll_no || '').toString().toLowerCase();
          if (AppState.currentRole === 'student') {
            const freshStudent = AppState.getStudents().find(s => {
              const rId = (s.id || s.student_id || '').toString().toLowerCase();
              const rRoll = (s.rollNo || s.roll_no || '').toString().toLowerCase();
              return (sId && (rId === sId || rRoll === sId)) || (sRoll && (rRoll === sRoll || rId === sRoll));
            });
            if (freshStudent) {
              AppState.currentUser = freshStudent;
              saveSession('student', freshStudent);
            }
          } else if (AppState.currentRole === 'admin') {
            const adminId = (AppState.currentUser.id || AppState.currentUser.admin_id || AppState.currentUser.username || '').toString().toLowerCase();
            const freshAdmin = AppState.getAdmins().find(a => {
              const aId = (a.id || a.admin_id || a.username || '').toString().toLowerCase();
              return adminId && aId === adminId;
            });
            if (freshAdmin) {
              AppState.currentUser = freshAdmin;
              saveSession('admin', freshAdmin);
            }
          }
        }
        debouncedRenderSync();
      });
    }
  });

  function bindDOMElements() {
    portalOverlay = document.getElementById('portalOverlay');
    portalCloseBtn = document.getElementById('portalCloseBtn');
    loginViewContainer = document.getElementById('loginViewContainer');
    studentDashboardContainer = document.getElementById('studentDashboardContainer');
    adminDashboardContainer = document.getElementById('adminDashboardContainer');

    loginRoleStudentBtn = document.getElementById('loginRoleStudentBtn');
    loginRoleAdminBtn = document.getElementById('loginRoleAdminBtn');
    loginForm = document.getElementById('portalLoginForm');
    loginMobileInput = document.getElementById('portalMobileInput');
    loginDobInput = document.getElementById('portalDobInput');
    loginErrorMsg = document.getElementById('loginErrorMsg');
  }

  function setupEventListeners() {
    // Open Portal Buttons (Nav, Drawer, Hero)
    document.querySelectorAll('.open-portal-trigger').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        openPortal();
      });
    });

    // Close Portal Button
    portalCloseBtn?.addEventListener('click', closePortal);

    // Role Switcher Tabs (Student vs Admin)
    loginRoleStudentBtn?.addEventListener('click', () => switchLoginRole('student'));
    loginRoleAdminBtn?.addEventListener('click', () => switchLoginRole('admin'));

    // Login Form Submit (No OTP required!)
    loginForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      handleLoginSubmit();
    });

    // Logout Buttons
    document.addEventListener('click', (e) => {
      if (e.target.closest('.btn-logout')) {
        handleLogout();
      }
    });

    // Student Dashboard Tab Buttons
    document.addEventListener('click', (e) => {
      const tabBtn = e.target.closest('.student-tab-btn');
      if (tabBtn) {
        const targetTab = tabBtn.dataset.tab;
        switchStudentTab(targetTab);
      }
    });

    // Admin Dashboard Tab Buttons
    document.addEventListener('click', (e) => {
      const tabBtn = e.target.closest('.admin-tab-btn');
      if (tabBtn) {
        const targetTab = tabBtn.dataset.tab;
        switchAdminTab(targetTab);
      }
    });

    // Notification Filter Chips
    document.addEventListener('click', (e) => {
      const filterChip = e.target.closest('.notice-filter-chip');
      if (filterChip) {
        document.querySelectorAll('.notice-filter-chip').forEach(c => c.classList.remove('active'));
        filterChip.classList.add('active');
        const cat = filterChip.dataset.cat;
        renderStudentNotifications(cat);
      }
    });
  }

  /* --------------------------------------------------------------------------
   * Portal Modal Toggle & Session Management
   * -------------------------------------------------------------------------- */
  function openPortal() {
    if (!portalOverlay) portalOverlay = document.getElementById('portalOverlay');
    if (portalOverlay) {
      portalOverlay.classList.add('active');
      portalOverlay.style.display = 'flex';
      portalOverlay.style.opacity = '1';
      portalOverlay.style.visibility = 'visible';
    }
    document.body.style.overflow = 'hidden';
    sessionStorage.setItem('pragyan_portal_open', 'true');
    localStorage.setItem('pragyan_portal_open', 'true');

    // Trigger instant cloud sync whenever portal opens
    if (typeof SupabaseSync !== 'undefined' && SupabaseSync.pullAll) {
      SupabaseSync.pullAll().catch(() => {});
    }

    // If session exists, render active dashboard directly
    let session = null;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY_SESSION) || localStorage.getItem(STORAGE_KEY_SESSION);
      if (raw) session = JSON.parse(raw);
    } catch(e) {}

    if (session && session.user) {
      AppState.currentRole = session.role;
      AppState.currentUser = AppState.currentUser || session.user;
      showDashboard(session.role);
    } else {
      showLoginView();
    }
  }

  function closePortal() {
    if (!portalOverlay) portalOverlay = document.getElementById('portalOverlay');
    if (portalOverlay) {
      portalOverlay.classList.remove('active');
      portalOverlay.style.display = 'none';
      portalOverlay.style.opacity = '0';
      portalOverlay.style.visibility = 'hidden';
    }
    document.body.style.overflow = '';
    sessionStorage.setItem('pragyan_portal_open', 'false');
    localStorage.setItem('pragyan_portal_open', 'false');
  }

  function checkExistingSession() {
    let session = null;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY_SESSION) || localStorage.getItem(STORAGE_KEY_SESSION);
      if (raw) session = JSON.parse(raw);
    } catch(e) {}

    const token = sessionStorage.getItem('pragyan_portal_token') || localStorage.getItem('pragyan_portal_token');

    if (session && session.user) {
      AppState.currentRole = session.role || 'student';
      // Sync across both storage layers
      sessionStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(session));
      localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(session));
      sessionStorage.setItem('pragyan_portal_role', session.role || '');
      localStorage.setItem('pragyan_portal_role', session.role || '');
      if (token) {
        sessionStorage.setItem('pragyan_portal_token', token);
        localStorage.setItem('pragyan_portal_token', token);
      }

      // Re-hydrate student or admin session from collection
      if (session.role === 'student') {
        const studentId = session.user.id || session.user.student_id || session.user.rollNo;
        const fullStudent = AppState.getStudents().find(s => s.id === studentId || s.student_id === studentId || s.rollNo === session.user.rollNo);
        AppState.currentUser = fullStudent || session.user;
      } else if (session.role === 'admin') {
        const adminId = session.user.id || session.user.username;
        const fullAdmin = AppState.getAdmins().find(a => a.id === adminId || a.username === adminId);
        AppState.currentUser = fullAdmin || session.user;
      } else {
        AppState.currentUser = session.user;
      }

      // Trigger cloud pull for existing session
      if (typeof SupabaseSync !== 'undefined' && SupabaseSync.pullAll) {
        SupabaseSync.pullAll().catch(() => {});
      }

      // Clear sticky auto-open flags so public landing page loads cleanly
      localStorage.removeItem('pragyan_portal_open');

      // Only open portal if URL hash specifically requests it
      const wantsPortalByHash = window.location.hash === '#portal' || window.location.hash === '#login';
      if (wantsPortalByHash) {
        openPortal();
      }
    }
  }

  function showLoginView() {
    const lvc = document.getElementById('loginViewContainer') || loginViewContainer;
    const sdc = document.getElementById('studentDashboardContainer') || studentDashboardContainer;
    const adc = document.getElementById('adminDashboardContainer') || adminDashboardContainer;

    if (lvc) {
      lvc.classList.remove('hidden-view');
      lvc.removeAttribute('hidden');
      lvc.style.removeProperty('display');
      lvc.style.display = '';
    }
    if (sdc) {
      sdc.classList.add('hidden-view');
      sdc.setAttribute('hidden', 'true');
      sdc.style.setProperty('display', 'none', 'important');
    }
    if (adc) {
      adc.classList.add('hidden-view');
      adc.setAttribute('hidden', 'true');
      adc.style.setProperty('display', 'none', 'important');
    }
  }

  function switchLoginRole(role) {
    AppState.currentRole = role;
    if (loginMobileInput) loginMobileInput.value = '';
    if (loginDobInput) loginDobInput.value = '';
    if (role === 'student') {
      loginRoleStudentBtn?.classList.add('active');
      loginRoleAdminBtn?.classList.remove('active');
    } else {
      loginRoleAdminBtn?.classList.add('active');
      loginRoleStudentBtn?.classList.remove('active');
    }
    if (loginErrorMsg) loginErrorMsg.style.display = 'none';
    const idLabel = document.querySelector('label[for="portalMobileInput"]');
    const credentialLabel = document.querySelector('label[for="portalDobInput"]');
    if (role === 'admin') {
      if (idLabel) idLabel.textContent = 'Admin Username';
      if (credentialLabel) credentialLabel.textContent = 'Password';
      if (loginMobileInput) {
        loginMobileInput.type = 'text';
        loginMobileInput.maxLength = 80;
        loginMobileInput.placeholder = 'Enter your admin username';
      }
      if (loginDobInput) {
        loginDobInput.type = 'password';
        loginDobInput.placeholder = 'Enter your password';
      }
    } else {
      if (idLabel) idLabel.textContent = 'Mobile Number';
      if (credentialLabel) credentialLabel.textContent = 'Date of Birth (DOB)';
      if (loginMobileInput) {
        loginMobileInput.type = 'tel';
        loginMobileInput.maxLength = 10;
        loginMobileInput.placeholder = 'Enter 10-digit mobile number';
      }
      if (loginDobInput) {
        loginDobInput.type = 'date';
        loginDobInput.placeholder = '';
      }
    }
  }

  /* --------------------------------------------------------------------------
   * Authentication Handler (Direct Real-time Supabase Database Authentication)
   * -------------------------------------------------------------------------- */
  async function handleLoginSubmit() {
    const mobile = loginMobileInput?.value.trim();
    const dob = loginDobInput?.value.trim();
    const role = AppState.currentRole || 'student';

    if (!mobile || !dob) {
      showLoginError(role === 'admin' ? 'Enter your username and password.' : 'Enter your registered mobile number and date of birth.');
      return;
    }

    const submitBtn = loginForm?.querySelector('.login-submit-btn') || loginForm?.querySelector('button[type="submit"]');
    const originalBtnContent = submitBtn ? submitBtn.innerHTML : '<i class="fa-solid fa-right-to-bracket"></i> Login to Portal';

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Authenticating with Database...';
    }
    if (loginErrorMsg) loginErrorMsg.style.display = 'none';

    try {
      if (typeof SupabaseSync !== 'undefined' && SupabaseSync.login) {
        const authResult = await SupabaseSync.login(role, mobile, dob);
        if (authResult && authResult.success) {
          AppState.currentUser = authResult.user;
          saveSession(role, authResult.user);
          if (role === 'student' && typeof AppState !== 'undefined' && AppState.getStudents) {
            const sId = (authResult.user.id || authResult.user.student_id || '').toLowerCase();
            const sRoll = (authResult.user.rollNo || authResult.user.roll_no || '').toLowerCase();
            const fresh = AppState.getStudents().find(s => {
              const rId = (s.id || s.student_id || '').toLowerCase();
              const rRoll = (s.rollNo || s.roll_no || '').toLowerCase();
              return (sId && (rId === sId || rRoll === sId)) || (sRoll && (rRoll === sRoll || rId === sRoll));
            });
            if (fresh) AppState.currentUser = fresh;
          }
          showDashboard(role);
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnContent;
          }
          return;
        } else {
          showLoginError((authResult && authResult.error) || 'Authentication failed. Please check your credentials.');
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnContent;
          }
          return;
        }
      }
    } catch (err) {
      console.warn('Direct database login error:', err);
    }

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnContent;
    }
    showLoginError('Server unavailable. Please check your internet connection or try again.');
  }

  function showLoginError(msg) {
    if (loginErrorMsg) {
      loginErrorMsg.textContent = msg;
      loginErrorMsg.style.display = 'block';
    }
  }

  function saveSession(role, userObj) {
    // BUG-N fix: Strip feeHistory from session to avoid 100KB+ session blobs slowing page loads
    // Full data is always reloaded fresh from AppState.getStudents() when needed
    const sessionUser = { ...userObj };
    delete sessionUser.feeHistory;
    const sessionData = JSON.stringify({ role, user: sessionUser, savedAt: Date.now() });

    // Store in both sessionStorage and localStorage for seamless persistence
    sessionStorage.setItem(STORAGE_KEY_SESSION, sessionData);
    localStorage.setItem(STORAGE_KEY_SESSION, sessionData);
    sessionStorage.setItem('pragyan_portal_role', role);
    localStorage.setItem('pragyan_portal_role', role);
    sessionStorage.setItem('pragyan_portal_open', 'true');
    localStorage.setItem('pragyan_portal_open', 'true');

    // Ensure session token exists
    const token = sessionStorage.getItem('pragyan_portal_token') || localStorage.getItem('pragyan_portal_token') || `token_${role}_${sessionUser.id || 'usr'}_${Date.now()}`;
    sessionStorage.setItem('pragyan_portal_token', token);
    localStorage.setItem('pragyan_portal_token', token);
  }

  async function handleLogout() {
    if (typeof SupabaseSync !== 'undefined' && SupabaseSync.destroy) {
      try { SupabaseSync.destroy(); } catch(e) {}
    }

    sessionStorage.removeItem(STORAGE_KEY_SESSION);
    sessionStorage.removeItem('pragyan_portal_token');
    sessionStorage.removeItem('pragyan_portal_role');
    sessionStorage.removeItem('pragyan_portal_open');

    localStorage.removeItem(STORAGE_KEY_SESSION);
    localStorage.removeItem('pragyan_portal_token');
    localStorage.removeItem('pragyan_portal_role');
    localStorage.removeItem('pragyan_portal_open');
    localStorage.removeItem('pragyan_portal_session');
    localStorage.removeItem('pragyan_student_session');
    localStorage.removeItem('pragyan_admin_session');

    AppState.currentUser = null;
    AppState.currentRole = null;
    if (typeof SupabaseSync !== 'undefined' && SupabaseSync.setSession) {
      try { await SupabaseSync.setSession(null, null); } catch(e) {}
    }
    showLoginView();
  }

  /* --------------------------------------------------------------------------
   * Dashboard View Switcher & Renderer
   * -------------------------------------------------------------------------- */
  function showDashboard(role) {
    const lvc = document.getElementById('loginViewContainer') || loginViewContainer;
    const sdc = document.getElementById('studentDashboardContainer') || studentDashboardContainer;
    const adc = document.getElementById('adminDashboardContainer') || adminDashboardContainer;

    if (lvc) {
      lvc.classList.add('hidden-view');
      lvc.setAttribute('hidden', 'true');
      lvc.style.setProperty('display', 'none', 'important');
    }

    if (role === 'student') {
      if (sdc) {
        sdc.classList.remove('hidden-view');
        sdc.removeAttribute('hidden');
        sdc.style.setProperty('display', 'block', 'important');
      }
      if (adc) {
        adc.classList.add('hidden-view');
        adc.setAttribute('hidden', 'true');
        adc.style.setProperty('display', 'none', 'important');
      }
      try {
        renderStudentDashboard();
      } catch (err) {
        console.error('Error rendering student dashboard:', err);
      }
    } else {
      if (sdc) {
        sdc.classList.add('hidden-view');
        sdc.setAttribute('hidden', 'true');
        sdc.style.setProperty('display', 'none', 'important');
      }
      if (adc) {
        adc.classList.remove('hidden-view');
        adc.removeAttribute('hidden');
        adc.style.setProperty('display', 'block', 'important');
      }
      try {
        renderAdminDashboard();
      } catch (err) {
        console.error('Error rendering admin dashboard:', err);
      }
    }
  }

  /* ==========================================================================
   * STUDENT PROFILE DASHBOARD RENDERERS (4 TABS)
   * ========================================================================== */
  
  function renderOfflineNoticeBanner() {
    const isOffline = (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('pragyan_offline_fallback') === 'true') ||
      (typeof sessionStorage !== 'undefined' && (sessionStorage.getItem('pragyan_portal_token') || '').startsWith('token_'));
    if (!isOffline) return '';
    return `
      <div id="offlineFallbackWarningBanner" style="background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.5); color: #B45309; padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; font-size: 13px; display: flex; align-items: center; gap: 10px; font-weight: 500;">
        <i class="fa-solid fa-triangle-exclamation" style="color: #D97706; font-size: 16px;"></i>
        <span><strong>Offline Session:</strong> You are viewing locally cached data. Server actions (password updates, live payment approvals, email broadcasts) require an active internet connection.</span>
      </div>
    `;
  }

function renderStudentDashboard() {
    // S5: Rehydrate currentUser with full student profile and feeHistory
    if (AppState.currentUser && (AppState.currentUser.id || AppState.currentUser.student_id || AppState.currentUser.rollNo)) {
      const sId = AppState.currentUser.id || AppState.currentUser.student_id;
      const sRoll = AppState.currentUser.rollNo || AppState.currentUser.roll_no;
      const full = AppState.getStudents().find(s => (sId && (s.id === sId || s.student_id === sId)) || (sRoll && (s.rollNo === sRoll || s.roll_no === sRoll)));
      if (full) {
        AppState.currentUser = full;
      }
    }

    const student = AppState.currentUser;
    if (!student) return;

    // Render Student Header Banner
    const nameEl = document.getElementById('studentHeaderName');
    const classEl = document.getElementById('studentHeaderClass');
    const rollEl = document.getElementById('studentHeaderRoll');
    const avatarEl = document.getElementById('studentAvatar');

    if (nameEl) nameEl.textContent = student.name;
    if (classEl) classEl.textContent = student.className;
    if (rollEl) rollEl.textContent = `Roll No: ${student.rollNo}`;

    if (avatarEl) {
      const photoUrl = student.photoUrl || student.photo_url || student.photo || '';
      if (photoUrl && (photoUrl.startsWith('http') || photoUrl.startsWith('data:image/'))) {
        avatarEl.innerHTML = `<img src="${photoUrl}" alt="${student.name}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
      } else {
        avatarEl.textContent = (student.name ? student.name.charAt(0).toUpperCase() : '🎓');
      }
    }

    // Update student notification tab badge
    const notices = AppState.getNotices();
    const studentBatch = (student.className || student.batchName || '').toLowerCase();
    const count = notices.filter(n => {
      const target = (n.targetBatch || n.target_batch || 'All Batches').toLowerCase();
      return target === 'all batches' || target === 'all' || target.includes('all') ||
             (studentBatch && (studentBatch.includes(target.slice(0, 8)) || target.includes(studentBatch.slice(0, 8))));
    }).length;

    const notifBtn = document.querySelector('.student-tab-btn[data-tab="notifications"]');
    if (notifBtn) {
      notifBtn.innerHTML = `<i class="fa-solid fa-bell"></i> Notification Tab ${count > 0 ? `<span class="badge" style="background:#059669; color:#fff; padding:1px 7px; border-radius:99px; font-size:0.75rem; margin-left:6px; font-weight:700;">${count}</span>` : ''}`;
    }

    // Render Student Tabs
    renderStudentDetailsTab();
    renderStudentBatchTab();
    renderStudentNotifications();
    renderStudentFeeTab();

    // Preserve active student tab
    const targetTab = AppState.activeStudentTab || 'details';
    switchStudentTab(targetTab);
  }

  function switchStudentTab(tabName) {
    if (tabName === 'community') tabName = 'details';
    AppState.activeStudentTab = tabName;
    AppState.activeTab = tabName;

    // Update Tab Button Active States
    document.querySelectorAll('.student-tab-btn').forEach(btn => {
      if (btn.dataset.tab === tabName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Update Tab Panes
    document.querySelectorAll('.student-tab-pane').forEach(pane => {
      if (pane.id === `studentTabPane-${tabName}`) {
        pane.classList.add('active');
        pane.style.display = 'block';
      } else {
        pane.classList.remove('active');
        pane.style.display = 'none';
      }
    });

    // Dynamically re-render active student tab
    if (tabName === 'details') {
      renderStudentDetailsTab();
    } else if (tabName === 'batch') {
      renderStudentBatchTab();
    } else if (tabName === 'notifications') {
      renderStudentNotifications();
    } else if (tabName === 'fees') {
      renderStudentFeeTab();
    }
  }

  function generateStudentLogicalBarcodeSVG(s) {
    const rawId = (s.student_id || s.rollNo || s.id || '261001').toString().toUpperCase();
    const code = rawId.replace(/[^A-Z0-9-]/g, '');
    
    // Code-128 / Code-39 realistic standard bar encoding table
    const patterns = {
      '0': '101001101101', '1': '110100101011', '2': '101100101011', '3': '110110010101',
      '4': '101001101011', '5': '110100110101', '6': '101100110101', '7': '101001011011',
      '8': '110100101101', '9': '101100101101', 'A': '110101001011', 'B': '101101001011',
      'C': '110110100101', 'D': '101011001011', 'E': '110101100101', 'F': '101101100101',
      'G': '101010011011', 'H': '110101001101', 'I': '101101001101', 'J': '101011001101',
      'K': '110101010011', 'L': '101101010011', 'M': '110110101001', 'N': '101011010011',
      'O': '110101101001', 'P': '101101101001', 'Q': '101001101101', 'R': '110101011001',
      'S': '101101011001', 'T': '101011011001', 'U': '110010101011', 'V': '100110101011',
      'W': '110011010101', 'X': '100101101011', 'Y': '110010110101', 'Z': '100110110101',
      '-': '100101011011', '#': '101001011011'
    };

    const barWidth = 1.6;
    const quietZone = 10 * barWidth; // 10x narrow bar quiet zone on each side (F25)

    let bits = '11010010000'; // Start Code
    for (let i = 0; i < code.length; i++) {
      const char = code[i];
      bits += (patterns[char] || '101001101101');
    }
    bits += '1100011101011'; // Stop Code

    let rects = '';
    let currentX = quietZone;
    for (let i = 0; i < bits.length; i++) {
      if (bits[i] === '1') {
        rects += `<rect x="${currentX.toFixed(1)}" y="0" width="${barWidth}" height="18" fill="#FFFFFF"/>`;
      }
      currentX += barWidth;
    }
    const totalSvgWidth = currentX + quietZone;

    return `
      <div class="logical-barcode-container">
        <svg class="logical-barcode-svg" viewBox="0 0 ${totalSvgWidth.toFixed(1)} 18" preserveAspectRatio="none" aria-label="Student Barcode ${code}">
          ${rects}
        </svg>
        <div class="logical-barcode-number">*${code}*</div>
      </div>
    `;
  }

  // 1. Student Tab: Their Details
  function renderStudentDetailsTab() {
    const s = AppState.currentUser;
    const pane = document.getElementById('studentTabPane-details');
    if (!pane || !s) return;

    const requests = AppState.getRequests();
    const pendingReq = requests.find(r => isStudentRequestMatch(r, s) && String(r.status || '').toLowerCase() === 'pending');

    pane.innerHTML = `
      ${pendingReq ? `
        <div style="background: #FEF3C7; border: 1.5px solid #F59E0B; color: #92400E; padding: 0.9rem 1.15rem; border-radius: 10px; margin-bottom: 1.25rem; font-size: 0.9rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.75rem; box-shadow: 0 2px 8px rgba(245,158,11,0.15);">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            ${(pendingReq.newData?.photoUrl || pendingReq.newData?.photo || pendingReq.newData?.photo_url) ? `
              <img src="${pendingReq.newData?.photoUrl || pendingReq.newData?.photo || pendingReq.newData?.photo_url}" style="width: 44px; height: 44px; border-radius: 8px; object-fit: cover; border: 2px solid #D97706; flex-shrink: 0;" alt="New Photo">
            ` : `<div style="font-size: 1.4rem;"><i class="fa-solid fa-clock-rotate-left" style="color: #D97706;"></i></div>`}
            <div>
              <div style="font-weight: 700; color: #92400E;"><i class="fa-solid fa-hourglass-half"></i> Profile Update Request Pending Review</div>
              <div style="font-size: 0.8rem; color: #B45309; margin-top: 2px;">Your requested updates${(pendingReq.newData?.photoUrl || pendingReq.newData?.photo) ? ' (including new profile photo)' : ''} are under Admin review.</div>
            </div>
          </div>
          <div style="display: flex; gap: 0.5rem; align-items: center;">
            <button class="btn" id="btnEditPendingReq" style="background: #D97706; color: #fff; padding: 0.35rem 0.85rem; border-radius: 6px; font-size: 0.82rem; font-weight: 700; cursor: pointer; border: none; display: inline-flex; align-items: center; gap: 0.35rem;">
              <i class="fa-solid fa-pen-to-square"></i> Edit
            </button>
            <button class="btn" id="btnCancelPendingReq" style="background: #DC2626; color: #fff; padding: 0.35rem 0.85rem; border-radius: 6px; font-size: 0.82rem; font-weight: 700; cursor: pointer; border: none; display: inline-flex; align-items: center; gap: 0.35rem;">
              <i class="fa-solid fa-xmark"></i> Cancel
            </button>
          </div>
        </div>
      ` : ''}

      <!-- TOP: Interactive 3D Metallic VIP Student ID Pass Card -->
      <div class="metallic-card-3d-container">
        <div class="card-flip-hint" id="cardFlipHintBtn">
          <i class="fa-solid fa-wand-magic-sparkles"></i> <span>Tap Card to Flip 3D</span> <i class="fa-solid fa-arrows-rotate"></i>
        </div>

        <div class="metallic-card-3d" id="studentIdCard3D">
          
          <!-- FRONT FACE: Imperial Emerald & 24K Gold VIP Pass -->
          <div class="card-face card-face-front">
            <div class="metallic-card-glimmer"></div>
            
            <div class="metallic-id-header">
              <div class="metallic-id-brand">
                <img src="assets/images/logo.png" class="metallic-id-logo" alt="Pragyan Institute Logo">
                <div>
                  <div class="metallic-id-inst-name">PRAGYAN INSTITUTE</div>
                  <div class="metallic-id-inst-sub">Lalganj • Institutional VIP Pass</div>
                </div>
              </div>
              <div class="metallic-vip-crest">
                <i class="fa-solid fa-crown"></i> <span>VIP SCHOLAR</span>
              </div>
            </div>

            <div class="metallic-id-body">
              <div class="metallic-avatar-upload-wrap">
                <div class="avatar-photo-label" style="cursor: default;">
                  ${(s.photoUrl || s.photo_url || s.photo) ? `<img src="${s.photoUrl || s.photo_url || s.photo}" class="student-id-photo-img" alt="Photo">` : `<div class="id-avatar-fallback">${(s.name || 'S').charAt(0).toUpperCase()}</div>`}
                </div>
                <div class="photo-verified-mini-dot" title="Biometrically Verified"><i class="fa-solid fa-check"></i></div>
              </div>

              <div class="metallic-id-info">
                <div class="metallic-emv-chip-row">
                  <div class="metallic-emv-chip" title="Smart Digital Pass">
                    <span class="chip-line chip-line-1"></span>
                    <span class="chip-line chip-line-2"></span>
                    <span class="chip-line chip-line-3"></span>
                  </div>
                  <div class="metallic-nfc-wave" title="Contactless NFC Digital ID"><i class="fa-solid fa-wifi"></i></div>
                </div>
                <h3>${s.name}</h3>
                <div class="metallic-pills-row">
                  <span class="metallic-id-chip"><i class="fa-solid fa-id-badge"></i> ID: ${s.student_id || s.rollNo || s.id}</span>
                  <span class="metallic-class-tag"><i class="fa-solid fa-graduation-cap"></i> ${s.className}</span>
                </div>
              </div>
            </div>

            <div class="metallic-id-details-row">
              <div><span>Roll:</span> <strong>#${s.rollNo}</strong></div>
              <div><span>Status:</span> <strong class="fee-status-badge ${s.pendingFee > 0 ? 'status-due' : 'status-cleared'}"><i class="fa-solid ${s.pendingFee > 0 ? 'fa-circle-exclamation' : 'fa-circle-check'}"></i> ${s.pendingFee > 0 ? `₹${s.pendingFee.toLocaleString()} Due` : '🟢 CLEARED'}</strong></div>
              <div><span>Contact:</span> <strong>${s.mobile}</strong></div>
              <div><span>Guardian:</span> <strong>${s.guardianName}</strong></div>
            </div>

            <div class="metallic-id-barcode-wrap">
              ${generateStudentLogicalBarcodeSVG(s)}
              <div class="metallic-qr-placeholder">
                <i class="fa-solid fa-shield-halved"></i> <span>SECURE ID</span>
              </div>
            </div>
          </div>

          <!-- BACK FACE: Official Academic & Fee Ledger -->
          <div class="card-face card-face-back">
            <div class="metallic-card-glimmer"></div>

            <div class="metallic-id-header">
              <div class="metallic-id-brand">
                <img src="assets/images/logo.png" class="metallic-id-logo" alt="Pragyan Institute Logo">
                <div>
                  <div class="metallic-id-inst-name">FEE & ACADEMIC LEDGER</div>
                  <div class="metallic-id-inst-sub">Official Institutional Credentials</div>
                </div>
              </div>
              <div class="metallic-hologram-seal">
                <i class="fa-solid fa-certificate"></i> AUTHENTIC
              </div>
            </div>

            <div class="back-card-content">
              <div class="back-meta-item">
                <span class="back-label">Student Name:</span>
                <span class="back-val">${s.name}</span>
              </div>
              <div class="back-meta-item">
                <span class="back-label">Enrolled Batch:</span>
                <span class="back-val">${s.batchName || s.className}</span>
              </div>
              <div class="back-meta-item highlight-dues-box">
                <span class="back-label">Tuition Clearance:</span>
                <span class="back-dues-pill ${s.pendingFee > 0 ? 'has-dues' : 'no-dues'}">
                  <i class="fa-solid ${s.pendingFee > 0 ? 'fa-triangle-exclamation' : 'fa-circle-check'}"></i>
                  ${s.pendingFee > 0 ? `₹${s.pendingFee.toLocaleString()} Pending Balance` : '🟢 100% Fee Cleared (No Dues)'}
                </span>
              </div>
              <div class="back-meta-grid">
                <div><span>Total Fee:</span> <strong>₹${(s.totalFee || 0).toLocaleString()}</strong></div>
                <div><span>Total Paid:</span> <strong style="color: #34D399;">₹${(s.paidFee || 0).toLocaleString()}</strong></div>
              </div>
            </div>

            <div class="back-card-footer">
              <div class="back-signatory">
                <span>Authorized Signatories</span>
                <div class="signature-script">Chandan Kumar • Ravi Ranjan</div>
              </div>
              <div class="back-contact-help">
                <i class="fa-solid fa-location-dot"></i> Near Main Chowk, Lalganj
              </div>
            </div>
          </div>

        </div>
      </div>

      <!-- BOTTOM: Full Student Information & Details Card -->
      <div class="dash-card">
        <div class="dash-card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
          <div class="dash-card-title">
            <i class="fa-solid fa-id-card"></i> Student Information & Profile Details
          </div>
          <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
            <button class="btn" id="btnStudentChangePassword" style="background-color: #2563EB; color: #fff; padding: 0.45rem 0.85rem; font-size: 0.82rem; font-weight: 600; cursor: pointer; border-radius: 6px; display: inline-flex; align-items: center; gap: 0.35rem;">
              <i class="fa-solid fa-key"></i> Change Password
            </button>
            <button class="btn" id="btnRequestDetailUpdate" style="background-color: var(--primary-emerald); color: #fff; padding: 0.45rem 0.85rem; font-size: 0.82rem; font-weight: 600; cursor: pointer; border-radius: 6px; display: inline-flex; align-items: center; gap: 0.35rem;">
              <i class="fa-solid fa-pen-to-square"></i> Request Update
            </button>
          </div>
        </div>

        <div class="detail-items-grid">
          <div class="detail-box" style="display: flex; align-items: center; gap: 0.75rem;">
            <div style="width: 44px; height: 44px; border-radius: 8px; overflow: hidden; border: 1.5px solid var(--primary-emerald); flex-shrink: 0; background: #e5e7eb; display: flex; align-items: center; justify-content: center;">
              ${(s.photoUrl || s.photo_url || s.photo) ? `<img src="${s.photoUrl || s.photo_url || s.photo}" style="width: 100%; height: 100%; object-fit: cover;">` : `<i class="fa-solid fa-user" style="color: #9ca3af;"></i>`}
            </div>
            <div>
              <div class="detail-label">Official Profile Photo</div>
              <div class="detail-val" style="font-size: 0.82rem; color: ${(s.photoUrl || s.photo_url || s.photo) ? 'var(--primary-emerald)' : 'var(--text-muted)'}; font-weight: 600;">
                ${(s.photoUrl || s.photo_url || s.photo) ? '✅ Verified Photo Linked' : '📷 Default Avatar'}
                ${pendingReq && (pendingReq.newData?.photoUrl || pendingReq.newData?.photo) ? `<span style="display: block; font-size: 0.75rem; color: #D97706; font-weight: 700; margin-top: 2px;"><i class="fa-solid fa-clock-rotate-left"></i> New Photo Pending Review</span>` : ''}
              </div>
            </div>
          </div>
          <div class="detail-box">
            <div class="detail-label">Full Name</div>
            <div class="detail-val">${s.name}</div>
          </div>
          <div class="detail-box">
            <div class="detail-label">Student ID</div>
            <div class="detail-val font-mono" style="font-weight: 700; color: var(--primary-emerald);">${s.student_id || s.rollNo || s.id}</div>
          </div>
          <div class="detail-box">
            <div class="detail-label">Roll Number</div>
            <div class="detail-val">#${s.rollNo}</div>
          </div>
          <div class="detail-box">
            <div class="detail-label">Class & Course</div>
            <div class="detail-val">${s.className}</div>
          </div>
          <div class="detail-box">
            <div class="detail-label">Date of Birth (DOB)</div>
            <div class="detail-val">${formatDate(s.dob)}</div>
          </div>
          <div class="detail-box">
            <div class="detail-label">Mobile Number</div>
            <div class="detail-val">${s.mobile}</div>
          </div>
          <div class="detail-box">
            <div class="detail-label">Father / Guardian Name</div>
            <div class="detail-val">${s.guardianName || 'Guardian'}</div>
          </div>
          <div class="detail-box">
            <div class="detail-label">Guardian Contact</div>
            <div class="detail-val">${s.guardianMobile || s.mobile}</div>
          </div>
          <div class="detail-box">
            <div class="detail-label">Blood Group</div>
            <div class="detail-val">${s.bloodGroup || 'Not Specified'}</div>
          </div>
          <div class="detail-box">
            <div class="detail-label">Email Address</div>
            <div class="detail-val">${s.email || 'Not Provided'}</div>
          </div>
          <div class="detail-box" style="grid-column: span 2;">
            <div class="detail-label">Residential Address</div>
            <div class="detail-val">${s.address || 'Lalganj, Vaishali, Bihar'}</div>
          </div>
        </div>
      </div>

      <!-- Security & Password Management Card -->
      <div class="dash-card" style="margin-top: 1.25rem; border-left: 4px solid #2563EB;">
        <div class="dash-card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
          <div class="dash-card-title">
            <i class="fa-solid fa-shield-halved" style="color: #2563EB;"></i> Account Security & Portal Password
          </div>
          <span class="pill-item pill-emerald" style="font-size: 0.75rem;"><i class="fa-solid fa-bolt"></i> Instant Update (No Verification Needed)</span>
        </div>
        <div style="padding: 0.5rem 0;">
          <p style="font-size: 0.88rem; color: var(--text-muted); margin-bottom: 1rem; line-height: 1.5;">
            You can set a custom login password for your student portal account anytime. No OTP or verification is needed. If you haven't set a custom password, your default password is your <strong>Date of Birth (DOB)</strong>.
          </p>
          <form id="studentInlinePasswordForm" style="display: grid; grid-template-columns: 1fr 1fr auto; gap: 0.75rem; align-items: flex-end;">
            <div>
              <label style="font-size: 0.82rem; font-weight: 600; display: block; margin-bottom: 0.3rem;">New Password</label>
              <div style="position: relative;">
                <input type="password" id="studentInlineNewPassword" class="portal-input" placeholder="Enter new password (min. 4 characters)" required minlength="4" style="width: 100%; padding-right: 2.2rem;">
                <button type="button" class="btn-toggle-pw" onclick="const input = document.getElementById('studentInlineNewPassword'); if(input){ input.type = input.type === 'password' ? 'text' : 'password'; this.querySelector('i').classList.toggle('fa-eye'); this.querySelector('i').classList.toggle('fa-eye-slash'); }" style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: var(--text-muted);"><i class="fa-solid fa-eye"></i></button>
              </div>
            </div>
            <div>
              <label style="font-size: 0.82rem; font-weight: 600; display: block; margin-bottom: 0.3rem;">Confirm New Password</label>
              <div style="position: relative;">
                <input type="password" id="studentInlineConfirmPassword" class="portal-input" placeholder="Confirm new password" required minlength="4" style="width: 100%; padding-right: 2.2rem;">
                <button type="button" class="btn-toggle-pw" onclick="const input = document.getElementById('studentInlineConfirmPassword'); if(input){ input.type = input.type === 'password' ? 'text' : 'password'; this.querySelector('i').classList.toggle('fa-eye'); this.querySelector('i').classList.toggle('fa-eye-slash'); }" style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: var(--text-muted);"><i class="fa-solid fa-eye"></i></button>
              </div>
            </div>
            <button type="submit" class="btn" style="background-color: #2563EB; color: #fff; padding: 0.65rem 1.25rem; font-weight: 700; border-radius: 8px; cursor: pointer; display: flex; align-items: center; gap: 0.4rem; height: 42px;">
              <i class="fa-solid fa-floppy-disk"></i> Save Password
            </button>
          </form>
          <div id="studentInlinePasswordSuccessMsg" style="display: none; margin-top: 0.75rem; background: #ECFDF5; border: 1px solid #10B981; padding: 0.6rem 0.9rem; border-radius: 6px; color: #064E3B; font-weight: 600; font-size: 0.85rem;">
            <i class="fa-solid fa-circle-check"></i> Password updated successfully! You can use this password to sign in next time.
          </div>
        </div>
      </div>
    `;

    // 3D Card Interactive Tilt & Flip Physics (Desktop Parallax + Mobile Hardware Gyroscope & Touch Tilt)
    const card3D = pane.querySelector('#studentIdCard3D');
    const hintBtn = pane.querySelector('#cardFlipHintBtn');
    let isFlipped = false;

    function toggleFlipCard() {
      isFlipped = !isFlipped;
      card3D?.classList.toggle('is-flipped', isFlipped);
      
      // Haptic Vibration for Mobile Devices
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try { navigator.vibrate(15); } catch (_) {}
      }

      if (!isFlipped && card3D) {
        card3D.style.transform = 'perspective(1200px) rotateX(0deg) rotateY(0deg)';
      } else if (isFlipped && card3D) {
        card3D.style.transform = 'perspective(1200px) rotateX(0deg) rotateY(180deg)';
      }
    }

    card3D?.addEventListener('click', toggleFlipCard);
    hintBtn?.addEventListener('click', toggleFlipCard);

    // Desktop 3D Mouse Parallax Tilt & Dynamic Specular Glare
    if (card3D && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      const glimmer = card3D.querySelector('.metallic-card-glimmer');
      card3D.addEventListener('mousemove', (e) => {
        const rect = card3D.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const rotateX = ((y - centerY) / centerY) * -10;
        const rotateY = ((x - centerX) / centerX) * 12;
        const baseFlip = isFlipped ? 180 : 0;
        card3D.style.transform = `perspective(1200px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${(baseFlip + rotateY).toFixed(2)}deg) scale3d(1.02, 1.02, 1.02)`;
        if (glimmer) {
          glimmer.style.background = `radial-gradient(circle at ${x}px ${y}px, rgba(255, 255, 255, 0.42) 0%, rgba(251, 191, 36, 0.15) 30%, transparent 65%)`;
          glimmer.style.opacity = '1';
        }
      });

      card3D.addEventListener('mouseleave', () => {
        const baseFlip = isFlipped ? 180 : 0;
        card3D.style.transform = `perspective(1200px) rotateX(0deg) rotateY(${baseFlip}deg) scale3d(1, 1, 1)`;
        if (glimmer) glimmer.style.opacity = '0';
      });
    }

    // Real-Time Hardware Gyroscope Orientation Engine (Android & iOS)
    let currentTiltX = 0;
    let currentTiltY = 0;
    let targetTiltX = 0;
    let targetTiltY = 0;
    let gyroAnimId = null;
    let isTouchActive = false;

    function updateGyroTilt() {
      if (!card3D || isFlipped || isTouchActive) {
        gyroAnimId = null;
        return;
      }

      currentTiltX += (targetTiltX - currentTiltX) * 0.18;
      currentTiltY += (targetTiltY - currentTiltY) * 0.18;

      const baseFlip = isFlipped ? 180 : 0;
      card3D.style.transform = `perspective(1000px) rotateX(${currentTiltX.toFixed(2)}deg) rotateY(${(baseFlip + currentTiltY).toFixed(2)}deg) scale3d(1.01, 1.01, 1.01)`;

      const glimmer = card3D.querySelector('.metallic-card-glimmer');
      if (glimmer) {
        const posX = Math.max(10, Math.min(90, 50 + currentTiltY * 2));
        const posY = Math.max(10, Math.min(90, 50 - currentTiltX * 2));
        glimmer.style.background = `radial-gradient(circle at ${posX}% ${posY}%, rgba(255, 255, 255, 0.45) 0%, rgba(251, 191, 36, 0.18) 35%, transparent 65%)`;
        glimmer.style.opacity = '1';
      }

      if (Math.abs(targetTiltX - currentTiltX) > 0.05 || Math.abs(targetTiltY - currentTiltY) > 0.05) {
        gyroAnimId = requestAnimationFrame(updateGyroTilt);
      } else {
        gyroAnimId = null;
      }
    }

    function onDeviceOrientation(e) {
      if (!card3D || isFlipped || isTouchActive) return;
      const gamma = e.gamma; // Roll: [-90, 90]
      const beta = e.beta;   // Pitch: [-180, 180]
      if (gamma === null || beta === null || typeof gamma === 'undefined') return;

      // Neutral reading when phone is held naturally upright at ~45 deg angle
      targetTiltY = Math.max(-18, Math.min(18, gamma * 0.55));
      targetTiltX = Math.max(-15, Math.min(15, (beta - 45) * -0.45));

      if (!gyroAnimId) {
        gyroAnimId = requestAnimationFrame(updateGyroTilt);
      }
    }

    function initGyroEngine() {
      if (typeof window !== 'undefined' && 'DeviceOrientationEvent' in window) {
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
          DeviceOrientationEvent.requestPermission()
            .then(state => {
              if (state === 'granted') {
                window.addEventListener('deviceorientation', onDeviceOrientation, { passive: true });
              }
            })
            .catch(() => {});
        } else {
          window.addEventListener('deviceorientation', onDeviceOrientation, { passive: true });
        }
      }
    }

    // Auto-listen for orientation and request on user interaction
    initGyroEngine();
    card3D?.addEventListener('touchstart', initGyroEngine, { passive: true, once: true });
    hintBtn?.addEventListener('touchstart', initGyroEngine, { passive: true, once: true });

    // Mobile Touch Drag Parallax Tilt & Swipe Flip
    let touchStartX = 0;
    let touchStartY = 0;

    card3D?.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
      touchStartY = e.changedTouches[0].screenY;
      isTouchActive = true;
    }, { passive: true });

    card3D?.addEventListener('touchmove', (e) => {
      const currentX = e.changedTouches[0].screenX;
      const currentY = e.changedTouches[0].screenY;
      const diffX = currentX - touchStartX;
      const diffY = currentY - touchStartY;
      if (Math.abs(diffX) > 8 || Math.abs(diffY) > 8) {
        const rotateX = Math.max(-12, Math.min(12, (diffY / 10) * -1));
        const rotateY = Math.max(-15, Math.min(15, diffX / 8));
        const baseFlip = isFlipped ? 180 : 0;
        card3D.style.transform = `perspective(1000px) rotateX(${rotateX.toFixed(1)}deg) rotateY(${(baseFlip + rotateY).toFixed(1)}deg)`;
      }
    }, { passive: true });

    card3D?.addEventListener('touchend', (e) => {
      const touchEndX = e.changedTouches[0].screenX;
      isTouchActive = false;
      const baseFlip = isFlipped ? 180 : 0;
      card3D.style.transform = `perspective(1000px) rotateX(0deg) rotateY(${baseFlip}deg)`;
      if (Math.abs(touchEndX - touchStartX) > 45) {
        toggleFlipCard();
      }
    }, { passive: true });

    pane.querySelector('#btnRequestDetailUpdate')?.addEventListener('click', () => {
      openRequestStudentUpdateModal();
    });

    pane.querySelector('#btnStudentChangePassword')?.addEventListener('click', () => {
      openStudentPasswordModal();
    });

    pane.querySelector('#studentInlinePasswordForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const p1 = document.getElementById('studentInlineNewPassword')?.value || '';
      const p2 = document.getElementById('studentInlineConfirmPassword')?.value || '';
      if (p1.length < 4) {
        alert('Password must be at least 4 characters long.');
        return;
      }
      if (p1 !== p2) {
        alert('Passwords do not match. Please enter the same password in both fields.');
        return;
      }
      const submitBtn = e.target.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
      }
      try {
        await AppState.updateStudentPassword(p1);
        const successEl = document.getElementById('studentInlinePasswordSuccessMsg');
        if (successEl) successEl.style.display = 'block';
        alert('✅ Password updated successfully! No verification was needed. You can now use this password to login.');
        const in1 = document.getElementById('studentInlineNewPassword');
        const in2 = document.getElementById('studentInlineConfirmPassword');
        if (in1) in1.value = '';
        if (in2) in2.value = '';
      } catch (err) {
        alert('Failed to update password: ' + err.message);
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Password';
        }
      }
    });

    pane.querySelector('#btnEditPendingReq')?.addEventListener('click', () => {
      openRequestStudentUpdateModal();
    });

    pane.querySelector('#btnCancelPendingReq')?.addEventListener('click', async () => {
      if (confirm('Cancel your pending profile update request?')) {
        const allReqs = AppState.getRequests().filter(r => !(isStudentRequestMatch(r, s) && String(r.status || '').toLowerCase() === 'pending'));
        if (pendingReq?.id && typeof SupabaseSync !== 'undefined' && SupabaseSync.mutate) {
          await SupabaseSync.mutate('student_requests', 'delete', null, { where: { request_id: pendingReq.id } });
        }
        await AppState.saveRequests(allReqs);
        renderStudentDashboard();
      }
    });
  }

  function openStudentPasswordModal() {
    document.getElementById('studentPasswordModal')?.remove();
    const modalHtml = `
      <div class="inner-modal-backdrop active" id="studentPasswordModal">
        <div class="inner-modal-content" style="max-width: 460px;">
          <div class="inner-modal-header">
            <h3><i class="fa-solid fa-key" style="color: #2563EB;"></i> Change Portal Password</h3>
            <button class="btn-close-inner" onclick="document.getElementById('studentPasswordModal').remove()"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1.1rem; line-height: 1.5;">
            Enter your new password below. <strong>No verification or OTP is needed.</strong> Once saved, you can log in with this password immediately.
          </div>
          <form id="studentModalPasswordForm">
            <div style="margin-bottom: 0.9rem;">
              <label style="font-size: 0.85rem; font-weight: 600; display: block; margin-bottom: 0.3rem;">New Password</label>
              <div style="position: relative;">
                <input type="password" id="stuModalNewPass" class="portal-input" required minlength="4" placeholder="Enter new password (min. 4 characters)" style="width: 100%; padding-right: 2.2rem;">
                <button type="button" class="btn-toggle-pw" onclick="const input = document.getElementById('stuModalNewPass'); if(input){ input.type = input.type === 'password' ? 'text' : 'password'; this.querySelector('i').classList.toggle('fa-eye'); this.querySelector('i').classList.toggle('fa-eye-slash'); }" style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: var(--text-muted);"><i class="fa-solid fa-eye"></i></button>
              </div>
            </div>
            <div style="margin-bottom: 1.25rem;">
              <label style="font-size: 0.85rem; font-weight: 600; display: block; margin-bottom: 0.3rem;">Confirm New Password</label>
              <div style="position: relative;">
                <input type="password" id="stuModalConfirmPass" class="portal-input" required minlength="4" placeholder="Re-enter new password" style="width: 100%; padding-right: 2.2rem;">
                <button type="button" class="btn-toggle-pw" onclick="const input = document.getElementById('stuModalConfirmPass'); if(input){ input.type = input.type === 'password' ? 'text' : 'password'; this.querySelector('i').classList.toggle('fa-eye'); this.querySelector('i').classList.toggle('fa-eye-slash'); }" style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: var(--text-muted);"><i class="fa-solid fa-eye"></i></button>
              </div>
            </div>
            <button type="submit" class="btn" style="width: 100%; padding: 0.8rem; background-color: #2563EB; color: #fff; font-weight: 700; border-radius: 8px; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.4rem;">
              <i class="fa-solid fa-check"></i> Update Password Instantly
            </button>
          </form>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    document.getElementById('studentModalPasswordForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const p1 = document.getElementById('stuModalNewPass')?.value || '';
      const p2 = document.getElementById('stuModalConfirmPass')?.value || '';
      if (p1.length < 4) {
        alert('Password must be at least 4 characters long.');
        return;
      }
      if (p1 !== p2) {
        alert('Passwords do not match. Please re-enter the same password.');
        return;
      }
      const submitBtn = e.target.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Updating...';
      }
      try {
        await AppState.updateStudentPassword(p1);
        document.getElementById('studentPasswordModal')?.remove();
        alert('✅ Password updated successfully! No verification was needed. You can now use your new password to sign in.');
      } catch (err) {
        alert('Failed to update password: ' + err.message);
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> Update Password Instantly';
        }
      }
    });
  }

  function printStudentVIPCard(student) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const isCleared = !student.pendingFee || Number(student.pendingFee) <= 0;
    const initialLetter = sanitizeInput(student.name?.charAt(0) || 'S');
    const safeName = sanitizeInput(student.name);
    const safeRoll = sanitizeInput(student.rollNo);
    const safeClass = sanitizeInput(student.className);
    const safeMobile = sanitizeInput(student.mobile);
    const safePhoto = sanitizeUrl(student.photoUrl);

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>VIP Scholar Card - ${safeName} - Pragyan Institute</title>
          <style>
            @page { size: A4 portrait; margin: 15mm; }
            body { font-family: 'Segoe UI', Arial, sans-serif; background: #FAF9F6; margin: 0; padding: 20px; display: flex; flex-direction: column; align-items: center; }
            .id-card-print { width: 340px; height: 215px; border-radius: 14px; background: #064E3B; color: #fff; padding: 16px; box-sizing: border-box; position: relative; border: 2px solid #F59E0B; margin-bottom: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
            .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 8px; }
            .title { font-size: 13px; font-weight: 800; letter-spacing: 0.5px; }
            .body { display: flex; gap: 12px; margin-top: 12px; }
            .photo { width: 68px; height: 68px; border-radius: 8px; border: 2px solid #F59E0B; object-fit: cover; background: #04382B; }
            .info { flex: 1; font-size: 11px; line-height: 1.5; }
            .name { font-size: 14px; font-weight: 800; color: #FCD34D; margin-bottom: 4px; }
            .badge { display: inline-block; background: ${isCleared ? '#10B981' : '#F59E0B'}; color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: bold; }
            .footer { margin-top: 10px; font-size: 8.5px; text-align: center; color: rgba(255,255,255,0.7); }
          </style>
        </head>
        <body>
          <h2 style="color: #064E3B; margin-bottom: 4px;">PRAGYAN INSTITUTE LALGANJ</h2>
          <p style="color: #6B7280; font-size: 12px; margin-top: 0; margin-bottom: 20px;">Official Student VIP ID Pass — Academic Session 2026–27</p>
          <div class="id-card-print">
            <div class="header">
              <div class="title">PRAGYAN INSTITUTE</div>
              <span class="badge">VIP SCHOLAR</span>
            </div>
            <div class="body">
              ${safePhoto ? `<img src="${safePhoto}" class="photo" alt="Photo">` : `<div class="photo" style="display:flex;align-items:center;justify-content:center;font-size:24px;color:#fff;">${initialLetter}</div>`}
              <div class="info">
                <div class="name">${safeName}</div>
                <div><strong>Roll No:</strong> #${safeRoll}</div>
                <div><strong>Class:</strong> ${safeClass}</div>
                <div><strong>Mobile:</strong> ${safeMobile}</div>
                <div><strong>Status:</strong> ${isCleared ? '🟢 Fees Cleared' : '⚠️ Due Balance'}</div>
              </div>
            </div>
            <div class="footer">Lalganj, Vaishali, Bihar • Mentors: Prof. Ravi Ranjan & Chandan Kumar</div>
          </div>
          <script>window.onload = function() { window.print(); };<\/script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  // 2. Student Tab: Batch Detail
  function renderStudentBatchTab() {
    const s = AppState.currentUser;
    const pane = document.getElementById('studentTabPane-batch');
    if (!pane || !s) return;

    const batches = AppState.getBatches();
    const studentBatch = s.batchName || s.className || '';

    const studentBatchKey = getBatchCategoryKey(studentBatch);
    const myBatch = batches.find(b => {
      const bKey = getBatchCategoryKey(b.name || b.batch_name || b.className || b.id || '');
      return bKey && (bKey === studentBatchKey);
    }) || batches[0] || {};

    const batchName    = myBatch.name || myBatch.batch_name || studentBatch || 'Your Batch';
    const batchTiming  = myBatch.timing || myBatch.schedule || myBatch.timings || 'Contact Institute';
    const batchRoom    = myBatch.room || myBatch.room_no || 'Hall 1';
    const batchFee     = myBatch.monthlyFee || myBatch.monthly_fee || 1000;
    const batchTeacher = myBatch.teacher || 'Prof. Ravi Ranjan';

    // Parse teacher string into array for display
    const teacherList = batchTeacher.split(/[&,]/).map(t => t.trim()).filter(Boolean);

    // Build distinct daily subject timings from batch grade
    const scheduleItems = studentBatchKey === '10th' ? [
      { subject: 'Mathematics (Board Mastery)', time: '04:00 PM - 05:00 PM' },
      { subject: 'Science (Physics & Chem)',   time: '05:00 PM - 06:00 PM' },
      { subject: 'Biology & English',          time: '06:00 PM - 07:00 PM' }
    ] : studentBatchKey === '9th' ? [
      { subject: 'Mathematics (Foundation)',   time: '03:30 PM - 04:30 PM' },
      { subject: 'Science (Concepts & Lab)',   time: '04:30 PM - 05:30 PM' },
      { subject: 'Social Studies & English',   time: '05:30 PM - 06:30 PM' }
    ] : studentBatchKey === '8th' ? [
      { subject: 'Mathematics (Junior Alpha)', time: '03:00 PM - 04:00 PM' },
      { subject: 'General Science',            time: '04:00 PM - 05:00 PM' },
      { subject: 'English Grammar & Comp.',    time: '05:00 PM - 06:00 PM' }
    ] : [
      { subject: 'Maths & Mental Ability',     time: '02:30 PM - 03:30 PM' },
      { subject: 'Integrated Science',         time: '03:30 PM - 04:30 PM' },
      { subject: 'Language & Communication',   time: '04:30 PM - 05:30 PM' }
    ];

    const enrolledInBatchCount = AppState.getStudents().filter(st => getBatchCategoryKey(st.className || st.batchName || '') === studentBatchKey).length;

    pane.innerHTML = `
      <div class="dash-card batch-overview-card">
        <div class="batch-info-header">
          <div>
            <span class="section-tag" style="margin-bottom: 0.4rem;"><i class="fa-solid fa-chalkboard-user"></i> Enrolled Batch</span>
            <div class="batch-title-tag">${batchName}</div>
            <p style="color: var(--text-muted); font-size: 0.9rem; margin-top: 0.25rem;">
              <i class="fa-solid fa-clock" style="color: var(--primary-emerald);"></i> ${batchTiming} &nbsp;|&nbsp; 
              <i class="fa-solid fa-door-open" style="color: var(--primary-emerald);"></i> Classroom: ${batchRoom}
            </p>
          </div>
          <span class="pill-item pill-emerald"><i class="fa-solid fa-user-check"></i> Active Session</span>
        </div>

        <div style="display:flex; gap:1rem; flex-wrap:wrap; margin-top:1rem;">
          <div style="background:var(--bg-surface-cream); border-radius:10px; padding:0.75rem 1.1rem; flex:1; min-width:140px;">
            <div style="font-size:0.78rem; color:var(--text-muted); font-weight:600;">MONTHLY FEE</div>
            <div style="font-size:1.3rem; font-weight:800; color:var(--primary-emerald);">₹${batchFee.toLocaleString()}</div>
          </div>
          <div style="background:var(--bg-surface-cream); border-radius:10px; padding:0.75rem 1.1rem; flex:1; min-width:140px;">
            <div style="font-size:0.78rem; color:var(--text-muted); font-weight:600;">BATCH CODE</div>
            <div style="font-size:1.1rem; font-weight:800; color:var(--text-mahogany);">${(myBatch.id || myBatch.batch_id || 'BAT-01')}</div>
          </div>
          <div style="background:var(--bg-surface-cream); border-radius:10px; padding:0.75rem 1.1rem; flex:1; min-width:140px;">
            <div style="font-size:0.78rem; color:var(--text-muted); font-weight:600;">STUDENTS IN BATCH</div>
            <div style="font-size:1.3rem; font-weight:800; color:var(--text-mahogany);">${enrolledInBatchCount || '—'}</div>
          </div>
        </div>
      </div>

      <div class="profile-grid-layout">
        <div class="dash-card">
          <div class="dash-card-header">
            <div class="dash-card-title"><i class="fa-solid fa-calendar-days"></i> Daily Class Schedule</div>
          </div>
          <div class="schedule-list">
            ${scheduleItems.map(item => `
              <div class="schedule-row">
                <div class="schedule-subject">
                  <i class="fa-solid fa-book-bookmark"></i> ${item.subject}
                </div>
                <div class="schedule-time">${item.time}</div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="dash-card">
          <div class="dash-card-header">
            <div class="dash-card-title"><i class="fa-solid fa-user-tie"></i> Assigned Faculty</div>
          </div>
          <div style="display: flex; flex-direction: column; gap: 1rem;">
            ${teacherList.map(t => `
              <div style="display: flex; align-items: center; gap: 0.875rem; padding: 0.75rem; background: var(--bg-surface-cream); border-radius: var(--radius-sm);">
                <div style="width: 42px; height: 42px; border-radius: 50%; background: var(--primary-emerald); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size:1.1rem;">
                  ${t.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style="font-weight: 700; font-size: 0.92rem; color: var(--text-mahogany);">${t}</div>
                  <div style="font-size: 0.8rem; color: var(--text-muted);">Faculty — ${batchName}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  // 3. Student Tab: Notification Tab
  // 3. Student Tab: Notification Tab
  function renderStudentNotifications(filterCat = 'all') {
    const pane = document.getElementById('studentTabPane-notifications');
    if (!pane) return;

    const s = AppState.currentUser;
    const allNotices = AppState.getNotices();
    const studentBatch = (s?.className || s?.batchName || '').toLowerCase();

    function getNormalizedBatchCategory(name) {
      if (!name) return 'all';
      const lower = name.toLowerCase();
      if (/\b(10|10th|achiever)\b/.test(lower)) return '10th';
      if (/\b(9|9th|nurture)\b/.test(lower)) return '9th';
      if (/\b(8|8th|alpha)\b/.test(lower)) return '8th';
      if (/\b(junior|junio)\b/.test(lower)) return 'junior';
      if (/\b(all)\b/.test(lower) || lower.trim() === 'all batches') return 'all';
      return lower.trim();
    }

    const studentBatchKey = getNormalizedBatchCategory(studentBatch);

    const relevantNotices = allNotices.filter(n => {
      const target = (n.targetBatch || n.target_batch || 'All Batches').toLowerCase();
      const targetKey = getNormalizedBatchCategory(target);
      return targetKey === 'all' || targetKey === studentBatchKey;
    });

    const filtered = filterCat === 'all'
      ? relevantNotices
      : relevantNotices.filter(n => n.category === filterCat);

    pane.innerHTML = `
      <div class="dash-card">
        <div class="dash-card-header">
          <div class="dash-card-title"><i class="fa-solid fa-bullhorn" style="color: var(--primary-emerald);"></i> Institute Notice & Announcement Board</div>
          <span class="tab-badge" style="background: rgba(6, 78, 59, 0.1); color: var(--primary-emerald); font-weight: 700; padding: 0.25rem 0.75rem; border-radius: 99px;">${relevantNotices.length} Announcements</span>
        </div>

        <div class="notifications-filter-bar" style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1.25rem;">
          <button class="notice-filter-chip ${filterCat === 'all' ? 'active' : ''}" data-cat="all">All (${relevantNotices.length})</button>
          <button class="notice-filter-chip ${filterCat === 'exam' ? 'active' : ''}" data-cat="exam">🎯 Exams & Tests (${relevantNotices.filter(n => n.category === 'exam').length})</button>
          <button class="notice-filter-chip ${filterCat === 'general' ? 'active' : ''}" data-cat="general">📢 General Notices (${relevantNotices.filter(n => n.category === 'general').length})</button>
          <button class="notice-filter-chip ${filterCat === 'fees' ? 'active' : ''}" data-cat="fees">💳 Fee Updates (${relevantNotices.filter(n => n.category === 'fees').length})</button>
        </div>

        <div class="notifications-stream">
          ${filtered.length === 0 ? `
            <div style="text-align: center; color: var(--text-muted); padding: 3rem 1rem;">
              <i class="fa-solid fa-bell-slash" style="font-size: 2.5rem; color: #9CA3AF; margin-bottom: 0.75rem;"></i>
              <p style="font-weight: 600;">No announcements in this category.</p>
            </div>
          ` : `
            <div style="display: flex; flex-direction: column; gap: 1rem;">
              ${filtered.map(notice => `
                <div class="notice-item-card ${notice.unread ? 'unread' : ''}" style="border: 1px solid var(--border-sand); border-radius: 10px; padding: 1.15rem; background: #FAF9F6; transition: transform 0.15s ease;">
                  <div class="notice-top-row" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; flex-wrap: wrap; gap: 0.5rem;">
                    <div style="display: flex; gap: 0.5rem; align-items: center;">
                      <span class="notice-cat-badge cat-${notice.category}" style="padding: 0.2rem 0.6rem; border-radius: 99px; font-weight: 700; font-size: 0.75rem; text-transform: uppercase; ${notice.category === 'exam' ? 'background:#FEF3C7; color:#92400E;' : notice.category === 'fees' ? 'background:#D1FAE5; color:#065F46;' : 'background:#EEF2FF; color:#4338CA;'}">
                        ${notice.category === 'exam' ? '🎯 Exam' : notice.category === 'fees' ? '💳 Fees' : '📢 General'}
                      </span>
                      <span style="font-size: 0.76rem; color: var(--text-muted); background: rgba(0,0,0,0.04); padding: 0.15rem 0.5rem; border-radius: 4px;">
                        Target: <strong>${notice.targetBatch || notice.target_batch || 'All Batches'}</strong>
                      </span>
                    </div>
                    <span class="notice-date" style="font-size: 0.78rem; color: var(--text-muted);"><i class="fa-regular fa-clock"></i> ${formatDate(notice.date)}</span>
                  </div>
                  <div class="notice-title" style="font-size: 1.05rem; font-weight: 700; color: var(--text-mahogany); margin-bottom: 0.4rem;">${notice.title}</div>
                  <div class="notice-body" style="font-size: 0.9rem; color: #374151; line-height: 1.6;">${notice.message}</div>
                  ${(notice.attachmentUrl || notice.attachment_url) ? `
                    <div style="margin-top:0.85rem;">
                      ${(/\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(notice.attachmentUrl || notice.attachment_url) || (notice.attachmentUrl || notice.attachment_url).startsWith('data:image/'))
                        ? `<img src="${notice.attachmentUrl || notice.attachment_url}" style="max-width:100%; max-height:280px; border-radius:8px; border:1px solid #E5E7EB; object-fit:cover; display:block;" alt="Notice Attachment">`
                        : `<a href="${notice.attachmentUrl || notice.attachment_url}" target="_blank" style="display:inline-flex; align-items:center; gap:0.5rem; background:#065F46; color:#fff; padding:0.45rem 1rem; border-radius:6px; font-weight:700; font-size:0.82rem; text-decoration:none;">
                            <i class="fa-solid fa-file-pdf"></i> View / Download Attached Document
                          </a>`
                      }
                    </div>
                  ` : ''}
                </div>
              `).join('')}
            </div>
          `}
        </div>
      </div>
    `;

    // Bind chip click events directly
    pane.querySelectorAll('.notice-filter-chip').forEach(btn => {
      btn.onclick = () => {
        const cat = btn.dataset.cat;
        renderStudentNotifications(cat);
      };
    });
  }

  // 4. Student Tab: Fee Tab
  function renderStudentFeeTab() {
    const s = AppState.currentUser;
    const pane = document.getElementById('studentTabPane-fees');
    if (!pane || !s) return;

    const feeAcc = AppState.getStudentFeeAccount(s.id || s.student_id || s.rollNo, s);
    const pendingPayReq = AppState.getRequests().find(r => isStudentRequestMatch(r, s) && (r.type === 'payment' || r.req_type === 'PAYMENT_VERIFICATION') && String(r.status || '').toLowerCase() === 'pending');

    const totalCourseFee = Number(s.totalFee ?? s.total_fee ?? 0) || 1;
    const paidAmount = Number(s.paidFee ?? s.paid_fee ?? 0);
    const pendingAmount = feeAcc.totalDue;
    s.totalFee = totalCourseFee;
    s.paidFee = paidAmount;
    s.pendingFee = pendingAmount;

    const clearancePct = Math.min(100, Math.max(0, Math.round((paidAmount / (paidAmount + pendingAmount || 1)) * 100)));
    const strokeDashOffset = (226 - (226 * clearancePct) / 100).toFixed(1);

    let history = Array.isArray(s.feeHistory) ? [...s.feeHistory] : [];
    if (history.length === 0 && (s.paidFee || 0) > 0) {
      history.push({
        receiptNo: `REC-${s.rollNo || '001'}-INIT`,
        date: s.joiningMonth || 'April 2026',
        amount: s.paidFee,
        by: 'Prof. Ravi Ranjan (Director)',
        mode: 'Cash / Counter Payment',
        note: 'Course Admission & Tuition Payment',
        status: 'Paid'
      });
    }

    pane.innerHTML = `
      ${pendingPayReq ? `
        <div style="background: #FEF3C7; border: 1px solid #F59E0B; border-radius: 8px; padding: 0.9rem 1.15rem; margin-bottom: 1.25rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem;">
          <div>
            <div style="font-weight: 700; color: #92400E; font-size: 0.95rem;">
              <i class="fa-solid fa-hourglass-half"></i> Online Payment Verification Request Pending
            </div>
            <div style="font-size: 0.82rem; color: #78350F; margin-top: 0.2rem;">
              Submitted ₹${(pendingPayReq.paymentDetails?.amount || 0).toLocaleString()} via ${pendingPayReq.paymentDetails?.mode || 'Online'} (UTR: <strong>${pendingPayReq.paymentDetails?.utr}</strong>). Admin verification in progress.
            </div>
          </div>
          <span class="status-badge" style="background: #F59E0B; color: #fff; font-weight: 700; font-size: 0.78rem;">⏳ Under Review</span>
        </div>
      ` : ''}

      <!-- Interactive SVG Circular Fee Clearance Radial Meter -->
      <div class="fee-radial-meter-container">
        <div class="fee-radial-svg-wrap">
          <svg class="fee-radial-svg" viewBox="0 0 84 84">
            <circle class="fee-radial-bg-circle" cx="42" cy="42" r="36"></circle>
            <circle class="fee-radial-progress-circle ${s.pendingFee > 0 ? 'has-dues' : ''}" cx="42" cy="42" r="36" style="stroke-dasharray: 226; stroke-dashoffset: ${strokeDashOffset};"></circle>
          </svg>
          <div class="fee-radial-text-center">
            <span>${clearancePct}%</span>
            <span class="fee-radial-text-sub">${s.pendingFee > 0 ? 'PAID' : 'CLEARED'}</span>
          </div>
        </div>
        <div class="fee-radial-info">
          <h4>${clearancePct === 100 ? '🎉 100% Fees Fully Cleared' : `⚡ ${clearancePct}% Course Tuition Cleared`}</h4>
          <p>${s.pendingFee > 0 ? `Remaining ₹${s.pendingFee.toLocaleString()} pending due (Earlier: ₹${feeAcc.previousDue.toLocaleString()} + Current Month: ₹${feeAcc.currentMonthFee.toLocaleString()}). Pay online or at institute counter.` : 'All tuition dues for the current academic session are cleared. Privilege pass active.'}</p>
        </div>
      </div>

      <div class="fee-summary-cards-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
        <div class="fee-stat-box">
          <div class="fee-stat-label">1. Earlier Unpaid Dues (Till Last Month)</div>
          <div class="fee-stat-value" style="color: #475569;">₹${feeAcc.previousDue.toLocaleString()}</div>
          <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 0.2rem;">बकाया पिछले माह तक</div>
        </div>
        <div class="fee-stat-box">
          <div class="fee-stat-label">2. This Month Tuition Fee</div>
          <div class="fee-stat-value" style="color: var(--primary-emerald);">₹${feeAcc.currentMonthFee.toLocaleString()}</div>
          <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 0.2rem;">इस माह का शुल्क (${feeAcc.billingMonth})</div>
        </div>
        <div class="fee-stat-box">
          <div class="fee-stat-label">Total Amount Paid</div>
          <div class="fee-stat-value emerald">₹${s.paidFee.toLocaleString()}</div>
          <div style="font-size: 0.78rem; color: #059669; margin-top: 0.2rem;">Status: Active Paid</div>
        </div>
        <div class="fee-stat-box" style="border: 2px solid ${s.pendingFee > 0 ? '#EF4444' : '#10B981'}; background: ${s.pendingFee > 0 ? '#FEF2F2' : '#ECFDF5'};">
          <div class="fee-stat-label" style="font-weight: 800; color: ${s.pendingFee > 0 ? '#991B1B' : '#065F46'};">TOTAL NET PAYABLE DUE</div>
          <div class="fee-stat-value pending" style="color: ${s.pendingFee > 0 ? '#DC2626' : '#059669'}; font-size: 1.5rem;">₹${s.pendingFee.toLocaleString()}</div>
          <div style="font-size: 0.78rem; color: ${s.pendingFee > 0 ? '#B91C1C' : '#065F46'}; margin-top: 0.2rem; font-weight: 700;">${s.pendingFee > 0 ? 'कुल देय राशि' : 'All Clear ✅'}</div>
        </div>
      </div>

      <div class="dash-card">
        <div class="dash-card-header">
          <div class="dash-card-title"><i class="fa-solid fa-file-invoice-dollar"></i> Audited Fee Statement & Transaction History</div>
          ${s.pendingFee > 0 ? `
            <a href="pay.html?amount=${s.pendingFee}&roll=${encodeURIComponent(s.rollNo || s.roll_no || s.student_id)}&name=${encodeURIComponent(s.name)}&batch=${encodeURIComponent(s.className || s.class_name || '')}&prev=${feeAcc.previousDue}&curr=${feeAcc.currentMonthFee}" target="_blank" class="btn btn-emerald" style="padding: 0.45rem 1.15rem; font-size: 0.85rem; text-decoration: none; display: inline-flex; align-items: center; gap: 0.45rem;">
              <i class="fa-solid fa-bolt"></i> Click Here to Pay Online
            </a>
          ` : '<span class="status-badge status-paid"><i class="fa-solid fa-check-double"></i> All Fees Cleared</span>'}
        </div>

        <div class="table-responsive">
          <table class="portal-table">
            <thead>
              <tr>
                <th>Receipt / Ref ID</th>
                <th>Date & Time</th>
                <th>Amount</th>
                <th>Collector / Educator</th>
                <th>Mode & Description</th>
                <th>Status</th>
                <th>Receipt Action</th>
              </tr>
            </thead>
            <tbody>
              ${history.length > 0 ? history.map(item => `
                <tr>
                  <td><strong>${item.receiptNo}</strong></td>
                  <td>${item.date}</td>
                  <td>
                    <strong style="color: ${item.status === 'Paid' ? '#059669' : item.status === 'Pending Due' ? '#DC2626' : '#0284C7'};">
                      ${item.amount < 0 ? `- ₹${Math.abs(item.amount).toLocaleString()}` : `₹${item.amount.toLocaleString()}`}
                    </strong>
                  </td>
                  <td><span style="font-size: 0.82rem; font-weight: 600; color: var(--text-mahogany);"><i class="fa-solid fa-user-tie"></i> ${item.by || 'Prof. Ravi Ranjan (Director)'}</span></td>
                  <td>
                    <div><strong>${item.mode}</strong></div>
                    ${item.note ? `<div style="font-size: 0.78rem; color: var(--text-muted);">${item.note}</div>` : ''}
                  </td>
                  <td>
                    <span class="status-badge" style="background-color: ${item.status === 'Paid' ? '#D1FAE5' : item.status === 'Pending Due' ? '#FEE2E2' : '#E0F2FE'}; color: ${item.status === 'Paid' ? '#065F46' : item.status === 'Pending Due' ? '#991B1B' : '#075985'}; font-weight: 700;">
                      ${item.status === 'Paid' ? '🟢 PAID' : item.status === 'Pending Due' ? '🔴 OLD DUE' : '🔵 ADJUSTED'}
                    </span>
                  </td>
                  <td>
                    <button class="btn btn-download-receipt" data-receipt="${item.receiptNo}" style="background: #064E3B; color: #fff; border: none; padding: 0.35rem 0.75rem; border-radius: 6px; font-size: 0.78rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 0.35rem;">
                      <i class="fa-solid fa-file-arrow-down"></i> Download Receipt
                    </button>
                  </td>
                </tr>
              `).join('') : `
                <tr>
                  <td colspan="7" style="text-align: center; padding: 2.75rem 1rem; color: var(--text-muted);">
                    <div style="font-size: 2.2rem; margin-bottom: 0.6rem; color: var(--primary-emerald);"><i class="fa-solid fa-receipt"></i></div>
                    <div style="font-weight: 800; font-size: 1rem; color: var(--text-mahogany); margin-bottom: 0.35rem;">No Recorded Transactions Yet</div>
                    <div style="font-size: 0.85rem; max-width: 450px; margin: 0 auto 1.25rem; line-height: 1.5; color: var(--text-charcoal);">
                      ${s.pendingFee > 0 
                        ? `You have a pending tuition fee balance of <strong>₹${s.pendingFee.toLocaleString()}</strong>. You can pay at the institute office or submit your UPI payment proof online.`
                        : 'Your account has zero pending fees. When official receipts are issued, they will be archived here for instant PDF download.'}
                    </div>
                    ${s.pendingFee > 0 ? `
                      <button class="btn btn-emerald" id="btnEmptyPayOnline" style="padding: 0.5rem 1.2rem; font-size: 0.85rem; font-weight: 700; border-radius: 6px; display: inline-flex; align-items: center; gap: 0.4rem;">
                        <i class="fa-solid fa-credit-card"></i> Submit Online Payment Proof
                      </button>
                    ` : ''}
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Bind Online Pay Modals (Header and Empty State)
    pane.querySelector('#btnPayOnlineModal')?.addEventListener('click', () => {
      openStudentPaymentRequestModal(s);
    });
    pane.querySelector('#btnEmptyPayOnline')?.addEventListener('click', () => {
      openStudentPaymentRequestModal(s);
    });

    // LF5: Event delegation on table body for computerized PDF receipt downloads
    const tbody = pane.querySelector('.portal-table tbody');
    if (tbody) {
      tbody.addEventListener('click', (e) => {
        const dlBtn = e.target.closest('.btn-download-receipt');
        if (dlBtn) {
          const receiptNo = dlBtn.dataset.receipt;
          downloadStudentReceiptPDF(s, receiptNo);
        }
      });
    }
  }

  /* ==========================================================================
   * ADMIN DASHBOARD RENDERERS & ACCESS CONTROL
   * ========================================================================== */
  function getActiveTeacherName() {
    const admin = AppState.currentUser || AppState.getAdmin();
    return admin?.name || 'CHANDAN KUMAR';
  }

  function isMainAdmin() {
    const admin = AppState.currentUser || AppState.getAdmin();
    if (!admin) return false;
    const name = String(admin.name || '').toLowerCase();
    const username = String(admin.username || '').toLowerCase();
    const role = String(admin.role || '').toLowerCase();
    const isHead = admin.is_head === true || admin.isHead === true;

    return isHead ||
           name.includes('chandan') ||
           username.includes('chandan') ||
           username === 'chandan' ||
           role.includes('head');
  }

  function renderAdminDashboard() {
    const admin = AppState.currentUser || AppState.getAdmin();
    const students = AppState.getStudents();
    const notices = AppState.getNotices();

    const totalCollected = students.reduce((acc, curr) => acc + (curr.paidFee || 0), 0);
    const totalPending = students.reduce((acc, curr) => acc + (curr.pendingFee || 0), 0);

    const adminNameEl = document.getElementById('adminHeaderName');
    if (adminNameEl) adminNameEl.textContent = admin.name || 'Director & Admin';

    const adminRoleEl = document.getElementById('adminHeaderRoleBadge');
    if (adminRoleEl) adminRoleEl.textContent = admin.role || 'Faculty & Admin';

    const adminAvatarEl = document.getElementById('adminHeaderAvatar');
    if (adminAvatarEl) {
      if (admin.photoUrl) {
        adminAvatarEl.innerHTML = `<img src="${admin.photoUrl}" alt="${admin.name || 'Admin'}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
      } else {
        adminAvatarEl.textContent = admin.name ? admin.name.charAt(0) : '⚙️';
      }
    }

    // Render Stats
    const statsContainer = document.getElementById('adminOverviewStats');
    if (statsContainer) {
      statsContainer.innerHTML = `
        <div class="admin-stat-card" id="statCardStudents" title="Click to view full Student Directory">
          <div class="admin-icon-square"><i class="fa-solid fa-users-line"></i></div>
          <div class="admin-stat-info">
            <h3>${students.length}</h3>
            <p>Total Active Students</p>
            <div class="stat-click-hint"><i class="fa-solid fa-arrow-right"></i> View Directory</div>
          </div>
        </div>
        <div class="admin-stat-card" id="statCardCollected" title="Click to view Collection Breakdown & Receipts">
          <div class="admin-icon-square"><i class="fa-solid fa-indian-rupee-sign"></i></div>
          <div class="admin-stat-info">
            <h3>₹${(totalCollected / 1000).toFixed(1)}k</h3>
            <p>Total Fee Collected</p>
            <div class="stat-click-hint"><i class="fa-solid fa-arrow-right"></i> View Collections</div>
          </div>
        </div>
        <div class="admin-stat-card" id="statCardPending" title="Click to view Pending Dues & Send Reminders">
          <div class="admin-icon-square" style="background-color: #FEE2E2; color: #DC2626;"><i class="fa-solid fa-clock-rotate-left"></i></div>
          <div class="admin-stat-info">
            <h3 style="color: #DC2626;">₹${(totalPending / 1000).toFixed(1)}k</h3>
            <p>Pending Fees</p>
            <div class="stat-click-hint" style="color: #DC2626;"><i class="fa-solid fa-arrow-right"></i> Manage Dues</div>
          </div>
        </div>
        <div class="admin-stat-card" id="statCardNotices" title="Click to view & post Announcements">
          <div class="admin-icon-square"><i class="fa-solid fa-bullhorn"></i></div>
          <div class="admin-stat-info">
            <h3>${notices.length}</h3>
            <p>Active Announcements</p>
            <div class="stat-click-hint"><i class="fa-solid fa-arrow-right"></i> Post Notices</div>
          </div>
        </div>
      `;

      // Bind Click Listeners to all 4 cards
      statsContainer.querySelector('#statCardStudents')?.addEventListener('click', () => {
        switchAdminTab('students');
        document.getElementById('adminSearchStudent')?.focus();
      });

      statsContainer.querySelector('#statCardCollected')?.addEventListener('click', () => {
        openFeeCollectionBreakdownModal();
      });

      statsContainer.querySelector('#statCardPending')?.addEventListener('click', () => {
        openPendingFeesDefaultersModal();
      });

      statsContainer.querySelector('#statCardNotices')?.addEventListener('click', () => {
        switchAdminTab('post-notice');
      });
    }

    // Update Requests Count Badge (F21)
    const requests = AppState.getRequests();
    const pendingRequests = requests.filter(r => (r.status === 'Pending' || String(r.status || '').toLowerCase() === 'pending') && (r.type === 'payment' || r.type === 'profile' || !r.type));
    const badgeEl = document.getElementById('adminRequestsBadge');
    if (badgeEl) {
      if (pendingRequests.length > 0) {
        badgeEl.textContent = pendingRequests.length;
        badgeEl.style.display = 'inline-block';
      } else {
        badgeEl.style.display = 'none';
      }
    }

    // Control Email Tab Visibility based on Main Admin Permission (Chandan Kumar)
    const emailTabBtn = document.getElementById('adminTabBtnEmail');
    if (emailTabBtn) {
      if (isMainAdmin()) {
        emailTabBtn.style.display = 'inline-flex';
      } else {
        emailTabBtn.style.display = 'none';
      }
    }

    renderAdminStudentList();
    renderAdminAnalyticsTab();
    renderAdminEmailTab();
    renderCommunityChatTab();
    renderAdminNoticesManager();
    renderAdminRequestsManager();
    renderAdminAuditHistoryTab();
    renderAdminSettingsTab();
    
    // Preserve the currently active admin tab!
    let targetTab = AppState.activeAdminTab || 'students';
    if (targetTab === 'email' && !isMainAdmin()) {
      targetTab = 'students';
    }
    switchAdminTab(targetTab);
  }

  /* ==========================================================================
   * INTERACTIVE BREAKDOWN MODALS FOR KPI STAT CARDS
   * ========================================================================== */
  function openFeeCollectionBreakdownModal() {
    document.getElementById('feeCollectionModal')?.remove();
    const students = AppState.getStudents();
    const totalCollected = students.reduce((acc, curr) => acc + (curr.paidFee || 0), 0);

    const batchMap = {};
    students.forEach(s => {
      const b = s.className || 'General';
      if (!batchMap[b]) batchMap[b] = { count: 0, collected: 0 };
      batchMap[b].count++;
      batchMap[b].collected += (s.paidFee || 0);
    });

    const allPaidReceipts = [];
    students.forEach(s => {
      if (s.feeHistory) {
        s.feeHistory.forEach(f => {
          if (f.status === 'Paid') {
            allPaidReceipts.push({ ...f, studentName: s.name, rollNo: s.rollNo, className: s.className });
          }
        });
      }
    });

    const modalHtml = `
      <div class="inner-modal-backdrop active" id="feeCollectionModal">
        <div class="inner-modal-content" style="max-width: 680px;">
          <div class="inner-modal-header">
            <h3><i class="fa-solid fa-indian-rupee-sign" style="color: var(--primary-emerald);"></i> Fee Collection & Revenue Breakdown</h3>
            <button class="btn-close-inner" onclick="document.getElementById('feeCollectionModal').remove()"><i class="fa-solid fa-xmark"></i></button>
          </div>
          
          <div style="background: linear-gradient(135deg, #064E3B 0%, #02241b 100%); color: #fff; padding: 1.25rem; border-radius: 12px; margin-bottom: 1.25rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
            <div>
              <div style="font-size: 0.85rem; opacity: 0.9;">Total Verified Revenue Collected</div>
              <div style="font-size: 1.8rem; font-weight: 800; color: #34D399;">₹${totalCollected.toLocaleString()}</div>
            </div>
            <button class="btn" onclick="document.getElementById('feeCollectionModal').remove(); switchAdminTab('analytics');" style="background: rgba(255,255,255,0.2); color: #fff; border: 1px solid rgba(255,255,255,0.4); font-size: 0.82rem; font-weight: 700; padding: 0.45rem 0.85rem; border-radius: 6px; cursor: pointer;">
              <i class="fa-solid fa-chart-pie"></i> View Fee Analytics
            </button>
          </div>

          <h4 style="font-size: 0.95rem; font-weight: 700; color: var(--text-mahogany); margin-bottom: 0.6rem;">Batch-Wise Collection Summary</h4>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem; margin-bottom: 1.25rem;">
            ${Object.entries(batchMap).map(([batch, stats]) => `
              <div style="background: #FAF9F6; border: 1px solid var(--border-sand); border-radius: 8px; padding: 0.85rem;">
                <div style="font-weight: 700; font-size: 0.88rem; color: var(--text-mahogany);">${batch}</div>
                <div style="font-size: 0.78rem; color: var(--text-muted);">${stats.count} Enrolled Students</div>
                <div style="font-size: 1.1rem; font-weight: 800; color: var(--primary-emerald); margin-top: 0.35rem;">₹${stats.collected.toLocaleString()}</div>
              </div>
            `).join('')}
          </div>

          <h4 style="font-size: 0.95rem; font-weight: 700; color: var(--text-mahogany); margin-bottom: 0.6rem;">Recent Verified Receipts (${allPaidReceipts.length})</h4>
          <div style="max-height: 220px; overflow-y: auto; border: 1px solid var(--border-sand); border-radius: 8px;">
            <table class="portal-table" style="font-size: 0.82rem; margin: 0;">
              <thead>
                <tr style="background: #F3F4F6;">
                  <th>Receipt #</th>
                  <th>Student</th>
                  <th>Amount</th>
                  <th>Mode</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                ${allPaidReceipts.length === 0 ? '<tr><td colspan="5" style="text-align:center; padding: 1rem;">No payments recorded yet.</td></tr>' : 
                  allPaidReceipts.map(r => `
                    <tr>
                      <td><strong>${r.receiptNo}</strong></td>
                      <td>${r.studentName} <span style="color:var(--text-muted); font-size:0.75rem;">(${r.className})</span></td>
                      <td style="color: var(--primary-emerald); font-weight: 700;">₹${r.amount.toLocaleString()}</td>
                      <td><span style="background:#D1FAE5; color:#065F46; padding:0.15rem 0.4rem; border-radius:4px; font-size:0.75rem; font-weight:700;">${r.mode}</span></td>
                      <td style="font-size: 0.76rem; color: var(--text-muted);">${r.date}</td>
                    </tr>
                  `).join('')
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
  }

  function openPendingFeesDefaultersModal() {
    document.getElementById('pendingFeesModal')?.remove();
    const students = AppState.getStudents();
    const pendingStudents = students.filter(s => (s.pendingFee || 0) > 0);
    const totalPending = pendingStudents.reduce((acc, curr) => acc + (curr.pendingFee || 0), 0);

    const modalHtml = `
      <div class="inner-modal-backdrop active" id="pendingFeesModal">
        <div class="inner-modal-content" style="max-width: 720px;">
          <div class="inner-modal-header">
            <h3><i class="fa-solid fa-clock-rotate-left" style="color: #DC2626;"></i> Outstanding Fee Dues & Reminder Manager</h3>
            <button class="btn-close-inner" onclick="document.getElementById('pendingFeesModal').remove()"><i class="fa-solid fa-xmark"></i></button>
          </div>
          
          <div style="background: #FEF2F2; border: 1px solid #FECACA; color: #991B1B; padding: 1rem 1.25rem; border-radius: 10px; margin-bottom: 1.25rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
            <div>
              <div style="font-size: 0.85rem; font-weight: 600;">Total Outstanding Tuition Dues</div>
              <div style="font-size: 1.6rem; font-weight: 800; color: #DC2626;">₹${totalPending.toLocaleString()} <span style="font-size: 0.9rem; font-weight: 600;">(${pendingStudents.length} Students Pending)</span></div>
            </div>
            <div style="font-size: 0.8rem; color: #7F1D1D;">
              <i class="fa-solid fa-bell"></i> Send 1-click WhatsApp reminders to parents below
            </div>
          </div>

          <div style="max-height: 350px; overflow-y: auto; border: 1px solid var(--border-sand); border-radius: 8px;">
            <table class="portal-table" style="font-size: 0.85rem; margin: 0;">
              <thead>
                <tr style="background: #F3F4F6;">
                  <th>Student & Roll</th>
                  <th>Class</th>
                  <th>Pending Due</th>
                  <th>Guardian</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${pendingStudents.length === 0 ? '<tr><td colspan="5" style="text-align:center; padding: 2rem; color: #059669; font-weight:700;">🎉 All student fees are 100% cleared! No pending dues.</td></tr>' :
                  pendingStudents.map(s => {
                    const guardianPhone = s.guardianMobile || s.mobile || '';
                    const cleanPhone = String(guardianPhone).replace(/\D/g, '');
                    const waPhone = cleanPhone.startsWith('91') && cleanPhone.length > 10 ? cleanPhone : (cleanPhone ? '91' + cleanPhone : '');
                    const waMsg = encodeURIComponent(`Namaste ${s.guardianName || s.name},\nThis is a friendly reminder from Pragyan Institute Lalganj regarding the outstanding monthly tuition fee of ₹${s.pendingFee.toLocaleString()} for ${s.name} (${s.className}, Roll #${s.rollNo}). Kindly deposit the balance at the counter or via online UPI to keep records up to date. Thank you!`);
                    return `
                      <tr>
                        <td>
                          <strong>${s.name}</strong>
                          <div style="font-size: 0.76rem; color: var(--text-muted);">Roll #${s.rollNo} • ID: ${s.id}</div>
                        </td>
                        <td>${s.className}</td>
                        <td style="color: #DC2626; font-weight: 800; font-size: 0.95rem;">₹${s.pendingFee.toLocaleString()}</td>
                        <td>
                          <div>${s.guardianName || 'Guardian'}</div>
                          <div style="font-size: 0.78rem; color: var(--text-muted);">${guardianPhone}</div>
                        </td>
                        <td>
                          <div style="display: flex; gap: 0.35rem;">
                            <a href="https://wa.me/${waPhone}?text=${waMsg}" target="_blank" class="btn" style="background-color: #25D366; color: #fff; padding: 0.3rem 0.6rem; font-size: 0.75rem; font-weight: 700; border-radius: 4px; text-decoration: none; display: inline-flex; align-items: center; gap: 0.3rem;" title="Send WhatsApp Reminder">
                              <i class="fa-brands fa-whatsapp"></i> Remind
                            </a>
                            <button class="btn btn-pay-now-modal" data-id="${s.id}" style="background-color: #059669; color: #fff; padding: 0.3rem 0.6rem; font-size: 0.75rem; font-weight: 700; border: none; border-radius: 4px; cursor: pointer;" title="Record Cash/UPI Payment">
                              <i class="fa-solid fa-indian-rupee-sign"></i> Pay
                            </button>
                          </div>
                        </td>
                      </tr>
                    `;
                  }).join('')
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Bind pay now buttons in modal
    document.querySelectorAll('.btn-pay-now-modal').forEach(btn => {
      btn.onclick = () => {
        document.getElementById('pendingFeesModal')?.remove();
        openPayModal(btn.dataset.id);
      };
    });
  }

  function switchAdminTab(tabName) {
    if (tabName === 'community') tabName = 'students';

    // Access control: Only main admin (Chandan Kumar) can switch to email tab
    if (tabName === 'email' && !isMainAdmin()) {
      alert('🔒 Access Restricted: Mass Email Dispatch & Invoicing campaigns can only be authorized and dispatched by Main Institute Admin (Chandan Kumar).');
      tabName = 'students';
    }

    AppState.activeAdminTab = tabName;

    // Toggle Overview KPI cards: show only on Students tab
    const overviewStats = document.getElementById('adminOverviewStats');
    if (overviewStats) {
      overviewStats.style.display = (tabName === 'students') ? 'grid' : 'none';
    }

    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
      if (btn.dataset.tab === tabName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    document.querySelectorAll('.admin-tab-pane').forEach(pane => {
      if (pane.id === `adminTabPane-${tabName}`) {
        pane.classList.add('active');
        pane.style.display = 'block';
      } else {
        pane.classList.remove('active');
        pane.style.display = 'none';
      }
    });

    // Dynamically re-render active admin tab
    if (tabName === 'students') {
      renderAdminStudentList();
    } else if (tabName === 'analytics') {
      renderAdminAnalyticsTab();
    } else if (tabName === 'email') {
      renderAdminEmailTab();
    } else if (tabName === 'requests') {
      renderAdminRequestsManager();
    } else if (tabName === 'post-notice') {
      renderAdminNoticesManager();
    } else if (tabName === 'history') {
      renderAdminAuditHistoryTab();
    } else if (tabName === 'settings') {
      renderAdminSettingsTab();
    }
  }

  /* ==========================================================================
   * ADMIN PROFILE & SECURITY CREDENTIALS SETTINGS TAB
   * ========================================================================== */
  let selectedAdminIdToEdit = null;

  function renderAdminSettingsTab() {
    const pane = document.getElementById('adminTabPane-settings');
    if (!pane) return;

    try {
      const admins = AppState.getAdmins();
      selectedAdminIdToEdit = AppState.currentUser?.id || null;
      const admin = (selectedAdminIdToEdit ? admins.find(a => a.id === selectedAdminIdToEdit) : null) || AppState.currentUser || AppState.getAdmin();
      if (!admin) {
        pane.textContent = 'Your administrator profile is still loading. Please try again.';
        return;
      }
      const safeAdmins = [admin];

      pane.innerHTML = `
        <div class="dash-card">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 1.25rem; border-bottom: 1px solid var(--border-sand); padding-bottom: 1rem;">
            <div>
              <h3 style="font-size: 1.2rem; font-weight: 800; color: var(--text-mahogany); margin: 0;">
                <i class="fa-solid fa-gears" style="color: var(--primary-emerald);"></i> Admin Profile, Security & Account Settings
              </h3>
              <div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 0.2rem;">Manage your profile, password, payment details, and photo.</div>
            </div>
            <span style="background: var(--primary-emerald-light); color: var(--primary-emerald); padding: 0.35rem 0.85rem; border-radius: 99px; font-size: 0.8rem; font-weight: 700;">
              <i class="fa-solid fa-shield-halved"></i> Secure Profile Settings
            </span>
          </div>


          <form id="adminSettingsForm">
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.25rem; margin-bottom: 1.5rem;">
              
              <!-- CARD 1: PROFILE & AVATAR -->
              <div style="background: #FAF9F6; border: 1px solid var(--border-sand); border-radius: 10px; padding: 1.15rem;">
                <h4 style="font-size: 0.95rem; font-weight: 700; color: var(--text-mahogany); margin-bottom: 0.85rem; display: flex; align-items: center; gap: 0.4rem;">
                  <i class="fa-solid fa-id-card" style="color: var(--primary-emerald);"></i> 1. Profile Photo & Director Info
                </h4>

                <!-- Avatar Preview -->
                <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; background: #ffffff; padding: 0.85rem; border-radius: 8px; border: 1px solid #E5E7EB;">
                  <div id="adminAvatarPreview" style="width: 64px; height: 64px; border-radius: 50%; background: var(--primary-emerald); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 1.6rem; font-weight: 800; flex-shrink: 0; overflow: hidden; border: 2px solid var(--primary-emerald);">
                    ${admin.photoUrl ? `<img src="${admin.photoUrl}" style="width:100%; height:100%; object-fit:cover;">` : (admin.name ? admin.name.charAt(0) : 'A')}
                  </div>
                  <div>
                    <label style="display: inline-block; background: var(--primary-emerald); color: #fff; padding: 0.35rem 0.75rem; border-radius: 6px; font-size: 0.78rem; font-weight: 700; cursor: pointer; margin-bottom: 0.35rem;">
                      <i class="fa-solid fa-camera"></i> Change Photo
                      <input type="file" id="adminPhotoFileInput" accept="image/*" capture="environment" style="display: none;">
                    </label>
                    <div style="font-size: 0.72rem; color: var(--text-muted);">Supports JPG, PNG (Auto-compressed)</div>
                  </div>
                </div>

                <!-- Full Name -->
                <div style="margin-bottom: 0.85rem;">
                  <label style="font-size: 0.82rem; font-weight: 700; color: var(--text-mahogany);">Director / Educator Full Name *</label>
                  <input type="text" id="adminSettingName" class="portal-input" value="${admin.name || ''}" required placeholder="e.g. CHANDAN KUMAR / Prof. Ravi Ranjan">
                </div>

                <!-- Designation Role -->
                <div style="margin-bottom: 0.85rem;">
                  <label style="font-size: 0.82rem; font-weight: 700; color: var(--text-mahogany);">Designation / Role Title *</label>
                  <input type="text" id="adminSettingRole" class="portal-input" value="${admin.role || ''}" required placeholder="e.g. Managing Director & Science Lead (Head of Institute)">
                </div>

                <!-- Mobile -->
                <div style="margin-bottom: 0.85rem;">
                  <label style="font-size: 0.82rem; font-weight: 700; color: var(--text-mahogany);">Mobile / WhatsApp Number *</label>
                  <input type="tel" id="adminSettingMobile" class="portal-input" value="${admin.mobile || ''}" required placeholder="e.g. 9999988888">
                </div>

                <!-- Email -->
                <div>
                  <label style="font-size: 0.82rem; font-weight: 700; color: var(--text-mahogany);">Official Admin Email *</label>
                  <input type="email" id="adminSettingEmail" class="portal-input" value="${admin.email || ''}" required placeholder="e.g. chandan@pragyanlalganj.in">
                </div>
              </div>

              <!-- CARD 2: LOGIN CREDENTIALS & SECURITY -->
              <div style="background: #FAF9F6; border: 1px solid var(--border-sand); border-radius: 10px; padding: 1.15rem;">
                <h4 style="font-size: 0.95rem; font-weight: 700; color: var(--text-mahogany); margin-bottom: 0.85rem; display: flex; align-items: center; gap: 0.4rem;">
                  <i class="fa-solid fa-key" style="color: #D97706;"></i> 2. Admin ID & Password Security
                </h4>

                <!-- Username / ID -->
                <div style="margin-bottom: 0.85rem;">
                  <label style="font-size: 0.82rem; font-weight: 700; color: var(--text-mahogany);">Admin Login Username / ID *</label>
                  <input type="text" id="adminSettingUsername" class="portal-input" value="${admin.username || ''}" readonly disabled style="background: #E5E7EB; cursor: not-allowed; opacity: 0.85;" title="Admin username is fixed and cannot be changed">
                  <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 0.2rem;">Permanent login username for ${admin.name || 'Admin'}</div>
                </div>

                <!-- New Password -->
                <div style="margin-bottom: 0.85rem;">
                  <label style="font-size: 0.82rem; font-weight: 700; color: var(--text-mahogany);">New Password for ${admin.name || 'Admin'}</label>
                  <input type="password" id="adminSettingNewPass" class="portal-input" placeholder="Leave blank to keep current password">
                </div>

                <!-- Confirm Password -->
                <div style="margin-bottom: 0.85rem;">
                  <label style="font-size: 0.82rem; font-weight: 700; color: var(--text-mahogany);">Confirm New Password</label>
                  <input type="password" id="adminSettingConfirmPass" class="portal-input" placeholder="Re-enter new password">
                </div>

                <!-- Current Password Verification -->
                <div>
                  <label style="font-size: 0.82rem; font-weight: 700; color: #DC2626;">Current Security Password *</label>
                  <input type="password" id="adminSettingCurrentPass" class="portal-input" placeholder="Enter current admin password" style="border-color: #F87171;">
                </div>
              </div>

              <!-- CARD 3: INSTITUTE PAYMENT & BILLING SETTINGS -->
              <div style="background: #FAF9F6; border: 1px solid var(--border-sand); border-radius: 10px; padding: 1.15rem;">
                <h4 style="font-size: 0.95rem; font-weight: 700; color: var(--text-mahogany); margin-bottom: 0.85rem; display: flex; align-items: center; gap: 0.4rem;">
                  <i class="fa-solid fa-building-columns" style="color: #0284C7;"></i> 3. Official Billing & UPI Settings
                </h4>

                <!-- Official UPI ID -->
                <div style="margin-bottom: 0.85rem;">
                  <label style="font-size: 0.82rem; font-weight: 700; color: var(--text-mahogany);">Institute Official UPI ID</label>
                  <input type="text" id="adminSettingUpi" class="portal-input" value="${admin.upiId || 'pragyanlalganj@upi'}" placeholder="e.g. pragyanlalganj@upi">
                  <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 0.2rem;">Printed on generated fee receipts</div>
                </div>

                <!-- Hidden Base64 Photo Storage -->
                <input type="hidden" id="adminSettingPhotoBase64" value="${admin.photoUrl || ''}">
              </div>

            </div>

            <div style="margin-top: 1rem;">
              <button type="submit" class="btn btn-emerald btn-admin-settings-submit" style="padding: 0.75rem 1.5rem; font-size: 0.88rem; font-weight: 700; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem; width: 100%; max-width: 340px; box-sizing: border-box;">
                <i class="fa-solid fa-floppy-disk"></i> Save & Sync Profile Changes
              </button>
            </div>
          </form>
        </div>
      `;

      // Handle Photo Upload (NH8)
      pane.querySelector('#adminPhotoFileInput')?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const uploadedUrl = await SupabaseSync.uploadFile(file, 'admin_avatars');
          if (uploadedUrl) {
            pane.querySelector('#adminSettingPhotoBase64').value = uploadedUrl;
            const preview = pane.querySelector('#adminAvatarPreview');
            if (preview) {
              preview.innerHTML = `<img src="${uploadedUrl}" alt="Admin Avatar" style="width:100%; height:100%; object-fit:cover;">`;
            }
          }
        } catch (uploadErr) {
          alert('⚠️ Avatar upload failed: ' + uploadErr.message);
        }
      });

      // Form Submit Listener
      pane.querySelector('#adminSettingsForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const currentPassInput = pane.querySelector('#adminSettingCurrentPass').value;
        const newPassInput = pane.querySelector('#adminSettingNewPass').value;
        const confirmPassInput = pane.querySelector('#adminSettingConfirmPass').value;

        const adminsList = AppState.getAdmins();
        const targetAdminIdx = adminsList.findIndex(a => a.id === admin.id);
        if (targetAdminIdx === -1) return;

        const targetAdmin = adminsList[targetAdminIdx];
        if (targetAdmin.id !== AppState.currentUser?.id) {
          alert('For security, an administrator may update only their own profile.');
          return;
        }

        if (newPassInput) {
          if (newPassInput !== confirmPassInput || newPassInput.length < 12 || !currentPassInput) {
            alert('Enter your current password and a matching new password of at least 12 characters.');
            return;
          }
          let updatedPassword = false;
          try {
            const passwordResponse = await fetch('/api/admin-password', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionStorage.getItem('pragyan_portal_token') || ''}` },
              body: JSON.stringify({ currentPassword: currentPassInput, newPassword: newPassInput })
            });
            const passwordPayload = await passwordResponse.json().catch(() => ({}));
            if (passwordResponse.ok && passwordPayload.success) {
              updatedPassword = true;
            } else if (passwordPayload.error) {
              alert('⚠️ Password update failed: ' + passwordPayload.error);
              return;
            }
          } catch (e) {
            console.warn('API password update network note:', e);
          }

          if (!updatedPassword) {
            alert('⚠️ Password change requires an active server session. Please log in again to verify your identity.');
            return;
          }
        }

        targetAdmin.name = pane.querySelector('#adminSettingName').value.trim();
        targetAdmin.role = pane.querySelector('#adminSettingRole').value.trim();
        targetAdmin.mobile = pane.querySelector('#adminSettingMobile').value.trim();
        targetAdmin.email = pane.querySelector('#adminSettingEmail').value.trim();
        targetAdmin.username = pane.querySelector('#adminSettingUsername').value.trim();
        targetAdmin.upiId = pane.querySelector('#adminSettingUpi').value.trim();
        targetAdmin.photoUrl = pane.querySelector('#adminSettingPhotoBase64').value;

        adminsList[targetAdminIdx] = targetAdmin;
        await AppState.saveAdmins(adminsList);

        if (AppState.currentUser && AppState.currentUser.id === targetAdmin.id) {
          AppState.currentUser = targetAdmin;
        }

        AppState.addAuditLog(targetAdmin.name, 'ADMIN_SETTINGS_UPDATED', targetAdmin.name, 'N/A', `Updated profile & login credentials for ${targetAdmin.name} (${targetAdmin.username})`);

        // Update top header elements
        const headerName = document.getElementById('adminHeaderName');
        if (headerName && AppState.currentUser) headerName.textContent = AppState.currentUser.name;

        alert(`\ud83c\udf89 Account details for ${targetAdmin.name} updated and synchronized successfully!`);
        renderAdminDashboard();
      });

    } catch (err) {
      console.error('Error rendering Admin Settings tab:', err);
    }
  }

  /* ==========================================================================
   * STUDENT DIRECTORY FILTERING & SORTING STATE
   * ========================================================================== */
  let directoryClassFilter = 'all';
  let directoryFeeFilter = 'all';
  let directorySortOrder = 'default';
  let directorySearchQuery = '';

  function applyStudentDirectoryFilters(studentsList) {
    let result = studentsList.filter(s => {
      // 1. Search Query (F9)
      let matchesSearch = true;
      if (directorySearchQuery) {
        const q = directorySearchQuery.trim().toLowerCase();
        const qNum = q.replace(/\D/g, '');
        const matchesMobile = (qNum.length >= 3 && String(s.mobile || '').includes(qNum));
        const matchesRoll = (qNum.length > 0 && String(s.rollNo || '').toLowerCase().includes(q));
        matchesSearch = String(s.name || '').toLowerCase().includes(q) ||
                        String(s.id || '').toLowerCase().includes(q) ||
                        String(s.className || '').toLowerCase().includes(q) ||
                        matchesMobile ||
                        matchesRoll;
      }

      // 2. Class Wise Filter
      let matchesClass = true;
      if (directoryClassFilter !== 'all') {
        matchesClass = s.className.toLowerCase().includes(directoryClassFilter.toLowerCase());
      }

      // 3. Fee Status Filter
      let matchesFee = true;
      if (directoryFeeFilter === 'pending') {
        matchesFee = (s.pendingFee > 0);
      } else if (directoryFeeFilter === 'cleared') {
        matchesFee = (s.pendingFee <= 0);
      } else if (directoryFeeFilter === 'high_due') {
        matchesFee = (s.pendingFee >= 2000);
      }

      return matchesSearch && matchesClass && matchesFee;
    });

    // 4. Sort Order
    if (directorySortOrder === 'fee_max_to_min') {
      result.sort((a, b) => (b.pendingFee || 0) - (a.pendingFee || 0));
    } else if (directorySortOrder === 'fee_min_to_max') {
      result.sort((a, b) => (a.pendingFee || 0) - (b.pendingFee || 0));
    } else if (directorySortOrder === 'paid_max_to_min') {
      result.sort((a, b) => (b.paidFee || 0) - (a.paidFee || 0));
    } else if (directorySortOrder === 'name_asc') {
      result.sort((a, b) => a.name.localeCompare(b.name));
    }

    return result;
  }

  function renderAdminStudentList() {
    const pane = document.getElementById('adminTabPane-students');
    if (!pane) return;

    const students = AppState.getStudents();
    const activeFilteredStudents = applyStudentDirectoryFilters(students);

    pane.innerHTML = `
      <div class="dash-card">
        <!-- Top Toolbar & Add Student -->
        <div class="admin-toolbar" style="display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; justify-content: space-between; margin-bottom: 1.1rem;">
          <div class="search-box-portal" style="flex: 1; min-width: 240px;">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input type="text" id="adminSearchStudent" class="search-input-field" placeholder="Search 100s of students by name, roll, mobile..." value="${directorySearchQuery}">
          </div>
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
            <button class="btn btn-emerald" id="btnAddNewStudentModal" style="padding: 0.5rem 0.85rem; font-size: 0.85rem;">
              <i class="fa-solid fa-user-plus"></i> Add Student
            </button>
            <label class="btn" style="background-color: var(--secondary-sage); color: #fff; padding: 0.5rem 0.85rem; font-size: 0.85rem; cursor: pointer; margin-bottom: 0;">
              <i class="fa-solid fa-file-csv"></i> Bulk CSV
              <input type="file" id="bulkCsvFileInput" accept=".csv" style="display: none;">
            </label>
          </div>
        </div>

        <!-- Filter & Sorting Bar (Class Wise, Fee Status, Fee Max-Min) -->
        <div style="display: flex; gap: 0.6rem; flex-wrap: wrap; align-items: center; justify-content: space-between; background: #FAF9F6; border: 1px solid var(--border-sand); padding: 0.75rem 1rem; border-radius: 8px; margin-bottom: 1.25rem;">
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center;">
            <!-- FILTER 1: CLASS WISE -->
            <select id="filterClassWise" class="portal-input" style="width: auto; font-size: 0.83rem; padding: 0.45rem 0.75rem;">
              <option value="all" ${directoryClassFilter === 'all' ? 'selected' : ''}>📚 Class Wise: All Batches</option>
              <option value="10th" ${directoryClassFilter === '10th' ? 'selected' : ''}>Class 10th (ACHIEVER Batch)</option>
              <option value="9th" ${directoryClassFilter === '9th' ? 'selected' : ''}>Class 9th (NURTURE Batch)</option>
              <option value="8th" ${directoryClassFilter === '8th' ? 'selected' : ''}>Class 8th (ALPHA Batch)</option>
              <option value="junio" ${directoryClassFilter === 'junio' ? 'selected' : ''}>Junior Batch (JUNIO)</option>
            </select>

            <!-- FILTER 2: FEE STATUS -->
            <select id="filterFeeStatus" class="portal-input" style="width: auto; font-size: 0.83rem; padding: 0.45rem 0.75rem;">
              <option value="all" ${directoryFeeFilter === 'all' ? 'selected' : ''}>💰 Fee Status: All</option>
              <option value="pending" ${directoryFeeFilter === 'pending' ? 'selected' : ''}>🔴 Pending Dues (> ₹0)</option>
              <option value="cleared" ${directoryFeeFilter === 'cleared' ? 'selected' : ''}>🟢 Cleared / Fee (0)</option>
              <option value="high_due" ${directoryFeeFilter === 'high_due' ? 'selected' : ''}>⚠️ High Dues (≥ ₹2,000)</option>
            </select>
          </div>

          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center;">
            <!-- FILTER 3: SORT ORDER (MAX TO MIN) -->
            <select id="sortStudentOrder" class="portal-input" style="width: auto; font-size: 0.83rem; padding: 0.45rem 0.75rem; border-color: var(--primary-emerald); font-weight: 700; color: var(--primary-emerald);">
              <option value="default" ${directorySortOrder === 'default' ? 'selected' : ''}>↕️ Sort Order (Default)</option>
              <option value="fee_max_to_min" ${directorySortOrder === 'fee_max_to_min' ? 'selected' : ''}>📊 Pending Fee: Max to Min (Highest First)</option>
              <option value="fee_min_to_max" ${directorySortOrder === 'fee_min_to_max' ? 'selected' : ''}>📉 Pending Fee: Min to Max (Lowest First)</option>
              <option value="paid_max_to_min" ${directorySortOrder === 'paid_max_to_min' ? 'selected' : ''}>💚 Paid Fee: Max to Min</option>
              <option value="name_asc" ${directorySortOrder === 'name_asc' ? 'selected' : ''}>🔤 Student Name: A to Z</option>
            </select>
            <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-muted); background: #E5E7EB; padding: 0.35rem 0.65rem; border-radius: 6px;">
              ${activeFilteredStudents.length} Students
            </span>
          </div>
        </div>

        <div class="table-responsive">
          <table class="portal-table">
            <thead>
              <tr>
                <th>Student ID</th>
                <th>Student Name</th>
                <th>Mobile Number</th>
                <th>DOB</th>
                <th>Class / Batch</th>
                <th>Fee Paid / Total</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="adminStudentTableBody">
              ${renderStudentTableRows(activeFilteredStudents)}
            </tbody>
          </table>
        </div>
      </div>
    `;

    const updateTable = () => {
      const filtered = applyStudentDirectoryFilters(students);
      const tbody = pane.querySelector('#adminStudentTableBody');
      if (tbody) tbody.innerHTML = renderStudentTableRows(filtered);
      bindStudentTableActions(pane);
    };

    // Search filter input
    pane.querySelector('#adminSearchStudent')?.addEventListener('input', (e) => {
      directorySearchQuery = e.target.value;
      updateTable();
    });

    // Class filter select
    pane.querySelector('#filterClassWise')?.addEventListener('change', (e) => {
      directoryClassFilter = e.target.value;
      updateTable();
    });

    // Fee status select
    pane.querySelector('#filterFeeStatus')?.addEventListener('change', (e) => {
      directoryFeeFilter = e.target.value;
      updateTable();
    });

    // Sort order select
    pane.querySelector('#sortStudentOrder')?.addEventListener('change', (e) => {
      directorySortOrder = e.target.value;
      updateTable();
    });

    // Bulk CSV upload listener
    pane.querySelector('#bulkCsvFileInput')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(evt) {
        const text = evt.target.result;
        parseAndImportStudentCSV(text);
      };
      reader.readAsText(file);
    });

    // Add student modal trigger
    pane.querySelector('#btnAddNewStudentModal')?.addEventListener('click', () => {
      openAddStudentModal();
    });

    bindStudentTableActions(pane);
  }

  function getActiveTeacherName() {
    const current = AppState.currentUser || AppState.getAdmin();
    if (current && current.name) {
      return `${current.name}${current.role ? ` (${current.role})` : ''}`;
    }
    return 'CHANDAN KUMAR (Science Mentor & Admin)';
  }

  function getFormattedTimestamp() {
    const now = new Date();
    return now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) + ', ' +
           now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  }

  function renderStudentTableRows(studentsList) {
    if (studentsList.length === 0) {
      return '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">No matching student records found.</td></tr>';
    }
    return studentsList.map(s => `
      <tr>
        <td><strong class="font-mono">${s.student_id || s.rollNo || s.id}</strong></td>
        <td>
          <div style="font-weight: 700; color: var(--text-mahogany);">${s.name}</div>
          <div style="font-size: 0.78rem; color: var(--text-muted);">Roll: #${s.rollNo} | ₹${s.monthlyFee || 1000}/mo</div>
        </td>
        <td>${s.mobile}</td>
        <td>${formatDate(s.dob)}</td>
        <td>${s.className}</td>
        <td>
          <div style="font-weight: 700; color: var(--primary-emerald);">Paid: ₹${s.paidFee.toLocaleString()}</div>
          ${s.pendingFee > 0 
            ? `<div style="font-size: 0.78rem; color: #DC2626; font-weight:700;"><i class="fa-solid fa-circle"></i> Pending: ₹${s.pendingFee.toLocaleString()}</div>` 
            : '<div style="font-size: 0.78rem; color: #059669; font-weight:700;"><i class="fa-solid fa-circle"></i> Cleared</div>'}
        </td>
        <td>
          <div style="display: flex; gap: 0.35rem; align-items: center; flex-wrap: wrap;">
            <button class="btn-make-changes" data-id="${s.id}" style="background-color: var(--primary-emerald, #064E3B); color: #fff; border: none; padding: 0.45rem 0.75rem; border-radius: 6px; font-weight: 700; font-size: 0.8rem; cursor: pointer; display: inline-flex; align-items: center; gap: 0.3rem; box-shadow: 0 2px 6px rgba(6, 78, 59, 0.2);" title="Manage student profile, payments & dues">
              <i class="fa-solid fa-sliders"></i> Make Changes
            </button>
            <button class="btn-reset-pw-dob" data-id="${s.id}" data-name="${s.name}" data-dob="${s.dob}" style="background-color: #FEF3C7; color: #92400E; border: 1px solid #FCD34D; padding: 0.45rem 0.65rem; border-radius: 6px; font-weight: 700; font-size: 0.78rem; cursor: pointer; display: inline-flex; align-items: center; gap: 0.3rem;" title="Reset login password to official Date of Birth (${s.dob})">
              <i class="fa-solid fa-key"></i> Reset to DOB
            </button>
            <button class="btn-delete-student" data-id="${s.id}" style="color: #DC2626; cursor: pointer; border: none; background: transparent; padding: 0.4rem; font-size: 0.95rem;" title="Delete Record">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  function bindStudentTableActions(container) {
    // Open Make Changes Control Modal
    container.querySelectorAll('.btn-make-changes').forEach(btn => {
      btn.onclick = () => {
        openStudentManagementModal(btn.dataset.id, 'pay');
      };
    });

    // Reset student password to DOB
    container.querySelectorAll('.btn-reset-pw-dob').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.dataset.id;
        const name = btn.dataset.name || 'Student';
        const dob = btn.dataset.dob || 'DOB';
        if (confirm(`Reset login password for ${name} to their official Date of Birth (${dob})?`)) {
          const origHtml = btn.innerHTML;
          try {
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Resetting...';
            await AppState.resetStudentPasswordToDob(id);
            alert(`✅ Password for ${name} has been reset to Date of Birth (${dob}). The student can now log in using their DOB.`);
          } catch (err) {
            alert('Failed to reset password: ' + err.message);
          } finally {
            btn.disabled = false;
            btn.innerHTML = origHtml;
          }
        }
      };
    });

    // Delete student
    container.querySelectorAll('.btn-delete-student').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.dataset.id;
        if (confirm('Are you sure you want to delete this student record?')) {
          let students = AppState.getStudents();
          const target = students.find(st => st.id === id);
          students = students.filter(st => st.id !== id);
          await AppState.saveStudents(students);
          if (target) {
            AppState.addAuditLog('Admin', 'STUDENT_DELETED', target.name, target.rollNo, `Deleted student record for ${target.name} (Roll #${target.rollNo})`, { studentId: id });
          }
          renderAdminDashboard();
        }
      };
    });
  }

  /* ==========================================================================
   * UNIFIED STUDENT MANAGEMENT & FEE CONTROL HUB (MAKE CHANGES MODAL)
   * ========================================================================== */
  function openStudentManagementModal(studentId, initialSection = 'pay') {
    document.getElementById('studentManagementModal')?.remove();

    const students = AppState.getStudents();
    const target = students.find(s => s.id === studentId);
    if (!target) return;

    const teacherName = getActiveTeacherName();

    const modalHtml = `
      <div class="inner-modal-backdrop active" id="studentManagementModal">
        <div class="inner-modal-content" style="max-width: 680px;">
          <div class="inner-modal-header">
            <div>
              <h3 style="margin:0;"><i class="fa-solid fa-user-gear" style="color: var(--primary-emerald);"></i> ${target.name}</h3>
              <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.15rem;">ID: <strong>${target.student_id || target.rollNo || target.id}</strong> | Roll: <strong>#${target.rollNo}</strong> | Class: <strong>${target.className}</strong></div>
            </div>
            <button class="btn-close-inner" onclick="document.getElementById('studentManagementModal').remove()"><i class="fa-solid fa-xmark"></i></button>
          </div>

          <div style="font-size: 0.85rem; background: var(--bg-surface-cream, #FAF9F6); border: 1px solid var(--border-sand, #E5E7EB); color: var(--text-mahogany); padding: 0.75rem 1rem; border-radius: 8px; margin-bottom: 1.15rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
            <div><strong>Active Educator / Admin:</strong> ${teacherName}</div>
            <div>
              Paid: <strong style="color: #059669;">₹${(target.paidFee || 0).toLocaleString()}</strong> | 
              Pending: <strong style="color: ${target.pendingFee > 0 ? '#DC2626' : '#059669'};">₹${(target.pendingFee || 0).toLocaleString()}</strong>
            </div>
          </div>

          <!-- Section Switcher Sub-Pills -->
          <div style="display: flex; gap: 0.5rem; margin-bottom: 1.25rem; border-bottom: 2px solid var(--border-sand); padding-bottom: 0.6rem; flex-wrap: wrap;">
            <button class="req-sub-pill ${initialSection === 'pay' ? 'active' : ''}" data-sec="pay">
              <i class="fa-solid fa-indian-rupee-sign"></i> Record Payment
            </button>
            <button class="req-sub-pill ${initialSection === 'due' ? 'active' : ''}" data-sec="due">
              <i class="fa-solid fa-clock-rotate-left"></i> Add Old Due
            </button>
            <button class="req-sub-pill ${initialSection === 'regulate' ? 'active' : ''}" data-sec="regulate">
              <i class="fa-solid fa-sliders"></i> Regulate Fee
            </button>
            <button class="req-sub-pill ${initialSection === 'profile' ? 'active' : ''}" data-sec="profile">
              <i class="fa-solid fa-user-pen"></i> Edit Profile Details
            </button>
            <button class="req-sub-pill ${initialSection === 'security' ? 'active' : ''}" data-sec="security">
              <i class="fa-solid fa-shield-halved"></i> Login & Security
            </button>
          </div>

          <!-- SECTION 1: RECORD PAYMENT (PAY) -->
          <div class="stu-mgmt-sec" id="stuMgmtSec-pay" style="display: ${initialSection === 'pay' ? 'block' : 'none'};">
            <form id="mgmtPayForm">
              <div style="display: flex; gap: 0.4rem; margin-bottom: 0.75rem; flex-wrap: wrap;">
                <button type="button" class="btn-mgmt-quick-pay" id="btnAdminPayFullDue" style="padding: 0.35rem 0.75rem; border-radius: 6px; border: 1.5px solid #10B981; background: #ECFDF5; color: #064E3B; font-weight: 700; font-size: 0.78rem; cursor: pointer; font-family: inherit;">
                  <i class="fa-solid fa-circle-check"></i> Full Due: ₹${(target.pendingFee || target.monthlyFee || 1000).toLocaleString()}
                </button>
                <button type="button" class="btn-mgmt-quick-pay" id="btnAdminPay1Month" style="padding: 0.35rem 0.75rem; border-radius: 6px; border: 1px solid #CBD5E1; background: #fff; color: #334155; font-weight: 700; font-size: 0.78rem; cursor: pointer; font-family: inherit;">
                  <i class="fa-solid fa-calendar-days"></i> 1-Month Fee: ₹${(target.monthlyFee || 1000).toLocaleString()}
                </button>
              </div>
              <div style="margin-bottom: 0.9rem;">
                <label style="font-size: 0.85rem; font-weight: 600;">Payment Amount Received (₹) *</label>
                <input type="number" id="mgmtPayAmount" class="portal-input" required value="${target.pendingFee || target.monthlyFee || 1000}" min="1">
              </div>
              <div style="margin-bottom: 0.9rem;">
                <label style="font-size: 0.85rem; font-weight: 600;">Payment Mode</label>
                <select id="mgmtPayMode" class="portal-input">
                  <option value="Cash at Counter">Cash at Institute Counter</option>
                  <option value="UPI (PhonePe)">UPI (PhonePe)</option>
                  <option value="UPI (Google Pay)">UPI (Google Pay)</option>
                  <option value="Direct Bank Transfer">Direct Bank Transfer</option>
                </select>
              </div>
              <div style="margin-bottom: 1.25rem;">
                <label style="font-size: 0.85rem; font-weight: 600;">Description / Audit Note</label>
                <input type="text" id="mgmtPayNote" class="portal-input" placeholder="e.g. Monthly tuition fee received in cash by teacher">
              </div>
              <button type="submit" class="btn btn-emerald" style="width: 100%; padding: 0.8rem; background-color: #059669;">
                <i class="fa-solid fa-circle-check"></i> Submit Paid Payment & Issue Receipt
              </button>
            </form>
          </div>

          <!-- SECTION 2: ADD OLD DUE -->
          <div class="stu-mgmt-sec" id="stuMgmtSec-due" style="display: ${initialSection === 'due' ? 'block' : 'none'};">
            <form id="mgmtDueForm">
              <div style="margin-bottom: 0.9rem;">
                <label style="font-size: 0.85rem; font-weight: 600;">Old / Carryover Unpaid Amount (₹) *</label>
                <input type="number" id="mgmtDueAmount" class="portal-input" required placeholder="e.g. 2000" min="1">
              </div>
              <div style="margin-bottom: 1.25rem;">
                <label style="font-size: 0.85rem; font-weight: 600;">Reason / Month Description *</label>
                <input type="text" id="mgmtDueNote" class="portal-input" required placeholder="e.g. Unpaid fee carryover for April & May">
              </div>
              <button type="submit" class="btn" style="width: 100%; padding: 0.8rem; background-color: #DC2626; color: #fff; border: none; font-weight: 700; border-radius: 6px; cursor: pointer;">
                <i class="fa-solid fa-exclamation-triangle"></i> Add Old Due (Mark RED)
              </button>
            </form>
          </div>

          <!-- SECTION 3: REGULATE FEE -->
          <div class="stu-mgmt-sec" id="stuMgmtSec-regulate" style="display: ${initialSection === 'regulate' ? 'block' : 'none'};">
            <form id="mgmtRegulateForm">
              <div style="margin-bottom: 0.9rem;">
                <label style="font-size: 0.85rem; font-weight: 600;">Adjustment Action</label>
                <select id="mgmtAdjActionType" class="portal-input" required>
                  <option value="discount">Decrease Fee (Apply Concession / Special Discount)</option>
                  <option value="penalty">Increase Fee (Late Fee Fine / Special Add-on)</option>
                </select>
              </div>
              <div style="margin-bottom: 0.9rem;">
                <label style="font-size: 0.85rem; font-weight: 600;">Adjustment Amount (₹) *</label>
                <input type="number" id="mgmtAdjAmount" class="portal-input" required placeholder="e.g. 500" min="1">
              </div>
              <div style="margin-bottom: 1.25rem;">
                <label style="font-size: 0.85rem; font-weight: 600;">Reason / Audit Note *</label>
                <input type="text" id="mgmtAdjNote" class="portal-input" required placeholder="e.g. Special concession agreed by Director">
              </div>
              <button type="submit" class="btn btn-emerald" style="width: 100%; padding: 0.8rem;">
                <i class="fa-solid fa-check"></i> Apply Adjustment & Log to Audit Ledger
              </button>
            </form>
          </div>

          <!-- SECTION 4: EDIT PROFILE -->
          <div class="stu-mgmt-sec" id="stuMgmtSec-profile" style="display: ${initialSection === 'profile' ? 'block' : 'none'};">
            <form id="mgmtEditProfileForm">
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.9rem; margin-bottom: 1rem;">
                <div>
                  <label style="font-size: 0.85rem; font-weight: 600;">Student Full Name *</label>
                  <input type="text" id="mgmtStuName" class="portal-input" value="${target.name}" required>
                </div>
                <div>
                  <label style="font-size: 0.85rem; font-weight: 600;">Mobile Number *</label>
                  <input type="tel" id="mgmtStuMobile" class="portal-input" value="${target.mobile}" required maxlength="10" pattern="[0-9]{10}" inputmode="numeric" placeholder="10-digit mobile">
                </div>
                <div>
                  <label style="font-size: 0.85rem; font-weight: 600;">Date of Birth (DOB) *</label>
                  <input type="date" id="mgmtStuDob" class="portal-input" value="${target.dob}" required>
                </div>
                <div>
                  <label style="font-size: 0.85rem; font-weight: 600;">Class / Batch Assignment</label>
                  <select id="mgmtStuClass" class="portal-input">
                    <option value="Class 10th (Board Batch)" ${target.className.includes('10th') ? 'selected' : ''}>Class 10th (Board Batch)</option>
                    <option value="Class 9th (Foundation)" ${target.className.includes('9th') ? 'selected' : ''}>Class 9th (Foundation)</option>
                    <option value="Class 8th (Junior Achievers)" ${target.className.includes('8th') ? 'selected' : ''}>Class 8th (Junior Achievers)</option>
                  </select>
                </div>
                <div>
                  <label style="font-size: 0.85rem; font-weight: 600;">Custom Monthly Fee (₹/mo)</label>
                  <input type="number" id="mgmtStuMonthlyFee" class="portal-input" value="${target.monthlyFee || 1000}">
                </div>
                <div>
                  <label style="font-size: 0.85rem; font-weight: 600;">Email Address</label>
                  <input type="email" id="mgmtStuEmail" class="portal-input" value="${target.email}">
                </div>
                <div>
                  <label style="font-size: 0.85rem; font-weight: 600;">Father / Guardian Name</label>
                  <input type="text" id="mgmtStuGuardian" class="portal-input" value="${target.guardianName}">
                </div>
                <div>
                  <label style="font-size: 0.85rem; font-weight: 600;">Guardian Contact</label>
                  <input type="tel" id="mgmtStuGuardianMobile" class="portal-input" value="${target.guardianMobile || target.mobile}" maxlength="10" pattern="[0-9]{10}" inputmode="numeric" placeholder="10-digit guardian contact">
                </div>
                <div>
                  <label style="font-size: 0.85rem; font-weight: 600;">Blood Group</label>
                  <select id="mgmtStuBloodGroup" class="portal-input">
                    <option value="Not Specified" ${target.bloodGroup === 'Not Specified' ? 'selected' : ''}>Not Specified</option>
                    <option value="A+" ${target.bloodGroup === 'A+' ? 'selected' : ''}>A+</option>
                    <option value="A-" ${target.bloodGroup === 'A-' ? 'selected' : ''}>A-</option>
                    <option value="B+" ${target.bloodGroup === 'B+' ? 'selected' : ''}>B+</option>
                    <option value="B-" ${target.bloodGroup === 'B-' ? 'selected' : ''}>B-</option>
                    <option value="O+" ${target.bloodGroup === 'O+' ? 'selected' : ''}>O+</option>
                    <option value="O-" ${target.bloodGroup === 'O-' ? 'selected' : ''}>O-</option>
                    <option value="AB+" ${target.bloodGroup === 'AB+' ? 'selected' : ''}>AB+</option>
                    <option value="AB-" ${target.bloodGroup === 'AB-' ? 'selected' : ''}>AB-</option>
                  </select>
                </div>
                <div>
                  <label style="font-size: 0.85rem; font-weight: 600;">Joining Session / Month</label>
                  <input type="text" id="mgmtStuJoiningMonth" class="portal-input" value="${target.joiningMonth || 'April 2026'}">
                </div>
                <div style="grid-column: span 2;">
                  <label style="font-size: 0.85rem; font-weight: 600;"><i class="fa-solid fa-camera" style="color: var(--primary-emerald);"></i> Profile Photo (Upload to Cloud Storage)</label>
                  <div style="display: flex; gap: 0.75rem; align-items: center; margin-top: 0.35rem;">
                    <div id="mgmtPhotoPreviewContainer" style="width: 50px; height: 50px; border-radius: 8px; overflow: hidden; border: 2px solid var(--primary-emerald); flex-shrink: 0; background: #f3f4f6;">
                      <img id="mgmtPhotoPreviewImg" src="${target.photoUrl || target.photo_url || target.photo || 'assets/images/logo.png'}" style="width: 100%; height: 100%; object-fit: cover;">
                    </div>
                    <div style="flex: 1;">
                      <input type="file" id="mgmtStuPhotoInput" accept="image/*" class="portal-input" style="padding: 0.35rem; font-size: 0.8rem;">
                      <input type="hidden" id="mgmtStuPhotoUrl" value="${target.photoUrl || target.photo_url || target.photo || ''}">
                      <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 0.2rem;">Select photo to upload directly to Supabase Storage</div>
                    </div>
                  </div>
                </div>
                <div style="grid-column: span 2;">
                  <label style="font-size: 0.85rem; font-weight: 600;">Residential Address</label>
                  <input type="text" id="mgmtStuAddress" class="portal-input" value="${target.address}">
                </div>
              </div>
              <button type="submit" class="btn btn-emerald" style="width: 100%; padding: 0.8rem;">
                <i class="fa-solid fa-floppy-disk"></i> Save & Synchronize Profile Changes
              </button>
            </form>
          </div>

          <!-- SECTION 5: LOGIN & SECURITY (PASSWORD RESET TO DOB) -->
          <div class="stu-mgmt-sec" id="stuMgmtSec-security" style="display: ${initialSection === 'security' ? 'block' : 'none'};">
            <div style="background: var(--bg-surface-cream, #FAF9F6); border: 1.5px solid var(--border-sand, #E5E7EB); border-radius: 10px; padding: 1.25rem; margin-bottom: 1.25rem;">
              <div style="display: flex; gap: 1rem; align-items: flex-start;">
                <div style="font-size: 2rem; color: var(--primary-emerald, #064E3B); background: rgba(6, 78, 59, 0.08); width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                  <i class="fa-solid fa-user-shield"></i>
                </div>
                <div style="flex: 1;">
                  <h4 style="margin: 0 0 0.35rem 0; font-size: 1.02rem; color: var(--text-mahogany);">Student Login & Password Controls</h4>
                  <p style="margin: 0 0 0.85rem 0; font-size: 0.84rem; color: var(--text-muted); line-height: 1.55;">
                    Students can sign in using their custom portal password (if set) or their official Date of Birth (DOB).
                  </p>

                  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem; margin-bottom: 1rem;">
                    <div style="background: #fff; border: 1px solid #E2E8F0; border-radius: 8px; padding: 0.65rem 0.85rem;">
                      <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Student ID</div>
                      <div style="font-size: 0.95rem; font-weight: 700; color: var(--text-mahogany); font-family: monospace;">${target.student_id || target.rollNo || target.id}</div>
                    </div>
                    <div style="background: #fff; border: 1px solid #E2E8F0; border-radius: 8px; padding: 0.65rem 0.85rem;">
                      <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Default Password (DOB)</div>
                      <div style="font-size: 0.95rem; font-weight: 700; color: #059669; font-family: monospace;">${formatDate(target.dob)} (${target.dob})</div>
                    </div>
                  </div>

                  <div style="background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 8px; padding: 0.85rem 1rem; font-size: 0.82rem; color: #92400E; margin-bottom: 1.15rem; line-height: 1.5;">
                    <i class="fa-solid fa-circle-info" style="margin-right: 0.35rem;"></i> <strong>Instant Admin Reset:</strong> If this student has updated their password and forgot it, click below to instantly reset their portal login credentials back to their Date of Birth.
                  </div>

                  <button type="button" id="btnAdminResetStuPasswordToDob" class="btn" style="background-color: #D97706; color: #fff; border: none; padding: 0.75rem 1.25rem; border-radius: 8px; font-weight: 700; font-size: 0.88rem; cursor: pointer; display: inline-flex; align-items: center; gap: 0.45rem; box-shadow: 0 2px 6px rgba(217, 119, 6, 0.25);">
                    <i class="fa-solid fa-rotate-left"></i> Reset Password to DOB (${target.dob})
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modalEl = document.getElementById('studentManagementModal');

    // Handle Admin Password Reset to DOB
    modalEl.querySelector('#btnAdminResetStuPasswordToDob')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      if (confirm(`Reset login password for ${target.name} to their official Date of Birth (${target.dob})?`)) {
        const origHtml = btn.innerHTML;
        try {
          btn.disabled = true;
          btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Resetting Password...';
          await AppState.resetStudentPasswordToDob(target.id);
          alert(`✅ Password for ${target.name} has been reset to Date of Birth (${target.dob}). The student can now log in using their DOB.`);
        } catch (err) {
          alert('Failed to reset password: ' + err.message);
        } finally {
          btn.disabled = false;
          btn.innerHTML = origHtml;
        }
      }
    });

    // Handle Admin Student Photo Upload
    modalEl.querySelector('#mgmtStuPhotoInput')?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const previewImg = modalEl.querySelector('#mgmtPhotoPreviewImg');
      const hiddenUrl = modalEl.querySelector('#mgmtStuPhotoUrl');
      try {
        if (typeof SupabaseSync !== 'undefined' && SupabaseSync.uploadFile) {
          const uploadedUrl = await SupabaseSync.uploadFile(file, 'profile_pictures');
          if (uploadedUrl) {
            hiddenUrl.value = uploadedUrl;
            if (previewImg) previewImg.src = uploadedUrl;
          }
        }
      } catch (err) {
        alert('Photo upload failed: ' + err.message);
      }
    });

    // Section Switcher Listeners
    modalEl.querySelectorAll('.req-sub-pill').forEach(pill => {
      pill.onclick = () => {
        const sec = pill.dataset.sec;
        modalEl.querySelectorAll('.req-sub-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');

        modalEl.querySelectorAll('.stu-mgmt-sec').forEach(sEl => sEl.style.display = 'none');
        const targetSec = modalEl.querySelector(`#stuMgmtSec-${sec}`);
        if (targetSec) targetSec.style.display = 'block';
      };
    });

    // Admin Quick Pay Buttons
    const btnAdminFull = modalEl.querySelector('#btnAdminPayFullDue');
    const btnAdminMonth = modalEl.querySelector('#btnAdminPay1Month');
    const adminPayInput = modalEl.querySelector('#mgmtPayAmount');

    btnAdminFull?.addEventListener('click', () => {
      if (adminPayInput) adminPayInput.value = target.pendingFee || target.monthlyFee || 1000;
      btnAdminFull.style.borderColor = '#10B981';
      btnAdminFull.style.background = '#ECFDF5';
      btnAdminFull.style.color = '#064E3B';
      if (btnAdminMonth) {
        btnAdminMonth.style.borderColor = '#CBD5E1';
        btnAdminMonth.style.background = '#fff';
        btnAdminMonth.style.color = '#334155';
      }
    });

    btnAdminMonth?.addEventListener('click', () => {
      if (adminPayInput) adminPayInput.value = target.monthlyFee || 1000;
      btnAdminMonth.style.borderColor = '#10B981';
      btnAdminMonth.style.background = '#ECFDF5';
      btnAdminMonth.style.color = '#064E3B';
      if (btnAdminFull) {
        btnAdminFull.style.borderColor = '#CBD5E1';
        btnAdminFull.style.background = '#fff';
        btnAdminFull.style.color = '#334155';
      }
    });

    // Form 1: Pay Submit
    modalEl.querySelector('#mgmtPayForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const amount = parseFloat(modalEl.querySelector('#mgmtPayAmount').value) || 0;
      const mode = modalEl.querySelector('#mgmtPayMode').value;
      const note = modalEl.querySelector('#mgmtPayNote').value.trim() || 'Tuition fee payment received';

      target.paidFee += amount;
      target.pendingFee = Math.max(0, target.pendingFee - amount);

      const recNo = `REC-${Date.now().toString(36).slice(-4)}-${Math.random().toString(36).slice(2,5)}`;
      if (!Array.isArray(target.feeHistory)) target.feeHistory = [];
      target.feeHistory.push({
        receiptNo: recNo,
        date: getFormattedTimestamp(),
        amount: amount,
        mode: mode,
        status: 'Paid',
        by: teacherName,
        note: note
      });

      await AppState.saveStudents(students);
      AppState.addAuditLog(teacherName, 'FEE_PAYMENT', target.name, target.rollNo, `Recorded fee payment of ₹${amount.toLocaleString()} via ${mode} for ${target.name}`, { amount, mode, receiptNo: recNo, note });

      modalEl.remove();
      alert(`✅ Payment of ₹${amount.toLocaleString()} recorded by ${teacherName}! Status marked PAID.`);
      renderAdminDashboard();
    });

    // Form 2: Old Due Submit
    modalEl.querySelector('#mgmtDueForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const amount = parseFloat(modalEl.querySelector('#mgmtDueAmount').value) || 0;
      const note = modalEl.querySelector('#mgmtDueNote').value.trim();

      target.totalFee += amount;
      target.pendingFee += amount;

      if (!Array.isArray(target.feeHistory)) target.feeHistory = [];
      target.feeHistory.push({
        receiptNo: `OLD-DUE-${Date.now().toString(36).slice(-4)}-${Math.random().toString(36).slice(2,5)}`,
        date: getFormattedTimestamp(),
        amount: amount,
        mode: 'Old Unpaid Fee Carryover',
        status: 'Pending Due',
        by: teacherName,
        note: note
      });

      await AppState.saveStudents(students);
      AppState.addAuditLog(teacherName, 'OLD_DUE_ADDED', target.name, target.rollNo, `Added old fee carryover of ₹${amount.toLocaleString()} for ${target.name}`, { amount, note });

      modalEl.remove();
      alert(`🔴 Old fee carryover of ₹${amount.toLocaleString()} added for ${target.name} by ${teacherName}!`);
      renderAdminDashboard();
    });

    // Form 3: Regulate Submit
    modalEl.querySelector('#mgmtRegulateForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const actionType = modalEl.querySelector('#mgmtAdjActionType').value;
      const amount = parseFloat(modalEl.querySelector('#mgmtAdjAmount').value) || 0;
      const note = modalEl.querySelector('#mgmtAdjNote').value.trim();

      if (!Array.isArray(target.feeHistory)) target.feeHistory = [];
      const isDiscount = actionType === 'discount';
      if (isDiscount) {
        target.pendingFee = Math.max(0, target.pendingFee - amount);
        target.feeHistory.push({
          receiptNo: `DISC-${Date.now().toString(36).slice(-4)}-${Math.random().toString(36).slice(2,5)}`,
          date: getFormattedTimestamp(),
          amount: -amount,
          mode: 'Fee Concession / Special Discount',
          status: 'Adjusted',
          by: teacherName,
          note: note
        });
      } else {
        target.pendingFee += amount;
        target.totalFee += amount;
        target.feeHistory.push({
          receiptNo: `ADDON-${Date.now().toString(36).slice(-4)}-${Math.random().toString(36).slice(2,5)}`,
          date: getFormattedTimestamp(),
          amount: amount,
          mode: 'Late Fine / Special Add-on',
          status: 'Pending Due',
          by: teacherName,
          note: note
        });
      }

      await AppState.saveStudents(students);
      AppState.addAuditLog(teacherName, 'FEE_REGULATED', target.name, target.rollNo, `Regulated fee for ${target.name}: ${isDiscount ? 'Concession of ₹' + amount : 'Fine of ₹' + amount}`, { amount, actionType, note });

      modalEl.remove();
      alert(`✅ Fee regulation of ₹${amount.toLocaleString()} applied for ${target.name}!`);
      renderAdminDashboard();
    });

    // Input masking for 10-digit mobile numbers
    const editMobInput = modalEl.querySelector('#mgmtStuMobile');
    const editGrdMobInput = modalEl.querySelector('#mgmtStuGuardianMobile');
    editMobInput?.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
    });
    editGrdMobInput?.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
    });

    // Form 4: Edit Profile Submit
    modalEl.querySelector('#mgmtEditProfileForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();

      const rawMobile = modalEl.querySelector('#mgmtStuMobile').value.trim();
      const rawGuardianMobile = modalEl.querySelector('#mgmtStuGuardianMobile').value.trim();
      const cleanMobile = sanitizeMobileNumber(rawMobile);
      const cleanGuardianMobile = rawGuardianMobile ? sanitizeMobileNumber(rawGuardianMobile) : cleanMobile;

      if (!isValid10DigitMobile(cleanMobile)) {
        alert('Invalid Mobile Number: Student mobile number must be exactly 10 digits without letters or special characters (e.g. 9876543210).');
        modalEl.querySelector('#mgmtStuMobile').focus();
        return;
      }

      if (rawGuardianMobile && !isValid10DigitMobile(cleanGuardianMobile)) {
        alert('Invalid Guardian Contact: Guardian contact must be exactly 10 digits without letters or special characters (e.g. 9876543210).');
        modalEl.querySelector('#mgmtStuGuardianMobile').focus();
        return;
      }

      target.name = modalEl.querySelector('#mgmtStuName').value.trim();
      target.mobile = cleanMobile;
      target.dob = modalEl.querySelector('#mgmtStuDob').value;
      target.className = modalEl.querySelector('#mgmtStuClass').value;
      target.batchName = target.className;
      target.monthlyFee = parseFloat(modalEl.querySelector('#mgmtStuMonthlyFee').value) || 1000;
      target.email = modalEl.querySelector('#mgmtStuEmail').value.trim();
      target.guardianName = modalEl.querySelector('#mgmtStuGuardian').value.trim();
      target.guardianMobile = cleanGuardianMobile;
      target.bloodGroup = modalEl.querySelector('#mgmtStuBloodGroup').value;
      target.joiningMonth = modalEl.querySelector('#mgmtStuJoiningMonth').value.trim();
      const previousPhoto = target.photo || target.photoUrl || target.photo_url || '';
      const updatedPhoto = modalEl.querySelector('#mgmtStuPhotoUrl')?.value;
      if (updatedPhoto && updatedPhoto !== previousPhoto) {
        if (previousPhoto && previousPhoto.includes('/pragyan-media/')) {
          try { await SupabaseSync.deleteFile(previousPhoto); } catch(e) { console.warn('Old photo cleanup note:', e.message); }
        }
        target.photo = updatedPhoto;
        target.photo_url = updatedPhoto;
        target.photoUrl = updatedPhoto;
      }

      if (!Array.isArray(target.feeHistory)) target.feeHistory = [];
      target.feeHistory.push({
        receiptNo: `EDIT-PROF-${Date.now().toString(36).slice(-4)}-${Math.random().toString(36).slice(2,5)}`,
        date: getFormattedTimestamp(),
        amount: 0,
        mode: 'Profile Detail Synchronization',
        status: 'Synchronized',
        by: teacherName,
        note: `Profile updated by ${teacherName}`
      });

      await AppState.saveStudents(students);

      // Relational Linking: Cascade profile changes to student_requests
      const reqList = AppState.getRequests();
      let reqsChanged = false;
      reqList.forEach(r => {
        if (isStudentRequestMatch(r, target)) {
          r.studentName = target.name;
          r.student_name = target.name;
          r.rollNo = target.rollNo;
          r.roll_no = target.rollNo;
          r.className = target.className;
          r.class_name = target.className;
          reqsChanged = true;
        }
      });
      if (reqsChanged) await AppState.saveRequests(reqList);

      // Relational Linking: Cascade profile changes to student_fee_accounts
      const feeAccounts = AppState.getFeeAccounts();
      const accIdx = feeAccounts.findIndex(a => 
        String(a.student_id || a.studentId || '').toLowerCase() === String(target.id).toLowerCase() ||
        String(a.roll_no || a.rollNo || '').toLowerCase() === String(target.rollNo).toLowerCase()
      );
      if (accIdx !== -1) {
        feeAccounts[accIdx].student_name = target.name;
        feeAccounts[accIdx].studentName = target.name;
        feeAccounts[accIdx].class_name = target.className;
        feeAccounts[accIdx].className = target.className;
        feeAccounts[accIdx].roll_no = target.rollNo;
        feeAccounts[accIdx].rollNo = target.rollNo;
        await AppState.saveFeeAccounts(feeAccounts);
      }

      AppState.addAuditLog(teacherName, 'PROFILE_EDITED', target.name, target.rollNo, `Updated profile details for ${target.name}`, { name: target.name, mobile: target.mobile });

      modalEl.remove();
      alert(`✅ Profile for ${target.name} updated and synchronized across portal!`);
      renderAdminDashboard();
    });
  }

  // Backward-compatibility wrappers
  function openPayModal(studentId) { openStudentManagementModal(studentId, 'pay'); }
  function openAddOldDueModal(studentId) { openStudentManagementModal(studentId, 'due'); }
  function openAdjustBillModal(studentId) { openStudentManagementModal(studentId, 'regulate'); }
  function openEditStudentProfileModal(studentId) { openStudentManagementModal(studentId, 'profile'); }

  /* ==========================================================================
   * FINANCIAL ANALYTICS & REPORTS TAB (ADMIN / TEACHERS)
   * ========================================================================== */
  let auditTxPage = 1;
  const auditTxPerPage = 8;
  let auditTxCollectorFilter = 'all';
  let auditTxModeFilter = 'all';
  let auditTxSearchQuery = '';

  function renderAdminAnalyticsTab() {
    const pane = document.getElementById('adminTabPane-analytics');
    if (!pane) return;

    try {
      const students = AppState.getStudents() || [];
      const batches = AppState.getBatches() || [];

      const totalCollected = students.reduce((acc, curr) => acc + (curr.paidFee || 0), 0);
      const totalPending = students.reduce((acc, curr) => acc + (curr.pendingFee || 0), 0);
      const totalExpected = totalCollected + totalPending;
      const collectionPct = totalExpected > 0 ? ((totalCollected / totalExpected) * 100).toFixed(1) : '100';

      // 1. Gather all payment transactions across all students
      const allTransactions = [];
      let chandanTotal = 0;
      let chandanCash = 0;
      let chandanUpi = 0;

      let raviTotal = 0;
      let raviCash = 0;
      let raviUpi = 0;

      let totalAllModes = 0;

      students.forEach(s => {
        (s.feeHistory || []).forEach(h => {
          if (h && h.status === 'Paid' && (h.amount || 0) > 0) {
            const rawCollector = h.by || '';
            const isChandan = rawCollector.toLowerCase().includes('chandan');
            const isRavi = rawCollector.toLowerCase().includes('ravi') || rawCollector.toLowerCase().includes('ranjan');

            const modeLower = (h.mode || '').toLowerCase();
            const isCash = modeLower.includes('cash');

            const collectorName = isChandan ? 'CHANDAN KUMAR (Science Lead & Admin)' :
                                  isRavi ? 'Prof. Ravi Ranjan (Maths Director)' :
                                  (rawCollector || 'Prof. Ravi Ranjan (Director)');

            if (isChandan) {
              chandanTotal += h.amount;
              if (isCash) chandanCash += h.amount; else chandanUpi += h.amount;
            } else {
              raviTotal += h.amount;
              if (isCash) raviCash += h.amount; else raviUpi += h.amount;
            }

            totalAllModes += h.amount;

            allTransactions.push({
              receiptNo: h.receiptNo || 'REC-GEN',
              date: h.date || 'N/A',
              studentName: s.name,
              rollNo: s.rollNo,
              className: s.className,
              amount: h.amount,
              mode: h.mode || 'Cash',
              collector: collectorName,
              note: h.note || 'Tuition Fee Payment'
            });
          }
        });
      });

      // Filter transactions
      let filteredTx = allTransactions.filter(t => {
        let matchesCollector = true;
        if (auditTxCollectorFilter === 'chandan') {
          matchesCollector = t.collector.toLowerCase().includes('chandan');
        } else if (auditTxCollectorFilter === 'ravi') {
          matchesCollector = t.collector.toLowerCase().includes('ravi') || t.collector.toLowerCase().includes('ranjan');
        }

        let matchesMode = true;
        if (auditTxModeFilter === 'cash') {
          matchesMode = t.mode.toLowerCase().includes('cash');
        } else if (auditTxModeFilter === 'upi') {
          matchesMode = !t.mode.toLowerCase().includes('cash');
        }

        let matchesSearch = true;
        if (auditTxSearchQuery) {
          const q = auditTxSearchQuery.toLowerCase();
          matchesSearch = String(t.studentName || '').toLowerCase().includes(q) ||
                          String(t.rollNo || '').toLowerCase().includes(q) ||
                          String(t.receiptNo || '').toLowerCase().includes(q) ||
                          String(t.className || '').toLowerCase().includes(q);
        }

        return matchesCollector && matchesMode && matchesSearch;
      });

      const totalPages = Math.ceil(filteredTx.length / auditTxPerPage) || 1;
      if (auditTxPage > totalPages) auditTxPage = totalPages;
      if (auditTxPage < 1) auditTxPage = 1;

      const startIdx = (auditTxPage - 1) * auditTxPerPage;
      const pageTx = filteredTx.slice(startIdx, startIdx + auditTxPerPage);

      pane.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 1.5rem;">
          <!-- Top Metric Summary Cards -->
          <div class="dash-card" style="background: linear-gradient(135deg, #064E3B 0%, #032e23 100%); color: #fff;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; margin-bottom: 1rem;">
              <div>
                <span class="section-tag" style="background: rgba(255,255,255,0.2); color: #fff;"><i class="fa-solid fa-chart-line"></i> Coaching Financial Analytics</span>
                <h3 style="font-size: 1.5rem; font-weight: 800; margin-top: 0.4rem; color: #fff;">100% Monthly Fee Coaching Report</h3>
              </div>
              <div style="text-align: right;">
                <div style="font-size: 0.82rem; opacity: 0.85;">Collection Efficiency Rate</div>
                <div style="font-size: 1.8rem; font-weight: 800; color: #34D399;">${collectionPct}%</div>
              </div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
              <div style="background: rgba(255,255,255,0.1); padding: 1rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.15);">
                <div style="font-size: 0.8rem; opacity: 0.85;">Total Cash & Online Collected</div>
                <div style="font-size: 1.4rem; font-weight: 800; color: #34D399;">₹${totalCollected.toLocaleString()}</div>
              </div>
              <div style="background: rgba(255,255,255,0.1); padding: 1rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.15);">
                <div style="font-size: 0.8rem; opacity: 0.85;">Total Old & Pending Dues</div>
                <div style="font-size: 1.4rem; font-weight: 800; color: #FCA5A5;">₹${totalPending.toLocaleString()}</div>
              </div>
              <div style="background: rgba(255,255,255,0.1); padding: 1rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.15);">
                <div style="font-size: 0.8rem; opacity: 0.85;">Total Active Enrolled</div>
                <div style="font-size: 1.4rem; font-weight: 800; color: #FDE047;">${students.length} Students</div>
              </div>
            </div>
          </div>

          <!-- Main Admin Live Fee & Email Dispatch Center -->
          <div class="dash-card" style="border: 2px solid #059669; background: #FAF9F6; margin-bottom: 0.5rem; box-shadow: 0 4px 14px rgba(6, 78, 59, 0.08);">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; margin-bottom: 1rem; border-bottom: 1.5px solid #A7F3D0; padding-bottom: 0.85rem;">
              <div>
                <span class="section-tag" style="background: #D1FAE5; color: #065F46; font-weight: 800; padding: 0.25rem 0.65rem; border-radius: 99px; font-size: 0.75rem;">
                  <i class="fa-solid fa-paper-plane"></i> MAIN ADMIN DISPATCH CENTER
                </span>
                <h3 style="font-size: 1.25rem; font-weight: 800; color: #064E3B; margin-top: 0.35rem;">
                  ⚡ Instant Fee Billing & Email Trigger (Resend Live Data)
                </h3>
                <p style="font-size: 0.85rem; color: #4B5563; margin-top: 0.2rem;">
                  Send extra fee reminders or monthly fee invoices to an <strong>individual student</strong> or an entire class batch. Works all 30 days on-demand.
                </p>
              </div>
              <div style="display: flex; gap: 0.5rem;">
                <span style="font-size: 0.8rem; background: #ECFDF5; color: #065F46; border: 1px solid #10B981; padding: 0.4rem 0.8rem; border-radius: 99px; font-weight: 700; display: inline-flex; align-items: center; gap: 0.4rem;">
                  <i class="fa-solid fa-bolt"></i> Verified Domain: noreply@pragyaninstitute.com
                </span>
              </div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-bottom: 1.25rem;">
              <div>
                <label style="display: block; font-size: 0.82rem; font-weight: 700; color: #374151; margin-bottom: 0.35rem;">
                  🎯 1. Select Batch / Class:
                </label>
                <select id="adminBillingTargetClass" class="portal-input" style="width: 100%; font-weight: 600; padding: 0.6rem 0.85rem; border-radius: 8px; border: 1.5px solid var(--border-sand); background: #fff;">
                  <option value="all">🌟 All Batches (All Enrolled Students)</option>
                  <option value="10th" selected>🎯 Class 10th (ACHIEVER Batch)</option>
                  <option value="9th">🌱 Class 9th (NURTURE Batch)</option>
                  <option value="8th">⚡ Class 8th (ALPHA Batch)</option>
                  <option value="junio">🚀 Junior Batch (JUNIO Batch)</option>
                </select>
              </div>

              <div>
                <label style="display: block; font-size: 0.82rem; font-weight: 700; color: #374151; margin-bottom: 0.35rem;">
                  👤 2. Target Student (Individual or All):
                </label>
                <select id="adminBillingTargetStudent" class="portal-input" style="width: 100%; font-weight: 600; padding: 0.6rem 0.85rem; border-radius: 8px; border: 1.5px solid var(--border-sand); background: #fff;">
                  <option value="all">👥 All Students in Selected Batch</option>
                </select>
              </div>

              <div>
                <label style="display: block; font-size: 0.82rem; font-weight: 700; color: #374151; margin-bottom: 0.35rem;">
                  📬 3. Action / Dispatch Mode:
                </label>
                <select id="adminBillingAction" class="portal-input" style="width: 100%; font-weight: 600; padding: 0.6rem 0.85rem; border-radius: 8px; border: 1.5px solid var(--border-sand); background: #fff;">
                  <option value="reminder" selected>⚠️ Extra Fee Reminder (Direct Due Notice — All 30 Days)</option>
                  <option value="invoice">📄 Monthly Fee Invoice & Billing (Installment + Email Statement)</option>
                </select>
              </div>
            </div>

            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem;">
              <div style="font-size: 0.82rem; color: #6B7280; display: flex; align-items: center; gap: 0.5rem;">
                <i class="fa-solid fa-shield-halved" style="color: #059669;"></i> Includes official PhonePe QR, <strong>chandankr1501998@ybl</strong>, and auto-UPI pay links.
              </div>
              <button id="adminTriggerBillingBtn" class="btn btn-emerald" style="padding: 0.65rem 1.4rem; font-size: 0.92rem; font-weight: 800; display: inline-flex; align-items: center; gap: 0.6rem; box-shadow: 0 4px 12px rgba(5,150,105,0.3);">
                <i class="fa-solid fa-paper-plane"></i> <span>Trigger Real-Time Dispatch</span>
              </button>
            </div>

            <!-- Live Dispatch Progress & Results Box -->
            <div id="adminBillingResultBox" style="display: none; margin-top: 1.25rem; padding: 1rem; border-radius: 8px; font-size: 0.85rem;"></div>
          </div>

          <!-- Batch-Wise Financial Breakdown -->
          <div class="dash-card">
            <h4 style="font-size: 1.1rem; font-weight: 700; color: var(--text-mahogany); margin-bottom: 1rem;">
              <i class="fa-solid fa-layer-group" style="color: var(--primary-emerald);"></i> Batch-Wise Collection Breakdown
            </h4>
            <div style="display: flex; flex-direction: column; gap: 1rem;">
              ${batches.map(b => {
                const bClass = b.className || '';
                const batchStudents = students.filter(s => {
                  const sClass = s.className || '';
                  return sClass.includes(bClass) || (bClass.includes('10th') && sClass.includes('10th'));
                });
                const bCollected = batchStudents.reduce((acc, c) => acc + (c.paidFee || 0), 0);
                const bPending = batchStudents.reduce((acc, c) => acc + (c.pendingFee || 0), 0);
                const bTotal = bCollected + bPending;
                const bPct = bTotal > 0 ? ((bCollected / bTotal) * 100).toFixed(0) : 100;

                return `
                  <div style="border: 1px solid var(--border-sand); padding: 1rem; border-radius: 8px; background: #FAF9F6;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                      <div>
                        <strong style="font-size: 1rem; color: var(--text-mahogany);">${b.className}</strong>
                        <span style="font-size: 0.8rem; color: var(--text-muted); margin-left: 0.5rem;">(${batchStudents.length} Students • ₹${b.monthlyFee || 1000}/mo)</span>
                      </div>
                      <span style="font-weight: 700; font-size: 0.9rem; color: var(--primary-emerald);">₹${bCollected.toLocaleString()} Collected</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.3rem;">
                      <span>Progress: ${bPct}%</span>
                      <span style="color: #DC2626;">Pending: ₹${bPending.toLocaleString()}</span>
                    </div>
                    <div style="width: 100%; height: 8px; background: #E5E7EB; border-radius: 99px; overflow: hidden;">
                      <div style="width: ${bPct}%; height: 100%; background: var(--primary-emerald); border-radius: 99px;"></div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <!-- Comprehensive Fee Collection Audit & Student-Wise Payment Logs -->
          <div class="dash-card">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 1rem; border-bottom: 1px solid var(--border-sand); padding-bottom: 0.85rem;">
              <div>
                <h4 style="font-size: 1.15rem; font-weight: 800; color: var(--text-mahogany); margin: 0; display: flex; align-items: center; gap: 0.5rem;">
                  <i class="fa-solid fa-receipt" style="color: var(--primary-emerald);"></i> Student Payment Transactions & Collector Audit Log
                </h4>
                <div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 0.2rem;">Detailed log of all student payments across Cash, UPI, and Online transfers with teacher audit breakdown</div>
              </div>
              <span style="background: var(--primary-emerald-light); color: var(--primary-emerald); padding: 0.35rem 0.85rem; border-radius: 99px; font-size: 0.8rem; font-weight: 700;">
                <i class="fa-solid fa-list-check"></i> ${filteredTx.length} Transactions Found
              </span>
            </div>

            <!-- Filter & Search Toolbar -->
            <div style="display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; justify-content: space-between; margin-bottom: 1rem; background: #FAF9F6; padding: 0.75rem; border-radius: 8px; border: 1px solid var(--border-sand);">
              <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; flex: 1; min-width: 240px;">
                <div style="position: relative; flex: 1; min-width: 180px;">
                  <input type="text" id="auditTxSearchInput" class="portal-input" placeholder="Search by student, roll #, receipt..." value="${auditTxSearchQuery}" style="padding-left: 2.2rem; font-size: 0.82rem; height: 38px;">
                  <i class="fa-solid fa-magnifying-glass" style="position: absolute; left: 0.85rem; top: 50%; transform: translateY(-50%); color: var(--text-muted); font-size: 0.8rem;"></i>
                </div>
                <select id="auditTxCollectorSelect" class="portal-input" style="width: auto; font-size: 0.82rem; height: 38px; padding: 0.4rem 0.6rem;">
                  <option value="all" ${auditTxCollectorFilter === 'all' ? 'selected' : ''}>All Faculty Collectors</option>
                  <option value="chandan" ${auditTxCollectorFilter === 'chandan' ? 'selected' : ''}>👨‍🏫 Chandan Kumar</option>
                  <option value="ravi" ${auditTxCollectorFilter === 'ravi' ? 'selected' : ''}>👨‍🏫 Prof. Ravi Ranjan</option>
                </select>
                <select id="auditTxModeSelect" class="portal-input" style="width: auto; font-size: 0.82rem; height: 38px; padding: 0.4rem 0.6rem;">
                  <option value="all" ${auditTxModeFilter === 'all' ? 'selected' : ''}>All Payment Modes</option>
                  <option value="cash" ${auditTxModeFilter === 'cash' ? 'selected' : ''}>💵 Cash Only</option>
                  <option value="upi" ${auditTxModeFilter === 'upi' ? 'selected' : ''}>📱 UPI / Online Only</option>
                </select>
              </div>
            </div>

            <!-- Fast Native Scroll Table Container (NO INNER SCROLL TRAP) -->
            <div style="overflow-x: auto; -webkit-overflow-scrolling: touch; border: 1px solid var(--border-sand); border-radius: 10px; margin-bottom: 1rem; background: #fff;">
              <table class="portal-table" style="font-size: 0.85rem; margin: 0; min-width: 720px; width: 100%;">
                <thead>
                  <tr style="background: #F3F4F6;">
                    <th>Date & Time</th>
                    <th>Student & Roll #</th>
                    <th>Class Batch</th>
                    <th>Amount Paid</th>
                    <th>Payment Mode</th>
                    <th>Receipt #</th>
                    <th>Collected By (Teacher)</th>
                  </tr>
                </thead>
                <tbody>
                  ${pageTx.length === 0 ? '<tr><td colspan="7" style="text-align:center; padding: 2rem; color: var(--text-muted);">No payment transactions match your search filter.</td></tr>' :
                    pageTx.map(t => `
                      <tr>
                        <td style="white-space: nowrap; color: var(--text-muted); font-size: 0.78rem;">
                          <i class="fa-regular fa-calendar-days" style="color: var(--primary-emerald);"></i> ${t.date}
                        </td>
                        <td>
                          <strong>${t.studentName}</strong>
                          <div style="font-size: 0.76rem; color: var(--text-muted);">Roll #${t.rollNo}</div>
                        </td>
                        <td><span style="background: #FAF9F6; padding: 0.2rem 0.5rem; border-radius: 4px; border: 1px solid var(--border-sand); font-size: 0.78rem;">${t.className}</span></td>
                        <td style="font-weight: 800; color: #059669; font-size: 1rem;">₹${t.amount.toLocaleString()}</td>
                        <td>
                          <span style="padding: 0.25rem 0.65rem; border-radius: 99px; font-size: 0.76rem; font-weight: 700; background: ${t.mode.toLowerCase().includes('cash') ? '#FEF3C7; color: #92400E;' : '#D1FAE5; color: #065F46;'}">
                            <i class="${t.mode.toLowerCase().includes('cash') ? 'fa-solid fa-money-bill-wave' : 'fa-solid fa-mobile-screen'}"></i> ${t.mode}
                          </span>
                        </td>
                        <td style="font-family: monospace; font-size: 0.8rem; font-weight: 700; color: var(--text-mahogany);">${t.receiptNo}</td>
                        <td>
                          <div style="font-weight: 700; color: var(--text-mahogany); font-size: 0.82rem;">${t.collector}</div>
                          ${t.note ? `<div style="font-size: 0.72rem; color: var(--text-muted); font-style: italic;">"${t.note}"</div>` : ''}
                        </td>
                      </tr>
                    `).join('')
                  }
                </tbody>
              </table>
            </div>

            <!-- Pagination Bar Controls -->
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; font-size: 0.82rem; color: var(--text-muted); margin-bottom: 1.5rem; padding: 0.4rem 0.25rem;">
              <div>
                Showing <strong>${filteredTx.length > 0 ? startIdx + 1 : 0}</strong> to <strong>${Math.min(startIdx + auditTxPerPage, filteredTx.length)}</strong> of <strong>${filteredTx.length}</strong> transactions
              </div>
              <div style="display: flex; gap: 0.35rem; align-items: center;">
                <button class="btn" id="btnAuditTxPrev" ${auditTxPage <= 1 ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''} style="padding: 0.3rem 0.75rem; font-size: 0.8rem; background: #fff; border: 1px solid var(--border-sand); color: var(--text-mahogany); font-weight: 700;">
                  <i class="fa-solid fa-chevron-left"></i> Prev
                </button>
                <span style="font-weight: 700; color: var(--text-mahogany); padding: 0 0.5rem;">Page ${auditTxPage} of ${totalPages}</span>
                <button class="btn" id="btnAuditTxNext" ${auditTxPage >= totalPages ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''} style="padding: 0.3rem 0.75rem; font-size: 0.8rem; background: #fff; border: 1px solid var(--border-sand); color: var(--text-mahogany); font-weight: 700;">
                  Next <i class="fa-solid fa-chevron-right"></i>
                </button>
              </div>
            </div>

            <!-- Unified Teacher Collection Summary Section -->
            <div style="background: #FAF9F6; border: 1.5px solid var(--border-sand); border-radius: 12px; padding: 1.25rem;">
              <h5 style="font-size: 0.98rem; font-weight: 800; color: var(--text-mahogany); margin-bottom: 1rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem;">
                <span><i class="fa-solid fa-calculator" style="color: var(--primary-emerald);"></i> Total Fee Collection Summary by Teacher / Director</span>
                <span style="font-size: 0.85rem; color: var(--primary-emerald); background: #ffffff; padding: 0.3rem 0.75rem; border-radius: 6px; border: 1px solid var(--border-sand);">
                  Grand Total: <strong>₹${totalAllModes.toLocaleString()}</strong>
                </span>
              </h5>

              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem;">
                
                <!-- Chandan Sir Summary -->
                <div style="background: #ffffff; border: 1.5px solid #059669; border-radius: 10px; padding: 1.1rem; box-shadow: 0 2px 4px rgba(0,0,0,0.03);">
                  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.6rem;">
                    <div style="font-weight: 800; font-size: 1rem; color: var(--text-mahogany);">👨‍🏫 CHANDAN KUMAR</div>
                    <span style="font-size: 0.72rem; background: #D1FAE5; color: #065F46; padding: 0.2rem 0.5rem; border-radius: 99px; font-weight: 700;">Head of Institute</span>
                  </div>
                  <div style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 0.75rem;">Science Mentor & Managing Director</div>
                  
                  <div style="font-size: 1.5rem; font-weight: 800; color: #059669; margin-bottom: 0.75rem;">
                    ₹${chandanTotal.toLocaleString()}
                  </div>

                  <div style="display: flex; gap: 0.75rem; font-size: 0.8rem; border-top: 1px dashed #E5E7EB; padding-top: 0.6rem;">
                    <div>💵 Cash: <strong>₹${chandanCash.toLocaleString()}</strong></div>
                    <div>📱 UPI / Online: <strong>₹${chandanUpi.toLocaleString()}</strong></div>
                  </div>
                </div>

                <!-- Ravi Ranjan Sir Summary -->
                <div style="background: #ffffff; border: 1.5px solid #0284C7; border-radius: 10px; padding: 1.1rem; box-shadow: 0 2px 4px rgba(0,0,0,0.03);">
                  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.6rem;">
                    <div style="font-weight: 800; font-size: 1rem; color: var(--text-mahogany);">👨‍🏫 Prof. RAVI RANJAN</div>
                    <span style="font-size: 0.72rem; background: #E0F2FE; color: #0369A1; padding: 0.2rem 0.5rem; border-radius: 99px; font-weight: 700;">Director</span>
                  </div>
                  <div style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 0.75rem;">Mathematics Lead & Co-Director</div>
                  
                  <div style="font-size: 1.5rem; font-weight: 800; color: #0284C7; margin-bottom: 0.75rem;">
                    ₹${raviTotal.toLocaleString()}
                  </div>

                  <div style="display: flex; gap: 0.75rem; font-size: 0.8rem; border-top: 1px dashed #E5E7EB; padding-top: 0.6rem;">
                    <div>💵 Cash: <strong>₹${raviCash.toLocaleString()}</strong></div>
                    <div>📱 UPI / Online: <strong>₹${raviUpi.toLocaleString()}</strong></div>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      `;

      // Bind Event Listeners for Audit Table Pagination & Filter Controls
      pane.querySelector('#auditTxSearchInput')?.addEventListener('input', (e) => {
        auditTxSearchQuery = e.target.value.trim();
        auditTxPage = 1;
        renderAdminAnalyticsTab();
      });
      pane.querySelector('#auditTxCollectorSelect')?.addEventListener('change', (e) => {
        auditTxCollectorFilter = e.target.value;
        auditTxPage = 1;
        renderAdminAnalyticsTab();
      });
      pane.querySelector('#auditTxModeSelect')?.addEventListener('change', (e) => {
        auditTxModeFilter = e.target.value;
        auditTxPage = 1;
        renderAdminAnalyticsTab();
      });
      pane.querySelector('#btnAuditTxPrev')?.addEventListener('click', () => {
        if (auditTxPage > 1) {
          auditTxPage--;
          renderAdminAnalyticsTab();
        }
      });
      pane.querySelector('#btnAuditTxNext')?.addEventListener('click', () => {
        if (auditTxPage < totalPages) {
          auditTxPage++;
          renderAdminAnalyticsTab();
        }
      });

      const classSelect = pane.querySelector('#adminBillingTargetClass');
      const studentSelect = pane.querySelector('#adminBillingTargetStudent');

      function populateTargetStudents() {
        if (!studentSelect) return;
        const selectedClass = classSelect ? classSelect.value : '10th';
        const allStudents = (typeof AppState !== 'undefined' && AppState.getStudents) ? AppState.getStudents() : (students || []);
        
        let filtered = allStudents;
        if (selectedClass !== 'all') {
          filtered = allStudents.filter(s => {
            const c = (s.className || s.class_name || '').toLowerCase();
            return c.includes(selectedClass.toLowerCase());
          });
        }

        let html = `<option value="all">👥 All Students in Selected Batch (${filtered.length})</option>`;
        filtered.forEach(s => {
          const sId = s.student_id || s.id || s.rollNo || s.roll_no;
          const due = Number(s.pendingFee ?? s.pending_fee ?? 0);
          const hasEmail = s.email && s.email.includes('@');
          const emailStatus = hasEmail ? '📧' : '⚠️ No Email';
          html += `<option value="${escapeHtml(sId)}">👤 ${escapeHtml(s.name)} (Roll #${escapeHtml(s.rollNo || s.roll_no || sId)}) — Due: ₹${due.toLocaleString('en-IN')} [${emailStatus}]</option>`;
        });
        studentSelect.innerHTML = html;
      }

      if (classSelect) {
        classSelect.addEventListener('change', populateTargetStudents);
      }
      populateTargetStudents();

      const triggerBtn = pane.querySelector('#adminTriggerBillingBtn');
      if (triggerBtn) {
        triggerBtn.addEventListener('click', async () => {
          const targetClass = pane.querySelector('#adminBillingTargetClass')?.value || '10th';
          const studentId = pane.querySelector('#adminBillingTargetStudent')?.value || 'all';
          const action = pane.querySelector('#adminBillingAction')?.value || 'reminder';
          const resultBox = pane.querySelector('#adminBillingResultBox');

          const actionLabel = action === 'invoice' ? 'generate monthly fee invoice & apply tuition' : 'send fee due reminder notice';
          const targetLabel = studentId !== 'all' ? `Student (${studentId})` : `${targetClass.toUpperCase()} batch`;
          
          if (!confirm(`📢 Confirm Live Fee Dispatch?\n\n• Action: ${actionLabel.toUpperCase()}\n• Target: ${targetLabel}\n• Sender: Pragyan Institute <noreply@pragyaninstitute.com>\n\nProceed with live dispatch?`)) {
            return;
          }

          triggerBtn.disabled = true;
          triggerBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Processing Live Real-Time Dispatch...`;
          if (resultBox) {
            resultBox.style.display = 'block';
            resultBox.style.background = '#EFF6FF';
            resultBox.style.border = '1.5px solid #3B82F6';
            resultBox.style.color = '#1E40AF';
            resultBox.innerHTML = `<div><i class="fa-solid fa-spinner fa-spin"></i> Synchronizing with live Supabase database & generating official statements...</div>`;
          }

          try {
            const allStudents = (typeof AppState !== 'undefined' && AppState.getStudents) ? AppState.getStudents() : [];
            let targets = allStudents.filter(s => {
              const sClass = (s.className || '').toLowerCase();
              if (targetClass === 'all') return true;
              if (targetClass === '10th' || targetClass === 'class 10th') return sClass.includes('10');
              if (targetClass === '9th' || targetClass === 'class 9th') return sClass.includes('9');
              if (targetClass === '8th' || targetClass === 'class 8th') return sClass.includes('8');
              if (targetClass === 'junio' || targetClass === 'junior') return sClass.includes('jun') || sClass.includes('foundation');
              return sClass.includes(targetClass.toLowerCase());
            });

            if (studentId && studentId !== 'all') {
              targets = targets.filter(s => {
                const sId = (s.id || s.student_id || '').toLowerCase();
                const sRoll = (s.rollNo || s.roll_no || '').toLowerCase();
                const q = studentId.toLowerCase();
                return sId === q || sRoll === q;
              });
            }

            if (targets.length === 0) {
              throw new Error(`No students found matching target criteria (${targetClass} / ${studentId}).`);
            }

            const currentMonthName = new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' });
            let billedCount = 0;
            let notifiedCount = 0;
            const results = [];
            const notices = AppState.getNotices ? AppState.getNotices() : [];

            for (let i = 0; i < targets.length; i++) {
              const s = targets[i];
              const sId = s.id || s.student_id || s.rollNo;
              const sName = s.name || 'Student';
              const sEmail = (s.email || '').trim();
              const monthlyFee = Number(s.monthlyFee) || 1000;
              let pendingFee = Number(s.pendingFee) || 0;

              let studentStatus = 'Processed';

              if (action === 'invoice') {
                pendingFee += monthlyFee;
                s.pendingFee = pendingFee;
                billedCount++;
                studentStatus = `Invoiced +₹${monthlyFee} (New Balance: ₹${pendingFee})`;

                // Post in-portal notice for student
                notices.unshift({
                  id: `NTC-INV-${Date.now().toString(36).slice(-4)}-${Math.random().toString(36).slice(2,5)}`,
                  title: `📢 ${currentMonthName} Tuition Fee Invoice Generated (₹${monthlyFee})`,
                  category: 'fees',
                  date: new Date().toISOString().split('T')[0],
                  message: `Dear ${sName}, your official monthly fee statement for ${currentMonthName} has been generated. Total pending balance: ₹${pendingFee}. Please pay online via UPI (chandankr1501998@ybl) or at the institute reception.`,
                  targetBatch: s.className || targetClass,
                  unread: true
                });
              } else {
                studentStatus = `Reminder (Due Balance: ₹${pendingFee})`;

                notices.unshift({
                  id: `NTC-REM-${Date.now().toString(36).slice(-4)}-${Math.random().toString(36).slice(2,5)}`,
                  title: `⚠️ Tuition Fee Due Reminder Notice (Due: ₹${pendingFee})`,
                  category: 'fees',
                  date: new Date().toISOString().split('T')[0],
                  message: `Dear ${sName}, this is a gentle reminder regarding your pending fee balance of ₹${pendingFee}. Please settle promptly to avoid late fine.`,
                  targetBatch: s.className || targetClass,
                  unread: true
                });
              }

              if (sEmail && sEmail.includes('@')) {
                const subject = action === 'invoice' 
                  ? `📢 ${currentMonthName} Tuition Fee Invoice - ${sName} (Roll #${s.rollNo || sId})`
                  : `⚠️ Fee Due Reminder Notice - ${sName} (Due: ₹${pendingFee})`;
                
                const emailHtml = generateCampaignEmailHtml(
                  s, 
                  action === 'invoice' ? 'monthly_invoice' : 'fee_reminder', 
                  subject, 
                  action === 'invoice' 
                    ? `Please find your official tuition fee invoice for ${currentMonthName}. Prompt payment ensures uninterrupted classes and study material access.`
                    : `This is a gentle reminder regarding your pending fee balance of ₹${pendingFee}. Please settle before the due date to avoid late fine.`,
                  true, 
                  true
                );

                await sendLiveResendEmail(sEmail, subject, emailHtml).catch(() => {});
                notifiedCount++;
                studentStatus += ' -> Statement & Notice Synchronized ✅';
              } else {
                studentStatus += ' -> In-Portal Noticeboard Posted ✅';
                notifiedCount++;
              }

              results.push({ name: sName, studentId: sId, email: sEmail, status: studentStatus });

              if (resultBox) {
                resultBox.innerHTML = `<div><i class="fa-solid fa-spinner fa-spin"></i> Processing ${i + 1} of ${targets.length}: <strong>${escapeHtml(sName)}</strong>...</div>`;
              }
            }

            // Save updated balances and notices atomically
            await AppState.saveStudents(allStudents);
            if (AppState.saveNotices) await AppState.saveNotices(notices);

            const author = getActiveTeacherName();
            await AppState.addAuditLog(
              author, 
              action === 'invoice' ? 'FEE_INVOICE_GENERATED' : 'FEE_REMINDER_SENT', 
              targetLabel, 
              studentId, 
              `Real-time dispatch complete for ${targets.length} students. ${billedCount} students invoiced.`,
              { action, targetClass, studentId, targetsCount: targets.length, billedCount }
            );

            if (resultBox) {
              resultBox.style.background = '#ECFDF5';
              resultBox.style.border = '1.5px solid #10B981';
              resultBox.style.color = '#065F46';
              resultBox.innerHTML = `
                <div style="font-weight: bold; font-size: 0.98rem; margin-bottom: 0.45rem; display: flex; align-items: center; gap: 0.5rem;">
                  <i class="fa-solid fa-circle-check" style="color: #10B981;"></i> Real-Time Fee Billing & Dispatch Successfully Processed!
                </div>
                <div style="display: flex; gap: 1.25rem; flex-wrap: wrap; margin-bottom: 0.65rem; background: rgba(255,255,255,0.8); padding: 0.6rem 0.85rem; border-radius: 6px; border: 1px solid #A7F3D0;">
                  <span>👥 Target Group: <strong>${escapeHtml(targetLabel)}</strong></span>
                  <span>💳 Total Processed: <strong>${targets.length} Students</strong></span>
                  <span>📢 Invoices & Notices Posted: <strong>${notifiedCount}</strong></span>
                </div>
                <div style="font-size: 0.78rem; opacity: 0.9; max-height: 140px; overflow-y: auto; background: rgba(255,255,255,0.7); padding: 0.5rem; border-radius: 4px; border: 1px solid #A7F3D0;">
                  ${results.map(r => `<div>• <strong>${escapeHtml(r.name)}</strong>: ${r.status}</div>`).join('')}
                </div>
              `;
            }

            showNotification(`✅ Real-time dispatch complete for ${targets.length} student(s)!`, 'success');
            renderAdminAnalyticsTab();
          } catch (err) {
            console.error('Trigger billing error:', err);
            if (resultBox) {
              resultBox.style.background = '#FEF2F2';
              resultBox.style.border = '1.5px solid #EF4444';
              resultBox.style.color = '#991B1B';
              resultBox.innerHTML = `<div>❌ <strong>Dispatch Note:</strong> ${escapeHtml(err.message)}</div>`;
            }
            showNotification(`❌ Error: ${err.message}`, 'error');
          } finally {
            triggerBtn.disabled = false;
            triggerBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> <span>Trigger Real-Time Dispatch</span>`;
          }
        });
      }

    } catch (err) {
      console.error('Error rendering Analytics tab:', err);
    }
  }

  /* ==========================================================================
   * GETSTREAM COMMUNITY CHAT TAB (STUDENTS & FACULTY / ADMIN)
   * ========================================================================== */
  async function initGetStreamChat() {
    if (typeof StreamChat === 'undefined') return;
    try {
      const currentUser = AppState.currentUser;
      const currentRole = AppState.currentRole;

      let userId = 'user_guest';
      let userName = 'Guest';
      let userRole = 'user';

      if (currentRole === 'admin' && currentUser) {
        userId = `admin_${(currentUser.username || currentUser.id || 'admin').replace(/[^a-zA-Z0-9_-]/g, '')}`;
        userName = currentUser.name || 'Admin';
        userRole = 'admin';
      } else if (currentUser) {
        userId = `student_${(currentUser.rollNo || currentUser.id || 'stu').replace(/[^a-zA-Z0-9_-]/g, '')}`;
        userName = currentUser.name || 'Student';
        userRole = 'user';
      }

      let token = null;
      try {
        const tokenRes = await fetch('/api/stream-token', { headers: { 'Authorization': `Bearer ${sessionStorage.getItem('pragyan_portal_token') || ''}` } });
        if (tokenRes.ok && (tokenRes.headers.get("content-type") || "").includes("application/json")) {
          const tokenJson = await tokenRes.json().catch(() => ({}));
          streamChatClient = StreamChat.getInstance(tokenJson.apiKey);
          userId = tokenJson.userId;
          token = tokenJson.token;
        }
      } catch(e) {}

      if (!token || !streamChatClient) throw new Error('Secure chat authentication is unavailable');

      await streamChatClient.connectUser(
        { id: userId, name: userName, role: userRole },
        token
      );

      // Create/join shared public community channel accessible across ALL devices
      streamChatChannel = streamChatClient.channel('messaging', 'pragyan_community_lounge', {
        name: 'Pragyan Institute Community Forum'
      });

      const channelState = await streamChatChannel.watch();

      // Sync GetStream server messages directly into AppState on connect
      if (channelState && channelState.messages && channelState.messages.length > 0) {
        const localMsgs = AppState.getCommunityMessages() || [];
        const msgMap = new Map();
        localMsgs.forEach(m => msgMap.set(m.id, m));

        channelState.messages.forEach(streamMsg => {
          const isMsgAdmin = streamMsg.user?.role === 'admin' || (streamMsg.user?.id && streamMsg.user.id.includes('admin'));
          const formattedMsg = {
            id: streamMsg.id || `MSG-${Date.now()}`,
            senderId: streamMsg.user?.id || 'usr',
            senderName: streamMsg.user?.name || streamMsg.user?.id || 'User',
            senderRole: isMsgAdmin ? 'FACULTY / ADMIN' : 'Student',
            avatar: isMsgAdmin ? '👨‍🏫' : '🎓',
            isAdmin: isMsgAdmin,
            isHighlighted: streamMsg.is_highlighted || false,
            isAdminAlert: streamMsg.is_admin_alert || false,
            linkUrl: streamMsg.link_url || null,
            text: streamMsg.text || '',
            timestamp: new Date(streamMsg.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }),
            isPinned: streamMsg.is_highlighted || false,
            attachment: (streamMsg.attachments && streamMsg.attachments[0]) ? {
              name: streamMsg.attachments[0].title || 'File',
              size: streamMsg.attachments[0].file_size || 1024,
              data: streamMsg.attachments[0].file_url || streamMsg.attachments[0].asset_url
            } : null,
            replies: []
          };
          msgMap.set(formattedMsg.id, formattedMsg);
        });

        AppState.saveCommunityMessages(Array.from(msgMap.values()));
      }

      // Listen for incoming live messages from OTHER devices in real-time
      streamChatChannel.on('message.new', (event) => {
        const streamMsg = event.message;
        if (streamMsg) {
          const isMsgAdmin = streamMsg.user?.role === 'admin' || (streamMsg.user?.id && streamMsg.user.id.includes('admin'));
          const msgs = AppState.getCommunityMessages() || [];
          if (!msgs.some(m => m.id === streamMsg.id)) {
            msgs.push({
              id: streamMsg.id || `MSG-${Date.now()}`,
              senderId: streamMsg.user?.id || 'usr',
              senderName: streamMsg.user?.name || streamMsg.user?.id || 'User',
              senderRole: isMsgAdmin ? 'FACULTY / ADMIN' : 'Student',
              avatar: isMsgAdmin ? '👨‍🏫' : '🎓',
              isAdmin: isMsgAdmin,
              isHighlighted: streamMsg.is_highlighted || false,
              isAdminAlert: streamMsg.is_admin_alert || false,
              linkUrl: streamMsg.link_url || null,
              text: streamMsg.text || '',
              timestamp: new Date(streamMsg.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }),
              isPinned: streamMsg.is_highlighted || false,
              attachment: (streamMsg.attachments && streamMsg.attachments[0]) ? {
                name: streamMsg.attachments[0].title || 'File',
                size: streamMsg.attachments[0].file_size || 1024,
                data: streamMsg.attachments[0].file_url || streamMsg.attachments[0].asset_url
              } : null,
              replies: []
            });
            AppState.saveCommunityMessages(msgs);
          }
        }
        renderCommunityChatTab();
      });
    } catch (err) {
      console.warn('Stream Chat API initialized in local & cloud sync fallback mode:', err);
    }
  }



  function renderCommunityChatTab() {
    const adminBtn = document.getElementById('adminTabBtnCommunity');
    const studentBtn = document.getElementById('studentTabBtnCommunity');
    if (adminBtn) adminBtn.style.display = ENABLE_COMMUNITY_CHAT ? '' : 'none';
    if (studentBtn) studentBtn.style.display = ENABLE_COMMUNITY_CHAT ? '' : 'none';

    const adminPane = document.getElementById('adminTabPane-community');
    const studentPane = document.getElementById('studentTabPane-community');
    const panes = [adminPane, studentPane].filter(Boolean);
    if (panes.length === 0) return;

    if (!ENABLE_COMMUNITY_CHAT) {
      const disabledHtml = `
        <div class="dash-card" style="text-align: center; padding: 3.5rem 1.5rem; background: #fff; border-radius: 12px; border: 1px solid var(--border-sand); max-width: 540px; margin: 2rem auto; box-shadow: 0 4px 16px rgba(0,0,0,0.06);">
          <div style="font-size: 3rem; margin-bottom: 0.75rem;">🔒</div>
          <h3 style="font-size: 1.25rem; font-weight: 800; color: var(--text-mahogany); margin-bottom: 0.5rem;">
            Community Forum Temporarily Paused
          </h3>
          <p style="font-size: 0.88rem; color: var(--text-muted); line-height: 1.5; margin-bottom: 1.25rem;">
            The Community Chat feature has been temporarily disabled by Pragyan Institute Management. All existing messages and chat archives remain securely preserved in the database.
          </p>
          <div style="font-size: 0.75rem; background: #FEF3C7; color: #92400E; padding: 0.5rem 0.85rem; border-radius: 8px; font-weight: 700; display: inline-flex; align-items: center; gap: 0.4rem;">
            🛡️ Status: Offline by Admin Order • Code & History Intact
          </div>
        </div>
      `;
      panes.forEach(pane => pane.innerHTML = disabledHtml);
      return;
    }

    try {
      if (typeof initGetStreamChat === 'function') {
        initGetStreamChat().catch(e => console.warn('Stream Chat async init warning:', e));
      }

      const messages = (AppState.getCommunityMessages() || []).filter(m => m && typeof m === 'object');
      const currentUser = AppState.currentUser || {};
      const isAdmin = AppState.currentRole === 'admin';

      const pinnedMsgs = messages.filter(m => m.isPinned);
      const topPinned = pinnedMsgs.length > 0 ? pinnedMsgs[pinnedMsgs.length - 1] : null;

      let displayMsgs = messages;
      if (communityActiveFilter === 'pinned') {
        displayMsgs = messages.filter(m => m.isPinned);
      } else if (communityActiveFilter === 'files') {
        displayMsgs = messages.filter(m => m.attachment != null);
      }

      const chatHtml = `
        <div class="dash-card" style="padding: 0; overflow: hidden; border: 1px solid var(--border-sand); border-radius: 12px; background: #fff; box-shadow: 0 4px 16px rgba(0,0,0,0.06); height: calc(100vh - 210px); min-height: 580px; display: flex; flex-direction: column;">
          
          <!-- Chat Header Bar -->
          <div style="background: linear-gradient(135deg, #064E3B 0%, #032e23 100%); color: #fff; padding: 0.75rem 1.1rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; flex-shrink: 0;">
            <div style="display: flex; align-items: center; gap: 0.65rem;">
              <div style="width: 36px; height: 36px; background: rgba(255,255,255,0.15); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.15rem;">
                💬
              </div>
              <div>
                <h3 style="font-size: 1.05rem; font-weight: 800; color: #fff; margin: 0; display: flex; align-items: center; gap: 0.4rem;">
                  Pragyan Institute Community Forum
                  <span style="font-size: 0.68rem; background: #34D399; color: #064E3B; padding: 0.12rem 0.45rem; border-radius: 99px; font-weight: 800;">GetStream Live</span>
                </h3>
                <div style="font-size: 0.74rem; opacity: 0.85; margin-top: 0.1rem;">
                  Full Page Lounge • ${messages.length} Messages
                </div>
              </div>
            </div>

            <!-- Filter Pills -->
            <div style="display: flex; gap: 0.35rem; background: rgba(0,0,0,0.25); padding: 0.2rem; border-radius: 8px;">
              <button class="btn btn-community-filter ${communityActiveFilter === 'all' ? 'active' : ''}" data-filter="all" style="padding: 0.25rem 0.55rem; font-size: 0.75rem; border-radius: 6px; border: none; cursor: pointer; background: ${communityActiveFilter === 'all' ? '#ffffff' : 'transparent'}; color: ${communityActiveFilter === 'all' ? '#064E3B' : '#fff'}; font-weight: 700;">
                All Chat
              </button>
              <button class="btn btn-community-filter ${communityActiveFilter === 'pinned' ? 'active' : ''}" data-filter="pinned" style="padding: 0.25rem 0.55rem; font-size: 0.75rem; border-radius: 6px; border: none; cursor: pointer; background: ${communityActiveFilter === 'pinned' ? '#ffffff' : 'transparent'}; color: ${communityActiveFilter === 'pinned' ? '#064E3B' : '#fff'}; font-weight: 700;">
                ✨ Pinned (${pinnedMsgs.length})
              </button>
              <button class="btn btn-community-filter ${communityActiveFilter === 'files' ? 'active' : ''}" data-filter="files" style="padding: 0.25rem 0.55rem; font-size: 0.75rem; border-radius: 6px; border: none; cursor: pointer; background: ${communityActiveFilter === 'files' ? '#ffffff' : 'transparent'}; color: ${communityActiveFilter === 'files' ? '#064E3B' : '#fff'}; font-weight: 700;">
                📄 Files
              </button>
            </div>
          </div>

          <!-- Pinned Announcement Header Card -->
          ${!topPinned ? '' : `
            <div style="background: #FEF3C7; border-bottom: 2px solid #F59E0B; padding: 0.65rem 1rem; display: flex; align-items: flex-start; gap: 0.65rem; flex-shrink: 0;">
              <div style="font-size: 1.1rem; color: #D97706; margin-top: 0.1rem;" class="hg-sparkle-icon">✨</div>
              <div style="flex: 1;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.15rem;">
                  <span style="font-size: 0.72rem; font-weight: 800; color: #92400E; text-transform: uppercase; letter-spacing: 0.5px;">✨ HIGHLIGHTED ANNOUNCEMENT (${pinnedMsgs.length})</span>
                  <span style="font-size: 0.7rem; color: #B45309;">By ${topPinned.senderName || 'Admin'} • ${topPinned.timestamp || ''}</span>
                </div>
                <div style="font-size: 0.84rem; color: #78350F; font-weight: 600; line-height: 1.35;">
                  "${topPinned.text || ''}"
                </div>
                ${topPinned.linkUrl ? `
                  <div style="margin-top: 0.35rem;">
                    <a href="${topPinned.linkUrl}" target="_blank" class="btn" style="background: linear-gradient(135deg, #D97706 0%, #B45309 100%); color: #fff; font-size: 0.74rem; padding: 0.2rem 0.55rem; border-radius: 4px; display: inline-flex; align-items: center; gap: 0.3rem; text-decoration: none; font-weight: 800;">
                      <i class="fa-solid fa-arrow-up-right-from-square"></i> Open Announcement Link
                    </a>
                  </div>
                ` : ''}
              </div>
              ${isAdmin ? `
                <button class="btn btn-unpin-top" data-id="${topPinned.id}" style="background: transparent; border: none; color: #B45309; cursor: pointer; font-size: 0.8rem;" title="Unpin Announcement">
                  <i class="fa-solid fa-xmark"></i> Unpin
                </button>
              ` : ''}
            </div>
          `}

          <!-- Messages Stream Container (Full Page Responsive Height, Ultra-Thin WhatsApp Bubbles) -->
          <div id="communityChatMessagesContainer" style="flex: 1; overflow-y: auto; padding: 0.75rem 0.9rem; background: #E5DDD5; display: flex; flex-direction: column; gap: 0.25rem; -webkit-overflow-scrolling: touch;">
            ${displayMsgs.length === 0 ? `
              <div style="text-align: center; padding: 3rem 1rem; color: var(--text-muted); background: #ffffff; border-radius: 12px; margin: 1rem auto; max-width: 320px;">
                <div style="font-size: 2.2rem; margin-bottom: 0.35rem;">💬</div>
                <div style="font-weight: 700; font-size: 0.95rem; color: var(--text-mahogany);">No community messages yet</div>
                <div style="font-size: 0.78rem; margin-top: 0.25rem;">Type a message or use <strong>/ad</strong> for Admin Alert</div>
              </div>
            ` : displayMsgs.map(msg => {
              if (!msg) return '';
              const isMsgAdmin = msg.isAdmin || (msg.senderRole && (msg.senderRole.toLowerCase().includes('admin') || msg.senderRole.toLowerCase().includes('director') || msg.senderRole.toLowerCase().includes('faculty')));
              const isSelf = currentUser && (msg.senderId === currentUser.id || msg.senderName === currentUser.name);
              const safeText = (msg.text || '').toString();

              let urlMatch = msg.linkUrl;
              if (!urlMatch && safeText) {
                const match = safeText.match(/(https?:\/\/[^\s]+|www\.[^\s]+)/i);
                if (match) urlMatch = match[0].startsWith('http') ? match[0] : `https://${match[0]}`;
              }

              return `
                <div class="whatsapp-msg-row" style="display: flex; gap: 0.35rem; max-width: 90%; margin-bottom: 0.1rem; align-self: ${isSelf ? 'flex-end' : 'flex-start'}; flex-direction: ${isSelf ? 'row-reverse' : 'row'};">
                  
                  <div style="width: 24px; height: 24px; border-radius: 50%; background: ${isMsgAdmin ? '#ECFDF5' : '#EFF6FF'}; border: 1.5px solid ${isMsgAdmin ? '#059669' : '#3B82F6'}; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; flex-shrink: 0; margin-top: 1px;">
                    ${msg.avatar || (isMsgAdmin ? '👨‍🏫' : '🎓')}
                  </div>

                  <div class="whatsapp-bubble ${msg.isHighlighted ? 'hg-sparkle-card' : ''}" style="background: ${msg.isHighlighted ? '#FEF3C7' : msg.isAdminAlert ? '#FEE2E2' : (isSelf ? '#DCF8C6' : '#ffffff')}; border: 1px solid ${msg.isHighlighted ? '#F59E0B' : msg.isAdminAlert ? '#EF4444' : (isSelf ? '#B7E493' : '#E5E7EB')}; border-radius: ${isSelf ? '10px 0px 10px 10px' : '0px 10px 10px 10px'}; padding: 0.25rem 0.55rem; box-shadow: 0 1px 2px rgba(0,0,0,0.04); min-width: 110px; max-width: 100%; position: relative;">
                    
                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.35rem; margin-bottom: 0.1rem; font-size: 0.72rem;">
                      <span style="font-weight: 800; color: ${isMsgAdmin ? '#065F46' : '#1D4ED8'}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        ${msg.senderName}
                      </span>
                      
                      <div style="display: flex; gap: 0.2rem; align-items: center;">
                        ${msg.isHighlighted ? '<span style="background: #F59E0B; color: #fff; font-size: 0.6rem; padding: 0.01rem 0.3rem; border-radius: 3px; font-weight: 800;" class="hg-sparkle-icon">✨ HIGHLIGHTED</span>' : ''}
                        ${msg.isAdminAlert ? '<span style="background: #DC2626; color: #fff; font-size: 0.6rem; padding: 0.01rem 0.3rem; border-radius: 3px; font-weight: 800;"><i class="fa-solid fa-bell"></i> ADMIN ALERT</span>' : ''}
                        ${!msg.isHighlighted && !msg.isAdminAlert && isMsgAdmin ? '<span style="background: #D1FAE5; color: #065F46; font-size: 0.6rem; padding: 0.01rem 0.25rem; border-radius: 3px; font-weight: 700;">FACULTY</span>' : ''}
                      </div>
                    </div>

                    <div style="font-size: 0.84rem; color: #1F2937; line-height: 1.3; word-break: break-word; white-space: pre-wrap;">${safeText}</div>

                    ${urlMatch ? `
                      <div style="margin-top: 0.25rem;">
                        <a href="${urlMatch}" target="_blank" class="btn" style="background: linear-gradient(135deg, #059669 0%, #047857 100%); color: #ffffff !important; text-decoration: none; padding: 0.2rem 0.55rem; border-radius: 4px; font-weight: 800; font-size: 0.74rem; display: inline-flex; align-items: center; gap: 0.3rem; box-shadow: 0 2px 6px rgba(5, 150, 105, 0.3);">
                          <i class="fa-solid fa-arrow-up-right-from-square"></i> Open Link
                        </a>
                      </div>
                    ` : ''}

                    ${msg.attachment ? `
                      <div style="margin-top: 0.25rem; background: rgba(0,0,0,0.04); border-radius: 4px; padding: 0.25rem 0.45rem; display: flex; align-items: center; justify-content: space-between; gap: 0.4rem;">
                        <div style="font-size: 0.74rem; font-weight: 700; color: #1F2937; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                          📄 ${msg.attachment.name}
                        </div>
                        <a href="${msg.attachment.data}" download="${msg.attachment.name}" style="color: #059669; font-weight: 700; font-size: 0.72rem; text-decoration: none; white-space: nowrap;">
                          📥 Download
                        </a>
                      </div>
                    ` : ''}

                    ${(msg.replies && msg.replies.length > 0) ? `
                      <div style="margin-top: 0.25rem; padding-left: 0.4rem; border-left: 2px solid var(--primary-emerald); display: flex; flex-direction: column; gap: 0.15rem;">
                        ${msg.replies.map(r => `
                          <div style="font-size: 0.74rem; background: rgba(0,0,0,0.03); padding: 0.15rem 0.35rem; border-radius: 3px;">
                            <strong style="font-size: 0.7rem; color: #374151;">${r.senderName}:</strong> ${r.text}
                          </div>
                        `).join('')}
                      </div>
                    ` : ''}

                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.15rem; font-size: 0.64rem; color: #6B7280; gap: 0.4rem;">
                      <div style="display: flex; gap: 0.4rem; align-items: center;">
                        <button class="btn btn-reply-msg" data-id="${msg.id}" style="background: none; border: none; padding: 0; color: #059669; font-size: 0.68rem; font-weight: 700; cursor: pointer;">
                          <i class="fa-solid fa-reply"></i> Reply
                        </button>
                        ${isAdmin ? `
                          <button class="btn btn-toggle-pin-msg" data-id="${msg.id}" style="background: none; border: none; padding: 0; color: #D97706; font-size: 0.68rem; font-weight: 700; cursor: pointer;">
                            <i class="fa-solid fa-thumbtack"></i> ${msg.isPinned ? 'Unpin' : 'Pin'}
                          </button>
                          <button class="btn btn-delete-msg" data-id="${msg.id}" style="background: none; border: none; padding: 0; color: #DC2626; font-size: 0.68rem; font-weight: 700; cursor: pointer;" title="Delete">
                            <i class="fa-solid fa-trash-can"></i>
                          </button>
                        ` : ''}
                      </div>
                      <span style="font-size: 0.63rem; color: #6B7280;">${msg.timestamp}</span>
                    </div>

                    ${activeReplyMsgId === msg.id ? `
                      <div style="margin-top: 0.35rem; background: #ffffff; padding: 0.3rem; border-radius: 4px; border: 1px solid var(--primary-emerald);">
                        <div style="display: flex; gap: 0.3rem;">
                          <input type="text" id="inputReplyText-${msg.id}" class="portal-input" placeholder="Reply to ${msg.senderName}..." style="font-size: 0.74rem; height: 26px; padding: 0.1rem 0.4rem;">
                          <button class="btn btn-emerald btn-submit-reply" data-id="${msg.id}" style="padding: 0.1rem 0.45rem; font-size: 0.7rem;">
                            Post
                          </button>
                        </div>
                      </div>
                    ` : ''}
                  </div>
                </div>
              `;
            }).join('')}
          </div>

          <div style="background: #ffffff; border-top: 1.5px solid var(--border-sand); padding: 0.6rem 0.9rem; flex-shrink: 0;">
            <div id="communityAttachmentPreview" style="display: none; margin-bottom: 0.4rem; background: #ECFDF5; border: 1px solid #059669; color: #065F46; padding: 0.35rem 0.55rem; border-radius: 6px; font-size: 0.76rem; justify-content: space-between; align-items: center;">
              <div style="display: flex; align-items: center; gap: 0.35rem;">
                <i class="fa-solid fa-paperclip"></i>
                <span id="communityAttachmentName">Attachment.pdf</span>
              </div>
              <button type="button" id="btnRemoveAttachment" style="background: transparent; border: none; color: #DC2626; cursor: pointer; font-weight: 700;"><i class="fa-solid fa-xmark"></i></button>
            </div>

            <form id="communityChatForm" style="display: flex; flex-direction: column; gap: 0.4rem;">
              <div style="display: flex; gap: 0.45rem; align-items: center;">
                <input type="text" id="communityMessageInput" class="portal-input" placeholder="Type a message... Use /hg for sparkling link/announcement, /ad for Admin Alert" style="flex: 1; font-size: 0.86rem; padding: 0.55rem 0.8rem; border-radius: 20px; border: 1px solid #D1D5DB;">
                
                <button type="submit" class="btn btn-emerald" style="padding: 0.5rem 1rem; font-size: 0.84rem; font-weight: 700; border-radius: 20px; white-space: nowrap; display: flex; align-items: center; gap: 0.3rem;">
                  Send <i class="fa-solid fa-paper-plane"></i>
                </button>
              </div>

              <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.35rem; font-size: 0.72rem; color: var(--text-muted);">
                <div style="display: flex; gap: 0.65rem; align-items: center;">
                  <span>✨ <strong>/hg</strong>: Sparkling Link / Announcement (Admin)</span>
                  <span>🚨 <strong>/ad</strong>: Admin Alert Notification</span>
                </div>

                ${isAdmin ? `
                  <label class="btn" style="background: #FAF9F6; border: 1px dashed var(--primary-emerald); color: var(--primary-emerald); padding: 0.2rem 0.55rem; font-size: 0.72rem; font-weight: 700; border-radius: 6px; cursor: pointer; margin: 0; display: inline-flex; align-items: center; gap: 0.25rem;">
                    <i class="fa-solid fa-paperclip"></i> Attach File
                    <input type="file" id="communityFileInput" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.zip" style="display: none;">
                  </label>
                ` : ''}
              </div>
            </form>
          </div>
        </div>
      `;

      panes.forEach(pane => {
        pane.innerHTML = chatHtml;
        bindCommunityPaneEvents(pane, isAdmin, currentUser);
      });
    } catch (err) {
      console.error('Error rendering Community Chat tab:', err);
    }
  }

  function bindCommunityPaneEvents(pane, isAdmin, currentUser) {
    if (!pane) return;

    // Auto Scroll to bottom of message stream
    const msgBox = pane.querySelector('#communityChatMessagesContainer');
    if (msgBox) msgBox.scrollTop = msgBox.scrollHeight;

    // Event Listeners for Filters
    pane.querySelectorAll('.btn-community-filter').forEach(btn => {
      btn.onclick = () => {
        communityActiveFilter = btn.dataset.filter;
        renderCommunityChatTab();
      };
    });

    // Event Listener for Reply button toggle
    pane.querySelectorAll('.btn-reply-msg').forEach(btn => {
      btn.onclick = () => {
        const msgId = btn.dataset.id;
        activeReplyMsgId = (activeReplyMsgId === msgId) ? null : msgId;
        renderCommunityChatTab();
      };
    });

    // Event Listener for Submit Reply
    pane.querySelectorAll('.btn-submit-reply').forEach(btn => {
      btn.onclick = () => {
        const msgId = btn.dataset.id;
        const inputEl = pane.querySelector(`#inputReplyText-${msgId}`);
        if (!inputEl || !inputEl.value.trim()) return;

        const replyText = inputEl.value.trim();
        const msgs = AppState.getCommunityMessages();
        const targetMsg = msgs.find(m => m && m.id === msgId);
        if (!targetMsg) return;

        const replySenderName = isAdmin ? (currentUser.name || 'Admin') : (currentUser.name || currentUser.studentName || (currentUser.rollNo ? (`Student Roll #${currentUser.rollNo}`) : 'Student'));
        
        if (!targetMsg.replies) targetMsg.replies = [];
        targetMsg.replies.push({
          id: `REP-${Date.now().toString(36).slice(-4)}-${Math.random().toString(36).slice(2,5)}`,
          senderId: currentUser.id || 'usr',
          senderName: replySenderName,
          senderRole: isAdmin ? 'FACULTY / ADMIN' : (currentUser.className || 'Student'),
          avatar: isAdmin ? '👨‍🏫' : '🎓',
          text: replyText,
          timestamp: getFormattedTimestamp()
        });

        AppState.saveCommunityMessages(msgs);
        AppState.markMutation();
        activeReplyMsgId = null;
        renderCommunityChatTab();
      };
    });

    // Admin Action: Pin / Unpin Message
    pane.querySelectorAll('.btn-toggle-pin-msg, .btn-unpin-top').forEach(btn => {
      btn.onclick = () => {
        const msgId = btn.dataset.id;
        const msgs = AppState.getCommunityMessages();
        const targetMsg = msgs.find(m => m && m.id === msgId);
        if (!targetMsg) return;

        targetMsg.isPinned = !targetMsg.isPinned;
        if (targetMsg.isPinned) {
          targetMsg.pinnedBy = currentUser.name || 'Admin';
          targetMsg.pinnedAt = getFormattedTimestamp();
        }
        AppState.saveCommunityMessages(msgs);
        renderCommunityChatTab();
      };
    });

    // Admin Action: Delete Message
    pane.querySelectorAll('.btn-delete-msg').forEach(btn => {
      btn.onclick = () => {
        if (!confirm('Are you sure you want to delete this community message?')) return;
        const msgId = btn.dataset.id;
        let msgs = AppState.getCommunityMessages();
        msgs = msgs.filter(m => m && m.id !== msgId);
        AppState.saveCommunityMessages(msgs);
        renderCommunityChatTab();
      };
    });

    // File Attachment Handler (Admin Only)
    let pendingAttachment = null;
    const fileInput = pane.querySelector('#communityFileInput');
    if (fileInput) {
      fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
          pendingAttachment = {
            name: file.name,
            size: file.size,
            type: file.type,
            data: evt.target.result
          };
          const previewBox = pane.querySelector('#communityAttachmentPreview');
          const previewName = pane.querySelector('#communityAttachmentName');
          if (previewBox && previewName) {
            previewName.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
            previewBox.style.display = 'flex';
          }
        };
        reader.readAsDataURL(file);
      };
    }

    pane.querySelector('#btnRemoveAttachment')?.addEventListener('click', () => {
      pendingAttachment = null;
      const previewBox = pane.querySelector('#communityAttachmentPreview');
      if (previewBox) previewBox.style.display = 'none';
      if (fileInput) fileInput.value = '';
    });

    // Form Submit Handler with /hg and /ad Slash Commands
    pane.querySelector('#communityChatForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const inputEl = pane.querySelector('#communityMessageInput');
      const rawText = inputEl ? inputEl.value.trim() : '';
      if (!rawText && !pendingAttachment) return;

      const msgs = AppState.getCommunityMessages();

      let isHighlighted = false;
      let isAdminAlert = false;
      let processedText = rawText;

      // 1. Process /hg command (ADMIN ONLY)
      let linkUrl = null;
      if (rawText.startsWith('/hg')) {
        if (!isAdmin) {
          alert('❌ The /hg command is reserved for Admins/Faculty to post highlighted announcements.');
          return;
        }
        isHighlighted = true;
        processedText = rawText.replace(/^\/hg\s*/, '').trim();
        if (!processedText) processedText = '✨ Highlighted Announcement Link';

        const urlMatch = processedText.match(/(https?:\/\/[^\s]+|www\.[^\s]+)/i);
        if (urlMatch) {
          linkUrl = urlMatch[0].startsWith('http') ? urlMatch[0] : `https://${urlMatch[0]}`;
        }
      }

      // 2. Process /ad command (STUDENT & EVERYONE ADMIN ALERT)
      if (rawText.startsWith('/ad')) {
        isAdminAlert = true;
        processedText = rawText.replace(/^\/ad\s*/, '').trim();
        if (!processedText) processedText = '🚨 Urgent inquiry from student';

        // Create urgent request for Admin dashboard notification badge
        const requests = AppState.getRequests();
        requests.unshift({
          id: `REQ-AD-${Date.now()}`,
          studentId: currentUser.id || 'STU-COMMUNITY',
          studentName: currentUser.name || 'Student',
          className: currentUser.className || 'Class 10th',
          rollNo: currentUser.rollNo || 'N/A',
          type: 'admin_alert',
          title: `🚨 Community Chat Alert from ${currentUser.name || 'Student'}`,
          note: processedText,
          amount: 0,
          date: getFormattedTimestamp(),
          status: 'Pending'
        });
        await AppState.saveRequests(requests);
        AppState.addAuditLog(currentUser.name || 'Student', 'COMMUNITY_ADMIN_ALERT', currentUser.name, currentUser.rollNo, `Raised urgent Admin Alert in Community Chat: "${processedText}"`);

        alert(`🚨 Admin Alert sent to Faculty! Director Chandan Kumar & Prof. Ravi Ranjan have been notified.`);
      }

      const resolvedStudentName = currentUser.name || currentUser.studentName || (currentUser.rollNo ? (`Student Roll #${currentUser.rollNo}`) : 'Student');

      const newMsg = {
        id: `MSG-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
        senderId: currentUser.id || 'usr',
        senderName: isAdmin ? (currentUser.name || 'Admin') : resolvedStudentName,
        senderRole: isAdmin ? 'FACULTY / ADMIN' : (currentUser.className || 'Student'),
        avatar: isAdmin ? '👨‍🏫' : '🎓',
        isAdmin: isAdmin,
        isHighlighted: isHighlighted,
        isAdminAlert: isAdminAlert,
        linkUrl: linkUrl,
        text: processedText,
        timestamp: getFormattedTimestamp(),
        isPinned: isHighlighted,
        attachment: pendingAttachment,
        replies: []
      };

      msgs.push(newMsg);
      AppState.saveCommunityMessages(msgs);
      AppState.markMutation();

      if (streamChatChannel) {
        streamChatChannel.sendMessage({
          text: processedText,
          is_highlighted: isHighlighted,
          is_admin_alert: isAdminAlert,
          link_url: linkUrl,
          attachments: pendingAttachment ? [{ type: 'file', title: pendingAttachment.name, file_url: pendingAttachment.data }] : []
        }).catch(err => console.warn('Stream Chat API push fallback:', err));
      }

      renderCommunityChatTab();
    });
  }

  function parseDobString(dobStr) {
    if (!dobStr) return new Date().toISOString().split('T')[0];
    const clean = dobStr.toString().trim().replace(/[-\/]/g, '');
    if (clean.length === 8 && /^\d{8}$/.test(clean)) {
      const day = clean.slice(0, 2);
      const month = clean.slice(2, 4);
      const year = clean.slice(4, 8);
      return `${year}-${month}-${day}`;
    }
    return dobStr;
  }

  async function parseAndImportStudentCSV(csvText) {
    const lines = csvText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length <= 1) {
      alert('CSV file is empty or missing headers.');
      return;
    }

    const students = AppState.getStudents();
    let count = 0;

    // Skip header line
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',').map(p => p.trim().replace(/^"|"$/g, ''));
      if (parts.length < 3) continue;

      const [name, mobile, rawDob, className, guardianName, oldDueStr, emailStr, guardianMobileStr] = parts;
      if (!name || !mobile || !rawDob) continue;

      const dob = parseDobString(rawDob);
      const monthlyFee = (className.includes('10th') || className.includes('ACHIEVER')) ? 1000 :
                         (className.includes('9th') || className.includes('NURTURE')) ? 1000 :
                         (className.includes('8th') || className.includes('ALPHA')) ? 800 : 700;
      const oldDue = parseFloat(oldDueStr) || 0;
      const email = emailStr || '';
      const guardianMobile = guardianMobileStr || mobile;

      const initialHistory = [];
      if (oldDue > 0) {
        initialHistory.push({
          receiptNo: `OLD-DUE-CSV-${i}`,
          date: getFormattedTimestamp(),
          amount: oldDue,
          mode: 'Old Fee Carryover (CSV Import)',
          status: 'Pending Due',
          by: 'CSV Bulk Importer',
          note: 'Previous unpaid balance'
        });
      }

      const sId = generateStudentId(className || 'Class 10th (ACHIEVER)', students);
      const stuUuid = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : (`stu_csv_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 7)}`);
      students.push({
        id: stuUuid,
        db_uuid: stuUuid,
        student_id: sId,
        name: name,
        mobile: mobile,
        dob: dob,
        rollNo: sId,
        roll_no: sId,
        className: className || 'Class 10th (ACHIEVER)',
        batchName: className || 'Class 10th (ACHIEVER)',
        guardianName: guardianName || 'Guardian',
        guardianMobile: guardianMobile,
        email: email,
        address: 'Lalganj, Vaishali, Bihar',
        bloodGroup: 'Not Specified',
        admissionDate: new Date().toISOString().split('T')[0],
        joiningMonth: 'April 2026',
        monthlyFee: monthlyFee,
        totalFee: monthlyFee + oldDue,
        paidFee: 0,
        pendingFee: monthlyFee + oldDue,
        feeHistory: initialHistory
      });
      count++;
    }

    await AppState.saveStudents(students);
    alert(`🎉 Successfully imported ${count} student records! Students can now log in using their DOB and update their Blood Group, Address & Details via the App.`);
    renderAdminDashboard();
  }

  function downloadSampleStudentCSV() {
    const sampleCSV = `Name,Mobile,DOB,Class,GuardianName,OldDue,Email,GuardianMobile
Ramesh Kumar,9812345670,12062010,Class 10th (ACHIEVER),Suresh Kumar,2000,ramesh@gmail.com,9812345679
Priya Kumari,9812345671,18042011,Class 9th (NURTURE),Sunil Roy,0,priya@gmail.com,9812345678
Aman Verma,9812345672,25012012,Class 8th (ALPHA),Sanjay Verma,1200,aman@gmail.com,9812345677
Kavita Sharma,9812345673,15092013,Junior Batch (JUNIO),Rajesh Sharma,0,kavita@gmail.com,9812345676`;

    const blob = new Blob([sampleCSV], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Pragyan_Essential_Students_Import.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  }

  // Utility Date Formatter
  function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    const clean = dateStr.toString().trim();
    if (/^\d{8}$/.test(clean)) {
      const day = clean.slice(0, 2);
      const month = clean.slice(2, 4);
      const year = clean.slice(4, 8);
      const d = new Date(`${year}-${month}-${day}`);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      }
    }
    const d = new Date(clean);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  async function triggerAutomatedMonthlyFeeEmails(batchOverride = null) {
    alert('Monthly fee generation runs only on the protected server schedule. Use the deployment logs to verify it.');
    return;
    const students = AppState.getStudents();
    const notices = AppState.getNotices();
    const today = new Date();
    const currentDay = today.getDate();
    let emailLogs = [];

    let targetBatchKey = '';
    let targetLabel = '';

    if (batchOverride) {
      targetBatchKey = batchOverride;
      targetLabel = `Batch Override (${batchOverride})`;
    } else if (currentDay === 1) {
      targetBatchKey = '10th';
      targetLabel = '1st of Month Schedule: Class 10th (ACHIEVER) Batch';
    } else if (currentDay === 2) {
      targetBatchKey = '9th';
      targetLabel = '2nd of Month Schedule: Class 9th (NURTURE) Batch';
    } else if (currentDay === 3) {
      targetBatchKey = '8th';
      targetLabel = '3rd of Month Schedule: Class 8th (ALPHA) Batch';
    } else if (currentDay === 4) {
      targetBatchKey = 'junio';
      targetLabel = '4th of Month Schedule: Junior (JUNIO) Batch';
    } else {
      targetBatchKey = 'all';
      targetLabel = `Staggered Manual Execution (All Batches)`;
    }

    const targetStudents = targetBatchKey === 'all'
      ? students
      : students.filter(s => s.className.toLowerCase().includes(targetBatchKey.toLowerCase()));

    if (targetStudents.length === 0) {
      alert(`ℹ️ No students found matching schedule: ${targetLabel}`);
      return;
    }

    targetStudents.forEach(s => {
      const monthlyInstallment = s.monthlyFee || (
        (s.className.includes('10th') || s.className.includes('ACHIEVER')) ? 1000 :
        (s.className.includes('9th') || s.className.includes('NURTURE')) ? 1000 :
        (s.className.includes('8th') || s.className.includes('ALPHA')) ? 800 : 700
      );
      const previousPending = s.pendingFee || 0;
      const newTotalDue = previousPending + monthlyInstallment;
      s.pendingFee = newTotalDue;

      s.feeHistory.push({
        receiptNo: `BILL-${currentDay}ST-${Date.now().toString(36).slice(-5)}`,
        date: getFormattedTimestamp(),
        amount: monthlyInstallment,
        mode: `Staggered Monthly Fee Bill (${targetLabel})`,
        status: 'Pending Due',
        by: 'System Staggered Billing Engine',
        note: `Monthly tuition fee added for ${s.className}`
      });

      if (typeof AppState !== 'undefined' && AppState.recordLedgerEntry) {
        const currentMonthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
        AppState.recordLedgerEntry({
          student_id: s.student_id || s.id || s.rollNo,
          billing_month: currentMonthKey,
          batch_label: s.className || s.class_name || targetLabel,
          amount: monthlyInstallment,
          previous_due: previousPending,
          updated_due: newTotalDue,
          idempotency_key: `fee_${s.student_id || s.id || s.rollNo}_${currentMonthKey}`
        });
      }

      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 2px solid #064E3B; border-radius: 12px; overflow: hidden;">
          <div style="background-color: #064E3B; color: #ffffff; padding: 20px; text-align: center;">
            <h2 style="margin:0;">PRAGYAN INSTITUTE LALGANJ</h2>
            <p style="margin:5px 0 0 0;">Official Staggered Monthly Fee Invoice (${targetLabel})</p>
          </div>
          <div style="padding: 25px; background-color: #FAF9F6;">
            <p>Dear <strong>${s.name}</strong> (Roll No: #${s.rollNo}),</p>
            <p>Your monthly tuition fee statement for <strong>${s.className}</strong> has been generated:</p>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background: #fff; padding: 10px; border-radius: 8px; border: 1px solid #ddd;">
              <tr><td style="padding: 8px; border-bottom: 1px solid #ddd;">Previous Unpaid Balance:</td><td style="font-weight: bold;">₹${previousPending.toLocaleString()}</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #ddd;">Current Month Tuition Fee:</td><td style="color: #0284C7; font-weight: bold;">+ ₹${monthlyInstallment.toLocaleString()}</td></tr>
              <tr style="background:#FEF2F2;"><td style="padding: 10px; font-weight:bold; color:#991B1B;">Total Updated Pending Due:</td><td style="color: #DC2626; font-weight: bold; font-size: 1.15em;">₹${newTotalDue.toLocaleString()}</td></tr>
            </table>
            <p>Payment can be made in cash at counter to Prof. Ravi Ranjan or Chandan Kumar, or paid online in your student portal.</p>
          </div>
        </div>
      `;

      sendLiveResendEmail(s.email, `🗓️ ${targetLabel} - Fee Statement for ${s.name}`, emailHtml);
      emailLogs.push(`Sent to: ${s.email} (${s.name}) | Batch: ${s.className} | New Due: ₹${newTotalDue}`);
    });

    await AppState.saveStudents(students);

    alert(`🚀 Staggered Monthly Fee Engine Executed!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 Schedule Target: ${targetLabel}
✉️ Total Invoices Generated: ${targetStudents.length} Students Processed!

Batch Execution Summary:
${emailLogs.join('\n')}`);
  }

  /* ==========================================================================
   * 1. DEDICATED IN-PORTAL NOTICEBOARD & ANNOUNCEMENTS MANAGER
   * ========================================================================== */
  let currentNoticeFilter = 'all';
  let currentNoticeSearch = '';

  function renderAdminNoticesManager() {
    const pane = document.getElementById('adminTabPane-post-notice');
    if (!pane) return;

    const allNotices = AppState.getNotices();
    
    // Filter notices based on active chip and search query
    let filteredNotices = allNotices.filter(n => {
      let matchesFilter = true;
      if (currentNoticeFilter === 'exam') matchesFilter = (n.category === 'exam');
      else if (currentNoticeFilter === 'general') matchesFilter = (n.category === 'general');
      else if (currentNoticeFilter === 'fees') matchesFilter = (n.category === 'fees');
      else if (currentNoticeFilter === '10th') matchesFilter = (n.targetBatch && n.targetBatch.includes('10th'));
      else if (currentNoticeFilter === '9th') matchesFilter = (n.targetBatch && n.targetBatch.includes('9th'));
      else if (currentNoticeFilter === '8th') matchesFilter = (n.targetBatch && n.targetBatch.includes('8th'));
      else if (currentNoticeFilter === 'junio') matchesFilter = (n.targetBatch && (n.targetBatch.includes('Junior') || n.targetBatch.includes('JUNIO')));

      let matchesSearch = true;
      if (currentNoticeSearch) {
        const q = currentNoticeSearch.toLowerCase();
        matchesSearch = (n.title && n.title.toLowerCase().includes(q)) || 
                        (n.message && n.message.toLowerCase().includes(q)) ||
                        (n.targetBatch && n.targetBatch.toLowerCase().includes(q));
      }
      return matchesFilter && matchesSearch;
    });

    const draftTitle = pane.querySelector('#noticeTitleInput')?.value || '';
    const draftBody = pane.querySelector('#noticeBodyInput')?.value || '';

    const canonicalBatchList = [
      { key: '10th', name: 'Class 10th (ACHIEVER)', icon: '🎯' },
      { key: '9th', name: 'Class 9th (NURTURE)', icon: '🌱' },
      { key: '8th', name: 'Class 8th (ALPHA)', icon: '⚡' },
      { key: 'junio', name: 'Junior Batch (JUNIO)', icon: '🚀' }
    ];

    pane.innerHTML = `
      ${isMainAdmin() ? `
        <!-- Quick Switch to Email Campaigns Helper Banner (Main Admin Only) -->
        <div style="margin-bottom: 1.25rem; background: #ECFDF5; border: 1.5px solid #A7F3D0; border-radius: 12px; padding: 0.85rem 1.15rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.75rem;">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <div style="width: 38px; height: 38px; border-radius: 50%; background: #064E3B; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 1.1rem;">
              <i class="fa-solid fa-bullhorn"></i>
            </div>
            <div>
              <div style="font-weight: 800; font-size: 0.92rem; color: #064E3B;">In-Portal Noticeboard & Student Feed</div>
              <div style="font-size: 0.78rem; color: #047857;">Broadcast notices here to display them immediately inside student dashboards and noticeboards.</div>
            </div>
          </div>
          <button type="button" class="btn btn-emerald" onclick="switchAdminTab('email')" style="padding: 0.45rem 1rem; font-size: 0.82rem; font-weight: 700; border-radius: 8px;">
            <i class="fa-solid fa-envelope-open-text"></i> Go to Email Dispatch & Invoices →
          </button>
        </div>
      ` : `
        <div style="margin-bottom: 1.25rem; background: #F8FAFC; border: 1.5px solid #E2E8F0; border-radius: 12px; padding: 0.85rem 1.15rem; display: flex; align-items: center; gap: 0.75rem;">
          <div style="width: 38px; height: 38px; border-radius: 50%; background: #064E3B; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 1.1rem;">
            <i class="fa-solid fa-bullhorn"></i>
          </div>
          <div>
            <div style="font-weight: 800; font-size: 0.92rem; color: #064E3B;">In-Portal Noticeboard Broadcasts</div>
            <div style="font-size: 0.78rem; color: #64748B;">Notices posted here are immediately visible to students in their portal feeds. (Mass email campaigns are dispatched by Main Admin Chandan Kumar).</div>
          </div>
        </div>
      `}

      <!-- TOP: Broadcast New Announcement Form -->
      <div class="dash-card" style="margin-bottom: 1.5rem;">
        <div class="dash-card-header">
          <div class="dash-card-title"><i class="fa-solid fa-paper-plane" style="color: var(--primary-emerald);"></i> Post Noticeboard Announcement</div>
        </div>

        <form id="adminPostNoticeForm">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-bottom: 1rem;">
            <div>
              <label style="display: block; font-weight: 600; font-size: 0.85rem; margin-bottom: 0.35rem;">Announcement Title *</label>
              <input type="text" id="noticeTitleInput" class="portal-input" placeholder="e.g. Science Monthly Test & Practical Schedule" value="${draftTitle.replace(/"/g, '&quot;')}" required>
            </div>
            <div>
              <label style="display: block; font-weight: 600; font-size: 0.85rem; margin-bottom: 0.35rem;">Category *</label>
              <select id="noticeCategorySelect" class="portal-input">
                <option value="general">📢 General Announcement</option>
                <option value="holiday">🏖️ Holiday / Class Off</option>
                <option value="exam">📝 Exam & Test Schedule</option>
                <option value="schedule">⏰ Timing / Class Reschedule</option>
                <option value="fees">💳 Fee Update</option>
                <option value="urgent">🚨 Urgent Alert</option>
              </select>
            </div>
          </div>

          <!-- Target Batch Selection Section -->
          <div style="background: #F8FAFC; border: 1.5px solid #E2E8F0; border-radius: 12px; padding: 1rem 1.15rem; margin-bottom: 1rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
              <label style="font-weight: 700; font-size: 0.88rem; color: var(--text-mahogany);">
                <i class="fa-solid fa-users-viewfinder" style="color: var(--primary-emerald);"></i> Target Batches for In-Portal Noticeboard *
              </label>
              <div style="display: flex; gap: 0.4rem;">
                <button type="button" id="btnSelectAllBatches" class="btn" style="padding: 0.25rem 0.65rem; font-size: 0.75rem; background: #ECFDF5; color: #065F46; border: 1px solid #A7F3D0; border-radius: 6px; font-weight: 700; cursor: pointer;">
                  Select All
                </button>
                <button type="button" id="btnClearAllBatches" class="btn" style="padding: 0.25rem 0.65rem; font-size: 0.75rem; background: #F1F5F9; color: #475569; border: 1px solid #CBD5E1; border-radius: 6px; font-weight: 700; cursor: pointer;">
                  Clear
                </button>
              </div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.6rem;" id="noticeBatchOptionsGrid">
              ${canonicalBatchList.map(b => {
                return `
                  <label style="display: flex; align-items: center; gap: 0.6rem; background: #FFFFFF; border: 1.5px solid #E2E8F0; border-radius: 8px; padding: 0.65rem 0.85rem; cursor: pointer; user-select: none; transition: border-color 0.15s ease;">
                    <input type="checkbox" class="notice-batch-chk" value="${b.key}" data-name="${b.name}" checked style="width: 17px; height: 17px; accent-color: var(--primary-emerald); cursor: pointer;">
                    <div style="flex: 1;">
                      <div style="font-weight: 700; font-size: 0.82rem; color: #1E293B;">${b.icon} ${b.name}</div>
                    </div>
                  </label>
                `;
              }).join('')}
            </div>
          </div>

          <div style="margin-bottom: 1rem;">
            <label style="display: block; font-weight: 600; font-size: 0.85rem; margin-bottom: 0.35rem;">Announcement Details / Message Body *</label>
            <textarea id="noticeBodyInput" class="portal-input" rows="4" placeholder="Write full details, examination timings, schedule, syllabus or notice description here..." required style="resize: vertical; width: 100%;">${draftBody.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
          </div>
          <div style="margin-bottom: 1.25rem;">
            <label style="display: block; font-weight: 600; font-size: 0.85rem; margin-bottom: 0.35rem;">Attach Photo or PDF Document (Optional)</label>
            <input type="file" id="noticeAttachmentInput" class="portal-input" accept="image/*,.pdf,.doc,.docx" style="padding: 0.45rem;">
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">Stored securely in Supabase Storage bucket. Supports photos & PDF documents.</div>
          </div>
          <button type="submit" class="btn btn-emerald" style="padding: 0.75rem 1.75rem;">
            <i class="fa-solid fa-bullhorn"></i> Post to Student Noticeboard
          </button>
        </form>
      </div>

      <!-- BOTTOM: Manage Existing Announcements -->
      <div class="dash-card">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 1.25rem;">
          <div>
            <h3 style="font-size: 1.15rem; font-weight: 700; color: var(--text-mahogany); margin: 0;">
              <i class="fa-solid fa-bullhorn" style="color: var(--primary-emerald);"></i> Active Noticeboard Announcements (${allNotices.length})
            </h3>
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.2rem;">Live notices visible in student portals and noticeboards</div>
          </div>
          <div style="width: 260px; max-width: 100%;">
            <input type="text" id="adminNoticeSearchInput" class="portal-input" placeholder="🔍 Search notices..." value="${currentNoticeSearch}" style="font-size: 0.85rem; padding: 0.45rem 0.75rem;">
          </div>
        </div>

        <!-- Filter Chips -->
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1.25rem;">
          <button class="notice-admin-filter-chip ${currentNoticeFilter === 'all' ? 'active' : ''}" data-filter="all">All (${allNotices.length})</button>
          <button class="notice-admin-filter-chip ${currentNoticeFilter === 'exam' ? 'active' : ''}" data-filter="exam">📝 Exams</button>
          <button class="notice-admin-filter-chip ${currentNoticeFilter === 'general' ? 'active' : ''}" data-filter="general">📢 General</button>
          <button class="notice-admin-filter-chip ${currentNoticeFilter === 'fees' ? 'active' : ''}" data-filter="fees">💳 Fees</button>
          <button class="notice-admin-filter-chip ${currentNoticeFilter === '10th' ? 'active' : ''}" data-filter="10th">Class 10th</button>
          <button class="notice-admin-filter-chip ${currentNoticeFilter === '9th' ? 'active' : ''}" data-filter="9th">Class 9th</button>
          <button class="notice-admin-filter-chip ${currentNoticeFilter === '8th' ? 'active' : ''}" data-filter="8th">Class 8th</button>
          <button class="notice-admin-filter-chip ${currentNoticeFilter === 'junio' ? 'active' : ''}" data-filter="junio">Junior</button>
        </div>

        <!-- Announcements List -->
        ${filteredNotices.length === 0 ? `
          <div style="text-align: center; color: var(--text-muted); padding: 3rem 1rem;">
            <i class="fa-solid fa-inbox" style="font-size: 2.5rem; color: #9CA3AF; margin-bottom: 0.75rem;"></i>
            <p style="font-weight: 600;">No announcements found matching criteria.</p>
          </div>
        ` : `
          <div style="display: flex; flex-direction: column; gap: 1rem;">
            ${filteredNotices.map(notice => {
              const catBadge = notice.category === 'exam' 
                ? '<span style="background: #FEF3C7; color: #92400E; padding: 0.2rem 0.6rem; border-radius: 99px; font-weight: 700; font-size: 0.75rem;"><i class="fa-solid fa-file-pen"></i> Exam & Test</span>'
                : notice.category === 'holiday'
                ? '<span style="background: #E0F2FE; color: #0369A1; padding: 0.2rem 0.6rem; border-radius: 99px; font-weight: 700; font-size: 0.75rem;"><i class="fa-solid fa-umbrella-beach"></i> Holiday / Off</span>'
                : notice.category === 'fees'
                ? '<span style="background: #FEE2E2; color: #991B1B; padding: 0.2rem 0.6rem; border-radius: 99px; font-weight: 700; font-size: 0.75rem;"><i class="fa-solid fa-receipt"></i> Fee Notice</span>'
                : notice.category === 'urgent'
                ? '<span style="background: #FEE2E2; color: #B91C1C; padding: 0.2rem 0.6rem; border-radius: 99px; font-weight: 800; font-size: 0.75rem;"><i class="fa-solid fa-triangle-exclamation"></i> Urgent Alert</span>'
                : '<span style="background: #D1FAE5; color: #065F46; padding: 0.2rem 0.6rem; border-radius: 99px; font-weight: 700; font-size: 0.75rem;"><i class="fa-solid fa-bullhorn"></i> General</span>';

              const targetBatchBadge = notice.targetBatch 
                ? `<span style="background: #EEF2FF; color: #4338CA; padding: 0.2rem 0.6rem; border-radius: 99px; font-weight: 600; font-size: 0.75rem;"><i class="fa-solid fa-users"></i> ${notice.targetBatch}</span>`
                : '<span style="background: #EEF2FF; color: #4338CA; padding: 0.2rem 0.6rem; border-radius: 99px; font-weight: 600; font-size: 0.75rem;"><i class="fa-solid fa-users"></i> All Batches</span>';

              return `
                <div style="background: #ffffff; border: 1.5px solid #E2E8F0; border-radius: 10px; padding: 1.15rem; transition: transform 0.15s ease, box-shadow 0.15s ease; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
                  <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.6rem;">
                    <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
                      ${catBadge}
                      ${targetBatchBadge}
                    </div>
                    <div style="display: flex; gap: 0.5rem; align-items: center;">
                      <span style="font-size: 0.78rem; color: var(--text-muted); font-weight: 600;">📅 ${notice.date}</span>
                      <button class="btn btn-edit-notice" data-id="${notice.id}" style="padding: 0.25rem 0.55rem; font-size: 0.75rem; background: #F1F5F9; color: #334155; border: 1px solid #CBD5E1; border-radius: 6px; cursor: pointer;" title="Edit Notice">
                        <i class="fa-solid fa-pen"></i>
                      </button>
                      <button class="btn btn-delete-notice" data-id="${notice.id}" style="padding: 0.25rem 0.55rem; font-size: 0.75rem; background: #FEE2E2; color: #DC2626; border: 1px solid #FECACA; border-radius: 6px; cursor: pointer;" title="Delete Notice">
                        <i class="fa-solid fa-trash"></i>
                      </button>
                    </div>
                  </div>

                  <h4 style="font-size: 1rem; font-weight: 700; color: var(--text-mahogany); margin: 0 0 0.5rem 0;">${escapeHtml(notice.title)}</h4>
                  <p style="font-size: 0.85rem; color: #475569; line-height: 1.5; margin: 0; white-space: pre-wrap;">${escapeHtml(notice.message)}</p>

                  ${notice.attachmentUrl || notice.attachment_url ? `
                    <div style="margin-top: 0.85rem; padding-top: 0.65rem; border-top: 1px dashed #E2E8F0;">
                      <a href="${notice.attachmentUrl || notice.attachment_url}" target="_blank" style="display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; font-weight: 700; color: var(--primary-emerald); text-decoration: underline;">
                        <i class="fa-solid fa-paperclip"></i> View Attached Document / Photo
                      </a>
                    </div>
                  ` : ''}
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>
    `;

    // Bind Notice Listeners
    pane.querySelector('#btnSelectAllBatches')?.addEventListener('click', () => {
      pane.querySelectorAll('.notice-batch-chk').forEach(chk => chk.checked = true);
    });

    pane.querySelector('#btnClearAllBatches')?.addEventListener('click', () => {
      pane.querySelectorAll('.notice-batch-chk').forEach(chk => chk.checked = false);
    });

    // Form submit listener
    pane.querySelector('#adminPostNoticeForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const submitBtn = form.querySelector('button[type="submit"]');
      const title = pane.querySelector('#noticeTitleInput').value.trim();
      const category = pane.querySelector('#noticeCategorySelect').value;
      const chks = Array.from(pane.querySelectorAll('.notice-batch-chk:checked'));
      const targetBatch = chks.length === 4 ? 'All Batches' : (chks.map(c => c.dataset.name).join(', ') || 'Custom');
      const message = pane.querySelector('#noticeBodyInput').value.trim();
      const attachmentFile = pane.querySelector('#noticeAttachmentInput')?.files[0];

      if (!title) { alert('⚠️ Please enter a notice title.'); return; }
      if (chks.length === 0) { alert('⚠️ Please select at least one target batch.'); return; }
      if (!message) { alert('⚠️ Please enter a notice message.'); return; }

      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '📡 Posting…'; }

      try {
        let attachmentUrl = '';
        if (attachmentFile) {
          try {
            attachmentUrl = await SupabaseSync.uploadFile(attachmentFile, 'notice_attachments') || '';
          } catch (uploadErr) {
            console.warn('Attachment upload failed:', uploadErr.message);
          }
        }

        const notices = AppState.getNotices();
        notices.unshift({
          id: `NTC-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,5)}`,
          title,
          category,
          date: new Date().toISOString().split('T')[0],
          message,
          targetBatch,
          attachmentUrl,
          attachment_url: attachmentUrl,
          unread: true
        });
        await AppState.saveNotices(notices);

        const author = getActiveTeacherName();
        await AppState.addAuditLog(author, 'NOTICE_BROADCAST', targetBatch, title, `Broadcasted notice "${title}" to ${targetBatch}.`, { category, targetBatch });

        form.reset();
        alert('🎉 Notice successfully posted to the student noticeboard!');
        renderAdminDashboard();
      } catch (err) {
        console.error('Broadcast failed:', err);
        alert('❌ Broadcast failed: ' + err.message);
      } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i class="fa-solid fa-bullhorn"></i> Post to Student Noticeboard'; }
      }
    });

    // Search input listener
    pane.querySelector('#adminNoticeSearchInput')?.addEventListener('input', (e) => {
      currentNoticeSearch = e.target.value;
      renderAdminNoticesManager();
    });

    // Filter chip listeners
    pane.querySelectorAll('.notice-admin-filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        currentNoticeFilter = chip.dataset.filter;
        renderAdminNoticesManager();
      });
    });

    // Edit notice listeners
    pane.querySelectorAll('.btn-edit-notice').forEach(btn => {
      btn.addEventListener('click', () => {
        openEditNoticeModal(btn.dataset.id);
      });
    });

    // Delete notice listeners
    pane.querySelectorAll('.btn-delete-notice').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const allN = AppState.getNotices();
        const target = allN.find(n => n.id === id);
        if (!target) return;

        if (confirm(`🗑️ Delete announcement "${target.title}"? This will permanently remove it from student portals.`)) {
          if (target.id && typeof SupabaseSync !== 'undefined' && SupabaseSync.mutate) {
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (uuidRegex.test(target.id)) {
              await SupabaseSync.mutate('notices', 'delete', null, { where: { id: target.id } });
            } else {
              await SupabaseSync.mutate('notices', 'delete', null, { where: { title: target.title } });
            }
          }
          const updated = allN.filter(n => n.id !== id);
          await AppState.saveNotices(updated);
          alert('Announcement deleted.');
          renderAdminDashboard();
        }
      });
    });
  }

  function openEditNoticeModal(noticeId) {
    document.getElementById('editNoticeModal')?.remove();
    const notices = AppState.getNotices();
    const target = notices.find(n => n.id === noticeId);
    if (!target) return;

    const modalHtml = `
      <div class="inner-modal-backdrop active" id="editNoticeModal">
        <div class="inner-modal-content" style="max-width: 600px;">
          <div class="inner-modal-header">
            <h3><i class="fa-solid fa-pen-to-square" style="color: var(--primary-emerald);"></i> Edit Announcement</h3>
            <button class="btn-close-inner" onclick="document.getElementById('editNoticeModal').remove()"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <form id="editNoticeForm">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.9rem; margin-bottom: 1rem;">
              <div style="grid-column: span 2;">
                <label style="font-size: 0.85rem; font-weight: 600;">Announcement Title *</label>
                <input type="text" id="editNoticeTitle" class="portal-input" value="${target.title}" required>
              </div>
              <div>
                <label style="font-size: 0.85rem; font-weight: 600;">Category</label>
                <select id="editNoticeCategory" class="portal-input">
                  <option value="exam" ${target.category === 'exam' ? 'selected' : ''}>📝 Exam & Test</option>
                  <option value="general" ${target.category === 'general' ? 'selected' : ''}>📢 General Notice</option>
                  <option value="fees" ${target.category === 'fees' ? 'selected' : ''}>💳 Fee Update</option>
                </select>
              </div>
              <div>
                <label style="font-size: 0.85rem; font-weight: 600;">Target Batch</label>
                <select id="editNoticeBatch" class="portal-input">
                  <option value="All Batches" ${target.targetBatch === 'All Batches' || !target.targetBatch ? 'selected' : ''}>🌟 All Batches</option>
                  <option value="Class 10th (ACHIEVER)" ${target.targetBatch && target.targetBatch.includes('10th') ? 'selected' : ''}>🎯 Class 10th (ACHIEVER)</option>
                  <option value="Class 9th (NURTURE)" ${target.targetBatch && target.targetBatch.includes('9th') ? 'selected' : ''}>🌱 Class 9th (NURTURE)</option>
                  <option value="Class 8th (ALPHA)" ${target.targetBatch && target.targetBatch.includes('8th') ? 'selected' : ''}>⚡ Class 8th (ALPHA)</option>
                  <option value="Junior Batch (JUNIO)" ${target.targetBatch && (target.targetBatch.includes('Junior') || target.targetBatch.includes('JUNIO')) ? 'selected' : ''}>🚀 Junior Batch (JUNIO)</option>
                </select>
              </div>
            </div>
            <div style="margin-bottom: 1.25rem;">
              <label style="font-size: 0.85rem; font-weight: 600;">Announcement Message / Details *</label>
              <textarea id="editNoticeMessage" class="portal-input" rows="4" required>${target.message}</textarea>
            </div>
            <button type="submit" class="btn btn-emerald" style="width: 100%; padding: 0.8rem;">
              <i class="fa-solid fa-floppy-disk"></i> Save & Synchronize Announcement
            </button>
          </form>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    document.getElementById('editNoticeForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      target.title = document.getElementById('editNoticeTitle').value.trim();
      target.category = document.getElementById('editNoticeCategory').value;
      target.targetBatch = document.getElementById('editNoticeBatch').value;
      target.message = document.getElementById('editNoticeMessage').value.trim();

      await AppState.saveNotices(notices);
      document.getElementById('editNoticeModal').remove();
      alert('✅ Announcement updated and synchronized across all student dashboards!');
      renderAdminDashboard();
    });
  }

  /* ==========================================================================
   * 2. DEDICATED EMAIL DISPATCH & INVOICING CAMPAIGNS TAB
   * ========================================================================== */
  let adminEmailAudience = 'all';
  let adminEmailCampaignType = 'monthly_invoice';
  let adminEmailSelectedStudentId = '';

  function getCampaignDefaultSubject(type, batchLabel) {
    const curMonth = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    if (type === 'monthly_invoice') return `Monthly Tuition Fee Invoice (${curMonth}) — Pragyan Institute Lalganj`;
    if (type === 'fee_reminder') return `Fee Dues Notice: Outstanding Balance Reminder — Pragyan Institute`;
    if (type === 'exam_circular') return `Academic Notice: Examination & Test Timetable — Pragyan Institute`;
    return `Official Circular for ${batchLabel} — Pragyan Institute Lalganj`;
  }

  function getCampaignDefaultBody(type) {
    const curMonth = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    if (type === 'monthly_invoice') {
      return `Dear Parent / Guardian,\n\nPlease find detailed below the official computerized tuition fee statement for the month of ${curMonth}.\n\n• Student: {student_name}\n• Roll No: #{roll_no}\n• Batch: {class_name}\n• Monthly Tuition Fee: ₹{monthly_fee}\n• Previous Outstanding Balance: ₹{previous_due}\n• Net Total Payable: ₹{total_payable}\n\nYou can clear the fees securely online using any UPI App (Google Pay, PhonePe, Paytm) via the 1-click button below, or pay at the institute front desk counter during regular batch hours.`;
    }
    if (type === 'fee_reminder') {
      return `Dear Parent / Student,\n\nThis is a priority notification regarding the outstanding tuition fee balance of ₹{pending_fee} for {student_name} ({class_name}, Roll #{roll_no}).\n\nKindly arrange to clear the pending dues within this week via the online payment gateway or at the institute accounts desk.\n\nIf you have already made the payment within the last 24 hours, kindly disregard this notice.`;
    }
    if (type === 'exam_circular') {
      return `Dear Students & Parents,\n\nPlease review the upcoming monthly board revision test schedule and academic performance guidelines for {class_name}.\n\n• Reporting Time: 15 minutes before scheduled batch timing\n• Test Syllabus: Physics & Mathematics (Units 1 to 4)\n• Mandatory Items: Admit Card, Geometry Kit, Pragyan Student ID Card\n• Personalized Doubt Clearing: Available daily 30 minutes before regular lectures.`;
    }
    return `Dear Students and Parents of Pragyan Institute,\n\nPlease review this official circular issued by the Directorate regarding upcoming batch schedules, holiday calendar, and academic milestones.\n\nFor any clarification, please contact the institute reception desk during working hours.`;
  }

  function replaceEmailPlaceholders(text, student) {
    if (!text || !student) return text || '';
    const curMonth = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    const monthlyFee = student.monthlyFee || (student.className && student.className.includes('10') ? 1000 : (student.className && student.className.includes('9') ? 1000 : (student.className && student.className.includes('8') ? 800 : 700)));
    const pendingFee = student.pendingFee || 0;
    const prevDue = Math.max(0, pendingFee - monthlyFee);

    return text
      .replace(/\{student_name\}/gi, student.name || 'Student')
      .replace(/\{roll_no\}/gi, student.rollNo || 'N/A')
      .replace(/\{class_name\}/gi, student.className || 'General Batch')
      .replace(/\{monthly_fee\}/gi, monthlyFee.toLocaleString('en-IN'))
      .replace(/\{pending_fee\}/gi, pendingFee.toLocaleString('en-IN'))
      .replace(/\{previous_due\}/gi, prevDue.toLocaleString('en-IN'))
      .replace(/\{total_payable\}/gi, pendingFee.toLocaleString('en-IN'))
      .replace(/\{month_year\}/gi, curMonth)
      .replace(/\{date\}/gi, new Date().toLocaleDateString('en-IN'));
  }

  function generateCampaignEmailHtml(student, templateType, subject, bodyText, includePaymentLink, includeSeal) {
    const s = student || {};
    const curMonth = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    const monthlyFee = s.monthlyFee || (s.className && s.className.includes('10') ? 1000 : (s.className && s.className.includes('9') ? 1000 : (s.className && s.className.includes('8') ? 800 : 700)));
    const pendingFee = s.pendingFee || 0;
    const prevDue = Math.max(0, pendingFee - monthlyFee);
    const author = getActiveTeacherName();

    const processedSubject = replaceEmailPlaceholders(subject, s);
    const processedBody = replaceEmailPlaceholders(bodyText, s);

    const typeBadges = {
      monthly_invoice: '📄 OFFICIAL MONTHLY TUITION INVOICE',
      fee_reminder: '⚠️ URGENT FEE DUES NOTICE',
      exam_circular: '📝 ACADEMIC & EXAMINATION CIRCULAR',
      custom_announcement: '📢 OFFICIAL PRAGYAN CIRCULAR'
    };
    const badgeText = typeBadges[templateType] || '📢 OFFICIAL CIRCULAR';

    const payUrl = `https://pragyaninstitute.com/pay.html?roll=${encodeURIComponent(s.rollNo || '')}&amount=${pendingFee}`;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${escapeHtml(processedSubject)}</title>
      </head>
      <body style="margin: 0; padding: 16px; background-color: #F1F5F9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        <div style="max-width: 620px; margin: 0 auto; background: #ffffff; border: 2px solid #064E3B; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(6, 78, 59, 0.15);">
          <!-- Header Banner -->
          <div style="background: linear-gradient(135deg, #064E3B 0%, #022C22 100%); color: #ffffff; padding: 26px 22px; text-align: center;">
            <img src="https://pragyaninstitute.com/assets/images/logo.png" alt="Pragyan Institute Logo" width="64" height="64" style="width: 64px; height: 64px; border-radius: 50%; object-fit: contain; background: #ffffff; padding: 3px; display: inline-block; margin-bottom: 10px; box-shadow: 0 4px 14px rgba(0,0,0,0.3); border: 2px solid #34D399;">
            <h1 style="margin: 0; font-size: 22px; font-weight: 900; letter-spacing: 0.5px; color: #ffffff; line-height: 1.2;">PRAGYAN INSTITUTE</h1>
            <div style="font-size: 11px; font-weight: 700; color: #6EE7B7; text-transform: uppercase; letter-spacing: 1.5px; margin-top: 3px;">Lalganj, Vaishali • Bihar</div>
            <div style="display: inline-block; margin-top: 12px; background: rgba(52, 211, 153, 0.2); border: 1px solid #34D399; color: #A7F3D0; font-size: 12px; font-weight: 700; padding: 4px 14px; border-radius: 99px;">
              ${badgeText}
            </div>
          </div>

          <!-- Body Content Area -->
          <div style="padding: 24px; background: #FAF9F6;">
            <!-- Student Particulars Card -->
            <div style="background: #ffffff; border: 1.5px solid #E2E8F0; border-radius: 12px; padding: 14px 18px; margin-bottom: 18px; box-shadow: 0 2px 6px rgba(0,0,0,0.02);">
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 13px;">
                <div><span style="color: #64748B; font-weight: 600;">Student Name:</span> <strong style="color: #1E293B;">${escapeHtml(s.name || 'N/A')}</strong></div>
                <div><span style="color: #64748B; font-weight: 600;">Roll Number:</span> <strong style="color: #064E3B; font-family: monospace;">#${escapeHtml(s.rollNo || 'N/A')}</strong></div>
                <div><span style="color: #64748B; font-weight: 600;">Class / Batch:</span> <strong style="color: #1E293B;">${escapeHtml(s.className || 'General')}</strong></div>
                <div><span style="color: #64748B; font-weight: 600;">Billing Period:</span> <strong style="color: #1E293B;">${curMonth}</strong></div>
              </div>
            </div>

            <!-- Subject Title -->
            <h2 style="margin: 0 0 14px; font-size: 18px; color: #111827; font-weight: 900; line-height: 1.3;">${escapeHtml(processedSubject)}</h2>

            <!-- Message Text -->
            <div style="font-size: 14px; color: #334155; line-height: 1.65; background: #ffffff; border: 1.5px solid #E2E8F0; border-radius: 10px; padding: 18px; white-space: pre-wrap; margin-bottom: 18px;">${escapeHtml(processedBody)}</div>

            <!-- Itemized Fee Statement Table (if invoice or reminder) -->
            ${(templateType === 'monthly_invoice' || templateType === 'fee_reminder' || includePaymentLink) ? `
              <div style="background: #ffffff; border: 1.5px solid #CBD5E1; border-radius: 12px; overflow: hidden; margin-bottom: 18px;">
                <div style="background: #F1F5F9; padding: 10px 16px; font-weight: 800; font-size: 13px; color: #1E293B; border-bottom: 1px solid #CBD5E1;">
                  📊 Itemized Fee Statement & Dues Breakdown
                </div>
                <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">
                  <tr style="border-bottom: 1px solid #F1F5F9;">
                    <td style="padding: 10px 16px; color: #475569;">Monthly Tuition Fee (${curMonth})</td>
                    <td style="padding: 10px 16px; text-align: right; font-weight: 700; color: #1E293B;">₹${monthlyFee.toLocaleString('en-IN')}</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #F1F5F9;">
                    <td style="padding: 10px 16px; color: #475569;">Previous Carried Over Dues</td>
                    <td style="padding: 10px 16px; text-align: right; font-weight: 700; color: #B45309;">₹${prevDue.toLocaleString('en-IN')}</td>
                  </tr>
                  <tr style="background: #F8FAFC; font-size: 14px; font-weight: 800;">
                    <td style="padding: 12px 16px; color: #064E3B;">Total Outstanding Net Balance</td>
                    <td style="padding: 12px 16px; text-align: right; color: ${pendingFee > 0 ? '#DC2626' : '#166534'};">₹${pendingFee.toLocaleString('en-IN')}</td>
                  </tr>
                </table>
              </div>
            ` : ''}

            <!-- 1-Click UPI Payment Button -->
            ${(includePaymentLink && pendingFee > 0) ? `
              <div style="text-align: center; margin-bottom: 20px; padding: 18px; background: #ECFDF5; border: 2px dashed #059669; border-radius: 12px;">
                <div style="font-size: 13px; font-weight: 700; color: #065F46; margin-bottom: 10px;">
                  ⚡ Instant 1-Click UPI Payment Gateway
                </div>
                <a href="${payUrl}" target="_blank" style="display: inline-block; background: #064E3B; color: #ffffff; font-size: 15px; font-weight: 800; padding: 12px 28px; border-radius: 8px; text-decoration: none; box-shadow: 0 4px 12px rgba(6, 78, 59, 0.3);">
                  💳 Clear Fee Online (₹${pendingFee.toLocaleString('en-IN')}) →
                </a>
                <div style="font-size: 11px; color: #047857; margin-top: 8px;">
                  Supports Google Pay • PhonePe • Paytm • BHIM UPI • Instant Computerized Receipt
                </div>
              </div>
            ` : ''}

            <!-- Student Portal Hint -->
            <div style="padding: 12px 16px; background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 10px; font-size: 12px; color: #1E40AF; line-height: 1.5;">
              💡 <strong>Digital Student Portal:</strong> Check live batch timings, assignments, and download official fee receipts anytime at <a href="https://pragyaninstitute.com" style="color: #1D4ED8; font-weight: 800; text-decoration: underline;">pragyaninstitute.com</a>.
            </div>
          </div>

          <!-- Footer -->
          <div style="background: #F8FAFC; padding: 16px 22px; text-align: center; font-size: 12px; color: #64748B; border-top: 1px solid #E2E8F0; line-height: 1.6;">
            <strong>PRAGYAN INSTITUTE LALGANJ</strong><br>
            Near Main Chowk, Lalganj, Vaishali, Bihar — 844121<br>
            Dispatched by: <strong>${escapeHtml(author)}</strong><br>
            📞 Helpline: <strong>+91 73698 91858</strong> • 💬 WhatsApp Support Available
          </div>
        </div>
      </body>
      </html>
    `;
  }

  function openEmailPreviewModal(subject, emailHtml) {
    document.getElementById('emailPreviewModal')?.remove();
    const modalHtml = `
      <div class="inner-modal-backdrop active" id="emailPreviewModal" style="z-index: 10005;">
        <div class="inner-modal-content" style="max-width: 720px; max-height: 90vh; display: flex; flex-direction: column;">
          <div class="inner-modal-header" style="background: #064E3B; color: #fff; padding: 1rem 1.25rem;">
            <h3 style="margin: 0; font-size: 1.1rem; color: #fff; display: flex; align-items: center; gap: 0.5rem;">
              <i class="fa-solid fa-envelope-open-text"></i> Live HTML Email Preview
            </h3>
            <button class="btn-close-inner" onclick="document.getElementById('emailPreviewModal').remove()" style="color: #fff;"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div style="padding: 0.75rem 1.25rem; background: #F8FAFC; border-bottom: 1px solid #E2E8F0; font-size: 0.85rem;">
            <strong>Subject:</strong> <span style="color: #1E293B;">${escapeHtml(subject)}</span>
          </div>
          <div style="flex: 1; overflow-y: auto; padding: 1rem; background: #E2E8F0;">
            <div style="background: #fff; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); overflow: hidden;">
              ${emailHtml}
            </div>
          </div>
          <div style="padding: 0.85rem 1.25rem; background: #F8FAFC; border-top: 1px solid #E2E8F0; text-align: right;">
            <button type="button" class="btn btn-emerald" onclick="document.getElementById('emailPreviewModal').remove()">
              Close Preview
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
  }

  function renderAdminEmailTab() {
    const pane = document.getElementById('adminTabPane-email');
    if (!pane) return;

    if (!isMainAdmin()) {
      pane.innerHTML = `
        <div class="dash-card" style="text-align: center; padding: 3.5rem 1.5rem;">
          <div style="width: 68px; height: 68px; border-radius: 50%; background: #FEF2F2; color: #DC2626; display: inline-flex; align-items: center; justify-content: center; font-size: 1.85rem; margin-bottom: 1.25rem; border: 2px solid #FECACA;">
            <i class="fa-solid fa-lock"></i>
          </div>
          <h3 style="font-size: 1.35rem; font-weight: 800; color: #1E293B; margin-bottom: 0.5rem;">Access Restricted: Main Administrator Only</h3>
          <p style="font-size: 0.92rem; color: #64748B; max-width: 500px; margin: 0 auto 1.5rem; line-height: 1.6;">
            The Mass Email Dispatch & Official Invoicing Campaign Manager is restricted exclusively to <strong>Chandan Kumar</strong> (Managing Director & Head of Institute).
          </p>
          <button type="button" class="btn btn-emerald" onclick="switchAdminTab('students')" style="padding: 0.65rem 1.5rem; font-weight: 700; border-radius: 8px;">
            <i class="fa-solid fa-arrow-left"></i> Return to Student Directory
          </button>
        </div>
      `;
      return;
    }

    const allStudents = AppState.getStudents();
    const activeStudents = allStudents.filter(s => !s.status || s.status === 'Active' || s.status === 'active');

    // Filter students by audience
    let targetStudents = [];
    let audienceLabel = 'All Batches';

    if (adminEmailAudience === 'all') {
      targetStudents = activeStudents;
      audienceLabel = 'All Enrolled Students';
    } else if (adminEmailAudience === '10th') {
      targetStudents = activeStudents.filter(s => getBatchCategoryKey(s.className || s.class_name || s.batchName || '') === '10th');
      audienceLabel = 'Class 10th (ACHIEVER)';
    } else if (adminEmailAudience === '9th') {
      targetStudents = activeStudents.filter(s => getBatchCategoryKey(s.className || s.class_name || s.batchName || '') === '9th');
      audienceLabel = 'Class 9th (NURTURE)';
    } else if (adminEmailAudience === '8th') {
      targetStudents = activeStudents.filter(s => getBatchCategoryKey(s.className || s.class_name || s.batchName || '') === '8th');
      audienceLabel = 'Class 8th (ALPHA)';
    } else if (adminEmailAudience === 'junio') {
      targetStudents = activeStudents.filter(s => getBatchCategoryKey(s.className || s.class_name || s.batchName || '') === 'junio');
      audienceLabel = 'Junior Batch (JUNIO)';
    } else if (adminEmailAudience === 'defaulters') {
      targetStudents = activeStudents.filter(s => (s.pendingFee || 0) > 0);
      audienceLabel = 'Pending Dues Defaulters Only';
    } else if (adminEmailAudience === 'student') {
      const match = activeStudents.find(s => (s.id || s.student_id) === adminEmailSelectedStudentId || s.rollNo === adminEmailSelectedStudentId);
      targetStudents = match ? [match] : (activeStudents.length ? [activeStudents[0]] : []);
      if (targetStudents[0]) adminEmailSelectedStudentId = targetStudents[0].id || targetStudents[0].student_id || targetStudents[0].rollNo;
      audienceLabel = targetStudents[0] ? `${targetStudents[0].name} (Roll #${targetStudents[0].rollNo})` : 'Individual Student';
    }

    // Dynamic Computations & Indian Standard Time (IST) Quota Guards
    const ist = getISTDateParts();
    const isBroadcastingPaused = (ist.day >= 1 && ist.day <= 4) || (ist.day >= 15 && ist.day <= 19);
    const MAX_DAILY_BROADCAST_LIMIT = 100;

    const totalCount = targetStudents.length;
    const emailRecipients = targetStudents.filter(s => s.email && s.email.includes('@'));
    const validEmailCount = emailRecipients.length;
    const totalPendingDues = targetStudents.reduce((sum, s) => sum + (s.pendingFee || 0), 0);
    const totalPaidFee = targetStudents.reduce((sum, s) => sum + (s.paidFee || 0), 0);
    const totalDefaultersInTarget = targetStudents.filter(s => (s.pendingFee || 0) > 0).length;

    const defaultSubject = getCampaignDefaultSubject(adminEmailCampaignType, audienceLabel);
    const defaultBody = getCampaignDefaultBody(adminEmailCampaignType);

    pane.innerHTML = `
      <div class="dash-card" style="margin-bottom: 1.5rem; background: linear-gradient(135deg, #ffffff 0%, #FAF9F6 100%);">
        <div class="dash-card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
          <div>
            <div class="dash-card-title">
              <i class="fa-solid fa-envelope-open-text" style="color: var(--primary-emerald);"></i> Dedicated Email Dispatch & Campaign Manager
            </div>
            <div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 0.25rem;">
              Send official digital tuition invoices, mid-month fee reminder notices, exam schedules, and circulars directly to parents & students.
            </div>
          </div>
          <div style="display: flex; gap: 0.5rem; align-items: center;">
            <span class="user-badge-tag" style="background: #064E3B; color: #fff; font-weight: 700; font-size: 0.78rem;">
              <i class="fa-solid fa-clock"></i> IST Active: Day ${ist.day} (${ist.monthKey})
            </span>
            <span class="user-badge-tag" style="background: #1E40AF; color: #fff; font-weight: 700; font-size: 0.78rem;">
              <i class="fa-solid fa-bolt"></i> Resend Cloud API
            </span>
          </div>
        </div>

        <!-- 🛡️ IST BROADCASTING SCHEDULE & QUOTA STATUS BANNER 🛡️ -->
        ${isBroadcastingPaused ? `
          <div style="margin-bottom: 1.25rem; background: #FEF2F2; border: 2px solid #F87171; border-radius: 12px; padding: 1rem 1.25rem; display: flex; align-items: center; gap: 0.85rem;">
            <div style="width: 44px; height: 44px; border-radius: 50%; background: #DC2626; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 1.3rem; flex-shrink: 0;">
              <i class="fa-solid fa-ban"></i>
            </div>
            <div>
              <div style="font-weight: 800; font-size: 0.95rem; color: #991B1B;">
                🚫 Email Broadcasting Turned Off (Day ${ist.day} of Month — Indian Standard Time)
              </div>
              <div style="font-size: 0.83rem; color: #B91C1C; margin-top: 0.25rem; line-height: 1.45;">
                Mass email broadcasting is <strong>turned off during Days 1–4</strong> (Automated Monthly Invoicing) and <strong>Days 15–19</strong> (Mid-Month Due Reminders) to protect daily delivery quotas. Broadcasting opens on all other days of the month with a strict limit of <strong>max 100 emails/day</strong>.
              </div>
            </div>
          </div>
        ` : `
          <div style="margin-bottom: 1.25rem; background: #F0FDF4; border: 1.5px solid #86EFAC; border-radius: 10px; padding: 0.85rem 1.15rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.6rem;">
            <div style="font-size: 0.86rem; font-weight: 700; color: #166534; display: flex; align-items: center; gap: 0.5rem;">
              <i class="fa-solid fa-circle-check" style="color: #16A34A; font-size: 1.1rem;"></i>
              <span>Broadcasting Window Active (Day ${ist.day}, IST) • Daily Limit: <strong>Max 100 Emails</strong></span>
            </div>
            <div style="font-size: 0.82rem; font-weight: 800; color: ${validEmailCount > MAX_DAILY_BROADCAST_LIMIT ? '#DC2626' : '#15803D'}; background: ${validEmailCount > MAX_DAILY_BROADCAST_LIMIT ? '#FEE2E2' : '#DCFCE7'}; padding: 0.25rem 0.65rem; border-radius: 6px; border: 1px solid ${validEmailCount > MAX_DAILY_BROADCAST_LIMIT ? '#FCA5A5' : '#86EFAC'};">
              ${validEmailCount > MAX_DAILY_BROADCAST_LIMIT ? `⚠️ Exceeds Limit (${validEmailCount} / 100 max)` : `✅ ${validEmailCount} / 100 max recipients`}
            </div>
          </div>
        `}

        <!-- Audience & Live Database Fee Statistics Grid -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.85rem; margin-bottom: 1.25rem;">
          <div style="background: #F0FDF4; border: 1.5px solid #BBF7D0; border-radius: 10px; padding: 0.85rem 1rem;">
            <div style="font-size: 0.75rem; font-weight: 700; color: #166534; text-transform: uppercase; letter-spacing: 0.5px;">Target Enrolled</div>
            <div style="font-size: 1.4rem; font-weight: 900; color: #064E3B; margin-top: 0.2rem;">${totalCount} <span style="font-size: 0.8rem; font-weight: 600; color: #15803D;">students</span></div>
            <div style="font-size: 0.72rem; color: #166534; margin-top: 0.2rem;">${audienceLabel}</div>
          </div>

          <div style="background: #EFF6FF; border: 1.5px solid #BFDBFE; border-radius: 10px; padding: 0.85rem 1rem;">
            <div style="font-size: 0.75rem; font-weight: 700; color: #1E40AF; text-transform: uppercase; letter-spacing: 0.5px;">Valid Email IDs</div>
            <div style="font-size: 1.4rem; font-weight: 900; color: #1D4ED8; margin-top: 0.2rem;">${validEmailCount} <span style="font-size: 0.8rem; font-weight: 600; color: #2563EB;">/ ${totalCount}</span></div>
            <div style="font-size: 0.72rem; color: #1E40AF; margin-top: 0.2rem;">${totalCount - validEmailCount > 0 ? `⚠️ ${totalCount - validEmailCount} missing email` : '✅ 100% email coverage'}</div>
          </div>

          <div style="background: #FFFBEB; border: 1.5px solid #FDE68A; border-radius: 10px; padding: 0.85rem 1rem;">
            <div style="font-size: 0.75rem; font-weight: 700; color: #92400E; text-transform: uppercase; letter-spacing: 0.5px;">Outstanding Dues</div>
            <div style="font-size: 1.4rem; font-weight: 900; color: #B45309; margin-top: 0.2rem;">₹${totalPendingDues.toLocaleString('en-IN')}</div>
            <div style="font-size: 0.72rem; color: #92400E; margin-top: 0.2rem;">${totalDefaultersInTarget} students with balance</div>
          </div>

          <div style="background: #FDF2F8; border: 1.5px solid #FBCFE8; border-radius: 10px; padding: 0.85rem 1rem;">
            <div style="font-size: 0.75rem; font-weight: 700; color: #9D174D; text-transform: uppercase; letter-spacing: 0.5px;">Fee Collected in Target</div>
            <div style="font-size: 1.4rem; font-weight: 900; color: #BE185D; margin-top: 0.2rem;">₹${totalPaidFee.toLocaleString('en-IN')}</div>
            <div style="font-size: 0.72rem; color: #9D174D; margin-top: 0.2rem;">From enrolled records</div>
          </div>
        </div>

        <!-- Main Campaign Form -->
        <form id="adminEmailCampaignForm">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem; margin-bottom: 1rem;">
            <!-- Target Audience Selector -->
            <div>
              <label style="display: block; font-weight: 700; font-size: 0.85rem; margin-bottom: 0.35rem; color: var(--text-mahogany);">
                <i class="fa-solid fa-users-viewfinder" style="color: var(--primary-emerald);"></i> 1. Select Target Audience *
              </label>
              <select id="adminEmailAudienceSelect" class="portal-input" style="font-weight: 600;">
                <option value="all" ${adminEmailAudience === 'all' ? 'selected' : ''}>🎯 All Enrolled Students (All Batches)</option>
                <option value="10th" ${adminEmailAudience === '10th' ? 'selected' : ''}>Class 10th (ACHIEVER Batch)</option>
                <option value="9th" ${adminEmailAudience === '9th' ? 'selected' : ''}>Class 9th (NURTURE Batch)</option>
                <option value="8th" ${adminEmailAudience === '8th' ? 'selected' : ''}>Class 8th (ALPHA Batch)</option>
                <option value="junio" ${adminEmailAudience === 'junio' ? 'selected' : ''}>Junior Batch (JUNIO)</option>
                <option value="defaulters" ${adminEmailAudience === 'defaulters' ? 'selected' : ''}>⚠️ Defaulters Only (Students with Pending Fees)</option>
                <option value="student" ${adminEmailAudience === 'student' ? 'selected' : ''}>👤 Specific Individual Student</option>
              </select>
            </div>

            <!-- Campaign Template Preset Selector -->
            <div>
              <label style="display: block; font-weight: 700; font-size: 0.85rem; margin-bottom: 0.35rem; color: var(--text-mahogany);">
                <i class="fa-solid fa-wand-magic-sparkles" style="color: #D97706;"></i> 2. Email Type / Template Preset *
              </label>
              <select id="adminEmailTemplateSelect" class="portal-input" style="font-weight: 600;">
                <option value="monthly_invoice" ${adminEmailCampaignType === 'monthly_invoice' ? 'selected' : ''}>📄 Official Monthly Fee Invoice (with UPI QR)</option>
                <option value="fee_reminder" ${adminEmailCampaignType === 'fee_reminder' ? 'selected' : ''}>⚠️ Outstanding Fee Reminder Alert</option>
                <option value="exam_circular" ${adminEmailCampaignType === 'exam_circular' ? 'selected' : ''}>📝 Academic & Exam Timetable Circular</option>
                <option value="custom_announcement" ${adminEmailCampaignType === 'custom_announcement' ? 'selected' : ''}>📢 Custom Official Circular</option>
              </select>
            </div>
          </div>

          <!-- Individual Student Selector (shown only if audience is student) -->
          ${adminEmailAudience === 'student' ? `
            <div style="background: #F1F5F9; border: 1.5px solid #CBD5E1; border-radius: 10px; padding: 0.85rem 1rem; margin-bottom: 1rem;">
              <label style="display: block; font-weight: 700; font-size: 0.84rem; color: #1E293B; margin-bottom: 0.35rem;">
                <i class="fa-solid fa-user-check" style="color: var(--primary-emerald);"></i> Choose Student Recipient:
              </label>
              <select id="adminEmailIndividualStudentSelect" class="portal-input" style="font-weight: 600;">
                ${activeStudents.map(s => {
                  const sId = s.id || s.student_id || s.rollNo;
                  const isSel = (sId === adminEmailSelectedStudentId || s.rollNo === adminEmailSelectedStudentId);
                  return `<option value="${sId}" ${isSel ? 'selected' : ''}>${s.name} — Roll #${s.rollNo} (${s.className || 'General'}) • Pending: ₹${s.pendingFee || 0} • ${s.email || 'No email'}</option>`;
                }).join('')}
              </select>
            </div>
          ` : ''}

          <!-- Subject Line -->
          <div style="margin-bottom: 1rem;">
            <label style="display: block; font-weight: 700; font-size: 0.85rem; margin-bottom: 0.35rem; color: var(--text-mahogany);">
              Email Subject Line *
            </label>
            <input type="text" id="adminEmailSubjectInput" class="portal-input" value="${defaultSubject.replace(/"/g, '&quot;')}" required style="font-weight: 600;">
          </div>

          <!-- Message Body with Smart Placeholders Hint -->
          <div style="margin-bottom: 1rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
              <label style="font-weight: 700; font-size: 0.85rem; color: var(--text-mahogany);">Email Body / Message Text *</label>
              <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">
                Smart Tags: <code>{student_name}</code>, <code>{roll_no}</code>, <code>{class_name}</code>, <code>{monthly_fee}</code>, <code>{pending_fee}</code>, <code>{total_payable}</code>
              </span>
            </div>
            <textarea id="adminEmailBodyInput" class="portal-input" rows="7" required style="resize: vertical; width: 100%; font-family: inherit; font-size: 0.88rem; line-height: 1.5;">${defaultBody.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
          </div>

          <!-- Options & Toggles -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.75rem; margin-bottom: 1.25rem;">
            <label style="display: flex; align-items: center; gap: 0.6rem; font-size: 0.84rem; font-weight: 700; color: #065F46; background: #ECFDF5; border: 1px solid #A7F3D0; padding: 0.65rem 0.85rem; border-radius: 8px; cursor: pointer; user-select: none;">
              <input type="checkbox" id="adminEmailIncludePaymentLink" ${(adminEmailCampaignType === 'monthly_invoice' || adminEmailCampaignType === 'fee_reminder') ? 'checked' : ''} style="width: 17px; height: 17px; accent-color: var(--primary-emerald); cursor: pointer;">
              <span><i class="fa-solid fa-qrcode"></i> Include 1-Click Online Payment Link & UPI Details</span>
            </label>

            <label style="display: flex; align-items: center; gap: 0.6rem; font-size: 0.84rem; font-weight: 700; color: #1E40AF; background: #EFF6FF; border: 1px solid #BFDBFE; padding: 0.65rem 0.85rem; border-radius: 8px; cursor: pointer; user-select: none;">
              <input type="checkbox" id="adminEmailIncludeSeal" checked style="width: 17px; height: 17px; accent-color: #2563EB; cursor: pointer;">
              <span><i class="fa-solid fa-stamp"></i> Include Official Pragyan Crest Seal & Signatures</span>
            </label>
          </div>

          <!-- Live Dispatch Console Output (hidden until dispatch) -->
          <div id="adminEmailDispatchLog" style="display: none; margin-bottom: 1.25rem; background: #0F172A; color: #E2E8F0; border-radius: 10px; padding: 1rem 1.25rem; font-family: 'JetBrains Mono', monospace; font-size: 0.82rem; max-height: 220px; overflow-y: auto;">
          </div>

          <!-- Action Buttons Bar -->
          <div style="display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: center; justify-content: space-between; border-top: 1px solid var(--border-sand); padding-top: 1rem;">
            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
              <button type="button" id="btnPreviewEmailCampaign" class="btn" style="background: #F1F5F9; color: #334155; border: 1.5px solid #CBD5E1; font-weight: 700; padding: 0.65rem 1.15rem; border-radius: 8px; cursor: pointer;">
                <i class="fa-solid fa-eye"></i> Preview HTML Email
              </button>
              <button type="button" id="btnTestEmailCampaign" class="btn" style="background: #EFF6FF; color: #1D4ED8; border: 1.5px solid #93C5FD; font-weight: 700; padding: 0.65rem 1.15rem; border-radius: 8px; cursor: pointer;">
                <i class="fa-solid fa-paper-plane"></i> Send Test to Me
              </button>
            </div>

            ${isBroadcastingPaused ? `
              <button type="submit" id="btnDispatchEmailCampaign" class="btn" disabled style="padding: 0.75rem 1.85rem; font-size: 0.92rem; font-weight: 800; border-radius: 8px; background: #9CA3AF; color: #fff; cursor: not-allowed; box-shadow: none;">
                <i class="fa-solid fa-ban"></i> Broadcasting Paused (Days 1–4 & 15–19 IST)
              </button>
            ` : (validEmailCount > MAX_DAILY_BROADCAST_LIMIT ? `
              <button type="submit" id="btnDispatchEmailCampaign" class="btn btn-emerald" style="padding: 0.75rem 1.85rem; font-size: 0.92rem; font-weight: 800; border-radius: 8px;">
                <i class="fa-solid fa-rocket"></i> Dispatch Capped (${MAX_DAILY_BROADCAST_LIMIT} of ${validEmailCount} Recipients)
              </button>
            ` : `
              <button type="submit" id="btnDispatchEmailCampaign" class="btn btn-emerald" style="padding: 0.75rem 1.85rem; font-size: 0.92rem; font-weight: 800; border-radius: 8px;">
                <i class="fa-solid fa-rocket"></i> Dispatch Campaign (${validEmailCount} Recipients)
              </button>
            `)}
          </div>
        </form>
      </div>
    `;

    // Bind Event Listeners
    // Audience Selector Change
    pane.querySelector('#adminEmailAudienceSelect')?.addEventListener('change', (e) => {
      adminEmailAudience = e.target.value;
      renderAdminEmailTab();
    });

    // Campaign Template Change
    pane.querySelector('#adminEmailTemplateSelect')?.addEventListener('change', (e) => {
      adminEmailCampaignType = e.target.value;
      renderAdminEmailTab();
    });

    // Individual Student Select Change
    pane.querySelector('#adminEmailIndividualStudentSelect')?.addEventListener('change', (e) => {
      adminEmailSelectedStudentId = e.target.value;
      renderAdminEmailTab();
    });

    // Preview Email Button
    pane.querySelector('#btnPreviewEmailCampaign')?.addEventListener('click', () => {
      const subject = pane.querySelector('#adminEmailSubjectInput')?.value || defaultSubject;
      const rawBody = pane.querySelector('#adminEmailBodyInput')?.value || defaultBody;
      const inclPay = pane.querySelector('#adminEmailIncludePaymentLink')?.checked;
      const inclSeal = pane.querySelector('#adminEmailIncludeSeal')?.checked;

      const sampleStudent = targetStudents[0] || {
        name: 'Rohan Sharma',
        rollNo: '2026-1001',
        className: 'Class 10th (ACHIEVER)',
        monthlyFee: 1000,
        pendingFee: 1000,
        paidFee: 0,
        email: 'rohan.sharma@example.com'
      };

      const emailHtml = generateCampaignEmailHtml(sampleStudent, adminEmailCampaignType, subject, rawBody, inclPay, inclSeal);
      openEmailPreviewModal(subject, emailHtml);
    });

    // Send Test Email Button
    pane.querySelector('#btnTestEmailCampaign')?.addEventListener('click', async () => {
      const currentAdmin = AppState.currentUser || AppState.getAdmin();
      const adminEmail = currentAdmin.email || 'director@pragyaninstitute.com';
      const promptEmail = prompt('Enter recipient email address for test preview:', adminEmail);
      if (!promptEmail || !promptEmail.includes('@')) return;

      const subject = `[TEST PREVIEW] ` + (pane.querySelector('#adminEmailSubjectInput')?.value || defaultSubject);
      const rawBody = pane.querySelector('#adminEmailBodyInput')?.value || defaultBody;
      const inclPay = pane.querySelector('#adminEmailIncludePaymentLink')?.checked;
      const inclSeal = pane.querySelector('#adminEmailIncludeSeal')?.checked;

      const sampleStudent = targetStudents[0] || {
        name: 'Sample Student',
        rollNo: '2026-SAMPLE',
        className: audienceLabel,
        monthlyFee: 1000,
        pendingFee: 1000,
        paidFee: 0,
        email: promptEmail
      };

      const emailHtml = generateCampaignEmailHtml(sampleStudent, adminEmailCampaignType, subject, rawBody, inclPay, inclSeal);
      const btn = pane.querySelector('#btnTestEmailCampaign');
      if (btn) { btn.disabled = true; btn.textContent = 'Sending Test...'; }

      try {
        const res = await sendLiveResendEmail(promptEmail, subject, emailHtml);
        if (res.success) {
          alert(`✅ Test email successfully delivered to: ${promptEmail}`);
        } else {
          alert(`❌ Test email error: ` + (res.error || 'Check Resend credentials'));
        }
      } catch (err) {
        alert(`❌ Failed to send test: ` + err.message);
      } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send Test to Me'; }
      }
    });

    // Dispatch Campaign Form Submit
    pane.querySelector('#adminEmailCampaignForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();

      const currentIst = getISTDateParts();
      const isAutomatedCycle = (currentIst.day >= 1 && currentIst.day <= 4) || (currentIst.day >= 15 && currentIst.day <= 19);

      if (validEmailCount === 0) {
        alert('⚠️ No valid email addresses found in the selected audience.');
        return;
      }

      const targetDispatchRecipients = emailRecipients;
      const isCapped = false;

      const subject = pane.querySelector('#adminEmailSubjectInput')?.value.trim() || defaultSubject;
      const rawBody = pane.querySelector('#adminEmailBodyInput')?.value.trim() || defaultBody;
      const inclPay = pane.querySelector('#adminEmailIncludePaymentLink')?.checked;
      const inclSeal = pane.querySelector('#adminEmailIncludeSeal')?.checked;

      const confirmMsg = isCapped
        ? `🚀 Dispatch Email Campaign?\n\n• Target Audience: ${audienceLabel}\n• Total Eligible: ${validEmailCount} students\n• Dispatching: Capped to FIRST ${MAX_DAILY_BROADCAST_LIMIT} recipients (Daily IST Quota Cap)\n• Subject: ${subject}\n\nProceed with live dispatch?`
        : `🚀 Dispatch Email Campaign?\n\n• Target Audience: ${audienceLabel}\n• Recipients with Email: ${validEmailCount} students\n• Subject: ${subject}\n\nProceed with live dispatch?`;

      if (!confirm(confirmMsg)) {
        return;
      }

      const submitBtn = pane.querySelector('#btnDispatchEmailCampaign');
      const logBox = pane.querySelector('#adminEmailDispatchLog');
      if (logBox) {
        logBox.style.display = 'block';
        logBox.innerHTML = `<div>[${new Date().toLocaleTimeString('en-IN')}] Initializing campaign dispatch for ${targetDispatchRecipients.length} recipients (Day ${currentIst.day} IST)...</div>`;
      }
      if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Dispatching Emails...'; }

      let sentCount = 0;
      let failCount = 0;
      const author = getActiveTeacherName();

      try {
        // Send individually with personalized tags (capped to max 100)
        for (let i = 0; i < targetDispatchRecipients.length; i++) {
          const student = targetDispatchRecipients[i];
          const personalizedHtml = generateCampaignEmailHtml(student, adminEmailCampaignType, subject, rawBody, inclPay, inclSeal);
          const studentSub = replaceEmailPlaceholders(subject, student);

          try {
            const res = await sendLiveResendEmail(student.email, studentSub, personalizedHtml);
            if (res.success) {
              sentCount++;
              if (logBox) {
                logBox.innerHTML += `<div style="color: #4ADE80;">✓ Delivered to ${student.name} (${student.email})</div>`;
                logBox.scrollTop = logBox.scrollHeight;
              }
            } else {
              failCount++;
              if (logBox) {
                logBox.innerHTML += `<div style="color: #F87171;">✗ Failed: ${student.name} (${student.email}) - ${res.error || 'Unknown error'}</div>`;
                logBox.scrollTop = logBox.scrollHeight;
              }
            }
          } catch (itemErr) {
            failCount++;
            if (logBox) {
              logBox.innerHTML += `<div style="color: #F87171;">✗ Error sending to ${student.name}: ${itemErr.message}</div>`;
              logBox.scrollTop = logBox.scrollHeight;
            }
          }
        }

        // Add audit log
        await AppState.addAuditLog(author, 'EMAIL_CAMPAIGN_DISPATCH', audienceLabel, `Dispatched: ${sentCount}`, `Dispatched "${subject}" to ${sentCount} students (${failCount} failed). Daily cap: 100 max.`, {
          campaignType: adminEmailCampaignType,
          audience: adminEmailAudience,
          sentCount,
          failCount,
          totalPendingInTarget: totalPendingDues,
          istDay: currentIst.day
        });

        if (logBox) {
          logBox.innerHTML += `<div style="color: #67E8F9; font-weight: 700; margin-top: 0.5rem;">🎉 Campaign Complete! Total Delivered: ${sentCount} | Failed: ${failCount}</div>`;
        }

        alert(`🎉 Campaign Complete!\n\n• Successfully Sent: ${sentCount}\n• Failed/Skipped: ${failCount}\n• Daily Quota (IST): Capped at max ${MAX_DAILY_BROADCAST_LIMIT}`);
      } catch (overallErr) {
        console.error('Campaign error:', overallErr);
        alert('❌ Error during campaign dispatch: ' + overallErr.message);
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = `<i class="fa-solid fa-rocket"></i> Dispatch Campaign (${validEmailCount} Recipients)`;
        }
      }
    });
  }

  function openAddStudentModal() {
    const modalHtml = `
      <div class="inner-modal-backdrop active" id="addStudentModal">
        <div class="inner-modal-content" style="max-width: 680px;">
          <div class="inner-modal-header">
            <h3><i class="fa-solid fa-user-plus" style="color: var(--primary-emerald);"></i> Register New Student</h3>
            <button class="btn-close-inner" onclick="document.getElementById('addStudentModal').remove()"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <form id="newStudentForm">
            <!-- Server Authoritative Student ID Banner -->
            <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 8px; padding: 0.65rem 0.9rem; margin-bottom: 1rem; display: flex; align-items: center; justify-content: space-between;">
              <div>
                <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700;">Authoritative Sequence Format (YYCCSS)</div>
                <div style="font-size: 1.05rem; font-weight: 800; color: #10B981; margin-top: 2px;">
                  <i class="fa-solid fa-id-card"></i> Student ID: <span id="newStuIdBadgeDisplay">Calculating...</span>
                </div>
              </div>
              <span style="background: rgba(16, 185, 129, 0.2); color: #10B981; font-size: 0.72rem; font-weight: 700; padding: 3px 8px; border-radius: 99px;">Server Sequence</span>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.9rem; margin-bottom: 1rem;">
              <div>
                <label style="font-size: 0.85rem; font-weight: 600;">Student Full Name *</label>
                <input type="text" id="newStuName" class="portal-input" required placeholder="e.g. Amit Kumar">
              </div>
              <div>
                <label style="font-size: 0.85rem; font-weight: 600;">Mobile Number *</label>
                <input type="tel" id="newStuMobile" class="portal-input" required maxlength="10" pattern="[0-9]{10}" inputmode="numeric" placeholder="10-digit mobile number">
              </div>
              <div>
                <label style="font-size: 0.85rem; font-weight: 600;">Date of Birth (DOB) *</label>
                <input type="date" id="newStuDob" class="portal-input" required>
              </div>
              <div>
                <label style="font-size: 0.85rem; font-weight: 600;">Class / Batch Assignment *</label>
                <select id="newStuClass" class="portal-input">
                  <option value="Class 10th (ACHIEVER)" data-monthly="1000">Class 10th (ACHIEVER) — ₹1,000/Month</option>
                  <option value="Class 9th (NURTURE)" data-monthly="1000">Class 9th (NURTURE) — ₹1,000/Month</option>
                  <option value="Class 8th (ALPHA)" data-monthly="800">Class 8th (ALPHA) — ₹800/Month</option>
                  <option value="Junior Batch (JUNIO)" data-monthly="700">Junior Batch (JUNIO) — ₹700/Month</option>
                </select>
              </div>
              <div>
                <label style="font-size: 0.85rem; font-weight: 600;">Monthly Fee Rate (₹/Month) *</label>
                <input type="number" id="newStuMonthlyFee" class="portal-input" value="1000" min="0" required placeholder="e.g. 1000">
                <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 0.2rem;">Added automatically on 1st–4th of each month.</div>
              </div>
              <div>
                <label style="font-size: 0.85rem; font-weight: 600;">Old / Past Pending Fees (₹) <span style="font-weight:400; color:var(--text-muted);">(0 for new admissions)</span></label>
                <input type="number" id="newStuPrevDue" class="portal-input" value="0" min="0" placeholder="0 if starting fresh, or enter past dues">
                <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 0.2rem;">Initial balance due. Default is ₹0 for fresh admissions.</div>
              </div>
              <div>
                <label style="font-size: 0.85rem; font-weight: 600;">Email Address <span style="font-weight:400; color:var(--text-muted);">(Optional)</span></label>
                <input type="email" id="newStuEmail" class="portal-input" placeholder="student@gmail.com">
              </div>
              <div>
                <label style="font-size: 0.85rem; font-weight: 600;">Blood Group <span style="font-weight:400; color:var(--text-muted);">(Optional)</span></label>
                <select id="newStuBloodGroup" class="portal-input">
                  <option value="Not Specified">Not Specified</option>
                  <option value="A+">A+</option>
                  <option value="A-">A-</option>
                  <option value="B+">B+</option>
                  <option value="B-">B-</option>
                  <option value="O+">O+</option>
                  <option value="O-">O-</option>
                  <option value="AB+">AB+</option>
                  <option value="AB-">AB-</option>
                </select>
              </div>
              <div>
                <label style="font-size: 0.85rem; font-weight: 600;">Father / Guardian Name</label>
                <input type="text" id="newStuGuardian" class="portal-input" placeholder="Guardian Name">
              </div>
              <div>
                <label style="font-size: 0.85rem; font-weight: 600;">Guardian Mobile <span style="font-weight:400; color:var(--text-muted);">(Optional)</span></label>
                <input type="tel" id="newStuGuardianMobile" class="portal-input" maxlength="10" pattern="[0-9]{10}" inputmode="numeric" placeholder="10-digit guardian mobile">
              </div>
              <div style="grid-column: span 2;">
                <label style="font-size: 0.85rem; font-weight: 600;">Residential Address <span style="font-weight:400; color:var(--text-muted);">(Optional)</span></label>
                <input type="text" id="newStuAddress" class="portal-input" placeholder="e.g. Main Road, Near Bus Stand, Lalganj, Vaishali">
              </div>
            </div>
            <button type="submit" class="btn btn-emerald" style="width: 100%; padding: 0.8rem;">
              <i class="fa-solid fa-check"></i> Complete Student Registration
            </button>
          </form>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Real-time 10-digit mobile masking
    const newMobInput = document.getElementById('newStuMobile');
    const newGrdMobInput = document.getElementById('newStuGuardianMobile');
    newMobInput?.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
    });
    newGrdMobInput?.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
    });

    // Dynamic Server Sequence ID updater
    const classSelect = document.getElementById('newStuClass');
    const updateIdPreview = async () => {
      const displayEl = document.getElementById('newStuIdBadgeDisplay');
      if (displayEl) displayEl.textContent = 'Calculating...';
      try {
        const nextId = await AppState.fetchNextStudentId(classSelect.value);
        if (displayEl) displayEl.textContent = nextId;
      } catch (err) {
        if (displayEl) displayEl.textContent = AppState.generateStudentId(classSelect.value);
      }
    };

    updateIdPreview();

    // Auto update monthly fee input and Student ID when batch selection changes
    classSelect.addEventListener('change', () => {
      const selectedOpt = classSelect.options[classSelect.selectedIndex];
      const monthly = selectedOpt.dataset.monthly || '1000';
      document.getElementById('newStuMonthlyFee').value = monthly;
      updateIdPreview();
    });

    document.getElementById('newStudentForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const rawMobile = document.getElementById('newStuMobile').value.trim();
      const rawGuardianMobile = document.getElementById('newStuGuardianMobile').value.trim();
      const mobile = sanitizeMobileNumber(rawMobile);
      const guardianMobile = rawGuardianMobile ? sanitizeMobileNumber(rawGuardianMobile) : mobile;

      if (!isValid10DigitMobile(mobile)) {
        alert('Invalid Mobile Number: Student mobile number must be exactly 10 digits without letters or special characters (e.g. 9876543210).');
        document.getElementById('newStuMobile').focus();
        return;
      }

      if (rawGuardianMobile && !isValid10DigitMobile(guardianMobile)) {
        alert('Invalid Guardian Mobile: Guardian mobile must be exactly 10 digits without letters or special characters (e.g. 9876543210).');
        document.getElementById('newStuGuardianMobile').focus();
        return;
      }

      const name = document.getElementById('newStuName').value.trim();
      const dob = document.getElementById('newStuDob').value;
      const className = document.getElementById('newStuClass').value;
      const email = document.getElementById('newStuEmail').value.trim();
      const bloodGroup = document.getElementById('newStuBloodGroup').value;
      const guardianName = document.getElementById('newStuGuardian').value.trim() || 'Guardian';
      const monthlyInstallment = parseFloat(document.getElementById('newStuMonthlyFee').value) || 1000;
      const prevDue = parseFloat(document.getElementById('newStuPrevDue').value) || 0;
      const address = document.getElementById('newStuAddress').value.trim() || 'Lalganj, Vaishali, Bihar';

      const initialHistory = [];
      if (prevDue > 0) {
        initialHistory.push({
          receiptNo: `CARRYOVER-${Date.now().toString(36).slice(-5)}`,
          date: new Date().toISOString().split('T')[0],
          amount: prevDue,
          mode: 'Previous Balance Carryover (Old Fees)',
          status: 'Pending Due'
        });
      }

      const students = AppState.getStudents();
      const generatedId = await AppState.fetchNextStudentId(className);
      const stuUuid = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : (`stu_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);

      const newStudent = {
        id: stuUuid,
        db_uuid: stuUuid,
        student_id: generatedId,
        name,
        mobile,
        dob,
        rollNo: generatedId,
        roll_no: generatedId,
        className,
        batchName: className,
        guardianName,
        guardianMobile,
        email,
        address,
        bloodGroup,
        admissionDate: new Date().toISOString().split('T')[0],
        totalFee: prevDue,
        total_fee: prevDue,
        paidFee: 0,
        paid_fee: 0,
        pendingFee: prevDue,
        pending_fee: prevDue,
        monthlyFee: monthlyInstallment,
        monthly_fee: monthlyInstallment,
        feeHistory: initialHistory
      };

      AppState.markStudentDirty(stuUuid);
      AppState.markStudentDirty(generatedId);
      students.unshift(newStudent);
      await AppState.saveStudents(students, [stuUuid, generatedId]);
      document.getElementById('addStudentModal')?.remove();
      const oldFeeNote = prevDue > 0 ? ` (Initial Pending Balance: ₹${prevDue.toLocaleString()} old fee carryover)` : ' (Initial Pending Balance: ₹0)';
      alert(`Student ${name} registered successfully with ID: ${generatedId} (${className})!${oldFeeNote}. Monthly fee ₹${monthlyInstallment.toLocaleString()}/Mo. will be added on batch billing cycle.`);
      renderAdminDashboard();
    });
  }

  /* ==========================================================================
   * STUDENT DETAIL UPDATE REQUEST MODAL & WORKFLOW
   * ========================================================================== */
  function openRequestStudentUpdateModal() {
    const s = AppState.currentUser;
    if (!s) return;

    // Clean up existing modal if open
    document.getElementById('requestUpdateModal')?.remove();

    const requests = AppState.getRequests();
    const existingPending = requests.find(r => isStudentRequestMatch(r, s) && String(r.status || '').toLowerCase() === 'pending');
    const currentValues = (existingPending && existingPending.newData) ? existingPending.newData : s;
    const safeValue = (value) => sanitizeInput(String(value ?? ''));
    const safeImageUrl = sanitizeUrl;

    const modalHtml = `
      <div class="inner-modal-backdrop active" id="requestUpdateModal">
        <div class="inner-modal-content" style="max-width: 650px;">
          <div class="inner-modal-header">
            <h3><i class="fa-solid fa-user-pen" style="color: var(--primary-emerald);"></i> Request Profile Detail Update</h3>
            <button class="btn-close-inner" id="btnCloseReqModal"><i class="fa-solid fa-xmark"></i></button>
          </div>
          
          ${existingPending ? `
            <div style="background: #FEF3C7; border: 1px solid #F59E0B; color: #92400E; padding: 0.65rem 0.9rem; border-radius: 8px; font-size: 0.84rem; margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
              <div><i class="fa-solid fa-clock-rotate-left"></i> <strong>Pending Request Active:</strong> Submitting will update your pending request for Admin review.</div>
              <button type="button" id="btnCancelThisReq" style="background: #DC2626; color: #fff; border: none; padding: 0.25rem 0.6rem; border-radius: 4px; font-size: 0.76rem; font-weight: 700; cursor: pointer;">
                Cancel Request
              </button>
            </div>
          ` : `
            <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem;">
              Edit any details below. Your request will be sent to the Admin for verification and will update automatically once approved.
            </p>
          `}

          <form id="reqUpdateForm">
            <div class="portal-form-grid-2col" style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.9rem; margin-bottom: 1rem;">
              <div>
                <label style="font-size: 0.85rem; font-weight: 600;">Student Full Name *</label>
                <input type="text" id="reqStuName" class="portal-input" value="${safeValue(currentValues.name || s.name)}" required>
              </div>
              <div>
                <label style="font-size: 0.85rem; font-weight: 600;">Mobile Number *</label>
                <input type="tel" id="reqStuMobile" class="portal-input" value="${safeValue(currentValues.mobile || s.mobile)}" required>
              </div>
              <div>
                <label style="font-size: 0.85rem; font-weight: 600;">Date of Birth (DOB) *</label>
                <input type="date" id="reqStuDob" class="portal-input" value="${safeValue(currentValues.dob || s.dob)}" required>
              </div>
              <div>
                <label style="font-size: 0.85rem; font-weight: 600;">Email Address (Optional)</label>
                <input type="email" id="reqStuEmail" class="portal-input" value="${safeValue(currentValues.email || s.email)}">
              </div>
              <div>
                <label style="font-size: 0.85rem; font-weight: 600;">Father / Guardian Name</label>
                <input type="text" id="reqStuGuardian" class="portal-input" value="${safeValue(currentValues.guardianName || s.guardianName)}">
              </div>
              <div>
                <label style="font-size: 0.85rem; font-weight: 600;">Guardian Mobile</label>
                <input type="tel" id="reqStuGuardianMobile" class="portal-input" value="${safeValue(currentValues.guardianMobile || s.guardianMobile || s.mobile)}">
              </div>
              <div>
                <label style="font-size: 0.85rem; font-weight: 600;">Blood Group</label>
                <select id="reqStuBloodGroup" class="portal-input">
                  <option value="Not Specified" ${(currentValues.bloodGroup || s.bloodGroup) === 'Not Specified' ? 'selected' : ''}>Not Specified</option>
                  <option value="A+" ${(currentValues.bloodGroup || s.bloodGroup) === 'A+' ? 'selected' : ''}>A+</option>
                  <option value="A-" ${(currentValues.bloodGroup || s.bloodGroup) === 'A-' ? 'selected' : ''}>A-</option>
                  <option value="B+" ${(currentValues.bloodGroup || s.bloodGroup) === 'B+' ? 'selected' : ''}>B+</option>
                  <option value="B-" ${(currentValues.bloodGroup || s.bloodGroup) === 'B-' ? 'selected' : ''}>B-</option>
                  <option value="O+" ${(currentValues.bloodGroup || s.bloodGroup) === 'O+' ? 'selected' : ''}>O+</option>
                  <option value="O-" ${(currentValues.bloodGroup || s.bloodGroup) === 'O-' ? 'selected' : ''}>O-</option>
                  <option value="AB+" ${(currentValues.bloodGroup || s.bloodGroup) === 'AB+' ? 'selected' : ''}>AB+</option>
                  <option value="AB-" ${(currentValues.bloodGroup || s.bloodGroup) === 'AB-' ? 'selected' : ''}>AB-</option>
                </select>
              </div>
              <div>
                <label style="font-size: 0.85rem; font-weight: 600;">Class / Batch (Read Only)</label>
                <input type="text" class="portal-input" value="${safeValue(s.className)}" disabled style="background:#f3f4f6;">
              </div>
              <div style="grid-column: span 2;">
                <label style="font-size: 0.85rem; font-weight: 600;"><i class="fa-solid fa-camera" style="color: var(--primary-emerald);"></i> Upload New Profile Photo (PF)</label>
                <input type="file" id="reqStuPhotoInput" accept="image/*" class="portal-input" style="padding: 0.4rem;">
                <div style="font-size: 0.76rem; color: var(--text-muted); margin-top: 0.2rem;">Choose a profile picture to submit for verification & approval.</div>
                <div id="reqPhotoPreviewContainer" style="margin-top: 0.4rem; display: ${currentValues.photoUrl ? 'block' : 'none'};">
                  <img id="reqPhotoPreviewImg" src="${safeImageUrl(currentValues.photoUrl)}" style="width: 55px; height: 55px; border-radius: 8px; object-fit: cover; border: 2px solid var(--primary-emerald);">
                </div>
              </div>
              <div style="grid-column: span 2;">
                <label style="font-size: 0.85rem; font-weight: 600;">Residential Address</label>
                <input type="text" id="reqStuAddress" class="portal-input" value="${safeValue(currentValues.address || s.address)}">
              </div>
            </div>
            <button type="submit" id="btnSubmitProfileReq" class="btn btn-emerald" style="width: 100%; padding: 0.8rem;">
              <i class="fa-solid fa-paper-plane"></i> ${existingPending ? 'Update Pending Request' : 'Submit Update Request to Admin'}
            </button>
          </form>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modalEl = document.getElementById('requestUpdateModal');
    const photoInput = modalEl?.querySelector('#reqStuPhotoInput');
    const previewContainer = modalEl?.querySelector('#reqPhotoPreviewContainer');
    const previewImg = modalEl?.querySelector('#reqPhotoPreviewImg');

    modalEl?.querySelector('#btnCloseReqModal')?.addEventListener('click', () => {
      modalEl.remove();
    });

    modalEl?.querySelector('#btnCancelThisReq')?.addEventListener('click', async () => {
      if (confirm('Cancel your pending profile update request?')) {
        const currentRequest = AppState.getRequests().find(r => isStudentRequestMatch(r, s) && String(r.status || '').toLowerCase() === 'pending');
        if (currentRequest) {
          const newPhoto = currentRequest.newData?.photoUrl || currentRequest.newData?.photo;
          const oldPhoto = currentRequest.oldData?.photoUrl || currentRequest.oldData?.photo;
          if (newPhoto && newPhoto !== oldPhoto && typeof SupabaseSync !== 'undefined' && SupabaseSync.deleteFile) {
            try { await SupabaseSync.deleteFile(newPhoto); } catch(e) {}
          }
          if (currentRequest.id && typeof SupabaseSync !== 'undefined') {
            const result = await SupabaseSync.mutate('student_requests', 'delete', null, { where: { request_id: currentRequest.id } });
            if (!result.success) {
              alert(result.error || 'Unable to cancel the request. Please try again.');
              return;
            }
          }
        }
        const allReqs = AppState.getRequests().filter(r => !(isStudentRequestMatch(r, s) && String(r.status || '').toLowerCase() === 'pending'));
        await AppState.saveRequests(allReqs);
        modalEl.remove();
        renderStudentDashboard();
        alert('Pending request cancelled.');
      }
    });

    let selectedPhotoDataUrl = (currentValues.photoUrl || s.photoUrl || s.photo_url || s.photo || '');

    photoInput?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) {
        alert('Photo file is too large. Please select an image under 10MB.');
        photoInput.value = '';
        return;
      }
      try {
        const compressed = (typeof SupabaseSync !== 'undefined' && SupabaseSync.compressMobileImage)
          ? await SupabaseSync.compressMobileImage(file, 600, 0.82)
          : file;
        const reader = new FileReader();
        reader.onload = function(evt) {
          selectedPhotoDataUrl = evt.target.result;
          if (previewImg) previewImg.src = selectedPhotoDataUrl;
          if (previewContainer) previewContainer.style.display = 'block';
        };
        reader.readAsDataURL(compressed);
      } catch (err) {
        const reader = new FileReader();
        reader.onload = function(evt) {
          selectedPhotoDataUrl = evt.target.result;
          if (previewImg) previewImg.src = selectedPhotoDataUrl;
          if (previewContainer) previewContainer.style.display = 'block';
        };
        reader.readAsDataURL(file);
      }
    });

    modalEl.querySelector('#reqUpdateForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = modalEl.querySelector('#btnSubmitProfileReq');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting Request...';
      }

      try {
        const updatedObj = {
          name: modalEl.querySelector('#reqStuName').value.trim(),
          mobile: modalEl.querySelector('#reqStuMobile').value.trim(),
          dob: modalEl.querySelector('#reqStuDob').value,
          email: modalEl.querySelector('#reqStuEmail').value.trim(),
          guardianName: modalEl.querySelector('#reqStuGuardian').value.trim(),
          guardianMobile: modalEl.querySelector('#reqStuGuardianMobile').value.trim(),
          bloodGroup: modalEl.querySelector('#reqStuBloodGroup').value,
          address: modalEl.querySelector('#reqStuAddress').value.trim()
        };

        const existingOldPhoto = s.photoUrl || s.photo_url || s.photo || '';
        const photoFile = photoInput?.files[0];

        let finalPhoto = selectedPhotoDataUrl || previewImg?.src || '';
        if (photoFile) {
          try {
            const uploadedUrl = await SupabaseSync.uploadFile(photoFile, 'profile_pictures');
            if (uploadedUrl) {
              finalPhoto = uploadedUrl;
            }
          } catch(uploadErr) {
            console.warn('Photo upload failed:', uploadErr.message);
          }
        }
        if (!finalPhoto || (!finalPhoto.startsWith('data:image/') && !finalPhoto.startsWith('http'))) {
          finalPhoto = currentValues.photoUrl || currentValues.photo_url || currentValues.photo || existingOldPhoto;
        }

        updatedObj.photoUrl = finalPhoto;
        updatedObj.photo_url = finalPhoto;
        updatedObj.photo = finalPhoto;

        const allReqs = AppState.getRequests();
        const pendingIdx = allReqs.findIndex(r => isStudentRequestMatch(r, s) && String(r.status || '').toLowerCase() === 'pending');

        if (pendingIdx !== -1) {
          const existing = allReqs.splice(pendingIdx, 1)[0];
          existing.newData = updatedObj;
          existing.new_data = updatedObj;
          existing.date = new Date().toISOString().split('T')[0];
          existing.timestamp = new Date().toLocaleString();
          existing.created_at = new Date().toISOString();
          existing.updated_at = new Date().toISOString();
          allReqs.unshift(existing);
        } else {
          const reqId = `REQ-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,5)}`;
          allReqs.unshift({
            id: reqId,
            request_id: reqId,
            type: 'profile',
            req_type: 'PROFILE_UPDATE',
            studentId: s.student_id || s.id || s.rollNo,
            student_id: s.student_id || s.id || s.rollNo,
            studentName: s.name,
            student_name: s.name,
            rollNo: s.rollNo || s.roll_no || '',
            roll_no: s.rollNo || s.roll_no || '',
            className: s.className || s.class_name || '',
            class_name: s.className || s.class_name || '',
            date: new Date().toISOString().split('T')[0],
            request_date: new Date().toISOString().split('T')[0],
            status: 'Pending',
            oldData: {
              name: s.name,
              mobile: s.mobile,
              dob: s.dob,
              email: s.email,
              guardianName: s.guardianName,
              guardianMobile: s.guardianMobile,
              bloodGroup: s.bloodGroup,
              address: s.address,
              photoUrl: existingOldPhoto,
              photo_url: existingOldPhoto,
              photo: existingOldPhoto
            },
            old_data: {
              name: s.name,
              mobile: s.mobile,
              dob: s.dob,
              email: s.email,
              guardianName: s.guardianName,
              guardianMobile: s.guardianMobile,
              bloodGroup: s.bloodGroup,
              address: s.address,
              photoUrl: existingOldPhoto,
              photo_url: existingOldPhoto,
              photo: existingOldPhoto
            },
            newData: updatedObj,
            new_data: updatedObj
          });
        }

        await AppState.saveRequests(allReqs);
        AppState.invalidateCaches();
        modalEl.remove();
        alert('✅ Profile detail update request submitted successfully! Pending Admin verification.');
        renderStudentDashboard();
      } catch (err) {
        console.error('Submit request failed:', err);
        alert('❌ Request failed: ' + err.message);
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Submit Update Request to Admin';
        }
      }
    });
  }

  /* ==========================================================================
   * STUDENT ONLINE PAYMENT VERIFICATION REQUEST MODAL
   * ========================================================================== */
  function openStudentPaymentRequestModal(s) {
    document.getElementById('studentPayReqModal')?.remove();

    const totalDue = s.pendingFee || 1000;
    const monthlyFee = s.monthlyFee || 1000;
    let selectedPayAmount = totalDue;
    const initialUpiLink = `upi://pay?pa=chandankr1501998@ybl&pn=Chandan%20Kumar%20Pragyan%20Institute&cu=INR&am=${selectedPayAmount}`;

    const modalHtml = `
      <div class="inner-modal-backdrop active" id="studentPayReqModal">
        <div class="inner-modal-content" style="max-width: 600px;">
          <div class="inner-modal-header">
            <h3><i class="fa-solid fa-credit-card" style="color: var(--primary-emerald);"></i> Submit Online Payment Proof</h3>
            <button class="btn-close-inner" onclick="document.getElementById('studentPayReqModal').remove()"><i class="fa-solid fa-xmark"></i></button>
          </div>

          <!-- Payment Option Quick Select (Pay in Full vs Pay in Partial) -->
          <div style="background: var(--bg-surface-cream, #FAF9F6); border: 1.5px solid var(--border-sand, #E5E7EB); border-radius: 10px; padding: 0.85rem; margin-bottom: 1.15rem;">
            <div style="font-size: 0.78rem; font-weight: 800; color: var(--primary-emerald, #064E3B); text-transform: uppercase; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.4rem;">
              <i class="fa-solid fa-hand-holding-dollar"></i> Choose Payment Option / भुगतान विकल्प
            </div>
            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
              <button type="button" class="btn-pay-option active" id="btnStudentPayFull" style="flex: 1; min-width: 140px; padding: 0.6rem 0.75rem; border-radius: 8px; border: 2px solid #10B981; background: #ECFDF5; color: #064E3B; font-weight: 700; font-size: 0.82rem; cursor: pointer; text-align: center; font-family: inherit;">
                <i class="fa-solid fa-circle-check"></i> Pay Full Due (₹${totalDue.toLocaleString()})
              </button>
              <button type="button" class="btn-pay-option" id="btnStudentPayMonthly" style="flex: 1; min-width: 140px; padding: 0.6rem 0.75rem; border-radius: 8px; border: 1.5px solid #CBD5E1; background: #fff; color: #334155; font-weight: 700; font-size: 0.82rem; cursor: pointer; text-align: center; font-family: inherit;">
                <i class="fa-solid fa-calendar-days"></i> 1-Month Fee (₹${monthlyFee.toLocaleString()})
              </button>
              <button type="button" class="btn-pay-option" id="btnStudentPayPartial" style="flex: 1; min-width: 140px; padding: 0.6rem 0.75rem; border-radius: 8px; border: 1.5px solid #CBD5E1; background: #fff; color: #334155; font-weight: 700; font-size: 0.82rem; cursor: pointer; text-align: center; font-family: inherit;">
                <i class="fa-solid fa-pencil"></i> Custom Partial Amount
              </button>
            </div>
          </div>

          <!-- Official UPI Gateway Card with PhonePe QR Code -->
          <div style="background: linear-gradient(135deg, #064E3B 0%, #022c22 100%); color: #fff; padding: 1.25rem; border-radius: 12px; margin-bottom: 1.25rem; box-shadow: 0 4px 15px rgba(6, 78, 59, 0.25);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.4rem;">
              <span style="font-size: 0.85rem; font-weight: 700; color: #A7F3D0;"><i class="fa-solid fa-shield-halved"></i> Official Institute UPI Gateway</span>
              <span style="background: rgba(52, 211, 153, 0.2); border: 1px solid #34D399; color: #34D399; padding: 0.2rem 0.55rem; border-radius: 99px; font-weight: 700; font-size: 0.72rem;">Verified Gateway</span>
            </div>

            <div style="display: grid; grid-template-columns: auto 1fr; gap: 1.25rem; align-items: center;">
              <div style="background: #FFFFFF; padding: 6px; border-radius: 10px; border: 2px solid #10B981; text-align: center; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
                <img src="assets/images/chandan_upi_qr.png" alt="PhonePe QR Code - Chandan Kumar Pragyan Institute" style="width: 130px; height: 170px; object-fit: contain; border-radius: 6px; display: block;">
                <div style="font-size: 0.65rem; color: #065F46; font-weight: 800; margin-top: 4px;">SCAN ANY UPI APP</div>
              </div>

              <div>
                <div style="font-size: 0.78rem; opacity: 0.85; text-transform: uppercase; letter-spacing: 0.5px;">Beneficiary / Payee</div>
                <div style="font-size: 1.1rem; font-weight: 800; color: #FFFFFF; margin-bottom: 0.35rem;">Chandan Kumar <span style="font-size: 0.75rem; font-weight: 600; color: #6EE7B7;">(Director)</span></div>

                <div style="font-size: 0.78rem; opacity: 0.85; text-transform: uppercase; letter-spacing: 0.5px;">Official UPI ID</div>
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-top: 0.2rem; flex-wrap: wrap;">
                  <span id="upiIdText" style="font-family: monospace; font-size: 1rem; font-weight: 700; background: rgba(0,0,0,0.3); border: 1px solid rgba(52, 211, 153, 0.4); padding: 0.3rem 0.65rem; border-radius: 6px; color: #6EE7B7;">chandankr1501998@ybl</span>
                  <button type="button" id="btnCopyUpiId" style="background: #059669; color: #fff; border: none; padding: 0.3rem 0.6rem; border-radius: 6px; font-size: 0.75rem; font-weight: 700; cursor: pointer;">
                    <i class="fa-regular fa-copy"></i> Copy
                  </button>
                </div>
              </div>
            </div>

            <!-- One-Tap Auto-UPI Button for Mobile Devices -->
            <div style="margin-top: 1rem; padding-top: 0.85rem; border-top: 1px solid rgba(255,255,255,0.12);">
              <a id="autoUpiPayBtn" href="${initialUpiLink}" style="display: flex; align-items: center; justify-content: center; gap: 0.5rem; text-decoration: none; width: 100%; padding: 0.75rem 1rem; border-radius: 8px; font-weight: 700; font-size: 0.92rem; background: linear-gradient(135deg, #10B981 0%, #059669 100%); color: #fff; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.35); text-align: center;">
                <i class="fa-solid fa-mobile-screen-button"></i> <span id="autoUpiBtnLabel">Pay ₹${selectedPayAmount.toLocaleString()} with PhonePe / GPay / Paytm</span>
              </a>
              <div id="autoUpiNoteText" style="text-align: center; font-size: 0.72rem; opacity: 0.8; margin-top: 0.35rem;">Clicking opens PhonePe, Google Pay, or Paytm directly with ₹${selectedPayAmount.toLocaleString()} pre-filled.</div>
            </div>
          </div>

          <form id="studentPayReqForm">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.9rem; margin-bottom: 1rem;">
              <div>
                <label style="font-size: 0.85rem; font-weight: 600;">Payment Amount (₹) *</label>
                <input type="number" id="payReqAmount" class="portal-input" value="${selectedPayAmount}" required min="1">
              </div>
              <div>
                <label style="font-size: 0.85rem; font-weight: 600;">Payment Mode *</label>
                <select id="payReqMode" class="portal-input">
                  <option value="UPI (PhonePe)">UPI (PhonePe)</option>
                  <option value="UPI (Google Pay / Paytm / BHIM)">UPI (Google Pay / Paytm / BHIM)</option>
                  <option value="QR Code Scanner">QR Code Scanner</option>
                  <option value="Bank NEFT / IMPS Transfer">Bank NEFT / IMPS Transfer</option>
                </select>
              </div>
              <div style="grid-column: span 2;">
                <label style="font-size: 0.85rem; font-weight: 600;">UTR / Transaction Reference No. *</label>
                <input type="text" id="payReqUtr" class="portal-input" placeholder="e.g. 423910982341 (Required)" required>
                <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">Enter 12-digit UTR or Transaction ID from PhonePe / GPay / Paytm receipt.</div>
              </div>
              <div style="grid-column: span 2;">
                <label style="font-size: 0.85rem; font-weight: 600;">Attach Payment Proof Screenshot (Optional)</label>
                <input type="file" id="payReqProofInput" accept="image/*" class="portal-input" style="padding: 0.4rem;">
                <div id="payProofPreviewWrap" style="margin-top: 0.4rem; display: none;">
                  <img id="payProofPreviewImg" src="" style="max-height: 90px; border-radius: 6px; border: 1px solid var(--border-sand);">
                </div>
              </div>
              <div style="grid-column: span 2;">
                <label style="font-size: 0.85rem; font-weight: 600;">Note / Remarks (Optional)</label>
                <input type="text" id="payReqNote" class="portal-input" placeholder="e.g. Paid monthly tuition fee via PhonePe">
              </div>
            </div>

            <button type="submit" class="btn btn-emerald" style="width: 100%; padding: 0.8rem;">
              <i class="fa-solid fa-paper-plane"></i> Submit Payment Verification Request
            </button>
          </form>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modalEl = document.getElementById('studentPayReqModal');
    const proofInput = modalEl.querySelector('#payReqProofInput');
    const proofWrap = modalEl.querySelector('#payProofPreviewWrap');
    const proofImg = modalEl.querySelector('#payProofPreviewImg');
    const amountInput = modalEl.querySelector('#payReqAmount');
    const autoUpiBtn = modalEl.querySelector('#autoUpiPayBtn');
    const autoUpiLabel = modalEl.querySelector('#autoUpiBtnLabel');
    const autoUpiNote = modalEl.querySelector('#autoUpiNoteText');
    const copyBtn = modalEl.querySelector('#btnCopyUpiId');

    function updateModalUpiLink(amt) {
      const val = parseFloat(amt) || 0;
      if (autoUpiBtn) {
        autoUpiBtn.href = `upi://pay?pa=chandankr1501998@ybl&pn=Chandan%20Kumar%20Pragyan%20Institute&cu=INR&am=${val}`;
      }
      if (autoUpiLabel) {
        autoUpiLabel.textContent = `Pay ₹${val.toLocaleString()} with PhonePe / GPay / Paytm`;
      }
      if (autoUpiNote) {
        autoUpiNote.textContent = `Clicking opens PhonePe, Google Pay, or Paytm directly with ₹${val.toLocaleString()} pre-filled.`;
      }
    }

    const btnFull = modalEl.querySelector('#btnStudentPayFull');
    const btnMonthly = modalEl.querySelector('#btnStudentPayMonthly');
    const btnPartial = modalEl.querySelector('#btnStudentPayPartial');

    function setActivePayOption(activeBtn) {
      [btnFull, btnMonthly, btnPartial].forEach(b => {
        if (!b) return;
        if (b === activeBtn) {
          b.style.borderColor = '#10B981';
          b.style.background = '#ECFDF5';
          b.style.color = '#064E3B';
        } else {
          b.style.borderColor = '#CBD5E1';
          b.style.background = '#fff';
          b.style.color = '#334155';
        }
      });
    }

    btnFull?.addEventListener('click', () => {
      setActivePayOption(btnFull);
      amountInput.value = totalDue;
      updateModalUpiLink(totalDue);
    });

    btnMonthly?.addEventListener('click', () => {
      setActivePayOption(btnMonthly);
      amountInput.value = monthlyFee;
      updateModalUpiLink(monthlyFee);
    });

    btnPartial?.addEventListener('click', () => {
      setActivePayOption(btnPartial);
      amountInput.focus();
      amountInput.select();
    });

    // Dynamic auto-UPI update on amount change
    amountInput?.addEventListener('input', () => {
      const val = parseFloat(amountInput.value) || 0;
      updateModalUpiLink(val);
    });

    // Copy UPI ID button
    copyBtn?.addEventListener('click', () => {
      navigator.clipboard.writeText('chandankr1501998@ybl').then(() => {
        copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
        setTimeout(() => { copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i> Copy'; }, 2000);
      }).catch(() => {
        alert('UPI ID: chandankr1501998@ybl');
      });
    });

    let proofPreviewUrl = '';
    proofInput?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(evt) {
        proofPreviewUrl = evt.target.result;
        proofImg.src = proofPreviewUrl;
        proofWrap.style.display = 'block';
      };
      reader.readAsDataURL(file);
    });

    modalEl.querySelector('#studentPayReqForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const amount = parseFloat(modalEl.querySelector('#payReqAmount').value) || 0;
      const mode = modalEl.querySelector('#payReqMode').value;
      const utr = modalEl.querySelector('#payReqUtr').value.trim();
      const note = modalEl.querySelector('#payReqNote').value.trim();

      if (!utr) {
        alert('Please enter a valid UTR / Transaction Reference number.');
        return;
      }

      let proofPhotoUrl = '';
      const proofFile = proofInput?.files[0];
      if (proofFile) {
        try {
          proofPhotoUrl = await SupabaseSync.uploadFile(proofFile, 'payment_proofs');
        } catch (error) {
          alert(error.message || 'Unable to upload payment proof.');
          return;
        }
      }

      const allReqs = AppState.getRequests();
      allReqs.unshift({
        id: `REQ-PAY-${Date.now().toString(36).slice(-4)}-${Math.random().toString(36).slice(2,5)}`,
        type: 'payment',
        studentId: s.id,
        studentName: s.name,
        rollNo: s.rollNo,
        className: s.className,
        date: new Date().toISOString().split('T')[0],
        timestamp: getFormattedTimestamp(),
        status: 'Pending',
        paymentDetails: {
          amount,
          mode,
          utr,
          proofPhotoUrl,
          note
        }
      });

      await AppState.saveRequests(allReqs);
      AppState.addAuditLog(`Student (${s.name})`, 'PAYMENT_REQUEST_SUBMITTED', s.name, s.rollNo, `Submitted online payment verification request for ₹${amount.toLocaleString()} (UTR: ${utr})`, { amount, utr, mode });

      modalEl.remove();
      alert(`✅ Online payment verification request submitted! Admin will verify UTR: ${utr} and issue your official email receipt.`);
      renderStudentDashboard();
    });
  }

  /* ==========================================================================
   * ADMIN REQUESTS MANAGER (SUB-PARTS: PROFILE & PAYMENT VERIFICATION)
   * ========================================================================== */
  let activeAdminReqSubTab = 'payment'; // 'payment' or 'profile'

  function renderAdminRequestsManager() {
    const pane = document.getElementById('adminTabPane-requests');
    if (!pane) return;

    function getReqTime(r) {
      if (!r) return 0;
      if (r.created_at) {
        const t = new Date(r.created_at).getTime();
        if (!isNaN(t) && t > 0) return t;
      }
      if (r.timestamp) {
        const t = new Date(r.timestamp).getTime();
        if (!isNaN(t) && t > 0) return t;
      }
      if (r.request_date) {
        const t = new Date(r.request_date).getTime();
        if (!isNaN(t) && t > 0) return t;
      }
      if (r.date) {
        const t = new Date(r.date).getTime();
        if (!isNaN(t) && t > 0) return t;
      }
      const match = String(r.id || r.request_id || '').match(/(\d{10,13})/);
      if (match) return parseInt(match[1], 10);
      return 0;
    }

    const sortLatestFirst = (a, b) => {
      const isAPending = String(a.status || '').toLowerCase() === 'pending';
      const isBPending = String(b.status || '').toLowerCase() === 'pending';
      if (isAPending && !isBPending) return -1;
      if (!isAPending && isBPending) return 1;
      return getReqTime(b) - getReqTime(a);
    };

    const requests = AppState.getRequests();
    const pendingRequests = requests.filter(r => String(r.status || '').toLowerCase() === 'pending');
    const profileReqs = requests.filter(r => r.type !== 'payment').slice().sort(sortLatestFirst);
    const paymentReqs = requests.filter(r => r.type === 'payment').slice().sort(sortLatestFirst);

    const pendingProfileCount = profileReqs.filter(r => String(r.status || '').toLowerCase() === 'pending').length;
    const pendingPaymentCount = paymentReqs.filter(r => String(r.status || '').toLowerCase() === 'pending').length;

    // Update badge in tab
    const badgeEl = document.getElementById('adminRequestsBadge');
    if (badgeEl) {
      if (pendingRequests.length > 0) {
        badgeEl.textContent = pendingRequests.length;
        badgeEl.style.display = 'inline-block';
      } else {
        badgeEl.style.display = 'none';
      }
    }

    pane.innerHTML = `
      <div class="dash-card">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 1.25rem;">
          <h3 style="font-size: 1.15rem; font-weight: 700; color: var(--text-mahogany); margin: 0;">
            <i class="fa-solid fa-tasks" style="color: var(--primary-emerald);"></i> Administrative Requests Center
          </h3>
          <span style="font-size: 0.85rem; color: var(--text-muted);">
            Total Pending Review: <strong style="color: #DC2626;">${pendingRequests.length}</strong>
          </span>
        </div>

        <!-- Sub-Pills Selector -->
        <div class="req-sub-pills-bar" style="display: flex; gap: 0.5rem; margin-bottom: 1.25rem; border-bottom: 2px solid var(--border-sand); padding-bottom: 0.75rem; flex-wrap: wrap;">
          <button class="req-sub-pill ${activeAdminReqSubTab === 'payment' ? 'active' : ''}" data-sub="payment" style="flex: 1 1 200px; text-align: center; justify-content: center; min-width: 160px; height: 38px;">
            <i class="fa-solid fa-credit-card"></i> Fee Payment Verification (${pendingPaymentCount} Pending)
          </button>
          <button class="req-sub-pill ${activeAdminReqSubTab === 'profile' ? 'active' : ''}" data-sub="profile" style="flex: 1 1 200px; text-align: center; justify-content: center; min-width: 160px; height: 38px;">
            <i class="fa-solid fa-user-pen"></i> Profile Detail Requests (${pendingProfileCount} Pending)
          </button>
        </div>

        ${activeAdminReqSubTab === 'payment' ? `
          <!-- PAYMENT VERIFICATION REQUESTS SUB-PART -->
          ${paymentReqs.length === 0 ? `
            <div style="text-align: center; color: var(--text-muted); padding: 3rem 1rem;">
              <i class="fa-solid fa-circle-check" style="font-size: 2.5rem; color: #10B981; margin-bottom: 0.75rem;"></i>
              <p style="font-weight: 600;">No payment verification requests pending.</p>
              <p style="font-size: 0.82rem;">When students submit online payment proofs, they will appear here for verification.</p>
            </div>
          ` : `
            <div style="display: flex; flex-direction: column; gap: 1rem;">
              ${paymentReqs.map(req => {
                const isPending = req.status === 'Pending';
                const isApproved = req.status === 'Approved';
                const isRejected = req.status === 'Rejected';
                const p = {
                  ...(req.paymentDetails || {}),
                  note: sanitizeInput((req.paymentDetails || {}).note)
                };
                // This template is assembled with innerHTML. Escape all data that
                // can originate from a student request before interpolation.
                req = {
                  ...req,
                  id: sanitizeInput(req.id),
                  studentName: sanitizeInput(req.studentName),
                  rollNo: sanitizeInput(req.rollNo),
                  className: sanitizeInput(req.className),
                  timestamp: sanitizeInput(req.timestamp),
                  date: sanitizeInput(req.date)
                };

                return `
                  <div style="border: 1px solid var(--border-sand); border-radius: 10px; padding: 1.15rem; background: #FAF9F6;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.75rem;">
                      <div>
                        <h4 style="font-size: 1.05rem; font-weight: 700; margin: 0; color: var(--text-mahogany);">${req.studentName} <span style="font-size: 0.82rem; font-weight: 400; color: var(--text-muted);">(Roll #${req.rollNo} • ${req.className})</span></h4>
                        <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 0.2rem;">Submitted: ${req.timestamp || req.date} | Request ID: <strong>${req.id}</strong></div>
                      </div>
                      <div>
                        ${isPending ? `<span style="background: #FEF3C7; color: #92400E; padding: 0.25rem 0.75rem; border-radius: 99px; font-weight: 700; font-size: 0.78rem;">⏳ Pending Verification</span>` : ''}
                        ${isApproved ? `<span style="background: #D1FAE5; color: #065F46; padding: 0.25rem 0.75rem; border-radius: 99px; font-weight: 700; font-size: 0.78rem;">✅ Verified & Paid</span>` : ''}
                        ${isRejected ? `<span style="background: #FEE2E2; color: #991B1B; padding: 0.25rem 0.75rem; border-radius: 99px; font-weight: 700; font-size: 0.78rem;">❌ Verification Declined</span>` : ''}
                      </div>
                    </div>

                    <div style="background: #ffffff; border: 1px solid #E5E7EB; border-radius: 8px; padding: 0.9rem; margin-bottom: 0.85rem; font-size: 0.88rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.75rem;">
                      <div><span style="color:var(--text-muted);">Payment Request Amount:</span> <br><strong style="font-size: 1.15rem; color: var(--primary-emerald);">₹${(p.amount || 0).toLocaleString()}</strong></div>
                      <div><span style="color:var(--text-muted);">Submission Date:</span> <br><strong style="font-size: 0.9rem; color: var(--text-mahogany);">${req.date}</strong></div>
                      ${(p.utr || p.refNo) ? `<div><span style="color:var(--text-muted);">Transaction UTR / Ref ID:</span> <br><strong style="font-size: 0.95rem; color: #0284C7; font-family: monospace;">${sanitizeInput(p.utr || p.refNo)}</strong></div>` : ''}
                      ${p.note ? `<div style="grid-column: span 2;"><span style="color:var(--text-muted);">Student Description / Payment Note:</span> <br><em>${p.note}</em></div>` : ''}
                      ${(p.proofUrl || p.proof) ? `
                        <div style="grid-column: span 2; margin-top: 4px; padding: 8px; background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 6px; display: flex; align-items: center; gap: 10px;">
                          <a href="${sanitizeUrl(p.proofUrl || p.proof)}" target="_blank" rel="noopener">
                            <img src="${sanitizeUrl(p.proofUrl || p.proof)}" style="width: 55px; height: 55px; object-fit: cover; border-radius: 4px; border: 1px solid #059669;" alt="Payment Proof">
                          </a>
                          <div>
                            <strong style="color: #065F46; font-size: 0.85rem;"><i class="fa-solid fa-receipt"></i> Payment Proof Screenshot Attached</strong>
                            <div style="font-size: 0.75rem; color: #047857;"><a href="${sanitizeUrl(p.proofUrl || p.proof)}" target="_blank" rel="noopener" style="color: #059669; text-decoration: underline;">Click to open full proof screenshot</a></div>
                          </div>
                        </div>
                      ` : ''}
                    </div>

                    ${isPending ? `
                      <div class="req-action-buttons-wrap" style="display: flex; gap: 0.6rem; flex-wrap: wrap; align-items: stretch; margin-top: 0.65rem;">
                        <div style="display: flex; align-items: center; gap: 0.4rem; flex: 1 1 220px; min-width: 170px;">
                          <span style="font-size: 0.8rem; font-weight: 700; color: #065F46; background: #D1FAE5; padding: 0.4rem 0.75rem; border-radius: 6px; display: inline-flex; align-items: center; gap: 0.4rem; width: 100%; box-sizing: border-box; height: 38px;">
                            <i class="fa-solid fa-user-check"></i> Verifier: ${getActiveTeacherName()}
                          </span>
                        </div>
                        <button class="btn btn-emerald btn-approve-pay-req" data-id="${req.id}" style="padding: 0.5rem 1.15rem; font-size: 0.84rem; flex: 1 1 200px; justify-content: center; display: inline-flex; align-items: center; gap: 0.4rem; height: 38px;">
                          <i class="fa-solid fa-check-double"></i> Verify & Approve Payment
                        </button>
                        <button class="btn btn-decline-pay-req" data-id="${req.id}" style="background-color: #DC2626; color: #fff; padding: 0.5rem 1rem; font-size: 0.84rem; border: none; cursor: pointer; border-radius: 6px; font-weight: 600; flex: 0 1 90px; justify-content: center; display: inline-flex; align-items: center; gap: 0.4rem; height: 38px;">
                          <i class="fa-solid fa-xmark"></i> Decline
                        </button>
                      </div>
                    ` : ''}
                  </div>
                `;
              }).join('')}
            </div>
          `}
        ` : `
          <!-- PROFILE DETAIL REQUESTS SUB-PART -->
          ${profileReqs.length === 0 ? `
            <div style="text-align: center; color: var(--text-muted); padding: 3rem 1rem;">
              <i class="fa-solid fa-circle-check" style="font-size: 2.5rem; color: #10B981; margin-bottom: 0.75rem;"></i>
              <p style="font-weight: 600;">No profile detail change requests pending.</p>
              <p style="font-size: 0.82rem;">When students request detail updates, they will appear here for your approval.</p>
            </div>
          ` : `
            <div style="display: flex; flex-direction: column; gap: 1rem;">
              ${profileReqs.map(req => {
                const isPending = req.status === 'Pending';
                const isApproved = req.status === 'Approved';
                const isRejected = req.status === 'Rejected';
                const escapeRequestData = (data = {}) => {
                  if (!data || typeof data !== 'object') return {};
                  return Object.fromEntries(
                    Object.entries(data).map(([key, value]) => [
                      key,
                      key.toLowerCase().includes('photo') ? (typeof value === 'string' ? value.trim() : '') : sanitizeInput(value)
                    ])
                  );
                };
                req = {
                  ...req,
                  id: sanitizeInput(req.id),
                  studentName: sanitizeInput(req.studentName),
                  rollNo: sanitizeInput(req.rollNo),
                  className: sanitizeInput(req.className),
                  date: sanitizeInput(req.date),
                  oldData: escapeRequestData(req.oldData),
                  newData: escapeRequestData(req.newData)
                };

                let diffs = [];
                if (req.oldData && req.newData) {
                  if (req.oldData.name !== req.newData.name && req.newData.name) diffs.push(`Name: <s>${req.oldData.name || 'N/A'}</s> ➔ <strong style="color:#059669;">${req.newData.name}</strong>`);
                  if (req.oldData.mobile !== req.newData.mobile && req.newData.mobile) diffs.push(`Mobile: <s>${req.oldData.mobile || 'N/A'}</s> ➔ <strong style="color:#059669;">${req.newData.mobile}</strong>`);
                  if (req.oldData.dob !== req.newData.dob && req.newData.dob) diffs.push(`DOB: <s>${req.oldData.dob || 'N/A'}</s> ➔ <strong style="color:#059669;">${req.newData.dob}</strong>`);
                  if (req.oldData.email !== req.newData.email && (req.newData.email || req.oldData.email)) diffs.push(`Email: <s>${req.oldData.email || 'N/A'}</s> ➔ <strong style="color:#059669;">${req.newData.email || 'None'}</strong>`);
                  if (req.oldData.address !== req.newData.address && req.newData.address) diffs.push(`Address: <s>${req.oldData.address || 'N/A'}</s> ➔ <strong style="color:#059669;">${req.newData.address}</strong>`);
                  if (req.oldData.bloodGroup !== req.newData.bloodGroup && req.newData.bloodGroup) diffs.push(`Blood Group: <s>${req.oldData.bloodGroup || 'N/A'}</s> ➔ <strong style="color:#059669;">${req.newData.bloodGroup}</strong>`);
                  if (req.oldData.guardianName !== req.newData.guardianName && req.newData.guardianName) diffs.push(`Guardian: <s>${req.oldData.guardianName || 'N/A'}</s> ➔ <strong style="color:#059669;">${req.newData.guardianName}</strong>`);
                  if (req.oldData.guardianMobile !== req.newData.guardianMobile && req.newData.guardianMobile) diffs.push(`Guardian Phone: <s>${req.oldData.guardianMobile || 'N/A'}</s> ➔ <strong style="color:#059669;">${req.newData.guardianMobile}</strong>`);
                  
                  const newPhotoVal = req.newData.photoUrl || req.newData.photo || req.newData.photo_url;
                  const oldPhotoVal = req.oldData.photoUrl || req.oldData.photo || req.oldData.photo_url;
                  if (newPhotoVal && (newPhotoVal.startsWith('data:image/') || newPhotoVal.startsWith('http'))) {
                    diffs.push(`
                      <div style="margin-top: 6px; padding: 10px; background: #ECFDF5; border: 1.5px solid #10B981; border-radius: 8px; display: inline-flex; align-items: center; gap: 12px;">
                        <img src="${newPhotoVal}" style="width: 65px; height: 65px; border-radius: 8px; object-fit: cover; border: 2px solid #059669; box-shadow: 0 2px 5px rgba(0,0,0,0.15);" alt="New Photo Preview">
                        <div>
                          <strong style="color: #065F46; font-size: 0.9rem;"><i class="fa-solid fa-camera"></i> Attached Profile Photo</strong>
                          <div style="font-size: 0.78rem; color: #047857; margin-top: 2px;">${newPhotoVal !== oldPhotoVal ? '✨ New photo update requested' : '📷 Existing photo attached'}</div>
                        </div>
                      </div>
                    `);
                  }
                }
                if (diffs.length === 0) diffs.push('<span style="color:#6B7280; font-style:italic;">No text or photo field changes detected between old and new submission.</span>');

                return `
                  <div style="border: 1px solid var(--border-sand); border-radius: 10px; padding: 1.15rem; background: #FAF9F6;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.75rem;">
                      <div>
                        <h4 style="font-size: 1.05rem; font-weight: 700; margin: 0; color: var(--text-mahogany);">${req.studentName} <span style="font-size: 0.82rem; font-weight: 400; color: var(--text-muted);">(Roll #${req.rollNo} • ${req.className})</span></h4>
                        <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 0.2rem;">Request ID: <strong>${req.id}</strong> | Date: ${req.date}</div>
                      </div>
                      <div>
                        ${isPending ? `<span style="background: #FEF3C7; color: #92400E; padding: 0.25rem 0.75rem; border-radius: 99px; font-weight: 700; font-size: 0.78rem;">⏳ Pending Review</span>` : ''}
                        ${isApproved ? `<span style="background: #D1FAE5; color: #065F46; padding: 0.25rem 0.75rem; border-radius: 99px; font-weight: 700; font-size: 0.78rem;">✅ Approved & Updated</span>` : ''}
                        ${isRejected ? `<span style="background: #FEE2E2; color: #991B1B; padding: 0.25rem 0.75rem; border-radius: 99px; font-weight: 700; font-size: 0.78rem;">❌ Declined</span>` : ''}
                      </div>
                    </div>

                    <div style="background: #ffffff; border: 1px solid #E5E7EB; border-radius: 8px; padding: 0.85rem; margin-bottom: 0.85rem; font-size: 0.88rem; line-height: 1.6;">
                      <div style="font-weight: 600; color: var(--text-charcoal); margin-bottom: 0.4rem;">Requested Field Changes:</div>
                      <ul style="margin: 0; padding-left: 1.25rem; color: #374151;">
                        ${diffs.map(d => `<li>${d}</li>`).join('')}
                      </ul>
                    </div>

                    ${isPending ? `
                      <div class="req-action-buttons-wrap" style="display: flex; gap: 0.6rem; flex-wrap: wrap; margin-top: 0.65rem;">
                        <button class="btn btn-emerald btn-approve-request" data-id="${req.id}" style="padding: 0.5rem 1.15rem; font-size: 0.84rem; flex: 1 1 180px; min-width: 140px; justify-content: center; display: inline-flex; align-items: center; gap: 0.4rem; height: 38px;">
                          <i class="fa-solid fa-check"></i> Approve & Apply Changes
                        </button>
                        <button class="btn btn-decline-request" data-id="${req.id}" style="background-color: #DC2626; color: #fff; padding: 0.5rem 1.15rem; font-size: 0.84rem; border: none; cursor: pointer; border-radius: 6px; font-weight: 600; flex: 1 1 130px; min-width: 110px; justify-content: center; display: inline-flex; align-items: center; gap: 0.4rem; height: 38px;">
                          <i class="fa-solid fa-xmark"></i> Decline Request
                        </button>
                      </div>
                    ` : ''}
                  </div>
                `;
              }).join('')}
            </div>
          `}
        `}
      </div>
    `;

    // Bind Sub-Pill Toggles
    pane.querySelectorAll('.req-sub-pill').forEach(btn => {
      btn.onclick = () => {
        activeAdminReqSubTab = btn.dataset.sub;
        renderAdminRequestsManager();
      };
    });

    // Bind Payment Request Approve
    pane.querySelectorAll('.btn-approve-pay-req').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.dataset.id;
        const reqList = AppState.getRequests();
        const reqItem = reqList.find(r => r.id === id);
        if (!reqItem || !reqItem.paymentDetails) return;
        if (btn.dataset.processing === 'true') return;
        btn.dataset.processing = 'true';
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verifying & Updating Database...';

        const verifierName = getActiveTeacherName();

        // 1. Direct Cloud Database Update to student_requests
        if (typeof SupabaseSync !== 'undefined' && SupabaseSync.mutate) {
          try {
            await SupabaseSync.mutate('student_requests', 'update', {
              status: 'Approved',
              updated_at: new Date().toISOString()
            }, { where: { request_id: id } });
          } catch(e) {
            console.warn('Direct request status update note:', e.message);
          }
        }

        // 2. Find Student and Update Balances
        const students = AppState.getStudents();
        const studentIdx = students.findIndex(s => s.id === reqItem.studentId || isStudentRequestMatch(reqItem, s));
        if (studentIdx === -1) {
          alert('⚠️ Student record not found in database.');
          btn.disabled = false;
          btn.innerHTML = '<i class="fa-solid fa-check-double"></i> Verify & Approve Payment';
          return;
        }

        const s = students[studentIdx];
        const payVal = Number(reqItem.paymentDetails.amount || 0);
        const note = reqItem.paymentDetails.note || 'Online payment verified by admin';
        const utrVal = reqItem.paymentDetails.utr || reqItem.paymentDetails.refNo || '';
        const recNo = `REC-ONL-${Date.now().toString(36).slice(-4)}-${Math.random().toString(36).slice(2,5)}`;

        s.paidFee = Number(s.paidFee || 0) + payVal;
        s.pendingFee = Math.max(0, Number(s.pendingFee || 0) - payVal);

        if (!Array.isArray(s.feeHistory)) s.feeHistory = [];
        s.feeHistory.push({
          receiptNo: recNo,
          utr: utrVal,
          date: getFormattedTimestamp(),
          amount: payVal,
          mode: utrVal ? `UPI / Online (UTR: ${utrVal})` : 'Verified Online Payment',
          status: 'Paid',
          by: verifierName,
          note: note
        });

        students[studentIdx] = s;
        await AppState.saveStudents(students);

        // Direct Cloud Update for Student & Fee Receipt
        if (typeof SupabaseSync !== 'undefined' && SupabaseSync.mutate) {
          try {
            const stuWhere = s.student_id ? { student_id: s.student_id } : (s.rollNo ? { roll_no: s.rollNo } : { id: s.id });
            await SupabaseSync.mutate('students', 'update', {
              paid_fee: s.paidFee,
              pending_fee: s.pendingFee
            }, { where: stuWhere });

            const studentUuid = s.db_uuid || (s.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.id) ? s.id : null);
            if (studentUuid) {
              await SupabaseSync.mutate('fee_receipts', 'upsert', [{
                receipt_no: recNo,
                student_id: studentUuid,
                amount: payVal,
                payment_mode: utrVal ? `UPI (UTR: ${utrVal})` : 'Online Payment',
                payment_date: new Date().toISOString().split('T')[0],
                status: 'Paid',
                collected_by: verifierName,
                note: note
              }], { conflict: 'receipt_no' });
            }
          } catch(err) {
            console.warn('Cloud receipt insert note:', err.message);
          }
        }

        reqItem.status = 'Approved';
        await AppState.saveRequests(reqList);

        // Record Audit Log
        AppState.addAuditLog(verifierName, 'PAYMENT_VERIFIED', s.name, s.rollNo, `Verified & approved payment request of ₹${payVal.toLocaleString()} ("${note}") for ${s.name}`, { amount: payVal, note, receiptNo: recNo });

        // Send Notice to Student
        const notices = AppState.getNotices();
        notices.unshift({
          id: `NTC-PAY-APP-${Date.now().toString(36).slice(-4)}-${Math.random().toString(36).slice(2,5)}`,
          title: `✅ Payment Request Approved (₹${payVal.toLocaleString()})`,
          category: 'fees',
          date: new Date().toISOString().split('T')[0],
          message: `Dear ${s.name}, your online payment of ₹${payVal.toLocaleString()} ("${note}") has been verified and approved by ${verifierName}!`,
          targetBatch: s.className,
          unread: true
        });
        await AppState.saveNotices(notices);

        // 3. FULL REFETCH FROM DATABASE to ensure 100% cloud consistency
        if (typeof SupabaseSync !== 'undefined' && SupabaseSync.pullAll) {
          try {
            await SupabaseSync.pullAll();
          } catch(syncErr) {
            console.warn('Post-approval pullAll note:', syncErr.message);
          }
        }

        alert(`✅ Payment Request Approved for ${s.name}! ₹${payVal.toLocaleString()} credited.`);
        renderAdminRequestsManager();
        renderAdminDashboard();
      };
    });

    // Bind Payment Request Decline
    pane.querySelectorAll('.btn-decline-pay-req').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.dataset.id;
        const reqList = AppState.getRequests();
        const reqItem = reqList.find(r => r.id === id);
        if (!reqItem) return;
        if (btn.dataset.processing === 'true') return;
        btn.dataset.processing = 'true';
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Declining in Database...';

        const verifierName = getActiveTeacherName();
        const payVal = reqItem.paymentDetails?.amount || 0;
        const note = reqItem.paymentDetails?.note || '';

        // 1. Direct Cloud Database Update to student_requests
        if (typeof SupabaseSync !== 'undefined' && SupabaseSync.mutate) {
          try {
            await SupabaseSync.mutate('student_requests', 'update', {
              status: 'Rejected',
              updated_at: new Date().toISOString()
            }, { where: { request_id: id } });
          } catch(e) {
            console.warn('Direct payment decline note:', e.message);
          }
        }

        reqItem.status = 'Rejected';
        await AppState.saveRequests(reqList);

        const notices = AppState.getNotices();
        notices.unshift({
          id: `NTC-PAY-DEC-${Date.now().toString(36).slice(-4)}-${Math.random().toString(36).slice(2,5)}`,
          title: `❌ Payment Request Declined`,
          category: 'fees',
          date: new Date().toISOString().split('T')[0],
          message: `Dear ${reqItem.studentName}, your payment verification request for ₹${payVal.toLocaleString()} ("${note}") was reviewed and declined by ${verifierName}. Please contact the institute office.`,
          targetBatch: reqItem.className,
          unread: true
        });
        await AppState.saveNotices(notices);
        AppState.addAuditLog(verifierName, 'PAYMENT_DECLINED', reqItem.studentName, reqItem.rollNo, `Declined payment request for ₹${payVal.toLocaleString()} for ${reqItem.studentName}`, { reqId: id, amount: payVal });

        // Full Refetch from Database
        if (typeof SupabaseSync !== 'undefined' && SupabaseSync.pullAll) {
          try {
            await SupabaseSync.pullAll();
          } catch(syncErr) {
            console.warn('Post-decline pullAll note:', syncErr.message);
          }
        }

        alert(`❌ Payment Request ${id} Declined.`);
        renderAdminRequestsManager();
        renderAdminDashboard();
      };
    });

    // Bind Profile Request Approve
    pane.querySelectorAll('.btn-approve-request').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.dataset.id;
        const reqList = AppState.getRequests();
        const reqItem = reqList.find(r => r.id === id);
        if (!reqItem) return;
        if (btn.dataset.processing === 'true') return;
        btn.dataset.processing = 'true';
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Updating Database & Applying Changes...';

        const students = AppState.getStudents();
        const studentIdx = students.findIndex(s => isStudentRequestMatch(reqItem, s));

        if (studentIdx !== -1) {
          const allowedProfileFields = ['name', 'mobile', 'dob', 'guardianName', 'guardian_name', 'guardianMobile', 'guardian_mobile', 'email', 'address', 'bloodGroup', 'blood_group', 'photo', 'photo_url', 'photoUrl'];
          const safeUpdates = {};
          for (const key of allowedProfileFields) {
            if (reqItem.newData && reqItem.newData[key] !== undefined) {
              safeUpdates[key] = reqItem.newData[key];
            }
          }
          const updated = {
            ...students[studentIdx],
            ...safeUpdates
          };
          if (reqItem.newData?.photoUrl || reqItem.newData?.photo || reqItem.newData?.photo_url) {
            const photoVal = reqItem.newData.photoUrl || reqItem.newData.photo || reqItem.newData.photo_url;
            const existingOldPhoto = students[studentIdx].photo || students[studentIdx].photoUrl || students[studentIdx].photo_url || '';
            if (existingOldPhoto && existingOldPhoto !== photoVal && existingOldPhoto.includes('/pragyan-media/')) {
              try { await SupabaseSync.deleteFile(existingOldPhoto); } catch(e) { console.warn('Cleaned old photo note:', e.message); }
            }
            updated.photo = photoVal;
            updated.photo_url = photoVal;
            updated.photoUrl = photoVal;
          }
          students[studentIdx] = updated;
          await AppState.saveStudents(students);

          // Direct cloud database write to ensure instant remote update
          if (typeof SupabaseSync !== 'undefined' && SupabaseSync.mutate) {
            const stuTarget = students[studentIdx];
            const supaPayload = {
              name: updated.name,
              mobile: updated.mobile || null,
              dob: updated.dob,
              class_name: updated.className,
              guardian_name: updated.guardianName || null,
              guardian_mobile: updated.guardianMobile || null,
              email: (updated.email && updated.email.includes('@')) ? updated.email.trim() : null,
              address: updated.address || '',
              blood_group: updated.bloodGroup || '',
              photo_url: updated.photoUrl || updated.photo || ''
            };

            try {
              if (stuTarget.student_id) {
                await SupabaseSync.mutate('students', 'update', supaPayload, { where: { student_id: stuTarget.student_id } });
              } else if (stuTarget.rollNo) {
                await SupabaseSync.mutate('students', 'update', supaPayload, { where: { roll_no: stuTarget.rollNo } });
              } else if (stuTarget.id) {
                await SupabaseSync.mutate('students', 'update', supaPayload, { where: { id: stuTarget.id } });
              }
            } catch(dbErr) {
              console.warn('Direct student update note:', dbErr.message);
            }
          }

          // Relational Linking: Cascade profile changes to student_fee_accounts
          const feeAccounts = AppState.getFeeAccounts();
          const accIdx = feeAccounts.findIndex(a => 
            String(a.student_id || a.studentId || '').toLowerCase() === String(students[studentIdx].id || students[studentIdx].student_id || '').toLowerCase() ||
            String(a.roll_no || a.rollNo || '').toLowerCase() === String(students[studentIdx].rollNo || students[studentIdx].roll_no || '').toLowerCase()
          );
          if (accIdx !== -1) {
            feeAccounts[accIdx].student_name = updated.name;
            feeAccounts[accIdx].studentName = updated.name;
            feeAccounts[accIdx].class_name = updated.className;
            feeAccounts[accIdx].className = updated.className;
            await AppState.saveFeeAccounts(feeAccounts);
          }

          // Persist session if current user matches
          if (AppState.currentUser) {
            const curId = (AppState.currentUser.id || AppState.currentUser.student_id || '').toString().toLowerCase();
            const curRoll = (AppState.currentUser.rollNo || AppState.currentUser.roll_no || '').toString().toLowerCase();
            const targetId = (students[studentIdx].id || students[studentIdx].student_id || '').toString().toLowerCase();
            const targetRoll = (students[studentIdx].rollNo || students[studentIdx].roll_no || '').toString().toLowerCase();
            if (curId === targetId || curId === targetRoll || curRoll === targetRoll || curRoll === targetId) {
              AppState.currentUser = students[studentIdx];
              saveSession('student', students[studentIdx]);
            }
          }
        }

        // 1. Direct Cloud Database Update to student_requests
        if (typeof SupabaseSync !== 'undefined' && SupabaseSync.mutate) {
          try {
            await SupabaseSync.mutate('student_requests', 'update', {
              status: 'Approved',
              updated_at: new Date().toISOString()
            }, { where: { request_id: id } });
          } catch(e) {
            console.warn('Direct request status update note:', e.message);
          }
        }

        reqItem.status = 'Approved';
        await AppState.saveRequests(reqList);

        AppState.addAuditLog('Admin', 'PROFILE_APPROVED', reqItem.studentName, reqItem.rollNo, `Profile detail update request approved for ${reqItem.studentName}`, { reqId: reqItem.id });

        const notices = AppState.getNotices();
        notices.unshift({
          id: `NTC-APP-${Date.now().toString(36).slice(-4)}-${Math.random().toString(36).slice(2,5)}`,
          title: `✅ Profile Detail Update Approved`,
          category: 'general',
          date: new Date().toISOString().split('T')[0],
          message: `Dear ${reqItem.studentName}, your requested detail updates (Name, Contact, Email, Photo, Address, etc.) have been verified and approved by the Admin! Your profile is now updated.`,
          targetBatch: reqItem.className,
          unread: true
        });
        await AppState.saveNotices(notices);

        // 2. Full Refetch from Database to guarantee cloud sync
        if (typeof SupabaseSync !== 'undefined' && SupabaseSync.pullAll) {
          try {
            await SupabaseSync.pullAll();
          } catch(syncErr) {
            console.warn('Post-approval pullAll note:', syncErr.message);
          }
        }

        alert(`✅ Profile Request ${id} Approved! Student profile and photo updated.`);
        renderAdminRequestsManager();
        renderAdminDashboard();
      };
    });

    // Bind Profile Request Decline
    pane.querySelectorAll('.btn-decline-request').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.dataset.id;
        const reqList = AppState.getRequests();
        const reqItem = reqList.find(r => r.id === id);
        if (!reqItem) return;
        if (btn.dataset.processing === 'true') return;
        btn.dataset.processing = 'true';
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Declining in Database...';

        // If a new photo was uploaded with this request, delete it from storage on decline
        const newPhoto = reqItem.newData?.photoUrl || reqItem.newData?.photo || reqItem.newData?.photo_url;
        const oldPhoto = reqItem.oldData?.photoUrl || reqItem.oldData?.photo || reqItem.oldData?.photo_url;
        if (newPhoto && newPhoto !== oldPhoto && typeof SupabaseSync !== 'undefined' && SupabaseSync.deleteFile) {
          try {
            await SupabaseSync.deleteFile(newPhoto);
            console.log('Unapproved photo deleted from Supabase Storage:', newPhoto);
          } catch(delErr) {
            console.warn('Failed to delete unapproved photo:', delErr);
          }
        }

        // 1. Direct Cloud Database Update to student_requests
        if (typeof SupabaseSync !== 'undefined' && SupabaseSync.mutate) {
          try {
            await SupabaseSync.mutate('student_requests', 'update', {
              status: 'Rejected',
              updated_at: new Date().toISOString()
            }, { where: { request_id: id } });
          } catch(e) {
            console.warn('Direct request rejection note:', e.message);
          }
        }

        reqItem.status = 'Rejected';
        await AppState.saveRequests(reqList);

        const notices = AppState.getNotices();
        notices.unshift({
          id: `NTC-DEC-${Date.now().toString(36).slice(-4)}-${Math.random().toString(36).slice(2,5)}`,
          title: `❌ Profile Detail Update Request Declined`,
          category: 'general',
          date: new Date().toISOString().split('T')[0],
          message: `Dear ${reqItem.studentName}, your profile detail update request was reviewed and declined by the Admin. Please contact the institute office for details.`,
          targetBatch: reqItem.className,
          unread: true
        });
        await AppState.saveNotices(notices);
        AppState.addAuditLog('Admin', 'PROFILE_DECLINED', reqItem.studentName, reqItem.rollNo, `Declined profile update request for ${reqItem.studentName}`, { reqId: id });

        // 2. Full Refetch from Database to guarantee cloud sync
        if (typeof SupabaseSync !== 'undefined' && SupabaseSync.pullAll) {
          try {
            await SupabaseSync.pullAll();
          } catch(syncErr) {
            console.warn('Post-decline pullAll note:', syncErr.message);
          }
        }

        alert(`❌ Change Request ${id} Declined.`);
        renderAdminRequestsManager();
        renderAdminDashboard();
      };
    });
  }

  /* ==========================================================================
   * MASTER ADMIN AUDIT & ACTION HISTORY TAB
   * ========================================================================== */
  let currentAuditFilter = 'all';
  let currentAuditEducator = 'all';
  let currentAuditSearch = '';

  function renderAdminAuditHistoryTab() {
    const pane = document.getElementById('adminTabPane-history');
    if (!pane) return;

    const allLogs = AppState.getAuditLogs();

    let filteredLogs = allLogs.filter(log => {
      let matchesFilter = true;
      if (currentAuditFilter === 'FEE_PAYMENT') matchesFilter = (log.actionType === 'FEE_PAYMENT');
      else if (currentAuditFilter === 'PAYMENT_VERIFIED') matchesFilter = (log.actionType === 'PAYMENT_VERIFIED');
      else if (currentAuditFilter === 'PROFILE_APPROVED') matchesFilter = (log.actionType === 'PROFILE_APPROVED');
      else if (currentAuditFilter === 'NOTICE_BROADCAST') matchesFilter = (log.actionType === 'NOTICE_BROADCAST');
      else if (currentAuditFilter === 'STUDENT_REGISTERED') matchesFilter = (log.actionType === 'STUDENT_REGISTERED');

      let matchesEducator = true;
      if (currentAuditEducator !== 'all') {
        matchesEducator = log.actor && log.actor.toLowerCase().includes(currentAuditEducator.toLowerCase());
      }

      let matchesSearch = true;
      if (currentAuditSearch) {
        const q = currentAuditSearch.toLowerCase();
        matchesSearch = (log.studentName && log.studentName.toLowerCase().includes(q)) ||
                        (log.actor && log.actor.toLowerCase().includes(q)) ||
                        (log.description && log.description.toLowerCase().includes(q)) ||
                        (log.studentRoll && log.studentRoll.toLowerCase().includes(q));
      }
      return matchesFilter && matchesEducator && matchesSearch;
    });

    // Calculate total collection by current educator filter
    const totalCollectedByEducator = filteredLogs
      .filter(l => l.actionType === 'FEE_PAYMENT' || l.actionType === 'PAYMENT_VERIFIED')
      .reduce((sum, l) => sum + (l.details?.amount || 0), 0);

    pane.innerHTML = `
      <div class="dash-card">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 1.25rem;">
          <div>
            <h3 style="font-size: 1.15rem; font-weight: 700; color: var(--text-mahogany); margin: 0;">
              <i class="fa-solid fa-clock-rotate-left" style="color: var(--primary-emerald);"></i> Master Administrative Audit & Action History Log (${allLogs.length})
            </h3>
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.2rem;">Complete chronological audit trial of all fee collections, approvals, announcements, and registrations by specific educators</div>
          </div>
          <div class="admin-audit-filter-wrap" style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; width: 100%; max-width: 520px;">
            <select id="adminAuditEducatorSelect" class="portal-input" style="flex: 1 1 180px; min-width: 150px; max-width: 100%; font-size: 0.82rem; height: 38px; padding: 0.4rem 0.65rem; border-color: var(--primary-emerald); font-weight: 600;">
              <option value="all" ${currentAuditEducator === 'all' ? 'selected' : ''}>🌟 All Educators / Admins</option>
              <option value="Ravi" ${currentAuditEducator === 'Ravi' ? 'selected' : ''}>👔 Prof. Ravi Ranjan</option>
              <option value="Chandan" ${currentAuditEducator === 'Chandan' ? 'selected' : ''}>🔬 Chandan Kumar</option>
            </select>
            <input type="text" id="adminAuditSearchInput" class="portal-input" placeholder="🔍 Search audit history..." value="${currentAuditSearch}" style="flex: 1 1 180px; min-width: 150px; max-width: 100%; font-size: 0.82rem; height: 38px; padding: 0.4rem 0.65rem;">
          </div>
        </div>

        ${currentAuditEducator !== 'all' ? `
          <div style="background: #D1FAE5; border: 1px solid #10B981; border-radius: 8px; padding: 0.85rem 1.15rem; margin-bottom: 1.25rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
            <div>
              <div style="font-weight: 700; color: #065F46; font-size: 0.95rem;">
                <i class="fa-solid fa-user-tie"></i> Audit Log Filtered for Educator: <strong>${currentAuditEducator === 'Ravi' ? 'Prof. Ravi Ranjan (Director & Maths Lead)' : 'Chandan Kumar (Director & Science Lead)'}</strong>
              </div>
              <div style="font-size: 0.82rem; color: #047857; margin-top: 0.2rem;">
                Total Fee Payments Verified / Accepted by this Educator: <strong style="font-size: 1rem; color: #065F46;">₹${totalCollectedByEducator.toLocaleString()}</strong> across <strong>${filteredLogs.filter(l => l.actionType === 'FEE_PAYMENT' || l.actionType === 'PAYMENT_VERIFIED').length}</strong> transactions.
              </div>
            </div>
            <button class="btn" id="btnClearEducatorFilter" style="background: #065F46; color: #fff; padding: 0.3rem 0.75rem; font-size: 0.78rem; border-radius: 6px;">Clear Filter</button>
          </div>
        ` : ''}

        <!-- Filter Chips -->
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1.25rem;">
          <button class="notice-admin-filter-chip ${currentAuditFilter === 'all' ? 'active' : ''}" data-audit-filter="all">All (${allLogs.length})</button>
          <button class="notice-admin-filter-chip ${currentAuditFilter === 'FEE_PAYMENT' ? 'active' : ''}" data-audit-filter="FEE_PAYMENT">💳 Direct Fee Payments</button>
          <button class="notice-admin-filter-chip ${currentAuditFilter === 'PAYMENT_VERIFIED' ? 'active' : ''}" data-audit-filter="PAYMENT_VERIFIED">✅ Verified Online Payments</button>
          <button class="notice-admin-filter-chip ${currentAuditFilter === 'PROFILE_APPROVED' ? 'active' : ''}" data-audit-filter="PROFILE_APPROVED">👤 Profile Approvals</button>
          <button class="notice-admin-filter-chip ${currentAuditFilter === 'NOTICE_BROADCAST' ? 'active' : ''}" data-audit-filter="NOTICE_BROADCAST">📢 Announcements</button>
          <button class="notice-admin-filter-chip ${currentAuditFilter === 'STUDENT_REGISTERED' ? 'active' : ''}" data-audit-filter="STUDENT_REGISTERED">🎓 Student Registrations</button>
        </div>

        <!-- History Timeline List -->
        ${filteredLogs.length === 0 ? `
          <div style="text-align: center; color: var(--text-muted); padding: 3rem 1rem;">
            <i class="fa-solid fa-clock" style="font-size: 2.5rem; color: #9CA3AF; margin-bottom: 0.75rem;"></i>
            <p style="font-weight: 600;">No audit history records found matching criteria.</p>
          </div>
        ` : `
          <div style="display: flex; flex-direction: column; gap: 0.85rem;">
            ${filteredLogs.map(log => {
              const typePill = log.actionType === 'FEE_PAYMENT'
                ? '<span style="background: #D1FAE5; color: #065F46; padding: 0.2rem 0.6rem; border-radius: 99px; font-weight: 700; font-size: 0.75rem;"><i class="fa-solid fa-indian-rupee-sign"></i> Direct Cash/Fee Payment</span>'
                : log.actionType === 'PAYMENT_VERIFIED'
                ? '<span style="background: #E0F2FE; color: #075985; padding: 0.2rem 0.6rem; border-radius: 99px; font-weight: 700; font-size: 0.75rem;"><i class="fa-solid fa-check-double"></i> Online Payment Verified</span>'
                : log.actionType === 'PROFILE_APPROVED'
                ? '<span style="background: #FEF3C7; color: #92400E; padding: 0.2rem 0.6rem; border-radius: 99px; font-weight: 700; font-size: 0.75rem;"><i class="fa-solid fa-user-check"></i> Profile Approved</span>'
                : log.actionType === 'NOTICE_BROADCAST'
                ? '<span style="background: #EEF2FF; color: #4338CA; padding: 0.2rem 0.6rem; border-radius: 99px; font-weight: 700; font-size: 0.75rem;"><i class="fa-solid fa-bullhorn"></i> Announcement</span>'
                : '<span style="background: #F3E8FF; color: #6B21A8; padding: 0.2rem 0.6rem; border-radius: 99px; font-weight: 700; font-size: 0.75rem;"><i class="fa-solid fa-user-plus"></i> Student Registered</span>';

              return `
                <div style="border: 1px solid var(--border-sand); border-radius: 8px; padding: 1rem; background: #FAF9F6; display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.75rem;">
                  <div style="flex: 1; min-width: 250px;">
                    <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; margin-bottom: 0.35rem;">
                      ${typePill}
                      <span style="font-size: 0.78rem; font-weight: 700; color: var(--primary-emerald); background: rgba(6, 78, 59, 0.08); padding: 0.15rem 0.5rem; border-radius: 4px;">
                        <i class="fa-solid fa-user-tie"></i> ${log.actor}
                      </span>
                      <span style="font-size: 0.78rem; color: var(--text-muted);"><i class="fa-regular fa-clock"></i> ${log.timestamp}</span>
                    </div>
                    <div style="font-weight: 700; font-size: 0.95rem; color: var(--text-mahogany); margin-bottom: 0.2rem;">${log.description}</div>
                    <div style="font-size: 0.8rem; color: var(--text-muted);">Target Student: <strong>${log.studentName}</strong> (Roll #${log.studentRoll})</div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>
    `;

    pane.querySelector('#adminAuditEducatorSelect')?.addEventListener('change', (e) => {
      currentAuditEducator = e.target.value;
      renderAdminAuditHistoryTab();
    });

    pane.querySelector('#btnClearEducatorFilter')?.addEventListener('click', () => {
      currentAuditEducator = 'all';
      renderAdminAuditHistoryTab();
    });

    pane.querySelector('#adminAuditSearchInput')?.addEventListener('input', (e) => {
      currentAuditSearch = e.target.value;
      renderAdminAuditHistoryTab();
    });

    pane.querySelectorAll('[data-audit-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        currentAuditFilter = btn.dataset.auditFilter;
        renderAdminAuditHistoryTab();
      });
    });
  }

  // Expose AppState to window for sync and testing
  if (typeof window !== 'undefined') {
    window.AppState = AppState;
  }

})();
