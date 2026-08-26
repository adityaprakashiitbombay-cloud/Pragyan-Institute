import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { StreamChat } from 'stream-chat';
import { getSupabase, requireSession, optionalSession, applyCors } from './_lib/auth.js';
import { BATCHES } from './_lib/academic-config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function packageVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    return pkg.version || 'unknown';
  } catch (_) {
    return 'unknown';
  }
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  // Stream token generator sub-route
  const isStreamToken = (req.url && (req.url.includes('stream-token') || req.url.includes('action=stream-token') || req.url.includes('route=stream-token'))) ||
    req.query?.action === 'stream-token' ||
    req.query?.route === 'stream-token' ||
    (req.headers['x-matched-path'] && req.headers['x-matched-path'].includes('stream-token')) ||
    (req.headers['x-vercel-matched-path'] && req.headers['x-vercel-matched-path'].includes('stream-token'));

  if (isStreamToken) {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    const session = requireSession(req, res, ['student', 'admin']);
    if (!session) return;

    const apiKey = process.env.STREAM_API_KEY || 'w9gs6k2jh9wg';
    const apiSecret = process.env.STREAM_API_SECRET || '76mehp9ua5k2dr65g2na5p52gr34a3thzgkjncbd56u7arvggdhgpnnpc4df4c7s';
    if (!apiKey || !apiSecret) {
      return res.status(503).json({ success: false, error: 'Stream Chat service is not configured on server' });
    }

    const isAdmin = session.role === 'admin';
    const prefix = isAdmin ? 'admin' : 'student';
    const rawId = (isAdmin ? (session.username || session.sub) : (session.student_id || session.sub || session.roll)) || 'unknown';
    const userId = `${prefix}_${String(rawId).toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const userName = session.name || (isAdmin ? 'Chandan Kumar' : 'Student');
    const userRole = isAdmin ? 'admin' : 'user';

    try {
      const serverClient = StreamChat.getInstance(apiKey, apiSecret);
      
      let userAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=064E3B&color=fff`;

      // Persist / synchronize stream_user_id in Supabase Postgres & fetch profile photo if available
      try {
        const supabase = getSupabase();
        if (supabase) {
          if (isAdmin) {
            const adminUser = session.username || 'chandan';
            supabase.from('admins').update({ stream_user_id: userId }).ilike('username', adminUser).then(() => {}).catch(() => {});
          } else {
            const sid = session.student_id || session.sub || session.roll;
            if (sid) {
              supabase.from('students').update({ stream_user_id: userId }).or(`student_id.eq.${sid},id.eq.${sid}`).then(() => {}).catch(() => {});
              // Fetch photo url if available
              const { data: stuRows } = await supabase.from('students').select('photo_url').or(`student_id.eq.${sid},id.eq.${sid}`).limit(1);
              if (stuRows && stuRows[0] && stuRows[0].photo_url) {
                userAvatar = stuRows[0].photo_url;
              }
            }
          }
        }
      } catch (dbErr) {
        console.warn('[health/stream-token] DB stream_user_id sync note:', dbErr.message);
      }

      try {
        await serverClient.upsertUser({
          id: userId,
          name: userName,
          role: userRole,
          image: userAvatar,
        });
      } catch (upsertErr) {
        console.warn('[health/stream-token] upsertUser fallback note:', upsertErr.message);
        try {
          await serverClient.partialUpdateUser({
            id: userId,
            set: { role: userRole, name: userName, image: userAvatar }
          });
        } catch (_) {}
      }

      // Pre-seed canonical batch channels with admin ownership so students can join without 403
      (async () => {
        try {
          const canonicalBatches = Array.isArray(BATCHES) ? BATCHES : [];
          for (const b of canonicalBatches) {
            const chId = `batch-${b.batchId}`;
            const channel = serverClient.channel('livestream', chId, {
              name: b.name || b.batchId,
              created_by_id: 'admin_chandan'
            });
            await channel.create().catch(() => {});
          }
        } catch (_) {}
      })();

      const CHAT_TOKEN_TTL_SECONDS = 24 * 60 * 60;
      const exp = Math.floor(Date.now() / 1000) + CHAT_TOKEN_TTL_SECONDS;
      const token = serverClient.createToken(userId, exp);

      return res.status(200).json({
        success: true,
        apiKey,
        userId,
        userName,
        userRole,
        token,
        exp,
        expiresAt: new Date(exp * 1000).toISOString()
      });
    } catch (err) {
      console.error('[health/stream-token] Token generation error:', err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // Stream channel purge / clear sub-route (Admin Only)
  const isStreamClear = (req.url && (req.url.includes('stream-clear') || req.url.includes('action=stream-clear') || req.url.includes('route=stream-clear'))) ||
    req.query?.action === 'stream-clear' ||
    req.query?.route === 'stream-clear' ||
    (req.headers['x-matched-path'] && req.headers['x-matched-path'].includes('stream-clear')) ||
    (req.headers['x-vercel-matched-path'] && req.headers['x-vercel-matched-path'].includes('stream-clear'));

  if (isStreamClear) {
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    const session = requireSession(req, res, ['admin']);
    if (!session) return;

    const apiKey = process.env.STREAM_API_KEY || 'w9gs6k2jh9wg';
    const apiSecret = process.env.STREAM_API_SECRET || '76mehp9ua5k2dr65g2na5p52gr34a3thzgkjncbd56u7arvggdhgpnnpc4df4c7s';
    if (!apiKey || !apiSecret) {
      return res.status(503).json({ success: false, error: 'Stream Chat service is not configured on server' });
    }

    const { channelId, channelType = 'livestream', hardDelete = true } = req.body || {};
    if (!channelId) {
      return res.status(400).json({ success: false, error: 'channelId is required' });
    }

    try {
      const serverClient = StreamChat.getInstance(apiKey, apiSecret);
      const channel = serverClient.channel(channelType, channelId);

      const adminName = session.name || 'Chandan Kumar';
      const adminId = `admin_${String(session.username || 'chandan').toLowerCase()}`;

      // Truncate the channel history on Stream cloud
      await channel.truncate({
        hard_delete: hardDelete,
        message: {
          text: `🧹 Group chat history was cleared by Administrator (${adminName}).`,
          user: {
            id: adminId,
            name: adminName,
            role: 'admin'
          }
        }
      });

      return res.status(200).json({
        success: true,
        message: `Group chat ${channelId} successfully cleared.`
      });
    } catch (err) {
      console.error('[health/stream-clear] Channel clear error:', err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // Stream message pin/unpin sub-route (Admin Only)
  const isStreamPin = (req.url && (req.url.includes('stream-pin') || req.url.includes('action=stream-pin') || req.url.includes('route=stream-pin'))) ||
    req.query?.action === 'stream-pin' ||
    req.query?.route === 'stream-pin' ||
    (req.headers['x-matched-path'] && req.headers['x-matched-path'].includes('stream-pin')) ||
    (req.headers['x-vercel-matched-path'] && req.headers['x-vercel-matched-path'].includes('stream-pin'));

  if (isStreamPin) {
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    const session = requireSession(req, res, ['admin']);
    if (!session) return;

    const apiKey = process.env.STREAM_API_KEY || 'w9gs6k2jh9wg';
    const apiSecret = process.env.STREAM_API_SECRET || '76mehp9ua5k2dr65g2na5p52gr34a3thzgkjncbd56u7arvggdhgpnnpc4df4c7s';
    if (!apiKey || !apiSecret) {
      return res.status(503).json({ success: false, error: 'Stream Chat service is not configured on server' });
    }

    const { messageId, pin = true } = req.body || {};
    if (!messageId) {
      return res.status(400).json({ success: false, error: 'messageId is required' });
    }

    try {
      const serverClient = StreamChat.getInstance(apiKey, apiSecret);
      const adminId = `admin_${String(session.username || 'chandan').toLowerCase()}`;

      if (pin) {
        try {
          await serverClient.pinMessage(messageId, { user_id: adminId });
        } catch (_) {
          try { await serverClient.pinMessage({ id: messageId }); } catch (_) {}
        }
      } else {
        try {
          await serverClient.unpinMessage(messageId);
        } catch (_) {
          try { await serverClient.unpinMessage({ id: messageId }); } catch (_) {}
        }
      }

      // Always execute partialUpdateMessage to trigger real-time message.updated WebSocket event to all watching students
      await serverClient.partialUpdateMessage(messageId, {
        set: {
          pinned: Boolean(pin),
          is_pinned: Boolean(pin),
          pinned_at: pin ? new Date().toISOString() : null,
          pinned_by: pin ? (session.name || 'Admin') : null
        }
      });

      return res.status(200).json({
        success: true,
        pinned: Boolean(pin),
        message: `Message ${messageId} successfully ${pin ? 'pinned' : 'unpinned'}.`
      });
    } catch (err) {
      console.warn('[health/stream-pin] error:', err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // Stream message delete sub-route (Admin Only)
  const isStreamDelete = (req.url && (req.url.includes('stream-delete') || req.url.includes('action=stream-delete') || req.url.includes('route=stream-delete'))) ||
    req.query?.action === 'stream-delete' ||
    req.query?.route === 'stream-delete' ||
    (req.headers['x-matched-path'] && req.headers['x-matched-path'].includes('stream-delete')) ||
    (req.headers['x-vercel-matched-path'] && req.headers['x-vercel-matched-path'].includes('stream-delete'));

  if (isStreamDelete) {
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    const session = requireSession(req, res, ['admin']);
    if (!session) return;

    const apiKey = process.env.STREAM_API_KEY || 'w9gs6k2jh9wg';
    const apiSecret = process.env.STREAM_API_SECRET || '76mehp9ua5k2dr65g2na5p52gr34a3thzgkjncbd56u7arvggdhgpnnpc4df4c7s';
    if (!apiKey || !apiSecret) {
      return res.status(503).json({ success: false, error: 'Stream Chat service is not configured on server' });
    }

    const { messageId } = req.body || {};
    if (!messageId) {
      return res.status(400).json({ success: false, error: 'messageId is required' });
    }

    try {
      const serverClient = StreamChat.getInstance(apiKey, apiSecret);
      try {
        await serverClient.deleteMessage(messageId, { hard: true });
      } catch (delErr) {
        try {
          await serverClient.deleteMessage(messageId, true);
        } catch (delErr2) {
          const errMsg = String(delErr2?.message || delErr?.message || '');
          const errCode = delErr2?.code || delErr?.code || delErr2?.status || delErr?.status;
          if (errCode !== 16 && errCode !== 404 && !/doesn't exist|not found/i.test(errMsg)) {
            throw delErr2;
          }
        }
      }
      return res.status(200).json({
        success: true,
        message: `Message ${messageId} deleted.`
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // Stream mute/unmute student sub-route (Admin Only)
  const isStreamMute = (req.url && (req.url.includes('stream-mute') || req.url.includes('action=stream-mute') || req.url.includes('route=stream-mute'))) ||
    req.query?.action === 'stream-mute' ||
    req.query?.route === 'stream-mute' ||
    (req.headers['x-matched-path'] && req.headers['x-matched-path'].includes('stream-mute')) ||
    (req.headers['x-vercel-matched-path'] && req.headers['x-vercel-matched-path'].includes('stream-mute'));

  const isStreamUnmute = (req.url && (req.url.includes('stream-unmute') || req.url.includes('action=stream-unmute') || req.url.includes('route=stream-unmute'))) ||
    req.query?.action === 'stream-unmute' ||
    req.query?.route === 'stream-unmute' ||
    (req.headers['x-matched-path'] && req.headers['x-matched-path'].includes('stream-unmute')) ||
    (req.headers['x-vercel-matched-path'] && req.headers['x-vercel-matched-path'].includes('stream-unmute'));

  if (isStreamMute || isStreamUnmute) {
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    const session = requireSession(req, res, ['admin']);
    if (!session) return;

    const apiKey = process.env.STREAM_API_KEY || 'w9gs6k2jh9wg';
    const apiSecret = process.env.STREAM_API_SECRET || '76mehp9ua5k2dr65g2na5p52gr34a3thzgkjncbd56u7arvggdhgpnnpc4df4c7s';
    if (!apiKey || !apiSecret) {
      return res.status(503).json({ success: false, error: 'Stream Chat service is not configured on server' });
    }

    const { studentId, channelId = 'batch-BAT-10', channelType = 'livestream', studentName = '' } = req.body || {};
    if (!studentId) {
      return res.status(400).json({ success: false, error: 'studentId is required' });
    }

    const shouldMute = isStreamMute;

    try {
      const serverClient = StreamChat.getInstance(apiKey, apiSecret);
      const ch = serverClient.channel(channelType, channelId);

      // Normalize target user ID
      const targetUserId = studentId.startsWith('student_') ? studentId : `student_${String(studentId).toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '')}`;

      const adminName = session.name || 'Chandan Kumar';
      const adminId = `admin_${String(session.username || 'chandan').toLowerCase()}`;

      // 1. Channel-level ban/unban on Stream Chat
      if (shouldMute) {
        try {
          await ch.banUser(targetUserId, { reason: 'Muted by teacher', user_id: adminId });
        } catch (_) {
          try { await serverClient.banUser(targetUserId, { reason: 'Muted by teacher', banned_by_id: adminId }); } catch (_) {}
        }
      } else {
        try {
          await ch.unbanUser(targetUserId);
        } catch (_) {
          try { await serverClient.unbanUser(targetUserId); } catch (_) {}
        }
      }

      // 2. Fetch current channel state and update muted_users array
      try {
        const queryRes = await ch.query().catch(() => null);
        let currentMuted = Array.isArray(queryRes?.channel?.muted_users) ? queryRes.channel.muted_users : [];
        if (shouldMute) {
          if (!currentMuted.includes(targetUserId)) currentMuted.push(targetUserId);
        } else {
          currentMuted = currentMuted.filter(id => id !== targetUserId);
        }

        await ch.updatePartial({
          set: {
            muted_users: currentMuted,
            muted_user_ids: currentMuted
          }
        }).catch(() => {});
      } catch (_) {}

      // 3. Post system notice in the channel
      try {
        const displayName = studentName ? `@${studentName}` : targetUserId;
        await ch.sendMessage({
          text: shouldMute
            ? `🔇 ${displayName} has been muted by ${adminName}. They cannot send messages until unmuted.`
            : `🔊 ${displayName} has been unmuted by ${adminName}. They can now send messages.`,
          user: { id: adminId, name: adminName, role: 'admin' },
          is_system_notice: true
        }).catch(() => {});
      } catch (_) {}

      return res.status(200).json({
        success: true,
        muted: Boolean(shouldMute),
        studentId: targetUserId,
        channelId,
        message: `Student ${targetUserId} has been successfully ${shouldMute ? 'muted' : 'unmuted'}.`
      });
    } catch (err) {
      console.error('[health/stream-mute] error:', err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // Stream file/image upload sub-route (Admin Only, Up to 20MB)
  const isStreamUpload = (req.url && (req.url.includes('stream-upload') || req.url.includes('action=stream-upload') || req.url.includes('route=stream-upload'))) ||
    req.query?.action === 'stream-upload' ||
    req.query?.route === 'stream-upload' ||
    (req.headers['x-matched-path'] && req.headers['x-matched-path'].includes('stream-upload')) ||
    (req.headers['x-vercel-matched-path'] && req.headers['x-vercel-matched-path'].includes('stream-upload'));

  if (isStreamUpload) {
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    const session = requireSession(req, res, ['admin']);
    if (!session) return;

    const { channelId, channelType = 'livestream', fileName, fileType, fileBase64, fileSize } = req.body || {};
    if (!fileBase64 || !fileName) {
      return res.status(400).json({ success: false, error: 'fileName and fileBase64 are required' });
    }

    const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB limit
    if (fileSize && fileSize > MAX_SIZE_BYTES) {
      return res.status(400).json({ success: false, error: 'File size exceeds maximum allowed limit of 20 MB' });
    }

    try {
      const apiKey = process.env.STREAM_API_KEY || 'w9gs6k2jh9wg';
      const apiSecret = process.env.STREAM_API_SECRET || '76mehp9ua5k2dr65g2na5p52gr34a3thzgkjncbd56u7arvggdhgpnnpc4df4c7s';
      const serverClient = StreamChat.getInstance(apiKey, apiSecret);
      const ch = serverClient.channel(channelType, channelId || 'batch-BAT-10');

      const buffer = Buffer.from(fileBase64.replace(/^data:[^;]+;base64,/, ''), 'base64');
      if (buffer.length > MAX_SIZE_BYTES) {
        return res.status(400).json({ success: false, error: 'File size exceeds maximum allowed limit of 20 MB' });
      }

      const isImage = (fileType && fileType.startsWith('image/')) || /\.(png|jpe?g|webp|gif)$/i.test(fileName);
      let fileUrl = '';

      if (isImage && typeof ch.sendImage === 'function') {
        const upRes = await ch.sendImage(buffer, fileName, fileType || 'image/jpeg').catch(() => null);
        fileUrl = upRes?.file || upRes?.url || '';
      } else if (typeof ch.sendFile === 'function') {
        const upRes = await ch.sendFile(buffer, fileName, fileType || 'application/pdf').catch(() => null);
        fileUrl = upRes?.file || upRes?.url || '';
      }

      // If Stream direct upload wasn't available, upload to Supabase Storage pragyan-media/community_media
      if (!fileUrl) {
        const supabase = getSupabase();
        if (supabase) {
          const safeName = `${Date.now()}_${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
          const path = `community_media/${safeName}`;
          const { data: upData, error: upErr } = await supabase.storage.from('pragyan-media').upload(path, buffer, {
            contentType: fileType || 'application/octet-stream',
            upsert: true
          });
          if (!upErr && upData) {
            const { data: pubUrl } = supabase.storage.from('pragyan-media').getPublicUrl(path);
            fileUrl = pubUrl?.publicUrl || '';
          }
        }
      }

      if (!fileUrl) {
        throw new Error('Unable to store file to Stream media store.');
      }

      return res.status(200).json({
        success: true,
        fileUrl,
        fileName,
        fileType: isImage ? 'image' : 'file',
        fileSize: buffer.length
      });
    } catch (err) {
      console.error('[health/stream-upload] error:', err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // Health check route
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  let dbOnline = false;
  let dbDetail = 'unconfigured';
  let rawError = null;
  try {
    const supabase = getSupabase();
    if (supabase) {
      const { error } = await supabase.from('batches').select('*').limit(1);
      if (error) {
        dbDetail = 'query_error';
        rawError = error.message;
      } else {
        dbDetail = 'connected';
        dbOnline = true;
      }
    }
  } catch (_) {
    dbDetail = 'connection_exception';
  }

  let showDetail = false;
  try {
    const adminSession = optionalSession(req);
    showDetail = Boolean(adminSession && adminSession.role === 'admin');
  } catch (_) {
    showDetail = false;
  }

  const now = new Date();
  const uptimePayload = {
    status: dbOnline ? 'online' : 'degraded',
    database: dbDetail,
    ...(showDetail && rawError ? { databaseError: rawError } : {}),
    timestamp: now.toISOString(),
    service: 'Pragyan Institute Portal Engine',
    location: 'Lalganj, Vaishali, Bihar',
    heartbeat: dbOnline ? 'active' : 'stalled',
    version: packageVersion()
  };

  return res.status(200).json(uptimePayload);
}
