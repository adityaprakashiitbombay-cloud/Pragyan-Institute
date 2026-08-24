import { getSupabase, requireSession, applyCors } from './_lib/auth.js';
import { pushToSubscription } from './_lib/webpush.js';

// Default VAPID keypair fallback for local dev & Vercel deployment
const DEFAULT_VAPID_PUBLIC_KEY = 'BP3tVwB7SjSNTEn7SsPHvzeTySIm17F7AA8Kdcbc0FMUHGBdE8K0tmvEmVVLY3dw9ypIMIG4oOKFNGJAZ1sndMQ';
const DEFAULT_VAPID_PRIVATE_KEY = 'MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQglvAU5VuajVTFhOoC4EmlieeCySWkSuzcnoyU6MEPixShRANCAAT97VcAe0o0jUxJ-0rDx783k8kiJtexewAPCnXG3NBTFBxgXRPCtLZrxJlVS2N3cPcqSDCBuKDihTRiQGdbJ3TE';
const DEFAULT_VAPID_SUBJECT = 'mailto:pragyan.lalganj@gmail.com';

function stripTags(str) {
  return typeof str === 'string' ? str.replace(/<\/?[a-zA-Z][^>]*>/g, '').trim() : '';
}

function formatINR(num) {
  return '₹' + Number(num || 0).toLocaleString('en-IN');
}

/** Interpolate {{student_name}}, {{batch_name}}, {{pending_dues}}, etc. */
function interpolate(template, student = {}) {
  if (!template || typeof template !== 'string') return '';
  return template
    .replace(/\{\{\s*(?:student_name|name)\s*\}\}/gi, student.name || 'Student')
    .replace(/\{\{\s*(?:batch_name|batch|class_name)\s*\}\}/gi, student.class_name || student.batch_name || 'Academic Batch')
    .replace(/\{\{\s*(?:pending_dues|dues|amount)\s*\}\}/gi, formatINR(student.pending_balance ?? student.pending_fee ?? 0))
    .replace(/\{\{\s*(?:roll_no|roll)\s*\}\}/gi, student.roll_no || student.student_id || '')
    .replace(/\{\{\s*(?:student_id|id)\s*\}\}/gi, student.student_id || '')
    .replace(/\{\{\s*due_date\s*\}\}/gi, '5th of this month')
    .replace(/\{\{\s*receipt_no\s*\}\}/gi, student.receipt_no || '');
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  let session = null;
  const cronHeader = req.headers.authorization || '';
  const cronSecret = process.env.CRON_SECRET;
  const isCron = Boolean(cronSecret && (cronHeader === `Bearer ${cronSecret}` || req.headers['x-cron-secret'] === cronSecret));

  if (!isCron) {
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
        .limit(10);

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

  const body = req.body || {};
  const rawTitle = stripTags(body.title || 'Pragyan Institute Update').slice(0, 100);
  const rawBody = stripTags(body.body || '').slice(0, 300);
  if (!rawBody) {
    return res.status(400).json({ success: false, error: 'Notification message body is required' });
  }

  const target = typeof body.target === 'object' && body.target !== null ? body.target : { type: 'ALL' };
  const targetType = ['ALL', 'BATCHES', 'STUDENT', 'DUES'].includes(target.type) ? target.type : 'ALL';
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
    publicKey: process.env.VAPID_PUBLIC_KEY || DEFAULT_VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY || DEFAULT_VAPID_PRIVATE_KEY
  };
  const vapidSubject = process.env.VAPID_SUBJECT || DEFAULT_VAPID_SUBJECT;

  try {
    let subsQuery = supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh_key, auth_key, student_id, batch_id, device_os, browser');

    if (targetType === 'STUDENT' && Array.isArray(target.students) && target.students.length > 0) {
      subsQuery = subsQuery.in('student_id', target.students);
    } else if (targetType === 'BATCHES' && Array.isArray(target.batches) && target.batches.length > 0) {
      subsQuery = subsQuery.in('batch_id', target.batches);
    }

    const { data: subscriptions, error: subErr } = await subsQuery;
    if (subErr) throw subErr;

    if (!subscriptions || subscriptions.length === 0) {
      // Record attempt in broadcast logs even if 0 audience
      const senderName = session?.username || (isCron ? 'SYSTEM (CRON)' : 'CHANDAN KUMAR');
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
      const { data: students } = await supabase
        .from('students')
        .select('*');
      if (students) {
        for (const s of students) {
          s.pending_balance = Number(s.pending_fee ?? s.pending_fees ?? 0);
          if (s.student_id) studentMap.set(s.student_id, s);
          if (s.id) studentMap.set(s.id, s);
          if (s.roll_no) studentMap.set(s.roll_no, s);
        }
      }
    }

    let targetSubs = subscriptions;
    if (targetType === 'DUES') {
      targetSubs = subscriptions.filter(s => {
        const stud = studentMap.get(s.student_id);
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
        const studentInfo = studentMap.get(sub.student_id) || {};
        const title = interpolate(rawTitle, studentInfo);
        const messageBody = interpolate(rawBody, studentInfo);
        const resolvedActions = actions.map(act => ({
          ...act,
          url: interpolate(act.url, studentInfo)
        }));

        const payloadObj = {
          title,
          body: messageBody,
          icon: '/assets/images/logo.png',
          badge: '/assets/images/logo.png',
          image: image || undefined,
          url: resolvedActions[0]?.url || (sub.student_id ? '/portal.html' : '/'),
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

    const senderName = session?.username || (isCron ? 'SYSTEM (CRON)' : 'CHANDAN KUMAR');
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
