/* ==========================================================================
 * PRAGYAN INSTITUTE — STREAM CHAT REALTIME CLASS-WISE FORUMS
 * ----------------------------------------------------------------------------
 * Dedicated GetStream.io realtime chat channel for EVERY individual class
 * (Class 1st to 12th + Special English courses).
 * - Students automatically enter their specific class forum.
 * - Administrators have full multi-class access and moderation across all classes.
 * - Persistent message history, real-time WebSockets, verified badges.
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

  function resolveBatchId() {
    try {
      const user = (typeof AppState !== 'undefined' && AppState.currentUser) || {};
      if (user.batchId && String(user.batchId).startsWith('BAT-')) return user.batchId;
      if (user.batch_id && String(user.batch_id).startsWith('BAT-')) return user.batch_id;

      const cn = user.className || user.class_name || user.class || user.batch || '';
      if (window.PRAGYAN_ACADEMIC && typeof window.PRAGYAN_ACADEMIC.resolveBatch === 'function') {
        const batch = window.PRAGYAN_ACADEMIC.resolveBatch(cn);
        if (batch) return batch.batchId;
      }

      // Check student roll number code (e.g. 261001 -> 10 -> Class 10th)
      const roll = String(user.student_id || user.rollNo || user.id || '');
      if (roll.length >= 4 && window.PRAGYAN_ACADEMIC && typeof window.PRAGYAN_ACADEMIC.resolveBatch === 'function') {
        const classCode = roll.substring(2, 4);
        const batch = (window.PRAGYAN_ACADEMIC.BATCHES || []).find(b => b.classCode === classCode);
        if (batch) return batch.batchId;
      }
    } catch (_) {}
    return '';
  }

  function getStudentCountForBatch(batchId) {
    try {
      if (typeof AppState === 'undefined' || !AppState.getStudents) return 0;
      const students = AppState.getStudents() || [];
      if (!window.PRAGYAN_ACADEMIC || !window.PRAGYAN_ACADEMIC.resolveBatch) return 0;
      return students.filter(s => {
        const b = window.PRAGYAN_ACADEMIC.resolveBatch(s.className || s.class_name || '');
        return b && b.batchId === batchId;
      }).length;
    } catch (_) {
      return 0;
    }
  }

  async function setupChannels() {
    channelsMap.clear();
    const isAdmin = currentUser.role === 'admin';
    const myBatch = resolveBatchId();
    const batches = (window.PRAGYAN_ACADEMIC && window.PRAGYAN_ACADEMIC.BATCHES) || [];

    // Register all class-specific batch channels
    for (const b of batches) {
      if (!isAdmin && myBatch && b.batchId !== myBatch) continue;
      const chId = `batch-${b.batchId}`;
      const meta = CHANNEL_IDENTITIES[chId] || { name: b.name || b.batchId };
      const ch = client.channel(CHANNEL_TYPE, chId, {
        name: meta.name
      });
      channelsMap.set(chId, ch);
    }

    // Resilience fallback: if student's specific batch was not resolved, expose all channels so student is never blocked
    if (!isAdmin && channelsMap.size === 0) {
      for (const b of batches) {
        const chId = `batch-${b.batchId}`;
        const meta = CHANNEL_IDENTITIES[chId] || { name: b.name || b.batchId };
        const ch = client.channel(CHANNEL_TYPE, chId, { name: meta.name });
        channelsMap.set(chId, ch);
      }
    }

    // Set default active channel:
    // - For students: their enrolled class batch channel
    // - For admin: Class 10th (or the first available batch)
    if (!isAdmin) {
      if (myBatch && channelsMap.has(`batch-${myBatch}`)) {
        activeChannelId = `batch-${myBatch}`;
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

    // Show instant loading state in message feed
    const list = container.querySelector('#stream-msg-list');
    if (list) {
      list.innerHTML = `
        <div style="text-align: center; color: #64748B; margin: auto; padding: 2rem 1rem;">
          <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 1.8rem; color: #064E3B;" aria-hidden="true"></i>
          <p style="margin-top: 0.75rem; font-size: 0.88rem; font-weight: 700;">Loading class messages...</p>
        </div>
      `;
    }

    // Always watch to fetch latest cloud messages and subscribe to real-time events
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

    // Extract student Roll No
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

  function renderMsgList(messages) {
    const channelMeta = CHANNEL_IDENTITIES[activeChannelId] || {
      name: activeChannel?.data?.name || 'Class Forum',
      icon: '💬',
      badgeColor: '#059669',
      tagline: 'Class discussion and doubts'
    };

    if (!messages || !messages.length) {
      return `
        <div style="text-align: center; color: var(--text-muted, #64748B); margin: auto; padding: 3rem 1.5rem; max-width: 440px;">
          <div style="width: 64px; height: 64px; border-radius: 50%; background: ${channelMeta.badgeColor}18; color: ${channelMeta.badgeColor}; display: inline-flex; align-items: center; justify-content: center; font-size: 1.85rem; margin-bottom: 0.85rem; border: 2px solid ${channelMeta.badgeColor}33;">
            ${channelMeta.icon}
          </div>
          <h4 style="font-weight: 800; font-size: 1.1rem; color: #1E293B; margin-bottom: 0.35rem;">
            Welcome to ${escapeHtml(channelMeta.name)}
          </h4>
          <p style="font-size: 0.85rem; line-height: 1.5; color: #64748B; margin-bottom: 1rem;">
            ${escapeHtml(channelMeta.tagline)}
          </p>
          <div style="display: inline-flex; align-items: center; gap: 0.4rem; background: #FFFFFF; border: 1px dashed ${channelMeta.badgeColor}; padding: 0.45rem 0.85rem; border-radius: 8px; font-size: 0.8rem; font-weight: 700; color: #334155;">
            ✨ Start the class discussion, ask doubts, or share lecture notes below!
          </div>
        </div>
      `;
    }

    return messages.map(m => {
      const isMine = m.user && m.user.id === currentUser.id;
      const identity = extractUserBadge(m.user, channelMeta);
      const isFaculty = identity.isFaculty;

      const avatar = m.user?.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(m.user?.name || 'User')}&background=${isFaculty ? 'D97706' : '064E3B'}&color=fff`;
      const bubbleBg = isMine ? '#064E3B' : (isFaculty ? '#FFFDF5' : '#FFFFFF');
      const bubbleColor = isMine ? '#FFFFFF' : '#1E293B';
      const bubbleBorder = isMine ? '#064E3B' : (isFaculty ? '#FDE68A' : 'var(--border-sand, #E2E8F0)');

      return `
        <div class="stream-msg-row ${isMine ? 'mine' : 'theirs'}" id="msg-${escapeHtml(m.id)}" style="display: flex; gap: 0.75rem; align-items: flex-start; margin-bottom: 1rem; ${isMine ? 'flex-direction: row-reverse;' : ''}">
          <img src="${escapeHtml(avatar)}" alt="${escapeHtml(m.user?.name || '')}" style="width: 38px; height: 38px; border-radius: 50%; object-fit: cover; border: 2px solid ${isFaculty ? '#F59E0B' : (isMine ? '#10B981' : '#059669')}; flex-shrink: 0; box-shadow: 0 2px 6px rgba(0,0,0,0.08);">
          <div style="max-width: 82%; display: flex; flex-direction: column; ${isMine ? 'align-items: flex-end;' : 'align-items: flex-start;'}">
            
            <!-- Sender Identity Badges -->
            <div style="display: flex; gap: 0.45rem; align-items: center; font-size: 0.76rem; margin-bottom: 0.3rem; flex-wrap: wrap; ${isMine ? 'flex-direction: row-reverse;' : ''}">
              <strong style="color: ${isFaculty ? '#B45309' : (isMine ? '#064E3B' : 'var(--text-mahogany, #5A2E25)')}; font-weight: 800;">
                ${escapeHtml(m.user?.name || 'User')}
              </strong>
              
              <span style="background: ${identity.badgeBg}; color: ${identity.badgeColor}; border: 1px solid ${identity.badgeBorder}; font-size: 0.68rem; font-weight: 800; padding: 0.1rem 0.45rem; border-radius: 4px; display: inline-flex; align-items: center; gap: 0.25rem;">
                ${identity.badgeText}
              </span>

              <span style="color: var(--text-muted, #64748B); font-size: 0.72rem;">
                ${fmtTime(m.created_at)}
              </span>
            </div>

            <!-- Message Bubble -->
            <div class="stream-msg-bubble" style="background: ${bubbleBg}; color: ${bubbleColor}; border: 1.5px solid ${bubbleBorder}; padding: 0.75rem 1rem; border-radius: 12px; font-size: 0.92rem; line-height: 1.5; word-break: break-word; overflow-wrap: anywhere; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
              ${escapeHtml(m.text || '')}
            </div>

            <!-- Admin Moderation Action -->
            ${currentUser.role === 'admin' ? `
              <div style="display: flex; gap: 0.4rem; margin-top: 0.25rem;">
                <button type="button" class="btn-del-msg" data-del-msg="${escapeHtml(m.id)}" style="background: none; border: none; font-size: 0.72rem; color: #DC2626; cursor: pointer; padding: 0.15rem 0.35rem; border-radius: 4px; font-weight: 700; opacity: 0.85; transition: opacity 0.2s;" aria-label="Delete message">
                  <i class="fa-solid fa-trash-can" aria-hidden="true"></i> Delete
                </button>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  function getCategoriesList() {
    const isAdmin = currentUser.role === 'admin';
    if (!isAdmin) return ['ALL'];
    return ['ALL', 'Senior Secondary', 'Secondary', 'Junior & Middle', 'Special English'];
  }

  function renderUI(container) {
    const isAdmin = currentUser.role === 'admin';
    const channelList = Array.from(channelsMap.entries());

    // Filter channels based on category and search query
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

    container.innerHTML = `
      <div class="stream-chat-wrapper" style="display: flex; flex-direction: column; height: clamp(520px, 80vh, 820px); max-height: calc(100dvh - 130px); background: #FFFFFF; border-radius: 14px; border: 1.5px solid var(--border-sand, #DDD5CD); overflow: hidden; box-shadow: 0 8px 30px rgba(0,0,0,0.08);">
        
        <!-- TOP APP BAR & LIVE STATUS -->
        <div class="stream-top-bar" style="background: #042E23; color: #FFFFFF; padding: 0.6rem 1rem; display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.1); flex-shrink: 0;">
          <div style="display: flex; align-items: center; gap: 0.6rem; overflow: hidden;">
            <div style="width: 32px; height: 32px; border-radius: 8px; background: rgba(16, 185, 129, 0.2); color: #34D399; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; flex-shrink: 0;">
              ${activeMeta.icon}
            </div>
            <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              <span style="font-weight: 800; font-size: 0.92rem; color: #FFFFFF; letter-spacing: -0.01em;">
                Pragyan Class Forum
              </span>
              <span style="font-size: 0.75rem; color: #A7F3D0; margin-left: 0.4rem; opacity: 0.85;">
                • ${isAdmin ? '🛡️ Admin Multi-Class Hub' : `🎓 ${escapeHtml(activeMeta.shortName)}`}
              </span>
            </div>
          </div>

          <div style="font-size: 0.78rem; color: #D1FAE5; white-space: nowrap; display: flex; align-items: center; gap: 0.45rem; flex-shrink: 0; background: rgba(255,255,255,0.08); padding: 0.25rem 0.65rem; border-radius: 99px; border: 1px solid rgba(255,255,255,0.15);">
            <span style="width: 8px; height: 8px; border-radius: 50%; background: #34D399; display: inline-block; box-shadow: 0 0 8px #34D399;"></span>
            <span id="stream-online-count" style="font-weight: 700;">${onlineCount} active now</span>
          </div>
        </div>

        <!-- CATEGORIES FILTER BAR (If Admin) -->
        ${isAdmin ? `
          <div class="stream-cat-bar" style="background: #F8FAFC; padding: 0.5rem 0.85rem; border-bottom: 1px solid #E2E8F0; display: flex; gap: 0.4rem; align-items: center; overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; flex-shrink: 0;">
            ${categories.map(cat => `
              <button type="button" class="stream-cat-pill ${selectedCategory === cat ? 'active' : ''}" data-cat-name="${escapeHtml(cat)}" style="padding: 0.28rem 0.7rem; border-radius: 99px; font-size: 0.76rem; font-weight: 700; cursor: pointer; border: 1px solid ${selectedCategory === cat ? '#064E3B' : '#CBD5E1'}; background: ${selectedCategory === cat ? '#064E3B' : '#FFFFFF'}; color: ${selectedCategory === cat ? '#FFFFFF' : '#475569'}; white-space: nowrap; transition: all 0.15s ease;">
                ${cat === 'ALL' ? '🌐 All Classes (12)' : escapeHtml(cat)}
              </button>
            `).join('')}
          </div>
        ` : ''}

        <!-- CLASS GROUPS HORIZONTAL TABS BAR (Shown if more than 1 class available to user) -->
        ${filteredChannels.length > 1 ? `
          <div class="stream-channels-scroll-wrap" style="background: #FFFFFF; padding: 0.55rem 0.85rem; border-bottom: 1.5px solid var(--border-sand, #E2E8F0); display: flex; gap: 0.5rem; align-items: center; overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; flex-shrink: 0;">
            ${filteredChannels.map(([id]) => {
              const meta = CHANNEL_IDENTITIES[id] || { shortName: id, icon: '💬', badgeColor: '#059669' };
              const isActive = id === activeChannelId;
              const count = getStudentCountForBatch(meta.batchId);
              return `
                <button type="button" class="stream-ch-pill ${isActive ? 'active' : ''}" data-ch-id="${escapeHtml(id)}" style="display: inline-flex; align-items: center; gap: 0.45rem; padding: 0.4rem 0.85rem; border-radius: 99px; font-size: 0.82rem; font-weight: 700; cursor: pointer; border: 1.5px solid ${isActive ? meta.badgeColor : '#E2E8F0'}; background: ${isActive ? meta.badgeColor : '#F8FAFC'}; color: ${isActive ? '#FFFFFF' : '#334155'}; white-space: nowrap; transition: all 0.2s ease; box-shadow: ${isActive ? '0 3px 10px rgba(0,0,0,0.12)' : 'none'}; min-height: 38px;">
                  <span style="font-size: 1rem;">${meta.icon}</span>
                  <span>${escapeHtml(meta.shortName)}</span>
                  ${count > 0 ? `
                    <span style="background: ${isActive ? 'rgba(255,255,255,0.25)' : '#E2E8F0'}; color: ${isActive ? '#FFFFFF' : '#475569'}; font-size: 0.72rem; padding: 0.05rem 0.45rem; border-radius: 99px; font-weight: 800;">
                      ${count}
                    </span>
                  ` : ''}
                </button>
              `;
            }).join('')}
          </div>
        ` : ''}

        <!-- ACTIVE CLASS IDENTITY BANNER -->
        <div class="stream-active-banner" style="background: ${activeMeta.bannerBg}; color: #FFFFFF; padding: 0.75rem 1rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; border-bottom: 2px solid rgba(0,0,0,0.1); flex-shrink: 0;">
          <div style="display: flex; align-items: center; gap: 0.75rem; overflow: hidden;">
            <div style="font-size: 1.85rem; width: 44px; height: 44px; border-radius: 10px; background: rgba(255,255,255,0.15); display: flex; align-items: center; justify-content: center; flex-shrink: 0; border: 1px solid rgba(255,255,255,0.25);">
              ${activeMeta.icon}
            </div>
            <div style="overflow: hidden;">
              <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                <h3 style="font-size: 1.05rem; font-weight: 800; color: #FFFFFF; margin: 0; letter-spacing: -0.01em;">
                  ${escapeHtml(activeMeta.name)}
                </h3>
                <span style="background: rgba(255,255,255,0.2); color: #FFFFFF; font-size: 0.7rem; font-weight: 800; padding: 0.1rem 0.5rem; border-radius: 4px; border: 1px solid rgba(255,255,255,0.3);">
                  ${escapeHtml(activeMeta.category)}
                </span>
              </div>
              <p style="font-size: 0.78rem; color: #E2E8F0; margin: 0.15rem 0 0 0; opacity: 0.9; text-overflow: ellipsis; white-space: nowrap; overflow: hidden;">
                ${escapeHtml(activeMeta.tagline)} • <strong style="color: #FEF08A;">Mentors: ${escapeHtml(activeMeta.mentors)}</strong>
              </p>
            </div>
          </div>

          <div style="text-align: right; flex-shrink: 0; display: none;" class="desktop-banner-stats">
            <span style="font-size: 0.72rem; color: #D1FAE5; background: rgba(0,0,0,0.2); padding: 0.25rem 0.55rem; border-radius: 6px; font-weight: 700; display: inline-block;">
              👥 Enrolled Students: ${studentCount}
            </span>
          </div>
        </div>

        <!-- MESSAGES FEED CONTAINER -->
        <div id="stream-msg-list" style="flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 1.25rem 1rem; background: #FAF9F6; display: flex; flex-direction: column;">
          ${renderMsgList(activeChannel?.state?.messages)}
        </div>

        <!-- REALTIME TYPING NOTIFIER -->
        <div id="stream-typing-box" style="padding: 0.2rem 1rem; font-size: 0.75rem; color: #64748B; font-style: italic; min-height: 20px; background: #FAF9F6; border-top: 1px solid rgba(0,0,0,0.03);"></div>

        <!-- COMPOSER INPUT BAR -->
        <form id="stream-chat-form" style="display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem 1rem; background: #FFFFFF; border-top: 1.5px solid var(--border-sand, #DDD5CD); flex-shrink: 0;">
          <input type="text" id="stream-msg-input" class="portal-input" placeholder="Message ${escapeHtml(activeMeta.shortName)} as ${escapeHtml(currentUser.name)}…" style="flex: 1; border-radius: 10px; font-size: 16px; min-height: 46px; padding: 0.6rem 0.95rem; border: 1.5px solid var(--border-sand, #CBD5E1); background: #FAF9F6; transition: border-color 0.2s;" autocomplete="off" aria-label="Chat message" required>
          <button type="submit" class="btn btn-emerald" id="btn-stream-send" style="padding: 0.6rem 1.35rem; font-weight: 800; border-radius: 10px; display: inline-flex; align-items: center; gap: 0.45rem; min-height: 46px; font-size: 0.9rem; flex-shrink: 0; box-shadow: 0 4px 12px rgba(6,78,59,0.2);">
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

    // 3. Helper to refresh message list
    const refreshMsgList = () => {
      const list = container.querySelector('#stream-msg-list');
      if (list && activeChannel) {
        list.innerHTML = renderMsgList(activeChannel.state?.messages);
        scrollBottom();
      }
    };

    // 4. Attach client-level real-time listener (if not already listening)
    if (client && !isListening) {
      isListening = true;

      client.on('message.new', event => {
        if (activeChannel && (event.channel_id === activeChannel.id || event.cid === activeChannel.cid)) {
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

    // 5. Send message form
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
        refreshMsgList();
      } catch (err) {
        console.error('[StreamChat Send Error]', err);
        alert('Failed to send message: ' + err.message);
      } finally {
        if (sendBtn) sendBtn.disabled = false;
        if (input) input.focus();
      }
    });

    // 6. Admin message delete
    container.querySelectorAll('[data-del-msg]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const msgId = btn.dataset.delMsg;
        if (!confirm('Are you sure you want to permanently delete this message for everyone?')) return;
        try {
          await client.deleteMessage(msgId);
          if (activeChannel?.state?.messages) {
            activeChannel.state.messages = activeChannel.state.messages.filter(m => m.id !== msgId);
          }
          refreshMsgList();
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
      // Passing { id: tokenData.userId } directly avoids Stream WS code 6 username collisions
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
      const pane = document.getElementById('adminTabPane-community') || document.getElementById('studentTabPane-community');
      if (pane) init(pane);
    },
    switchChannel(chId) {
      const pane = document.getElementById('adminTabPane-community') || document.getElementById('studentTabPane-community');
      if (pane) switchChannel(chId, pane);
    },
    deleteMessage: async (msgId) => { if (client) { await client.deleteMessage(msgId); } },
    disconnect
  };

  window.initGetStreamChat = async function () {
    const pane = document.getElementById('adminTabPane-community') || document.getElementById('studentTabPane-community');
    if (pane) { await init(pane); }
  };
})();
