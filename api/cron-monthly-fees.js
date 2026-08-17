import { getSupabase } from './_lib/auth.js';
import { sendEmailViaResend, extractResendErrorMessage } from './_lib/resend-sender.js';

const BATCH_SCHEDULE = {
  // Days 1-4: Monthly Tuition Fee Generation & Initial Statements
  1: { key: '10th', label: 'Class 10th (ACHIEVER)', fee: 1000, type: 'billing' },
  2: { key: '9th', label: 'Class 9th (NURTURE)', fee: 1000, type: 'billing' },
  3: { key: '8th', label: 'Class 8th (ALPHA)', fee: 800, type: 'billing' },
  4: { key: 'junio', label: 'Junior Batch (JUNIO)', fee: 700, type: 'billing' },

  // Days 15-19: Mid-Month Pending Due Reminders (Only for students with pending_fee > 0)
  15: { key: '10th', label: 'Class 10th (ACHIEVER)', type: 'reminder' },
  16: { key: '9th', label: 'Class 9th (NURTURE)', type: 'reminder' },
  17: { key: '8th', label: 'Class 8th (ALPHA)', type: 'reminder' },
  18: { key: 'junio', label: 'Junior Batch (JUNIO)', type: 'reminder' },
  19: { key: 'all', label: 'All Batches (Pending Dues Reminder)', type: 'reminder' }
};

function indiaDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(date)
    .reduce((all, part) => ({ ...all, [part.type]: part.value }), {});
  return { day: Number(parts.day), monthKey: `${parts.year}-${parts.month}` };
}

