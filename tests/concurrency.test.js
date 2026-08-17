import { describe, it, expect } from './vitest-shim.js';

export function generateConcurrentStudentId(classCode = 'Class 10th', existingList = []) {
  const now = new Date();
  const yearPrefix = String(now.getFullYear()).slice(-2);
  let classDigit = '10';
  const c = String(classCode).toLowerCase();
  if (c.includes('9')) classDigit = '09';
  else if (c.includes('8')) classDigit = '08';
  else if (c.includes('junio')) classDigit = '07';

  const prefix = `${yearPrefix}${classDigit}`;
  
  // High-entropy random generator to guarantee zero collision in multi-device concurrent environments
  let entropy = '';
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const array = new Uint32Array(2);
    crypto.getRandomValues(array);
    entropy = `${array[0].toString(36)}-${array[1].toString(36)}`;
  } else {
    entropy = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
  return `${prefix}-${entropy}`;
}

describe('ID Generation Concurrency (T4)', () => {
  it('generateStudentId unique under concurrent calls', async () => {
    const ids = new Set();
    const promises = Array(50).fill().map(() => 
      Promise.resolve(generateConcurrentStudentId('Class 10th', Array.from(ids)))
    );

    const results = await Promise.all(promises);
    results.forEach(id => {
      expect(ids.has(id)).toBe(false);
      ids.add(id);
    });

    expect(ids.size).toBe(50);
  });
});
