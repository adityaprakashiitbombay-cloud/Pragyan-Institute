// ============================================================================
// PRAGYAN INSTITUTE — CANONICAL ACADEMIC CONFIGURATION (SERVER)
// ----------------------------------------------------------------------------
// Single source of truth for the 12 academic batches, the fee tiers, the
// YYCCSS student-ID class codes, and the 10-day rolling billing calendar.
//
// The browser mirror of this file is js/academic-config.js. They are kept in
// lockstep by tests/academic-config.test.js — if you edit one, edit both.
// ============================================================================

// A one-time 5% scholarship applies to a full annual lump-sum advance.
export const ANNUAL_DISCOUNT_PCT = 0.05;

/** Annual advance price for a monthly rate: base x 12 x 0.95. */
export function annualPrice(monthlyFee) {
  return Math.round(Number(monthlyFee) * 12 * (1 - ANNUAL_DISCOUNT_PCT));
}

// ----------------------------------------------------------------------------
// The 12 canonical batches.
//   classCode  — the CC pair of the YYCCSS student barcode
//   billingDay — day of month (1-6) this batch is charged
//   reminderTier — which reminder sweep (7-10) chases this batch
// ----------------------------------------------------------------------------
export const BATCHES = [
  {
    batchId: 'BAT-12PCM', name: 'Class 12th PCM', className: 'Class 12th PCM',
    stream: 'PCM', monthlyFee: 1500, classCode: '12', billingDay: 1, reminderTier: 7,
    teachers: ['PROF. RAVI RANJAN', 'CHANDAN KUMAR'], priceKey: 'class12pcm',
    tagline: 'ASCEND — I.Sc. Physics, Chemistry & Higher Mathematics'
  },
  {
    batchId: 'BAT-12PCB', name: 'Class 12th PCB', className: 'Class 12th PCB',
    stream: 'PCB', monthlyFee: 1500, classCode: '12', billingDay: 1, reminderTier: 7,
    teachers: ['CHANDAN KUMAR', 'PROF. RAVI RANJAN'], priceKey: 'class12pcb',
    tagline: 'ASCEND — I.Sc. Physics, Chemistry & Biology'
  },
  {
    batchId: 'BAT-11PCM', name: 'Class 11th PCM', className: 'Class 11th PCM',
    stream: 'PCM', monthlyFee: 1500, classCode: '11', billingDay: 2, reminderTier: 8,
    teachers: ['PROF. RAVI RANJAN', 'CHANDAN KUMAR'], priceKey: 'class11pcm',
    tagline: 'ASCEND — I.Sc. Foundation with Higher Mathematics'
  },
  {
    batchId: 'BAT-11PCB', name: 'Class 11th PCB', className: 'Class 11th PCB',
    stream: 'PCB', monthlyFee: 1500, classCode: '11', billingDay: 2, reminderTier: 8,
    teachers: ['CHANDAN KUMAR', 'PROF. RAVI RANJAN'], priceKey: 'class11pcb',
    tagline: 'ASCEND — I.Sc. Foundation with Biology'
  },
  {
    batchId: 'BAT-10', name: 'Class 10th (ACHIEVER)', className: 'Class 10th',
    stream: 'BOARD', monthlyFee: 1000, classCode: '10', billingDay: 1, reminderTier: 7,
    teachers: ['CHANDAN KUMAR', 'PROF. RAVI RANJAN'], priceKey: 'class10',
    tagline: 'ACHIEVER — Matric Board intensive'
  },
  {
    batchId: 'BAT-09', name: 'Class 9th (NURTURE)', className: 'Class 9th',
    stream: 'FOUNDATION', monthlyFee: 1000, classCode: '09', billingDay: 2, reminderTier: 8,
    teachers: ['CHANDAN KUMAR', 'PROF. RAVI RANJAN'], priceKey: 'class9',
    tagline: 'NURTURE — Board foundation'
  },
  {
    batchId: 'BAT-08', name: 'Class 8th (ALPHA)', className: 'Class 8th',
    stream: 'MIDDLE', monthlyFee: 800, classCode: '08', billingDay: 3, reminderTier: 9,
    teachers: ['CHANDAN KUMAR', 'PROF. RAVI RANJAN'], priceKey: 'class8',
    tagline: 'ALPHA — Middle school mastery'
  },
  {
    batchId: 'BAT-67', name: 'Class 6th & 7th (PIONEER)', className: 'Class 6th & 7th',
    stream: 'PIONEER', monthlyFee: 700, classCode: '07', billingDay: 4, reminderTier: 9,
    teachers: ['CHANDAN KUMAR', 'ADITI SINGH'], priceKey: 'class67',
    tagline: 'PIONEER — Early foundation'
  },
  {
    batchId: 'BAT-15', name: 'Class 1st to 5th (Junior Foundation)', className: 'Class 1st to 5th',
    stream: 'JUNIOR', monthlyFee: 500, classCode: '05', billingDay: 5, reminderTier: 10,
    teachers: ['ADITI SINGH', 'CHANDAN KUMAR'], priceKey: 'junior',
    tagline: 'Junior Foundation — primary all-subject care'
  },
  {
    batchId: 'BAT-ENG-912', name: 'Special English 9th to 12th', className: 'Special English 9th to 12th',
    stream: 'ENGLISH', monthlyFee: 1000, classCode: '01', billingDay: 6, reminderTier: 10,
    teachers: ['ADITI SINGH'], priceKey: 'eng912',
    tagline: 'English & Grammar mastery with Aditi Singh'
  },
  {
    batchId: 'BAT-ENG-68', name: 'Special English 6th to 8th', className: 'Special English 6th to 8th',
    stream: 'ENGLISH', monthlyFee: 700, classCode: '01', billingDay: 6, reminderTier: 10,
    teachers: ['ADITI SINGH'], priceKey: 'eng68',
    tagline: 'English & Grammar foundation with Aditi Singh'
  },
  {
    batchId: 'BAT-ENG-15', name: 'Special English 1st to 5th', className: 'Special English 1st to 5th',
    stream: 'ENGLISH', monthlyFee: 500, classCode: '01', billingDay: 6, reminderTier: 10,
    teachers: ['ADITI SINGH'], priceKey: 'eng15',
    tagline: 'Early English & phonics with Aditi Singh'
  }
];

