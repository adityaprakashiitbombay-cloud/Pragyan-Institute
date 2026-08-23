#!/usr/bin/env node
// GitHub Actions Script: Real-Time Instant Fee Billing & Email Dispatcher
// Triggered on-demand via workflow_dispatch from Admin Portal or GitHub UI
// Dispatches emails via Resend with 100% verified sender pragyaninstitute.com

import { createClient } from '@supabase/supabase-js';
import https from 'https';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ujcmmcaervgskpkcfekm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqY21tY2FlcnZnc2twa2NmZWttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0NDEzMTksImV4cCI6MjEwMjAxNzMxOX0.pTp51JWa-qWbAz-l5NGLKvrS66TED4lruhLInQ6hvmc';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'Pragyan Institute <noreply@pragyaninstitute.com>';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY);

function sendEmailViaResend({ from, to, subject, html, text }) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      from: from || RESEND_FROM_EMAIL,
      to: Array.isArray(to) ? to : [to],
      subject,
      ...(html ? { html } : {}),
      ...(text ? { text } : {})
    });

    const req = https.request('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 15000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ success: true, id: parsed.id });
          } else {
            resolve({ success: false, error: parsed.message || data, statusCode: res.statusCode });
          }
        } catch (_) {
          resolve({ success: res.statusCode >= 200 && res.statusCode < 300, data, statusCode: res.statusCode });
        }
      });
    });

    req.on('error', (err) => resolve({ success: false, error: err.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, error: 'Resend request timeout (15s)' });
    });

    req.write(payload);
    req.end();
  });
}

