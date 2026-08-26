import { getSupabase, requireSession, applyCors } from './_lib/auth.js';
import { pushToSubscription } from './_lib/webpush.js';

const DEFAULT_VAPID_SUBJECT = 'mailto:pragyan.lalganj@gmail.com';

function stripTags(str) {
  return typeof str === 'string' ? str.replace(/<\/?[a-zA-Z][^>]*>/g, '').trim() : '';
}

function formatINR(num) {
  return '₹' + Number(num || 0).toLocaleString('en-IN');
}

/** 
 * Enhanced dynamic variable interpolation engine.
 * Supports both single {tag} and double {{tag}} braces across all student fields:
 * - {student_name}, {name}, {student}
 * - {batch_name}, {batch}, {class_name}, {class}, {course}
 * - {pending_dues}, {dues}, {pending_fee}, {amount}, {fee}, {balance}
 * - {roll_no}, {roll}, {roll_number}
 * - {student_id}, {id}, {admission_no}
 * - {guardian_name}, {parent_name}, {father_name}
 * - {mobile}, {phone}, {contact}
 * - {due_date}, {date}, {today}, {month}
 * - {institute_name}, {institute}
 * - {receipt_no}
 */
function interpolate(template, student = {}) {
  if (!template || typeof template !== 'string') return '';

  const studentName = student.name || student.student_name || student.studentName || 'Student';
  const className = student.class_name || student.className || student.batch_name || student.batch || student.batchId || 'Academic Batch';
  const duesAmount = student.pending_balance ?? student.pending_fee ?? student.pendingFee ?? (Number(student.total_fee || 0) - Number(student.paid_fee || 0)) ?? 0;
  const dues = formatINR(duesAmount);
  const rollNo = student.roll_no || student.rollNo || student.student_id || student.id || '';
  const studentId = student.student_id || student.id || student.roll_no || '';
  const guardianName = student.guardian_name || student.guardianName || student.father_name || '';
  const mobile = student.mobile || student.guardian_mobile || student.guardianMobile || '';
  const dueDate = student.due_date || '5th of this month';
  const receiptNo = student.receipt_no || student.receiptNo || '';
  const instituteName = 'Pragyan Institute';

  const payUrl = studentId ? `/pay.html?id=${encodeURIComponent(studentId)}&name=${encodeURIComponent(studentName)}&amount=${encodeURIComponent(duesAmount || 0)}` : '/pay.html';

  let todayFormatted = '';
  let monthFormatted = '';
  try {
    const now = new Date();
    todayFormatted = now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
    monthFormatted = now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
  } catch (_) {
    todayFormatted = 'Today';
    monthFormatted = 'This Month';
  }

  return template
    // Student Name tags (single & double curly braces)
    .replace(/\{{1,2}\s*(?:student_name|studentName|name|student)\s*\}{1,2}/gi, studentName)
    // Batch / Class Name tags
    .replace(/\{{1,2}\s*(?:batch_name|batchName|class_name|className|batch|class|course)\s*\}{1,2}/gi, className)
    // Fee / Dues tags
    .replace(/\{{1,2}\s*(?:pending_dues|pendingDues|dues|pending_fee|pendingFee|pending_fees|amount|fee|fees|balance)\s*\}{1,2}/gi, dues)
    // Roll number tags
    .replace(/\{{1,2}\s*(?:roll_no|rollNo|roll_number|rollNumber|roll)\s*\}{1,2}/gi, rollNo)
    // Student ID tags
    .replace(/\{{1,2}\s*(?:student_id|studentId|id|admission_no|reg_no)\s*\}{1,2}/gi, studentId)
    // Personalized Payment URL tags
    .replace(/\{{1,2}\s*(?:pay_url|payment_url|pay_link|payment_link)\s*\}{1,2}/gi, payUrl)
    // Guardian / Parent tags
    .replace(/\{{1,2}\s*(?:guardian_name|guardianName|parent_name|parentName|father_name|fatherName)\s*\}{1,2}/gi, guardianName || 'Parent/Guardian')
    // Mobile / Contact tags
    .replace(/\{{1,2}\s*(?:mobile|phone|contact)\s*\}{1,2}/gi, mobile)
    // Due Date & Time tags
    .replace(/\{{1,2}\s*due_date\s*\}{1,2}/gi, dueDate)
    .replace(/\{{1,2}\s*(?:date|today)\s*\}{1,2}/gi, todayFormatted)
    .replace(/\{{1,2}\s*month\s*\}{1,2}/gi, monthFormatted)
    // Institute & Receipt tags
    .replace(/\{{1,2}\s*(?:institute_name|instituteName|institute)\s*\}{1,2}/gi, instituteName)
    .replace(/\{{1,2}\s*(?:receipt_no|receiptNo)\s*\}{1,2}/gi, receiptNo);
}