export const BATCH_BY_ID = new Map(BATCHES.map(b => [b.batchId, b]));
export const VALID_CLASS_CODES = new Set(BATCHES.map(b => b.classCode));

// ----------------------------------------------------------------------------
// 10-day rolling billing calendar. Days 11-31 are the cron rest state.
// ----------------------------------------------------------------------------
export const BILLING_CALENDAR = {
  1:  { type: 'billing',  batchIds: ['BAT-10', 'BAT-12PCM', 'BAT-12PCB'], label: 'Class 10th & Class 12th (PCM/PCB)' },
  2:  { type: 'billing',  batchIds: ['BAT-09', 'BAT-11PCM', 'BAT-11PCB'], label: 'Class 9th & Class 11th (PCM/PCB)' },
  3:  { type: 'billing',  batchIds: ['BAT-08'],                            label: 'Class 8th (ALPHA)' },
  4:  { type: 'billing',  batchIds: ['BAT-67'],                            label: 'Class 6th & 7th (PIONEER)' },
  5:  { type: 'billing',  batchIds: ['BAT-15'],                            label: 'Class 1st to 5th (Junior Foundation)' },
  6:  { type: 'billing',  batchIds: ['BAT-ENG-912', 'BAT-ENG-68', 'BAT-ENG-15'], label: 'Special English batches' },
  7:  { type: 'reminder', batchIds: ['BAT-10', 'BAT-12PCM', 'BAT-12PCB'], label: 'Class 10th & 12th outstanding dues' },
  8:  { type: 'reminder', batchIds: ['BAT-09', 'BAT-11PCM', 'BAT-11PCB'], label: 'Class 9th & 11th outstanding dues' },
  9:  { type: 'reminder', batchIds: ['BAT-08', 'BAT-67'],                  label: 'Class 6th to 8th outstanding dues' },
  10: { type: 'reminder', batchIds: 'ALL', final: true,                    label: 'Final grace-period reminder (all unpaid balances)' }
};

/** The calendar entry for a day-of-month, or null during the rest state. */
export function scheduleForDay(day) {
  return BILLING_CALENDAR[Number(day)] || null;
}

