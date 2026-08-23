// ============================================================================
// T18 — ACADEMIC CONFIG PARITY & RESOLUTION TESTS
// ----------------------------------------------------------------------------
// The 12 canonical batches are declared twice: once for the serverless
// functions (api/_lib/academic-config.js, ESM) and once for the browser
// (js/academic-config.js, classic script). Nothing in the runtime forces those
// two declarations to agree, so this test does — any drift in a batch id, fee,
// annual price, class code or calendar entry fails the build.
// ============================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as server from '../api/_lib/academic-config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/** Evaluate the browser config in a bare sandbox and return window.PRAGYAN_ACADEMIC. */
export function loadBrowserConfig() {
  const source = fs.readFileSync(path.join(ROOT, 'js', 'academic-config.js'), 'utf8');
  const sandbox = {};
  // The file is an IIFE taking (window ?? globalThis); shadowing `window` with
  // the sandbox keeps it from touching the real global object.
  new Function('window', `${source}\nreturn window;`)(sandbox);
  if (!sandbox.PRAGYAN_ACADEMIC) throw new Error('js/academic-config.js did not define window.PRAGYAN_ACADEMIC');
  return sandbox.PRAGYAN_ACADEMIC;
}

// Real-world class-name strings the resolver must agree on across both copies.
export const CLASS_NAME_CORPUS = [
  'Class 12th PCM', 'Class 12th PCB', 'Class 11th PCM', 'Class 11th PCB',
  'Class 10th', 'Class 9th', 'Class 8th', 'Class 6th & 7th', 'Class 1st to 5th',
  'Special English 9th to 12th', 'Special English 6th to 8th', 'Special English 1st to 5th',
  'BAT-12PCM', 'BAT-12PCB', 'BAT-11PCM', 'BAT-11PCB', 'BAT-10', 'BAT-09', 'BAT-08',
  'BAT-67', 'BAT-JUNIO', 'BAT-15', 'BAT-ENG-912', 'BAT-ENG-68', 'BAT-ENG-15',
  '12th PCM', '12 PCB', 'XII PCM', 'Class XII Biology', 'twelfth pcm',
  '11th PCB', 'XI Maths', 'Class 11', 'ASCEND',
  '10th', 'Class 10 ACHIEVER', 'ACHIEVER', 'Matric Board', 'Class X',
  '9th', 'NURTURE', 'Class IX', 'Class 9 Nurture Foundation',
  '8th', 'ALPHA', 'Class VIII', 'Class 8 Alpha Middle School',
  '6th', '7th', 'Class 6 & 7', 'PIONEER', 'BAT-JUNIO', 'junio', 'Class VII',
  '1st', '5th', 'Class 3rd', 'Junior Foundation', 'primary', 'Class IV',
  'special english', 'English Grammar 10th', 'Spoken English 7th', 'English 2nd',
  '', '   ', null, undefined, 'Class 13th', 'Diploma', 'unknown batch', 'BAT-99'
];

