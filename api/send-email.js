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
  normaliseCategory,
  dispatchWithQuota,
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
  if (typeof raw === 'string' && raw.trim()) {
    return normaliseCategory(raw);
  }
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
    .replace(/\{{1,2}\s*(?:student_name|studentName|name|student)\s*\}{1,2}/gi, studentName)
    .replace(/\{{1,2}\s*(?:batch_name|batchName|class_name|className|batch|class|course)\s*\}{1,2}/gi, className)
    .replace(/\{{1,2}\s*(?:pending_dues|pendingDues|dues|pending_fee|pendingFee|pending_fees|amount|fee|fees|balance)\s*\}{1,2}/gi, dues)
    .replace(/\{{1,2}\s*(?:roll_no|rollNo|roll_number|rollNumber|roll)\s*\}{1,2}/gi, rollNo)
    .replace(/\{{1,2}\s*(?:student_id|studentId|id|admission_no|reg_no)\s*\}{1,2}/gi, studentId)
    .replace(/\{{1,2}\s*(?:guardian_name|guardianName|parent_name|parentName|father_name|fatherName)\s*\}{1,2}/gi, guardianName || 'Parent/Guardian')
    .replace(/\{{1,2}\s*(?:mobile|phone|contact)\s*\}{1,2}/gi, mobile)
    .replace(/\{{1,2}\s*due_date\s*\}{1,2}/gi, dueDate)
    .replace(/\{{1,2}\s*(?:date|today)\s*\}{1,2}/gi, todayFormatted)
    .replace(/\{{1,2}\s*month\s*\}{1,2}/gi, monthFormatted)
    .replace(/\{{1,2}\s*(?:institute_name|instituteName|institute)\s*\}{1,2}/gi, instituteName)
    .replace(/\{{1,2}\s*(?:receipt_no|receiptNo)\s*\}{1,2}/gi, receiptNo);
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

  // Support GET request for active push stats (subscribers count, recent log)
  if (req.method === 'GET') {
    try {
      const { count: subsCount } = await supabase
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

  let body = req.body || {};
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }
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

    let targetSubs = subscriptions;
    if (targetType === 'DUES') {
      targetSubs = subscriptions.filter(s => {
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

  const { to, subject, html, text, student_id, ledger_id, reference, dedupeKey, category: rawCat } = req.body || {};

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
  const refKey = reference || (targetStudent ? `STUDENT-${targetStudent}` : null);

  const apiKey = process.env.RESEND_API_KEY;
  if (!isValidResendApiKey(apiKey)) {
    return res.status(503).json({ success: false, error: 'Email delivery service is not configured' });
  }

  const fromAddress = process.env.RESEND_FROM_EMAIL || DEFAULT_FROM;
  if (!isVerifiedSenderDomain(fromAddress)) {
    return res.status(500).json({ success: false, error: 'Sender address must be from pragyaninstitute.com' });
  }

  const supabase = getSupabase();

  // --- Single Recipient Fast Path ---
  if (cleanTo.length === 1) {
    const targetEmail = cleanTo[0];
    const dedupeKeys = dedupeKey ? [String(dedupeKey)] : null;

    let reservation = null;
    try {
      reservation = await reserveQuota({
        category,
        recipients: cleanTo,
        reference: refKey,
        dedupeKeys
      });
    } catch (err) {
      if (err instanceof EmailQuotaUnavailableError) {
        return res.status(503).json({ success: false, error: 'Quota service unavailable: ' + err.message });
      }
      return res.status(500).json({ success: false, error: 'Quota reservation failed: ' + err.message });
    }

    if (!reservation || !Array.isArray(reservation.granted) || reservation.granted.length === 0) {
      if (Array.isArray(reservation?.duplicate) && reservation.duplicate.length > 0) {
        return res.status(200).json({
          success: true,
          duplicate: true,
          message: 'Email already dispatched today (duplicate suppressed to preserve quota)',
          recipient: targetEmail,
          quota: {
            limit: reservation?.limit ?? DAILY_EMAIL_LIMIT,
            used: reservation?.used_before ?? 0,
            remaining: reservation?.remaining_after ?? 0,
            day: reservation?.day ?? null
          }
        });
      }
      return res.status(429).json({
        success: false,
        error: 'Daily email quota exhausted (100/day limit reached). Quota resets at midnight IST.',
        quota: {
          limit: reservation?.limit ?? DAILY_EMAIL_LIMIT,
          used: reservation?.used_before ?? 0,
          remaining: reservation?.remaining_after ?? 0,
          day: reservation?.day ?? null
        }
      });
    }

    const dispatchId = reservation.granted[0]?.dispatch_id;
    const dispatchIds = Number.isFinite(Number(dispatchId)) ? [Number(dispatchId)] : [];

    let sendResult = null;
    let finalStatus = 'failed';
    try {
      sendResult = await sendEmailViaResend({
        apiKey,
        from: fromAddress,
        to: [targetEmail],
        subject: subject.trim(),
        html: html || undefined,
        text: text || undefined,
        headers: refKey ? { 'X-Entity-Ref-ID': refKey } : undefined
      });
      finalStatus = statusForSendResult(sendResult);
    } catch (err) {
      sendResult = { success: false, error: { message: err.message } };
      finalStatus = 'failed';
    }

    try {
      if (dispatchIds.length) {
        await settleQuota(dispatchIds, finalStatus, {
          messageId: sendResult?.data?.id || null,
          error: sendResult?.success ? null : extractResendErrorMessage(sendResult?.error)
        });
      }
    } catch (settleErr) {
      console.error('Failed to settle email dispatch quota:', settleErr.message);
    }

    // Update fee_billing_ledger if ledger_id was provided
    if (ledger_id && supabase) {
      try {
        await supabase.rpc('settle_ledger_email', {
          p_ledger_id: ledger_id,
          p_success: Boolean(sendResult?.success),
          p_message_id: sendResult?.data?.id || null,
          p_error: sendResult?.success ? null : extractResendErrorMessage(sendResult?.error).slice(0, 500)
        });
      } catch (ledgerErr) {
        console.warn('[send-email] settle_ledger_email note:', ledgerErr.message);
      }
    }

    // Write audit log entry
    if (supabase) {
      try {
        const actorName = session.name || session.username || (session.role === 'admin' ? 'Chandan Kumar' : 'Student');
        await supabase.from('audit_logs').insert([{
          log_id: `AUD-EMAIL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          action_type: category === EMAIL_CATEGORIES.BILLING ? 'EMAIL_INVOICE_SENT' : (category === EMAIL_CATEGORIES.REMINDER ? 'EMAIL_REMINDER_SENT' : 'EMAIL_DISPATCHED'),
          actor_name: actorName,
          actor: actorName,
          target: targetStudent || targetEmail,
          student_name: targetStudent ? `Student (${targetStudent})` : targetEmail,
          student_roll: targetStudent || 'N/A',
          description: `Email "${subject.trim().slice(0, 60)}" to ${targetEmail} [${finalStatus}]`,
          details: {
            recipient: targetEmail,
            subject: subject.trim().slice(0, 150),
            category,
            dispatchId: dispatchIds[0] || null,
            messageId: sendResult?.data?.id || null,
            status: finalStatus,
            error: sendResult?.success ? null : extractResendErrorMessage(sendResult?.error)
          }
        }]);
      } catch (audErr) {
        console.warn('[send-email] audit log write note:', audErr.message);
      }
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

  // --- Multi-Recipient Batch Path (Via dispatchWithQuota) ---
  const batchItems = cleanTo.map(email => ({ email }));
  let outcome = null;
  try {
    outcome = await dispatchWithQuota({
      items: batchItems,
      category,
      getEmail: item => item.email,
      reference: refKey || 'BATCH-CAMPAIGN',
      send: async (item) => {
        const result = await sendEmailViaResend({
          apiKey,
          from: fromAddress,
          to: [item.email],
          subject: subject.trim(),
          html: html || undefined,
          text: text || undefined,
          headers: refKey ? { 'X-Entity-Ref-ID': `${refKey}-${item.email}` } : undefined
        });
        return {
          result,
          error: result?.success ? null : extractResendErrorMessage(result?.error),
          report: { email: item.email, category }
        };
      }
    });
  } catch (batchErr) {
    return res.status(500).json({ success: false, error: 'Batch dispatch failed: ' + batchErr.message });
  }

  const sentCount = outcome.results.filter(r => r.status === 'sent').length;
  const failedCount = outcome.results.filter(r => r.status === 'failed' || r.status === 'unknown').length;

  if (supabase) {
    try {
      const actorName = session.name || session.username || 'Chandan Kumar';
      await supabase.from('audit_logs').insert([{
        log_id: `AUD-CAMPAIGN-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        action_type: 'MASS_EMAIL_CAMPAIGN',
        actor_name: actorName,
        actor: actorName,
        target: `${cleanTo.length} recipients`,
        student_name: 'Mass Campaign',
        student_roll: 'N/A',
        description: `Dispatched "${subject.trim().slice(0, 60)}" to ${sentCount}/${cleanTo.length} recipients (${failedCount} failed)`,
        details: {
          category,
          total: cleanTo.length,
          sentCount,
          failedCount,
          deferred: outcome.deferred,
          quotaError: outcome.quotaError || null
        }
      }]);
    } catch (audErr) {
      console.warn('[send-email] batch audit log note:', audErr.message);
    }
  }

  return res.status(200).json({
    success: sentCount > 0,
    total: cleanTo.length,
    sentCount,
    failedCount,
    deferred: outcome.deferred,
    quotaError: outcome.quotaError || null,
    results: outcome.results
  });
}
