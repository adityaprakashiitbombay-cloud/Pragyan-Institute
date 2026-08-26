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
    { cmd: '/quest', usage: '/quest <question>', label: 'Ask Question / Doubt', desc: 'Highlight question in vibrant indigo card for mentors & classmates', icon: '❓', forStudents: true },
    { cmd: '/question', usage: '/question <question>', label: 'Ask Question / Doubt', desc: 'Highlight question in vibrant indigo card for mentors & classmates', icon: '💡', forStudents: true },
    { cmd: '/hg', usage: '/hg <message>', label: 'Highlight Text', desc: 'Broadcast highlighted announcement in glowing gold callout banner', icon: '⭐', adminOnly: true },
    { cmd: '/highlight', usage: '/highlight <message>', label: 'Highlight Text', desc: 'Broadcast highlighted announcement in glowing gold callout banner', icon: '🌟', adminOnly: true },
    { cmd: '/pin', usage: '/pin <message>', label: 'Post & Pin Message', desc: 'Send message and immediately pin it to the top of group', icon: '📌', adminOnly: true },
    { cmd: '/notice', usage: '/notice <message>', label: 'Official Notice', desc: 'Post as an official class notice announcement', icon: '📢', adminOnly: true },
    { cmd: '/clear', usage: '/clear', label: 'Clear Group Chat', desc: 'Prompt to purge entire message history for this class', icon: '🧹', adminOnly: true },
    { cmd: '/help', usage: '/help', label: 'Show Commands', desc: 'View list of available slash commands and shortcuts', icon: '📖', forStudents: true }
  ];

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
    const enrolledBatches = resolveStudentBatches();
    const primaryBatch = enrolledBatches[0] || resolveBatchId() || 'BAT-10';
    const batches = (window.PRAGYAN_ACADEMIC && window.PRAGYAN_ACADEMIC.BATCHES) || [];

    // Register all class-specific batch channels for everyone
    for (const b of batches) {
      const chId = `batch-${b.batchId}`;
      const meta = CHANNEL_IDENTITIES[chId] || { name: b.name || b.batchId };
      const ch = client.channel(CHANNEL_TYPE, chId, {
        name: meta.name
      });
      channelsMap.set(chId, ch);
    }

    // Set default active channel to student's primary enrolled batch
    if (!isAdmin) {
      if (primaryBatch && channelsMap.has(`batch-${primaryBatch}`)) {
        activeChannelId = `batch-${primaryBatch}`;
      } else if (channelsMap.size > 0) {
        activeChannelId = Array.from(channelsMap.keys())[0];
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

    if (activeChannel) {
      try {
        await activeChannel.watch({ state: true, presence: true });
      } catch (watchErr) {
        console.warn('[StreamChat] Initial watch note:', watchErr.message);
        try { await activeChannel.watch(); } catch (_) {}
      }
    }
  }

  async function switchChannel(targetChannelId, container) {
    if (!channelsMap.has(targetChannelId)) return;
    activeChannelId = targetChannelId;
    activeChannel = channelsMap.get(targetChannelId);

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

  function formatMessageBody(rawText) {
    if (!rawText) return '';
    let text = String(rawText);

    // Clean slash prefixes case-insensitively
    const cleaned = text.replace(/^\/(quest|question|hg|highlight|pin|notice)\s*/i, '').trim();
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

    return messages.map(m => {
      const isMine = m.user && m.user.id === currentUser.id;
      const identity = extractUserBadge(m.user, channelMeta);
      const isFaculty = identity.isFaculty;

      const isQuestion = (m.text && /^\/(quest|question)\b/i.test(m.text)) || m.is_question || m.custom_type === 'question';
      const isHighlight = (m.text && /^\/(hg|highlight)\b/i.test(m.text)) || m.is_highlighted || m.custom_type === 'highlight';
      const isPinned = m.pinned || m.is_pinned || Boolean(m.pinned_at);
      const isNotice = (m.text && /^\/notice\b/i.test(m.text)) || m.is_notice;

      const avatar = m.user?.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(m.user?.name || 'User')}&background=${isFaculty ? 'D97706' : '064E3B'}&color=fff`;
      const formattedBody = formatMessageBody(m.text || '');
      const timeStr = fmtTime(m.created_at);

      // Compact Admin Actions (Hover / Inline pill)
      let actionsHtml = '';
      if (currentUser.role === 'admin') {
        actionsHtml = `
          <span class="stream-msg-actions" style="display: inline-flex; align-items: center; gap: 0.2rem; margin-left: 0.35rem;">
            <button type="button" class="${isPinned ? 'btn-unpin-msg' : 'btn-pin-msg'}" data-${isPinned ? 'unpin' : 'pin'}-msg="${escapeHtml(m.id)}" style="background: rgba(0,0,0,0.06); border: none; font-size: 0.65rem; color: ${isPinned ? '#D97706' : '#059669'}; cursor: pointer; padding: 2px 5px; border-radius: 4px; font-weight: 700; line-height: 1;" title="${isPinned ? 'Unpin message' : 'Pin to top'}">
              <i class="fa-solid fa-thumbtack" aria-hidden="true"></i> ${isPinned ? 'Unpin' : 'Pin'}
            </button>
            <button type="button" class="btn-del-msg" data-del-msg="${escapeHtml(m.id)}" style="background: rgba(220,38,38,0.08); border: none; font-size: 0.65rem; color: #DC2626; cursor: pointer; padding: 2px 5px; border-radius: 4px; font-weight: 700; line-height: 1;" title="Delete message" aria-label="Delete message">
              <i class="fa-solid fa-trash-can" aria-hidden="true"></i>
            </button>
          </span>
        `;
      }

      let bubbleContentHtml = '';
      if (isQuestion) {
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
            <div style="font-weight: 600; color: #1E1B4B;">
              ${formattedBody}
            </div>
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
            <div style="font-weight: 600; color: #78350F;">
              ${formattedBody}
            </div>
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
            <div style="font-weight: 600; color: #064E3B;">
              ${formattedBody}
            </div>
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
            <div class="stream-msg-text" style="display: inline;">
              ${formattedBody}
            </div>
            <div class="stream-msg-meta-row" style="display: flex; align-items: center; justify-content: flex-end; gap: 0.35rem; margin-top: 0.15rem; font-size: 0.65rem; color: ${timeColor};">
              <span>${timeStr}</span>
              ${actionsHtml}
            </div>
          </div>
        `;
      }

      return `
        <div class="stream-msg-row ${isMine ? 'mine' : 'theirs'} ${isPinned ? 'stream-msg-pinned' : ''}" id="msg-${escapeHtml(m.id)}" style="display: flex; gap: 0.45rem; align-items: flex-start; margin-bottom: 0.35rem; ${isMine ? 'flex-direction: row-reverse;' : ''}">
          <img src="${escapeHtml(avatar)}" alt="${escapeHtml(m.user?.name || '')}" style="width: 26px; height: 26px; border-radius: 50%; object-fit: cover; border: 1.5px solid ${isFaculty ? '#F59E0B' : (isMine ? '#10B981' : '#059669')}; flex-shrink: 0; box-shadow: 0 1px 3px rgba(0,0,0,0.06); margin-top: 1px;">
          <div style="max-width: 85%; display: flex; flex-direction: column; ${isMine ? 'align-items: flex-end;' : 'align-items: flex-start;'}">
            
            <!-- Compact Sender Header (Only for incoming messages) -->
            ${!isMine ? `
              <div style="display: flex; gap: 0.35rem; align-items: center; font-size: 0.72rem; margin-bottom: 0.15rem; flex-wrap: wrap;">
                <strong style="color: ${isFaculty ? '#B45309' : 'var(--text-mahogany, #5A2E25)'}; font-weight: 800;">
                  ${escapeHtml(m.user?.name || 'User')}
                </strong>
                <span style="background: ${identity.badgeBg}; color: ${identity.badgeColor}; border: 1px solid ${identity.badgeBorder}; font-size: 0.62rem; font-weight: 800; padding: 0.05rem 0.35rem; border-radius: 3px; display: inline-flex; align-items: center; gap: 0.2rem;">
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
    return ['ALL', 'Senior Secondary', 'Secondary', 'Junior & Middle', 'Special English'];
  }

  function showHelpModal() {
    const isAdminUser = currentUser?.role === 'admin';
    if (isAdminUser) {
      alert('✨ Available Admin & Class Commands:\n\n• /quest <question> — Ask highlighted question / doubt in indigo card\n• /hg <text> — Broadcast highlighted announcement in gold callout card\n• /pin <text> — Post and pin announcement\n• /notice <text> — Broadcast class notice\n• /clear — Clear group message history\n• @<name> — Mention specific student\n• /help — Show this help menu');
    } else {
      alert('✨ Available Student Commands:\n\n• /quest <question> — Ask question / doubt (highlighted in indigo card for mentors & classmates)\n• @<name> — Mention a classmate or student\n• /help — Show commands');
    }
  }

  function renderUI(container) {
    const isAdmin = currentUser.role === 'admin';
    const enrolledBatches = resolveStudentBatches();
    const channelList = Array.from(channelsMap.entries());

    const filteredChannels = channelList.filter(([id]) => {
      const meta = CHANNEL_IDENTITIES[id] || {};
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
    const messages = activeChannel?.state?.messages || [];
    const pinnedMessages = messages.filter(m => m.pinned || m.is_pinned || Boolean(m.pinned_at));
    const latestPin = pinnedMessages.length ? pinnedMessages[pinnedMessages.length - 1] : null;

    container.innerHTML = `
      <div class="stream-chat-wrapper" style="display: flex; flex-direction: column; height: clamp(560px, calc(100dvh - 140px), 880px); background: #FFFFFF; border-radius: 14px; border: 1.5px solid var(--border-sand, #DDD5CD); overflow: hidden; box-shadow: 0 8px 30px rgba(0,0,0,0.08); position: relative;">
        
        <!-- TOP APP BAR & LIVE STATUS & FULLSCREEN CONTROLS -->
        <div class="stream-top-bar" style="background: #042E23; color: #FFFFFF; padding: 0.45rem 0.85rem; display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.1); flex-shrink: 0;">
          <div style="display: flex; align-items: center; gap: 0.5rem; overflow: hidden;">
            <div style="width: 26px; height: 26px; border-radius: 6px; background: rgba(16, 185, 129, 0.2); color: #34D399; display: flex; align-items: center; justify-content: center; font-size: 0.95rem; flex-shrink: 0;">
              ${activeMeta.icon}
            </div>
            <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              <span style="font-weight: 800; font-size: 0.88rem; color: #FFFFFF; letter-spacing: -0.01em;">
                Pragyan Community Chat
              </span>
              <span style="font-size: 0.72rem; color: #A7F3D0; margin-left: 0.35rem; opacity: 0.85;">
                • ${isAdmin ? '🛡️ Multi-Class Hub' : `🎓 ${escapeHtml(activeMeta.shortName)}`}
              </span>
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0;">
            <div style="font-size: 0.72rem; color: #D1FAE5; white-space: nowrap; display: flex; align-items: center; gap: 0.35rem; background: rgba(255,255,255,0.08); padding: 0.2rem 0.55rem; border-radius: 99px; border: 1px solid rgba(255,255,255,0.15);">
              <span style="width: 7px; height: 7px; border-radius: 50%; background: #34D399; display: inline-block; box-shadow: 0 0 6px #34D399;"></span>
              <span id="stream-online-count" style="font-weight: 700;">${onlineCount} active</span>
            </div>

            <!-- Fullscreen Toggle Button -->
            <button type="button" id="btn-stream-fullscreen" class="btn-stream-fullscreen" title="Toggle Fullscreen View" aria-label="Toggle Fullscreen View" style="background: rgba(255,255,255,0.12); color: #FFFFFF; border: 1px solid rgba(255,255,255,0.22); border-radius: 6px; padding: 0.22rem 0.6rem; font-size: 0.74rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 0.3rem; transition: all 0.15s ease;">
              <i class="fa-solid fa-expand" aria-hidden="true"></i> <span>Fullscreen</span>
            </button>
          </div>
        </div>

        <!-- CATEGORIES FILTER BAR -->
        <div class="stream-cat-bar" style="background: #F8FAFC; padding: 0.35rem 0.75rem; border-bottom: 1px solid #E2E8F0; display: flex; gap: 0.35rem; align-items: center; overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; flex-shrink: 0;">
          ${categories.map(cat => `
            <button type="button" class="stream-cat-pill ${selectedCategory === cat ? 'active' : ''}" data-cat-name="${escapeHtml(cat)}" style="padding: 0.2rem 0.55rem; border-radius: 99px; font-size: 0.72rem; font-weight: 700; cursor: pointer; border: 1px solid ${selectedCategory === cat ? '#064E3B' : '#CBD5E1'}; background: ${selectedCategory === cat ? '#064E3B' : '#FFFFFF'}; color: ${selectedCategory === cat ? '#FFFFFF' : '#475569'}; white-space: nowrap; transition: all 0.15s ease;">
              ${cat === 'ALL' ? '🌐 All Classes (12)' : escapeHtml(cat)}
            </button>
          `).join('')}
        </div>

        <!-- CLASS GROUPS HORIZONTAL TABS BAR -->
        ${filteredChannels.length > 1 ? `
          <div class="stream-channels-scroll-wrap" style="background: #FFFFFF; padding: 0.4rem 0.75rem; border-bottom: 1.5px solid var(--border-sand, #E2E8F0); display: flex; gap: 0.4rem; align-items: center; overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; flex-shrink: 0;">
            ${filteredChannels.map(([id]) => {
              const meta = CHANNEL_IDENTITIES[id] || { shortName: id, icon: '💬', badgeColor: '#059669' };
              const isActive = id === activeChannelId;
              const isEnrolled = enrolledBatches.includes(meta.batchId);
              const count = getStudentCountForBatch(meta.batchId);
              return `
                <button type="button" class="stream-ch-pill ${isActive ? 'active' : ''} ${isEnrolled ? 'stream-ch-enrolled' : ''}" data-ch-id="${escapeHtml(id)}" style="display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.3rem 0.7rem; border-radius: 99px; font-size: 0.78rem; font-weight: 700; cursor: pointer; border: 1.5px solid ${isActive ? meta.badgeColor : (isEnrolled ? '#10B981' : '#E2E8F0')}; background: ${isActive ? meta.badgeColor : (isEnrolled ? '#ECFDF5' : '#F8FAFC')}; color: ${isActive ? '#FFFFFF' : (isEnrolled ? '#065F46' : '#334155')}; white-space: nowrap; transition: all 0.2s ease; box-shadow: ${isActive ? '0 2px 8px rgba(0,0,0,0.1)' : 'none'}; min-height: 32px;">
                  <span style="font-size: 0.9rem;">${meta.icon}</span>
                  <span>${escapeHtml(meta.shortName)}</span>
                  ${isEnrolled ? `<span style="font-size: 0.65rem; background: ${isActive ? 'rgba(255,255,255,0.3)' : '#D1FAE5'}; color: ${isActive ? '#FFFFFF' : '#047857'}; padding: 0.05rem 0.35rem; border-radius: 4px; font-weight: 800;">My Class</span>` : ''}
                  ${count > 0 ? `
                    <span style="background: ${isActive ? 'rgba(255,255,255,0.25)' : '#E2E8F0'}; color: ${isActive ? '#FFFFFF' : '#475569'}; font-size: 0.68rem; padding: 0.02rem 0.38rem; border-radius: 99px; font-weight: 800;">
                      ${count}
                    </span>
                  ` : ''}
                </button>
              `;
            }).join('')}
          </div>
        ` : ''}

        <!-- ACTIVE CLASS IDENTITY BANNER (Compact & Sleek) -->
        <div class="stream-active-banner" style="background: ${activeMeta.bannerBg}; color: #FFFFFF; padding: 0.45rem 0.85rem; display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; border-bottom: 1.5px solid rgba(0,0,0,0.1); flex-shrink: 0;">
          <div style="display: flex; align-items: center; gap: 0.5rem; overflow: hidden;">
            <div style="font-size: 1.25rem; width: 32px; height: 32px; border-radius: 8px; background: rgba(255,255,255,0.15); display: flex; align-items: center; justify-content: center; flex-shrink: 0; border: 1px solid rgba(255,255,255,0.25);">
              ${activeMeta.icon}
            </div>
            <div style="overflow: hidden;">
              <div style="display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap;">
                <h3 style="font-size: 0.95rem; font-weight: 800; color: #FFFFFF; margin: 0; letter-spacing: -0.01em;">
                  ${escapeHtml(activeMeta.name)}
                </h3>
                <span style="background: rgba(255,255,255,0.2); color: #FFFFFF; font-size: 0.65rem; font-weight: 800; padding: 0.05rem 0.4rem; border-radius: 4px; border: 1px solid rgba(255,255,255,0.3);">
                  ${escapeHtml(activeMeta.category)}
                </span>
              </div>
              <p style="font-size: 0.72rem; color: #E2E8F0; margin: 0.05rem 0 0 0; opacity: 0.9; text-overflow: ellipsis; white-space: nowrap; overflow: hidden;">
                ${escapeHtml(activeMeta.tagline)} • <strong style="color: #FEF08A;">Mentors: ${escapeHtml(activeMeta.mentors)}</strong>
              </p>
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 0.45rem; flex-shrink: 0;">
            ${isAdmin ? `
              <button type="button" class="btn-clear-group-chat" data-ch-id="${escapeHtml(activeChannelId)}" data-ch-name="${escapeHtml(activeMeta.name)}" style="background: rgba(220, 38, 38, 0.28); color: #FFFFFF; border: 1px solid rgba(254, 202, 202, 0.45); padding: 0.22rem 0.55rem; border-radius: 6px; font-size: 0.72rem; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; gap: 0.25rem; transition: all 0.2s ease;" title="Clear chat history for this group">
                <i class="fa-solid fa-trash-can" aria-hidden="true"></i> <span>Clear</span>
              </button>
            ` : ''}
            <div style="text-align: right; display: none;" class="desktop-banner-stats">
              <span style="font-size: 0.68rem; color: #D1FAE5; background: rgba(0,0,0,0.2); padding: 0.18rem 0.45rem; border-radius: 6px; font-weight: 700; display: inline-block;">
                👥 Enrolled: ${studentCount}
              </span>
            </div>
          </div>
        </div>

        <!-- STICKY PINNED MESSAGES BANNER -->
        ${latestPin ? `
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
        ` : ''}

        <!-- MESSAGES FEED CONTAINER -->
        <div id="stream-msg-list" style="flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 0.75rem 0.85rem; background: #FAF9F6; display: flex; flex-direction: column;">
          ${renderMsgList(messages)}
        </div>

        <!-- REALTIME TYPING NOTIFIER -->
        <div id="stream-typing-box" style="padding: 0.15rem 0.85rem; font-size: 0.72rem; color: #64748B; font-style: italic; min-height: 18px; background: #FAF9F6; border-top: 1px solid rgba(0,0,0,0.03);"></div>

        <!-- FLOATING AUTOCOMPLETE DROPDOWN (@MENTIONS & /SLASH COMMANDS) -->
        <div id="stream-autocomplete-box" style="display: none; position: absolute; bottom: 58px; left: 0.75rem; right: 0.75rem; max-height: 220px; overflow-y: auto; background: #FFFFFF; border: 1.5px solid var(--border-sand, #CBD5E1); border-radius: 10px; box-shadow: 0 12px 35px rgba(0,0,0,0.16); z-index: 9999; padding: 0.3rem 0;"></div>

        <!-- COMPOSER INPUT BAR -->
        <form id="stream-chat-form" style="display: flex; align-items: center; gap: 0.4rem; padding: 0.55rem 0.85rem; background: #FFFFFF; border-top: 1.5px solid var(--border-sand, #DDD5CD); flex-shrink: 0; position: relative;">
          ${isAdmin ? `
            <button type="button" id="btn-quick-hg" title="Highlight announcement (/hg)" style="background: #FEF3C7; color: #D97706; border: 1.5px solid #FCD34D; width: 38px; height: 38px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; font-size: 1rem; cursor: pointer; flex-shrink: 0;" aria-label="Toggle Highlight prefix">
              ⭐
            </button>
          ` : ''}
          <button type="button" id="btn-quick-quest" title="Ask academic question / doubt (/quest)" style="background: #EEF2FF; color: #4F46E5; border: 1.5px solid #C7D2FE; width: 38px; height: 38px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; font-size: 1rem; cursor: pointer; flex-shrink: 0;" aria-label="Ask Question prefix">
            ❓
          </button>
          <input type="text" id="stream-msg-input" class="portal-input" placeholder="${isAdmin ? 'Type message, @mention student, /hg, /quest, /pin…' : `Message ${escapeHtml(activeMeta.shortName)} (use /quest for doubts)…`}" style="flex: 1; border-radius: 8px; font-size: 15px; min-height: 40px; padding: 0.45rem 0.85rem; border: 1.5px solid var(--border-sand, #CBD5E1); background: #FAF9F6; transition: border-color 0.2s;" autocomplete="off" aria-label="Chat message" required>
          <button type="submit" class="btn btn-emerald" id="btn-stream-send" style="padding: 0.45rem 1.15rem; font-weight: 800; border-radius: 8px; display: inline-flex; align-items: center; gap: 0.35rem; min-height: 40px; font-size: 0.85rem; flex-shrink: 0; box-shadow: 0 2px 8px rgba(6,78,59,0.2);">
            <span>Send</span> <i class="fa-solid fa-paper-plane" aria-hidden="true"></i>
          </button>
        </form>
      </div>
    `;

    wireEvents(container);
    scrollBottom();
  }

  function wireEvents(container) {
    // 0. Fullscreen Toggle Controller
    const fullscreenBtn = container.querySelector('#btn-stream-fullscreen');
    const chatWrapper = container.querySelector('.stream-chat-wrapper');
    if (fullscreenBtn && chatWrapper) {
      fullscreenBtn.addEventListener('click', () => {
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
        scrollBottom();
      });
    }

    // Support Esc key to exit fullscreen
    if (!window._streamEscHandlerBound) {
      window._streamEscHandlerBound = true;
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
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

    // 1. Channel switcher
    container.querySelectorAll('.stream-ch-pill').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.chId;
        if (id && channelsMap.has(id) && id !== activeChannelId) {
          await switchChannel(id, container);
        }
      });
    });

    // 2. Category filter pills (Admin)
    container.querySelectorAll('.stream-cat-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.catName;
        if (cat) {
          selectedCategory = cat;
          renderUI(container);
        }
      });
    });

    // 3. Helper to refresh message list and pinned bar
    const refreshMsgList = () => {
      const list = container.querySelector('#stream-msg-list');
      if (list && activeChannel) {
        list.innerHTML = renderMsgList(activeChannel.state?.messages);
        scrollBottom();
      }
    };

    // 4. Attach client-level real-time listener
    if (client && !isListening) {
      isListening = true;

      client.on('message.new', event => {
        if (activeChannel && (event.channel_id === activeChannel.id || event.cid === activeChannel.cid)) {
          if (event.message && activeChannel.state?.messages) {
            if (!activeChannel.state.messages.some(m => m.id === event.message.id)) {
              activeChannel.state.messages.push(event.message);
            }
          }
          refreshMsgList();
        }
      });

      client.on('message.updated', event => {
        if (activeChannel && (event.channel_id === activeChannel.id || event.cid === activeChannel.cid)) {
          refreshMsgList();
        }
      });

      client.on('message.deleted', event => {
        if (activeChannel && (event.channel_id === activeChannel.id || event.cid === activeChannel.cid)) {
          refreshMsgList();
        }
      });

      client.on('channel.truncated', event => {
        if (activeChannel && (event.channel_id === activeChannel.id || event.cid === activeChannel.cid)) {
          if (activeChannel.state) activeChannel.state.messages = [];
          refreshMsgList();
        }
      });

      client.on('user.presence.changed', () => {
        const cntEl = container.querySelector('#stream-online-count');
        if (cntEl && activeChannel) {
          cntEl.textContent = `${activeChannel.state?.watcher_count || 1} active now`;
        }
      });

      client.on('typing.start', e => {
        if (e.user?.id !== currentUser.id && activeChannel && (e.channel_id === activeChannel.id || e.cid === activeChannel.cid)) {
          const box = container.querySelector('#stream-typing-box');
          if (box) box.textContent = `✍️ ${escapeHtml(e.user?.name || 'Someone')} is typing in this group...`;
        }
      });

      client.on('typing.stop', e => {
        if (e.user?.id !== currentUser.id && activeChannel && (e.channel_id === activeChannel.id || e.cid === activeChannel.cid)) {
          const box = container.querySelector('#stream-typing-box');
          if (box) box.textContent = '';
        }
      });
    }

    // 5. Autocomplete popup controller (@mentions & /slash commands)
    const input = container.querySelector('#stream-msg-input');
    const autoBox = container.querySelector('#stream-autocomplete-box');
    const quickHgBtn = container.querySelector('#btn-quick-hg');
    const quickQuestBtn = container.querySelector('#btn-quick-quest');
    let autoSelectedIndex = 0;
    let autoMode = null; // 'slash' | 'mention' | null

    if (quickHgBtn && input) {
      quickHgBtn.addEventListener('click', () => {
        if (input.value.startsWith('/hg ')) {
          input.value = input.value.replace(/^\/hg\s*/i, '');
        } else {
          const cleaned = input.value.replace(/^\/(quest|question|pin|notice|highlight)\s*/i, '');
          input.value = `/hg ${cleaned.trim()}`;
        }
        hideAutocomplete();
        input.focus();
      });
    }

    if (quickQuestBtn && input) {
      quickQuestBtn.addEventListener('click', () => {
        if (input.value.startsWith('/quest ')) {
          input.value = input.value.replace(/^\/quest\s*/i, '');
        } else {
          const cleaned = input.value.replace(/^\/(hg|highlight|pin|notice|question)\s*/i, '');
          input.value = `/quest ${cleaned.trim()}`;
        }
        hideAutocomplete();
        input.focus();
      });
    }

    function hideAutocomplete() {
      if (autoBox) {
        autoBox.style.display = 'none';
        autoBox.innerHTML = '';
      }
      autoMode = null;
      autoSelectedIndex = 0;
    }

    function renderSlashCommands(filterQuery) {
      const q = filterQuery.toLowerCase().trim();
      const isAdminUser = currentUser.role === 'admin';
      const availableCmds = SLASH_COMMANDS.filter(c => isAdminUser ? true : c.forStudents);
      const filtered = availableCmds.filter(c => c.cmd.toLowerCase().includes(q) || c.label.toLowerCase().includes(q));
      if (!filtered.length) { hideAutocomplete(); return; }

      autoMode = 'slash';
      autoSelectedIndex = Math.min(autoSelectedIndex, filtered.length - 1);
      if (autoSelectedIndex < 0) autoSelectedIndex = 0;

      autoBox.innerHTML = `
        <div style="padding: 0.4rem 0.85rem; font-size: 0.74rem; font-weight: 800; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #F1F5F9; background: #FAF9F6;">
          ⚡ ${isAdminUser ? 'Admin & Class Commands' : 'Class Commands'}
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

      autoBox.querySelectorAll('.auto-item').forEach(item => {
        item.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const cmd = item.dataset.cmd;
          if (cmd === '/clear') {
            input.value = '';
            hideAutocomplete();
            container.querySelector('.btn-clear-group-chat')?.click();
            return;
          }
          if (cmd === '/help') {
            input.value = '';
            hideAutocomplete();
            showHelpModal();
            return;
          }
          input.value = `${cmd} `;
          hideAutocomplete();
          input.focus();
        });
      });
    }

    function renderMentions(filterQuery) {
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

      autoBox.querySelectorAll('.auto-item').forEach(item => {
        item.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const mentionText = item.dataset.mention;
          insertMentionIntoInput(mentionText);
        });
      });
    }

    function insertMentionIntoInput(mentionText) {
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

    input?.addEventListener('input', () => {
      const val = input.value;
      const cursorPos = input.selectionStart ?? val.length;
      const textBeforeCursor = val.substring(0, cursorPos);

      if (activeChannel) activeChannel.keystroke().catch(() => {});

      // 1. Slash commands trigger: Only when input starts with '/' AND has not typed a space yet
      if (val.startsWith('/') && !val.includes(' ')) {
        renderSlashCommands(val.slice(1));
        return;
      }

      // 2. Mentions trigger: When user typed '@' before cursor and has not typed a space after '@'
      const lastAt = textBeforeCursor.lastIndexOf('@');
      if (lastAt >= 0) {
        const textAfterAt = textBeforeCursor.substring(lastAt + 1);
        if (!textAfterAt.includes(' ')) {
          renderMentions(textAfterAt);
          return;
        }
      }

      hideAutocomplete();
    });

    input?.addEventListener('keydown', e => {
      if (!autoMode || !autoBox || autoBox.style.display === 'none') return;
      const items = autoBox.querySelectorAll('.auto-item');
      if (!items.length) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        autoSelectedIndex = (autoSelectedIndex + 1) % items.length;
        items.forEach((it, idx) => it.style.background = (idx === autoSelectedIndex) ? '#ECFDF5' : '#FFFFFF');
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        autoSelectedIndex = (autoSelectedIndex - 1 + items.length) % items.length;
        items.forEach((it, idx) => it.style.background = (idx === autoSelectedIndex) ? '#ECFDF5' : '#FFFFFF');
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const sel = items[autoSelectedIndex];
        if (sel) sel.click();
      } else if (e.key === 'Escape') {
        hideAutocomplete();
      }
    });

    // Close autocomplete on click outside
    document.addEventListener('click', (e) => {
      if (autoBox && autoBox.style.display !== 'none' && !autoBox.contains(e.target) && e.target !== input) {
        hideAutocomplete();
      }
    });

    // 6. Send message form
    const form = container.querySelector('#stream-chat-form');
    const sendBtn = container.querySelector('#btn-stream-send');

    form?.addEventListener('submit', async e => {
      e.preventDefault();
      const rawText = (input.value || '').trim();
      if (!rawText) return;

      hideAutocomplete();

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

      const isQuestion = /^\/(quest|question)\b/i.test(rawText);
      const isHighlight = /^\/(hg|highlight)\b/i.test(rawText);
      const isPinCommand = /^\/pin\b/i.test(rawText);
      const isNotice = /^\/notice\b/i.test(rawText);

      // Validate that user entered actual message text after command
      const cleanBody = rawText.replace(/^\/(quest|question|hg|highlight|pin|notice)\s*/i, '').trim();
      if ((isQuestion || isHighlight || isPinCommand || isNotice) && !cleanBody) {
        alert('⚠️ Please type your message text after the slash command (e.g. /quest What is thermodynamics?)');
        input.focus();
        return;
      }

      input.value = '';
      if (sendBtn) sendBtn.disabled = true;

      try {
        const msgPayload = {
          text: rawText,
          is_question: isQuestion,
          is_highlighted: isHighlight,
          is_notice: isNotice,
          custom_type: isQuestion ? 'question' : (isHighlight ? 'highlight' : (isNotice ? 'notice' : 'text'))
        };

        const sent = await activeChannel.sendMessage(msgPayload);

        // Ensure local activeChannel state has the message immediately
        if (sent?.message && activeChannel?.state?.messages) {
          if (!activeChannel.state.messages.some(m => m.id === sent.message.id)) {
            activeChannel.state.messages.push(sent.message);
          }
        }

        // If sent with /pin, immediately pin it
        if (isPinCommand && sent?.message?.id) {
          try {
            await handlePinAction(sent.message.id, true);
          } catch (_) {}
        }

        refreshMsgList();
      } catch (err) {
        console.error('[StreamChat Send Error]', err);
        alert('Failed to send message: ' + err.message);
      } finally {
        if (sendBtn) sendBtn.disabled = false;
        if (input) input.focus();
      }
    });

    // 7. Pin / Unpin Action Handler
    async function handlePinAction(msgId, shouldPin) {
      const token = (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('pragyan_portal_token')) || '';
      
      try {
        const res = await fetch('/api/health?action=stream-pin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ messageId: msgId, pin: shouldPin })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to update pin state on server');
        }
      } catch (srvErr) {
        console.warn('[Pin server note]', srvErr.message);
        if (client) {
          if (shouldPin) {
            try { await client.pinMessage({ id: msgId }); } catch (_) {}
          } else {
            try { await client.unpinMessage({ id: msgId }); } catch (_) {}
          }
        }
      }

      // Update local state and refresh
      if (activeChannel?.state?.messages) {
        const target = activeChannel.state.messages.find(m => m.id === msgId);
        if (target) {
          target.pinned = shouldPin;
          target.is_pinned = shouldPin;
          target.pinned_at = shouldPin ? new Date().toISOString() : null;
        }
      }

      renderUI(container);
    }

    // 8. Event delegation on container for Pin, Unpin, Delete, Jump
    container.addEventListener('click', async e => {
      // Pin message
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

      // Unpin message
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

      // Jump to pinned message
      const jumpBtn = e.target.closest('.btn-jump-pin');
      if (jumpBtn) {
        e.preventDefault();
        const msgId = jumpBtn.dataset.msgId;
        if (!msgId) return;
        const targetEl = container.querySelector(`#msg-${msgId}`);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          targetEl.style.transition = 'box-shadow 0.3s ease, transform 0.3s ease';
          targetEl.style.transform = 'scale(1.02)';
          targetEl.style.boxShadow = '0 0 20px rgba(245, 158, 11, 0.6)';
          setTimeout(() => {
            targetEl.style.transform = '';
            targetEl.style.boxShadow = '';
          }, 1500);
        }
        return;
      }

      // Delete message
      const delBtn = e.target.closest('[data-del-msg]');
      if (delBtn) {
        e.preventDefault();
        const msgId = delBtn.dataset.delMsg;
        if (!msgId) return;
        if (!confirm('Are you sure you want to permanently delete this message for everyone?')) return;
        delBtn.disabled = true;
        delBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

        try {
          if (client) await client.deleteMessage(msgId);
          if (activeChannel?.state?.messages) {
            activeChannel.state.messages = activeChannel.state.messages.filter(m => m.id !== msgId);
          }
          refreshMsgList();
        } catch (err) {
          console.error('[Delete Msg Error]', err);
          alert('Delete failed: ' + err.message);
          delBtn.disabled = false;
          delBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i> Delete';
        }
        return;
      }
    });

    // 9. Admin Clear Group Chat (Purge all messages in channel)
    const clearBtn = container.querySelector('.btn-clear-group-chat');
    if (clearBtn) {
      clearBtn.addEventListener('click', async () => {
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

          const data = await res.json();
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
      });
    }
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
          <div style="padding: 4rem 1.5rem; text-align: center; color: #64748B;">
            <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 2.5rem; color: #064E3B;" aria-hidden="true"></i>
            <p style="margin-top: 1.25rem; font-weight: 800; font-size: 1.05rem; color: #1E293B;">Connecting to Pragyan Realtime Class Gateway…</p>
            <p style="font-size: 0.85rem; color: #64748B;">Syncing live class channels and message archives from Stream cloud...</p>
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
    if (client) { 
      try { client.disconnectUser(); } catch (_) {}
      client = null; 
    }
    channelsMap.clear(); activeChannel = null; currentUser = null; isListening = false;
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
    deleteMessage: async (msgId) => { if (client) { await client.deleteMessage(msgId); } },
    pinMessage: async (msgId) => { if (client) { await client.pinMessage({ id: msgId }); } },
    unpinMessage: async (msgId) => { if (client) { await client.unpinMessage({ id: msgId }); } },
    disconnect
  };

  window.initGetStreamChat = async function () {
    const pane = getActiveCommunityPane();
    if (pane) { await init(pane); }
  };
})();
