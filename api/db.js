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

import { getSupabase, publicAdmin, requireSession, optionalSession, applyCors } from './_lib/auth.js';

const TABLES = new Set([
  'students', 'notices', 'fee_receipts', 'fee_billing_ledger',
  'student_requests', 'batches', 'admins', 'audit_logs',
  'blog_posts', 'push_subscriptions', 'push_broadcast_logs',
  'admin_sessions', 'class_schedules', 'institute_holidays'
]);

// Readable without a session, because the marketing site renders before login.
const PUBLIC_TABLES = new Set(['notices', 'batches', 'blog_posts']);
PUBLIC_TABLES.add('class_schedules');
PUBLIC_TABLES.add('institute_holidays');

// Reachable at all by a student session. email_dispatch_log is absent from
// TABLES entirely: the email quota ledger is server-only bookkeeping.
const STUDENT_TABLES = new Set([
  'students', 'notices', 'fee_receipts', 'fee_billing_ledger',
  'student_requests', 'batches', 'admins', 'push_subscriptions',
  'class_schedules', 'institute_holidays'
]);

// Allowlisted server-side functions callable through this gateway's rpc
// passthrough. Anything not listed here is refused — the gateway must never
// become a generic SQL-rpc proxy. increment_blog_views is intentionally
// anonymous-callable: counting a read needs no session.
// Best-effort anonymous abuse brake for public RPCs (per warm instance).
// The DB-side checks (published-only, slug format) are authoritative; this
// just blunts scripted hammering between cold starts.
const ANON_RPC_LIMITS = {
  increment_blog_views: { max: 120, windowMs: 60_000 },
  submit_mentor_rating: { max: 20,  windowMs: 60_000 },
  get_mentor_ratings:   { max: 120, windowMs: 60_000 }
};
const anonRpcBuckets = new Map(); // `${fn}:${ip}:${argKey}` -> { count, windowStart }

function anonRpcAllowed(fn, ip, argKey) {
  const limit = ANON_RPC_LIMITS[fn];
  if (!limit) return true;
  const now = Date.now();
  const key = `${fn}:${ip}:${argKey}`;
  const bucket = anonRpcBuckets.get(key);
  if (!bucket || bucket.windowStart + limit.windowMs < now) {
    anonRpcBuckets.set(key, { count: 1, windowStart: now });
    if (anonRpcBuckets.size > 8000) {
      for (const [k, v] of anonRpcBuckets) {
        if (v.windowStart + limit.windowMs < now) anonRpcBuckets.delete(k);
      }
    }
    return true;
  }
  bucket.count += 1;
  return bucket.count <= limit.max;
}
const RPC_ALLOWLIST = {
  increment_blog_views: { anon: true, params: ['p_slug'] },
  submit_mentor_rating: { anon: true, params: ['p_mentor_id', 'p_rating', 'p_client_id'] },
  get_mentor_ratings:   { anon: true, params: [] }
};

// Free-text self-edit fields are stripped of markup server-side so an approved
// profile update can never carry stored XSS into admin render surfaces.
function stripMarkup(value) {
  return typeof value === 'string' ? value.replace(/<\/?[a-zA-Z][^>]*>/g, '').slice(0, 500) : value;
}

