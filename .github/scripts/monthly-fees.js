#!/usr/bin/env node
// GitHub Actions Script: Monthly Fee Billing & Reminders
// Runs via .github/workflows/monthly-fees.yml
// Dispatches emails via Resend with 100% verified sender pragyaninstitute.com

import { createClient } from '@supabase/supabase-js';
import https from 'https';

const supabaseUrl = process.env.SUPABASE_URL || 'https://ujcmmcaervgskpkcfekm.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const resendKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.RESEND_FROM_EMAIL || 'Pragyan Institute <noreply@pragyaninstitute.com>';

const supabase = createClient(supabaseUrl, supabaseKey);

function sendEmailViaResend({ from, to, subject, html, text }) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      from: from || fromEmail,
      to: Array.isArray(to) ? to : [to],
      subject,
      ...(html ? { html } : {}),
      ...(text ? { text } : {})
    });

    const req = https.request('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
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

// Staggered schedule:
// Billing: 1st=10th, 2nd=9th, 3rd=8th, 4th=Junior
// Reminders: 15th=10th, 16th=9th, 17th=8th, 18th=Junior
const scheduleMap = {
  // Days 1-6: 1st to 10th Rolling Monthly Billing (Staggered to preserve 100 emails/day quota)
  1:  { type: 'billing',  name: '10th_12th', label: 'Class 10th & Class 12th PCM/PCB (Day 1 Accrual & Billing)' },
  2:  { type: 'billing',  name: '9th_11th',  label: 'Class 9th & Class 11th PCM/PCB (Day 2 Accrual & Billing)' },
  3:  { type: 'billing',  name: '8th',       label: 'Class 8th ALPHA (Day 3 Accrual & Billing)' },
  4:  { type: 'billing',  name: '6th_7th',   label: 'Class 6th & 7th PIONEER (Day 4 Accrual & Billing)' },
  5:  { type: 'billing',  name: '1st_5th',   label: 'Class 1st to 5th Junior Foundation (Day 5 Accrual & Billing)' },
  6:  { type: 'billing',  name: 'special_english', label: 'Special English Batches by Aditi Singh (Day 6 Accrual & Billing)' },

  // Days 7-10: Gentle Mid-Window Reminders (Only for students with pending_fee > 0)
  7:  { type: 'reminder', name: '10th_12th', label: 'Class 10th & 12th (Unpaid Dues Reminder)' },
  8:  { type: 'reminder', name: '9th_11th',  label: 'Class 9th & 11th (Unpaid Dues Reminder)' },
  9:  { type: 'reminder', name: '6th_8th',   label: 'Class 6th to 8th (Unpaid Dues Reminder)' },
  10: { type: 'reminder', name: 'all',       label: 'All Batches (Final Grace Period Dues Reminder)' },

  // Days 15-20: Mid-Month Follow-Up
  15: { type: 'reminder', name: 'all',       label: 'All Batches Mid-Month Pending Ledger Sync' }
};

const today = new Date();
const currentDay = parseInt(process.env.FORCE_DAY || today.getDate(), 10);
const monthYear = today.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
const isoMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

console.log(`📅 Running monthly automation for day ${currentDay} — ${monthYear}`);

const target = scheduleMap[currentDay];
if (!target) {
  console.log(`✅ Day ${currentDay}: No batch scheduled for automated fee processing`);
  process.exit(0);
}

console.log(`🎯 Target: ${target.label} (Operation: ${target.type.toUpperCase()})`);

try {
  // Canonical batch matcher — keep in sync with api/cron-monthly-fees.js.
  // Replaces ilike-%N% chains where '%1%' also matched Class 10th/11th/12th
  // and Special English batches, pulling foreign batches onto the wrong day.
  function classNumMatches(str, n) {
    if (n === 1) return str.includes('1st') || /(^|[^0-9])1([^0-9]|$)/.test(str);
    if (n === 2) return str.includes('2nd') || /(^|[^0-9])2([^0-9]|$)/.test(str);
    if (n === 3) return str.includes('3rd') || /(^|[^0-9])3([^0-9]|$)/.test(str);
    return str.includes(`${n}th`) || new RegExp(`(^|[^0-9])${n}([^0-9]|$)`).test(str);
  }

  function batchKeyMatches(key, className) {
    const str = String(className || '').toLowerCase();
    const isEng = str.includes('special english');
    const has = n => classNumMatches(str, n);
    switch (key) {
      case '10th_12th': return !isEng && (has(10) || has(12));
      case '9th_11th': return !isEng && (has(9) || has(11));
      case '8th': return !isEng && has(8);
      case '6th_7th': return !isEng && (has(6) || has(7));
      case '1st_5th': return !isEng && (str.includes('junior') || [1, 2, 3, 4, 5].some(has));
      case 'special_english': return isEng;
      case '6th_8th': return has(6) || has(7) || has(8);
      case 'all': return true;
      default: return str.includes(String(key).toLowerCase());
    }
  }

  let query = supabase.from('students').select('*');
  const { data: allFetched, error } = await query;

  if (error) throw error;
  const students = (allFetched || []).filter(s =>
    target.name === 'all' ? true : batchKeyMatches(target.name, s.class_name)
  );
  if (!students?.length) {
    console.log(`ℹ️ No students found for ${target.label}`);
    process.exit(0);
  }

  const activeStudents = students.filter(s => !s.status || s.status.toLowerCase() === 'active');
  console.log(`👥 Found ${activeStudents.length} active students (out of ${students.length} total)`);
  const results = [];

  for (const student of activeStudents) {
    const strClass = String(student.class_name || '').toLowerCase();
    // Canonical 12-batch rate resolver: Special English tested BEFORE raw digit
    // matching ("Special English: Class 9th to 12th" contains both '9' and '12').
    const monthlyRate = Number(student.monthly_fee) || (
      strClass.includes('special english') ? (
        [12, 11, 10, 9].some(n => classNumMatches(strClass, n)) ? 1000 :
        [8, 7, 6].some(n => classNumMatches(strClass, n)) ? 700 : 500
      ) :
      classNumMatches(strClass, 12) || classNumMatches(strClass, 11) ? 1500 :
      classNumMatches(strClass, 10) || classNumMatches(strClass, 9) ? 1000 :
      classNumMatches(strClass, 8) ? 800 :
      classNumMatches(strClass, 6) || classNumMatches(strClass, 7) ? 700 :
      strClass.includes('junior') || [5, 4, 3, 2, 1].some(n => classNumMatches(strClass, n)) ? 500 : 1000
    );

    const prevPending = Number(student.pending_fee) || 0;

    if (target.type === 'billing') {
      const idempotencyKey = `fee_${student.student_id}_${isoMonth}`;

      const { data: existingLedger } = await supabase
        .from('fee_billing_ledger')
        .select('id, billing_month')
        .eq('student_id', student.student_id)
        .in('billing_month', [isoMonth, monthYear])
        .maybeSingle();

      if (existingLedger) {
        console.log(`⏭️ Skipping ${student.name} — already billed for ${existingLedger.billing_month}`);
        results.push({ student: student.name, status: 'skipped', reason: 'already_billed' });
        continue;
      }

      const { error: ledgerError } = await supabase.from('fee_billing_ledger').insert({
        billing_month: isoMonth,
        student_id: student.student_id,
        batch_label: target.label,
        amount: monthlyRate,
        idempotency_key: idempotencyKey
      });

      if (ledgerError) {
        console.warn(`⚠️ Ledger reservation failed for ${student.name}:`, ledgerError.message);
        results.push({ student: student.name, status: 'skipped', reason: 'ledger_conflict' });
        continue;
      }

      const updatedPending = prevPending + monthlyRate;
      const updatedTotal = (Number(student.total_fee) || 0) + monthlyRate;

      const { error: updateError } = await supabase
        .from('students')
        .update({ pending_fee: updatedPending, total_fee: updatedTotal })
        .eq('student_id', student.student_id);

      if (updateError) {
        console.error(`❌ Failed to update ${student.name}:`, updateError.message);
        results.push({ student: student.name, status: 'failed', error: updateError.message });
        continue;
      }

      if (student.email) {
        const emailRes = await sendEmailViaResend({
          to: student.email,
          subject: `🗓️ Monthly Fee Statement - ${student.name} (${student.class_name})`,
          html: generateFeeEmail(student, monthlyRate, prevPending, updatedPending, monthYear)
        });

        if (emailRes.success) {
          console.log(`📧 Email sent to ${student.name} (${student.email}) [ID: ${emailRes.id}]`);
          results.push({ student: student.name, status: 'sent', resendId: emailRes.id });
        } else {
          console.error(`📧 Email failed for ${student.name}:`, emailRes.error);
          results.push({ student: student.name, status: 'email_failed', error: emailRes.error });
        }
      } else {
        console.log(`💰 Fee updated for ${student.name} — no email on record`);
        results.push({ student: student.name, status: 'updated_no_email' });
      }
    } else if (target.type === 'reminder') {
      if (prevPending <= 0) {
        console.log(`⏭️ Skipping reminder for ${student.name} — no pending dues (₹${prevPending})`);
        results.push({ student: student.name, status: 'no_dues' });
        continue;
      }

      if (student.email) {
        const emailRes = await sendEmailViaResend({
          to: student.email,
          subject: `⚠️ Fee Payment Reminder Notice - ${student.name} (Pending: ₹${prevPending})`,
          html: generateReminderEmail(student, prevPending, monthYear)
        });

        if (emailRes.success) {
          console.log(`📧 Reminder sent to ${student.name} (${student.email}) [ID: ${emailRes.id}]`);
          results.push({ student: student.name, status: 'sent', resendId: emailRes.id });
        } else {
          console.error(`📧 Reminder failed for ${student.name}:`, emailRes.error);
          results.push({ student: student.name, status: 'email_failed', error: emailRes.error });
        }
      } else {
        results.push({ student: student.name, status: 'no_email' });
      }
    }
  }

  // Audit log
  await supabase.from('audit_logs').insert({
    log_id: `AUD-CRON-${Date.now()}`,
    timestamp: new Date().toISOString(),
    actor: 'GitHub Actions Cron',
    action_type: target.type === 'billing' ? 'MONTHLY_FEE_GENERATION' : 'FEE_DUE_REMINDER',
    student_name: target.label,
    student_roll: 'N/A',
    description: `${target.type === 'billing' ? 'Generated monthly fees' : 'Dispatched fee reminders'} for ${target.label} (${monthYear})`,
    details: { batch: target.label, month: monthYear, processed: results.length, results }
  });

  const sent = results.filter(r => r.status === 'sent').length;
  const skipped = results.filter(r => r.status === 'skipped' || r.status === 'no_dues').length;
  const failed = results.filter(r => r.status === 'failed' || r.status === 'email_failed').length;

  console.log(`\n✅ Done: ${sent} emails sent | ${skipped} skipped | ${failed} failed`);
  console.log('📊 Full results:', JSON.stringify(results, null, 2));

} catch (err) {
  console.error('❌ Fatal cron error:', err);
  process.exit(1);
}

function generateFeeEmail(student, monthlyRate, prevPending, updatedPending, monthYear) {
  const upiLink = `upi://pay?pa=chandankr1501998@ybl&pn=Chandan%20Kumar&am=${updatedPending}&cu=INR&tn=Fee%20${student.student_id}`;
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 2px solid #064E3B; border-radius: 12px; overflow: hidden; background: #ffffff;">
      <div style="background: linear-gradient(135deg, #064E3B 0%, #02241b 100%); color: #ffffff; padding: 24px; text-align: center;">
        <h1 style="margin: 0; font-size: 24px; color: #ffffff;">PRAGYAN INSTITUTE LALGANJ</h1>
        <p style="margin: 6px 0 0 0; opacity: 0.9; font-size: 15px; color: #E0E7FF;">Monthly Fee Statement — ${monthYear}</p>
      </div>
      <div style="padding: 24px; background: #FAF9F6; color: #1F2937;">
        <p style="font-size: 16px; margin-top: 0;">Dear <strong>${student.name}</strong> (Roll: #${student.roll_no}, ID: <code>${student.student_id}</code>),</p>
        <p>Your monthly tuition fee statement for <strong>${student.class_name}</strong>:</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background: #ffffff; border-radius: 8px; border: 1px solid #E5E7EB;">
          <tr style="background: #F3F4F6;"><th style="padding: 10px; text-align: left;">Description</th><th style="padding: 10px; text-align: right;">Amount (₹)</th></tr>
          <tr><td style="padding: 10px; border-bottom: 1px solid #E5E7EB;">Previous Carryover Due:</td><td style="padding: 10px; text-align: right; border-bottom: 1px solid #E5E7EB; font-weight: bold;">₹${prevPending.toLocaleString('en-IN')}</td></tr>
          <tr><td style="padding: 10px; border-bottom: 1px solid #E5E7EB;">Current Month Tuition (${monthYear}):</td><td style="padding: 10px; text-align: right; border-bottom: 1px solid #E5E7EB; font-weight: bold; color: #0284C7;">+ ₹${monthlyRate.toLocaleString('en-IN')}</td></tr>
          <tr style="background: #FEF2F2;"><td style="padding: 12px; font-weight: bold; color: #991B1B;">Total Updated Pending Due:</td><td style="padding: 12px; text-align: right; font-weight: bold; color: #DC2626; font-size: 16px;">₹${updatedPending.toLocaleString('en-IN')}</td></tr>
        </table>
        <div style="background: #ECFDF5; border: 1px solid #A7F3D0; padding: 14px; border-radius: 8px; font-size: 13px; color: #065F46; text-align: center;">
          <a href="${upiLink}" style="display: inline-block; background: #059669; color: #ffffff; font-weight: bold; text-decoration: none; padding: 10px 24px; border-radius: 6px; font-size: 14px; margin-bottom: 6px;">Pay ₹${updatedPending.toLocaleString('en-IN')} Now via UPI</a>
          <p style="margin: 4px 0 0 0; font-size: 12px;">UPI ID: <strong>chandankr1501998@ybl</strong> (Chandan Kumar)</p>
        </div>
      </div>
      <div style="background: #F3F4F6; padding: 15px; text-align: center; font-size: 12px; color: #6B7280; border-top: 1px solid #E5E7EB;">
        Pragyan Institute &bull; Near Main Chowk, Lalganj, Vaishali, Bihar &bull; Contact: +91 73698 91858
      </div>
    </div>
  `;
}

function generateReminderEmail(student, pendingDue, monthYear) {
  const upiLink = `upi://pay?pa=chandankr1501998@ybl&pn=Chandan%20Kumar&am=${pendingDue}&cu=INR&tn=Fee%20Reminder%20${student.student_id}`;
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 2px solid #D97706; border-radius: 12px; overflow: hidden; background: #ffffff;">
      <div style="background: linear-gradient(135deg, #B45309 0%, #78350F 100%); color: #ffffff; padding: 24px; text-align: center;">
        <h1 style="margin: 0; font-size: 24px; color: #ffffff;">PRAGYAN INSTITUTE LALGANJ</h1>
        <p style="margin: 6px 0 0 0; opacity: 0.9; font-size: 15px; color: #FEF3C7;">Urgent Fee Reminder Notice — ${monthYear}</p>
      </div>
      <div style="padding: 24px; background: #FFFDF5; color: #1F2937;">
        <p style="font-size: 16px; margin-top: 0;">Dear <strong>${student.name}</strong> (Roll: #${student.roll_no}, ID: <code>${student.student_id}</code>),</p>
        <p>This is a reminder that your tuition fee balance of <strong style="color: #DC2626; font-size: 18px;">₹${pendingDue.toLocaleString('en-IN')}</strong> for <strong>${student.class_name}</strong> is currently pending.</p>
        <div style="background: #F0FDF4; border: 1px solid #BBF7D0; padding: 14px; border-radius: 8px; font-size: 13px; color: #166534; text-align: center; margin-top: 16px;">
          <a href="${upiLink}" style="display: inline-block; background: #16A34A; color: #ffffff; font-weight: bold; text-decoration: none; padding: 10px 24px; border-radius: 6px; font-size: 14px; margin-bottom: 6px;">Pay ₹${pendingDue.toLocaleString('en-IN')} via UPI</a>
          <p style="margin: 4px 0 0 0; font-size: 12px;">UPI ID: <strong>chandankr1501998@ybl</strong> (Chandan Kumar)</p>
        </div>
      </div>
      <div style="background: #F3F4F6; padding: 15px; text-align: center; font-size: 12px; color: #6B7280; border-top: 1px solid #E5E7EB;">
        Pragyan Institute &bull; Near Main Chowk, Lalganj, Vaishali, Bihar &bull; Contact: +91 73698 91858
      </div>
    </div>
  `;
}
