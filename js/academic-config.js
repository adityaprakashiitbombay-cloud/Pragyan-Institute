/* ============================================================================
 * PRAGYAN INSTITUTE — CANONICAL ACADEMIC CONFIGURATION (BROWSER)
 * ----------------------------------------------------------------------------
 * Browser mirror of api/_lib/academic-config.js. Exposes window.PRAGYAN_ACADEMIC.
 *
 * Loaded as a classic script (no module bundler in this project), so it must
 * stay dependency-free and run before js/supabase-sync.js, js/app.js,
 * js/tabs.js, js/portal.js and pay.html's inline logic.
 *
 * tests/academic-config.test.js asserts this file and the server file agree on
 * every batch id, fee, annual price, class code, calendar entry and on the
 * output of resolveBatch() across a corpus of real class-name strings. If you
 * edit one file, edit both — CI fails otherwise.
 * ========================================================================= */
(function (global) {
  'use strict';

  var ANNUAL_DISCOUNT_PCT = 0.05;

  function annualPrice(monthlyFee) {
    return Math.round(Number(monthlyFee) * 12 * (1 - ANNUAL_DISCOUNT_PCT));
  }

  var BATCHES = [
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

  var BATCH_BY_ID = {};
  BATCHES.forEach(function (b) { BATCH_BY_ID[b.batchId] = b; });

  var BILLING_CALENDAR = {
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

  function scheduleForDay(day) {
    return BILLING_CALENDAR[Number(day)] || null;
  }

  var RESOLUTION_RULES = [
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

    // Special English must precede every numeric class rule.
    [/(english|grammar|spoken)/i, null],

    // Senior secondary with stream. The optional ordinal keeps "Class 12th PCB"
    // from falling through the stream rules into the bare "12th" rule.
    [/(12|xii|twelfth)(?:st|nd|rd|th)?[^a-z0-9]*(pcb|bio)/i, 'BAT-12PCB'],
    [/(12|xii|twelfth)(?:st|nd|rd|th)?[^a-z0-9]*(pcm|math)/i, 'BAT-12PCM'],
    [/(11|xi|eleventh)(?:st|nd|rd|th)?[^a-z0-9]*(pcb|bio)/i, 'BAT-11PCB'],
    [/(11|xi|eleventh)(?:st|nd|rd|th)?[^a-z0-9]*(pcm|math)/i, 'BAT-11PCM'],
    [/\b(12th|12|xii|twelfth)\b/i, 'BAT-12PCM'],
    [/\b(11th|11|xi|eleventh)\b/i, 'BAT-11PCM'],
    [/ascend/i, 'BAT-12PCM'],

    [/\b(10th|10|x|tenth)\b|achiever|matric/i, 'BAT-10'],
    [/\b(9th|9|ix|ninth)\b|nurture/i, 'BAT-09'],
    [/\b(8th|8|viii|eighth)\b|alpha/i, 'BAT-08'],
    [/\b(6th|7th|6|7|vi|vii|sixth|seventh)\b|pioneer|junio/i, 'BAT-67'],
    [/\b([1-5](st|nd|rd|th)?|i|ii|iii|iv|v|first|second|third|fourth|fifth)\b|primary|junior/i, 'BAT-15']
  ];

  var ORD = '(?:st|nd|rd|th)?';
  var ENGLISH_TIERS = [
    [new RegExp('\\b(?:9' + ORD + '|10' + ORD + '|11' + ORD + '|12' + ORD + '|ix|x|xi|xii|ninth|tenth|eleventh|twelfth)\\b', 'i'), 'BAT-ENG-912'],
    [new RegExp('\\b(?:6' + ORD + '|7' + ORD + '|8' + ORD + '|vi|vii|viii|sixth|seventh|eighth)\\b', 'i'), 'BAT-ENG-68'],
    [new RegExp('\\b(?:[1-5]' + ORD + '|i|ii|iii|iv|v|first|second|third|fourth|fifth)\\b', 'i'), 'BAT-ENG-15']
  ];

  function resolveEnglishBatch(str) {
    for (var i = 0; i < ENGLISH_TIERS.length; i++) {
      if (ENGLISH_TIERS[i][0].test(str)) return ENGLISH_TIERS[i][1];
    }
    return 'BAT-ENG-912';
  }

  function resolveBatch(classNameOrBatchId) {
    var str = String(classNameOrBatchId == null ? '' : classNameOrBatchId).trim();
    if (!str) return null;

    var trimmed = str.replace(/\s+/g, ' ');
    if (BATCH_BY_ID[trimmed.toUpperCase()]) return BATCH_BY_ID[trimmed.toUpperCase()];

    for (var i = 0; i < RESOLUTION_RULES.length; i++) {
      if (!RESOLUTION_RULES[i][0].test(trimmed)) continue;
      var batchId = RESOLUTION_RULES[i][1];
      var resolved = batchId === null ? resolveEnglishBatch(trimmed) : batchId;
      return BATCH_BY_ID[resolved] || null;
    }

    // If string contains composite multi-class delimiter (+, &, and), resolve first valid batch
    if (/[+&,]|\band\b/i.test(trimmed)) {
      var parts = resolveBatches(trimmed);
      if (parts.length > 0) return parts[0];
    }

    return null;
  }

  function resolveBatches(classNameOrBatchIds) {
    if (!classNameOrBatchIds) return [];
    var rawList = Array.isArray(classNameOrBatchIds)
      ? classNameOrBatchIds
      : String(classNameOrBatchIds).split(/[+&,]|\band\b/i);

    var seenIds = {};
    var result = [];
    for (var i = 0; i < rawList.length; i++) {
      var b = resolveBatch(rawList[i]);
      if (b && !seenIds[b.batchId]) {
        seenIds[b.batchId] = true;
        result.push(b);
      }
    }
    return result;
  }

  function monthlyFeeFor(className, fallback) {
    var batches = resolveBatches(className);
    if (batches.length > 0) {
      var total = 0;
      for (var i = 0; i < batches.length; i++) {
        total += batches[i].monthlyFee;
      }
      return total;
    }
    return (fallback === undefined ? null : fallback);
  }

  function classCodeFor(className) {
    var batch = resolveBatch(className);
    return batch ? batch.classCode : null;
  }

  function isStudentInScope(className, batchIds) {
    if (batchIds === 'ALL') return true;
    var batches = resolveBatches(className);
    if (batches.length === 0) return false;
    for (var i = 0; i < batches.length; i++) {
      if (batchIds.indexOf(batches[i].batchId) !== -1) return true;
    }
    return false;
  }

  function billingIdempotencyKey(studentId, monthKey) {
    return 'BILL-' + String(studentId).toUpperCase() + '-' + monthKey;
  }

  function paymentIdempotencyKey(receiptNo) {
    return 'PAY-' + String(receiptNo).toUpperCase();
  }

  var IST_TIMEZONE = 'Asia/Kolkata';

  function istDateKey(date) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: IST_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(date || new Date());
  }

  function istMonthKey(date) { return istDateKey(date).slice(0, 7); }
  function istDayOfMonth(date) { return Number(istDateKey(date).slice(8, 10)); }
  function istYearCode(date) { return istDateKey(date).slice(2, 4); }

  /** Formats a number as Indian rupees with thousands separators, e.g. "₹17,100". */
  function formatINR(amount) {
    var n = Math.round(Number(amount) || 0);
    return '₹' + n.toLocaleString('en-IN');
  }

  var RESEND_DAILY_LIMIT = 100;
  var PRIMARY_ADMIN = { adminId: 'ADM-01', username: 'chandan', name: 'CHANDAN KUMAR' };

  // Mirror of PAYEE in api/_lib/academic-config.js — see the note there on why
  // the VPA is no longer pasted into each page that builds a upi:// link.
  var PAYEE = {
    upiId: 'chandankr1501998@ybl',
    name: 'CHANDAN KUMAR',
    displayName: 'Chandan Kumar',
    role: 'Managing Director, Pragyan Institute'
  };
  var FACULTY = [
    { name: 'CHANDAN KUMAR', role: 'Managing Director & Science Lead', experience: '10+ Years' },
    { name: 'PROF. RAVI RANJAN', role: 'Higher Mathematics Lead', experience: '15+ Years' },
    { name: 'ADITI SINGH', role: 'English & Grammar Mentor (M.Com)', experience: '1,000+ students mentored' }
  ];

  /** { class10: { monthly: '₹1,000', annual: '₹11,400' }, ... } for [data-price-key]. */
  var PRICE_TABLE = {};
  BATCHES.forEach(function (b) {
    PRICE_TABLE[b.priceKey] = {
      monthly: formatINR(b.monthlyFee),
      annual: formatINR(annualPrice(b.monthlyFee)),
      monthlyValue: b.monthlyFee,
      annualValue: annualPrice(b.monthlyFee)
    };
  });

  global.PRAGYAN_ACADEMIC = {
    ANNUAL_DISCOUNT_PCT: ANNUAL_DISCOUNT_PCT,
    BATCHES: BATCHES,
    BATCH_BY_ID: BATCH_BY_ID,
    BILLING_CALENDAR: BILLING_CALENDAR,
    PRICE_TABLE: PRICE_TABLE,
    RESEND_DAILY_LIMIT: RESEND_DAILY_LIMIT,
    PRIMARY_ADMIN: PRIMARY_ADMIN,
    PAYEE: PAYEE,
    FACULTY: FACULTY,
    IST_TIMEZONE: IST_TIMEZONE,
    annualPrice: annualPrice,
    scheduleForDay: scheduleForDay,
    resolveBatch: resolveBatch,
    resolveBatches: resolveBatches,
    monthlyFeeFor: monthlyFeeFor,
    classCodeFor: classCodeFor,
    isStudentInScope: isStudentInScope,
    billingIdempotencyKey: billingIdempotencyKey,
    paymentIdempotencyKey: paymentIdempotencyKey,
    istDateKey: istDateKey,
    istMonthKey: istMonthKey,
    istDayOfMonth: istDayOfMonth,
    istYearCode: istYearCode,
    formatINR: formatINR
  };
})(typeof window !== 'undefined' ? window : globalThis);