// ----------------------------------------------------------------------------
// Free-text class_name -> canonical batch resolution.
//
// Student records carry operator-typed class names, so matching must be
// tolerant. Order matters: the most specific patterns are tested first so that
// "Special English 9th to 12th" never falls through to the Class 12th rule.
// ----------------------------------------------------------------------------
const RESOLUTION_RULES = [
  // Explicit batch ids first (exact, cheapest, most authoritative).
  [/^BAT-12PCM$/i, 'BAT-12PCM'],
  [/^BAT-12PCB$/i, 'BAT-12PCB'],
  [/^BAT-11PCM$/i, 'BAT-11PCM'],
  [/^BAT-11PCB$/i, 'BAT-11PCB'],
  [/^BAT-10$/i, 'BAT-10'],
  [/^BAT-09$/i, 'BAT-09'],
  [/^BAT-08$/i, 'BAT-08'],
  [/^BAT-(67|JUNIO)$/i, 'BAT-67'],
  [/^BAT-15$/i, 'BAT-15'],
  [/^BAT-ENG-912$/i, 'BAT-ENG-912'],
  [/^BAT-ENG-68$/i, 'BAT-ENG-68'],
  [/^BAT-ENG-15$/i, 'BAT-ENG-15'],

  // Special English — must precede every numeric class rule.
  [/(english|grammar|spoken)/i, null], // handled by resolveEnglishBatch below

  // Senior secondary with stream. The optional ordinal keeps "Class 12th PCB"
  // from falling through the stream rules into the bare "12th" rule.
  [/(12|xii|twelfth)(?:st|nd|rd|th)?[^a-z0-9]*(pcb|bio)/i, 'BAT-12PCB'],
  [/(12|xii|twelfth)(?:st|nd|rd|th)?[^a-z0-9]*(pcm|math)/i, 'BAT-12PCM'],
  [/(11|xi|eleventh)(?:st|nd|rd|th)?[^a-z0-9]*(pcb|bio)/i, 'BAT-11PCB'],
  [/(11|xi|eleventh)(?:st|nd|rd|th)?[^a-z0-9]*(pcm|math)/i, 'BAT-11PCM'],
  [/\b(12th|12|xii|twelfth)\b/i, 'BAT-12PCM'],
  [/\b(11th|11|xi|eleventh)\b/i, 'BAT-11PCM'],
  [/ascend/i, 'BAT-12PCM'],

  // Board and foundation.
  [/\b(10th|10|x|tenth)\b|achiever|matric/i, 'BAT-10'],
  [/\b(9th|9|ix|ninth)\b|nurture/i, 'BAT-09'],
  [/\b(8th|8|viii|eighth)\b|alpha/i, 'BAT-08'],
  [/\b(6th|7th|6|7|vi|vii|sixth|seventh)\b|pioneer|junio/i, 'BAT-67'],
  [/\b([1-5](st|nd|rd|th)?|i|ii|iii|iv|v|first|second|third|fourth|fifth)\b|primary|junior/i, 'BAT-15']
];

// Ordinal-tolerant: "9th", "12", "XII" and "twelfth" must all match.
const ORD = '(?:st|nd|rd|th)?';
const ENGLISH_TIERS = [
  [new RegExp(`\\b(?:9${ORD}|10${ORD}|11${ORD}|12${ORD}|ix|x|xi|xii|ninth|tenth|eleventh|twelfth)\\b`, 'i'), 'BAT-ENG-912'],
  [new RegExp(`\\b(?:6${ORD}|7${ORD}|8${ORD}|vi|vii|viii|sixth|seventh|eighth)\\b`, 'i'), 'BAT-ENG-68'],
  [new RegExp(`\\b(?:[1-5]${ORD}|i|ii|iii|iv|v|first|second|third|fourth|fifth)\\b`, 'i'), 'BAT-ENG-15']
];

function resolveEnglishBatch(str) {
  for (const [pattern, batchId] of ENGLISH_TIERS) {
    if (pattern.test(str)) return batchId;
  }
  return 'BAT-ENG-912';
}

/**
 * Resolve any free-text class name / batch id to a canonical batch object.
 * Returns null when nothing matches so callers can decide their own policy
 * instead of silently inheriting a wrong fee (the old `|| 1000` bug).
 */
export function resolveBatch(classNameOrBatchId) {
  const str = String(classNameOrBatchId || '').trim();
  if (!str) return null;

  const trimmed = str.replace(/\s+/g, ' ');
  if (BATCH_BY_ID.has(trimmed.toUpperCase())) return BATCH_BY_ID.get(trimmed.toUpperCase());

  for (const [pattern, batchId] of RESOLUTION_RULES) {
    if (!pattern.test(trimmed)) continue;
    const resolved = batchId === null ? resolveEnglishBatch(trimmed) : batchId;
    return BATCH_BY_ID.get(resolved) || null;
  }

  // If string contains composite multi-class delimiter (+, &, and), resolve first valid batch
  if (/[+&,]|\band\b/i.test(trimmed)) {
    const parts = resolveBatches(trimmed);
    if (parts.length > 0) return parts[0];
  }

  return null;
}

/**
 * Resolve all distinct canonical batch objects from a single or composite class string.
 * Supports 1 class, 2 classes, or 3 classes joined with '+', '&', or commas.
 */
