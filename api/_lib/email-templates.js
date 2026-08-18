/**
 * Centralized Email Templates for Pragyan Institute Monthly Billing & Reminders
 */

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

export function formatMonthLabel(monthKey) {
  if (!monthKey) return '';
  const [yearStr, monthStr] = String(monthKey).split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  if (isNaN(year) || isNaN(month)) return monthKey;
  const date = new Date(year, month - 1, 1, 12, 0, 0);
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', month: 'long', year: 'numeric' }).format(date);
}

export function generateFeeInvoiceEmailHtml(student, ledger) {
  const amount = Number(ledger.amount || 0);
  const updatedDue = Number(ledger.updated_due ?? (Number(ledger.previous_due || 0) + amount));
  const previousDue = Number(ledger.previous_due !== undefined && ledger.previous_due !== null 
    ? ledger.previous_due 
    : Math.max(0, updatedDue - amount));
  const billingMonthName = formatMonthLabel(ledger.billing_month);

  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:620px;margin:0 auto;background:#ffffff;border:2px solid #064E3B;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(6,78,59,0.15)">
    <!-- Top Header Banner -->
    <div style="background:linear-gradient(135deg,#064E3B 0%,#022C22 100%);color:#ffffff;padding:28px 24px;text-align:center">
      <img src="https://pragyaninstitute.com/assets/images/logo.png" alt="Pragyan Institute Logo" width="70" height="70" style="width:70px;height:70px;border-radius:50%;object-fit:contain;background:#ffffff;padding:3px;display:inline-block;margin-bottom:12px;box-shadow:0 4px 14px rgba(0,0,0,0.3);border:2px solid #34D399">
      <h1 style="margin:0;font-size:24px;font-weight:900;letter-spacing:0.5px;color:#ffffff;line-height:1.2">PRAGYAN INSTITUTE</h1>
      <div style="font-size:12px;font-weight:700;color:#6EE7B7;text-transform:uppercase;letter-spacing:1.5px;margin-top:4px">Lalganj, Vaishali • Bihar</div>
      <div style="display:inline-block;margin-top:14px;background:rgba(52,211,153,0.2);border:1px solid #34D399;color:#A7F3D0;font-size:13px;font-weight:700;padding:5px 16px;border-radius:99px">
        📄 OFFICIAL MONTHLY TUITION INVOICE — ${escapeHtml(billingMonthName)}
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
              <div style="font-size:14px;font-weight:700;color:#374151;margin-top:2px">${escapeHtml(billingMonthName)}</div>
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
              <strong>2. Current Month Tuition Fee / इस माह का शुल्क (${escapeHtml(billingMonthName)})</strong><br>
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

export function generateReminderEmailHtml(student, monthName) {
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

// Backward compatibility alias exports
export const feeEmail = generateFeeInvoiceEmailHtml;
export const reminderEmail = generateReminderEmailHtml;
