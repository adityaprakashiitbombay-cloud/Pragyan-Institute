// ============================================================================
// PRAGYAN INSTITUTE — FEE & SCHOLARSHIP POLICY MODULE
// ----------------------------------------------------------------------------
// Derives every figure from the canonical batch table so the discount rate is
// declared exactly once. See api/_lib/academic-config.js.
//
// Two figures matter and they are easy to confuse:
//   effectiveMonthlyRate  — the per-month rate a family pays when they settle
//                           the year in one advance:  base x 0.95   (e.g. 950)
//   annualTotal           — what they actually transfer: base x 12 x 0.95
//                           (e.g. 11,400 — the number printed on the website)
// ============================================================================

import { ANNUAL_DISCOUNT_PCT, annualPrice, monthlyFeeFor } from '../api/_lib/academic-config.js';

export { ANNUAL_DISCOUNT_PCT };

/**
 * Effective per-month rate for a billing cycle.
 * `annual` applies the one-time 5% scholarship; `monthly` never discounts.
 */
export function calculateEstimate({ base = 1000, cycle = 'monthly' } = {}) {
  const discount = cycle === 'annual' ? ANNUAL_DISCOUNT_PCT : 0;
  const basePrice = Number(base) || 1000;
  return Math.round(basePrice * (1 - discount));
}

/** Full-year advance total for a monthly rate: base x 12 x 0.95. */
export function annualTotal(base) {
  return annualPrice(Number(base) || 0);
}

/**
 * Both published figures for a class name, or null when the class cannot be
 * resolved to one of the 12 canonical batches — never a guessed ₹1,000.
 */
export function quoteForClass(className) {
  const monthly = monthlyFeeFor(className);
  if (monthly == null) return null;
  return {
    monthly,
    annual: annualTotal(monthly),
    effectiveMonthlyOnAnnual: calculateEstimate({ base: monthly, cycle: 'annual' }),
    savings: monthly * 12 - annualTotal(monthly)
  };
}

if (typeof window !== 'undefined') {
  window.calculateEstimate = calculateEstimate;
  window.annualTotal = annualTotal;
  window.quoteForClass = quoteForClass;
}
