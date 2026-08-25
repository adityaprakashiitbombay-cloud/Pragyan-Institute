/* ==========================================================================
 * PRAGYAN INSTITUTE — STREAM CHAT REALTIME COMMUNITY FORUM ENGINE
 * ----------------------------------------------------------------------------
 * Replaces localStorage-only community chat with GetStream.io realtime
 * messaging. Loads the Stream SDK from CDN, connects with JWT-minted
 * short-lived tokens, and renders batch-scoped channels with full mobile
 * responsive design and live WebSocket communication.
 * ========================================================================== */
(function () {
  'use strict';

  let client = null;
  let activeChannel = null;
  let currentUser = null;
  let channelsMap = new Map();
  let activeChannelId = 'institute-all';
  let typingTimeout = null;

  function escapeHtml(s) {
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
      s.onerror = () => reject(new Error('Failed to load Stream Chat SDK from CDN.'));
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

    // 1. Institute-wide main channel (messaging channel type for universal access)
    const allCh = client.channel('messaging', 'institute-all', {
      name: '🏫 Institute-Wide Forum'
    });
    await allCh.watch();
    channelsMap.set('institute-all', allCh);

    // 2. Batch-specific channels
    const myBatch = resolveBatchId();
    const batches = (window.PRAGYAN_ACADEMIC && window.PRAGYAN_ACADEMIC.BATCHES) || [];

    for (const b of batches) {
      if (!isAdmin && b.batchId !== myBatch) continue;
      const chId = `batch-${b.batchId}`;
      if (channelsMap.has(chId)) continue;
      const ch = client.channel('messaging', chId, {
        name: `${b.name || b.batchId}`
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
      return `
        <div style="text-align: center; color: var(--text-muted, #64748B); margin: auto; padding: 2.5rem 1rem;">
          <div style="width: 56px; height: 56px; border-radius: 50%; background: rgba(6, 78, 59, 0.08); color: #064E3B; display: inline-flex; align-items: center; justify-content: center; font-size: 1.5rem; margin-bottom: 0.75rem;">
            <i class="fa-solid fa-comments" aria-hidden="true"></i>
          </div>
          <p style="font-weight: 700; font-size: 1rem; color: #1E293B; margin-bottom: 0.25rem;">No messages in this channel yet.</p>
          <p style="font-size: 0.84rem;">Be the first to start the discussion!</p>
        </div>
      `;
    }

    return messages.map(m => {
      const isMine = m.user && m.user.id === currentUser.id;
      const isAdminMsg = m.user && (m.user.role === 'admin' || String(m.user.id || '').startsWith('admin_'));
      const avatar = m.user?.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(m.user?.name || 'U')}&background=064E3B&color=fff`;
      const bubbleBg = isMine ? '#064E3B' : (isAdminMsg ? '#FFFBEB' : '#FFFFFF');
      const bubbleColor = isMine ? '#FFFFFF' : '#1E293B';
      const bubbleBorder = isMine ? '#064E3B' : (isAdminMsg ? '#FCD34D' : 'var(--border-sand, #E2E8F0)');

      return `
        <div class="stream-msg-row ${isMine ? 'mine' : 'theirs'}" id="msg-${escapeHtml(m.id)}" style="display: flex; gap: 0.65rem; align-items: flex-start; margin-bottom: 0.85rem; ${isMine ? 'flex-direction: row-reverse;' : ''}">
          <img src="${escapeHtml(avatar)}" alt="" style="width: 34px; height: 34px; border-radius: 50%; object-fit: cover; border: 1.5px solid ${isAdminMsg ? '#F59E0B' : '#059669'}; flex-shrink: 0;">
          <div style="max-width: 86%; display: flex; flex-direction: column; ${isMine ? 'align-items: flex-end;' : 'align-items: flex-start;'}">
            <div style="display: flex; gap: 0.4rem; align-items: center; font-size: 0.76rem; margin-bottom: 0.2rem; flex-wrap: wrap;">
              <strong style="color: ${isAdminMsg ? '#B45309' : 'var(--text-mahogany, #5A2E25)'};">
                ${escapeHtml(m.user?.name || 'User')}
              </strong>
              ${isAdminMsg ? '<span style="background: #FEF3C7; color: #92400E; border: 1px solid #FCD34D; font-size: 0.68rem; font-weight: 800; padding: 0 0.35rem; border-radius: 4px;">Faculty / Director</span>' : ''}
              <span style="color: var(--text-muted, #64748B); font-size: 0.72rem;">${fmtTime(m.created_at)}</span>
            </div>
            <div class="stream-msg-bubble" style="background: ${bubbleBg}; color: ${bubbleColor}; border: 1px solid ${bubbleBorder}; padding: 0.65rem 0.9rem; border-radius: 12px; font-size: 0.9rem; line-height: 1.45; word-break: break-word; overflow-wrap: anywhere; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
              ${escapeHtml(m.text || '')}
            </div>
            ${currentUser.role === 'admin' ? `
              <div style="display: flex; gap: 0.4rem; margin-top: 0.2rem;">
                <button type="button" class="btn-del-msg" data-del-msg="${escapeHtml(m.id)}" style="background: none; border: none; font-size: 0.72rem; color: #DC2626; cursor: pointer; padding: 0.15rem 0.3rem; border-radius: 4px;" aria-label="Delete message">
                  <i class="fa-solid fa-trash-can" aria-hidden="true"></i> Delete
                </button>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  function renderUI(container) {
    const channelList = Array.from(channelsMap.entries());
    const onlineCount = activeChannel.state?.watcher_count || 1;

    container.innerHTML = `
      <div class="stream-chat-wrapper" style="display: flex; flex-direction: column; height: clamp(480px, 75vh, 760px); max-height: calc(100dvh - 140px); background: #FFFFFF; border-radius: 12px; border: 1.5px solid var(--border-sand, #DDD5CD); overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.05);">
        
        <!-- HEADER & CHANNEL TABS BAR -->
        <div class="stream-header-bar" style="background: linear-gradient(135deg, #064E3B 0%, #02241b 100%); color: #FFFFFF; padding: 0.65rem 0.85rem; display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; border-bottom: 2px solid #04382B; flex-shrink: 0;">
          <div class="stream-pills-scroll" style="display: flex; gap: 0.45rem; align-items: center; overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; padding-bottom: 2px;">
            ${channelList.map(([id, ch]) => `
              <button type="button" class="stream-ch-pill ${id === activeChannelId ? 'active' : ''}" data-ch-id="${escapeHtml(id)}" style="padding: 0.4rem 0.8rem; border-radius: 99px; font-size: 0.8rem; font-weight: 700; cursor: pointer; border: 1px solid rgba(255,255,255,0.25); background: ${id === activeChannelId ? '#10B981' : 'rgba(255,255,255,0.12)'}; color: #FFFFFF; white-space: nowrap; transition: all 0.2s ease; touch-action: manipulation; min-height: 36px;">
                ${escapeHtml(ch.data?.name || id)}
              </button>
            `).join('')}
          </div>
          <div style="font-size: 0.76rem; color: #A7F3D0; white-space: nowrap; display: flex; align-items: center; gap: 0.35rem; flex-shrink: 0;">
            <span style="width: 8px; height: 8px; border-radius: 50%; background: #34D399; display: inline-block; box-shadow: 0 0 6px #34D399;"></span>
            <span id="stream-online-count">${onlineCount} online</span>
          </div>
        </div>

        <!-- MESSAGES FEED -->
        <div id="stream-msg-list" style="flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 1rem; background: #FAF9F6; display: flex; flex-direction: column;">
          ${renderMsgList(activeChannel.state?.messages)}
        </div>

        <!-- TYPING INDICATOR -->
        <div id="stream-typing-box" style="padding: 0.15rem 1rem; font-size: 0.74rem; color: #64748B; font-style: italic; min-height: 18px; background: #FAF9F6;"></div>

        <!-- COMPOSER INPUT -->
        <form id="stream-chat-form" style="display: flex; align-items: center; gap: 0.5rem; padding: 0.65rem 0.85rem; background: #FFFFFF; border-top: 1.5px solid var(--border-sand, #DDD5CD); flex-shrink: 0;">
          <input type="text" id="stream-msg-input" class="portal-input" placeholder="Message in ${escapeHtml(activeChannel.data?.name || 'community')}…" style="flex: 1; border-radius: 8px; font-size: 16px; min-height: 44px; padding: 0.55rem 0.85rem; border: 1.5px solid var(--border-sand, #CBD5E1);" autocomplete="off" aria-label="Chat message" required>
          <button type="submit" class="btn btn-emerald" id="btn-stream-send" style="padding: 0.55rem 1.15rem; font-weight: 800; border-radius: 8px; display: inline-flex; align-items: center; gap: 0.4rem; min-height: 44px; font-size: 0.88rem;">
            <span>Send</span> <i class="fa-solid fa-paper-plane" aria-hidden="true"></i>
          </button>
        </form>
      </div>
    `;

    wireEvents(container);
    scrollBottom();
  }

  function wireEvents(container) {
    // 1. Channel switcher
    container.querySelectorAll('.stream-ch-pill').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.chId;
        if (id && channelsMap.has(id) && id !== activeChannelId) {
          activeChannelId = id;
          activeChannel = channelsMap.get(id);
          renderUI(container);
        }
      });
    });

    // 2. Realtime WebSocket Subscriptions for live updates
    const handleUpdate = () => {
      const list = container.querySelector('#stream-msg-list');
      if (list && activeChannel) {
        list.innerHTML = renderMsgList(activeChannel.state?.messages);
        scrollBottom();
      }
    };

    activeChannel.off('message.new');
    activeChannel.off('message.updated');
    activeChannel.off('message.deleted');
    activeChannel.off('user.presence.changed');
    activeChannel.off('typing.start');
    activeChannel.off('typing.stop');

    activeChannel.on('message.new', handleUpdate);
    activeChannel.on('message.updated', handleUpdate);
    activeChannel.on('message.deleted', handleUpdate);
    activeChannel.on('user.presence.changed', () => {
      const cntEl = container.querySelector('#stream-online-count');
      if (cntEl && activeChannel) cntEl.textContent = `${activeChannel.state?.watcher_count || 1} online`;
    });

    // 3. Typing indicator
    activeChannel.on('typing.start', e => {
      if (e.user?.id !== currentUser.id) {
        const box = container.querySelector('#stream-typing-box');
        if (box) box.textContent = `${escapeHtml(e.user?.name || 'Someone')} is typing...`;
      }
    });
    activeChannel.on('typing.stop', e => {
      if (e.user?.id !== currentUser.id) {
        const box = container.querySelector('#stream-typing-box');
        if (box) box.textContent = '';
      }
    });

    // 4. Send message form
    const form = container.querySelector('#stream-chat-form');
    const input = container.querySelector('#stream-msg-input');
    const sendBtn = container.querySelector('#btn-stream-send');

    input?.addEventListener('input', () => {
      if (activeChannel) {
        activeChannel.keystroke().catch(() => {});
      }
    });

    form?.addEventListener('submit', async e => {
      e.preventDefault();
      const text = (input.value || '').trim();
      if (!text) return;

      input.value = '';
      if (sendBtn) sendBtn.disabled = true;

      try {
        await activeChannel.sendMessage({ text });
        handleUpdate();
      } catch (err) {
        alert('Failed to send message: ' + err.message);
      } finally {
        if (sendBtn) sendBtn.disabled = false;
        if (input) input.focus();
      }
    });

    // 5. Admin message delete
    container.querySelectorAll('[data-del-msg]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const msgId = btn.dataset.delMsg;
        if (!confirm('Are you sure you want to permanently delete this message for everyone?')) return;
        try {
          await client.deleteMessage(msgId);
          if (activeChannel?.state?.messages) {
            activeChannel.state.messages = activeChannel.state.messages.filter(m => m.id !== msgId);
          }
          handleUpdate();
        } catch (e) {
          alert('Delete failed: ' + e.message);
        }
      });
    });
  }

  function scrollBottom() {
    const el = document.getElementById('stream-msg-list');
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }

  async function init(containerEl) {
    if (!containerEl) return;
    containerEl.innerHTML = `
      <div style="padding: 3rem 1rem; text-align: center; color: #64748B;">
        <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 2rem; color: #064E3B;" aria-hidden="true"></i>
        <p style="margin-top: 1rem; font-weight: 700; color: #1E293B;">Connecting to Pragyan Realtime Community Gateway…</p>
        <p style="font-size: 0.82rem; color: #64748B;">Loading live channels and messages...</p>
      </div>
    `;

    try {
      await loadScript('https://cdn.jsdelivr.net/npm/stream-chat@8.52.0/dist/browser.full-bundle.min.js');
      if (typeof StreamChat === 'undefined') throw new Error('Stream Chat SDK failed to load.');

      const tokenData = await fetchToken();
      client = StreamChat.getInstance(tokenData.apiKey);
      currentUser = { id: tokenData.userId, name: tokenData.userName, role: tokenData.userRole };

      try {
        await client.connectUser(currentUser, tokenData.token);
      } catch (connErr) {
        console.warn('[StreamChat] connectUser full metadata failed, attempting id-only connect:', connErr.message);
        if (connErr.message && (connErr.message.includes('already exist') || connErr.message.includes('UpdateUsers') || connErr.message.includes('code 6'))) {
          await client.connectUser({ id: tokenData.userId }, tokenData.token);
        } else {
          throw connErr;
        }
      }
      await setupChannels();
      renderUI(containerEl);
    } catch (err) {
      console.error('[StreamChat Error]', err);
      containerEl.innerHTML = `
        <div class="dash-card" style="text-align: center; padding: 2.5rem 1.5rem; background: #FFF; border-radius: 12px; border: 1.5px solid var(--border-sand); margin: 1rem auto; max-width: 500px;">
          <div style="width: 56px; height: 56px; border-radius: 50%; background: #FEF3C7; color: #D97706; display: inline-flex; align-items: center; justify-content: center; font-size: 1.5rem; margin-bottom: 0.75rem;">
            <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
          </div>
          <h3 style="color: #1E293B; margin-bottom: 0.35rem;">Unable to Connect to Community Forum</h3>
          <p style="color: #64748B; font-size: 0.88rem; line-height: 1.5; margin-bottom: 1.25rem;">${escapeHtml(err.message)}</p>
          <button type="button" class="btn btn-emerald" onclick="PragyanStreamChat.reconnect()" style="padding: 0.6rem 1.4rem; font-weight: 800; border-radius: 8px;">
            <i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i> Retry Connection
          </button>
        </div>
      `;
    }
  }

  function disconnect() {
    if (client) { client.disconnectUser(); client = null; }
    channelsMap.clear(); activeChannel = null; currentUser = null;
  }

  // Public API
  window.PragyanStreamChat = {
    init,
    reconnect() {
      const pane = document.getElementById('adminTabPane-community') || document.getElementById('studentTabPane-community');
      if (pane) init(pane);
    },
    deleteMessage: async (msgId) => { if (client) { await client.deleteMessage(msgId); } },
    disconnect
  };

  window.initGetStreamChat = async function () {
    const pane = document.getElementById('adminTabPane-community') || document.getElementById('studentTabPane-community');
    if (pane) { await init(pane); }
  };
})();
