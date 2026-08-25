/* ==========================================================================
 * PRAGYAN INSTITUTE — STREAM CHAT REALTIME COMMUNITY FORUM ENGINE
 * ----------------------------------------------------------------------------
 * Replaces the localStorage-only community chat with GetStream.io's
 * free-tier realtime messaging. Loads the SDK from CDN on demand,
 * connects with a short-lived token minted by /api/stream-token, and
 * renders batch-scoped channels using the canonical academic config.
 *
 * Exposed as window.PragyanStreamChat.init(containerEl) — called by
 * renderCommunityChatTab() in portal.js via the existing initGetStreamChat hook.
 * ========================================================================== */
(function () {
  'use strict';

  let client = null;
  let activeChannel = null;
  let currentUser = null;
  let channelsMap = new Map();
  let activeChannelId = 'institute-all';
  let escFn = null;

  function escapeHtml(s) {
    if (escFn) return escFn(s);
    if (typeof window !== 'undefined' && window.escapeHtml) return window.escapeHtml(s);
    return String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Failed to load Stream Chat SDK'));
      document.head.appendChild(s);
    });
  }

  async function fetchToken() {
    const token = sessionStorage.getItem('pragyan_portal_token') || localStorage.getItem('pragyan_portal_token');
    if (!token) throw new Error('Please sign in to access the community forum.');
    const res = await fetch('/api/stream-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new Error(data.error || `Token endpoint returned ${res.status}`);
    return data;
  }

  function resolveBatchId() {
    try {
      const user = (typeof AppState !== 'undefined' && AppState.currentUser) || {};
      const cn = user.className || user.class_name || '';
      if (window.PRAGYAN_ACADEMIC && typeof window.PRAGYAN_ACADEMIC.resolveBatch === 'function') {
        const batch = window.PRAGYAN_ACADEMIC.resolveBatch(cn);
        if (batch) return batch.batchId;
      }
    } catch (_) {}
    return '';
  }

  async function setupChannels() {
    channelsMap.clear();
    const isAdmin = currentUser.role === 'admin';

    // Institute-wide channel: everyone sees this.
    const allCh = client.channel('team', 'institute-all', {
      name: '🏫 Institute-Wide Community',
      created_by_id: currentUser.id
    });
    await allCh.watch();
    channelsMap.set('institute-all', allCh);

    // Batch-specific channels. Students see only their own; admins see all.
    const myBatch = resolveBatchId();
    const batches = (window.PRAGYAN_ACADEMIC && window.PRAGYAN_ACADEMIC.BATCHES) || [];
    for (const b of batches) {
      if (!isAdmin && b.batchId !== myBatch) continue;
      const chId = `batch-${b.batchId}`;
      if (channelsMap.has(chId)) continue;
      const ch = client.channel('team', chId, {
        name: b.name || b.batchId,
        created_by_id: currentUser.id
      });
      await ch.watch();
      channelsMap.set(chId, ch);
    }

    activeChannel = channelsMap.get(activeChannelId) || allCh;
  }

  function fmtTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  }

  function renderMsgList(messages) {
    if (!messages || !messages.length) {
      return '<div style="text-align:center;color:#64748B;margin:auto;padding:2rem;"><i class="fa-solid fa-comments" style="font-size:2.5rem;color:#CBD5E1;margin-bottom:.75rem;" aria-hidden="true"></i><p style="font-weight:700;margin-bottom:.25rem;">No messages in this channel yet.</p><p style="font-size:.82rem;">Start the conversation!</p></div>';
    }
    return messages.map(m => {
      const isMine = m.user && m.user.id === currentUser.id;
      const isAdminMsg = m.user && (m.user.role === 'admin' || String(m.user.id || '').startsWith('admin_'));
      const avatar = m.user?.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(m.user?.name || 'U')}&background=064E3B&color=fff`;
      const bubbleBg = isMine ? '#064E3B' : (isAdminMsg ? '#FFFBEB' : '#FFFFFF');
      const bubbleColor = isMine ? '#FFFFFF' : '#1E293B';
      const bubbleBorder = isMine ? '#064E3B' : (isAdminMsg ? '#FCD34D' : 'var(--border-sand)');
      return `<div style="display:flex;gap:.65rem;align-items:flex-start;${isMine ? 'flex-direction:row-reverse;' : ''}">
        <img src="${escapeHtml(avatar)}" alt="" style="width:34px;height:34px;border-radius:50%;object-fit:cover;border:1.5px solid ${isAdminMsg ? '#F59E0B' : '#059669'};flex-shrink:0;">
        <div style="max-width:78%;display:flex;flex-direction:column;${isMine ? 'align-items:flex-end;' : 'align-items:flex-start;'}">
          <div style="display:flex;gap:.4rem;align-items:center;font-size:.78rem;margin-bottom:.15rem;">
            <strong style="color:${isAdminMsg ? '#B45309' : 'var(--text-mahogany,#5A2E25)'};">${escapeHtml(m.user?.name || 'User')}</strong>
            ${isAdminMsg ? '<span style="background:#FEF3C7;color:#92400E;border:1px solid #FCD34D;font-size:.7rem;font-weight:800;padding:0 .35rem;border-radius:4px;">Faculty</span>' : ''}
            <span style="color:var(--text-muted,#64748B);">${fmtTime(m.created_at)}</span>
          </div>
          <div style="background:${bubbleBg};color:${bubbleColor};border:1px solid ${bubbleBorder};padding:.6rem .85rem;border-radius:10px;font-size:.88rem;line-height:1.45;word-break:break-word;box-shadow:0 1px 3px rgba(0,0,0,.05);">${escapeHtml(m.text || '')}</div>
          ${currentUser.role === 'admin' ? `<button type="button" data-del-msg="${m.id}" style="background:none;border:none;font-size:.72rem;color:#DC2626;cursor:pointer;padding:0;margin-top:.2rem;" aria-label="Delete message">🗑 Delete</button>` : ''}
        </div>
      </div>`;
    }).join('');
  }

  function renderUI(container) {
    const channelList = Array.from(channelsMap.entries());
    container.innerHTML = `
      <div style="display:flex;flex-direction:column;height:720px;max-height:calc(100vh - 180px);background:#FFF;border-radius:12px;border:1.5px solid var(--border-sand,#DDD5CD);overflow:hidden;">
        <div style="background:#064E3B;color:#FFF;padding:.75rem 1rem;display:flex;align-items:center;justify-content:space-between;gap:.5rem;overflow-x:auto;border-bottom:2px solid #04382B;">
          <div style="display:flex;gap:.5rem;align-items:center;">
            ${channelList.map(([id, ch]) => `<button type="button" class="stream-ch-pill" data-ch-id="${escapeHtml(id)}" style="padding:.4rem .85rem;border-radius:99px;font-size:.82rem;font-weight:700;cursor:pointer;border:1px solid rgba(255,255,255,.25);background:${id === activeChannelId ? '#10B981' : 'rgba(255,255,255,.1)'};color:#FFF;white-space:nowrap;transition:all .2s ease;">${escapeHtml(ch.data?.name || id)}</button>`).join('')}
          </div>
          <div style="font-size:.78rem;color:#A7F3D0;white-space:nowrap;"><span style="width:8px;height:8px;border-radius:50%;background:#34D399;display:inline-block;"></span> ${activeChannel.state?.watcher_count || 1} online</div>
        </div>
        <div id="stream-msg-list" style="flex:1;overflow-y:auto;padding:1.25rem;background:#FAF9F6;display:flex;flex-direction:column;gap:.85rem;">${renderMsgList(activeChannel.state?.messages)}</div>
        <form id="stream-chat-form" style="display:flex;align-items:center;gap:.6rem;padding:.85rem 1rem;background:#FFF;border-top:1.5px solid var(--border-sand,#DDD5CD);">
          <input type="text" id="stream-msg-input" class="portal-input" placeholder="Post in ${escapeHtml(activeChannel.data?.name || 'channel')}…" style="flex:1;border-radius:8px;font-size:16px;" autocomplete="off" aria-label="Chat message" required>
          <button type="submit" class="btn btn-emerald" style="padding:.6rem 1.25rem;font-weight:800;border-radius:8px;display:inline-flex;align-items:center;gap:.4rem;min-height:44px;">Send <i class="fa-solid fa-paper-plane" aria-hidden="true"></i></button>
        </form>
      </div>`;
    wireEvents(container);
    scrollBottom();
  }

  function wireEvents(container) {
    container.querySelectorAll('.stream-ch-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.chId;
        if (id && channelsMap.has(id)) { activeChannelId = id; activeChannel = channelsMap.get(id); renderUI(container); }
      });
    });

    activeChannel.off('message.new');
    activeChannel.on('message.new', () => {
      const list = container.querySelector('#stream-msg-list');
      if (list) { list.innerHTML = renderMsgList(activeChannel.state?.messages); scrollBottom(); }
    });

    const form = container.querySelector('#stream-chat-form');
    const input = container.querySelector('#stream-msg-input');
    form?.addEventListener('submit', async e => {
      e.preventDefault();
      const text = (input.value || '').trim();
      if (!text) return;
      input.value = '';
      try { await activeChannel.sendMessage({ text }); } catch (err) { alert('Send failed: ' + err.message); }
    });

    container.querySelectorAll('[data-del-msg]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this message for everyone?')) return;
        try { await client.deleteMessage(btn.dataset.delMsg); activeChannel.state.messages = activeChannel.state.messages.filter(m => m.id !== btn.dataset.delMsg); renderUI(container); }
        catch (e) { alert('Delete failed: ' + e.message); }
      });
    });
  }

  function scrollBottom() {
    const el = document.getElementById('stream-msg-list');
    if (el) el.scrollTop = el.scrollHeight;
  }

  async function init(containerEl) {
    if (!containerEl) return;
    containerEl.innerHTML = '<div style="padding:3rem;text-align:center;color:#64748B;"><i class="fa-solid fa-circle-notch fa-spin" style="font-size:2rem;color:#064E3B;" aria-hidden="true"></i><p style="margin-top:1rem;font-weight:600;">Connecting to Pragyan Realtime Community Gateway…</p></div>';

    try {
      await loadScript('https://cdn.jsdelivr.net/npm/stream-chat@8.52.0/dist/browser.full-bundle.min.js');
      if (typeof StreamChat === 'undefined') throw new Error('Stream SDK failed to load');

      const tokenData = await fetchToken();
      client = StreamChat.getInstance(tokenData.apiKey);
      currentUser = { id: tokenData.userId, name: tokenData.userName, role: tokenData.userRole };
      await client.connectUser(currentUser, tokenData.token);
      await setupChannels();
      renderUI(containerEl);
    } catch (err) {
      console.error('[StreamChat]', err.message);
      containerEl.innerHTML = `
        <div class="dash-card" style="text-align:center;padding:2.5rem 1rem;">
          <i class="fa-solid fa-triangle-exclamation" style="font-size:2.5rem;color:#D97706;margin-bottom:.75rem;" aria-hidden="true"></i>
          <h3 style="color:#1E293B;">Unable to connect to Community Forum</h3>
          <p style="color:#64748B;font-size:.9rem;max-width:450px;margin:.5rem auto 1.25rem;">${escapeHtml(err.message)}</p>
          <button type="button" class="btn btn-emerald" onclick="PragyanStreamChat.reconnect()" style="padding:.6rem 1.4rem;font-weight:800;">Retry Connection</button>
        </div>`;
    }
  }

  function disconnect() {
    if (client) { client.disconnectUser(); client = null; }
    channelsMap.clear(); activeChannel = null; currentUser = null;
  }

  // Public API
  window.PragyanStreamChat = {
    init,
    reconnect() { const pane = document.getElementById('adminTabPane-community') || document.getElementById('studentTabPane-community'); if (pane) init(pane); },
    deleteMessage: async (msgId) => { if (client) { await client.deleteMessage(msgId); } },
    disconnect
  };

  // Legacy hook that portal.js already calls
  window.initGetStreamChat = async function () {
    const pane = document.getElementById('adminTabPane-community') || document.getElementById('studentTabPane-community');
    if (pane) { await init(pane); }
  };
})();
