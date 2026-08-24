import { getSupabase, requireSession, applyCors, isSupabaseConfigured } from './_lib/auth.js';
import {
  sendEmailViaResend,
  extractResendErrorMessage,
  isValidResendApiKey,
  isVerifiedSenderDomain,
  DEFAULT_FROM,
  EMAIL_PATTERN
} from './_lib/resend-sender.js';
import {
  reserveQuota,
  settleQuota,
  statusForSendResult,
  getQuotaStatus,
  EMAIL_CATEGORIES,
  DAILY_EMAIL_LIMIT,
  EmailQuotaUnavailableError
} from './_lib/email-quota.js';
import { pushToSubscription } from './_lib/webpush.js';

const MAX_BODY_LENGTH = 1024 * 1024;

const CRITICAL_CATEGORIES = new Set([
  EMAIL_CATEGORIES.BILLING,
  EMAIL_CATEGORIES.RECEIPT,
  EMAIL_CATEGORIES.REMINDER
]);

function resolveCategory(raw, role) {
  if (typeof raw === 'string' && Object.values(EMAIL_CATEGORIES).includes(raw)) return raw;
  return role === 'student' ? EMAIL_CATEGORIES.RECEIPT : EMAIL_CATEGORIES.ADMIN;
}

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
    .replace(/\{\{\s*(?:batch_name|batch|class_name)\s*\}\}/gi, student.class_name || 'Academic Batch')
    .replace(/\{\{\s*(?:pending_dues|dues|amount)\s*\}\}/gi, formatINR(student.pending_balance))
    .replace(/\{\{\s*(?:roll_no|roll)\s*\}\}/gi, student.roll_no || student.student_id || '')
    .replace(/\{\{\s*(?:student_id|id)\s*\}\}/gi, student.student_id || '')
    .replace(/\{\{\s*due_date\s*\}\}/gi, '5th of this month')
    .replace(/\{\{\s*receipt_no\s*\}\}/gi, student.receipt_no || '');
}

/**
 * Handle Push Broadcast Notifications
 */
