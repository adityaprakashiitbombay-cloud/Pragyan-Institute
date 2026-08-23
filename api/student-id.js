// ============================================================================
// GET|POST /api/student-id — allocate the next YYCCSS barcode id
// ----------------------------------------------------------------------------
// Delegates to generate_next_student_id(), which takes a per-(year, class)
// advisory lock before reading MAX(serial). Four defects this file used to carry:
//
//   1. No authentication of any kind. Anyone could enumerate the institute's
//      enrolment counts per class by walking className values.
//
//   2. Read-max-then-increment in JavaScript with no lock. Two admissions
//      submitted at the same moment both read the same MAX and minted the same
//      barcode; the second insert then failed on the unique constraint, so the
//      admin lost the form.
//
//   3. A private getClassCode() ladder that disagreed with the specification:
//      it returned '06' for Class 6th where YYCCSS defines '07' for the combined
//      6th & 7th batch, had no branch at all for the three Special English
//      batches (class code '01'), matched 'X' as a substring so any class name
//      containing an X resolved to Class 10th, and fell through to '10' — so an
//      unrecognised class silently minted a 10th-grade barcode.
//
//   4. `new Date(new Date().toLocaleString('en-US', {timeZone}))` re-parses a
//      localised string, which is implementation-defined. The RPC uses
//      `now() AT TIME ZONE 'Asia/Kolkata'`.
// ============================================================================

import { getSupabase, requireSession, applyCors } from './_lib/auth.js';
import { resolveBatch } from './_lib/academic-config.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Allocating an id is an admissions action, so it needs the admin role.
  const session = requireSession(req, res, ['admin']);
  if (!session) return;

  const supabase = getSupabase();
  if (!supabase) {
    return res.status(503).json({ success: false, error: 'Database configuration missing' });
  }

  const className = String((req.method === 'POST' ? req.body?.className : req.query?.className) || '').trim();
  if (!className) {
    return res.status(400).json({ success: false, error: 'A className is required to derive the YYCCSS class code' });
  }

  // Refuse an unresolvable class here rather than letting the RPC raise, so the
  // operator gets the batch list back instead of a Postgres error string. There
  // is no default: guessing a class code mints a barcode that says the student
  // is in a year group they are not in.
  const batch = resolveBatch(className);
  if (!batch) {
    return res.status(400).json({
      success: false,
      error: `"${className}" does not resolve to any of the 12 canonical batches, so no barcode id can be derived.`
    });
  }

  try {
    const { data, error } = await supabase.rpc('generate_next_student_id', { p_class_name: className });

    if (error) {
      const missing = error.code === 'PGRST202' || /could not find the function/i.test(error.message || '');
      // invalid_parameter_value is the RPC's own refusal (unresolvable class, or
      // the 01-99 serial range exhausted) and is the operator's to act on.
      const isRefusal = error.code === '22023' || /serial range exhausted|cannot derive/i.test(error.message || '');
      console.error('[student-id] generate_next_student_id failed:', error.code || '', error.message);
      return res.status(missing ? 503 : (isRefusal ? 409 : 500)).json({
        success: false,
        error: missing
          ? 'The id allocator is not deployed. Run supabase_production_hardening.sql against the database.'
          : (isRefusal ? error.message : 'Could not allocate a student id')
      });
    }

    const studentId = typeof data === 'string' ? data : String(data || '');
    if (!/^\d{6}$/.test(studentId)) {
      return res.status(500).json({ success: false, error: 'The allocator returned a malformed id' });
    }

    return res.status(200).json({
      success: true,
      studentId,
      prefix: studentId.slice(0, 4),
      year: studentId.slice(0, 2),
      classCode: studentId.slice(2, 4),
      serial: Number(studentId.slice(4)),
      batchId: batch.batchId,
      className: batch.className
    });
  } catch (err) {
    console.error('[student-id] unexpected failure:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Could not allocate a student id' });
  }
}
