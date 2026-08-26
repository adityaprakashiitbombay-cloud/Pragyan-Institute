/* ==========================================================================
 * PRAGYAN INSTITUTE — STREAM CHAT REALTIME CLASS-WISE FORUMS
 * ----------------------------------------------------------------------------
 * Dedicated GetStream.io realtime chat channel for EVERY individual class
 * (Class 1st to 12th + Special English courses).
 * - Students automatically enter their specific class forum.
 * - Administrators have full multi-class access, moderation, pin & highlight tools.
 * - Mentions (@student), Slash Commands (/quest, /hg, /pin, /notice, /clear, /help).
 * - Pinned Announcements Bar, Realtime WebSockets, Verified Badges.
 * ========================================================================== */
(function () {
  'use strict';

  const CHANNEL_TYPE = 'livestream';

  let client = null;
  let activeChannel = null;
  let currentUser = null;
  let channelsMap = new Map();
  let activeChannelId = 'batch-BAT-10';
  let selectedCategory = 'ALL';
  let searchQuery = '';
  let isListening = false;
  let activeChatViewMode = 'chat'; // 'chat' | 'media'
  let mediaFilterType = 'ALL'; // 'ALL' | 'PDF' | 'IMAGE'
  let mediaSearchQuery = '';
  let pdfjsLibLoaded = false;
  let replyingToMessage = null; // { id, author, text }
  let streamBroadcastChannel = null;
  let syncIntervalId = null;
  let isSyncingActiveChannel = false;
  let isMobileChatOpen = false;

  const CHANNEL_IDENTITIES = {
    'batch-BAT-12PCM': {
      id: 'batch-BAT-12PCM',
      batchId: 'BAT-12PCM',
      name: 'Class 12th PCM (ASCEND)',
      shortName: 'Class 12th PCM',
      icon: '⚛️',
      category: 'Senior Secondary',
      badgeColor: '#2563EB',
      tagline: 'ASCEND — I.Sc. Physics, Chemistry & Higher Mathematics',
      mentors: 'Prof. Ravi Ranjan & Chandan Kumar',
      bannerBg: 'linear-gradient(135deg, #1E3A8A 0%, #3B82F6 100%)',
      accentBorder: '#60A5FA'
    },
    'batch-BAT-12PCB': {
      id: 'batch-BAT-12PCB',
      batchId: 'BAT-12PCB',
      name: 'Class 12th PCB (ASCEND)',
      shortName: 'Class 12th PCB',
      icon: '🧬',
      category: 'Senior Secondary',
      badgeColor: '#0D9488',
      tagline: 'ASCEND — I.Sc. Physics, Chemistry & Biology (Medical Stream)',
      mentors: 'Chandan Kumar & Prof. Ravi Ranjan',
      bannerBg: 'linear-gradient(135deg, #134E4A 0%, #14B8A6 100%)',
      accentBorder: '#2DD4BF'
    },
    'batch-BAT-11PCM': {
      id: 'batch-BAT-11PCM',
      batchId: 'BAT-11PCM',
      name: 'Class 11th PCM (ASCEND)',
      shortName: 'Class 11th PCM',
      icon: '📐',
      category: 'Senior Secondary',
      badgeColor: '#7C3AED',
      tagline: 'ASCEND — I.Sc. Foundation with Higher Mathematics',
      mentors: 'Prof. Ravi Ranjan & Chandan Kumar',
      bannerBg: 'linear-gradient(135deg, #4C1D95 0%, #8B5CF6 100%)',
      accentBorder: '#A78BFA'
    },
    'batch-BAT-11PCB': {
      id: 'batch-BAT-11PCB',
      batchId: 'BAT-11PCB',
      name: 'Class 11th PCB (ASCEND)',
      shortName: 'Class 11th PCB',
      icon: '🧫',
      category: 'Senior Secondary',
      badgeColor: '#059669',
      tagline: 'ASCEND — I.Sc. Foundation with Biology',
      mentors: 'Chandan Kumar & Prof. Ravi Ranjan',
      bannerBg: 'linear-gradient(135deg, #064E3B 0%, #10B981 100%)',
      accentBorder: '#34D399'
    },
    'batch-BAT-10': {
      id: 'batch-BAT-10',
      batchId: 'BAT-10',
      name: 'Class 10th (ACHIEVER)',
      shortName: 'Class 10th',
      icon: '🏆',
      category: 'Secondary',
      badgeColor: '#D97706',
      tagline: 'ACHIEVER — Matric Board Intensive Preparation & Doubts',
      mentors: 'Chandan Kumar & Prof. Ravi Ranjan',
      bannerBg: 'linear-gradient(135deg, #78350F 0%, #D97706 100%)',
      accentBorder: '#FBBF24'
    },
    'batch-BAT-09': {
      id: 'batch-BAT-09',
      batchId: 'BAT-09',
      name: 'Class 9th (NURTURE)',
      shortName: 'Class 9th',
      icon: '🌱',
      category: 'Secondary',
      badgeColor: '#16A34A',
      tagline: 'NURTURE — Secondary Foundation in Science & Maths',
      mentors: 'Chandan Kumar & Prof. Ravi Ranjan',
      bannerBg: 'linear-gradient(135deg, #14532D 0%, #22C55E 100%)',
      accentBorder: '#4ADE80'
    },
    'batch-BAT-08': {
      id: 'batch-BAT-08',
      batchId: 'BAT-08',
      name: 'Class 8th (ALPHA)',
      shortName: 'Class 8th',
      icon: '⚡',
      category: 'Secondary',
      badgeColor: '#EA580C',
      tagline: 'ALPHA — Middle School Science & Mathematics Mastery',
      mentors: 'Chandan Kumar & Prof. Ravi Ranjan',
      bannerBg: 'linear-gradient(135deg, #7C2D12 0%, #F97316 100%)',
      accentBorder: '#FB923C'
    },
    'batch-BAT-67': {
      id: 'batch-BAT-67',
      batchId: 'BAT-67',
      name: 'Class 6th & 7th (PIONEER)',
      shortName: 'Class 6th & 7th',
      icon: '🧭',
      category: 'Junior & Middle',
      badgeColor: '#0284C7',
      tagline: 'PIONEER — Early Science, Maths & Logical Thinking Foundation',
      mentors: 'Chandan Kumar & Aditi Singh',
      bannerBg: 'linear-gradient(135deg, #0C4A6E 0%, #0EA5E9 100%)',
      accentBorder: '#38BDF8'
    },
    'batch-BAT-15': {
      id: 'batch-BAT-15',
      batchId: 'BAT-15',
      name: 'Class 1st to 5th (Junior Foundation)',
      shortName: 'Class 1st–5th',
      icon: '🎨',
      category: 'Junior & Middle',
      badgeColor: '#DB2777',
      tagline: 'Junior Foundation — Primary All-Subject Academic Care',
      mentors: 'Aditi Singh & Chandan Kumar',
      bannerBg: 'linear-gradient(135deg, #831843 0%, #EC4899 100%)',
      accentBorder: '#F472B6'
    },
    'batch-BAT-ENG-912': {
      id: 'batch-BAT-ENG-912',
      batchId: 'BAT-ENG-912',
      name: 'Special English 9th to 12th',
      shortName: 'English 9th–12th',
      icon: '📖',
      category: 'Special English',
      badgeColor: '#4F46E5',
      tagline: 'English & Grammar Mastery with Aditi Singh',
      mentors: 'Aditi Singh',
      bannerBg: 'linear-gradient(135deg, #312E81 0%, #6366F1 100%)',
      accentBorder: '#818CF8'
    },
    'batch-BAT-ENG-68': {
      id: 'batch-BAT-ENG-68',
      batchId: 'BAT-ENG-68',
      name: 'Special English 6th to 8th',
      shortName: 'English 6th–8th',
      icon: '✍️',
      category: 'Special English',
      badgeColor: '#9333EA',
      tagline: 'English & Grammar Foundation with Aditi Singh',
      mentors: 'Aditi Singh',
      bannerBg: 'linear-gradient(135deg, #581C87 0%, #A855F7 100%)',
      accentBorder: '#C084FC'
    },
    'batch-BAT-ENG-15': {
      id: 'batch-BAT-ENG-15',
      batchId: 'BAT-ENG-15',
      name: 'Special English 1st to 5th',
      shortName: 'English 1st–5th',
      icon: '🔤',
      category: 'Special English',
      badgeColor: '#E11D48',
      tagline: 'Early English & Phonics with Aditi Singh',
      mentors: 'Aditi Singh',
      bannerBg: 'linear-gradient(135deg, #881337 0%, #F43F5E 100%)',
      accentBorder: '#FB7185'
    }
  };

  const SLASH_COMMANDS = [
    { cmd: '/imp', usage: '/imp <message>', label: 'Very Important Announcement', desc: 'Broadcast high-priority urgent announcement in red alert card', icon: '🚨', adminOnly: true },
    { cmd: '/hg', usage: '/hg <message>', label: 'Highlight Announcement', desc: 'Broadcast highlighted announcement in glowing gold callout banner', icon: '⭐', adminOnly: true },
    { cmd: '/mute', usage: '/mute @<student> or /mute <roll>', label: 'Mute Student Messages', desc: 'Prevent student from sending messages until unmuted', icon: '🔇', adminOnly: true },
    { cmd: '/unmute', usage: '/unmute @<student> or /unmute <roll>', label: 'Unmute Student Messages', desc: 'Restore student permission to send messages in this class', icon: '🔊', adminOnly: true },
    { cmd: '/pin', usage: '/pin <message>', label: 'Post & Pin Message', desc: 'Send message and immediately pin it to the top of group', icon: '📌', adminOnly: true },
    { cmd: '/notice', usage: '/notice <message>', label: 'Official Notice', desc: 'Post as an official class notice announcement', icon: '📢', adminOnly: true },
    { cmd: '/clear', usage: '/clear', label: 'Clear Group Chat', desc: 'Prompt to purge entire message history for this class', icon: '🧹', adminOnly: true },
    { cmd: '/quest', usage: '/quest <question>', label: 'Ask Question / Doubt', desc: 'Post question in vibrant indigo card for mentors & classmates', icon: '❓', studentOnly: true },
    { cmd: '/help', usage: '/help', label: 'Show Commands', desc: 'View list of available slash commands and shortcuts', icon: '📖', forStudents: true, forAdmins: true }
  ];

  function escapeHtml(s) {
    if (typeof window !== 'undefined' && window.escapeHtml) return window.escapeHtml(s);
    return String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  function sanitizeUrl(value) {
    if (!value || typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (trimmed.startsWith('data:image/')) {
      if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)) {
        return trimmed;
      }
      return '';
    }
    try {
      const base = (typeof window !== 'undefined' && window.location?.origin) ? window.location.origin : 'https://pragyaninstitute.com';
      const url = new URL(trimmed, base);
      return ['https:', 'http:', 'blob:'].includes(url.protocol) ? url.href : '';
    } catch (_) {
      return '';
    }
  }
  if (typeof window !== 'undefined') {
    window.sanitizeUrl = window.sanitizeUrl || sanitizeUrl;
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
    const token = (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('pragyan_portal_token')) ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('pragyan_portal_token')) || '';
    if (!token) throw new Error('Please sign in to access the class forum.');

    const res = await fetch('/api/health?action=stream-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new Error(data.error || `Server connection failed with status ${res.status}`);
    return data;
  }

  function getActiveCommunityPane() {
    const adminContainer = document.getElementById('adminDashboardContainer');
    const isAdminVisible = adminContainer && 
      adminContainer.style.display !== 'none' && 
      !adminContainer.hasAttribute('hidden') && 
      !adminContainer.classList.contains('hidden-view');
    
    const adminPane = document.getElementById('adminTabPane-community');
    const studentPane = document.getElementById('studentTabPane-community');

    if (isAdminVisible) {
      return adminPane || studentPane;
    }
    return studentPane || adminPane;
  }

  function getAllCommunityPanes() {
    const panes = new Set();
    const adminPane = document.getElementById('adminTabPane-community');
    const studentPane = document.getElementById('studentTabPane-community');
    if (adminPane) panes.add(adminPane);
    if (studentPane) panes.add(studentPane);
    const appEl = document.getElementById('stream-community-chat-app');
    if (appEl) panes.add(appEl);
    return Array.from(panes);
  }
  const getAllMountedPanes = getAllCommunityPanes;

  function handleIncomingSync(data) {
    if (!data || data.type !== 'sync_channel') return;

    const incomingChId = data.channelId || '';
    const isSameCh = !incomingChId || !activeChannelId || 
                     incomingChId === activeChannelId || 
                     incomingChId.replace(/^batch-/, '') === activeChannelId.replace(/^batch-/, '');

    if (!isSameCh) {
      if (channelsMap.has(incomingChId) && data.message) {
        const targetCh = channelsMap.get(incomingChId);
        if (targetCh && targetCh.state && Array.isArray(targetCh.state.messages)) {
          if (!targetCh.state.messages.some(m => m.id === data.message.id)) {
            targetCh.state.messages.push(data.message);
            targetCh.state.messages.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
          }
        }
      }
      return;
    }

    if (data.message && activeChannel) {
      if (!activeChannel.state) activeChannel.state = { messages: [] };
      if (!Array.isArray(activeChannel.state.messages)) activeChannel.state.messages = [];
      const incoming = data.message;
      if (!activeChannel.state.messages.some(m => m.id === incoming.id)) {
        activeChannel.state.messages.push(incoming);
        activeChannel.state.messages.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
        renderPinnedBarAndList();
      }
    } else {
      syncActiveChannelMessages();
    }
  }

  // Cross-tab Synchronization via BroadcastChannel & localStorage
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      streamBroadcastChannel = new BroadcastChannel('pragyan_stream_chat_sync');
      streamBroadcastChannel.onmessage = (e) => {
        handleIncomingSync(e.data);
      };
    }
  } catch (_) {}

  try {
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', e => {
        if (e.key === 'pragyan_stream_chat_sync' && e.newValue) {
          try {
            const parsed = JSON.parse(e.newValue);
            handleIncomingSync(parsed);
          } catch (_) {}
        }
      });
    }
  } catch (_) {}

  function broadcastMessageSync(messageObj) {
    const payload = {
      type: 'sync_channel',
      channelId: activeChannelId,
      message: messageObj || null,
      timestamp: Date.now()
    };

    try {
      if (streamBroadcastChannel) {
        streamBroadcastChannel.postMessage(payload);
      }
    } catch (_) {}

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('pragyan_stream_chat_sync', JSON.stringify(payload));
      }
    } catch (_) {}
  }

  function getEventChannelId(event) {
    if (!event) return '';
    if (event.channel_id) return String(event.channel_id);
    if (event.channel?.id) return String(event.channel.id);
    if (event.message?.channel_id) return String(event.message.channel_id);
    if (event.message?.channel?.id) return String(event.message.channel.id);
    if (event.cid) {
      const parts = String(event.cid).split(':');
      return parts.length > 1 ? parts.slice(1).join(':') : parts[0];
    }
    if (event.message?.cid) {
      const parts = String(event.message.cid).split(':');
      return parts.length > 1 ? parts.slice(1).join(':') : parts[0];
    }
    return '';
  }

  function handleMsgEvent(eventType, event) {
    if (!event) return;
    const evtChId = getEventChannelId(event);

    // 1. Update channelsMap if the event belongs to another known channel
    if (evtChId && channelsMap.has(evtChId)) {
      const targetCh = channelsMap.get(evtChId);
      if (targetCh && targetCh !== activeChannel && targetCh.state) {
        if (!Array.isArray(targetCh.state.messages)) targetCh.state.messages = [];
        if (eventType === 'message.new' || eventType === 'notification.message_new') {
          if (event.message && !targetCh.state.messages.some(m => m.id === event.message.id)) {
            targetCh.state.messages.push(event.message);
            targetCh.state.messages.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
          }
        } else if (eventType === 'message.updated') {
          if (event.message) {
            const idx = targetCh.state.messages.findIndex(m => m.id === event.message.id);
            if (idx >= 0) targetCh.state.messages[idx] = { ...targetCh.state.messages[idx], ...event.message };
            else targetCh.state.messages.push(event.message);
            targetCh.state.messages.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
          }
        } else if (eventType === 'message.deleted') {
          const delId = event.message?.id || event.id;
          if (delId) targetCh.state.messages = targetCh.state.messages.filter(m => m.id !== delId);
        }
      }
    }

    // 2. If it matches our active channel (or no channel specified), process for active UI
    if (!activeChannel) return;
    const isMatch = !evtChId || 
                    evtChId === activeChannel.id || 
                    evtChId === activeChannelId ||
                    evtChId.replace(/^batch-/, '') === activeChannel.id.replace(/^batch-/, '') ||
                    (event.cid && activeChannel.cid && event.cid === activeChannel.cid) ||
                    (event.channel?.id && (event.channel.id === activeChannel.id || event.channel.id.replace(/^batch-/, '') === activeChannel.id.replace(/^batch-/, '')));
    if (!isMatch) return;

    if (!activeChannel.state) activeChannel.state = { messages: [] };
    if (!Array.isArray(activeChannel.state.messages)) activeChannel.state.messages = [];

    if (eventType === 'message.new' || eventType === 'notification.message_new') {
      if (event.message) {
        const idx = activeChannel.state.messages.findIndex(m => m.id === event.message.id);
        if (idx >= 0) {
          activeChannel.state.messages[idx] = { ...activeChannel.state.messages[idx], ...event.message };
        } else {
          activeChannel.state.messages.push(event.message);
        }
        activeChannel.state.messages.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
      }
    } else if (eventType === 'message.updated') {
      if (event.message) {
        const idx = activeChannel.state.messages.findIndex(m => m.id === event.message.id);
        if (idx >= 0) {
          activeChannel.state.messages[idx] = { ...activeChannel.state.messages[idx], ...event.message };
        } else {
          activeChannel.state.messages.push(event.message);
        }
        activeChannel.state.messages.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
      }
    } else if (eventType === 'message.deleted') {
      const delId = event.message?.id || event.id;
      if (delId) {
        activeChannel.state.messages = activeChannel.state.messages.filter(m => m.id !== delId);
      }
    } else if (eventType === 'channel.updated') {
      if (event.channel?.muted_users) {
        activeChannel.data = activeChannel.data || {};
        activeChannel.data.muted_users = event.channel.muted_users;
        activeChannel.data.muted_user_ids = event.channel.muted_users;
        getAllMountedPanes().forEach(pane => renderUI(pane));
        return;
      }
    } else if (eventType === 'user.banned' || eventType === 'user.unbanned') {
      const bannedUserId = event.user?.id;
      if (bannedUserId && activeChannel) {
        activeChannel.data = activeChannel.data || {};
        let mutedList = Array.isArray(activeChannel.data.muted_users) ? [...activeChannel.data.muted_users] : [];
        if (eventType === 'user.banned') {
          if (!mutedList.includes(bannedUserId)) mutedList.push(bannedUserId);
        } else {
          mutedList = mutedList.filter(id => id !== bannedUserId);
        }
        activeChannel.data.muted_users = mutedList;
        activeChannel.data.muted_user_ids = mutedList;
        getAllMountedPanes().forEach(pane => renderUI(pane));
        return;
      }
    } else if (eventType === 'channel.truncated' || eventType === 'notification.channel_truncate') {
      activeChannel.state.messages = [];
    }

    renderPinnedBarAndList();
  }

  function bindChannelRealtime(ch) {
    if (!ch || ch._realtimeBound) return;
    ch._realtimeBound = true;
    const events = [
      'message.new', 'message.updated', 'message.deleted',
      'reaction.new', 'reaction.deleted', 'channel.updated',
      'channel.truncated', 'user.banned', 'user.unbanned',
      'notification.message_new', 'notification.channel_truncate'
    ];
    events.forEach(evt => {
      ch.on(evt, event => {
        handleMsgEvent(evt, event);
      });
    });
  }

  function setupRealtimeListeners() {
    if (!client || isListening) return;
    isListening = true;

    const eventTypes = [
      'message.new',
      'message.updated',
      'message.deleted',
      'channel.updated',
      'channel.truncated',
      'user.banned',
      'user.unbanned',
      'notification.message_new',
      'notification.channel_truncate'
    ];

    eventTypes.forEach(evtType => {
      client.on(evtType, event => {
        handleMsgEvent(evtType, event);
      });
    });

    client.on('connection.recovered', () => {
      syncActiveChannelMessages();
    });

    client.on('connection.changed', e => {
      if (e?.online) {
        syncActiveChannelMessages();
      }
    });

    client.on('user.presence.changed', () => {
      const pane = getActiveCommunityPane();
      const cntEl = pane?.querySelector('#stream-online-count');
      if (cntEl && activeChannel) {
        cntEl.textContent = `${activeChannel.state?.watcher_count || 1} active`;
      }
    });

    client.on('typing.start', e => {
      if (e.user?.id !== currentUser?.id && activeChannel && (e.channel_id === activeChannel.id || e.cid === activeChannel.cid)) {
        const pane = getActiveCommunityPane();
        const box = pane?.querySelector('#stream-typing-box');
        if (box) box.textContent = `✍️ ${escapeHtml(e.user?.name || 'Someone')} is typing in this group...`;
      }
    });

    client.on('typing.stop', e => {
      if (e.user?.id !== currentUser?.id && activeChannel && (e.channel_id === activeChannel.id || e.cid === activeChannel.cid)) {
        const pane = getActiveCommunityPane();
        const box = pane?.querySelector('#stream-typing-box');
        if (box) box.textContent = '';
      }
    });
  }

  function stopPeriodicSync() {
    if (syncIntervalId) {
      clearInterval(syncIntervalId);
      syncIntervalId = null;
    }
  }

  function scrollBottom(container) {
    try {
      if (container) {
        const list = container.querySelector('#stream-msg-list');
        if (list) {
          list.scrollTop = list.scrollHeight;
        }
      }
      const allLists = document.querySelectorAll('#stream-msg-list');
      allLists.forEach(l => {
        l.scrollTop = l.scrollHeight;
      });
    } catch (_) {}
  }

  function updateReplyBar(container) {
    try {
      const html = renderReplyBarHtml();
      const wrappers = document.querySelectorAll('#stream-reply-bar-wrapper');
      wrappers.forEach(w => {
        w.innerHTML = html;
      });
      if (container) {
        const localWrapper = container.querySelector('#stream-reply-bar-wrapper');
        if (localWrapper) localWrapper.innerHTML = html;
      }
    } catch (_) {}
  }

  function openMobileFullscreen(container) {
    isMobileChatOpen = true;
    if (typeof document !== 'undefined') {
      document.body.classList.add('stream-body-fullscreen-lock');
    }
    const targetPane = container || getActiveCommunityPane();
    if (targetPane) {
      renderUI(targetPane);
      const list = targetPane.querySelector('#stream-msg-list');
      if (list) {
        list.scrollTop = list.scrollHeight;
      }
      const input = targetPane.querySelector('#stream-msg-input');
      if (input) {
        setTimeout(() => { try { input.focus(); } catch (_) {} }, 250);
      }
    }
  }

  function exitMobileFullscreen() {
    isMobileChatOpen = false;
    if (typeof document !== 'undefined') {
      document.body.classList.remove('stream-body-fullscreen-lock');
    }
    const activePane = getActiveCommunityPane();
    if (activePane && !activePane.hasAttribute('hidden') && activePane.style.display !== 'none') {
      renderUI(activePane);
    }
  }

  async function syncActiveChannelMessages() {
    if (!activeChannel || !client || !client.userID || isSyncingActiveChannel) return;
    isSyncingActiveChannel = true;
    try {
      const queryRes = await activeChannel.query({
        messages: { limit: 100 },
        watchers: { limit: 100 },
        state: true
      });
      if (queryRes?.messages && activeChannel.state) {
        const msgMap = new Map();
        (queryRes.messages || []).forEach(m => { if (m && m.id) msgMap.set(m.id, m); });
        activeChannel.state.messages = Array.from(msgMap.values()).sort(
          (a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0)
        );
      }
      renderPinnedBarAndList();
    } catch (err) {
      console.warn('[StreamChat syncActiveChannelMessages warning]', err.message);
    } finally {
      isSyncingActiveChannel = false;
    }
  }

  function startPeriodicSync() {
    if (syncIntervalId) clearInterval(syncIntervalId);
    syncIntervalId = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible' && client?.userID && activeChannel) {
        syncActiveChannelMessages();
      }
    }, 2500);
  }

  function resolveStudentBatches() {
    try {
      let user = (typeof window !== 'undefined' && window.AppState?.currentUser) || (typeof AppState !== 'undefined' && AppState.currentUser) || null;
      if (!user) {
        try {
          const raw = sessionStorage.getItem('pragyan_portal_user') || localStorage.getItem('pragyan_portal_user');
          if (raw) user = JSON.parse(raw);
        } catch (_) {}
      }
      user = user || {};

      const enrolledIds = new Set();
      const cn = user.className || user.class_name || user.class || user.batch || user.batchName || user.batch_name || '';

      // Check enrolledBatches array if present
      if (Array.isArray(user.enrolledBatches)) {
        user.enrolledBatches.forEach(b => {
          if (typeof b === 'string') {
            const res = window.PRAGYAN_ACADEMIC?.resolveBatch ? window.PRAGYAN_ACADEMIC.resolveBatch(b) : null;
            if (res?.batchId) enrolledIds.add(res.batchId);
            else if (b.startsWith('BAT-')) enrolledIds.add(b);
          } else if (b && typeof b === 'object') {
            if (b.batchId || b.id) enrolledIds.add(b.batchId || b.id);
          }
        });
      }

      if (window.PRAGYAN_ACADEMIC && typeof window.PRAGYAN_ACADEMIC.resolveBatches === 'function') {
        const resolvedList = window.PRAGYAN_ACADEMIC.resolveBatches(cn);
        if (Array.isArray(resolvedList)) {
          resolvedList.forEach(b => { if (b.batchId) enrolledIds.add(b.batchId); });
        }
      }

      if (window.PRAGYAN_ACADEMIC && typeof window.PRAGYAN_ACADEMIC.resolveBatch === 'function') {
        const primary = window.PRAGYAN_ACADEMIC.resolveBatch(cn);
        if (primary?.batchId) enrolledIds.add(primary.batchId);
      }

      const roll = String(user.student_id || user.rollNo || user.id || '');
      if (roll.length >= 4 && window.PRAGYAN_ACADEMIC) {
        const classCode = roll.substring(2, 4);
        const batch = (window.PRAGYAN_ACADEMIC.BATCHES || []).find(b => b.classCode === classCode);
        if (batch) enrolledIds.add(batch.batchId);
      }

      if (user.batchId && String(user.batchId).startsWith('BAT-')) enrolledIds.add(user.batchId);
      if (user.batch_id && String(user.batch_id).startsWith('BAT-')) enrolledIds.add(user.batch_id);

      return Array.from(enrolledIds);
    } catch (_) {
      return [];
    }
  }

  function resolveBatchId() {
    const enrolled = resolveStudentBatches();
    return enrolled[0] || 'BAT-10';
  }

  function getStudentCountForBatch(batchId) {
    try {
      let students = [];
      if (typeof window !== 'undefined' && window.AppState?.getStudents) {
        students = window.AppState.getStudents() || [];
      } else if (typeof AppState !== 'undefined' && AppState.getStudents) {
        students = AppState.getStudents() || [];
      }
      if (!students.length) {
        try {
          const raw = localStorage.getItem('pragyan_db_students_master');
          if (raw) students = JSON.parse(raw) || [];
        } catch (_) {}
      }
      if (!window.PRAGYAN_ACADEMIC || !window.PRAGYAN_ACADEMIC.resolveBatch) return 0;
      return students.filter(s => {
        const b = window.PRAGYAN_ACADEMIC.resolveBatch(s.className || s.class_name || '');
        return b && b.batchId === batchId;
      }).length;
    } catch (_) {
      return 0;
    }
  }

  function getStudentsListForMention(query = '') {
    try {
      const isAdmin = currentUser?.role === 'admin';
      const rawEnrolled = resolveStudentBatches();
      const primaryBatch = rawEnrolled[0] || resolveBatchId() || 'BAT-10';
      const enrolledBatches = (!isAdmin && rawEnrolled.length === 0) ? [primaryBatch] : rawEnrolled;

      let allStudents = [];
      if (typeof window !== 'undefined' && window.AppState && typeof window.AppState.getStudents === 'function') {
        try { allStudents = window.AppState.getStudents() || []; } catch (_) {}
      } else if (typeof AppState !== 'undefined' && typeof AppState.getStudents === 'function') {
        try { allStudents = AppState.getStudents() || []; } catch (_) {}
      }

      if (!allStudents || !allStudents.length) {
        try {
          const raw = localStorage.getItem('pragyan_db_students_master') ||
            localStorage.getItem('pragyan_db_students_v3') ||
            localStorage.getItem('pragyan_students_data');
          if (raw) allStudents = JSON.parse(raw) || [];
        } catch (_) {}
      }

      // Filter to classmates in the same class/batch for student users
      if (!isAdmin && window.PRAGYAN_ACADEMIC?.resolveBatch && Array.isArray(allStudents)) {
        allStudents = allStudents.filter(s => {
          const b = window.PRAGYAN_ACADEMIC.resolveBatch(s.className || s.class_name || s.class || '');
          return b && enrolledBatches.includes(b.batchId);
        });
      }

      const uniqueMap = new Map();
      if (Array.isArray(allStudents)) {
        allStudents.forEach(s => {
          const name = s.name || s.studentName || s.student_name || '';
          const roll = s.rollNo || s.roll_no || s.student_id || s.id || '';
          const cName = s.className || s.class_name || s.class || 'Student';
          const photo = s.photoUrl || s.photo_url || s.photo || '';
          if (name || roll) {
            const key = (roll || name).toLowerCase();
            uniqueMap.set(key, { name: name || `Student ${roll}`, rollNo: roll, className: cName, photoUrl: photo });
          }
        });
      }

      // Also gather users from active channel messages if present
      if (activeChannel?.state?.messages) {
        activeChannel.state.messages.forEach(m => {
          if (m.user && m.user.id && !m.user.id.startsWith('admin_')) {
            const name = m.user.name || '';
            let roll = '';
            if (m.user.id.startsWith('student_')) roll = m.user.id.replace('student_', '');
            if (name || roll) {
              const key = (roll || name).toLowerCase();
              if (!uniqueMap.has(key)) {
                uniqueMap.set(key, { name: name || `Student ${roll}`, rollNo: roll, className: 'Student', photoUrl: m.user.image || '' });
              }
            }
          }
        });
      }

      const list = Array.from(uniqueMap.values());
      const q = String(query || '').toLowerCase().trim();
      if (!q) return list.slice(0, 10);
      return list.filter(s => {
        const name = (s.name || '').toLowerCase();
        const roll = (s.rollNo || '').toLowerCase();
        const cName = (s.className || '').toLowerCase();
        return name.includes(q) || roll.includes(q) || cName.includes(q);
      }).slice(0, 10);
    } catch (_) {
      return [];
    }
  }

  async function setupChannels() {
    channelsMap.clear();
    const isAdmin = currentUser.role === 'admin';
    const rawEnrolled = resolveStudentBatches();
    const primaryBatch = rawEnrolled[0] || resolveBatchId() || 'BAT-10';
    const enrolledBatches = (!isAdmin && rawEnrolled.length === 0) ? [primaryBatch] : rawEnrolled;
    const batches = (window.PRAGYAN_ACADEMIC && window.PRAGYAN_ACADEMIC.BATCHES) || [];

    // Register batch channels: Admin gets all batches; Students get ONLY their enrolled class(es)
    for (const b of batches) {
      if (!isAdmin && !enrolledBatches.includes(b.batchId)) {
        continue;
      }
      const chId = `batch-${b.batchId}`;
      const meta = CHANNEL_IDENTITIES[chId] || { name: b.name || b.batchId };
      const ch = client.channel(CHANNEL_TYPE, chId, {
        name: meta.name
      });
      bindChannelRealtime(ch);
      channelsMap.set(chId, ch);
    }

    // Fallback: If channelsMap is empty for student, ensure their primary batch channel exists
    if (!isAdmin && channelsMap.size === 0) {
      const fallbackBatchId = primaryBatch || 'BAT-10';
      const chId = `batch-${fallbackBatchId}`;
      const meta = CHANNEL_IDENTITIES[chId] || { name: fallbackBatchId };
      const ch = client.channel(CHANNEL_TYPE, chId, { name: meta.name });
      bindChannelRealtime(ch);
      channelsMap.set(chId, ch);
    }

    // Set default active channel to student's primary enrolled batch
    if (!isAdmin) {
      if (primaryBatch && channelsMap.has(`batch-${primaryBatch}`)) {
        activeChannelId = `batch-${primaryBatch}`;
      } else {
        const firstValid = enrolledBatches.find(b => channelsMap.has(`batch-${b}`));
        if (firstValid) {
          activeChannelId = `batch-${firstValid}`;
        } else if (channelsMap.size > 0) {
          activeChannelId = Array.from(channelsMap.keys())[0];
        }
      }
    } else {
      if (!channelsMap.has(activeChannelId)) {
        activeChannelId = channelsMap.has('batch-BAT-10') ? 'batch-BAT-10' : Array.from(channelsMap.keys())[0];
      }
    }

    activeChannel = channelsMap.get(activeChannelId);
    if (!activeChannel && channelsMap.size > 0) {
      activeChannel = Array.from(channelsMap.values())[0];
      activeChannelId = activeChannel.id;
    }

    if (isAdmin && channelsMap.size > 0) {
      try {
        await Promise.allSettled(
          Array.from(channelsMap.values()).map(ch => ch.watch({ state: true, presence: true }))
        );
      } catch (adminWatchErr) {
        console.warn('[StreamChat] Admin bulk watch note:', adminWatchErr.message);
      }
    }

    if (activeChannel) {
      try {
        await activeChannel.watch({ state: true, presence: true });
        const qRes = await activeChannel.query({ messages: { limit: 100 }, watchers: { limit: 100 } });
        if (qRes?.messages && activeChannel.state) {
          const msgMap = new Map();
          (qRes.messages || []).forEach(m => { if (m && m.id) msgMap.set(m.id, m); });
          activeChannel.state.messages = Array.from(msgMap.values()).sort(
            (a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0)
          );
        }
      } catch (watchErr) {
        console.warn('[StreamChat] Initial watch note:', watchErr.message);
        try { await activeChannel.watch(); } catch (_) {}
      }
    }
  }

  async function switchChannel(targetChannelId, container) {
    if (!channelsMap.has(targetChannelId)) return;
    const isAdmin = currentUser.role === 'admin';
    const rawEnrolled = resolveStudentBatches();
    const primaryBatch = rawEnrolled[0] || resolveBatchId() || 'BAT-10';
    const enrolledBatches = (!isAdmin && rawEnrolled.length === 0) ? [primaryBatch] : rawEnrolled;
    const targetMeta = CHANNEL_IDENTITIES[targetChannelId];
    if (!isAdmin && targetMeta?.batchId && !enrolledBatches.includes(targetMeta.batchId)) {
      console.warn('[StreamChat] Student access restricted to enrolled class chat only:', targetChannelId);
      return;
    }
    activeChannelId = targetChannelId;
    activeChannel = channelsMap.get(targetChannelId);
    replyingToMessage = null;

    const list = container.querySelector('#stream-msg-list');
    if (list) {
      list.innerHTML = `
        <div style="text-align: center; color: #64748B; margin: auto; padding: 2rem 1rem;">
          <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 1.8rem; color: #064E3B;" aria-hidden="true"></i>
          <p style="margin-top: 0.75rem; font-size: 0.88rem; font-weight: 700;">Loading class messages...</p>
        </div>
      `;
    }

    try {
      await activeChannel.watch({ state: true, presence: true });
      const qRes = await activeChannel.query({ messages: { limit: 100 }, watchers: { limit: 100 } });
      if (qRes?.messages && activeChannel.state) {
        const msgMap = new Map();
        (qRes.messages || []).forEach(m => { if (m && m.id) msgMap.set(m.id, m); });
        activeChannel.state.messages = Array.from(msgMap.values()).sort(
          (a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0)
        );
      }
    } catch (e) {
      console.warn('[StreamChat] switchChannel watch warning:', e.message);
      try { await activeChannel.watch(); } catch (_) {}
    }

    renderUI(container);
  }

  function fmtTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  }

  function extractUserBadge(user, channelMeta) {
    const isUserAdmin = user && (user.role === 'admin' || String(user.id || '').startsWith('admin_'));
    if (isUserAdmin) {
      return {
        isFaculty: true,
        badgeText: '👑 Verified Faculty & Admin',
        badgeBg: '#FEF3C7',
        badgeColor: '#92400E',
        badgeBorder: '#FCD34D',
        subText: 'Mentor & Institute Management'
      };
    }

    let roll = '';
    const uid = String(user?.id || '');
    if (uid.startsWith('student_')) {
      roll = uid.replace('student_', '');
    }

    const className = channelMeta?.shortName ? channelMeta.shortName.replace(/^[^\w]+/, '').trim() : 'Student';

    return {
      isFaculty: false,
      badgeText: roll ? `🎓 Roll: ${roll}` : '🎓 Student',
      badgeBg: '#ECFDF5',
      badgeColor: '#065F46',
      badgeBorder: '#A7F3D0',
      subText: className
    };
  }

  function isUserMutedById(userId) {
    if (!userId) return false;
    const chData = activeChannel?.data || {};
    const mutedList = chData.muted_users || chData.muted_user_ids || [];
    if (Array.isArray(mutedList) && (mutedList.includes(userId) || mutedList.some(id => String(id).toLowerCase() === String(userId).toLowerCase()))) {
      return true;
    }
    return false;
  }

  function isCurrentUserMuted() {
    if (!currentUser || currentUser.role === 'admin') return false;
    return isUserMutedById(currentUser.id);
  }

  function formatMessageBody(rawText) {
    if (!rawText) return '';
    let text = String(rawText);

    // Clean slash prefixes case-insensitively
    const cleaned = text.replace(/^\/(quest|question|doubt|ask|q|hg|highlight|star|imp|important|urgent|alert|pin|sticky|notice|announcement|announce)\s*/i, '').trim();
    if (cleaned) {
      text = cleaned;
    }

    let safe = escapeHtml(text);

    // Format @mentions with distinctive emerald badge
    safe = safe.replace(/@([a-zA-Z0-9_#-]+(?:\s+[a-zA-Z0-9_#-]+)?)/g, (match, p1) => {
      return `<span class="stream-mention-pill" style="background: rgba(16, 185, 129, 0.15); color: #064E3B; font-weight: 800; padding: 0.12rem 0.45rem; border-radius: 6px; border: 1px solid #6EE7B7; display: inline-flex; align-items: center; gap: 0.2rem; font-size: 0.88em; vertical-align: baseline;"><i class="fa-solid fa-at" style="font-size: 0.75em; color: #059669;" aria-hidden="true"></i>${p1}</span>`;
    });

    return safe.replace(/\n/g, '<br>');
  }

  function formatBytes(bytes) {
    if (!bytes || isNaN(bytes)) return '';
    const b = Number(bytes);
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function loadPdfJs() {
    if (window.pdfjsLib) return window.pdfjsLib;
    if (pdfjsLibLoaded && window.pdfjsLib) return window.pdfjsLib;

    return new Promise((resolve) => {
      if (window.pdfjsLib) {
        resolve(window.pdfjsLib);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      script.onload = () => {
        pdfjsLibLoaded = true;
        if (window.pdfjsLib) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
        resolve(window.pdfjsLib);
      };
      script.onerror = () => {
        resolve(null);
      };
      document.head.appendChild(script);
    });
  }

  async function renderPdfPage1Thumbnails(container) {
    const previewWraps = (container || document).querySelectorAll('.stream-pdf-page1-preview-wrap:not(.is-rendered)');
    if (!previewWraps.length) return;

    const pdfjs = await loadPdfJs().catch(() => null);
    if (!pdfjs || !pdfjs.getDocument) return;

    previewWraps.forEach(async (wrap) => {
      wrap.classList.add('is-rendered');
      const url = wrap.dataset.pdfUrl;
      const canvas = wrap.querySelector('.stream-pdf-page1-canvas');
      const placeholder = wrap.querySelector('.stream-pdf-page1-placeholder');
      if (!url || !canvas) return;

      try {
        const loadingTask = pdfjs.getDocument({ url: url });
        const doc = await loadingTask.promise;
        const page = await doc.getPage(1);
        const viewport = page.getViewport({ scale: 0.4 });
        const ctx = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({ canvasContext: ctx, viewport }).promise;
        if (placeholder) placeholder.style.display = 'none';
        canvas.style.display = 'block';
      } catch (_) {}
    });
  }

  let currentPdfDoc = null;
  let currentPdfPage = 1;
  let currentPdfZoom = 1.0;

  async function openPdfReaderModal(pdfUrl, pdfTitle) {
    const existing = document.getElementById('stream-pdf-reader-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'stream-pdf-reader-modal';
    modal.className = 'stream-pdf-modal';
    modal.style.cssText = 'position: fixed; inset: 0; z-index: 9999999; background: rgba(15, 23, 42, 0.88); backdrop-filter: blur(8px); display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0.75rem;';

    modal.innerHTML = `
      <div style="background: #FFFFFF; border-radius: 12px; width: 100%; max-width: 960px; height: 92vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 25px 60px rgba(0,0,0,0.35); border: 1.5px solid #CBD5E1;">
        
        <!-- MODAL TOP BAR -->
        <div style="background: #0F172A; color: #FFFFFF; padding: 0.55rem 0.85rem; display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; flex-shrink: 0;">
          <div style="display: flex; align-items: center; gap: 0.5rem; overflow: hidden;">
            <div style="width: 28px; height: 28px; border-radius: 6px; background: #DC2626; color: #FFF; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; flex-shrink: 0;">
              <i class="fa-solid fa-file-pdf"></i>
            </div>
            <div style="font-weight: 800; font-size: 0.88rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 480px;">
              ${escapeHtml(pdfTitle || 'Class PDF Document')}
            </div>
          </div>

          <!-- CONTROLS: PAGE & ZOOM & DOWNLOAD & CLOSE -->
          <div style="display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0;">
            
            <!-- Page Nav -->
            <div style="display: flex; align-items: center; gap: 0.25rem; background: rgba(255,255,255,0.1); padding: 0.15rem 0.45rem; border-radius: 6px; font-size: 0.75rem;">
              <button type="button" id="btn-pdf-prev" style="background: none; border: none; color: #FFF; cursor: pointer; padding: 0.1rem 0.3rem;" title="Previous Page">
                <i class="fa-solid fa-chevron-left"></i>
              </button>
              <span>Page <strong id="pdf-page-num">1</strong> / <span id="pdf-page-count">…</span></span>
              <button type="button" id="btn-pdf-next" style="background: none; border: none; color: #FFF; cursor: pointer; padding: 0.1rem 0.3rem;" title="Next Page">
                <i class="fa-solid fa-chevron-right"></i>
              </button>
            </div>

            <!-- Zoom -->
            <div style="display: flex; align-items: center; gap: 0.2rem; background: rgba(255,255,255,0.1); padding: 0.15rem 0.4rem; border-radius: 6px; font-size: 0.75rem;">
              <button type="button" id="btn-pdf-zoom-out" style="background: none; border: none; color: #FFF; cursor: pointer;" title="Zoom Out"><i class="fa-solid fa-minus"></i></button>
              <span id="pdf-zoom-val" style="font-weight: 700; min-width: 36px; text-align: center;">100%</span>
              <button type="button" id="btn-pdf-zoom-in" style="background: none; border: none; color: #FFF; cursor: pointer;" title="Zoom In"><i class="fa-solid fa-plus"></i></button>
            </div>

            <a href="${escapeHtml(pdfUrl)}" download="${escapeHtml(pdfTitle || 'document.pdf')}" target="_blank" rel="noopener noreferrer" style="background: #10B981; color: #FFFFFF; border-radius: 6px; padding: 0.25rem 0.6rem; font-size: 0.74rem; font-weight: 800; text-decoration: none; display: inline-flex; align-items: center; gap: 0.25rem;">
              <i class="fa-solid fa-download"></i> <span>Download</span>
            </a>

            <button type="button" id="btn-pdf-close" style="background: rgba(255,255,255,0.15); color: #FFFFFF; border: none; border-radius: 6px; width: 28px; height: 28px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 0.95rem;" title="Close Viewer (Esc)">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>

        <!-- CANVAS VIEWER CONTAINER -->
        <div id="pdf-canvas-container" style="flex: 1; overflow: auto; background: #334155; display: flex; align-items: flex-start; justify-content: center; padding: 1rem; position: relative;">
          <div id="pdf-loading-spinner" style="position: absolute; top: 40%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: #FFFFFF;">
            <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 2.5rem; color: #38BDF8; margin-bottom: 0.5rem;"></i>
            <div style="font-weight: 800; font-size: 0.95rem;">Loading Class PDF Document…</div>
            <div style="font-size: 0.75rem; color: #94A3B8; margin-top: 0.2rem;">Streaming on-demand from Pragyan Stream CDN</div>
          </div>
          <canvas id="pdf-render-canvas" style="display: none; box-shadow: 0 8px 30px rgba(0,0,0,0.4); border-radius: 4px; background: #FFF;"></canvas>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    document.body.classList.add('stream-body-fullscreen-lock');

    const closeModal = () => {
      modal.remove();
      document.body.classList.remove('stream-body-fullscreen-lock');
      window.removeEventListener('keydown', keyHandler);
    };

    const keyHandler = (e) => {
      if (e.key === 'Escape') closeModal();
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        if (currentPdfDoc && currentPdfPage < currentPdfDoc.numPages) {
          currentPdfPage++;
          renderPdfPage(currentPdfPage);
        }
      }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        if (currentPdfDoc && currentPdfPage > 1) {
          currentPdfPage--;
          renderPdfPage(currentPdfPage);
        }
      }
    };
    window.addEventListener('keydown', keyHandler);

    modal.querySelector('#btn-pdf-close')?.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    const canvas = modal.querySelector('#pdf-render-canvas');
    const spinner = modal.querySelector('#pdf-loading-spinner');
    const pageNumEl = modal.querySelector('#pdf-page-num');
    const pageCountEl = modal.querySelector('#pdf-page-count');
    const zoomValEl = modal.querySelector('#pdf-zoom-val');

    async function renderPdfPage(num) {
      if (!currentPdfDoc || !canvas) return;
      try {
        const page = await currentPdfDoc.getPage(num);
        const viewport = page.getViewport({ scale: currentPdfZoom });
        const ctx = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        if (spinner) spinner.style.display = 'none';
        canvas.style.display = 'block';
        if (pageNumEl) pageNumEl.textContent = String(num);

        const renderContext = {
          canvasContext: ctx,
          viewport: viewport
        };
        await page.render(renderContext).promise;
      } catch (err) {
        console.error('[PDF Render Page Error]', err);
      }
    }

    try {
      const pdfjs = await loadPdfJs();
      if (pdfjs && pdfjs.getDocument) {
        const loadingTask = pdfjs.getDocument({ url: pdfUrl });
        currentPdfDoc = await loadingTask.promise;
        currentPdfPage = 1;
        currentPdfZoom = 1.25;

        if (pageCountEl) pageCountEl.textContent = String(currentPdfDoc.numPages);
        if (zoomValEl) zoomValEl.textContent = `${Math.round(currentPdfZoom * 100)}%`;

        await renderPdfPage(1);

        modal.querySelector('#btn-pdf-prev')?.addEventListener('click', () => {
          if (currentPdfPage > 1) {
            currentPdfPage--;
            renderPdfPage(currentPdfPage);
          }
        });

        modal.querySelector('#btn-pdf-next')?.addEventListener('click', () => {
          if (currentPdfDoc && currentPdfPage < currentPdfDoc.numPages) {
            currentPdfPage++;
            renderPdfPage(currentPdfPage);
          }
        });

        modal.querySelector('#btn-pdf-zoom-in')?.addEventListener('click', () => {
          if (currentPdfZoom < 2.5) {
            currentPdfZoom += 0.25;
            if (zoomValEl) zoomValEl.textContent = `${Math.round(currentPdfZoom * 100)}%`;
            renderPdfPage(currentPdfPage);
          }
        });

        modal.querySelector('#btn-pdf-zoom-out')?.addEventListener('click', () => {
          if (currentPdfZoom > 0.5) {
            currentPdfZoom -= 0.25;
            if (zoomValEl) zoomValEl.textContent = `${Math.round(currentPdfZoom * 100)}%`;
            renderPdfPage(currentPdfPage);
          }
        });
      } else {
        const c = modal.querySelector('#pdf-canvas-container');
        if (c) {
          c.innerHTML = `<iframe src="${escapeHtml(pdfUrl)}" style="width: 100%; height: 100%; border: none; border-radius: 6px;"></iframe>`;
        }
      }
    } catch (loadErr) {
      const c = modal.querySelector('#pdf-canvas-container');
      if (c) {
        c.innerHTML = `<iframe src="${escapeHtml(pdfUrl)}" style="width: 100%; height: 100%; border: none; border-radius: 6px;"></iframe>`;
      }
    }
  }

  function openImageLightboxModal(imgUrl, imgTitle) {
    const existing = document.getElementById('stream-img-lightbox-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'stream-img-lightbox-modal';
    modal.style.cssText = 'position: fixed; inset: 0; z-index: 9999999; background: rgba(0, 0, 0, 0.9); backdrop-filter: blur(8px); display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 1rem;';

    modal.innerHTML = `
      <div style="position: absolute; top: 1rem; right: 1rem; display: flex; align-items: center; gap: 0.5rem; z-index: 10;">
        <a href="${escapeHtml(imgUrl)}" download="${escapeHtml(imgTitle || 'image')}" target="_blank" rel="noopener noreferrer" style="background: #10B981; color: #FFF; padding: 0.35rem 0.75rem; border-radius: 6px; font-size: 0.8rem; font-weight: 800; text-decoration: none;">
          <i class="fa-solid fa-download"></i> Download
        </a>
        <button type="button" id="btn-img-lightbox-close" style="background: rgba(255,255,255,0.2); color: #FFF; border: none; border-radius: 6px; width: 34px; height: 34px; font-size: 1.2rem; cursor: pointer; display: flex; align-items: center; justify-content: center;">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
      <div style="max-width: 90vw; max-height: 85vh; overflow: hidden; display: flex; align-items: center; justify-content: center;">
        <img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(imgTitle || 'Image')}" style="max-width: 100%; max-height: 85vh; object-fit: contain; border-radius: 8px; box-shadow: 0 10px 40px rgba(0,0,0,0.5);">
      </div>
      ${imgTitle ? `<div style="color: #FFF; font-size: 0.85rem; font-weight: 700; margin-top: 0.6rem; text-align: center;">${escapeHtml(imgTitle)}</div>` : ''}
    `;

    document.body.appendChild(modal);
    document.body.classList.add('stream-body-fullscreen-lock');

    const close = () => {
      modal.remove();
      document.body.classList.remove('stream-body-fullscreen-lock');
      window.removeEventListener('keydown', keyEsc);
    };

    const keyEsc = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', keyEsc);

    modal.querySelector('#btn-img-lightbox-close')?.addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  }

  function renderAttachmentsHtml(attachments) {
    if (!Array.isArray(attachments) || !attachments.length) return '';

    return attachments.map((att) => {
      const type = String(att.type || '').toLowerCase();
      const mime = String(att.mime_type || '').toLowerCase();
      const url = sanitizeUrl(att.asset_url || att.image_url || att.url || att.thumb_url || '');
      const title = escapeHtml(att.title || att.name || (type === 'image' ? 'Class Image' : 'Class Document.pdf'));
      const sizeStr = formatBytes(att.file_size || att.size);
      const isPdf = type === 'file' || mime.includes('pdf') || /\.pdf(\?|$)/i.test(url) || /\.pdf$/i.test(title);
      const isImage = type === 'image' || mime.startsWith('image/') || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url);

      if (isImage) {
        return `
          <div class="stream-attachment-wrap stream-attachment-image" style="margin-top: 0.35rem; border-radius: 8px; overflow: hidden; border: 1px solid rgba(0,0,0,0.1); background: #000; max-width: 320px;">
            <a href="${url}" target="_blank" rel="noopener noreferrer" class="stream-img-lightbox-trigger" data-img-url="${url}" data-img-title="${title}" style="display: block; position: relative; cursor: pointer;">
              <img src="${url}" alt="${title}" loading="lazy" style="width: 100%; max-height: 200px; object-fit: cover; display: block; transition: transform 0.2s ease;">
              <div style="position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%); color: #FFF; font-size: 0.7rem; padding: 0.3rem 0.5rem; display: flex; align-items: center; justify-content: space-between;">
                <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 80%;">${title}</span>
                ${sizeStr ? `<span style="font-size: 0.65rem; opacity: 0.85;">${sizeStr}</span>` : ''}
              </div>
            </a>
          </div>
        `;
      }

      if (isPdf) {
        return `
          <div class="stream-attachment-wrap stream-attachment-pdf" style="margin-top: 0.4rem; background: #FFFDF9; border: 1.5px solid #F87171; border-radius: 10px; padding: 0.5rem 0.65rem; max-width: 360px; box-shadow: 0 2px 6px rgba(220, 38, 38, 0.08);">
            <div style="display: flex; align-items: flex-start; gap: 0.5rem;">
              <div style="width: 36px; height: 42px; background: #FEE2E2; border-radius: 6px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #DC2626; flex-shrink: 0; border: 1px solid #FCA5A5;">
                <i class="fa-solid fa-file-pdf" style="font-size: 1.25rem;"></i>
                <span style="font-size: 0.55rem; font-weight: 900; line-height: 1; margin-top: 2px;">PDF</span>
              </div>
              <div style="flex: 1; min-width: 0;">
                <div style="font-weight: 800; font-size: 0.82rem; color: #1E293B; line-height: 1.25; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${title}">
                  ${title}
                </div>
                <div style="display: flex; align-items: center; gap: 0.35rem; margin-top: 0.2rem; font-size: 0.68rem; color: #64748B;">
                  <span style="background: #F1F5F9; padding: 0.05rem 0.35rem; border-radius: 4px; font-weight: 700; color: #475569;">
                    ${sizeStr || 'Document'}
                  </span>
                  <span>• First Page Preview</span>
                </div>
              </div>
            </div>

            <!-- Page 1 Lazy Canvas Preview Container -->
            <div class="stream-pdf-page1-preview-wrap" data-pdf-url="${url}" style="margin-top: 0.4rem; background: #F8FAFC; border-radius: 6px; border: 1px dashed #CBD5E1; min-height: 80px; max-height: 120px; overflow: hidden; position: relative; display: flex; align-items: center; justify-content: center;">
              <canvas class="stream-pdf-page1-canvas" style="display: none; max-width: 100%; max-height: 120px;"></canvas>
              <div class="stream-pdf-page1-placeholder" style="text-align: center; padding: 0.4rem; color: #64748B; font-size: 0.7rem;">
                <i class="fa-solid fa-file-pdf" style="font-size: 1.2rem; color: #EF4444; margin-bottom: 0.2rem; display: block;"></i>
                <span>Click <strong>Read PDF</strong> to view full document</span>
              </div>
            </div>

            <!-- Action Buttons: Read PDF (Lazy Viewer) & Download -->
            <div style="display: flex; align-items: center; gap: 0.35rem; margin-top: 0.45rem;">
              <button type="button" class="btn-read-pdf" data-pdf-url="${url}" data-pdf-title="${title}" style="flex: 1; background: #DC2626; color: #FFFFFF; border: none; padding: 0.28rem 0.55rem; border-radius: 6px; font-size: 0.72rem; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 0.25rem;">
                <i class="fa-solid fa-book-open"></i> <span>Read PDF</span>
              </button>
              <a href="${url}" download="${title}" target="_blank" rel="noopener noreferrer" style="background: #FEE2E2; color: #991B1B; border: 1px solid #FCA5A5; padding: 0.28rem 0.55rem; border-radius: 6px; font-size: 0.72rem; font-weight: 800; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; gap: 0.2rem;">
                <i class="fa-solid fa-download"></i> <span>Download</span>
              </a>
            </div>
          </div>
        `;
      }

      return `
        <div class="stream-attachment-wrap" style="margin-top: 0.35rem; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 0.45rem 0.65rem; display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;">
          <div style="display: flex; align-items: center; gap: 0.4rem; overflow: hidden;">
            <i class="fa-solid fa-file" style="color: #64748B;"></i>
            <span style="font-size: 0.8rem; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${title}</span>
            ${sizeStr ? `<span style="font-size: 0.68rem; color: #94A3B8;">(${sizeStr})</span>` : ''}
          </div>
          <a href="${url}" download="${title}" target="_blank" rel="noopener noreferrer" style="color: #059669; font-size: 0.75rem; font-weight: 800;">Download</a>
        </div>
      `;
    }).join('');
  }

  function getMediaAttachmentsFromMessages(messages) {
    const mediaList = [];
    if (!Array.isArray(messages)) return mediaList;

    messages.forEach(m => {
      if (m.deleted_at) return;
      if (Array.isArray(m.attachments) && m.attachments.length) {
        m.attachments.forEach((att, idx) => {
          const type = String(att.type || '').toLowerCase();
          const mime = String(att.mime_type || '').toLowerCase();
          const url = att.asset_url || att.image_url || att.url || att.thumb_url || '';
          const isPdf = type === 'file' || mime.includes('pdf') || /\.pdf(\?|$)/i.test(url) || /\.pdf$/i.test(att.title || '');
          const isImage = type === 'image' || mime.startsWith('image/') || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url);
          
          if (url) {
            mediaList.push({
              messageId: m.id,
              attachmentIndex: idx,
              type: isPdf ? 'pdf' : (isImage ? 'image' : 'file'),
              title: att.title || att.name || (isPdf ? 'Class Notes.pdf' : 'Class Image'),
              url: url,
              fileSize: att.file_size || att.size || 0,
              mimeType: att.mime_type || '',
              createdAt: m.created_at,
              user: m.user
            });
          }
        });
      }
    });

    return mediaList.reverse();
  }

  function renderMediaGalleryHtml(mediaList, activeMeta) {
    const filtered = mediaList.filter(item => {
      if (mediaFilterType === 'PDF' && item.type !== 'pdf') return false;
      if (mediaFilterType === 'IMAGE' && item.type !== 'image') return false;
      if (mediaSearchQuery) {
        const q = mediaSearchQuery.toLowerCase();
        return item.title.toLowerCase().includes(q) || (item.user?.name && item.user.name.toLowerCase().includes(q));
      }
      return true;
    });

    return `
      <div class="stream-media-gallery-wrap" style="flex: 1; display: flex; flex-direction: column; background: #FAF9F6; overflow-y: auto; padding: 0.75rem 0.85rem;">
        
        <!-- MEDIA HEADER & FILTER CONTROLS -->
        <div style="background: #FFFFFF; border-radius: 10px; border: 1.5px solid var(--border-sand, #E2E8F0); padding: 0.6rem 0.8rem; margin-bottom: 0.75rem; box-shadow: 0 1px 4px rgba(0,0,0,0.04);">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.5rem;">
            <div>
              <h4 style="font-size: 0.92rem; font-weight: 800; color: #064E3B; margin: 0; display: flex; align-items: center; gap: 0.35rem;">
                <i class="fa-solid fa-folder-open" style="color: #059669;"></i> Class Media & Notes
              </h4>
              <p style="font-size: 0.72rem; color: #64748B; margin: 0.1rem 0 0 0;">
                All chapter PDFs, lecture notes, question papers & diagrams shared in ${escapeHtml(activeMeta.shortName || 'this class')}
              </p>
            </div>
            <div style="display: flex; gap: 0.3rem;">
              <button type="button" class="btn-media-filter ${mediaFilterType === 'ALL' ? 'active' : ''}" data-media-filter="ALL" style="padding: 0.2rem 0.55rem; border-radius: 6px; font-size: 0.72rem; font-weight: 800; cursor: pointer; border: 1px solid ${mediaFilterType === 'ALL' ? '#064E3B' : '#CBD5E1'}; background: ${mediaFilterType === 'ALL' ? '#064E3B' : '#FFFFFF'}; color: ${mediaFilterType === 'ALL' ? '#FFF' : '#475569'};">
                All (${mediaList.length})
              </button>
              <button type="button" class="btn-media-filter ${mediaFilterType === 'PDF' ? 'active' : ''}" data-media-filter="PDF" style="padding: 0.2rem 0.55rem; border-radius: 6px; font-size: 0.72rem; font-weight: 800; cursor: pointer; border: 1px solid ${mediaFilterType === 'PDF' ? '#DC2626' : '#CBD5E1'}; background: ${mediaFilterType === 'PDF' ? '#DC2626' : '#FFFFFF'}; color: ${mediaFilterType === 'PDF' ? '#FFF' : '#475569'};">
                📄 PDFs (${mediaList.filter(m => m.type === 'pdf').length})
              </button>
              <button type="button" class="btn-media-filter ${mediaFilterType === 'IMAGE' ? 'active' : ''}" data-media-filter="IMAGE" style="padding: 0.2rem 0.55rem; border-radius: 6px; font-size: 0.72rem; font-weight: 800; cursor: pointer; border: 1px solid ${mediaFilterType === 'IMAGE' ? '#2563EB' : '#CBD5E1'}; background: ${mediaFilterType === 'IMAGE' ? '#2563EB' : '#FFFFFF'}; color: ${mediaFilterType === 'IMAGE' ? '#FFF' : '#475569'};">
                🖼️ Images (${mediaList.filter(m => m.type === 'image').length})
              </button>
            </div>
          </div>

          <!-- MEDIA SEARCH BAR -->
          <div style="position: relative;">
            <i class="fa-solid fa-magnifying-glass" style="position: absolute; left: 0.65rem; top: 50%; transform: translateY(-50%); font-size: 0.75rem; color: #94A3B8;"></i>
            <input type="text" id="stream-media-search-input" value="${escapeHtml(mediaSearchQuery)}" placeholder="Search study notes, chapter PDFs, assignments…" style="width: 100%; padding: 0.35rem 0.65rem 0.35rem 1.85rem; font-size: 0.78rem; border-radius: 6px; border: 1px solid #CBD5E1; background: #F8FAFC;">
          </div>
        </div>

        <!-- MEDIA LIST GRID -->
        ${!filtered.length ? `
          <div style="text-align: center; margin: auto; padding: 3rem 1rem; color: #64748B;">
            <div style="width: 52px; height: 52px; border-radius: 50%; background: #EEF2FF; color: #4F46E5; display: inline-flex; align-items: center; justify-content: center; font-size: 1.6rem; margin-bottom: 0.6rem;">
              📁
            </div>
            <h4 style="font-weight: 800; font-size: 0.95rem; color: #1E293B; margin-bottom: 0.25rem;">
              ${mediaSearchQuery ? 'No matching study files found' : 'No media files shared yet'}
            </h4>
            <p style="font-size: 0.78rem; color: #64748B; max-width: 340px; margin: 0 auto;">
              ${currentUser.role === 'admin' ? 'Click the 📎 paperclip icon in the message bar to broadcast PDF notes or study images (up to 20 MB).' : 'Your faculty and teachers will share chapter PDFs, notes, and study material here.'}
            </p>
          </div>
        ` : `
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 0.75rem;">
            ${filtered.map(item => {
              const isPdf = item.type === 'pdf';
              const sizeStr = formatBytes(item.fileSize);
              const uploaderName = item.user?.name || 'Faculty / Admin';
              const dateStr = item.createdAt ? new Date(item.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '';

              if (isPdf) {
                return `
                  <div class="stream-media-card stream-pdf-card" style="background: #FFFFFF; border: 1.5px solid #FCA5A5; border-radius: 10px; padding: 0.65rem; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 2px 8px rgba(220, 38, 38, 0.06);">
                    <div>
                      <div style="display: flex; align-items: flex-start; gap: 0.5rem; margin-bottom: 0.45rem;">
                        <div style="width: 36px; height: 42px; background: #FEE2E2; border-radius: 6px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #DC2626; flex-shrink: 0; border: 1px solid #FCA5A5;">
                          <i class="fa-solid fa-file-pdf" style="font-size: 1.25rem;"></i>
                          <span style="font-size: 0.55rem; font-weight: 900; line-height: 1; margin-top: 2px;">PDF</span>
                        </div>
                        <div style="flex: 1; min-width: 0;">
                          <div style="font-weight: 800; font-size: 0.84rem; color: #1E293B; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;" title="${escapeHtml(item.title)}">
                            ${escapeHtml(item.title)}
                          </div>
                          <div style="font-size: 0.68rem; color: #64748B; margin-top: 0.15rem;">
                            <span>${escapeHtml(uploaderName)}</span> • <span>${dateStr}</span>
                          </div>
                        </div>
                      </div>

                      <!-- PDF Page 1 Preview Canvas/Thumbnail Container -->
                      <div class="stream-pdf-page1-preview-wrap" data-pdf-url="${escapeHtml(item.url)}" style="background: #F8FAFC; border-radius: 6px; border: 1px dashed #CBD5E1; min-height: 80px; max-height: 110px; overflow: hidden; display: flex; align-items: center; justify-content: center; margin-bottom: 0.45rem;">
                        <canvas class="stream-pdf-page1-canvas" style="display: none; max-width: 100%; max-height: 110px;"></canvas>
                        <div class="stream-pdf-page1-placeholder" style="text-align: center; color: #64748B; font-size: 0.7rem; padding: 0.4rem;">
                          <i class="fa-solid fa-file-pdf" style="color: #EF4444; font-size: 1.2rem; margin-bottom: 0.2rem; display: block;"></i>
                          <span>${sizeStr ? sizeStr + ' • ' : ''}Click <strong>Read PDF</strong></span>
                        </div>
                      </div>
                    </div>

                    <div style="display: flex; align-items: center; gap: 0.35rem; margin-top: 0.2rem;">
                      <button type="button" class="btn-read-pdf" data-pdf-url="${escapeHtml(item.url)}" data-pdf-title="${escapeHtml(item.title)}" style="flex: 1; background: #DC2626; color: #FFFFFF; border: none; padding: 0.3rem 0.5rem; border-radius: 6px; font-size: 0.72rem; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 0.25rem;">
                        <i class="fa-solid fa-book-open"></i> <span>Read PDF</span>
                      </button>
                      <a href="${escapeHtml(item.url)}" download="${escapeHtml(item.title)}" target="_blank" rel="noopener noreferrer" style="background: #FEE2E2; color: #991B1B; border: 1px solid #FCA5A5; padding: 0.3rem 0.5rem; border-radius: 6px; font-size: 0.72rem; font-weight: 800; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; gap: 0.2rem;">
                        <i class="fa-solid fa-download"></i> <span>Download</span>
                      </a>
                    </div>
                  </div>
                `;
              }

              // Image Card
              return `
                <div class="stream-media-card stream-img-card" style="background: #FFFFFF; border: 1.5px solid var(--border-sand, #E2E8F0); border-radius: 10px; overflow: hidden; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
                  <div style="position: relative; background: #0F172A;">
                    <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" class="stream-img-lightbox-trigger" data-img-url="${escapeHtml(item.url)}" data-img-title="${escapeHtml(item.title)}" style="display: block;">
                      <img src="${escapeHtml(item.url)}" alt="${escapeHtml(item.title)}" loading="lazy" style="width: 100%; height: 120px; object-fit: cover; display: block;">
                    </a>
                  </div>
                  <div style="padding: 0.5rem 0.65rem;">
                    <div style="font-weight: 800; font-size: 0.82rem; color: #1E293B; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(item.title)}">
                      ${escapeHtml(item.title)}
                    </div>
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 0.2rem; font-size: 0.68rem; color: #64748B;">
                      <span>${escapeHtml(uploaderName)} • ${dateStr}</span>
                      <span style="font-weight: 700; color: #065F46;">${sizeStr}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.35rem; margin-top: 0.4rem;">
                      <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" class="stream-img-lightbox-trigger" data-img-url="${escapeHtml(item.url)}" data-img-title="${escapeHtml(item.title)}" style="flex: 1; background: #2563EB; color: #FFFFFF; border: none; padding: 0.25rem 0.45rem; border-radius: 5px; font-size: 0.7rem; font-weight: 800; text-align: center; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; gap: 0.25rem;">
                        <i class="fa-solid fa-expand"></i> <span>View</span>
                      </a>
                      <a href="${escapeHtml(item.url)}" download="${escapeHtml(item.title)}" target="_blank" rel="noopener noreferrer" style="background: #EFF6FF; color: #1D4ED8; border: 1px solid #BFDBFE; padding: 0.25rem 0.45rem; border-radius: 5px; font-size: 0.7rem; font-weight: 800; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; gap: 0.2rem;">
                        <i class="fa-solid fa-download"></i> <span>Download</span>
                      </a>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>
    `;
  }

  function renderMsgList(messages) {
    const channelMeta = CHANNEL_IDENTITIES[activeChannelId] || {
      name: activeChannel?.data?.name || 'Class Forum',
      icon: '💬',
      badgeColor: '#059669',
      tagline: 'Class discussion and doubts'
    };

    if (!messages || !messages.length) {
      return `
        <div style="text-align: center; color: var(--text-muted, #64748B); margin: auto; padding: 2.5rem 1rem; max-width: 420px;">
          <div style="width: 48px; height: 48px; border-radius: 50%; background: ${channelMeta.badgeColor}18; color: ${channelMeta.badgeColor}; display: inline-flex; align-items: center; justify-content: center; font-size: 1.5rem; margin-bottom: 0.6rem; border: 1.5px solid ${channelMeta.badgeColor}33;">
            ${channelMeta.icon}
          </div>
          <h4 style="font-weight: 800; font-size: 1.05rem; color: #1E293B; margin-bottom: 0.25rem;">
            Welcome to ${escapeHtml(channelMeta.name)}
          </h4>
          <p style="font-size: 0.82rem; line-height: 1.4; color: #64748B; margin-bottom: 0.75rem;">
            ${escapeHtml(channelMeta.tagline)}
          </p>
          <div style="display: inline-flex; align-items: center; gap: 0.35rem; background: #FFFFFF; border: 1px dashed ${channelMeta.badgeColor}; padding: 0.35rem 0.75rem; border-radius: 8px; font-size: 0.78rem; font-weight: 700; color: #334155;">
            ✨ Start class discussion, ask doubts (/quest), or share notes!
          </div>
        </div>
      `;
    }

    const myId = currentUser?.id || '';
    const isUserAdmin = Boolean(currentUser?.role === 'admin' || (typeof AppState !== 'undefined' && AppState.adminLoggedIn));

    return messages.map(m => {
      const isMine = Boolean(m.user && myId && m.user.id === myId);
      const identity = extractUserBadge(m.user, channelMeta);
      const isFaculty = identity.isFaculty;
      const isStudentSender = !isFaculty && (m.user?.role !== 'admin' && !m.user?.id?.startsWith('admin_'));
      const isImportant = Boolean(m.is_important) || m.custom_type === 'important' || (m.text && /^\/(imp|important|urgent|alert)\b/i.test(m.text));
      const isQuestion = isStudentSender && (Boolean(m.is_question) || m.custom_type === 'question' || (m.text && /^\/(quest|question|doubt|ask|q)\b/i.test(m.text)));
      const isHighlight = Boolean(m.is_highlighted) || m.custom_type === 'highlight' || (m.text && /^\/(hg|highlight|star)\b/i.test(m.text));
      const isPinned = m.pinned || m.is_pinned || Boolean(m.pinned_at);
      const isNotice = Boolean(m.is_notice) || m.custom_type === 'notice' || (m.text && /^\/(notice|announcement|announce)\b/i.test(m.text));

      const isTargetMuted = isUserMutedById(m.user?.id);

      const avatar = m.user?.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(m.user?.name || 'User')}&background=${isFaculty ? 'D97706' : '064E3B'}&color=fff`;
      const formattedBody = formatMessageBody(m.text || '');
      const timeStr = fmtTime(m.created_at);
      const attachmentsHtml = renderAttachmentsHtml(m.attachments);

      // Quoted Reply Header (if this message is a reply to another message)
      const quotedAuthor = m.quoted_message_author || (m.quoted_message?.user?.name) || (m.parent_message?.user?.name) || '';
      const quotedText = m.quoted_message_text || (m.quoted_message?.text) || (m.parent_message?.text) || '';
      const quotedId = m.quoted_message_id || m.parent_id || '';

      let quoteHeaderHtml = '';
      if (quotedId && (quotedAuthor || quotedText)) {
        quoteHeaderHtml = `
          <div class="stream-msg-quote-header btn-jump-msg" data-msg-id="${escapeHtml(quotedId)}" style="background: rgba(0,0,0,0.06); border-left: 3px solid ${isFaculty ? '#F59E0B' : (isMine ? '#A7F3D0' : '#059669')}; padding: 0.22rem 0.45rem; border-radius: 4px; margin-bottom: 0.3rem; cursor: pointer; font-size: 0.72rem; transition: background 0.15s ease;" title="Click to jump to original message">
            <div style="font-weight: 800; font-size: 0.68rem; color: ${isMine ? '#D1FAE5' : '#064E3B'}; display: flex; align-items: center; gap: 0.25rem;">
              <i class="fa-solid fa-reply fa-flip-horizontal" style="font-size: 0.62rem;"></i>
              <span>Replying to <strong>@${escapeHtml(quotedAuthor || 'User')}</strong></span>
            </div>
            <div style="font-size: 0.7rem; color: ${isMine ? '#E2E8F0' : '#475569'}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 280px; font-style: italic; margin-top: 1px;">
              ${escapeHtml(quotedText || 'View original message')}
            </div>
          </div>
        `;
      }

      // Message Actions (Reply for everyone, Mute/Pin/Delete for Admin)
      let actionsHtml = `
        <span class="stream-msg-actions" style="display: inline-flex; align-items: center; gap: 0.2rem; margin-left: 0.35rem;">
          <button type="button" class="btn-reply-msg" data-reply-msg="${escapeHtml(m.id)}" data-reply-author="${escapeHtml(m.user?.name || 'User')}" data-reply-text="${escapeHtml((m.text || '').substring(0, 100))}" style="background: rgba(0,0,0,0.06); border: none; font-size: 0.65rem; color: #475569; cursor: pointer; padding: 2px 5px; border-radius: 4px; font-weight: 700; line-height: 1; display: inline-flex; align-items: center; gap: 0.2rem;" title="Reply to this message" aria-label="Reply to message">
            <i class="fa-solid fa-reply" aria-hidden="true"></i> <span>Reply</span>
          </button>
          ${isUserAdmin ? `
            ${isStudentSender ? `
              <button type="button" class="btn-toggle-mute" data-mute-student="${escapeHtml(m.user?.id || '')}" data-student-name="${escapeHtml(m.user?.name || '')}" data-is-muted="${isTargetMuted ? 'true' : 'false'}" style="background: ${isTargetMuted ? 'rgba(239, 68, 68, 0.15)' : 'rgba(0,0,0,0.06)'}; border: none; font-size: 0.65rem; color: ${isTargetMuted ? '#DC2626' : '#64748B'}; cursor: pointer; padding: 2px 5px; border-radius: 4px; font-weight: 700; line-height: 1; display: inline-flex; align-items: center; gap: 0.2rem;" title="${isTargetMuted ? 'Unmute student messages' : 'Mute student from sending messages'}">
                <i class="fa-solid ${isTargetMuted ? 'fa-volume-high' : 'fa-volume-xmark'}"></i> <span>${isTargetMuted ? 'Unmute' : 'Mute'}</span>
              </button>
            ` : ''}
            <button type="button" class="${isPinned ? 'btn-unpin-msg' : 'btn-pin-msg'}" data-${isPinned ? 'unpin' : 'pin'}-msg="${escapeHtml(m.id)}" style="background: rgba(0,0,0,0.06); border: none; font-size: 0.65rem; color: ${isPinned ? '#D97706' : '#059669'}; cursor: pointer; padding: 2px 5px; border-radius: 4px; font-weight: 700; line-height: 1;" title="${isPinned ? 'Unpin message' : 'Pin to top'}">
              <i class="fa-solid fa-thumbtack" aria-hidden="true"></i> ${isPinned ? 'Unpin' : 'Pin'}
            </button>
            <button type="button" class="btn-del-msg" data-del-msg="${escapeHtml(m.id)}" style="background: rgba(220,38,38,0.08); border: none; font-size: 0.65rem; color: #DC2626; cursor: pointer; padding: 2px 5px; border-radius: 4px; font-weight: 700; line-height: 1;" title="Delete message" aria-label="Delete message">
              <i class="fa-solid fa-trash-can" aria-hidden="true"></i>
            </button>
          ` : ''}
        </span>
      `;

      let bubbleContentHtml = '';
      if (isImportant) {
        bubbleContentHtml = `
          <div class="stream-msg-bubble stream-msg-important" style="background: linear-gradient(135deg, #FEF2F2 0%, #FFF1F2 100%); color: #7F1D1D; border: 2px solid #EF4444; padding: 0.5rem 0.8rem; border-radius: 10px; font-size: 0.9rem; line-height: 1.45; box-shadow: 0 4px 16px rgba(239, 68, 68, 0.2); position: relative;">
            <div style="font-size: 0.72rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; color: #DC2626; margin-bottom: 0.25rem; display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; border-bottom: 1.5px solid rgba(239, 68, 68, 0.25); padding-bottom: 0.25rem;">
              <span style="display: inline-flex; align-items: center; gap: 0.3rem;">
                <span>🚨</span> <strong>VERY IMPORTANT ANNOUNCEMENT</strong>
              </span>
              ${isPinned ? `<span style="font-size: 0.65rem; color: #991B1B; background: #FECACA; padding: 0.05rem 0.35rem; border-radius: 3px; font-weight: 800;"><i class="fa-solid fa-thumbtack"></i> Pinned</span>` : '<span style="font-size: 0.65rem; color: #FFF; background: #DC2626; padding: 0.05rem 0.35rem; border-radius: 3px; font-weight: 900;">HIGH PRIORITY</span>'}
            </div>
            ${quoteHeaderHtml}
            <div style="font-weight: 700; color: #7F1D1D; font-size: 0.92rem;">
              ${formattedBody}
            </div>
            ${attachmentsHtml}
            <div style="display: flex; align-items: center; justify-content: flex-end; gap: 0.35rem; margin-top: 0.25rem; font-size: 0.66rem; color: #DC2626;">
              <span>${timeStr}</span>
              ${actionsHtml}
            </div>
          </div>
        `;
      } else if (isQuestion) {
        bubbleContentHtml = `
          <div class="stream-msg-bubble stream-msg-question" style="background: linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%); color: #1E1B4B; border: 1.5px solid #6366F1; padding: 0.45rem 0.75rem; border-radius: 10px; font-size: 0.88rem; line-height: 1.4; box-shadow: 0 2px 8px rgba(99, 102, 241, 0.15); position: relative;">
            <div style="font-size: 0.7rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.3px; color: #4338CA; margin-bottom: 0.2rem; display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; border-bottom: 1px solid rgba(99, 102, 241, 0.2); padding-bottom: 0.2rem;">
              <span style="display: inline-flex; align-items: center; gap: 0.25rem;">
                <span>❓</span> <strong>QUESTION / DOUBT</strong>
              </span>
              <span style="font-size: 0.65rem; color: #3730A3; background: #C7D2FE; padding: 0.05rem 0.35rem; border-radius: 3px; font-weight: 800;">
                Academic Doubt
              </span>
            </div>
            ${quoteHeaderHtml}
            <div style="font-weight: 600; color: #1E1B4B;">
              ${formattedBody}
            </div>
            ${attachmentsHtml}
            <div style="display: flex; align-items: center; justify-content: flex-end; gap: 0.35rem; margin-top: 0.2rem; font-size: 0.66rem; color: #6366F1;">
              <span>${timeStr}</span>
              ${actionsHtml}
            </div>
          </div>
        `;
      } else if (isHighlight) {
        bubbleContentHtml = `
          <div class="stream-msg-bubble stream-msg-highlight" style="background: linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%); color: #78350F; border: 1.5px solid #F59E0B; padding: 0.45rem 0.75rem; border-radius: 10px; font-size: 0.88rem; line-height: 1.4; box-shadow: 0 2px 8px rgba(245, 158, 11, 0.15); position: relative;">
            <div style="font-size: 0.7rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.3px; color: #B45309; margin-bottom: 0.2rem; display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; border-bottom: 1px solid rgba(217, 119, 6, 0.2); padding-bottom: 0.2rem;">
              <span style="display: inline-flex; align-items: center; gap: 0.25rem;">
                <span>⭐</span> <strong>ADMIN HIGHLIGHT</strong>
              </span>
              ${isPinned ? `<span style="font-size: 0.65rem; color: #92400E; background: #FDE68A; padding: 0.05rem 0.35rem; border-radius: 3px; font-weight: 800;"><i class="fa-solid fa-thumbtack"></i> Pinned</span>` : ''}
            </div>
            ${quoteHeaderHtml}
            <div style="font-weight: 600; color: #78350F;">
              ${formattedBody}
            </div>
            ${attachmentsHtml}
            <div style="display: flex; align-items: center; justify-content: flex-end; gap: 0.35rem; margin-top: 0.2rem; font-size: 0.66rem; color: #B45309;">
              <span>${timeStr}</span>
              ${actionsHtml}
            </div>
          </div>
        `;
      } else if (isNotice) {
        bubbleContentHtml = `
          <div class="stream-msg-bubble stream-msg-notice" style="background: linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%); color: #064E3B; border: 1.5px solid #10B981; padding: 0.45rem 0.75rem; border-radius: 10px; font-size: 0.88rem; line-height: 1.4; box-shadow: 0 2px 8px rgba(16, 185, 129, 0.12); position: relative;">
            <div style="font-size: 0.7rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.3px; color: #047857; margin-bottom: 0.2rem; display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; border-bottom: 1px solid rgba(16, 185, 129, 0.2); padding-bottom: 0.2rem;">
              <span style="display: inline-flex; align-items: center; gap: 0.25rem;">
                <span>📢</span> <strong>CLASS NOTICE</strong>
              </span>
              ${isPinned ? `<span style="font-size: 0.65rem; color: #065F46; background: #A7F3D0; padding: 0.05rem 0.35rem; border-radius: 3px; font-weight: 800;"><i class="fa-solid fa-thumbtack"></i> Pinned</span>` : ''}
            </div>
            ${quoteHeaderHtml}
            <div style="font-weight: 600; color: #064E3B;">
              ${formattedBody}
            </div>
            ${attachmentsHtml}
            <div style="display: flex; align-items: center; justify-content: flex-end; gap: 0.35rem; margin-top: 0.2rem; font-size: 0.66rem; color: #047857;">
              <span>${timeStr}</span>
              ${actionsHtml}
            </div>
          </div>
        `;
      } else {
        const bubbleBg = isMine ? '#064E3B' : (isFaculty ? '#FFFDF5' : '#FFFFFF');
        const bubbleColor = isMine ? '#FFFFFF' : '#1E293B';
        const bubbleBorder = isMine ? '#064E3B' : (isFaculty ? '#FDE68A' : 'var(--border-sand, #E2E8F0)');
        const timeColor = isMine ? 'rgba(255,255,255,0.72)' : '#94A3B8';

        bubbleContentHtml = `
          <div class="stream-msg-bubble ${isPinned ? 'is-pinned-bubble' : ''}" style="background: ${bubbleBg}; color: ${bubbleColor}; border: 1.5px solid ${isPinned ? '#F59E0B' : bubbleBorder}; padding: 0.38rem 0.7rem; border-radius: 10px; font-size: 0.88rem; line-height: 1.38; word-break: break-word; overflow-wrap: anywhere; box-shadow: 0 1px 4px rgba(0,0,0,0.03); position: relative;">
            ${isPinned ? `
              <div style="font-size: 0.65rem; font-weight: 800; color: #D97706; margin-bottom: 0.2rem; display: flex; align-items: center; gap: 0.2rem;">
                <i class="fa-solid fa-thumbtack"></i> Pinned
              </div>
            ` : ''}
            ${quoteHeaderHtml}
            <div class="stream-msg-text" style="display: inline;">
              ${formattedBody}
            </div>
            ${attachmentsHtml}
            <div class="stream-msg-meta-row" style="display: flex; align-items: center; justify-content: flex-end; gap: 0.35rem; margin-top: 0.15rem; font-size: 0.65rem; color: ${timeColor};">
              <span>${timeStr}</span>
              ${actionsHtml}
            </div>
          </div>
        `;
      }

      return `
        <div class="stream-msg-row ${isMine ? 'mine' : 'theirs'} ${isPinned ? 'stream-msg-pinned' : ''}" id="msg-${escapeHtml(m.id)}" style="display: flex; gap: 0.45rem; align-items: flex-start; margin-bottom: 0.35rem; ${isMine ? 'flex-direction: row-reverse;' : ''}">
          <img src="${escapeHtml(avatar)}" class="stream-avatar" alt="${escapeHtml(m.user?.name || '')}" style="width: 26px; height: 26px; border-radius: 50%; object-fit: cover; border: 1.5px solid ${isFaculty ? '#F59E0B' : (isMine ? '#10B981' : '#059669')}; flex-shrink: 0; box-shadow: 0 1px 3px rgba(0,0,0,0.06); margin-top: 1px;">
          <div class="stream-msg-bubble-col" style="max-width: 85%; display: flex; flex-direction: column; ${isMine ? 'align-items: flex-end;' : 'align-items: flex-start;'}">
            
            <!-- Compact Sender Header (Only for incoming messages) -->
            ${!isMine ? `
              <div class="stream-msg-sender-wrap" style="display: flex; gap: 0.35rem; align-items: center; font-size: 0.72rem; margin-bottom: 0.15rem; flex-wrap: wrap;">
                <strong class="stream-msg-sender-name" style="color: ${isFaculty ? '#B45309' : 'var(--text-mahogany, #5A2E25)'}; font-weight: 800;">
                  ${escapeHtml(m.user?.name || 'User')}
                </strong>
                <span class="stream-msg-badge" style="background: ${identity.badgeBg}; color: ${identity.badgeColor}; border: 1px solid ${identity.badgeBorder}; font-size: 0.62rem; font-weight: 800; padding: 0.05rem 0.35rem; border-radius: 3px; display: inline-flex; align-items: center; gap: 0.2rem;">
                  ${identity.badgeText}
                </span>
              </div>
            ` : ''}

            <!-- Message Bubble -->
            ${bubbleContentHtml}
          </div>
        </div>
      `;
    }).join('');
  }

  function getCategoriesList() {
    const isAdmin = currentUser?.role === 'admin';
    const rawEnrolled = resolveStudentBatches();
    const primaryBatch = rawEnrolled[0] || resolveBatchId() || 'BAT-10';
    const enrolledBatches = (!isAdmin && rawEnrolled.length === 0) ? [primaryBatch] : rawEnrolled;
    const allCats = ['ALL', 'Senior Secondary', 'Secondary', 'Junior & Middle', 'Special English'];
    if (isAdmin) return allCats;
    const catSet = new Set();
    Object.entries(CHANNEL_IDENTITIES).forEach(([id, meta]) => {
      if (enrolledBatches.includes(meta.batchId) && meta.category) {
        catSet.add(meta.category);
      }
    });
    const arr = Array.from(catSet);
    return arr.length > 1 ? ['ALL', ...arr] : (arr.length === 1 ? arr : allCats);
  }

  function showHelpModal() {
    const isAdminUser = currentUser?.role === 'admin';
    if (isAdminUser) {
      alert('✨ Available Admin & Faculty Broadcast Commands:\n\n• 🚨 /imp <text> — Broadcast high-priority very important announcement in red alert banner\n• ⭐ /hg <text> — Broadcast highlighted announcement in gold callout banner\n• 🔇 /mute @<student> — Mute student from sending messages in this class\n• 🔊 /unmute @<student> — Unmute student and restore message permissions\n• 📌 /pin <text> — Post and immediately pin announcement to the top\n• 📢 /notice <text> — Broadcast official class notice\n• 📎 Paperclip icon — Upload PDF notes & study images (up to 20 MB)\n• ↩️ Reply button — Reply to any student message with quote reference\n• 🧹 /clear — Clear group message history\n• @<name> — Mention / tag specific student\n• /help — Show this help menu');
    } else {
      alert('✨ Available Student Commands:\n\n• ❓ Question button or /quest <doubt> — Ask academic doubt / question (highlighted in indigo card for mentors & classmates)\n• ↩️ Reply button — Reply directly to classmate or faculty message\n• 📁 Class Media tab — Browse & download all PDFs, chapter notes & diagrams\n• @<name> — Mention a classmate or student\n• /help — Show commands');
    }
  }

  function renderReplyBarHtml() {
    if (!replyingToMessage) return '';
    return `
      <div id="stream-reply-bar" style="background: #ECFDF5; border-top: 1.5px solid #6EE7B7; border-bottom: 1px solid #A7F3D0; padding: 0.35rem 0.85rem; display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; font-size: 0.76rem; color: #065F46; flex-shrink: 0; animation: fadeIn 0.15s ease;">
        <div style="display: flex; align-items: center; gap: 0.45rem; overflow: hidden; flex: 1;">
          <div style="width: 22px; height: 22px; border-radius: 50%; background: #059669; color: #FFF; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; flex-shrink: 0;">
            <i class="fa-solid fa-reply"></i>
          </div>
          <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            <span>Replying to <strong>@${escapeHtml(replyingToMessage.author || 'User')}</strong></span>
            <span style="color: #475569; font-style: italic; margin-left: 0.35rem; font-size: 0.72rem;">"${escapeHtml(replyingToMessage.text ? replyingToMessage.text.substring(0, 75) : 'Message')}"</span>
          </div>
        </div>
        <button type="button" id="btn-cancel-reply" style="background: #D1FAE5; border: none; color: #065F46; font-size: 0.75rem; cursor: pointer; padding: 0.2rem 0.45rem; border-radius: 4px; font-weight: 800; display: inline-flex; align-items: center; gap: 0.2rem;" title="Cancel reply (Esc)" aria-label="Cancel reply">
          <i class="fa-solid fa-xmark"></i> <span>Cancel</span>
        </button>
      </div>
    `;
  }

  function renderPinnedBarHtml(pinnedMessages, isAdmin) {
    if (!pinnedMessages || !pinnedMessages.length) return '';
    const latestPin = pinnedMessages[pinnedMessages.length - 1];
    return `
      <div id="stream-pinned-bar" style="background: #FFFBEB; border-bottom: 1.5px solid #FCD34D; padding: 0.35rem 0.85rem; display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; font-size: 0.76rem; color: #92400E; flex-shrink: 0; box-shadow: 0 1px 4px rgba(0,0,0,0.03);">
        <div style="display: flex; align-items: center; gap: 0.45rem; overflow: hidden; flex: 1;">
          <span style="background: #F59E0B; color: #FFF; padding: 0.1rem 0.4rem; border-radius: 4px; font-size: 0.65rem; font-weight: 900; display: inline-flex; align-items: center; gap: 0.25rem; flex-shrink: 0; letter-spacing: 0.3px;">
            <i class="fa-solid fa-thumbtack" aria-hidden="true"></i> PINNED (${pinnedMessages.length})
          </span>
          <span class="pinned-preview-text" style="font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #78350F; font-size: 0.78rem;">
            ${escapeHtml(latestPin.text || '')}
          </span>
        </div>
        <div style="display: flex; align-items: center; gap: 0.35rem; flex-shrink: 0;">
          <button type="button" class="btn-jump-pin" data-msg-id="${escapeHtml(latestPin.id)}" style="background: #FEF3C7; color: #B45309; border: 1px solid #FCD34D; font-size: 0.7rem; font-weight: 800; padding: 0.18rem 0.5rem; border-radius: 5px; cursor: pointer; display: inline-flex; align-items: center; gap: 0.25rem;" title="Jump to pinned message">
            <i class="fa-solid fa-arrow-down" aria-hidden="true"></i> Jump
          </button>
          ${isAdmin ? `
            <button type="button" class="btn-unpin-msg" data-unpin-msg="${escapeHtml(latestPin.id)}" style="background: none; border: none; color: #DC2626; font-size: 0.85rem; cursor: pointer; padding: 0.15rem 0.35rem;" title="Unpin this announcement">
              <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }

  function renderPinnedBarAndList(targetPane) {
    try {
      const panes = targetPane ? [targetPane] : getAllCommunityPanes();
      const messages = (activeChannel?.state?.messages || []).filter(m => !m.deleted_at);
      const pinnedMessages = messages.filter(m => m.pinned || m.is_pinned || Boolean(m.pinned_at));
      const isAdmin = Boolean(currentUser?.role === 'admin' || (typeof AppState !== 'undefined' && AppState.adminLoggedIn));

      const renderedHtml = renderMsgList(messages);
      const renderedPinsHtml = renderPinnedBarHtml(pinnedMessages, isAdmin);

      if (panes && panes.length > 0) {
        panes.forEach(pane => {
          const pinWrapper = pane.querySelector('#stream-pinned-bar-wrapper');
          if (pinWrapper) {
            pinWrapper.innerHTML = renderedPinsHtml;
          }
          const list = pane.querySelector('#stream-msg-list');
          if (list) {
            list.innerHTML = renderedHtml;
            list.scrollTop = list.scrollHeight;
          }
        });
      }

      // Direct universal update across all mounted message lists in document
      const msgLists = document.querySelectorAll('#stream-msg-list');
      msgLists.forEach(list => {
        list.innerHTML = renderedHtml;
        list.scrollTop = list.scrollHeight;
      });

      const pinWrappers = document.querySelectorAll('#stream-pinned-bar-wrapper');
      pinWrappers.forEach(pinWrapper => {
        pinWrapper.innerHTML = renderedPinsHtml;
      });

      // Update Media Gallery if media view is active
      if (activeChatViewMode === 'media') {
        const activeMeta = CHANNEL_IDENTITIES[activeChannelId] || { shortName: 'Class Forum' };
        const mediaList = getMediaAttachmentsFromMessages(messages);
        document.querySelectorAll('.stream-media-gallery-wrap').forEach(mediaWrap => {
          mediaWrap.outerHTML = renderMediaGalleryHtml(mediaList, activeMeta);
        });
      }

      // Render Page 1 PDF thumbnails lazily across all wrappers
      document.querySelectorAll('.stream-chat-wrapper').forEach(wrap => {
        renderPdfPage1Thumbnails(wrap);
      });
    } catch (err) {
      console.warn('[StreamChat renderPinnedBarAndList warning]', err);
    }
  }

  function renderMobileLaunchCardHtml(activeMeta, onlineCount, isAdmin) {
    return `
      <div class="stream-mobile-launch-wrap">
        <div class="stream-mobile-launch-card">
          <div class="stream-mobile-card-top-stripe"></div>

          <div class="stream-mobile-card-avatar">
            ${activeMeta.icon || '💬'}
          </div>

          <div class="stream-mobile-live-badge">
            <span class="stream-live-pulse-dot"></span>
            <span>${onlineCount} Active Online</span>
          </div>

          <h3 class="stream-mobile-card-title">
            ${escapeHtml(activeMeta.name || 'Pragyan Class Forum')}
          </h3>
          
          <div class="stream-mobile-card-subtitle">
            👨‍🏫 <strong>${escapeHtml(activeMeta.mentors || 'Faculty Team')}</strong>
            <p style="margin: 0.25rem 0 0 0; color: #64748B; font-size: 0.8rem; line-height: 1.4;">
              ${escapeHtml(activeMeta.tagline || 'Live doubts, discussions, and study materials')}
            </p>
          </div>

          <div class="stream-mobile-features-list">
            <div class="stream-mobile-feature-row">
              <span>❓</span>
              <div>
                <strong>Ask Academic Doubts</strong>
                <p>Send doubts to mentors using /quest</p>
              </div>
            </div>
            <div class="stream-mobile-feature-row">
              <span>📁</span>
              <div>
                <strong>Class Notes & PDFs</strong>
                <p>Access diagrams, PDFs & formula sheets</p>
              </div>
            </div>
            <div class="stream-mobile-feature-row">
              <span>⭐</span>
              <div>
                <strong>Verified Announcements</strong>
                <p>Official faculty updates & urgent alerts</p>
              </div>
            </div>
          </div>

          <button type="button" id="btn-enter-mobile-chat" class="btn btn-emerald stream-launch-chat-btn" onclick="if(window.PragyanStreamChat && typeof window.PragyanStreamChat.openMobileFullscreen === 'function'){window.PragyanStreamChat.openMobileFullscreen();}" title="Open Fullscreen Class Chat">
            <i class="fa-solid fa-comments" aria-hidden="true"></i>
            <span>Enter Class Chat</span>
            <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    `;
  }

  function openMobileFullscreen(targetContainer) {
    isMobileChatOpen = true;
    if (typeof document !== 'undefined') {
      document.body.classList.add('stream-body-fullscreen-lock');
    }
    const pane = targetContainer || getActiveCommunityPane();
    if (pane) {
      renderUI(pane);
    } else {
      getAllCommunityPanes().forEach(p => renderUI(p));
    }
  }

  function renderUI(container) {
    if (!container) return;
    const isAdmin = Boolean(currentUser?.role === 'admin' || (typeof AppState !== 'undefined' && AppState.adminLoggedIn));
    const rawEnrolled = resolveStudentBatches();
    const primaryBatch = rawEnrolled[0] || resolveBatchId() || 'BAT-10';
    const enrolledBatches = (!isAdmin && rawEnrolled.length === 0) ? [primaryBatch] : rawEnrolled;
    const channelList = Array.from(channelsMap.entries());

    const filteredChannels = channelList.filter(([id]) => {
      const meta = CHANNEL_IDENTITIES[id] || {};
      if (!isAdmin && meta.batchId && !enrolledBatches.includes(meta.batchId)) {
        return false;
      }
      const matchCat = selectedCategory === 'ALL' || meta.category === selectedCategory;
      const matchSearch = !searchQuery ||
        (meta.name && meta.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (meta.shortName && meta.shortName.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (meta.tagline && meta.tagline.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchCat && matchSearch;
    });

    const activeMeta = CHANNEL_IDENTITIES[activeChannelId] || {
      id: activeChannelId,
      name: activeChannel?.data?.name || 'Class Forum',
      shortName: 'Class Forum',
      icon: '💬',
      category: 'General',
      badgeColor: '#059669',
      tagline: 'Active class forum discussion',
      mentors: 'Faculty Team',
      bannerBg: 'linear-gradient(135deg, #064E3B 0%, #047857 100%)',
      accentBorder: '#10B981'
    };

    const studentCount = getStudentCountForBatch(activeMeta.batchId);
    const onlineCount = activeChannel?.state?.watcher_count || 1;
    const categories = getCategoriesList();
    const showCatBar = (isAdmin || categories.length > 1) && filteredChannels.length > 1;
    const showChBar = isAdmin || filteredChannels.length > 1;
    const messages = (activeChannel?.state?.messages || []).filter(m => !m.deleted_at);
    const pinnedMessages = messages.filter(m => m.pinned || m.is_pinned || Boolean(m.pinned_at));
    const mediaList = getMediaAttachmentsFromMessages(messages);
    const isMobileView = (typeof window !== 'undefined' && (window.innerWidth <= 768 || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)));

    // On mobile devices, show the Entry Gateway card first unless the user explicitly entered chat
    if (isMobileView && !isMobileChatOpen) {
      document.body.classList.remove('stream-body-fullscreen-lock');
      container.innerHTML = renderMobileLaunchCardHtml(activeMeta, onlineCount, isAdmin);
      const launchBtn = container.querySelector('#btn-enter-mobile-chat');
      if (launchBtn) {
        const handleLaunch = (e) => {
          if (e) {
            e.preventDefault();
            e.stopPropagation();
          }
          openMobileFullscreen(container);
        };
        launchBtn.onclick = handleLaunch;
        launchBtn.addEventListener('click', handleLaunch);
        launchBtn.addEventListener('touchend', handleLaunch);
      }
      wireEvents(container);
      return;
    }

    if (isMobileView && isMobileChatOpen) {
      document.body.classList.add('stream-body-fullscreen-lock');
    }

    const fullscreenBtnHtml = isMobileView
      ? `<button type="button" id="btn-stream-fullscreen" class="btn-stream-fullscreen btn-mobile-exit" title="Exit Community Chat and return to tab" aria-label="Exit Community Chat" style="background: rgba(255,255,255,0.18); color: #FFFFFF; border: 1px solid rgba(255,255,255,0.3); border-radius: 6px; padding: 0.22rem 0.55rem; font-size: 0.76rem; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; gap: 0.3rem; transition: all 0.15s ease;">
          <i class="fa-solid fa-arrow-left" aria-hidden="true"></i> <span>Back</span>
        </button>`
      : `<button type="button" id="btn-stream-fullscreen" class="btn-stream-fullscreen" title="Toggle Fullscreen View" aria-label="Toggle Fullscreen View" style="background: rgba(255,255,255,0.18); color: #FFFFFF; border: 1px solid rgba(255,255,255,0.28); border-radius: 6px; padding: 0.22rem 0.6rem; font-size: 0.74rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 0.3rem; transition: all 0.15s ease;">
          <i class="fa-solid fa-expand" aria-hidden="true"></i> <span>Fullscreen</span>
        </button>`;

    container.innerHTML = `
      <div class="stream-chat-wrapper">
        
        <!-- TOP APP BAR & LIVE STATUS & FULLSCREEN CONTROLS -->
        <div class="stream-top-bar" style="background: #042E23; color: #FFFFFF; padding: 0.4rem 0.75rem; display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.1); flex-shrink: 0; min-height: 42px; box-sizing: border-box;">
          <div style="display: flex; align-items: center; gap: 0.45rem; overflow: hidden; min-width: 0; flex: 1;">
            ${fullscreenBtnHtml}
            <div style="width: 26px; height: 26px; border-radius: 6px; background: rgba(16, 185, 129, 0.2); color: #34D399; display: flex; align-items: center; justify-content: center; font-size: 0.95rem; flex-shrink: 0;">
              ${activeMeta.icon}
            </div>
            <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;">
              <span style="font-weight: 800; font-size: 0.88rem; color: #FFFFFF; letter-spacing: -0.01em;">
                Pragyan Community
              </span>
              <span class="stream-top-title-extra" style="font-size: 0.72rem; color: #A7F3D0; margin-left: 0.35rem; opacity: 0.85;">
                • ${isAdmin ? '🛡️ Multi-Class Hub' : `🎓 ${escapeHtml(activeMeta.shortName)}`}
              </span>
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0;">
            <div style="font-size: 0.72rem; color: #D1FAE5; white-space: nowrap; display: flex; align-items: center; gap: 0.35rem; background: rgba(255,255,255,0.08); padding: 0.2rem 0.55rem; border-radius: 99px; border: 1px solid rgba(255,255,255,0.15);">
              <span style="width: 7px; height: 7px; border-radius: 50%; background: #34D399; display: inline-block; box-shadow: 0 0 6px #34D399;"></span>
              <span id="stream-online-count" style="font-weight: 700;">${onlineCount} active</span>
            </div>
          </div>
        </div>

        ${showCatBar ? `
        <!-- CATEGORIES FILTER BAR -->
        <div class="stream-cat-bar" style="background: #F8FAFC; padding: 0.35rem 0.75rem; border-bottom: 1px solid #E2E8F0; display: flex; gap: 0.35rem; align-items: center; overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; flex-shrink: 0;">
          ${categories.map(cat => `
            <button type="button" class="stream-cat-pill ${cat === selectedCategory ? 'active' : ''}" data-cat-name="${escapeHtml(cat)}" style="font-size: 0.72rem; font-weight: 800; padding: 0.2rem 0.55rem; border-radius: 99px; border: 1px solid ${cat === selectedCategory ? '#064E3B' : '#CBD5E1'}; background: ${cat === selectedCategory ? '#064E3B' : '#FFFFFF'}; color: ${cat === selectedCategory ? '#FFFFFF' : '#475569'}; cursor: pointer; white-space: nowrap; transition: all 0.15s ease;">
              ${cat === 'ALL' ? '🌟 All Channels' : escapeHtml(cat)}
            </button>
          `).join('')}
        </div>
        ` : ''}

        ${showChBar ? `
        <!-- CHANNELS HORIZONTAL SCROLL BAR -->
        <div class="stream-channels-scroll-wrap" style="display: flex; gap: 0.35rem; overflow-x: auto; -webkit-overflow-scrolling: touch; padding: 0.4rem 0.75rem; background: #FFFFFF; border-bottom: 1.5px solid var(--border-sand, #E2E8F0); scrollbar-width: none; flex-shrink: 0;">
          ${filteredChannels.map(([id]) => {
            const meta = CHANNEL_IDENTITIES[id] || {};
            const isCur = id === activeChannelId;
            const isEnrolled = enrolledBatches.includes(meta.batchId);
            return `
              <button type="button" class="stream-ch-pill ${isCur ? 'active' : ''} ${isEnrolled ? 'stream-ch-enrolled' : ''}" data-ch-id="${escapeHtml(id)}" style="display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.76rem; font-weight: 800; padding: 0.28rem 0.65rem; border-radius: 8px; border: 1.5px solid ${isCur ? meta.badgeColor || '#064E3B' : (isEnrolled ? '#6EE7B7' : '#E2E8F0')}; background: ${isCur ? (meta.badgeColor || '#064E3B') : (isEnrolled ? '#ECFDF5' : '#FFFFFF')}; color: ${isCur ? '#FFFFFF' : (isEnrolled ? '#065F46' : '#334155')}; cursor: pointer; white-space: nowrap; flex-shrink: 0; transition: all 0.15s ease; box-shadow: ${isCur ? '0 2px 6px rgba(0,0,0,0.1)' : 'none'};">
                <span>${meta.icon || '💬'}</span>
                <span>${escapeHtml(meta.shortName || meta.name || id)}</span>
                ${isEnrolled ? `<span style="font-size: 0.65rem; background: ${isCur ? 'rgba(255,255,255,0.25)' : '#A7F3D0'}; color: ${isCur ? '#FFF' : '#064E3B'}; padding: 1px 4px; border-radius: 3px; font-weight: 800;">★ My Class</span>` : ''}
              </button>
            `;
          }).join('')}
        </div>
        ` : ''}

        <!-- ACTIVE CHANNEL CONDENSED HERO BANNER & VIEW SWITCHER (Discussion vs Media) -->
        <div class="stream-active-banner" style="background: ${activeMeta.bannerBg}; color: #FFFFFF; padding: 0.35rem 0.75rem; border-bottom: 1.5px solid ${activeMeta.accentBorder}; display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; flex-shrink: 0; min-width: 0; box-sizing: border-box;">
          <div class="stream-banner-left" style="display: flex; align-items: center; gap: 0.45rem; min-width: 0; flex: 1; overflow: hidden;">
            <div class="stream-banner-icon" style="width: 32px; height: 32px; border-radius: 8px; background: rgba(255,255,255,0.18); display: flex; align-items: center; justify-content: center; font-size: 1.2rem; flex-shrink: 0; border: 1px solid rgba(255,255,255,0.25);">
              ${activeMeta.icon}
            </div>
            <div style="min-width: 0; flex: 1; overflow: hidden;">
              <div style="display: flex; align-items: center; gap: 0.35rem; min-width: 0;">
                <h3 style="margin: 0; font-size: 0.92rem; font-weight: 900; color: #FFFFFF; letter-spacing: -0.01em; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;">
                  ${escapeHtml(activeMeta.name)}
                </h3>
                <span class="stream-banner-cat-badge" style="font-size: 0.65rem; background: rgba(255,255,255,0.2); padding: 0.1rem 0.35rem; border-radius: 4px; font-weight: 800; flex-shrink: 0;">
                  ${escapeHtml(activeMeta.category)}
                </span>
              </div>
              <div class="stream-banner-tagline" style="font-size: 0.72rem; opacity: 0.92; color: #F0FDF4; line-height: 1.2; margin-top: 0.1rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                👨‍🏫 Mentors: <strong>${escapeHtml(activeMeta.mentors)}</strong> • ${escapeHtml(activeMeta.tagline)}
              </div>
            </div>
          </div>

          <div class="stream-banner-actions" style="display: flex; align-items: center; gap: 0.35rem; flex-shrink: 0;">
            <!-- VIEW MODE TOGGLE PILLS: 💬 Discussion / 📁 Class Media -->
            <div class="stream-view-toggle-wrap" style="display: inline-flex; background: rgba(0,0,0,0.25); padding: 2px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.15); flex-shrink: 0;">
              <button type="button" class="btn-view-mode ${activeChatViewMode === 'chat' ? 'active' : ''}" data-view-mode="chat" style="background: ${activeChatViewMode === 'chat' ? '#FFFFFF' : 'transparent'}; color: ${activeChatViewMode === 'chat' ? '#064E3B' : '#E2E8F0'}; border: none; border-radius: 4px; font-size: 0.7rem; font-weight: 800; padding: 0.18rem 0.45rem; cursor: pointer; display: inline-flex; align-items: center; gap: 0.2rem; transition: all 0.15s ease;">
                <span>💬 Chat</span>
              </button>
              <button type="button" class="btn-view-mode ${activeChatViewMode === 'media' ? 'active' : ''}" data-view-mode="media" style="background: ${activeChatViewMode === 'media' ? '#FFFFFF' : 'transparent'}; color: ${activeChatViewMode === 'media' ? '#064E3B' : '#E2E8F0'}; border: none; border-radius: 4px; font-size: 0.7rem; font-weight: 800; padding: 0.18rem 0.45rem; cursor: pointer; display: inline-flex; align-items: center; gap: 0.2rem; transition: all 0.15s ease;">
                <span>📁 Media & Notes</span>
                ${mediaList.length > 0 ? `<span style="background: ${activeChatViewMode === 'media' ? '#064E3B' : 'rgba(255,255,255,0.3)'}; color: ${activeChatViewMode === 'media' ? '#FFF' : '#FFF'}; font-size: 0.6rem; padding: 1px 4px; border-radius: 99px;">${mediaList.length}</span>` : ''}
              </button>
            </div>

            ${isAdmin ? `
              <button type="button" class="btn-clear-group-chat" data-ch-id="${escapeHtml(activeChannelId)}" data-ch-name="${escapeHtml(activeMeta.name)}" style="background: rgba(220, 38, 38, 0.25); color: #FCA5A5; border: 1px solid rgba(239, 68, 68, 0.4); font-size: 0.7rem; font-weight: 800; padding: 0.18rem 0.45rem; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 0.25rem; flex-shrink: 0;" title="Clear group messages">
                <i class="fa-solid fa-trash-can" aria-hidden="true"></i> <span>Clear</span>
              </button>
            ` : ''}
          </div>
        </div>

        <!-- STICKY PINNED MESSAGES BANNER CONTAINER (Only in Chat mode) -->
        <div id="stream-pinned-bar-wrapper">
          ${activeChatViewMode === 'chat' ? renderPinnedBarHtml(pinnedMessages, isAdmin) : ''}
        </div>

        <!-- MAIN VIEW: MESSAGES FEED OR MEDIA GALLERY -->
        ${activeChatViewMode === 'media' ? `
          ${renderMediaGalleryHtml(mediaList, activeMeta)}
        ` : `
          <div id="stream-msg-list" style="flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 0.75rem 0.85rem; background: #FAF9F6; display: flex; flex-direction: column;">
            ${renderMsgList(messages)}
          </div>
        `}

        <!-- REALTIME TYPING NOTIFIER -->
        <div id="stream-typing-box" style="padding: 0.15rem 0.85rem; font-size: 0.72rem; color: #64748B; font-style: italic; min-height: 18px; background: #FAF9F6; border-top: 1px solid rgba(0,0,0,0.03);"></div>

        <!-- REPLYING PREVIEW BANNER CONTAINER -->
        <div id="stream-reply-bar-wrapper">
          ${renderReplyBarHtml()}
        </div>

        <!-- FLOATING AUTOCOMPLETE DROPDOWN (@MENTIONS & /SLASH COMMANDS) -->
        <div id="stream-autocomplete-box" style="display: none; position: absolute; bottom: 58px; left: 0.75rem; right: 0.75rem; max-height: 220px; overflow-y: auto; background: #FFFFFF; border: 1.5px solid var(--border-sand, #CBD5E1); border-radius: 10px; box-shadow: 0 12px 35px rgba(0,0,0,0.16); z-index: 9999; padding: 0.3rem 0;"></div>

        ${isCurrentUserMuted() ? `
          <!-- Muted Student Warning Banner -->
          <div id="stream-muted-banner" style="background: #FEF2F2; color: #991B1B; border-top: 1.5px solid #FCA5A5; padding: 0.45rem 0.85rem; font-size: 0.78rem; font-weight: 800; display: flex; align-items: center; justify-content: center; gap: 0.4rem; flex-shrink: 0; box-shadow: inset 0 1px 3px rgba(0,0,0,0.05);">
            <i class="fa-solid fa-microphone-slash" style="color: #DC2626; font-size: 0.95rem;"></i>
            <span>You have been muted by faculty for this class. You cannot send messages until unmuted by an instructor.</span>
          </div>
        ` : ''}

        <!-- COMPOSER INPUT BAR -->
        <form id="stream-chat-form" style="display: flex; align-items: center; gap: 0.4rem; padding: 0.55rem 0.85rem; background: ${isCurrentUserMuted() ? '#F8FAFC' : '#FFFFFF'}; border-top: 1.5px solid var(--border-sand, #DDD5CD); flex-shrink: 0; position: relative;">
          ${isAdmin ? `
            <!-- Admin Attach File (PDF / Images up to 20MB) -->
            <button type="button" id="btn-stream-attach" title="Attach PDF notes or image (up to 20 MB)" style="background: #ECFDF5; color: #065F46; border: 1.5px solid #A7F3D0; width: 38px; height: 38px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; font-size: 1rem; cursor: pointer; flex-shrink: 0; transition: all 0.15s ease;" aria-label="Attach PDF or Image">
              <i class="fa-solid fa-paperclip"></i>
            </button>
            <input type="file" id="stream-file-input" accept="application/pdf,image/png,image/jpeg,image/webp,image/gif" style="display: none;">
            
            <button type="button" id="btn-quick-hg" title="Highlight announcement (/hg)" style="background: #FEF3C7; color: #D97706; border: 1.5px solid #FCD34D; width: 38px; height: 38px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; font-size: 1rem; cursor: pointer; flex-shrink: 0;" aria-label="Toggle Highlight prefix">
              ⭐
            </button>
          ` : `
            <!-- Student Quick Question Button -->
            <button type="button" id="btn-quick-quest" ${isCurrentUserMuted() ? 'disabled' : ''} title="Ask academic question / doubt (/quest)" style="background: ${isCurrentUserMuted() ? '#F1F5F9' : '#EEF2FF'}; color: ${isCurrentUserMuted() ? '#94A3B8' : '#4F46E5'}; border: 1.5px solid ${isCurrentUserMuted() ? '#CBD5E1' : '#C7D2FE'}; width: 38px; height: 38px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; font-size: 1rem; cursor: ${isCurrentUserMuted() ? 'not-allowed' : 'pointer'}; flex-shrink: 0;" aria-label="Ask Question prefix">
              ❓
            </button>
          `}
          <input type="text" id="stream-msg-input" class="portal-input" ${isCurrentUserMuted() ? 'disabled' : ''} placeholder="${isCurrentUserMuted() ? '🔒 You have been muted by faculty in this class' : (isAdmin ? 'Type announcement, @mention, /hg, /imp, /mute, /notice, or attach notes…' : `Message ${escapeHtml(activeMeta.shortName)} (use /quest for doubts)…`)}" style="flex: 1; border-radius: 8px; font-size: 16px; min-height: 40px; padding: 0.45rem 0.85rem; border: 1.5px solid var(--border-sand, #CBD5E1); background: ${isCurrentUserMuted() ? '#F1F5F9' : '#FAF9F6'}; color: ${isCurrentUserMuted() ? '#94A3B8' : '#1E293B'}; cursor: ${isCurrentUserMuted() ? 'not-allowed' : 'text'}; transition: border-color 0.2s;" autocomplete="off" aria-label="Chat message">
          <button type="submit" class="btn btn-emerald" id="btn-stream-send" ${isCurrentUserMuted() ? 'disabled' : ''} style="padding: 0.45rem 1.15rem; font-weight: 800; border-radius: 8px; display: inline-flex; align-items: center; gap: 0.35rem; min-height: 40px; font-size: 0.85rem; flex-shrink: 0; box-shadow: 0 2px 8px rgba(6,78,59,0.2); opacity: ${isCurrentUserMuted() ? '0.5' : '1'}; cursor: ${isCurrentUserMuted() ? 'not-allowed' : 'pointer'};">
            <span>Send</span> <i class="fa-solid fa-paper-plane" aria-hidden="true"></i>
          </button>
        </form>
      </div>
    `;

    wireEvents(container);
    if (activeChatViewMode === 'chat') {
      scrollBottom(container);
    }
    renderPdfPage1Thumbnails(container);
  }



  async function handlePinAction(messageId, pin = true) {
    if (!messageId) return;
    const token = (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('pragyan_portal_token')) || '';

    // Update in-memory message state
    if (activeChannel?.state?.messages) {
      const msg = activeChannel.state.messages.find(m => m.id === messageId);
      if (msg) {
        msg.pinned = Boolean(pin);
        msg.is_pinned = Boolean(pin);
        msg.pinned_at = pin ? new Date().toISOString() : null;
      }
    }

    try {
      if (client) {
        if (pin) {
          try { await client.pinMessage({ id: messageId }); } catch (_) {}
        } else {
          try { await client.unpinMessage({ id: messageId }); } catch (_) {}
        }
      }

      // Server-side pin sync to broadcast real-time event to all students
      if (token) {
        await fetch('/api/health?action=stream-pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ messageId, pin: Boolean(pin) })
        }).catch(() => null);
      }

      renderPinnedBarAndList();
    } catch (err) {
      console.warn('[Pin action warning]', err);
      renderPinnedBarAndList();
    }
  }

  async function handleMuteAction(targetUserId, studentName, shouldMute, containerEl) {
    if (!targetUserId) return;
    const token = (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('pragyan_portal_token')) || '';
    const targetPane = containerEl || getActiveCommunityPane();

    try {
      const res = await fetch(`/api/health?action=${shouldMute ? 'stream-mute' : 'stream-unmute'}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          studentId: targetUserId,
          studentName: studentName || '',
          channelId: activeChannelId,
          channelType: 'livestream'
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Server mute request failed');
      }

      // Update local channel data
      if (activeChannel?.data) {
        let mutedList = Array.isArray(activeChannel.data.muted_users) ? [...activeChannel.data.muted_users] : [];
        if (shouldMute) {
          if (!mutedList.includes(targetUserId)) mutedList.push(targetUserId);
        } else {
          mutedList = mutedList.filter(id => id !== targetUserId);
        }
        activeChannel.data.muted_users = mutedList;
        activeChannel.data.muted_user_ids = mutedList;
      }

      if (targetPane) {
        renderUI(targetPane);
      }

      alert(`✅ Student ${studentName ? `@${studentName}` : targetUserId} has been ${shouldMute ? 'muted' : 'unmuted'} for this class.`);
    } catch (err) {
      console.error('[StreamChat Mute Error]', err);
      alert(`❌ Failed to ${shouldMute ? 'mute' : 'unmute'} student: ${err.message}`);
    }
  }

  async function handleMuteStudentCommand(targetArg, shouldMute, containerEl) {
    const cleanQuery = targetArg.replace(/^@/, '').trim().toLowerCase();
    const students = getStudentsListForMention('');
    let matchedStudent = students.find(s => {
      const sName = (s.name || s.studentName || '').toLowerCase();
      const sRoll = String(s.rollNo || s.roll_no || s.student_id || '').toLowerCase();
      const sId = String(s.id || '').toLowerCase();
      return sName === cleanQuery || sRoll === cleanQuery || sId === cleanQuery || sName.includes(cleanQuery);
    });

    let targetUserId = '';
    let studentDisplayName = '';

    if (matchedStudent) {
      const rollOrId = matchedStudent.rollNo || matchedStudent.roll_no || matchedStudent.student_id || matchedStudent.id;
      targetUserId = `student_${String(rollOrId).toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '')}`;
      studentDisplayName = matchedStudent.name || matchedStudent.studentName || rollOrId;
    } else {
      targetUserId = cleanQuery.startsWith('student_') ? cleanQuery : `student_${cleanQuery.replace(/[^a-zA-Z0-9_-]/g, '')}`;
      studentDisplayName = targetArg;
    }

    await handleMuteAction(targetUserId, studentDisplayName, shouldMute, containerEl);
  }

  function wireEvents(container) {
    if (!container) return;
    if (container._streamEventsBound) return;
    container._streamEventsBound = true;

    // Support Esc key globally to exit fullscreen or cancel reply
    if (!window._streamEscHandlerBound) {
      window._streamEscHandlerBound = true;
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          if (replyingToMessage) {
            replyingToMessage = null;
            updateReplyBar();
          }
          const isMobileScreen = (typeof window !== 'undefined' && (window.innerWidth <= 768 || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)));
          if (isMobileScreen && isMobileChatOpen) {
            isMobileChatOpen = false;
            document.body.classList.remove('stream-body-fullscreen-lock');
            getAllCommunityPanes().forEach(pane => renderUI(pane));
            return;
          }
          const activeFullWrapper = document.querySelector('.stream-chat-wrapper.stream-fullscreen');
          if (activeFullWrapper) {
            activeFullWrapper.classList.remove('stream-fullscreen');
            document.body.classList.remove('stream-body-fullscreen-lock');
            const fsBtn = activeFullWrapper.querySelector('#btn-stream-fullscreen');
            if (fsBtn) {
              fsBtn.innerHTML = '<i class="fa-solid fa-expand" aria-hidden="true"></i> <span>Fullscreen</span>';
              fsBtn.title = 'Toggle Fullscreen View';
            }
            scrollBottom();
          }
        }
      });
    }

    // Support mobile visualViewport resize & keyboard adjustments
    if (typeof window !== 'undefined' && window.visualViewport && !window._streamViewportBound) {
      window._streamViewportBound = true;
      const onViewportChange = () => {
        const activeFullWrapper = document.querySelector('.stream-chat-wrapper.stream-fullscreen');
        if (activeFullWrapper) {
          activeFullWrapper.style.height = `${window.visualViewport.height}px`;
        }
        scrollBottom();
      };
      window.visualViewport.addEventListener('resize', onViewportChange);
      window.visualViewport.addEventListener('scroll', onViewportChange);
    }

    // Support network offline & online reconnection lifecycle
    if (typeof window !== 'undefined' && !window._streamNetworkHandlerBound) {
      window._streamNetworkHandlerBound = true;
      window.addEventListener('offline', () => {
        const pane = getActiveCommunityPane();
        const typingBox = pane?.querySelector('#stream-typing-box');
        if (typingBox) {
          typingBox.innerHTML = '<span style="color: #DC2626; font-weight: 800;"><i class="fa-solid fa-wifi-slash"></i> Offline. Realtime connection paused...</span>';
        }
      });
      window.addEventListener('online', () => {
        const pane = getActiveCommunityPane();
        const typingBox = pane?.querySelector('#stream-typing-box');
        if (typingBox) {
          typingBox.innerHTML = '<span style="color: #059669; font-weight: 800;"><i class="fa-solid fa-wifi"></i> Online. Reconnected to class forum.</span>';
          setTimeout(() => { if (typingBox) typingBox.innerHTML = ''; }, 3000);
        }
        if (typeof window.PragyanStreamChat?.reconnect === 'function') {
          window.PragyanStreamChat.reconnect();
        }
      });
    }

    // Smooth scroll down when mobile input is focused
    const msgInput = container.querySelector('#stream-msg-input');
    if (msgInput) {
      msgInput.addEventListener('focus', () => {
        setTimeout(() => scrollBottom(container), 250);
      });
    }

    let autoSelectedIndex = 0;
    let autoMode = null; // 'slash' | 'mention' | null

    function hideAutocomplete() {
      const autoBox = container.querySelector('#stream-autocomplete-box');
      if (autoBox) {
        autoBox.style.display = 'none';
        autoBox.innerHTML = '';
      }
      autoMode = null;
      autoSelectedIndex = 0;
    }

    function renderSlashCommands(filterQuery) {
      const autoBox = container.querySelector('#stream-autocomplete-box');
      if (!autoBox) return;
      const q = filterQuery.toLowerCase().trim();
      const isAdminUser = currentUser?.role === 'admin';
      const availableCmds = SLASH_COMMANDS.filter(c => isAdminUser ? !c.studentOnly : !c.adminOnly);
      const filtered = availableCmds.filter(c => c.cmd.toLowerCase().includes(q) || c.label.toLowerCase().includes(q));
      if (!filtered.length) { hideAutocomplete(); return; }

      autoMode = 'slash';
      autoSelectedIndex = Math.min(autoSelectedIndex, filtered.length - 1);
      if (autoSelectedIndex < 0) autoSelectedIndex = 0;

      autoBox.innerHTML = `
        <div style="padding: 0.4rem 0.85rem; font-size: 0.74rem; font-weight: 800; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #F1F5F9; background: #FAF9F6;">
          ⚡ ${isAdminUser ? 'Admin & Faculty Broadcast Commands' : 'Student Question & Command Shortcuts'}
        </div>
        ${filtered.map((c, i) => `
          <div class="auto-item ${i === autoSelectedIndex ? 'active' : ''}" data-cmd="${escapeHtml(c.cmd)}" style="display: flex; align-items: center; justify-content: space-between; padding: 0.55rem 0.85rem; cursor: pointer; background: ${i === autoSelectedIndex ? '#ECFDF5' : '#FFFFFF'}; border-bottom: 1px solid #F8FAFC; transition: background 0.1s;">
            <div style="display: flex; align-items: center; gap: 0.6rem;">
              <span style="font-size: 1.15rem;">${c.icon}</span>
              <div>
                <div style="font-weight: 800; font-size: 0.88rem; color: #064E3B;">${escapeHtml(c.cmd)} <small style="color: #64748B; font-weight: 600;">${escapeHtml(c.label)}</small></div>
                <div style="font-size: 0.74rem; color: #64748B;">${escapeHtml(c.desc)}</div>
              </div>
            </div>
            <span style="font-size: 0.7rem; background: #F1F5F9; color: #475569; padding: 0.15rem 0.45rem; border-radius: 4px; font-weight: 700;">Select</span>
          </div>
        `).join('')}
      `;
      autoBox.style.display = 'block';
    }

    function renderMentions(filterQuery) {
      const autoBox = container.querySelector('#stream-autocomplete-box');
      if (!autoBox) return;
      const students = getStudentsListForMention(filterQuery);
      if (!students.length) { hideAutocomplete(); return; }

      autoMode = 'mention';
      autoSelectedIndex = Math.min(autoSelectedIndex, students.length - 1);
      if (autoSelectedIndex < 0) autoSelectedIndex = 0;

      autoBox.innerHTML = `
        <div style="padding: 0.4rem 0.85rem; font-size: 0.74rem; font-weight: 800; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #F1F5F9; background: #FAF9F6;">
          🎓 Mention Classmate / Student (${students.length})
        </div>
        ${students.map((s, i) => {
          const sName = s.name || s.studentName || 'Student';
          const sRoll = s.rollNo || s.roll_no || s.student_id || '';
          const sClass = s.className || s.class_name || 'Student';
          const sAvatar = s.photoUrl || s.photo_url || s.photo || '';
          return `
            <div class="auto-item ${i === autoSelectedIndex ? 'active' : ''}" data-mention="@${escapeHtml(sName)}" style="display: flex; align-items: center; justify-content: space-between; padding: 0.55rem 0.85rem; cursor: pointer; background: ${i === autoSelectedIndex ? '#ECFDF5' : '#FFFFFF'}; border-bottom: 1px solid #F8FAFC; transition: background 0.1s;">
              <div style="display: flex; align-items: center; gap: 0.6rem;">
                ${sAvatar ? `<img src="${escapeHtml(sAvatar)}" style="width: 28px; height: 28px; border-radius: 50%; object-fit: cover;">` : `<div style="width: 28px; height: 28px; border-radius: 50%; background: #064E3B; color: #FFF; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 800;">${sName.charAt(0)}</div>`}
                <div>
                  <div style="font-weight: 800; font-size: 0.86rem; color: #1E293B;">${escapeHtml(sName)}</div>
                  <div style="font-size: 0.74rem; color: #64748B;">${sRoll ? `Roll #${escapeHtml(sRoll)} • ` : ''}${escapeHtml(sClass)}</div>
                </div>
              </div>
              <span style="font-size: 0.72rem; background: #E0E7FF; color: #3730A3; padding: 0.15rem 0.45rem; border-radius: 4px; font-weight: 800;">@${escapeHtml(sRoll || 'Mention')}</span>
            </div>
          `;
        }).join('')}
      `;
      autoBox.style.display = 'block';
    }

    function insertMentionIntoInput(mentionText) {
      const input = container.querySelector('#stream-msg-input');
      if (!input) return;
      const val = input.value;
      const cursorPos = input.selectionStart ?? val.length;
      const textBeforeCursor = val.substring(0, cursorPos);
      const textAfterCursor = val.substring(cursorPos);
      const lastAt = textBeforeCursor.lastIndexOf('@');

      if (lastAt >= 0) {
        input.value = textBeforeCursor.substring(0, lastAt) + `${mentionText} ` + textAfterCursor;
      } else {
        input.value = `${val} ${mentionText} `;
      }
      hideAutocomplete();
      input.focus();
    }



    // --- DELEGATED CONTAINER CLICK LISTENER ---
    container.addEventListener('click', async e => {
      // 0. Mobile Enter Chat Launch Button
      const enterChatBtn = e.target.closest('#btn-enter-mobile-chat');
      if (enterChatBtn) {
        e.preventDefault();
        openMobileFullscreen(container);
        return;
      }

      // 1. Fullscreen Toggle / Mobile Chat Exit
      const fullscreenBtn = e.target.closest('#btn-stream-fullscreen');
      if (fullscreenBtn) {
        e.preventDefault();
        const isMobileScreen = (typeof window !== 'undefined' && (window.innerWidth <= 768 || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)));
        if (isMobileScreen) {
          isMobileChatOpen = false;
          document.body.classList.remove('stream-body-fullscreen-lock');
          renderUI(container);
          return;
        }

        const chatWrapper = container.querySelector('.stream-chat-wrapper');
        if (chatWrapper) {
          const isFull = chatWrapper.classList.toggle('stream-fullscreen');
          fullscreenBtn.innerHTML = isFull
            ? '<i class="fa-solid fa-compress" aria-hidden="true"></i> <span>Exit Fullscreen</span>'
            : '<i class="fa-solid fa-expand" aria-hidden="true"></i> <span>Fullscreen</span>';
          fullscreenBtn.title = isFull ? 'Exit Fullscreen Mode (Esc)' : 'Toggle Fullscreen View';
          if (isFull) {
            document.body.classList.add('stream-body-fullscreen-lock');
          } else {
            document.body.classList.remove('stream-body-fullscreen-lock');
          }
          scrollBottom(container);
        }
        return;
      }

      // 2. Channel Switcher Pill
      const chBtn = e.target.closest('.stream-ch-pill');
      if (chBtn) {
        e.preventDefault();
        const id = chBtn.dataset.chId;
        if (id && channelsMap.has(id) && id !== activeChannelId) {
          await switchChannel(id, container);
        }
        return;
      }

      // 3. Category Filter Pill
      const catBtn = e.target.closest('.stream-cat-pill');
      if (catBtn) {
        e.preventDefault();
        const cat = catBtn.dataset.catName;
        if (cat) {
          selectedCategory = cat;
          renderUI(container);
        }
        return;
      }

      // 4. Quick Highlight Prefix (/hg)
      const quickHgBtn = e.target.closest('#btn-quick-hg');
      if (quickHgBtn) {
        e.preventDefault();
        const input = container.querySelector('#stream-msg-input');
        if (input) {
          if (input.value.startsWith('/hg ')) {
            input.value = input.value.replace(/^\/hg\s*/i, '');
          } else {
            const cleaned = input.value.replace(/^\/(quest|question|pin|notice|highlight)\s*/i, '');
            input.value = `/hg ${cleaned.trim()}`;
          }
          hideAutocomplete();
          input.focus();
        }
        return;
      }

      // 5. Quick Question Prefix (/quest) - Students Only
      const quickQuestBtn = e.target.closest('#btn-quick-quest');
      if (quickQuestBtn) {
        e.preventDefault();
        const input = container.querySelector('#stream-msg-input');
        if (input) {
          if (input.value.startsWith('/quest ')) {
            input.value = input.value.replace(/^\/quest\s*/i, '');
          } else {
            const cleaned = input.value.replace(/^\/(hg|highlight|pin|notice|question|quest|ask)\s*/i, '');
            input.value = `/quest ${cleaned.trim()}`;
          }
          hideAutocomplete();
          input.focus();
        }
        return;
      }

      // 6. Admin Attach Paperclip Button
      const attachBtn = e.target.closest('#btn-stream-attach');
      if (attachBtn) {
        e.preventDefault();
        const fileInput = container.querySelector('#stream-file-input');
        if (fileInput) {
          fileInput.value = '';
          fileInput.click();
        }
        return;
      }

      // 7. Autocomplete Slash Command Item Click
      const autoCmdItem = e.target.closest('.auto-item[data-cmd]');
      if (autoCmdItem) {
        e.preventDefault();
        e.stopPropagation();
        const cmd = autoCmdItem.dataset.cmd;
        const input = container.querySelector('#stream-msg-input');
        if (cmd === '/clear') {
          if (input) input.value = '';
          hideAutocomplete();
          container.querySelector('.btn-clear-group-chat')?.click();
          return;
        }
        if (cmd === '/help') {
          if (input) input.value = '';
          hideAutocomplete();
          showHelpModal();
          return;
        }
        if (input) {
          input.value = `${cmd} `;
          hideAutocomplete();
          input.focus();
        }
        return;
      }

      // 8. Autocomplete Mention Item Click
      const autoMentionItem = e.target.closest('.auto-item[data-mention]');
      if (autoMentionItem) {
        e.preventDefault();
        e.stopPropagation();
        const mentionText = autoMentionItem.dataset.mention;
        insertMentionIntoInput(mentionText);
        return;
      }

      // 9. View Mode Toggle (💬 Chat / 📁 Media & Notes)
      const viewModeBtn = e.target.closest('.btn-view-mode');
      if (viewModeBtn) {
        e.preventDefault();
        const mode = viewModeBtn.dataset.viewMode;
        if (mode && mode !== activeChatViewMode) {
          activeChatViewMode = mode;
          renderUI(container);
        }
        return;
      }

      // 10. Media Filter Toggle (ALL / PDF / IMAGE)
      const filterBtn = e.target.closest('.btn-media-filter');
      if (filterBtn) {
        e.preventDefault();
        const filter = filterBtn.dataset.mediaFilter;
        if (filter && filter !== mediaFilterType) {
          mediaFilterType = filter;
          renderUI(container);
        }
        return;
      }

      // 11. Read PDF Lazy Reader Modal
      const readPdfBtn = e.target.closest('.btn-read-pdf');
      if (readPdfBtn) {
        e.preventDefault();
        const pdfUrl = readPdfBtn.dataset.pdfUrl;
        const pdfTitle = readPdfBtn.dataset.pdfTitle || 'PDF Notes';
        if (pdfUrl) {
          openPdfReaderModal(pdfUrl, pdfTitle);
        }
        return;
      }

      // 12. Image Lightbox Modal
      const imgTrigger = e.target.closest('.stream-img-lightbox-trigger');
      if (imgTrigger) {
        e.preventDefault();
        const imgUrl = imgTrigger.dataset.imgUrl || imgTrigger.src;
        const imgTitle = imgTrigger.dataset.imgTitle || 'Class Image';
        if (imgUrl) {
          openImageLightboxModal(imgUrl, imgTitle);
        }
        return;
      }

      // 13. Reply to message (Students, Faculty, and Admin)
      const replyBtn = e.target.closest('.btn-reply-msg');
      if (replyBtn) {
        e.preventDefault();
        const msgId = replyBtn.dataset.replyMsg;
        const author = replyBtn.dataset.replyAuthor || 'User';
        const text = replyBtn.dataset.replyText || '';
        if (msgId) {
          replyingToMessage = { id: msgId, author, text };
          updateReplyBar(container);
          const inputEl = container.querySelector('#stream-msg-input');
          if (inputEl) {
            inputEl.focus();
            if (!inputEl.value) {
              inputEl.placeholder = `Replying to @${author}…`;
            }
          }
        }
        return;
      }

      // 14. Cancel reply
      const cancelReplyBtn = e.target.closest('#btn-cancel-reply');
      if (cancelReplyBtn) {
        e.preventDefault();
        replyingToMessage = null;
        updateReplyBar(container);
        const inputEl = container.querySelector('#stream-msg-input');
        if (inputEl) {
          const meta = CHANNEL_IDENTITIES[activeChannelId] || {};
          inputEl.placeholder = (currentUser?.role === 'admin')
            ? 'Type announcement, @mention, /hg, /pin, /notice, or attach notes…'
            : `Message ${escapeHtml(meta.shortName || 'class')} (use /quest for doubts)…`;
        }
        return;
      }

      // 15. Pin message
      const pinBtn = e.target.closest('[data-pin-msg]');
      if (pinBtn) {
        e.preventDefault();
        const msgId = pinBtn.dataset.pinMsg;
        if (!msgId) return;
        pinBtn.disabled = true;
        pinBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        await handlePinAction(msgId, true);
        return;
      }

      // 16. Unpin message
      const unpinBtn = e.target.closest('[data-unpin-msg]');
      if (unpinBtn) {
        e.preventDefault();
        const msgId = unpinBtn.dataset.unpinMsg;
        if (!msgId) return;
        unpinBtn.disabled = true;
        unpinBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        await handlePinAction(msgId, false);
        return;
      }

      // 17. Jump to pinned or quoted message
      const jumpBtn = e.target.closest('.btn-jump-pin, .btn-jump-msg');
      if (jumpBtn) {
        e.preventDefault();
        const msgId = jumpBtn.dataset.msgId;
        if (!msgId) return;
        const targetEl = container.querySelector(`#msg-${msgId}`);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          targetEl.style.transition = 'box-shadow 0.3s ease, transform 0.3s ease';
          targetEl.style.transform = 'scale(1.02)';
          targetEl.style.boxShadow = '0 0 20px rgba(16, 185, 129, 0.6)';
          setTimeout(() => {
            targetEl.style.transform = '';
            targetEl.style.boxShadow = '';
          }, 1500);
        }
        return;
      }

      // 18. Delete message (Admin Only - Reliable Single-Prompt Execution)
      const delBtn = e.target.closest('[data-del-msg]');
      if (delBtn) {
        e.preventDefault();
        const msgId = delBtn.dataset.delMsg;
        if (!msgId) return;

        // Prevent multiple simultaneous clicks on delete
        if (delBtn.disabled) return;

        const confirmed = confirm('Are you sure you want to permanently delete this message for everyone?');
        if (!confirmed) return;

        delBtn.disabled = true;
        delBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

        // Optimistically remove from DOM immediately
        const msgRow = container.querySelector(`#msg-${msgId}`);
        if (msgRow) {
          msgRow.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
          msgRow.style.opacity = '0';
          msgRow.style.transform = 'scale(0.95)';
          setTimeout(() => msgRow.remove(), 200);
        }

        // Remove from local in-memory channel messages
        if (activeChannel?.state?.messages) {
          activeChannel.state.messages = activeChannel.state.messages.filter(m => m.id !== msgId);
        }

        try {
          // 1. Client-side hard delete on Stream Chat
          if (client) {
            try {
              await client.deleteMessage(msgId, { hard: true });
            } catch (delErr) {
              const errMsg = String(delErr?.message || '');
              const errCode = delErr?.code || delErr?.status;
              // If message is already deleted or not found on Stream server (error 16, 404, or "doesn't exist"), proceed cleanly
              if (errCode === 16 || errCode === 404 || /doesn't exist|not found/i.test(errMsg)) {
                console.warn('[StreamChat Delete Note] Message already gone from server:', msgId);
              } else {
                // Try server-side admin delete fallback
                const token = (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('pragyan_portal_token')) || '';
                await fetch('/api/health?action=stream-delete', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                  body: JSON.stringify({ messageId: msgId })
                }).catch(() => null);
              }
            }
          }

          // 2. Server-side notification to ensure real-time broadcast
          const token = (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('pragyan_portal_token')) || '';
          if (token) {
            fetch('/api/health?action=stream-delete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ messageId: msgId })
            }).catch(() => null);
          }

          renderPinnedBarAndList(container);
        } catch (err) {
          console.warn('[Delete Msg Warning]', err);
          renderPinnedBarAndList(container);
        }
        return;
      }

      // 19. Admin Clear Group Chat (Purge all messages in channel)
      const clearBtn = e.target.closest('.btn-clear-group-chat');
      if (clearBtn) {
        e.preventDefault();
        const chId = clearBtn.dataset.chId || activeChannelId;
        const chName = clearBtn.dataset.chName || 'this class';

        const confirmed = confirm(
          `⚠️ Clear All Messages for "${chName}"?\n\nAre you sure you want to permanently clear the entire chat history for all students and faculty in this group?\n\nThis action cannot be undone.`
        );
        if (!confirmed) return;

        const originalHtml = clearBtn.innerHTML;
        clearBtn.disabled = true;
        clearBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Clearing...';

        try {
          const token = (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('pragyan_portal_token')) || '';
          const res = await fetch('/api/health?action=stream-clear', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ channelId: chId, channelType: 'livestream', hardDelete: true })
          });

          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.success) {
            throw new Error(data.error || 'Failed to clear channel on server');
          }

          if (activeChannel) {
            try { await activeChannel.truncate(); } catch (_) {}
            if (activeChannel.state) activeChannel.state.messages = [];
          }

          renderUI(container);
          alert(`🧹 Group chat for "${chName}" has been successfully cleared.`);
        } catch (err) {
          console.error('[StreamChat Clear Error]', err);
          alert(`❌ Failed to clear group chat: ${err.message}`);
        } finally {
          clearBtn.disabled = false;
          clearBtn.innerHTML = originalHtml;
        }
        return;
      }

      // 20. Admin Mute / Unmute Student Message Action
      const muteBtn = e.target.closest('.btn-toggle-mute');
      if (muteBtn) {
        e.preventDefault();
        const studentId = muteBtn.dataset.muteStudent;
        const studentName = muteBtn.dataset.studentName || 'Student';
        const isMutedNow = muteBtn.dataset.isMuted === 'true';
        if (!studentId) return;

        const confirmMsg = isMutedNow
          ? `🔊 Unmute @${studentName}?\n\nThis will restore their permission to send messages in this class.`
          : `🔇 Mute @${studentName}?\n\nThis will prevent this student from sending any messages in this class until you unmute them.`;
        if (!confirm(confirmMsg)) return;

        await handleMuteAction(studentId, studentName, !isMutedNow, container);
        return;
      }
    });

    // Close autocomplete on click outside
    document.addEventListener('click', (e) => {
      const autoBox = container.querySelector('#stream-autocomplete-box');
      const input = container.querySelector('#stream-msg-input');
      if (autoBox && autoBox.style.display !== 'none' && !autoBox.contains(e.target) && e.target !== input) {
        hideAutocomplete();
      }
    });

    // --- DELEGATED FORM SUBMISSION LISTENER ---
    container.addEventListener('submit', async e => {
      const form = e.target.closest('#stream-chat-form');
      if (!form) return;
      e.preventDefault();

      const input = container.querySelector('#stream-msg-input');
      const sendBtn = container.querySelector('#btn-stream-send');
      if (!input) return;

      const rawText = (input.value || '').trim();
      if (!rawText) return;

      hideAutocomplete();

      // Guard: Block muted students from submitting messages
      if (isCurrentUserMuted()) {
        alert('🚫 You have been muted by faculty for this class. You cannot send messages until you are unmuted.');
        input.value = '';
        return;
      }

      // Handle Slash Commands
      if (rawText === '/clear') {
        input.value = '';
        container.querySelector('.btn-clear-group-chat')?.click();
        return;
      }
      if (rawText === '/help') {
        input.value = '';
        showHelpModal();
        return;
      }

      const isMuteCommand = /^\/mute\b/i.test(rawText);
      const isUnmuteCommand = /^\/unmute\b/i.test(rawText);
      if (isMuteCommand || isUnmuteCommand) {
        input.value = '';
        if (currentUser?.role !== 'admin') {
          alert('⚠️ Only faculty and administrators can mute or unmute students.');
          return;
        }
        const shouldMute = isMuteCommand;
        const targetArg = rawText.replace(/^\/(unmute|mute)\s*/i, '').trim();
        if (!targetArg) {
          alert(`⚠️ Please specify the student to ${shouldMute ? 'mute' : 'unmute'}.\n\nUsage:\n• /${shouldMute ? 'mute' : 'unmute'} @StudentName\n• /${shouldMute ? 'mute' : 'unmute'} <RollNumber>\n\nExample: /${shouldMute ? 'mute' : 'unmute'} @Aarav Kumar`);
          input.focus();
          return;
        }
        await handleMuteStudentCommand(targetArg, shouldMute, container);
        return;
      }

      const isImportant = /^\/(imp|important|urgent|alert)\b/i.test(rawText);
      const isQuestion = /^\/(quest|question|doubt|ask|q)\b/i.test(rawText);
      const isHighlight = /^\/(hg|highlight|star)\b/i.test(rawText);
      const isPinCommand = /^\/(pin|sticky)\b/i.test(rawText);
      const isNotice = /^\/(notice|announcement|announce)\b/i.test(rawText);

      // Validate that user entered actual message text after command
      const cleanBody = rawText.replace(/^\/(imp|important|urgent|alert|quest|question|doubt|ask|q|hg|highlight|star|pin|sticky|notice|announcement|announce)\s*/i, '').trim();
      const hasCustomFormatting = isImportant || isQuestion || isHighlight || isPinCommand || isNotice;

      if (hasCustomFormatting && !cleanBody) {
        alert(`⚠️ Please type your message text after the slash command (e.g. ${isImportant ? '/imp Exam postponed to Monday' : (isHighlight ? '/hg Live lecture at 5 PM' : '/quest What is thermodynamics?')})`);
        input.focus();
        return;
      }

      // Strip leading slashes to prevent GetStream API built-in slash command parser error: "Sorry, command ... doesn't exist"
      let textToSend = hasCustomFormatting ? cleanBody : rawText;
      if (textToSend.startsWith('/')) {
        textToSend = textToSend.replace(/^\/+/, '');
      }
      if (!textToSend.trim()) return;

      input.value = '';
      if (sendBtn) sendBtn.disabled = true;

      try {
        const msgPayload = {
          text: textToSend,
          is_important: Boolean(isImportant),
          is_question: Boolean(isQuestion),
          is_highlighted: Boolean(isHighlight),
          is_notice: Boolean(isNotice),
          custom_type: isImportant ? 'important' : (isQuestion ? 'question' : (isHighlight ? 'highlight' : (isNotice ? 'notice' : 'text')))
        };

        if (replyingToMessage) {
          msgPayload.quoted_message_id = replyingToMessage.id;
          msgPayload.quoted_message_author = replyingToMessage.author;
          msgPayload.quoted_message_text = (replyingToMessage.text || '').substring(0, 150);
        }

        const sent = await activeChannel.sendMessage(msgPayload);

        // Clear reply state after sending
        replyingToMessage = null;
        updateReplyBar(container);

        // Ensure local activeChannel state has the message immediately
        if (sent?.message && activeChannel?.state?.messages) {
          if (!activeChannel.state.messages.some(m => m.id === sent.message.id)) {
            activeChannel.state.messages.push(sent.message);
          }
        }

        // Broadcast to other tabs/windows via BroadcastChannel/localStorage
        if (sent?.message) {
          broadcastMessageSync(sent.message, activeChannelId);
        }

        // If sent with /pin, immediately pin it
        if (isPinCommand && sent?.message?.id) {
          try {
            await handlePinAction(sent.message.id, true);
          } catch (_) {}
        }

        renderPinnedBarAndList();
      } catch (err) {
        console.error('[StreamChat Send Error]', err);
        alert('Failed to send message: ' + err.message);
      } finally {
        if (sendBtn) sendBtn.disabled = false;
        if (input) input.focus();
      }
    });

    // --- DELEGATED FILE ATTACHMENT CHANGE LISTENER ---
    container.addEventListener('change', async e => {
      if (e.target && e.target.id === 'stream-file-input') {
        const fileInput = e.target;
        const file = fileInput.files?.[0];
        if (!file) return;

        const MAX_SIZE = 20 * 1024 * 1024; // 20 MB
        if (file.size > MAX_SIZE) {
          alert(`⚠️ File is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB).\n\nThe maximum allowed file size is 20 MB.`);
          fileInput.value = '';
          return;
        }

        const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
        const isImg = file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(file.name);

        if (!isPdf && !isImg) {
          alert('⚠️ Only PDF documents and image files (PNG, JPG, WebP, GIF) up to 20 MB are supported.');
          fileInput.value = '';
          return;
        }

        const attachBtn = container.querySelector('#btn-stream-attach');
        const typingBox = container.querySelector('#stream-typing-box');
        const sendBtn = container.querySelector('#btn-stream-send');
        if (attachBtn) attachBtn.disabled = true;
        if (sendBtn) sendBtn.disabled = true;
        if (typingBox) {
          typingBox.innerHTML = `⏳ Uploading "<b>${escapeHtml(file.name)}</b>" (${(file.size / (1024 * 1024)).toFixed(1)} MB) to class cloud...`;
        }

        try {
          let uploadedUrl = '';
          let attachmentType = isImg ? 'image' : 'file';

          // Try direct Stream Chat client upload first
          if (activeChannel && client) {
            try {
              if (isImg && typeof activeChannel.sendImage === 'function') {
                const res = await activeChannel.sendImage(file);
                uploadedUrl = res?.file || res?.url || '';
              } else if (typeof activeChannel.sendFile === 'function') {
                const res = await activeChannel.sendFile(file);
                uploadedUrl = res?.file || res?.url || '';
              }
            } catch (streamUpErr) {
              console.warn('[Stream direct upload note]', streamUpErr.message);
            }
          }

          // Fallback to server-side upload gateway if direct upload failed
          if (!uploadedUrl) {
            const token = (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('pragyan_portal_token')) || '';
            const base64Data = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result);
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });

            const srvRes = await fetch('/api/health?action=stream-upload', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({
                channelId: activeChannelId,
                channelType: 'livestream',
                fileName: file.name,
                fileType: file.type || (isPdf ? 'application/pdf' : 'image/jpeg'),
                fileBase64: base64Data,
                fileSize: file.size
              })
            });

            const srvData = await srvRes.json().catch(() => ({}));
            if (!srvRes.ok || !srvData.success) {
              throw new Error(srvData.error || 'Server upload failed');
            }
            uploadedUrl = srvData.fileUrl;
            attachmentType = srvData.fileType || attachmentType;
          }

          if (!uploadedUrl) {
            throw new Error('Unable to obtain uploaded file URL');
          }

          // Send message with attachments
          const attachmentObj = {
            type: attachmentType,
            asset_url: uploadedUrl,
            url: uploadedUrl,
            image_url: isImg ? uploadedUrl : undefined,
            title: file.name,
            file_size: file.size,
            mime_type: file.type || (isPdf ? 'application/pdf' : 'image/jpeg')
          };

          const msgPayload = {
            text: isPdf ? `📄 Shared Study Notes: ${file.name}` : `🖼️ Shared Image: ${file.name}`,
            attachments: [attachmentObj],
            is_attachment: true
          };

          const sent = await activeChannel.sendMessage(msgPayload);
          if (sent?.message && activeChannel?.state?.messages) {
            if (!activeChannel.state.messages.some(m => m.id === sent.message.id)) {
              activeChannel.state.messages.push(sent.message);
            }
          }

          if (sent?.message) {
            broadcastMessageSync(sent.message, activeChannelId);
          }

          if (typingBox) typingBox.innerHTML = '';
          fileInput.value = '';
          renderPinnedBarAndList();
          renderPdfPage1Thumbnails(container);
        } catch (err) {
          console.error('[Upload attachment error]', err);
          alert(`❌ Failed to upload file: ${err.message}`);
          if (typingBox) typingBox.innerHTML = '';
        } finally {
          if (attachBtn) attachBtn.disabled = false;
          if (sendBtn) sendBtn.disabled = false;
          fileInput.value = '';
        }
      }
    });

    // --- DELEGATED INPUT LISTENER (TYPING & AUTOCOMPLETE & MEDIA SEARCH) ---
    container.addEventListener('input', e => {
      // 1. Media Gallery Search
      if (e.target && e.target.id === 'stream-media-search-input') {
        mediaSearchQuery = (e.target.value || '').trim();
        const messages = (activeChannel?.state?.messages || []).filter(m => !m.deleted_at);
        const activeMeta = CHANNEL_IDENTITIES[activeChannelId] || { shortName: 'Class Forum' };
        const mediaList = getMediaAttachmentsFromMessages(messages);
        const mediaWrap = container.querySelector('.stream-media-gallery-wrap');
        if (mediaWrap) {
          mediaWrap.outerHTML = renderMediaGalleryHtml(mediaList, activeMeta);
          renderPdfPage1Thumbnails(container);
          const newSearch = container.querySelector('#stream-media-search-input');
          if (newSearch) {
            newSearch.focus();
            newSearch.setSelectionRange(newSearch.value.length, newSearch.value.length);
          }
        }
        return;
      }

      // 2. Chat Message Input Autocomplete & Typing
      if (e.target && e.target.id === 'stream-msg-input') {
        const input = e.target;
        const val = input.value;
        const cursorPos = input.selectionStart ?? val.length;
        const textBeforeCursor = val.substring(0, cursorPos);

        if (activeChannel) activeChannel.keystroke().catch(() => {});

        if (val.startsWith('/') && !val.includes(' ')) {
          renderSlashCommands(val.slice(1));
          return;
        }

        const lastAt = textBeforeCursor.lastIndexOf('@');
        if (lastAt >= 0) {
          const textAfterAt = textBeforeCursor.substring(lastAt + 1);
          if (!textAfterAt.includes(' ')) {
            renderMentions(textAfterAt);
            return;
          }
        }

        hideAutocomplete();
      }
    });

    // --- DELEGATED KEYDOWN LISTENER (AUTOCOMPLETE NAV & ESCAPE) ---
    container.addEventListener('keydown', e => {
      if (e.target && e.target.id === 'stream-msg-input') {
        const input = e.target;
        const autoBox = container.querySelector('#stream-autocomplete-box');
        if (!autoMode || !autoBox || autoBox.style.display === 'none') {
          if (e.key === 'Escape' && replyingToMessage) {
            replyingToMessage = null;
            updateReplyBar(container);
            const meta = CHANNEL_IDENTITIES[activeChannelId] || {};
            input.placeholder = (currentUser?.role === 'admin')
              ? 'Type announcement, @mention, /hg, /pin, /notice, or attach notes…'
              : `Message ${escapeHtml(meta.shortName || 'class')} (use /quest for doubts)…`;
          }
          return;
        }

        const items = autoBox.querySelectorAll('.auto-item');
        if (!items.length) return;

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          autoSelectedIndex = (autoSelectedIndex + 1) % items.length;
          items.forEach((it, idx) => it.style.background = (idx === autoSelectedIndex) ? '#ECFDF5' : '#FFFFFF');
          items[autoSelectedIndex]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          autoSelectedIndex = (autoSelectedIndex - 1 + items.length) % items.length;
          items.forEach((it, idx) => it.style.background = (idx === autoSelectedIndex) ? '#ECFDF5' : '#FFFFFF');
          items[autoSelectedIndex]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } else if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          const sel = items[autoSelectedIndex];
          if (sel) sel.click();
        } else if (e.key === 'Escape') {
          hideAutocomplete();
        }
      }
    });

    // Sync autocomplete hover with selection index
    container.addEventListener('mouseover', e => {
      const autoItem = e.target.closest('.auto-item');
      if (autoItem) {
        const autoBox = container.querySelector('#stream-autocomplete-box');
        if (autoBox) {
          const items = autoBox.querySelectorAll('.auto-item');
          const idx = Array.from(items).indexOf(autoItem);
          if (idx >= 0) {
            autoSelectedIndex = idx;
            items.forEach((it, i) => it.style.background = (i === autoSelectedIndex) ? '#ECFDF5' : '#FFFFFF');
          }
        }
      }
    });
  }

  function scrollBottom() {
    const el = document.getElementById('stream-msg-list');
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }

  let isInitializing = false;

  async function init(containerEl) {
    if (!containerEl) return;
    
    // Guard against repeated re-initialization: if already connected and mounted in container, retain active DOM and typing focus
    if (client && client.userID && containerEl.querySelector('.stream-chat-wrapper')) {
      return;
    }

    if (isInitializing) return;
    isInitializing = true;

    try {
      if (!containerEl.querySelector('.stream-chat-wrapper')) {
        containerEl.innerHTML = `
          <div class="stream-loading-card" style="width: 100%; min-height: clamp(440px, calc(100dvh - 200px), 720px); background: #ffffff; border-radius: 12px; border: 1.5px solid var(--border-sand, #DDD5CD); display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 3.5rem 2rem; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05); margin: 0 auto; box-sizing: border-box;">
            <div style="width: 72px; height: 72px; border-radius: 50%; background: #ECFDF5; border: 2px solid #A7F3D0; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 1.5rem; box-shadow: 0 8px 24px rgba(6, 78, 59, 0.12);">
              <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 2.4rem; color: #064E3B;" aria-hidden="true"></i>
            </div>
            <h3 style="margin: 0 0 0.5rem 0; font-family: var(--font-heading, 'Cinzel', serif); font-size: 1.25rem; font-weight: 800; color: #0F172A; letter-spacing: -0.01em;">Connecting to Pragyan Realtime Class Gateway…</h3>
            <p style="margin: 0 0 1.25rem 0; font-size: 0.92rem; color: #64748B; max-width: 480px; line-height: 1.5;">Syncing live class channels and message archives from Stream cloud..</p>
            <div style="display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0.95rem; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 9999px; font-size: 0.78rem; font-weight: 700; color: #475569;">
              <i class="fa-solid fa-bolt" style="color: #059669;" aria-hidden="true"></i> Live WebSocket Session
            </div>
          </div>
        `;
      }

      await loadScript('https://cdn.jsdelivr.net/npm/stream-chat@8.52.0/dist/browser.full-bundle.min.js');
      if (typeof StreamChat === 'undefined') throw new Error('Stream Chat SDK failed to load.');

      const tokenData = await fetchToken();
      
      // Clean up previous client connection if switching accounts
      if (client && client.userID && client.userID !== tokenData.userId) {
        try { await client.disconnectUser(); } catch (_) {}
        client = null;
        isListening = false;
      }

      if (!client) {
        client = StreamChat.getInstance(tokenData.apiKey);
      }

      currentUser = { id: tokenData.userId, name: tokenData.userName, role: tokenData.userRole };

      // Connect user using authenticated user ID token
      if (!client.userID) {
        await client.connectUser({ id: tokenData.userId }, tokenData.token);
      }

      await setupChannels();
      setupRealtimeListeners();
      startPeriodicSync();
      renderUI(containerEl);
    } catch (err) {
      console.error('[StreamChat Error]', err);
      containerEl.innerHTML = `
        <div class="dash-card" style="text-align: center; padding: 2.5rem 1.5rem; background: #FFF; border-radius: 12px; border: 1.5px solid var(--border-sand); margin: 1.5rem auto; max-width: 520px; box-shadow: 0 6px 24px rgba(0,0,0,0.06);">
          <div style="width: 56px; height: 56px; border-radius: 50%; background: #FEF3C7; color: #D97706; display: inline-flex; align-items: center; justify-content: center; font-size: 1.5rem; margin-bottom: 0.75rem;">
            <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
          </div>
          <h3 style="color: #1E293B; margin-bottom: 0.35rem; font-weight: 800;">Unable to Connect to Class Forum</h3>
          <p style="color: #64748B; font-size: 0.88rem; line-height: 1.5; margin-bottom: 1.25rem;">${escapeHtml(err.message)}</p>
          <div style="display: flex; gap: 0.6rem; justify-content: center; flex-wrap: wrap;">
            <button type="button" class="btn btn-emerald" onclick="if (typeof window.relogin === 'function') window.relogin(); else if (typeof openLoginModal === 'function') openLoginModal(); else location.reload();" style="padding: 0.65rem 1.5rem; font-weight: 800; border-radius: 8px; cursor: pointer;">
              <i class="fa-solid fa-right-to-bracket" aria-hidden="true"></i> Sign In Again
            </button>
            <button type="button" class="btn" onclick="PragyanStreamChat.reconnect()" style="padding: 0.65rem 1.5rem; font-weight: 800; border-radius: 8px; background: #F1F5F9; color: #334155; border: 1px solid #CBD5E1;">
              <i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i> Retry Connection
            </button>
          </div>
        </div>
      `;
    } finally {
      isInitializing = false;
    }
  }

  function disconnect() {
    stopPeriodicSync();
    if (client) { 
      try { client.disconnectUser(); } catch (_) {}
      client = null; 
    }
    channelsMap.clear(); activeChannel = null; currentUser = null; isListening = false;
    isMobileChatOpen = false;
    if (typeof document !== 'undefined') {
      document.body.classList.remove('stream-body-fullscreen-lock');
    }
  }

  // Public API
  window.PragyanStreamChat = {
    init,
    reconnect() {
      const pane = getActiveCommunityPane();
      if (pane) init(pane);
    },
    switchChannel(chId) {
      const pane = getActiveCommunityPane();
      if (pane) switchChannel(chId, pane);
    },
    deleteMessage: async (msgId) => {
      if (client) {
        try {
          await client.deleteMessage(msgId, { hard: true });
        } catch (delErr) {
          const errMsg = String(delErr?.message || '');
          const errCode = delErr?.code || delErr?.status;
          if (errCode !== 16 && errCode !== 404 && !/doesn't exist|not found/i.test(errMsg)) {
            console.warn('[PragyanStreamChat.deleteMessage error]', delErr);
          }
        }
      }
      if (activeChannel?.state?.messages) {
        activeChannel.state.messages = activeChannel.state.messages.filter(m => m.id !== msgId);
      }
    },
    pinMessage: async (msgId) => { if (client) { await client.pinMessage({ id: msgId }); } },
    unpinMessage: async (msgId) => { if (client) { await client.unpinMessage({ id: msgId }); } },
    syncActiveChannelMessages,
    broadcastMessageSync,
    renderPinnedBarAndList,
    openMobileFullscreen,
    exitMobileFullscreen() {
      isMobileChatOpen = false;
      if (typeof document !== 'undefined') {
        document.body.classList.remove('stream-body-fullscreen-lock');
      }
      if (currentUser) {
        const activePane = getActiveCommunityPane();
        if (activePane && !activePane.hasAttribute('hidden') && activePane.style.display !== 'none') {
          renderUI(activePane);
        }
      }
    },
    disconnect
  };

  window.initGetStreamChat = async function () {
    const pane = getActiveCommunityPane();
    if (pane) { await init(pane); }
  };
})();