function monthLabel(monthKey) {
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', month: 'long', year: 'numeric' })
    .format(new Date(`${monthKey}-01T12:00:00Z`));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function feeEmail(student, ledger) {
  const amount = Number(ledger.amount || 0);
  const updatedDue = Number(ledger.updated_due ?? (Number(ledger.previous_due || 0) + amount));
  const previousDue = Number(ledger.previous_due !== undefined && ledger.previous_due !== null 
    ? ledger.previous_due 
    : Math.max(0, updatedDue - amount));

  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:620px;margin:0 auto;background:#ffffff;border:2px solid #064E3B;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(6,78,59,0.15)">
    <!-- Top Header Banner -->
    <div style="background:linear-gradient(135deg,#064E3B 0%,#022C22 100%);color:#ffffff;padding:28px 24px;text-align:center">
      <img src="https://pragyaninstitute.com/assets/images/logo.png" alt="Pragyan Institute Logo" width="70" height="70" style="width:70px;height:70px;border-radius:50%;object-fit:contain;background:#ffffff;padding:3px;display:inline-block;margin-bottom:12px;box-shadow:0 4px 14px rgba(0,0,0,0.3);border:2px solid #34D399">
      <h1 style="margin:0;font-size:24px;font-weight:900;letter-spacing:0.5px;color:#ffffff;line-height:1.2">PRAGYAN INSTITUTE</h1>
      <div style="font-size:12px;font-weight:700;color:#6EE7B7;text-transform:uppercase;letter-spacing:1.5px;margin-top:4px">Lalganj, Vaishali • Bihar</div>
      <div style="display:inline-block;margin-top:14px;background:rgba(52,211,153,0.2);border:1px solid #34D399;color:#A7F3D0;font-size:13px;font-weight:700;padding:5px 16px;border-radius:99px">
        📄 OFFICIAL MONTHLY TUITION INVOICE — ${escapeHtml(monthLabel(ledger.billing_month))}
      </div>
    </div>

    <!-- Body Container -->
    <div style="padding:26px;background:#FAF9F6">
      <!-- Student Greeting & Meta Card -->
      <div style="background:#ffffff;border:1.5px solid #E5E7EB;border-radius:12px;padding:18px;margin-bottom:20px;box-shadow:0 2px 6px rgba(0,0,0,0.03)">
        <table style="width:100%;border-collapse:collapse">
          <tr>
            <td style="vertical-align:top;padding-right:10px">
              <div style="font-size:12px;color:#6B7280;text-transform:uppercase;font-weight:600">Student Name</div>
              <div style="font-size:18px;font-weight:800;color:#111827;margin-top:2px">${escapeHtml(student.name)}</div>
            </td>
            <td style="text-align:right;vertical-align:top">
              <div style="font-size:12px;color:#6B7280;text-transform:uppercase;font-weight:600">Roll Number</div>
              <div style="font-size:18px;font-weight:800;color:#065F46;font-family:monospace;margin-top:2px">#${escapeHtml(student.roll_no)}</div>
            </td>
          </tr>
          <tr>
            <td style="padding-top:12px">
              <div style="font-size:12px;color:#6B7280;text-transform:uppercase;font-weight:600">Academic Batch</div>
              <div style="font-size:14px;font-weight:700;color:#374151;margin-top:2px">${escapeHtml(student.class_name)}</div>
            </td>
            <td style="text-align:right;padding-top:12px">
              <div style="font-size:12px;color:#6B7280;text-transform:uppercase;font-weight:600">Billing Cycle</div>
              <div style="font-size:14px;font-weight:700;color:#374151;margin-top:2px">${escapeHtml(monthLabel(ledger.billing_month))}</div>
            </td>
          </tr>
        </table>
      </div>

      <!-- ⭐ PROMINENT DUE AMOUNT HIGHLIGHT HERO CARD ⭐ -->
      <div style="background:linear-gradient(135deg,#ECFDF5 0%,#D1FAE5 100%);border:2.5px solid #10B981;border-radius:14px;padding:22px 20px;text-align:center;margin-bottom:22px;box-shadow:0 6px 18px rgba(16,185,129,0.15)">
        <div style="font-size:13px;font-weight:800;color:#065F46;text-transform:uppercase;letter-spacing:1px">
          📢 TOTAL NET AMOUNT PAYABLE / कुल देय राशि
        </div>
        <div style="font-size:44px;font-weight:900;color:#064E3B;line-height:1.1;margin:8px 0;text-shadow:0 1px 2px rgba(0,0,0,0.1)">
          ₹${updatedDue.toLocaleString('en-IN')}
        </div>
        <div style="display:inline-block;background:#064E3B;color:#A7F3D0;padding:4px 14px;border-radius:99px;font-size:12px;font-weight:700">
          ⏳ Please clear within 4 Days
        </div>
      </div>

      <!-- Detailed Itemized Breakdown Statement -->
      <div style="background:#ffffff;border:1.5px solid #E5E7EB;border-radius:14px;overflow:hidden;margin-bottom:22px;box-shadow:0 2px 8px rgba(0,0,0,0.03)">
        <div style="background:#F8FAFC;padding:12px 18px;font-size:13px;font-weight:800;color:#334155;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #E2E8F0">
          📊 DETAILED FEE BREAKDOWN / शुल्क विवरण
        </div>
        <table style="width:100%;border-collapse:collapse">
          <tr>
            <td style="padding:14px 18px;font-size:14px;color:#334155;border-bottom:1px solid #F1F5F9;line-height:1.4">
              <strong>1. Previous Unpaid Dues / पिछला बकाया शुल्क</strong><br>
              <span style="font-size:12px;color:#64748B">Fee balance carried forward before current cycle</span>
            </td>
            <td style="padding:14px 18px;font-size:15px;color:#475569;text-align:right;border-bottom:1px solid #F1F5F9;font-weight:700;font-family:monospace">
              ₹${previousDue.toLocaleString('en-IN')}
            </td>
          </tr>
          <tr>
            <td style="padding:14px 18px;font-size:14px;color:#334155;border-bottom:1px solid #F1F5F9;line-height:1.4">
              <strong>2. Current Month Tuition Fee / इस माह का शुल्क (${escapeHtml(monthLabel(ledger.billing_month))})</strong><br>
              <span style="font-size:12px;color:#059669">Academic batch fee for ${escapeHtml(student.class_name)}</span>
            </td>
            <td style="padding:14px 18px;font-size:15px;color:#059669;font-weight:800;text-align:right;border-bottom:1px solid #F1F5F9;font-family:monospace">
              + ₹${amount.toLocaleString('en-IN')}
            </td>
          </tr>
          <tr style="background:#ECFDF5">
            <td style="padding:16px 18px;font-size:15px;font-weight:900;color:#065F46;border-top:2px solid #10B981;line-height:1.4">
              TOTAL NET AMOUNT PAYABLE / कुल देय राशि<br>
              <span style="font-size:12px;font-weight:600;color:#047857">Combined earlier balance + this month's fee</span>
            </td>
            <td style="padding:16px 18px;font-size:20px;font-weight:900;color:#065F46;text-align:right;border-top:2px solid #10B981;font-family:monospace">
              ₹${updatedDue.toLocaleString('en-IN')}
            </td>
          </tr>
        </table>
      </div>

      <!-- Official PhonePe QR & 1-Tap Auto-UPI Gateway -->
      <div style="background:#ffffff;border:2px solid #10B981;border-radius:14px;padding:22px;text-align:center;margin-bottom:22px;box-shadow:0 4px 14px rgba(16,185,129,0.1)">
        <div style="font-weight:800;font-size:14px;color:#065F46;letter-spacing:0.5px;margin-bottom:14px">
          📱 SCAN TO PAY OR TAP 1-CLICK BUTTON
        </div>
        
        <div style="display:inline-block;background:#FFFFFF;padding:8px;border-radius:12px;border:2px solid #10B981;box-shadow:0 4px 12px rgba(0,0,0,0.08)">
          <img src="https://pragyaninstitute.com/assets/images/chandan_upi_qr.png" alt="PhonePe QR Code - Chandan Kumar Pragyan Institute" width="150" height="195" style="width:150px;height:195px;object-fit:contain;border-radius:8px;display:block">
        </div>

        <div style="margin:14px 0 6px">
          <div style="font-family:monospace;font-size:16px;font-weight:800;background:#ECFDF5;border:1px solid #A7F3D0;color:#065F46;padding:6px 16px;border-radius:8px;display:inline-block">
            chandankr1501998@ybl
          </div>
        </div>
        <div style="font-size:13px;color:#4B5563">
          Verified Payee: <strong>Chandan Kumar</strong> (Director, Pragyan Institute)
        </div>

        <div style="margin-top:18px">
          <a href="https://pragyaninstitute.com/pay.html?amount=${updatedDue}&roll=${encodeURIComponent(student.roll_no)}&name=${encodeURIComponent(student.name)}&batch=${encodeURIComponent(student.class_name)}&prev=${previousDue}&curr=${amount}" style="display:inline-block;background:linear-gradient(135deg,#059669 0%,#047857 100%);color:#ffffff;font-weight:800;padding:14px 28px;border-radius:10px;text-decoration:none;font-size:15px;box-shadow:0 4px 14px rgba(5,150,105,0.4);letter-spacing:0.2px">
            ⚡ Click Here to Pay ₹${updatedDue.toLocaleString('en-IN')} Online
          </a>
        </div>
      </div>

      <!-- Verification Instructions -->
      <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;padding:14px;font-size:13px;color:#1E40AF;line-height:1.5;margin-bottom:12px">
        💡 <strong>Receipt & Verification:</strong> After transferring fees, enter your 12-digit UTR on <a href="https://pragyaninstitute.com/pay.html?amount=${updatedDue}&roll=${encodeURIComponent(student.roll_no)}" style="color:#1D4ED8;font-weight:800;text-decoration:underline">pragyaninstitute.com/pay</a> for instant computerized receipt generation.
      </div>
    </div>

    <!-- Footer -->
    <div style="background:#F3F4F6;padding:18px 24px;text-align:center;font-size:12px;color:#6B7280;border-top:1px solid #E5E7EB;line-height:1.6">
      <strong>PRAGYAN INSTITUTE LALGANJ</strong> • Near Gandhi Chowk, Lalganj, Vaishali, Bihar<br>
      Mentors: <strong>Prof. Ravi Ranjan</strong> (Director) & <strong>Chandan Kumar</strong> (Director)<br>
      📞 Official Helpline: <strong>+91 91100 24683</strong> • 🌐 Website: <a href="https://pragyaninstitute.com" style="color:#065F46;font-weight:bold;text-decoration:none">pragyaninstitute.com</a>
    </div>
  </div>`;
}

function reminderEmail(student, monthName) {
  const pendingDue = Number(student.pending_fee || 0);
  const monthlyRate = Number(student.monthly_fee || 1000);
  let prevDue = 0;
  let currDue = 0;

  if (pendingDue <= 0) {
    prevDue = 0;
    currDue = 0;
  } else if (pendingDue > monthlyRate) {
    prevDue = pendingDue - monthlyRate;
    currDue = monthlyRate;
  } else {
    prevDue = 0;
    currDue = pendingDue;
  }

  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:620px;margin:0 auto;background:#ffffff;border:2px solid #D97706;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(217,119,6,0.15)">
    <!-- Top Header Banner -->
    <div style="background:linear-gradient(135deg,#78350F 0%,#451A03 100%);color:#ffffff;padding:28px 24px;text-align:center">
      <img src="https://pragyaninstitute.com/assets/images/logo.png" alt="Pragyan Institute Logo" width="70" height="70" style="width:70px;height:70px;border-radius:50%;object-fit:contain;background:#ffffff;padding:3px;display:inline-block;margin-bottom:12px;box-shadow:0 4px 14px rgba(0,0,0,0.3);border:2px solid #FBBF24">
      <h1 style="margin:0;font-size:24px;font-weight:900;letter-spacing:0.5px;color:#ffffff;line-height:1.2">PRAGYAN INSTITUTE</h1>
      <div style="font-size:12px;font-weight:700;color:#FDE68A;text-transform:uppercase;letter-spacing:1.5px;margin-top:4px">Lalganj, Vaishali • Bihar</div>
      <div style="display:inline-block;margin-top:14px;background:rgba(245,158,11,0.25);border:1px solid #F59E0B;color:#FEF3C7;font-size:13px;font-weight:700;padding:5px 16px;border-radius:99px">
        ⚠️ MID-MONTH PENDING FEE REMINDER — ${escapeHtml(monthName)}
      </div>
    </div>

    <!-- Body Container -->
    <div style="padding:26px;background:#FAF9F6">
      <!-- Student Greeting & Meta Card -->
      <div style="background:#ffffff;border:1.5px solid #E5E7EB;border-radius:12px;padding:18px;margin-bottom:20px;box-shadow:0 2px 6px rgba(0,0,0,0.03)">
        <table style="width:100%;border-collapse:collapse">
          <tr>
            <td style="vertical-align:top;padding-right:10px">
              <div style="font-size:12px;color:#6B7280;text-transform:uppercase;font-weight:600">Student Name</div>
              <div style="font-size:18px;font-weight:800;color:#111827;margin-top:2px">${escapeHtml(student.name)}</div>
            </td>
            <td style="text-align:right;vertical-align:top">
              <div style="font-size:12px;color:#6B7280;text-transform:uppercase;font-weight:600">Roll Number</div>
              <div style="font-size:18px;font-weight:800;color:#B45309;font-family:monospace;margin-top:2px">#${escapeHtml(student.roll_no)}</div>
            </td>
          </tr>
          <tr>
            <td style="padding-top:12px">
              <div style="font-size:12px;color:#6B7280;text-transform:uppercase;font-weight:600">Class / Batch</div>
              <div style="font-size:14px;font-weight:700;color:#374151;margin-top:2px">${escapeHtml(student.class_name)}</div>
            </td>
            <td style="text-align:right;padding-top:12px">
              <div style="font-size:12px;color:#6B7280;text-transform:uppercase;font-weight:600">Notice Type</div>
              <div style="font-size:14px;font-weight:700;color:#DC2626;margin-top:2px">Due Clearance</div>
            </td>
          </tr>
        </table>
      </div>

      <!-- ⭐ PROMINENT DUE AMOUNT HIGHLIGHT HERO CARD ⭐ -->
      <div style="background:linear-gradient(135deg,#FEF3C7 0%,#FDE68A 100%);border:2.5px solid #D97706;border-radius:14px;padding:22px 20px;text-align:center;margin-bottom:22px;box-shadow:0 6px 18px rgba(217,119,6,0.15)">
        <div style="font-size:13px;font-weight:800;color:#92400E;text-transform:uppercase;letter-spacing:1px">
          🚨 TOTAL PENDING BALANCE / कुल बकाया राशि
        </div>
        <div style="font-size:44px;font-weight:900;color:#B45309;line-height:1.1;margin:8px 0;text-shadow:0 1px 2px rgba(0,0,0,0.1)">
          ₹${pendingDue.toLocaleString('en-IN')}
        </div>
        <div style="display:inline-block;background:#92400E;color:#FEF3C7;padding:4px 14px;border-radius:99px;font-size:12px;font-weight:700">
          ⚠️ Clearance Requested
        </div>
      </div>

      <!-- Itemized Breakdown Statement for Reminder -->
      <div style="background:#ffffff;border:1.5px solid #E5E7EB;border-radius:14px;overflow:hidden;margin-bottom:22px;box-shadow:0 2px 8px rgba(0,0,0,0.03)">
        <div style="background:#F8FAFC;padding:12px 18px;font-size:13px;font-weight:800;color:#334155;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #E2E8F0">
          📊 DETAILED FEE BREAKDOWN / शुल्क विवरण
        </div>
        <table style="width:100%;border-collapse:collapse">
          <tr>
            <td style="padding:14px 18px;font-size:14px;color:#334155;border-bottom:1px solid #F1F5F9;line-height:1.4">
              <strong>1. Previous Unpaid Dues / पिछला बकाया शुल्क</strong><br>
              <span style="font-size:12px;color:#64748B">Fee balance carried forward till last month</span>
            </td>
            <td style="padding:14px 18px;font-size:15px;color:#475569;text-align:right;border-bottom:1px solid #F1F5F9;font-weight:700;font-family:monospace">
              ₹${prevDue.toLocaleString('en-IN')}
            </td>
          </tr>
          <tr>
            <td style="padding:14px 18px;font-size:14px;color:#334155;border-bottom:1px solid #F1F5F9;line-height:1.4">
              <strong>2. Current Month Tuition Fee / इस माह का शुल्क (${escapeHtml(monthName)})</strong><br>
              <span style="font-size:12px;color:#059669">Academic batch fee for ${escapeHtml(student.class_name)}</span>
            </td>
            <td style="padding:14px 18px;font-size:15px;color:#059669;font-weight:800;text-align:right;border-bottom:1px solid #F1F5F9;font-family:monospace">
              + ₹${currDue.toLocaleString('en-IN')}
            </td>
          </tr>
          <tr style="background:#FEF3C7">
            <td style="padding:16px 18px;font-size:15px;font-weight:900;color:#92400E;border-top:2px solid #D97706;line-height:1.4">
              TOTAL NET AMOUNT PAYABLE / कुल देय राशि<br>
              <span style="font-size:12px;font-weight:600;color:#78350F">Exact total outstanding fee</span>
            </td>
            <td style="padding:16px 18px;font-size:20px;font-weight:900;color:#92400E;text-align:right;border-top:2px solid #D97706;font-family:monospace">
              ₹${pendingDue.toLocaleString('en-IN')}
            </td>
          </tr>
        </table>
      </div>

      <p style="font-size:14px;color:#4B5563;line-height:1.6;margin-bottom:20px">
        Dear Parent / Student, this is a mid-month reminder from the accounts desk regarding the outstanding balance of <strong>₹${pendingDue.toLocaleString('en-IN')}</strong> for <strong>${escapeHtml(student.name)}</strong>. Kindly clear the pending dues online or at the institute counter.
      </p>

      <!-- Official PhonePe QR & 1-Tap Auto-UPI Gateway -->
      <div style="background:#ffffff;border:2px solid #D97706;border-radius:14px;padding:22px;text-align:center;margin-bottom:22px;box-shadow:0 4px 14px rgba(217,119,6,0.1)">
        <div style="font-weight:800;font-size:14px;color:#92400E;letter-spacing:0.5px;margin-bottom:14px">
          📱 SCAN TO PAY OR TAP 1-CLICK BUTTON
        </div>
        
        <div style="display:inline-block;background:#FFFFFF;padding:8px;border-radius:12px;border:2px solid #D97706;box-shadow:0 4px 12px rgba(0,0,0,0.08)">
          <img src="https://pragyaninstitute.com/assets/images/chandan_upi_qr.png" alt="PhonePe QR Code - Chandan Kumar Pragyan Institute" width="150" height="195" style="width:150px;height:195px;object-fit:contain;border-radius:8px;display:block">
        </div>

        <div style="margin:14px 0 6px">
          <div style="font-family:monospace;font-size:16px;font-weight:800;background:#FFFBEB;border:1px solid #FCD34D;color:#92400E;padding:6px 16px;border-radius:8px;display:inline-block">
            chandankr1501998@ybl
          </div>
        </div>
        <div style="font-size:13px;color:#4B5563">
          Verified Payee: <strong>Chandan Kumar</strong> (Director, Pragyan Institute)
        </div>

        <div style="margin-top:18px">
          <a href="https://pragyaninstitute.com/pay.html?amount=${pendingDue}&roll=${encodeURIComponent(student.roll_no)}&name=${encodeURIComponent(student.name)}&batch=${encodeURIComponent(student.class_name)}&prev=${prevDue}&curr=${currDue}" style="display:inline-block;background:linear-gradient(135deg,#D97706 0%,#B45309 100%);color:#ffffff;font-weight:800;padding:14px 28px;border-radius:10px;text-decoration:none;font-size:15px;box-shadow:0 4px 14px rgba(217,119,6,0.4);letter-spacing:0.2px">
            ⚡ Click Here to Pay ₹${pendingDue.toLocaleString('en-IN')} Online
          </a>
        </div>
      </div>

      <!-- Verification Instructions -->
      <div style="background:#FFFBEB;border:1px solid #FCD34D;border-radius:10px;padding:14px;font-size:13px;color:#92400E;line-height:1.5;margin-bottom:12px">
        💡 <strong>Receipt & Verification:</strong> After transferring fees, enter your 12-digit UTR on <a href="https://pragyaninstitute.com/pay.html?amount=${pendingDue}&roll=${encodeURIComponent(student.roll_no)}&prev=${prevDue}&curr=${currDue}" style="color:#B45309;font-weight:800;text-decoration:underline">pragyaninstitute.com/pay</a> for instant computerized receipt confirmation.
      </div>
    </div>

    <!-- Footer -->
    <div style="background:#F3F4F6;padding:18px 24px;text-align:center;font-size:12px;color:#6B7280;border-top:1px solid #E5E7EB;line-height:1.6">
      <strong>PRAGYAN INSTITUTE LALGANJ</strong> • Near Gandhi Chowk, Lalganj, Vaishali, Bihar<br>
      Mentors: <strong>Prof. Ravi Ranjan</strong> (Director) & <strong>Chandan Kumar</strong> (Director)<br>
      📞 Official Helpline: <strong>+91 91100 24683</strong> • 🌐 Website: <a href="https://pragyaninstitute.com" style="color:#065F46;font-weight:bold;text-decoration:none">pragyaninstitute.com</a>
    </div>
  </div>`;
}

function extractErrorMessage(err) {
  if (!err) return 'Email delivery failed';
  if (typeof err === 'string') return err;
  if (err.message && typeof err.message === 'string') return err.message;
  if (err.error?.message && typeof err.error.message === 'string') return err.error.message;
  if (err.error && typeof err.error === 'string') return err.error;
  try {
    const str = JSON.stringify(err);
    return str !== '{}' ? str : 'Email delivery failed';
  } catch (e) {
    return 'Email delivery failed';
  }
}

async function sendLedgerEmail(supabase, from, ledger, student) {
  const attempt = Number(ledger.email_attempts || 0) + 1;
  const attemptedAt = new Date().toISOString();
  if (!student?.email) {
    await supabase.from('fee_billing_ledger').update({ email_attempts: attempt, last_email_attempt_at: attemptedAt, email_error: 'No registered email address' }).eq('id', ledger.id);
    return { studentId: ledger.student_id, status: 'billed_no_email' };
  }

  try {
    const result = await sendEmailViaResend({
      from,
      to: student.email,
      subject: `Monthly Fee Statement — ${student.name} (${monthLabel(ledger.billing_month)})`,
      html: feeEmail(student, ledger)
    });

    if (!result.success) {
      const finalError = extractResendErrorMessage(result.error).slice(0, 500);
      await supabase.from('fee_billing_ledger').update({ email_attempts: attempt, last_email_attempt_at: attemptedAt, email_error: finalError }).eq('id', ledger.id);
      return { studentId: ledger.student_id, status: 'email_failed', error: finalError };
    }

    await supabase.from('fee_billing_ledger').update({ email_attempts: attempt, last_email_attempt_at: attemptedAt, email_sent_at: attemptedAt, email_error: null }).eq('id', ledger.id);
    return { studentId: ledger.student_id, status: 'emailed', emailId: result.data?.id || null };
  } catch (error) {
    const finalError = extractResendErrorMessage(error).slice(0, 500);
    await supabase.from('fee_billing_ledger').update({ email_attempts: attempt, last_email_attempt_at: attemptedAt, email_error: finalError }).eq('id', ledger.id);
    return { studentId: ledger.student_id, status: 'email_failed', error: finalError };
  }
}

async function retryUnsentEmails(supabase, from) {
  const { data: pending, error } = await supabase
    .from('fee_billing_ledger')
    .select('id,student_id,billing_month,amount,previous_due,updated_due,email_attempts')
    .is('email_sent_at', null)
    .order('created_at', { ascending: true })
    .limit(100);
  if (error) throw error;
  if (!pending?.length) return [];

  const studentIds = [...new Set(pending.map(row => row.student_id))];
  const { data: students, error: studentsError } = await supabase.from('students').select('student_id,name,roll_no,class_name,email').in('student_id', studentIds);
  if (studentsError) throw studentsError;
  const byStudentId = new Map((students || []).map(student => [student.student_id, student]));
  const results = [];
  for (const ledger of pending) {
    results.push(await sendLedgerEmail(supabase, from, ledger, byStudentId.get(ledger.student_id)));
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return results;
}

export default async function handler(req, res) {
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  const expectedBearer = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || (authHeader !== expectedBearer && authHeader !== process.env.CRON_SECRET)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabase = getSupabase();
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || 'Pragyan Institute <noreply@pragyaninstitute.com>';
  if (!supabase) return res.status(503).json({ error: 'Billing service is not configured' });
  const emailConfigured = Boolean(resendKey && from);

  const { day, monthKey } = indiaDateParts();
  const target = BATCH_SCHEDULE[day];
  const results = [];
  const currentMonthName = monthLabel(monthKey);

  try {
    if (target) {
      let query = supabase
        .from('students')
        .select('student_id,name,roll_no,class_name,monthly_fee,status,pending_fee,email');
      if (target.key && target.key !== 'all') {
        query = query.ilike('class_name', `%${target.key}%`);
      }
      const { data: students, error } = await query;
      if (error) throw error;
      const activeStudents = (students || []).filter(s => !s.status || s.status === 'Active' || s.status === 'active');

      if (target.type === 'billing') {
        // --- DAYS 1 to 4: MONTHLY FEE ADDITION & STATEMENT GENERATION ---
        for (const student of activeStudents) {
          const amount = Number(student.monthly_fee) > 0 ? Number(student.monthly_fee) : target.fee;
          let handled = false;

          try {
            const { data: response, error: billingError } = await supabase.rpc('apply_monthly_fee', {
              p_student_id: student.student_id,
              p_billing_month: monthKey,
              p_amount: amount,
              p_batch_label: target.label
            });
            if (!billingError && response !== null && response !== undefined) {
              handled = true;
              let isApplied = true;
              let resObj = response;

              if (typeof resObj === 'string') {
                try {
                  resObj = JSON.parse(resObj);
                } catch {
                  resObj = { applied: true };
                }
              }

              if (Array.isArray(resObj)) {
                resObj = resObj[0] || {};
              }

              if (resObj && typeof resObj === 'object') {
                if ('applied' in resObj) {
                  isApplied = Boolean(resObj.applied);
                } else if ('is_applied' in resObj) {
                  isApplied = Boolean(resObj.is_applied);
                } else if ('success' in resObj) {
                  isApplied = Boolean(resObj.success);
                }
              } else if (typeof resObj === 'boolean') {
                isApplied = resObj;
              }

              results.push({ studentId: student.student_id, status: isApplied ? 'billed' : 'already_billed' });
            }
          } catch (rpcErr) {
            // Fall back to direct ledger upsert
          }

          if (!handled) {
            try {
              const { data: existingLedger } = await supabase
                .from('fee_billing_ledger')
                .select('id, billing_month')
                .eq('student_id', student.student_id)
                .in('billing_month', [monthKey, currentMonthName])
                .maybeSingle();

              if (existingLedger) {
                results.push({ studentId: student.student_id, status: 'already_billed' });
              } else {
                const { data: freshStudent } = await supabase
                  .from('students')
                  .select('id,student_id,name,roll_no,class_name,pending_fee,total_fee')
                  .eq('student_id', student.student_id)
                  .single();

                const studentUuid = freshStudent?.id || student.id;
                const previousDue = Number(freshStudent?.pending_fee || 0);
                const updatedDue = previousDue + amount;
                const receiptNo = `REC-BILL-${student.student_id}-${monthKey}`;

                await supabase.from('students').update({
                  pending_fee: updatedDue,
                  total_fee: Number(freshStudent?.total_fee || 0) + amount,
                  updated_at: new Date().toISOString()
                }).eq('id', studentUuid);

                await supabase.from('fee_billing_ledger').upsert({
                  student_id: student.student_id,
                  billing_month: monthKey,
                  amount: amount,
                  previous_due: previousDue,
                  updated_due: updatedDue,
                  batch_label: target.label,
                  idempotency_key: `fee_${student.student_id}_${monthKey}`
                }, { onConflict: 'idempotency_key' });

                if (studentUuid) {
                  try {
                    await supabase.from('fee_receipts').upsert({
                      receipt_no: receiptNo,
                      student_id: studentUuid,
                      amount: amount,
                      payment_mode: 'System Monthly Billing',
                      payment_date: new Date().toISOString().split('T')[0],
                      status: 'Billed',
                      collected_by: 'System Monthly Engine',
                      note: `Monthly tuition fee for ${currentMonthName}`
                    }, { onConflict: 'receipt_no', ignoreDuplicates: true });
                  } catch (receiptErr) {
                    console.warn('[cron] fee_receipts upsert note:', receiptErr.message);
                  }
                }

                results.push({ studentId: student.student_id, status: 'billed', receiptNo });
              }
            } catch (dbErr) {
              results.push({ studentId: student.student_id, status: 'billing_failed', error: dbErr.message });
            }
          }
        }
      } else if (target.type === 'reminder') {
        // --- DAYS 15 to 18: MID-MONTH PENDING DUE REMINDERS ---
        const pendingStudents = activeStudents.filter(s => Number(s.pending_fee) > 0 && s.email && s.email.includes('@'));
        for (const student of pendingStudents) {
          try {
            const result = await sendEmailViaResend({
              from,
              to: student.email,
              subject: `⚠️ Fee Reminder (${currentMonthName}) — ${student.name} (Roll #${student.roll_no})`,
              html: reminderEmail(student, currentMonthName)
            });

            if (result.success) {
              results.push({ studentId: student.student_id, status: 'reminder_sent', emailId: result.data?.id });
            } else {
              results.push({ studentId: student.student_id, status: 'reminder_failed', error: extractResendErrorMessage(result.error) });
            }
            await new Promise(resolve => setTimeout(resolve, 100)); // Throttle
          } catch (remErr) {
            results.push({ studentId: student.student_id, status: 'reminder_failed', error: extractResendErrorMessage(remErr) });
          }
        }
      }
    }

    const emailResults = await retryUnsentEmails(supabase, from);
    results.push(...emailResults);

    await supabase.from('audit_logs').insert({
      log_id: `AUD-CRON-${monthKey}-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: 'System Cron',
      action_type: target?.type === 'reminder' ? 'MONTHLY_FEE_REMINDER' : 'MONTHLY_FEE_GENERATION',
      student_name: target?.label || 'Cron Queue',
      student_roll: 'N/A',
      description: target ? `${target.type === 'reminder' ? 'Mid-Month Reminder' : 'Monthly Billing'} executed for ${target.label} (${monthKey})` : 'Cron execution',
      details: { results }
    });

    return res.status(200).json({ success: true, batch: target?.label || null, type: target?.type || null, month: monthKey, results });
  } catch (error) {
    console.error('Monthly billing error:', error.message);
    return res.status(500).json({ success: false, error: 'Monthly billing execution failed' });
  }
}
