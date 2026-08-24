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
}