function generateInvoiceEmailHtml(student, monthlyRate, prevPending, updatedPending, monthYear) {
  const upiLink = `upi://pay?pa=chandankr1501998@ybl&pn=Chandan%20Kumar&am=${updatedPending}&cu=INR&tn=Fee%20${student.student_id}`;
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 2px solid #064E3B; border-radius: 12px; overflow: hidden; background: #ffffff;">
      <div style="background: linear-gradient(135deg, #064E3B 0%, #02241b 100%); color: #ffffff; padding: 24px; text-align: center;">
        <h1 style="margin: 0; font-size: 24px; letter-spacing: 0.5px; color: #ffffff;">PRAGYAN INSTITUTE LALGANJ</h1>
        <p style="margin: 6px 0 0 0; opacity: 0.9; font-size: 15px; color: #E0E7FF;">Official Fee Invoice & Monthly Statement</p>
      </div>
      <div style="padding: 24px; background: #FAF9F6; color: #1F2937;">
        <p style="font-size: 16px; margin-top: 0;">Dear <strong>${student.name}</strong> (Roll: #${student.roll_no}, ID: <code>${student.student_id}</code>),</p>
        <p>Here is your official tuition fee statement for <strong>${student.class_name}</strong> for the billing cycle <strong>${monthYear}</strong>.</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background: #ffffff; border-radius: 8px; border: 1px solid #E5E7EB;">
          <thead>
            <tr style="background: #F3F4F6;">
              <th style="padding: 12px; text-align: left; font-size: 13px; color: #4B5563;">Description</th>
              <th style="padding: 12px; text-align: right; font-size: 13px; color: #4B5563;">Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding: 10px 12px; border-bottom: 1px solid #E5E7EB; font-size: 14px;">Previous Outstanding Dues:</td>
              <td style="padding: 10px 12px; text-align: right; border-bottom: 1px solid #E5E7EB; font-size: 14px; font-weight: bold; color: #4B5563;">₹${prevPending.toLocaleString('en-IN')}</td>
            </tr>
            <tr>
              <td style="padding: 10px 12px; border-bottom: 1px solid #E5E7EB; font-size: 14px;">Current Month Tuition Fee (${monthYear}):</td>
              <td style="padding: 10px 12px; text-align: right; border-bottom: 1px solid #E5E7EB; font-size: 14px; font-weight: bold; color: #0284C7;">+ ₹${monthlyRate.toLocaleString('en-IN')}</td>
            </tr>
            <tr style="background: #FEF2F2;">
              <td style="padding: 14px 12px; font-size: 15px; font-weight: bold; color: #991B1B;">Total Amount Due:</td>
              <td style="padding: 14px 12px; text-align: right; font-size: 17px; font-weight: bold; color: #DC2626;">₹${updatedPending.toLocaleString('en-IN')}</td>
            </tr>
          </tbody>
        </table>

        <div style="background: #ECFDF5; border: 1px solid #A7F3D0; border-radius: 8px; padding: 16px; margin-top: 20px;">
          <h3 style="margin: 0 0 8px 0; color: #065F46; font-size: 15px;">💳 Instant Online Fee Payment</h3>
          <p style="margin: 0 0 12px 0; font-size: 13px; color: #047857;">Pay directly via PhonePe, Google Pay, Paytm, or UPI:</p>
          <div style="text-align: center; margin: 12px 0;">
            <a href="${upiLink}" style="display: inline-block; background: #059669; color: #ffffff; font-weight: bold; text-decoration: none; padding: 10px 24px; border-radius: 6px; font-size: 14px;">Pay ₹${updatedPending.toLocaleString('en-IN')} Now via UPI</a>
          </div>
          <p style="margin: 8px 0 0 0; font-size: 12px; color: #065F46; text-align: center;">UPI ID: <strong>chandankr1501998@ybl</strong> (Chandan Kumar)</p>
        </div>

        <div style="margin-top: 20px; font-size: 13px; color: #6B7280; line-height: 1.5;">
          <p style="margin: 0;">📌 You can also pay cash or scan the QR code at the institute reception counter.</p>
          <p style="margin: 4px 0 0 0;">📌 After making a payment, submit your transaction ID on <a href="https://pragyaninstitute.com" style="color: #059669;">pragyaninstitute.com</a> to receive an instant verified digital receipt.</p>
        </div>
      </div>

      <div style="background: #F3F4F6; padding: 16px; text-align: center; font-size: 12px; color: #6B7280; border-top: 1px solid #E5E7EB;">
        <p style="margin: 0 0 4px 0; font-weight: bold; color: #374151;">Pragyan Institute Lalganj</p>
        <p style="margin: 0;">Near Main Chowk, Lalganj, Vaishali, Bihar &bull; Contact: +91 73698 91858</p>
      </div>
    </div>
  `;
}

function generateReminderEmailHtml(student, pendingDue, monthYear) {
  const upiLink = `upi://pay?pa=chandankr1501998@ybl&pn=Chandan%20Kumar&am=${pendingDue}&cu=INR&tn=Fee%20Reminder%20${student.student_id}`;
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 2px solid #D97706; border-radius: 12px; overflow: hidden; background: #ffffff;">
      <div style="background: linear-gradient(135deg, #B45309 0%, #78350F 100%); color: #ffffff; padding: 24px; text-align: center;">
        <h1 style="margin: 0; font-size: 24px; letter-spacing: 0.5px; color: #ffffff;">PRAGYAN INSTITUTE LALGANJ</h1>
        <p style="margin: 6px 0 0 0; opacity: 0.9; font-size: 15px; color: #FEF3C7;">Urgent: Fee Payment Reminder Notice</p>
      </div>
      <div style="padding: 24px; background: #FFFDF5; color: #1F2937;">
        <p style="font-size: 16px; margin-top: 0;">Dear <strong>${student.name}</strong> (Roll: #${student.roll_no}, ID: <code>${student.student_id}</code>),</p>
        <p>This is a gentle reminder regarding your outstanding tuition fee for <strong>${student.class_name}</strong>.</p>
        
        <div style="background: #FEF2F2; border: 2px solid #FECACA; border-radius: 8px; padding: 18px; margin: 20px 0; text-align: center;">
          <div style="font-size: 14px; color: #991B1B; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">Total Outstanding Balance Due</div>
          <div style="font-size: 32px; font-weight: bold; color: #DC2626; margin: 6px 0;">₹${pendingDue.toLocaleString('en-IN')}</div>
          <div style="font-size: 13px; color: #7F1D1D;">Billing Cycle: ${monthYear}</div>
        </div>

        <div style="background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 8px; padding: 16px; margin-top: 20px;">
          <h3 style="margin: 0 0 8px 0; color: #166534; font-size: 15px;">⚡ Clear Your Dues Online Instantly</h3>
          <div style="text-align: center; margin: 14px 0;">
            <a href="${upiLink}" style="display: inline-block; background: #16A34A; color: #ffffff; font-weight: bold; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-size: 15px;">Pay ₹${pendingDue.toLocaleString('en-IN')} Now via UPI</a>
          </div>
          <p style="margin: 8px 0 0 0; font-size: 12px; color: #166534; text-align: center;">UPI ID: <strong>chandankr1501998@ybl</strong> (Chandan Kumar)</p>
        </div>

        <p style="margin-top: 20px; font-size: 13px; color: #6B7280; line-height: 1.5;">
          Please clear your pending fee balance at the earliest to ensure uninterrupted classes and examination hall ticket access. If you have already paid, kindly reply with your payment receipt or update your transaction in the student portal.
        </p>
      </div>

      <div style="background: #F3F4F6; padding: 16px; text-align: center; font-size: 12px; color: #6B7280; border-top: 1px solid #E5E7EB;">
        <p style="margin: 0 0 4px 0; font-weight: bold; color: #374151;">Pragyan Institute Lalganj</p>
        <p style="margin: 0;">Near Main Chowk, Lalganj, Vaishali, Bihar &bull; Helpline: +91 73698 91858</p>
      </div>
    </div>
  `;
}

async function run() {
  const batch = process.env.BATCH || 'all';
  const studentId = process.env.STUDENT_ID || 'all';
  const action = process.env.ACTION || 'invoice'; // 'invoice' | 'reminder' | 'test'
  const customTo = process.env.TO_EMAIL || '';

  const today = new Date();
  const monthYear = today.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const isoMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  console.log(`🚀 Starting Billing & Email Trigger: Action=${action}, Batch=${batch}, StudentID=${studentId}`);

  if (action === 'test' && customTo) {
    console.log(`📧 Sending direct test email to ${customTo}...`);
    const testResult = await sendEmailViaResend({
      to: customTo,
      subject: `🧪 Test Email from Pragyan Institute (${new Date().toLocaleTimeString('en-IN')})`,
      html: `<h3>Test Email Delivery</h3><p>Real-time Resend dispatch is active and functioning properly from Pragyan Institute.</p>`
    });
    console.log('Result:', testResult);
    return;
  }

  // Fetch target students with flexible multi-field matching
  let query = supabase.from('students').select('*');
  
  if (studentId && studentId !== 'all') {
    const cleanId = String(studentId).trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId);
    if (isUuid) {
      query = query.eq('id', cleanId);
    } else {
      query = query.or(`student_id.eq.${cleanId},roll_no.eq.${cleanId},name.ilike.%${cleanId}%`);
    }
  } else if (batch && batch !== 'all') {
    query = query.ilike('class_name', `%${batch}%`);
  }

  const { data: students, error } = await query;
  if (error) {
    console.error('❌ Supabase fetch error:', error);
    process.exit(1);
  }

  const activeStudents = (students || []).filter(s => !s.status || s.status.toLowerCase() === 'active');
  console.log(`👥 Found ${activeStudents.length} active students to process`);

  const results = [];

  // Canonical 12-batch rate resolver — keep in sync with api/cron-monthly-fees.js.
  // Special English tested BEFORE raw digit matching ("...Class 9th to 12th"
  // contains both '9' and '12'); the old else-chain priced Class 11th/12th at
  // ₹700 and Class 1st-5th at ₹700.
  function classNumMatches(str, n) {
    if (n === 1) return str.includes('1st') || /(^|[^0-9])1([^0-9]|$)/.test(str);
    if (n === 2) return str.includes('2nd') || /(^|[^0-9])2([^0-9]|$)/.test(str);
    if (n === 3) return str.includes('3rd') || /(^|[^0-9])3([^0-9]|$)/.test(str);
    return str.includes(`${n}th`) || new RegExp(`(^|[^0-9])${n}([^0-9]|$)`).test(str);
  }

  function resolveMonthlyFee(className) {
    const s = String(className || '').toLowerCase();
    if (s.includes('special english')) {
      if ([12, 11, 10, 9].some(n => classNumMatches(s, n))) return 1000;
      if ([8, 7, 6].some(n => classNumMatches(s, n))) return 700;
      return 500;
    }
    if (classNumMatches(s, 12) || classNumMatches(s, 11)) return 1500;
    if (classNumMatches(s, 10) || classNumMatches(s, 9)) return 1000;
    if (classNumMatches(s, 8)) return 800;
    if (classNumMatches(s, 6) || classNumMatches(s, 7)) return 700;
    if (s.includes('junior') || [5, 4, 3, 2, 1].some(n => classNumMatches(s, n))) return 500;
    return 1000;
  }

  for (const student of activeStudents) {
    const monthlyRate = Number(student.monthly_fee) > 0
      ? Number(student.monthly_fee)
      : resolveMonthlyFee(student.class_name);

    const prevPending = Number(student.pending_fee) || 0;

    if (action === 'invoice') {
      const idempotencyKey = `fee_${student.student_id}_${isoMonth}`;
      const { data: existingLedger } = await supabase
        .from('fee_billing_ledger')
        .select('id, billing_month')
        .eq('student_id', student.student_id)
        .in('billing_month', [isoMonth, monthYear])
        .maybeSingle();

      let updatedPending = prevPending;
      let isNewBilling = false;

      if (!existingLedger) {
        // Insert ledger
        await supabase.from('fee_billing_ledger').insert({
          billing_month: isoMonth,
          student_id: student.student_id,
          batch_label: student.class_name || 'Standard Batch',
          amount: monthlyRate,
          idempotency_key: idempotencyKey
        });

        updatedPending = prevPending + monthlyRate;
        const updatedTotal = (Number(student.total_fee) || 0) + monthlyRate;

        await supabase.from('students').update({
          pending_fee: updatedPending,
          total_fee: updatedTotal
        }).eq('student_id', student.student_id);

        isNewBilling = true;
        console.log(`💰 Updated balance for ${student.name} (+₹${monthlyRate} -> Total Pending: ₹${updatedPending})`);
      } else {
        console.log(`ℹ️ ${student.name} was already billed for ${existingLedger.billing_month} (Sending current statement)`);
      }

      // Dispatch Email
      if (student.email) {
        const emailRes = await sendEmailViaResend({
          to: student.email,
          subject: `🗓️ Monthly Fee Statement - ${student.name} (${student.class_name || 'Pragyan Institute'})`,
          html: generateInvoiceEmailHtml(student, monthlyRate, prevPending, updatedPending, monthYear)
        });

        console.log(`📧 Invoice email -> ${student.name} (${student.email}):`, emailRes.success ? `SUCCESS (ID: ${emailRes.id})` : `FAILED (${emailRes.error})`);
        results.push({ student: student.name, email: student.email, status: emailRes.success ? 'sent' : 'email_failed', resendId: emailRes.id, error: emailRes.error });
      } else {
        results.push({ student: student.name, status: 'no_email' });
      }
    } else if (action === 'reminder') {
      if (prevPending <= 0) {
        console.log(`⏭️ Skipping reminder for ${student.name} — no pending dues (₹${prevPending})`);
        results.push({ student: student.name, status: 'no_dues' });
        continue;
      }

      if (student.email) {
        const emailRes = await sendEmailViaResend({
          to: student.email,
          subject: `⚠️ Fee Payment Reminder Notice - ${student.name} (Pending: ₹${prevPending})`,
          html: generateReminderEmailHtml(student, prevPending, monthYear)
        });

        console.log(`📧 Reminder email -> ${student.name} (${student.email}):`, emailRes.success ? `SUCCESS (ID: ${emailRes.id})` : `FAILED (${emailRes.error})`);
        results.push({ student: student.name, email: student.email, status: emailRes.success ? 'sent' : 'email_failed', resendId: emailRes.id, error: emailRes.error });
      } else {
        results.push({ student: student.name, status: 'no_email' });
      }
    }
  }

  console.log('🏁 Execution Completed Summary:', JSON.stringify(results, null, 2));
}

run().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
