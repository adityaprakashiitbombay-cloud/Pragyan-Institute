#!/usr/bin/env node
// GitHub Actions: on-demand billing / reminder trigger (workflow_dispatch).
//
// This file used to be a third independent billing engine. Beyond duplicating
// the money path it carried two hard defects:
//
//   1. A Supabase anon key was hardcoded on line 10 and used as a FALLBACK when
//      SUPABASE_SERVICE_ROLE_KEY was absent — so a missing secret turned into a
//      silent, half-working run against a committed credential instead of a
//      clean failure.
//   2. The same `: 700` fee-ladder default that under-billed Class 11th and 12th,
//      plus `ilike('class_name', '%${batch}%')` scoping, which matched any class
//      name merely containing the batch string.
//
// It is now a trigger. /api/admin-trigger-billing resolves the batch against the
// canonical 12-batch table (and refuses an unresolvable one rather than widening
// it to everybody), bills through apply_monthly_fee, and sends through the
// 100/day quota gate.

import { callApi } from './_call-api.js';

const batch = (process.env.BATCH || 'all').trim() || 'all';
const studentId = (process.env.STUDENT_ID || 'all').trim() || 'all';
const action = (process.env.ACTION || 'invoice').trim();
const toEmail = (process.env.TO_EMAIL || '').trim();

if (!['invoice', 'reminder', 'test'].includes(action)) {
  console.error(`ACTION must be one of invoice | reminder | test (got "${action}")`);
  process.exit(1);
}

if (action === 'test') {
  if (!toEmail) {
    console.error('ACTION=test requires TO_EMAIL.');
    process.exit(1);
  }
<<<<<<< HEAD

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
=======
  console.log(`Sending a deliverability probe to ${toEmail}.`);
  await callApi('/api/admin-trigger-billing', { action: 'test', toEmail });
  console.log('Test email accepted by Resend.');
} else {
  console.log(`${action} run — batch: ${batch}, student: ${studentId}`);
  const result = await callApi('/api/admin-trigger-billing', {
    action,
    targetClass: batch,
    studentId
  });
  console.log(`Matched ${result?.totalStudents ?? 0} student(s); billed ${result?.billedCount ?? 0}; emailed ${result?.emailedCount ?? 0}.`);
  console.log('Summary:', JSON.stringify(result?.summary || {}));
>>>>>>> claude/admiring-kepler-50a04f
}
