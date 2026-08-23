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

if (forceDayRaw) {
  if (!Number.isInteger(forceDay) || forceDay < 1 || forceDay > 31) {
    console.error(`FORCE_DAY must be a day of the month between 1 and 31 (got "${forceDayRaw}")`);
    process.exit(1);
  }
  body.forceDay = forceDay;
  console.log(`Replaying billing calendar day ${forceDay}.`);
}

const result = await callApi('/api/cron-monthly-fees', body);

if (result?.restState) {
  console.log(`Day ${result.day} is a rest day — no batch is billed. Retry sweep ran.`);
} else {
  console.log(`Day ${result?.day}: ${result?.type} run for ${result?.batch}.`);
}
console.log('Summary:', JSON.stringify(result?.summary || {}));