function resolveActionUrl(url, actionTitle, student = {}) {
  const sid = student.student_id || student.roll_no || student.id || '';
  const sName = student.name || student.student_name || student.studentName || '';
  const duesAmount = student.pending_balance ?? student.pending_fee ?? student.pendingFee ?? (Number(student.total_fee || 0) - Number(student.paid_fee || 0)) ?? 0;

  let cleanUrl = interpolate(url || '/', student);

  // If this action is to Pay Fees (via title or pay.html url), append personalized payment query params
  const isPayAction = cleanUrl.includes('pay.html') || /pay\s*fee|clear\s*due|pay\s*dues/i.test(actionTitle || '') || /pay/i.test(cleanUrl);
  if (isPayAction && sid) {
    const params = new URLSearchParams();
    params.set('id', sid);
    if (sName) params.set('name', sName);
    if (duesAmount > 0) params.set('amount', duesAmount);
    const qs = params.toString();
    const basePath = cleanUrl.includes('pay.html') ? cleanUrl.split('?')[0] : '/pay.html';
    cleanUrl = `${basePath}?${qs}`;
  }

  return cleanUrl;
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  let session = null;
  const cronHeader = req.headers.authorization || '';
  const cronSecret = process.env.CRON_SECRET;
  const isCron = Boolean(cronSecret && (cronHeader === `Bearer ${cronSecret}` || req.headers['x-cron-secret'] === cronSecret));

  if (req.method === 'POST' && !isCron) {
    session = requireSession(req, res, ['admin']);
    if (!session) return;
  }

  const supabase = getSupabase();
  if (!supabase) {
    return res.status(503).json({ success: false, error: 'Database service unavailable' });
  }

  // Support GET request for active push stats (subscribers count, recent log)
  if (req.method === 'GET') {
    try {
      const { count: subsCount, error: cntErr } = await supabase
        .from('push_subscriptions')
        .select('*', { count: 'exact', head: true });

      const { data: recentLogs } = await supabase
        .from('push_broadcast_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(25);

      return res.status(200).json({
        success: true,
        subscribers: subsCount || 0,
        recentLogs: recentLogs || []
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  // BUG-12: per-caller broadcast brake (max 10 dispatches / hour / caller).
  const BROADCAST_RATE_LIMIT = { windowMs: 60 * 60 * 1000, max: 10 };
  const broadcastBuckets = new Map();
  function broadcastAllowed(callerKey) {
    const now = Date.now();
    const bucket = broadcastBuckets.get(callerKey);
    if (!bucket || bucket.windowStart + BROADCAST_RATE_LIMIT.windowMs < now) {
      broadcastBuckets.set(callerKey, { count: 1, windowStart: now });
      if (broadcastBuckets.size > 2000) {
        for (const [k, v] of broadcastBuckets) {
          if (v.windowStart + BROADCAST_RATE_LIMIT.windowMs < now) broadcastBuckets.delete(k);
        }
      }
      return true;
    }
    bucket.count += 1;
    return bucket.count <= BROADCAST_RATE_LIMIT.max;
  }

  let body = req.body || {};
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }
  const rawTitle = stripTags(body.title || 'Pragyan Institute Update').slice(0, 100);
  const rawBody = stripTags(body.body || '').slice(0, 300);
  const callerKey = isCron ? 'cron' : (session?.sub || session?.username ||
    (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'ip').toString().split(',')[0].trim());
  
  if (!broadcastAllowed(callerKey)) {
    return res.status(429).json({ success: false, error: 'Broadcast limit reached (10/hour). Try later.' });
  }
  if (!rawBody) {
    return res.status(400).json({ success: false, error: 'Notification message body is required' });
  }

  let target = typeof body.target === 'object' && body.target !== null ? body.target : { type: 'ALL' };
  let targetType = ['ALL', 'BATCHES', 'STUDENT', 'DUES'].includes(target.type) ? target.type : 'ALL';

  if (session && session.role === 'student') {
    targetType = 'STUDENT';
    const sId = session.sub || session.student_id;
    target = { type: 'STUDENT', students: [sId, session.student_id, session.roll_no].filter(Boolean) };
  }
  const actions = Array.isArray(body.actions) ? body.actions.slice(0, 2).map(a => ({
    action: stripTags(a.action || 'view').slice(0, 30),
    title: stripTags(a.title || 'Open').slice(0, 40),
    url: String(a.url || '/').slice(0, 200)
  })) : [];

  const image = body.image && /^https:\/\/[^\s]+$/.test(body.image) ? body.image : null;
  const priority = body.priority === 'high' ? 'high' : 'normal';
  const ttlHours = [6, 24, 72].includes(Number(body.ttlHours)) ? Number(body.ttlHours) : 24;
  const ttlSeconds = ttlHours * 3600;

  const vapidKeys = {
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY
  };
  const vapidSubject = process.env.VAPID_SUBJECT || process.env.RESEND_FROM_EMAIL || DEFAULT_VAPID_SUBJECT || 'mailto:pragyan.lalganj@gmail.com';
  // BUG-01: fail closed — no embedded credential fallback exists anymore.
  if (!vapidKeys.publicKey || !vapidKeys.privateKey || !vapidSubject) {
    return res.status(500).json({ success: false, error: 'VAPID credentials unconfigured on server. Please configure VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in environment variables.' });
  }

  try {
    let subsQuery = supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh_key, auth_key, student_id, batch_id, device_os, browser');

    if (targetType === 'STUDENT' && Array.isArray(target.students) && target.students.length > 0) {
      // Resolve all identifier variations (UUID, 6-digit roll_no, student_id) for target student
      const rawTargetIds = target.students.map(s => String(s || '').trim()).filter(Boolean);
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const targetUuids = rawTargetIds.filter(id => uuidRegex.test(id));
      const targetTextIds = rawTargetIds.filter(id => !uuidRegex.test(id));

      const orClauses = [];
      if (targetTextIds.length > 0) {
        orClauses.push(`student_id.in.(${targetTextIds.map(id => `"${id}"`).join(',')})`);
        orClauses.push(`roll_no.in.(${targetTextIds.map(id => `"${id}"`).join(',')})`);
      }
      if (targetUuids.length > 0) {
        orClauses.push(`id.in.(${targetUuids.map(id => `"${id}"`).join(',')})`);
      }

      let allStudentKeys = new Set(rawTargetIds);
      if (orClauses.length > 0) {
        const { data: matchedStudents } = await supabase
          .from('students')
          .select('id, student_id, roll_no, name')
          .or(orClauses.join(','));

        if (matchedStudents && matchedStudents.length > 0) {
          for (const s of matchedStudents) {
            if (s.id) allStudentKeys.add(s.id);
            if (s.student_id) allStudentKeys.add(s.student_id);
            if (s.roll_no) allStudentKeys.add(s.roll_no);
          }
        }
      }

      subsQuery = subsQuery.in('student_id', Array.from(allStudentKeys));
    } else if (targetType === 'BATCHES' && Array.isArray(target.batches) && target.batches.length > 0) {
      // Support batch ID variations (e.g. BAT-10, batch-BAT-10, 10, Class 10th)
      const allBatchKeys = new Set();
      target.batches.forEach(b => {
        const str = String(b || '').trim();
        if (str) {
          allBatchKeys.add(str);
          if (str.startsWith('batch-')) allBatchKeys.add(str.replace('batch-', ''));
          else allBatchKeys.add(`batch-${str}`);
        }
      });
      subsQuery = subsQuery.in('batch_id', Array.from(allBatchKeys));
    }

    const { data: subscriptions, error: subErr } = await subsQuery;
    if (subErr) throw subErr;

    if (!subscriptions || subscriptions.length === 0) {
      // Record attempt in broadcast logs even if 0 audience
      const senderName = isCron ? 'SYSTEM (CRON)' : (session?.username || session?.sub || 'ADMIN');
      await supabase.from('push_broadcast_logs').insert([{
        title: rawTitle,
        body: rawBody,
        target_type: targetType,
        target_filter: target,
        audience_size: 0,
        sent_count: 0,
        delivered_count: 0,
        failed_count: 0,
        pruned_count: 0,
        dispatched_by: senderName,
        source: isCron ? 'cron' : 'admin',
        payload_meta: { priority, ttlHours, hasImage: Boolean(image), actionsCount: actions.length }
      }]).catch(() => {});

      return res.status(200).json({
        success: true,
        audienceSize: 0,
        sent: 0,
        delivered: 0,
        failed: 0,
        pruned: 0,
        message: 'No registered devices found for target audience'
      });
    }

    const studentIds = [...new Set(subscriptions.map(s => s.student_id).filter(Boolean))];
    const studentMap = new Map();
    if (studentIds.length > 0) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const uuidIds = studentIds.filter(id => uuidRegex.test(id));
      const nonUuidIds = studentIds.filter(id => !uuidRegex.test(id));

      // Multi-query by student_id, id, and roll_no to resolve student metadata for every device
      const queries = [];
      queries.push(supabase.from('students').select('id, student_id, roll_no, name, class_name, pending_fee, total_fee, paid_fee, guardian_name, mobile').in('student_id', studentIds));
      if (uuidIds.length > 0) {
        queries.push(supabase.from('students').select('id, student_id, roll_no, name, class_name, pending_fee, total_fee, paid_fee, guardian_name, mobile').in('id', uuidIds));
      }
      if (nonUuidIds.length > 0) {
        queries.push(supabase.from('students').select('id, student_id, roll_no, name, class_name, pending_fee, total_fee, paid_fee, guardian_name, mobile').in('roll_no', nonUuidIds));
      }

      const results = await Promise.allSettled(queries);
      const allFound = [];
      results.forEach(r => {
        if (r.status === 'fulfilled' && Array.isArray(r.value?.data)) {
          allFound.push(...r.value.data);
        }
      });

      for (const s of allFound) {
        s.pending_balance = Number(s.pending_fee ?? s.pending_fees ?? (Number(s.total_fee || 0) - Number(s.paid_fee || 0)) ?? 0);
        if (s.student_id) {
          studentMap.set(s.student_id, s);
          studentMap.set(String(s.student_id).toLowerCase(), s);
        }
        if (s.id) {
          studentMap.set(s.id, s);
          studentMap.set(String(s.id).toLowerCase(), s);
        }
        if (s.roll_no) {
          studentMap.set(s.roll_no, s);
          studentMap.set(String(s.roll_no).toLowerCase(), s);
        }
        if (s.name) {
          studentMap.set(s.name.toLowerCase(), s);
        }
      }
    }

    // Single Active Device per Student Policy:
    // If a student is subscribed on multiple devices, overwrite/filter so we only send to their latest active device.
    const studentLatestDeviceMap = new Map();
    for (const sub of (subscriptions || [])) {
      const sKey = (sub.student_id || '').trim().toLowerCase();
      if (!sKey) {
        // Skip unbound/anonymous endpoints (only students devices receive notifications)
        continue;
      }
      const existing = studentLatestDeviceMap.get(sKey);
      if (!existing) {
        studentLatestDeviceMap.set(sKey, sub);
      } else {
        const existingTime = new Date(existing.updated_at || existing.created_at || 0).getTime();
        const subTime = new Date(sub.updated_at || sub.created_at || 0).getTime();
        if (subTime >= existingTime) {
          studentLatestDeviceMap.set(sKey, sub);
        }
      }
    }

    let targetSubs = Array.from(studentLatestDeviceMap.values());
    if (targetType === 'DUES') {
      targetSubs = targetSubs.filter(s => {
        const stud = studentMap.get(s.student_id) || (s.student_id ? studentMap.get(String(s.student_id).toLowerCase()) : null);
        return stud && Number(stud.pending_balance || stud.pending_fee || 0) > 0;
      });
    }

    const audienceSize = targetSubs.length;
    let sentCount = 0;
    let deliveredCount = 0;
    let failedCount = 0;
    let prunedCount = 0;
    const deadEndpoints = [];

    const CHUNK_SIZE = 10;
    for (let i = 0; i < targetSubs.length; i += CHUNK_SIZE) {
      const chunk = targetSubs.slice(i, i + CHUNK_SIZE);
      const promises = chunk.map(async (sub) => {
        sentCount++;
        const studentInfo = studentMap.get(sub.student_id) || (sub.student_id ? studentMap.get(String(sub.student_id).toLowerCase()) : {}) || {};
        const title = interpolate(rawTitle, studentInfo);
        const messageBody = interpolate(rawBody, studentInfo);
        const resolvedActions = actions.map(act => ({
          ...act,
          url: resolveActionUrl(act.url, act.title, studentInfo)
        }));

        const primaryUrl = resolvedActions[0]?.url || (studentInfo.student_id ? `/pay.html?id=${encodeURIComponent(studentInfo.student_id)}&name=${encodeURIComponent(studentInfo.name || '')}` : '/portal.html');

        const payloadObj = {
          title,
          body: messageBody,
          icon: '/assets/images/logo.png',
          badge: '/assets/images/logo.png',
          image: image || undefined,
          url: primaryUrl,
          actions: resolvedActions,
          priority,
          timestamp: Date.now()
        };

        const resResult = await pushToSubscription(sub, payloadObj, {
          vapidKeys,
          vapidSubject,
          ttlSeconds,
          urgency: priority
        });

        if (resResult.ok) {
          deliveredCount++;
        } else {
          failedCount++;
          if (resResult.prune) {
            prunedCount++;
            deadEndpoints.push(sub.endpoint);
          }
        }
      });

      await Promise.allSettled(promises);
    }

    if (deadEndpoints.length > 0) {
      await supabase
        .from('push_subscriptions')
        .delete()
        .in('endpoint', deadEndpoints)
        .catch(() => {});
    }

    const senderName = isCron ? 'SYSTEM (CRON)' : (session?.username || session?.sub || 'ADMIN');
    await supabase.from('push_broadcast_logs').insert([{
      title: rawTitle,
      body: rawBody,
      target_type: targetType,
      target_filter: target,
      audience_size: audienceSize,
      sent_count: sentCount,
      delivered_count: deliveredCount,
      failed_count: failedCount,
      pruned_count: prunedCount,
      dispatched_by: senderName,
      source: isCron ? 'cron' : 'admin',
      payload_meta: { priority, ttlHours, hasImage: Boolean(image), actionsCount: actions.length }
    }]);

    return res.status(200).json({
      success: true,
      audienceSize,
      sent: sentCount,
      delivered: deliveredCount,
      failed: failedCount,
      pruned: prunedCount
    });
  } catch (err) {
    console.error('[send-push] dispatch failure:', err);
    return res.status(500).json({ success: false, error: err.message || 'Internal broadcast error' });
  }
}
