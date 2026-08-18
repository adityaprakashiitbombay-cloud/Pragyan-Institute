import { describe, it, expect } from './vitest-shim.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

describe('Student Password Management & Authentication Logic', () => {
  const JWT_SECRET = process.env.JWT_SECRET || 'pragyan_jwt_fallback_secret_for_local_dev_2026';

  it('validates minimum password length (at least 4 characters)', () => {
    const isValid = (p) => typeof p === 'string' && p.trim().length >= 4;
    expect(isValid('123')).toBe(false);
    expect(isValid('')).toBe(false);
    expect(isValid(null)).toBe(false);
    expect(isValid('1234')).toBe(true);
    expect(isValid('mySecurePass99')).toBe(true);
  });

  it('correctly hashes and verifies student password with bcrypt', () => {
    const rawPassword = 'StudentSecretPassword2026';
    const hash = bcrypt.hashSync(rawPassword, 10);
    
    expect(bcrypt.compareSync(rawPassword, hash)).toBe(true);
    expect(bcrypt.compareSync('WrongPassword', hash)).toBe(false);
  });

  it('generates and verifies JWT token for student role', () => {
    const payload = {
      role: 'student',
      id: '261001',
      rollNo: '261001',
      name: 'Rohan Sharma',
      className: 'Class 10th (Board Batch)'
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
    const decoded = jwt.verify(token, JWT_SECRET);

    expect(decoded.role).toBe('student');
    expect(decoded.id).toBe('261001');
    expect(decoded.name).toBe('Rohan Sharma');
  });

  it('generates and verifies JWT token for admin role', () => {
    const payload = {
      role: 'admin',
      username: 'chandankumar',
      name: 'Chandan Kumar'
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
    const decoded = jwt.verify(token, JWT_SECRET);

    expect(decoded.role).toBe('admin');
    expect(decoded.username).toBe('chandankumar');
  });

  it('handles DOB reset status transition cleanly', () => {
    // Simulated student request state
    let requestRecord = {
      req_type: 'PASSWORD_UPDATE',
      status: 'Active',
      new_data: {
        password_hash: bcrypt.hashSync('customPass', 10),
        updated_at: new Date().toISOString(),
        updated_by: 'student'
      }
    };

    expect(requestRecord.status).toBe('Active');

    // Admin reset operation
    requestRecord.status = 'RESET_TO_DOB';
    requestRecord.new_data.password_hash = null;
    requestRecord.new_data.reset_to_dob = true;
    requestRecord.new_data.reset_at = new Date().toISOString();
    requestRecord.new_data.reset_by = 'admin';

    expect(requestRecord.status).toBe('RESET_TO_DOB');
    expect(requestRecord.new_data.password_hash).toBe(null);
    expect(requestRecord.new_data.reset_to_dob).toBe(true);
  });

  it('correctly matches DDMMYYYY format (e.g. 15052010 to 2010-05-15)', () => {
    function normalizeDob(d) {
      if (!d) return [];
      const str = String(d).trim();
      const results = [];
      if (/^\d{4}-\d{2}-\d{2}$/.test(str)) results.push(str);
      if (/^\d{8}$/.test(str)) {
        const day = str.slice(0, 2);
        const month = str.slice(2, 4);
        const year = str.slice(4, 8);
        const yNum = parseInt(year, 10);
        const mNum = parseInt(month, 10);
        const dNum = parseInt(day, 10);
        if (yNum >= 1970 && yNum <= 2035 && mNum >= 1 && mNum <= 12 && dNum >= 1 && dNum <= 31) {
          results.push(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
        }
      }
      const parts = str.split(/[-/.]/);
      if (parts.length === 3) {
        if (parts[2].length === 4) {
          results.push(`${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`);
        } else if (parts[0].length === 4) {
          results.push(`${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`);
        }
      }
      return [...new Set(results)];
    }

    function dobMatches(input, stored) {
      const iNorms = normalizeDob(input);
      const sNorms = normalizeDob(stored);
      return iNorms.some(i => sNorms.includes(i));
    }

    expect(dobMatches('15052010', '2010-05-15')).toBe(true);
    expect(dobMatches('15-05-2010', '2010-05-15')).toBe(true);
    expect(dobMatches('15/05/2010', '2010-05-15')).toBe(true);
    expect(dobMatches('2010-05-15', '2010-05-15')).toBe(true);
    expect(dobMatches('11052011', '2011-05-11')).toBe(true);
    expect(dobMatches('99999999', '2010-05-15')).toBe(false);
  });
});
