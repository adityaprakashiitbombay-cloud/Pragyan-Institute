// Authenticated database gateway. Browser code must never hold a service-role key.
import { getSupabase, publicAdmin, requireSession, applyCors } from './auth.js';

const TABLES = new Set([
  'students', 'notices', 'fee_receipts', 'fee_billing_ledger',
  'student_requests', 'batches', 'admins', 'audit_logs',
  'video_lectures', 'study_materials', 'live_class_doubts'
]);
const PUBLIC_TABLES = new Set(['notices', 'batches', 'video_lectures', 'study_materials', 'live_class_doubts']);
const STUDENT_TABLES = new Set([
  'students', 'notices', 'fee_receipts', 'fee_billing_ledger',
  'student_requests', 'batches', 'video_lectures', 'study_materials', 'live_class_doubts'
]);
const ORDER_COLUMNS = {
  students: 'student_id', notices: 'id', fee_receipts: 'receipt_no',
  fee_billing_ledger: 'created_at', student_requests: 'request_id',
  batches: 'batch_id', admins: 'admin_id', audit_logs: 'log_id',
  video_lectures: 'chapter_no', study_materials: 'created_at', live_class_doubts: 'created_at'
};

function rows(value) {
  return Array.isArray(value) ? value : [value];
}

function addWhere(query, where = {}) {
  return Object.entries(where).reduce((current, [column, value]) => current.eq(column, value), query);
}

function readColumns(table, requested) {
  if (table !== 'admins') return requested || '*';
  // Password hashes never leave the server, including for administrators.
  return 'admin_id,username,name,role,mobile,email,upi_id,is_head,photo_url,updated_at';
}

function assertStudentOwnership(table, operation, data, filters, session) {
  if (!STUDENT_TABLES.has(table)) throw new Error('This account cannot access that data');
  if (PUBLIC_TABLES.has(table) && operation === 'select') return filters?.where || {};

  // Doubts submission by students
  if (table === 'live_class_doubts') {
    if (operation === 'select') return filters?.where || {};
    if (['insert', 'upsert'].includes(operation)) {
      for (const row of rows(data)) {
        if (!row.doubt_text) throw new Error('Doubt text cannot be empty');
      }
      return filters?.where || {};
    }
  }

  if (table === 'students' || table === 'fee_receipts' || table === 'fee_billing_ledger' || table === 'student_requests') {
    if (operation === 'select') return { ...(filters?.where || {}), student_id: session.sub };
    if (table === 'student_requests' && ['insert', 'upsert'].includes(operation)) {
      for (const row of rows(data)) {
        if (row.student_id !== session.sub || (row.status && row.status !== 'Pending')) {
          throw new Error('Students may only create their own pending requests');
        }
      }
      return filters?.where || {};
    }
    if (table === 'student_requests' && operation === 'update') {
      // Allow students to cancel or update their own pending requests
      if (!filters?.where?.request_id && !filters?.where?.id) throw new Error('A request identifier is required');
      return { ...(filters?.where || {}), student_id: session.sub, status: 'Pending' };
    }
    if (table === 'student_requests' && operation === 'delete') {
      if (!filters?.where?.request_id && !filters?.where?.id) throw new Error('A request identifier is required');
      return { ...(filters?.where || {}), student_id: session.sub, status: 'Pending' };
    }
    throw new Error('Students cannot modify this record directly');
  }
  throw new Error('This operation is not allowed');
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  let { table, operation, data, filters = {} } = req.body || {};
  if (!TABLES.has(table) || !['select', 'insert', 'upsert', 'update', 'delete'].includes(operation)) {
    return res.status(400).json({ error: 'Invalid database operation' });
  }

  const supabase = getSupabase();
  if (!supabase) return res.status(503).json({ error: 'Server database configuration is missing' });

  let session = null;
  if (!PUBLIC_TABLES.has(table) || operation !== 'select') {
    session = requireSession(req, res, ['student', 'admin']);
    if (!session) return;
  }

  try {
    if (session?.role === 'student') {
      filters.where = assertStudentOwnership(table, operation, data, filters, session);
    } else if (!session && (!PUBLIC_TABLES.has(table) || operation !== 'select')) {
      return res.status(401).json({ error: 'Sign in is required' });
    }

    if (table === 'admins' && operation !== 'select') {
      if (session?.role !== 'admin' || operation !== 'update' || filters?.where?.admin_id !== session.sub) {
        return res.status(403).json({ error: 'Administrators may update only their own profile' });
      }
      const allowed = ['username', 'name', 'mobile', 'email', 'upi_id', 'photo_url'];
      data = Object.fromEntries(Object.entries(data || {}).filter(([key]) => allowed.includes(key)));
      if (Object.keys(data).length === 0) return res.status(400).json({ error: 'No permitted profile fields were supplied' });
    }

    let result;
    if (operation === 'select') {
      const limit = Math.min(Math.max(Number(filters.limit) || 500, 1), 1000);
      const offset = Math.max(Number(filters.offset) || 0, 0);
      const query = supabase.from(table)
        .select(readColumns(table, filters.columns))
        .order(ORDER_COLUMNS[table], { ascending: true })
        .range(offset, offset + limit - 1);
      result = await addWhere(query, filters.where);
    } else if (operation === 'insert') {
      result = await supabase.from(table).insert(rows(data)).select(readColumns(table));
    } else if (operation === 'upsert') {
      if (!filters.conflict) return res.status(400).json({ error: 'Missing conflict column for upsert' });
      result = await supabase.from(table).upsert(rows(data), { onConflict: filters.conflict }).select(readColumns(table));
    } else if (operation === 'update') {
      if (!filters.where || Object.keys(filters.where).length === 0) return res.status(400).json({ error: 'An update filter is required' });
      result = await addWhere(supabase.from(table).update(data), filters.where).select(readColumns(table));
    } else {
      if (!filters.where || Object.keys(filters.where).length === 0) return res.status(400).json({ error: 'A delete filter is required' });
      result = await addWhere(supabase.from(table).delete(), filters.where).select(readColumns(table));
    }

    if (result.error) throw result.error;
    const responseData = table === 'admins' && Array.isArray(result.data) ? result.data.map(publicAdmin) : result.data;
    return res.status(200).json({ success: true, data: responseData });
  } catch (error) {
    console.error(`Database gateway error [${table}:${operation}]:`, error.message);
    return res.status(403).json({ success: false, error: error.message || 'Database operation rejected' });
  }
}
