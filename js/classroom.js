/**
 * Pragyan Institute — Version 2.0 Classroom & Live Lecture Engine
 * Features: Zero-Sync YouTube ULL Streaming, Dynamic Anti-Piracy Watermark,
 * Real-Time Supabase Doubts, 0.75x–2.0x Playback, and R2 Study Material PDF Downloader.
 */
(function () {
  'use strict';

  // ── Default Curated Foundation Lectures ────────────────────────────────────
  const DEFAULT_LECTURES = [
    {
      id: 'lec-10-sci-01',
      class_batch: '10th',
      subject: 'Science',
      chapter_no: 1,
      chapter_title: 'Chemical Reactions and Equations',
      lecture_title: 'Balancing Chemical Equations & Types of Reactions',
      video_source_id: 'd41r9k2f1W0', // Curated NCERT/CBSE educational stream
      duration_minutes: 52,
      pdf_notes_url: 'https://pub-r2.pragyaninstitute.com/notes/class10-science-ch1.pdf',
      thumbnail_url: 'https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&w=600&q=80',
      is_live: true,
      live_scheduled_at: new Date().toISOString(),
      created_by: 'Chandan Kumar'
    },
    {
      id: 'lec-10-math-01',
      class_batch: '10th',
      subject: 'Mathematics',
      chapter_no: 1,
      chapter_title: 'Real Numbers & Polynomials',
      lecture_title: 'Euclid Division Lemma & Fundamental Theorem of Arithmetic',
      video_source_id: 'Pj_vH0d2jls',
      duration_minutes: 48,
      pdf_notes_url: 'https://pub-r2.pragyaninstitute.com/notes/class10-maths-ch1.pdf',
      thumbnail_url: 'https://images.unsplash.com/photo-1509228468518-180dd4864904?auto=format&fit=crop&w=600&q=80',
      is_live: false,
      created_by: 'Prof. Ravi Ranjan'
    },
    {
      id: 'lec-09-sci-01',
      class_batch: '9th',
      subject: 'Science',
      chapter_no: 1,
      chapter_title: 'Matter in Our Surroundings',
      lecture_title: 'Physical Nature of Matter & States of Matter',
      video_source_id: 'Z1BCujX3pw8',
      duration_minutes: 45,
      pdf_notes_url: 'https://pub-r2.pragyaninstitute.com/notes/class9-science-ch1.pdf',
      thumbnail_url: 'https://images.unsplash.com/photo-1507668077129-56e32842fceb?auto=format&fit=crop&w=600&q=80',
      is_live: false,
      created_by: 'Chandan Kumar'
    },
    {
      id: 'lec-08-sci-01',
      class_batch: '8th',
      subject: 'Science',
      chapter_no: 1,
      chapter_title: 'Crop Production and Management',
      lecture_title: 'Agricultural Practices & Modern Irrigation Systems',
      video_source_id: 'kJQP7kiw5Fk',
      duration_minutes: 40,
      pdf_notes_url: 'https://pub-r2.pragyaninstitute.com/notes/class8-science-ch1.pdf',
      thumbnail_url: 'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=600&q=80',
      is_live: false,
      created_by: 'Chandan Kumar'
    }
  ];

  const PragyanClassroom = {
    currentLecture: null,
    watermarkTimer: null,
    playbackSpeed: 1.0,
    doubts: [],
    realtimeSubscription: null,

    /**
     * Initialize the classroom component inside a container
     */
    init: function (containerEl, options = {}) {
      if (!containerEl) return;
      this.options = options;
      this.render(containerEl);
      this.loadInitialLecture();
    },

    /**
     * Render the classroom DOM structure
     */
    render: function (containerEl) {
      containerEl.innerHTML = `
        <div class="classroom-container">
          <!-- Main Video Stage -->
          <div class="video-stage-card">
            <!-- Header Bar -->
            <div class="classroom-header-bar">
              <div class="classroom-title-wrap">
                <h3 id="classroomLectureTitle">Loading Lecture...</h3>
                <div class="sub-info" id="classroomLectureSubInfo">Smart Classroom • Pragyan Institute</div>
              </div>
              <div id="classroomLiveBadge" class="live-badge off">
                <span class="live-beacon"></span>
                <span id="classroomLiveText">RECORDED</span>
              </div>
            </div>

            <!-- Video Player Container with Anti-Piracy Watermark -->
            <div class="video-frame-container" id="videoFrameContainer">
              <iframe
                id="classroomIframe"
                src=""
                title="Pragyan Classroom Video"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowfullscreen>
              </iframe>
              <div class="floating-watermark" id="classroomWatermark">Pragyan Institute • Student</div>
            </div>

            <!-- Custom Controls Toolbar -->
            <div class="player-controls-toolbar">
              <div class="speed-control-group">
                <span style="font-size: 11px; color: #64748B; font-weight: 700; padding: 4px 6px;">SPEED:</span>
                <button class="speed-btn" onclick="PragyanClassroom.setSpeed(0.75)">0.75x</button>
                <button class="speed-btn active" onclick="PragyanClassroom.setSpeed(1.0)">1.0x</button>
                <button class="speed-btn" onclick="PragyanClassroom.setSpeed(1.25)">1.25x</button>
                <button class="speed-btn" onclick="PragyanClassroom.setSpeed(1.5)">1.5x</button>
                <button class="speed-btn" onclick="PragyanClassroom.setSpeed(2.0)">2.0x</button>
              </div>

              <div style="display: flex; gap: 8px; align-items: center;">
                <a id="classroomNotesBtn" href="#" target="_blank" class="notes-download-btn">
                  📄 Download Chapter Notes (PDF)
                </a>
              </div>
            </div>
          </div>

          <!-- Real-Time Doubt Stream Pane -->
          <div class="doubt-stream-card">
            <div class="doubt-stream-header">
              <h4>💬 Live Doubt Stream</h4>
              <span class="doubt-counter-badge" id="doubtCountBadge">0 Doubts</span>
            </div>

            <div class="doubt-messages-list" id="doubtMessagesList">
              <div style="text-align: center; color: #94A3B8; font-size: 11px; margin-top: 30px;">
                Ask any question or concept doubt below! Educators answer in real time.
              </div>
            </div>

            <form class="doubt-input-form" onsubmit="PragyanClassroom.handleDoubtSubmit(event)">
              <input
                type="text"
                id="doubtInputText"
                class="doubt-input"
                placeholder="Ask doubt about this topic..."
                maxlength="200"
                required
              />
              <button type="submit" class="doubt-send-btn">Ask 🚀</button>
            </form>
          </div>
        </div>

        <!-- Video Lectures Library / Curriculum Explorer -->
        <div style="margin-top: 28px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
            <div>
              <h3 style="font-size: 16px; font-weight: 800; color: #0F172A; margin: 0;">📚 Class Lecture Library & Study Materials</h3>
              <p style="font-size: 12px; color: #64748B; margin: 2px 0 0 0;">Chapter-wise HD recorded classes, Daily Practice Papers & R2 PDF notes.</p>
            </div>
            <div style="display: flex; gap: 6px;" id="subjectFilterTabs">
              <button class="filter-pill active" onclick="PragyanClassroom.filterSubject('All')">All Subjects</button>
              <button class="filter-pill" onclick="PragyanClassroom.filterSubject('Science')">Science</button>
              <button class="filter-pill" onclick="PragyanClassroom.filterSubject('Mathematics')">Mathematics</button>
            </div>
          </div>

          <div class="lecture-grid" id="lectureLibraryGrid"></div>
        </div>
      `;
    },

    /**
     * Get all lectures (merges local master and Supabase sync)
     */
    getLectures: function () {
      try {
        if (typeof localStorage !== 'undefined') {
          const stored = localStorage.getItem('pragyan_db_video_lectures_master');
          if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) {
              return parsed;
            }
          }
        }
      } catch (e) {
        console.warn('[Classroom] Stored lectures parse error:', e);
      }
      return DEFAULT_LECTURES;
    },

    /**
     * Load initial lecture
     */
    loadInitialLecture: function () {
      const lectures = this.getLectures();
      const liveLecture = lectures.find(l => l.is_live);
      const target = liveLecture || lectures[0] || DEFAULT_LECTURES[0];
      this.playLecture(target.id);
      this.renderLibrary();
    },

    /**
     * Play selected lecture
     */
    playLecture: function (lectureId) {
      const lectures = this.getLectures();
      const lecture = lectures.find(l => l.id === lectureId) || lectures[0];
      if (!lecture) return;

      this.currentLecture = lecture;

      // Update Header
      const titleEl = document.getElementById('classroomLectureTitle');
      const subEl = document.getElementById('classroomLectureSubInfo');
      const badgeEl = document.getElementById('classroomLiveBadge');
      const badgeTxt = document.getElementById('classroomLiveText');
      const iframeEl = document.getElementById('classroomIframe');
      const notesBtn = document.getElementById('classroomNotesBtn');

      if (titleEl) titleEl.textContent = `Ch ${lecture.chapter_no}: ${lecture.lecture_title}`;
      if (subEl) subEl.textContent = `${lecture.class_batch} Batch • ${lecture.subject} • Faculty: ${lecture.created_by || 'Chandan Kumar'}`;

      if (badgeEl && badgeTxt) {
        if (lecture.is_live) {
          badgeEl.className = 'live-badge';
          badgeTxt.textContent = '🔴 LIVE NOW';
        } else {
          badgeEl.className = 'live-badge off';
          badgeTxt.textContent = `${lecture.duration_minutes || 45} MINS`;
        }
      }

      // YouTube Embed URL (Clean privacy-enhanced zero-cookie embed with modestbranding)
      if (iframeEl) {
        const embedUrl = `https://www.youtube-nocookie.com/embed/${lecture.video_source_id}?autoplay=1&modestbranding=1&rel=0&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`;
        iframeEl.src = embedUrl;
      }

      // Update Notes Button
      if (notesBtn) {
        if (lecture.pdf_notes_url) {
          notesBtn.href = lecture.pdf_notes_url;
          notesBtn.style.display = 'inline-flex';
        } else {
          notesBtn.style.display = 'none';
        }
      }

      // Start Anti-Piracy Watermark
      const studentName = this.options.studentName || 'Student';
      const studentRoll = this.options.studentRoll || 'PI-2026';
      this.startWatermark(studentName, studentRoll);

      // Load Doubts
      this.loadDoubts(lecture.id);

      // Re-highlight active card in library
      this.highlightActiveCard(lecture.id);
    },

    /**
     * Dynamic Floating Watermark Engine
     */
    /**
     * Dynamic Floating Watermark Engine
     */
    startWatermark: function (name, roll) {
      if (this.watermarkTimer) clearInterval(this.watermarkTimer);
      const watermarkEl = document.getElementById('classroomWatermark');
      if (!watermarkEl) return;

      const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      watermarkEl.innerHTML = `🛡️ <span>${name}</span> • <span>#${roll}</span> • <span>Pragyan Institute [${timeStr}]</span>`;

      const move = () => {
        const topPercent = 8 + Math.floor(Math.random() * 75);
        const leftPercent = 8 + Math.floor(Math.random() * 65);
        watermarkEl.style.top = `${topPercent}%`;
        watermarkEl.style.left = `${leftPercent}%`;
      };

      move();
      this.watermarkTimer = setInterval(move, 5000);
    },

    /**
     * Playback Speed Controller
     */
    setSpeed: function (rate) {
      this.playbackSpeed = rate;
      const buttons = document.querySelectorAll('.speed-btn');
      buttons.forEach(btn => {
        if (btn.textContent === `${rate}x` || (rate === 1 && btn.textContent === '1.0x')) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });

      // PostMessage to YouTube IFrame API
      const iframeEl = document.getElementById('classroomIframe');
      if (iframeEl && iframeEl.contentWindow) {
        iframeEl.contentWindow.postMessage(JSON.stringify({
          event: 'command',
          func: 'setPlaybackRate',
          args: [rate]
        }), '*');
      }
    },

    /**
     * Load & Render Doubts
     */
    loadDoubts: function (lectureId) {
      let allDoubts = [];
      try {
        if (typeof localStorage !== 'undefined') {
          const stored = localStorage.getItem('pragyan_db_live_class_doubts_master') || localStorage.getItem('pragyan_db_live_doubts_master');
          if (stored) allDoubts = JSON.parse(stored);
        }
      } catch (e) {
        allDoubts = [];
      }

      this.doubts = allDoubts.filter(d => !d.lecture_id || d.lecture_id === lectureId);
      // Sort pinned doubts to top
      this.doubts.sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0));
      this.renderDoubts();
    },

    renderDoubts: function () {
      const listEl = document.getElementById('doubtMessagesList');
      const countEl = document.getElementById('doubtCountBadge');
      if (!listEl) return;

      if (countEl) countEl.textContent = `${this.doubts.length} Doubts`;

      if (this.doubts.length === 0) {
        listEl.innerHTML = `
          <div style="text-align: center; color: #94A3B8; font-size: 11.5px; margin-top: 40px; padding: 0 16px;">
            <div style="font-size: 24px; margin-bottom: 6px;">💬</div>
            <strong>No doubts yet in this lecture!</strong>
            <p style="margin: 4px 0 0 0; color: #64748B;">Type any concept question below. Faculty answers in real-time.</p>
          </div>
        `;
        return;
      }

      listEl.innerHTML = this.doubts.map(d => `
        <div class="doubt-bubble ${d.is_pinned ? 'pinned' : ''}">
          ${d.is_pinned ? `<div class="doubt-pinned-banner">📌 PINNED BY FACULTY</div>` : ''}
          <div class="doubt-sender-line">
            <span class="doubt-sender-name">🎓 ${this.escapeHtml(d.student_name || 'Student')} <span style="font-weight: 600; color: #64748B;">(#${this.escapeHtml(d.student_roll || '261001')})</span></span>
            <span>${new Date(d.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <div class="doubt-text">${this.escapeHtml(d.doubt_text)}</div>
          ${d.is_answered || d.educator_answer ? `
            <div class="doubt-answer-badge">
              <strong>👨‍🏫 ${this.escapeHtml(d.answered_by || 'Faculty')}:</strong>
              <div>${this.escapeHtml(d.educator_answer || d.answer || 'Concept explained during live lecture.')}</div>
            </div>
          ` : ''}
        </div>
      `).join('');

      listEl.scrollTop = listEl.scrollHeight;
    },

    /**
     * Submit Doubt
     */
    handleDoubtSubmit: function (e) {
      if (e) e.preventDefault();
      const inputEl = document.getElementById('doubtInputText');
      if (!inputEl || !inputEl.value.trim()) return;

      const newDoubt = {
        id: 'dbt-' + Date.now(),
        lecture_id: this.currentLecture ? this.currentLecture.id : 'lec-10-sci-01',
        student_roll: this.options.studentRoll || '261001',
        student_name: this.options.studentName || 'Student',
        doubt_text: inputEl.value.trim(),
        is_pinned: false,
        is_answered: false,
        created_at: new Date().toISOString()
      };

      this.doubts.push(newDoubt);
      this.renderDoubts();
      inputEl.value = '';

      // Persist to local & Supabase
      try {
        if (typeof localStorage !== 'undefined') {
          const stored = localStorage.getItem('pragyan_db_live_class_doubts_master') || localStorage.getItem('pragyan_db_live_doubts_master');
          const all = stored ? JSON.parse(stored) : [];
          all.push(newDoubt);
          localStorage.setItem('pragyan_db_live_class_doubts_master', JSON.stringify(all));
          localStorage.setItem('pragyan_db_live_doubts_master', JSON.stringify(all));
        }

        if (typeof window !== 'undefined' && window.SupabaseSync && typeof window.SupabaseSync.mutate === 'function') {
          window.SupabaseSync.mutate('live_class_doubts', 'insert', newDoubt);
        }
      } catch (err) {
        console.warn('[Classroom] Save doubt error:', err);
      }
    },

    /**
     * Render Video Library Grid
     */
    renderLibrary: function (subjectFilter = 'All') {
      const gridEl = document.getElementById('lectureLibraryGrid');
      if (!gridEl) return;

      let lectures = this.getLectures();
      if (subjectFilter !== 'All') {
        lectures = lectures.filter(l => l.subject === subjectFilter);
      }

      gridEl.innerHTML = lectures.map(l => `
        <div class="lecture-card ${this.currentLecture && this.currentLecture.id === l.id ? 'active' : ''}" onclick="PragyanClassroom.playLecture('${l.id}')">
          <div class="lecture-thumb-wrap">
            <img src="${l.thumbnail_url || 'https://images.unsplash.com/photo-1509228468518-180dd4864904?auto=format&fit=crop&w=600&q=80'}" alt="${l.lecture_title}" loading="lazy" />
            <div class="lecture-play-hover-overlay">
              <div class="lecture-play-circle">▶</div>
            </div>
            ${l.is_live ? `<span class="lecture-live-badge-card"><span class="live-beacon"></span> LIVE NOW</span>` : ''}
            <span class="lecture-duration-tag">${l.is_live ? '🔴 BROADCAST' : (l.duration_minutes || 45) + ' MINS'}</span>
          </div>
          <div class="lecture-info-body">
            <div>
              <div class="lecture-subject-badge">${l.class_batch} • ${l.subject}</div>
              <div class="lecture-card-title">Ch ${l.chapter_no}: ${l.chapter_title}</div>
            </div>
            <div class="lecture-card-meta">
              <span>👨‍🏫 ${l.created_by || 'Chandan Sir'}</span>
              ${l.pdf_notes_url ? '<span style="color: #059669; font-weight: 700;">📎 PDF Notes</span>' : ''}
            </div>
          </div>
        </div>
      `).join('');
    },

    highlightActiveCard: function (lectureId) {
      const cards = document.querySelectorAll('.lecture-card');
      cards.forEach(c => {
        if (c.getAttribute('onclick')?.includes(lectureId)) {
          c.classList.add('active');
        } else {
          c.classList.remove('active');
        }
      });
    },

    filterSubject: function (subj) {
      const pills = document.querySelectorAll('#subjectFilterTabs .filter-pill');
      pills.forEach(p => {
        if (p.textContent.includes(subj)) p.classList.add('active');
        else p.classList.remove('active');
      });
      this.renderLibrary(subj);
    },

    escapeHtml: function (str) {
      return (str || '').replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      })[m]);
    }
  };

  if (typeof window !== 'undefined') {
    window.PragyanClassroom = PragyanClassroom;
    window.DEFAULT_LECTURES = DEFAULT_LECTURES;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.PragyanClassroom = PragyanClassroom;
    globalThis.DEFAULT_LECTURES = DEFAULT_LECTURES;
  }
})();