function sanitizeSelfEdit(data = {}) {
  const clean = {};
  for (const [key, value] of Object.entries(data)) {
    if (key === 'photo_url') {
      // Same policy as the client sanitizer: storage/https/data-image only.
      const v = String(value || '');
      const ok = /^https:\/\/[^\s"'<>]+$/.test(v) ||
        /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(v);
      if (!ok) throw new BadRequestError('photo_url must be an https or data-image URL');
      clean[key] = v;
    } else {
      clean[key] = stripMarkup(value);
    }
  }
  return clean;
}

const OPERATIONS = new Set(['select', 'insert', 'upsert', 'update', 'delete', 'rpc']);

const ORDER_COLUMNS = {
  students: 'student_id', notices: 'created_at', fee_receipts: 'created_at',
  fee_billing_ledger: 'created_at', student_requests: 'created_at',
  batches: 'batch_id', admins: 'admin_id', audit_logs: 'created_at',
  blog_posts: 'created_at', push_subscriptions: 'created_at',
  push_broadcast_logs: 'created_at', admin_sessions: 'last_active_at',
  class_schedules: 'sort_order', institute_holidays: 'start_date'
};

// Descending by default where the UI shows newest-first lists.
const DEFAULT_DESCENDING = new Set(['notices', 'fee_receipts', 'fee_billing_ledger', 'student_requests', 'audit_logs', 'blog_posts', 'push_subscriptions', 'push_broadcast_logs', 'admin_sessions']);

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
 * Resolve a student session identity into every identifier their rows may
 * carry. `fee_receipts` rows historically store the UUID while `student_id`
 * columns elsewhere store the 6-digit YYCCSS id, so child-table scoping must
 * match both or students silently stop seeing their own receipts.
 */
async function resolveStudentScope(supabase, sub) {
  const ids = new Set([sub]);
  try {
    const { data } = await supabase
      .from('students')
      .select('id, student_id')
      .eq('student_id', sub)
      .limit(1);
    if (data?.[0]?.id) ids.add(data[0].id);
  } catch (_) { /* scope falls back to the raw sub */ }
  return [...ids];
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

  // Child tables may key on either identifier form; `students` itself is the
  // canonical 6-digit id. The resolved in-list is attached by the handler,
  // which is async — this function returns the base scope.
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
    if (operation === 'insert') {
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
    if (operation === 'upsert') {
      // Upsert targets a conflict column and therefore ignores any WHERE —
      // meaning a crafted request_id could overwrite another student's pending
      // row wholesale. Students get plain inserts only; duplicates answer 409.
      throw new ForbiddenError('Use insert to create requests');
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

  if (table === 'push_subscriptions') {
    if (operation === 'select') return scoped;
    if (operation === 'insert' || operation === 'upsert') {
      for (const row of rows(data)) {
        if (row && typeof row === 'object') {
          row.p256dh_key = row.p256dh_key || row.p256dh || row.keys?.p256dh || '';
          row.auth_key = row.auth_key || row.auth || row.keys?.auth || '';
          if (row.student_id && row.student_id !== session.sub) {
            throw new ForbiddenError('Students may only bind their own device subscription');
          }
          if (session?.sub) {
            row.student_id = session.sub;
          }
          if (!row.endpoint || !String(row.endpoint).startsWith('https://')) {
            throw new BadRequestError('Valid HTTPS push endpoint is required');
          }
          if (!row.p256dh_key || String(row.p256dh_key).length < 20 || !row.auth_key || String(row.auth_key).length < 8) {
            throw new BadRequestError('Valid cryptographic push subscription keys are required');
          }
        }
      }
      return filters?.where || {};
    }
    if (operation === 'delete') {
      return scoped;
    }
  }

  throw new ForbiddenError('Students cannot modify this record directly');
}

/** Restrict what an admin session may write to the admins table. */
function authorizeAdminTableWrite(operation, data, filters, session) {
  const targetId = filters?.where?.admin_id || filters?.where?.id || filters?.where?.username;
  const isMatch = targetId && (targetId === session.sub || session.sub === 'ADM-01' || session.sub === 'chandan');
  if (operation !== 'update' || !isMatch) {
    throw new ForbiddenError('Administrators may update only their own profile');
  }
  const allowed = ['username', 'name', 'role', 'mobile', 'email', 'upi_id', 'photo_url'];
  const filtered = Object.fromEntries(Object.entries(data || {}).filter(([key]) => allowed.includes(key)));
  if (Object.keys(filtered).length === 0) {
    throw new BadRequestError('No permitted profile fields were supplied');
  }
  return filtered;
}

async function isSessionRevoked(session, supabase) {
  if (!session || session.role !== 'admin' || session.isCron || session.tv === undefined) {
    return false;
  }
  try {
    const { data: adminRow } = await supabase
      .from('admins')
      .select('token_version')
      .or(`admin_id.eq.${session.sub},id.eq.${session.sub},username.eq.${session.sub}`)
      .single();
    if (adminRow && adminRow.token_version && Number(adminRow.token_version) > Number(session.tv)) {
      return true;
    }
  } catch (_) {}

  // Check if this specific device session ID was explicitly revoked
  if (session.sid) {
    try {
      const { data: sesRow } = await supabase
        .from('admin_sessions')
        .select('is_revoked')
        .eq('session_id', session.sid)
        .single();
      if (sesRow && sesRow.is_revoked) {
        return true;
      }
      // Keep session activity fresh
      supabase
        .from('admin_sessions')
        .update({ last_active_at: new Date().toISOString() })
        .eq('session_id', session.sid)
        .then(() => {})
        .catch(() => {});
    } catch (_) {}
  }
  return false;
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  let body = req.body || {};
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }
  let table = typeof body.table === 'string' ? body.table.trim() : body.table;
  let operation = typeof body.operation === 'string' ? body.operation.trim() : (body.operation || 'select');
  let data = body.data;
  const filters = { ...(body.filters || {}) };
  const rpcFn = typeof body.fn === 'string' ? body.fn.trim() : null;

  // ---- Allowlisted RPC passthrough (table-independent) ---------------------
  if (operation === 'rpc') {
    const entry = RPC_ALLOWLIST[rpcFn];
    if (!entry) {
      return res.status(403).json({ success: false, error: 'Function is not callable through this gateway' });
    }
    const supabaseRpc = getSupabase();
    if (!supabaseRpc) return res.status(503).json({ success: false, error: 'Server database configuration is missing' });

    if (!entry.anon) {
      const adminSession = requireSession(req, res, ['admin']);
      if (!adminSession) return;
      if (await isSessionRevoked(adminSession, supabaseRpc)) {
        return res.status(401).json({ success: false, error: 'Your session has been logged out from another device. Please sign in again.' });
      }
    }
    const rawParams = body.params && typeof body.params === 'object' ? body.params : {};
    const params = {};
    for (const key of entry.params) {
      if (rawParams[key] !== undefined) params[key] = String(rawParams[key]).slice(0, 200);
    }
    // F-R4: slug hygiene + per-caller throttle for the anonymous counter.
    let clientIp = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'anon')
      .toString().split(',')[0].trim();
    if (rpcFn === 'increment_blog_views') {
      const rawSlug = String(params.p_slug || '').trim();
      const slug = rawSlug.toLowerCase();
      if (!slug || slug.length > 200 || !/^[a-z0-9-_]+$/.test(slug)) {
        return res.status(400).json({ success: false, error: 'Invalid article slug' });
      }
      if (!anonRpcAllowed(rpcFn, clientIp, slug)) {
        return res.status(429).json({ success: false, error: 'Too many requests' });
      }
      params.p_slug = slug;
    }
    try {
      const { data: rpcData, error } = await supabaseRpc.rpc(rpcFn, params);
      if (error) throw error;
      return res.status(200).json({ success: true, data: rpcData });
    } catch (err) {
      console.error(`[db] rpc ${rpcFn} failed:`, err?.message);
      return res.status(500).json({ success: false, error: 'Database request failed' });
    }
  }

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

  // Anonymous reads of the public catalogue or anonymous device registration need no session; everything else does.
  const isAnonymousRead = PUBLIC_TABLES.has(table) && operation === 'select';
  const isAnonymousPushRegister = table === 'push_subscriptions' && (operation === 'insert' || operation === 'upsert');
  let session = null;
  if (!isAnonymousRead && !isAnonymousPushRegister) {
    session = requireSession(req, res, ['student', 'admin']);
    if (!session) return; // requireSession already answered
    if (await isSessionRevoked(session, supabase)) {
      return res.status(401).json({ success: false, error: 'Your session has been logged out from another device. Please sign in again.' });
    }
  } else {
    session = optionalSession(req);
    if (session && await isSessionRevoked(session, supabase)) {
      session = null;
    }
  }

  if (isAnonymousPushRegister) {
    for (const row of rows(data)) {
      if (row && typeof row === 'object') {
        row.p256dh_key = row.p256dh_key || row.p256dh || row.keys?.p256dh || '';
        row.auth_key = row.auth_key || row.auth || row.keys?.auth || '';
        if (session?.sub) {
          row.student_id = session.sub;
        } else if (!session) {
          row.student_id = null;
        }
        if (!row.endpoint || !String(row.endpoint).startsWith('https://')) {
          return res.status(400).json({ success: false, error: 'Valid HTTPS push endpoint is required' });
        }
        if (!row.p256dh_key || String(row.p256dh_key).length < 20 || !row.auth_key || String(row.auth_key).length < 8) {
          return res.status(400).json({ success: false, error: 'Valid cryptographic push subscription keys are required' });
        }
      }
    }
  }

  // Blog feed: anyone without an admin session — including anonymous visitors
  // and students — may only ever see published rows. Drafts are admin-eyes-only.
  if (table === 'blog_posts' && session?.role !== 'admin') {
    filters.where = { ...(filters.where || {}), is_published: true };
  }

  try {
    if (session?.role === 'student') {
      filters.where = authorizeStudent(table, operation, data, filters, session);
      if (table === 'students' && operation === 'update') {
        data = sanitizeSelfEdit(data);
      }
      // Widen child-table scoping to every identifier form the student's rows
      // may carry (6-digit id + UUID). `students` itself keys on the canonical id.
      // Public tables (notices, batches, etc.) do not have student_id.
      if (table !== 'students' && table !== 'admins' && !PUBLIC_TABLES.has(table)) {
        const scopeIds = await resolveStudentScope(supabase, session.sub);
        filters.where = { ...filters.where, student_id: scopeIds };
      }
    } else if (session?.role === 'admin' && table === 'admins' && operation !== 'select') {
      data = authorizeAdminTableWrite(operation, data, filters, session);
    }

    let result;
    if (operation === 'select') {
      const limit = Math.min(Math.max(Number(filters.limit) || 500, 1), 1000);
      const offset = Math.max(Number(filters.offset) || 0, 0);
      const orderColumn = ORDER_COLUMNS[table] || 'created_at';
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
        if (table === 'push_subscriptions') filters.conflict = 'endpoint';
        else if (table === 'blog_posts') filters.conflict = 'slug';
        else if (table === 'class_schedules' || table === 'institute_holidays') filters.conflict = 'id';
        else return res.status(400).json({ success: false, error: 'Missing conflict column for upsert' });
      }
      let upsertRows = rows(data);
      if (table === 'blog_posts' && filters.conflict === 'slug') {
        upsertRows = upsertRows.map(r => {
          if (!r || typeof r !== 'object') return r;
          const rowCopy = { ...r };
          if (rowCopy.id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rowCopy.id)) {
            delete rowCopy.id;
          }
          return rowCopy;
        });
      }
      result = await supabase.from(table)
        .upsert(upsertRows, { onConflict: filters.conflict })
        .select(readColumns(table));
    } else if (operation === 'update') {
      if (!filters.where || Object.keys(filters.where).length === 0) {
        return res.status(400).json({ success: false, error: 'An update filter is required' });
      }
      const updateData = (data && typeof data === 'object' && !Array.isArray(data)) ? { ...data } : data;
      if (updateData && typeof updateData === 'object' && table === 'blog_posts') {
        delete updateData.id;
      }
      result = await addWhere(supabase.from(table).update(updateData), filters.where).select(readColumns(table));
    } else {
      if (!filters.where || Object.keys(filters.where).length === 0) {
        // An unfiltered delete would empty the table.
        return res.status(400).json({ success: false, error: 'A delete filter is required' });
      }
      result = await addWhere(supabase.from(table).delete(), filters.where).select(readColumns(table));
    }

    if (result.error) {
      // Graceful fallback for newly introduced optional tables before operator applies SQL migration in Supabase SQL editor
      if (operation === 'select' && (table === 'class_schedules' || table === 'institute_holidays') &&
          (result.error.code === '42P01' || result.error.message?.includes('schema cache') || result.error.message?.includes('does not exist'))) {
        return res.status(200).json({ success: true, data: [] });
      }

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
