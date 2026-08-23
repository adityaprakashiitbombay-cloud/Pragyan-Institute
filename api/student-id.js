import crypto from 'crypto';
import { getSupabase, applyCors } from './_lib/auth.js';

function getClassCode(className = '') {
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
  } else if (cStr.includes('7') || cStr.includes('VII')) {
    return '07';
  } else if (cStr.includes('6') || cStr.includes('VI')) {
    return '06';
  } else if (cStr.includes('5') || cStr.includes('V') || cStr.includes('1ST TO 5TH') || cStr.includes('1-5') || cStr.includes('PRIMARY') || cStr.includes('JUNIOR')) {
    return '05';
  } else if (cStr.includes('4') || cStr.includes('IV')) {
    return '04';
  } else if (cStr.includes('3') || cStr.includes('III')) {
    return '03';
  } else if (cStr.includes('2') || cStr.includes('II')) {
    return '02';
  } else if (cStr.includes('1') || cStr.includes('IST') || cStr.includes('1ST')) {
    return '01';
  }
  const match = cStr.match(/\b([1-9]|1[0-2])\b/);
  if (match) return match[1].padStart(2, '0');
  return '10';
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  try {
    const supabase = getSupabase();
    if (!supabase) {
      return res.status(500).json({ success: false, error: 'Database configuration missing' });
    }
    const className = (req.method === 'POST' ? req.body?.className : req.query?.className) || 'Class 10th (ACHIEVER)';
    
    // 1. Determine Current Year in IST (UTC+5:30)
    const istDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const currentYear = istDate.getFullYear().toString().slice(-2); // e.g. "26"
    
    // 2. Determine Class Code (CC)
    const classCode = getClassCode(className);
    const prefix = `${currentYear}${classCode}`;

    // 3. Query Postgres database for all student_ids starting with prefix
    const { data: existingRows, error: dbError } = await supabase
      .from('students')
      .select('student_id')
      .ilike('student_id', `${prefix}%`);

    if (dbError) {
      console.warn('[student-id] Database query note:', dbError.message);
    }

    let maxSerial = 0;
    if (Array.isArray(existingRows)) {
      existingRows.forEach(row => {
        const rawId = String(row.student_id || '').trim();
        if (rawId.startsWith(prefix) && rawId.length >= 6) {
          const serial = parseInt(rawId.slice(4), 10);
          if (!isNaN(serial) && serial > maxSerial) {
            maxSerial = serial;
          }
        }
      });
    }

    const nextSerial = maxSerial + 1;
    const serialStr = nextSerial.toString().padStart(2, '0');
    const studentId = `${prefix}${serialStr}`;
    const uuid = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');

    return res.status(200).json({
      success: true,
      studentId,
      prefix,
      classCode,
      year: currentYear,
      serial: nextSerial,
      uuid
    });
  } catch (error) {
    console.error('Error generating student ID:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