async function handlePushBroadcast(req, res) {
  let session = null;
  const cronHeader = req.headers.authorization || '';
  const cronSecret = process.env.CRON_SECRET;
  const isCron = cronSecret && (cronHeader === `Bearer ${cronSecret}` || req.headers['x-cron-secret'] === cronSecret);

  if (!isCron) {
    session = requireSession(req, res, ['admin']);
    if (!session) return;
  }

  const supabase = getSupabase();
  if (!supabase) {
    return res.status(503).json({ success: false, error: 'Database service unavailable' });
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
      .select('endpoint, p256dh_key, auth_key, student_id, batch_id');

    if (targetType === 'STUDENT' && Array.isArray(target.students) && target.students.length > 0) {
      subsQuery = subsQuery.in('student_id', target.students);
    } else if (targetType === 'BATCHES' && Array.isArray(target.batches) && target.batches.length > 0) {
      subsQuery = subsQuery.in('batch_id', target.batches);
    }

    const { data: subscriptions, error: subErr } = await subsQuery;
    if (subErr) throw subErr;

    if (!subscriptions || subscriptions.length === 0) {
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
        .select('student_id, name, class_name, pending_balance, roll_no')
        .in('student_id', studentIds);
      if (students) {
        for (const s of students) studentMap.set(s.student_id, s);
      }
    }

    let targetSubs = subscriptions;
    if (targetType === 'DUES') {
      targetSubs = subscriptions.filter(s => {
        const stud = studentMap.get(s.student_id);
        return stud && Number(stud.pending_balance || 0) > 0;
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
        .in('endpoint', deadEndpoints);
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
      payload_meta: { priority, ttlHours, hasImage: !!image, actionsCount: actions.length }
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

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  // Route Push Notifications
  if (req.url && (req.url.includes('send-push') || req.url.includes('push')) || (req.body && req.body.channel === 'push')) {
    return handlePushBroadcast(req, res);
  }

  // GET /api/email-quota or GET /api/send-email: Live quota lookup for admin
  if (req.method === 'GET' || (req.url && req.url.includes('email-quota'))) {
    const session = requireSession(req, res, ['admin']);
    if (!session) return;

    try {
      const quota = await getQuotaStatus();
      return res.status(200).json({
        success: true,
        quota: {
          limit: quota?.limit ?? DAILY_EMAIL_LIMIT,
          used: quota?.used ?? 0,
          remaining: quota?.remaining ?? 0,
          day: quota?.day ?? null,
          breakdown: quota?.breakdown ?? {},
          // Aliases for compatibility
          daily_limit: quota?.limit ?? DAILY_EMAIL_LIMIT,
          sent: quota?.used ?? 0,
          canSend: (quota?.remaining ?? 0) > 0
        }
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message || 'Failed to read email quota' });
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Allow either push broadcast or email send based on payload
  if (req.body && (req.body.actions || (req.body.title && req.body.body && !req.body.to))) {
    return handlePushBroadcast(req, res);
  }

  const session = requireSession(req, res, ['admin', 'student']);
  if (!session) return;

  const { to, subject, html, text, student_id, category: rawCat } = req.body || {};

  const toList = Array.isArray(to) ? to : (typeof to === 'string' ? [to] : []);
  const cleanTo = toList.map(e => String(e || '').trim()).filter(e => EMAIL_PATTERN.test(e));

  if (!cleanTo.length) {
    return res.status(400).json({ success: false, error: 'Valid recipient email (to) is required' });
  }
  if (!subject || typeof subject !== 'string' || !subject.trim()) {
    return res.status(400).json({ success: false, error: 'Email subject is required' });
  }
  if (!html && !text) {
    return res.status(400).json({ success: false, error: 'Email body (html or text) is required' });
  }

  const bodySize = (html ? Buffer.byteLength(html, 'utf8') : 0) + (text ? Buffer.byteLength(text, 'utf8') : 0);
  if (bodySize > MAX_BODY_LENGTH) {
    return res.status(413).json({ success: false, error: 'Email body exceeds 1MB limit' });
  }

  const category = resolveCategory(rawCat, session.role);
  const targetStudent = session.role === 'student' ? session.sub : (student_id || null);

  const apiKey = process.env.RESEND_API_KEY;
  if (!isValidResendApiKey(apiKey)) {
    return res.status(503).json({ success: false, error: 'Email delivery service is not configured' });
  }

  const fromAddress = process.env.RESEND_FROM_EMAIL || DEFAULT_FROM;
  if (!isVerifiedSenderDomain(fromAddress)) {
    return res.status(500).json({ success: false, error: 'Sender address must be from pragyaninstitute.com' });
  }

  let reservation = null;
  try {
    reservation = await reserveQuota({
      category,
      recipients: cleanTo,
      reference: targetStudent ? `STUDENT-${targetStudent}` : null
    });
  } catch (err) {
    if (err instanceof EmailQuotaUnavailableError) {
      return res.status(503).json({ success: false, error: 'Quota service unavailable: ' + err.message });
    }
    return res.status(500).json({ success: false, error: 'Quota reservation failed: ' + err.message });
  }

  if (!reservation || !Array.isArray(reservation.granted) || reservation.granted.length === 0) {
    return res.status(429).json({
      success: false,
      error: 'Daily email quota exhausted (100/day limit reached)',
      quota: {
        limit: reservation?.limit ?? DAILY_EMAIL_LIMIT,
        used: reservation?.used_before ?? 0,
        remaining: reservation?.remaining_after ?? 0,
        day: reservation?.day ?? null
      }
    });
  }

  const grantedRecipients = reservation.granted.map(g => g.recipient);
  const dispatchIds = reservation.granted.map(g => g.dispatch_id).filter(id => Number.isFinite(Number(id)));
  const targetEmail = grantedRecipients[0];
  let sendResult = null;
  let finalStatus = 'failed';
  try {
    sendResult = await sendEmailViaResend({
      apiKey,
      from: fromAddress,
      to: [targetEmail],
      subject: subject.trim(),
      html: html || undefined,
      text: text || undefined
    });
    finalStatus = statusForSendResult(sendResult);
  } catch (err) {
    sendResult = { success: false, error: { message: err.message } };
    finalStatus = 'failed';
  }

  try {
    await settleQuota(dispatchIds, finalStatus, {
      messageId: sendResult?.data?.id || null,
      error: sendResult?.success ? null : extractResendErrorMessage(sendResult?.error)
    });
  } catch (settleErr) {
    console.error('Failed to settle email dispatch quota:', settleErr.message);
  }

  if (!sendResult?.success) {
    return res.status(502).json({
      success: false,
      error: `Email delivery failed: ${extractResendErrorMessage(sendResult?.error)}`,
      dispatchId: dispatchIds[0] || null,
      dispatchIds
    });
  }

  return res.status(200).json({
    success: true,
    messageId: sendResult?.data?.id || null,
    dispatchId: dispatchIds[0] || null,
    dispatchIds
  });
}
