// Pragyan Institute — Fee & Scholarship Policy Module

export function calculateEstimate({ base = 1000, cycle = 'monthly' } = {}) {
  // A maximum of 5% scholarship is given exclusively on one-time annual payment
  const annualDiscountPct = (cycle === 'annual') ? 0.05 : 0.0;
  const basePrice = Number(base) || 1000;
  return Math.round(basePrice * (1 - annualDiscountPct));
}

if (typeof window !== 'undefined') {
  window.calculateEstimate = calculateEstimate;
}