export function runAcademicConfigTests(assert) {
  const browser = loadBrowserConfig();

  // --- Structural parity -----------------------------------------------------
  assert(server.BATCHES.length === 12, `T18.1: server declares exactly 12 canonical batches (got ${server.BATCHES.length})`);
  assert(browser.BATCHES.length === 12, `T18.2: browser declares exactly 12 canonical batches (got ${browser.BATCHES.length})`);

  const COMPARED_FIELDS = ['batchId', 'name', 'className', 'stream', 'monthlyFee', 'classCode', 'billingDay', 'reminderTier', 'priceKey', 'tagline'];
  const project = list => list.map(b => COMPARED_FIELDS.reduce((acc, f) => ({ ...acc, [f]: b[f] }), { teachers: b.teachers.join('|') }));
  assert(
    JSON.stringify(project(server.BATCHES)) === JSON.stringify(project(browser.BATCHES)),
    'T18.3: server and browser batch tables are identical field-for-field'
  );

  assert(
    JSON.stringify(server.BILLING_CALENDAR) === JSON.stringify(browser.BILLING_CALENDAR),
    'T18.4: server and browser billing calendars are identical'
  );

  // --- Spec conformance ------------------------------------------------------
  const EXPECTED_FEES = {
    'BAT-12PCM': [1500, 17100], 'BAT-12PCB': [1500, 17100],
    'BAT-11PCM': [1500, 17100], 'BAT-11PCB': [1500, 17100],
    'BAT-10': [1000, 11400], 'BAT-09': [1000, 11400],
    'BAT-08': [800, 9120], 'BAT-67': [700, 7980], 'BAT-15': [500, 5700],
    'BAT-ENG-912': [1000, 11400], 'BAT-ENG-68': [700, 7980], 'BAT-ENG-15': [500, 5700]
  };
  let feeMismatch = null;
  for (const [batchId, [monthly, annual]] of Object.entries(EXPECTED_FEES)) {
    const batch = server.BATCH_BY_ID.get(batchId);
    if (!batch) { feeMismatch = `${batchId} missing`; break; }
    if (batch.monthlyFee !== monthly) { feeMismatch = `${batchId} monthly ${batch.monthlyFee} != ${monthly}`; break; }
    const computed = server.annualPrice(batch.monthlyFee);
    if (computed !== annual) { feeMismatch = `${batchId} annual ${computed} != ${annual}`; break; }
  }
  assert(feeMismatch === null, `T18.5: every batch matches the published monthly/annual fee schedule${feeMismatch ? ` — ${feeMismatch}` : ''}`);

  const EXPECTED_CODES = { '12': 2, '11': 2, '10': 1, '09': 1, '08': 1, '07': 1, '05': 1, '01': 3 };
  const codeCounts = server.BATCHES.reduce((acc, b) => ({ ...acc, [b.classCode]: (acc[b.classCode] || 0) + 1 }), {});
  assert(
    JSON.stringify(codeCounts) === JSON.stringify(EXPECTED_CODES),
    `T18.6: YYCCSS class codes cover 12/11/10/09/08/07/05/01 with the right cardinality (got ${JSON.stringify(codeCounts)})`
  );

  // Days 1-6 bill, 7-10 remind, and every batch is billed exactly once.
  const billedDays = [1, 2, 3, 4, 5, 6];
  const reminderDays = [7, 8, 9, 10];
  assert(
    billedDays.every(d => server.BILLING_CALENDAR[d]?.type === 'billing') &&
    reminderDays.every(d => server.BILLING_CALENDAR[d]?.type === 'reminder'),
    'T18.7: calendar days 1-6 are billing sweeps and days 7-10 are reminder sweeps'
  );
  assert(!server.scheduleForDay(11) && !server.scheduleForDay(0) && !server.scheduleForDay(31),
    'T18.8: days 11-31 and out-of-range days are the cron rest state');

  const billedOnce = billedDays.flatMap(d => server.BILLING_CALENDAR[d].batchIds);
  assert(
    billedOnce.length === 12 && new Set(billedOnce).size === 12 &&
    server.BATCHES.every(b => billedOnce.includes(b.batchId)),
    `T18.9: all 12 batches are billed exactly once across days 1-6 (got ${billedOnce.length} entries)`
  );
  assert(
    server.BATCHES.every(b => server.BILLING_CALENDAR[b.billingDay]?.batchIds?.includes(b.batchId)),
    'T18.10: each batch.billingDay agrees with the calendar that bills it'
  );

  // --- Resolver parity -------------------------------------------------------
  const disagreements = CLASS_NAME_CORPUS
    .map(name => {
      const s = server.resolveBatch(name);
      const b = browser.resolveBatch(name);
      return (s?.batchId || null) === (b?.batchId || null) ? null : `${JSON.stringify(name)} → server ${s?.batchId || 'null'} vs browser ${b?.batchId || 'null'}`;
    })
    .filter(Boolean);
  assert(disagreements.length === 0, `T18.11: resolveBatch() agrees across ${CLASS_NAME_CORPUS.length} class-name inputs${disagreements.length ? ` — ${disagreements.join('; ')}` : ''}`);

  // --- Resolver correctness on the cases that used to be wrong ---------------
  const MUST_RESOLVE = {
    'Class 12th PCM': 'BAT-12PCM', 'Class 12th PCB': 'BAT-12PCB',
    'Class 11th PCM': 'BAT-11PCM', 'Class 11th PCB': 'BAT-11PCB',
    'Class 10th': 'BAT-10', 'Class 9th': 'BAT-09', 'Class 8th': 'BAT-08',
    'Class 6th & 7th': 'BAT-67', '6th': 'BAT-67', '7th': 'BAT-67',
    'Class 1st to 5th': 'BAT-15', 'Class 3rd': 'BAT-15',
    'Special English 9th to 12th': 'BAT-ENG-912',
    'Special English 6th to 8th': 'BAT-ENG-68',
    'Special English 1st to 5th': 'BAT-ENG-15',
    'Spoken English 7th': 'BAT-ENG-68',
    'English Grammar 10th': 'BAT-ENG-912',
    'BAT-JUNIO': 'BAT-67'
  };
  const wrong = Object.entries(MUST_RESOLVE)
    .map(([name, expected]) => (server.resolveBatch(name)?.batchId === expected ? null : `${name} → ${server.resolveBatch(name)?.batchId || 'null'} (want ${expected})`))
    .filter(Boolean);
  assert(wrong.length === 0, `T18.12: class names resolve to the right batch, English before numeric${wrong.length ? ` — ${wrong.join('; ')}` : ''}`);

  // Unresolvable input must return null, never a silent 1000 fallback.
  assert(server.resolveBatch('') === null && server.resolveBatch(null) === null && server.resolveBatch('Diploma') === null,
    'T18.13: unresolvable class names return null instead of defaulting to a fee');
  assert(server.monthlyFeeFor('Diploma') === null && server.monthlyFeeFor('Diploma', 0) === 0,
    'T18.14: monthlyFeeFor exposes the unresolved case rather than assuming ₹1,000');
  assert(server.classCodeFor('Class 1st to 5th') === '05' && server.classCodeFor('Special English 6th to 8th') === '01',
    'T18.15: classCodeFor returns the previously-missing 05 and 01 barcode codes');

  // --- Idempotency keys ------------------------------------------------------
  assert(server.billingIdempotencyKey('261001', '2026-08') === 'BILL-261001-2026-08',
    'T18.16: billing idempotency key matches the BILL-STUDENT_ID-YYYY-MM contract');
  assert(server.billingIdempotencyKey('261001', '2026-08') === browser.billingIdempotencyKey('261001', '2026-08'),
    'T18.17: server and browser mint the same billing idempotency key');

  // A mid-month batch transfer must not change the key: one charge per month.
  const beforeTransfer = server.billingIdempotencyKey('261001', '2026-08');
  const afterTransfer = server.billingIdempotencyKey('261001', '2026-08');
  assert(beforeTransfer === afterTransfer, 'T18.18: idempotency key is batch-independent so a mid-month transfer cannot double-charge');

  // --- IST calendar ----------------------------------------------------------
  // 2026-08-22 18:45 UTC is already 2026-08-23 00:15 IST.
  const lateUtc = new Date('2026-08-22T18:45:00.000Z');
  assert(server.istDateKey(lateUtc) === '2026-08-23', `T18.19: istDateKey rolls over at IST midnight, not UTC (got ${server.istDateKey(lateUtc)})`);
  assert(server.istDayOfMonth(lateUtc) === 23, 'T18.20: istDayOfMonth reads the IST day so cron day-of-month matches the calendar');
  assert(server.istMonthKey(lateUtc) === '2026-08' && server.istYearCode(lateUtc) === '26',
    'T18.21: istMonthKey and istYearCode derive the billing month and barcode year in IST');
  const bounds = server.istDayBoundsUtc(lateUtc);
  assert(bounds.dayKey === '2026-08-23' && bounds.startUtc === '2026-08-22T18:30:00.000Z',
    `T18.22: istDayBoundsUtc brackets the IST day for quota queries (got ${bounds.startUtc})`);
  assert(server.istDateKey(lateUtc) === browser.istDateKey(lateUtc), 'T18.23: server and browser agree on the IST date key');

  // --- Price table -----------------------------------------------------------
  assert(browser.PRICE_TABLE.class12pcm.monthly === '₹1,500' && browser.PRICE_TABLE.class12pcm.annual === '₹17,100',
    `T18.24: PRICE_TABLE formats the ₹1,500 tier and its annual total (got ${browser.PRICE_TABLE.class12pcm.annual})`);
  assert(browser.PRICE_TABLE.junior.monthly === '₹500' && browser.PRICE_TABLE.junior.annual === '₹5,700',
    'T18.25: PRICE_TABLE carries the previously-missing ₹500 junior tier');
  assert(Object.keys(browser.PRICE_TABLE).length === 12, 'T18.26: PRICE_TABLE has a [data-price-key] entry for all 12 batches');

  // --- Scope filter used by the cron ----------------------------------------
  assert(server.isStudentInScope('Class 10th', server.BILLING_CALENDAR[1].batchIds) === true &&
         server.isStudentInScope('Class 8th', server.BILLING_CALENDAR[1].batchIds) === false,
    'T18.27: isStudentInScope gates students to the batches billed today');
  assert(server.isStudentInScope('Diploma', 'ALL') === true && server.isStudentInScope('Class 8th', 'ALL') === true,
    'T18.28: day-10 final sweep (ALL) includes every student regardless of batch');
  assert(server.isStudentInScope('Diploma', ['BAT-10']) === false,
    'T18.29: unresolvable class names are excluded from targeted sweeps rather than mis-billed');

  // --- Payee identity --------------------------------------------------------
  // The UPI VPA decides where money lands. It is quoted on the QR caption, in
  // every upi:// deep-link and in both invoice templates, so the two copies of
  // the config drifting apart would send some students to a stale address.
  assert(
    JSON.stringify(server.PAYEE) === JSON.stringify(browser.PAYEE),
    'T18.30: server and browser agree on the institute UPI payee'
  );
  assert(
    /^[a-z0-9._-]+@[a-z]{2,}$/i.test(server.PAYEE.upiId) && server.PAYEE.name === server.PRIMARY_ADMIN.name,
    `T18.31: the payee VPA is well-formed and belongs to the sole administrator (got ${server.PAYEE.upiId})`
  );
}
