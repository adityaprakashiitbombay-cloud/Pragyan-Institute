import { describe, it, expect, vi } from './vitest-shim.js';

export function _normalizeDob(d) {
  if (!d) return [];
  const str = d.toString().trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return [str];
  return [];
}

export function normalizeDob(d) {
  return _normalizeDob(d);
}

export function _dobMatches(inputDob, studentDob) {
  const inputNorms = _normalizeDob(inputDob);
  const studentNorms = _normalizeDob(studentDob);
  return inputNorms.some(i => studentNorms.includes(i));
}

export function getClassCode(className = '') {
  const cStr = String(className || '').toUpperCase();
  if (cStr.includes('12') || cStr.includes('XII') || cStr.includes('TARGET 12')) {
    return '12';
  } else if (cStr.includes('11') || cStr.includes('XI') || cStr.includes('TARGET 11')) {
    return '11';
  } else if (cStr.includes('10') || cStr.includes('ACHIEVER') || cStr.includes('X') || cStr.includes('BOARD') || cStr.includes('MATRIC')) {
    return '10';
  } else if (cStr.includes('9') || cStr.includes('NURTURE') || cStr.includes('IX')) {
    return '09';
  } else if (cStr.includes('8') || cStr.includes('ALPHA') || cStr.includes('VIII')) {
    return '08';
  } else if (cStr.includes('7') || cStr.includes('JUNIOR') || cStr.includes('VII')) {
    return '07';
  } else if (cStr.includes('6') || cStr.includes('VI')) {
    return '06';
  }
  const match = cStr.match(/\b([6-9]|1[0-2])\b/);
  if (match) return match[1].padStart(2, '0');
  return '10';
}

export function generateStudentId(classCode = 'Class 10th', existingList = []) {
  const now = new Date();
  const yearPrefix = String(now.getFullYear()).slice(-2);
  const classDigit = getClassCode(classCode);
  const prefix = `${yearPrefix}${classDigit}`;
  let maxSerial = 0;

  for (const item of existingList) {
    const rawId = typeof item === 'string' ? item : (item?.student_id || item?.id || '');
    if (rawId.startsWith(prefix)) {
      const serial = parseInt(rawId.slice(prefix.length), 10);
      if (!isNaN(serial) && serial > maxSerial) {
        maxSerial = serial;
      }
    }
  }

  const nextSerial = String(maxSerial + 1).padStart(2, '0');
  return `${prefix}${nextSerial}`;
}

describe('DOB Normalization', () => {
  it('accepts ISO YYYY-MM-DD', () => {
    expect(normalizeDob('2010-01-15')).toEqual(['2010-01-15']);
  });

  it('rejects ambiguous DD-MM-YYYY', () => {
    expect(_normalizeDob('01-02-2010')).toEqual([]);
  });

  it('matches valid ISO dates', () => {
    expect(_dobMatches('2010-01-15', '2010-01-15')).toBe(true);
    expect(_dobMatches('2010-01-15', '01-02-2010')).toBe(false);
  });
});

describe('Student ID Generation (YYCCSS)', () => {
  it('generates sequential IDs per class with exact YYCCSS format', () => {
    const existing = [{ student_id: '261001' }, { student_id: '261003' }];
    expect(generateStudentId('Class 10th (ACHIEVER)', existing)).toBe('261004');
    expect(generateStudentId('Class 9th (NURTURE)', [])).toBe('260901');
    expect(generateStudentId('Class 8th (ALPHA)', [])).toBe('260801');
    expect(generateStudentId('Junior Batch (JUNIO)', [])).toBe('260701');
    expect(generateStudentId('Class 11th (TARGET)', [])).toBe('261101');
    expect(generateStudentId('Class 12th (BOARD)', [])).toBe('261201');
  });

  it('handles year rollover 2026→2027', () => {
    const originalDate = global.Date;
    try {
      // Mock Date to 2027
      const mockDate = new Date('2027-01-01T00:00:00Z');
      global.Date = class extends originalDate {
        constructor() {
          super();
          return mockDate;
        }
        static now() {
          return mockDate.getTime();
        }
      };
      expect(generateStudentId('Class 10th', [])).toBe('271001');
      expect(generateStudentId('Class 9th', [])).toBe('270901');
    } finally {
      global.Date = originalDate;
    }
  });
});
