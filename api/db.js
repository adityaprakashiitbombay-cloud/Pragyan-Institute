// ============================================================================
// AUTHENTICATED DATABASE GATEWAY  —  POST /api/db
// ----------------------------------------------------------------------------
// The single data path between the browser and PostgreSQL.
//
// Why this exists: the portal previously spoke PostgREST directly from the
// browser using the anon key, which forced the database to keep
// `FOR ALL TO anon USING (true)` policies on students, receipts, requests, the
// billing ledger and the audit log. Anyone who opened DevTools could read every
// student's PII, rewrite fee balances, forge receipts and purge the audit trail.
//
// With this gateway in place, RLS denies anon everything except the public
// notices and batches catalogue, and each request here is authorised against
// the caller's signed session before the service-role key is ever used.
//
// Request shape:
//   { table, operation, data?, filters?: { where?, columns?, conflict?, limit?, offset?, order?, ascending? } }
// ============================================================================

import { getSupabase, publicAdmin, requireSession, applyCors } from './_lib/auth.js';

const TABLES = new Set([
  'students', 'notices', 'fee_receipts', 'fee_billing_ledger',
  'student_requests', 'batches', 'admins', 'audit_logs'
]);

// Readable without a session, because the marketing site renders before login.
const PUBLIC_TABLES = new Set(['notices', 'batches']);

// Reachable at all by a student session. email_dispatch_log is absent from
// TABLES entirely: the email quota ledger is server-only bookkeeping.
const STUDENT_TABLES = new Set([
  'students', 'notices', 'fee_receipts', 'fee_billing_ledger',
  'student_requests', 'batches', 'admins'
]);

const OPERATIONS = new Set(['select', 'insert', 'upsert', 'update', 'delete']);

const ORDER_COLUMNS = {
  students: 'student_id', notices: 'created_at', fee_receipts: 'created_at',
  fee_billing_ledger: 'created_at', student_requests: 'created_at',
  batches: 'batch_id', admins: 'admin_id', audit_logs: 'created_at'
};

// Descending by default where the UI shows newest-first lists.
const DEFAULT_DESCENDING = new Set(['notices', 'fee_receipts', 'fee_billing_ledger', 'student_requests', 'audit_logs']);

// Columns a student may see on the institute's own admin records. This is the
// payment identity shown on pay.html — never the credential columns.
const ADMIN_PUBLIC_COLUMNS = 'admin_id,username,name,role,mobile,email,upi_id,is_head,photo_url,updated_at';

// A student may only ever change these fields on their own record; fee balances
// and credentials are server-controlled.
const STUDENT_SELF_EDITABLE = new Set(['mobile', 'email', 'address', 'photo_url', 'guardian_mobile', 'blood_group']);

/** Thrown for authorisation failures so the handler can answer 403 specifically. */
class ForbiddenError extends Error {
  constructor(message) { super(message); this.name = 'ForbiddenError'; }
}
/** Thrown for malformed requests so the handler can answer 400 specifically. */
class BadRequestError extends Error {
  constructor(message) { super(message); this.name = 'BadRequestError'; }
}

function rows(value) {
  return Array.isArray(value) ? value : [value];
}

function addWhere(query, where = {}) {
  return Object.entries(where).reduce((current, [column, value]) => (
    Array.isArray(value) ? current.in(column, value) : current.eq(column, value)
  ), query);
}

function readColumns(table, requested) {
  // The admins projection is fixed rather than caller-supplied: it is the one
  // table where an explicit column list is the only thing keeping password
  // hashes off the wire. students rows are selected whole and then passed
  // through sanitize(), because the portal genuinely needs every other column.
  if (table === 'admins') return ADMIN_PUBLIC_COLUMNS;
  return requested || '*';
}

/** Strip credential columns from any row shape before it leaves the server. */
function sanitize(table, data) {
  if (!data) return data;
  const list = Array.isArray(data) ? data : [data];
  const clean = list.map(row => {
    if (!row || typeof row !== 'object') return row;
    const { password, password_hash, ...safe } = row;
    return safe;
  });
  return Array.isArray(data) ? clean : clean[0];
}

/**
 * Narrow a student's request to data they own, or reject it.
 * Returns the WHERE clause the query must run with.
 */
