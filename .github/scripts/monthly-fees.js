#!/usr/bin/env node
// GitHub Actions: nightly billing trigger for the 1st-10th of the month.
//
// This file used to be a second, independent billing engine running alongside
// the Vercel cron on /api/cron-monthly-fees. The ledger's unique constraint
// stopped it double-charging, but whichever engine reached a student first set
// the AMOUNT — and this script's fee ladder ended in `: 700`, so a Class 12th
// student billed from here was charged 700 instead of 1500. It also billed
// non-atomically (ledger insert, then a separate students update, with no
// FOR UPDATE lock) and sent email with no quota accounting at all.
//
// It is now a trigger. /api/cron-monthly-fees owns the calendar, the canonical
// fee table, the atomic apply_monthly_fee call and the 100/day quota gate.

import { callApi } from './_call-api.js';

const forceDayRaw = (process.env.FORCE_DAY || '').trim();
const forceDay = Number(forceDayRaw);
const body = {};

<<<<<<< HEAD
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
=======
if (forceDayRaw) {
  if (!Number.isInteger(forceDay) || forceDay < 1 || forceDay > 31) {
    console.error(`FORCE_DAY must be a day of the month between 1 and 31 (got "${forceDayRaw}")`);
    process.exit(1);
  }
  body.forceDay = forceDay;
  console.log(`Replaying billing calendar day ${forceDay}.`);
>>>>>>> claude/admiring-kepler-50a04f
}

const result = await callApi('/api/cron-monthly-fees', body);

if (result?.restState) {
  console.log(`Day ${result.day} is a rest day — no batch is billed. Retry sweep ran.`);
} else {
  console.log(`Day ${result?.day}: ${result?.type} run for ${result?.batch}.`);
}
console.log('Summary:', JSON.stringify(result?.summary || {}));