export function resolveBatches(classNameOrBatchIds) {
  if (!classNameOrBatchIds) return [];
  const rawList = Array.isArray(classNameOrBatchIds)
    ? classNameOrBatchIds
    : String(classNameOrBatchIds).split(/[+&,]|\band\b/i);

  const seenIds = new Set();
  const result = [];
  for (const item of rawList) {
    const b = resolveBatch(item);
    if (b && !seenIds.has(b.batchId)) {
      seenIds.add(b.batchId);
      result.push(b);
    }
  }
  return result;
}

/** Monthly fee for a class name (sums all enrolled batches for multi-class combinations). */
export function monthlyFeeFor(className, fallback = null) {
  const batches = resolveBatches(className);
  if (batches.length > 0) {
    return batches.reduce((sum, b) => sum + b.monthlyFee, 0);
  }
  return fallback;
}

/** The CC pair of the YYCCSS barcode for a class name. */
export function classCodeFor(className) {
  const batch = resolveBatch(className);
  return batch ? batch.classCode : null;
}

/**
 * Which batch ids a student's class name could satisfy on a given billing day.
 * Used by the cron to decide whether a student is in scope today.
 */
export function isStudentInScope(className, batchIds) {
  if (batchIds === 'ALL') return true;
  const batches = resolveBatches(className);
  if (batches.length === 0) return false;
  return batches.some(b => batchIds.includes(b.batchId));
}

// ----------------------------------------------------------------------------
// Idempotency keys. The billing key is batch-independent by design: a student
// owes exactly one monthly charge regardless of a mid-month batch transfer.
// ----------------------------------------------------------------------------
/** Canonical billing idempotency key: BILL-<STUDENT_ID>-<YYYY-MM>. */
export function billingIdempotencyKey(studentId, monthKey) {
  return `BILL-${String(studentId).toUpperCase()}-${monthKey}`;
}

/** Canonical payment idempotency key: PAY-<RECEIPT_NO>. */
export function paymentIdempotencyKey(receiptNo) {
  return `PAY-${String(receiptNo).toUpperCase()}`;
}

// ----------------------------------------------------------------------------
// IST calendar helpers. Vercel cron fires in UTC; billing months and the daily
// email quota window are both defined in Asia/Kolkata.
// ----------------------------------------------------------------------------
export const IST_TIMEZONE = 'Asia/Kolkata';

/** ISO date in IST, e.g. "2026-08-23". */
export function istDateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(date);
}

/** Billing month in IST, e.g. "2026-08". */
export function istMonthKey(date = new Date()) {
  return istDateKey(date).slice(0, 7);
}

/** Day of month in IST as a number, e.g. 23. */
export function istDayOfMonth(date = new Date()) {
  return Number(istDateKey(date).slice(8, 10));
}

/** Two-digit IST year for the YY of a YYCCSS barcode, e.g. "26". */
export function istYearCode(date = new Date()) {
  return istDateKey(date).slice(2, 4);
}

/** Inclusive UTC bounds of the current IST day, for quota range queries. */
export function istDayBoundsUtc(date = new Date()) {
  const dayKey = istDateKey(date);
  // IST is a fixed UTC+05:30 offset with no daylight saving.
  return {
    dayKey,
    startUtc: new Date(`${dayKey}T00:00:00.000+05:30`).toISOString(),
    endUtc: new Date(`${dayKey}T23:59:59.999+05:30`).toISOString()
  };
}

// ----------------------------------------------------------------------------
// Resend free-tier quota.
// ----------------------------------------------------------------------------
export const RESEND_DAILY_LIMIT = 100;

// Governance — the sole administrator authorized to purge audit logs.
export const PRIMARY_ADMIN = { adminId: 'ADM-01', username: 'chandan', name: 'CHANDAN KUMAR' };

// The single institute UPI payee. This VPA was pasted literally into pay.html,
// index.html, js/portal.js, both GitHub Actions billing scripts and both email
// templates — nineteen copies of a string that has to change atomically or the
// deep-links, the printed QR caption and the invoice footer start disagreeing
// about where money should go. New code reads it from here.
export const PAYEE = {
  upiId: 'chandankr1501998@ybl',
  name: 'CHANDAN KUMAR',
  displayName: 'Chandan Kumar',
  role: 'Managing Director, Pragyan Institute'
};

export const FACULTY = [
  { name: 'CHANDAN KUMAR', role: 'Managing Director & Science Lead', experience: '10+ Years' },
  { name: 'PROF. RAVI RANJAN', role: 'Higher Mathematics Lead', experience: '15+ Years' },
  { name: 'ADITI SINGH', role: 'English & Grammar Mentor (M.Com)', experience: '1,000+ students mentored' }
];