function authorizeStudent(table, operation, data, filters, session) {
  if (!STUDENT_TABLES.has(table)) {
    throw new ForbiddenError('This account cannot access that data');
  }

  // Public catalogue: readable as-is, never writable.
  if (PUBLIC_TABLES.has(table)) {
    if (operation !== 'select') throw new ForbiddenError('This catalogue is read-only');
    return filters?.where || {};
  }

  // The institute's payment identity, read-only and already column-masked.
  if (table === 'admins') {
    if (operation !== 'select') throw new ForbiddenError('Students cannot modify administrator records');
    return filters?.where || {};
  }

  const scoped = { ...(filters?.where || {}), student_id: session.sub };

  if (operation === 'select') return scoped;

  if (table === 'students' && operation === 'update') {
    // Self-service profile edits only. Anything touching money or credentials
    // must go through an admin-approved student_request.
    const submitted = Object.keys(data || {});
    const illegal = submitted.filter(key => !STUDENT_SELF_EDITABLE.has(key));
    if (illegal.length) {
      throw new ForbiddenError(`These fields require administrator approval: ${illegal.join(', ')}`);
    }
    if (!submitted.length) throw new BadRequestError('No permitted profile fields were supplied');
    return scoped;
  }

  if (table === 'student_requests') {
    if (operation === 'insert' || operation === 'upsert') {
      for (const row of rows(data)) {
        if (row?.student_id !== session.sub) {
          throw new ForbiddenError('Students may only create requests for their own record');
        }
        if (row.status && row.status !== 'Pending') {
          throw new ForbiddenError('New requests must start in the Pending state');
        }
      }
      return filters?.where || {};
    }
    if (operation === 'update' || operation === 'delete') {
      if (!filters?.where?.request_id && !filters?.where?.id) {
        throw new BadRequestError('A request identifier is required');
      }
      // Pinning status keeps a student from editing a request an admin already
      // approved, which would otherwise let them rewrite an approved amount.
      return { ...scoped, status: 'Pending' };
    }
  }

  throw new ForbiddenError('Students cannot modify this record directly');
}

/** Restrict what an admin session may write to the admins table. */
function authorizeAdminTableWrite(operation, data, filters, session) {
  if (operation !== 'update' || filters?.where?.admin_id !== session.sub) {
    throw new ForbiddenError('Administrators may update only their own profile');
  }
  const allowed = ['username', 'name', 'mobile', 'email', 'upi_id', 'photo_url'];
  const filtered = Object.fromEntries(Object.entries(data || {}).filter(([key]) => allowed.includes(key)));
  if (Object.keys(filtered).length === 0) {
    throw new BadRequestError('No permitted profile fields were supplied');
  }
  return filtered;
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const body = req.body || {};
  let { table, operation, data } = body;
  const filters = { ...(body.filters || {}) };

  if (!TABLES.has(table)) {
    return res.status(400).json({ success: false, error: 'Unknown table' });
  }
  if (!OPERATIONS.has(operation)) {
    return res.status(400).json({ success: false, error: 'Unknown operation' });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return res.status(503).json({ success: false, error: 'Server database configuration is missing' });
  }

  // Anonymous reads of the public catalogue need no session; everything else does.
  const isAnonymousRead = PUBLIC_TABLES.has(table) && operation === 'select';
  let session = null;
  if (!isAnonymousRead) {
    session = requireSession(req, res, ['student', 'admin']);
    if (!session) return; // requireSession already answered
  }

  try {
    if (session?.role === 'student') {
      filters.where = authorizeStudent(table, operation, data, filters, session);
    } else if (session?.role === 'admin' && table === 'admins' && operation !== 'select') {
      data = authorizeAdminTableWrite(operation, data, filters, session);
    }

    let result;
    if (operation === 'select') {
      const limit = Math.min(Math.max(Number(filters.limit) || 500, 1), 1000);
      const offset = Math.max(Number(filters.offset) || 0, 0);
      const orderColumn = ORDER_COLUMNS[table];
      const ascending = typeof filters.ascending === 'boolean'
        ? filters.ascending
        : !DEFAULT_DESCENDING.has(table);

      const query = supabase.from(table)
        .select(readColumns(table, filters.columns))
        .order(orderColumn, { ascending, nullsFirst: false })
        .range(offset, offset + limit - 1);
      result = await addWhere(query, filters.where);
    } else if (operation === 'insert') {
      result = await supabase.from(table).insert(rows(data)).select(readColumns(table));
    } else if (operation === 'upsert') {
      if (!filters.conflict) {
        return res.status(400).json({ success: false, error: 'Missing conflict column for upsert' });
      }
      result = await supabase.from(table)
        .upsert(rows(data), { onConflict: filters.conflict })
        .select(readColumns(table));
    } else if (operation === 'update') {
      if (!filters.where || Object.keys(filters.where).length === 0) {
        return res.status(400).json({ success: false, error: 'An update filter is required' });
      }
      result = await addWhere(supabase.from(table).update(data), filters.where).select(readColumns(table));
    } else {
      if (!filters.where || Object.keys(filters.where).length === 0) {
        // An unfiltered delete would empty the table.
        return res.status(400).json({ success: false, error: 'A delete filter is required' });
      }
      result = await addWhere(supabase.from(table).delete(), filters.where).select(readColumns(table));
    }

    if (result.error) {
      // A genuine database fault is a 500, not a 403. The previous gateway
      // reported every failure as "Database operation rejected", which made a
      // missing column indistinguishable from a permission problem.
      console.error(`[db] ${table}:${operation} failed:`, result.error.message);
      const status = result.error.code === '23505' ? 409 : 500;
      return res.status(status).json({
        success: false,
        error: result.error.message,
        code: result.error.code || null
      });
    }

    const payload = table === 'admins' && Array.isArray(result.data)
      ? result.data.map(publicAdmin)
      : sanitize(table, result.data);

    return res.status(200).json({ success: true, data: payload });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return res.status(403).json({ success: false, error: error.message });
    }
    if (error instanceof BadRequestError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    console.error(`[db] ${table}:${operation} threw:`, error);
    return res.status(500).json({ success: false, error: 'Database request failed' });
  }
}
