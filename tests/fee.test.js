import { describe, it, expect } from './vitest-shim.js';
import { calculateEstimate } from '../js/fee-calculator.js';

describe('Fee & Scholarship Policy', () => {
  it('applies 0% discount on standard monthly payment', () => {
    expect(calculateEstimate({ base: 1000, cycle: 'monthly' })).toBe(1000);
    expect(calculateEstimate({ base: 800, cycle: 'monthly' })).toBe(800);
    expect(calculateEstimate({ base: 700, cycle: 'monthly' })).toBe(700);
  });

  it('applies exactly 5% scholarship on one-time annual payment', () => {
    expect(calculateEstimate({ base: 1000, cycle: 'annual' })).toBe(950); // 1000 - 5% = 950
    expect(calculateEstimate({ base: 800, cycle: 'annual' })).toBe(760);  // 800 - 5% = 760
    expect(calculateEstimate({ base: 700, cycle: 'annual' })).toBe(665);  // 700 - 5% = 665
  });
});
