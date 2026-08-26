/* ==========================================================================
   Portal & Dashboard Logic - Pragyan Institute Lalganj
   ========================================================================== */

(function () {
  'use strict';
  // Universal Floating Notification & Toast Engine
  // ── Toast notifications ─────────────────────────────────────────────────────
  // This is the portal's only feedback channel for fee approvals, registrations,
  // deletions and failures. Four things were wrong with the original:
  //
  //   1. It had no ARIA role, so none of it reached a screen reader. An admin
  //      approving a payment got no confirmation at all.
  //   2. Hiding it only set opacity to 0. The element stayed in the layout as a
  //      fixed, hit-testable ~350x45px box pinned to the bottom-right corner, so
  //      after the first toast of a session every tap that landed there was
  //      swallowed. On a 375px-wide phone that is a large dead zone over the
  //      bottom of the content.
  //   3. White text on #059669 is 3.2:1 and on #F59E0B about 2.1:1 — both below
  //      the 4.5:1 WCAG AA floor for text this size. Darkened to #047857 (5.5:1),
  //      #B45309 (4.8:1) and #DC2626 (4.8:1).
  //   4. The slide-in transform ignored prefers-reduced-motion.
  //
  // Politeness cannot be flipped on a live region after the fact, so successes
  // and warnings go to a polite region and failures to an assertive one; only
  // one is ever visible.
  const TOAST_VARIANTS = {
    success: { cls: 'is-success', icon: 'fa-circle-check',         assertive: false },
    warning: { cls: 'is-warning', icon: 'fa-triangle-exclamation', assertive: false },
    error:   { cls: 'is-error',   icon: 'fa-circle-xmark',         assertive: true }
  };

  function getToastNode(assertive) {
    // Deliberately not #toastNotification: js/app.js owns that id for the
    // public site's .site-toast, and both scripts load on index.html. Whichever
    // fired first created the element and the other then reused it with the
    // wrong class — a .site-toast styled node being fed this function's
    // icon+span markup, or app.js's textContent assignment wiping that markup
    // out. Separate ids keep the two toasts from clobbering each other.
    const id = assertive ? 'portalToastAlert' : 'portalToast';
    let toast = document.getElementById(id);
    if (toast) return toast;
    toast = document.createElement('div');
    toast.id = id;
    toast.className = 'pragyan-toast';
    // A live region has to be in the DOM and empty before the text lands in it,
    // otherwise assistive tech treats the whole node as new and may skip it.
    if (assertive) {
      toast.setAttribute('role', 'alert');
    } else {
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
    }
    toast.setAttribute('aria-atomic', 'true');
    toast.innerHTML = '<i class="fa-solid" aria-hidden="true"></i><span></span>';
    document.body.appendChild(toast);
    return toast;
  }

  function showNotification(message, type = 'success') {
    if (typeof document === 'undefined' || !document.body) return;
    const variant = TOAST_VARIANTS[type] || TOAST_VARIANTS.success;
    const toast = getToastNode(variant.assertive);
    const other = document.getElementById(variant.assertive ? 'portalToast' : 'portalToastAlert');
    if (other) other.classList.remove('is-visible');

    toast.classList.remove('is-success', 'is-warning', 'is-error');
    toast.classList.add(variant.cls);
    const icon = toast.querySelector('i');
    if (icon) icon.className = `fa-solid ${variant.icon}`;
    // textContent, not innerHTML: nothing here needs markup, so the message can
    // never carry it either.
    const span = toast.querySelector('span');
    if (span) span.textContent = String(message == null ? '' : message);

    toast.classList.add('is-visible');
    if (toast._timer) clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      // Dropping .is-visible restores visibility:hidden so the faded toast
      // stops occupying a hit-testable strip across the bottom of the screen.
      toast.classList.remove('is-visible');
    }, 4000);
  }
  window.showNotification = showNotification;
  window.showToast = showNotification;


  // Core Feature Flags
  const ENABLE_COMMUNITY_CHAT = true;

  // Input Sanitizer & HTML Escaper for XSS Protection
  function sanitizeInput(str) {
    if (typeof str !== 'string') return str || '';
    return str.replace(/[&<>"']/g, function(m) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[m];
    });
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str).replace(/[&<>"']/g, function(m) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[m];
    });
  }
  window.escapeHtml = escapeHtml;

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
      const url = new URL(trimmed, window.location.origin);
      return ['https:', 'http:', 'blob:'].includes(url.protocol) ? sanitizeInput(url.href) : '';
    } catch (_) {
      return '';
    }
  }
  window.sanitizeUrl = sanitizeUrl;

  // High-performance Debounce Utility for UI events & input filtering
  function debounce(fn, delay = 150) {
    let timeoutId;
    return function(...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  // ── Modal accessibility ─────────────────────────────────────────────────────
  // Every one of the eleven `.inner-modal-backdrop` dialogs in this file was
  // built by inserting markup and nothing else, which left four defects that
  // affect keyboard and screen-reader users on every single one of them:
  //
  //   • Escape did nothing. The only way out was to find and click the ✕.
  //   • Focus stayed on whatever button opened the dialog, so a screen reader
  //     went on announcing the page behind the overlay and never announced the
  //     dialog at all.
  //   • Tab walked straight out of the dialog into the page underneath — which
  //     is still visible through the backdrop but not operable.
  //   • Closing left focus on a detached node, so the next Tab restarted from
  //     the top of the document.
  //
  // wireModalA11y() fixes all four for any dialog that passes through it. It is
  // deliberately a wrapper rather than a base class: the dialogs are plain HTML
  // strings, so the only shared seam is "after you insert it, call this".
  const FOCUSABLE_SELECTOR = [
    'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])'
  ].join(',');
  let focusSeq = 0;

  // Reference-counted background-scroll lock shared by every wired dialog.
  let scrollLockDepth = 0;
  let scrollLockPrev = '';
  function lockBodyScroll() {
    if (scrollLockDepth === 0) scrollLockPrev = document.body.style.overflow || '';
    scrollLockDepth++;
    document.body.style.overflow = 'hidden';
  }
  function unlockBodyScroll() {
    scrollLockDepth = Math.max(0, scrollLockDepth - 1);
    if (scrollLockDepth === 0) document.body.style.overflow = scrollLockPrev;
  }

  /**
   * High-entropy suffix for client-minted receipt/request numbers. The old
   * `Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2,5)`
   * pattern carried ~16 bits of randomness inside a repeating time window and
   * fed a destructive upsert — a collision silently REPLACED another receipt.
   */
  function randomIdSuffix() {
    const buf = new Uint8Array(5);
    (window.crypto || {}).getRandomValues ? window.crypto.getRandomValues(buf)
      : buf.forEach((_, i) => { buf[i] = Math.floor(Math.random() * 256); });
    return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  }

  function focusableWithin(root) {
    if (!root) return [];
    return Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR))
      .filter(el => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement);
  }

  /**
   * Make an already-inserted modal keyboard-accessible.
   *
   * @param {HTMLElement|string} modal    The backdrop element, or its id.
   * @param {object}  [opts]
   * @param {boolean} [opts.closeOnBackdrop=true]  Click outside the panel closes.
   * @param {boolean} [opts.closeOnEscape=true]
   * @param {string}  [opts.initialFocus]  Selector for the element to focus first.
   * @param {Function}[opts.onClose]       Runs before the element is removed.
   * @returns {{close: Function}}
   */
  function wireModalA11y(modal, opts = {}) {
    const el = typeof modal === 'string' ? document.getElementById(modal) : modal;
    if (!el) return { close() {} };

    const panel = el.querySelector('.inner-modal-content') || el.firstElementChild || el;
    // A dialog needs a role and a name; several of these panels had neither, so
    // assistive tech announced an unlabelled group.
    if (!panel.getAttribute('role')) panel.setAttribute('role', 'dialog');
    if (!panel.hasAttribute('aria-modal')) panel.setAttribute('aria-modal', 'true');
    if (!panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '-1');
    if (!panel.hasAttribute('aria-label') && !panel.hasAttribute('aria-labelledby')) {
      const heading = panel.querySelector('h1, h2, h3, h4');
      if (heading) {
        if (!heading.id) heading.id = `modalTitle-${el.id || 'dlg'}-${focusSeq++}`;
        panel.setAttribute('aria-labelledby', heading.id);
      } else {
        panel.setAttribute('aria-label', 'Dialog');
      }
    }

    // Content behind an aria-modal dialog is hidden from AT by the modal
    // semantics, but the background scroll is locked too: on a phone, scrolling
    // the page under an open sheet is how a form half-fills and the user loses
    // their place. The lock is reference-counted and the pre-lock value is
    // captured only for the outermost dialog, so a nested or re-opened dialog
    // cannot capture 'hidden' as the value to restore and strand the page
    // permanently unscrollable.
    lockBodyScroll();

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let closed = false;

    // Detach without removing the node — for when something else already
    // removed it, so the listener and the scroll lock must not leak.
    function detach() {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKeydown, true);
      clearInterval(gonePoll);
      unlockBodyScroll();
    }

    function close() {
      if (closed) return;
      detach();
      try { if (typeof opts.onClose === 'function') opts.onClose(); } catch (err) { console.error(err); }
      el.remove();
      // Restoring focus is what keeps Tab order sane after the node is gone.
      if (previouslyFocused && document.contains(previouslyFocused)) {
        try { previouslyFocused.focus({ preventScroll: true }); } catch (_) { previouslyFocused.focus(); }
      }
    }

    // Several dialogs in this file are still dismissed by inline
    // `onclick="…remove()"` handlers and by re-opening the same dialog, neither
    // of which routes through close(). A cheap liveness poll releases the scroll
    // lock in those cases; without it, one such dismissal froze page scrolling
    // for the rest of the session — worst on a phone, where there is no
    // keyboard event to piggyback the cleanup onto.
    const gonePoll = setInterval(() => {
      if (!document.contains(el)) detach();
    }, 400);

    function onKeydown(e) {
      if (!document.contains(el)) {
        detach();
        return;
      }
      if (e.key === 'Escape' && opts.closeOnEscape !== false) {
        e.preventDefault();
        e.stopPropagation();
        close();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusableWithin(panel);
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeydown, true);

    if (opts.closeOnBackdrop !== false) {
      el.addEventListener('mousedown', (e) => { if (e.target === el) close(); });
    }

    // Route the dialog's own dismiss controls through close(). Nine of the eleven
    // dialogs in this file dismiss themselves with an inline
    // `onclick="document.getElementById('…').remove()"`, which detaches the node
    // without restoring focus — so after closing, focus sat on <body> and the
    // next Tab restarted from the top of a very long dashboard. Rerouting here
    // fixes every one of them at once, and is deliberately conservative: the
    // attribute is only replaced when it does nothing but remove this dialog.
    const bareRemove = new RegExp(
      `^document\\.getElementById\\((['"])${el.id}\\1\\)\\??\\.remove\\(\\);?$`
    );
    panel.querySelectorAll('[onclick]').forEach(node => {
      const code = (node.getAttribute('onclick') || '').trim();
      if (!bareRemove.test(code)) return;
      node.removeAttribute('onclick');
      node.addEventListener('click', (e) => { e.preventDefault(); close(); });
    });

    // Give the ✕ an accessible name and a non-submitting type. These buttons
    // contain only a Font Awesome <i>, which has no text, so every one of them
    // announced as an unnamed "button" — and one sitting inside a <form> would
    // have submitted it, since a <button> with no type defaults to submit.
    panel.querySelectorAll('.btn-close-inner').forEach(btn => {
      if (!btn.getAttribute('type')) btn.setAttribute('type', 'button');
      if (!btn.getAttribute('aria-label') && !btn.textContent.trim()) {
        btn.setAttribute('aria-label', 'Close dialog');
      }
      btn.querySelectorAll('i, svg').forEach(icon => {
        if (!icon.hasAttribute('aria-hidden')) icon.setAttribute('aria-hidden', 'true');
      });
      if (!btn.getAttribute('onclick') && !btn.dataset.a11yClose) {
        btn.dataset.a11yClose = '1';
        btn.addEventListener('click', (e) => { e.preventDefault(); close(); });
      }
    });

    // Focus the requested control, else the first real control, else the panel.
    // The close button is skipped when something better exists, so the dialog
    // does not open with "Close" as the announced element.
    const wanted = opts.initialFocus ? panel.querySelector(opts.initialFocus) : null;
    const target = wanted
      || focusableWithin(panel).find(c => !c.classList.contains('btn-close-inner'))
      || panel;
    setTimeout(() => {
      if (!document.contains(el)) return;
      try { target.focus({ preventScroll: true }); } catch (_) { target.focus(); }
    }, 0);

    return { close };
  }

  // Date Formatter Helper (canonical version - see also formatDate at bottom of file)
  // NOTE: The definitive formatDate() function is declared at the end of the IIFE (line ~6028)
  // This top-level version is kept for any early-loading references only.
  function formatDateEarly(dateStr) {
    if (!dateStr) return 'N/A';
    const clean = dateStr.toString().trim();
    if (/^\d{8}$/.test(clean)) {
      return `${clean.slice(0, 2)}/${clean.slice(2, 4)}/${clean.slice(4, 8)}`;
    }
    if (clean.includes('-')) {
      const parts = clean.split('T')[0].split('-');
      if (parts.length === 3) {
        if (parts[0].length === 4) return `${parts[2]}/${parts[1]}/${parts[0]}`;
        return `${parts[0]}/${parts[1]}/${parts[2]}`;
      }
    }
    return clean;
  }

  function getApiUrl(path) {
    const base = (typeof window !== 'undefined' && window.PRAGYAN_API_BASE)
      ? String(window.PRAGYAN_API_BASE).replace(/\/$/, '')
      : '';
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${base}${cleanPath}`;
  }

  /**
   * POST JSON to one of our own serverless endpoints with the current session.
   *
   * Returns `{ ok, status, payload }` and never throws: callers on the money path
   * need to distinguish "the server said no" from "the network died", because the
   * safe response to the second one is to leave local state alone and let the
   * next pullAll() reconcile, not to guess.
   *
   * A token beginning with `token_` is a locally-minted offline placeholder, not
   * a signed JWT. Sending it would just collect a 401, so it is reported as an
   * offline condition up front.
   */
  async function postToApi(path, body) {
    const token = (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('pragyan_portal_token')) || '';
    if (!token || token.startsWith('token_')) {
      return { ok: false, status: 0, offline: true, payload: { error: 'A live signed-in session is required for this action. Please sign out and sign in again.' } };
    }
    try {
      const res = await fetch(getApiUrl(path), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(body || {})
      });
      const contentType = res.headers.get('content-type') || '';
      const payload = contentType.includes('application/json')
        ? await res.json().catch(() => ({}))
        : { error: (await res.text().catch(() => '')).slice(0, 300) };
      return { ok: res.ok, status: res.status, offline: false, payload };
    } catch (err) {
      // Genuine transport failure: no response at all, so the request may or may
      // not have reached the server.
      return { ok: false, status: 0, offline: true, payload: { error: err?.message || 'Network request failed' } };
    }
  }

  // ── Canonical batch resolution ──────────────────────────────────────────────
  // Every batch key in this file is a canonical batch id from
  // js/academic-config.js (window.PRAGYAN_ACADEMIC). The previous version of
  // getBatchCategoryKey() recognised only four keys — '10th', '9th', '8th' and
  // 'junio' — which broke the portal in ways that quietly lost money:
  //
  //   • "Class 12th PCM" / "Class 11th PCB" matched no rule and fell through to
  //     `return s`, so each senior student became their own singleton category.
  //     The ₹1,500 batches never appeared in the Fee Collections or Pending Dues
  //     breakdowns and no email campaign could target them.
  //   • "Special English 9th to 12th" hit the includes('9th') test and was
  //     counted as a NURTURE student, folding Aditi Singh's batches into Class
  //     9th and putting them on the wrong reminder day.
  //   • "Class 1st to 5th (Junior Foundation)" (₹500) and "Class 6th & 7th"
  //     (₹700) shared one 'junio' key, so one of the two was always billed and
  //     reported at the other's rate.
  //   • The /\b(10|10th|x)\b/ alternative classified any string containing a
  //     standalone "x" as Class 10th.
  //
  // resolveBatch() in the shared config covers all twelve, is ordered so English
  // and stream-qualified names win over the bare numeric rules, and is asserted
  // against a corpus of real class-name strings by tests/academic-config.test.js.
  const ACADEMIC = (typeof window !== 'undefined' && window.PRAGYAN_ACADEMIC) || null;
  let _academicWarned = false;

  function academicConfig() {
    const live = (typeof window !== 'undefined' && window.PRAGYAN_ACADEMIC) || ACADEMIC;
    if (live) return live;
    if (!_academicWarned) {
      _academicWarned = true;
      console.error('[Portal] js/academic-config.js did not load — batch fees and filters are unavailable.');
    }
    return null;
  }

  // Batch ids written by earlier builds. resolveBatch() already understands the
  // old short keys ('10th', 'junio', …) and 'BAT-JUNIO', but BAT-01..BAT-04 are
  // opaque sequence numbers it cannot interpret, so they are mapped here.
  const LEGACY_BATCH_IDS = {
    'BAT-01': 'BAT-10',
    'BAT-02': 'BAT-09',
    'BAT-03': 'BAT-08',
    'BAT-04': 'BAT-67'
  };

  /** Class name, batch name or batch id -> canonical batch id ('' if unknown). */
  function getBatchCategoryKey(str) {
    if (!str) return '';
    const raw = String(str).trim();
    const legacy = LEGACY_BATCH_IDS[raw.toUpperCase()];
    if (legacy) return legacy;
    const cfg = academicConfig();
    if (!cfg) return raw.toUpperCase();
    const batch = cfg.resolveBatch(raw);
    return batch ? batch.batchId : '';
  }

  // Display-only metadata. Fees, names, billing days and resolution all live in
  // the shared config; the emoji is purely a portal concern. `timing` and `room`
  // are first-run seed fallbacks for an empty database and are editable from the
  // Batches tab — only the four batches that already carried a timetable in this
  // codebase have one here, rather than inventing eight more.
  const BATCH_UI = {
    'BAT-12PCM':   { icon: '🎓' },
    'BAT-12PCB':   { icon: '🧬' },
    'BAT-11PCM':   { icon: '📐' },
    'BAT-11PCB':   { icon: '🔬' },
    'BAT-10':      { icon: '🎯', timing: 'Mon – Sat: 4:00 PM – 6:30 PM', room: 'Hall A (1st Floor)' },
    'BAT-09':      { icon: '🌱', timing: 'Mon – Sat: 2:30 PM – 4:30 PM', room: 'Hall B (Ground Floor)' },
    'BAT-08':      { icon: '⚡', timing: 'Mon – Sat: 3:00 PM – 5:00 PM', room: 'Classroom 3' },
    'BAT-67':      { icon: '🚀', timing: 'Mon – Sat: 3:30 PM – 5:00 PM', room: 'Classroom 1' },
    'BAT-15':      { icon: '🧸' },
    'BAT-ENG-912': { icon: '📖' },
    'BAT-ENG-68':  { icon: '✍️' },
    'BAT-ENG-15':  { icon: '🔤' }
  };

  function batchIcon(batchId) {
    return (BATCH_UI[batchId] && BATCH_UI[batchId].icon) || '📚';
  }

  // Badge pill per batch for the Batch-Wise Financial Breakdown. Every
  // foreground/background pair here clears 4.5:1, unlike the previous
  // #92400E-on-#FEF3C7 set which was only assigned to four batches anyway.
  const BATCH_BADGE = {
    'BAT-12PCM':   { text: '🎓 Board Final — PCM',   color: '#7C2D12', bg: '#FFEDD5' },
    'BAT-12PCB':   { text: '🧬 Board Final — PCB',   color: '#7C2D12', bg: '#FFEDD5' },
    'BAT-11PCM':   { text: '📐 Senior Prep — PCM',   color: '#1E3A8A', bg: '#DBEAFE' },
    'BAT-11PCB':   { text: '🔬 Senior Prep — PCB',   color: '#1E3A8A', bg: '#DBEAFE' },
    'BAT-10':      { text: '🎯 Board Special',       color: '#78350F', bg: '#FEF3C7' },
    'BAT-09':      { text: '🌱 Foundation Prep',     color: '#065F46', bg: '#D1FAE5' },
    'BAT-08':      { text: '⚡ Middle Prep',          color: '#1E40AF', bg: '#DBEAFE' },
    'BAT-67':      { text: '🚀 Pioneer Foundation',  color: '#6B21A8', bg: '#F3E8FF' },
    'BAT-15':      { text: '🧸 Junior Foundation',   color: '#9D174D', bg: '#FCE7F3' },
    'BAT-ENG-912': { text: '📖 Special English',     color: '#155E75', bg: '#CFFAFE' },
    'BAT-ENG-68':  { text: '✍️ Special English',     color: '#155E75', bg: '#CFFAFE' },
    'BAT-ENG-15':  { text: '🔤 Special English',     color: '#155E75', bg: '#CFFAFE' }
  };

  /** 'PROF. RAVI RANJAN' -> 'Prof. Ravi Ranjan'. */
  function titleCaseName(name) {
    return String(name || '').toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
  }

  // Daily subject rows for the student's "My Batch" timetable, per batch.
  // The four-way ladder this replaces tested `studentBatchKey === '10th'`, which
  // no longer matches anything now that batch keys are canonical ids — so every
  // student in the portal was shown the same fallback timetable, and that
  // fallback taught "Integrated Science" to the three Special English batches,
  // which do not study science at all.
  const BATCH_SUBJECTS = {
    'BAT-12PCM':   ['Physics (Board + Competitive)', 'Chemistry (Physical & Organic)', 'Mathematics (Board Mastery)'],
    'BAT-12PCB':   ['Physics (Board Level)', 'Chemistry (Physical & Organic)', 'Biology (Botany & Zoology)'],
    'BAT-11PCM':   ['Physics (Mechanics & Waves)', 'Chemistry (Fundamentals)', 'Mathematics (Sets to Calculus)'],
    'BAT-11PCB':   ['Physics (Mechanics & Waves)', 'Chemistry (Fundamentals)', 'Biology (Cell & Diversity)'],
    'BAT-10':      ['Mathematics (Board Mastery)', 'Science (Physics & Chemistry)', 'Biology & English'],
    'BAT-09':      ['Mathematics (Foundation)', 'Science (Concepts & Lab)', 'Social Studies & English'],
    'BAT-08':      ['Mathematics (Alpha Level)', 'General Science', 'English Grammar & Composition'],
    'BAT-67':      ['Mathematics & Mental Ability', 'Integrated Science', 'English & Language Skills'],
    'BAT-15':      ['Mathematics (Junior Level)', 'Environmental Science (EVS)', 'English Reading & Writing'],
    'BAT-ENG-912': ['English Grammar & Usage', 'Comprehension & Literature', 'Writing & Spoken English'],
    'BAT-ENG-68':  ['English Grammar Foundations', 'Reading & Vocabulary Building', 'Creative Writing & Conversation'],
    'BAT-ENG-15':  ['Phonics & Reading Readiness', 'Basic Grammar & Vocabulary', 'Handwriting & Spoken English']
  };

  // Clock slots exist only for the four batches whose sitting is actually
  // recorded in BATCH_UI, and each set divides that batch's own recorded window.
  // The other eight show their subjects against the batch timing instead of a
  // fabricated slot — an invented "02:30 PM – 03:30 PM" that nobody teaches is
  // worse than a student being told to check the batch timing.
  const BATCH_SLOTS = {
    'BAT-10': ['04:00 PM – 05:00 PM', '05:00 PM – 06:00 PM', '06:00 PM – 06:30 PM'],
    'BAT-09': ['02:30 PM – 03:10 PM', '03:10 PM – 03:50 PM', '03:50 PM – 04:30 PM'],
    'BAT-08': ['03:00 PM – 03:40 PM', '03:40 PM – 04:20 PM', '04:20 PM – 05:00 PM'],
    'BAT-67': ['03:30 PM – 04:00 PM', '04:00 PM – 04:30 PM', '04:30 PM – 05:00 PM']
  };

  /** All twelve batches in canonical order, shaped for cards and selects. */
  function canonicalBatchCards() {
    const cfg = academicConfig();
    if (!cfg) return [];
    return cfg.BATCHES.map(b => ({
      key: b.batchId,
      id: b.batchId,
      name: b.name,
      icon: batchIcon(b.batchId),
      rate: b.monthlyFee
    }));
  }

  /**
   * <option> markup for the faculty-lead filter, built from the canonical
   * roster. The two hand-written options this replaces claimed Chandan Kumar
   * taught "Class 10th & 9th" and Prof. Ravi Ranjan "Class 8th & Junior";
   * per the config both of them teach all seven mainstream batches, Aditi
   * Singh had no option at all, and the filter that read them compared
   * against the retired `'10th'`/`'9th'` keys so it matched nobody.
   */
  function facultyFilterOptions() {
    const cfg = academicConfig();
    const roster = (cfg && cfg.FACULTY) || [];
    const opts = ['<option value="all">All Faculty Leads</option>'];
    roster.forEach(f => {
      const taught = (cfg.BATCHES || []).filter(b => b.teachers.includes(f.name)).length;
      opts.push(
        `<option value="${f.name}">👨‍🏫 ${titleCaseName(f.name)} (${taught} batch${taught === 1 ? '' : 'es'})</option>`
      );
    });
    return opts.join('\n                    ');
  }

  /**
   * <option> markup for the fee-collector filter. Same roster, but labelled by
   * role rather than batch count — this filter asks who *took* the money, not
   * who teaches. The previous pair of options also billed Prof. Ravi Ranjan as
   * "Director", a title that belongs to Chandan Kumar alone.
   */
  function facultyCollectorOptions() {
    const cfg = academicConfig();
    const roster = (cfg && cfg.FACULTY) || [];
    const opts = ['<option value="all">All Faculty Collectors</option>'];
    roster.forEach(f => {
      opts.push(`<option value="${f.name}">👨‍🏫 ${titleCaseName(f.name)} (${f.role})</option>`);
    });
    return opts.join('\n                    ');
  }

  /** Canonical teacher roster for a batch id, uppercase as stored in the config. */
  function batchTeachers(batchId) {
    const cfg = academicConfig();
    const b = cfg && cfg.BATCH_BY_ID[batchId];
    return b ? b.teachers : [];
  }

  /**
   * Does a payment record name this faculty member as its collector?
   *
   * Records are written by hand over years, so the collector field holds
   * anything from 'CHANDAN KUMAR' to 'Chandan' to 'Prof. Ravi Ranjan'. Titles
   * are stripped and the first real name token is the discriminator — it is
   * unique across the three-person roster. Payments that arrived through the
   * institute's own UPI handle count as the primary admin's collections,
   * because that VPA is registered to him.
   *
   * The test this replaces classified every record as either "Chandan" or
   * "not Chandan", so a fee collected by Aditi Singh was reported under
   * Prof. Ravi Ranjan's name.
   */
  function collectorMatchesFaculty(record, facultyName) {
    const wanted = String(facultyName || '')
      .toLowerCase()
      .replace(/\b(prof|dr|mr|mrs|ms|smt|shri)\b\.?/g, '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)[0];
    if (!wanted) return false;

    const collector = String(record.collector || record.collected_by || record.by || '').toLowerCase();
    if (collector.includes(wanted)) return true;

    // Unattributed digital receipts settle to the account holder.
    const cfg = academicConfig();
    const primary = String((cfg && cfg.PRIMARY_ADMIN && cfg.PRIMARY_ADMIN.name) || 'CHANDAN KUMAR').toLowerCase();
    if (!primary.includes(wanted)) return false;
    const mode = String(record.mode || '').toLowerCase();
    return !collector && (mode.includes('upi') || mode.includes('phonepe') || mode.includes('gpay') || mode.includes('online'));
  }

  /**
   * How a collector name should be shown in a receipts table.
   *
   * Returns the name that was actually recorded. The call site this replaces
   * rendered `isChandan ? 'Chandan Kumar' : 'Prof. Ravi Ranjan'` regardless of
   * what the receipt said, so every fee Aditi Singh collected appeared in the
   * admin's books under Prof. Ravi Ranjan's name, and a receipt with no
   * recorded collector at all was credited to him too.
   */
  function collectorDisplay(rawName) {
    const raw = String(rawName || '').trim();
    if (!raw) return { label: '— Not recorded —', color: '#78350F', known: false };
    const cfg = academicConfig();
    const match = ((cfg && cfg.FACULTY) || []).find(f => collectorMatchesFaculty({ collector: raw }, f.name));
    if (!match) return { label: raw, color: '#334155', known: false };
    const palette = { 'CHANDAN KUMAR': '#065F46', 'PROF. RAVI RANJAN': '#1E40AF', 'ADITI SINGH': '#155E75' };
    return { label: `👨‍🏫 ${titleCaseName(match.name)}`, color: palette[match.name] || '#334155', known: true };
  }

  /** Human label for a canonical batch id, for filter subtext and headings. */
  function batchLabel(batchId) {
    const cfg = academicConfig();
    const b = cfg && cfg.BATCH_BY_ID[batchId];
    return b ? b.name : (batchId ? String(batchId) : 'All Batches');
  }

  /**
   * <option> markup for a class/batch filter, generated from the shared config.
   * Five separate filters in this file each carried their own hand-written copy
   * of the same four batches, so adding a batch meant remembering all five —
   * which is how eight of the twelve came to be missing from every dropdown.
   */
  function batchFilterOptions(selected, allLabel) {
    const sel = String(selected == null ? 'all' : selected);
    const label = allLabel || '📚 All Batches';
    const opts = [`<option value="all"${sel === 'all' ? ' selected' : ''}>${label}</option>`];
    canonicalBatchCards().forEach(b => {
      opts.push(
        `<option value="${b.key}"${sel === b.key ? ' selected' : ''}>` +
        `${b.icon} ${b.name} — ₹${b.rate}/mo</option>`
      );
    });
    return opts.join('\n                    ');
  }

  /**
   * <option> markup for a class/batch *assignment* select — the ones that write
   * `student.className`, as opposed to the filters above which only read it.
   *
   * Values are canonical batch names and each option carries its own monthly
   * rate, so the fee field can follow the selection without a second lookup.
   *
   * Both assignment selects in this file were hand-written and wrong in ways
   * that corrupted records rather than just hiding them:
   *
   *   • Add Student offered four batches, one of them ('Junior Batch (JUNIO)')
   *     not a canonical batch at all, so eight batches could not be enrolled.
   *   • Edit Student offered three, matched them by substring, and defaulted to
   *     whichever option came first. 'Class 12th PCM' matched none of '10th',
   *     '9th' or '8th', so opening a senior student's record and pressing Save
   *     reassigned them to Class 10th at ₹1,000/mo instead of ₹1,500.
   *
   * An unrecognised current value is preserved as its own option so that
   * opening the editor can never silently move a student between batches.
   */
  function batchAssignmentOptions(currentValue) {
    const current = String(currentValue || '').trim();
    const currentKey = current ? getBatchCategoryKey(current) : '';
    const cards = canonicalBatchCards();
    let matched = false;
    const opts = cards.map(b => {
      const isSel = currentKey === b.key;
      if (isSel) matched = true;
      const cfg = academicConfig();
      const canonicalName = (cfg && cfg.BATCH_BY_ID[b.key] && cfg.BATCH_BY_ID[b.key].className) || b.name;
      return `<option value="${canonicalName}" data-batch-id="${b.key}" data-monthly="${b.rate}"${isSel ? ' selected' : ''}>` +
             `${b.icon} ${b.name} — ₹${b.rate.toLocaleString('en-IN')}/Month</option>`;
    });
    if (current && !matched) {
      opts.unshift(
        `<option value="${current.replace(/"/g, '&quot;')}" data-monthly="" selected>` +
        `⚠️ ${current} (unrecognised — keep as is)</option>`
      );
    }
    return opts.join('\n                  ');
  }

  function batchSelectOptions(currentValue, placeholder) {
    const current = String(currentValue || '').trim();
    const currentKey = current ? getBatchCategoryKey(current) : '';
    const cards = canonicalBatchCards();
    const opts = [];
    if (placeholder) {
      opts.push(`<option value="" data-batch-id="" data-monthly="0"${!currentKey ? ' selected' : ''}>${placeholder}</option>`);
    }
    let matched = false;
    cards.forEach(b => {
      const isSel = currentKey === b.key;
      if (isSel) matched = true;
      const cfg = academicConfig();
      const canonicalName = (cfg && cfg.BATCH_BY_ID[b.key] && cfg.BATCH_BY_ID[b.key].className) || b.name;
      opts.push(
        `<option value="${canonicalName}" data-batch-id="${b.key}" data-monthly="${b.rate}"${isSel ? ' selected' : ''}>` +
        `${b.icon} ${b.name} — ₹${b.rate.toLocaleString('en-IN')}/Month</option>`
      );
    });
    if (current && !matched && !placeholder) {
      opts.unshift(
        `<option value="${current.replace(/"/g, '&quot;')}" data-monthly="" selected>` +
        `⚠️ ${current} (unrecognised — keep as is)</option>`
      );
    }
    return opts.join('\n                  ');
  }

  /**
   * Seed rows for the batches cache, built from the canonical config so the two
   * seed paths in this file cannot disagree. They previously did, and on the ids
   * themselves: initDatabase() wrote BAT-10 / BAT-09 / BAT-08 / BAT-JUNIO while
   * AppState.getBatches() wrote BAT-01..BAT-04 for the same four batches, so
   * whichever ran first decided what every batch_id in the database meant.
   *
   * `progress`, and the `teachers` / `schedule` arrays the old seed carried, are
   * gone: nothing read them, and an array-valued `schedule` was a hazard because
   * the normaliser below and the student batch card both fall back to
   * `batch.schedule` as a *string* when no timing is set.
   */
  function buildSeedBatches() {
    const cfg = academicConfig();
    if (!cfg) return [];
    return cfg.BATCHES.map(b => batchRow(b, BATCH_UI[b.batchId] || {}));
  }

  /** Shared shape for a batch row, with every alias its consumers read. */
  function batchRow(b, extra) {
    const ui = BATCH_UI[b.batchId] || {};
    const src = extra || {};
    const timing = src.timing || src.timings || ui.timing || 'Mon – Sat: As per timetable';
    const fee = (Number.isFinite(Number(src.monthly_fee ?? src.monthlyFee)) && Number(src.monthly_fee ?? src.monthlyFee) >= 0)
      ? Number(src.monthly_fee ?? src.monthlyFee)
      : b.monthlyFee;
    const rawTeachers = Array.isArray(src.teachers) && src.teachers.length > 0
      ? src.teachers
      : (b.teachers || []);
    const teacherStr = src.teacher || (Array.isArray(rawTeachers) ? rawTeachers.map(t => typeof t === 'string' ? titleCaseName(t) : (t.name || '')).join(' & ') : b.teachers.map(titleCaseName).join(' & '));
    const subjects = Array.isArray(src.subjects) && src.subjects.length > 0
      ? src.subjects
      : (BATCH_SUBJECTS[b.batchId] || []);

    return {
      id: b.batchId,
      batch_id: b.batchId,
      batchId: b.batchId,
      name: src.name || b.name,
      className: src.class_name || src.className || b.name,
      batchName: src.name || b.name,
      batch_name: src.name || b.name,
      monthlyFee: fee,
      monthly_fee: fee,
      annualFee: src.annual_fee ? Number(src.annual_fee) : (src.annualFee ? Number(src.annualFee) : cfgAnnual(fee)),
      annual_fee: src.annual_fee ? Number(src.annual_fee) : (src.annualFee ? Number(src.annualFee) : cfgAnnual(fee)),
      timing: timing,
      timings: timing,
      room: src.room || src.room_no || ui.room || 'As allotted',
      teacher: teacherStr,
      teachers: rawTeachers,
      subjects: subjects,
      capacity: Number(src.capacity || 40),
      tagline: src.tagline || b.tagline || '',
      badge: src.badge || src.tagline || b.tagline,
      status: src.status || 'Active',
      icon: batchIcon(b.batchId),
      billingDay: Number(src.billing_day || src.billingDay || b.billingDay || 1),
      reminderTier: b.reminderTier,
      stream: src.stream || b.stream || ''
    };
  }

  function cfgAnnual(monthlyFee) {
    const cfg = academicConfig();
    return cfg ? cfg.annualPrice(monthlyFee) : Math.round(Number(monthlyFee) * 12 * 0.95);
  }

  /** Monthly fee for a class name or batch id; 0 when it cannot be resolved. */
  function classMonthlyFee(className) {
    const cfg = academicConfig();
    if (!cfg) return 0;
    const batch = cfg.resolveBatch(className);
    return batch ? batch.monthlyFee : 0;
  }

  /**
   * The monthly fee a student owes. Eight separate copies of a four-batch ladder
   * used to compute this, all variations on
   *
   *   includes('10') ? 1000 : includes('9') ? 1000 : includes('8') ? 800 : 700
   *
   * whose final `else` charged every Class 11th and 12th student ₹700 or ₹1,000
   * instead of ₹1,500, and every Special English 1st-5th student ₹700 instead of
   * ₹500 — on the invoice, in the reminder email and in the billing ledger.
   * The bare substring tests were wrong in the other direction too:
   * includes('10') matches "Class 1st to 5th (2010 intake)", and includes('9')
   * matches "Class 1st to 5th (1998 syllabus)".
   *
   * An explicitly stored fee still wins, so a negotiated or concession rate on
   * the student record is honoured — the config is the fallback, not an override.
   * Resolving to 0 rather than a guessed ₹700/₹1,000 is deliberate: an
   * unbillable ₹0 is visible to the admin, whereas a plausible wrong number is
   * not.
   */
  function studentMonthlyFee(student, fallback) {
    const s = student || {};
    const stored = Number(s.monthlyFee ?? s.monthly_fee ?? NaN);
    if (Number.isFinite(stored) && stored > 0) return stored;
    const resolved = classMonthlyFee(s.className || s.class_name || s.batchName || s.batch_name || '');
    if (resolved > 0) return resolved;
    return Number(fallback) > 0 ? Number(fallback) : 0;
  }

  // Financial Audit Helper: Distinguishes Real Money Payments from Administrative Adjustments / Dues
  function isRealCollectedPayment(entry) {
    if (!entry || typeof entry !== 'object') return false;
    const amt = Number(entry.amount ?? 0);
    if (amt <= 0 || isNaN(amt)) return false;

    const recNo = String(entry.receiptNo || entry.receipt_no || '').trim().toUpperCase();
    if (
      recNo.startsWith('REC-BILL-') ||
      recNo.startsWith('OLD-DUE') ||
      recNo.startsWith('ADJ-') ||
      recNo.startsWith('RATE-') ||
      recNo.startsWith('EDIT-') ||
      recNo.startsWith('DUE-') ||
      recNo.startsWith('NTC-') ||
      recNo.startsWith('DISC-') ||
      recNo.startsWith('ADDON-')
    ) {
      return false;
    }

    const status = String(entry.status || '').trim().toLowerCase();
    if (['adjusted', 'pending due', 'pending', 'cancelled', 'synchronized', 'failed', 'due', 'adjustment', 'waived', 'unpaid'].includes(status)) {
      return false;
    }

    const mode = String(entry.mode || entry.paymentMode || entry.payment_mode || '').trim().toLowerCase();
    if (
      mode.includes('non-cash') ||
      mode.includes('carryover') ||
      mode.includes('adjustment') ||
      mode.includes('waiver') ||
      mode.includes('concession') ||
      mode.includes('discount') ||
      mode.includes('rate structure') ||
      mode.includes('synchronization') ||
      mode.includes('profile') ||
      mode.includes('old unpaid') ||
      mode.includes('billing ledger') ||
      mode.includes('due')
    ) {
      return false;
    }

    const note = String(entry.note || '').trim().toLowerCase();
    if (
      note.includes('non-cash') ||
      note.includes('waiver') ||
      note.includes('concession') ||
      note.includes('rate structure') ||
      note.includes('fee adjustment') ||
      note.includes('old fee carryover')
    ) {
      return false;
    }

    return status === 'paid' || status === 'completed' || status === 'verified' || !status;
  }

  // Indian Standard Time (IST) Date Parts Utility (Asia/Kolkata)
  function getISTDateParts(date = new Date()) {
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      })
        .formatToParts(date)
        .reduce((all, part) => ({ ...all, [part.type]: part.value }), {});
      return {
        year: Number(parts.year),
        month: Number(parts.month),
        day: Number(parts.day),
        hour: Number(parts.hour),
        minute: Number(parts.minute),
        monthKey: `${parts.year}-${parts.month}`
      };
    } catch (_) {
      const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
      const ist = new Date(utc + (3600000 * 5.5));
      return {
        year: ist.getFullYear(),
        month: ist.getMonth() + 1,
        day: ist.getDate(),
        hour: ist.getHours(),
        minute: ist.getMinutes(),
        monthKey: `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, '0')}`
      };
    }
  }

  // Server-only email dispatcher. API credentials must never be exposed in browser code.
  async function sendLiveResendEmail(to, subject, html, options = {}) {
    if (!to) return { success: false, error: 'No recipient email specified' };
    try {
      const token = (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('pragyan_portal_token')) ||
                    (typeof localStorage !== 'undefined' && localStorage.getItem('pragyan_portal_token')) || '';
      
      const recipients = Array.isArray(to) 
        ? to.map(e => String(e).trim()).filter(e => e && e.includes('@')) 
        : [String(to).trim()].filter(e => e && e.includes('@'));

      if (recipients.length === 0) {
        return { success: false, error: 'No valid recipient email address found' };
      }

      if (!token || token.startsWith('token_')) {
        return { success: false, error: 'A live signed-in session is required to dispatch emails. Please sign out and sign in again.' };
      }

      const postBody = {
        to: recipients,
        subject,
        html,
        student_id: options.student_id || options.studentId || undefined,
        ledger_id: options.ledger_id || options.ledgerId || undefined,
        category: options.category || undefined,
        reference: options.reference || undefined,
        dedupeKey: options.dedupeKey || undefined
      };

      const res = await fetch(getApiUrl('/api/send-email'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(postBody)
      });
      const contentType = res.headers.get('content-type') || '';
      const payload = contentType.includes('application/json')
        ? await res.json().catch(() => ({}))
        : { error: await res.text().catch(() => '') };
      if (res.ok && payload.success) return payload;
      return {
        success: false,
        status: res.status,
        error: payload.error || payload.message || `Email service returned HTTP ${res.status}`
      };
    } catch (err) {
      console.warn('[Email Engine] Server dispatch failed:', err);
      return { success: false, error: err.message || 'Unable to reach the email service' };
    }
  }

  // Printable Fee Receipt PDF Generator
  function downloadStudentReceiptPDF(student, receiptNo) {
    if (!student) return;
    const receipt = (student.feeHistory || []).find(h => h.receiptNo === receiptNo) || {
      receiptNo: receiptNo || 'REC-' + Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2,5),
      date: new Date().toLocaleDateString('en-IN'),
      amount: student.paidFee || 0,
      mode: 'Cash / Online',
      status: 'Paid'
    };

    const printWin = window.open('', '_blank', 'width=800,height=700');
    if (!printWin) {
      alert('Please allow popups to download/print student receipt.');
      return;
    }

    const safeName = sanitizeInput(student.name || '');
    const safeRoll = sanitizeInput(student.rollNo || student.id || '');
    const safeClass = sanitizeInput(student.className || 'N/A');
    const safeMobile = sanitizeInput(student.guardianMobile || student.mobile || 'N/A');
    const safeRecNo = sanitizeInput(receipt.receiptNo || '');
    const safeDate = sanitizeInput(receipt.date || '');
    const safeMode = sanitizeInput(receipt.mode || 'Cash / UPI');
    const safeStatus = sanitizeInput(receipt.status || 'Paid');
    const safeAmount = Number(receipt.amount || 0).toLocaleString();

    const isAdj = receipt.status === 'Adjusted' || (receipt.receiptNo && (receipt.receiptNo.startsWith('ADJ-') || receipt.receiptNo.startsWith('RATE-') || receipt.receiptNo.startsWith('DISC-') || receipt.receiptNo.startsWith('ADDON-')));
    const safeNote = sanitizeInput(receipt.note || 'Official administrative fee adjustment');
    const headerBg = isAdj ? 'linear-gradient(135deg, #5B21B6 0%, #3B0764 100%)' : 'linear-gradient(135deg, #064E3B 0%, #022C22 100%)';
    const cardBorder = isAdj ? '#7C3AED' : '#064E3B';
    const titleText = isAdj ? 'FEE ADJUSTMENT & STRUCTURE VOUCHER' : 'Official Fee Receipt & Payment Acknowledgment';
    const totalLabel = isAdj ? 'Adjusted Value (Non-Cash)' : 'Total Received Amount';

    printWin.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <title>Fee Receipt #${safeRecNo} - ${safeName}</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; padding: 20px 15px; color: #1f2937; background: #FAF9F6; margin: 0; }
          .receipt-card { border: 2px solid #064E3B; border-radius: 12px; padding: 24px; max-width: 650px; margin: 0 auto; background: #ffffff; box-shadow: 0 4px 16px rgba(0,0,0,0.06); }
          .header { background: linear-gradient(135deg, #064E3B 0%, #022C22 100%); color: #fff; padding: 18px 16px; text-align: center; border-radius: 8px 8px 0 0; margin: -24px -24px 20px -24px; }
          .header h2 { margin: 0; font-size: 20px; letter-spacing: 1px; }
          .header p { margin: 4px 0 0 0; opacity: 0.9; font-size: 13px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; font-size: 13px; }
          .grid div { background: #f9fafb; padding: 9px 12px; border-radius: 6px; border: 1px solid #e5e7eb; word-break: break-word; }
          .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; margin-top: 15px; }
          table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
          th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }
          th { background: #f3f4f6; font-weight: 700; color: #374151; }
          .total-row { font-weight: bold; color: #064E3B; font-size: 15px; background: #F0FDF4; }
          .footer { margin-top: 24px; text-align: center; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 14px; line-height: 1.5; }
          .signatures { display: flex; justify-content: space-between; margin-top: 35px; padding-top: 15px; flex-wrap: wrap; gap: 15px; }
          .sig-box { text-align: center; border-top: 1px dashed #9ca3af; width: 180px; font-size: 12px; color: #4b5563; padding-top: 6px; }

          @media screen and (max-width: 600px) {
            body { padding: 10px 8px; }
            .receipt-card { padding: 16px 14px; border-radius: 10px; }
            .header { margin: -16px -14px 15px -14px; padding: 14px 10px; }
            .header h2 { font-size: 17px; }
            .grid { grid-template-columns: 1fr; gap: 6px; }
            .grid div { font-size: 12.5px; padding: 8px 10px; }
            table { font-size: 12px; }
            th, td { padding: 8px 8px; }
            .signatures { flex-direction: column; align-items: center; gap: 20px; }
            .sig-box { width: 80%; max-width: 220px; }
          }
          @media print {
            body { padding: 0; background: #fff; }
            .receipt-card { box-shadow: none; border-color: #000; }
          }
        </style>
      </head>
      <body>
        <div class="receipt-card">
          <div class="header">
            <h2>PRAGYAN INSTITUTE LALGANJ</h2>
            <p>${titleText}</p>
          </div>
          <div class="grid">
            <div><strong>Student Name:</strong> ${safeName}</div>
            <div><strong>Roll No / Student ID:</strong> #${safeRoll}</div>
            <div><strong>Class / Batch:</strong> ${safeClass}</div>
            <div><strong>Guardian Mobile:</strong> ${safeMobile}</div>
            <div><strong>${isAdj ? 'Voucher Ref No:' : 'Receipt No:'}</strong> ${safeRecNo}</div>
            <div><strong>Date:</strong> ${safeDate}</div>
          </div>
          <table>
            <thead>
              <tr><th>Description</th><th>Mode / Action</th><th>Status</th><th style="text-align:right;">Amount</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>${isAdj ? 'Tuition Fee Structure Adjustment' : 'Tuition Fee Payment'}</strong>
                  ${safeNote ? `<div style="font-size: 12px; color: #6b7280; margin-top: 3px;">Note: ${safeNote}</div>` : ''}
                </td>
                <td>${safeMode}</td>
                <td><span style="color:${isAdj ? '#7C3AED' : '#059669'}; font-weight:bold;">${safeStatus}</span></td>
                <td style="text-align:right; font-weight:bold; color:${isAdj ? '#7C3AED' : '#059669'};">
                  ${receipt.amount < 0 ? `- ₹${Math.abs(receipt.amount).toLocaleString()}` : `₹${safeAmount}`}
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="total-row">
                <td colspan="3">${totalLabel}</td>
                <td style="text-align:right;">${receipt.amount < 0 ? `- ₹${Math.abs(receipt.amount).toLocaleString()}` : `₹${safeAmount}`}</td>
              </tr>
            </tfoot>
          </table>
          <div class="signatures">
            <div class="sig-box">Student / Guardian Sign</div>
            <div class="sig-box">Authorized Mentor Sign<br><small>(Pragyan Institute Lalganj)</small></div>
          </div>
          <div class="footer">
            Pragyan Institute — At Moti Market, Near Jagdamba Sthan, Vaishali Bus Stand Road, Lalganj | Helpline: +91 73698 91858
          </div>
        </div>
        <script>
          window.onload = function() { window.print(); };
        </script>
      </body>
      </html>
    `);
    printWin.document.close();
  }

  // Permanent Master Storage Keys (never reset across updates)
  const STORAGE_KEY_STUDENTS = 'pragyan_db_students_master';
  const STORAGE_KEY_ADMINS = 'pragyan_db_admins_master';
  const STORAGE_KEY_ADMIN = 'pragyan_db_admin_master';
  const STORAGE_KEY_NOTICES = 'pragyan_db_notices_master';
  const STORAGE_KEY_BATCHES = 'pragyan_db_batches_master';
  const STORAGE_KEY_REQUESTS = 'pragyan_db_requests_master';
  const STORAGE_KEY_AUDIT_LOGS = 'pragyan_db_audit_logs_master';
  const STORAGE_KEY_SESSION = 'pragyan_current_session_master';
  const STORAGE_KEY_SCHEDULES = 'pragyan_db_class_schedules_master';
  const STORAGE_KEY_HOLIDAYS = 'pragyan_db_institute_holidays_master';

  // Legacy Storage Migration: Migrate any existing data from v1/v2/v3 keys automatically
  function migrateLegacyLocalStorageData() {
    const keysMap = [
      { master: STORAGE_KEY_STUDENTS, legacy: ['pragyan_db_students_v3', 'pragyan_db_students_v2', 'pragyan_db_students_v1', 'pragyan_students_data'] },
      { master: STORAGE_KEY_ADMINS, legacy: ['pragyan_db_admin_master', 'pragyan_db_admin_v3', 'pragyan_db_admin_v2', 'pragyan_db_admin_v1'] },
      { master: STORAGE_KEY_NOTICES, legacy: ['pragyan_db_notices_v3', 'pragyan_db_notices_v2', 'pragyan_db_notices_v1'] },
      { master: STORAGE_KEY_BATCHES, legacy: ['pragyan_db_batches_v3', 'pragyan_db_batches_v2', 'pragyan_db_batches_v1'] },
      { master: STORAGE_KEY_REQUESTS, legacy: ['pragyan_db_requests_v3', 'pragyan_db_requests_v2', 'pragyan_db_requests_v1'] },
      { master: STORAGE_KEY_AUDIT_LOGS, legacy: ['pragyan_db_audit_logs_v3', 'pragyan_db_audit_logs_v2', 'pragyan_db_audit_logs_v1'] }
    ];

    keysMap.forEach(item => {
      if (!localStorage.getItem(item.master)) {
        for (const legKey of item.legacy) {
          const legVal = localStorage.getItem(legKey);
          if (legVal) {
            try {
              const parsed = JSON.parse(legVal);
              if (parsed && (Array.isArray(parsed) ? parsed.length > 0 : Object.keys(parsed).length > 0)) {
                localStorage.setItem(item.master, legVal);
                break;
              }
            } catch (e) {}
          }
        }
      }
    });
  }

  migrateLegacyLocalStorageData();

  function getFormattedTimestamp() {
    const d = new Date();
    const dateStr = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    return `${dateStr}, ${timeStr}`;
  }

  // Helper: Sanitize & Validate 10-Digit Mobile Numbers (Strictly numeric, no letters, no 9 or 11 digits)
  function sanitizeMobileNumber(phone) {
    if (!phone) return '';
    const digits = String(phone).replace(/\D/g, '');
    if (digits.length === 10) return digits;
    if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
    if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
    if (digits.length > 10) return digits.slice(-10);
    return digits;
  }

  function isValid10DigitMobile(phone) {
    if (!phone) return false;
    const clean = sanitizeMobileNumber(phone);
    return /^[6-9]\d{9}$/.test(clean) || /^\d{10}$/.test(clean);
  }

  // Helper: Standardized India Standard Time (IST) Month Key (YYYY-MM)
  function getIndiaMonthKey() {
    try {
      const parts = new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit'
      }).formatToParts(new Date());
      const map = {};
      for (const p of parts) map[p.type] = p.value;
      return `${map.year}-${map.month}`;
    } catch {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
  }

  // Helper: Extract 2-digit Class Code (CC)
  /**
   * The CC half of the YYCCSS student barcode. Delegates to the canonical
   * classCodeFor(), which is derived from the same resolveBatch() the fee and
   * billing paths use, so a student's barcode and their batch can never disagree.
   *
   * The hand-rolled ladder this replaces got four things wrong, and because the
   * code is baked into a permanent student id every one of them was unfixable
   * after enrolment:
   *
   *   • It returned '06' for Class 6th. There is no '06' code — 6th and 7th share
   *     '07' — so those students landed in a serial namespace nothing else reads.
   *   • It had no '05' at all, so "Class 1st to 5th (Junior Foundation)" matched
   *     includes('JUNIOR') and was stamped '07', colliding with Class 6th/7th.
   *   • It had no '01' either, so "Special English 9th to 12th" was stamped '12'
   *     and shared Class 12th's serial namespace, while "Special English 1st to
   *     5th" fell through to the default.
   *   • includes('X') meant any class name containing the letter X returned '10'
   *     — "Class 6th Extra" minted a Class 10th barcode.
   *
   * An unresolvable class name now yields '' rather than defaulting to '10',
   * which stopped a mis-typed class from silently issuing a Class 10th id.
   */
  function getClassCode(className = '') {
    const cfg = academicConfig();
    if (cfg) {
      const code = cfg.classCodeFor(className);
      if (code) return code;
    }
    // Last-resort literal parse for the config-missing case. Deliberately narrow:
    // a bare ordinal only, no substring matching.
    const match = String(className || '').match(/\b(1[0-2]|[6-9])(?:st|nd|rd|th)?\b/i);
    if (match) {
      const n = Number(match[1]);
      if (n >= 8) return String(n).padStart(2, '0');
      return '07';
    }
    return '';
  }

  // Helper: Auto-Generate YYCCSS Student ID (Year + Class + Serial No.)
  function generateStudentId(className = '', existingStudents = []) {
    const ist = getISTDateParts();
    const currentYear = ist.year.toString().slice(-2); // e.g. "26"
    const classCode = getClassCode(className);
    // No class code means the class name did not resolve to one of the twelve
    // batches. Returning '' lets the caller refuse rather than mint a malformed
    // 4-character barcode whose serial slice would parse as NaN.
    if (!classCode) return '';
    const prefix = `${currentYear}${classCode}`;

    const combinedList = (typeof AppState !== 'undefined' && AppState.getStudents ? AppState.getStudents() : []).concat(existingStudents || []);
    const matchingIds = combinedList
      .map(s => s && (s.student_id || s.id || s.rollNo || s.roll_no) ? (s.student_id || s.id || s.rollNo || s.roll_no).toString() : '')
      .filter(id => id.startsWith(prefix));

    let maxSerial = 0;
    matchingIds.forEach(id => {
      const serialPart = parseInt(id.slice(4), 10);
      if (!isNaN(serialPart) && serialPart > maxSerial) {
        maxSerial = serialPart;
      }
    });

    const nextSerial = maxSerial + 1;
    const serialStr = nextSerial.toString().padStart(2, '0');

    return `${prefix}${serialStr}`;
  }

  // Server-Authoritative Asynchronous Student ID Resolver (Queries API & Live Database)
  async function fetchNextStudentId(className = '') {
    const ist = getISTDateParts();
    const currentYear = ist.year.toString().slice(-2);
    const classCode = getClassCode(className);
    const prefix = `${currentYear}${classCode}`;

    let maxSerial = 0;

    // 1. Try serverless endpoint /api/student-id first. It now requires an admin
    // session (it used to be public, which let anyone enumerate enrolment counts),
    // so the token has to go with the request or every allocation would silently
    // fall through to the unlocked client-side fallbacks below.
    try {
      const res = await fetch(`/api/student-id?className=${encodeURIComponent(className)}`, {
        headers: { 'Authorization': `Bearer ${(typeof sessionStorage !== 'undefined' && sessionStorage.getItem('pragyan_portal_token')) || ''}` }
      });
      if (res.ok && (res.headers.get("content-type") || "").includes("application/json")) {
        const json = await res.json().catch(() => ({}));
        if (json.success && json.studentId) {
          // Cross check with unpushed local state
          const localStudents = (typeof AppState !== 'undefined' && AppState.getStudents) ? AppState.getStudents() : [];
          localStudents.forEach(s => {
            const rawId = String(s.student_id || s.id || s.rollNo || s.roll_no || '').trim();
            if (rawId.startsWith(prefix)) {
              const num = parseInt(rawId.slice(4), 10);
              if (!isNaN(num) && num > maxSerial) maxSerial = num;
            }
          });
          if (maxSerial >= json.serial) {
            const nextSerial = maxSerial + 1;
            return `${prefix}${nextSerial.toString().padStart(2, '0')}`;
          }
          return json.studentId;
        }
      }
    } catch (apiErr) {
      console.warn('[student-id] Serverless endpoint note:', apiErr.message);
    }

    // 2. Direct Supabase query fallback
    try {
      if (typeof SupabaseSync !== 'undefined' && SupabaseSync._rest) {
        const dbRows = await SupabaseSync._rest('GET', 'students', `select=student_id&student_id=like.${prefix}%`);
        if (Array.isArray(dbRows)) {
          dbRows.forEach(r => {
            const rawId = String(r.student_id || '').trim();
            if (rawId.startsWith(prefix)) {
              const num = parseInt(rawId.slice(4), 10);
              if (!isNaN(num) && num > maxSerial) maxSerial = num;
            }
          });
        }
      }
    } catch (dbErr) {
      console.warn('[student-id] DB sequence query note:', dbErr.message);
    }

    // 3. Combine with local memory
    const localList = (typeof AppState !== 'undefined' && AppState.getStudents) ? AppState.getStudents() : [];
    localList.forEach(s => {
      const rawId = String(s.student_id || s.id || s.rollNo || s.roll_no || '').trim();
      if (rawId.startsWith(prefix)) {
        const num = parseInt(rawId.slice(4), 10);
        if (!isNaN(num) && num > maxSerial) maxSerial = num;
      }
    });

    const nextSerial = maxSerial + 1;
    return `${prefix}${nextSerial.toString().padStart(2, '0')}`;
  }

  // Seed Data Initializer (100% Monthly Coaching Model)
  function initDatabase() {
    // Purge legacy v1 and v2 cached keys
    localStorage.removeItem('pragyan_db_students_v1');
    localStorage.removeItem('pragyan_db_admin_v1');
    localStorage.removeItem('pragyan_db_notices_v1');
    localStorage.removeItem('pragyan_db_batches_v1');
    localStorage.removeItem('pragyan_current_session_v1');

    localStorage.removeItem('pragyan_db_students_v2');
    localStorage.removeItem('pragyan_db_admin_v2');
    localStorage.removeItem('pragyan_db_notices_v2');
    localStorage.removeItem('pragyan_db_batches_v2');
    localStorage.removeItem('pragyan_current_session_v2');

    // Sensitive records are loaded only after a successful server-side login.
    if (!localStorage.getItem(STORAGE_KEY_STUDENTS)) localStorage.setItem(STORAGE_KEY_STUDENTS, '[]');

    // Administrator records are server-managed. Never seed credentials in a browser.
    if (!localStorage.getItem(STORAGE_KEY_ADMINS)) localStorage.setItem(STORAGE_KEY_ADMINS, '[]');

    if (!localStorage.getItem(STORAGE_KEY_NOTICES)) {
      const initialNotices = [
        {
          id: 'NTC-101',
          title: 'Class 10th ACHIEVER Weekly Mathematics Mock Test',
          category: 'exam',
          date: '2026-08-15',
          message: 'Weekly Board Special Mock Test for Class 10th ACHIEVER batch Mathematics by Ravi Ranjan Sir will be held on Sunday from 9:00 AM to 12:00 PM. Attendance is compulsory.',
          targetBatch: 'Class 10th (ACHIEVER)',
          unread: true
        },
        {
          id: 'NTC-102',
          title: 'Independence Day Science Quiz by Chandan Sir',
          category: 'general',
          date: '2026-08-14',
          message: 'All students are invited to join the 15th August flag hoisting at 8:00 AM, followed by a Science Quiz competition conducted by Chandan Kumar Sir.',
          targetBatch: 'All Batches',
          unread: true
        },
        {
          id: 'NTC-103',
          title: 'Monthly Tuition Fee Collection Notice',
          category: 'fees',
          date: '2026-08-01',
          message: 'Parents are kindly requested to deposit monthly tuition fees by August 10th at the institute counter to keep student access active.',
          targetBatch: 'All Batches',
          unread: false
        }
      ];
      localStorage.setItem(STORAGE_KEY_NOTICES, JSON.stringify(initialNotices));
    }

    if (!localStorage.getItem(STORAGE_KEY_BATCHES)) {
      localStorage.setItem(STORAGE_KEY_BATCHES, JSON.stringify(buildSeedBatches()));
    }

    if (!localStorage.getItem(STORAGE_KEY_AUDIT_LOGS)) localStorage.setItem(STORAGE_KEY_AUDIT_LOGS, '[]');
  }

  // ==========================================================================
  // SUPABASE REALTIME & CROSS-TAB INSTANT BROADCAST ENGINE
  // ==========================================================================
  // Application State Manager
  const AppState = {
    currentRole: 'student', // 'student' or 'admin'
    currentUser: null,      // Student or Admin object
    activeStudentTab: 'details',
    activeAdminTab: 'students',
    lastLocalMutationTime: 0,

    // In-memory high-speed cache
    _studentsCache: null,
    _noticesCache: null,
    _batchesCache: null,
    _requestsCache: null,
    _adminsCache: null,
    _auditLogsCache: null,
    _lastSavedStudentsMap: new Map(),
    _lastSavedReceiptsSet: new Set(),
    _dirtyStudentIds: new Set(),

    markStudentDirty(id) {
      if (id) this._dirtyStudentIds.add(id.toString());
    },

    clearDirtyStudents() {
      this._dirtyStudentIds.clear();
    },

    generateStudentId(classCode = '10', existingStudents = []) {
      return generateStudentId(classCode, existingStudents);
    },

    async fetchNextStudentId(classCode = '10') {
      return await fetchNextStudentId(classCode);
    },

    getClassCode(className = '') {
      return getClassCode(className);
    },

    invalidateCaches() {
      this._studentsCache = null;
      this._noticesCache = null;
      this._batchesCache = null;
      this._requestsCache = null;
      this._adminsCache = null;
      this._auditLogsCache = null;
    },

    safeSetItem(key, value) {
      this.invalidateCaches();
      if (typeof SupabaseSync !== 'undefined' && SupabaseSync.safeStore) {
        return SupabaseSync.safeStore(key, value);
      }
      try {
        localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
        return true;
      } catch (err) {
        console.warn(`⚠️ SafeStorage: Could not write key '${key}' (Quota or Privacy Mode):`, err.message);
        return false;
      }
    },

    markMutation() {
      this.lastLocalMutationTime = Date.now();
      this.safeSetItem('pragyan_last_local_mutation', this.lastLocalMutationTime.toString());
      try {
        if (typeof SupabaseSync !== 'undefined' && SupabaseSync.broadcastChange) {
          SupabaseSync.broadcastChange({ time: this.lastLocalMutationTime });
        }
      } catch (e) {
        console.warn('BroadcastChannel note:', e);
      }
      window.dispatchEvent(new CustomEvent('pragyan_local_mutation', { detail: { time: this.lastLocalMutationTime } }));
    },

    getLocalMutationTime() {
      if (!this.lastLocalMutationTime) {
        try {
          this.lastLocalMutationTime = parseInt(localStorage.getItem('pragyan_last_local_mutation') || '0', 10);
        } catch (e) { this.lastLocalMutationTime = 0; }
      }
      return this.lastLocalMutationTime;
    },

    getStudents() {
      if (this._studentsCache) return this._studentsCache;
      try {
        const raw = localStorage.getItem(STORAGE_KEY_STUDENTS);
        this._studentsCache = raw ? JSON.parse(raw) : [];
      } catch (e) { this._studentsCache = []; }

      // Re-hydrate feeHistory from getFeeReceipts if missing
      if (Array.isArray(this._studentsCache) && this._studentsCache.length > 0) {
        let allReceipts = [];
        try {
          const rawRec = localStorage.getItem('pragyan_db_fee_receipts_master');
          if (rawRec) allReceipts = JSON.parse(rawRec);
        } catch (_) {}

        if (Array.isArray(allReceipts) && allReceipts.length > 0) {
          this._studentsCache.forEach(student => {
            if (!Array.isArray(student.feeHistory) || student.feeHistory.length === 0) {
              const sUuid = (student.db_uuid || (student.id && String(student.id).includes('-') ? student.id : '')).toString().toLowerCase();
              const sId = (student.id || student.student_id || '').toString().toLowerCase();
              const sRoll = (student.rollNo || student.roll_no || '').toString().toLowerCase();
              const matched = allReceipts.filter(r => {
                const rStuId = (r.studentId || r.student_id || '').toString().toLowerCase();
                const rNo = (r.receiptNo || r.receipt_no || '').toString().toLowerCase();
                return (sUuid && rStuId === sUuid) || (sId && rStuId === sId) || (sRoll && rStuId === sRoll) || (sId && rNo.includes(sId));
              });
              if (matched.length > 0) student.feeHistory = matched;
            }
          });
        }
      }
      return this._studentsCache;
    },
    async saveStudents(students, changedIds = null) {  // H1: Delta sync with dirty tracking
      this._studentsCache = students;
      this.safeSetItem(STORAGE_KEY_STUDENTS, students);
      this.markMutation();

      try {
        if (Array.isArray(students) && students.length > 0) {
          // H1: Determine dirty / changed records for Delta Sync
          let studentsToSync = [];
          const dirtySet = new Set(this._dirtyStudentIds);
          if (Array.isArray(changedIds) && changedIds.length > 0) {
            changedIds.forEach(id => dirtySet.add(id.toString().toLowerCase()));
          }

          if (dirtySet.size > 0) {
            studentsToSync = students.filter(s => {
              const sId = (s.id || s.student_id || s.rollNo || '').toString().toLowerCase();
              return dirtySet.has(sId) || (s.id && dirtySet.has(s.id.toString().toLowerCase())) || (s.student_id && dirtySet.has(s.student_id.toString().toLowerCase()));
            });
          } else if (this._lastSavedStudentsMap && this._lastSavedStudentsMap.size > 0) {
            studentsToSync = students.filter(s => {
              const id = s.id || s.student_id || s.rollNo;
              const prev = this._lastSavedStudentsMap.get(id);
              if (!prev) return false; // Prevent ghost resurrecting deleted students
              const prevPhoto = prev.photo || prev.photoUrl || prev.photo_url || '';
              const currPhoto = s.photo || s.photoUrl || s.photo_url || '';
              return (
                prev.name !== s.name ||
                prev.mobile !== s.mobile ||
                prev.dob !== s.dob ||
                prev.className !== s.className ||
                prev.totalFee !== s.totalFee ||
                prev.paidFee !== s.paidFee ||
                prev.pendingFee !== s.pendingFee ||
                prevPhoto !== currPhoto ||
                prev.status !== s.status ||
                prev.guardianName !== s.guardianName ||
                prev.guardianMobile !== s.guardianMobile ||
                prev.address !== s.address ||
                prev.email !== s.email ||
                prev.bloodGroup !== s.bloodGroup ||
                prev.joiningMonth !== s.joiningMonth
              );
            });
          }

          if (studentsToSync.length > 0) {
            const supaPayload = studentsToSync.map(s => {
              const id = s.student_id || s.id || s.rollNo || s.roll_no || '';
              const cleanEmail = (s.email && s.email.includes('@')) ? s.email.trim() : null;
              let dobFormatted = '2010-01-01';
              if (s.dob) {
                const str = s.dob.toString().trim();
                const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
                if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
                  dobFormatted = str;
                } else if (dmyMatch) {
                  const day = dmyMatch[1].padStart(2, '0');
                  const month = dmyMatch[2].padStart(2, '0');
                  const yr = dmyMatch[3];
                  dobFormatted = `${yr}-${month}-${day}`;
                } else {
                  const parsed = new Date(str);
                  if (!isNaN(parsed.getTime())) {
                    const yr = parsed.getFullYear();
                    if (yr >= 1900 && yr <= new Date().getFullYear()) {
                      dobFormatted = parsed.toISOString().split('T')[0];
                    }
                  }
                }
              }
              const paidFee = Number(s.paidFee ?? s.paid_fee ?? 0);
              const pendingFee = Number(s.pendingFee ?? s.pending_fee ?? 0);
              const totalFee = Number(s.totalFee ?? s.total_fee ?? (paidFee + pendingFee));

              return {
                student_id: id,
                name: s.name || 'Coaching Student',
                mobile: s.mobile || null,
                dob: dobFormatted,
                roll_no: s.rollNo || s.roll_no || id,
                class_name: s.className || s.class_name || 'Class 10th (ACHIEVER)',
                guardian_name: s.guardianName || s.guardian_name || null,
                guardian_mobile: s.guardianMobile || s.guardian_mobile || s.mobile || null,
                email: cleanEmail,
                total_fee: Math.max(totalFee, paidFee + pendingFee),
                paid_fee: paidFee,
                pending_fee: pendingFee,
                monthly_fee: Number(s.monthlyFee ?? s.monthlyInstallment ?? s.monthly_fee ?? 0),
                photo_url: s.photo || s.photo_url || s.photoUrl || '',
                status: s.status || 'Active',
                address: s.address || '',
                blood_group: s.bloodGroup || s.blood_group || '',
                joining_month: s.joiningMonth || s.joining_month || '',
                admission_date: s.admissionDate || s.admission_date || null,
                idempotency_key: id
              };
            });

            if (typeof SupabaseSync !== 'undefined' && SupabaseSync.mutate) {
              const r = await SupabaseSync.mutate('students', 'upsert', supaPayload, { conflict: 'student_id' });
              if (!r?.success) console.warn('saveStudents delta write failed:', r?.error);
              else {
                this.clearDirtyStudents();
                students.forEach(s => {
                  const id = s.id || s.student_id || s.rollNo;
                  this._lastSavedStudentsMap.set(id, { ...s });
                });
              }
            }
          }

          // Cache local fee accounts in lockstep with students table
          if (studentsToSync.length > 0) {
            const currentMonthKey = getIndiaMonthKey();
            const feeAccountsPayload = studentsToSync.map(s => {
              const id = s.student_id || s.id || s.rollNo || s.roll_no || '';
              const totalDue = Math.max(0, Number(s.pendingFee ?? s.pending_fee ?? (Number(s.totalFee || s.total_fee || 0) - Number(s.paidFee || s.paid_fee || 0))));
              const monthlyFee = studentMonthlyFee(s);
              const prevDue = Math.max(0, totalDue - monthlyFee);
              const currFee = monthlyFee;
              const paidThisMonth = totalDue < monthlyFee ? Math.max(0, monthlyFee - totalDue) : 0;

              return {
                student_id: id,
                studentId: id,
                roll_no: s.rollNo || s.roll_no || id,
                rollNo: s.rollNo || s.roll_no || id,
                student_name: s.name || 'Student',
                studentName: s.name || 'Student',
                class_name: s.className || s.class_name || '',
                className: s.className || s.class_name || '',
                billing_month: currentMonthKey,
                billingMonth: currentMonthKey,
                previous_due: prevDue,
                previousDue: prevDue,
                current_month_fee: currFee,
                currentMonthFee: currFee,
                total_due: totalDue,
                totalDue: totalDue,
                paid_this_month: paidThisMonth,
                paidThisMonth: paidThisMonth,
                last_updated_at: new Date().toISOString()
              };
            });

            this._feeAccountsCache = feeAccountsPayload;
            this.safeSetItem('pragyan_db_fee_accounts_master', feeAccountsPayload);
          }

          // H3 & H2: Delta Sync for receipts (Only actual monetary collections)
          const newReceipts = [];
          students.forEach(s => {
            if (Array.isArray(s.feeHistory)) {
              const studentUuid = s.db_uuid || (s.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.id) ? s.id : null);
              s.feeHistory.forEach(h => {
                if (!isRealCollectedPayment(h)) return; // Strictly ignore non-cash adjustments, old dues, and penalties
                const rNo = h.receiptNo || h.receipt_no;
                if (!rNo) return;
                if (!this._lastSavedReceiptsSet.has(rNo)) {
                  if (studentUuid) {
                    newReceipts.push({
                      receipt_no: rNo,
                      student_id: studentUuid,
                      amount: Number(h.amount) || 0,
                      payment_mode: h.mode || h.payment_mode || 'Cash Collected',
                      status: 'Paid',
                      payment_date: h.date || h.payment_date || new Date().toISOString().split('T')[0],
                      collected_by: h.by || h.collected_by || 'CHANDAN KUMAR',
                      note: h.note || ''
                    });
                  }
                }
              });
            }
          });

          if (newReceipts.length > 0 && typeof SupabaseSync !== 'undefined' && SupabaseSync.mutate) {
            const r2 = await SupabaseSync.mutate('fee_receipts', 'upsert', newReceipts, { conflict: 'receipt_no' });
            if (!r2?.success) console.warn('saveStudents receipts write note:', r2?.error);
            else {
              newReceipts.forEach(r => this._lastSavedReceiptsSet.add(r.receipt_no));
            }
          }
        }
      } catch(e) { console.warn('saveStudents Supabase error:', e); }
    },
    async deleteStudent(studentId) {
      if (!studentId) return { success: false, error: 'Student ID required' };
      const students = this.getStudents();
      const target = students.find(s => s.id === studentId || s.student_id === studentId || s.rollNo === studentId);
      if (!target) return { success: false, error: 'Student record not found in system' };

      const cleanId = target.id || target.student_id || studentId;
      const cleanStuId = target.student_id || target.id || '';
      const cleanRoll = target.rollNo || target.roll_no || '';
      const cleanUuid = target.db_uuid || (cleanId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId) ? cleanId : null);

      // 2. Cascade delete across the child tables, then the student.
      //
      // Order matters and so does checking the result. SupabaseSync.mutate RETURNS
      // its failures rather than throwing, so the `catch` that used to wrap this
      // block was unreachable: every one of these nine deletes could fail and the
      // function still fell through to wipe the local copy and report success. The      // student then reappeared on the next pullAll() — with their receipts and
      // requests intact — after the admin had been told the record was deleted.
      //
      // The photo delete has also moved to AFTER this block. It is irreversible,
      // and deleting it first meant a failed cascade left a surviving student row
      // pointing at a photo that no longer exists.
      const cascade = [];
      if (typeof SupabaseSync === 'undefined' || !SupabaseSync.mutate) {
        // Fail-closed: without the sync layer there is no way to verify the
        // cloud rows are gone. The old path skipped the cascade silently, wiped
        // the local copy, reported success — and the student resurrected on the
        // next pull with all children intact.
        return {
          success: false,
          error: 'The database sync layer is unavailable right now, so the deletion was refused. Please retry once the connection is restored.'
        };
      }
      {
        // Children first: a students row removed before its receipts would orphan
        // them under any FK that is not ON DELETE CASCADE.
        if (cleanUuid) cascade.push(['fee_receipts', { student_id: cleanUuid }]);
        if (cleanStuId) cascade.push(['fee_receipts', { student_id: cleanStuId }]);
        if (cleanStuId) cascade.push(['student_requests', { student_id: cleanStuId }]);
        if (cleanRoll) cascade.push(['student_requests', { roll_no: cleanRoll }]);
        if (cleanStuId) cascade.push(['fee_billing_ledger', { student_id: cleanStuId }]);
        // Parent last, under every identifier the row might carry.
        if (cleanStuId) cascade.push(['students', { student_id: cleanStuId }]);
        if (cleanUuid && cleanUuid !== cleanStuId) cascade.push(['students', { id: cleanUuid }]);
        if (cleanRoll && cleanRoll !== cleanStuId) cascade.push(['students', { roll_no: cleanRoll }]);

        const failures = [];
        let studentRowsDeleted = 0;
        for (const [table, where] of cascade) {
          const result = await SupabaseSync.mutate(table, 'delete', null, { where });
          if (!result || result.success !== true) {
            failures.push(`${table} (${Object.keys(where)[0]}): ${result?.error || 'rejected'}`);
          } else if (table === 'students') {
            // A "successful" delete matching zero rows means the WHERE hit
            // nothing — the parent row is still live and a local wipe would lie.
            studentRowsDeleted += Array.isArray(result.data) ? result.data.length : 1;
          }
        }

        if (failures.length > 0) {
          // Refuse rather than diverge. Nothing local has been touched yet, so the
          // admin can retry against a record that is still intact in both places.
          console.error('[deleteStudent] cascade failed, local copy left intact:', failures.join(' | '));
          return {
            success: false,
            error: `${target.name || cleanStuId} was NOT deleted — the database rejected ${failures.length} of ${cascade.length} deletions. The record is unchanged. Check your connection and try again.`,
            details: failures
          };
        }
        if (studentRowsDeleted === 0) {
          return { success: false, error: `${target.name || cleanStuId} was NOT deleted — no matching row found in the database. Refresh and check the roster.` };
        }
      }

      // 3. The photo, now that the row that referenced it is gone for good.
      const photoUrl = target.photo || target.photoUrl || target.photo_url || '';
      if (photoUrl && (photoUrl.includes('/pragyan-media/') || photoUrl.includes('/profile_pictures/')) && typeof SupabaseSync !== 'undefined' && SupabaseSync.deleteFile) {
        try {
          await SupabaseSync.deleteFile(photoUrl);
        } catch (e) {
          // A leaked storage object is untidy; a half-deleted student is not. This
          // one stays non-fatal on purpose.
          console.warn('Storage photo deletion note:', e.message);
        }
      }

      // 4. Remove from local memory caches and localStorage
      const remainingStudents = students.filter(s => s.id !== target.id && s.student_id !== cleanStuId && s.rollNo !== cleanRoll);
      this._studentsCache = remainingStudents;
      this.safeSetItem(STORAGE_KEY_STUDENTS, remainingStudents);
      if (this._lastSavedStudentsMap) {
        this._lastSavedStudentsMap.delete(target.id);
        if (cleanStuId) this._lastSavedStudentsMap.delete(cleanStuId);
      }

      // Purge from local fee accounts cache
      try {
        let feeAccs = this.getFeeAccounts ? this.getFeeAccounts() : [];
        feeAccs = feeAccs.filter(a => (a.student_id || a.studentId) !== cleanStuId && (a.student_id || a.studentId) !== target.id);
        this._feeAccountsCache = feeAccs;
        this.safeSetItem('pragyan_db_fee_accounts_master', feeAccs);
      } catch (_) {}

      // Purge from local fee receipts cache
      try {
        let feeRecs = this.getFeeReceipts ? this.getFeeReceipts() : [];
        feeRecs = feeRecs.filter(r => (r.student_id || r.studentId) !== cleanStuId && (r.student_id || r.studentId) !== cleanUuid && (r.student_id || r.studentId) !== target.id);
        this._receiptsCache = feeRecs;
        this.safeSetItem('pragyan_db_fee_receipts_master', feeRecs);
      } catch (_) {}

      // Purge from local requests cache
      try {
        let reqs = this.getRequests ? this.getRequests() : [];
        reqs = reqs.filter(r => (r.student_id || r.studentId) !== cleanStuId && (r.rollNo || r.roll_no) !== cleanRoll);
        this._requestsCache = reqs;
        this.safeSetItem('pragyan_db_requests_master', reqs);
      } catch (_) {}

      // 4. Log to Audit History
      const teacherName = typeof getActiveTeacherName === 'function' ? getActiveTeacherName() : 'Admin';
      this.addAuditLog(teacherName, 'STUDENT_PERMANENTLY_DELETED', target.name, target.rollNo, `Permanently deleted student record and all historical ledgers for ${target.name} (Roll #${target.rollNo}, ID: ${cleanStuId}). Outstanding dues at time of deletion: ₹${(target.pendingFee || 0).toLocaleString()}`, {
        studentId: cleanStuId,
        rollNo: cleanRoll,
        pendingFee: target.pendingFee || 0,
        paidFee: target.paidFee || 0,
        className: target.className
      });

      this.markMutation();
      return { success: true, target };
    },
    invalidateCaches() {
      this._studentsCache = null;
      this._receiptsCache = null;
      this._billingLedgerCache = null;
      this._feeAccountsCache = null;
      this._adminsCache = null;
      this._noticesCache = null;
      this._requestsCache = null;
      this._batchesCache = null;
      this._classSchedulesCache = null;
      this._instituteHolidaysCache = null;
    },
    getFeeReceipts() {
      if (this._receiptsCache) return this._receiptsCache;
      try {
        const raw = localStorage.getItem('pragyan_db_fee_receipts_master');
        const list = raw ? JSON.parse(raw) : [];
        this._receiptsCache = Array.isArray(list) ? list.filter(r => isRealCollectedPayment(r)) : [];
      } catch (e) { this._receiptsCache = []; }

      // Fallback: merge with any genuine payments found across all students' feeHistory
      if (!this._receiptsCache || this._receiptsCache.length === 0) {
        const fallback = [];
        const students = this.getStudents();
        students.forEach(s => {
          if (Array.isArray(s.feeHistory)) {
            s.feeHistory.forEach(h => {
              if (!isRealCollectedPayment(h)) return; // Strictly ignore non-cash adjustments, old dues, rate changes
              const rNo = h.receiptNo || h.receipt_no;
              if (rNo && !fallback.some(r => (r.receiptNo || r.receipt_no) === rNo)) {
                fallback.push({
                  receiptNo: rNo,
                  receipt_no: rNo,
                  studentId: s.id || s.student_id || s.rollNo,
                  student_id: s.id || s.student_id || s.rollNo,
                  amount: Number(h.amount) || 0,
                  date: h.date || h.payment_date || '',
                  payment_date: h.date || h.payment_date || '',
                  mode: h.mode || h.payment_mode || 'Cash Collected',
                  payment_mode: h.mode || h.payment_mode || 'Cash Collected',
                  status: 'Paid',
                  by: h.by || h.collected_by || 'CHANDAN KUMAR',
                  collected_by: h.by || h.collected_by || 'CHANDAN KUMAR',
                  note: h.note || ''
                });
              }
            });
          }
        });
        if (fallback.length > 0) this._receiptsCache = fallback;
      }
      return this._receiptsCache || [];
    },
    getBillingLedger() {
      if (this._billingLedgerCache) return this._billingLedgerCache;
      try {
        const raw = localStorage.getItem('pragyan_db_fee_ledger_master');
        this._billingLedgerCache = raw ? JSON.parse(raw) : [];
      } catch (e) { this._billingLedgerCache = []; }
      return this._billingLedgerCache || [];
    },
    // recordLedgerEntry() lived here and had zero callers. It wrote a
    // fee_billing_ledger row from the browser with an idempotency key of
    // `fee_<SID>_<MONTH>`, where apply_monthly_fee uses `BILL-<SID>-<YYYY-MM>` —
    // two formats that never collide, so a charge written through it would have
    // been invisible to the server's duplicate check and billed again. Billing is
    // server-owned (api/cron-monthly-fees.js, api/admin-trigger-billing.js).
    async recordReceipt(receipt) {
      if (!receipt) return;
      const receipts = this.getFeeReceipts();
      const rNo = receipt.receipt_no || receipt.receiptNo;
      if (!rNo) return;

      const existingIdx = receipts.findIndex(r => (r.receipt_no || r.receiptNo) === rNo);
      if (existingIdx >= 0) {
        receipts[existingIdx] = receipt;
      } else {
        receipts.unshift(receipt);
      }

      this._receiptsCache = receipts;
      this.safeSetItem('pragyan_db_fee_receipts_master', receipts);
      this.markMutation();

      if (typeof SupabaseSync !== 'undefined' && SupabaseSync.mutate) {
        try {
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(receipt.student_id || receipt.studentId || ''));
          let stuUuid = isUuid ? (receipt.student_id || receipt.studentId) : null;
          if (!stuUuid) {
            const students = this.getStudents();
            const found = students.find(s => s.id === receipt.student_id || s.student_id === receipt.student_id || s.rollNo === receipt.student_id);
            stuUuid = found?.db_uuid || (found?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(found.id) ? found.id : null);
          }
          if (stuUuid) {
            const mutateRes = await SupabaseSync.mutate('fee_receipts', 'upsert', [{
              receipt_no: rNo,
              student_id: stuUuid,
              amount: Number(receipt.amount || 0),
              payment_mode: receipt.payment_mode || receipt.mode || 'Cash Collected',
              status: receipt.status || 'Paid',
              payment_date: receipt.payment_date || receipt.date || new Date().toISOString().split('T')[0],
              collected_by: receipt.collected_by || receipt.by || 'CHANDAN KUMAR',
              note: receipt.note || ''
            }], { conflict: 'receipt_no' });
            if (mutateRes && mutateRes.success === false) {
              console.error('[recordReceipt] remote upsert failed:', mutateRes.error || 'rejected');
            }
          }
        } catch (err) {
          console.warn('fee_receipts mutate note:', err.message);
        }
      }
    },
    getFeeAccounts() {
      if (this._feeAccountsCache) return this._feeAccountsCache;
      try {
        const raw = localStorage.getItem('pragyan_db_fee_accounts_master');
        this._feeAccountsCache = raw ? JSON.parse(raw) : [];
      } catch (e) { this._feeAccountsCache = []; }
      return this._feeAccountsCache || [];
    },
    getStudentFeeAccount(studentId, fallbackStudent = null) {
      const accounts = this.getFeeAccounts();
      const sId = String(studentId || '').toLowerCase();
      const acc = accounts.find(a => 
        String(a.student_id || a.studentId || '').toLowerCase() === sId ||
        String(a.roll_no || a.rollNo || '').toLowerCase() === sId
      );

      const student = fallbackStudent || this.getStudents().find(s => 
        String(s.student_id || s.id || s.rollNo || s.roll_no || '').toLowerCase() === sId
      );

      // Recorded values first — acc.current_month_fee is what was actually
      // billed, so it outranks the config — then the canonical fee for the
      // class. The old tail was a flat `?? 1000`, which understated every
      // senior-batch account by ₹500.
      const monthlyFee = Number(student?.monthlyFee ?? student?.monthly_fee ?? acc?.current_month_fee ?? acc?.currentMonthFee ?? 0)
        || classMonthlyFee(student?.className || student?.class_name || acc?.class_name || acc?.className || '');

      if (acc) {
        const totalDue = Number(acc.total_due ?? acc.totalDue ?? 0);
        const currFee = Number(acc.current_month_fee ?? acc.currentMonthFee ?? monthlyFee);
        const prevDue = Number(acc.previous_due ?? acc.previousDue ?? Math.max(0, totalDue - monthlyFee));
        return {
          studentId: acc.student_id || acc.studentId || studentId,
          rollNo: acc.roll_no || acc.rollNo || '',
          studentName: acc.student_name || acc.studentName || '',
          className: acc.class_name || acc.className || '',
          billingMonth: acc.billing_month || acc.billingMonth || '',
          previousDue: prevDue,
          currentMonthFee: currFee,
          totalDue: totalDue,
          paidThisMonth: Number(acc.paid_this_month ?? acc.paidThisMonth ?? (totalDue < monthlyFee ? Math.max(0, monthlyFee - totalDue) : 0))
        };
      }

      // Deterministic fallback computation from student data
      const totalDue = Math.max(0, Number(student?.pendingFee ?? student?.pending_fee ?? (Number(student?.totalFee || student?.total_fee || 0) - Number(student?.paidFee || student?.paid_fee || 0))));
      const prevDue = Math.max(0, totalDue - monthlyFee);
      const currFee = monthlyFee;
      const paidThisMonth = totalDue < monthlyFee ? Math.max(0, monthlyFee - totalDue) : 0;

      return {
        studentId: student?.student_id || student?.id || studentId,
        rollNo: student?.roll_no || student?.rollNo || '',
        studentName: student?.name || 'Student',
        className: student?.className || student?.class_name || '',
        billingMonth: getIndiaMonthKey(),
        billing_month: getIndiaMonthKey(),
        previousDue: prevDue,
        currentMonthFee: currFee,
        totalDue: totalDue,
        paidThisMonth: paidThisMonth
      };
    },
    async saveFeeAccounts(accounts) {
      this._feeAccountsCache = accounts;
      this.safeSetItem('pragyan_db_fee_accounts_master', accounts);
      this.markMutation();
    },
    getAdmins() {
      if (this._adminsCache) return this._adminsCache;
      let admins = [];
      try {
        admins = JSON.parse(localStorage.getItem(STORAGE_KEY_ADMINS) || '[]');
      } catch (e) { admins = []; }
      this._adminsCache = Array.isArray(admins) ? admins : [];
      return this._adminsCache;
    },
    async saveAdmins(admins) {
      const sanitized = (admins || []).map(a => {
        const clean = { ...a };
        delete clean.password;
        delete clean.password_hash;
        delete clean.passcode;
        return clean;
      });
      this._adminsCache = sanitized;
      localStorage.setItem(STORAGE_KEY_ADMINS, JSON.stringify(sanitized));
      this.markMutation();

      try {
        if (Array.isArray(admins) && admins.length > 0) {
          const supaPayload = admins.map(a => ({
            admin_id: a.admin_id || a.id || a.username || 'ADM-01',
            username: a.username || 'chandan',
            name: a.name || 'Chandan Kumar',
            role: a.role || 'Managing Director',
            mobile: a.mobile || '7369891858',
            email: a.email || 'chandan@pragyaninstitute.com',
            upi_id: a.upiId || a.upi_id || "",
            photo_url: a.photoUrl || a.photo_url || ''
          }));
          if (typeof SupabaseSync !== 'undefined' && SupabaseSync.mutate) {
            const currentId = this.currentUser?.admin_id || this.currentUser?.id || this.currentUser?.username || 'ADM-01';
            const current = supaPayload.find(a => a.admin_id === currentId || a.username === currentId) || supaPayload[0];
            if (!current) return;
            const r = await SupabaseSync.mutate('admins', 'update', current, { where: { admin_id: current.admin_id } });
            if (!r?.success) console.warn('saveAdmins write failed:', r?.error);
          }
        }
      } catch(e) { console.warn('saveAdmins Supabase error:', e); }
    },
    getAdmin() {
      const admins = this.getAdmins();
      if (this.currentUser && this.currentUser.id) {
        const found = admins.find(a => a.id === this.currentUser.id);
        if (found) return found;
      }
      return admins[0] || { name: 'CHANDAN KUMAR', role: 'Managing Director & Science Lead (Head of Institute)' };
    },
    getNotices() {
      if (this._noticesCache) return this._noticesCache;
      try {
        this._noticesCache = JSON.parse(localStorage.getItem(STORAGE_KEY_NOTICES) || '[]');
      } catch (e) { this._noticesCache = []; }
      return this._noticesCache;
    },
    async saveNotices(notices) {
      this._noticesCache = notices;
      localStorage.setItem(STORAGE_KEY_NOTICES, JSON.stringify(notices));
      this.markMutation();

      try {
        if (Array.isArray(notices) && notices.length > 0 && typeof SupabaseSync !== 'undefined' && SupabaseSync.mutate) {
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          const generateUUID = () => {
            if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
              const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
              return v.toString(16);
            });
          };

          // H2: Assign deterministic UUID & track _local_id before saving so local and remote IDs match 100%
          notices.forEach((n, idx) => {
            n._local_id = n._local_id || n.id || `local_notice_${idx}_${Date.now()}`;
            if (!n.id || !uuidRegex.test(n.id)) {
              n._old_id = n.id;
              n.id = generateUUID();
            }
          });
          localStorage.setItem(STORAGE_KEY_NOTICES, JSON.stringify(notices));

          const supaPayload = notices.map(n => ({
            id: n.id,
            title: n.title || 'Announcement',
            category: n.category || 'general',
            message: n.message || '',
            target_batch: n.targetBatch || n.target_batch || 'All Batches',
            attachment_url: n.attachmentUrl || n.attachment_url || '',
            created_at: n.date ? new Date(n.date).toISOString() : new Date().toISOString(),
            idempotency_key: n.id
          }));

          const r = await SupabaseSync.mutate('notices', 'upsert', supaPayload, { conflict: 'id' });
          if (!r?.success) console.warn('saveNotices upsert failed:', r?.error);
          else if (Array.isArray(r.data)) {
            // Map returned IDs by _local_id or id, never relying on array index
            const retMap = new Map();
            r.data.forEach(item => {
              if (item._local_id) retMap.set(item._local_id, item.id);
              if (item.id) retMap.set(item.id, item.id);
            });
            notices.forEach(n => {
              if (n._local_id && retMap.has(n._local_id)) {
                n.id = retMap.get(n._local_id);
              }
            });
            localStorage.setItem(STORAGE_KEY_NOTICES, JSON.stringify(notices));
          }
        }
      } catch(e) { console.warn('saveNotices Supabase error:', e); }
    },
    getBatches() {
      if (this._batchesCache) return this._batchesCache;
      let batches = null;
      try {
        const raw = localStorage.getItem(STORAGE_KEY_BATCHES) || localStorage.getItem('pragyan_db_batches_master');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) batches = parsed;
        }
      } catch(e) { batches = null; }

      if (!batches) {
        batches = canonicalBatchCards().map(c => batchRow(ACADEMIC.BATCH_BY_ID[c.key], {}));
        this.safeSetItem(STORAGE_KEY_BATCHES, batches);
        this.safeSetItem('pragyan_db_batches_master', batches);
      } else {
        const byId = new Map();
        const ordered = [];
        batches.forEach(b => {
          if (!b || typeof b !== 'object') return;
          const rawName = b.name || b.className || b.batch_name || b.batchName || '';
          const batchId = getBatchCategoryKey(b.batch_id || b.id || rawName);
          const canonical = ACADEMIC && ACADEMIC.BATCH_BY_ID[batchId];
          const bKey = canonical ? canonical.batchId : String(b.batch_id || b.id || rawName || 'BAT-UNKNOWN').toUpperCase();
          if (byId.has(bKey)) return;
          const row = canonical ? batchRow(canonical, b) : {
            ...b,
            id: bKey,
            batch_id: bKey,
            name: rawName || 'General Batch',
            className: rawName || 'General Batch',
            batchName: rawName || 'General Batch',
            batch_name: rawName || 'General Batch',
            monthlyFee: Number(b.monthlyFee ?? b.monthly_fee ?? 0),
            monthly_fee: Number(b.monthlyFee ?? b.monthly_fee ?? 0),
            timing: b.timing || b.timings || 'Mon – Sat: As per timetable',
            timings: b.timing || b.timings || 'Mon – Sat: As per timetable',
            room: b.room || b.room_no || 'As allotted',
            teacher: b.teacher || (Array.isArray(b.teachers) ? b.teachers.join(' & ') : 'Faculty Mentors'),
            badge: b.badge || '📚 Batch',
            icon: '📚'
          };
          byId.set(bKey, row);
          ordered.push(row);
        });
        batches = ordered;
      }
      this._batchesCache = batches;
      return batches;
    },
    async saveBatches(batches) {
      this._batchesCache = batches;
      localStorage.setItem(STORAGE_KEY_BATCHES, JSON.stringify(batches));
      localStorage.setItem('pragyan_db_batches_master', JSON.stringify(batches));
      this.markMutation();

      try {
        if (Array.isArray(batches) && batches.length > 0) {
          const supaPayload = batches.map(b => {
            const bId = b.batchId || b.id || b.batch_id;
            const name = b.name || b.batch_name || b.batchName || b.className || '';
            const className = b.className || b.class_name || b.name || '';
            const fee = Number.isFinite(Number(b.monthlyFee ?? b.monthly_fee)) ? Number(b.monthlyFee ?? b.monthly_fee) : classMonthlyFee(bId || name || '');
            const rawTeachers = Array.isArray(b.teachers) ? b.teachers : (b.teacher ? b.teacher.split(/[&,]/).map(t => t.trim()).filter(Boolean) : ['Chandan Kumar']);
            const rawSubjects = Array.isArray(b.subjects) ? b.subjects : (b.subject ? [b.subject] : []);

            return {
              batch_id: bId,
              name: name,
              class_name: className,
              stream: b.stream || '',
              monthly_fee: fee,
              annual_fee: Number.isFinite(Number(b.annualFee ?? b.annual_fee)) ? Number(b.annualFee ?? b.annual_fee) : cfgAnnual(fee),
              billing_day: Number(b.billingDay ?? b.billing_day ?? 1),
              timing: b.timing || b.timings || '',
              room: b.room || b.room_no || '',
              teachers: rawTeachers,
              subjects: rawSubjects,
              capacity: Number(b.capacity || 40),
              tagline: b.tagline || b.badge || '',
              status: b.status || 'Active'
            };
          });
          if (typeof SupabaseSync !== 'undefined' && SupabaseSync.mutate) {
            const r = await SupabaseSync.mutate('batches', 'upsert', supaPayload, { conflict: 'batch_id' });
            if (!r?.success) console.warn('saveBatches write failed:', r?.error);
          }
        }
      } catch(e) { console.warn('saveBatches Supabase error:', e); }
    },
    invalidateCaches() {
      this._studentsCache = null;
      this._noticesCache = null;
      this._batchesCache = null;
      this._requestsCache = null;
      this._adminsCache = null;
      this._auditLogsCache = null;
      this._classSchedulesCache = null;
      this._instituteHolidaysCache = null;
    },

    getClassSchedules() {
      // BUG-09: an explicit empty dataset (admin deleted everything, or cloud
      // sync wrote []) is a VALID state and must never trigger re-seeding.
      // Canonical defaults are seeded ONLY when the storage key has never
      // existed (clean first install).
      if (Array.isArray(this._classSchedulesCache)) {
        return this._classSchedulesCache;
      }
      try {
        const raw = localStorage.getItem(STORAGE_KEY_SCHEDULES);
        if (raw !== null) {
          const parsed = JSON.parse(raw);
          this._classSchedulesCache = Array.isArray(parsed) ? parsed : [];
          return this._classSchedulesCache;
        }
      } catch (e) {
        this._classSchedulesCache = [];
        return this._classSchedulesCache;
      }

      // Seed initial canonical schedule for all batches Mon-Sat
      const initialSchedules = [];
      const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const batchMap = (typeof BATCH_SUBJECTS !== 'undefined' && BATCH_SUBJECTS) ? BATCH_SUBJECTS : {
        'BAT-10': ['Science (Physics & Chemistry)', 'Mathematics', 'Special English'],
        'BAT-09': ['Foundation Science', 'Foundation Mathematics', 'English Language'],
        'BAT-08': ['Comprehensive Science', 'General Mathematics', 'English Grammar'],
        'BAT-11PCM': ['Higher Physics', 'Physical & Organic Chemistry', 'Higher Mathematics'],
        'BAT-11PCB': ['Higher Physics', 'Physical & Organic Chemistry', 'Advanced Biology'],
        'BAT-12PCM': ['Advanced Physics (Board + JEE)', 'Chemistry Comprehensive', 'Higher Mathematics Core'],
        'BAT-12PCB': ['Advanced Physics (Board + NEET)', 'Chemistry Comprehensive', 'Botany & Zoology (NEET)'],
        'BAT-ENG': ['Spoken English & Public Speaking', 'Functional Grammar & Writing', 'Vocabulary & Comprehension'],
        'BAT-06': ['Junior Science & Discovery', 'Junior Mathematics', 'Communicative English'],
        'BAT-07': ['Middle Science', 'Middle Mathematics', 'English Composition'],
        'BAT-1TO5': ['Fundamental Mathematics', 'Environmental Studies (EVS)', 'English Reading & Writing']
      };

      const batchIds = Object.keys(batchMap);
      const slotMap = (typeof BATCH_SLOTS !== 'undefined' && BATCH_SLOTS) ? BATCH_SLOTS : {};
      const cfg = academicConfig();

      batchIds.forEach(batchId => {
        const subjects = batchMap[batchId] || ['Science', 'Mathematics', 'English'];
        const slots = slotMap[batchId] || ['04:00 PM – 05:00 PM', '05:00 PM – 06:00 PM', '06:00 PM – 07:00 PM'];
        const batchObj = cfg?.resolveBatch ? cfg.resolveBatch(batchId) : null;
        const teachers = batchObj?.teachers ? batchObj.teachers.map(titleCaseName) : ['Prof. Ravi Ranjan', 'Chandan Kumar'];

        days.forEach(day => {
          subjects.forEach((subj, idx) => {
            const timeStr = slots[idx] || '04:00 PM – 05:00 PM';
            const parts = timeStr.split(/[–-]/).map(t => t.trim());
            const startTime = parts[0] || '04:00 PM';
            const endTime = parts[1] || '05:00 PM';
            const teacher = teachers[idx % teachers.length] || 'Faculty Mentors';

            initialSchedules.push({
              id: `SCHED-${batchId}-${day.slice(0,3).toUpperCase()}-${idx+1}`,
              batch_id: batchId,
              day_of_week: day,
              subject: subj,
              start_time: startTime,
              end_time: endTime,
              teacher: teacher,
              room: 'Classroom ' + ((idx % 3) + 1),
              is_cancelled: false,
              sort_order: idx + 1
            });
          });
        });
      });

      this._classSchedulesCache = initialSchedules;
      this.safeSetItem(STORAGE_KEY_SCHEDULES, initialSchedules);
      return Array.isArray(this._classSchedulesCache) ? this._classSchedulesCache : [];
    },

    async saveClassSchedules(schedules) {
      const safeSchedules = Array.isArray(schedules) ? schedules : [];
      this._classSchedulesCache = safeSchedules;
      this.safeSetItem(STORAGE_KEY_SCHEDULES, safeSchedules);
      this.markMutation();
      try {
        if (typeof SupabaseSync !== 'undefined' && SupabaseSync.mutate && safeSchedules.length > 0) {
          const payload = safeSchedules.map(s => ({
            id: String(s.id || `SCHED-${s.batch_id || s.batchId || 'BAT-10'}-${(s.day_of_week || s.dayOfWeek || 'MON').slice(0,3).toUpperCase()}-${s.sort_order || s.sortOrder || 1}`),
            batch_id: s.batch_id || s.batchId || 'BAT-10',
            day_of_week: s.day_of_week || s.dayOfWeek || 'Monday',
            subject: s.subject || 'Lecture',
            start_time: s.start_time || s.startTime || '04:00 PM',
            end_time: s.end_time || s.endTime || '05:00 PM',
            teacher: s.teacher || 'Faculty',
            room: s.room || 'Classroom 1',
            is_cancelled: !!(s.is_cancelled || s.isCancelled),
            sort_order: Number(s.sort_order || s.sortOrder) || 1
          }));
          const r = await SupabaseSync.mutate('class_schedules', 'upsert', payload, { conflict: 'id' });
          if (!r?.success) console.warn('saveClassSchedules cloud write note:', r?.error);
        }
      } catch (e) {
        console.warn('saveClassSchedules error:', e);
      }
    },

    isRecurringWeekly(batchId) {
      if (!batchId) return true;
      const bKey = (typeof getBatchCategoryKey === 'function' ? getBatchCategoryKey(batchId) : '') || String(batchId).toUpperCase();
      try {
        const val = localStorage.getItem('pragyan_recurring_week_' + bKey);
        if (val !== null) return val === 'true';
        const globalVal = localStorage.getItem('pragyan_recurring_week_global');
        if (globalVal !== null) return globalVal === 'true';
      } catch (e) {}
      return true;
    },

    setRecurringWeekly(batchId, isActive) {
      const bKey = (typeof getBatchCategoryKey === 'function' ? getBatchCategoryKey(batchId) : '') || String(batchId).toUpperCase();
      try {
        localStorage.setItem('pragyan_recurring_week_' + bKey, isActive ? 'true' : 'false');
        localStorage.setItem('pragyan_recurring_week_global', isActive ? 'true' : 'false');
      } catch (e) {}
    },

    getInstituteHolidays() {
      if (Array.isArray(this._instituteHolidaysCache)) return this._instituteHolidaysCache;
      try {
        const raw = localStorage.getItem(STORAGE_KEY_HOLIDAYS);
        const parsed = raw ? JSON.parse(raw) : [];
        this._instituteHolidaysCache = Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        this._instituteHolidaysCache = [];
      }
      return Array.isArray(this._instituteHolidaysCache) ? this._instituteHolidaysCache : [];
    },

    async saveInstituteHolidays(holidays) {
      const safeHolidays = Array.isArray(holidays) ? holidays : [];
      this._instituteHolidaysCache = safeHolidays;
      this.safeSetItem(STORAGE_KEY_HOLIDAYS, safeHolidays);
      this.markMutation();
      try {
        if (typeof SupabaseSync !== 'undefined' && SupabaseSync.mutate && safeHolidays.length > 0) {
          const payload = safeHolidays.map(h => ({
            id: String(h.id || `HOL-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
            title: h.title || 'Holiday',
            start_date: h.start_date || h.startDate || new Date().toISOString().split('T')[0],
            end_date: h.end_date || h.endDate || new Date().toISOString().split('T')[0],
            target_batch: h.target_batch || h.targetBatch || 'ALL',
            description: h.description || ''
          }));
          const r = await SupabaseSync.mutate('institute_holidays', 'upsert', payload, { conflict: 'id' });
          if (!r?.success) console.warn('saveInstituteHolidays cloud write note:', r?.error);
        }
      } catch (e) {
        console.warn('saveInstituteHolidays error:', e);
      }
    },

    getRequests() {
      if (this._requestsCache) return this._requestsCache;
      try {
        this._requestsCache = JSON.parse(localStorage.getItem(STORAGE_KEY_REQUESTS) || '[]');
      } catch (e) { this._requestsCache = []; }
      return this._requestsCache;
    },
    async saveRequests(reqs) {
      this._requestsCache = reqs;
      localStorage.setItem(STORAGE_KEY_REQUESTS, JSON.stringify(reqs));
      this.markMutation();

try {
if (Array.isArray(reqs) && reqs.length > 0) {
const currentId = this.currentUser?.id || this.currentUser?.student_id || this.currentUser?.rollNo || '';
// Rows the server already created (via /api/payment-request) must NOT be
// pushed again — a student-session re-insert would just 409.
const pushableReqs = reqs.filter(r => !r._serverCreated);
const supaPayload = pushableReqs.map(r => ({
            request_id: r.id || r.request_id,
            student_id: r.studentId || r.student_id || currentId,
            student_name: r.studentName || r.student_name || this.currentUser?.name || '',
            roll_no: r.rollNo || r.roll_no || this.currentUser?.rollNo || '',
            class_name: r.className || r.class_name || this.currentUser?.className || '',
            req_type: (r.type === 'payment' || r.paymentDetails || r.req_type === 'PAYMENT_VERIFICATION') ? 'PAYMENT_VERIFICATION' : 'PROFILE_UPDATE',
            status: r.status || 'Pending',
            request_date: r.date || r.request_date || new Date().toISOString().split('T')[0],
            old_data: r.oldData || r.old_data || null,
            new_data: r.newData || r.new_data || (r.paymentDetails ? { paymentDetails: r.paymentDetails } : null)
          }));

          if (supaPayload.length > 0 && typeof SupabaseSync !== 'undefined' && SupabaseSync.mutate) {
            // Student sessions may only INSERT requests (the gateway forbids
            // upsert: its conflict-target write ignores WHERE and could let a
            // crafted request_id overwrite another student's pending row).
            const isStudentSession = SupabaseSync.sessionRole === 'student';
            const op = isStudentSession ? 'insert' : 'upsert';
            const payload = isStudentSession
              ? supaPayload.filter(r => r.status === 'Pending')
              : supaPayload;
            const r2 = await SupabaseSync.mutate('student_requests', op, payload,
              op === 'upsert' ? { conflict: 'request_id' } : {});
            if (!r2?.success) console.warn(`saveRequests ${op} failed:`, r2?.error);
          }
        }
      } catch(e) { console.warn('saveRequests Supabase error:', e); }
    },
    getCommunityMessages() {
      let msgs = [];
      try {
        msgs = JSON.parse(localStorage.getItem('pragyan_community_messages') || '[]');
      } catch(e) {}
      if (!Array.isArray(msgs) || msgs.length === 0) {
        msgs = [
          {
            id: 'MSG-INIT-01',
            senderId: 'ADM-01',
            senderName: 'CHANDAN KUMAR',
            senderRole: 'Managing Director & Head of Institute',
            avatar: '👨‍🏫',
            isAdmin: true,
            text: '🎉 Welcome all students & faculty to the official Pragyan Institute Community Forum! You can ask questions, discuss subjects, and get live updates here.',
            timestamp: getFormattedTimestamp(),
            isPinned: true,
            pinnedBy: 'CHANDAN KUMAR',
            pinnedAt: getFormattedTimestamp(),
            attachment: null,
            replies: [
              {
                id: 'REP-01',
                senderId: 'STU-1001',
                senderName: 'Rohan Sharma',
                senderRole: 'Student (Class 10th)',
                avatar: '🎓',
                text: 'Thank you Sir! Excited for the board preparation sessions.',
                timestamp: getFormattedTimestamp()
              }
            ]
          }
        ];
        localStorage.setItem('pragyan_community_messages', JSON.stringify(msgs));
      }
      return msgs;
    },
    saveCommunityMessages(msgs) {
      localStorage.setItem('pragyan_community_messages', JSON.stringify(msgs));
      this.markMutation();
    },
    getAuditLogs() {
      if (this._auditLogsCache) return this._auditLogsCache;
      try {
        this._auditLogsCache = JSON.parse(localStorage.getItem(STORAGE_KEY_AUDIT_LOGS) || '[]');
      } catch (e) { this._auditLogsCache = []; }
      return this._auditLogsCache;
    },
    async saveAuditLogs(logs) {  // BUG-1 fix: async
      this._auditLogsCache = logs;
      localStorage.setItem(STORAGE_KEY_AUDIT_LOGS, JSON.stringify(logs));
      this.markMutation();

      try {
        if (Array.isArray(logs) && logs.length > 0) {
          const supaPayload = logs.map(a => ({
            log_id: a.id,
            timestamp: a.timestamp || getFormattedTimestamp(),
            actor: a.actor || 'Admin',
            action_type: a.actionType || 'GENERAL_ACTION',
            student_name: a.studentName || 'System',
            student_roll: a.studentRoll || 'N/A',
            description: a.description || '',
            details: a.details || null
          }));
          if (typeof SupabaseSync !== 'undefined' && SupabaseSync.mutate) {
            const r = await SupabaseSync.mutate('audit_logs', 'upsert', supaPayload, { conflict: 'log_id' });
            if (!r?.success) console.warn('saveAuditLogs write failed:', r?.error);
          }
        }
      } catch(e) { console.warn('saveAuditLogs Supabase error:', e); }
    },
    async clearAllAuditLogs() {
      this._auditLogsCache = [];
      localStorage.setItem(STORAGE_KEY_AUDIT_LOGS, '[]');
      this.markMutation();

      try {
        if (typeof SupabaseSync !== 'undefined' && SupabaseSync.mutate) {
          const r = await SupabaseSync.mutate('audit_logs', 'delete', null, { all: true });
          if (!r?.success) console.warn('clearAllAuditLogs database delete note:', r?.error);
        }
      } catch(e) { console.warn('clearAllAuditLogs Supabase error:', e); }

      return true;
    },
    async addAuditLog(actor, actionType, studentName, studentRoll, description, details = {}) {
      const logs = this.getAuditLogs();
      logs.unshift({
        id: `AUD-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,5)}`,
        timestamp: getFormattedTimestamp(),
        date: new Date().toISOString().split('T')[0],
        actor: actor || (this.currentUser?.name || 'CHANDAN KUMAR (Director & Science Lead)'),
        actionType: actionType,
        studentName: studentName || 'System',
        studentRoll: studentRoll || 'N/A',
        description: description,
        details: details
      });
      // BUG-M fix: return the promise so callers that await it get proper chaining
      return this.saveAuditLogs(logs);
    },
    async updateStudentPassword(newPassword) {
      if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length < 4) {
        throw new Error('Password must be at least 4 characters long.');
      }
      const cleanPassword = newPassword.trim();
      const current = this.currentUser;
      if (!current) throw new Error('No active student session.');

      const sId = current.student_id || current.id || current.rollNo;
      const rollNo = current.rollNo || current.roll_no || sId;
      const sName = current.name || 'Student';
      const sClass = current.className || current.class_name || 'General';

      // 1. Send to server API with full error propagation
      const token = sessionStorage.getItem('pragyan_portal_token') || localStorage.getItem('pragyan_portal_token');
      if (token) {
        const apiBase = (typeof window !== 'undefined' && window.PRAGYAN_API_BASE) ? window.PRAGYAN_API_BASE : '';
        const res = await fetch(`${apiBase}/api/student-password`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ newPassword: cleanPassword })
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Server password update failed (${res.status})`);
        }
        const data = await res.json().catch(() => ({}));
        console.log('Server student password update success:', data);
      }

      // 2. Direct Supabase / local requests upsert
      const reqs = this.getRequests();
      const existingIdx = reqs.findIndex(r => 
        (r.req_type === 'PASSWORD_UPDATE' || r.type === 'PASSWORD_UPDATE') &&
        (r.studentId === sId || r.student_id === sId || r.rollNo === rollNo || r.roll_no === rollNo)
      );

      const reqId = existingIdx >= 0 ? (reqs[existingIdx].id || reqs[existingIdx].request_id) : `PWD-${Date.now().toString(36)}`;
      const reqObj = {
        id: reqId,
        request_id: reqId,
        studentId: sId,
        student_id: sId,
        studentName: sName,
        student_name: sName,
        rollNo: rollNo,
        roll_no: rollNo,
        className: sClass,
        class_name: sClass,
        req_type: 'PASSWORD_UPDATE',
        type: 'PASSWORD_UPDATE',
        status: 'Active',
        date: new Date().toISOString().split('T')[0],
        request_date: new Date().toISOString().split('T')[0],
        oldData: {},
        old_data: {},
        newData: { password_updated: true, updated_at: new Date().toISOString(), updated_by: 'student' },
        new_data: { password_updated: true, updated_at: new Date().toISOString(), updated_by: 'student' }
      };

      if (existingIdx >= 0) {
        reqs[existingIdx] = reqObj;
      } else {
        reqs.unshift(reqObj);
      }

      await this.saveRequests(reqs);

      // 3. Update local student custom password
      const students = this.getStudents();
      const stu = students.find(s => s.id === sId || s.student_id === sId || s.rollNo === rollNo);
      if (stu) {
        stu.customPassword = cleanPassword;
        await this.saveStudents(students);
      }

      return { success: true, message: 'Password updated successfully!' };
    },
    async resetStudentPasswordToDob(studentId) {
      if (!studentId) throw new Error('Student ID is required.');
      const students = this.getStudents();
      const target = students.find(s => s.id === studentId || s.student_id === studentId || s.rollNo === studentId);
      if (!target) throw new Error('Student not found.');

      const sId = target.student_id || target.id;
      const rollNo = target.rollNo || target.roll_no || sId;
      const teacherName = getActiveTeacherName();

      // 1. Send to server API if available
      try {
        const token = sessionStorage.getItem('pragyan_portal_token') || localStorage.getItem('pragyan_portal_token');
        if (token) {
          const apiBase = (typeof window !== 'undefined' && window.PRAGYAN_API_BASE) ? window.PRAGYAN_API_BASE : '';
          const res = await fetch(`${apiBase}/api/student-password`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ studentId: sId, resetToDob: true })
          });
          if (res.ok) {
            const data = await res.json().catch(() => ({}));
            console.log('Server student password reset success:', data);
          }
        }
      } catch (err) {
        console.warn('Server password reset note:', err);
      }

      // 2. Direct Supabase / local requests update to RESET_TO_DOB
      const reqs = this.getRequests();
      reqs.forEach(r => {
        if ((r.req_type === 'PASSWORD_UPDATE' || r.type === 'PASSWORD_UPDATE') &&
            (r.studentId === sId || r.student_id === sId || r.rollNo === rollNo || r.roll_no === rollNo)) {
          r.status = 'RESET_TO_DOB';
          r.newData = { password: null, reset_to_dob: true, reset_at: new Date().toISOString(), reset_by: teacherName };
          r.new_data = { password: null, reset_to_dob: true, reset_at: new Date().toISOString(), reset_by: teacherName };
        }
      });
      await this.saveRequests(reqs);

      // 3. Clear local customPassword on student
      delete target.customPassword;
      await this.saveStudents(students);

      // 4. Record in audit ledger
      await this.addAuditLog(teacherName, 'STUDENT_PASSWORD_RESET', target.name, target.rollNo, `Reset student portal password to official Date of Birth (${target.dob}) for ${target.name}`, { studentId: sId, dob: target.dob });

      return { success: true, dob: target.dob, message: `Password for ${target.name} has been reset to Date of Birth (${target.dob}).` };
    },
    /**
     * Report this month's billing status. Does NOT bill.
     *
     * This used to be a full second billing engine running in every browser that
     * opened the portal, and it carried four defects that each cost a family real
     * money:
     *
     *   1. Its idempotency key was `fee_<SID>_<YYYY-MM>`. The server's is
     *      `BILL-<SID>-<YYYY-MM>` (apply_monthly_fee, supabase_production_hardening.sql).
     *      The two keys never collide, so the cron's charge and the browser's charge
     *      both landed: every student who opened the portal after the cron ran was
     *      billed twice for the same month.
     *
     *   2. `s.pendingFee = prevDue + monthlyFee` read prevDue out of a localStorage
     *      cache with no lock. Two admins with the dashboard open on the 1st each
     *      read the same prevDue and each wrote their own sum back.
     *
     *   3. It pushed the ledger row, the student balance and the receipt as three
     *      separate unchecked mutations. SupabaseSync.mutate returns its failures
     *      rather than throwing, so the `catch` around them was dead code. If the
     *      ledger upsert landed and the balance update did not, the student was
     *      marked billed and never charged — permanently, because the ledger row
     *      then satisfies the alreadyBilled check for that month.
     *
     *   4. It ran from DOMContentLoaded on the student dashboard too, so a student
     *      opening their own portal on the 1st billed themselves.
     *
     * Billing is server-owned: api/cron-monthly-fees.js on the staggered day-1-to-10
     * schedule, and api/admin-trigger-billing.js for a manual run. Both call
     * apply_monthly_fee, which takes `FOR UPDATE` on the student row and dedupes on
     * the composite key. What remains here is the read-only half — tell the operator
     * whether the month has been billed, and never write.
     */
    async checkAndAccrueMonthlyFees() {
      const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' })
        .formatToParts(new Date())
        .reduce((all, part) => ({ ...all, [part.type]: part.value }), {});
      const currentMonthKey = `${parts.year}-${parts.month}`;

      const students = this.getStudents();
      if (!students || students.length === 0) {
        return { checked: 0, accrued: 0, billedThisMonth: 0, unbilled: 0, month: currentMonthKey, serverOwned: true };
      }

      const activeStudents = students.filter(s => !s.status || s.status.toLowerCase() === 'active');
      const ledger = this.getBillingLedger() || [];

      // Accept either idempotency key so a month billed by the current server path
      // and a month billed by the retired browser path both read as billed.
      const billedIds = new Set();
      ledger.forEach(l => {
        const month = l.billing_month || l.billingMonth || '';
        if (month !== currentMonthKey) return;
        const sid = (l.student_id || l.studentId || '').toString().trim().toLowerCase();
        if (sid) billedIds.add(sid);
        const key = (l.idempotency_key || l.idempotencyKey || '').toString().trim().toUpperCase();
        const match = key.match(/^(?:BILL-|FEE_)(.+?)[-_]\d{4}-\d{2}$/);
        if (match) billedIds.add(match[1].toLowerCase());
      });

      let unbilled = 0;
      activeStudents.forEach(s => {
        const sId = (s.student_id || s.id || s.rollNo || '').toString().trim().toLowerCase();
        const sRoll = (s.rollNo || s.roll_no || '').toString().trim().toLowerCase();
        if (!billedIds.has(sId) && !(sRoll && billedIds.has(sRoll))) unbilled++;
      });

      if (unbilled > 0) {
        console.info(`[Billing] ${unbilled} of ${activeStudents.length} active students have no ${currentMonthKey} ledger row. Billing is server-side — use the dashboard's billing action, which calls apply_monthly_fee.`);
      }

      return {
        checked: activeStudents.length,
        accrued: 0,
        billedThisMonth: activeStudents.length - unbilled,
        unbilled,
        month: currentMonthKey,
        serverOwned: true
      };
    }
  };

  if (typeof window !== 'undefined') {
    window.AppState = AppState;
  }

  function isStudentRequestMatch(req, student) {
    if (!req || !student) return false;
    const sId = (student.id || student.student_id || '').toString().trim().toLowerCase();
    const sRoll = (student.rollNo || student.roll_no || '').toString().trim().toLowerCase();
    const sMob = (student.mobile || student.guardianMobile || '').toString().trim().slice(-10);

    const rTarget = (req.studentId || req.student_id || '').toString().trim().toLowerCase();
    const rRoll = (req.rollNo || req.roll_no || '').toString().trim().toLowerCase();
    const rMob = (req.oldData?.mobile || req.newData?.mobile || req.old_data?.mobile || req.new_data?.mobile || '').toString().trim().slice(-10);

    if (sId && (rTarget === sId || rRoll === sId)) return true;
    if (sRoll && (rTarget === sRoll || rRoll === sRoll)) return true;
    if (sMob && rMob && sMob.length >= 10 && sMob === rMob) return true;
    return false;
  }

  // DOM Elements Selector Cache
  let portalOverlay, portalCloseBtn, loginViewContainer, studentDashboardContainer, adminDashboardContainer;
  let loginRoleStudentBtn, loginRoleAdminBtn, loginForm, loginMobileInput, loginDobInput, loginErrorMsg;

  document.addEventListener('DOMContentLoaded', () => {
    initDatabase();
    bindDOMElements();
    setupEventListeners();
    checkExistingSession();
    // Read-only billing reconciliation. This used to run a full billing engine in
    // the browser on every page load — including a student's own dashboard.
    AppState.checkAndAccrueMonthlyFees().catch(e => console.warn('[Billing status check]', e));
    if (typeof SupabaseSync !== 'undefined' && SupabaseSync.init) {
      SupabaseSync.init();
    }

    if (typeof SupabaseSync !== 'undefined' && SupabaseSync.onChange) {
      const debouncedRenderSync = debounce(() => {
        const activeEl = document.activeElement;
        const isUserTyping = activeEl && (
          activeEl.tagName === 'INPUT' || 
          activeEl.tagName === 'TEXTAREA' || 
          activeEl.tagName === 'SELECT' || 
          activeEl.isContentEditable ||
          (activeEl.id && activeEl.id.includes('stream')) ||
          (activeEl.className && String(activeEl.className).includes('stream'))
        );

        if (!isUserTyping) {
          const overlay = document.getElementById('portalOverlay') || portalOverlay;
          const isPortalOpen = overlay && (overlay.classList.contains('active') || overlay.style.display === 'flex');
          if (isPortalOpen) {
            if (AppState.currentRole === 'admin') {
              if (AppState.activeAdminTab !== 'community' && typeof renderAdminDashboard === 'function') {
                renderAdminDashboard();
              }
            } else if (AppState.currentRole === 'student') {
              if (AppState.activeStudentTab !== 'community' && typeof renderStudentDashboard === 'function') {
                renderStudentDashboard();
              }
            }
          }
        }
      }, 500);

      SupabaseSync.onChange((event, data) => {
        console.log('⚡ SupabaseSync live change event received in UI:', event);
        AppState.invalidateCaches();
        if (AppState.currentUser) {
          const sId = (AppState.currentUser.id || AppState.currentUser.student_id || '').toString().toLowerCase();
          const sRoll = (AppState.currentUser.rollNo || AppState.currentUser.roll_no || '').toString().toLowerCase();
          if (AppState.currentRole === 'student') {
            const freshStudent = AppState.getStudents().find(s => {
              const rId = (s.id || s.student_id || '').toString().toLowerCase();
              const rRoll = (s.rollNo || s.roll_no || '').toString().toLowerCase();
              return (sId && (rId === sId || rRoll === sId)) || (sRoll && (rRoll === sRoll || rId === sRoll));
            });
            if (freshStudent) {
              AppState.currentUser = freshStudent;
              saveSession('student', freshStudent);
            }
          } else if (AppState.currentRole === 'admin') {
            const adminId = (AppState.currentUser.id || AppState.currentUser.admin_id || AppState.currentUser.username || '').toString().toLowerCase();
            const freshAdmin = AppState.getAdmins().find(a => {
              const aId = (a.id || a.admin_id || a.username || '').toString().toLowerCase();
              return adminId && aId === adminId;
            });
            if (freshAdmin) {
              AppState.currentUser = freshAdmin;
              saveSession('admin', freshAdmin);
            }
          }
        }
        debouncedRenderSync();
      });
    }
  });

  function bindDOMElements() {
    portalOverlay = document.getElementById('portalOverlay');
    portalCloseBtn = document.getElementById('portalCloseBtn');
    loginViewContainer = document.getElementById('loginViewContainer');
    studentDashboardContainer = document.getElementById('studentDashboardContainer');
    adminDashboardContainer = document.getElementById('adminDashboardContainer');

    loginRoleStudentBtn = document.getElementById('loginRoleStudentBtn');
    loginRoleAdminBtn = document.getElementById('loginRoleAdminBtn');
    loginForm = document.getElementById('portalLoginForm');
    loginMobileInput = document.getElementById('portalMobileInput');
    loginDobInput = document.getElementById('portalDobInput');
    loginErrorMsg = document.getElementById('loginErrorMsg');
  }

  function setupEventListeners() {
    // Open Portal Buttons (Nav, Drawer, Hero)
    document.querySelectorAll('.open-portal-trigger').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const tab = btn.dataset.portalTab || btn.dataset.tab;
        openPortal(tab);
      });
    });

    // Close Portal Button
    portalCloseBtn?.addEventListener('click', closePortal);

    // Role Switcher Tabs (Student vs Admin)
    loginRoleStudentBtn?.addEventListener('click', () => switchLoginRole('student'));
    loginRoleAdminBtn?.addEventListener('click', () => switchLoginRole('admin'));

    // Login Form Submit (No OTP required!)
    loginForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      handleLoginSubmit();
    });

    // Logout Buttons
    document.addEventListener('click', (e) => {
      if (e.target.closest('.btn-logout')) {
        handleLogout();
      }
    });

    // Student Dashboard Tab Buttons
    document.addEventListener('click', (e) => {
      const tabBtn = e.target.closest('.student-tab-btn');
      if (tabBtn) {
        const targetTab = tabBtn.dataset.tab;
        switchStudentTab(targetTab);
      }
    });

    // Admin Dashboard Tab Buttons
    document.addEventListener('click', (e) => {
      const tabBtn = e.target.closest('.admin-tab-btn');
      if (tabBtn) {
        const targetTab = tabBtn.dataset.tab;
        switchAdminTab(targetTab);
      }
    });

    // Notification Filter Chips
    document.addEventListener('click', (e) => {
      const filterChip = e.target.closest('.notice-filter-chip');
      if (filterChip) {
        document.querySelectorAll('.notice-filter-chip').forEach(c => c.classList.remove('active'));
        filterChip.classList.add('active');
        const cat = filterChip.dataset.cat;
        renderStudentNotifications(cat);
      }
    });

    // Toggle Password Visibility
    const togglePwdBtn = document.getElementById('togglePasswordVisibilityBtn');
    togglePwdBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      if (!loginDobInput) loginDobInput = document.getElementById('portalDobInput');
      if (!loginDobInput) return;
      const isPwd = loginDobInput.type === 'password';
      loginDobInput.type = isPwd ? 'text' : 'password';
      const icon = document.getElementById('togglePasswordIcon');
      if (icon) {
        icon.className = isPwd ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye';
      }
    });
  }

  /* --------------------------------------------------------------------------
   * Portal Modal Toggle & Session Management
   * -------------------------------------------------------------------------- */

  // The portal modal is the third overlay that used to write
  // document.body.style.overflow directly — the mobile drawer and the gallery
  // lightbox did too. Whichever closed first unlocked the page underneath the
  // others, so a scroll started behind an open modal. All three now share the
  // reference-counted lock published by js/app.js, and the local flag keeps a
  // repeated openPortal() call from incrementing the count twice.
  let portalScrollLocked = false;

  function lockPageScroll() {
    if (portalScrollLocked) return;
    portalScrollLocked = true;
    if (window.PragyanUI && typeof window.PragyanUI.lockScroll === 'function') {
      window.PragyanUI.lockScroll();
    } else {
      document.body.style.overflow = 'hidden';
    }
  }

  function unlockPageScroll() {
    portalScrollLocked = false;
    if (window.PragyanUI && typeof window.PragyanUI.unlockScroll === 'function') {
      try { window.PragyanUI.unlockScroll(); } catch(e) {}
    }
    document.documentElement.classList.remove('scroll-locked');
    document.body.style.overflow = '';
  }

  function openPortal(initialTab) {
    if (!portalOverlay) portalOverlay = document.getElementById('portalOverlay');
    if (portalOverlay) {
      portalOverlay.classList.add('active');
      portalOverlay.style.display = 'flex';
      portalOverlay.style.opacity = '1';
      portalOverlay.style.visibility = 'visible';
    }
    lockPageScroll();
    sessionStorage.setItem('pragyan_portal_open', 'true');
    localStorage.setItem('pragyan_portal_open', 'true');

    if (initialTab) {
      AppState.activeStudentTab = initialTab;
      AppState.activeAdminTab = initialTab;
    }

    // Trigger instant cloud sync whenever portal opens
    if (typeof SupabaseSync !== 'undefined' && SupabaseSync.pullAll) {
      SupabaseSync.pullAll().catch(() => {});
    }

    // If session exists, render active dashboard directly
    let session = null;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY_SESSION) || localStorage.getItem(STORAGE_KEY_SESSION);
      if (raw) session = JSON.parse(raw);
    } catch(e) {}

    if (session && session.user) {
      AppState.currentRole = session.role;
      AppState.currentUser = AppState.currentUser || session.user;
      showDashboard(session.role);
      if (initialTab) {
        if (session.role === 'student') switchStudentTab(initialTab);
        else switchAdminTab(initialTab);
      }
    } else {
      showLoginView();
    }
  }

  function closePortal() {
    if (!portalOverlay) portalOverlay = document.getElementById('portalOverlay');
    if (portalOverlay) {
      portalOverlay.classList.remove('active');
      portalOverlay.style.display = 'none';
      portalOverlay.style.opacity = '0';
      portalOverlay.style.visibility = 'hidden';
    }
    // Purge any lingering sub-modals
    document.querySelectorAll('.inner-modal-backdrop, .portal-modal-backdrop').forEach(m => {
      try { m.remove(); } catch (_) {}
    });
    scrollLockDepth = 0;
    unlockPageScroll();
    document.documentElement.classList.remove('scroll-locked');
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.pointerEvents = '';
    sessionStorage.setItem('pragyan_portal_open', 'false');
    localStorage.setItem('pragyan_portal_open', 'false');
    if (window.PragyanUI) {
      if (typeof window.PragyanUI.forceUnlockScroll === 'function') {
        try { window.PragyanUI.forceUnlockScroll(); } catch (_) {}
      }
      if (typeof window.PragyanUI.revealElements === 'function') {
        try { window.PragyanUI.revealElements(); } catch (_) {}
      }
    }
  }

  function checkExistingSession() {
    let session = null;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY_SESSION) || localStorage.getItem(STORAGE_KEY_SESSION);
      if (raw) session = JSON.parse(raw);
    } catch(e) {}

    const token = sessionStorage.getItem('pragyan_portal_token') || localStorage.getItem('pragyan_portal_token');

    if (session && session.user) {
      AppState.currentRole = session.role || 'student';
      // Sync across both storage layers
      sessionStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(session));
      localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(session));
      sessionStorage.setItem('pragyan_portal_role', session.role || '');
      localStorage.setItem('pragyan_portal_role', session.role || '');
      if (token) {
        sessionStorage.setItem('pragyan_portal_token', token);
        localStorage.setItem('pragyan_portal_token', token);
      }

      // Re-hydrate student or admin session from collection
      if (session.role === 'student') {
        const studentId = session.user.id || session.user.student_id || session.user.rollNo;
        const fullStudent = AppState.getStudents().find(s => s.id === studentId || s.student_id === studentId || s.rollNo === session.user.rollNo);
        AppState.currentUser = fullStudent || session.user;
      } else if (session.role === 'admin') {
        const adminId = session.user.id || session.user.username;
        const fullAdmin = AppState.getAdmins().find(a => a.id === adminId || a.username === adminId);
        AppState.currentUser = fullAdmin || session.user;
      } else {
        AppState.currentUser = session.user;
      }

      // Trigger cloud pull for existing session
      if (typeof SupabaseSync !== 'undefined' && SupabaseSync.pullAll) {
        SupabaseSync.pullAll().catch(() => {});
      }

      // Clear sticky auto-open flags so public landing page loads cleanly
      localStorage.removeItem('pragyan_portal_open');

      // Only open portal if URL hash specifically requests it
      const hash = window.location.hash;
      const wantsPortalByHash = hash === '#portal' || hash === '#login';
      if (wantsPortalByHash) {
        openPortal();
      }
    }
  }

  function showLoginView() {
    const lvc = document.getElementById('loginViewContainer') || loginViewContainer;
    const sdc = document.getElementById('studentDashboardContainer') || studentDashboardContainer;
    const adc = document.getElementById('adminDashboardContainer') || adminDashboardContainer;

    if (lvc) {
      lvc.classList.remove('hidden-view');
      lvc.removeAttribute('hidden');
      lvc.style.removeProperty('display');
      lvc.style.display = '';
    }
    if (sdc) {
      sdc.classList.add('hidden-view');
      sdc.setAttribute('hidden', 'true');
      sdc.style.setProperty('display', 'none', 'important');
    }
    if (adc) {
      adc.classList.add('hidden-view');
      adc.setAttribute('hidden', 'true');
      adc.style.setProperty('display', 'none', 'important');
    }
  }

  function switchLoginRole(role) {
    AppState.currentRole = role;
    if (loginMobileInput) loginMobileInput.value = '';
    if (loginDobInput) loginDobInput.value = '';
    if (role === 'student') {
      loginRoleStudentBtn?.classList.add('active');
      loginRoleAdminBtn?.classList.remove('active');
    } else {
      loginRoleAdminBtn?.classList.add('active');
      loginRoleStudentBtn?.classList.remove('active');
    }
    if (loginErrorMsg) loginErrorMsg.style.display = 'none';
    const idLabel = document.getElementById('portalIdLabel') || document.querySelector('label[for="portalMobileInput"]');
    const credentialLabel = document.getElementById('portalCredentialLabel') || document.querySelector('label[for="portalDobInput"]');
    const idIcon = document.getElementById('portalIdIcon');
    const credentialIcon = document.getElementById('portalCredentialIcon');
    const subtitleEl = document.getElementById('loginHeaderSubtitle');
    const helperEl = document.getElementById('portalCredentialHelper');

    if (role === 'admin') {
      if (idLabel) idLabel.textContent = 'Admin Username / Email';
      if (credentialLabel) credentialLabel.textContent = 'Admin Password';
      if (idIcon) idIcon.className = 'fa-solid fa-user-shield input-icon-left';
      if (credentialIcon) credentialIcon.className = 'fa-solid fa-lock input-icon-left';
      if (subtitleEl) subtitleEl.textContent = 'Enter your administrator username/email and password.';
      if (helperEl) {
        helperEl.innerHTML = '<i aria-hidden="true" class="fa-solid fa-shield-halved"></i> <span>Enter your authorized administrator security password.</span>';
      }
      if (loginMobileInput) {
        loginMobileInput.type = 'text';
        loginMobileInput.maxLength = 80;
        loginMobileInput.placeholder = 'Enter admin username or email';
      }
      if (loginDobInput) {
        loginDobInput.type = 'password';
        loginDobInput.placeholder = 'Enter your admin password';
      }
    } else {
      if (idLabel) idLabel.textContent = 'Mobile Number / Roll No';
      if (credentialLabel) credentialLabel.textContent = 'Password or Date of Birth (DOB)';
      if (idIcon) idIcon.className = 'fa-solid fa-mobile-screen-button input-icon-left';
      if (credentialIcon) credentialIcon.className = 'fa-solid fa-lock input-icon-left';
      if (subtitleEl) subtitleEl.textContent = 'Enter your mobile number and password or DOB (DDMMYYYY) below.';
      if (helperEl) {
        helperEl.innerHTML = '<i aria-hidden="true" class="fa-solid fa-circle-info"></i> <span>Default password is DOB in <strong>DDMMYYYY</strong> format (e.g. <code>15052010</code> for 15-May-2010) or custom password.</span>';
      }
      if (loginMobileInput) {
        loginMobileInput.type = 'text';
        loginMobileInput.maxLength = 50;
        loginMobileInput.placeholder = 'Enter registered 10-digit mobile or Roll No';
      }
      if (loginDobInput) {
        loginDobInput.type = 'password';
        loginDobInput.placeholder = 'Password or DOB in DDMMYYYY (e.g. 15052010)';
      }
    }
  }

  /* --------------------------------------------------------------------------
   * Authentication Handler (Direct Real-time Supabase Database Authentication)
   * -------------------------------------------------------------------------- */
  async function handleLoginSubmit() {
    const mobile = loginMobileInput?.value.trim();
    const dob = loginDobInput?.value.trim();
    const role = AppState.currentRole || 'student';

    if (!mobile || !dob) {
      showLoginError(role === 'admin' ? 'Enter your username and password.' : 'Enter your registered mobile number and date of birth.');
      return;
    }

    const submitBtn = loginForm?.querySelector('.login-submit-btn') || loginForm?.querySelector('button[type="submit"]');
    const originalBtnContent = submitBtn ? submitBtn.innerHTML : '<i aria-hidden="true" class="fa-solid fa-right-to-bracket"></i> Login to Portal';

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i aria-hidden="true" class="fa-solid fa-spinner fa-spin"></i> Authenticating with Database...';
    }
    if (loginErrorMsg) loginErrorMsg.style.display = 'none';

    try {
      if (typeof SupabaseSync !== 'undefined' && SupabaseSync.login) {
        const authResult = await SupabaseSync.login(role, mobile, dob);
        if (authResult && authResult.success) {
          AppState.currentUser = authResult.user;
          saveSession(role, authResult.user);
          if (role === 'student' && typeof AppState !== 'undefined' && AppState.getStudents) {
            const sId = (authResult.user.id || authResult.user.student_id || '').toLowerCase();
            const sRoll = (authResult.user.rollNo || authResult.user.roll_no || '').toLowerCase();
            const fresh = AppState.getStudents().find(s => {
              const rId = (s.id || s.student_id || '').toLowerCase();
              const rRoll = (s.rollNo || s.roll_no || '').toLowerCase();
              return (sId && (rId === sId || rRoll === sId)) || (sRoll && (rRoll === sRoll || rId === sRoll));
            });
            if (fresh) AppState.currentUser = fresh;
          }
          showDashboard(role);
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnContent;
          }
          return;
        } else {
          showLoginError((authResult && authResult.error) || 'Authentication failed. Please check your credentials.');
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnContent;
          }
          return;
        }
      }
    } catch (err) {
      console.warn('Direct database login error:', err);
      showLoginError((err && err.message) || 'Authentication failed. Please check your network connection or credentials.');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnContent;
      }
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnContent;
    }
    showLoginError('Authentication service temporarily unreachable. Please check your credentials or try again.');
  }

  function showLoginError(msg) {
    if (loginErrorMsg) {
      loginErrorMsg.textContent = msg;
      loginErrorMsg.style.display = 'block';
    }
  }

  function saveSession(role, userObj) {
    // BUG-N fix: Strip feeHistory from session to avoid 100KB+ session blobs slowing page loads
    // Full data is always reloaded fresh from AppState.getStudents() when needed
    const sessionUser = { ...userObj };
    delete sessionUser.feeHistory;
    const sessionData = JSON.stringify({ role, user: sessionUser, savedAt: Date.now() });

    // Store in both sessionStorage and localStorage for seamless persistence
    sessionStorage.setItem(STORAGE_KEY_SESSION, sessionData);
    localStorage.setItem(STORAGE_KEY_SESSION, sessionData);
    sessionStorage.setItem('pragyan_portal_role', role);
    localStorage.setItem('pragyan_portal_role', role);
    sessionStorage.setItem('pragyan_portal_open', 'true');
    localStorage.setItem('pragyan_portal_open', 'true');

    // Ensure session token exists
    const token = sessionStorage.getItem('pragyan_portal_token') || localStorage.getItem('pragyan_portal_token') || `token_${role}_${sessionUser.id || 'usr'}_${Date.now()}`;
    sessionStorage.setItem('pragyan_portal_token', token);
    localStorage.setItem('pragyan_portal_token', token);
  }

  async function handleLogout() {
    // 1. Remove all open dialogs or lingering modal backdrops
    document.querySelectorAll('.inner-modal-backdrop, .portal-modal-backdrop').forEach(m => {
      try { m.remove(); } catch (_) {}
    });

    // 2. Clear all storage session items
    sessionStorage.removeItem(STORAGE_KEY_SESSION);
    sessionStorage.removeItem('pragyan_portal_token');
    sessionStorage.removeItem('pragyan_portal_role');
    sessionStorage.removeItem('pragyan_portal_open');

    localStorage.removeItem(STORAGE_KEY_SESSION);
    localStorage.removeItem('pragyan_portal_token');
    localStorage.removeItem('pragyan_portal_role');
    localStorage.removeItem('pragyan_portal_open');
    localStorage.removeItem('pragyan_portal_session');
    localStorage.removeItem('pragyan_student_session');
    localStorage.removeItem('pragyan_admin_session');

    AppState.currentUser = null;
    AppState.currentRole = null;
    AppState.token = null;

    // 3. Clear session in sync engine without destroying it so public data remains active
    if (typeof SupabaseSync !== 'undefined') {
      if (typeof SupabaseSync.clearSession === 'function') {
        try { SupabaseSync.clearSession(); } catch (_) {}
      } else if (typeof SupabaseSync.setSession === 'function') {
        try { await SupabaseSync.setSession(null, null); } catch (_) {}
      }
      if (!SupabaseSync.isInitialized && typeof SupabaseSync.init === 'function') {
        try { SupabaseSync.init(); } catch (_) {}
      }
    }

    // 4. Force release all scroll locks and reset all counters
    scrollLockDepth = 0;
    portalScrollLocked = false;
    document.documentElement.classList.remove('scroll-locked');
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.pointerEvents = '';
    if (window.PragyanUI) {
      if (typeof window.PragyanUI.forceUnlockScroll === 'function') {
        try { window.PragyanUI.forceUnlockScroll(); } catch (_) {}
      } else if (typeof window.PragyanUI.unlockScroll === 'function') {
        try { window.PragyanUI.unlockScroll(); } catch (_) {}
      }
      if (typeof window.PragyanUI.revealElements === 'function') {
        try { window.PragyanUI.revealElements(); } catch (_) {}
      }
    }

    showLoginView();
  }

  function relogin(targetRole) {
    handleLogout();
    openPortal();
    showLoginView();
    if (targetRole) switchLoginRole(targetRole);
    setTimeout(() => {
      const input = document.getElementById('portalMobileInput');
      if (input) {
        input.focus();
        try { input.select(); } catch (_) {}
      }
    }, 100);
  }

  /* --------------------------------------------------------------------------
   * Dashboard View Switcher & Renderer
   * -------------------------------------------------------------------------- */
  function showDashboard(role) {
    const lvc = document.getElementById('loginViewContainer') || loginViewContainer;
    const sdc = document.getElementById('studentDashboardContainer') || studentDashboardContainer;
    const adc = document.getElementById('adminDashboardContainer') || adminDashboardContainer;

    if (lvc) {
      lvc.classList.add('hidden-view');
      lvc.setAttribute('hidden', 'true');
      lvc.style.setProperty('display', 'none', 'important');
    }

    if (role === 'student') {
      if (sdc) {
        sdc.classList.remove('hidden-view');
        sdc.removeAttribute('hidden');
        sdc.style.setProperty('display', 'block', 'important');
      }
      if (adc) {
        adc.classList.add('hidden-view');
        adc.setAttribute('hidden', 'true');
        adc.style.setProperty('display', 'none', 'important');
      }
      try {
        renderStudentDashboard();
      } catch (err) {
        console.error('Error rendering student dashboard:', err);
      }
    } else {
      if (sdc) {
        sdc.classList.add('hidden-view');
        sdc.setAttribute('hidden', 'true');
        sdc.style.setProperty('display', 'none', 'important');
      }
      if (adc) {
        adc.classList.remove('hidden-view');
        adc.removeAttribute('hidden');
        adc.style.setProperty('display', 'block', 'important');
      }
      try {
        renderAdminDashboard();
      } catch (err) {
        console.error('Error rendering admin dashboard:', err);
      }
    }
  }

  /* ==========================================================================
   * STUDENT PROFILE DASHBOARD RENDERERS (4 TABS)
   * ========================================================================== */
  
  function renderOfflineNoticeBanner() {
    const isOffline = (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('pragyan_offline_fallback') === 'true') ||
      (typeof sessionStorage !== 'undefined' && (sessionStorage.getItem('pragyan_portal_token') || '').startsWith('token_'));
    if (!isOffline) return '';
    return `
      <div id="offlineFallbackWarningBanner" style="background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.5); color: #B45309; padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; font-size: 13px; display: flex; align-items: center; gap: 10px; font-weight: 500;">
        <i aria-hidden="true" class="fa-solid fa-triangle-exclamation" style="color: #D97706; font-size: 16px;"></i>
        <span><strong>Offline Session:</strong> You are viewing locally cached data. Server actions (password updates, live payment approvals, email broadcasts) require an active internet connection.</span>
      </div>
    `;
  }

function renderStudentDashboard() {
    // S5: Rehydrate currentUser with full student profile and feeHistory
    if (AppState.currentUser && (AppState.currentUser.id || AppState.currentUser.student_id || AppState.currentUser.rollNo)) {
      const sId = AppState.currentUser.id || AppState.currentUser.student_id;
      const sRoll = AppState.currentUser.rollNo || AppState.currentUser.roll_no;
      const full = AppState.getStudents().find(s => (sId && (s.id === sId || s.student_id === sId)) || (sRoll && (s.rollNo === sRoll || s.roll_no === sRoll)));
      if (full) {
        AppState.currentUser = full;
      }
    }

    const student = AppState.currentUser;
    if (!student) return;

    // Render Student Header Banner
    const nameEl = document.getElementById('studentHeaderName');
    const classEl = document.getElementById('studentHeaderClass');
    const rollEl = document.getElementById('studentHeaderRoll');
    const avatarEl = document.getElementById('studentAvatar');

    if (nameEl) nameEl.textContent = student.name;
    if (classEl) classEl.textContent = student.className;
    if (rollEl) rollEl.textContent = `Roll No: ${student.rollNo}`;

    if (avatarEl) {
      const photoUrl = student.photoUrl || student.photo_url || student.photo || '';
      if (photoUrl && (photoUrl.startsWith('http') || photoUrl.startsWith('data:image/'))) {
        avatarEl.innerHTML = `<img src="${photoUrl}" alt="${sanitizeInput(student.name)}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
      } else {
        avatarEl.textContent = (student.name ? student.name.charAt(0).toUpperCase() : '🎓');
      }
    }

    // Update student notification tab badge
    const notices = AppState.getNotices();
    const studentBatch = (student.className || student.batchName || '').toLowerCase();
    const count = notices.filter(n => {
      const target = (n.targetBatch || n.target_batch || 'All Batches').toLowerCase();
      return target === 'all batches' || target === 'all' || target.includes('all') ||
             (studentBatch && (studentBatch.includes(target.slice(0, 8)) || target.includes(studentBatch.slice(0, 8))));
    }).length;

    const notifBtn = document.querySelector('.student-tab-btn[data-tab="notifications"]');
    if (notifBtn) {
      notifBtn.innerHTML = `<i aria-hidden="true" class="fa-solid fa-bell"></i> Notification Tab ${count > 0 ? `<span class="badge" style="background:#059669; color:#fff; padding:1px 7px; border-radius:99px; font-size: 0.8rem; margin-left:6px; font-weight:700;">${count}</span>` : ''}`;
    }

    const studentCommBtn = document.getElementById('studentTabBtnCommunity');
    if (studentCommBtn) {
      studentCommBtn.style.display = ENABLE_COMMUNITY_CHAT ? 'inline-flex' : 'none';
    }

    // Preserve and render ONLY the active student tab
    const targetTab = AppState.activeStudentTab || 'details';
    switchStudentTab(targetTab);

    // Prompt student for mobile/browser push alerts (student-only login policy)
    if (window.PushClient && typeof window.PushClient.renderStudentPrompt === 'function') {
      const detailsPane = document.getElementById('studentTabPane-details') || document.querySelector('.dashboard-content-body');
      window.PushClient.renderStudentPrompt(detailsPane, student);
    }
  }

  function switchStudentTab(tabName) {
    AppState.activeStudentTab = tabName;
    AppState.activeTab = tabName;

    const studentWrapper = document.getElementById('studentDashboardContainer');
    if (studentWrapper) {
      if (tabName === 'community') {
        studentWrapper.classList.add('community-tab-active');
      } else {
        studentWrapper.classList.remove('community-tab-active');
      }
    }

    // Update Tab Button Active States
    document.querySelectorAll('.student-tab-btn').forEach(btn => {
      if (btn.dataset.tab === tabName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Update Tab Panes
    document.querySelectorAll('.student-tab-pane').forEach(pane => {
      if (pane.id === `studentTabPane-${tabName}`) {
        pane.classList.add('active');
        pane.style.display = 'block';
      } else {
        pane.classList.remove('active');
        pane.style.display = 'none';
      }
    });

    // Dynamically re-render active student tab
    if (tabName === 'details') {
      renderStudentDetailsTab();
    } else if (tabName === 'batch') {
      renderStudentBatchTab();
    } else if (tabName === 'notifications') {
      renderStudentNotifications();
    } else if (tabName === 'fees') {
      renderStudentFeeTab();
    } else if (tabName === 'community') {
      renderCommunityChatTab();
    }
  }

  function generateStudentLogicalBarcodeSVG(s) {
    const rawId = (s.student_id || s.rollNo || s.id || '261001').toString().toUpperCase();
    const code = rawId.replace(/[^A-Z0-9-]/g, '');
    
    // Code-128 / Code-39 realistic standard bar encoding table
    const patterns = {
      '0': '101001101101', '1': '110100101011', '2': '101100101011', '3': '110110010101',
      '4': '101001101011', '5': '110100110101', '6': '101100110101', '7': '101001011011',
      '8': '110100101101', '9': '101100101101', 'A': '110101001011', 'B': '101101001011',
      'C': '110110100101', 'D': '101011001011', 'E': '110101100101', 'F': '101101100101',
      'G': '101010011011', 'H': '110101001101', 'I': '101101001101', 'J': '101011001101',
      'K': '110101010011', 'L': '101101010011', 'M': '110110101001', 'N': '101011010011',
      'O': '110101101001', 'P': '101101101001', 'Q': '101001101101', 'R': '110101011001',
      'S': '101101011001', 'T': '101011011001', 'U': '110010101011', 'V': '100110101011',
      'W': '110011010101', 'X': '100101101011', 'Y': '110010110101', 'Z': '100110110101',
      '-': '100101011011', '#': '101001011011'
    };

    const barWidth = 1.6;
    const quietZone = 10 * barWidth; // 10x narrow bar quiet zone on each side (F25)

    let bits = '11010010000'; // Start Code
    for (let i = 0; i < code.length; i++) {
      const char = code[i];
      bits += (patterns[char] || '101001101101');
    }
    bits += '1100011101011'; // Stop Code

    let rects = '';
    let currentX = quietZone;
    for (let i = 0; i < bits.length; i++) {
      if (bits[i] === '1') {
        rects += `<rect x="${currentX.toFixed(1)}" y="0" width="${barWidth}" height="18" fill="#FFFFFF"/>`;
      }
      currentX += barWidth;
    }
    const totalSvgWidth = currentX + quietZone;

    return `
      <div class="logical-barcode-container">
        <svg class="logical-barcode-svg" viewBox="0 0 ${totalSvgWidth.toFixed(1)} 18" preserveAspectRatio="none" aria-label="Student Barcode ${code}">
          ${rects}
        </svg>
        <div class="logical-barcode-number">*${code}*</div>
      </div>
    `;
  }

  // 1. Student Tab: Profile (Details, 3D ID Card, Security)
  function renderStudentDetailsTab() {
    const s = AppState.currentUser;
    const pane = document.getElementById('studentTabPane-details');
    if (!pane || !s) return;

    // Calculate accurate ledger amounts
    const feeAcc = (typeof AppState.getStudentFeeAccount === 'function')
      ? AppState.getStudentFeeAccount(s.id || s.student_id || s.rollNo, s)
      : null;
    const resolvedBatch = (window.PRAGYAN_ACADEMIC && typeof window.PRAGYAN_ACADEMIC.resolveBatch === 'function')
      ? window.PRAGYAN_ACADEMIC.resolveBatch(s.className || s.class_name || s.batchName)
      : null;
    const batchStandardFee = resolvedBatch?.fee || (window.PRAGYAN_ACADEMIC?.monthlyFeeFor ? window.PRAGYAN_ACADEMIC.monthlyFeeFor(s.className || s.class_name) : 1000);
    const rawPaid = Number(s.paidFee ?? s.paid_fee ?? 0);
    const pendingFee = Number(feeAcc?.totalDue ?? s.pendingFee ?? s.pending_fee ?? 0);
    const isFeeCleared = pendingFee <= 0;

    let displayTotalFee = Number(s.totalFee ?? s.total_fee ?? 0);
    if (displayTotalFee <= 1) {
      displayTotalFee = (rawPaid + pendingFee > 0) ? (rawPaid + pendingFee) : batchStandardFee;
    } else if (displayTotalFee < (rawPaid + pendingFee)) {
      displayTotalFee = rawPaid + pendingFee;
    }
    const displayPaidFee = isFeeCleared ? (rawPaid > 0 ? rawPaid : displayTotalFee) : rawPaid;

    const requests = AppState.getRequests();
    const pendingReq = requests.find(r => isStudentRequestMatch(r, s) && String(r.status || '').toLowerCase() === 'pending');

    const sId = s.student_id || s.id || s.rollNo;
    const rollNo = s.rollNo || s.roll_no || sId;
    const activePwdReq = requests.find(r => 
      (r.req_type === 'PASSWORD_UPDATE' || r.type === 'PASSWORD_UPDATE') &&
      (r.studentId === sId || r.student_id === sId || r.rollNo === rollNo || r.roll_no === rollNo) &&
      r.status === 'Active'
    );
    const hasCustomPassword = Boolean(s.customPassword || activePwdReq);

    pane.innerHTML = `
      ${pendingReq ? `
        <div style="background: #FEF3C7; border: 1.5px solid #F59E0B; color: #92400E; padding: 0.9rem 1.15rem; border-radius: 10px; margin-bottom: 1.25rem; font-size: 0.9rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.75rem; box-shadow: 0 2px 8px rgba(245,158,11,0.15);">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            ${(pendingReq.newData?.photoUrl || pendingReq.newData?.photo || pendingReq.newData?.photo_url) ? `
              <img src="${pendingReq.newData?.photoUrl || pendingReq.newData?.photo || pendingReq.newData?.photo_url}" style="width: 44px; height: 44px; border-radius: 8px; object-fit: cover; border: 2px solid #D97706; flex-shrink: 0;" alt="New Photo">
            ` : `<div style="font-size: 1.4rem;"><i aria-hidden="true" class="fa-solid fa-clock-rotate-left" style="color: #D97706;"></i></div>`}
            <div>
              <div style="font-weight: 700; color: #92400E;"><i aria-hidden="true" class="fa-solid fa-hourglass-half"></i> Profile Update Request Pending Review</div>
              <div style="font-size: 0.8rem; color: #B45309; margin-top: 2px;">Your requested updates${(pendingReq.newData?.photoUrl || pendingReq.newData?.photo) ? ' (including new profile photo)' : ''} are under Admin review.</div>
            </div>
          </div>
          <div style="display: flex; gap: 0.5rem; align-items: center;">
            <button class="btn" id="btnEditPendingReq" style="background: #D97706; color: #fff; padding: 0.35rem 0.85rem; border-radius: 6px; font-size: 0.82rem; font-weight: 700; cursor: pointer; border: none; display: inline-flex; align-items: center; gap: 0.35rem;">
              <i aria-hidden="true" class="fa-solid fa-pen-to-square"></i> Edit
            </button>
            <button class="btn" id="btnCancelPendingReq" style="background: #DC2626; color: #fff; padding: 0.35rem 0.85rem; border-radius: 6px; font-size: 0.82rem; font-weight: 700; cursor: pointer; border: none; display: inline-flex; align-items: center; gap: 0.35rem;">
              <i aria-hidden="true" class="fa-solid fa-xmark"></i> Cancel
            </button>
          </div>
        </div>
      ` : ''}

      <!-- TOP: Interactive 3D Metallic VIP Student ID Pass Card -->
      <div class="metallic-card-3d-container">
        <div class="card-flip-hint" id="cardFlipHintBtn">
          <i aria-hidden="true" class="fa-solid fa-wand-magic-sparkles"></i> <span>Tap Card to Flip 3D</span> <i aria-hidden="true" class="fa-solid fa-arrows-rotate"></i>
        </div>

        <div class="metallic-card-3d" id="studentIdCard3D">
          
          <!-- FRONT FACE: Imperial Emerald & 24K Gold VIP Pass -->
          <div class="card-face card-face-front">
            <div class="metallic-card-glimmer"></div>
            
            <div class="metallic-id-header">
              <div class="metallic-id-brand">
                <img src="assets/images/logo.png" class="metallic-id-logo" alt="Pragyan Institute Logo">
                <div class="metallic-id-brand-text">
                  <div class="metallic-id-inst-name">PRAGYAN INSTITUTE</div>
                  <div class="metallic-id-inst-sub">Lalganj • Institutional Student Pass</div>
                </div>
              </div>
              <div class="metallic-vip-crest">
                <i aria-hidden="true" class="fa-solid fa-crown"></i> <span>SCHOLAR PASS</span>
              </div>
            </div>

            <div class="metallic-id-body">
              <div class="metallic-avatar-upload-wrap">
                <div class="avatar-photo-label" style="cursor: default;">
                  ${(s.photoUrl || s.photo_url || s.photo) ? `<img src="${s.photoUrl || s.photo_url || s.photo}" class="student-id-photo-img" alt="Photo">` : `<div class="id-avatar-fallback">${(s.name || 'S').charAt(0).toUpperCase()}</div>`}
                </div>
                <div class="photo-verified-mini-dot" title="Biometrically Verified"><i aria-hidden="true" class="fa-solid fa-check"></i></div>
              </div>

              <div class="metallic-id-info">
                <div class="metallic-emv-chip-row">
                  <div class="metallic-emv-chip" title="Smart Digital Pass">
                    <span class="chip-line chip-line-1"></span>
                    <span class="chip-line chip-line-2"></span>
                    <span class="chip-line chip-line-3"></span>
                  </div>
                  <div class="metallic-nfc-wave" title="Contactless NFC Digital ID"><i aria-hidden="true" class="fa-solid fa-wifi"></i></div>
                </div>
                <h3 class="metallic-student-name">${sanitizeInput(s.name)}</h3>
                <div class="metallic-pills-row">
                  <span class="metallic-id-chip"><i aria-hidden="true" class="fa-solid fa-id-badge"></i> ID: ${s.student_id || s.rollNo || s.id}</span>
                  <span class="metallic-class-tag"><i aria-hidden="true" class="fa-solid fa-graduation-cap"></i> ${sanitizeInput(s.className)}</span>
                </div>
              </div>
            </div>

            <div class="metallic-id-details-row">
              <div class="detail-cell"><span class="detail-k">Roll:</span> <strong class="detail-v">#${s.rollNo}</strong></div>
              <div class="detail-cell"><span class="detail-k">DOB:</span> <strong class="detail-v">${formatDate(s.dob)}</strong></div>
              <div class="detail-cell"><span class="detail-k">Contact:</span> <strong class="detail-v">${sanitizeInput(s.mobile)}</strong></div>
              <div class="detail-cell"><span class="detail-k">Guardian:</span> <strong class="detail-v">${sanitizeInput(s.guardianName || 'Parent/Guardian')}</strong></div>
            </div>

            <div class="metallic-credential-highlight-strip">
              <div class="metallic-credential-strip-left">
                <span class="metallic-credential-pill">
                  <span class="status-pulsing-gem"></span>
                  <i aria-hidden="true" class="fa-solid fa-shield-check"></i>
                  <span>ACTIVE SCHOLAR</span>
                </span>
              </div>
              <div class="metallic-credential-strip-right">
                <span class="metallic-strip-label">Session:</span>
                <strong class="metallic-strip-session-val">2026–2027</strong>
              </div>
            </div>

            <!-- Front Face Inspiring Academic Motto & Quote Pill -->
            <div class="metallic-id-front-quote-wrap">
              <div class="metallic-front-quote-badge">
                <i aria-hidden="true" class="fa-solid fa-quote-left metallic-quote-icon"></i>
                <span class="metallic-quote-text">Knowledge is the supreme beacon of empowerment &amp; wisdom</span>
                <i aria-hidden="true" class="fa-solid fa-wand-magic-sparkles metallic-quote-sparkle"></i>
              </div>
            </div>

            <div class="metallic-id-barcode-wrap">
              ${generateStudentLogicalBarcodeSVG(s)}
              <div class="metallic-qr-placeholder">
                <i aria-hidden="true" class="fa-solid fa-shield-halved"></i> <span>SECURE ID</span>
              </div>
            </div>
          </div>

          <!-- BACK FACE: Official Academic Quote, Institutional Creed & Signatures -->
          <div class="card-face card-face-back">
            <div class="metallic-card-glimmer"></div>

            <div class="metallic-id-header">
              <div class="metallic-id-brand">
                <img src="assets/images/logo.png" class="metallic-id-logo" alt="Pragyan Institute Logo">
                <div class="metallic-id-brand-text">
                  <div class="metallic-id-inst-name">PRAGYAN INSTITUTE</div>
                  <div class="metallic-id-inst-sub">Official Academic Pass &amp; Institutional Oath</div>
                </div>
              </div>
              <div class="metallic-hologram-seal">
                <i aria-hidden="true" class="fa-solid fa-certificate"></i> AUTHENTIC
              </div>
            </div>

            <div class="back-card-content back-card-quote-centric">
              <!-- Inspiring Institutional Academic Quote Hero Box -->
              <div class="back-quote-box back-quote-box-hero">
                <div class="quote-header-decor">
                  <i aria-hidden="true" class="fa-solid fa-quote-left quote-icon-large"></i>
                  <span class="quote-decor-tag">ACADEMIC MOTTO</span>
                </div>
                <p class="quote-text-hero">
                  “Education is the most powerful weapon which you can use to change the world.”
                </p>
                <div class="quote-author-hero">
                  <span class="author-dash">—</span> <strong>Nelson Mandela</strong> • <span class="motto-sub">Pragyan Academic Motto</span>
                </div>
              </div>

              <!-- Institutional Creed & Privilege Notice -->
              <div class="back-creed-strip">
                <div class="creed-item">
                  <i aria-hidden="true" class="fa-solid fa-star creed-star"></i>
                  <span>Excellence in Science, Mathematics &amp; Foundation • Affiliated &amp; Approved</span>
                </div>
                <div class="creed-item creed-notice">
                  <i aria-hidden="true" class="fa-solid fa-shield-check creed-check"></i>
                  <span>Official digital credential for student privileges in Academic Session 2026–2027.</span>
                </div>
              </div>
            </div>

            <div class="back-card-footer">
              <div class="back-signatories-row">
                <div class="back-sign-block">
                  <span class="back-sign-title">DIRECTOR</span>
                  <div class="signature-script">Chandan Kumar</div>
                </div>
                <div class="back-seal-center" title="Pragyan Institute Seal">
                  <i aria-hidden="true" class="fa-solid fa-stamp"></i>
                </div>
                <div class="back-sign-block" style="text-align: right;">
                  <span class="back-sign-title">ACADEMIC HEAD</span>
                  <div class="signature-script">Prof. Ravi Ranjan</div>
                </div>
              </div>
              <div class="back-contact-help">
                <i aria-hidden="true" class="fa-solid fa-location-dot"></i>
                <span>Moti Market, Near Jagdamba Sthan, Lalganj, Vaishali, Bihar 844121</span>
              </div>
            </div>
          </div>

        </div>
      </div>

      <!-- BOTTOM: Full Student Information & Details Card -->
      <div class="dash-card" style="margin-top: 0;">
        <div class="dash-card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
          <div class="dash-card-title">
            <i aria-hidden="true" class="fa-solid fa-id-card"></i> Student Information & Profile Details
          </div>
          <div class="student-header-actions-row" style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
            <button class="btn" id="btnStudentTogglePush" style="background-color: ${(typeof Notification !== 'undefined' && Notification.permission === 'granted') ? '#059669' : '#D97706'}; color: #fff; padding: 0.45rem 0.85rem; font-size: 0.82rem; font-weight: 600; cursor: pointer; border-radius: 6px; border: none; display: inline-flex; align-items: center; justify-content: center; gap: 0.35rem; box-shadow: 0 2px 6px rgba(0,0,0,0.12);">
              <i aria-hidden="true" class="fa-solid fa-bell"></i> <span>${(typeof Notification !== 'undefined' && Notification.permission === 'granted') ? '🟢 Alerts Active' : 'Enable Notifications'}</span>
            </button>
            <button class="btn btn-emerald" id="btnStudentChangePassword" style="background-color: #2563EB; color: #fff; padding: 0.45rem 0.85rem; font-size: 0.82rem; font-weight: 600; cursor: pointer; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; gap: 0.35rem;">
              <i aria-hidden="true" class="fa-solid fa-key"></i> Change Password
            </button>
            <button class="btn btn-emerald" id="btnRequestDetailUpdate" style="background-color: var(--primary-emerald); color: #fff; padding: 0.45rem 0.85rem; font-size: 0.82rem; font-weight: 600; cursor: pointer; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; gap: 0.35rem;">
              <i aria-hidden="true" class="fa-solid fa-pen-to-square"></i> Request Update
            </button>
          </div>
        </div>

        <div class="detail-items-grid">
          <div class="detail-box" style="display: flex; align-items: center; gap: 0.75rem;">
            <div style="width: 44px; height: 44px; border-radius: 8px; overflow: hidden; border: 1.5px solid var(--primary-emerald); flex-shrink: 0; background: #e5e7eb; display: flex; align-items: center; justify-content: center;">
              ${(s.photoUrl || s.photo_url || s.photo) ? `<img src="${s.photoUrl || s.photo_url || s.photo}" style="width: 100%; height: 100%; object-fit: cover;">` : `<i aria-hidden="true" class="fa-solid fa-user" style="color: #9ca3af;"></i>`}
            </div>
            <div>
              <div class="detail-label">Official Profile Photo</div>
              <div class="detail-val" style="font-size: 0.82rem; color: ${(s.photoUrl || s.photo_url || s.photo) ? 'var(--primary-emerald)' : 'var(--text-muted)'}; font-weight: 600;">
                ${(s.photoUrl || s.photo_url || s.photo) ? '✅ Verified Photo Linked' : '📷 Default Avatar'}
                ${pendingReq && (pendingReq.newData?.photoUrl || pendingReq.newData?.photo) ? `<span style="display: block; font-size: 0.8rem; color: #D97706; font-weight: 700; margin-top: 2px;"><i aria-hidden="true" class="fa-solid fa-clock-rotate-left"></i> New Photo Pending Review</span>` : ''}
              </div>
            </div>
          </div>
          <div class="detail-box">
            <div class="detail-label">Full Name</div>
            <div class="detail-val">${sanitizeInput(s.name)}</div>
          </div>
          <div class="detail-box">
            <div class="detail-label">Student ID</div>
            <div class="detail-val font-mono" style="font-weight: 700; color: var(--primary-emerald);">${s.student_id || s.rollNo || s.id}</div>
          </div>
          <div class="detail-box">
            <div class="detail-label">Roll Number</div>
            <div class="detail-val">#${s.rollNo}</div>
          </div>
          <div class="detail-box">
            <div class="detail-label">Class & Course</div>
            <div class="detail-val">${sanitizeInput(s.className)}</div>
          </div>
          <div class="detail-box">
            <div class="detail-label">Date of Birth (DOB)</div>
            <div class="detail-val">${formatDate(s.dob)}</div>
          </div>
          <div class="detail-box">
            <div class="detail-label">Mobile Number</div>
            <div class="detail-val">${sanitizeInput(s.mobile)}</div>
          </div>
          <div class="detail-box">
            <div class="detail-label">Father / Guardian Name</div>
            <div class="detail-val">${s.guardianName || 'Guardian'}</div>
          </div>
          <div class="detail-box">
            <div class="detail-label">Guardian Contact</div>
            <div class="detail-val">${s.guardianMobile || s.mobile}</div>
          </div>
          <div class="detail-box">
            <div class="detail-label">Blood Group</div>
            <div class="detail-val">${s.bloodGroup || 'Not Specified'}</div>
          </div>
          <div class="detail-box">
            <div class="detail-label">Email Address</div>
            <div class="detail-val">${s.email || 'Not Provided'}</div>
          </div>
          <div class="detail-box" style="grid-column: span 2;">
            <div class="detail-label">Residential Address</div>
            <div class="detail-val">${s.address || 'Lalganj, Vaishali, Bihar'}</div>
          </div>
        </div>
      </div>

      <!-- Security & Password Management Card -->
      <div class="dash-card student-security-card" style="margin-top: 1.25rem; border-left: 4px solid #2563EB;">
        <div class="dash-card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
          <div class="dash-card-title">
            <i aria-hidden="true" class="fa-solid fa-shield-halved" style="color: #2563EB;"></i> Account Security & Portal Password
          </div>
          <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
            ${hasCustomPassword ? `
              <span class="pill-item" id="studentPasswordStatusPill" style="background: #ECFDF5; color: #065F46; border: 1px solid #10B981; font-size: 0.8rem; font-weight: 700;">
                <i aria-hidden="true" class="fa-solid fa-circle-check"></i> Custom Password Active
              </span>
            ` : `
              <span class="pill-item" id="studentPasswordStatusPill" style="background: #EFF6FF; color: #1E40AF; border: 1px solid #93C5FD; font-size: 0.8rem; font-weight: 700;">
                <i aria-hidden="true" class="fa-solid fa-cake-candles"></i> Using Default DOB Password
              </span>
            `}
            <span class="pill-item pill-emerald" style="font-size: 0.8rem;"><i aria-hidden="true" class="fa-solid fa-bolt"></i> Instant Update</span>
          </div>
        </div>
        <div class="student-security-body" style="padding: 0.5rem 0;">
          <div class="student-security-info-box">
            <i aria-hidden="true" class="fa-solid fa-circle-info" style="color: #2563EB; font-size: 1.15rem; flex-shrink: 0; margin-top: 2px;"></i>
            <div style="font-size: 0.86rem; color: #374151; line-height: 1.55;">
              You can set or change your custom portal login password anytime. <strong>No verification or OTP is required.</strong> If you haven't set a custom password, you can always sign in using your official Date of Birth (DOB) in <strong>DDMMYYYY</strong> format.
            </div>
          </div>

          <form id="studentInlinePasswordForm" class="student-password-form">
            <div class="student-pw-input-grid">
              <div class="form-group-security">
                <label for="studentInlineNewPassword" class="security-label">
                  <i aria-hidden="true" class="fa-solid fa-key"></i> New Password
                </label>
                <div class="security-input-wrap">
                  <input type="password" id="studentInlineNewPassword" class="portal-input security-input" placeholder="Enter new password (min. 4 characters)" required minlength="4" autocomplete="new-password">
                  <button type="button" class="btn-toggle-security-pw" data-target="studentInlineNewPassword" aria-label="Toggle password visibility">
                    <i aria-hidden="true" class="fa-regular fa-eye"></i>
                  </button>
                </div>
                <div class="security-hint">Minimum 4 characters.</div>
              </div>

              <div class="form-group-security">
                <label for="studentInlineConfirmPassword" class="security-label">
                  <i aria-hidden="true" class="fa-solid fa-lock"></i> Confirm New Password
                </label>
                <div class="security-input-wrap">
                  <input type="password" id="studentInlineConfirmPassword" class="portal-input security-input" placeholder="Re-enter new password to confirm" required minlength="4" autocomplete="new-password">
                  <button type="button" class="btn-toggle-security-pw" data-target="studentInlineConfirmPassword" aria-label="Toggle password visibility">
                    <i aria-hidden="true" class="fa-regular fa-eye"></i>
                  </button>
                </div>
                <div class="security-hint" id="passwordMatchHint">Must match the new password above.</div>
              </div>
            </div>

            <div class="student-pw-submit-row">
              <button type="submit" class="btn btn-save-password" id="btnSaveStudentPassword">
                <i aria-hidden="true" class="fa-solid fa-floppy-disk"></i> Update Password Instantly
              </button>
            </div>
          </form>

          <div id="studentInlinePasswordSuccessMsg" class="student-password-success-banner" style="display: none;">
            <div class="success-banner-icon"><i aria-hidden="true" class="fa-solid fa-circle-check"></i></div>
            <div>
              <strong>Password Updated Successfully!</strong>
              <div style="font-size: 0.8rem; margin-top: 2px;">Your new login password is now active. You can use it to sign in immediately without any OTP.</div>
            </div>
          </div>
        </div>
      </div>
    `;

    // 3D Card Interactive Tilt & Flip Physics (Desktop Parallax + Mobile Hardware Gyroscope & Touch Tilt)
    const card3D = pane.querySelector('#studentIdCard3D');
    const hintBtn = pane.querySelector('#cardFlipHintBtn');
    let isFlipped = false;

    function toggleFlipCard() {
      isFlipped = !isFlipped;
      card3D?.classList.toggle('is-flipped', isFlipped);
      
      // Haptic Vibration for Mobile Devices
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try { navigator.vibrate(15); } catch (_) {}
      }

      if (!isFlipped && card3D) {
        card3D.style.transform = 'perspective(1200px) rotateX(0deg) rotateY(0deg)';
      } else if (isFlipped && card3D) {
        card3D.style.transform = 'perspective(1200px) rotateX(0deg) rotateY(180deg)';
      }
    }

    card3D?.addEventListener('click', toggleFlipCard);
    hintBtn?.addEventListener('click', toggleFlipCard);

    // Desktop 3D Mouse Parallax Tilt & Dynamic Specular Glare
    if (card3D && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      const glimmer = card3D.querySelector('.metallic-card-glimmer');
      card3D.addEventListener('mousemove', (e) => {
        const rect = card3D.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const rotateX = ((y - centerY) / centerY) * -10;
        const rotateY = ((x - centerX) / centerX) * 12;
        const baseFlip = isFlipped ? 180 : 0;
        card3D.style.transform = `perspective(1200px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${(baseFlip + rotateY).toFixed(2)}deg) scale3d(1.02, 1.02, 1.02)`;
        if (glimmer) {
          glimmer.style.background = `radial-gradient(circle at ${x}px ${y}px, rgba(255, 255, 255, 0.42) 0%, rgba(251, 191, 36, 0.15) 30%, transparent 65%)`;
          glimmer.style.opacity = '1';
        }
      });

      card3D.addEventListener('mouseleave', () => {
        const baseFlip = isFlipped ? 180 : 0;
        card3D.style.transform = `perspective(1200px) rotateX(0deg) rotateY(${baseFlip}deg) scale3d(1, 1, 1)`;
        if (glimmer) glimmer.style.opacity = '0';
      });
    }

    // Real-Time Hardware Gyroscope Orientation Engine (Android & iOS)
    let currentTiltX = 0;
    let currentTiltY = 0;
    let targetTiltX = 0;
    let targetTiltY = 0;
    let gyroAnimId = null;
    let isTouchActive = false;

    function updateGyroTilt() {
      if (!card3D || isFlipped || isTouchActive) {
        gyroAnimId = null;
        return;
      }

      currentTiltX += (targetTiltX - currentTiltX) * 0.18;
      currentTiltY += (targetTiltY - currentTiltY) * 0.18;

      const baseFlip = isFlipped ? 180 : 0;
      card3D.style.transform = `perspective(1000px) rotateX(${currentTiltX.toFixed(2)}deg) rotateY(${(baseFlip + currentTiltY).toFixed(2)}deg) scale3d(1.01, 1.01, 1.01)`;

      const glimmer = card3D.querySelector('.metallic-card-glimmer');
      if (glimmer) {
        const posX = Math.max(10, Math.min(90, 50 + currentTiltY * 2));
        const posY = Math.max(10, Math.min(90, 50 - currentTiltX * 2));
        glimmer.style.background = `radial-gradient(circle at ${posX}% ${posY}%, rgba(255, 255, 255, 0.45) 0%, rgba(251, 191, 36, 0.18) 35%, transparent 65%)`;
        glimmer.style.opacity = '1';
      }

      if (Math.abs(targetTiltX - currentTiltX) > 0.05 || Math.abs(targetTiltY - currentTiltY) > 0.05) {
        gyroAnimId = requestAnimationFrame(updateGyroTilt);
      } else {
        gyroAnimId = null;
      }
    }

    function onDeviceOrientation(e) {
      if (!card3D || isFlipped || isTouchActive) return;
      const gamma = e.gamma; // Roll: [-90, 90]
      const beta = e.beta;   // Pitch: [-180, 180]
      if (gamma === null || beta === null || typeof gamma === 'undefined') return;

      // Neutral reading when phone is held naturally upright at ~45 deg angle
      targetTiltY = Math.max(-18, Math.min(18, gamma * 0.55));
      targetTiltX = Math.max(-15, Math.min(15, (beta - 45) * -0.45));

      if (!gyroAnimId) {
        gyroAnimId = requestAnimationFrame(updateGyroTilt);
      }
    }

    function initGyroEngine() {
      if (typeof window !== 'undefined' && 'DeviceOrientationEvent' in window) {
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
          DeviceOrientationEvent.requestPermission()
            .then(state => {
              if (state === 'granted') {
                window.addEventListener('deviceorientation', onDeviceOrientation, { passive: true });
              }
            })
            .catch(() => {});
        } else {
          window.addEventListener('deviceorientation', onDeviceOrientation, { passive: true });
        }
      }
    }

    // Auto-listen for orientation and request on user interaction
    initGyroEngine();
    card3D?.addEventListener('touchstart', initGyroEngine, { passive: true, once: true });
    hintBtn?.addEventListener('touchstart', initGyroEngine, { passive: true, once: true });

    // Mobile Touch Drag Parallax Tilt & Swipe Flip
    let touchStartX = 0;
    let touchStartY = 0;

    card3D?.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
      touchStartY = e.changedTouches[0].screenY;
      isTouchActive = true;
    }, { passive: true });

    card3D?.addEventListener('touchmove', (e) => {
      const currentX = e.changedTouches[0].screenX;
      const currentY = e.changedTouches[0].screenY;
      const diffX = currentX - touchStartX;
      const diffY = currentY - touchStartY;
      if (Math.abs(diffX) > 8 || Math.abs(diffY) > 8) {
        const rotateX = Math.max(-12, Math.min(12, (diffY / 10) * -1));
        const rotateY = Math.max(-15, Math.min(15, diffX / 8));
        const baseFlip = isFlipped ? 180 : 0;
        card3D.style.transform = `perspective(1000px) rotateX(${rotateX.toFixed(1)}deg) rotateY(${(baseFlip + rotateY).toFixed(1)}deg)`;
      }
    }, { passive: true });

    card3D?.addEventListener('touchend', (e) => {
      const touchEndX = e.changedTouches[0].screenX;
      isTouchActive = false;
      const baseFlip = isFlipped ? 180 : 0;
      card3D.style.transform = `perspective(1000px) rotateX(0deg) rotateY(${baseFlip}deg)`;
      if (Math.abs(touchEndX - touchStartX) > 45) {
        toggleFlipCard();
      }
    }, { passive: true });

    pane.querySelector('#btnRequestDetailUpdate')?.addEventListener('click', () => {
      openRequestStudentUpdateModal();
    });

    pane.querySelector('#btnStudentChangePassword')?.addEventListener('click', () => {
      openStudentPasswordModal();
    });

    // Password Eye Toggles for Inline Form
    pane.querySelectorAll('.btn-toggle-security-pw').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = btn.getAttribute('data-target');
        const input = document.getElementById(targetId);
        if (input) {
          const isPassword = input.type === 'password';
          input.type = isPassword ? 'text' : 'password';
          const icon = btn.querySelector('i');
          if (icon) {
            icon.classList.toggle('fa-eye', !isPassword);
            icon.classList.toggle('fa-eye-slash', isPassword);
          }
        }
      });
    });

    // Real-time password matching check
    const p1In = pane.querySelector('#studentInlineNewPassword');
    const p2In = pane.querySelector('#studentInlineConfirmPassword');
    const matchHint = pane.querySelector('#passwordMatchHint');
    function checkMatch() {
      if (!p1In || !p2In || !matchHint) return;
      const v1 = p1In.value;
      const v2 = p2In.value;
      if (!v2) {
        matchHint.innerHTML = 'Must match the new password above.';
        matchHint.style.color = '#6B7280';
        p2In.style.borderColor = '#D1D5DB';
      } else if (v1 === v2 && v1.length >= 4) {
        matchHint.innerHTML = '<i aria-hidden="true" class="fa-solid fa-circle-check" style="color: #10B981;"></i> Passwords match perfectly!';
        matchHint.style.color = '#059669';
        p2In.style.borderColor = '#10B981';
      } else {
        matchHint.innerHTML = '<i aria-hidden="true" class="fa-solid fa-circle-exclamation" style="color: #EF4444;"></i> Passwords do not match.';
        matchHint.style.color = '#DC2626';
        p2In.style.borderColor = '#EF4444';
      }
    }
    p1In?.addEventListener('input', checkMatch);
    p2In?.addEventListener('input', checkMatch);

    pane.querySelector('#studentInlinePasswordForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const p1 = document.getElementById('studentInlineNewPassword')?.value || '';
      const p2 = document.getElementById('studentInlineConfirmPassword')?.value || '';
      if (p1.length < 4) {
        alert('Password must be at least 4 characters long.');
        return;
      }
      if (p1 !== p2) {
        alert('Passwords do not match. Please enter the same password in both fields.');
        return;
      }
      const submitBtn = e.target.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i aria-hidden="true" class="fa-solid fa-spinner fa-spin"></i> Saving...';
      }
      try {
        await AppState.updateStudentPassword(p1);
        const successEl = document.getElementById('studentInlinePasswordSuccessMsg');
        if (successEl) {
          successEl.style.display = 'flex';
          successEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        const statusPill = document.getElementById('studentPasswordStatusPill');
        if (statusPill) {
          statusPill.style.background = '#ECFDF5';
          statusPill.style.color = '#065F46';
          statusPill.style.borderColor = '#10B981';
          statusPill.innerHTML = '<i aria-hidden="true" class="fa-solid fa-circle-check"></i> Custom Password Active';
        }
        alert('✅ Password updated successfully! No verification was needed. You can now use this password to login.');
        const in1 = document.getElementById('studentInlineNewPassword');
        const in2 = document.getElementById('studentInlineConfirmPassword');
        if (in1) in1.value = '';
        if (in2) {
          in2.value = '';
          in2.style.borderColor = '#D1D5DB';
        }
        if (matchHint) {
          matchHint.innerHTML = 'Must match the new password above.';
          matchHint.style.color = '#6B7280';
        }
      } catch (err) {
        alert('Failed to update password: ' + err.message);
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i aria-hidden="true" class="fa-solid fa-floppy-disk"></i> Update Password Instantly';
        }
      }
    });

    pane.querySelector('#btnEditPendingReq')?.addEventListener('click', () => {
      openRequestStudentUpdateModal();
    });

    pane.querySelector('#btnCancelPendingReq')?.addEventListener('click', async () => {
      if (confirm('Cancel your pending profile update request?')) {
        // Cloud delete first, and its result checked: mutate() returns failures
        // rather than throwing, so discarding it removed the request from this
        // student's view while it stayed Pending in the admin's queue.
        if (pendingReq?.id && typeof SupabaseSync !== 'undefined' && SupabaseSync.mutate) {
          const result = await SupabaseSync.mutate('student_requests', 'delete', null, { where: { request_id: pendingReq.id } });
          if (!result || result.success !== true) {
            alert(`⚠️ Your request could not be cancelled${result?.error ? `: ${result.error}` : ''}. It is still pending review. Please check your connection and try again.`);
            return;
          }
          if (!Array.isArray(result.data) || result.data.length === 0) {
            // The gateway returns the deleted rows; zero rows means the WHERE
            // matched nothing — the cloud row is already gone or processed.
            alert('ℹ️ This request is no longer pending in the system (it may have just been processed). Refreshing your dashboard.');
            const allReqsSynced = AppState.getRequests().filter(r => !(isStudentRequestMatch(r, s) && String(r.status || '').toLowerCase() === 'pending'));
            await AppState.saveRequests(allReqsSynced);
            renderStudentDashboard();
            return;
          }
        }
        const allReqs = AppState.getRequests().filter(r => !(isStudentRequestMatch(r, s) && String(r.status || '').toLowerCase() === 'pending'));
        await AppState.saveRequests(allReqs);
        renderStudentDashboard();
      }
    });

    // 1-Click Mobile/Desktop Push Notification Activation from Student Profile
    const btnPush = pane.querySelector('#btnStudentTogglePush');
    if (btnPush) {
      btnPush.addEventListener('click', async () => {
        if (!window.PushClient) {
          showToast('Push notifications service not initialized.', 'warning');
          return;
        }
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          showToast('🔔 Sending test alert to your device...', 'info');
          await window.PushClient.syncSubscription(s);
          await window.PushClient.sendLocalTestNotification('🔔 Pragyan Institute Alerts Active', 'Notification test confirmed! Real-time alerts are live.');
          await window.PushClient.sendCloudTestNotification();
          showToast('✅ Test alert sent! Check your notification bar or lockscreen.', 'success');
          return;
        }
        btnPush.disabled = true;
        btnPush.innerHTML = '<i aria-hidden="true" class="fa-solid fa-spinner fa-spin"></i> Activating...';
        const ok = await window.PushClient.requestAndSubscribe(s);
        if (ok) {
          showToast('🎉 Mobile lockscreen push notifications enabled!', 'success');
          btnPush.disabled = false;
          btnPush.style.backgroundColor = '#059669';
          btnPush.innerHTML = '<i aria-hidden="true" class="fa-solid fa-bell"></i> <span>🟢 Alerts Active</span>';
          await window.PushClient.sendLocalTestNotification('🎉 Notifications Enabled!', 'You will receive instant alerts for tests, attendance, and fee receipts.');
          await window.PushClient.sendCloudTestNotification();
        } else {
          btnPush.disabled = false;
          btnPush.innerHTML = '<i aria-hidden="true" class="fa-solid fa-bell"></i> <span>Enable Notifications</span>';
          if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
            showToast('⚠️ Notifications are blocked in your browser settings. Please allow notifications for this site.', 'warning');
          }
        }
      });
    }

    // Mount floating / top student push permission prompt
    if (window.PushClient && typeof window.PushClient.renderStudentPrompt === 'function') {
      window.PushClient.renderStudentPrompt(pane, s);
    }
  }

  function openStudentPasswordModal() {
    document.getElementById('studentPasswordModal')?.remove();
    const modalHtml = `
      <div class="inner-modal-backdrop active" id="studentPasswordModal">
        <div class="inner-modal-content" style="max-width: 480px;">
          <div class="inner-modal-header">
            <h3><i aria-hidden="true" class="fa-solid fa-key" style="color: #2563EB;"></i> Change Portal Password</h3>
            <button type="button" aria-label="Close student password dialog" class="btn-close-inner" onclick="document.getElementById('studentPasswordModal').remove()"><i aria-hidden="true" class="fa-solid fa-xmark"></i></button>
          </div>
          <div style="font-size: 0.86rem; color: #4B5563; margin-bottom: 1.1rem; line-height: 1.55;">
            Enter your new login password below. <strong>No verification or OTP is required.</strong> Once saved, you can log in immediately.
          </div>
          <form id="studentModalPasswordForm" class="student-password-form">
            <div class="form-group-security" style="margin-bottom: 0.9rem;">
              <label for="stuModalNewPass" class="security-label">
                <i aria-hidden="true" class="fa-solid fa-key"></i> New Password
              </label>
              <div class="security-input-wrap">
                <input type="password" id="stuModalNewPass" class="portal-input security-input" required minlength="4" placeholder="Enter new password (min. 4 characters)" autocomplete="new-password">
                <button type="button" class="btn-toggle-security-pw" data-target="stuModalNewPass" aria-label="Toggle password visibility">
                  <i aria-hidden="true" class="fa-regular fa-eye"></i>
                </button>
              </div>
              <div class="security-hint">Minimum 4 characters.</div>
            </div>
            <div class="form-group-security" style="margin-bottom: 1.25rem;">
              <label for="stuModalConfirmPass" class="security-label">
                <i aria-hidden="true" class="fa-solid fa-lock"></i> Confirm New Password
              </label>
              <div class="security-input-wrap">
                <input type="password" id="stuModalConfirmPass" class="portal-input security-input" required minlength="4" placeholder="Re-enter new password to confirm" autocomplete="new-password">
                <button type="button" class="btn-toggle-security-pw" data-target="stuModalConfirmPass" aria-label="Toggle password visibility">
                  <i aria-hidden="true" class="fa-regular fa-eye"></i>
                </button>
              </div>
              <div class="security-hint" id="modalPasswordMatchHint">Must match the new password above.</div>
            </div>
            <button type="submit" class="btn btn-save-password" style="width: 100%;">
              <i aria-hidden="true" class="fa-solid fa-check"></i> Update Password Instantly
            </button>
          </form>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modalEl = document.getElementById('studentPasswordModal');
    wireModalA11y(modalEl);
    modalEl.querySelectorAll('.btn-toggle-security-pw').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = btn.getAttribute('data-target');
        const input = document.getElementById(targetId);
        if (input) {
          const isPassword = input.type === 'password';
          input.type = isPassword ? 'text' : 'password';
          const icon = btn.querySelector('i');
          if (icon) {
            icon.classList.toggle('fa-eye', !isPassword);
            icon.classList.toggle('fa-eye-slash', isPassword);
          }
        }
      });
    });

    const mP1 = document.getElementById('stuModalNewPass');
    const mP2 = document.getElementById('stuModalConfirmPass');
    const mHint = document.getElementById('modalPasswordMatchHint');
    function checkModalMatch() {
      if (!mP1 || !mP2 || !mHint) return;
      const v1 = mP1.value;
      const v2 = mP2.value;
      if (!v2) {
        mHint.innerHTML = 'Must match the new password above.';
        mHint.style.color = '#6B7280';
        mP2.style.borderColor = '#D1D5DB';
      } else if (v1 === v2 && v1.length >= 4) {
        mHint.innerHTML = '<i aria-hidden="true" class="fa-solid fa-circle-check" style="color: #10B981;"></i> Passwords match perfectly!';
        mHint.style.color = '#059669';
        mP2.style.borderColor = '#10B981';
      } else {
        mHint.innerHTML = '<i aria-hidden="true" class="fa-solid fa-circle-exclamation" style="color: #EF4444;"></i> Passwords do not match.';
        mHint.style.color = '#DC2626';
        mP2.style.borderColor = '#EF4444';
      }
    }
    mP1?.addEventListener('input', checkModalMatch);
    mP2?.addEventListener('input', checkModalMatch);

    document.getElementById('studentModalPasswordForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const p1 = document.getElementById('stuModalNewPass')?.value || '';
      const p2 = document.getElementById('stuModalConfirmPass')?.value || '';
      if (p1.length < 4) {
        alert('Password must be at least 4 characters long.');
        return;
      }
      if (p1 !== p2) {
        alert('Passwords do not match. Please re-enter the same password.');
        return;
      }
      const submitBtn = e.target.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i aria-hidden="true" class="fa-solid fa-spinner fa-spin"></i> Updating...';
      }
      try {
        await AppState.updateStudentPassword(p1);
        document.getElementById('studentPasswordModal')?.remove();
        alert('✅ Password updated successfully! No verification was needed. You can now use your new password to sign in.');
        renderStudentDashboard();
      } catch (err) {
        alert('Failed to update password: ' + err.message);
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i aria-hidden="true" class="fa-solid fa-check"></i> Update Password Instantly';
        }
      }
    });
  }

  function printStudentVIPCard(student) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const initialLetter = sanitizeInput(student.name?.charAt(0) || 'S');
    const safeName = sanitizeInput(student.name);
    const safeRoll = sanitizeInput(student.rollNo);
    const safeClass = sanitizeInput(student.className);
    const safeMobile = sanitizeInput(student.mobile);
    const safeDob = formatDate(student.dob);
    const safeGuardian = sanitizeInput(student.guardianName || 'Parent / Guardian');
    const safePhoto = sanitizeUrl(student.photoUrl);

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Student ID Pass - ${safeName} - Pragyan Institute</title>
          <style>
            @page { size: A4 portrait; margin: 15mm; }
            body { font-family: 'Segoe UI', Arial, sans-serif; background: #FAF9F6; margin: 0; padding: 20px; display: flex; flex-direction: column; align-items: center; }
            .id-card-print { width: 340px; height: 220px; border-radius: 14px; background: #064E3B; color: #fff; padding: 16px; box-sizing: border-box; position: relative; border: 2px solid #F59E0B; margin-bottom: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
            .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 8px; }
            .title { font-size: 13px; font-weight: 800; letter-spacing: 0.5px; }
            .body { display: flex; gap: 12px; margin-top: 10px; }
            .photo { width: 68px; height: 68px; border-radius: 8px; border: 2px solid #F59E0B; object-fit: cover; background: #04382B; }
            .info { flex: 1; font-size: 11px; line-height: 1.45; }
            .name { font-size: 14px; font-weight: 800; color: #FCD34D; margin-bottom: 3px; }
            .badge { display: inline-block; background: #10B981; color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: bold; }
            .quote { margin-top: 8px; font-style: italic; font-size: 9px; color: #FDE68A; text-align: center; border-top: 1px dashed rgba(255,255,255,0.2); padding-top: 5px; }
            .footer { margin-top: 6px; font-size: 8.5px; text-align: center; color: rgba(255,255,255,0.85); display: flex; justify-content: space-between; }
          </style>
        </head>
        <body>
          <h2 style="color: #064E3B; margin-bottom: 4px;">PRAGYAN INSTITUTE LALGANJ</h2>
          <p style="color: #6B7280; font-size: 12px; margin-top: 0; margin-bottom: 20px;">Official Student ID Pass — Academic Session 2026–27</p>
          <div class="id-card-print">
            <div class="header">
              <div class="title">PRAGYAN INSTITUTE</div>
              <span class="badge">SCHOLAR PASS</span>
            </div>
            <div class="body">
              ${safePhoto ? `<img src="${safePhoto}" class="photo" alt="Photo">` : `<div class="photo" style="display:flex;align-items:center;justify-content:center;font-size:24px;color:#fff;">${initialLetter}</div>`}
              <div class="info">
                <div class="name">${safeName}</div>
                <div><strong>Roll No:</strong> #${safeRoll}</div>
                <div><strong>Class:</strong> ${safeClass}</div>
                <div><strong>DOB:</strong> ${safeDob}</div>
                <div><strong>Contact:</strong> ${safeMobile}</div>
                <div><strong>Guardian:</strong> ${safeGuardian}</div>
              </div>
            </div>
            <div class="quote">“Education is the most powerful weapon which you can use to change the world.”</div>
            <div class="footer">
              <span>Director: Chandan Kumar</span>
              <span>Academic Head: Prof. Ravi Ranjan</span>
            </div>
          </div>
          <script>window.onload = function() { window.print(); };<\/script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  // 2. Student Tab: Batch Detail
  function renderStudentBatchTab() {
    const s = AppState.currentUser;
    const pane = document.getElementById('studentTabPane-batch');
    if (!pane || !s) return;

    const batches = AppState.getBatches();
    const studentBatch = s.batchName || s.className || s.class_name || '';

    const studentBatchKey = getBatchCategoryKey(studentBatch);
    const cfg = academicConfig();
    const resolvedBatchObj = cfg?.resolveBatch ? cfg.resolveBatch(studentBatch) : null;
    const myBatch = batches.find(b => {
      const bKey = getBatchCategoryKey(b.name || b.batch_name || b.className || b.id || b.batch_id || b.batchId || '');
      return bKey && (bKey === studentBatchKey);
    }) || resolvedBatchObj || batches[0] || {};

    const batchId = myBatch.batchId || myBatch.batch_id || myBatch.id || resolvedBatchObj?.batchId || resolvedBatchObj?.id || studentBatchKey || 'BAT-10';
    const batchTiming = myBatch.timing || myBatch.timings || (resolvedBatchObj ? resolvedBatchObj.timing : 'Contact Institute') || 'Contact Institute';
    const batchRoom = myBatch.room || myBatch.room_no || (resolvedBatchObj ? resolvedBatchObj.room : 'As allotted') || 'As allotted';

    let enrolledBatchesList = (cfg && cfg.resolveBatches)
      ? cfg.resolveBatches(studentBatch)
      : [];

    if (enrolledBatchesList.length === 0) {
      const single = (cfg && cfg.resolveBatch) ? cfg.resolveBatch(studentBatch) : null;
      if (single) enrolledBatchesList.push(single);
      else if (batches.length > 0) enrolledBatchesList.push(batches[0]);
    }

    const isMultiClass = enrolledBatchesList.length > 1;
    const totalEnrolledMonthlyFee = enrolledBatchesList.reduce((sum, b) => sum + (Number(b.monthlyFee ?? b.monthly_fee) || 0), 0);

    // Determine current day in IST
    const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    let todayIst = 'Monday';
    try {
      todayIst = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'Asia/Kolkata' }).format(new Date());
    } catch(e) {}
    if (!AppState._activeStudentScheduleDay) {
      AppState._activeStudentScheduleDay = todayIst;
    }
    const currentSelectedDay = AppState._activeStudentScheduleDay;

    // Check for active holidays affecting any of this student's enrolled batches
    const rawHolidays = AppState.getInstituteHolidays ? AppState.getInstituteHolidays() : [];
    const allHolidays = Array.isArray(rawHolidays) ? rawHolidays : [];
    const todayDateStr = new Date().toISOString().split('T')[0];
    const activeHolidays = allHolidays.filter(h => {
      if (!h || typeof h !== 'object') return false;
      const target = (h.target_batch || h.targetBatch || 'ALL').trim().toUpperCase();
      const matchBatch = target === 'ALL' || enrolledBatchesList.some(b => {
        const bKey = b.batchId || b.id || '';
        return target === bKey.toUpperCase() || getBatchCategoryKey(target) === getBatchCategoryKey(bKey);
      });
      const sDate = h.start_date || h.startDate || '';
      const eDate = h.end_date || h.endDate || sDate;
      return matchBatch && sDate <= todayDateStr && todayDateStr <= eDate;
    });

    // Fetch dynamic schedules from database / AppState for ALL enrolled batches
    const isWeeklyRecurringActive = enrolledBatchesList.some(b => AppState.isRecurringWeekly ? AppState.isRecurringWeekly(b.batchId || b.id) : true);
    const rawSchedules = AppState.getClassSchedules ? AppState.getClassSchedules() : [];
    const allSchedules = Array.isArray(rawSchedules) ? rawSchedules : [];
    let renderedScheduleItems = [];
    const allTeachersSet = new Set();
    const allSubjectsList = [];

    enrolledBatchesList.forEach(bObj => {
      const bId = bObj.batchId || bObj.id || '';
      const bKey = getBatchCategoryKey(bId);
      const bDb = batches.find(db => getBatchCategoryKey(db.batch_id || db.id || db.name || '') === bKey) || bObj;
      const bTiming = bDb.timing || bDb.timings || bObj.timing || 'Contact Institute';
      const bRoom = bDb.room || bDb.room_no || bObj.room || 'As allotted';
      const bTeacher = bDb.teacher || (bObj.teachers ? bObj.teachers.map(titleCaseName).join(' & ') : 'Faculty Mentors');
      const teacherList = bTeacher.split(/[&,]/).map(t => t.trim()).filter(Boolean);
      teacherList.forEach(t => allTeachersSet.add(t));

      const batchMap = (typeof BATCH_SUBJECTS !== 'undefined' && BATCH_SUBJECTS) ? BATCH_SUBJECTS : {};
      const batchSubjects = (Array.isArray(bDb.subjects) && bDb.subjects.length > 0)
        ? bDb.subjects.map(sub => typeof sub === 'string' ? sub : (sub.name || ''))
        : (Array.isArray(myBatch.subjects) && myBatch.subjects.length > 0)
          ? myBatch.subjects.map(sub => typeof sub === 'string' ? sub : (sub.name || ''))
          : (batchMap[bKey] || batchMap[bId] || []);
      batchSubjects.forEach(sub => {
        if (!allSubjectsList.includes(sub)) allSubjectsList.push(sub);
      });

      let daySchedules = allSchedules.filter(sch => {
        if (!sch || typeof sch !== 'object') return false;
        const schB = (sch.batch_id || sch.batchId || '').trim();
        const matchB = (schB === bId) ||
                       (schB === bKey) ||
                       (getBatchCategoryKey(schB) === bKey) ||
                       (schB.toLowerCase() === (bObj.name || '').toLowerCase()) ||
                       (schB.toLowerCase() === (bId || '').toLowerCase());
        const matchD = (sch.day_of_week || sch.dayOfWeek || '').toLowerCase() === currentSelectedDay.toLowerCase();
        return matchB && matchD;
      });

      if (daySchedules.length > 0) {
        daySchedules.sort((a, b) => (Number(a.sort_order || a.sortOrder || 1) - Number(b.sort_order || b.sortOrder || 1)));
        daySchedules.forEach(sch => {
          renderedScheduleItems.push({
            batchName: bObj.name || bObj.className || 'Batch Class',
            batchId: bId,
            subject: sch.subject,
            time: (sch.start_time && sch.end_time) ? `${sch.start_time} – ${sch.end_time}` : (sch.start_time || bTiming),
            teacher: sch.teacher || bTeacher || 'Assigned Faculty',
            room: sch.room || bRoom,
            isCancelled: !!sch.is_cancelled,
            sortOrder: Number(sch.sort_order || sch.sortOrder || 1)
          });
        });
      } else if (currentSelectedDay !== 'Sunday' || isWeeklyRecurringActive) {
        const slotList = BATCH_SLOTS[bKey] || BATCH_SLOTS[bId] || [];
        batchSubjects.forEach((subject, i) => {
          renderedScheduleItems.push({
            batchName: bObj.name || bObj.className || 'Batch Class',
            batchId: bId,
            subject,
            time: slotList[i] || bTiming,
            teacher: teacherList[i % teacherList.length] || 'Faculty Mentors',
            room: bRoom,
            isCancelled: false,
            sortOrder: i + 1
          });
        });
      }
    });

    const combinedTeacherList = Array.from(allTeachersSet);

    pane.innerHTML = `
      ${isMultiClass ? `
        <div class="dash-card batch-overview-card" style="border: 2px solid #059669; background: linear-gradient(135deg, #F0FDF4 0%, #FFFFFF 100%); margin-bottom: 1.25rem;">
          <div class="batch-info-header" style="border-bottom: 1.5px solid #86EFAC; padding-bottom: 0.85rem; margin-bottom: 1rem;">
            <div>
              <span class="section-tag" style="background: #D1FAE5; color: #065F46; font-weight: 800; padding: 0.25rem 0.65rem; border-radius: 99px; font-size: 0.8rem;">
                <i aria-hidden="true" class="fa-solid fa-layer-group"></i> Multi-Class Scholar Enrollment
              </span>
              <div class="batch-title-tag" style="color: #064E3B; font-size: 1.35rem; margin-top: 0.4rem;">
                ${escapeHtml(enrolledBatchesList.map(b => b.name).join(' + '))}
              </div>
              <p style="color: #166534; font-size: 0.88rem; margin-top: 0.25rem;">
                Active across <strong>${enrolledBatchesList.length} academic classes</strong> • Combined Standard Rate: <strong>₹${totalEnrolledMonthlyFee.toLocaleString('en-IN')}/mo</strong>
              </p>
            </div>
            <span class="pill-item pill-emerald"><i aria-hidden="true" class="fa-solid fa-user-check"></i> ${enrolledBatchesList.length} Classes Active</span>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem;">
            ${enrolledBatchesList.map((b, idx) => {
              const bKey = getBatchCategoryKey(b.batchId || b.id);
              const bDb = batches.find(db => getBatchCategoryKey(db.batch_id || db.id || db.name || '') === bKey) || b;
              const bTiming = bDb.timing || bDb.timings || b.timing || 'Contact Institute';
              const bRoom = bDb.room || bDb.room_no || b.room || 'As allotted';
              const bTeacher = bDb.teacher || (b.teachers ? b.teachers.map(titleCaseName).join(' & ') : 'Faculty Mentors');
              const bFee = Number(bDb.monthlyFee ?? bDb.monthly_fee ?? b.monthlyFee ?? 0);

              return `
                <div style="background: #ffffff; border: 1.5px solid #BBF7D0; border-radius: 10px; padding: 1rem; box-shadow: 0 2px 6px rgba(6,78,59,0.06);">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                    <span style="font-weight: 800; font-size: 0.95rem; color: #065F46;">
                      ${batchIcon(b.batchId)} Class ${idx + 1}: ${escapeHtml(b.name)}
                    </span>
                    <span style="background: #ECFDF5; color: #065F46; padding: 2px 7px; border-radius: 4px; font-weight: 700; font-size: 0.8rem;">
                      ₹${bFee.toLocaleString('en-IN')}/mo
                    </span>
                  </div>
                  <div style="font-size: 0.82rem; color: #4B5563; line-height: 1.5;">
                    <div><i aria-hidden="true" class="fa-solid fa-clock" style="color: #059669; width: 16px;"></i> ${escapeHtml(bTiming)}</div>
                    <div><i aria-hidden="true" class="fa-solid fa-door-open" style="color: #059669; width: 16px;"></i> ${escapeHtml(bRoom)}</div>
                    <div><i aria-hidden="true" class="fa-solid fa-chalkboard-user" style="color: #059669; width: 16px;"></i> ${escapeHtml(bTeacher)}</div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      ` : `
        <div class="dash-card batch-overview-card" style="margin-bottom: 1.25rem;">
          <div class="batch-info-header">
            <div>
              <span class="section-tag" style="margin-bottom: 0.4rem;"><i aria-hidden="true" class="fa-solid fa-chalkboard-user"></i> Enrolled Batch</span>
              <div class="batch-title-tag">${escapeHtml(enrolledBatchesList[0]?.name || studentBatch)}</div>
              <p style="color: var(--text-muted); font-size: 0.9rem; margin-top: 0.25rem;">
                <i aria-hidden="true" class="fa-solid fa-clock" style="color: var(--primary-emerald);"></i> ${escapeHtml(batches.find(b => getBatchCategoryKey(b.batch_id || b.id || b.name || '') === getBatchCategoryKey(enrolledBatchesList[0]?.batchId))?.timing || enrolledBatchesList[0]?.timing || 'Contact Institute')} &nbsp;|&nbsp; 
                <i aria-hidden="true" class="fa-solid fa-door-open" style="color: var(--primary-emerald);"></i> Classroom: ${escapeHtml(batches.find(b => getBatchCategoryKey(b.batch_id || b.id || b.name || '') === getBatchCategoryKey(enrolledBatchesList[0]?.batchId))?.room || enrolledBatchesList[0]?.room || 'As allotted')}
              </p>
            </div>
            <span class="pill-item pill-emerald"><i aria-hidden="true" class="fa-solid fa-user-check"></i> Active Session</span>
          </div>

          <div class="batch-overview-metrics-grid">
            <div class="batch-metric-box">
              <div class="batch-metric-label">MONTHLY FEE</div>
              <div class="batch-metric-value fee-val">₹${(enrolledBatchesList[0]?.monthlyFee || 0).toLocaleString()}</div>
            </div>
            <div class="batch-metric-box">
              <div class="batch-metric-label">BATCH CODE</div>
              <div class="batch-metric-value">${escapeHtml(enrolledBatchesList[0]?.batchId || 'BAT-10')}</div>
            </div>
            <div class="batch-metric-box">
              <div class="batch-metric-label">STUDENTS IN BATCH</div>
              <div class="batch-metric-value">${AppState.getStudents().filter(st => getBatchCategoryKey(st.className || st.batchName || st.class_name || '') === getBatchCategoryKey(enrolledBatchesList[0]?.batchId)).length || '—'}</div>
            </div>
          </div>
        </div>
      `}

      ${activeHolidays.length > 0 ? `
        <div class="schedule-holiday-banner" style="background: linear-gradient(135deg, #FEF3C7 0%, #FFFBEB 100%); border: 1.5px solid #F59E0B; border-radius: 12px; padding: 1rem 1.25rem; margin-bottom: 1.25rem; display: flex; align-items: center; gap: 1rem;">
          <div style="font-size: 2rem;">🏖️</div>
          <div>
            <div style="font-weight: 800; font-size: 1.05rem; color: #92400E;">
              ${escapeHtml(activeHolidays[0].title || 'Institute Holiday')}
            </div>
            <div style="font-size: 0.86rem; color: #B45309; margin-top: 0.15rem;">
              ${escapeHtml(activeHolidays[0].description || 'Official Institute holiday declared by administration.')}
              ${activeHolidays[0].start_date ? ` &bull; <strong>${activeHolidays[0].start_date} to ${activeHolidays[0].end_date || activeHolidays[0].start_date}</strong>` : ''}
            </div>
          </div>
        </div>
      ` : ''}

      <div class="profile-grid-layout">
        <div class="dash-card student-timetable-card">
          <div class="dash-card-header" style="flex-direction: column; align-items: stretch; gap: 0.75rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
              <div class="dash-card-title"><i aria-hidden="true" class="fa-solid fa-calendar-days"></i> Daily Class Timetable</div>
              <div style="display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;">
                ${isWeeklyRecurringActive ? `
                  <span class="status-pill status-verified" style="font-size: 0.76rem; padding: 2px 7px; display: inline-flex; align-items: center; gap: 0.3rem;">
                    <i aria-hidden="true" class="fa-solid fa-repeat"></i> Weekly Repeating Routine (Mon–Sun)
                  </span>
                ` : ''}
                <span class="student-timetable-live-badge" style="font-size: 0.8rem; color: var(--text-muted); background: #FAF9F6; padding: 0.2rem 0.55rem; border-radius: 6px; border: 1px solid var(--border-sand); font-weight: 600; display: inline-flex; align-items: center; gap: 0.35rem;">
                  <i aria-hidden="true" class="fa-solid fa-bolt" style="color: var(--primary-emerald);"></i> Live Supabase Cloud
                </span>
              </div>
            </div>

            <!-- Day Selector Tabs -->
            <div class="schedule-day-tabs">
              ${daysOfWeek.map(d => {
                const isActive = d.toLowerCase() === currentSelectedDay.toLowerCase();
                const isToday = d.toLowerCase() === todayIst.toLowerCase();
                return `
                  <button type="button" class="btn btn-day-tab ${isActive ? 'active' : ''} ${isToday ? 'is-today-tab' : ''}" data-day="${d}" aria-label="Select ${d}">
                    <span>${d.slice(0, 3)}</span>
                    ${isToday ? '<span class="today-indicator-dot" title="Today"></span>' : ''}
                  </button>
                `;
              }).join('')}
            </div>
          </div>

          <div class="schedule-list">
            ${renderedScheduleItems.length === 0 ? `
              <div class="schedule-empty-card" style="text-align: center; justify-content: center; padding: 2.25rem 1.5rem; background: var(--bg-surface-cream); border-radius: 12px; border: 1.5px dashed var(--border-sand);">
                <i aria-hidden="true" class="fa-solid fa-bed" style="font-size: 2rem; margin-bottom: 0.5rem; display: block; color: var(--text-sand);"></i>
                <h4 style="font-weight: 800; font-size: 1.05rem; color: var(--text-mahogany); margin-bottom: 0.25rem;">No Classes Scheduled for ${escapeHtml(currentSelectedDay)}</h4>
                <div style="font-size: 0.82rem; color: var(--text-muted);">Enjoy your break or revise previous lecture topics!</div>
              </div>
            ` : renderedScheduleItems.map(item => `
              <div class="schedule-row ${item.isCancelled ? 'schedule-row-cancelled' : ''}">
                <div class="schedule-row-left">
                  <div class="schedule-subject-icon ${item.isCancelled ? 'icon-cancelled' : ''}">
                    <i class="${item.isCancelled ? 'fa-solid fa-ban' : 'fa-solid fa-book-bookmark'}" aria-hidden="true"></i>
                  </div>
                  <div class="schedule-subject-details">
                    <div class="schedule-subject-title ${item.isCancelled ? 'cancelled-text' : ''}" style="display: flex; align-items: center; flex-wrap: wrap; gap: 0.35rem;">
                      <strong>${escapeHtml(item.subject)}</strong>
                      ${isMultiClass ? `<span style="background: #DCFCE7; color: #166534; border: 1px solid #86EFAC; font-size: 0.75rem; font-weight: 700; padding: 1px 7px; border-radius: 4px;">${escapeHtml(item.batchName)}</span>` : ''}
                    </div>
                    <div class="schedule-subject-meta">
                      <span class="schedule-meta-chip"><i aria-hidden="true" class="fa-solid fa-chalkboard-user"></i> ${escapeHtml(item.teacher)}</span>
                      <span class="schedule-meta-chip"><i aria-hidden="true" class="fa-solid fa-door-open"></i> ${escapeHtml(item.room)}</span>
                    </div>
                  </div>
                </div>
                <div class="schedule-row-right">
                  <div class="schedule-time ${item.isCancelled ? 'time-cancelled' : ''}">
                    <i aria-hidden="true" class="fa-regular fa-clock"></i> ${escapeHtml(item.time)}
                  </div>
                  ${item.isCancelled ? '<span class="schedule-cancelled-pill">🚫 Class Off</span>' : ''}
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="dash-card">
          <div class="dash-card-header">
            <div class="dash-card-title"><i aria-hidden="true" class="fa-solid fa-user-tie"></i> Assigned Faculty Mentors</div>
          </div>
          <div style="display: flex; flex-direction: column; gap: 0.75rem;">
            ${combinedTeacherList.map(t => `
              <div style="display: flex; align-items: center; gap: 0.875rem; padding: 0.75rem; background: var(--bg-surface-cream); border-radius: var(--radius-sm);">
                <div style="width: 42px; height: 42px; border-radius: 50%; background: var(--primary-emerald); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size:1.1rem;">
                  ${t.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style="font-weight: 700; font-size: 0.92rem; color: var(--text-mahogany);">${escapeHtml(t)}</div>
                  <div style="font-size: 0.8rem; color: var(--text-muted);">Faculty Mentor — Pragyan Institute</div>
                </div>
              </div>
            `).join('')}
          </div>

          ${allSubjectsList.length > 0 ? `
            <div style="margin-top: 1.25rem; border-top: 1px solid var(--border-sand); padding-top: 1rem;">
              <div style="font-size: 0.85rem; font-weight: 800; color: var(--text-mahogany); margin-bottom: 0.6rem; display: flex; align-items: center; gap: 0.4rem;">
                <i aria-hidden="true" class="fa-solid fa-book-open" style="color: var(--primary-emerald);"></i> Enrolled Core Subjects &amp; Syllabus Topics
              </div>
              <div style="display: flex; flex-wrap: wrap; gap: 0.45rem;">
                ${allSubjectsList.map(sub => `
                  <span style="background: #F0FDF4; border: 1px solid #BBF7D0; color: #166534; font-size: 0.78rem; font-weight: 700; padding: 0.25rem 0.6rem; border-radius: 99px;">
                    ${escapeHtml(sub)}
                  </span>
                `).join('')}
              </div>
            </div>
          ` : ''}
      </div>
    `;

    // Attach day tab change listeners
    pane.querySelectorAll('.btn-day-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        AppState._activeStudentScheduleDay = btn.dataset.day;
        renderStudentBatchTab();
      });
    });
  }

  // 3. Student Tab: Notification Tab
  function interpolateStudentNotice(text, student) {
    if (!text || typeof text !== 'string') return '';
    const s = student || (typeof AppState !== 'undefined' && AppState.currentUser) || {};
    const feeAcc = (typeof AppState !== 'undefined' && AppState.getStudentFeeAccount)
      ? AppState.getStudentFeeAccount(s.id || s.student_id || s.rollNo, s)
      : { totalDue: 0 };
    const rawDue = Number(feeAcc.totalDue ?? s.pendingFee ?? s.pending_fee ?? 0);
    const pendingFormatted = '₹' + rawDue.toLocaleString('en-IN');
    const studentName = s.name || s.student_name || s.studentName || 'Student';
    const className = s.className || s.class_name || s.batchName || s.batch || 'Academic Batch';
    const rollNo = s.rollNo || s.roll_no || s.student_id || s.id || '';
    const studentId = s.student_id || s.id || s.rollNo || s.roll_no || '';
    const guardianName = s.guardianName || s.guardian_name || s.fatherName || s.father_name || 'Guardian';
    const mobile = s.phone || s.mobile || s.contact || s.guardianMobile || s.guardian_mobile || '';
    const dueDate = s.dueDate || s.due_date || '5th of this month';
    const receiptNo = s.receiptNo || s.receipt_no || '';
    const todayStr = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    const monthStr = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

    return text
      .replace(/\{{1,2}\s*(?:student_name|studentName|name|student)\s*\}{1,2}/gi, studentName)
      .replace(/\{{1,2}\s*(?:batch_name|batchName|class_name|className|batch|class|course)\s*\}{1,2}/gi, className)
      .replace(/\{{1,2}\s*(?:pending_dues|pendingDues|dues|pending_fee|pendingFee|amount|fee|balance)\s*\}{1,2}/gi, pendingFormatted)
      .replace(/\{{1,2}\s*(?:roll_no|rollNo|roll_number|roll)\s*\}{1,2}/gi, rollNo)
      .replace(/\{{1,2}\s*(?:student_id|studentId|id|admission_no)\s*\}{1,2}/gi, studentId)
      .replace(/\{{1,2}\s*(?:guardian_name|guardianName|parent_name|father_name|guardian)\s*\}{1,2}/gi, guardianName)
      .replace(/\{{1,2}\s*(?:phone|contact|mobile)\s*\}{1,2}/gi, mobile)
      .replace(/\{{1,2}\s*due_date\s*\}{1,2}/gi, dueDate)
      .replace(/\{{1,2}\s*(?:date|today)\s*\}{1,2}/gi, todayStr)
      .replace(/\{{1,2}\s*month\s*\}{1,2}/gi, monthStr)
      .replace(/\{{1,2}\s*(?:institute_name|instituteName|institute)\s*\}{1,2}/gi, 'Pragyan Institute')
      .replace(/\{{1,2}\s*(?:receipt_no|receiptNo)\s*\}{1,2}/gi, receiptNo);
  }

  // 3. Student Tab: Notification Tab
  function renderStudentNotifications(filterCat = 'all') {
    const pane = document.getElementById('studentTabPane-notifications');
    if (!pane) return;

    const s = AppState.currentUser;
    const allNotices = AppState.getNotices();
    const studentBatch = (s?.className || s?.batchName || '').toLowerCase();

    function getNormalizedBatchCategory(name) {
      if (!name) return 'all';
      const lower = name.toLowerCase();
      if (/\b(10|10th|achiever)\b/.test(lower)) return '10th';
      if (/\b(9|9th|nurture)\b/.test(lower)) return '9th';
      if (/\b(8|8th|alpha)\b/.test(lower)) return '8th';
      if (/\b(junior|junio)\b/.test(lower)) return 'junior';
      if (/\b(all)\b/.test(lower) || lower.trim() === 'all batches') return 'all';
      return lower.trim();
    }

    const studentBatchKey = getNormalizedBatchCategory(studentBatch);

    const relevantNotices = allNotices.filter(n => {
      const target = (n.targetBatch || n.target_batch || 'All Batches').toLowerCase();
      const targetKey = getNormalizedBatchCategory(target);
      return targetKey === 'all' || targetKey === studentBatchKey;
    });

    const filtered = filterCat === 'all'
      ? relevantNotices
      : relevantNotices.filter(n => n.category === filterCat);

    const isPushGranted = typeof Notification !== 'undefined' && Notification.permission === 'granted';

    pane.innerHTML = `
      <!-- Mobile Lockscreen Push Notification Hub Banner -->
      <div class="student-push-banner-card" style="background: linear-gradient(135deg, #064E3B 0%, #047857 100%); border-radius: 12px; padding: 1rem 1.25rem; margin-bottom: 1.25rem; color: #ffffff; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem; box-shadow: 0 4px 14px rgba(6, 78, 59, 0.2);">
        <div style="display: flex; align-items: center; gap: 0.85rem; min-width: 240px; flex: 1;">
          <div style="width: 42px; height: 42px; border-radius: 10px; background: rgba(255, 255, 255, 0.15); display: flex; align-items: center; justify-content: center; font-size: 1.25rem; flex-shrink: 0;">
            <i aria-hidden="true" class="fa-solid fa-bell"></i>
          </div>
          <div>
            <div style="font-weight: 800; font-size: 1rem; color: #FDE68A;">
              ${isPushGranted ? '🟢 Mobile Lockscreen Push Alerts Active' : '🔔 Enable Mobile Lockscreen Notifications'}
            </div>
            <div style="font-size: 0.82rem; color: rgba(255, 255, 255, 0.9); margin-top: 0.15rem;">
              Receive real-time push alerts for exam schedules, daily timetable updates, holiday alerts, and fee receipts directly on your phone.
            </div>
          </div>
        </div>
        <div>
          ${isPushGranted ? `
            <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
              <span style="background: rgba(255, 255, 255, 0.2); border: 1px solid rgba(255, 255, 255, 0.4); padding: 0.45rem 0.95rem; border-radius: 99px; font-size: 0.82rem; font-weight: 700; display: inline-flex; align-items: center; gap: 0.35rem;">
                <i aria-hidden="true" class="fa-solid fa-circle-check" style="color: #6EE7B7;"></i> Active on Device
              </span>
              <button type="button" class="btn" id="btnStudentNoticesTestPush" style="background: #F59E0B; color: #78350F; font-weight: 800; font-size: 0.82rem; padding: 0.45rem 0.9rem; border-radius: 8px; border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 0.35rem; box-shadow: 0 2px 6px rgba(0,0,0,0.15);">
                <i aria-hidden="true" class="fa-solid fa-paper-plane"></i> Send Test Alert
              </button>
            </div>
          ` : `
            <button type="button" class="btn" id="btnStudentNoticesEnablePush" style="background: #F59E0B; color: #78350F; font-weight: 800; font-size: 0.84rem; padding: 0.5rem 1.15rem; border-radius: 8px; border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 0.45rem; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);">
              <i aria-hidden="true" class="fa-solid fa-bell"></i> Enable Notifications
            </button>
          `}
        </div>
      </div>

      <div class="dash-card">
        <div class="dash-card-header">
          <div class="dash-card-title"><i aria-hidden="true" class="fa-solid fa-bullhorn" style="color: var(--primary-emerald);"></i> Institute Notice & Announcement Board</div>
          <span class="tab-badge" style="background: rgba(6, 78, 59, 0.1); color: var(--primary-emerald); font-weight: 700; padding: 0.25rem 0.75rem; border-radius: 99px;">${relevantNotices.length} Announcements</span>
        </div>

        <div class="notifications-filter-bar" style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1.25rem;">
          <button class="notice-filter-chip ${filterCat === 'all' ? 'active' : ''}" data-cat="all">All (${relevantNotices.length})</button>
          <button class="notice-filter-chip ${filterCat === 'exam' ? 'active' : ''}" data-cat="exam">🎯 Exams & Tests (${relevantNotices.filter(n => n.category === 'exam').length})</button>
          <button class="notice-filter-chip ${filterCat === 'general' ? 'active' : ''}" data-cat="general">📢 General Notices (${relevantNotices.filter(n => n.category === 'general').length})</button>
          <button class="notice-filter-chip ${filterCat === 'fees' ? 'active' : ''}" data-cat="fees">💳 Fee Updates (${relevantNotices.filter(n => n.category === 'fees').length})</button>
        </div>

        <div class="notifications-stream">
          ${filtered.length === 0 ? `
            <div style="text-align: center; color: var(--text-muted); padding: 3rem 1rem;">
              <i aria-hidden="true" class="fa-solid fa-bell-slash" style="font-size: 2.5rem; color: #9CA3AF; margin-bottom: 0.75rem;"></i>
              <p style="font-weight: 600;">No announcements in this category.</p>
            </div>
          ` : `
            <div style="display: flex; flex-direction: column; gap: 1rem;">
              ${filtered.map(notice => {
                const displayTitle = interpolateStudentNotice(notice.title, s);
                const displayBody = interpolateStudentNotice(notice.message, s);
                return `
                <div class="notice-item-card ${notice.unread ? 'unread' : ''}" style="border: 1px solid var(--border-sand); border-radius: 10px; padding: 1.15rem; background: #FAF9F6; transition: transform 0.15s ease;">
                  <div class="notice-top-row" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; flex-wrap: wrap; gap: 0.5rem;">
                    <div style="display: flex; gap: 0.5rem; align-items: center;">
                      <span class="notice-cat-badge cat-${notice.category}" style="padding: 0.2rem 0.6rem; border-radius: 99px; font-weight: 700; font-size: 0.8rem; text-transform: uppercase; ${notice.category === 'exam' ? 'background:#FEF3C7; color:#92400E;' : notice.category === 'fees' ? 'background:#D1FAE5; color:#065F46;' : 'background:#EEF2FF; color:#4338CA;'}">
                        ${notice.category === 'exam' ? '🎯 Exam' : notice.category === 'fees' ? '💳 Fees' : '📢 General'}
                      </span>
                      <span style="font-size: 0.8rem; color: var(--text-muted); background: rgba(0,0,0,0.04); padding: 0.15rem 0.5rem; border-radius: 4px;">
                        Target: <strong>${sanitizeInput(notice.targetBatch || notice.target_batch || 'All Batches')}</strong>
                      </span>
                    </div>
                    <span class="notice-date" style="font-size: 0.8rem; color: var(--text-muted);"><i aria-hidden="true" class="fa-regular fa-clock"></i> ${formatDate(notice.date)}</span>
                  </div>
                  <div class="notice-title" style="font-size: 1.05rem; font-weight: 700; color: var(--text-mahogany); margin-bottom: 0.4rem;">${sanitizeInput(displayTitle)}</div>
                  <div class="notice-body" style="font-size: 0.9rem; color: #374151; line-height: 1.6;">${sanitizeInput(displayBody)}</div>
                  ${(notice.attachmentUrl || notice.attachment_url) ? `
                    <div style="margin-top:0.85rem;">
                      ${(/\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(notice.attachmentUrl || notice.attachment_url) || (notice.attachmentUrl || notice.attachment_url).startsWith('data:image/'))
                        ? `<img src="${sanitizeUrl(notice.attachmentUrl || notice.attachment_url)}" style="max-width:100%; max-height:280px; border-radius:8px; border:1px solid #E5E7EB; object-fit:cover; display:block;" alt="Notice Attachment">`
                        : `<a href="${sanitizeUrl(notice.attachmentUrl || notice.attachment_url)}" target="_blank" rel="noopener noreferrer" style="display:inline-flex; align-items:center; gap:0.5rem; background:#065F46; color:#fff; padding:0.45rem 1rem; border-radius:6px; font-weight:700; font-size:0.82rem; text-decoration:none;">
                            <i aria-hidden="true" class="fa-solid fa-file-pdf"></i> View / Download Attached Document
                          </a>`
                      }
                    </div>
                  ` : ''}
                </div>
              `;
              }).join('')}
            </div>
          `}
        </div>
      </div>
    `;

    // Bind chip click events directly
    pane.querySelectorAll('.notice-filter-chip').forEach(btn => {
      btn.onclick = () => {
        const cat = btn.dataset.cat;
        renderStudentNotifications(cat);
      };
    });

    // 1-Click Test Push Button on Notice Tab
    pane.querySelector('#btnStudentNoticesTestPush')?.addEventListener('click', async () => {
      if (!window.PushClient) return;
      showToast('🔔 Sending test notification to this phone...', 'info');
      await window.PushClient.sendLocalTestNotification('🔔 Pragyan Institute Notice Alert', 'Real-time notice push notification test delivered successfully.');
      await window.PushClient.sendCloudTestNotification();
      showToast('✅ Test alert delivered! Check your phone notification bar or lockscreen.', 'success');
    });

    // 1-Click Enable Notifications button on Notice Tab
    pane.querySelector('#btnStudentNoticesEnablePush')?.addEventListener('click', async () => {
      if (!window.PushClient) {
        showToast('Push notifications service not initialized.', 'warning');
        return;
      }
      const btn = pane.querySelector('#btnStudentNoticesEnablePush');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i aria-hidden="true" class="fa-solid fa-spinner fa-spin"></i> Activating...';
      }
      const ok = await window.PushClient.requestAndSubscribe(s);
      if (ok) {
        showToast('🎉 Mobile lockscreen notifications enabled successfully!', 'success');
        await window.PushClient.sendLocalTestNotification('🎉 Pragyan Institute Alerts Active!', 'Real-time notifications confirmed active on this phone.');
        await window.PushClient.sendCloudTestNotification();
        renderStudentNotifications(filterCat);
      } else {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<i aria-hidden="true" class="fa-solid fa-bell"></i> Enable Notifications';
        }
        if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
          showToast('⚠️ Notifications are blocked in browser settings. Please allow notifications for this site.', 'warning');
        }
      }
    });
  }

  // 4. Student Tab: Fee Tab
  function renderStudentFeeTab() {
    const s = AppState.currentUser;
    const pane = document.getElementById('studentTabPane-fees');
    if (!pane || !s) return;

    const feeAcc = AppState.getStudentFeeAccount(s.id || s.student_id || s.rollNo, s);
    const pendingPayReq = AppState.getRequests().find(r => isStudentRequestMatch(r, s) && (r.type === 'payment' || r.req_type === 'PAYMENT_VERIFICATION') && String(r.status || '').toLowerCase() === 'pending');

    const resolvedBatch = (window.PRAGYAN_ACADEMIC && typeof window.PRAGYAN_ACADEMIC.resolveBatch === 'function')
      ? window.PRAGYAN_ACADEMIC.resolveBatch(s.className || s.class_name || s.batchName)
      : null;
    const batchStandardFee = resolvedBatch?.fee || (window.PRAGYAN_ACADEMIC?.monthlyFeeFor ? window.PRAGYAN_ACADEMIC.monthlyFeeFor(s.className || s.class_name) : 1000);
    const paidAmount = Number(s.paidFee ?? s.paid_fee ?? 0);
    const pendingAmount = feeAcc.totalDue;
    const totalCourseFee = Number(s.totalFee ?? s.total_fee ?? 0) > 1
      ? Number(s.totalFee ?? s.total_fee)
      : (paidAmount + pendingAmount > 0 ? (paidAmount + pendingAmount) : batchStandardFee);
    s.totalFee = totalCourseFee;
    s.paidFee = paidAmount;
    s.pendingFee = pendingAmount;

    const clearancePct = Math.min(100, Math.max(0, Math.round((paidAmount / (paidAmount + pendingAmount || 1)) * 100)));
    const strokeDashOffset = (226 - (226 * clearancePct) / 100).toFixed(1);

    let history = Array.isArray(s.feeHistory) ? [...s.feeHistory] : [];
    if (history.length === 0 && (s.paidFee || 0) > 0) {
      history.push({
        receiptNo: `REC-${s.rollNo || '001'}-INIT`,
        date: s.joiningMonth || 'April 2026',
        amount: s.paidFee,
        by: 'CHANDAN KUMAR (Director & Science Lead)',
        mode: 'Course Admission & Tuition Payment',
        note: 'Initial Admission Fee Paid',
        status: 'Paid'
      });
    }

    const latestAdjustment = history.slice().reverse().find(h => 
      h.status === 'Adjusted' || (h.receiptNo && (h.receiptNo.startsWith('ADJ-') || h.receiptNo.startsWith('RATE-') || h.receiptNo.startsWith('DISC-') || h.receiptNo.startsWith('ADDON-')))
    );

    const payUrl = `pay.html?amount=${s.pendingFee}&roll=${encodeURIComponent(s.rollNo || s.roll_no || s.student_id || '')}&name=${encodeURIComponent(s.name || '')}&batch=${encodeURIComponent(s.className || s.class_name || '')}&prev=${feeAcc.previousDue}&curr=${feeAcc.currentMonthFee}`;

    pane.innerHTML = `
      ${pendingPayReq ? `
        <div class="fee-pending-banner">
          <div class="fee-pending-banner-text">
            <div class="fee-pending-banner-title">
              <i aria-hidden="true" class="fa-solid fa-hourglass-half"></i> Online Payment Verification Request Pending
            </div>
            <div class="fee-pending-banner-desc">
              Submitted ₹${(pendingPayReq.paymentDetails?.amount || 0).toLocaleString()} via ${escapeHtml(pendingPayReq.paymentDetails?.mode || 'Online')} (UTR: <strong>${escapeHtml(pendingPayReq.paymentDetails?.utr || '')}</strong>). Admin verification in progress.
            </div>
          </div>
          <span class="status-badge" style="background: #F59E0B; color: #fff; font-weight: 700; font-size: 0.8rem; flex-shrink:0;">⏳ Under Review</span>
        </div>
      ` : ''}

      ${latestAdjustment ? `
        <div class="fee-adjustment-banner">
          <div class="fee-adjustment-banner-left">
            <div class="fee-adjustment-icon-wrap">
              <i aria-hidden="true" class="fa-solid fa-scale-balanced"></i>
            </div>
            <div>
              <div class="fee-adjustment-title">
                ⚖️ Official Fee Structure / Dues Adjusted by Institute
              </div>
              <div class="fee-adjustment-desc">
                <strong>${escapeHtml(latestAdjustment.mode || 'Fee Adjustment')}</strong>: ${escapeHtml(latestAdjustment.note || 'Special fee concession/adjustment approved')} (${escapeHtml(latestAdjustment.date)}) • Authorized by <strong>${escapeHtml(latestAdjustment.by || 'Institute Admin')}</strong>
              </div>
            </div>
          </div>
          <span class="fee-adjustment-badge">
            Verified Adjustment
          </span>
        </div>
      ` : ''}

      <!-- Interactive SVG Circular Fee Clearance Radial Meter -->
      <div class="fee-radial-meter-container">
        <div class="fee-radial-svg-wrap">
          <svg class="fee-radial-svg" viewBox="0 0 84 84" aria-hidden="true">
            <circle class="fee-radial-bg-circle" cx="42" cy="42" r="36"></circle>
            <circle class="fee-radial-progress-circle ${s.pendingFee > 0 ? 'has-dues' : ''}" cx="42" cy="42" r="36" style="stroke-dasharray: 226; stroke-dashoffset: ${strokeDashOffset};"></circle>
          </svg>
          <div class="fee-radial-text-center">
            <span>${clearancePct}%</span>
            <span class="fee-radial-text-sub">${s.pendingFee > 0 ? 'PAID' : 'CLEARED'}</span>
          </div>
        </div>
        <div class="fee-radial-info">
          <h4>${clearancePct === 100 ? '🎉 100% Fees Fully Cleared' : `⚡ ${clearancePct}% Course Tuition Cleared`}</h4>
          <p>${s.pendingFee > 0 ? `Remaining ₹${s.pendingFee.toLocaleString()} pending due (Earlier: ₹${feeAcc.previousDue.toLocaleString()} + Current Month: ₹${feeAcc.currentMonthFee.toLocaleString()}). Pay online or at institute counter.` : 'All tuition dues for the current academic session are cleared. Privilege pass active.'}</p>
        </div>
      </div>

      <div class="fee-summary-cards-grid">
        <div class="fee-stat-box">
          <div class="fee-stat-label">1. Earlier Unpaid Dues</div>
          <div class="fee-stat-value">₹${feeAcc.previousDue.toLocaleString()}</div>
          <div class="fee-stat-sub">बकाया पिछले माह तक</div>
        </div>
        <div class="fee-stat-box">
          <div class="fee-stat-label">2. This Month Tuition Fee</div>
          <div class="fee-stat-value emerald">₹${feeAcc.currentMonthFee.toLocaleString()}</div>
          <div class="fee-stat-sub">इस माह का शुल्क (${escapeHtml(feeAcc.billingMonth || '')})</div>
        </div>
        <div class="fee-stat-box">
          <div class="fee-stat-label">Total Amount Paid</div>
          <div class="fee-stat-value emerald">₹${s.paidFee.toLocaleString()}</div>
          <div class="fee-stat-sub" style="color:#059669; font-weight:600;">Status: Active Paid</div>
        </div>
        <div class="fee-stat-box fee-stat-box-hero ${s.pendingFee > 0 ? 'hero-dues-pending' : 'hero-dues-cleared'}">
          <div class="fee-hero-header">
            <div class="fee-stat-label" style="font-weight: 800; color: ${s.pendingFee > 0 ? '#991B1B' : '#065F46'}; margin:0;">${s.pendingFee > 0 ? 'TOTAL NET PAYABLE DUE' : 'TUITION DUES STATUS'}</div>
            <span class="fee-hero-badge ${s.pendingFee > 0 ? 'badge-due' : 'badge-cleared'}">
              ${s.pendingFee > 0 ? '🔴 Pending Due' : '🟢 All Clear'}
            </span>
          </div>
          <div class="fee-stat-value ${s.pendingFee > 0 ? 'pending' : 'emerald'}">₹${s.pendingFee.toLocaleString()}</div>
          <div class="fee-stat-sub" style="color: ${s.pendingFee > 0 ? '#B91C1C' : '#065F46'}; font-weight: 600;">${s.pendingFee > 0 ? 'कुल देय राशि (Online UPI Supported)' : 'No Pending Dues • Privilege Pass Active ✅'}</div>
          ${s.pendingFee > 0 ? `
            <a href="${payUrl}" target="_blank" class="btn btn-hero-pay">
              <i aria-hidden="true" class="fa-solid fa-bolt"></i> Pay Dues Online via UPI
            </a>
          ` : ''}
        </div>
      </div>

      <div class="dash-card fee-statement-dash-card">
        <div class="dash-card-header fee-statement-card-header">
          <div class="fee-statement-title-wrap">
            <div class="dash-card-title"><i aria-hidden="true" class="fa-solid fa-file-invoice-dollar"></i> Audited Fee Statement &amp; Transaction History</div>
            <span class="fee-statement-ledger-tag">
              <i aria-hidden="true" class="fa-solid fa-shield-halved"></i> Institutional Ledger Verified
            </span>
          </div>
          <div class="fee-statement-header-action">
            ${s.pendingFee > 0 ? `
              <a href="${payUrl}" target="_blank" class="btn btn-emerald btn-dash-pay-online">
                <i aria-hidden="true" class="fa-solid fa-bolt"></i> Pay Online via UPI
              </a>
            ` : '<span class="status-badge status-paid"><i aria-hidden="true" class="fa-solid fa-check-double"></i> All Fees Cleared</span>'}
          </div>
        </div>

        <!-- Desktop Table View (visible on screen > 768px) -->
        <div class="fee-table-desktop-wrap table-responsive">
          <table class="portal-table">
            <thead>
              <tr>
                <th>Receipt / Ref ID</th>
                <th>Date &amp; Time</th>
                <th>Amount</th>
                <th>Collector / Educator</th>
                <th>Mode &amp; Description</th>
                <th>Status</th>
                <th>Receipt Action</th>
              </tr>
            </thead>
            <tbody>
              ${history.length > 0 ? history.map(item => {
                const isAdjustment = item.status === 'Adjusted' || (item.receiptNo && (item.receiptNo.startsWith('ADJ-') || item.receiptNo.startsWith('RATE-') || item.receiptNo.startsWith('DISC-') || item.receiptNo.startsWith('ADDON-')));
                const isOldDue = item.status === 'Pending Due' || (item.receiptNo && item.receiptNo.startsWith('OLD-DUE-'));
                const isDiscount = isAdjustment && (item.amount < 0 || (item.mode && (item.mode.includes('Concession') || item.mode.includes('Discount') || item.mode.includes('Waiver'))));
                const isPenalty = isAdjustment && (item.amount > 0 && (item.mode && (item.mode.includes('Fine') || item.mode.includes('Add-on') || item.mode.includes('Penalty'))));
                const isRate = isAdjustment && (item.mode && item.mode.includes('Rate'));

                let statusPillHtml = '';
                let rowBg = '';
                let amtDisplayHtml = '';

                if (isDiscount) {
                  rowBg = 'background: #FAF5FF;';
                  statusPillHtml = `<span class="status-badge" style="background: linear-gradient(135deg, #EDE9FE, #DDD6FE); color: #5B21B6; border: 1.5px solid #C4B5FD; font-weight: 800; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 0.3rem;"><i aria-hidden="true" class="fa-solid fa-tags"></i> 💜 CONCESSION</span>`;
                  amtDisplayHtml = `<strong style="color: #7C3AED; font-weight: 800;">- ₹${Math.abs(item.amount).toLocaleString()} <span style="font-size: 0.8rem; color: #8B5CF6;">(Waived)</span></strong>`;
                } else if (isPenalty) {
                  rowBg = 'background: #FFFBEB;';
                  statusPillHtml = `<span class="status-badge" style="background: #FEF3C7; color: #92400E; border: 1.5px solid #FCD34D; font-weight: 800; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 0.3rem;"><i aria-hidden="true" class="fa-solid fa-circle-plus"></i> 🧡 FEE ADD-ON</span>`;
                  amtDisplayHtml = `<strong style="color: #D97706; font-weight: 800;">+ ₹${item.amount.toLocaleString()} <span style="font-size: 0.8rem; color: #B45309;">(Added)</span></strong>`;
                } else if (isRate) {
                  rowBg = 'background: #F0FDF4;';
                  statusPillHtml = `<span class="status-badge" style="background: #DCFCE7; color: #166534; border: 1.5px solid #86EFAC; font-weight: 800; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 0.3rem;"><i aria-hidden="true" class="fa-solid fa-gem"></i> 💎 RATE ADJUSTED</span>`;
                  amtDisplayHtml = `<strong style="color: #059669; font-weight: 800;">₹${item.amount.toLocaleString()}/mo</strong>`;
                } else if (isAdjustment) {
                  rowBg = 'background: #F0F9FF;';
                  statusPillHtml = `<span class="status-badge" style="background: #E0F2FE; color: #075985; border: 1.5px solid #7DD3FC; font-weight: 800; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 0.3rem;"><i aria-hidden="true" class="fa-solid fa-scale-balanced"></i> ⚖️ ADJUSTED</span>`;
                  amtDisplayHtml = `<strong style="color: #0284C7; font-weight: 800;">${item.amount < 0 ? `- ₹${Math.abs(item.amount).toLocaleString()}` : `₹${item.amount.toLocaleString()}`}</strong>`;
                } else if (isOldDue) {
                  rowBg = 'background: #FEF2F2;';
                  statusPillHtml = `<span class="status-badge" style="background: #FEE2E2; color: #991B1B; border: 1.5px solid #FCA5A5; font-weight: 800; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 0.3rem;"><i aria-hidden="true" class="fa-solid fa-clock-rotate-left"></i> 🔴 OLD DUE</span>`;
                  amtDisplayHtml = `<strong style="color: #DC2626; font-weight: 800;">₹${item.amount.toLocaleString()}</strong>`;
                } else {
                  rowBg = '';
                  statusPillHtml = `<span class="status-badge" style="background: #D1FAE5; color: #065F46; border: 1.5px solid #6EE7B7; font-weight: 800; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 0.3rem;"><i aria-hidden="true" class="fa-solid fa-circle-check"></i> 🟢 PAID</span>`;
                  amtDisplayHtml = `<strong style="color: #059669; font-weight: 800;">₹${item.amount.toLocaleString()}</strong>`;
                }

                return `
                  <tr style="${rowBg}">
                    <td><strong>${escapeHtml(item.receiptNo)}</strong></td>
                    <td>${escapeHtml(item.date)}</td>
                    <td>${amtDisplayHtml}</td>
                    <td><span style="font-size: 0.82rem; font-weight: 600; color: var(--text-mahogany);"><i aria-hidden="true" class="fa-solid fa-user-tie"></i> ${escapeHtml(item.by || 'CHANDAN KUMAR (Director & Science Lead)')}</span></td>
                    <td>
                      <div><strong>${escapeHtml(item.mode)}</strong></div>
                      ${item.note ? `<div style="font-size: 0.8rem; color: var(--text-muted);">${sanitizeInput(item.note)}</div>` : ''}
                    </td>
                    <td>${statusPillHtml}</td>
                    <td>
                      <button type="button" class="btn btn-download-receipt" data-receipt="${escapeHtml(item.receiptNo)}" style="background: ${isAdjustment ? '#6D28D9' : '#064E3B'}; color: #fff; border: none; padding: 0.35rem 0.75rem; border-radius: 6px; font-size: 0.8rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 0.35rem; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                        <i aria-hidden="true" class="fa-solid fa-file-arrow-down"></i> ${isAdjustment ? 'Download Voucher' : 'Download Receipt'}
                      </button>
                    </td>
                  </tr>
                `;
              }).join('') : `
                <tr>
                  <td colspan="7" style="text-align: center; padding: 2.75rem 1rem; color: var(--text-muted);">
                    <div style="font-size: 2.2rem; margin-bottom: 0.6rem; color: var(--primary-emerald);"><i aria-hidden="true" class="fa-solid fa-receipt"></i></div>
                    <div style="font-weight: 800; font-size: 1rem; color: var(--text-mahogany); margin-bottom: 0.35rem;">No Recorded Transactions Yet</div>
                    <div style="font-size: 0.85rem; max-width: 450px; margin: 0 auto 1.25rem; line-height: 1.5; color: var(--text-charcoal);">
                      ${s.pendingFee > 0 
                        ? `You have a pending tuition fee balance of <strong>₹${s.pendingFee.toLocaleString()}</strong>. You can pay at the institute office or submit your UPI payment proof online.`
                        : 'Your account has zero pending fees. When official receipts are issued, they will be archived here for instant PDF download.'}
                    </div>
                    ${s.pendingFee > 0 ? `
                      <button type="button" class="btn btn-emerald" id="btnEmptyPayOnline" style="padding: 0.5rem 1.2rem; font-size: 0.85rem; font-weight: 700; border-radius: 6px; display: inline-flex; align-items: center; gap: 0.4rem;">
                        <i aria-hidden="true" class="fa-solid fa-credit-card"></i> Submit Online Payment Proof
                      </button>
                    ` : ''}
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>

        <!-- Mobile Card List View (visible on screen <= 768px) -->
        <div class="fee-tx-mobile-list">
          ${history.length > 0 ? history.map(item => {
            const isAdjustment = item.status === 'Adjusted' || (item.receiptNo && (item.receiptNo.startsWith('ADJ-') || item.receiptNo.startsWith('RATE-') || item.receiptNo.startsWith('DISC-') || item.receiptNo.startsWith('ADDON-')));
            const isOldDue = item.status === 'Pending Due' || (item.receiptNo && item.receiptNo.startsWith('OLD-DUE-'));
            const isDiscount = isAdjustment && (item.amount < 0 || (item.mode && (item.mode.includes('Concession') || item.mode.includes('Discount') || item.mode.includes('Waiver'))));
            const isPenalty = isAdjustment && (item.amount > 0 && (item.mode && (item.mode.includes('Fine') || item.mode.includes('Add-on') || item.mode.includes('Penalty'))));
            const isRate = isAdjustment && (item.mode && item.mode.includes('Rate'));

            let statusPillHtml = '';
            let amtDisplayHtml = '';

            if (isDiscount) {
              statusPillHtml = `<span class="status-badge" style="background: linear-gradient(135deg, #EDE9FE, #DDD6FE); color: #5B21B6; border: 1.5px solid #C4B5FD; font-weight: 800; font-size: 0.76rem; display: inline-flex; align-items: center; gap: 0.25rem;"><i aria-hidden="true" class="fa-solid fa-tags"></i> 💜 CONCESSION</span>`;
              amtDisplayHtml = `<span style="color: #7C3AED; font-weight: 800;">- ₹${Math.abs(item.amount).toLocaleString()}</span> <small style="font-size: 0.75rem; color: #8B5CF6;">(Waived)</small>`;
            } else if (isPenalty) {
              statusPillHtml = `<span class="status-badge" style="background: #FEF3C7; color: #92400E; border: 1.5px solid #FCD34D; font-weight: 800; font-size: 0.76rem; display: inline-flex; align-items: center; gap: 0.25rem;"><i aria-hidden="true" class="fa-solid fa-circle-plus"></i> 🧡 ADD-ON</span>`;
              amtDisplayHtml = `<span style="color: #D97706; font-weight: 800;">+ ₹${item.amount.toLocaleString()}</span> <small style="font-size: 0.75rem; color: #B45309;">(Added)</small>`;
            } else if (isRate) {
              statusPillHtml = `<span class="status-badge" style="background: #DCFCE7; color: #166534; border: 1.5px solid #86EFAC; font-weight: 800; font-size: 0.76rem; display: inline-flex; align-items: center; gap: 0.25rem;"><i aria-hidden="true" class="fa-solid fa-gem"></i> 💎 RATE</span>`;
              amtDisplayHtml = `<span style="color: #059669; font-weight: 800;">₹${item.amount.toLocaleString()}/mo</span>`;
            } else if (isAdjustment) {
              statusPillHtml = `<span class="status-badge" style="background: #E0F2FE; color: #075985; border: 1.5px solid #7DD3FC; font-weight: 800; font-size: 0.76rem; display: inline-flex; align-items: center; gap: 0.25rem;"><i aria-hidden="true" class="fa-solid fa-scale-balanced"></i> ⚖️ ADJUSTED</span>`;
              amtDisplayHtml = `<span style="color: #0284C7; font-weight: 800;">${item.amount < 0 ? `- ₹${Math.abs(item.amount).toLocaleString()}` : `₹${item.amount.toLocaleString()}`}</span>`;
            } else if (isOldDue) {
              statusPillHtml = `<span class="status-badge" style="background: #FEE2E2; color: #991B1B; border: 1.5px solid #FCA5A5; font-weight: 800; font-size: 0.76rem; display: inline-flex; align-items: center; gap: 0.25rem;"><i aria-hidden="true" class="fa-solid fa-clock-rotate-left"></i> 🔴 OLD DUE</span>`;
              amtDisplayHtml = `<span style="color: #DC2626; font-weight: 800;">₹${item.amount.toLocaleString()}</span>`;
            } else {
              statusPillHtml = `<span class="status-badge" style="background: #D1FAE5; color: #065F46; border: 1.5px solid #6EE7B7; font-weight: 800; font-size: 0.76rem; display: inline-flex; align-items: center; gap: 0.25rem;"><i aria-hidden="true" class="fa-solid fa-circle-check"></i> 🟢 PAID</span>`;
              amtDisplayHtml = `<span style="color: #059669; font-weight: 800;">₹${item.amount.toLocaleString()}</span>`;
            }

            return `
              <div class="fee-tx-card">
                <div class="fee-tx-card-head">
                  <span class="fee-tx-receipt-badge"><i aria-hidden="true" class="fa-solid fa-receipt"></i> ${escapeHtml(item.receiptNo)}</span>
                  ${statusPillHtml}
                </div>
                <div class="fee-tx-card-main">
                  <div class="fee-tx-amount-col">
                    <span class="fee-tx-amount-label">Amount</span>
                    <div class="fee-tx-amount-val">${amtDisplayHtml}</div>
                  </div>
                  <div class="fee-tx-date-col">
                    <span class="fee-tx-date-label">Date</span>
                    <div class="fee-tx-date-val"><i aria-hidden="true" class="fa-regular fa-calendar"></i> ${escapeHtml(item.date)}</div>
                  </div>
                </div>
                <div class="fee-tx-card-details">
                  <div class="fee-tx-detail-row">
                    <span class="fee-tx-detail-key"><i aria-hidden="true" class="fa-solid fa-credit-card"></i> Mode:</span>
                    <span class="fee-tx-detail-val">${escapeHtml(item.mode)}</span>
                  </div>
                  <div class="fee-tx-detail-row">
                    <span class="fee-tx-detail-key"><i aria-hidden="true" class="fa-solid fa-user-tie"></i> Authorized:</span>
                    <span class="fee-tx-detail-val">${escapeHtml(item.by || 'CHANDAN KUMAR')}</span>
                  </div>
                  ${item.note ? `
                    <div class="fee-tx-detail-note">
                      <i aria-hidden="true" class="fa-solid fa-circle-info"></i> ${sanitizeInput(item.note)}
                    </div>
                  ` : ''}
                </div>
                <div class="fee-tx-card-action">
                  <button type="button" class="btn btn-download-receipt btn-tx-download" data-receipt="${escapeHtml(item.receiptNo)}" style="background: ${isAdjustment ? '#6D28D9' : '#064E3B'};">
                    <i aria-hidden="true" class="fa-solid fa-file-arrow-down"></i> ${isAdjustment ? 'Download Voucher' : 'Download Receipt PDF'}
                  </button>
                </div>
              </div>
            `;
          }).join('') : `
            <div class="fee-tx-empty-state">
              <div class="fee-tx-empty-icon"><i aria-hidden="true" class="fa-solid fa-receipt"></i></div>
              <div class="fee-tx-empty-title">No Recorded Transactions Yet</div>
              <p class="fee-tx-empty-desc">
                ${s.pendingFee > 0 
                  ? `You have a pending tuition fee balance of <strong>₹${s.pendingFee.toLocaleString()}</strong>. You can pay at the institute office or submit your UPI payment proof online.`
                  : 'Your account has zero pending fees. When official receipts are issued, they will be archived here for instant PDF download.'}
              </p>
              ${s.pendingFee > 0 ? `
                <button type="button" class="btn btn-emerald" id="btnEmptyPayOnlineMobile" style="width:100%; max-width:280px; margin:0 auto; padding:0.6rem 1.2rem; font-size:0.88rem; font-weight:700; border-radius:8px; display:inline-flex; align-items:center; justify-content:center; gap:0.45rem;">
                  <i aria-hidden="true" class="fa-solid fa-credit-card"></i> Submit Online Payment Proof
                </button>
              ` : ''}
            </div>
          `}
        </div>
      </div>
    `;

    // Bind Online Pay Modals (Header and Empty States)
    pane.querySelector('#btnPayOnlineModal')?.addEventListener('click', () => {
      openStudentPaymentRequestModal(s);
    });
    pane.querySelector('#btnEmptyPayOnline')?.addEventListener('click', () => {
      openStudentPaymentRequestModal(s);
    });
    pane.querySelector('#btnEmptyPayOnlineMobile')?.addEventListener('click', () => {
      openStudentPaymentRequestModal(s);
    });

    // Event delegation on pane for computerized PDF receipt downloads across desktop and mobile
    pane.addEventListener('click', (e) => {
      const dlBtn = e.target.closest('.btn-download-receipt');
      if (dlBtn) {
        const receiptNo = dlBtn.dataset.receipt;
        downloadStudentReceiptPDF(s, receiptNo);
      }
    });
  }

  /* ==========================================================================
   * ADMIN DASHBOARD RENDERERS & ACCESS CONTROL
   * ========================================================================== */
  function getActiveTeacherName() {
    const admin = AppState.currentUser || AppState.getAdmin();
    return admin?.name || 'CHANDAN KUMAR';
  }

  function isMainAdmin() {
    const admin = AppState.currentUser || AppState.getAdmin();
    if (!admin) return false;
    const name = String(admin.name || '').toLowerCase();
    const username = String(admin.username || '').toLowerCase();
    const role = String(admin.role || '').toLowerCase();
    const isHead = admin.is_head === true || admin.isHead === true;

    return isHead ||
           name.includes('chandan') ||
           username.includes('chandan') ||
           username === 'chandan' ||
           role.includes('head');
  }

  function renderAdminDashboard() {
    const admin = AppState.currentUser || AppState.getAdmin();
    const students = AppState.getStudents();
    const notices = AppState.getNotices();

    const totalCollected = students.reduce((acc, curr) => acc + (curr.paidFee || 0), 0);
    const totalPending = students.reduce((acc, curr) => acc + (curr.pendingFee || 0), 0);

    const adminNameEl = document.getElementById('adminHeaderName');
    if (adminNameEl) adminNameEl.textContent = admin.name || 'Director & Admin';

    const adminRoleEl = document.getElementById('adminHeaderRoleBadge');
    if (adminRoleEl) adminRoleEl.textContent = admin.role || 'Faculty & Admin';

    const adminAvatarEl = document.getElementById('adminHeaderAvatar');
    if (adminAvatarEl) {
      if (admin.photoUrl) {
        adminAvatarEl.innerHTML = `<img src="${admin.photoUrl}" alt="${admin.name || 'Admin'}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
      } else {
        adminAvatarEl.textContent = admin.name ? admin.name.charAt(0) : '⚙️';
      }
    }

    // Render Stats
    const statsContainer = document.getElementById('adminOverviewStats');
    if (statsContainer) {
      statsContainer.innerHTML = `
        <div class="admin-stat-card" id="statCardStudents" title="Click to view full Student Directory">
          <div class="admin-icon-square"><i aria-hidden="true" class="fa-solid fa-users-line"></i></div>
          <div class="admin-stat-info">
            <h3>${students.length}</h3>
            <p>Total Active Students</p>
            <div class="stat-click-hint"><i aria-hidden="true" class="fa-solid fa-arrow-right"></i> View Directory</div>
          </div>
        </div>
        <div class="admin-stat-card" id="statCardCollected" title="Click to view Collection Breakdown & Receipts">
          <div class="admin-icon-square"><i aria-hidden="true" class="fa-solid fa-indian-rupee-sign"></i></div>
          <div class="admin-stat-info">
            <h3>₹${(totalCollected / 1000).toFixed(1)}k</h3>
            <p>Total Fee Collected</p>
            <div class="stat-click-hint"><i aria-hidden="true" class="fa-solid fa-arrow-right"></i> View Collections</div>
          </div>
        </div>
        <div class="admin-stat-card" id="statCardPending" title="Click to view Pending Dues & Send Reminders">
          <div class="admin-icon-square" style="background-color: #FEE2E2; color: #DC2626;"><i aria-hidden="true" class="fa-solid fa-clock-rotate-left"></i></div>
          <div class="admin-stat-info">
            <h3 style="color: #DC2626;">₹${(totalPending / 1000).toFixed(1)}k</h3>
            <p>Pending Fees</p>
            <div class="stat-click-hint" style="color: #DC2626;"><i aria-hidden="true" class="fa-solid fa-arrow-right"></i> Manage Dues</div>
          </div>
        </div>
        <div class="admin-stat-card" id="statCardNotices" title="Click to view & post Announcements">
          <div class="admin-icon-square"><i aria-hidden="true" class="fa-solid fa-bullhorn"></i></div>
          <div class="admin-stat-info">
            <h3>${notices.length}</h3>
            <p>Active Announcements</p>
            <div class="stat-click-hint"><i aria-hidden="true" class="fa-solid fa-arrow-right"></i> Post Notices</div>
          </div>
        </div>
      `;

      // Bind Click Listeners to all 4 cards
      statsContainer.querySelector('#statCardStudents')?.addEventListener('click', () => {
        switchAdminTab('students');
        document.getElementById('adminSearchStudent')?.focus();
      });

      statsContainer.querySelector('#statCardCollected')?.addEventListener('click', () => {
        openFeeCollectionBreakdownModal();
      });

      statsContainer.querySelector('#statCardPending')?.addEventListener('click', () => {
        openPendingFeesDefaultersModal();
      });

      statsContainer.querySelector('#statCardNotices')?.addEventListener('click', () => {
        switchAdminTab('post-notice');
      });
    }

    // Update Requests Count Badge (F21)
    const requests = AppState.getRequests();
    const pendingRequests = requests.filter(r => (r.status === 'Pending' || String(r.status || '').toLowerCase() === 'pending') && (r.type === 'payment' || r.type === 'profile' || !r.type));
    const badgeEl = document.getElementById('adminRequestsBadge');
    if (badgeEl) {
      if (pendingRequests.length > 0) {
        badgeEl.textContent = pendingRequests.length;
        badgeEl.style.display = 'inline-block';
      } else {
        badgeEl.style.display = 'none';
      }
    }

    // Control Email Tab Visibility based on Main Admin Permission (Chandan Kumar)
    const emailTabBtn = document.getElementById('adminTabBtnEmail');
    if (emailTabBtn) {
      if (isMainAdmin()) {
        emailTabBtn.style.display = 'inline-flex';
      } else {
        emailTabBtn.style.display = 'none';
      }
    }

    const adminCommBtn = document.getElementById('adminTabBtnCommunity');
    if (adminCommBtn) {
      adminCommBtn.style.display = ENABLE_COMMUNITY_CHAT ? 'inline-flex' : 'none';
    }

    // Lazy Tab Render: Render ONLY the currently active admin tab!
    let targetTab = AppState.activeAdminTab || 'students';
    if (targetTab === 'email' && !isMainAdmin()) {
      targetTab = 'students';
    }
    switchAdminTab(targetTab);
  }

  /* ==========================================================================
   * INTERACTIVE BREAKDOWN MODALS FOR KPI STAT CARDS WITH MULTI-DIMENSIONAL FILTERS
   * ========================================================================== */
  let feeModalMonthFilter = 'all';
  let feeModalClassFilter = 'all';
  let feeModalAdminFilter = 'all';
  let feeModalModeFilter = 'all';
  let feeModalSearchFilter = '';

  function openFeeCollectionBreakdownModal() {
    document.getElementById('feeCollectionModal')?.remove();

    const modalHtml = `
      <div class="inner-modal-backdrop active" id="feeCollectionModal" style="display: flex; position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 9999; align-items: center; justify-content: center; padding: 0.75rem; backdrop-filter: blur(4px);">
        <div class="inner-modal-content" style="max-width: 820px; width: 100%; max-height: 90vh; background: #FAF9F6; border-radius: 12px; border: 1.5px solid var(--border-sand); box-shadow: 0 10px 30px rgba(0,0,0,0.2); overflow: hidden; display: flex; flex-direction: column;">
          
          <!-- Header -->
          <div class="inner-modal-header" style="background: #064E3B; color: #fff; padding: 1rem 1.25rem; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <h3 style="margin: 0; font-size: 1.15rem; font-weight: 800; color: #fff; display: flex; align-items: center; gap: 0.5rem;">
                <i aria-hidden="true" class="fa-solid fa-indian-rupee-sign" style="color: #34D399;"></i> Fee Collection & Revenue Breakdown
              </h3>
              <div style="font-size: 0.8rem; color: #A7F3D0; margin-top: 0.15rem;">Interactive filterable view across months, academic batches & faculty collectors</div>
            </div>
            <button type="button" aria-label="Close fee collection dialog" class="btn-close-inner" onclick="document.getElementById('feeCollectionModal').remove()" style="background: none; border: none; color: #fff; font-size: 1.2rem; cursor: pointer;">
              <i aria-hidden="true" class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <!-- Modal Body with Scroll -->
          <div style="padding: 1.15rem; overflow-y: auto; display: flex; flex-direction: column; gap: 1rem;">
            
            <!-- Dynamic KPI Banner -->
            <div style="background: linear-gradient(135deg, #064E3B 0%, #02241b 100%); color: #fff; padding: 1.15rem 1.35rem; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; box-shadow: 0 4px 12px rgba(6,78,59,0.2);">
              <div>
                <div style="font-size: 0.82rem; color: #A7F3D0; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;" id="feeModalKpiLabel">
                  Total Verified Revenue Collected
                </div>
                <div style="font-size: 1.85rem; font-weight: 800; color: #34D399;" id="feeModalKpiAmount">
                  ₹0
                </div>
                <div style="font-size: 0.8rem; color: #D1FAE5; margin-top: 0.2rem;" id="feeModalKpiSubtext">
                  Across all batches and payment records
                </div>
              </div>
              <button type="button" class="btn" onclick="document.getElementById('feeCollectionModal').remove(); switchAdminTab('analytics');" style="background: rgba(255,255,255,0.15); color: #fff; border: 1px solid rgba(255,255,255,0.35); font-size: 0.82rem; font-weight: 700; padding: 0.45rem 0.85rem; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 0.4rem;">
                <i aria-hidden="true" class="fa-solid fa-chart-pie"></i> Detailed Fee Analytics →
              </button>
            </div>

            <!-- Multi-Filter Toolbar -->
            <div style="background: #ffffff; border: 1.5px solid #E2E8F0; border-radius: 10px; padding: 0.85rem; display: flex; flex-direction: column; gap: 0.65rem;">
              <div style="font-weight: 700; font-size: 0.82rem; color: var(--text-mahogany); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem;">
                <span><i aria-hidden="true" class="fa-solid fa-filter" style="color: var(--primary-emerald);"></i> Filter Collection Data:</span>
                <button type="button" id="btnResetFeeModalFilters" style="background: none; border: none; font-size: 0.8rem; color: #059669; font-weight: 700; cursor: pointer; text-decoration: underline;">
                  Reset All Filters
                </button>
              </div>

              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 0.6rem;">
                <!-- 1. Month Filter -->
                <div>
                  <label for="feeModalMonthSelect" style="display: block; font-size: 0.8rem; font-weight: 700; color: #4B5563; margin-bottom: 0.25rem;">🗓️ Month</label>
                  <select id="feeModalMonthSelect" class="portal-input" style="width: 100%; font-size: 0.8rem; height: 36px; padding: 0.35rem 0.6rem;">
                    <option value="all">All Months (All-Time)</option>
                  </select>
                </div>

                <!-- 2. Class / Batch Filter -->
                <div>
                  <label for="feeModalClassSelect" style="display: block; font-size: 0.8rem; font-weight: 700; color: #4B5563; margin-bottom: 0.25rem;">🎯 Class / Batch</label>
                  <select id="feeModalClassSelect" class="portal-input" style="width: 100%; font-size: 0.8rem; height: 36px; padding: 0.35rem 0.6rem;">
                    ${batchFilterOptions('all', 'All Batches')}
                  </select>
                </div>

                <!-- 3. Admin / Collector Filter -->
                <div>
                  <label for="feeModalAdminSelect" style="display: block; font-size: 0.8rem; font-weight: 700; color: #4B5563; margin-bottom: 0.25rem;">👨‍🏫 Faculty / Admin</label>
                  <select id="feeModalAdminSelect" class="portal-input" style="width: 100%; font-size: 0.8rem; height: 36px; padding: 0.35rem 0.6rem;">
                    ${facultyCollectorOptions()}
                  </select>
                </div>

                <!-- 4. Payment Mode Filter -->
                <div>
                  <label for="feeModalModeSelect" style="display: block; font-size: 0.8rem; font-weight: 700; color: #4B5563; margin-bottom: 0.25rem;">💳 Payment Mode</label>
                  <select id="feeModalModeSelect" class="portal-input" style="width: 100%; font-size: 0.8rem; height: 36px; padding: 0.35rem 0.6rem;">
                    <option value="all">All Payment Modes</option>
                    <option value="cash">💵 Cash at Counter</option>
                    <option value="upi">📱 UPI / Online (PhonePe/GPay)</option>
                  </select>
                </div>
              </div>

              <!-- Search Input inside modal -->
              <div style="position: relative; margin-top: 0.2rem;">
                <input type="text" id="feeModalSearchInput" aria-label="Search fee collections by student name, roll number or receipt number" class="portal-input" placeholder="🔍 Search by student name, roll number, or receipt #..." style="width: 100%; font-size: 0.8rem; height: 36px; padding-left: 2.2rem;">
                <i aria-hidden="true" class="fa-solid fa-magnifying-glass" style="position: absolute; left: 0.8rem; top: 50%; transform: translateY(-50%); color: var(--text-muted); font-size: 0.8rem;"></i>
              </div>
            </div>

            <!-- Dynamic Batch-Wise Collection Summary Grid -->
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <h4 style="font-size: 0.95rem; font-weight: 800; color: var(--text-mahogany); margin: 0; display: flex; align-items: center; gap: 0.4rem;">
                  <i aria-hidden="true" class="fa-solid fa-layer-group" style="color: var(--primary-emerald);"></i> Batch-Wise Collection Summary
                </h4>
                <span style="font-size: 0.8rem; color: var(--text-muted);" id="feeModalBatchCountLabel">${canonicalBatchCards().length} Institutional Batches</span>
              </div>
              <div id="feeModalBatchGrid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem;">
                <!-- Populated dynamically by updateFeeModalContent() -->
              </div>
            </div>

            <!-- Dynamic Recent Verified Receipts List -->
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <h4 style="font-size: 0.95rem; font-weight: 800; color: var(--text-mahogany); margin: 0; display: flex; align-items: center; gap: 0.4rem;">
                  <i aria-hidden="true" class="fa-solid fa-receipt" style="color: var(--primary-emerald);"></i> Verified Payment Receipts
                </h4>
                <span id="feeModalReceiptCountBadge" style="background: #ECFDF5; color: #065F46; padding: 0.2rem 0.6rem; border-radius: 99px; font-weight: 700; font-size: 0.8rem;">
                  0 Receipts
                </span>
              </div>

              <div style="max-height: 240px; overflow-y: auto; -webkit-overflow-scrolling: touch; border: 1.5px solid #E2E8F0; border-radius: 8px; background: #fff;">
                <table class="portal-table" style="font-size: 0.82rem; margin: 0; width: 100%;">
                  <thead>
                    <tr style="background: #F8FAFC;">
                      <th>Receipt #</th>
                      <th>Student & Roll #</th>
                      <th>Class</th>
                      <th>Amount</th>
                      <th>Mode</th>
                      <th>Collector</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody id="feeModalReceiptsTbody">
                    <!-- Populated dynamically -->
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    wireModalA11y('feeCollectionModal');

    // Build Master Monetary Transactions Pool for the Modal
    const students = AppState.getStudents() || [];
    const masterReceipts = (AppState.getFeeReceipts ? AppState.getFeeReceipts() : []) || [];
    const processedNos = new Set();
    const allCollectedPayments = [];

    students.forEach(s => {
      const sId = (s.student_id || s.id || s.rollNo || '').toString().toLowerCase();
      const sRoll = (s.rollNo || s.roll_no || sId).toString().toLowerCase();
      const sUuid = (s.db_uuid || (s.id && String(s.id).includes('-') ? s.id : '')).toString().toLowerCase();
      const sClass = s.className || s.class_name || 'General';
      const sPaidFee = Number(s.paidFee ?? s.paid_fee ?? 0);
      let sCollected = 0;

      // 1. Student Fee History
      (s.feeHistory || []).forEach(h => {
        if (isRealCollectedPayment(h)) {
          const recNo = h.receiptNo || h.receipt_no || `REC-${sRoll}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
          if (!processedNos.has(recNo)) {
            processedNos.add(recNo);
            const amt = Number(h.amount) || 0;
            sCollected += amt;
            allCollectedPayments.push({
              receiptNo: recNo,
              studentId: s.id,
              studentName: s.name,
              rollNo: s.rollNo || s.roll_no || s.student_id || '',
              className: sClass,
              amount: amt,
              mode: h.mode || h.payment_mode || 'Cash at Counter',
              // Collector is left blank when the record does not name one. The
              // fallback here used to invent `sClass.includes('10th') ?
              // 'CHANDAN KUMAR' : 'Prof. Ravi Ranjan'`, which wrote a faculty
              // name into the admin's own cash book for a payment nobody had
              // recorded taking — and credited every non-10th receipt,
              // including Aditi Singh's, to Prof. Ravi Ranjan.
              collector: h.by || h.collected_by || '',
              date: h.date || h.payment_date || new Date().toISOString().split('T')[0]
            });
          }
        }
      });

      // 2. Master Receipts Ledger
      masterReceipts.forEach(r => {
        if (isRealCollectedPayment(r)) {
          const rStuId = (r.student_id || r.studentId || '').toString().toLowerCase();
          const rNo = (r.receipt_no || r.receiptNo || '').toString();
          const isMatch = (sUuid && rStuId === sUuid) || (sId && rStuId === sId) || (sRoll && rStuId === sRoll) || (sRoll && rNo.includes(sRoll));
          if (isMatch && rNo && !processedNos.has(rNo)) {
            processedNos.add(rNo);
            const amt = Number(r.amount) || 0;
            sCollected += amt;
            allCollectedPayments.push({
              receiptNo: rNo,
              studentId: s.id,
              studentName: s.name,
              rollNo: s.rollNo || s.roll_no || s.student_id || '',
              className: sClass,
              amount: amt,
              mode: r.payment_mode || r.mode || 'Cash at Counter',
              collector: r.collected_by || r.by || '',
              date: r.payment_date || r.date || new Date().toISOString().split('T')[0]
            });
          }
        }
      });

      // 3. Admission base diff payment
      if (sPaidFee > sCollected) {
        const diff = sPaidFee - sCollected;
        const initRecNo = `REC-${sRoll || sId || 'ADM'}-INIT`;
        if (!processedNos.has(initRecNo)) {
          processedNos.add(initRecNo);
          // Neither the collector nor the mode is guessed from the class name.
          // The two ladders here read `sClass.includes('10th') || sClass
          // .includes('Science')` and `… || sClass.includes('Online')` — no
          // canonical class name contains "Science" or "Online", so those arms
          // were dead, and the live arm stamped an admission payment as
          // "Prof. Ravi Ranjan (Director)" in "Cash at Counter" on evidence
          // that did not exist. Ravi Ranjan is not the Director either.
          allCollectedPayments.push({
            receiptNo: initRecNo,
            studentId: s.id,
            studentName: s.name,
            rollNo: s.rollNo || s.roll_no || s.student_id || '',
            className: sClass,
            amount: diff,
            mode: s.paymentMode || s.payment_mode || 'Not recorded',
            collector: s.admittedBy || '',
            date: s.joiningMonth || (s.created_at ? new Date(s.created_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0])
          });
        }
      }
    });

    // Populate Dynamic Months in Dropdown
    const monthSelect = document.getElementById('feeModalMonthSelect');
    const monthMap = new Map();
    allCollectedPayments.forEach(p => {
      if (p.date && p.date !== 'N/A') {
        const d = new Date(p.date);
        if (!isNaN(d.getTime())) {
          const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          const mLabel = d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
          if (!monthMap.has(mKey)) monthMap.set(mKey, mLabel);
        }
      }
    });

    // Ensure current month is always present
    const curDate = new Date();
    const curKey = `${curDate.getFullYear()}-${String(curDate.getMonth() + 1).padStart(2, '0')}`;
    const curLabel = curDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    if (!monthMap.has(curKey)) monthMap.set(curKey, curLabel);

    // Sort months descending
    Array.from(monthMap.entries()).sort((a, b) => b[0].localeCompare(a[0])).forEach(([k, label]) => {
      const opt = document.createElement('option');
      opt.value = k;
      opt.textContent = `📅 ${label}`;
      if (feeModalMonthFilter === k) opt.selected = true;
      monthSelect.appendChild(opt);
    });

    // Reactive Renderer Function for Modal Content
    function updateFeeModalContent() {
      const selectedMonth = document.getElementById('feeModalMonthSelect')?.value || 'all';
      const selectedClass = document.getElementById('feeModalClassSelect')?.value || 'all';
      const selectedAdmin = document.getElementById('feeModalAdminSelect')?.value || 'all';
      const selectedMode = document.getElementById('feeModalModeSelect')?.value || 'all';
      const query = (document.getElementById('feeModalSearchInput')?.value || '').toLowerCase().trim();

      // Filter Payments
      const filteredPayments = allCollectedPayments.filter(p => {
        // Month filter
        if (selectedMonth !== 'all') {
          if (!p.date || p.date === 'N/A') return false;
          const d = new Date(p.date);
          if (isNaN(d.getTime())) return false;
          const pMonthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          if (pMonthKey !== selectedMonth) return false;
        }

        // Class / Batch filter
        if (selectedClass !== 'all') {
          const bKey = getBatchCategoryKey(p.className);
          if (bKey !== selectedClass) return false;
        }

        // Admin / Collector filter
        if (selectedAdmin !== 'all' && !collectorMatchesFaculty(p, selectedAdmin)) return false;

        // Payment Mode filter
        if (selectedMode !== 'all') {
          const mStr = String(p.mode || '').toLowerCase();
          const isCash = mStr.includes('cash') || mStr.includes('counter');
          if (selectedMode === 'cash' && !isCash) return false;
          if (selectedMode === 'upi' && isCash) return false;
        }

        // Text Search query
        if (query) {
          const sName = String(p.studentName || '').toLowerCase();
          const sRoll = String(p.rollNo || '').toLowerCase();
          const rNo = String(p.receiptNo || '').toLowerCase();
          const cName = String(p.className || '').toLowerCase();
          if (!sName.includes(query) && !sRoll.includes(query) && !rNo.includes(query) && !cName.includes(query)) return false;
        }

        return true;
      });

      // 1. Update KPI Banner
      const filteredTotal = filteredPayments.reduce((sum, p) => sum + p.amount, 0);
      const kpiAmountEl = document.getElementById('feeModalKpiAmount');
      if (kpiAmountEl) kpiAmountEl.textContent = `₹${filteredTotal.toLocaleString()}`;

      const kpiSubtextEl = document.getElementById('feeModalKpiSubtext');
      if (kpiSubtextEl) {
        const parts = [];
        if (selectedMonth !== 'all') parts.push(monthMap.get(selectedMonth) || selectedMonth);
        if (selectedClass !== 'all') {
          parts.push(batchLabel(selectedClass));
        }
        if (selectedAdmin !== 'all') parts.push(titleCaseName(selectedAdmin));
        if (selectedMode !== 'all') parts.push(selectedMode === 'cash' ? 'Cash' : 'UPI / Online');

        kpiSubtextEl.textContent = parts.length > 0
          ? `Filtered by: ${parts.join(' • ')} (${filteredPayments.length} transactions)`
          : `Showing total verified collections (${filteredPayments.length} transactions)`;
      }

      // 2. Update Batch Cards Summary — all twelve batches, from the shared
      // config. The four-entry literal this replaces meant Class 11th, Class
      // 12th and the three Special English batches had no card here at all, so
      // the collections they generated were counted in the header total but
      // appeared under no batch, and the ₹500 junior tier was reported at ₹700.
      const visibleBatches = selectedClass === 'all'
        ? canonicalBatchCards()
        : canonicalBatchCards().filter(b => b.key === selectedClass);

      const batchGridEl = document.getElementById('feeModalBatchGrid');
      if (batchGridEl) {
        batchGridEl.innerHTML = visibleBatches.map(b => {
          const batchStudents = students.filter(s => getBatchCategoryKey(s.className || s.class_name || '') === b.key);
          const batchPayments = filteredPayments.filter(p => getBatchCategoryKey(p.className) === b.key);
          const bCollected = batchPayments.reduce((sum, p) => sum + p.amount, 0);

          return `
            <div style="background: #ffffff; border: 1.5px solid #E2E8F0; border-radius: 10px; padding: 0.9rem; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
                <span style="font-weight: 800; font-size: 0.88rem; color: var(--text-mahogany);">${b.icon} ${b.name}</span>
                <span style="font-size: 0.8rem; background: #F1F5F9; color: #475569; padding: 0.15rem 0.45rem; border-radius: 4px; font-weight: 700;">₹${b.rate}/mo</span>
              </div>
              <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.5rem;">
                ${batchStudents.length} Enrolled • ${batchPayments.length} Filtered Receipts
              </div>
              <div style="font-size: 1.25rem; font-weight: 800; color: #059669;">
                ₹${bCollected.toLocaleString()}
              </div>
            </div>
          `;
        }).join('');
      }

      // 3. Update Receipts Table
      const tbody = document.getElementById('feeModalReceiptsTbody');
      const badgeEl = document.getElementById('feeModalReceiptCountBadge');
      if (badgeEl) badgeEl.textContent = `${filteredPayments.length} Receipts`;

      if (tbody) {
        if (filteredPayments.length === 0) {
          tbody.innerHTML = `
            <tr>
              <td colspan="7" style="text-align: center; padding: 2rem; color: var(--text-muted);">
                <i aria-hidden="true" class="fa-solid fa-receipt" style="font-size: 1.8rem; color: #CBD5E1; margin-bottom: 0.5rem; display: block;"></i>
                No payments found matching the selected filters.
              </td>
            </tr>
          `;
        } else {
          tbody.innerHTML = filteredPayments.map(r => {
            const isCash = String(r.mode || '').toLowerCase().includes('cash');
            const col = collectorDisplay(r.collector);
            return `
              <tr>
                <td style="font-family: monospace; font-weight: 700; color: var(--text-mahogany); font-size: 0.8rem;">
                  ${r.receiptNo}
                </td>
                <td>
                  <strong>${sanitizeInput(r.studentName)}</strong>
                  ${r.rollNo ? `<div style="font-size: 0.8rem; color: var(--text-muted);">Roll #${r.rollNo}</div>` : ''}
                </td>
                <td>
                  <span style="background: #F8FAFC; border: 1px solid #E2E8F0; padding: 0.15rem 0.45rem; border-radius: 4px; font-size: 0.8rem; font-weight: 600;">
                    ${r.className}
                  </span>
                </td>
                <td style="font-weight: 800; color: #047857; font-size: 0.92rem;">
                  ₹${r.amount.toLocaleString()}
                </td>
                <td>
                  <span style="background: ${isCash ? '#FEF3C7; color: #78350F;' : '#D1FAE5; color: #065F46;'} padding: 0.15rem 0.45rem; border-radius: 99px; font-size: 0.8rem; font-weight: 700;">
                    <i class="${isCash ? 'fa-solid fa-money-bill-wave' : 'fa-solid fa-mobile-screen'}" aria-hidden="true"></i> ${r.mode}
                  </span>
                </td>
                <td>
                  <div style="font-weight: 700; font-size: 0.8rem; color: ${col.color};">
                    ${col.label}
                  </div>
                </td>
                <td style="font-size: 0.8rem; color: var(--text-muted); white-space: nowrap;">
                  ${r.date}
                </td>
              </tr>
            `;
          }).join('');
        }
      }
    }

    // Bind Filter Event Listeners inside modal
    document.getElementById('feeModalMonthSelect')?.addEventListener('change', (e) => {
      feeModalMonthFilter = e.target.value;
      updateFeeModalContent();
    });

    document.getElementById('feeModalClassSelect')?.addEventListener('change', (e) => {
      feeModalClassFilter = e.target.value;
      updateFeeModalContent();
    });

    document.getElementById('feeModalAdminSelect')?.addEventListener('change', (e) => {
      feeModalAdminFilter = e.target.value;
      updateFeeModalContent();
    });

    document.getElementById('feeModalModeSelect')?.addEventListener('change', (e) => {
      feeModalModeFilter = e.target.value;
      updateFeeModalContent();
    });

    document.getElementById('feeModalSearchInput')?.addEventListener('input', () => {
      updateFeeModalContent();
    });

    document.getElementById('btnResetFeeModalFilters')?.addEventListener('click', () => {
      feeModalMonthFilter = 'all';
      feeModalClassFilter = 'all';
      feeModalAdminFilter = 'all';
      feeModalModeFilter = 'all';
      if (document.getElementById('feeModalMonthSelect')) document.getElementById('feeModalMonthSelect').value = 'all';
      if (document.getElementById('feeModalClassSelect')) document.getElementById('feeModalClassSelect').value = 'all';
      if (document.getElementById('feeModalAdminSelect')) document.getElementById('feeModalAdminSelect').value = 'all';
      if (document.getElementById('feeModalModeSelect')) document.getElementById('feeModalModeSelect').value = 'all';
      if (document.getElementById('feeModalSearchInput')) document.getElementById('feeModalSearchInput').value = '';
      updateFeeModalContent();
    });

    // Initial render of modal contents
    updateFeeModalContent();
  }

  /* ==========================================================================
   * INTERACTIVE OUTSTANDING FEE DUES & REMINDER MANAGER MODAL WITH MULTI-DIMENSIONAL FILTERS
   * ========================================================================== */
  let pendingModalClassFilter = 'all';
  let pendingModalAdminFilter = 'all';
  let pendingModalDueRangeFilter = 'all';
  let pendingModalSearchFilter = '';

  function openPendingFeesDefaultersModal() {
    document.getElementById('pendingFeesModal')?.remove();

    const modalHtml = `
      <div class="inner-modal-backdrop active" id="pendingFeesModal" style="display: flex; position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 9999; align-items: center; justify-content: center; padding: 0.75rem; backdrop-filter: blur(4px);">
        <div class="inner-modal-content" style="max-width: 860px; width: 100%; max-height: 90vh; background: #FAF9F6; border-radius: 12px; border: 1.5px solid var(--border-sand); box-shadow: 0 10px 30px rgba(0,0,0,0.2); overflow: hidden; display: flex; flex-direction: column;">
          
          <!-- Header -->
          <div class="inner-modal-header" style="background: #991B1B; color: #fff; padding: 1rem 1.25rem; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <h3 style="margin: 0; font-size: 1.15rem; font-weight: 800; color: #fff; display: flex; align-items: center; gap: 0.5rem;">
                <i aria-hidden="true" class="fa-solid fa-clock-rotate-left" style="color: #FCA5A5;"></i> Outstanding Fee Dues & Reminder Manager
              </h3>
              <div style="font-size: 0.8rem; color: #FECACA; margin-top: 0.15rem;">Filter student dues by batch, educator lead, amount range, and dispatch instant reminders</div>
            </div>
            <button type="button" aria-label="Close pending fees dialog" class="btn-close-inner" onclick="document.getElementById('pendingFeesModal').remove()" style="background: none; border: none; color: #fff; font-size: 1.2rem; cursor: pointer;">
              <i aria-hidden="true" class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <!-- Modal Body with Scroll -->
          <div style="padding: 1.15rem; overflow-y: auto; display: flex; flex-direction: column; gap: 1rem;">
            
            <!-- Dynamic KPI Banner -->
            <div style="background: linear-gradient(135deg, #7F1D1D 0%, #450A0A 100%); color: #fff; padding: 1.15rem 1.35rem; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; box-shadow: 0 4px 12px rgba(127,29,29,0.25);">
              <div>
                <div style="font-size: 0.82rem; color: #FECACA; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;" id="pendingModalKpiLabel">
                  Total Outstanding Tuition Dues
                </div>
                <div style="font-size: 1.85rem; font-weight: 800; color: #FCA5A5; display: flex; align-items: baseline; gap: 0.5rem;" id="pendingModalKpiAmount">
                  ₹0
                </div>
                <div style="font-size: 0.8rem; color: #FEE2E2; margin-top: 0.2rem;" id="pendingModalKpiSubtext">
                  Across all enrolled students with pending balance
                </div>
              </div>
              <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                <button type="button" class="btn" onclick="document.getElementById('pendingFeesModal').remove(); switchAdminTab('email');" style="background: rgba(255,255,255,0.15); color: #fff; border: 1px solid rgba(255,255,255,0.35); font-size: 0.82rem; font-weight: 700; padding: 0.45rem 0.85rem; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 0.4rem;">
                  <i aria-hidden="true" class="fa-solid fa-paper-plane"></i> Email Fee Reminders →
                </button>
              </div>
            </div>

            <!-- Multi-Filter Toolbar -->
            <div style="background: #ffffff; border: 1.5px solid #E2E8F0; border-radius: 10px; padding: 0.85rem; display: flex; flex-direction: column; gap: 0.65rem;">
              <div style="font-weight: 700; font-size: 0.82rem; color: var(--text-mahogany); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem;">
                <span><i aria-hidden="true" class="fa-solid fa-filter" style="color: #DC2626;"></i> Filter Outstanding Dues:</span>
                <button type="button" id="btnResetPendingModalFilters" style="background: none; border: none; font-size: 0.8rem; color: #DC2626; font-weight: 700; cursor: pointer; text-decoration: underline;">
                  Reset All Filters
                </button>
              </div>

              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 0.6rem;">
                <!-- 1. Class / Batch Filter -->
                <div>
                  <label for="pendingModalClassSelect" style="display: block; font-size: 0.8rem; font-weight: 700; color: #4B5563; margin-bottom: 0.25rem;">🎯 Class / Batch</label>
                  <select id="pendingModalClassSelect" class="portal-input" style="width: 100%; font-size: 0.8rem; height: 36px; padding: 0.35rem 0.6rem;">
                    ${batchFilterOptions('all', 'All Batches')}
                  </select>
                </div>

                <!-- 2. Faculty / Admin Lead Filter -->
                <div>
                  <label for="pendingModalAdminSelect" style="display: block; font-size: 0.8rem; font-weight: 700; color: #4B5563; margin-bottom: 0.25rem;">👨‍🏫 Faculty Lead</label>
                  <select id="pendingModalAdminSelect" class="portal-input" style="width: 100%; font-size: 0.8rem; height: 36px; padding: 0.35rem 0.6rem;">
                    ${facultyFilterOptions()}
                  </select>
                </div>

                <!-- 3. Due Amount Range Filter -->
                <div>
                  <label for="pendingModalDueRangeSelect" style="display: block; font-size: 0.8rem; font-weight: 700; color: #4B5563; margin-bottom: 0.25rem;">💰 Due Amount</label>
                  <select id="pendingModalDueRangeSelect" class="portal-input" style="width: 100%; font-size: 0.8rem; height: 36px; padding: 0.35rem 0.6rem;">
                    <option value="all">All Pending Amounts (> ₹0)</option>
                    <option value="high">🚨 High Dues (> ₹2,000)</option>
                    <option value="mid">⚠️ Medium Dues (₹1,000 – ₹2,000)</option>
                    <option value="low">📌 Minor Dues (< ₹1,000)</option>
                  </select>
                </div>
              </div>

              <!-- Search Input inside modal -->
              <div style="position: relative; margin-top: 0.2rem;">
                <input type="text" id="pendingModalSearchInput" aria-label="Search pending dues by student name, roll number, guardian or mobile" class="portal-input" placeholder="🔍 Search by student name, roll number, guardian, mobile..." style="width: 100%; font-size: 0.8rem; height: 36px; padding-left: 2.2rem;">
                <i aria-hidden="true" class="fa-solid fa-magnifying-glass" style="position: absolute; left: 0.8rem; top: 50%; transform: translateY(-50%); color: var(--text-muted); font-size: 0.8rem;"></i>
              </div>
            </div>

            <!-- Dynamic Batch Dues Summary Grid -->
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <h4 style="font-size: 0.95rem; font-weight: 800; color: var(--text-mahogany); margin: 0; display: flex; align-items: center; gap: 0.4rem;">
                  <i aria-hidden="true" class="fa-solid fa-layer-group" style="color: #DC2626;"></i> Batch-Wise Outstanding Dues
                </h4>
                <span style="font-size: 0.8rem; color: var(--text-muted);" id="pendingModalBatchLabel">${canonicalBatchCards().length} Institutional Batches</span>
              </div>
              <div id="pendingModalBatchGrid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem;">
                <!-- Populated dynamically -->
              </div>
            </div>

            <!-- Dynamic Defaulters Student Table -->
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <h4 style="font-size: 0.95rem; font-weight: 800; color: var(--text-mahogany); margin: 0; display: flex; align-items: center; gap: 0.4rem;">
                  <i aria-hidden="true" class="fa-solid fa-users" style="color: #DC2626;"></i> Students with Pending Balance
                </h4>
                <span id="pendingModalStudentCountBadge" style="background: #FEE2E2; color: #991B1B; padding: 0.2rem 0.6rem; border-radius: 99px; font-weight: 700; font-size: 0.8rem;">
                  0 Students
                </span>
              </div>

              <div style="max-height: 280px; overflow-y: auto; -webkit-overflow-scrolling: touch; border: 1.5px solid #E2E8F0; border-radius: 8px; background: #fff;">
                <table class="portal-table" style="font-size: 0.82rem; margin: 0; width: 100%;">
                  <thead>
                    <tr style="background: #FEF2F2;">
                      <th>Student & Roll #</th>
                      <th>Class Batch</th>
                      <th>Pending Due</th>
                      <th>Guardian & Contact</th>
                      <th style="text-align: right;">1-Click Actions</th>
                    </tr>
                  </thead>
                  <tbody id="pendingModalTbody">
                    <!-- Populated dynamically -->
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    wireModalA11y('pendingFeesModal');

    const students = AppState.getStudents() || [];

    // Reactive Renderer for Pending Fees Modal
    function updatePendingModalContent() {
      const selectedClass = document.getElementById('pendingModalClassSelect')?.value || 'all';
      const selectedAdmin = document.getElementById('pendingModalAdminSelect')?.value || 'all';
      const selectedRange = document.getElementById('pendingModalDueRangeSelect')?.value || 'all';
      const query = (document.getElementById('pendingModalSearchInput')?.value || '').toLowerCase().trim();

      // Filter Students
      const filteredStudents = students.filter(s => {
        const pending = Number(s.pendingFee ?? s.pending_fee ?? 0);
        if (pending <= 0) return false;

        const bKey = getBatchCategoryKey(s.className || s.class_name || '');

        // 1. Class / Batch Filter
        if (selectedClass !== 'all' && bKey !== selectedClass) return false;

        // 2. Admin / Faculty Lead Filter
        // Matches the batch's canonical roster. The test this replaces was
        // `bKey === '10th' || bKey === '9th'`, which since the switch to
        // canonical ids was false for every student — so picking "Chandan
        // Kumar" emptied the list and picking "Ravi Ranjan" ignored the filter.
        if (selectedAdmin !== 'all') {
          if (!batchTeachers(bKey).includes(selectedAdmin)) return false;
        }

        // 3. Due Range Filter
        if (selectedRange === 'high' && pending <= 2000) return false;
        if (selectedRange === 'mid' && (pending < 1000 || pending > 2000)) return false;
        if (selectedRange === 'low' && pending >= 1000) return false;

        // 4. Search Filter
        if (query) {
          const sName = String(s.name || '').toLowerCase();
          const sRoll = String(s.rollNo || s.roll_no || s.student_id || '').toLowerCase();
          const sId = String(s.id || '').toLowerCase();
          const sGName = String(s.guardianName || '').toLowerCase();
          const sPhone = String(s.guardianMobile || s.mobile || '').toLowerCase();
          const sClass = String(s.className || s.class_name || '').toLowerCase();
          if (!sName.includes(query) && !sRoll.includes(query) && !sId.includes(query) && !sGName.includes(query) && !sPhone.includes(query) && !sClass.includes(query)) {
            return false;
          }
        }

        return true;
      });

      // 1. Update KPI Header
      const totalFilteredPending = filteredStudents.reduce((sum, s) => sum + (Number(s.pendingFee ?? s.pending_fee ?? 0)), 0);
      const kpiAmountEl = document.getElementById('pendingModalKpiAmount');
      if (kpiAmountEl) {
        kpiAmountEl.innerHTML = `₹${totalFilteredPending.toLocaleString()} <span style="font-size: 0.95rem; font-weight: 700; color: #FECACA;">(${filteredStudents.length} Students Pending)</span>`;
      }

      const kpiSubtextEl = document.getElementById('pendingModalKpiSubtext');
      if (kpiSubtextEl) {
        const parts = [];
        if (selectedClass !== 'all') parts.push(batchLabel(selectedClass));
        if (selectedAdmin !== 'all') parts.push(`${titleCaseName(selectedAdmin)} Leads`);
        if (selectedRange !== 'all') parts.push(selectedRange === 'high' ? 'High Dues (> ₹2,000)' : selectedRange === 'mid' ? 'Medium Dues' : 'Minor Dues');

        kpiSubtextEl.textContent = parts.length > 0
          ? `Filtered by: ${parts.join(' • ')}`
          : 'Showing all students with outstanding balances across all batches';
      }

      // 2. Update Batch Cards Summary — see the note on the identical grid in
      // the Fee Collections modal: five of the twelve batches had no card, so
      // their outstanding dues were invisible in this breakdown.
      const visibleBatches = selectedClass === 'all'
        ? canonicalBatchCards()
        : canonicalBatchCards().filter(b => b.key === selectedClass);

      const batchGridEl = document.getElementById('pendingModalBatchGrid');
      if (batchGridEl) {
        batchGridEl.innerHTML = visibleBatches.map(b => {
          const batchDefaulters = filteredStudents.filter(s => getBatchCategoryKey(s.className || s.class_name || '') === b.key);
          const bPendingSum = batchDefaulters.reduce((sum, s) => sum + (Number(s.pendingFee ?? s.pending_fee ?? 0)), 0);

          return `
            <div style="background: #ffffff; border: 1.5px solid #FCA5A5; border-radius: 10px; padding: 0.9rem; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
                <span style="font-weight: 800; font-size: 0.88rem; color: var(--text-mahogany);">${b.icon} ${b.name}</span>
                <span style="font-size: 0.8rem; background: #FEF2F2; color: #991B1B; padding: 0.15rem 0.45rem; border-radius: 4px; font-weight: 700;">₹${b.rate}/mo</span>
              </div>
              <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.5rem;">
                ${batchDefaulters.length} Students Pending Balance
              </div>
              <div style="font-size: 1.25rem; font-weight: 800; color: #DC2626;">
                ₹${bPendingSum.toLocaleString()}
              </div>
            </div>
          `;
        }).join('');
      }

      // 3. Update Defaulters Table
      const tbody = document.getElementById('pendingModalTbody');
      const badgeEl = document.getElementById('pendingModalStudentCountBadge');
      if (badgeEl) badgeEl.textContent = `${filteredStudents.length} Students`;

      if (tbody) {
        if (filteredStudents.length === 0) {
          tbody.innerHTML = `
            <tr>
              <td colspan="5" style="text-align: center; padding: 2.5rem 1rem; color: #059669;">
                <i aria-hidden="true" class="fa-solid fa-circle-check" style="font-size: 2rem; color: #10B981; margin-bottom: 0.5rem; display: block;"></i>
                <div style="font-weight: 700; font-size: 0.95rem;">🎉 Zero Pending Dues in Selected Filter!</div>
                <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.2rem;">All students matching this criteria have cleared their tuition fees 100%.</div>
              </td>
            </tr>
          `;
        } else {
          tbody.innerHTML = filteredStudents.map(s => {
            const dueAmt = Number(s.pendingFee ?? s.pending_fee ?? 0);
            const guardianPhone = s.guardianMobile || s.mobile || '';
            const cleanPhone = String(guardianPhone).replace(/\D/g, '');
            const waPhone = cleanPhone.startsWith('91') && cleanPhone.length > 10 ? cleanPhone : (cleanPhone ? '91' + cleanPhone : '');
            const waMsg = encodeURIComponent(`Namaste ${s.guardianName || s.name},\nThis is a friendly reminder from Pragyan Institute Lalganj regarding the outstanding monthly tuition fee of ₹${dueAmt.toLocaleString()} for ${s.name} (${s.className || s.class_name}, Roll #${s.rollNo || s.roll_no || s.student_id}). Kindly deposit the balance at the counter or via online UPI to keep records up to date. Thank you!`);

            return `
              <tr>
                <td>
                  <strong>${sanitizeInput(s.name)}</strong>
                  <div style="font-size: 0.8rem; color: var(--text-muted);">
                    Roll #${s.rollNo || s.roll_no || s.student_id || ''} • ID: ${s.id || ''}
                  </div>
                </td>
                <td>
                  <span style="background: #F8FAFC; border: 1px solid #E2E8F0; padding: 0.15rem 0.45rem; border-radius: 4px; font-size: 0.8rem; font-weight: 600;">
                    ${s.className || s.class_name || 'General'}
                  </span>
                </td>
                <td style="color: #DC2626; font-weight: 800; font-size: 0.95rem;">
                  ₹${dueAmt.toLocaleString()}
                </td>
                <td>
                  <div style="font-weight: 600; font-size: 0.8rem;">${s.guardianName || 'Guardian'}</div>
                  <div style="font-size: 0.8rem; color: var(--text-muted);">${guardianPhone || 'N/A'}</div>
                </td>
                <td style="text-align: right;">
                  <div style="display: inline-flex; gap: 0.35rem; align-items: center; justify-content: flex-end;">
                    ${waPhone ? `
                      <a href="https://wa.me/${waPhone}?text=${waMsg}" target="_blank" class="btn" style="background-color: #25D366; color: #fff; padding: 0.3rem 0.6rem; font-size: 0.8rem; font-weight: 700; border-radius: 6px; text-decoration: none; display: inline-flex; align-items: center; gap: 0.3rem;" title="Send WhatsApp Reminder">
                        <i aria-hidden="true" class="fa-brands fa-whatsapp"></i> Remind
                      </a>
                    ` : ''}
                    <button class="btn btn-pending-pay-modal" data-id="${s.id}" style="background-color: #059669; color: #fff; padding: 0.3rem 0.65rem; font-size: 0.8rem; font-weight: 700; border: none; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 0.25rem;" title="Record Fee Payment">
                      <i aria-hidden="true" class="fa-solid fa-hand-holding-dollar"></i> Collect Fee
                    </button>
                  </div>
                </td>
              </tr>
            `;
          }).join('');

          // Bind collect fee button listeners
          tbody.querySelectorAll('.btn-pending-pay-modal').forEach(btn => {
            btn.onclick = () => {
              document.getElementById('pendingFeesModal')?.remove();
              openPayModal(btn.dataset.id);
            };
          });
        }
      }
    }

    // Bind Filter Event Listeners inside modal
    document.getElementById('pendingModalClassSelect')?.addEventListener('change', (e) => {
      pendingModalClassFilter = e.target.value;
      updatePendingModalContent();
    });

    document.getElementById('pendingModalAdminSelect')?.addEventListener('change', (e) => {
      pendingModalAdminFilter = e.target.value;
      updatePendingModalContent();
    });

    document.getElementById('pendingModalDueRangeSelect')?.addEventListener('change', (e) => {
      pendingModalDueRangeFilter = e.target.value;
      updatePendingModalContent();
    });

    document.getElementById('pendingModalSearchInput')?.addEventListener('input', () => {
      updatePendingModalContent();
    });

    document.getElementById('btnResetPendingModalFilters')?.addEventListener('click', () => {
      pendingModalClassFilter = 'all';
      pendingModalAdminFilter = 'all';
      pendingModalDueRangeFilter = 'all';
      if (document.getElementById('pendingModalClassSelect')) document.getElementById('pendingModalClassSelect').value = 'all';
      if (document.getElementById('pendingModalAdminSelect')) document.getElementById('pendingModalAdminSelect').value = 'all';
      if (document.getElementById('pendingModalDueRangeSelect')) document.getElementById('pendingModalDueRangeSelect').value = 'all';
      if (document.getElementById('pendingModalSearchInput')) document.getElementById('pendingModalSearchInput').value = '';
      updatePendingModalContent();
    });

    // Initial render
    updatePendingModalContent();
  }

  function switchAdminTab(tabName) {
    // Access control: Only main admin (Chandan Kumar) can switch to email tab
    if (tabName === 'email' && !isMainAdmin()) {
      alert('🔒 Access Restricted: Mass Email Dispatch & Invoicing campaigns can only be authorized and dispatched by Main Institute Admin (Chandan Kumar).');
      tabName = 'students';
    }

    AppState.activeAdminTab = tabName;

    const adminWrapper = document.getElementById('adminDashboardContainer');
    if (adminWrapper) {
      if (tabName === 'community') {
        adminWrapper.classList.add('community-tab-active');
      } else {
        adminWrapper.classList.remove('community-tab-active');
      }
    }

    // Toggle Overview KPI cards: show only on Students tab
    const overviewStats = document.getElementById('adminOverviewStats');
    if (overviewStats) {
      overviewStats.style.display = (tabName === 'students') ? 'grid' : 'none';
    }

    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
      if (btn.dataset.tab === tabName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    document.querySelectorAll('.admin-tab-pane').forEach(pane => {
      if (pane.id === `adminTabPane-${tabName}`) {
        pane.classList.add('active');
        pane.style.display = 'block';
      } else {
        pane.classList.remove('active');
        pane.style.display = 'none';
      }
    });

    // Dynamically re-render active admin tab
    if (tabName === 'students') {
      renderAdminStudentList();
    } else if (tabName === 'analytics') {
      renderAdminAnalyticsTab();
    } else if (tabName === 'email') {
      renderAdminEmailTab();
    } else if (tabName === 'requests') {
      renderAdminRequestsManager();
    } else if (tabName === 'post-notice') {
      renderAdminNoticesManager();
    } else if (tabName === 'history') {
      renderAdminAuditHistoryTab();
    } else if (tabName === 'settings') {
      renderAdminSettingsTab();
    } else if (tabName === 'blog') {
      renderAdminBlogTab();
    } else if (tabName === 'schedule') {
      renderAdminScheduleTab();
    } else if (tabName === 'batches') {
      renderAdminBatchesTab();
    } else if (tabName === 'push') {
      renderAdminPushTab();
    } else if (tabName === 'community') {
      renderCommunityChatTab();
    }
  }

  /* ==========================================================================
   * ADMIN PROFILE & SECURITY CREDENTIALS SETTINGS TAB
   * ========================================================================== */
  let selectedAdminIdToEdit = null;

  function renderAdminSettingsTab() {
    const pane = document.getElementById('adminTabPane-settings');
    if (!pane) return;

    try {
      const admins = AppState.getAdmins();
      selectedAdminIdToEdit = AppState.currentUser?.id || null;
      const admin = (selectedAdminIdToEdit ? admins.find(a => a.id === selectedAdminIdToEdit) : null) || AppState.currentUser || AppState.getAdmin();
      if (!admin) {
        pane.textContent = 'Your administrator profile is still loading. Please try again.';
        return;
      }
      const safeAdmins = [admin];

      pane.innerHTML = `
        <div class="dash-card admin-settings-dash-card">
          <div class="admin-profile-header-wrap">
            <div class="admin-profile-header-left">
              <div class="admin-profile-icon-badge">
                <i aria-hidden="true" class="fa-solid fa-user-shield"></i>
              </div>
              <div>
                <h3 class="admin-profile-title">
                  Admin Profile & Security Settings
                </h3>
                <div class="admin-profile-subtitle">Manage official director identity, contact channels, UPI billing & security credentials</div>
              </div>
            </div>
            <span class="admin-profile-secure-badge">
              <i aria-hidden="true" class="fa-solid fa-shield-halved"></i> Cloud Synced & Encrypted
            </span>
          </div>

          <form id="adminSettingsForm" class="admin-settings-form">
            <div class="admin-profile-cards-grid">
              
              <!-- CARD 1: DIRECTOR IDENTITY & CONTACT INFO -->
              <div class="admin-profile-card">
                <div class="admin-card-head">
                  <div class="admin-card-head-icon" style="background: rgba(6, 78, 59, 0.1); color: var(--primary-emerald);">
                    <i aria-hidden="true" class="fa-solid fa-user-tie"></i>
                  </div>
                  <div>
                    <div class="admin-card-head-title">1. Director Identity & Profile</div>
                    <div class="admin-card-head-desc">Personal details and official contact channels</div>
                  </div>
                </div>

                <!-- Avatar Preview & Upload -->
                <div class="admin-avatar-card-inner">
                  <div id="adminAvatarPreview" class="admin-avatar-preview-box">
                    ${admin.photoUrl ? `<img src="${admin.photoUrl}" alt="${(admin.name || 'Admin')}">` : (admin.name ? admin.name.charAt(0).toUpperCase() : 'A')}
                  </div>
                  <div class="admin-avatar-ctrls">
                    <label class="btn-change-photo" for="adminPhotoFileInput">
                      <i aria-hidden="true" class="fa-solid fa-camera"></i> Change Photo
                      <input type="file" id="adminPhotoFileInput" accept="image/*" capture="environment" style="display: none;">
                    </label>
                    <div class="admin-avatar-hint">JPG or PNG (Auto-compressed & Cloud Live)</div>
                  </div>
                </div>

                <!-- Full Name -->
                <div class="admin-form-group">
                  <label for="adminSettingName">Director / Educator Full Name <span class="req-star">*</span></label>
                  <div class="input-icon-wrap">
                    <input type="text" id="adminSettingName" class="portal-input" value="${(admin.name || '').replace(/"/g, '&quot;')}" required placeholder="e.g. CHANDAN KUMAR / Prof. Ravi Ranjan">
                    <i aria-hidden="true" class="fa-solid fa-user-tie input-left-icon"></i>
                  </div>
                </div>

                <!-- Designation Role -->
                <div class="admin-form-group">
                  <label for="adminSettingRole">Designation / Role Title <span class="req-star">*</span></label>
                  <div class="input-icon-wrap">
                    <input type="text" id="adminSettingRole" class="portal-input" value="${(admin.role || '').replace(/"/g, '&quot;')}" required placeholder="e.g. Managing Director & Science Lead">
                    <i aria-hidden="true" class="fa-solid fa-award input-left-icon"></i>
                  </div>
                </div>

                <!-- Mobile / WhatsApp -->
                <div class="admin-form-group">
                  <label for="adminSettingMobile">Mobile / WhatsApp <span class="req-star">*</span></label>
                  <div class="input-icon-wrap">
                    <input type="tel" id="adminSettingMobile" class="portal-input" value="${(admin.mobile || '').replace(/"/g, '&quot;')}" required placeholder="e.g. 7369891858">
                    <i aria-hidden="true" class="fa-solid fa-phone input-left-icon"></i>
                  </div>
                </div>

                <!-- Official Email -->
                <div class="admin-form-group">
                  <label for="adminSettingEmail">Official Email Address <span class="req-star">*</span></label>
                  <div class="input-icon-wrap">
                    <input type="email" id="adminSettingEmail" class="portal-input" value="${(admin.email || '').replace(/"/g, '&quot;')}" required placeholder="e.g. chandan@pragyaninstitute.com">
                    <i aria-hidden="true" class="fa-solid fa-envelope input-left-icon"></i>
                  </div>
                </div>

                <!-- Official Institute UPI ID -->
                <div class="admin-form-group">
                  <label for="adminSettingUpi">Institute Official UPI ID (VPA) <span class="req-star">*</span></label>
                  <div class="input-icon-wrap">
                    <input type="text" id="adminSettingUpi" class="portal-input" value="${(admin.upiId || 'chandankr1501998@ybl').replace(/"/g, '&quot;')}" required placeholder="e.g. chandankr1501998@ybl">
                    <i aria-hidden="true" class="fa-solid fa-building-columns input-left-icon"></i>
                  </div>
                  <div class="admin-field-hint">Printed on fee receipts, student payment vouchers & QR codes</div>
                </div>

                <!-- Hidden Base64 / URL Photo Storage -->
                <input type="hidden" id="adminSettingPhotoBase64" value="${admin.photoUrl || ''}">
              </div>

              <!-- CARD 2: LOGIN CREDENTIALS & SECURITY -->
              <div class="admin-profile-card">
                <div class="admin-card-head">
                  <div class="admin-card-head-icon" style="background: rgba(217, 119, 6, 0.1); color: #D97706;">
                    <i aria-hidden="true" class="fa-solid fa-shield-halved"></i>
                  </div>
                  <div>
                    <div class="admin-card-head-title">2. Admin ID & Password Security</div>
                    <div class="admin-card-head-desc">Access control, password updates & security verification</div>
                  </div>
                </div>

                <!-- Username / ID -->
                <div class="admin-form-group">
                  <label for="adminSettingUsername">Permanent Admin Username / ID</label>
                  <div class="input-icon-wrap">
                    <input type="text" id="adminSettingUsername" class="portal-input input-readonly" value="${(admin.username || '').replace(/"/g, '&quot;')}" readonly disabled title="Admin username is fixed and cannot be changed">
                    <i aria-hidden="true" class="fa-solid fa-lock input-left-icon"></i>
                  </div>
                  <div class="admin-field-hint">Permanent institutional admin identifier (read-only)</div>
                </div>

                <!-- New Password (Optional) - Full Width -->
                <div class="admin-form-group">
                  <label for="adminSettingNewPass">New Password (Optional)</label>
                  <div class="input-icon-wrap">
                    <input type="password" id="adminSettingNewPass" class="portal-input" placeholder="Leave blank to keep current password" autocomplete="new-password">
                    <i aria-hidden="true" class="fa-solid fa-key input-left-icon"></i>
                    <button type="button" class="btn-toggle-admin-pw" data-target="adminSettingNewPass" aria-label="Toggle password visibility">
                      <i aria-hidden="true" class="fa-regular fa-eye"></i>
                    </button>
                  </div>
                </div>

                <!-- Confirm New Password - Full Width -->
                <div class="admin-form-group">
                  <label for="adminSettingConfirmPass">Confirm New Password</label>
                  <div class="input-icon-wrap">
                    <input type="password" id="adminSettingConfirmPass" class="portal-input" placeholder="Re-enter new password to confirm" autocomplete="new-password">
                    <i aria-hidden="true" class="fa-solid fa-check-double input-left-icon"></i>
                    <button type="button" class="btn-toggle-admin-pw" data-target="adminSettingConfirmPass" aria-label="Toggle password visibility">
                      <i aria-hidden="true" class="fa-regular fa-eye"></i>
                    </button>
                  </div>
                  <div class="security-hint" id="adminPasswordMatchHint">
                    Leave blank to keep current password. Minimum 12 characters if updating.
                  </div>
                </div>

                <!-- Current Password Verification Alert Box -->
                <div class="admin-security-alert-box">
                  <div class="security-alert-icon">
                    <i aria-hidden="true" class="fa-solid fa-triangle-exclamation"></i>
                  </div>
                  <div class="security-alert-body">
                    <label for="adminSettingCurrentPass" class="security-alert-label">
                      Current Admin Password (Required to Authorize Changes) <span class="req-star">*</span>
                    </label>
                    <div class="input-icon-wrap">
                      <input type="password" id="adminSettingCurrentPass" class="portal-input security-auth-input" required placeholder="Enter current password to verify identity">
                      <i aria-hidden="true" class="fa-solid fa-shield-halved input-left-icon" style="color: #DC2626 !important;"></i>
                      <button type="button" class="btn-toggle-admin-pw" data-target="adminSettingCurrentPass" aria-label="Toggle password visibility">
                        <i aria-hidden="true" class="fa-regular fa-eye"></i>
                      </button>
                    </div>
                    <div class="security-alert-hint">Mandatory security verification step for all profile and credential updates.</div>
                  </div>
                </div>
              </div>

              <!-- CARD 3: ACTIVE SESSIONS & MULTI-DEVICE SECURITY -->
              <div class="admin-profile-card admin-session-security-card">
                <div class="admin-card-head">
                  <div class="admin-card-head-icon" style="background: rgba(220, 38, 38, 0.1); color: #DC2626;">
                    <i aria-hidden="true" class="fa-solid fa-laptop-file"></i>
                  </div>
                  <div>
                    <div class="admin-card-head-title">3. Multi-Device Session Security</div>
                    <div class="admin-card-head-desc">Manage active logins and terminate sessions across other devices</div>
                  </div>
                </div>

                <div class="admin-session-box">
                  <div class="admin-session-status-row">
                    <div class="session-status-icon">
                      <i aria-hidden="true" class="fa-solid fa-shield-halved" style="color: #059669;"></i>
                    </div>
                    <div>
                      <strong style="color: #0F172A; font-size: 0.92rem;">Active Logged-in Devices</strong>
                      <p class="admin-field-hint" style="margin: 0.2rem 0 0;">Manage and view all phones, tablets, and computers currently authenticated with your Admin profile.</p>
                    </div>
                  </div>

                  <!-- Real-time Active Devices Container -->
                  <div id="adminDeviceListContainer" class="admin-device-list-wrap">
                    <div class="admin-device-loading">
                      <i aria-hidden="true" class="fa-solid fa-circle-notch fa-spin"></i> Loading active devices…
                    </div>
                  </div>

                  <div class="admin-session-action-wrap" style="margin-top: 1rem; border-top: 1px solid #E2E8F0; padding-top: 1rem;">
                    <p style="font-size: 0.88rem; color: #475569; line-height: 1.5; margin: 0 0 0.85rem 0;">
                      Logged into your Admin account on a shared computer, mobile phone, or previous device? You can instantly invalidate and terminate all other active login tokens worldwide with one click.
                    </p>
                    <button type="button" class="btn-logout-all-devices" id="btnAdminLogoutAllDevices">
                      <i aria-hidden="true" class="fa-solid fa-arrow-right-from-bracket"></i> Log Out from All Other Devices
                    </button>
                  </div>
                </div>
              </div>

            </div>

            <div class="admin-profile-submit-wrap">
              <button type="submit" class="btn btn-emerald btn-admin-settings-submit">
                <i aria-hidden="true" class="fa-solid fa-floppy-disk"></i> Save & Sync Profile Changes
              </button>
            </div>
          </form>
        </div>
      `;

      // Password Eye Toggles for Admin Form
      pane.querySelectorAll('.btn-toggle-admin-pw').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const targetId = btn.getAttribute('data-target');
          const input = pane.querySelector('#' + targetId);
          if (input) {
            const isPassword = input.type === 'password';
            input.type = isPassword ? 'text' : 'password';
            const icon = btn.querySelector('i');
            if (icon) {
              icon.classList.toggle('fa-eye', !isPassword);
              icon.classList.toggle('fa-eye-slash', isPassword);
            }
          }
        });
      });

      // Real-time password matching check for admin
      const adminNewPIn = pane.querySelector('#adminSettingNewPass');
      const adminConfPIn = pane.querySelector('#adminSettingConfirmPass');
      const adminMatchHint = pane.querySelector('#adminPasswordMatchHint');
      function checkAdminPassMatch() {
        if (!adminNewPIn || !adminConfPIn || !adminMatchHint) return;
        const v1 = adminNewPIn.value;
        const v2 = adminConfPIn.value;
        if (!v1 && !v2) {
          adminMatchHint.innerHTML = 'Leave blank to keep current password. Minimum 12 characters if updating.';
          adminMatchHint.style.color = 'var(--text-muted)';
          adminConfPIn.style.borderColor = '#CBD5E1';
        } else if (v1 && v1.length < 12) {
          adminMatchHint.innerHTML = '<i aria-hidden="true" class="fa-solid fa-circle-exclamation" style="color: #D97706;"></i> New password must be at least 12 characters long.';
          adminMatchHint.style.color = '#B45309';
          adminConfPIn.style.borderColor = '#F59E0B';
        } else if (v1 === v2 && v1.length >= 12) {
          adminMatchHint.innerHTML = '<i aria-hidden="true" class="fa-solid fa-circle-check" style="color: #10B981;"></i> New passwords match perfectly!';
          adminMatchHint.style.color = '#059669';
          adminConfPIn.style.borderColor = '#10B981';
        } else {
          adminMatchHint.innerHTML = '<i aria-hidden="true" class="fa-solid fa-circle-xmark" style="color: #EF4444;"></i> Passwords do not match.';
          adminMatchHint.style.color = '#DC2626';
          adminConfPIn.style.borderColor = '#EF4444';
        }
      }
      adminNewPIn?.addEventListener('input', checkAdminPassMatch);
      adminConfPIn?.addEventListener('input', checkAdminPassMatch);

      // Handle Photo Upload (NH8)
      pane.querySelector('#adminPhotoFileInput')?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const uploadedUrl = await SupabaseSync.uploadFile(file, 'admin_avatars');
          if (uploadedUrl) {
            pane.querySelector('#adminSettingPhotoBase64').value = uploadedUrl;
            const preview = pane.querySelector('#adminAvatarPreview');
            if (preview) {
              preview.innerHTML = `<img src="${uploadedUrl}" alt="Admin Avatar" style="width:100%; height:100%; object-fit:cover;">`;
            }
          }
        } catch (uploadErr) {
          alert('⚠️ Avatar upload failed: ' + uploadErr.message);
        }
      });

      // Form Submit Listener
      pane.querySelector('#adminSettingsForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const currentPassInput = pane.querySelector('#adminSettingCurrentPass')?.value || '';
        const newPassInput = pane.querySelector('#adminSettingNewPass')?.value || '';
        const confirmPassInput = pane.querySelector('#adminSettingConfirmPass')?.value || '';

        const adminsList = AppState.getAdmins();
        const targetAdminIdx = adminsList.findIndex(a => a.id === admin.id);
        if (targetAdminIdx === -1) return;

        const targetAdmin = adminsList[targetAdminIdx];
        if (targetAdmin.id !== AppState.currentUser?.id) {
          alert('For security, an administrator may update only their own profile.');
          return;
        }

        if (newPassInput) {
          if (newPassInput !== confirmPassInput || newPassInput.length < 12 || !currentPassInput) {
            alert('Enter your current password and a matching new password of at least 12 characters.');
            return;
          }
          let updatedPassword = false;
          try {
            const passwordResponse = await fetch('/api/admin-password', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionStorage.getItem('pragyan_portal_token') || ''}` },
              body: JSON.stringify({ currentPassword: currentPassInput, newPassword: newPassInput })
            });
            const passwordPayload = await passwordResponse.json().catch(() => ({}));
            if (passwordResponse.ok && passwordPayload.success) {
              updatedPassword = true;
            } else if (passwordPayload.error) {
              alert('⚠️ Password update failed: ' + passwordPayload.error);
              return;
            }
          } catch (e) {
            console.warn('API password update network note:', e);
          }

          if (!updatedPassword) {
            alert('⚠️ Password change requires an active server session. Please log in again to verify your identity.');
            return;
          }
        }

        targetAdmin.name = pane.querySelector('#adminSettingName').value.trim();
        targetAdmin.role = pane.querySelector('#adminSettingRole').value.trim();
        targetAdmin.mobile = pane.querySelector('#adminSettingMobile').value.trim();
        targetAdmin.email = pane.querySelector('#adminSettingEmail').value.trim();
        targetAdmin.username = pane.querySelector('#adminSettingUsername').value.trim();
        targetAdmin.upiId = pane.querySelector('#adminSettingUpi').value.trim();
        targetAdmin.photoUrl = pane.querySelector('#adminSettingPhotoBase64').value;

        adminsList[targetAdminIdx] = targetAdmin;
        await AppState.saveAdmins(adminsList);

        if (AppState.currentUser && AppState.currentUser.id === targetAdmin.id) {
          AppState.currentUser = targetAdmin;
        }

        AppState.addAuditLog(targetAdmin.name, 'ADMIN_SETTINGS_UPDATED', targetAdmin.name, 'N/A', `Updated profile & login credentials for ${targetAdmin.name} (${targetAdmin.username})`);

        // Update top header elements
        const headerName = document.getElementById('adminHeaderName');
        if (headerName && AppState.currentUser) headerName.textContent = AppState.currentUser.name;

        alert(`🎉 Account details for ${targetAdmin.name} updated and synchronized successfully!`);
        renderAdminDashboard();
      });

      // Active Devices Loader & Real-time Render
      async function loadAndRenderAdminDevices() {
        const container = pane.querySelector('#adminDeviceListContainer');
        if (!container) return;

        try {
          const token = sessionStorage.getItem('pragyan_portal_token') || localStorage.getItem('pragyan_portal_token') || AppState.token;
          const res = await fetch('/api/admin-sessions', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const data = await res.json();
          const sessions = (data.success && Array.isArray(data.sessions)) ? data.sessions : [];

          if (!sessions.length) {
            const isMobile = /Android|iPhone|iPod|Mobile/i.test(navigator.userAgent);
            const isTablet = /iPad|Tablet/i.test(navigator.userAgent);
            const iconClass = isMobile ? 'fa-mobile-screen-button' : (isTablet ? 'fa-tablet-screen-button' : 'fa-laptop');
            const deviceLabel = isMobile ? 'Current Mobile Browser' : (isTablet ? 'Current Tablet Browser' : 'Current Web Browser');
            container.innerHTML = `
              <div class="admin-device-card is-current">
                <div class="device-icon-wrap"><i aria-hidden="true" class="fa-solid ${iconClass}"></i></div>
                <div class="device-info-wrap">
                  <div class="device-title-row">
                    <span class="device-name">${escapeHtml(deviceLabel)}</span>
                    <span class="device-badge device-badge-current"><i aria-hidden="true" class="fa-solid fa-circle-check"></i> This Device (Active)</span>
                  </div>
                  <div class="device-meta-row">
                    <span><i aria-hidden="true" class="fa-solid fa-network-wired"></i> Authenticated Session</span>
                  </div>
                </div>
              </div>
            `;
            return;
          }

          container.innerHTML = `
            <div class="admin-devices-grid">
              ${sessions.map(s => {
                let iconClass = 'fa-laptop';
                if (s.device_type === 'mobile') iconClass = 'fa-mobile-screen-button';
                else if (s.device_type === 'tablet') iconClass = 'fa-tablet-screen-button';

                const isCur = Boolean(s.is_current);
                const activeDate = s.last_active_at ? new Date(s.last_active_at) : new Date();
                const activeFormatted = isCur ? 'Active Now' : ('Last active ' + activeDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ' at ' + activeDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));

                return `
                  <div class="admin-device-card ${isCur ? 'is-current' : 'is-remote'}" data-session-id="${escapeHtml(s.session_id)}">
                    <div class="device-icon-wrap">
                      <i aria-hidden="true" class="fa-solid ${iconClass}"></i>
                    </div>
                    <div class="device-info-wrap">
                      <div class="device-title-row">
                        <span class="device-name">${escapeHtml(s.device_name || (s.browser + ' on ' + s.os))}</span>
                        ${isCur ? `
                          <span class="device-badge device-badge-current"><i aria-hidden="true" class="fa-solid fa-circle-check"></i> This Device (Active)</span>
                        ` : `
                          <span class="device-badge device-badge-remote"><i aria-hidden="true" class="fa-regular fa-clock"></i> ${escapeHtml(activeFormatted)}</span>
                        `}
                      </div>
                      <div class="device-meta-row">
                        <span><i aria-hidden="true" class="fa-solid fa-network-wired"></i> IP: ${escapeHtml(s.ip_address || '—')}</span>
                        ${!isCur && s.created_at ? `<span>• Logged in: ${new Date(s.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>` : ''}
                      </div>
                    </div>
                    <div class="device-action-wrap">
                      ${!isCur ? `
                        <button type="button" class="btn-revoke-device" data-revoke-sid="${escapeHtml(s.session_id)}" title="Terminate session on this device">
                          <i aria-hidden="true" class="fa-solid fa-ban"></i> <span class="btn-revoke-text">Log Out</span>
                        </button>
                      ` : `
                        <span class="device-current-pill">Current Session</span>
                      `}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          `;

          // Wire individual revoke buttons
          container.querySelectorAll('.btn-revoke-device').forEach(btn => {
            btn.addEventListener('click', async (e) => {
              e.preventDefault();
              const sid = btn.dataset.revokeSid;
              if (!sid) return;
              if (!confirm('Log out this specific device now?\n\nThis will immediately terminate the session on that device.')) return;
              btn.disabled = true;
              btn.innerHTML = '<i aria-hidden="true" class="fa-solid fa-spinner fa-spin"></i>';
              try {
                const revRes = await fetch('/api/admin-sessions', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                  },
                  body: JSON.stringify({ action: 'revoke_device', session_id: sid })
                });
                const revData = await revRes.json();
                if (revData.success) {
                  showNotification('Device session terminated successfully.', 'success');
                  loadAndRenderAdminDevices();
                } else {
                  showNotification(`Failed: ${revData.error || 'Unknown error'}`, 'error');
                  btn.disabled = false;
                  btn.innerHTML = '<i aria-hidden="true" class="fa-solid fa-ban"></i> Log Out';
                }
              } catch (err) {
                showNotification(`Error: ${err.message}`, 'error');
                btn.disabled = false;
                btn.innerHTML = '<i aria-hidden="true" class="fa-solid fa-ban"></i> Log Out';
              }
            });
          });

        } catch (err) {
          const isMobile = /Android|iPhone|iPod|Mobile/i.test(navigator.userAgent);
          const isTablet = /iPad|Tablet/i.test(navigator.userAgent);
          const iconClass = isMobile ? 'fa-mobile-screen-button' : (isTablet ? 'fa-tablet-screen-button' : 'fa-laptop');
          const deviceLabel = isMobile ? 'Current Mobile Browser' : (isTablet ? 'Current Tablet Browser' : 'Current Web Browser');
          container.innerHTML = `
            <div class="admin-device-card is-current">
              <div class="device-icon-wrap"><i aria-hidden="true" class="fa-solid ${iconClass}"></i></div>
              <div class="device-info-wrap">
                <div class="device-title-row">
                  <span class="device-name">${escapeHtml(deviceLabel)}</span>
                  <span class="device-badge device-badge-current"><i aria-hidden="true" class="fa-solid fa-circle-check"></i> This Device (Active)</span>
                </div>
                <div class="device-meta-row">
                  <span><i aria-hidden="true" class="fa-solid fa-network-wired"></i> Local/Cached Session</span>
                </div>
              </div>
            </div>
          `;
        }
      }

      // Initial device load
      loadAndRenderAdminDevices();

      // Logout from all other devices handler
      const btnLogoutAll = pane.querySelector('#btnAdminLogoutAllDevices');
      btnLogoutAll?.addEventListener('click', async (e) => {
        e.preventDefault();
        if (!confirm('Are you sure you want to log out your Admin account from all other devices?\n\nAll other active sessions on other phones, laptops, and browsers will be immediately terminated. You will remain logged in on this device.')) {
          return;
        }

        btnLogoutAll.disabled = true;
        const originalHtml = btnLogoutAll.innerHTML;
        btnLogoutAll.innerHTML = '<i aria-hidden="true" class="fa-solid fa-spinner fa-spin"></i> Revoking All Other Sessions...';

        try {
          const token = sessionStorage.getItem('pragyan_portal_token') || localStorage.getItem('pragyan_portal_token') || AppState.token;
          const res = await fetch('/api/admin-logout-all', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            }
          });
          const data = await res.json();
          if (data.success) {
            if (data.token) {
              sessionStorage.setItem('pragyan_portal_token', data.token);
              localStorage.setItem('pragyan_portal_token', data.token);
              AppState.token = data.token;
              if (window.SupabaseSync && typeof window.SupabaseSync.setSessionToken === 'function') {
                window.SupabaseSync.setSessionToken(data.token);
              }
            }
            showNotification('🔒 All other device sessions have been logged out successfully! This device remains active.', 'success');
            loadAndRenderAdminDevices();
          } else {
            showNotification(`Failed to revoke sessions: ${data.error || 'Unknown error'}`, 'error');
          }
        } catch (err) {
          showNotification(`Network error: ${err.message}`, 'error');
        } finally {
          btnLogoutAll.disabled = false;
          btnLogoutAll.innerHTML = originalHtml;
        }
      });

    } catch (err) {
      console.error('Error rendering Admin Settings tab:', err);
    }
  }

  /* ==========================================================================
   * STUDENT DIRECTORY FILTERING & SORTING STATE
   * ========================================================================== */
  let directoryClassFilter = 'all';
  let directoryFeeFilter = 'all';
  let directorySortOrder = 'default';
  let directorySearchQuery = '';

  function applyStudentDirectoryFilters(studentsList) {
    let result = studentsList.filter(s => {
      // 1. Search Query (F9)
      let matchesSearch = true;
      if (directorySearchQuery) {
        const q = directorySearchQuery.trim().toLowerCase();
        const qNum = q.replace(/\D/g, '');
        const matchesMobile = (qNum.length >= 3 && String(s.mobile || '').includes(qNum));
        const matchesRoll = (qNum.length > 0 && String(s.rollNo || '').toLowerCase().includes(q));
        matchesSearch = String(s.name || '').toLowerCase().includes(q) ||
                        String(s.id || '').toLowerCase().includes(q) ||
                        String(s.className || '').toLowerCase().includes(q) ||
                        matchesMobile ||
                        matchesRoll;
      }

      // 2. Class Wise Filter
      // Compares resolved batch ids, not substrings. The old test was
      // `s.className.includes(filter)`, which under the four-key filter set
      // matched "Class 10th" for the '10th' option but also matched
      // "Class 8th" for a '8th' filter and "Class 1st to 5th (2010)" for
      // '10th'; with canonical ids it would have matched nothing at all.
      let matchesClass = true;
      if (directoryClassFilter !== 'all') {
        matchesClass = getBatchCategoryKey(s.className || s.class_name || s.batchName || '') === directoryClassFilter;
      }

      // 3. Fee Status Filter
      let matchesFee = true;
      if (directoryFeeFilter === 'pending') {
        matchesFee = (s.pendingFee > 0);
      } else if (directoryFeeFilter === 'cleared') {
        matchesFee = (s.pendingFee <= 0);
      } else if (directoryFeeFilter === 'high_due') {
        matchesFee = (s.pendingFee >= 2000);
      }

      return matchesSearch && matchesClass && matchesFee;
    });

    // 4. Sort Order
    if (directorySortOrder === 'fee_max_to_min') {
      result.sort((a, b) => (b.pendingFee || 0) - (a.pendingFee || 0));
    } else if (directorySortOrder === 'fee_min_to_max') {
      result.sort((a, b) => (a.pendingFee || 0) - (b.pendingFee || 0));
    } else if (directorySortOrder === 'paid_max_to_min') {
      result.sort((a, b) => (b.paidFee || 0) - (a.paidFee || 0));
    } else if (directorySortOrder === 'name_asc') {
      result.sort((a, b) => a.name.localeCompare(b.name));
    }

    return result;
  }

  function renderAdminStudentList() {
    const pane = document.getElementById('adminTabPane-students');
    if (!pane) return;

    const students = AppState.getStudents();
    const activeFilteredStudents = applyStudentDirectoryFilters(students);

    pane.innerHTML = `
      <div class="dash-card">
        <!-- Top Toolbar & Add Student -->
        <div class="admin-toolbar" style="display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; justify-content: space-between; margin-bottom: 1.1rem;">
          <div class="search-box-portal" style="flex: 1; min-width: 240px;">
            <i aria-hidden="true" class="fa-solid fa-magnifying-glass"></i>
            <input type="text" id="adminSearchStudent" aria-label="Search students by name, roll number or mobile" class="search-input-field" placeholder="Search 100s of students by name, roll, mobile..." value="${directorySearchQuery}">
          </div>
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
            <button class="btn btn-emerald" id="btnAddNewStudentModal" style="padding: 0.5rem 0.85rem; font-size: 0.85rem;">
              <i aria-hidden="true" class="fa-solid fa-user-plus"></i> Add Student
            </button>
            <label for="bulkCsvFileInput" class="btn" style="background-color: var(--secondary-sage); color: #fff; padding: 0.5rem 0.85rem; font-size: 0.85rem; cursor: pointer; margin-bottom: 0;">
              <i aria-hidden="true" class="fa-solid fa-file-csv"></i> Bulk CSV
              <input type="file" id="bulkCsvFileInput" accept=".csv" style="display: none;">
            </label>
          </div>
        </div>

        <!-- Filter & Sorting Bar (Class Wise, Fee Status, Fee Max-Min) -->
        <div class="admin-filter-bar" style="display: flex; gap: 0.6rem; flex-wrap: wrap; align-items: center; justify-content: space-between; background: #FAF9F6; border: 1px solid var(--border-sand); padding: 0.75rem 1rem; border-radius: 8px; margin-bottom: 1.25rem;">
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center;">
            <!-- FILTER 1: CLASS WISE -->
            <select id="filterClassWise" class="portal-input" aria-label="Filter the student directory by class or batch" style="width: auto; font-size: 0.83rem; padding: 0.45rem 0.75rem;">
              ${batchFilterOptions(directoryClassFilter, '📚 Class Wise: All Batches')}
            </select>

            <!-- FILTER 2: FEE STATUS -->
            <select id="filterFeeStatus" aria-label="Filter students by fee status" class="portal-input" style="width: auto; font-size: 0.83rem; padding: 0.45rem 0.75rem;">
              <option value="all" ${directoryFeeFilter === 'all' ? 'selected' : ''}>💰 Fee Status: All</option>
              <option value="pending" ${directoryFeeFilter === 'pending' ? 'selected' : ''}>🔴 Pending Dues (> ₹0)</option>
              <option value="cleared" ${directoryFeeFilter === 'cleared' ? 'selected' : ''}>🟢 Cleared / Fee (0)</option>
              <option value="high_due" ${directoryFeeFilter === 'high_due' ? 'selected' : ''}>⚠️ High Dues (≥ ₹2,000)</option>
            </select>
          </div>

          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center;">
            <!-- FILTER 3: SORT ORDER (MAX TO MIN) -->
            <select id="sortStudentOrder" aria-label="Sort the student list" class="portal-input" style="width: auto; font-size: 0.83rem; padding: 0.45rem 0.75rem; border-color: var(--primary-emerald); font-weight: 700; color: var(--primary-emerald);">
              <option value="default" ${directorySortOrder === 'default' ? 'selected' : ''}>↕️ Sort Order (Default)</option>
              <option value="fee_max_to_min" ${directorySortOrder === 'fee_max_to_min' ? 'selected' : ''}>📊 Pending Fee: Max to Min (Highest First)</option>
              <option value="fee_min_to_max" ${directorySortOrder === 'fee_min_to_max' ? 'selected' : ''}>📉 Pending Fee: Min to Max (Lowest First)</option>
              <option value="paid_max_to_min" ${directorySortOrder === 'paid_max_to_min' ? 'selected' : ''}>💚 Paid Fee: Max to Min</option>
              <option value="name_asc" ${directorySortOrder === 'name_asc' ? 'selected' : ''}>🔤 Student Name: A to Z</option>
            </select>
            <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-muted); background: #E5E7EB; padding: 0.35rem 0.65rem; border-radius: 6px;">
              ${activeFilteredStudents.length} Students
            </span>
          </div>
        </div>

        <div class="table-responsive">
          <table class="portal-table">
            <thead>
              <tr>
                <th>Student ID</th>
                <th>Student Name</th>
                <th>Mobile Number</th>
                <th>DOB</th>
                <th>Class / Batch</th>
                <th>Fee Paid / Total</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="adminStudentTableBody">
              ${renderStudentTableRows(activeFilteredStudents)}
            </tbody>
          </table>
        </div>
      </div>
    `;

    const updateTable = () => {
      const filtered = applyStudentDirectoryFilters(students);
      const tbody = pane.querySelector('#adminStudentTableBody');
      if (tbody) tbody.innerHTML = renderStudentTableRows(filtered);
      bindStudentTableActions(pane);
    };

    // Search filter input (debounced for 60fps responsive typing)
    let studentSearchDebounce = null;
    pane.querySelector('#adminSearchStudent')?.addEventListener('input', (e) => {
      directorySearchQuery = e.target.value;
      if (studentSearchDebounce) clearTimeout(studentSearchDebounce);
      studentSearchDebounce = setTimeout(() => {
        updateTable();
      }, 120);
    });

    // Class filter select
    pane.querySelector('#filterClassWise')?.addEventListener('change', (e) => {
      directoryClassFilter = e.target.value;
      updateTable();
    });

    // Fee status select
    pane.querySelector('#filterFeeStatus')?.addEventListener('change', (e) => {
      directoryFeeFilter = e.target.value;
      updateTable();
    });

    // Sort order select
    pane.querySelector('#sortStudentOrder')?.addEventListener('change', (e) => {
      directorySortOrder = e.target.value;
      updateTable();
    });

    // Bulk CSV upload listener
    pane.querySelector('#bulkCsvFileInput')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(evt) {
        const text = evt.target.result;
        parseAndImportStudentCSV(text);
      };
      reader.readAsText(file);
    });

    // Add student modal trigger
    pane.querySelector('#btnAddNewStudentModal')?.addEventListener('click', () => {
      openAddStudentModal();
    });

    bindStudentTableActions(pane);
  }

  function getActiveTeacherName() {
    const current = AppState.currentUser || AppState.getAdmin();
    if (current && current.name) {
      return `${current.name}${current.role ? ` (${current.role})` : ''}`;
    }
    return 'CHANDAN KUMAR (Science Mentor & Admin)';
  }

  function getFormattedTimestamp() {
    const now = new Date();
    return now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) + ', ' +
           now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  }

  function renderStudentTableRows(studentsList) {
    if (studentsList.length === 0) {
      return '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">No matching student records found.</td></tr>';
    }
    return studentsList.map(s => `
      <tr>
        <td><strong class="font-mono">${s.student_id || s.rollNo || s.id}</strong></td>
        <td>
          <div style="font-weight: 700; color: var(--text-mahogany);">${sanitizeInput(s.name)}</div>
          <div style="font-size: 0.8rem; color: var(--text-muted);">Roll: #${s.rollNo} | ₹${studentMonthlyFee(s).toLocaleString('en-IN')}/mo</div>
        </td>
        <td>${sanitizeInput(s.mobile)}</td>
        <td>${formatDate(s.dob)}</td>
        <td>${sanitizeInput(s.className)}</td>
        <td>
          <div style="font-weight: 700; color: var(--primary-emerald);">Paid: ₹${s.paidFee.toLocaleString()}</div>
          ${s.pendingFee > 0 
            ? `<div style="font-size: 0.8rem; color: #DC2626; font-weight:700;"><i aria-hidden="true" class="fa-solid fa-circle"></i> Pending: ₹${s.pendingFee.toLocaleString()}</div>` 
            : '<div style="font-size: 0.8rem; color: #059669; font-weight:700;"><i aria-hidden="true" class="fa-solid fa-circle"></i> Cleared</div>'}
          ${(Array.isArray(s.feeHistory) && s.feeHistory.some(h => h.status === 'Adjusted' || (h.receiptNo && (h.receiptNo.startsWith('ADJ-') || h.receiptNo.startsWith('RATE-') || h.receiptNo.startsWith('DISC-'))))) 
            ? `<div style="margin-top: 0.2rem;"><span style="background: linear-gradient(135deg, #EDE9FE, #DDD6FE); color: #5B21B6; border: 1px solid #C4B5FD; padding: 0.12rem 0.45rem; border-radius: 4px; font-size: 0.8rem; font-weight: 800; display: inline-flex; align-items: center; gap: 0.25rem;"><i aria-hidden="true" class="fa-solid fa-scale-balanced"></i> Adjusted</span></div>`
            : ''}
        </td>
        <td>
          <div style="display: flex; gap: 0.35rem; align-items: center; flex-wrap: wrap;">
            <button class="btn-make-changes" data-id="${s.id}" style="background-color: var(--primary-emerald, #064E3B); color: #fff; border: none; padding: 0.45rem 0.75rem; border-radius: 6px; font-weight: 700; font-size: 0.8rem; cursor: pointer; display: inline-flex; align-items: center; gap: 0.3rem; box-shadow: 0 2px 6px rgba(6, 78, 59, 0.2);" title="Manage student profile, payments & dues">
              <i aria-hidden="true" class="fa-solid fa-sliders"></i> Make Changes
            </button>
            <button class="btn-reset-pw-dob" data-id="${s.id}" data-name="${s.name}" data-dob="${s.dob}" style="background-color: #FEF3C7; color: #92400E; border: 1px solid #FCD34D; padding: 0.45rem 0.65rem; border-radius: 6px; font-weight: 700; font-size: 0.8rem; cursor: pointer; display: inline-flex; align-items: center; gap: 0.3rem;" title="Reset login password to official Date of Birth (${s.dob})">
              <i aria-hidden="true" class="fa-solid fa-key"></i> Reset to DOB
            </button>
            <button class="btn-delete-student" data-id="${s.id}" style="color: #DC2626; cursor: pointer; border: none; background: transparent; padding: 0.4rem; font-size: 0.95rem;" title="Delete Record">
              <i aria-hidden="true" class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  function bindStudentTableActions(container) {
    // Open Make Changes Control Modal
    container.querySelectorAll('.btn-make-changes').forEach(btn => {
      btn.onclick = () => {
        openStudentManagementModal(btn.dataset.id, 'pay');
      };
    });

    // Reset student password to DOB
    container.querySelectorAll('.btn-reset-pw-dob').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.dataset.id;
        const name = btn.dataset.name || 'Student';
        const dob = btn.dataset.dob || 'DOB';
        if (confirm(`Reset login password for ${name} to their official Date of Birth (${dob})?`)) {
          const origHtml = btn.innerHTML;
          try {
            btn.disabled = true;
            btn.innerHTML = '<i aria-hidden="true" class="fa-solid fa-spinner fa-spin"></i> Resetting...';
            await AppState.resetStudentPasswordToDob(id);
            alert(`✅ Password for ${name} has been reset to Date of Birth (${dob}). The student can now log in using their DOB.`);
          } catch (err) {
            alert('Failed to reset password: ' + err.message);
          } finally {
            btn.disabled = false;
            btn.innerHTML = origHtml;
          }
        }
      };
    });

    // Delete student with comprehensive warning & cascade purge
    container.querySelectorAll('.btn-delete-student').forEach(btn => {
      btn.onclick = () => {
        openDeleteStudentModal(btn.dataset.id);
      };
    });
  }

  /* ==========================================================================
   * PERMANENT STUDENT DELETION & HIGH-SEVERITY DUES WARNING MODAL
   * ========================================================================== */
  function openDeleteStudentModal(studentId) {
    document.getElementById('deleteStudentModal')?.remove();

    const students = AppState.getStudents();
    const target = students.find(s => s.id === studentId || s.student_id === studentId || s.rollNo === studentId);
    if (!target) {
      alert('Student record could not be found.');
      return;
    }

    const teacherName = getActiveTeacherName();
    const duesAmount = Number(target.pendingFee || 0);
    const hasDues = duesAmount > 0;
    const paidAmount = Number(target.paidFee || 0);
    const receiptsCount = Array.isArray(target.feeHistory) ? target.feeHistory.length : 0;

    const modalHtml = `
      <div class="inner-modal-backdrop active" id="deleteStudentModal">
        <div class="inner-modal-content" style="max-width: 550px; border-top: 5px solid #DC2626; border-radius: 12px; box-shadow: 0 20px 40px rgba(0,0,0,0.25);">
          <div class="inner-modal-header" style="border-bottom: 1px solid #FEE2E2; padding-bottom: 0.85rem;">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <div style="width: 44px; height: 44px; border-radius: 50%; background: #FEE2E2; color: #DC2626; display: flex; align-items: center; justify-content: center; font-size: 1.35rem; flex-shrink: 0;">
                <i aria-hidden="true" class="fa-solid fa-triangle-exclamation"></i>
              </div>
              <div>
                <h3 style="margin: 0; color: #991B1B; font-size: 1.15rem; font-weight: 800;">Permanent Student Record Deletion</h3>
                <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.2rem;">
                  Student: <strong style="color: var(--text-mahogany);">${target.name}</strong> | Roll: <strong style="color: var(--text-mahogany);">#${target.rollNo}</strong> | Class: <strong>${target.className}</strong>
                </div>
              </div>
            </div>
            <button type="button" aria-label="Close delete student dialog" class="btn-close-inner" onclick="document.getElementById('deleteStudentModal').remove()"><i aria-hidden="true" class="fa-solid fa-xmark"></i></button>
          </div>

          <!-- DUES WARNING CALLOUT -->
          ${hasDues ? `
            <div style="background: #FEF2F2; border: 1.5px solid #F87171; border-radius: 8px; padding: 1rem; margin: 1rem 0; box-shadow: 0 2px 8px rgba(220, 38, 38, 0.12);">
              <div style="display: flex; gap: 0.75rem; align-items: flex-start;">
                <i aria-hidden="true" class="fa-solid fa-circle-exclamation" style="color: #DC2626; font-size: 1.4rem; margin-top: 0.15rem; flex-shrink: 0;"></i>
                <div>
                  <div style="color: #991B1B; font-weight: 800; font-size: 0.96rem; margin-bottom: 0.35rem;">
                    🚨 OUTSTANDING DUE WARNING: ₹${duesAmount.toLocaleString()} UNPAID
                  </div>
                  <div style="color: #7F1D1D; font-size: 0.84rem; line-height: 1.5;">
                    This student currently has <strong>₹${duesAmount.toLocaleString()}</strong> in unpaid tuition fees. Deleting this record will <strong>permanently purge this outstanding due balance</strong> from the institute ledger and financial tracking without collecting the funds.
                  </div>
                </div>
              </div>
            </div>
          ` : `
            <div style="background: #ECFDF5; border: 1px solid #A7F3D0; border-radius: 8px; padding: 0.85rem 1rem; margin: 1rem 0; font-size: 0.84rem; color: #065F46; display: flex; align-items: center; gap: 0.6rem;">
              <i aria-hidden="true" class="fa-solid fa-circle-check" style="font-size: 1.2rem; color: #059669; flex-shrink: 0;"></i>
              <div><strong>All Fees Cleared:</strong> This student has ₹0 pending dues. Total paid fee to date: <strong>₹${paidAmount.toLocaleString()}</strong>.</div>
            </div>
          `}

          <!-- PURGE IMPACT CHECKLIST -->
          <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 0.9rem 1rem; margin-bottom: 1.15rem; font-size: 0.82rem; color: var(--text-mahogany);">
            <div style="font-weight: 700; color: #334155; margin-bottom: 0.5rem; text-transform: uppercase; font-size: 0.8rem; letter-spacing: 0.5px;">
              Permanent Cascade Actions (Irreversible):
            </div>
            <ul style="margin: 0; padding-left: 1.2rem; line-height: 1.65; color: #475569;">
              <li>Erase student profile from cloud database, directory, and active roster.</li>
              <li>Purge all <strong>${receiptsCount}</strong> payment history receipts and billing records.</li>
              <li>Instantly revoke student portal login credentials and Date of Birth access.</li>
              <li>Delete pending requests, notification links, and digital 3D VIP ID pass.</li>
              <li>Delete cloud-hosted profile photo and identification assets.</li>
            </ul>
          </div>

          <!-- CONFIRMATION FORM (typed roll confirmation is UNCONDITIONAL) -->
          <form id="deleteStudentConfirmForm">
              <div style="margin-bottom: 1.15rem;">
                <label for="deleteConfirmRollInput" style="font-size: 0.84rem; font-weight: 700; color: #991B1B; display: block; margin-bottom: 0.35rem;">
                  Type student roll number (<span style="font-family: monospace; background: #FEE2E2; color: #991B1B; padding: 2px 6px; border-radius: 4px; font-weight: 800;">${target.rollNo}</span>) to authorize permanent deletion:
                </label>
                <input type="text" id="deleteConfirmRollInput" class="portal-input" placeholder="Type ${target.rollNo} here" required style="border: 1.5px solid #F87171; font-weight: 700; font-size: 0.95rem;">
              </div>

            <div style="display: flex; gap: 0.75rem; justify-content: flex-end; margin-top: 1.25rem;">
              <button type="button" class="btn" onclick="document.getElementById('deleteStudentModal').remove()" style="background: #F1F5F9; color: #334155; border: 1px solid #CBD5E1; padding: 0.7rem 1.25rem; font-weight: 700; border-radius: 6px; cursor: pointer;">
                Cancel & Keep Record
              </button>
              <button type="submit" id="btnConfirmStudentDelete" class="btn" style="background: #DC2626; color: #fff; border: none; padding: 0.7rem 1.35rem; font-weight: 700; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 0.45rem; box-shadow: 0 2px 6px rgba(220, 38, 38, 0.3);">
                <i aria-hidden="true" class="fa-solid fa-trash-can"></i> Permanently Delete Record
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modalEl = document.getElementById('deleteStudentModal');
    // A destructive dialog does not close on a stray backdrop click.
    wireModalA11y(modalEl, { closeOnBackdrop: false });
    modalEl.querySelector('#deleteStudentConfirmForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
if (true) {
const inputRoll = modalEl.querySelector('#deleteConfirmRollInput')?.value.trim();
        if (inputRoll !== String(target.rollNo)) {
          alert(`Confirmation Mismatch: You must type the exact roll number '${target.rollNo}' to confirm deletion of this student with pending dues.`);
          modalEl.querySelector('#deleteConfirmRollInput')?.focus();
          return;
        }
      }

      const btn = modalEl.querySelector('#btnConfirmStudentDelete');
      const origHtml = btn ? btn.innerHTML : '';
      try {
        if (btn) {
          btn.disabled = true;
          btn.innerHTML = '<i aria-hidden="true" class="fa-solid fa-spinner fa-spin"></i> Deleting from Database...';
        }
        const res = await AppState.deleteStudent(target.id);
        if (res && res.success) {
          modalEl.remove();
          alert(`🗑️ Student record for ${target.name} (Roll #${target.rollNo}) and all associated database records have been permanently deleted.`);
          renderAdminDashboard();
        } else {
          alert('Deletion Failed: ' + (res?.error || 'Unknown error'));
        }
      } catch (err) {
        alert('Deletion Failed: ' + err.message);
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = origHtml;
        }
      }
    });
  }

  /* ==========================================================================
   * UNIFIED STUDENT MANAGEMENT & FEE CONTROL HUB (MAKE CHANGES MODAL)
   * ========================================================================== */
  function openStudentManagementModal(studentId, initialSection = 'pay') {
    document.getElementById('studentManagementModal')?.remove();

    const students = AppState.getStudents();
    const target = students.find(s => s.id === studentId);
    if (!target) return;

    const teacherName = getActiveTeacherName();

    const cfg = academicConfig();
    const existingBatches = (cfg && cfg.resolveBatches)
      ? cfg.resolveBatches(target.className || target.class_name || '')
      : [];

    const initialClassCount = Math.max(1, Math.min(3, existingBatches.length || 1));
    const initialClass1 = existingBatches[0] ? existingBatches[0].className : (target.className || target.class_name || 'Class 10th (ACHIEVER)');
    const initialClass2 = existingBatches[1] ? existingBatches[1].className : '';
    const initialClass3 = existingBatches[2] ? existingBatches[2].className : '';

    // This student's own canonical monthly rate, resolved once for every preset
    // and label in the modal. 0 means the batch could not be resolved, in which
    // case the rate-dependent chips are omitted rather than shown at a guess.
    const mgmtMonthlyRate = studentMonthlyFee(target);

    const modalHtml = `
      <div class="inner-modal-backdrop active" id="studentManagementModal">
        <div class="inner-modal-content" style="max-width: 680px;">
          <div class="inner-modal-header">
            <div>
              <h3 style="margin:0;"><i aria-hidden="true" class="fa-solid fa-user-gear" style="color: var(--primary-emerald);"></i> ${target.name}</h3>
              <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.15rem;">ID: <strong>${target.student_id || target.rollNo || target.id}</strong> | Roll: <strong>#${target.rollNo}</strong> | Class: <strong>${target.className}</strong></div>
            </div>
            <button type="button" aria-label="Close student management dialog" class="btn-close-inner" onclick="document.getElementById('studentManagementModal').remove()"><i aria-hidden="true" class="fa-solid fa-xmark"></i></button>
          </div>

          <div style="font-size: 0.85rem; background: var(--bg-surface-cream, #FAF9F6); border: 1px solid var(--border-sand, #E5E7EB); color: var(--text-mahogany); padding: 0.75rem 1rem; border-radius: 8px; margin-bottom: 1.15rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
            <div><strong>Active Educator / Admin:</strong> ${teacherName}</div>
            <div>
              Paid: <strong style="color: #059669;">₹${(target.paidFee || 0).toLocaleString()}</strong> | 
              Pending: <strong style="color: ${target.pendingFee > 0 ? '#DC2626' : '#059669'};">₹${(target.pendingFee || 0).toLocaleString()}</strong>
            </div>
          </div>

          <!-- Section Switcher Sub-Pills -->
          <div class="stu-mgmt-sub-pills-bar">
            <button class="mgmt-sub-pill req-sub-pill ${initialSection === 'pay' ? 'active' : ''}" data-sec="pay">
              <i aria-hidden="true" class="fa-solid fa-hand-holding-dollar"></i> Partial Payment
            </button>
            <button class="mgmt-sub-pill req-sub-pill ${initialSection === 'regulate' ? 'active' : ''}" data-sec="regulate">
              <i aria-hidden="true" class="fa-solid fa-scale-balanced"></i> Fee Adjustment & Correction
            </button>
            <button class="mgmt-sub-pill req-sub-pill ${initialSection === 'due' ? 'active' : ''}" data-sec="due">
              <i aria-hidden="true" class="fa-solid fa-clock-rotate-left"></i> Add Old Due
            </button>
            <button class="mgmt-sub-pill req-sub-pill ${initialSection === 'profile' ? 'active' : ''}" data-sec="profile">
              <i aria-hidden="true" class="fa-solid fa-user-pen"></i> Edit Profile Details
            </button>
            <button class="mgmt-sub-pill req-sub-pill ${initialSection === 'security' ? 'active' : ''}" data-sec="security">
              <i aria-hidden="true" class="fa-solid fa-shield-halved"></i> Login & Security
            </button>
          </div>

          <!-- SECTION 1: PARTIAL FEE PAYMENT (PAY) -->
          <div class="stu-mgmt-sec" id="stuMgmtSec-pay" style="display: ${initialSection === 'pay' ? 'block' : 'none'};">
            <form id="mgmtPayForm">
              <div style="background: #ECFDF5; border: 1px solid #A7F3D0; border-radius: 8px; padding: 0.75rem 0.95rem; margin-bottom: 0.85rem; font-size: 0.82rem; color: #065F46; line-height: 1.45;">
                <i aria-hidden="true" class="fa-solid fa-circle-check" style="margin-right: 0.35rem;"></i>
                <strong>Partial Fee Payment:</strong> Enter the exact partial installment or custom amount paid by the student. This increases collected revenue and issues an official receipt.
              </div>

              <!-- Quick Presets for Partial Payment -->
              <!-- The two fixed chips are cash denominations, not fee rates. The
                   third is this student's own monthly rate. A flat 1,000 default
                   labelled the button "1-Month: ₹1,000" for a Class 12th student
                   whose month costs ₹1,500, so one click recorded a ₹500 short
                   payment as a full month. -->
              <div class="mgmt-quick-presets-grid">
                <button type="button" class="btn-mgmt-quick-pay btn-quick-partial" data-amt="500">
                  + ₹500
                </button>
                <button type="button" class="btn-mgmt-quick-pay btn-quick-partial" data-amt="1000">
                  + ₹1,000
                </button>
                ${mgmtMonthlyRate > 0 ? `
                <button type="button" class="btn-mgmt-quick-pay btn-quick-partial" data-amt="${mgmtMonthlyRate}">
                  1-Month: ₹${mgmtMonthlyRate.toLocaleString('en-IN')}
                </button>` : ''}
                <button type="button" class="btn-mgmt-quick-pay btn-quick-partial-clear">
                  <i class="fa-solid fa-rotate-left" aria-hidden="true"></i> Clear
                </button>
              </div>

              <div style="margin-bottom: 0.75rem;">
                <label for="mgmtPayAmount" style="font-size: 0.85rem; font-weight: 700; color: var(--text-mahogany);">Partial Payment Amount Paid (₹) *</label>
                <input type="number" id="mgmtPayAmount" class="portal-input" required placeholder="Enter paid amount (e.g. 500)" min="1" step="1" style="font-size: 1.05rem; font-weight: 700; color: #065F46;">
              </div>

              <!-- Live Balance Calculator Card -->
              <div id="mgmtPayCalcPreview" class="mgmt-calc-summary-grid">
                <div class="mgmt-calc-stat-box">
                  <span class="calc-stat-lbl">Current Dues</span>
                  <span class="calc-stat-val" style="color: #334155;">₹${(target.pendingFee || 0).toLocaleString()}</span>
                </div>
                <div class="mgmt-calc-stat-box">
                  <span class="calc-stat-lbl">Paying Now</span>
                  <span class="calc-stat-val" id="mgmtPayNowDisplay" style="color: #059669;">₹0</span>
                </div>
                <div class="mgmt-calc-stat-box">
                  <span class="calc-stat-lbl">Remaining Dues</span>
                  <span class="calc-stat-val" id="mgmtPayRemainingDisplay" style="color: ${target.pendingFee > 0 ? '#DC2626' : '#059669'};">₹${(target.pendingFee || 0).toLocaleString()}</span>
                </div>
              </div>

              <div style="margin-bottom: 0.9rem;">
                <label for="mgmtPayMode" style="font-size: 0.85rem; font-weight: 600;">Payment Mode</label>
                <select id="mgmtPayMode" class="portal-input">
                  <option value="Cash at Counter">Cash at Institute Counter</option>
                  <option value="UPI (PhonePe)">UPI (PhonePe)</option>
                  <option value="UPI (Google Pay)">UPI (Google Pay)</option>
                  <option value="Direct Bank Transfer">Direct Bank Transfer</option>
                </select>
              </div>

              <div style="margin-bottom: 1.25rem;">
                <label for="mgmtPayNote" style="font-size: 0.85rem; font-weight: 600;">Description / Audit Note</label>
                <input type="text" id="mgmtPayNote" class="portal-input" placeholder="e.g. Partial tuition installment paid by student">
              </div>

              <button type="submit" class="btn btn-emerald" style="width: 100%; padding: 0.85rem; background-color: #059669; font-weight: 700; font-size: 0.92rem; border-radius: 8px;">
                <i aria-hidden="true" class="fa-solid fa-receipt"></i> Submit Partial Payment & Issue Receipt
              </button>
            </form>
          </div>

          <!-- SECTION 2: ADD OLD DUE -->
          <div class="stu-mgmt-sec" id="stuMgmtSec-due" style="display: ${initialSection === 'due' ? 'block' : 'none'};">
            <form id="mgmtDueForm">
              <div style="margin-bottom: 0.9rem;">
                <label for="mgmtDueAmount" style="font-size: 0.85rem; font-weight: 600;">Old / Carryover Unpaid Amount (₹) *</label>
                <input type="number" id="mgmtDueAmount" class="portal-input" required placeholder="e.g. 2000" min="1">
              </div>
              <div style="margin-bottom: 1.25rem;">
                <label for="mgmtDueNote" style="font-size: 0.85rem; font-weight: 600;">Reason / Month Description *</label>
                <input type="text" id="mgmtDueNote" class="portal-input" required placeholder="e.g. Unpaid fee carryover for April & May">
              </div>
              <button type="submit" class="btn" style="width: 100%; padding: 0.8rem; background-color: #DC2626; color: #fff; border: none; font-weight: 700; border-radius: 6px; cursor: pointer;">
                <i aria-hidden="true" class="fa-solid fa-exclamation-triangle"></i> Add Old Due (Mark RED)
              </button>
            </form>
          </div>

          <!-- SECTION 3: FEE ADJUSTMENT & CORRECTION (REGULATE) -->
          <div class="stu-mgmt-sec" id="stuMgmtSec-regulate" style="display: ${initialSection === 'regulate' ? 'block' : 'none'};">
            <form id="mgmtRegulateForm">
              <div style="background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 8px; padding: 0.75rem 0.95rem; margin-bottom: 0.85rem; font-size: 0.82rem; color: #1E40AF; line-height: 1.45;">
                <i aria-hidden="true" class="fa-solid fa-circle-info" style="margin-right: 0.35rem;"></i>
                <strong>Non-Cash Correction:</strong> Fee adjustments modify the student's pending balance/dues only. They do <u>not</u> calculate as money collected and have zero impact on the Institute's cash intake.
              </div>

              <div style="margin-bottom: 0.9rem;">
                <label for="mgmtAdjActionType" style="font-size: 0.85rem; font-weight: 600;">Correction / Adjustment Type</label>
                <select id="mgmtAdjActionType" class="portal-input" required>
                  <option value="discount">Fee Waiver / Discount (Deduct from Pending Dues)</option>
                  <option value="penalty">Fee Correction / Extra Charge (Add to Pending Dues)</option>
                  <option value="override">Direct Balance Override (Set Exact New Pending Amount)</option>
                </select>
              </div>

              <div style="margin-bottom: 0.75rem;">
                <label for="mgmtAdjAmount" id="mgmtAdjAmountLabel" style="font-size: 0.85rem; font-weight: 700; color: var(--text-mahogany);">Correction / Adjustment Amount (₹) *</label>
                <input type="number" id="mgmtAdjAmount" class="portal-input" required placeholder="e.g. 500" min="0" step="1">
              </div>

              <!-- Live Adjustment Preview -->
              <div id="mgmtAdjPreview" class="mgmt-calc-summary-grid">
                <div class="mgmt-calc-stat-box">
                  <span class="calc-stat-lbl">Current Dues</span>
                  <span class="calc-stat-val" style="color: #334155;">₹${(target.pendingFee || 0).toLocaleString()}</span>
                </div>
                <div class="mgmt-calc-stat-box">
                  <span class="calc-stat-lbl">After Correction</span>
                  <span class="calc-stat-val" id="mgmtAdjResultDues" style="color: #0284C7;">₹${(target.pendingFee || 0).toLocaleString()}</span>
                </div>
                <div class="mgmt-calc-stat-box">
                  <span class="calc-stat-lbl">Paid Revenue</span>
                  <span class="calc-stat-val" style="color: #059669;">₹${(target.paidFee || 0).toLocaleString()}</span>
                </div>
              </div>

              <div style="margin-bottom: 1.25rem;">
                <label for="mgmtAdjNote" style="font-size: 0.85rem; font-weight: 600;">Reason / Audit Explanation *</label>
                <input type="text" id="mgmtAdjNote" class="portal-input" required placeholder="e.g. Fee structure correction / Special concession approved by Director">
              </div>

              <button type="submit" class="btn btn-emerald" style="width: 100%; padding: 0.85rem; font-weight: 700; font-size: 0.92rem; border-radius: 8px;">
                <i aria-hidden="true" class="fa-solid fa-scale-balanced"></i> Apply Fee Adjustment & Log Correction
              </button>
            </form>
          </div>

          <!-- SECTION 4: EDIT PROFILE -->
          <div class="stu-mgmt-sec" id="stuMgmtSec-profile" style="display: ${initialSection === 'profile' ? 'block' : 'none'};">
            <form id="mgmtEditProfileForm">
              <div class="mgmt-profile-grid">
                <div>
                  <label for="mgmtStuName" style="font-size: 0.85rem; font-weight: 600;">Student Full Name *</label>
                  <input type="text" id="mgmtStuName" class="portal-input" value="${target.name}" required>
                </div>
                <div>
                  <label for="mgmtStuMobile" style="font-size: 0.85rem; font-weight: 600;">Mobile Number *</label>
                  <input type="tel" id="mgmtStuMobile" class="portal-input" value="${target.mobile}" required maxlength="10" pattern="[0-9]{10}" inputmode="numeric" placeholder="10-digit mobile">
                </div>
                <div>
                  <label for="mgmtStuDob" style="font-size: 0.85rem; font-weight: 600;">Date of Birth (DOB) *</label>
                  <input type="date" id="mgmtStuDob" class="portal-input" value="${target.dob}" required>
                </div>

                <div class="col-span-2" style="background: #F0FDF4; border: 1.5px solid #86EFAC; border-radius: 10px; padding: 1rem; margin-bottom: 0.25rem;">
                  <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.75rem;">
                    <label style="font-size: 0.9rem; font-weight: 800; color: #065F46; margin: 0; display: flex; align-items: center; gap: 0.4rem;">
                      <i class="fa-solid fa-layer-group" aria-hidden="true" style="color: #059669;"></i>
                      Class &amp; Batch Enrollment Options (1, 2, or 3 Classes)
                    </label>
                    <div class="multi-class-count-selector" style="display: inline-flex; background: #DCFCE7; padding: 3px; border-radius: 8px; border: 1px solid #86EFAC;">
                      <button type="button" class="btn-class-count-pill ${initialClassCount === 1 ? 'active' : ''}" data-count="1" style="padding: 4px 12px; font-size: 0.8rem; font-weight: 700; border-radius: 6px; border: none; cursor: pointer; background: ${initialClassCount === 1 ? '#059669' : 'transparent'}; color: ${initialClassCount === 1 ? '#fff' : '#065F46'};">
                        1 Class
                      </button>
                      <button type="button" class="btn-class-count-pill ${initialClassCount === 2 ? 'active' : ''}" data-count="2" style="padding: 4px 12px; font-size: 0.8rem; font-weight: 700; border-radius: 6px; border: none; cursor: pointer; background: ${initialClassCount === 2 ? '#059669' : 'transparent'}; color: ${initialClassCount === 2 ? '#fff' : '#065F46'};">
                        2 Classes (Dual Batch)
                      </button>
                      <button type="button" class="btn-class-count-pill ${initialClassCount === 3 ? 'active' : ''}" data-count="3" style="padding: 4px 12px; font-size: 0.8rem; font-weight: 700; border-radius: 6px; border: none; cursor: pointer; background: ${initialClassCount === 3 ? '#059669' : 'transparent'}; color: ${initialClassCount === 3 ? '#fff' : '#065F46'};">
                        3 Classes (Triple Batch)
                      </button>
                    </div>
                  </div>

                  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.85rem;" id="mgmtClassDropdownsContainer">
                    <!-- Class 1 Dropdown (Primary Batch) -->
                    <div id="mgmtClass1Wrap">
                      <label for="mgmtStuClass1" style="font-size: 0.82rem; font-weight: 700; color: #166534; display: block; margin-bottom: 0.25rem;">
                        🎯 Primary Class / Batch 1 <span style="color: #DC2626;">*</span>
                      </label>
                      <select id="mgmtStuClass1" class="portal-input mgmt-class-select" style="width: 100%; font-weight: 600; background: #fff;">
                        ${batchSelectOptions(initialClass1)}
                      </select>
                    </div>

                    <!-- Class 2 Dropdown (Secondary Batch) -->
                    <div id="mgmtClass2Wrap" style="display: ${initialClassCount >= 2 ? 'block' : 'none'};">
                      <label for="mgmtStuClass2" style="font-size: 0.82rem; font-weight: 700; color: #166534; display: block; margin-bottom: 0.25rem;">
                        ➕ Secondary Class / Batch 2 (Add-on)
                      </label>
                      <select id="mgmtStuClass2" class="portal-input mgmt-class-select" style="width: 100%; font-weight: 600; background: #fff;">
                        ${batchSelectOptions(initialClass2, '-- Select 2nd Batch / Class --')}
                      </select>
                    </div>

                    <!-- Class 3 Dropdown (Tertiary Batch) -->
                    <div id="mgmtClass3Wrap" style="display: ${initialClassCount >= 3 ? 'block' : 'none'};">
                      <label for="mgmtStuClass3" style="font-size: 0.82rem; font-weight: 700; color: #166534; display: block; margin-bottom: 0.25rem;">
                        ➕ Tertiary Class / Batch 3 (Special)
                      </label>
                      <select id="mgmtStuClass3" class="portal-input mgmt-class-select" style="width: 100%; font-weight: 600; background: #fff;">
                        ${batchSelectOptions(initialClass3, '-- Select 3rd Batch / Class --')}
                      </select>
                    </div>
                  </div>

                  <!-- Real-time combined fee breakdown preview -->
                  <div id="mgmtClassFeeCalcPreview" style="margin-top: 0.75rem; padding: 0.5rem 0.75rem; background: #fff; border: 1px solid #BBF7D0; border-radius: 6px; font-size: 0.82rem; color: #166534; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem;">
                    <span id="mgmtClassFeeFormulaText">Enrollment: calculating...</span>
                    <span style="font-weight: 800; font-size: 0.9rem; color: #059669;" id="mgmtClassFeeTotalBadge">₹0/mo</span>
                  </div>
                </div>
                <div>
                  <label for="mgmtStuMonthlyFee" style="font-size: 0.85rem; font-weight: 600;">Custom Monthly Fee (₹/mo)</label>
                  <input type="number" id="mgmtStuMonthlyFee" class="portal-input" min="0" value="${studentMonthlyFee(target)}">
                </div>
                <div>
                  <label for="mgmtStuEmail" style="font-size: 0.85rem; font-weight: 600;">Email Address</label>
                  <input type="email" id="mgmtStuEmail" class="portal-input" value="${target.email}">
                </div>
                <div>
                  <label for="mgmtStuGuardian" style="font-size: 0.85rem; font-weight: 600;">Father / Guardian Name</label>
                  <input type="text" id="mgmtStuGuardian" class="portal-input" value="${target.guardianName}">
                </div>
                <div>
                  <label for="mgmtStuGuardianMobile" style="font-size: 0.85rem; font-weight: 600;">Guardian Contact</label>
                  <input type="tel" id="mgmtStuGuardianMobile" class="portal-input" value="${target.guardianMobile || target.mobile}" maxlength="10" pattern="[0-9]{10}" inputmode="numeric" placeholder="10-digit guardian contact">
                </div>
                <div>
                  <label for="mgmtStuBloodGroup" style="font-size: 0.85rem; font-weight: 600;">Blood Group</label>
                  <select id="mgmtStuBloodGroup" class="portal-input">
                    <option value="Not Specified" ${target.bloodGroup === 'Not Specified' ? 'selected' : ''}>Not Specified</option>
                    <option value="A+" ${target.bloodGroup === 'A+' ? 'selected' : ''}>A+</option>
                    <option value="A-" ${target.bloodGroup === 'A-' ? 'selected' : ''}>A-</option>
                    <option value="B+" ${target.bloodGroup === 'B+' ? 'selected' : ''}>B+</option>
                    <option value="B-" ${target.bloodGroup === 'B-' ? 'selected' : ''}>B-</option>
                    <option value="O+" ${target.bloodGroup === 'O+' ? 'selected' : ''}>O+</option>
                    <option value="O-" ${target.bloodGroup === 'O-' ? 'selected' : ''}>O-</option>
                    <option value="AB+" ${target.bloodGroup === 'AB+' ? 'selected' : ''}>AB+</option>
                    <option value="AB-" ${target.bloodGroup === 'AB-' ? 'selected' : ''}>AB-</option>
                  </select>
                </div>
                <div>
                  <label for="mgmtStuJoiningMonth" style="font-size: 0.85rem; font-weight: 600;">Joining Session / Month</label>
                  <input type="text" id="mgmtStuJoiningMonth" class="portal-input" value="${target.joiningMonth || 'April 2026'}">
                </div>
                <div class="col-span-2">
                  <label for="mgmtStuPhotoInput" style="font-size: 0.85rem; font-weight: 600;"><i class="fa-solid fa-camera" aria-hidden="true" style="color: var(--primary-emerald);"></i> Profile Photo (Upload to Cloud Storage)</label>
                  <div style="display: flex; gap: 0.75rem; align-items: center; margin-top: 0.35rem;">
                    <div id="mgmtPhotoPreviewContainer" style="width: 50px; height: 50px; border-radius: 8px; overflow: hidden; border: 2px solid var(--primary-emerald); flex-shrink: 0; background: #f3f4f6;">
                      <img id="mgmtPhotoPreviewImg" src="${target.photoUrl || target.photo_url || target.photo || 'assets/images/logo.png'}" style="width: 100%; height: 100%; object-fit: cover;">
                    </div>
                    <div style="flex: 1;">
                      <input type="file" id="mgmtStuPhotoInput" accept="image/*" class="portal-input" style="padding: 0.35rem; font-size: 0.8rem;">
                      <input type="hidden" id="mgmtStuPhotoUrl" value="${target.photoUrl || target.photo_url || target.photo || ''}">
                      <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.2rem;">Select photo to upload directly to Supabase Storage</div>
                    </div>
                  </div>
                </div>
                <div class="col-span-2">
                  <label for="mgmtStuAddress" style="font-size: 0.85rem; font-weight: 600;">Residential Address</label>
                  <input type="text" id="mgmtStuAddress" class="portal-input" value="${target.address}">
                </div>
              </div>
              <button type="submit" class="btn btn-emerald" style="width: 100%; padding: 0.8rem;">
                <i aria-hidden="true" class="fa-solid fa-floppy-disk"></i> Save & Synchronize Profile Changes
              </button>
            </form>
          </div>

          <!-- SECTION 5: LOGIN & SECURITY (PASSWORD RESET TO DOB) -->
          <div class="stu-mgmt-sec" id="stuMgmtSec-security" style="display: ${initialSection === 'security' ? 'block' : 'none'};">
            <div style="background: var(--bg-surface-cream, #FAF9F6); border: 1.5px solid var(--border-sand, #E5E7EB); border-radius: 10px; padding: 1.25rem; margin-bottom: 1.25rem;">
              <div style="display: flex; gap: 1rem; align-items: flex-start;">
                <div style="font-size: 2rem; color: var(--primary-emerald, #064E3B); background: rgba(6, 78, 59, 0.08); width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                  <i aria-hidden="true" class="fa-solid fa-user-shield"></i>
                </div>
                <div style="flex: 1;">
                  <h4 style="margin: 0 0 0.35rem 0; font-size: 1.02rem; color: var(--text-mahogany);">Student Login & Password Controls</h4>
                  <p style="margin: 0 0 0.85rem 0; font-size: 0.84rem; color: var(--text-muted); line-height: 1.55;">
                    Students can sign in using their custom portal password (if set) or their official Date of Birth (DOB).
                  </p>

                  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem; margin-bottom: 1rem;">
                    <div style="background: #fff; border: 1px solid #E2E8F0; border-radius: 8px; padding: 0.65rem 0.85rem;">
                      <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Student ID</div>
                      <div style="font-size: 0.95rem; font-weight: 700; color: var(--text-mahogany); font-family: monospace;">${target.student_id || target.rollNo || target.id}</div>
                    </div>
                    <div style="background: #fff; border: 1px solid #E2E8F0; border-radius: 8px; padding: 0.65rem 0.85rem;">
                      <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Default Password (DOB)</div>
                      <div style="font-size: 0.95rem; font-weight: 700; color: #059669; font-family: monospace;">${formatDate(target.dob)} (${target.dob})</div>
                    </div>
                  </div>

                  <div style="background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 8px; padding: 0.85rem 1rem; font-size: 0.82rem; color: #92400E; margin-bottom: 1.15rem; line-height: 1.5;">
                    <i aria-hidden="true" class="fa-solid fa-circle-info" style="margin-right: 0.35rem;"></i> <strong>Instant Admin Reset:</strong> If this student has updated their password and forgot it, click below to instantly reset their portal login credentials back to their Date of Birth.
                  </div>

                  <button type="button" id="btnAdminResetStuPasswordToDob" class="btn" style="background-color: #D97706; color: #fff; border: none; padding: 0.75rem 1.25rem; border-radius: 8px; font-weight: 700; font-size: 0.88rem; cursor: pointer; display: inline-flex; align-items: center; gap: 0.45rem; box-shadow: 0 2px 6px rgba(217, 119, 6, 0.25);">
                    <i aria-hidden="true" class="fa-solid fa-rotate-left"></i> Reset Password to DOB (${target.dob})
                  </button>

                  <!-- Danger Zone: Permanent Record Deletion -->
                  <div style="background: #FEF2F2; border: 1.5px solid #FCA5A5; border-radius: 8px; padding: 1rem; margin-top: 1.25rem;">
                    <div style="font-weight: 700; color: #991B1B; font-size: 0.88rem; margin-bottom: 0.3rem;">
                      <i aria-hidden="true" class="fa-solid fa-triangle-exclamation"></i> Danger Zone: Permanent Deletion
                    </div>
                    <p style="margin: 0 0 0.85rem 0; font-size: 0.8rem; color: #7F1D1D; line-height: 1.45;">
                      Permanently delete this student's master profile, all financial ledgers, receipts, and portal login access.
                    </p>
                    <button type="button" id="btnAdminTriggerDeleteStuModal" class="btn" style="background-color: #DC2626; color: #fff; border: none; padding: 0.65rem 1.15rem; border-radius: 6px; font-weight: 700; font-size: 0.84rem; cursor: pointer; display: inline-flex; align-items: center; gap: 0.4rem; box-shadow: 0 2px 6px rgba(220, 38, 38, 0.25);">
                      <i aria-hidden="true" class="fa-solid fa-trash-can"></i> Delete Student Record...
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modalEl = document.getElementById('studentManagementModal');
    // Capture the dialog handle: closing via .remove() strands the
    // reference-counted body-scroll lock (depth never decremented).
    const mgmtDialog = wireModalA11y(modalEl, { closeOnBackdrop: false });

    // Handle Danger Zone Delete Trigger
    modalEl.querySelector('#btnAdminTriggerDeleteStuModal')?.addEventListener('click', () => {
      mgmtDialog.close();
      openDeleteStudentModal(target.id);
    });

    // Handle Admin Password Reset to DOB
    modalEl.querySelector('#btnAdminResetStuPasswordToDob')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      if (confirm(`Reset login password for ${target.name} to their official Date of Birth (${target.dob})?`)) {
        const origHtml = btn.innerHTML;
        try {
          btn.disabled = true;
          btn.innerHTML = '<i aria-hidden="true" class="fa-solid fa-spinner fa-spin"></i> Resetting Password...';
          await AppState.resetStudentPasswordToDob(target.id);
          alert(`✅ Password for ${target.name} has been reset to Date of Birth (${target.dob}). The student can now log in using their DOB.`);
        } catch (err) {
          alert('Failed to reset password: ' + err.message);
        } finally {
          btn.disabled = false;
          btn.innerHTML = origHtml;
        }
      }
    });

    // Handle Admin Student Photo Upload
    modalEl.querySelector('#mgmtStuPhotoInput')?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const previewImg = modalEl.querySelector('#mgmtPhotoPreviewImg');
      const hiddenUrl = modalEl.querySelector('#mgmtStuPhotoUrl');
      try {
        if (typeof SupabaseSync !== 'undefined' && SupabaseSync.uploadFile) {
          const uploadedUrl = await SupabaseSync.uploadFile(file, 'profile_pictures');
          if (uploadedUrl) {
            hiddenUrl.value = uploadedUrl;
            if (previewImg) previewImg.src = uploadedUrl;
          }
        }
      } catch (err) {
        alert('Photo upload failed: ' + err.message);
      }
    });

    // Section Switcher Listeners
    modalEl.querySelectorAll('.req-sub-pill, .mgmt-sub-pill').forEach(pill => {
      pill.onclick = () => {
        const sec = pill.dataset.sec;
        modalEl.querySelectorAll('.req-sub-pill, .mgmt-sub-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');

        modalEl.querySelectorAll('.stu-mgmt-sec').forEach(sEl => sEl.style.display = 'none');
        const targetSec = modalEl.querySelector(`#stuMgmtSec-${sec}`);
        if (targetSec) targetSec.style.display = 'block';
      };
    });

    // Admin Partial Pay Input & Presets
    const adminPayInput = modalEl.querySelector('#mgmtPayAmount');
    const payNowDisplay = modalEl.querySelector('#mgmtPayNowDisplay');
    const payRemDisplay = modalEl.querySelector('#mgmtPayRemainingDisplay');

    function updatePayCalc(amt) {
      const val = parseFloat(amt) || 0;
      if (payNowDisplay) payNowDisplay.textContent = `₹${val.toLocaleString()}`;
      const rem = Math.max(0, (target.pendingFee || 0) - val);
      if (payRemDisplay) {
        payRemDisplay.textContent = `₹${rem.toLocaleString()}`;
        payRemDisplay.style.color = rem > 0 ? '#DC2626' : '#059669';
      }
    }

    adminPayInput?.addEventListener('input', (e) => {
      updatePayCalc(e.target.value);
    });

    modalEl.querySelectorAll('.btn-quick-partial').forEach(btn => {
      btn.addEventListener('click', () => {
        const amt = parseFloat(btn.dataset.amt) || 0;
        if (adminPayInput) {
          adminPayInput.value = amt;
          updatePayCalc(amt);
        }
      });
    });

    modalEl.querySelector('.btn-quick-partial-clear')?.addEventListener('click', () => {
      if (adminPayInput) {
        adminPayInput.value = '';
        updatePayCalc(0);
      }
    });

    // Fee Adjustment & Correction Live Preview Listener
    const adjTypeSelect = modalEl.querySelector('#mgmtAdjActionType');
    const adjAmountInput = modalEl.querySelector('#mgmtAdjAmount');
    const adjAmountLabel = modalEl.querySelector('#mgmtAdjAmountLabel');
    const adjResultDisplay = modalEl.querySelector('#mgmtAdjResultDues');

    function updateAdjCalc() {
      const type = adjTypeSelect?.value || 'discount';
      const amt = parseFloat(adjAmountInput?.value) || 0;
      let newDues = target.pendingFee || 0;

      if (type === 'discount') {
        if (adjAmountLabel) adjAmountLabel.textContent = 'Discount / Waiver Amount to Deduct (₹) *';
        newDues = Math.max(0, (target.pendingFee || 0) - amt);
      } else if (type === 'penalty') {
        if (adjAmountLabel) adjAmountLabel.textContent = 'Extra Charge / Fine Amount to Add (₹) *';
        newDues = (target.pendingFee || 0) + amt;
      } else if (type === 'override') {
        if (adjAmountLabel) adjAmountLabel.textContent = 'Set Exact New Pending Dues (₹) *';
        newDues = Math.max(0, amt);
      }

      if (adjResultDisplay) {
        adjResultDisplay.textContent = `₹${newDues.toLocaleString()}`;
        adjResultDisplay.style.color = newDues > 0 ? '#DC2626' : '#059669';
      }
    }

    adjTypeSelect?.addEventListener('change', updateAdjCalc);
    adjAmountInput?.addEventListener('input', updateAdjCalc);

    // Form 1: Partial Pay Submit
    modalEl.querySelector('#mgmtPayForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const amount = Math.round(parseFloat(modalEl.querySelector('#mgmtPayAmount').value) * 100) / 100;
      if (!(amount > 0)) {
        alert('Please enter a valid partial payment amount greater than ₹0.');
        return;
      }
      // Sanity ceiling: rejects fat-finger entries like an extra zero row that
      // would otherwise push paid_fee past every real-world total.
      if (amount > 10000000) {
        alert('That amount is larger than the ₹1,00,00,000 sanity limit. Please check the figure.');
        return;
      }
      const mode = modalEl.querySelector('#mgmtPayMode').value;
      const note = modalEl.querySelector('#mgmtPayNote').value.trim() || 'Partial tuition fee received';

      const recNo = `REC-${randomIdSuffix()}`;
      const studentUuid = target.db_uuid || (target.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target.id) ? target.id : null);

      // Cloud receipt FIRST and fail-closed: the previous flow mutated local
      // balances before attempting the write and swallowed its result, so an
      // offline/failed save still flashed ✅ and was wiped by the next pull.
      let cloudSynced = false;
      if (studentUuid && typeof SupabaseSync !== 'undefined' && SupabaseSync.mutate) {
        const cloud = await SupabaseSync.mutate('fee_receipts', 'upsert', [{
          receipt_no: recNo,
          student_id: studentUuid,
          amount: amount,
          payment_mode: mode,
          payment_date: new Date().toISOString().split('T')[0],
          status: 'Paid',
          collected_by: teacherName,
          note: note
        }], { conflict: 'receipt_no' });
        if (!cloud || cloud.success !== true) {
          alert(`❌ The receipt could not be saved to the cloud (${cloud?.error || 'unknown error'}). Nothing has been recorded — please try again when the connection is stable.`);
          return;
        }
        cloudSynced = true;
      }

      target.paidFee = (target.paidFee || 0) + amount;
      target.pendingFee = Math.max(0, (target.pendingFee || 0) - amount);

      if (!Array.isArray(target.feeHistory)) target.feeHistory = [];
      target.feeHistory.push({
        receiptNo: recNo,
        date: getFormattedTimestamp(),
        amount: amount,
        mode: mode,
        status: 'Paid',
        by: teacherName,
        note: note
      });

      const receipts = (AppState.getFeeReceipts ? AppState.getFeeReceipts() : []) || [];
      receipts.unshift({
        receipt_no: recNo,
        receiptNo: recNo,
        student_id: studentUuid || target.student_id || target.id || target.rollNo,
        studentId: studentUuid || target.student_id || target.id || target.rollNo,
        student_name: target.name,
        studentName: target.name,
        roll_no: target.rollNo || target.roll_no,
        rollNo: target.rollNo || target.roll_no,
        class_name: target.className || target.class_name,
        className: target.className || target.class_name,
        amount: amount,
        payment_mode: mode,
        paymentMode: mode,
        status: 'Paid',
        payment_date: new Date().toISOString().split('T')[0],
        date: getFormattedTimestamp(),
        collected_by: teacherName,
        by: teacherName,
        note: note
      });
      AppState._receiptsCache = receipts;
      AppState.safeSetItem('pragyan_db_fee_receipts_master', receipts);

      await AppState.saveStudents(students);
      AppState.addAuditLog(teacherName, 'FEE_PAYMENT', target.name, target.rollNo, `Recorded partial fee payment of ₹${amount.toLocaleString()} via ${mode} for ${target.name}. Remaining dues: ₹${target.pendingFee.toLocaleString()}`, { amount, mode, receiptNo: recNo, note, remainingDues: target.pendingFee });

      // Dispatch computerized stamped receipt email to student/parent
      if (target.email && target.email.includes('@')) {
        const studentEmail = target.email.trim();
        const studentName = target.name || 'Student';
        const receiptSubject = `Payment Receipt #${recNo} (₹${amount.toLocaleString('en-IN')}) — Pragyan Institute`;
        const emailHtml = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 580px; margin: 0 auto; border: 1px solid #E2E8F0; border-radius: 12px; overflow: hidden; background: #FFFFFF;">
            <div style="background: linear-gradient(135deg, #064E3B 0%, #022C22 100%); padding: 24px 20px; color: #FFFFFF; text-align: center;">
              <h1 style="margin: 0; font-size: 20px; font-weight: 800; letter-spacing: 0.5px;">PRAGYAN INSTITUTE</h1>
              <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.9;">Official Stamped Fee Receipt & Voucher</p>
            </div>
            <div style="padding: 24px 20px; color: #1E293B;">
              <p style="font-size: 15px; margin-top: 0;">Dear <strong>${escapeHtml(studentName)}</strong>,</p>
              <p style="font-size: 14px; line-height: 1.5; color: #334155;">We have successfully received and verified your fee payment of <strong style="color: #059669; font-size: 16px;">₹${amount.toLocaleString('en-IN')}</strong> (${escapeHtml(mode)}).</p>
              
              <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 16px; margin: 18px 0;">
                <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
                  <tr><td style="padding: 6px 0; color: #64748B;">Receipt Number:</td><td style="padding: 6px 0; font-weight: 700; text-align: right; font-family: monospace;">${recNo}</td></tr>
                  <tr><td style="padding: 6px 0; color: #64748B;">Student ID / Roll:</td><td style="padding: 6px 0; font-weight: 700; text-align: right;">${escapeHtml(target.rollNo || target.student_id || target.id || '')}</td></tr>
                  <tr><td style="padding: 6px 0; color: #64748B;">Batch / Class:</td><td style="padding: 6px 0; font-weight: 700; text-align: right;">${escapeHtml(target.className || target.class_name || '')}</td></tr>
                  <tr><td style="padding: 6px 0; color: #64748B;">Amount Credited:</td><td style="padding: 6px 0; font-weight: 800; text-align: right; color: #059669;">₹${amount.toLocaleString('en-IN')}</td></tr>
                  <tr><td style="padding: 6px 0; color: #64748B;">Collected By:</td><td style="padding: 6px 0; font-weight: 700; text-align: right;">${escapeHtml(teacherName)}</td></tr>
                  <tr><td style="padding: 6px 0; color: #64748B;">Remaining Dues:</td><td style="padding: 6px 0; font-weight: 700; text-align: right;">₹${Number(target.pendingFee || 0).toLocaleString('en-IN')}</td></tr>
                  <tr><td style="padding: 6px 0; color: #64748B;">Payment Mode:</td><td style="padding: 6px 0; font-weight: 700; text-align: right;">${escapeHtml(mode)}</td></tr>
                </table>
              </div>

              <p style="font-size: 13px; color: #64748B; margin-bottom: 20px;">You can view and download your full computerized stamped PDF receipt voucher anytime from the Student Portal.</p>
              
              <div style="text-align: center; margin: 20px 0 10px;">
                <a href="https://www.pragyaninstitute.com/portal.html" style="display: inline-block; background: #064E3B; color: #FFFFFF; text-decoration: none; padding: 10px 22px; border-radius: 6px; font-weight: 700; font-size: 13px;">View Student Portal</a>
              </div>
            </div>
            <div style="background: #F1F5F9; padding: 12px; font-size: 11px; color: #64748B; text-align: center;">
              Pragyan Institute • At Moti Market, Near Jagdamba Sthan, Lalganj, Vaishali, Bihar
            </div>
          </div>
        `;

        sendLiveResendEmail(studentEmail, receiptSubject, emailHtml, {
          student_id: target.student_id || target.id || target.rollNo,
          category: 'receipt',
          reference: `RECEIPT-${recNo}`
        }).catch(err => console.warn('Direct fee receipt email dispatch caught:', err.message));
      }

      mgmtDialog.close();
      alert(`✅ Partial payment of ₹${amount.toLocaleString('en-IN')} recorded by ${teacherName}! Remaining dues: ₹${target.pendingFee.toLocaleString('en-IN')}. Official receipt issued.` + (cloudSynced ? '' : '\n⚠️ Saved on this device only — no student UUID was available to reach the cloud.'));
      renderAdminDashboard();
    });

    // Form 2: Old Due Submit
    modalEl.querySelector('#mgmtDueForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const amount = Math.round(parseFloat(modalEl.querySelector('#mgmtDueAmount').value) * 100) / 100;
      const note = modalEl.querySelector('#mgmtDueNote').value.trim();

      // The old form accepted ₹0/negative values: a negative "carryover" reduced
      // dues while the audit entry claimed money had been added.
      if (!(amount > 0)) {
        alert('Enter the OLD DUE as a positive amount greater than ₹0.');
        return;
      }
      if (amount > 10000000) {
        alert('That amount is larger than the ₹1,00,00,000 sanity limit. Please check the figure.');
        return;
      }

      target.totalFee = (target.totalFee || 0) + amount;
      target.pendingFee = (target.pendingFee || 0) + amount;

      if (!Array.isArray(target.feeHistory)) target.feeHistory = [];
      target.feeHistory.push({
        receiptNo: `OLD-DUE-${randomIdSuffix()}`,
        date: getFormattedTimestamp(),
        amount: amount,
        mode: 'Old Unpaid Fee Carryover',
        status: 'Pending Due',
        by: teacherName,
        note: note
      });

      await AppState.saveStudents(students);
      AppState.addAuditLog(teacherName, 'OLD_DUE_ADDED', target.name, target.rollNo, `Added old fee carryover of ₹${amount.toLocaleString('en-IN')} for ${target.name}`, { amount, note });

      mgmtDialog.close();
      alert(`🔴 Old fee carryover of ₹${amount.toLocaleString('en-IN')} added for ${target.name} by ${teacherName}!`);
      renderAdminDashboard();
    });

    // Form 3: Fee Adjustment Submit (Non-Cash Correction)
    modalEl.querySelector('#mgmtRegulateForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const actionType = modalEl.querySelector('#mgmtAdjActionType').value;
      const amount = parseFloat(modalEl.querySelector('#mgmtAdjAmount').value) || 0;
      const note = modalEl.querySelector('#mgmtAdjNote').value.trim();

      if (!Array.isArray(target.feeHistory)) target.feeHistory = [];
      const adjRecNo = `ADJ-${randomIdSuffix()}`;

      if (actionType === 'discount') {
        target.pendingFee = Math.max(0, (target.pendingFee || 0) - amount);
        target.totalFee = Math.max(target.paidFee || 0, (target.totalFee || 0) - amount);
        target.feeHistory.push({
          receiptNo: adjRecNo,
          date: getFormattedTimestamp(),
          amount: -amount,
          mode: 'Fee Concession / Waiver (Non-Cash)',
          status: 'Adjusted',
          by: teacherName,
          note: note
        });
      } else if (actionType === 'penalty') {
        target.pendingFee = (target.pendingFee || 0) + amount;
        target.totalFee = (target.totalFee || 0) + amount;
        target.feeHistory.push({
          receiptNo: adjRecNo,
          date: getFormattedTimestamp(),
          amount: amount,
          mode: 'Fee Correction / Add-on (Non-Cash)',
          status: 'Adjusted',
          by: teacherName,
          note: note
        });
      } else if (actionType === 'override') {
        const oldPending = target.pendingFee || 0;
        const newPending = Math.max(0, amount);
        const delta = newPending - oldPending;
        target.pendingFee = newPending;
        target.totalFee = (target.paidFee || 0) + newPending;
        target.feeHistory.push({
          receiptNo: adjRecNo,
          date: getFormattedTimestamp(),
          amount: delta,
          mode: 'Direct Dues Reconciliation (Non-Cash)',
          status: 'Adjusted',
          by: teacherName,
          note: note
        });
      }

      await AppState.saveStudents(students);
      AppState.addAuditLog(teacherName, 'FEE_ADJUSTMENT_CORRECTION', target.name, target.rollNo, `Applied fee adjustment (${actionType.toUpperCase()}) for ${target.name}: New Pending Dues = ₹${target.pendingFee.toLocaleString()} (Paid Collected remains ₹${(target.paidFee || 0).toLocaleString()})`, { amount, actionType, note, pendingFee: target.pendingFee, paidFee: target.paidFee });

      // Create instant student portal alert notice
      const notices = AppState.getNotices();
      notices.unshift({
        id: `NTC-ADJ-${Date.now().toString(36).slice(-4)}-${Math.random().toString(36).slice(2,5)}`,
        title: `⚖️ Official Tuition Fee Adjustment`,
        category: 'fees',
        date: new Date().toISOString().split('T')[0],
        message: `Dear ${target.name}, your student tuition dues have been adjusted (${actionType.toUpperCase()}) by ${teacherName}. Current Outstanding Balance: ₹${target.pendingFee.toLocaleString()}. Note: "${note || 'Official adjustment applied'}".`,
        targetBatch: target.className,
        unread: true
      });
      await AppState.saveNotices(notices);

      modalEl.remove();
      alert(`⚖️ Fee adjustment applied successfully for ${target.name}!\n\n• New Pending Dues: ₹${target.pendingFee.toLocaleString()}\n• Paid Collected Revenue: ₹${(target.paidFee || 0).toLocaleString()} (Unaffected)\n• Student dashboard & audit history updated.`);
      renderAdminDashboard();
    });

    // Input masking for 10-digit mobile numbers
    const editMobInput = modalEl.querySelector('#mgmtStuMobile');
    const editGrdMobInput = modalEl.querySelector('#mgmtStuGuardianMobile');
    editMobInput?.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
    });
    editGrdMobInput?.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
    });

    // Multi-Class Enrollment State Management & Dynamic Calculation
    let activeClassCount = initialClassCount;
    const countPills = modalEl.querySelectorAll('.btn-class-count-pill');
    const class1Select = modalEl.querySelector('#mgmtStuClass1');
    const class2Select = modalEl.querySelector('#mgmtStuClass2');
    const class3Select = modalEl.querySelector('#mgmtStuClass3');
    const class2Wrap = modalEl.querySelector('#mgmtClass2Wrap');
    const class3Wrap = modalEl.querySelector('#mgmtClass3Wrap');
    const formulaText = modalEl.querySelector('#mgmtClassFeeFormulaText');
    const totalBadge = modalEl.querySelector('#mgmtClassFeeTotalBadge');
    const mgmtFeeInput = modalEl.querySelector('#mgmtStuMonthlyFee');

    function recalculateMultiClassEnrollment(isUserClassSelectionChange = false) {
      const c1 = class1Select?.value || '';
      const c2 = (activeClassCount >= 2) ? (class2Select?.value || '') : '';
      const c3 = (activeClassCount >= 3) ? (class3Select?.value || '') : '';

      const chosenClasses = [c1, c2, c3].filter(Boolean);
      const cfgAcademic = academicConfig();
      const resolved = (cfgAcademic && cfgAcademic.resolveBatches)
        ? cfgAcademic.resolveBatches(chosenClasses)
        : [];

      let standardSum = 0;
      let breakdownParts = [];
      if (resolved.length > 0) {
        resolved.forEach(b => {
          standardSum += Number(b.monthlyFee || 0);
          breakdownParts.push(`${b.name} (₹${Number(b.monthlyFee || 0).toLocaleString('en-IN')})`);
        });
      } else if (c1) {
        standardSum = classMonthlyFee(c1);
        breakdownParts.push(`${c1} (₹${standardSum.toLocaleString('en-IN')})`);
      }

      if (formulaText) {
        formulaText.innerHTML = (breakdownParts.length > 0)
          ? `<strong>Enrollment (${breakdownParts.length} Class${breakdownParts.length > 1 ? 'es' : ''}):</strong> ${breakdownParts.join(' + ')}`
          : `<strong>Enrollment:</strong> Please select at least 1 class`;
      }
      if (totalBadge) {
        totalBadge.textContent = `₹${standardSum.toLocaleString('en-IN')}/mo`;
      }

      if (mgmtFeeInput) {
        const currentValue = Number(mgmtFeeInput.value);
        const wasStandard = !currentValue || currentValue === studentMonthlyFee(target);
        if (wasStandard || isUserClassSelectionChange) {
          mgmtFeeInput.value = standardSum;
        }
      }
    }

    countPills.forEach(pill => {
      pill.addEventListener('click', () => {
        const count = parseInt(pill.dataset.count, 10) || 1;
        activeClassCount = count;

        countPills.forEach(p => {
          const isActive = (parseInt(p.dataset.count, 10) === count);
          p.classList.toggle('active', isActive);
          p.style.background = isActive ? '#059669' : 'transparent';
          p.style.color = isActive ? '#fff' : '#065F46';
        });

        if (class2Wrap) class2Wrap.style.display = (count >= 2) ? 'block' : 'none';
        if (class3Wrap) class3Wrap.style.display = (count >= 3) ? 'block' : 'none';

        recalculateMultiClassEnrollment(true);
      });
    });

    [class1Select, class2Select, class3Select].forEach(sel => {
      sel?.addEventListener('change', () => {
        recalculateMultiClassEnrollment(true);
      });
    });

    recalculateMultiClassEnrollment(false);

    // Form 4: Edit Profile Submit
    modalEl.querySelector('#mgmtEditProfileForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();

      const rawMobile = modalEl.querySelector('#mgmtStuMobile').value.trim();
      const rawGuardianMobile = modalEl.querySelector('#mgmtStuGuardianMobile').value.trim();
      const cleanMobile = sanitizeMobileNumber(rawMobile);
      const cleanGuardianMobile = rawGuardianMobile ? sanitizeMobileNumber(rawGuardianMobile) : cleanMobile;

      if (!isValid10DigitMobile(cleanMobile)) {
        alert('Invalid Mobile Number: Student mobile number must be exactly 10 digits without letters or special characters (e.g. 9876543210).');
        modalEl.querySelector('#mgmtStuMobile').focus();
        return;
      }

      if (rawGuardianMobile && !isValid10DigitMobile(cleanGuardianMobile)) {
        alert('Invalid Guardian Contact: Guardian contact must be exactly 10 digits without letters or special characters (e.g. 9876543210).');
        modalEl.querySelector('#mgmtStuGuardianMobile').focus();
        return;
      }

      const c1 = modalEl.querySelector('#mgmtStuClass1')?.value || '';
      const c2 = (activeClassCount >= 2) ? (modalEl.querySelector('#mgmtStuClass2')?.value || '') : '';
      const c3 = (activeClassCount >= 3) ? (modalEl.querySelector('#mgmtStuClass3')?.value || '') : '';
      const chosenClasses = [c1, c2, c3].filter(Boolean);
      const combinedClassName = (chosenClasses.length > 0) ? chosenClasses.join(' + ') : c1;

      // Both sides fall back to the canonical fee for the student's class rather
      // than a flat ₹1,000, so clearing the field cannot silently re-rate a
      // ₹1,500 senior student down to ₹1,000.
      const classFee = studentMonthlyFee(target);
      const oldMonthlyFee = parseFloat(target.monthlyFee) || classFee;
      const newMonthlyFee = parseFloat(modalEl.querySelector('#mgmtStuMonthlyFee').value) || classFee;
      const feeRateChanged = (oldMonthlyFee !== newMonthlyFee);

      target.name = modalEl.querySelector('#mgmtStuName').value.trim();
      target.mobile = cleanMobile;
      target.dob = modalEl.querySelector('#mgmtStuDob').value;
      target.className = combinedClassName;
      target.class_name = combinedClassName;
      target.batchName = combinedClassName;
      target.batch_name = combinedClassName;
      target.enrolledBatches = chosenClasses;
      target.monthlyFee = newMonthlyFee;
      target.email = modalEl.querySelector('#mgmtStuEmail').value.trim();
      target.guardianName = modalEl.querySelector('#mgmtStuGuardian').value.trim();
      target.guardianMobile = cleanGuardianMobile;
      target.bloodGroup = modalEl.querySelector('#mgmtStuBloodGroup').value;
      target.joiningMonth = modalEl.querySelector('#mgmtStuJoiningMonth').value.trim();
      const previousPhoto = target.photo || target.photoUrl || target.photo_url || '';
      const updatedPhoto = modalEl.querySelector('#mgmtStuPhotoUrl')?.value;
      // Deferred: only delete the replaced blob AFTER the student row has been
      // persisted. Deleting first meant a failed save left the database pointing
      // at a photo that no longer exists.
      let oldPhotoToPurge = null;
      if (updatedPhoto && updatedPhoto !== previousPhoto) {
        if (previousPhoto && previousPhoto.includes('/pragyan-media/')) {
          oldPhotoToPurge = previousPhoto;
        }
        target.photo = updatedPhoto;
        target.photo_url = updatedPhoto;
        target.photoUrl = updatedPhoto;
      }

      if (!Array.isArray(target.feeHistory)) target.feeHistory = [];
      target.feeHistory.push({
        receiptNo: `EDIT-PROF-${randomIdSuffix()}`,
        date: getFormattedTimestamp(),
        amount: 0,
        mode: 'Profile Detail Synchronization',
        status: 'Synchronized',
        by: teacherName,
        note: `Profile & multi-class enrollment updated by ${teacherName}`
      });

      if (feeRateChanged) {
        target.feeHistory.push({
          receiptNo: `RATE-${randomIdSuffix()}`,
          date: getFormattedTimestamp(),
          amount: newMonthlyFee,
          mode: 'Monthly Rate Structure Adjusted',
          status: 'Adjusted',
          by: teacherName,
          note: `Monthly tuition fee rate adjusted from ₹${oldMonthlyFee}/mo to ₹${newMonthlyFee}/mo by ${teacherName}`
        });

        AppState.addAuditLog(teacherName, 'FEE_ADJUSTMENT_CORRECTION', target.name, target.rollNo, `Adjusted monthly tuition fee rate for ${target.name} from ₹${oldMonthlyFee}/mo to ₹${newMonthlyFee}/mo`, { oldMonthlyFee, newMonthlyFee, monthlyFee: newMonthlyFee });

        const notices = AppState.getNotices();
        notices.unshift({
          id: `NTC-RATE-${Date.now().toString(36).slice(-4)}-${Math.random().toString(36).slice(2,5)}`,
          title: `💵 Monthly Tuition Fee Rate Adjusted`,
          category: 'fees',
          date: new Date().toISOString().split('T')[0],
          message: `Dear ${target.name}, your monthly tuition fee rate has been revised to ₹${newMonthlyFee.toLocaleString()}/month by ${teacherName}.`,
          targetBatch: target.className,
          unread: true
        });
        await AppState.saveNotices(notices);
      }

      // Mark dirty on all key representations so delta save synchronizes immediately
      AppState.markStudentDirty(target.id);
      if (target.student_id) AppState.markStudentDirty(target.student_id);
      if (target.rollNo) AppState.markStudentDirty(target.rollNo);

      const changedIds = [target.id, target.student_id, target.rollNo, target.roll_no].filter(Boolean);
      await AppState.saveStudents(students, changedIds);

      // Now safe to release the replaced storage object (post-persist).
      if (oldPhotoToPurge && typeof SupabaseSync !== 'undefined' && SupabaseSync.deleteFile) {
        try { await SupabaseSync.deleteFile(oldPhotoToPurge); } catch (e) { console.warn('Old photo cleanup note:', e.message); }
      }

      // Relational Linking: Cascade profile changes to student_requests
      const reqList = AppState.getRequests();
      let reqsChanged = false;
      reqList.forEach(r => {
        if (isStudentRequestMatch(r, target)) {
          r.studentName = target.name;
          r.student_name = target.name;
          r.rollNo = target.rollNo;
          r.roll_no = target.rollNo;
          r.className = target.className;
          r.class_name = target.className;
          reqsChanged = true;
        }
      });
      if (reqsChanged) await AppState.saveRequests(reqList);

      // Relational Linking: Cascade profile changes to student_fee_accounts
      const feeAccounts = AppState.getFeeAccounts();
      const accIdx = feeAccounts.findIndex(a => 
        String(a.student_id || a.studentId || '').toLowerCase() === String(target.id).toLowerCase() ||
        String(a.roll_no || a.rollNo || '').toLowerCase() === String(target.rollNo).toLowerCase()
      );
      if (accIdx !== -1) {
        feeAccounts[accIdx].student_name = target.name;
        feeAccounts[accIdx].studentName = target.name;
        feeAccounts[accIdx].class_name = target.className;
        feeAccounts[accIdx].className = target.className;
        feeAccounts[accIdx].roll_no = target.rollNo;
        feeAccounts[accIdx].rollNo = target.rollNo;
        await AppState.saveFeeAccounts(feeAccounts);
      }

      AppState.addAuditLog(teacherName, 'PROFILE_EDITED', target.name, target.rollNo, `Updated profile details and enrolled classes (${target.className}) for ${target.name}`, { name: target.name, mobile: target.mobile, className: target.className });

      // Immediate active session rehydration for current student
      if (AppState.currentUser && (
        String(AppState.currentUser.id || '').toLowerCase() === String(target.id || '').toLowerCase() ||
        String(AppState.currentUser.student_id || '').toLowerCase() === String(target.student_id || '').toLowerCase() ||
        String(AppState.currentUser.rollNo || '').toLowerCase() === String(target.rollNo || '').toLowerCase()
      )) {
        AppState.currentUser = { ...AppState.currentUser, ...target };
        renderStudentDashboard();
      }

      modalEl.remove();
      alert(`✅ Profile for ${target.name} updated and synchronized across portal with classes: ${target.className}!`);
      renderAdminDashboard();
    });
  }

  // Backward-compatibility wrappers
  function openPayModal(studentId) { openStudentManagementModal(studentId, 'pay'); }
  function openAddOldDueModal(studentId) { openStudentManagementModal(studentId, 'due'); }
  function openAdjustBillModal(studentId) { openStudentManagementModal(studentId, 'regulate'); }
  function openEditStudentProfileModal(studentId) { openStudentManagementModal(studentId, 'profile'); }

  /* ==========================================================================
   * FINANCIAL ANALYTICS & REPORTS TAB (ADMIN / TEACHERS)
   * ========================================================================== */
  let auditTxPage = 1;
  const auditTxPerPage = 8;
  let auditTxCollectorFilter = 'all';
  let auditTxModeFilter = 'all';
  let auditTxSearchQuery = '';

  function renderAdminAnalyticsTab() {
    const pane = document.getElementById('adminTabPane-analytics');
    if (!pane) return;

    try {
      const students = AppState.getStudents() || [];
      const batches = AppState.getBatches() || [];
      const masterReceipts = (AppState.getFeeReceipts ? AppState.getFeeReceipts() : []) || [];

      const totalCollected = students.reduce((acc, curr) => acc + (Number(curr.paidFee ?? curr.paid_fee ?? 0)), 0);
      const totalPending = students.reduce((acc, curr) => acc + (Number(curr.pendingFee ?? curr.pending_fee ?? 0)), 0);
      const totalExpected = totalCollected + totalPending;
      const collectionPct = totalExpected > 0 ? ((totalCollected / totalExpected) * 100).toFixed(1) : '100';

      // 1. Gather all payment transactions across all students & master receipt ledger
      const allTransactions = [];
      const processedReceiptNos = new Set();

      // Per-collector tallies, one bucket per roster member plus one for
      // receipts that never recorded who took the money. This replaces six
      // standalone counters that could only ever split the books two ways, so
      // every rupee Aditi Singh collected was reported as Prof. Ravi Ranjan's.
      const facultyRoster = (ACADEMIC && ACADEMIC.FACULTY) || [];
      const UNATTRIBUTED = '__unattributed__';
      const collectorTally = new Map();
      const tallyFor = (key) => {
        if (!collectorTally.has(key)) collectorTally.set(key, { total: 0, cash: 0, upi: 0, count: 0 });
        return collectorTally.get(key);
      };
      facultyRoster.forEach(f => tallyFor(f.name));
      tallyFor(UNATTRIBUTED);

      let totalAllModes = 0;

      students.forEach(s => {
        const sId = (s.student_id || s.id || s.rollNo || '').toString().toLowerCase();
        const sRoll = (s.rollNo || s.roll_no || sId).toString().toLowerCase();
        const sUuid = (s.db_uuid || (s.id && String(s.id).includes('-') ? s.id : '')).toString().toLowerCase();
        const sPaidFee = Number(s.paidFee ?? s.paid_fee ?? 0);

        let studentCollectedSum = 0;
        const studentTxList = [];

        // 1.1 Process student's embedded feeHistory (ONLY Genuine Monetary Payments)
        (s.feeHistory || []).forEach(h => {
          if (isRealCollectedPayment(h)) {
            const recNo = h.receiptNo || h.receipt_no || `REC-${sRoll}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
            if (!processedReceiptNos.has(recNo)) {
              processedReceiptNos.add(recNo);
              const amt = Number(h.amount) || 0;
              studentCollectedSum += amt;
              studentTxList.push({
                receiptNo: recNo,
                date: h.date || h.payment_date || 'N/A',
                studentName: s.name,
                rollNo: s.rollNo || s.roll_no || s.student_id,
                className: s.className || s.class_name,
                amount: amt,
                mode: h.mode || h.payment_mode || 'Cash at Counter',
                collector: h.by || h.collected_by || '',
                note: h.note || 'Tuition Fee Payment'
              });
            }
          }
        });

        // 1.2 Process matched entries from masterReceipts (ONLY Genuine Monetary Payments)
        masterReceipts.forEach(r => {
          if (isRealCollectedPayment(r)) {
            const rStuId = (r.student_id || r.studentId || '').toString().toLowerCase();
            const rNo = (r.receipt_no || r.receiptNo || '').toString();
            const isMatch = (sUuid && rStuId === sUuid) || (sId && rStuId === sId) || (sRoll && rStuId === sRoll) || (sRoll && rNo.includes(sRoll));
            if (isMatch && rNo && !processedReceiptNos.has(rNo)) {
              processedReceiptNos.add(rNo);
              const amt = Number(r.amount) || 0;
              studentCollectedSum += amt;
              studentTxList.push({
                receiptNo: rNo,
                date: r.payment_date || r.date || 'N/A',
                studentName: s.name,
                rollNo: s.rollNo || s.roll_no || s.student_id,
                className: s.className || s.class_name,
                amount: amt,
                mode: r.payment_mode || r.mode || 'Cash at Counter',
                collector: r.collected_by || r.by || '',
                note: r.note || 'Tuition Fee Payment'
              });
            }
          }
        });

        // 1.3 If student has verified paidFee > studentCollectedSum, account for the difference (admission / base tuition payment)
        if (sPaidFee > studentCollectedSum) {
          const diff = sPaidFee - studentCollectedSum;
          const initRecNo = `REC-${sRoll || sId || 'ADM'}-INIT`;
          if (!processedReceiptNos.has(initRecNo)) {
            processedReceiptNos.add(initRecNo);
            // Nothing is inferred from the class name. The two ladders removed
            // here stamped an admission payment with a collector and a payment
            // mode that were never recorded, putting invented evidence into the
            // audit ledger the sole administrator signs off on.
            studentTxList.push({
              receiptNo: initRecNo,
              date: s.joiningMonth || (s.created_at ? new Date(s.created_at).toLocaleDateString('en-IN') : 'Admission Session'),
              studentName: s.name,
              rollNo: s.rollNo || s.roll_no || s.student_id,
              className: s.className || s.class_name || 'General',
              amount: diff,
              mode: s.paymentMode || s.payment_mode || 'Not recorded',
              collector: s.admittedBy || '',
              note: 'Initial Course Admission & Tuition Fee'
            });
          }
        }

        // 1.4 Tally each transaction against the collector it actually names
        studentTxList.forEach(t => {
          const rawMode = String(t.mode || '').toLowerCase();
          const isCash = rawMode.includes('cash') || rawMode.includes('counter');

          // The collector recorded on the receipt is left as written. The block
          // this replaces overwrote `t.collector` with one of two invented
          // strings — 'CHANDAN KUMAR (Science Lead & Admin)' or 'Prof. Ravi
          // Ranjan (Maths Director)' — so the exported audit ledger no longer
          // matched the receipts it was built from, and the second string
          // attached a directorship to Prof. Ravi Ranjan that belongs to the
          // sole administrator.
          const owner = facultyRoster.find(f => collectorMatchesFaculty(t, f.name));
          const bucket = tallyFor(owner ? owner.name : UNATTRIBUTED);
          bucket.total += t.amount;
          bucket.count += 1;
          if (isCash) bucket.cash += t.amount; else bucket.upi += t.amount;

          totalAllModes += t.amount;
          allTransactions.push(t);
        });
      });

      // Filter transactions
      let filteredTx = allTransactions.filter(t => {
        // Filter value is the roster name, so a third faculty member needs no
        // new branch. The two-branch version only understood 'chandan' and
        // 'ravi', and matched on the rewritten label rather than the record.
        let matchesCollector = true;
        if (auditTxCollectorFilter === UNATTRIBUTED) {
          matchesCollector = !facultyRoster.some(f => collectorMatchesFaculty(t, f.name));
        } else if (auditTxCollectorFilter !== 'all') {
          matchesCollector = collectorMatchesFaculty(t, auditTxCollectorFilter);
        }

        let matchesMode = true;
        if (auditTxModeFilter === 'cash') {
          matchesMode = t.mode.toLowerCase().includes('cash');
        } else if (auditTxModeFilter === 'upi') {
          matchesMode = !t.mode.toLowerCase().includes('cash');
        }

        let matchesSearch = true;
        if (auditTxSearchQuery) {
          const q = auditTxSearchQuery.toLowerCase();
          matchesSearch = String(t.studentName || '').toLowerCase().includes(q) ||
                          String(t.rollNo || '').toLowerCase().includes(q) ||
                          String(t.receiptNo || '').toLowerCase().includes(q) ||
                          String(t.className || '').toLowerCase().includes(q) ||
                          String(t.collector || '').toLowerCase().includes(q) ||
                          String(t.note || '').toLowerCase().includes(q);
        }

        return matchesCollector && matchesMode && matchesSearch;
      });

      const totalPages = Math.ceil(filteredTx.length / auditTxPerPage) || 1;
      if (auditTxPage > totalPages) auditTxPage = totalPages;
      if (auditTxPage < 1) auditTxPage = 1;

      const startIdx = (auditTxPage - 1) * auditTxPerPage;
      const pageTx = filteredTx.slice(startIdx, startIdx + auditTxPerPage);

      pane.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 1.5rem;">
          <!-- Top Metric Summary Cards -->
          <div class="dash-card" style="background: linear-gradient(135deg, #064E3B 0%, #032e23 100%); color: #fff;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; margin-bottom: 1rem;">
              <div>
                <span class="section-tag" style="background: rgba(255,255,255,0.2); color: #fff;"><i aria-hidden="true" class="fa-solid fa-chart-line"></i> Coaching Financial Analytics</span>
                <h3 style="font-size: 1.5rem; font-weight: 800; margin-top: 0.4rem; color: #fff;">100% Monthly Fee Coaching Report</h3>
              </div>
              <div style="text-align: right;">
                <div style="font-size: 0.82rem; opacity: 0.85;">Collection Efficiency Rate</div>
                <div style="font-size: 1.8rem; font-weight: 800; color: #34D399;">${collectionPct}%</div>
              </div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
              <div style="background: rgba(255,255,255,0.1); padding: 1rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.15);">
                <div style="font-size: 0.8rem; opacity: 0.85;">Total Cash & Online Collected</div>
                <div style="font-size: 1.4rem; font-weight: 800; color: #34D399;">₹${totalCollected.toLocaleString()}</div>
              </div>
              <div style="background: rgba(255,255,255,0.1); padding: 1rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.15);">
                <div style="font-size: 0.8rem; opacity: 0.85;">Total Old & Pending Dues</div>
                <div style="font-size: 1.4rem; font-weight: 800; color: #FCA5A5;">₹${totalPending.toLocaleString()}</div>
              </div>
              <div style="background: rgba(255,255,255,0.1); padding: 1rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.15);">
                <div style="font-size: 0.8rem; opacity: 0.85;">Total Active Enrolled</div>
                <div style="font-size: 1.4rem; font-weight: 800; color: #FDE047;">${students.length} Students</div>
              </div>
            </div>
          </div>

          <!-- Main Admin Live Fee & Email Dispatch Center -->
          <div class="dash-card" style="border: 2px solid #059669; background: #FAF9F6; margin-bottom: 0.5rem; box-shadow: 0 4px 14px rgba(6, 78, 59, 0.08);">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; margin-bottom: 1rem; border-bottom: 1.5px solid #A7F3D0; padding-bottom: 0.85rem;">
              <div>
                <span class="section-tag" style="background: #D1FAE5; color: #065F46; font-weight: 800; padding: 0.25rem 0.65rem; border-radius: 99px; font-size: 0.8rem;">
                  <i aria-hidden="true" class="fa-solid fa-paper-plane"></i> MAIN ADMIN DISPATCH CENTER
                </span>
                <h3 style="font-size: 1.25rem; font-weight: 800; color: #064E3B; margin-top: 0.35rem;">
                  ⚡ Instant Fee Billing & Email Trigger (Resend Live Data)
                </h3>
                <p style="font-size: 0.85rem; color: #4B5563; margin-top: 0.2rem;">
                  Send extra fee reminders or monthly fee invoices to an <strong>individual student</strong> or an entire class batch. Works all 30 days on-demand.
                </p>
              </div>
              <div style="display: flex; gap: 0.5rem;">
                <span style="font-size: 0.8rem; background: #ECFDF5; color: #065F46; border: 1px solid #10B981; padding: 0.4rem 0.8rem; border-radius: 99px; font-weight: 700; display: inline-flex; align-items: center; gap: 0.4rem;">
                  <i aria-hidden="true" class="fa-solid fa-bolt"></i> Verified Domain: noreply@pragyaninstitute.com
                </span>
              </div>
            </div>

            <div class="admin-billing-form-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-bottom: 1.25rem;">
              <div>
                <label for="adminBillingTargetClass" style="display: block; font-size: 0.82rem; font-weight: 700; color: #374151; margin-bottom: 0.35rem;">
                  🎯 1. Select Batch / Class:
                </label>
                <select id="adminBillingTargetClass" class="portal-input" style="width: 100%; font-weight: 600; padding: 0.6rem 0.85rem; border-radius: 8px; border: 1.5px solid var(--border-sand); background: #fff;">
                  ${batchFilterOptions('all', '🌟 All Batches (All Enrolled Students)')}
                </select>
              </div>

              <div>
                <label for="adminBillingTargetStudent" style="display: block; font-size: 0.82rem; font-weight: 700; color: #374151; margin-bottom: 0.35rem;">
                  👤 2. Target Student (Individual or All):
                </label>
                <select id="adminBillingTargetStudent" class="portal-input" style="width: 100%; font-weight: 600; padding: 0.6rem 0.85rem; border-radius: 8px; border: 1.5px solid var(--border-sand); background: #fff;">
                  <option value="all">👥 All Students in Selected Batch</option>
                </select>
              </div>

              <div>
                <label for="adminBillingAction" style="display: block; font-size: 0.82rem; font-weight: 700; color: #374151; margin-bottom: 0.35rem;">
                  📬 3. Action / Dispatch Mode:
                </label>
                <select id="adminBillingAction" class="portal-input" style="width: 100%; font-weight: 600; padding: 0.6rem 0.85rem; border-radius: 8px; border: 1.5px solid var(--border-sand); background: #fff;">
                  <option value="reminder" selected>⚠️ Extra Fee Reminder (Direct Due Notice — All 30 Days)</option>
                  <option value="invoice">📄 Monthly Fee Invoice & Billing (Installment + Email Statement)</option>
                </select>
              </div>
            </div>

            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem;">
              <div style="font-size: 0.82rem; color: #6B7280; display: flex; align-items: center; gap: 0.5rem;">
                <i aria-hidden="true" class="fa-solid fa-shield-halved" style="color: #059669;"></i> Includes official PhonePe QR, <strong>chandankr1501998@ybl</strong>, and auto-UPI pay links.
              </div>
              <button id="adminTriggerBillingBtn" class="btn btn-emerald" style="padding: 0.65rem 1.4rem; font-size: 0.92rem; font-weight: 800; display: inline-flex; align-items: center; gap: 0.6rem; box-shadow: 0 4px 12px rgba(5,150,105,0.3);">
                <i aria-hidden="true" class="fa-solid fa-paper-plane"></i> <span>Trigger Real-Time Dispatch</span>
              </button>
            </div>

            <!-- Live Dispatch Progress & Results Box -->
            <div id="adminBillingResultBox" style="display: none; margin-top: 1.25rem; padding: 1rem; border-radius: 8px; font-size: 0.85rem;"></div>
          </div>

          <!-- Batch-Wise Financial Breakdown -->
          <div class="dash-card">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1.25rem; border-bottom: 1px solid var(--border-sand); padding-bottom: 0.75rem;">
              <div>
                <h4 style="font-size: 1.15rem; font-weight: 800; color: var(--text-mahogany); margin: 0; display: flex; align-items: center; gap: 0.5rem;">
                  <i aria-hidden="true" class="fa-solid fa-layer-group" style="color: var(--primary-emerald);"></i> Batch-Wise Collection & Enrollment Breakdown
                </h4>
                <div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 0.2rem;">Live revenue, collection efficiency, and dues tracking configured for every academic batch</div>
              </div>
              <span style="background: #ECFDF5; color: #065F46; border: 1px solid #10B981; padding: 0.3rem 0.75rem; border-radius: 99px; font-size: 0.8rem; font-weight: 700;">
                <i class="fa-solid fa-graduation-cap" aria-hidden="true"></i> ${canonicalBatchCards().length} Standard Institutional Batches
              </span>
            </div>

            <div style="display: flex; flex-direction: column; gap: 1.15rem;">
              ${batches.map(b => {
                const bName = b.className || b.name || b.batchName || 'Academic Batch';
                // Canonical id, not a four-way guess. The ladder this replaces
                // ended in `: 'junior'`, so Class 11th, Class 12th and all three
                // Special English batches all resolved to 'junior' — and because
                // the student filter below keyed off bKey, those five cards each
                // showed the *same* set of 6th/7th/junior students at ₹700/mo.
                const bKey = getBatchCategoryKey(b.batch_id || b.id || bName);

                const batchStudents = students.filter(s =>
                  getBatchCategoryKey(s.className || s.class_name || s.batchName || '') === bKey
                );

                const bMonthlyRate = Number(b.monthlyFee ?? b.monthly_fee) || classMonthlyFee(bKey || bName);
                const bCollected = batchStudents.reduce((acc, c) => acc + (Number(c.paidFee ?? c.paid_fee ?? 0)), 0);
                const bPending = batchStudents.reduce((acc, c) => acc + (Number(c.pendingFee ?? c.pending_fee ?? 0)), 0);
                const bTotal = bCollected + bPending;
                const bPct = bTotal > 0 ? Math.min(100, Math.round((bCollected / bTotal) * 100)) : 0;

                const badge = BATCH_BADGE[bKey] || { text: `${batchIcon(bKey)} Batch`, color: '#065F46', bg: '#D1FAE5' };
                const badgeText = badge.text;
                const badgeColor = badge.color;
                const badgeBg = badge.bg;

                const clearedCount = batchStudents.filter(s => (Number(s.pendingFee ?? s.pending_fee ?? 0)) === 0).length;

                return `
                  <div style="border: 1px solid var(--border-sand); padding: 1.15rem; border-radius: 10px; background: #FAF9F6; box-shadow: 0 2px 6px rgba(0,0,0,0.02); transition: transform 0.15s ease;">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.65rem;">
                      <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
                        <strong style="font-size: 1.05rem; color: var(--text-mahogany); font-weight: 800;">${bName}</strong>
                        <span style="font-size: 0.8rem; background: ${badgeBg}; color: ${badgeColor}; padding: 0.2rem 0.55rem; border-radius: 6px; font-weight: 700;">
                          ${badgeText}
                        </span>
                        <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600;">
                          • <strong>${batchStudents.length}</strong> Enrolled • <strong>₹${bMonthlyRate.toLocaleString()}/mo</strong>
                        </span>
                      </div>
                      <div style="text-align: right;">
                        <span style="font-weight: 800; font-size: 1.05rem; color: #059669; background: #ECFDF5; padding: 0.25rem 0.65rem; border-radius: 6px; border: 1px solid #A7F3D0;">
                          <i aria-hidden="true" class="fa-solid fa-circle-check" style="font-size: 0.85rem;"></i> ₹${bCollected.toLocaleString()} Collected
                        </span>
                      </div>
                    </div>

                    <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.6rem; display: flex; align-items: center; flex-wrap: wrap; gap: 1rem;">
                      <span><i aria-hidden="true" class="fa-regular fa-clock" style="color: #6B7280;"></i> ${b.timing || b.timings || 'Mon – Sat: Regular Timings'}</span>
                      <span><i aria-hidden="true" class="fa-solid fa-door-open" style="color: #6B7280;"></i> ${b.room || 'Classroom'}</span>
                      <span><i aria-hidden="true" class="fa-solid fa-chalkboard-user" style="color: #6B7280;"></i> ${b.teacher || 'Chandan Kumar & Ravi Ranjan'}</span>
                    </div>

                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.82rem; margin-bottom: 0.4rem;">
                      <span style="color: #374151; font-weight: 700;">
                        Collection Progress: <strong style="color: ${bPct >= 80 ? '#059669' : (bPct >= 50 ? '#D97706' : '#DC2626')}; font-size: 0.9rem;">${bPct}%</strong>
                        <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 500; margin-left: 0.4rem;">(${clearedCount}/${batchStudents.length} students cleared)</span>
                      </span>
                      <span style="color: #DC2626; font-weight: 700;">
                        <i aria-hidden="true" class="fa-solid fa-triangle-exclamation"></i> Pending Dues: ₹${bPending.toLocaleString()}
                      </span>
                    </div>

                    <div style="width: 100%; height: 10px; background: #E5E7EB; border-radius: 99px; overflow: hidden; position: relative;">
                      <div style="width: ${bPct}%; height: 100%; background: linear-gradient(90deg, #059669 0%, #10B981 100%); border-radius: 99px; transition: width 0.4s ease;"></div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <!-- Comprehensive Fee Collection Audit & Student-Wise Payment Logs -->
          <div class="dash-card">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 1rem; border-bottom: 1px solid var(--border-sand); padding-bottom: 0.85rem;">
              <div>
                <h4 style="font-size: 1.15rem; font-weight: 800; color: var(--text-mahogany); margin: 0; display: flex; align-items: center; gap: 0.5rem;">
                  <i aria-hidden="true" class="fa-solid fa-receipt" style="color: var(--primary-emerald);"></i> Student Payment Transactions & Collector Audit Log
                </h4>
                <div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 0.2rem;">Detailed log of all student payments across Cash, UPI, and Online transfers with teacher audit breakdown</div>
              </div>
              <span style="background: var(--primary-emerald-light); color: var(--primary-emerald); padding: 0.35rem 0.85rem; border-radius: 99px; font-size: 0.8rem; font-weight: 700;">
                <i aria-hidden="true" class="fa-solid fa-list-check"></i> ${filteredTx.length} Transactions Found
              </span>
            </div>

            <!-- Filter & Search Toolbar -->
            <div style="display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; justify-content: space-between; margin-bottom: 1rem; background: #FAF9F6; padding: 0.75rem; border-radius: 8px; border: 1px solid var(--border-sand);">
              <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; flex: 1; min-width: 240px;">
                <div style="position: relative; flex: 1; min-width: 180px;">
                  <input type="text" id="auditTxSearchInput" aria-label="Search transactions by student, roll number or receipt" class="portal-input" placeholder="Search by student, roll #, receipt..." value="${auditTxSearchQuery}" style="padding-left: 2.2rem; font-size: 0.82rem; height: 38px;">
                  <i aria-hidden="true" class="fa-solid fa-magnifying-glass" style="position: absolute; left: 0.85rem; top: 50%; transform: translateY(-50%); color: var(--text-muted); font-size: 0.8rem;"></i>
                </div>
                <select id="auditTxCollectorSelect" class="portal-input" aria-label="Filter by faculty collector" style="width: auto; font-size: 0.82rem; height: 38px; padding: 0.4rem 0.6rem;">
                  <option value="all" ${auditTxCollectorFilter === 'all' ? 'selected' : ''}>All Faculty Collectors</option>
                  ${facultyRoster.map(f => `
                  <option value="${f.name}" ${auditTxCollectorFilter === f.name ? 'selected' : ''}>👨‍🏫 ${titleCaseName(f.name)}</option>`).join('')}
                  <option value="${UNATTRIBUTED}" ${auditTxCollectorFilter === UNATTRIBUTED ? 'selected' : ''}>⚠️ Collector Not Recorded (${collectorTally.get(UNATTRIBUTED).count})</option>
                </select>
                <select id="auditTxModeSelect" class="portal-input" aria-label="Filter by payment mode" style="width: auto; font-size: 0.82rem; height: 38px; padding: 0.4rem 0.6rem;">
                  <option value="all" ${auditTxModeFilter === 'all' ? 'selected' : ''}>All Payment Modes</option>
                  <option value="cash" ${auditTxModeFilter === 'cash' ? 'selected' : ''}>💵 Cash Only</option>
                  <option value="upi" ${auditTxModeFilter === 'upi' ? 'selected' : ''}>📱 UPI / Online Only</option>
                </select>
              </div>
            </div>

            <!-- Fast Native Scroll Table Container (NO INNER SCROLL TRAP) -->
            <div style="overflow-x: auto; -webkit-overflow-scrolling: touch; border: 1px solid var(--border-sand); border-radius: 10px; margin-bottom: 1rem; background: #fff;">
              <table class="portal-table" style="font-size: 0.85rem; margin: 0; min-width: 720px; width: 100%;">
                <thead>
                  <tr style="background: #F3F4F6;">
                    <th>Date & Time</th>
                    <th>Student & Roll #</th>
                    <th>Class Batch</th>
                    <th>Amount Paid</th>
                    <th>Payment Mode</th>
                    <th>Receipt #</th>
                    <th>Collected By (Teacher)</th>
                  </tr>
                </thead>
                <tbody>
                  ${pageTx.length === 0 ? '<tr><td colspan="7" style="text-align:center; padding: 2rem; color: var(--text-muted);">No payment transactions match your search filter.</td></tr>' :
                    pageTx.map(t => `
                      <tr>
                        <td style="white-space: nowrap; color: var(--text-muted); font-size: 0.8rem;">
                          <i aria-hidden="true" class="fa-regular fa-calendar-days" style="color: var(--primary-emerald);"></i> ${t.date}
                        </td>
                        <td>
                          <strong>${t.studentName}</strong>
                          <div style="font-size: 0.8rem; color: var(--text-muted);">Roll #${t.rollNo}</div>
                        </td>
                        <td><span style="background: #FAF9F6; padding: 0.2rem 0.5rem; border-radius: 4px; border: 1px solid var(--border-sand); font-size: 0.8rem;">${t.className}</span></td>
                        <td style="font-weight: 800; color: #047857; font-size: 1rem;">₹${t.amount.toLocaleString()}</td>
                        <td>
                          <span style="padding: 0.25rem 0.65rem; border-radius: 99px; font-size: 0.8rem; font-weight: 700; background: ${t.mode.toLowerCase().includes('cash') ? '#FEF3C7; color: #78350F;' : '#D1FAE5; color: #065F46;'}">
                            <i class="${t.mode.toLowerCase().includes('cash') ? 'fa-solid fa-money-bill-wave' : 'fa-solid fa-mobile-screen'}" aria-hidden="true"></i> ${t.mode}
                          </span>
                        </td>
                        <td style="font-family: monospace; font-size: 0.8rem; font-weight: 700; color: var(--text-mahogany);">${t.receiptNo}</td>
                        <td>
                          <div style="font-weight: 700; color: ${collectorDisplay(t.collector).color}; font-size: 0.82rem;">${collectorDisplay(t.collector).label}</div>
                          ${t.note ? `<div style="font-size: 0.8rem; color: var(--text-muted); font-style: italic;">"${t.note}"</div>` : ''}
                        </td>
                      </tr>
                    `).join('')
                  }
                </tbody>
              </table>
            </div>

            <!-- Pagination Bar Controls -->
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; font-size: 0.82rem; color: var(--text-muted); margin-bottom: 1.5rem; padding: 0.4rem 0.25rem;">
              <div>
                Showing <strong>${filteredTx.length > 0 ? startIdx + 1 : 0}</strong> to <strong>${Math.min(startIdx + auditTxPerPage, filteredTx.length)}</strong> of <strong>${filteredTx.length}</strong> transactions
              </div>
              <div style="display: flex; gap: 0.35rem; align-items: center;">
                <button class="btn" id="btnAuditTxPrev" ${auditTxPage <= 1 ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''} style="padding: 0.3rem 0.75rem; font-size: 0.8rem; background: #fff; border: 1px solid var(--border-sand); color: var(--text-mahogany); font-weight: 700;">
                  <i aria-hidden="true" class="fa-solid fa-chevron-left"></i> Prev
                </button>
                <span style="font-weight: 700; color: var(--text-mahogany); padding: 0 0.5rem;">Page ${auditTxPage} of ${totalPages}</span>
                <button class="btn" id="btnAuditTxNext" ${auditTxPage >= totalPages ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''} style="padding: 0.3rem 0.75rem; font-size: 0.8rem; background: #fff; border: 1px solid var(--border-sand); color: var(--text-mahogany); font-weight: 700;">
                  Next <i aria-hidden="true" class="fa-solid fa-chevron-right"></i>
                </button>
              </div>
            </div>

            <!-- Unified Teacher Collection Summary Section -->
            <div style="background: #FAF9F6; border: 1.5px solid var(--border-sand); border-radius: 12px; padding: 1.25rem;">
              <h5 style="font-size: 0.98rem; font-weight: 800; color: var(--text-mahogany); margin-bottom: 1rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem;">
                <span><i aria-hidden="true" class="fa-solid fa-calculator" style="color: var(--primary-emerald);"></i> Total Fee Collection Summary by Teacher / Director</span>
                <span style="font-size: 0.85rem; color: var(--primary-emerald); background: #ffffff; padding: 0.3rem 0.75rem; border-radius: 6px; border: 1px solid var(--border-sand);">
                  Grand Total: <strong>₹${totalAllModes.toLocaleString()}</strong>
                </span>
              </h5>

              <!-- One card per roster member, generated from the canonical
                   faculty list. The two hardcoded cards this replaces had no
                   card for Aditi Singh — her collections were folded into
                   Prof. Ravi Ranjan's total — and titled him "Director" and
                   "Co-Director", both of which belong to Chandan Kumar alone. -->
              <div class="admin-teacher-summary-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem;">
                ${facultyRoster.map((f, i) => {
                  const t = collectorTally.get(f.name) || { total: 0, cash: 0, upi: 0, count: 0 };
                  const accents = ['#047857', '#1D4ED8', '#0E7490'];
                  const chips = [
                    { bg: '#D1FAE5', fg: '#065F46' },
                    { bg: '#DBEAFE', fg: '#1E3A8A' },
                    { bg: '#CFFAFE', fg: '#155E75' }
                  ];
                  const accent = accents[i % accents.length];
                  const chip = chips[i % chips.length];
                  return `
                <div style="background: #ffffff; border: 1.5px solid ${accent}; border-radius: 10px; padding: 1.1rem; box-shadow: 0 2px 4px rgba(0,0,0,0.03);">
                  <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.6rem;">
                    <div style="font-weight: 800; font-size: 1rem; color: var(--text-mahogany);">👨‍🏫 ${titleCaseName(f.name)}</div>
                    <span style="font-size: 0.8rem; background: ${chip.bg}; color: ${chip.fg}; padding: 0.2rem 0.5rem; border-radius: 99px; font-weight: 700;">${t.count} receipt${t.count === 1 ? '' : 's'}</span>
                  </div>
                  <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.75rem;">${f.role}</div>

                  <div style="font-size: 1.5rem; font-weight: 800; color: ${accent}; margin-bottom: 0.75rem;">
                    ₹${t.total.toLocaleString()}
                  </div>

                  <div style="display: flex; gap: 0.75rem; flex-wrap: wrap; font-size: 0.8rem; border-top: 1px dashed #E5E7EB; padding-top: 0.6rem;">
                    <div>💵 Cash: <strong>₹${t.cash.toLocaleString()}</strong></div>
                    <div>📱 UPI / Online: <strong>₹${t.upi.toLocaleString()}</strong></div>
                  </div>
                </div>`;
                }).join('')}

                ${collectorTally.get(UNATTRIBUTED).count > 0 ? `
                <!-- Shown only when it is non-empty: receipts whose collector was
                     never recorded. Previously these were silently added to
                     Prof. Ravi Ranjan's column, which made his total unauditable. -->
                <div style="background: #FFFBEB; border: 1.5px solid #B45309; border-radius: 10px; padding: 1.1rem; box-shadow: 0 2px 4px rgba(0,0,0,0.03);">
                  <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.6rem;">
                    <div style="font-weight: 800; font-size: 1rem; color: #78350F;">⚠️ Collector Not Recorded</div>
                    <span style="font-size: 0.8rem; background: #FEF3C7; color: #78350F; padding: 0.2rem 0.5rem; border-radius: 99px; font-weight: 700;">${collectorTally.get(UNATTRIBUTED).count} receipt${collectorTally.get(UNATTRIBUTED).count === 1 ? '' : 's'}</span>
                  </div>
                  <div style="font-size: 0.8rem; color: #92400E; margin-bottom: 0.75rem;">Attributed to nobody — reconcile these against the physical receipt book.</div>

                  <div style="font-size: 1.5rem; font-weight: 800; color: #B45309; margin-bottom: 0.75rem;">
                    ₹${collectorTally.get(UNATTRIBUTED).total.toLocaleString()}
                  </div>

                  <div style="display: flex; gap: 0.75rem; flex-wrap: wrap; font-size: 0.8rem; border-top: 1px dashed #FDE68A; padding-top: 0.6rem;">
                    <div>💵 Cash: <strong>₹${collectorTally.get(UNATTRIBUTED).cash.toLocaleString()}</strong></div>
                    <div>📱 UPI / Online: <strong>₹${collectorTally.get(UNATTRIBUTED).upi.toLocaleString()}</strong></div>
                  </div>
                </div>` : ''}
              </div>
            </div>
          </div>
        </div>
      `;

      // Bind Event Listeners for Audit Table Pagination & Filter Controls
      pane.querySelector('#auditTxSearchInput')?.addEventListener('input', (e) => {
        auditTxSearchQuery = e.target.value.trim();
        auditTxPage = 1;
        renderAdminAnalyticsTab();
      });
      pane.querySelector('#auditTxCollectorSelect')?.addEventListener('change', (e) => {
        auditTxCollectorFilter = e.target.value;
        auditTxPage = 1;
        renderAdminAnalyticsTab();
      });
      pane.querySelector('#auditTxModeSelect')?.addEventListener('change', (e) => {
        auditTxModeFilter = e.target.value;
        auditTxPage = 1;
        renderAdminAnalyticsTab();
      });
      pane.querySelector('#btnAuditTxPrev')?.addEventListener('click', () => {
        if (auditTxPage > 1) {
          auditTxPage--;
          renderAdminAnalyticsTab();
        }
      });
      pane.querySelector('#btnAuditTxNext')?.addEventListener('click', () => {
        if (auditTxPage < totalPages) {
          auditTxPage++;
          renderAdminAnalyticsTab();
        }
      });

      const classSelect = pane.querySelector('#adminBillingTargetClass');
      const studentSelect = pane.querySelector('#adminBillingTargetStudent');

      function populateTargetStudents() {
        if (!studentSelect) return;
        const selectedClass = classSelect ? classSelect.value : 'all';
        const allStudents = (typeof AppState !== 'undefined' && AppState.getStudents) ? AppState.getStudents() : (students || []);

        // Canonical id match, matching the dispatch filter below. The old
        // `c.includes(selectedClass)` test never matched a batch id, and even
        // with the old short keys it put Special English students in the Class
        // 9th list — so the dispatch and this preview disagreed on who was in
        // scope, and the admin could not see it.
        const filtered = selectedClass === 'all'
          ? allStudents
          : allStudents.filter(s =>
              getBatchCategoryKey(s.className || s.class_name || s.batchName || '') === selectedClass
            );

        let html = `<option value="all">👥 All Students in Selected Batch (${filtered.length})</option>`;
        filtered.forEach(s => {
          const sId = s.student_id || s.id || s.rollNo || s.roll_no;
          const due = Number(s.pendingFee ?? s.pending_fee ?? 0);
          const hasEmail = s.email && s.email.includes('@');
          const emailStatus = hasEmail ? '📧' : '⚠️ No Email';
          html += `<option value="${escapeHtml(sId)}">👤 ${escapeHtml(s.name)} (Roll #${escapeHtml(s.rollNo || s.roll_no || sId)}) — Due: ₹${due.toLocaleString('en-IN')} [${emailStatus}]</option>`;
        });
        studentSelect.innerHTML = html;
      }

      if (classSelect) {
        classSelect.addEventListener('change', populateTargetStudents);
      }
      populateTargetStudents();

      const triggerBtn = pane.querySelector('#adminTriggerBillingBtn');
      if (triggerBtn) {
        triggerBtn.addEventListener('click', async () => {
          const targetClass = pane.querySelector('#adminBillingTargetClass')?.value || 'all';
          const studentId = pane.querySelector('#adminBillingTargetStudent')?.value || 'all';
          const action = pane.querySelector('#adminBillingAction')?.value || 'reminder';
          const resultBox = pane.querySelector('#adminBillingResultBox');

          const actionLabel = action === 'invoice' ? 'generate monthly fee invoice & apply tuition' : 'send fee due reminder notice';
          const targetLabel = studentId !== 'all' ? `Student (${studentId})` : `${batchLabel(targetClass)} batch`;
          
          if (!confirm(`📢 Confirm Live Fee Dispatch?\n\n• Action: ${actionLabel.toUpperCase()}\n• Target: ${targetLabel}\n• Sender: Pragyan Institute <noreply@pragyaninstitute.com>\n\nProceed with live dispatch?`)) {
            return;
          }

          triggerBtn.disabled = true;
          triggerBtn.innerHTML = `<i aria-hidden="true" class="fa-solid fa-spinner fa-spin"></i> Processing Live Real-Time Dispatch...`;
          if (resultBox) {
            resultBox.style.display = 'block';
            resultBox.style.background = '#EFF6FF';
            resultBox.style.border = '1.5px solid #3B82F6';
            resultBox.style.color = '#1E40AF';
            resultBox.innerHTML = `<div><i aria-hidden="true" class="fa-solid fa-spinner fa-spin"></i> Synchronizing with live Supabase database & generating official statements...</div>`;
          }

          try {
            const allStudents = (typeof AppState !== 'undefined' && AppState.getStudents) ? AppState.getStudents() : [];
            let targets = [];
            
            if (studentId && studentId !== 'all') {
              const q = String(studentId).trim().toLowerCase();
              targets = allStudents.filter(s => {
                const sId = String(s.id ?? s.student_id ?? '').trim().toLowerCase();
                const sRoll = String(s.rollNo ?? s.roll_no ?? '').trim().toLowerCase();
                const sName = String(s.name ?? '').trim().toLowerCase();
                return sId === q || sRoll === q || sName === q;
              });
            } else {
              // Canonical id match. The substring ladder this replaces was the
              // worst offender in the file: `sClass.includes('10')` matched
              // "Class 1st to 5th (2010)", `includes('9')` matched any class
              // name containing a 9 including "1998", and `includes('8')`
              // matched "Class 8th" *and* "Class 1st to 5th (2008 syllabus)" —
              // so a Class 10th billing run could bill primary-school students.
              targets = targetClass === 'all'
                ? allStudents.slice()
                : allStudents.filter(s =>
                    getBatchCategoryKey(s.className || s.class_name || s.batchName || '') === targetClass
                  );
            }

            if (targets.length === 0) {
              throw new Error(`No students found matching target criteria (${batchLabel(targetClass)} / ${studentId}).`);
            }

            const currentMonthName = new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' });
            let billedCount = 0;
            let notifiedCount = 0;
            const results = [];
            const notices = AppState.getNotices ? AppState.getNotices() : [];

            for (let i = 0; i < targets.length; i++) {
              const s = targets[i];
              const sId = s.id || s.student_id || s.rollNo;
              const sName = s.name || 'Student';
              const sEmail = (s.email || '').trim();
              const monthlyFee = studentMonthlyFee(s);
              let pendingFee = Number(s.pendingFee) || 0;

              let studentStatus = 'Processed';

              if (action === 'invoice') {
                pendingFee += monthlyFee;
                s.pendingFee = pendingFee;
                billedCount++;
                studentStatus = `Invoiced +₹${monthlyFee} (New Balance: ₹${pendingFee})`;

                // Post in-portal notice for student
                notices.unshift({
                  id: `NTC-INV-${Date.now().toString(36).slice(-4)}-${Math.random().toString(36).slice(2,5)}`,
                  title: `📢 ${currentMonthName} Tuition Fee Invoice Generated (₹${monthlyFee})`,
                  category: 'fees',
                  date: new Date().toISOString().split('T')[0],
                  message: `Dear ${sName}, your official monthly fee statement for ${currentMonthName} has been generated. Total pending balance: ₹${pendingFee}. Please pay online via UPI (chandankr1501998@ybl) or at the institute reception.`,
                  targetBatch: s.className || targetClass,
                  unread: true
                });
              } else {
                studentStatus = `Reminder (Due Balance: ₹${pendingFee})`;

                notices.unshift({
                  id: `NTC-REM-${Date.now().toString(36).slice(-4)}-${Math.random().toString(36).slice(2,5)}`,
                  title: `⚠️ Tuition Fee Due Reminder Notice (Due: ₹${pendingFee})`,
                  category: 'fees',
                  date: new Date().toISOString().split('T')[0],
                  message: `Dear ${sName}, this is a gentle reminder regarding your pending fee balance of ₹${pendingFee}. Please settle promptly to avoid late fine.`,
                  targetBatch: s.className || targetClass,
                  unread: true
                });
              }

              if (sEmail && sEmail.includes('@')) {
                const subject = action === 'invoice' 
                  ? `📢 ${currentMonthName} Tuition Fee Invoice - ${sName} (Roll #${s.rollNo || sId})`
                  : `⚠️ Fee Due Reminder Notice - ${sName} (Due: ₹${pendingFee})`;
                
                const emailHtml = generateCampaignEmailHtml(
                  s, 
                  action === 'invoice' ? 'monthly_invoice' : 'fee_reminder', 
                  subject, 
                  action === 'invoice' 
                    ? `Please find your official tuition fee invoice for ${currentMonthName}. Prompt payment ensures uninterrupted classes and study material access.`
                    : `This is a gentle reminder regarding your pending fee balance of ₹${pendingFee}. Please settle before the due date to avoid late fine.`,
                  true, 
                  true
                );

                const emailResult = await sendLiveResendEmail(sEmail, subject, emailHtml, {
                  student_id: s.student_id || s.id || s.rollNo,
                  category: action === 'invoice' ? 'billing' : 'reminder',
                  reference: `${action === 'invoice' ? 'BILL' : 'REMIND'}-${s.student_id || s.rollNo || sId}`
                });
                if (emailResult.success) {
                  notifiedCount++;
                  studentStatus += ' -> Statement & Notice Synchronized ✅';
                } else {
                  studentStatus += ` -> Email failed (${emailResult.error || 'delivery service error'})`;
                }
              } else {
                studentStatus += ' -> In-Portal Noticeboard Posted (no email address)';
              }

              results.push({ name: sName, studentId: sId, email: sEmail, status: studentStatus });

              if (resultBox) {
                resultBox.innerHTML = `<div><i aria-hidden="true" class="fa-solid fa-spinner fa-spin"></i> Processing ${i + 1} of ${targets.length}: <strong>${escapeHtml(sName)}</strong>...</div>`;
              }
            }

            // Save updated balances and notices atomically
            await AppState.saveStudents(allStudents);
            if (AppState.saveNotices) await AppState.saveNotices(notices);

            const author = getActiveTeacherName();
            await AppState.addAuditLog(
              author, 
              action === 'invoice' ? 'FEE_INVOICE_GENERATED' : 'FEE_REMINDER_SENT', 
              targetLabel, 
              studentId, 
              `Real-time dispatch complete for ${targets.length} students. ${billedCount} students invoiced.`,
              { action, targetClass, studentId, targetsCount: targets.length, billedCount }
            );

            if (resultBox) {
              resultBox.style.background = '#ECFDF5';
              resultBox.style.border = '1.5px solid #10B981';
              resultBox.style.color = '#065F46';
              resultBox.innerHTML = `
                <div style="font-weight: bold; font-size: 0.98rem; margin-bottom: 0.45rem; display: flex; align-items: center; gap: 0.5rem;">
                  <i aria-hidden="true" class="fa-solid fa-circle-check" style="color: #10B981;"></i> Real-Time Fee Billing & Dispatch Successfully Processed!
                </div>
                <div style="display: flex; gap: 1.25rem; flex-wrap: wrap; margin-bottom: 0.65rem; background: rgba(255,255,255,0.8); padding: 0.6rem 0.85rem; border-radius: 6px; border: 1px solid #A7F3D0;">
                  <span>👥 Target Group: <strong>${escapeHtml(targetLabel)}</strong></span>
                  <span>💳 Total Processed: <strong>${targets.length} Students</strong></span>
                  <span>📢 Invoices & Notices Posted: <strong>${notifiedCount}</strong></span>
                </div>
                <div style="font-size: 0.8rem; opacity: 0.9; max-height: 140px; overflow-y: auto; background: rgba(255,255,255,0.7); padding: 0.5rem; border-radius: 4px; border: 1px solid #A7F3D0;">
                  ${results.map(r => `<div>• <strong>${escapeHtml(r.name)}</strong>: ${r.status}</div>`).join('')}
                </div>
              `;
            }

            showNotification(`✅ Real-time dispatch complete for ${targets.length} student(s)!`, 'success');
            renderAdminAnalyticsTab();
          } catch (err) {
            console.error('Trigger billing error:', err);
            if (resultBox) {
              resultBox.style.background = '#FEF2F2';
              resultBox.style.border = '1.5px solid #EF4444';
              resultBox.style.color = '#991B1B';
              resultBox.innerHTML = `<div>❌ <strong>Dispatch Note:</strong> ${escapeHtml(err.message)}</div>`;
            }
            showNotification(`❌ Error: ${err.message}`, 'error');
          } finally {
            triggerBtn.disabled = false;
            triggerBtn.innerHTML = `<i aria-hidden="true" class="fa-solid fa-paper-plane"></i> <span>Trigger Real-Time Dispatch</span>`;
          }
        });
      }

    } catch (err) {
      console.error('Error rendering Analytics tab:', err);
    }
  }

  /* ==========================================================================
   * GETSTREAM COMMUNITY CHAT TAB (STUDENTS & FACULTY / ADMIN)
   * ========================================================================== */
  function renderCommunityChatTab() {
    const adminBtn = document.getElementById('adminTabBtnCommunity');
    const studentBtn = document.getElementById('studentTabBtnCommunity');
    if (adminBtn) adminBtn.style.display = ENABLE_COMMUNITY_CHAT ? '' : 'none';
    if (studentBtn) studentBtn.style.display = ENABLE_COMMUNITY_CHAT ? '' : 'none';

    const adminContainer = document.getElementById('adminDashboardContainer');
    const isAdminVisible = adminContainer && adminContainer.style.display !== 'none' && !adminContainer.hasAttribute('hidden') && !adminContainer.classList.contains('hidden-view');
    const isAdminSession = (AppState.currentRole === 'admin' || AppState.currentUser?.role === 'admin' || (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('pragyan_portal_role') === 'admin'));
    
    const activePane = (isAdminVisible || isAdminSession)
      ? (document.getElementById('adminTabPane-community') || document.getElementById('studentTabPane-community'))
      : (document.getElementById('studentTabPane-community') || document.getElementById('adminTabPane-community'));

    if (!activePane) return;

    if (!ENABLE_COMMUNITY_CHAT) {
      activePane.innerHTML = `
        <div class="dash-card" style="text-align: center; padding: 3.5rem 1.5rem; background: #fff; border-radius: 12px; border: 1px solid var(--border-sand); max-width: 540px; margin: 2rem auto; box-shadow: 0 4px 16px rgba(0,0,0,0.06);">
          <div style="font-size: 3rem; margin-bottom: 0.75rem;">🔒</div>
          <h3 style="font-size: 1.25rem; font-weight: 800; color: var(--text-mahogany); margin-bottom: 0.5rem;">
            Community Forum Temporarily Paused
          </h3>
          <p style="font-size: 0.88rem; color: var(--text-muted); line-height: 1.5; margin-bottom: 1.25rem;">
            The Community Chat feature has been temporarily disabled by Pragyan Institute Management. All existing messages and chat archives remain securely preserved in the database.
          </p>
          <div style="font-size: 0.8rem; background: #FEF3C7; color: #92400E; padding: 0.5rem 0.85rem; border-radius: 8px; font-weight: 700; display: inline-flex; align-items: center; gap: 0.4rem;">
            🛡️ Status: Offline by Admin Order • Code & History Intact
          </div>
        </div>
      `;
      return;
    }

    // Guard against destructive re-renders: if Stream chat is already mounted and active in this pane, retain DOM & state
    if (activePane.querySelector('.stream-chat-wrapper')) {
      return;
    }

    if (window.PragyanStreamChat && typeof window.PragyanStreamChat.init === 'function') {
      window.PragyanStreamChat.init(activePane);
      return;
    }

    if (typeof window.initGetStreamChat === 'function') {
      window.initGetStreamChat().catch(e => console.warn('Stream Chat async init warning:', e));
      return;
    }
  }

  function bindCommunityPaneEvents(pane, isAdmin, currentUser) {
    if (!pane) return;

    // Auto Scroll to bottom of message stream
    const msgBox = pane.querySelector('#communityChatMessagesContainer');
    if (msgBox) msgBox.scrollTop = msgBox.scrollHeight;

    // Event Listeners for Filters
    pane.querySelectorAll('.btn-community-filter').forEach(btn => {
      btn.onclick = () => {
        communityActiveFilter = btn.dataset.filter;
        renderCommunityChatTab();
      };
    });

    // Event Listener for Reply button toggle
    pane.querySelectorAll('.btn-reply-msg').forEach(btn => {
      btn.onclick = () => {
        const msgId = btn.dataset.id;
        activeReplyMsgId = (activeReplyMsgId === msgId) ? null : msgId;
        renderCommunityChatTab();
      };
    });

    // Event Listener for Submit Reply
    pane.querySelectorAll('.btn-submit-reply').forEach(btn => {
      btn.onclick = () => {
        const msgId = btn.dataset.id;
        const inputEl = pane.querySelector(`#inputReplyText-${msgId}`);
        if (!inputEl || !inputEl.value.trim()) return;

        const replyText = inputEl.value.trim();
        const msgs = AppState.getCommunityMessages();
        const targetMsg = msgs.find(m => m && m.id === msgId);
        if (!targetMsg) return;

        const replySenderName = isAdmin ? (currentUser.name || 'Admin') : (currentUser.name || currentUser.studentName || (currentUser.rollNo ? (`Student Roll #${currentUser.rollNo}`) : 'Student'));
        
        if (!targetMsg.replies) targetMsg.replies = [];
        targetMsg.replies.push({
          id: `REP-${Date.now().toString(36).slice(-4)}-${Math.random().toString(36).slice(2,5)}`,
          senderId: currentUser.id || 'usr',
          senderName: replySenderName,
          senderRole: isAdmin ? 'FACULTY / ADMIN' : (currentUser.className || 'Student'),
          avatar: isAdmin ? '👨‍🏫' : '🎓',
          text: replyText,
          timestamp: getFormattedTimestamp()
        });

        AppState.saveCommunityMessages(msgs);
        AppState.markMutation();
        activeReplyMsgId = null;
        renderCommunityChatTab();
      };
    });

    // Admin Action: Pin / Unpin Message
    pane.querySelectorAll('.btn-toggle-pin-msg, .btn-unpin-top').forEach(btn => {
      btn.onclick = () => {
        const msgId = btn.dataset.id;
        const msgs = AppState.getCommunityMessages();
        const targetMsg = msgs.find(m => m && m.id === msgId);
        if (!targetMsg) return;

        targetMsg.isPinned = !targetMsg.isPinned;
        if (targetMsg.isPinned) {
          targetMsg.pinnedBy = currentUser.name || 'Admin';
          targetMsg.pinnedAt = getFormattedTimestamp();
        }
        AppState.saveCommunityMessages(msgs);
        renderCommunityChatTab();
      };
    });

    // Admin Action: Delete Message
    pane.querySelectorAll('.btn-delete-msg').forEach(btn => {
      btn.onclick = () => {
        if (!confirm('Are you sure you want to delete this community message?')) return;
        const msgId = btn.dataset.id;
        let msgs = AppState.getCommunityMessages();
        msgs = msgs.filter(m => m && m.id !== msgId);
        AppState.saveCommunityMessages(msgs);
        renderCommunityChatTab();
      };
    });

    // File Attachment Handler (Admin Only)
    let pendingAttachment = null;
    const fileInput = pane.querySelector('#communityFileInput');
    if (fileInput) {
      fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
          pendingAttachment = {
            name: file.name,
            size: file.size,
            type: file.type,
            data: evt.target.result
          };
          const previewBox = pane.querySelector('#communityAttachmentPreview');
          const previewName = pane.querySelector('#communityAttachmentName');
          if (previewBox && previewName) {
            previewName.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
            previewBox.style.display = 'flex';
          }
        };
        reader.readAsDataURL(file);
      };
    }

    pane.querySelector('#btnRemoveAttachment')?.addEventListener('click', () => {
      pendingAttachment = null;
      const previewBox = pane.querySelector('#communityAttachmentPreview');
      if (previewBox) previewBox.style.display = 'none';
      if (fileInput) fileInput.value = '';
    });

    // Form Submit Handler with /hg and /ad Slash Commands
    pane.querySelector('#communityChatForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const inputEl = pane.querySelector('#communityMessageInput');
      const rawText = inputEl ? inputEl.value.trim() : '';
      if (!rawText && !pendingAttachment) return;

      const msgs = AppState.getCommunityMessages();

      let isHighlighted = false;
      let isAdminAlert = false;
      let processedText = rawText;

      // 1. Process /hg command (ADMIN ONLY)
      let linkUrl = null;
      if (rawText.startsWith('/hg')) {
        if (!isAdmin) {
          alert('❌ The /hg command is reserved for Admins/Faculty to post highlighted announcements.');
          return;
        }
        isHighlighted = true;
        processedText = rawText.replace(/^\/hg\s*/, '').trim();
        if (!processedText) processedText = '✨ Highlighted Announcement Link';

        const urlMatch = processedText.match(/(https?:\/\/[^\s]+|www\.[^\s]+)/i);
        if (urlMatch) {
          linkUrl = urlMatch[0].startsWith('http') ? urlMatch[0] : `https://${urlMatch[0]}`;
        }
      }

      // 2. Process /ad command (STUDENT & EVERYONE ADMIN ALERT)
      if (rawText.startsWith('/ad')) {
        isAdminAlert = true;
        processedText = rawText.replace(/^\/ad\s*/, '').trim();
        if (!processedText) processedText = '🚨 Urgent inquiry from student';

        // Create urgent request for Admin dashboard notification badge
        const requests = AppState.getRequests();
        requests.unshift({
          id: `REQ-AD-${Date.now()}`,
          studentId: currentUser.id || 'STU-COMMUNITY',
          studentName: currentUser.name || 'Student',
          className: currentUser.className || 'Class 10th',
          rollNo: currentUser.rollNo || 'N/A',
          type: 'admin_alert',
          title: `🚨 Community Chat Alert from ${currentUser.name || 'Student'}`,
          note: processedText,
          amount: 0,
          date: getFormattedTimestamp(),
          status: 'Pending'
        });
        await AppState.saveRequests(requests);
        AppState.addAuditLog(currentUser.name || 'Student', 'COMMUNITY_ADMIN_ALERT', currentUser.name, currentUser.rollNo, `Raised urgent Admin Alert in Community Chat: "${processedText}"`);

        alert(`🚨 Admin Alert sent to Faculty! Director Chandan Kumar & Prof. Ravi Ranjan have been notified.`);
      }

      const resolvedStudentName = currentUser.name || currentUser.studentName || (currentUser.rollNo ? (`Student Roll #${currentUser.rollNo}`) : 'Student');

      const newMsg = {
        id: `MSG-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
        senderId: currentUser.id || 'usr',
        senderName: isAdmin ? (currentUser.name || 'Admin') : resolvedStudentName,
        senderRole: isAdmin ? 'FACULTY / ADMIN' : (currentUser.className || 'Student'),
        avatar: isAdmin ? '👨‍🏫' : '🎓',
        isAdmin: isAdmin,
        isHighlighted: isHighlighted,
        isAdminAlert: isAdminAlert,
        linkUrl: linkUrl,
        text: processedText,
        timestamp: getFormattedTimestamp(),
        isPinned: isHighlighted,
        attachment: pendingAttachment,
        replies: []
      };

      msgs.push(newMsg);
      AppState.saveCommunityMessages(msgs);
      AppState.markMutation();

      if (streamChatChannel) {
        streamChatChannel.sendMessage({
          text: processedText,
          is_highlighted: isHighlighted,
          is_admin_alert: isAdminAlert,
          link_url: linkUrl,
          attachments: pendingAttachment ? [{ type: 'file', title: pendingAttachment.name, file_url: pendingAttachment.data }] : []
        }).catch(err => console.warn('Stream Chat API push fallback:', err));
      }

      renderCommunityChatTab();
    });
  }

  function parseDobString(dobStr) {
    if (!dobStr) return new Date().toISOString().split('T')[0];
    const clean = dobStr.toString().trim().replace(/[-\/]/g, '');
    if (clean.length === 8 && /^\d{8}$/.test(clean)) {
      const day = clean.slice(0, 2);
      const month = clean.slice(2, 4);
      const year = clean.slice(4, 8);
      return `${year}-${month}-${day}`;
    }
    return dobStr;
  }

  async function parseAndImportStudentCSV(csvText) {
    const lines = csvText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length <= 1) {
      showNotification('CSV file is empty or missing its header row.', 'error');
      return;
    }

    const students = AppState.getStudents();
    let count = 0;
    // Every skipped row is reported. Previously each failure was a bare
    // `continue`, so the closing alert said "imported 12 students" from a
    // 20-row file and the admin had no way to know which eight were dropped.
    const skipped = [];

    // Skip header line
    for (let i = 1; i < lines.length; i++) {
      const rowNo = i + 1;
      const parts = lines[i].split(',').map(p => p.trim().replace(/^"|"$/g, ''));
      if (parts.length < 3) {
        skipped.push(`Row ${rowNo}: needs at least Name, Mobile and DOB.`);
        continue;
      }

      const [name, mobile, rawDob, className, guardianName, oldDueStr, emailStr, guardianMobileStr] = parts;
      if (!name || !mobile || !rawDob) {
        skipped.push(`Row ${rowNo}: Name, Mobile and DOB are all required.`);
        continue;
      }

      // A blank or unrecognised class used to fall back to 'Class 10th
      // (ACHIEVER)' — the most expensive board batch — so a typo enrolled a
      // primary-school child at ₹1,000/month with a Class 10th barcode.
      const batch = ACADEMIC ? ACADEMIC.resolveBatch(className || '') : null;
      if (!batch) {
        skipped.push(`Row ${rowNo} (${name}): class "${className || '(blank)'}" is not one of the 12 batches.`);
        continue;
      }
      const canonicalClass = batch.name;

      const dob = parseDobString(rawDob);
      const monthlyFee = batch.monthlyFee;
      const oldDue = parseFloat(oldDueStr) || 0;
      const email = emailStr || '';
      const guardianMobile = guardianMobileStr || mobile;

      const initialHistory = [];
      if (oldDue > 0) {
        initialHistory.push({
          receiptNo: `OLD-DUE-CSV-${i}`,
          date: getFormattedTimestamp(),
          amount: oldDue,
          mode: 'Old Fee Carryover (CSV Import)',
          status: 'Pending Due',
          by: 'CSV Bulk Importer',
          note: 'Previous unpaid balance'
        });
      }

      const sId = generateStudentId(canonicalClass, students);
      if (!sId) {
        skipped.push(`Row ${rowNo} (${name}): could not allocate a student id for ${canonicalClass}.`);
        continue;
      }
      const stuUuid = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : (`stu_csv_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 7)}`);
      students.push({
        id: stuUuid,
        db_uuid: stuUuid,
        student_id: sId,
        name: name,
        mobile: mobile,
        dob: dob,
        rollNo: sId,
        roll_no: sId,
        className: canonicalClass,
        batchName: canonicalClass,
        guardianName: guardianName || 'Guardian',
        guardianMobile: guardianMobile,
        email: email,
        address: 'Lalganj, Vaishali, Bihar',
        bloodGroup: 'Not Specified',
        admissionDate: new Date().toISOString().split('T')[0],
        joiningMonth: 'April 2026',
        monthlyFee: monthlyFee,
        totalFee: monthlyFee + oldDue,
        paidFee: 0,
        pendingFee: monthlyFee + oldDue,
        feeHistory: initialHistory
      });
      count++;
    }

    if (count > 0) await AppState.saveStudents(students);

    let report = count > 0
      ? `🎉 Imported ${count} student record${count === 1 ? '' : 's'}. Students can log in with their DOB and complete their profile in the app.`
      : 'No rows could be imported.';
    if (skipped.length > 0) {
      report += `\n\n⚠️ ${skipped.length} row${skipped.length === 1 ? '' : 's'} skipped:\n• ` +
        skipped.slice(0, 12).join('\n• ');
      if (skipped.length > 12) report += `\n• …and ${skipped.length - 12} more.`;
    }
    alert(report);
    if (skipped.length > 0) {
      showNotification(
        `${count} imported, ${skipped.length} skipped — see the details above.`,
        count > 0 ? 'warning' : 'error'
      );
    }
    renderAdminDashboard();
  }

  function downloadSampleStudentCSV() {
    // One example per canonical batch, so the template itself documents the exact
    // class strings the importer accepts. It previously listed only four, one of
    // them under a name ('Junior Batch (JUNIO)') that no longer exists.
    const rows = [
      ['Ramesh Kumar',   '9812345670', '12062008', 'Class 12th PCM',              'Suresh Kumar',  '2000', 'ramesh@example.com',  '9812345679'],
      ['Anjali Verma',   '9812345671', '04072008', 'Class 12th PCB',              'Mahesh Verma',  '0',    'anjali@example.com',  '9812345678'],
      ['Rohit Singh',    '9812345672', '19092009', 'Class 11th PCM',              'Vinod Singh',   '1500', 'rohit@example.com',   '9812345677'],
      ['Neha Kumari',    '9812345673', '23112009', 'Class 11th PCB',              'Alok Kumar',    '0',    'neha@example.com',    '9812345676'],
      ['Priya Kumari',   '9812345674', '18042010', 'Class 10th (ACHIEVER)',       'Sunil Roy',     '0',    'priya@example.com',   '9812345675'],
      ['Aman Verma',     '9812345675', '25012011', 'Class 9th (NURTURE)',         'Sanjay Verma',  '1200', 'aman@example.com',    '9812345674'],
      ['Sneha Sharma',   '9812345676', '15092012', 'Class 8th (ALPHA)',           'Rajesh Sharma', '0',    'sneha@example.com',   '9812345673'],
      ['Karan Yadav',    '9812345677', '02032014', 'Class 6th & 7th (PIONEER)',   'Dinesh Yadav',  '700',  'karan@example.com',   '9812345672'],
      ['Ishita Raj',     '9812345678', '11082017', 'Class 1st to 5th (Junior Foundation)', 'Manoj Raj', '0', 'ishita@example.com', '9812345671'],
      ['Ayush Mishra',   '9812345679', '07062009', 'Special English 9th to 12th', 'Vikas Mishra',  '0',    'ayush@example.com',   '9812345670'],
      ['Kavita Kumari',  '9812345680', '29052012', 'Special English 6th to 8th',  'Ramesh Prasad', '0',    'kavita@example.com',  '9812345669'],
      ['Aarav Gupta',    '9812345681', '14012018', 'Special English 1st to 5th',  'Sunita Gupta',  '0',    'aarav@example.com',   '9812345668']
    ];
    const sampleCSV = ['Name,Mobile,DOB,Class,GuardianName,OldDue,Email,GuardianMobile']
      .concat(rows.map(r => r.join(',')))
      .join('\n');

    const blob = new Blob([sampleCSV], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Pragyan_Essential_Students_Import.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  }

  // Utility Date Formatter
  function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    const clean = dateStr.toString().trim();
    if (/^\d{8}$/.test(clean)) {
      const day = clean.slice(0, 2);
      const month = clean.slice(2, 4);
      const year = clean.slice(4, 8);
      const d = new Date(`${year}-${month}-${day}`);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      }
    }
    const d = new Date(clean);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  /* ==========================================================================
   * 1. DEDICATED IN-PORTAL NOTICEBOARD & ANNOUNCEMENTS MANAGER
   * ========================================================================== */
  let currentNoticeFilter = 'all';
  let currentNoticeSearch = '';

  function renderAdminNoticesManager() {
    const pane = document.getElementById('adminTabPane-post-notice');
    if (!pane) return;

    const allNotices = AppState.getNotices();
    
    // Filter notices based on active chip and search query
    let filteredNotices = allNotices.filter(n => {
      let matchesFilter = true;
      if (currentNoticeFilter === 'exam') matchesFilter = (n.category === 'exam');
      else if (currentNoticeFilter === 'general') matchesFilter = (n.category === 'general');
      else if (currentNoticeFilter === 'fees') matchesFilter = (n.category === 'fees');
      else if (currentNoticeFilter !== 'all') {
        // Batch chips carry a canonical batch id and the notice stores a batch
        // *name*, so both sides are resolved before comparing. The previous
        // `targetBatch.includes('10th')` test also matched a notice addressed to
        // "Special English 9th to 12th", and there were only four chips, so a
        // notice sent to Class 11th could not be filtered to at all.
        matchesFilter = !!n.targetBatch &&
          getBatchCategoryKey(n.targetBatch) === currentNoticeFilter;
      }

      let matchesSearch = true;
      if (currentNoticeSearch) {
        const q = currentNoticeSearch.toLowerCase();
        matchesSearch = (n.title && n.title.toLowerCase().includes(q)) ||
                        (n.message && n.message.toLowerCase().includes(q)) ||
                        (n.targetBatch && n.targetBatch.toLowerCase().includes(q));
      }
      return matchesFilter && matchesSearch;
    });

    const draftTitle = pane.querySelector('#noticeTitleInput')?.value || '';
    const draftBody = pane.querySelector('#noticeBodyInput')?.value || '';

    const canonicalBatchList = canonicalBatchCards();

    pane.innerHTML = `
      ${isMainAdmin() ? `
        <!-- Quick Switch to Email Campaigns Helper Banner (Main Admin Only) -->
        <div style="margin-bottom: 1.25rem; background: #ECFDF5; border: 1.5px solid #A7F3D0; border-radius: 12px; padding: 0.85rem 1.15rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.75rem;">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <div style="width: 38px; height: 38px; border-radius: 50%; background: #064E3B; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 1.1rem;">
              <i aria-hidden="true" class="fa-solid fa-bullhorn"></i>
            </div>
            <div>
              <div style="font-weight: 800; font-size: 0.92rem; color: #064E3B;">In-Portal Noticeboard & Student Feed</div>
              <div style="font-size: 0.8rem; color: #047857;">Broadcast notices here to display them immediately inside student dashboards and noticeboards.</div>
            </div>
          </div>
          <button type="button" class="btn btn-emerald" onclick="switchAdminTab('email')" style="padding: 0.45rem 1rem; font-size: 0.82rem; font-weight: 700; border-radius: 8px;">
            <i aria-hidden="true" class="fa-solid fa-envelope-open-text"></i> Go to Email Dispatch & Invoices →
          </button>
        </div>
      ` : `
        <div style="margin-bottom: 1.25rem; background: #F8FAFC; border: 1.5px solid #E2E8F0; border-radius: 12px; padding: 0.85rem 1.15rem; display: flex; align-items: center; gap: 0.75rem;">
          <div style="width: 38px; height: 38px; border-radius: 50%; background: #064E3B; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 1.1rem;">
            <i aria-hidden="true" class="fa-solid fa-bullhorn"></i>
          </div>
          <div>
            <div style="font-weight: 800; font-size: 0.92rem; color: #064E3B;">In-Portal Noticeboard Broadcasts</div>
            <div style="font-size: 0.8rem; color: #64748B;">Notices posted here are immediately visible to students in their portal feeds. (Mass email campaigns are dispatched by Main Admin Chandan Kumar).</div>
          </div>
        </div>
      `}

      <!-- TOP: Broadcast New Announcement Form -->
      <div class="dash-card" style="margin-bottom: 1.5rem;">
        <div class="dash-card-header">
          <div class="dash-card-title"><i aria-hidden="true" class="fa-solid fa-paper-plane" style="color: var(--primary-emerald);"></i> Post Noticeboard Announcement</div>
        </div>

        <form id="adminPostNoticeForm">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-bottom: 1rem;">
            <div>
              <label for="noticeTitleInput" style="display: block; font-weight: 600; font-size: 0.85rem; margin-bottom: 0.35rem;">Announcement Title *</label>
              <input type="text" id="noticeTitleInput" class="portal-input" placeholder="e.g. Science Monthly Test & Practical Schedule" value="${draftTitle.replace(/"/g, '&quot;')}" required>
            </div>
            <div>
              <label for="noticeCategorySelect" style="display: block; font-weight: 600; font-size: 0.85rem; margin-bottom: 0.35rem;">Category *</label>
              <select id="noticeCategorySelect" class="portal-input">
                <option value="general">📢 General Announcement</option>
                <option value="holiday">🏖️ Holiday / Class Off</option>
                <option value="exam">📝 Exam & Test Schedule</option>
                <option value="schedule">⏰ Timing / Class Reschedule</option>
                <option value="fees">💳 Fee Update</option>
                <option value="urgent">🚨 Urgent Alert</option>
              </select>
            </div>
          </div>

          <!-- Target Batch Selection Section -->
          <div style="background: #F8FAFC; border: 1.5px solid #E2E8F0; border-radius: 12px; padding: 1rem 1.15rem; margin-bottom: 1rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
              <label style="font-weight: 700; font-size: 0.88rem; color: var(--text-mahogany);">
                <i aria-hidden="true" class="fa-solid fa-users-viewfinder" style="color: var(--primary-emerald);"></i> Target Batches for In-Portal Noticeboard *
              </label>
              <div style="display: flex; gap: 0.4rem;">
                <button type="button" id="btnSelectAllBatches" class="btn" style="padding: 0.25rem 0.65rem; font-size: 0.8rem; background: #ECFDF5; color: #065F46; border: 1px solid #A7F3D0; border-radius: 6px; font-weight: 700; cursor: pointer;">
                  Select All
                </button>
                <button type="button" id="btnClearAllBatches" class="btn" style="padding: 0.25rem 0.65rem; font-size: 0.8rem; background: #F1F5F9; color: #475569; border: 1px solid #CBD5E1; border-radius: 6px; font-weight: 700; cursor: pointer;">
                  Clear
                </button>
              </div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.6rem;" id="noticeBatchOptionsGrid">
              ${canonicalBatchList.map(b => {
                return `
                  <label style="display: flex; align-items: center; gap: 0.6rem; background: #FFFFFF; border: 1.5px solid #E2E8F0; border-radius: 8px; padding: 0.65rem 0.85rem; cursor: pointer; user-select: none; transition: border-color 0.15s ease;">
                    <input type="checkbox" class="notice-batch-chk" value="${b.key}" data-name="${b.name}" checked style="width: 17px; height: 17px; accent-color: var(--primary-emerald); cursor: pointer;">
                    <div style="flex: 1;">
                      <div style="font-weight: 700; font-size: 0.82rem; color: #1E293B;">${b.icon} ${b.name}</div>
                    </div>
                  </label>
                `;
              }).join('')}
            </div>
          </div>

          <!-- Dynamic Personalization Tags Toolbar -->
          <div class="notice-tags-composer-box">
            <div class="notice-tags-composer-head">
              <span class="notice-tags-composer-title">
                <i aria-hidden="true" class="fa-solid fa-wand-magic-sparkles" style="color: #059669;"></i> Dynamic Student Personalization Tags:
              </span>
              <span class="notice-tags-composer-hint">(Click any tag below to insert into message)</span>
            </div>
            <div class="notice-tag-chips-wrap">
              <button type="button" class="btn-insert-notice-tag" data-target="noticeBodyInput" data-tag="{{student_name}}" title="Inserts Student's Full Name">👤 {{student_name}}</button>
              <button type="button" class="btn-insert-notice-tag" data-target="noticeBodyInput" data-tag="{{batch_name}}" title="Inserts Enrolled Batch Name">📚 {{batch_name}}</button>
              <button type="button" class="btn-insert-notice-tag" data-target="noticeBodyInput" data-tag="{{pending_dues}}" title="Inserts Pending Tuition Fee Balance">💳 {{pending_dues}}</button>
              <button type="button" class="btn-insert-notice-tag" data-target="noticeBodyInput" data-tag="{{roll_no}}" title="Inserts Student Roll Number">🆔 {{roll_no}}</button>
              <button type="button" class="btn-insert-notice-tag" data-target="noticeBodyInput" data-tag="{{due_date}}" title="Inserts Monthly Due Date">📅 {{due_date}}</button>
              <button type="button" class="btn-insert-notice-tag" data-target="noticeBodyInput" data-tag="{{guardian_name}}" title="Inserts Father/Guardian Name">👨‍👧 {{guardian_name}}</button>
              <button type="button" class="btn-insert-notice-tag" data-target="noticeBodyInput" data-tag="{{phone}}" title="Inserts Contact Mobile Number">📞 {{phone}}</button>
            </div>
          </div>

          <div style="margin-bottom: 1rem;">
            <label for="noticeBodyInput" style="display: block; font-weight: 600; font-size: 0.85rem; margin-bottom: 0.35rem;">Announcement Details / Message Body *</label>
            <textarea id="noticeBodyInput" class="portal-input" rows="6" placeholder="Write full details, examination timings, schedule, syllabus or notice description here... (Personalization tags like {{student_name}} and {{pending_dues}} will be replaced automatically for each student)" required style="resize: vertical; width: 100%; min-height: 180px; font-family: inherit; font-size: 0.92rem; line-height: 1.55; box-sizing: border-box; padding: 0.85rem;">${draftBody.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
          </div>
          <div style="margin-bottom: 1.25rem;">
            <label for="noticeAttachmentInput" style="display: block; font-weight: 600; font-size: 0.85rem; margin-bottom: 0.35rem;">Attach Photo or PDF Document (Optional)</label>
            <input type="file" id="noticeAttachmentInput" class="portal-input" accept="image/*,.pdf,.doc,.docx" style="padding: 0.45rem;">
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.25rem;">Stored securely in Supabase Storage bucket. Supports photos & PDF documents.</div>
          </div>

          <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem; margin-top: 1rem;">
            <label style="display: flex; align-items: center; gap: 0.6rem; cursor: pointer; user-select: none; background: #ECFDF5; border: 1.5px solid #A7F3D0; border-radius: 8px; padding: 0.6rem 0.95rem;">
              <input type="checkbox" id="noticeSendPushBroadcastChk" checked style="width: 18px; height: 18px; accent-color: var(--primary-emerald); cursor: pointer;">
              <span style="font-weight: 700; font-size: 0.85rem; color: #065F46; display: inline-flex; align-items: center; gap: 0.35rem;">
                <i aria-hidden="true" class="fa-solid fa-bell"></i> Send Instant Lockscreen Push Notification to Target Students
              </span>
            </label>
            <button type="submit" class="btn btn-emerald" style="padding: 0.75rem 1.75rem;">
              <i aria-hidden="true" class="fa-solid fa-bullhorn"></i> Post to Student Noticeboard
            </button>
          </div>
        </form>
      </div>

      <!-- BOTTOM: Manage Existing Announcements -->
      <div class="dash-card">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 1.25rem;">
          <div>
            <h3 style="font-size: 1.15rem; font-weight: 700; color: var(--text-mahogany); margin: 0;">
              <i aria-hidden="true" class="fa-solid fa-bullhorn" style="color: var(--primary-emerald);"></i> Active Noticeboard Announcements (${allNotices.length})
            </h3>
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.2rem;">Live notices visible in student portals and noticeboards</div>
          </div>
          <div style="width: 260px; max-width: 100%;">
            <input type="text" id="adminNoticeSearchInput" aria-label="Search notices" class="portal-input" placeholder="🔍 Search notices..." value="${currentNoticeSearch}" style="font-size: 0.85rem; padding: 0.45rem 0.75rem;">
          </div>
        </div>

        <!-- Filter Chips -->
        <!-- role="group" + aria-pressed: these chips are a filter toolbar whose
             selected state was conveyed by background colour alone. -->
        <div role="group" aria-label="Filter announcements" style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1.25rem;">
          <button type="button" class="notice-admin-filter-chip ${currentNoticeFilter === 'all' ? 'active' : ''}" aria-pressed="${currentNoticeFilter === 'all'}" data-filter="all">All (${allNotices.length})</button>
          <button type="button" class="notice-admin-filter-chip ${currentNoticeFilter === 'exam' ? 'active' : ''}" aria-pressed="${currentNoticeFilter === 'exam'}" data-filter="exam">📝 Exams</button>
          <button type="button" class="notice-admin-filter-chip ${currentNoticeFilter === 'general' ? 'active' : ''}" aria-pressed="${currentNoticeFilter === 'general'}" data-filter="general">📢 General</button>
          <button type="button" class="notice-admin-filter-chip ${currentNoticeFilter === 'fees' ? 'active' : ''}" aria-pressed="${currentNoticeFilter === 'fees'}" data-filter="fees">💳 Fees</button>
          ${canonicalBatchList.map(b => `
          <button type="button" class="notice-admin-filter-chip ${currentNoticeFilter === b.key ? 'active' : ''}" aria-pressed="${currentNoticeFilter === b.key}" data-filter="${b.key}">${b.icon} ${b.name}</button>`).join('')}
        </div>

        <!-- Announcements List -->
        ${filteredNotices.length === 0 ? `
          <div style="text-align: center; color: var(--text-muted); padding: 3rem 1rem;">
            <i aria-hidden="true" class="fa-solid fa-inbox" style="font-size: 2.5rem; color: #9CA3AF; margin-bottom: 0.75rem;"></i>
            <p style="font-weight: 600;">No announcements found matching criteria.</p>
          </div>
        ` : `
          <div style="display: flex; flex-direction: column; gap: 1rem;">
            ${filteredNotices.map(notice => {
              const catBadge = notice.category === 'exam' 
                ? '<span style="background: #FEF3C7; color: #92400E; padding: 0.2rem 0.6rem; border-radius: 99px; font-weight: 700; font-size: 0.8rem;"><i aria-hidden="true" class="fa-solid fa-file-pen"></i> Exam & Test</span>'
                : notice.category === 'holiday'
                ? '<span style="background: #E0F2FE; color: #0369A1; padding: 0.2rem 0.6rem; border-radius: 99px; font-weight: 700; font-size: 0.8rem;"><i aria-hidden="true" class="fa-solid fa-umbrella-beach"></i> Holiday / Off</span>'
                : notice.category === 'fees'
                ? '<span style="background: #FEE2E2; color: #991B1B; padding: 0.2rem 0.6rem; border-radius: 99px; font-weight: 700; font-size: 0.8rem;"><i aria-hidden="true" class="fa-solid fa-receipt"></i> Fee Notice</span>'
                : notice.category === 'urgent'
                ? '<span style="background: #FEE2E2; color: #B91C1C; padding: 0.2rem 0.6rem; border-radius: 99px; font-weight: 800; font-size: 0.8rem;"><i aria-hidden="true" class="fa-solid fa-triangle-exclamation"></i> Urgent Alert</span>'
                : '<span style="background: #D1FAE5; color: #065F46; padding: 0.2rem 0.6rem; border-radius: 99px; font-weight: 700; font-size: 0.8rem;"><i aria-hidden="true" class="fa-solid fa-bullhorn"></i> General</span>';

              const targetBatchBadge = notice.targetBatch 
                ? `<span style="background: #EEF2FF; color: #4338CA; padding: 0.2rem 0.6rem; border-radius: 99px; font-weight: 600; font-size: 0.8rem;"><i aria-hidden="true" class="fa-solid fa-users"></i> ${notice.targetBatch}</span>`
                : '<span style="background: #EEF2FF; color: #4338CA; padding: 0.2rem 0.6rem; border-radius: 99px; font-weight: 600; font-size: 0.8rem;"><i aria-hidden="true" class="fa-solid fa-users"></i> All Batches</span>';

              return `
                <div style="background: #ffffff; border: 1.5px solid #E2E8F0; border-radius: 10px; padding: 1.15rem; transition: transform 0.15s ease, box-shadow 0.15s ease; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
                  <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.6rem;">
                    <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
                      ${catBadge}
                      ${targetBatchBadge}
                    </div>
                    <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
                      <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600;">📅 ${notice.date}</span>
                      <button type="button" class="btn btn-edit-notice" data-id="${notice.id}" style="padding: 0.35rem 0.75rem; font-size: 0.8rem; font-weight: 700; background: #ECFDF5; color: #065F46; border: 1px solid #10B981; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 0.35rem; transition: background 0.15s ease;" title="Edit Notice">
                        <i aria-hidden="true" class="fa-solid fa-pen-to-square"></i> Edit
                      </button>
                      <button type="button" class="btn btn-delete-notice" data-id="${notice.id}" style="padding: 0.35rem 0.75rem; font-size: 0.8rem; font-weight: 700; background: #FEE2E2; color: #DC2626; border: 1px solid #FECACA; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 0.35rem; transition: background 0.15s ease;" title="Delete Notice">
                        <i aria-hidden="true" class="fa-solid fa-trash-can"></i> Delete
                      </button>
                    </div>
                  </div>

                  <h4 style="font-size: 1.05rem; font-weight: 800; color: var(--text-mahogany); margin: 0 0 0.5rem 0;">${escapeHtml(notice.title)}</h4>
                  <p style="font-size: 0.88rem; color: #374151; line-height: 1.6; margin: 0; white-space: pre-wrap;">${escapeHtml(notice.message)}</p>

                  ${notice.attachmentUrl || notice.attachment_url ? `
                    <div style="margin-top: 0.85rem; padding-top: 0.65rem; border-top: 1px dashed #E2E8F0; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem;">
                      <a href="${notice.attachmentUrl || notice.attachment_url}" target="_blank" style="display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.82rem; font-weight: 700; color: var(--primary-emerald); text-decoration: underline;">
                        <i aria-hidden="true" class="fa-solid fa-paperclip"></i> View Attached Document / Photo
                      </a>
                    </div>
                  ` : ''}
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>
    `;

    // Bind Notice Personalization Tags Insertion
    pane.querySelectorAll('.btn-insert-notice-tag').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const tag = btn.dataset.tag;
        const targetId = btn.dataset.target || 'noticeBodyInput';
        const el = pane.querySelector('#' + targetId) || pane.querySelector('#noticeBodyInput');
        if (el) {
          const start = (typeof el.selectionStart === 'number') ? el.selectionStart : el.value.length;
          const end = (typeof el.selectionEnd === 'number') ? el.selectionEnd : el.value.length;
          const val = el.value;
          el.value = val.substring(0, start) + tag + val.substring(end);
          el.focus();
          el.selectionStart = el.selectionEnd = start + tag.length;
        }
      });
    });

    // Bind Notice Listeners
    pane.querySelector('#btnSelectAllBatches')?.addEventListener('click', () => {
      pane.querySelectorAll('.notice-batch-chk').forEach(chk => chk.checked = true);
    });

    pane.querySelector('#btnClearAllBatches')?.addEventListener('click', () => {
      pane.querySelectorAll('.notice-batch-chk').forEach(chk => chk.checked = false);
    });

    // Form submit listener
    pane.querySelector('#adminPostNoticeForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const submitBtn = form.querySelector('button[type="submit"]');
      const title = pane.querySelector('#noticeTitleInput').value.trim();
      const category = pane.querySelector('#noticeCategorySelect').value;
      const allChks = Array.from(pane.querySelectorAll('.notice-batch-chk'));
      const chks = allChks.filter(c => c.checked);
      // Compare against however many batches the grid actually rendered. This
      // was a hardcoded `chks.length === 4`, which stopped meaning "everything"
      // the moment the grid grew to all twelve batches — a notice ticked for
      // every batch was then filed under a 12-name comma list instead of
      // "All Batches", and the student-side "All Batches" match missed it.
      const targetBatch = (allChks.length > 0 && chks.length === allChks.length)
        ? 'All Batches'
        : (chks.map(c => c.dataset.name).join(', ') || 'Custom');
      const message = pane.querySelector('#noticeBodyInput').value.trim();
      const attachmentFile = pane.querySelector('#noticeAttachmentInput')?.files[0];
      const shouldSendPush = Boolean(pane.querySelector('#noticeSendPushBroadcastChk')?.checked);

      if (!title) { alert('⚠️ Please enter a notice title.'); return; }
      if (chks.length === 0) { alert('⚠️ Please select at least one target batch.'); return; }
      if (!message) { alert('⚠️ Please enter a notice message.'); return; }

      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '📡 Posting…'; }

      try {
        let attachmentUrl = '';
        if (attachmentFile) {
          try {
            attachmentUrl = await SupabaseSync.uploadFile(attachmentFile, 'notice_attachments') || '';
          } catch (uploadErr) {
            console.warn('Attachment upload failed:', uploadErr.message);
          }
        }

        const notices = AppState.getNotices();
        notices.unshift({
          id: `NTC-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,5)}`,
          title,
          category,
          date: new Date().toISOString().split('T')[0],
          message,
          targetBatch,
          attachmentUrl,
          attachment_url: attachmentUrl,
          unread: true
        });
        await AppState.saveNotices(notices);

        const author = getActiveTeacherName();
        await AppState.addAuditLog(author, 'NOTICE_BROADCAST', targetBatch, title, `Broadcasted notice "${title}" to ${targetBatch}.`, { category, targetBatch });

        // Dispatch instant cloud push broadcast to target students if checked
        if (shouldSendPush) {
          const token = (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('pragyan_portal_token')) ||
            (typeof localStorage !== 'undefined' && localStorage.getItem('pragyan_portal_token')) || null;
          const selectedBatchKeys = chks.map(c => c.value);
          const targetType = (allChks.length > 0 && chks.length === allChks.length) ? 'ALL' : 'BATCHES';
          fetch('/api/send-push', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            body: JSON.stringify({
              title,
              body: message,
              target: {
                type: targetType,
                batches: selectedBatchKeys
              },
              priority: (category === 'urgent' || category === 'exam') ? 'high' : 'normal',
              actions: [{ action: 'view_notice', title: 'Open Notice', url: '/#notices' }]
            })
          }).catch(e => console.warn('[NoticePush] Failed:', e));
        }

        form.reset();
        alert('🎉 Notice successfully posted to the student noticeboard!' + (shouldSendPush ? ' Push notification dispatched to student devices.' : ''));
        renderAdminDashboard();
      } catch (err) {
        console.error('Broadcast failed:', err);
        alert('❌ Broadcast failed: ' + err.message);
      } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i aria-hidden="true" class="fa-solid fa-bullhorn"></i> Post to Student Noticeboard'; }
      }
    });

    // Search input listener
    pane.querySelector('#adminNoticeSearchInput')?.addEventListener('input', (e) => {
      currentNoticeSearch = e.target.value;
      renderAdminNoticesManager();
    });

    // Filter chip listeners
    pane.querySelectorAll('.notice-admin-filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        currentNoticeFilter = chip.dataset.filter;
        renderAdminNoticesManager();
      });
    });

    // Edit notice listeners
    pane.querySelectorAll('.btn-edit-notice').forEach(btn => {
      btn.addEventListener('click', () => {
        openEditNoticeModal(btn.dataset.id);
      });
    });

    // Delete notice listeners
    pane.querySelectorAll('.btn-delete-notice').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const allN = AppState.getNotices();
        const target = allN.find(n => n.id === id);
        if (!target) return;

        if (confirm(`🗑️ Delete announcement "${target.title}"?\n\nThis will immediately and permanently remove it from all student dashboards and noticeboards.`)) {
          // The cloud delete has to land before the local one. mutate() returns its
          // failures rather than throwing, so this result was previously discarded:
          // a rejected delete still removed the notice locally and reported success,
          // and the next pullAll() put it back on every student dashboard — after
          // the admin had been told it was permanently removed.
          if (target.id && typeof SupabaseSync !== 'undefined' && SupabaseSync.mutate) {
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            const where = uuidRegex.test(target.id) ? { id: target.id } : { title: target.title };
            const result = await SupabaseSync.mutate('notices', 'delete', null, { where });
            if (!result || result.success !== true) {
              alert(`⚠️ "${target.title}" was NOT deleted — the database rejected the request${result?.error ? `: ${result.error}` : ''}.\n\nThe announcement is still live. Check your connection and try again.`);
              return;
            }
            if (!Array.isArray(result.data) || result.data.length === 0) {
              // Zero deleted rows: the notice vanished server-side already.
              alert('ℹ️ That notice no longer exists in the database — it was likely deleted by another session. Refreshing.');
              const updatedSynced = allN.filter(n => n.id !== id);
              await AppState.saveNotices(updatedSynced);
              renderAdminDashboard();
              return;
            }
          }
          const updated = allN.filter(n => n.id !== id);
          await AppState.saveNotices(updated);
          const author = getActiveTeacherName();
          await AppState.addAuditLog(author, 'NOTICE_DELETED', target.targetBatch || 'All Batches', target.title, `Deleted notice "${target.title}".`);
          alert('🗑️ Announcement successfully deleted and removed from noticeboard.');
          renderAdminDashboard();
        }
      });
    });
  }

  function openEditNoticeModal(noticeId) {
    document.getElementById('editNoticeModal')?.remove();
    const notices = AppState.getNotices();
    const target = notices.find(n => n.id === noticeId);
    if (!target) return;

    const canonicalBatchList = canonicalBatchCards();

    const modalHtml = `
      <div class="inner-modal-backdrop active" id="editNoticeModal" style="display: flex; position: fixed; inset: 0; background: rgba(0,0,0,0.55); z-index: 9999; align-items: center; justify-content: center; padding: 1rem; backdrop-filter: blur(4px);">
        <div class="inner-modal-content" style="max-width: 620px; width: 100%; background: #FAF9F6; border-radius: 12px; border: 1.5px solid var(--border-sand); box-shadow: 0 10px 25px rgba(0,0,0,0.15); overflow: hidden; max-height: 90vh; display: flex; flex-direction: column;">
          <div class="inner-modal-header" style="background: #064E3B; color: #fff; padding: 1rem 1.25rem; display: flex; justify-content: space-between; align-items: center;">
            <h3 style="margin: 0; font-size: 1.15rem; font-weight: 800; color: #fff; display: flex; align-items: center; gap: 0.5rem;">
              <i aria-hidden="true" class="fa-solid fa-pen-to-square" style="color: #34D399;"></i> Edit Noticeboard Announcement
            </h3>
            <button type="button" aria-label="Close edit notice dialog" class="btn-close-inner" onclick="document.getElementById('editNoticeModal').remove()" style="background: none; border: none; color: #fff; font-size: 1.2rem; cursor: pointer;">
              <i aria-hidden="true" class="fa-solid fa-xmark"></i>
            </button>
          </div>
          
          <form id="editNoticeForm" style="padding: 1.25rem; overflow-y: auto; display: flex; flex-direction: column; gap: 1rem;">
            <div>
              <label for="editNoticeTitle" style="display: block; font-size: 0.85rem; font-weight: 700; color: #374151; margin-bottom: 0.35rem;">
                Announcement Title *
              </label>
              <input type="text" id="editNoticeTitle" class="portal-input" value="${target.title ? target.title.replace(/"/g, '&quot;') : ''}" required style="width: 100%; font-weight: 600;">
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem;">
              <div>
                <label for="editNoticeCategory" style="display: block; font-size: 0.85rem; font-weight: 700; color: #374151; margin-bottom: 0.35rem;">
                  Category *
                </label>
                <select id="editNoticeCategory" class="portal-input" style="width: 100%;">
                  <option value="general" ${target.category === 'general' ? 'selected' : ''}>📢 General Announcement</option>
                  <option value="exam" ${target.category === 'exam' ? 'selected' : ''}>📝 Exam & Test Schedule</option>
                  <option value="holiday" ${target.category === 'holiday' ? 'selected' : ''}>🏖️ Holiday / Class Off</option>
                  <option value="schedule" ${target.category === 'schedule' ? 'selected' : ''}>⏰ Timing / Class Reschedule</option>
                  <option value="fees" ${target.category === 'fees' ? 'selected' : ''}>💳 Fee Notice / Update</option>
                  <option value="urgent" ${target.category === 'urgent' ? 'selected' : ''}>🚨 Urgent Alert</option>
                </select>
              </div>

              <div>
                <label for="editNoticeBatch" style="display: block; font-size: 0.85rem; font-weight: 700; color: #374151; margin-bottom: 0.35rem;">
                  Target Batch *
                </label>
                <select id="editNoticeBatch" class="portal-input" style="width: 100%;">
                  ${(() => {
                    // Notices store a batch *name* (or a comma-joined list of
                    // them), so the options carry names and the stored value is
                    // resolved to a canonical id to decide what is selected.
                    // The five hardcoded options this replaces covered four of
                    // the twelve batches, and matched by substring — so a notice
                    // targeted at "Special English 9th to 12th" pre-selected
                    // "Class 9th (NURTURE)" and was silently retargeted on save.
                    const stored = String(target.targetBatch || target.target_batch || '').trim();
                    const storedKey = stored ? getBatchCategoryKey(stored) : '';
                    const isAll = !stored || /^all/i.test(stored);
                    const opts = [
                      `<option value="All Batches"${isAll ? ' selected' : ''}>🌟 All Batches</option>`
                    ];
                    canonicalBatchList.forEach(b => {
                      const sel = !isAll && storedKey === b.key ? ' selected' : '';
                      opts.push(`<option value="${b.name.replace(/"/g, '&quot;')}"${sel}>${b.icon} ${b.name}</option>`);
                    });
                    // A multi-batch notice resolves to no single id. Keep its
                    // exact stored value as an option so opening the editor and
                    // saving cannot quietly narrow its audience.
                    if (!isAll && !storedKey) {
                      opts.push(`<option value="${stored.replace(/"/g, '&quot;')}" selected>👥 ${stored}</option>`);
                    }
                    return opts.join('\n                  ');
                  })()}
                </select>
              </div>
            </div>

            <!-- Dynamic Personalization Tags Toolbar for Edit Modal -->
            <div class="notice-tags-composer-box">
              <div class="notice-tags-composer-head">
                <span class="notice-tags-composer-title">
                  <i aria-hidden="true" class="fa-solid fa-wand-magic-sparkles" style="color: #059669;"></i> Dynamic Personalization Tags:
                </span>
                <span class="notice-tags-composer-hint">(Click to insert into message)</span>
              </div>
              <div class="notice-tag-chips-wrap">
                <button type="button" class="btn-insert-notice-tag" data-target="editNoticeMessage" data-tag="{{student_name}}">👤 {{student_name}}</button>
                <button type="button" class="btn-insert-notice-tag" data-target="editNoticeMessage" data-tag="{{batch_name}}">📚 {{batch_name}}</button>
                <button type="button" class="btn-insert-notice-tag" data-target="editNoticeMessage" data-tag="{{pending_dues}}">💳 {{pending_dues}}</button>
                <button type="button" class="btn-insert-notice-tag" data-target="editNoticeMessage" data-tag="{{roll_no}}">🆔 {{roll_no}}</button>
                <button type="button" class="btn-insert-notice-tag" data-target="editNoticeMessage" data-tag="{{due_date}}">📅 {{due_date}}</button>
                <button type="button" class="btn-insert-notice-tag" data-target="editNoticeMessage" data-tag="{{guardian_name}}">👨‍👧 {{guardian_name}}</button>
                <button type="button" class="btn-insert-notice-tag" data-target="editNoticeMessage" data-tag="{{phone}}">📞 {{phone}}</button>
              </div>
            </div>

            <div>
              <label for="editNoticeMessage" style="display: block; font-size: 0.85rem; font-weight: 700; color: #374151; margin-bottom: 0.35rem;">
                Announcement Details / Body Message *
              </label>
              <textarea id="editNoticeMessage" class="portal-input" rows="5" required style="width: 100%; font-family: inherit; font-size: 0.9rem; line-height: 1.55; resize: vertical;">${target.message || ''}</textarea>
            </div>

            ${target.attachmentUrl || target.attachment_url ? `
              <div style="background: #F1F5F9; border: 1px solid #CBD5E1; border-radius: 8px; padding: 0.65rem 0.85rem; display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap;">
                <div style="font-size: 0.8rem; color: #334155; display: flex; align-items: center; gap: 0.4rem;">
                  <i aria-hidden="true" class="fa-solid fa-paperclip" style="color: var(--primary-emerald);"></i> Current Attachment: 
                  <a href="${target.attachmentUrl || target.attachment_url}" target="_blank" style="font-weight: 700; color: var(--primary-emerald); text-decoration: underline;">View File</a>
                </div>
                <button type="button" id="btnRemoveNoticeAttachment" class="btn" style="padding: 0.2rem 0.5rem; font-size: 0.8rem; background: #FEE2E2; color: #DC2626; border: 1px solid #FECACA; border-radius: 4px; cursor: pointer;">
                  <i class="fa-solid fa-xmark" aria-hidden="true"></i> Remove Attachment
                </button>
              </div>
            ` : ''}

            <div style="display: flex; gap: 0.75rem; justify-content: flex-end; margin-top: 0.5rem;">
              <button type="button" class="btn" onclick="document.getElementById('editNoticeModal').remove()" style="padding: 0.65rem 1.25rem; font-weight: 700; background: #F3F4F6; color: #374151; border: 1px solid #D1D5DB; border-radius: 8px;">
                Cancel
              </button>
              <button type="submit" class="btn btn-emerald" style="padding: 0.65rem 1.5rem; font-weight: 800; border-radius: 8px; box-shadow: 0 4px 12px rgba(5,150,105,0.3);">
                <i aria-hidden="true" class="fa-solid fa-floppy-disk"></i> Save & Synchronize Notice
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    wireModalA11y('editNoticeModal', { closeOnBackdrop: false });

    // Wire tag insertion in edit modal
    const editModalEl = document.getElementById('editNoticeModal');
    editModalEl?.querySelectorAll('.btn-insert-notice-tag').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const tag = btn.dataset.tag;
        const targetId = btn.dataset.target || 'editNoticeMessage';
        const el = editModalEl.querySelector('#' + targetId) || document.getElementById(targetId);
        if (el) {
          const start = (typeof el.selectionStart === 'number') ? el.selectionStart : el.value.length;
          const end = (typeof el.selectionEnd === 'number') ? el.selectionEnd : el.value.length;
          const val = el.value;
          el.value = val.substring(0, start) + tag + val.substring(end);
          el.focus();
          el.selectionStart = el.selectionEnd = start + tag.length;
        }
      });
    });

    // Remove attachment handler. The id is notice-specific: this button and the
    // one in the compose-notice pane both used to be id="btnRemoveAttachment",
    // and getElementById returns the FIRST match in the document — so with the
    // compose pane still mounted, clicking Remove here silently unmounted that
    // one instead and left this attachment in place.
    document.getElementById('btnRemoveNoticeAttachment')?.addEventListener('click', (event) => {
      target.attachmentUrl = '';
      target.attachment_url = '';
      event.currentTarget.parentElement?.remove();
    });

    document.getElementById('editNoticeForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      target.title = document.getElementById('editNoticeTitle').value.trim();
      target.category = document.getElementById('editNoticeCategory').value;
      target.targetBatch = document.getElementById('editNoticeBatch').value;
      target.message = document.getElementById('editNoticeMessage').value.trim();

      await AppState.saveNotices(notices);
      const author = getActiveTeacherName();
      await AppState.addAuditLog(author, 'NOTICE_EDITED', target.targetBatch, target.title, `Updated notice "${target.title}".`);
      
      document.getElementById('editNoticeModal').remove();
      alert('✅ Announcement updated and synchronized across all student noticeboards!');
      renderAdminDashboard();
    });
  }

  /* ==========================================================================
   * 2. DEDICATED EMAIL DISPATCH & INVOICING CAMPAIGNS TAB
   * ========================================================================== */
  let adminEmailAudience = 'all';
  let adminEmailCampaignType = 'monthly_invoice';
  let adminEmailSelectedStudentId = '';

  function getCampaignDefaultSubject(type, batchLabel) {
    const curMonth = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    if (type === 'monthly_invoice') return `Monthly Tuition Fee Invoice (${curMonth}) — Pragyan Institute Lalganj`;
    if (type === 'fee_reminder') return `Fee Dues Notice: Outstanding Balance Reminder — Pragyan Institute`;
    if (type === 'exam_circular') return `Academic Notice: Examination & Test Timetable — Pragyan Institute`;
    return `Official Circular for ${batchLabel} — Pragyan Institute Lalganj`;
  }

  function getCampaignDefaultBody(type) {
    const curMonth = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    if (type === 'monthly_invoice') {
      return `Dear Parent / Guardian,\n\nPlease find detailed below the official computerized tuition fee statement for the month of ${curMonth}.\n\n• Student: {student_name}\n• Roll No: #{roll_no}\n• Batch: {class_name}\n• Monthly Tuition Fee: ₹{monthly_fee}\n• Previous Outstanding Balance: ₹{previous_due}\n• Net Total Payable: ₹{total_payable}\n\nYou can clear the fees securely online using any UPI App (Google Pay, PhonePe, Paytm) via the 1-click button below, or pay at the institute front desk counter during regular batch hours.`;
    }
    if (type === 'fee_reminder') {
      return `Dear Parent / Student,\n\nThis is a priority notification regarding the outstanding tuition fee balance of ₹{pending_fee} for {student_name} ({class_name}, Roll #{roll_no}).\n\nKindly arrange to clear the pending dues within this week via the online payment gateway or at the institute accounts desk.\n\nIf you have already made the payment within the last 24 hours, kindly disregard this notice.`;
    }
    if (type === 'exam_circular') {
      return `Dear Students & Parents,\n\nPlease review the upcoming monthly board revision test schedule and academic performance guidelines for {class_name}.\n\n• Reporting Time: 15 minutes before scheduled batch timing\n• Test Syllabus: Physics & Mathematics (Units 1 to 4)\n• Mandatory Items: Admit Card, Geometry Kit, Pragyan Student ID Card\n• Personalized Doubt Clearing: Available daily 30 minutes before regular lectures.`;
    }
    return `Dear Students and Parents of Pragyan Institute,\n\nPlease review this official circular issued by the Directorate regarding upcoming batch schedules, holiday calendar, and academic milestones.\n\nFor any clarification, please contact the institute reception desk during working hours.`;
  }

  function replaceEmailPlaceholders(text, student) {
    if (!text || !student) return text || '';
    const curMonth = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    const monthlyFee = studentMonthlyFee(student);
    const pendingFee = student.pendingFee || 0;
    const prevDue = Math.max(0, pendingFee - monthlyFee);

    return text
      .replace(/\{student_name\}/gi, student.name || 'Student')
      .replace(/\{roll_no\}/gi, student.rollNo || 'N/A')
      .replace(/\{class_name\}/gi, student.className || 'General Batch')
      .replace(/\{monthly_fee\}/gi, monthlyFee.toLocaleString('en-IN'))
      .replace(/\{pending_fee\}/gi, pendingFee.toLocaleString('en-IN'))
      .replace(/\{previous_due\}/gi, prevDue.toLocaleString('en-IN'))
      .replace(/\{total_payable\}/gi, pendingFee.toLocaleString('en-IN'))
      .replace(/\{month_year\}/gi, curMonth)
      .replace(/\{date\}/gi, new Date().toLocaleDateString('en-IN'));
  }

  function generateCampaignEmailHtml(student, templateType, subject, bodyText, includePaymentLink, includeSeal) {
    const s = student || {};
    const curMonth = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    const monthlyFee = studentMonthlyFee(s);
    const pendingFee = s.pendingFee || 0;
    const prevDue = Math.max(0, pendingFee - monthlyFee);
    const author = getActiveTeacherName();

    const processedSubject = replaceEmailPlaceholders(subject, s);
    const processedBody = replaceEmailPlaceholders(bodyText, s);

    const typeBadges = {
      monthly_invoice: '📄 OFFICIAL MONTHLY TUITION INVOICE',
      fee_reminder: '⚠️ URGENT FEE DUES NOTICE',
      exam_circular: '📝 ACADEMIC & EXAMINATION CIRCULAR',
      custom_announcement: '📢 OFFICIAL PRAGYAN CIRCULAR'
    };
    const badgeText = typeBadges[templateType] || '📢 OFFICIAL CIRCULAR';

    const payUrl = `https://pragyaninstitute.com/pay.html?roll=${encodeURIComponent(s.rollNo || '')}&amount=${pendingFee}`;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${escapeHtml(processedSubject)}</title>
      </head>
      <body style="margin: 0; padding: 16px; background-color: #F1F5F9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        <div style="max-width: 620px; margin: 0 auto; background: #ffffff; border: 2px solid #064E3B; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(6, 78, 59, 0.15);">
          <!-- Header Banner -->
          <div style="background: linear-gradient(135deg, #064E3B 0%, #022C22 100%); color: #ffffff; padding: 26px 22px; text-align: center;">
            <img src="https://pragyaninstitute.com/assets/images/logo.png" alt="Pragyan Institute Logo" width="64" height="64" style="width: 64px; height: 64px; border-radius: 50%; object-fit: contain; background: #ffffff; padding: 3px; display: inline-block; margin-bottom: 10px; box-shadow: 0 4px 14px rgba(0,0,0,0.3); border: 2px solid #34D399;">
            <h1 style="margin: 0; font-size: 22px; font-weight: 900; letter-spacing: 0.5px; color: #ffffff; line-height: 1.2;">PRAGYAN INSTITUTE</h1>
            <div style="font-size: 11px; font-weight: 700; color: #6EE7B7; text-transform: uppercase; letter-spacing: 1.5px; margin-top: 3px;">Lalganj, Vaishali • Bihar</div>
            <div style="display: inline-block; margin-top: 12px; background: rgba(52, 211, 153, 0.2); border: 1px solid #34D399; color: #A7F3D0; font-size: 12px; font-weight: 700; padding: 4px 14px; border-radius: 99px;">
              ${badgeText}
            </div>
          </div>

          <!-- Body Content Area -->
          <div style="padding: 24px; background: #FAF9F6;">
            <!-- Student Particulars Card -->
            <div style="background: #ffffff; border: 1.5px solid #E2E8F0; border-radius: 12px; padding: 14px 18px; margin-bottom: 18px; box-shadow: 0 2px 6px rgba(0,0,0,0.02);">
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 13px;">
                <div><span style="color: #64748B; font-weight: 600;">Student Name:</span> <strong style="color: #1E293B;">${escapeHtml(s.name || 'N/A')}</strong></div>
                <div><span style="color: #64748B; font-weight: 600;">Roll Number:</span> <strong style="color: #064E3B; font-family: monospace;">#${escapeHtml(s.rollNo || 'N/A')}</strong></div>
                <div><span style="color: #64748B; font-weight: 600;">Class / Batch:</span> <strong style="color: #1E293B;">${escapeHtml(s.className || 'General')}</strong></div>
                <div><span style="color: #64748B; font-weight: 600;">Billing Period:</span> <strong style="color: #1E293B;">${curMonth}</strong></div>
              </div>
            </div>

            <!-- Subject Title -->
            <h2 style="margin: 0 0 14px; font-size: 18px; color: #111827; font-weight: 900; line-height: 1.3;">${escapeHtml(processedSubject)}</h2>

            <!-- Message Text -->
            <div style="font-size: 14px; color: #334155; line-height: 1.65; background: #ffffff; border: 1.5px solid #E2E8F0; border-radius: 10px; padding: 18px; white-space: pre-wrap; margin-bottom: 18px;">${escapeHtml(processedBody)}</div>

            <!-- Itemized Fee Statement Table (if invoice or reminder) -->
            ${(templateType === 'monthly_invoice' || templateType === 'fee_reminder' || includePaymentLink) ? `
              <div style="background: #ffffff; border: 1.5px solid #CBD5E1; border-radius: 12px; overflow: hidden; margin-bottom: 18px;">
                <div style="background: #F1F5F9; padding: 10px 16px; font-weight: 800; font-size: 13px; color: #1E293B; border-bottom: 1px solid #CBD5E1;">
                  📊 Itemized Fee Statement & Dues Breakdown
                </div>
                <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">
                  <tr style="border-bottom: 1px solid #F1F5F9;">
                    <td style="padding: 10px 16px; color: #475569;">Monthly Tuition Fee (${curMonth})</td>
                    <td style="padding: 10px 16px; text-align: right; font-weight: 700; color: #1E293B;">₹${monthlyFee.toLocaleString('en-IN')}</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #F1F5F9;">
                    <td style="padding: 10px 16px; color: #475569;">Previous Carried Over Dues</td>
                    <td style="padding: 10px 16px; text-align: right; font-weight: 700; color: #B45309;">₹${prevDue.toLocaleString('en-IN')}</td>
                  </tr>
                  <tr style="background: #F8FAFC; font-size: 14px; font-weight: 800;">
                    <td style="padding: 12px 16px; color: #064E3B;">Total Outstanding Net Balance</td>
                    <td style="padding: 12px 16px; text-align: right; color: ${pendingFee > 0 ? '#DC2626' : '#166534'};">₹${pendingFee.toLocaleString('en-IN')}</td>
                  </tr>
                </table>
              </div>
            ` : ''}

            <!-- 1-Click UPI Payment Button -->
            ${(includePaymentLink && pendingFee > 0) ? `
              <div style="text-align: center; margin-bottom: 20px; padding: 18px; background: #ECFDF5; border: 2px dashed #059669; border-radius: 12px;">
                <div style="font-size: 13px; font-weight: 700; color: #065F46; margin-bottom: 10px;">
                  ⚡ Instant 1-Click UPI Payment Gateway
                </div>
                <a href="${payUrl}" target="_blank" style="display: inline-block; background: #064E3B; color: #ffffff; font-size: 15px; font-weight: 800; padding: 12px 28px; border-radius: 8px; text-decoration: none; box-shadow: 0 4px 12px rgba(6, 78, 59, 0.3);">
                  💳 Clear Fee Online (₹${pendingFee.toLocaleString('en-IN')}) →
                </a>
                <div style="font-size: 11px; color: #047857; margin-top: 8px;">
                  Supports Google Pay • PhonePe • Paytm • BHIM UPI • Instant Computerized Receipt
                </div>
              </div>
            ` : ''}

            <!-- Student Portal Hint -->
            <div style="padding: 12px 16px; background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 10px; font-size: 12px; color: #1E40AF; line-height: 1.5;">
              💡 <strong>Digital Student Portal:</strong> Check live batch timings, assignments, and download official fee receipts anytime at <a href="https://pragyaninstitute.com" style="color: #1D4ED8; font-weight: 800; text-decoration: underline;">pragyaninstitute.com</a>.
            </div>
          </div>

          <!-- Footer -->
          <div style="background: #F8FAFC; padding: 16px 22px; text-align: center; font-size: 12px; color: #64748B; border-top: 1px solid #E2E8F0; line-height: 1.6;">
            <strong>PRAGYAN INSTITUTE LALGANJ</strong><br>
            At Moti Market, Near Jagdamba Sthan, Vaishali Bus Stand Road, Lalganj<br>
            Dispatched by: <strong>${escapeHtml(author)}</strong><br>
            📞 Helpline: <strong>+91 73698 91858</strong> • 💬 WhatsApp Support Available
          </div>
        </div>
      </body>
      </html>
    `;
  }

  function openEmailPreviewModal(subject, emailHtml) {
    document.getElementById('emailPreviewModal')?.remove();
    const modalHtml = `
      <div class="inner-modal-backdrop active" id="emailPreviewModal" style="z-index: 10005; padding: 10px;">
        <div class="inner-modal-content" style="max-width: min(720px, 96vw); width: 96vw; max-height: 92vh; display: flex; flex-direction: column; padding: 0; overflow: hidden; border-radius: 14px;">
          <div class="inner-modal-header" style="background: linear-gradient(135deg, #064E3B 0%, #022C22 100%); color: #fff; padding: 1rem 1.25rem; margin: 0;">
            <h3 style="margin: 0; font-size: 1.05rem; color: #fff; display: flex; align-items: center; gap: 0.5rem;">
              <i aria-hidden="true" class="fa-solid fa-envelope-open-text"></i> Live HTML Email Preview
            </h3>
            <button type="button" aria-label="Close email preview dialog" class="btn-close-inner" onclick="document.getElementById('emailPreviewModal').remove()" style="color: #fff;"><i aria-hidden="true" class="fa-solid fa-xmark"></i></button>
          </div>
          <div style="padding: 0.65rem 1rem; background: #F8FAFC; border-bottom: 1px solid #E2E8F0; font-size: 0.82rem; word-break: break-word;">
            <strong>Subject:</strong> <span style="color: #1E293B;">${escapeHtml(subject)}</span>
          </div>
          <div style="flex: 1; overflow-y: auto; overflow-x: auto; -webkit-overflow-scrolling: touch; padding: 0.85rem; background: #E2E8F0;">
            <div style="background: #fff; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); overflow: hidden; max-width: 100%;">
              ${emailHtml}
            </div>
          </div>
          <div style="padding: 0.75rem 1rem; background: #F8FAFC; border-top: 1px solid #E2E8F0; text-align: right;">
            <button type="button" class="btn btn-emerald" onclick="document.getElementById('emailPreviewModal').remove()" style="padding: 0.5rem 1.25rem; font-weight: 700;">
              Close Preview
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    wireModalA11y('emailPreviewModal');
  }

  function renderAdminEmailTab() {
    const pane = document.getElementById('adminTabPane-email');
    if (!pane) return;

    if (!isMainAdmin()) {
      pane.innerHTML = `
        <div class="dash-card" style="text-align: center; padding: 3.5rem 1.5rem;">
          <div style="width: 68px; height: 68px; border-radius: 50%; background: #FEF2F2; color: #DC2626; display: inline-flex; align-items: center; justify-content: center; font-size: 1.85rem; margin-bottom: 1.25rem; border: 2px solid #FECACA;">
            <i aria-hidden="true" class="fa-solid fa-lock"></i>
          </div>
          <h3 style="font-size: 1.35rem; font-weight: 800; color: #1E293B; margin-bottom: 0.5rem;">Access Restricted: Main Administrator Only</h3>
          <p style="font-size: 0.92rem; color: #64748B; max-width: 500px; margin: 0 auto 1.5rem; line-height: 1.6;">
            The Mass Email Dispatch & Official Invoicing Campaign Manager is restricted exclusively to <strong>Chandan Kumar</strong> (Managing Director & Head of Institute).
          </p>
          <button type="button" class="btn btn-emerald" onclick="switchAdminTab('students')" style="padding: 0.65rem 1.5rem; font-weight: 700; border-radius: 8px;">
            <i aria-hidden="true" class="fa-solid fa-arrow-left"></i> Return to Student Directory
          </button>
        </div>
      `;
      return;
    }

    const allStudents = AppState.getStudents();
    const activeStudents = allStudents.filter(s => !s.status || s.status === 'Active' || s.status === 'active');

    // Filter students by audience
    let targetStudents = [];
    let audienceLabel = 'All Batches';

    if (adminEmailAudience === 'all') {
      targetStudents = activeStudents;
      audienceLabel = 'All Enrolled Students';
    } else if (adminEmailAudience === 'defaulters') {
      targetStudents = activeStudents.filter(s => (s.pendingFee || 0) > 0);
      audienceLabel = 'Pending Dues Defaulters Only';
    } else if (adminEmailAudience === 'student') {
      const match = activeStudents.find(s => String(s.id ?? s.student_id ?? '').trim() === String(adminEmailSelectedStudentId).trim() || String(s.rollNo ?? s.roll_no ?? '').trim() === String(adminEmailSelectedStudentId).trim());
      targetStudents = match ? [match] : (activeStudents.length ? [activeStudents[0]] : []);
      if (targetStudents[0]) adminEmailSelectedStudentId = targetStudents[0].id || targetStudents[0].student_id || targetStudents[0].rollNo;
      audienceLabel = targetStudents[0] ? `${targetStudents[0].name} (Roll #${targetStudents[0].rollNo})` : 'Individual Student';
    } else {
      // Any canonical batch id. The four hardcoded branches this replaces
      // ('10th', '9th', '8th', 'junio') stopped matching anything once the
      // resolver started returning canonical ids, so the batch audiences in
      // the dropdown silently selected zero recipients — and eight of the
      // twelve batches had no option at all.
      targetStudents = activeStudents.filter(s =>
        getBatchCategoryKey(s.className || s.class_name || s.batchName || '') === adminEmailAudience
      );
      audienceLabel = batchLabel(adminEmailAudience);
    }

    // Dynamic Computations & Indian Standard Time (IST) Quota Guards
    const ist = getISTDateParts();
    const MAX_DAILY_BROADCAST_LIMIT = 100;

    const totalCount = targetStudents.length;
    const emailRecipients = targetStudents.filter(s => s.email && s.email.includes('@'));
    const validEmailCount = emailRecipients.length;
    const totalPendingDues = targetStudents.reduce((sum, s) => sum + (s.pendingFee || 0), 0);
    const totalPaidFee = targetStudents.reduce((sum, s) => sum + (s.paidFee || 0), 0);
    const totalDefaultersInTarget = targetStudents.filter(s => (s.pendingFee || 0) > 0).length;

    const defaultSubject = getCampaignDefaultSubject(adminEmailCampaignType, audienceLabel);
    const defaultBody = getCampaignDefaultBody(adminEmailCampaignType);

    pane.innerHTML = `
      <div class="dash-card" style="margin-bottom: 1.5rem; background: linear-gradient(135deg, #ffffff 0%, #FAF9F6 100%);">
        <div class="dash-card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
          <div>
            <div class="dash-card-title">
              <i aria-hidden="true" class="fa-solid fa-envelope-open-text" style="color: var(--primary-emerald);"></i> Dedicated Email Dispatch & Campaign Manager
            </div>
            <div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 0.25rem;">
              Send official digital tuition invoices, mid-month fee reminder notices, exam schedules, and circulars directly to parents & students.
            </div>
          </div>
          <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
            <span class="user-badge-tag" style="background: #064E3B; color: #fff; font-weight: 700; font-size: 0.8rem;">
              <i aria-hidden="true" class="fa-solid fa-clock"></i> IST Active: Day ${ist.day} (${ist.monthKey})
            </span>
            <span class="user-badge-tag" style="background: #1E40AF; color: #fff; font-weight: 700; font-size: 0.8rem;">
              <i aria-hidden="true" class="fa-solid fa-bolt"></i> Resend Cloud API
            </span>
          </div>
        </div>

        <!-- 🛡️ IST BROADCASTING SCHEDULE & QUOTA STATUS BANNER 🛡️ -->
        <div style="margin-bottom: 1.25rem; background: #F0FDF4; border: 1.5px solid #86EFAC; border-radius: 10px; padding: 0.85rem 1.15rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.6rem;">
          <div style="font-size: 0.86rem; font-weight: 700; color: #166534; display: flex; align-items: center; gap: 0.5rem;">
            <i aria-hidden="true" class="fa-solid fa-circle-check" style="color: #16A34A; font-size: 1.1rem;"></i>
            <span>Broadcasting Window Active (Day ${ist.day}, IST) • Daily Limit: <strong>Max 100 Emails</strong></span>
          </div>
          <div style="font-size: 0.82rem; font-weight: 800; color: ${validEmailCount > MAX_DAILY_BROADCAST_LIMIT ? '#DC2626' : '#15803D'}; background: ${validEmailCount > MAX_DAILY_BROADCAST_LIMIT ? '#FEE2E2' : '#DCFCE7'}; padding: 0.25rem 0.65rem; border-radius: 6px; border: 1px solid ${validEmailCount > MAX_DAILY_BROADCAST_LIMIT ? '#FCA5A5' : '#86EFAC'};">
            ${validEmailCount > MAX_DAILY_BROADCAST_LIMIT ? `⚠️ Exceeds Limit (${validEmailCount} / 100 max)` : `✅ ${validEmailCount} / 100 max recipients`}
          </div>
        </div>

        <!-- Audience & Live Database Fee Statistics Grid -->
        <div class="admin-email-metrics-grid">
          <div style="background: #F0FDF4; border: 1.5px solid #BBF7D0; border-radius: 10px; padding: 0.85rem 1rem;">
            <div style="font-size: 0.8rem; font-weight: 700; color: #166534; text-transform: uppercase; letter-spacing: 0.5px;">Target Enrolled</div>
            <div style="font-size: 1.35rem; font-weight: 900; color: #064E3B; margin-top: 0.2rem;">${totalCount} <span style="font-size: 0.8rem; font-weight: 600; color: #15803D;">students</span></div>
            <div style="font-size: 0.8rem; color: #166534; margin-top: 0.2rem;">${audienceLabel}</div>
          </div>

          <div style="background: #EFF6FF; border: 1.5px solid #BFDBFE; border-radius: 10px; padding: 0.85rem 1rem;">
            <div style="font-size: 0.8rem; font-weight: 700; color: #1E40AF; text-transform: uppercase; letter-spacing: 0.5px;">Valid Email IDs</div>
            <div style="font-size: 1.35rem; font-weight: 900; color: #1D4ED8; margin-top: 0.2rem;">${validEmailCount} <span style="font-size: 0.8rem; font-weight: 600; color: #2563EB;">/ ${totalCount}</span></div>
            <div style="font-size: 0.8rem; color: #1E40AF; margin-top: 0.2rem;">${totalCount - validEmailCount > 0 ? `⚠️ ${totalCount - validEmailCount} missing email` : '✅ 100% email coverage'}</div>
          </div>

          <div style="background: #FFFBEB; border: 1.5px solid #FDE68A; border-radius: 10px; padding: 0.85rem 1rem;">
            <div style="font-size: 0.8rem; font-weight: 700; color: #92400E; text-transform: uppercase; letter-spacing: 0.5px;">Outstanding Dues</div>
            <div style="font-size: 1.35rem; font-weight: 900; color: #B45309; margin-top: 0.2rem;">₹${totalPendingDues.toLocaleString('en-IN')}</div>
            <div style="font-size: 0.8rem; color: #92400E; margin-top: 0.2rem;">${totalDefaultersInTarget} students with balance</div>
          </div>

          <div style="background: #FDF2F8; border: 1.5px solid #FBCFE8; border-radius: 10px; padding: 0.85rem 1rem;">
            <div style="font-size: 0.8rem; font-weight: 700; color: #9D174D; text-transform: uppercase; letter-spacing: 0.5px;">Fee Collected in Target</div>
            <div style="font-size: 1.35rem; font-weight: 900; color: #BE185D; margin-top: 0.2rem;">₹${totalPaidFee.toLocaleString('en-IN')}</div>
            <div style="font-size: 0.8rem; color: #9D174D; margin-top: 0.2rem;">From enrolled records</div>
          </div>
        </div>

        <!-- Main Campaign Form -->
        <form id="adminEmailCampaignForm">
          <div class="admin-email-form-grid">
            <!-- Target Audience Selector -->
            <div>
              <label for="adminEmailAudienceSelect" style="display: block; font-weight: 700; font-size: 0.85rem; margin-bottom: 0.35rem; color: var(--text-mahogany);">
                <i class="fa-solid fa-users-viewfinder" style="color: var(--primary-emerald);" aria-hidden="true"></i> 1. Select Target Audience *
              </label>
              <select id="adminEmailAudienceSelect" class="portal-input" style="font-weight: 600; width: 100%;">
                ${batchFilterOptions(adminEmailAudience, '🎯 All Enrolled Students (All Batches)')}
                <option value="defaulters" ${adminEmailAudience === 'defaulters' ? 'selected' : ''}>⚠️ Defaulters Only (Students with Pending Fees)</option>
                <option value="student" ${adminEmailAudience === 'student' ? 'selected' : ''}>👤 Specific Individual Student</option>
              </select>
            </div>

            <!-- Campaign Template Preset Selector -->
            <div>
              <label for="adminEmailTemplateSelect" style="display: block; font-weight: 700; font-size: 0.85rem; margin-bottom: 0.35rem; color: var(--text-mahogany);">
                <i class="fa-solid fa-wand-magic-sparkles" style="color: #D97706;" aria-hidden="true"></i> 2. Email Type / Template Preset *
              </label>
              <select id="adminEmailTemplateSelect" class="portal-input" style="font-weight: 600; width: 100%;">
                <option value="monthly_invoice" ${adminEmailCampaignType === 'monthly_invoice' ? 'selected' : ''}>📄 Official Monthly Fee Invoice (with UPI QR)</option>
                <option value="fee_reminder" ${adminEmailCampaignType === 'fee_reminder' ? 'selected' : ''}>⚠️ Outstanding Fee Reminder Alert</option>
                <option value="exam_circular" ${adminEmailCampaignType === 'exam_circular' ? 'selected' : ''}>📝 Academic & Exam Timetable Circular</option>
                <option value="custom_announcement" ${adminEmailCampaignType === 'custom_announcement' ? 'selected' : ''}>📢 Custom Official Circular</option>
              </select>
            </div>
          </div>

          <!-- Individual Student Selector (shown only if audience is student) -->
          ${adminEmailAudience === 'student' ? `
            <div style="background: #F1F5F9; border: 1.5px solid #CBD5E1; border-radius: 10px; padding: 0.85rem 1rem; margin-bottom: 1rem;">
              <label for="adminEmailIndividualStudentSelect" style="display: block; font-weight: 700; font-size: 0.84rem; color: #1E293B; margin-bottom: 0.35rem;">
                <i aria-hidden="true" class="fa-solid fa-user-check" style="color: var(--primary-emerald);"></i> Choose Student Recipient:
              </label>
              <select id="adminEmailIndividualStudentSelect" class="portal-input" style="font-weight: 600; width: 100%;">
                ${activeStudents.map(s => {
                  const sId = s.id || s.student_id || s.rollNo;
                  const isSel = (sId === adminEmailSelectedStudentId || s.rollNo === adminEmailSelectedStudentId);
                  return `<option value="${sId}" ${isSel ? 'selected' : ''}>${s.name} — Roll #${s.rollNo} (${s.className || 'General'}) • Pending: ₹${s.pendingFee || 0} • ${s.email || 'No email'}</option>`;
                }).join('')}
              </select>
            </div>
          ` : ''}

          <!-- Subject Line -->
          <div style="margin-bottom: 1rem;">
            <label for="adminEmailSubjectInput" style="display: block; font-weight: 700; font-size: 0.85rem; margin-bottom: 0.35rem; color: var(--text-mahogany);">
              Email Subject Line *
            </label>
            <input type="text" id="adminEmailSubjectInput" class="portal-input" value="${defaultSubject.replace(/"/g, '&quot;')}" required style="font-weight: 600; width: 100%;">
          </div>

          <!-- Message Body with Smart Placeholders Hint -->
          <div style="margin-bottom: 1rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 0.35rem;">
              <label for="adminEmailBodyInput" style="font-weight: 700; font-size: 0.85rem; color: var(--text-mahogany);">Email Body / Message Text *</label>
              <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600;">
                Tags: <code>{student_name}</code>, <code>{roll_no}</code>, <code>{monthly_fee}</code>, <code>{pending_fee}</code>
              </span>
            </div>
            <textarea id="adminEmailBodyInput" class="portal-input admin-email-textarea" rows="12" required style="resize: vertical; width: 100%; min-height: 280px; font-family: inherit; font-size: 0.95rem; line-height: 1.6; box-sizing: border-box; padding: 0.85rem;">${defaultBody.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
          </div>

          <!-- Options & Toggles -->
          <div class="admin-email-toggles-grid">
            <label for="adminEmailIncludePaymentLink" style="display: flex; align-items: center; gap: 0.6rem; font-size: 0.84rem; font-weight: 700; color: #065F46; background: #ECFDF5; border: 1px solid #A7F3D0; padding: 0.65rem 0.85rem; border-radius: 8px; cursor: pointer; user-select: none;">
              <input type="checkbox" id="adminEmailIncludePaymentLink" ${(adminEmailCampaignType === 'monthly_invoice' || adminEmailCampaignType === 'fee_reminder') ? 'checked' : ''} style="width: 17px; height: 17px; accent-color: var(--primary-emerald); cursor: pointer; flex-shrink: 0;">
              <span><i aria-hidden="true" class="fa-solid fa-qrcode"></i> Include 1-Click Online Payment Link & UPI Details</span>
            </label>

            <label for="adminEmailIncludeSeal" style="display: flex; align-items: center; gap: 0.6rem; font-size: 0.84rem; font-weight: 700; color: #1E40AF; background: #EFF6FF; border: 1px solid #BFDBFE; padding: 0.65rem 0.85rem; border-radius: 8px; cursor: pointer; user-select: none;">
              <input type="checkbox" id="adminEmailIncludeSeal" checked style="width: 17px; height: 17px; accent-color: #2563EB; cursor: pointer; flex-shrink: 0;">
              <span><i aria-hidden="true" class="fa-solid fa-stamp"></i> Include Official Pragyan Crest Seal & Signatures</span>
            </label>
          </div>

          <!-- Live Dispatch Console Output (hidden until dispatch) -->
          <div id="adminEmailDispatchLog" style="display: none; margin-bottom: 1.25rem; background: #0F172A; color: #E2E8F0; border-radius: 10px; padding: 1rem 1.25rem; font-family: 'JetBrains Mono', monospace; font-size: 0.82rem; max-height: 220px; overflow-y: auto;">
          </div>

          <!-- Action Buttons Bar -->
          <div class="admin-email-actions-bar">
            <div class="admin-email-sub-actions" style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
              <button type="button" id="btnPreviewEmailCampaign" class="btn" style="background: #F1F5F9; color: #334155; border: 1.5px solid #CBD5E1; font-weight: 700; padding: 0.65rem 1.15rem; border-radius: 8px; cursor: pointer;">
                <i aria-hidden="true" class="fa-solid fa-eye"></i> Preview HTML Email
              </button>
              <button type="button" id="btnTestEmailCampaign" class="btn" style="background: #EFF6FF; color: #1D4ED8; border: 1.5px solid #93C5FD; font-weight: 700; padding: 0.65rem 1.15rem; border-radius: 8px; cursor: pointer;">
                <i aria-hidden="true" class="fa-solid fa-paper-plane"></i> Send Test to Me
              </button>
            </div>

            ${validEmailCount > MAX_DAILY_BROADCAST_LIMIT ? `
              <button type="submit" id="btnDispatchEmailCampaign" class="btn btn-emerald" style="padding: 0.75rem 1.85rem; font-size: 0.92rem; font-weight: 800; border-radius: 8px;">
                <i aria-hidden="true" class="fa-solid fa-rocket"></i> Dispatch Capped (${MAX_DAILY_BROADCAST_LIMIT} of ${validEmailCount} Recipients)
              </button>
            ` : `
              <button type="submit" id="btnDispatchEmailCampaign" class="btn btn-emerald" style="padding: 0.75rem 1.85rem; font-size: 0.92rem; font-weight: 800; border-radius: 8px;">
                <i aria-hidden="true" class="fa-solid fa-rocket"></i> Dispatch Campaign (${validEmailCount} Recipients)
              </button>
            `}
          </div>
        </form>
      </div>
    `;

    // Bind Event Listeners
    // Audience Selector Change
    pane.querySelector('#adminEmailAudienceSelect')?.addEventListener('change', (e) => {
      adminEmailAudience = e.target.value;
      renderAdminEmailTab();
    });

    // Campaign Template Change
    pane.querySelector('#adminEmailTemplateSelect')?.addEventListener('change', (e) => {
      adminEmailCampaignType = e.target.value;
      renderAdminEmailTab();
    });

    // Individual Student Select Change
    pane.querySelector('#adminEmailIndividualStudentSelect')?.addEventListener('change', (e) => {
      adminEmailSelectedStudentId = e.target.value;
      renderAdminEmailTab();
    });

    // Preview Email Button
    pane.querySelector('#btnPreviewEmailCampaign')?.addEventListener('click', () => {
      const subject = pane.querySelector('#adminEmailSubjectInput')?.value || defaultSubject;
      const rawBody = pane.querySelector('#adminEmailBodyInput')?.value || defaultBody;
      const inclPay = pane.querySelector('#adminEmailIncludePaymentLink')?.checked;
      const inclSeal = pane.querySelector('#adminEmailIncludeSeal')?.checked;

      const sampleStudent = targetStudents[0] || {
        name: 'Rohan Sharma',
        rollNo: '2026-1001',
        className: 'Class 10th (ACHIEVER)',
        monthlyFee: 1000,
        pendingFee: 1000,
        paidFee: 0,
        email: 'rohan.sharma@example.com'
      };

      const emailHtml = generateCampaignEmailHtml(sampleStudent, adminEmailCampaignType, subject, rawBody, inclPay, inclSeal);
      openEmailPreviewModal(subject, emailHtml);
    });

    // Send Test Email Button
    pane.querySelector('#btnTestEmailCampaign')?.addEventListener('click', async () => {
      const currentAdmin = AppState.currentUser || AppState.getAdmin();
      const adminEmail = currentAdmin.email || 'director@pragyaninstitute.com';
      const promptEmail = prompt('Enter recipient email address for test preview:', adminEmail);
      if (!promptEmail || !promptEmail.includes('@')) return;

      const subject = `[TEST PREVIEW] ` + (pane.querySelector('#adminEmailSubjectInput')?.value || defaultSubject);
      const rawBody = pane.querySelector('#adminEmailBodyInput')?.value || defaultBody;
      const inclPay = pane.querySelector('#adminEmailIncludePaymentLink')?.checked;
      const inclSeal = pane.querySelector('#adminEmailIncludeSeal')?.checked;

      const sampleStudent = targetStudents[0] || {
        name: 'Sample Student',
        rollNo: '2026-SAMPLE',
        className: audienceLabel,
        monthlyFee: 1000,
        pendingFee: 1000,
        paidFee: 0,
        email: promptEmail
      };

      const emailHtml = generateCampaignEmailHtml(sampleStudent, adminEmailCampaignType, subject, rawBody, inclPay, inclSeal);
      const btn = pane.querySelector('#btnTestEmailCampaign');
      if (btn) { btn.disabled = true; btn.textContent = 'Sending Test...'; }

      try {
        showNotification(`🚀 Dispatched test email to ${promptEmail}... Connecting to Resend.`, 'success');
        const res = await sendLiveResendEmail(promptEmail, subject, emailHtml, {
          category: adminEmailCampaignType,
          reference: `TEST-${adminEmailCampaignType}`
        });
        if (res.success) {
          showNotification(`✅ Test email successfully dispatched to ${promptEmail} via Resend!`, 'success');
        } else {
          showNotification(`Email failed: ${res.error || 'Unknown delivery error'}`, 'error');
        }
      } catch (err) {
        showNotification(`❌ Failed: ` + err.message, 'error');
      } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i aria-hidden="true" class="fa-solid fa-paper-plane"></i> Send Test to Me'; }
      }
    });

    // Dispatch Campaign Form Submit
    pane.querySelector('#adminEmailCampaignForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();

      const currentIst = getISTDateParts();

      if (validEmailCount === 0) {
        alert('⚠️ No valid email addresses found in the selected audience.');
        return;
      }

      const targetDispatchRecipients = emailRecipients.slice(0, MAX_DAILY_BROADCAST_LIMIT);
      const isCapped = emailRecipients.length > MAX_DAILY_BROADCAST_LIMIT;

      const subject = pane.querySelector('#adminEmailSubjectInput')?.value.trim() || defaultSubject;
      const rawBody = pane.querySelector('#adminEmailBodyInput')?.value.trim() || defaultBody;
      const inclPay = pane.querySelector('#adminEmailIncludePaymentLink')?.checked;
      const inclSeal = pane.querySelector('#adminEmailIncludeSeal')?.checked;

      const confirmMsg = isCapped
        ? `🚀 Dispatch Email Campaign?\n\n• Target Audience: ${audienceLabel}\n• Total Eligible: ${validEmailCount} students\n• Dispatching: Capped to FIRST ${MAX_DAILY_BROADCAST_LIMIT} recipients (Daily IST Quota Cap)\n• Subject: ${subject}\n\nProceed with live dispatch?`
        : `🚀 Dispatch Email Campaign?\n\n• Target Audience: ${audienceLabel}\n• Recipients with Email: ${validEmailCount} students\n• Subject: ${subject}\n\nProceed with live dispatch?`;

      if (!confirm(confirmMsg)) {
        return;
      }

      const submitBtn = pane.querySelector('#btnDispatchEmailCampaign');
      const logBox = pane.querySelector('#adminEmailDispatchLog');
      if (logBox) {
        logBox.style.display = 'block';
        logBox.innerHTML = `<div>[${new Date().toLocaleTimeString('en-IN')}] Initializing campaign dispatch for ${targetDispatchRecipients.length} recipients (Day ${currentIst.day} IST)...</div>`;
      }
      if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<i aria-hidden="true" class="fa-solid fa-spinner fa-spin"></i> Dispatching Emails...'; }

      let sentCount = 0;
      let failCount = 0;
      const author = getActiveTeacherName();

      try {
        // Send individually with personalized tags (capped to max 100)
        for (let i = 0; i < targetDispatchRecipients.length; i++) {
          const student = targetDispatchRecipients[i];
          const personalizedHtml = generateCampaignEmailHtml(student, adminEmailCampaignType, subject, rawBody, inclPay, inclSeal);
          const studentSub = replaceEmailPlaceholders(subject, student);

          try {
            const res = await sendLiveResendEmail(student.email, studentSub, personalizedHtml, {
              student_id: student.student_id || student.id || student.rollNo,
              category: adminEmailCampaignType,
              reference: `CAMPAIGN-${adminEmailCampaignType}-${student.student_id || student.rollNo || (i + 1)}`
            });
            if (res.success) {
              sentCount++;
              if (logBox) {
                logBox.innerHTML += `<div style="color: #4ADE80;">✓ Delivered to ${student.name} (${student.email})</div>`;
                logBox.scrollTop = logBox.scrollHeight;
              }
            } else {
              failCount++;
              if (logBox) {
                logBox.innerHTML += `<div style="color: #F87171;">✗ Failed: ${student.name} (${student.email}) - ${res.error || 'Unknown error'}</div>`;
                logBox.scrollTop = logBox.scrollHeight;
              }
            }
          } catch (itemErr) {
            failCount++;
            if (logBox) {
              logBox.innerHTML += `<div style="color: #F87171;">✗ Error sending to ${student.name}: ${itemErr.message}</div>`;
              logBox.scrollTop = logBox.scrollHeight;
            }
          }
        }

        // Add audit log
        await AppState.addAuditLog(author, 'EMAIL_CAMPAIGN_DISPATCH', audienceLabel, `Dispatched: ${sentCount}`, `Dispatched "${subject}" to ${sentCount} students (${failCount} failed). Daily cap: 100 max.`, {
          campaignType: adminEmailCampaignType,
          audience: adminEmailAudience,
          sentCount,
          failCount,
          totalPendingInTarget: totalPendingDues,
          istDay: currentIst.day
        });

        if (logBox) {
          logBox.innerHTML += `<div style="color: #67E8F9; font-weight: 700; margin-top: 0.5rem;">🎉 Campaign Complete! Total Delivered: ${sentCount} | Failed: ${failCount}</div>`;
        }

        alert(`🎉 Campaign Complete!\n\n• Successfully Sent: ${sentCount}\n• Failed/Skipped: ${failCount}\n• Daily Quota (IST): Capped at max ${MAX_DAILY_BROADCAST_LIMIT}`);
      } catch (overallErr) {
        console.error('Campaign error:', overallErr);
        alert('❌ Error during campaign dispatch: ' + overallErr.message);
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = `<i aria-hidden="true" class="fa-solid fa-rocket"></i> Dispatch Campaign (${validEmailCount} Recipients)`;
        }
      }
    });
  }

  function openAddStudentModal() {
    const modalHtml = `
      <div class="inner-modal-backdrop active" id="addStudentModal">
        <div class="inner-modal-content" style="max-width: 680px;">
          <div class="inner-modal-header">
            <h3><i aria-hidden="true" class="fa-solid fa-user-plus" style="color: var(--primary-emerald);"></i> Register New Student</h3>
            <button type="button" aria-label="Close add student dialog" class="btn-close-inner" onclick="document.getElementById('addStudentModal').remove()"><i aria-hidden="true" class="fa-solid fa-xmark"></i></button>
          </div>
          <form id="newStudentForm">
            <!-- Server Authoritative Student ID Banner -->
            <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 8px; padding: 0.65rem 0.9rem; margin-bottom: 1rem; display: flex; align-items: center; justify-content: space-between;">
              <div>
                <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700;">Authoritative Sequence Format (YYCCSS)</div>
                <div style="font-size: 1.05rem; font-weight: 800; color: #10B981; margin-top: 2px;">
                  <i aria-hidden="true" class="fa-solid fa-id-card"></i> Student ID: <span id="newStuIdBadgeDisplay">Calculating...</span>
                </div>
              </div>
              <span style="background: rgba(16, 185, 129, 0.2); color: #10B981; font-size: 0.8rem; font-weight: 700; padding: 3px 8px; border-radius: 99px;">Server Sequence</span>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.9rem; margin-bottom: 1rem;">
              <div>
                <label for="newStuName" style="font-size: 0.85rem; font-weight: 600;">Student Full Name *</label>
                <input type="text" id="newStuName" class="portal-input" required placeholder="e.g. Amit Kumar">
              </div>
              <div>
                <label for="newStuMobile" style="font-size: 0.85rem; font-weight: 600;">Mobile Number *</label>
                <input type="tel" id="newStuMobile" class="portal-input" required maxlength="10" pattern="[0-9]{10}" inputmode="numeric" placeholder="10-digit mobile number">
              </div>
              <div>
                <label for="newStuDob" style="font-size: 0.85rem; font-weight: 600;">Date of Birth (DOB) *</label>
                <input type="date" id="newStuDob" class="portal-input" required>
              </div>
              <div>
                <label for="newStuClass" style="font-size: 0.85rem; font-weight: 600;">Class / Batch Assignment *</label>
                <select id="newStuClass" class="portal-input">
                  ${batchAssignmentOptions('')}
                </select>
              </div>
              <div>
                <label for="newStuMonthlyFee" style="font-size: 0.85rem; font-weight: 600;">Monthly Fee Rate (₹/Month) *</label>
                <input type="number" id="newStuMonthlyFee" class="portal-input" value="1000" min="0" required placeholder="e.g. 1000">
                <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.2rem;">Added automatically on 1st–4th of each month.</div>
              </div>
              <div>
                <label for="newStuPrevDue" style="font-size: 0.85rem; font-weight: 600;">Old / Past Pending Fees (₹) <span style="font-weight:400; color:var(--text-muted);">(0 for new admissions)</span></label>
                <input type="number" id="newStuPrevDue" class="portal-input" value="0" min="0" placeholder="0 if starting fresh, or enter past dues">
                <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.2rem;">Initial balance due. Default is ₹0 for fresh admissions.</div>
              </div>
              <div>
                <label for="newStuEmail" style="font-size: 0.85rem; font-weight: 600;">Email Address <span style="font-weight:400; color:var(--text-muted);">(Optional)</span></label>
                <input type="email" id="newStuEmail" class="portal-input" placeholder="student@gmail.com">
              </div>
              <div>
                <label for="newStuBloodGroup" style="font-size: 0.85rem; font-weight: 600;">Blood Group <span style="font-weight:400; color:var(--text-muted);">(Optional)</span></label>
                <select id="newStuBloodGroup" class="portal-input">
                  <option value="Not Specified">Not Specified</option>
                  <option value="A+">A+</option>
                  <option value="A-">A-</option>
                  <option value="B+">B+</option>
                  <option value="B-">B-</option>
                  <option value="O+">O+</option>
                  <option value="O-">O-</option>
                  <option value="AB+">AB+</option>
                  <option value="AB-">AB-</option>
                </select>
              </div>
              <div>
                <label for="newStuGuardian" style="font-size: 0.85rem; font-weight: 600;">Father / Guardian Name</label>
                <input type="text" id="newStuGuardian" class="portal-input" placeholder="Guardian Name">
              </div>
              <div>
                <label for="newStuGuardianMobile" style="font-size: 0.85rem; font-weight: 600;">Guardian Mobile <span style="font-weight:400; color:var(--text-muted);">(Optional)</span></label>
                <input type="tel" id="newStuGuardianMobile" class="portal-input" maxlength="10" pattern="[0-9]{10}" inputmode="numeric" placeholder="10-digit guardian mobile">
              </div>
              <div style="grid-column: span 2;">
                <label for="newStuAddress" style="font-size: 0.85rem; font-weight: 600;">Residential Address <span style="font-weight:400; color:var(--text-muted);">(Optional)</span></label>
                <input type="text" id="newStuAddress" class="portal-input" placeholder="e.g. Main Road, Near Bus Stand, Lalganj, Vaishali">
              </div>
            </div>
            <button type="submit" class="btn btn-emerald" style="width: 100%; padding: 0.8rem;">
              <i aria-hidden="true" class="fa-solid fa-check"></i> Complete Student Registration
            </button>
          </form>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    wireModalA11y('addStudentModal', { closeOnBackdrop: false });

    // Real-time 10-digit mobile masking
    const newMobInput = document.getElementById('newStuMobile');
    const newGrdMobInput = document.getElementById('newStuGuardianMobile');
    newMobInput?.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
    });
    newGrdMobInput?.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
    });

    // Dynamic Server Sequence ID updater
    const classSelect = document.getElementById('newStuClass');
    const updateIdPreview = async () => {
      const displayEl = document.getElementById('newStuIdBadgeDisplay');
      if (displayEl) displayEl.textContent = 'Calculating...';
      try {
        const nextId = await AppState.fetchNextStudentId(classSelect.value);
        if (displayEl) displayEl.textContent = nextId;
      } catch (err) {
        if (displayEl) displayEl.textContent = AppState.generateStudentId(classSelect.value);
      }
    };

    updateIdPreview();

    // Auto update monthly fee input and Student ID when batch selection changes
    // Auto update monthly fee input and Student ID when batch selection changes
    const syncMonthlyFeeToBatch = () => {
      const selectedOpt = classSelect.options[classSelect.selectedIndex];
      // Falls back to the canonical rate for the selected batch, not a flat
      // ₹1,000 — that default under-charged the four ₹1,500 senior batches by
      // a third on every new admission.
      const monthly = selectedOpt?.dataset.monthly || classMonthlyFee(classSelect.value) || '';
      const feeInput = document.getElementById('newStuMonthlyFee');
      if (feeInput && monthly) feeInput.value = monthly;
    };

    // Run once on open: the fee field ships with a static default, which no
    // longer matches whichever batch the select happens to show first.
    syncMonthlyFeeToBatch();

    classSelect.addEventListener('change', () => {
      syncMonthlyFeeToBatch();
      updateIdPreview();
    });

    document.getElementById('newStudentForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const rawMobile = document.getElementById('newStuMobile').value.trim();
      const rawGuardianMobile = document.getElementById('newStuGuardianMobile').value.trim();
      const mobile = sanitizeMobileNumber(rawMobile);
      const guardianMobile = rawGuardianMobile ? sanitizeMobileNumber(rawGuardianMobile) : mobile;

      if (!isValid10DigitMobile(mobile)) {
        alert('Invalid Mobile Number: Student mobile number must be exactly 10 digits without letters or special characters (e.g. 9876543210).');
        document.getElementById('newStuMobile').focus();
        return;
      }

      if (rawGuardianMobile && !isValid10DigitMobile(guardianMobile)) {
        alert('Invalid Guardian Mobile: Guardian mobile must be exactly 10 digits without letters or special characters (e.g. 9876543210).');
        document.getElementById('newStuGuardianMobile').focus();
        return;
      }

      const name = document.getElementById('newStuName').value.trim();
      const dob = document.getElementById('newStuDob').value;
      const className = document.getElementById('newStuClass').value;
      const email = document.getElementById('newStuEmail').value.trim();
      const bloodGroup = document.getElementById('newStuBloodGroup').value;
      const guardianName = document.getElementById('newStuGuardian').value.trim() || 'Guardian';
      const monthlyInstallment = parseFloat(document.getElementById('newStuMonthlyFee').value) || 1000;
      const prevDue = parseFloat(document.getElementById('newStuPrevDue').value) || 0;
      const address = document.getElementById('newStuAddress').value.trim() || 'Lalganj, Vaishali, Bihar';

      const initialHistory = [];
      if (prevDue > 0) {
        initialHistory.push({
          receiptNo: `CARRYOVER-${Date.now().toString(36).slice(-5)}`,
          date: new Date().toISOString().split('T')[0],
          amount: prevDue,
          mode: 'Previous Balance Carryover (Old Fees)',
          status: 'Pending Due'
        });
      }

      const students = AppState.getStudents();
      const generatedId = await AppState.fetchNextStudentId(className);
      const stuUuid = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : (`stu_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);

      const newStudent = {
        id: stuUuid,
        db_uuid: stuUuid,
        student_id: generatedId,
        name,
        mobile,
        dob,
        rollNo: generatedId,
        roll_no: generatedId,
        className,
        batchName: className,
        guardianName,
        guardianMobile,
        email,
        address,
        bloodGroup,
        admissionDate: new Date().toISOString().split('T')[0],
        totalFee: prevDue,
        total_fee: prevDue,
        paidFee: 0,
        paid_fee: 0,
        pendingFee: prevDue,
        pending_fee: prevDue,
        monthlyFee: monthlyInstallment,
        monthly_fee: monthlyInstallment,
        feeHistory: initialHistory
      };

      AppState.markStudentDirty(stuUuid);
      AppState.markStudentDirty(generatedId);
      students.unshift(newStudent);
      await AppState.saveStudents(students, [stuUuid, generatedId]);
      document.getElementById('addStudentModal')?.remove();
      const oldFeeNote = prevDue > 0 ? ` (Initial Pending Balance: ₹${prevDue.toLocaleString()} old fee carryover)` : ' (Initial Pending Balance: ₹0)';
      alert(`Student ${name} registered successfully with ID: ${generatedId} (${className})!${oldFeeNote}. Monthly fee ₹${monthlyInstallment.toLocaleString()}/Mo. will be added on batch billing cycle.`);
      renderAdminDashboard();
    });
  }

  /* ==========================================================================
   * STUDENT DETAIL UPDATE REQUEST MODAL & WORKFLOW
   * ========================================================================== */
  function openRequestStudentUpdateModal() {
    const s = AppState.currentUser;
    if (!s) return;

    // Clean up existing modal if open
    document.getElementById('requestUpdateModal')?.remove();

    const requests = AppState.getRequests();
    const existingPending = requests.find(r => isStudentRequestMatch(r, s) && String(r.status || '').toLowerCase() === 'pending');
    const currentValues = (existingPending && existingPending.newData) ? existingPending.newData : s;
    const safeValue = (value) => sanitizeInput(String(value ?? ''));
    const safeImageUrl = sanitizeUrl;

    const modalHtml = `
      <div class="inner-modal-backdrop active" id="requestUpdateModal">
        <div class="inner-modal-content" style="max-width: 650px;">
          <div class="inner-modal-header">
            <h3><i aria-hidden="true" class="fa-solid fa-user-pen" style="color: var(--primary-emerald);"></i> Request Profile Detail Update</h3>
            <button type="button" aria-label="Close profile update request dialog" class="btn-close-inner" id="btnCloseReqModal"><i aria-hidden="true" class="fa-solid fa-xmark"></i></button>
          </div>
          
          ${existingPending ? `
            <div style="background: #FEF3C7; border: 1px solid #F59E0B; color: #92400E; padding: 0.65rem 0.9rem; border-radius: 8px; font-size: 0.84rem; margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
              <div><i aria-hidden="true" class="fa-solid fa-clock-rotate-left"></i> <strong>Pending Request Active:</strong> Submitting will update your pending request for Admin review.</div>
              <button type="button" id="btnCancelThisReq" style="background: #DC2626; color: #fff; border: none; padding: 0.25rem 0.6rem; border-radius: 4px; font-size: 0.8rem; font-weight: 700; cursor: pointer;">
                Cancel Request
              </button>
            </div>
          ` : `
            <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem;">
              Edit any details below. Your request will be sent to the Admin for verification and will update automatically once approved.
            </p>
          `}

          <form id="reqUpdateForm">
            <div class="portal-form-grid-2col" style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.9rem; margin-bottom: 1rem;">
              <div>
                <label for="reqStuName" style="font-size: 0.85rem; font-weight: 600;">Student Full Name *</label>
                <input type="text" id="reqStuName" class="portal-input" value="${safeValue(currentValues.name || s.name)}" required>
              </div>
              <div>
                <label for="reqStuMobile" style="font-size: 0.85rem; font-weight: 600;">Mobile Number *</label>
                <input type="tel" id="reqStuMobile" class="portal-input" value="${safeValue(currentValues.mobile || s.mobile)}" required>
              </div>
              <div>
                <label for="reqStuDob" style="font-size: 0.85rem; font-weight: 600;">Date of Birth (DOB) *</label>
                <input type="date" id="reqStuDob" class="portal-input" value="${safeValue(currentValues.dob || s.dob)}" required>
              </div>
              <div>
                <label for="reqStuEmail" style="font-size: 0.85rem; font-weight: 600;">Email Address (Optional)</label>
                <input type="email" id="reqStuEmail" class="portal-input" value="${safeValue(currentValues.email || s.email)}">
              </div>
              <div>
                <label for="reqStuGuardian" style="font-size: 0.85rem; font-weight: 600;">Father / Guardian Name</label>
                <input type="text" id="reqStuGuardian" class="portal-input" value="${safeValue(currentValues.guardianName || s.guardianName)}">
              </div>
              <div>
                <label for="reqStuGuardianMobile" style="font-size: 0.85rem; font-weight: 600;">Guardian Mobile</label>
                <input type="tel" id="reqStuGuardianMobile" class="portal-input" value="${safeValue(currentValues.guardianMobile || s.guardianMobile || s.mobile)}">
              </div>
              <div>
                <label for="reqStuBloodGroup" style="font-size: 0.85rem; font-weight: 600;">Blood Group</label>
                <select id="reqStuBloodGroup" class="portal-input">
                  <option value="Not Specified" ${(currentValues.bloodGroup || s.bloodGroup) === 'Not Specified' ? 'selected' : ''}>Not Specified</option>
                  <option value="A+" ${(currentValues.bloodGroup || s.bloodGroup) === 'A+' ? 'selected' : ''}>A+</option>
                  <option value="A-" ${(currentValues.bloodGroup || s.bloodGroup) === 'A-' ? 'selected' : ''}>A-</option>
                  <option value="B+" ${(currentValues.bloodGroup || s.bloodGroup) === 'B+' ? 'selected' : ''}>B+</option>
                  <option value="B-" ${(currentValues.bloodGroup || s.bloodGroup) === 'B-' ? 'selected' : ''}>B-</option>
                  <option value="O+" ${(currentValues.bloodGroup || s.bloodGroup) === 'O+' ? 'selected' : ''}>O+</option>
                  <option value="O-" ${(currentValues.bloodGroup || s.bloodGroup) === 'O-' ? 'selected' : ''}>O-</option>
                  <option value="AB+" ${(currentValues.bloodGroup || s.bloodGroup) === 'AB+' ? 'selected' : ''}>AB+</option>
                  <option value="AB-" ${(currentValues.bloodGroup || s.bloodGroup) === 'AB-' ? 'selected' : ''}>AB-</option>
                </select>
              </div>
              <div>
                <label for="reqStuClassDisplay" style="font-size: 0.85rem; font-weight: 600;">Class / Batch (Read Only)</label>
                <input type="text" id="reqStuClassDisplay" class="portal-input" value="${safeValue(s.className)}" disabled style="background:#f3f4f6;">
              </div>
              <div style="grid-column: span 2;">
                <label for="reqStuPhotoInput" style="font-size: 0.85rem; font-weight: 600;"><i aria-hidden="true" class="fa-solid fa-camera" style="color: var(--primary-emerald);"></i> Upload New Profile Photo (PF)</label>
                <input type="file" id="reqStuPhotoInput" accept="image/*" class="portal-input" style="padding: 0.4rem;">
                <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.2rem;">Choose a profile picture to submit for verification & approval.</div>
                <div id="reqPhotoPreviewContainer" style="margin-top: 0.4rem; display: ${currentValues.photoUrl ? 'block' : 'none'};">
                  <img id="reqPhotoPreviewImg" src="${safeImageUrl(currentValues.photoUrl)}" style="width: 55px; height: 55px; border-radius: 8px; object-fit: cover; border: 2px solid var(--primary-emerald);">
                </div>
              </div>
              <div style="grid-column: span 2;">
                <label for="reqStuAddress" style="font-size: 0.85rem; font-weight: 600;">Residential Address</label>
                <input type="text" id="reqStuAddress" class="portal-input" value="${safeValue(currentValues.address || s.address)}">
              </div>
            </div>
            <button type="submit" id="btnSubmitProfileReq" class="btn btn-emerald" style="width: 100%; padding: 0.8rem;">
              <i aria-hidden="true" class="fa-solid fa-paper-plane"></i> ${existingPending ? 'Update Pending Request' : 'Submit Update Request to Admin'}
            </button>
          </form>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modalEl = document.getElementById('requestUpdateModal');
    wireModalA11y(modalEl, { closeOnBackdrop: false });
    const photoInput = modalEl?.querySelector('#reqStuPhotoInput');
    const previewContainer = modalEl?.querySelector('#reqPhotoPreviewContainer');
    const previewImg = modalEl?.querySelector('#reqPhotoPreviewImg');

    modalEl?.querySelector('#btnCloseReqModal')?.addEventListener('click', () => {
      modalEl.remove();
    });

    modalEl?.querySelector('#btnCancelThisReq')?.addEventListener('click', async () => {
      if (confirm('Cancel your pending profile update request?')) {
        const currentRequest = AppState.getRequests().find(r => isStudentRequestMatch(r, s) && String(r.status || '').toLowerCase() === 'pending');
        if (currentRequest) {
          const newPhoto = currentRequest.newData?.photoUrl || currentRequest.newData?.photo;
          const oldPhoto = currentRequest.oldData?.photoUrl || currentRequest.oldData?.photo;
          if (currentRequest.id && typeof SupabaseSync !== 'undefined') {
            const result = await SupabaseSync.mutate('student_requests', 'delete', null, { where: { request_id: currentRequest.id } });
            if (!result || result.success !== true) {
              alert(result?.error || 'Unable to cancel the request. Please try again.');
              return;
            }
          }
          // Only now. The upload delete is irreversible, and doing it first left a
          // still-pending request whose photo the admin could no longer open.
          if (newPhoto && newPhoto !== oldPhoto && typeof SupabaseSync !== 'undefined' && SupabaseSync.deleteFile) {
            try { await SupabaseSync.deleteFile(newPhoto); } catch(e) { console.warn('Cancelled-upload cleanup note:', e.message); }
          }
        }
        const allReqs = AppState.getRequests().filter(r => !(isStudentRequestMatch(r, s) && String(r.status || '').toLowerCase() === 'pending'));
        await AppState.saveRequests(allReqs);
        modalEl.remove();
        renderStudentDashboard();
        alert('Pending request cancelled.');
      }
    });

    let selectedPhotoDataUrl = (currentValues.photoUrl || s.photoUrl || s.photo_url || s.photo || '');

    photoInput?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) {
        alert('Photo file is too large. Please select an image under 10MB.');
        photoInput.value = '';
        return;
      }
      try {
        const compressed = (typeof SupabaseSync !== 'undefined' && SupabaseSync.compressMobileImage)
          ? await SupabaseSync.compressMobileImage(file, 600, 0.82)
          : file;
        const reader = new FileReader();
        reader.onload = function(evt) {
          selectedPhotoDataUrl = evt.target.result;
          if (previewImg) previewImg.src = selectedPhotoDataUrl;
          if (previewContainer) previewContainer.style.display = 'block';
        };
        reader.readAsDataURL(compressed);
      } catch (err) {
        const reader = new FileReader();
        reader.onload = function(evt) {
          selectedPhotoDataUrl = evt.target.result;
          if (previewImg) previewImg.src = selectedPhotoDataUrl;
          if (previewContainer) previewContainer.style.display = 'block';
        };
        reader.readAsDataURL(file);
      }
    });

    modalEl.querySelector('#reqUpdateForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = modalEl.querySelector('#btnSubmitProfileReq');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i aria-hidden="true" class="fa-solid fa-spinner fa-spin"></i> Submitting Request...';
      }

      try {
        const updatedObj = {
          name: modalEl.querySelector('#reqStuName').value.trim(),
          mobile: modalEl.querySelector('#reqStuMobile').value.trim(),
          dob: modalEl.querySelector('#reqStuDob').value,
          email: modalEl.querySelector('#reqStuEmail').value.trim(),
          guardianName: modalEl.querySelector('#reqStuGuardian').value.trim(),
          guardianMobile: modalEl.querySelector('#reqStuGuardianMobile').value.trim(),
          bloodGroup: modalEl.querySelector('#reqStuBloodGroup').value,
          address: modalEl.querySelector('#reqStuAddress').value.trim()
        };

        const existingOldPhoto = s.photoUrl || s.photo_url || s.photo || '';
        const photoFile = photoInput?.files[0];

        let finalPhoto = selectedPhotoDataUrl || previewImg?.src || '';
        if (photoFile) {
          try {
            const uploadedUrl = await SupabaseSync.uploadFile(photoFile, 'profile_pictures');
            if (uploadedUrl) {
              finalPhoto = uploadedUrl;
            }
          } catch(uploadErr) {
            console.warn('Photo upload failed:', uploadErr.message);
          }
        }
        if (!finalPhoto || (!finalPhoto.startsWith('data:image/') && !finalPhoto.startsWith('http'))) {
          finalPhoto = currentValues.photoUrl || currentValues.photo_url || currentValues.photo || existingOldPhoto;
        }

        updatedObj.photoUrl = finalPhoto;
        updatedObj.photo_url = finalPhoto;
        updatedObj.photo = finalPhoto;

        const allReqs = AppState.getRequests();
        const pendingIdx = allReqs.findIndex(r => isStudentRequestMatch(r, s) && String(r.status || '').toLowerCase() === 'pending');

        if (pendingIdx !== -1) {
          const existing = allReqs.splice(pendingIdx, 1)[0];
          existing.newData = updatedObj;
          existing.new_data = updatedObj;
          existing.date = new Date().toISOString().split('T')[0];
          existing.timestamp = new Date().toLocaleString();
          existing.created_at = new Date().toISOString();
          existing.updated_at = new Date().toISOString();
          allReqs.unshift(existing);
        } else {
          const reqId = `REQ-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,5)}`;
          allReqs.unshift({
            id: reqId,
            request_id: reqId,
            type: 'profile',
            req_type: 'PROFILE_UPDATE',
            studentId: s.student_id || s.id || s.rollNo,
            student_id: s.student_id || s.id || s.rollNo,
            studentName: s.name,
            student_name: s.name,
            rollNo: s.rollNo || s.roll_no || '',
            roll_no: s.rollNo || s.roll_no || '',
            className: s.className || s.class_name || '',
            class_name: s.className || s.class_name || '',
            date: new Date().toISOString().split('T')[0],
            request_date: new Date().toISOString().split('T')[0],
            status: 'Pending',
            oldData: {
              name: s.name,
              mobile: s.mobile,
              dob: s.dob,
              email: s.email,
              guardianName: s.guardianName,
              guardianMobile: s.guardianMobile,
              bloodGroup: s.bloodGroup,
              address: s.address,
              photoUrl: existingOldPhoto,
              photo_url: existingOldPhoto,
              photo: existingOldPhoto
            },
            old_data: {
              name: s.name,
              mobile: s.mobile,
              dob: s.dob,
              email: s.email,
              guardianName: s.guardianName,
              guardianMobile: s.guardianMobile,
              bloodGroup: s.bloodGroup,
              address: s.address,
              photoUrl: existingOldPhoto,
              photo_url: existingOldPhoto,
              photo: existingOldPhoto
            },
            newData: updatedObj,
            new_data: updatedObj
          });
        }

        await AppState.saveRequests(allReqs);
        AppState.invalidateCaches();
        modalEl.remove();
        alert('✅ Profile detail update request submitted successfully! Pending Admin verification.');
        renderStudentDashboard();
      } catch (err) {
        console.error('Submit request failed:', err);
        alert('❌ Request failed: ' + err.message);
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i aria-hidden="true" class="fa-solid fa-paper-plane"></i> Submit Update Request to Admin';
        }
      }
    });
  }

  /* ==========================================================================
   * STUDENT ONLINE PAYMENT VERIFICATION REQUEST MODAL
   * ========================================================================== */
  function openStudentPaymentRequestModal(s) {
    document.getElementById('studentPayReqModal')?.remove();

    // A student with nothing outstanding used to see this modal pre-filled with
    // ₹1,000 (`s.pendingFee || 1000`), inviting them to pay a bill they did not
    // have. The monthly rate is the canonical one for their batch, not a flat
    // ₹1,000 that under-charged the ₹1,500 senior batches.
    const totalDue = Math.max(0, Number(s.pendingFee ?? s.pending_fee ?? 0));
    const monthlyFee = studentMonthlyFee(s);
    // Pre-fill with the outstanding balance; if nothing is due, fall back to one
    // month so an advance payment is still possible, and say so in the modal.
    let selectedPayAmount = totalDue > 0 ? totalDue : monthlyFee;
    // Effective payee: the admin-configured UPI id (Settings) wins so changing
    // the institute's VPA actually changes where students pay; the canonical
    // config value is the fallback when no override has been saved.
    const adminUpiId = (AppState.getAdmins ? (AppState.getAdmins() || []) : [])
      .map(a => a.upi_id || a.upiId).find(Boolean);
    const payee = {
      ...((ACADEMIC && ACADEMIC.PAYEE) || {
        upiId: 'chandankr1501998@ybl', name: 'CHANDAN KUMAR',
        displayName: 'Chandan Kumar', role: 'Managing Director, Pragyan Institute'
      })
    };
    if (adminUpiId) payee.upiId = adminUpiId;
    const upiLinkFor = (amt) =>
      `upi://pay?pa=${encodeURIComponent(payee.upiId)}` +
      `&pn=${encodeURIComponent(payee.name + ' Pragyan Institute')}` +
      `&cu=INR&am=${Number(amt) || 0}`;
    const initialUpiLink = upiLinkFor(selectedPayAmount);

    const modalHtml = `
      <div class="inner-modal-backdrop active" id="studentPayReqModal">
        <div class="inner-modal-content" style="max-width: 600px;" role="dialog" aria-modal="true" aria-labelledby="payReqModalTitle">
          <div class="inner-modal-header">
            <h3 id="payReqModalTitle"><i class="fa-solid fa-credit-card" style="color: var(--primary-emerald);" aria-hidden="true"></i> Submit Online Payment Proof</h3>
            <button class="btn-close-inner" type="button" aria-label="Close payment proof dialog"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
          </div>

          <!-- Payment Option Quick Select (Pay in Full vs Pay in Partial) -->
          <div style="background: var(--bg-surface-cream, #FAF9F6); border: 1.5px solid var(--border-sand, #E5E7EB); border-radius: 10px; padding: 0.85rem; margin-bottom: 1.15rem;">
            <div id="payOptionGroupLabel" style="font-size: 0.8rem; font-weight: 800; color: var(--primary-emerald, #064E3B); text-transform: uppercase; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.4rem;">
              <i class="fa-solid fa-hand-holding-dollar" aria-hidden="true"></i> Choose Payment Option / भुगतान विकल्प
            </div>
            ${totalDue === 0 ? `
            <p style="margin: 0 0 0.6rem; font-size: 0.8rem; color: #047857; font-weight: 700;">
              <i class="fa-solid fa-circle-check" aria-hidden="true"></i> Your account is fully paid. Any amount you submit here is recorded as an advance.
            </p>` : ''}
            <div role="group" aria-labelledby="payOptionGroupLabel" style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
              <button type="button" class="btn-pay-option active" id="btnStudentPayFull" aria-pressed="true" style="flex: 1; min-width: 140px; min-height: 44px; padding: 0.6rem 0.75rem; border-radius: 8px; border: 2px solid #10B981; background: #ECFDF5; color: #064E3B; font-weight: 700; font-size: 0.82rem; cursor: pointer; text-align: center; font-family: inherit;">
                <i class="fa-solid fa-circle-check" aria-hidden="true"></i> ${totalDue > 0 ? `Pay Full Due (₹${totalDue.toLocaleString('en-IN')})` : `Pay 1 Month Advance (₹${monthlyFee.toLocaleString('en-IN')})`}
              </button>
              <button type="button" class="btn-pay-option" id="btnStudentPayMonthly" aria-pressed="false" style="flex: 1; min-width: 140px; min-height: 44px; padding: 0.6rem 0.75rem; border-radius: 8px; border: 1.5px solid #CBD5E1; background: #fff; color: #334155; font-weight: 700; font-size: 0.82rem; cursor: pointer; text-align: center; font-family: inherit;">
                <i class="fa-solid fa-calendar-days" aria-hidden="true"></i> 1-Month Fee (₹${monthlyFee.toLocaleString('en-IN')})
              </button>
              <button type="button" class="btn-pay-option" id="btnStudentPayPartial" aria-pressed="false" style="flex: 1; min-width: 140px; min-height: 44px; padding: 0.6rem 0.75rem; border-radius: 8px; border: 1.5px solid #CBD5E1; background: #fff; color: #334155; font-weight: 700; font-size: 0.82rem; cursor: pointer; text-align: center; font-family: inherit;">
                <i class="fa-solid fa-pencil" aria-hidden="true"></i> Custom Partial Amount
              </button>
            </div>
          </div>

          <!-- Official UPI Gateway Card with PhonePe QR Code -->
          <div style="background: linear-gradient(135deg, #064E3B 0%, #022c22 100%); color: #fff; padding: 1.25rem; border-radius: 12px; margin-bottom: 1.25rem; box-shadow: 0 4px 15px rgba(6, 78, 59, 0.25);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.4rem;">
              <span style="font-size: 0.85rem; font-weight: 700; color: #A7F3D0;"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> Official Institute UPI Gateway</span>
              <span style="background: rgba(52, 211, 153, 0.2); border: 1px solid #34D399; color: #34D399; padding: 0.2rem 0.55rem; border-radius: 99px; font-weight: 700; font-size: 0.8rem;">Verified Gateway</span>
            </div>

            <!-- .upi-gateway-grid, not an inline two-column grid: the mobile rule
                 that collapses modal grids only matches divs inside a <form>, so
                 this card kept a 130px QR beside the payee text on a 375px screen
                 and pushed the UPI-id chip out of the card. -->
            <div class="upi-gateway-grid">
              <div style="background: #FFFFFF; padding: 6px; border-radius: 10px; border: 2px solid #10B981; text-align: center; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
                <img src="assets/images/chandan_upi_qr.png" alt="PhonePe QR code for ${payee.displayName}, Pragyan Institute" style="width: 130px; height: 170px; object-fit: contain; border-radius: 6px; display: block;">
                <div style="font-size: 0.8rem; color: #065F46; font-weight: 800; margin-top: 4px;">SCAN ANY UPI APP</div>
              </div>

              <div style="min-width: 0;">
                <div style="font-size: 0.8rem; opacity: 0.85; text-transform: uppercase; letter-spacing: 0.5px;">Beneficiary / Payee</div>
                <div style="font-size: 1.1rem; font-weight: 800; color: #FFFFFF; margin-bottom: 0.35rem;">${payee.displayName} <span style="font-size: 0.8rem; font-weight: 600; color: #6EE7B7;">(${payee.role})</span></div>

                <div style="font-size: 0.8rem; opacity: 0.85; text-transform: uppercase; letter-spacing: 0.5px;">Official UPI ID</div>
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-top: 0.2rem; flex-wrap: wrap;">
                  <span id="upiIdText" style="font-family: monospace; font-size: 1rem; font-weight: 700; background: rgba(0,0,0,0.3); border: 1px solid rgba(52, 211, 153, 0.4); padding: 0.3rem 0.65rem; border-radius: 6px; color: #6EE7B7; word-break: break-all;">${payee.upiId}</span>
                  <button type="button" id="btnCopyUpiId" style="background: #047857; color: #fff; border: none; min-height: 36px; padding: 0.3rem 0.6rem; border-radius: 6px; font-size: 0.8rem; font-weight: 700; cursor: pointer;">
                    <i class="fa-regular fa-copy" aria-hidden="true"></i> Copy
                  </button>
                </div>
              </div>
            </div>

            <!-- One-Tap Auto-UPI Button for Mobile Devices -->
            <div style="margin-top: 1rem; padding-top: 0.85rem; border-top: 1px solid rgba(255,255,255,0.12);">
              <a id="autoUpiPayBtn" href="${initialUpiLink}" style="display: flex; align-items: center; justify-content: center; gap: 0.5rem; text-decoration: none; width: 100%; min-height: 44px; padding: 0.75rem 1rem; border-radius: 8px; font-weight: 700; font-size: 0.92rem; background: linear-gradient(135deg, #10B981 0%, #047857 100%); color: #fff; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.35); text-align: center;">
                <i class="fa-solid fa-mobile-screen-button" aria-hidden="true"></i> <span id="autoUpiBtnLabel">Pay ₹${selectedPayAmount.toLocaleString('en-IN')} with PhonePe / GPay / Paytm</span>
              </a>
              <div id="autoUpiNoteText" style="text-align: center; font-size: 0.8rem; opacity: 0.8; margin-top: 0.35rem;">Clicking opens PhonePe, Google Pay, or Paytm directly with ₹${selectedPayAmount.toLocaleString('en-IN')} pre-filled.</div>
            </div>
          </div>

          <form id="studentPayReqForm">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.9rem; margin-bottom: 1rem;">
              <div>
                <label for="payReqAmount" style="font-size: 0.85rem; font-weight: 600;">Payment Amount (₹) *</label>
                <input type="number" id="payReqAmount" class="portal-input" value="${selectedPayAmount}" required min="1" inputmode="numeric">
              </div>
              <div>
                <label for="payReqMode" style="font-size: 0.85rem; font-weight: 600;">Payment Mode *</label>
                <select id="payReqMode" class="portal-input">
                  <option value="UPI (PhonePe)">UPI (PhonePe)</option>
                  <option value="UPI (Google Pay / Paytm / BHIM)">UPI (Google Pay / Paytm / BHIM)</option>
                  <option value="QR Code Scanner">QR Code Scanner</option>
                  <option value="Bank NEFT / IMPS Transfer">Bank NEFT / IMPS Transfer</option>
                </select>
              </div>
              <div style="grid-column: span 2;">
                <label for="payReqUtr" style="font-size: 0.85rem; font-weight: 600;">UTR / Transaction Reference No. *</label>
                <input type="text" id="payReqUtr" class="portal-input" placeholder="e.g. 423910982341 (Required)" required inputmode="numeric" aria-describedby="payReqUtrHelp">
                <div id="payReqUtrHelp" style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.25rem;">Enter 12-digit UTR or Transaction ID from PhonePe / GPay / Paytm receipt.</div>
              </div>
              <div style="grid-column: span 2;">
                <label for="payReqProofInput" style="font-size: 0.85rem; font-weight: 600;">Attach Payment Proof Screenshot (Optional)</label>
                <input type="file" id="payReqProofInput" accept="image/*" class="portal-input" style="padding: 0.4rem;">
                <div id="payProofPreviewWrap" style="margin-top: 0.4rem; display: none;">
                  <img id="payProofPreviewImg" src="" alt="Preview of the payment screenshot you attached" style="max-height: 90px; border-radius: 6px; border: 1px solid var(--border-sand);">
                </div>
              </div>
              <div style="grid-column: span 2;">
                <label for="payReqNote" style="font-size: 0.85rem; font-weight: 600;">Note / Remarks (Optional)</label>
                <input type="text" id="payReqNote" class="portal-input" placeholder="e.g. Paid monthly tuition fee via PhonePe">
              </div>
            </div>

            <button type="submit" class="btn btn-emerald" style="width: 100%; min-height: 44px; padding: 0.8rem;">
              <i class="fa-solid fa-paper-plane" aria-hidden="true"></i> Submit Payment Verification Request
            </button>
          </form>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modalEl = document.getElementById('studentPayReqModal');
    const dialog = wireModalA11y(modalEl, { initialFocus: '#payReqAmount' });
    const proofInput = modalEl.querySelector('#payReqProofInput');
    const proofWrap = modalEl.querySelector('#payProofPreviewWrap');
    const proofImg = modalEl.querySelector('#payProofPreviewImg');
    const amountInput = modalEl.querySelector('#payReqAmount');
    const autoUpiBtn = modalEl.querySelector('#autoUpiPayBtn');
    const autoUpiLabel = modalEl.querySelector('#autoUpiBtnLabel');
    const autoUpiNote = modalEl.querySelector('#autoUpiNoteText');
    const copyBtn = modalEl.querySelector('#btnCopyUpiId');

    function updateModalUpiLink(amt) {
      const val = parseFloat(amt) || 0;
      if (autoUpiBtn) {
        autoUpiBtn.href = upiLinkFor(val);
      }
      if (autoUpiLabel) {
        autoUpiLabel.textContent = `Pay ₹${val.toLocaleString('en-IN')} with PhonePe / GPay / Paytm`;
      }
      if (autoUpiNote) {
        autoUpiNote.textContent = `Clicking opens PhonePe, Google Pay, or Paytm directly with ₹${val.toLocaleString('en-IN')} pre-filled.`;
      }
    }

    const btnFull = modalEl.querySelector('#btnStudentPayFull');
    const btnMonthly = modalEl.querySelector('#btnStudentPayMonthly');
    const btnPartial = modalEl.querySelector('#btnStudentPayPartial');

    // These three buttons behave as a radio group. Without aria-pressed the
    // selected option was conveyed by border colour alone, so a screen-reader
    // user could not tell which amount was armed — and neither could a sighted
    // user relying on a high-contrast mode that overrides borders.
    function setActivePayOption(activeBtn) {
      [btnFull, btnMonthly, btnPartial].forEach(b => {
        if (!b) return;
        const isActive = b === activeBtn;
        b.classList.toggle('active', isActive);
        b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        if (isActive) {
          b.style.borderColor = '#10B981';
          b.style.background = '#ECFDF5';
          b.style.color = '#064E3B';
        } else {
          b.style.borderColor = '#CBD5E1';
          b.style.background = '#fff';
          b.style.color = '#334155';
        }
      });
    }

    btnFull?.addEventListener('click', () => {
      setActivePayOption(btnFull);
      // With nothing outstanding the "full due" button pays one month forward
      // rather than filling in ₹0 and failing the min="1" check on submit.
      const amt = totalDue > 0 ? totalDue : monthlyFee;
      amountInput.value = amt;
      updateModalUpiLink(amt);
    });

    btnMonthly?.addEventListener('click', () => {
      setActivePayOption(btnMonthly);
      amountInput.value = monthlyFee;
      updateModalUpiLink(monthlyFee);
    });

    btnPartial?.addEventListener('click', () => {
      setActivePayOption(btnPartial);
      amountInput.focus();
      amountInput.select();
    });

    // Dynamic auto-UPI update on amount change
    amountInput?.addEventListener('input', () => {
      const val = parseFloat(amountInput.value) || 0;
      updateModalUpiLink(val);
    });

    // Copy UPI ID button
    copyBtn?.addEventListener('click', () => {
      const done = () => {
        copyBtn.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i> Copied!';
        setTimeout(() => { copyBtn.innerHTML = '<i class="fa-regular fa-copy" aria-hidden="true"></i> Copy'; }, 2000);
      };
      // navigator.clipboard is undefined on insecure origins and in some
      // in-app webviews, where the old code threw a TypeError before the
      // .catch() could show the fallback.
      if (!navigator.clipboard?.writeText) {
        alert(`UPI ID: ${payee.upiId}`);
        return;
      }
      navigator.clipboard.writeText(payee.upiId).then(done).catch(() => {
        alert(`UPI ID: ${payee.upiId}`);
      });
    });

    let proofPreviewUrl = '';
    proofInput?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(evt) {
        proofPreviewUrl = evt.target.result;
        proofImg.src = proofPreviewUrl;
        proofWrap.style.display = 'block';
      };
      reader.readAsDataURL(file);
    });

    modalEl.querySelector('#studentPayReqForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = e.currentTarget.querySelector('button[type="submit"]');
      // Guard against a double submit. The proof upload below is awaited, so on
      // a slow mobile connection the dialog stayed live for several seconds and
      // a second tap filed a duplicate payment request with the same UTR — which
      // the admin then had to reconcile by hand.
      if (submitBtn?.dataset.busy === '1') return;
      if (submitBtn) {
        submitBtn.dataset.busy = '1';
        submitBtn.disabled = true;
        submitBtn.setAttribute('aria-busy', 'true');
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Submitting…';
      }
      const releaseSubmit = () => {
        if (!submitBtn) return;
        delete submitBtn.dataset.busy;
        submitBtn.disabled = false;
        submitBtn.removeAttribute('aria-busy');
        submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane" aria-hidden="true"></i> Submit Payment Verification Request';
      };

      try {
        const amount = parseFloat(modalEl.querySelector('#payReqAmount').value) || 0;
        const mode = modalEl.querySelector('#payReqMode').value;
        const utr = modalEl.querySelector('#payReqUtr').value.trim();
        const note = modalEl.querySelector('#payReqNote').value.trim();

        if (!utr) {
          showNotification('Please enter a valid UTR / Transaction Reference number.', 'error');
          modalEl.querySelector('#payReqUtr')?.focus();
          releaseSubmit();
          return;
        }
        if (amount <= 0) {
          showNotification('Enter the amount you paid — it must be more than ₹0.', 'error');
          modalEl.querySelector('#payReqAmount')?.focus();
          releaseSubmit();
          return;
        }

        let proofPhotoUrl = '';
        const proofFile = proofInput?.files[0];
        if (proofFile) {
          try {
            proofPhotoUrl = await SupabaseSync.uploadFile(proofFile, 'payment_proofs');
          } catch (error) {
            showNotification(error.message || 'Unable to upload payment proof.', 'error');
            releaseSubmit();
            return;
          }
        }

        // Submit through the validated gateway endpoint: the server resolves
        // identity from the signed session, mints a high-entropy request id,
        // and rejects duplicate UTR claims. The local copy below is for instant
        // UI only — the cloud row is created by the endpoint itself.
        let serverRequestId = null;
        try {
          const token = SupabaseSync.sessionToken
            || sessionStorage.getItem('pragyan_portal_token')
            || localStorage.getItem('pragyan_portal_token');
          const res = await fetch(getApiUrl('/api/payment-request'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({
              roll: s.student_id || s.id || s.rollNo,
              studentName: s.name,
              batch: s.className || s.class_name,
              amount,
              mode,
              paymentType: 'PARTIAL_PAYMENT',
              claimedTotalDueBefore: Number(s.pendingFee ?? s.pending_fee ?? 0),
              remainingDueAfter: Math.max(0, Number(s.pendingFee ?? s.pending_fee ?? 0) - amount),
              utr,
              note,
              proofUrl: proofPhotoUrl
            })
          });
          const json = await res.json().catch(() => ({}));
          if (res.status === 200 && json.success) {
            serverRequestId = json.requestId || null;
          } else if (res.status === 409 && json.code === 'DUPLICATE_UTR') {
            showNotification('This UTR has already been submitted. The office already has your payment.', 'warn');
            releaseSubmit();
            return;
          } else {
            // Fall through to the legacy local+cloud path below rather than
            // losing the submission when the endpoint is unreachable.
            console.warn('[Portal] /api/payment-request unavailable:', json.error || res.status);
          }
        } catch (endpointErr) {
          console.warn('[Portal] payment-request endpoint error, using legacy path:', endpointErr.message);
        }

        const allReqs = AppState.getRequests();
        allReqs.unshift({
          id: serverRequestId || `REQ-PAY-${randomIdSuffix()}`,
          type: 'payment',
          _serverCreated: Boolean(serverRequestId),
          studentId: s.id,
          studentName: s.name,
          rollNo: s.rollNo,
          className: s.className,
          date: new Date().toISOString().split('T')[0],
          timestamp: getFormattedTimestamp(),
          status: 'Pending',
          paymentDetails: {
            amount,
            mode,
            utr,
            proofPhotoUrl,
            note
          }
        });

        await AppState.saveRequests(allReqs);
        AppState.addAuditLog(`Student (${s.name})`, 'PAYMENT_REQUEST_SUBMITTED', s.name, s.rollNo, `Submitted online payment verification request for ₹${amount.toLocaleString('en-IN')} (UTR: ${utr})`, { amount, utr, mode });

        // dialog.close(), not modalEl.remove(): the helper is what unlocks body
        // scrolling and returns focus. Removing the node directly left the page
        // permanently unscrollable behind a dialog that was no longer there.
        dialog.close();
        showNotification(`✅ Payment request submitted. Admin will verify UTR ${utr} and email your receipt.`, 'success');
        renderStudentDashboard();
      } catch (err) {
        console.error('[Portal] Payment request submission failed:', err);
        showNotification(err?.message || 'Could not submit the payment request. Please try again.', 'error');
        releaseSubmit();
      }
    });
  }

  /* ==========================================================================
   * ADMIN REQUESTS MANAGER (SUB-PARTS: PROFILE & PAYMENT VERIFICATION)
   * ========================================================================== */
  let activeAdminReqSubTab = 'payment'; // 'payment' or 'profile'

  function renderAdminRequestsManager() {
    const pane = document.getElementById('adminTabPane-requests');
    if (!pane) return;

    function getReqTime(r) {
      if (!r) return 0;
      if (r.created_at) {
        const t = new Date(r.created_at).getTime();
        if (!isNaN(t) && t > 0) return t;
      }
      if (r.timestamp) {
        const t = new Date(r.timestamp).getTime();
        if (!isNaN(t) && t > 0) return t;
      }
      if (r.request_date) {
        const t = new Date(r.request_date).getTime();
        if (!isNaN(t) && t > 0) return t;
      }
      if (r.date) {
        const t = new Date(r.date).getTime();
        if (!isNaN(t) && t > 0) return t;
      }
      const match = String(r.id || r.request_id || '').match(/(\d{10,13})/);
      if (match) return parseInt(match[1], 10);
      return 0;
    }

    const sortLatestFirst = (a, b) => {
      const isAPending = String(a.status || '').toLowerCase() === 'pending';
      const isBPending = String(b.status || '').toLowerCase() === 'pending';
      if (isAPending && !isBPending) return -1;
      if (!isAPending && isBPending) return 1;
      return getReqTime(b) - getReqTime(a);
    };

    const requests = AppState.getRequests();
    const pendingRequests = requests.filter(r => String(r.status || '').toLowerCase() === 'pending');
    const profileReqs = requests.filter(r => r.type !== 'payment').slice().sort(sortLatestFirst);
    const paymentReqs = requests.filter(r => r.type === 'payment').slice().sort(sortLatestFirst);

    const pendingProfileCount = profileReqs.filter(r => String(r.status || '').toLowerCase() === 'pending').length;
    const pendingPaymentCount = paymentReqs.filter(r => String(r.status || '').toLowerCase() === 'pending').length;

    // Update badge in tab
    const badgeEl = document.getElementById('adminRequestsBadge');
    if (badgeEl) {
      if (pendingRequests.length > 0) {
        badgeEl.textContent = pendingRequests.length;
        badgeEl.style.display = 'inline-block';
      } else {
        badgeEl.style.display = 'none';
      }
    }

    pane.innerHTML = `
      <div class="dash-card">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 1.25rem;">
          <h3 style="font-size: 1.15rem; font-weight: 700; color: var(--text-mahogany); margin: 0;">
            <i aria-hidden="true" class="fa-solid fa-tasks" style="color: var(--primary-emerald);"></i> Administrative Requests Center
          </h3>
          <span style="font-size: 0.85rem; color: var(--text-muted);">
            Total Pending Review: <strong style="color: #DC2626;">${pendingRequests.length}</strong>
          </span>
        </div>

        <!-- Sub-Pills Selector -->
        <div class="req-sub-pills-bar" style="display: flex; gap: 0.5rem; margin-bottom: 1.25rem; border-bottom: 2px solid var(--border-sand); padding-bottom: 0.75rem; flex-wrap: wrap;">
          <button class="req-sub-pill ${activeAdminReqSubTab === 'payment' ? 'active' : ''}" data-sub="payment" style="flex: 1 1 200px; text-align: center; justify-content: center; min-width: 160px; height: 38px;">
            <i aria-hidden="true" class="fa-solid fa-credit-card"></i> Fee Payment Verification (${pendingPaymentCount} Pending)
          </button>
          <button class="req-sub-pill ${activeAdminReqSubTab === 'profile' ? 'active' : ''}" data-sub="profile" style="flex: 1 1 200px; text-align: center; justify-content: center; min-width: 160px; height: 38px;">
            <i aria-hidden="true" class="fa-solid fa-user-pen"></i> Profile Detail Requests (${pendingProfileCount} Pending)
          </button>
        </div>

        ${activeAdminReqSubTab === 'payment' ? `
          <!-- PAYMENT VERIFICATION REQUESTS SUB-PART -->
          ${paymentReqs.length === 0 ? `
            <div style="text-align: center; color: var(--text-muted); padding: 3rem 1rem;">
              <i aria-hidden="true" class="fa-solid fa-circle-check" style="font-size: 2.5rem; color: #10B981; margin-bottom: 0.75rem;"></i>
              <p style="font-weight: 600;">No payment verification requests pending.</p>
              <p style="font-size: 0.82rem;">When students submit online payment proofs, they will appear here for verification.</p>
            </div>
          ` : `
            <div style="display: flex; flex-direction: column; gap: 1rem;">
              ${paymentReqs.map(req => {
                const isPending = req.status === 'Pending';
                const isApproved = req.status === 'Approved';
                const isRejected = req.status === 'Rejected';
                const p = {
                  ...(req.paymentDetails || {}),
                  note: sanitizeInput((req.paymentDetails || {}).note)
                };
                // This template is assembled with innerHTML. Escape all data that
                // can originate from a student request before interpolation.
                req = {
                  ...req,
                  id: sanitizeInput(req.id),
                  studentName: sanitizeInput(req.studentName),
                  rollNo: sanitizeInput(req.rollNo),
                  className: sanitizeInput(req.className),
                  timestamp: sanitizeInput(req.timestamp),
                  date: sanitizeInput(req.date)
                };

                // ---- Dues cross-check --------------------------------------
                // The gateway stores what the student CLAIMED the balance was at
                // submission ("claimed" — URL-authored) and the office must see
                // it next to the LIVE ledger figure before approving.
                const payAmount = Number(p.amount || 0);
                const claimedDue = Number(p.claimedTotalDueBefore ?? p.totalDueBefore ?? 0);
                const remainingAfter = Number(p.remainingDueAfter ?? NaN);
                const stuMatch = String(req.studentId || req.student_id || '').toLowerCase();
                const rollMatch = String(req.rollNo || '').toLowerCase();
                const liveStudent = (typeof AppState !== 'undefined' && AppState.getStudents ? (AppState.getStudents() || []) : [])
                  .find(s => {
                    const ids = [s.student_id, s.id, s.studentId].map(v => String(v || '').toLowerCase()).filter(Boolean);
                    const rolls = [s.rollNo, s.roll_no].map(v => String(v || '').toLowerCase()).filter(Boolean);
                    return (stuMatch && ids.includes(stuMatch)) || (rollMatch && rolls.includes(rollMatch));
                  });
                const livePendingRaw = liveStudent ? Number(liveStudent.pendingFee ?? liveStudent.pending_fee) : NaN;
                const livePending = Number.isFinite(livePendingRaw) ? livePendingRaw : null;
                const oneMonthGrace = Number(liveStudent ? (liveStudent.monthlyFee ?? liveStudent.monthly_fee ?? 0) : 0) || 0;
                const claimsMoreThanDues = livePending !== null && claimedDue > 0 &&
                  claimedDue > livePending + oneMonthGrace;
                const claimMismatch = livePending !== null && claimedDue > 0 &&
                  Math.abs(claimedDue - livePending) > 1;

                return `
                  <div style="border: 1px solid var(--border-sand); border-radius: 10px; padding: 1.15rem; background: #FAF9F6;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.75rem;">
                      <div>
                        <h4 style="font-size: 1.05rem; font-weight: 700; margin: 0; color: var(--text-mahogany);">${req.studentName} <span style="font-size: 0.82rem; font-weight: 400; color: var(--text-muted);">(Roll #${req.rollNo} • ${req.className})</span></h4>
                        <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.2rem;">Submitted: ${req.timestamp || req.date} | Request ID: <strong>${req.id}</strong></div>
                      </div>
                      <div>
                        ${isPending ? `<span style="background: #FEF3C7; color: #92400E; padding: 0.25rem 0.75rem; border-radius: 99px; font-weight: 700; font-size: 0.8rem;">⏳ Pending Verification</span>` : ''}
                        ${isApproved ? `<span style="background: #D1FAE5; color: #065F46; padding: 0.25rem 0.75rem; border-radius: 99px; font-weight: 700; font-size: 0.8rem;">✅ Verified & Paid</span>` : ''}
                        ${isRejected ? `<span style="background: #FEE2E2; color: #991B1B; padding: 0.25rem 0.75rem; border-radius: 99px; font-weight: 700; font-size: 0.8rem;">❌ Verification Declined</span>` : ''}
                      </div>
                    </div>

                    <div style="background: #ffffff; border: 1px solid #E5E7EB; border-radius: 8px; padding: 0.9rem; margin-bottom: 0.85rem; font-size: 0.88rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.75rem;">
                      <div><span style="color:var(--text-muted);">Payment Request Amount:</span> <br><strong style="font-size: 1.15rem; color: var(--primary-emerald);">₹${payAmount.toLocaleString('en-IN')}</strong></div>
                      <div><span style="color:var(--text-muted);">Submission Date:</span> <br><strong style="font-size: 0.9rem; color: var(--text-mahogany);">${req.date}</strong></div>
                      ${(p.utr || p.refNo) ? `<div><span style="color:var(--text-muted);">Transaction UTR / Ref ID:</span> <br><strong style="font-size: 0.95rem; color: #0284C7; font-family: monospace;">${sanitizeInput(p.utr || p.refNo)}</strong></div>` : ''}
                      ${p.note ? `<div style="grid-column: span 2;"><span style="color:var(--text-muted);">Student Description / Payment Note:</span> <br><em>${p.note}</em></div>` : ''}
                      ${(p.proofUrl || p.proof) ? `
                        <div style="grid-column: span 2; margin-top: 4px; padding: 8px; background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 6px; display: flex; align-items: center; gap: 10px;">
                          <a href="${sanitizeUrl(p.proofUrl || p.proof)}" target="_blank" rel="noopener">
                            <img src="${sanitizeUrl(p.proofUrl || p.proof)}" style="width: 55px; height: 55px; object-fit: cover; border-radius: 4px; border: 1px solid #059669;" alt="Open the full payment proof screenshot">
                          </a>
                          <div>
                            <strong style="color: #065F46; font-size: 0.85rem;"><i aria-hidden="true" class="fa-solid fa-receipt"></i> Payment Proof Screenshot Attached</strong>
                            <div style="font-size: 0.8rem; color: #047857;"><a href="${sanitizeUrl(p.proofUrl || p.proof)}" target="_blank" rel="noopener" style="color: #059669; text-decoration: underline;">Click to open full proof screenshot</a></div>
                          </div>
                        </div>
                      ` : ''}
                    </div>

                    ${(claimedDue > 0) ? `
                      <div style="border: 1px dashed ${claimsMoreThanDues ? '#DC2626' : '#A7F3D0'}; background: ${claimsMoreThanDues ? '#FEF2F2' : '#F0FDF4'}; border-radius: 8px; padding: 0.7rem 0.9rem; margin-bottom: 0.85rem; font-size: 0.84rem;">
                        <strong style="color:${claimsMoreThanDues ? '#991B1B' : '#065F46'};">
                          <i aria-hidden="true" class="fa-solid ${claimsMoreThanDues ? 'fa-triangle-exclamation' : 'fa-scale-balanced'}"></i>
                          ${claimsMoreThanDues ? ' OVERCLAIM WARNING — verify against the bank statement before approving' : ' Dues cross-check'}
                        </strong>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.5rem; margin-top: 0.45rem; color: var(--text-mahogany);">
                          <div><span style="color:var(--text-muted);">Claimed due at submit:</span> <br><strong>₹${claimedDue.toLocaleString('en-IN')}</strong></div>
                          ${Number.isFinite(remainingAfter) ? `<div><span style="color:var(--text-muted);">Claims after this payment:</span> <br><strong>₹${remainingAfter.toLocaleString('en-IN')}</strong></div>` : ''}
                          <div><span style="color:var(--text-muted);">LIVE recorded dues:</span> <br><strong>${livePending === null ? 'Student not found in roster' : '₹' + livePending.toLocaleString('en-IN')}</strong></div>
                        </div>
                        ${claimsMoreThanDues ? `<div style="margin-top: 0.45rem; color:#991B1B; font-size: 0.8rem;">The claimed balance exceeds live dues + one month's fee. Confirm the transferred amount on the bank statement matches ₹${payAmount.toLocaleString('en-IN')} EXACTLY.</div>`
                          : claimMismatch ? `<div style="margin-top: 0.45rem; color:#92400E; font-size: 0.8rem;">Claimed dues differ from the live record (statement was generated before a recent change?). Totals are reconciled automatically on approval.</div>` : ''}
                      </div>
                    ` : ''}

                    ${isPending ? `
                      <div class="req-action-buttons-wrap" style="display: flex; gap: 0.6rem; flex-wrap: wrap; align-items: stretch; margin-top: 0.65rem;">
                        <div style="display: flex; align-items: center; gap: 0.4rem; flex: 1 1 220px; min-width: 170px;">
                          <span class="req-verifier-chip" style="font-size: 0.8rem; font-weight: 700; color: #065F46; background: #D1FAE5; padding: 0.4rem 0.75rem; border-radius: 6px; display: inline-flex; align-items: center; gap: 0.4rem; width: 100%; box-sizing: border-box; height: 38px;">
                            <i aria-hidden="true" class="fa-solid fa-user-check"></i> Verifier: ${getActiveTeacherName()}
                          </span>
                        </div>
                        <button class="btn btn-emerald btn-approve-pay-req" data-id="${req.id}" style="padding: 0.5rem 1.15rem; font-size: 0.84rem; flex: 1 1 200px; justify-content: center; display: inline-flex; align-items: center; gap: 0.4rem; height: 38px;">
                          <i aria-hidden="true" class="fa-solid fa-check-double"></i> Verify & Approve Payment
                        </button>
                        <button class="btn btn-decline-pay-req" data-id="${req.id}" style="background-color: #DC2626; color: #fff; padding: 0.5rem 1rem; font-size: 0.84rem; border: none; cursor: pointer; border-radius: 6px; font-weight: 600; flex: 0 1 90px; justify-content: center; display: inline-flex; align-items: center; gap: 0.4rem; height: 38px;">
                          <i aria-hidden="true" class="fa-solid fa-xmark"></i> Decline
                        </button>
                      </div>
                    ` : ''}
                  </div>
                `;
              }).join('')}
            </div>
          `}
        ` : `
          <!-- PROFILE DETAIL REQUESTS SUB-PART -->
          ${profileReqs.length === 0 ? `
            <div style="text-align: center; color: var(--text-muted); padding: 3rem 1rem;">
              <i aria-hidden="true" class="fa-solid fa-circle-check" style="font-size: 2.5rem; color: #10B981; margin-bottom: 0.75rem;"></i>
              <p style="font-weight: 600;">No profile detail change requests pending.</p>
              <p style="font-size: 0.82rem;">When students request detail updates, they will appear here for your approval.</p>
            </div>
          ` : `
            <div style="display: flex; flex-direction: column; gap: 1rem;">
              ${profileReqs.map(req => {
                const isPending = req.status === 'Pending';
                const isApproved = req.status === 'Approved';
                const isRejected = req.status === 'Rejected';
                const escapeRequestData = (data = {}) => {
                  if (!data || typeof data !== 'object') return {};
                  return Object.fromEntries(
                    Object.entries(data).map(([key, value]) => [
                      key,
                      key.toLowerCase().includes('photo') ? (typeof value === 'string' ? value.trim() : '') : sanitizeInput(value)
                    ])
                  );
                };
                req = {
                  ...req,
                  id: sanitizeInput(req.id),
                  studentName: sanitizeInput(req.studentName),
                  rollNo: sanitizeInput(req.rollNo),
                  className: sanitizeInput(req.className),
                  date: sanitizeInput(req.date),
                  oldData: escapeRequestData(req.oldData),
                  newData: escapeRequestData(req.newData)
                };

                let diffs = [];
                if (req.oldData && req.newData) {
                  if (req.oldData.name !== req.newData.name && req.newData.name) diffs.push(`Name: <s>${req.oldData.name || 'N/A'}</s> ➔ <strong style="color:#059669;">${req.newData.name}</strong>`);
                  if (req.oldData.mobile !== req.newData.mobile && req.newData.mobile) diffs.push(`Mobile: <s>${req.oldData.mobile || 'N/A'}</s> ➔ <strong style="color:#059669;">${req.newData.mobile}</strong>`);
                  if (req.oldData.dob !== req.newData.dob && req.newData.dob) diffs.push(`DOB: <s>${req.oldData.dob || 'N/A'}</s> ➔ <strong style="color:#059669;">${req.newData.dob}</strong>`);
                  if (req.oldData.email !== req.newData.email && (req.newData.email || req.oldData.email)) diffs.push(`Email: <s>${req.oldData.email || 'N/A'}</s> ➔ <strong style="color:#059669;">${req.newData.email || 'None'}</strong>`);
                  if (req.oldData.address !== req.newData.address && req.newData.address) diffs.push(`Address: <s>${req.oldData.address || 'N/A'}</s> ➔ <strong style="color:#059669;">${req.newData.address}</strong>`);
                  if (req.oldData.bloodGroup !== req.newData.bloodGroup && req.newData.bloodGroup) diffs.push(`Blood Group: <s>${req.oldData.bloodGroup || 'N/A'}</s> ➔ <strong style="color:#059669;">${req.newData.bloodGroup}</strong>`);
                  if (req.oldData.guardianName !== req.newData.guardianName && req.newData.guardianName) diffs.push(`Guardian: <s>${req.oldData.guardianName || 'N/A'}</s> ➔ <strong style="color:#059669;">${req.newData.guardianName}</strong>`);
                  if (req.oldData.guardianMobile !== req.newData.guardianMobile && req.newData.guardianMobile) diffs.push(`Guardian Phone: <s>${req.oldData.guardianMobile || 'N/A'}</s> ➔ <strong style="color:#059669;">${req.newData.guardianMobile}</strong>`);
                  
                  const newPhotoVal = req.newData.photoUrl || req.newData.photo || req.newData.photo_url;
                  const oldPhotoVal = req.oldData.photoUrl || req.oldData.photo || req.oldData.photo_url;
                  if (newPhotoVal && (newPhotoVal.startsWith('data:image/') || newPhotoVal.startsWith('http'))) {
                    diffs.push(`
                      <div style="margin-top: 6px; padding: 10px; background: #ECFDF5; border: 1.5px solid #10B981; border-radius: 8px; display: inline-flex; align-items: center; gap: 12px;">
                        <img src="${newPhotoVal}" style="width: 65px; height: 65px; border-radius: 8px; object-fit: cover; border: 2px solid #059669; box-shadow: 0 2px 5px rgba(0,0,0,0.15);" alt="New Photo Preview">
                        <div>
                          <strong style="color: #065F46; font-size: 0.9rem;"><i aria-hidden="true" class="fa-solid fa-camera"></i> Attached Profile Photo</strong>
                          <div style="font-size: 0.8rem; color: #047857; margin-top: 2px;">${newPhotoVal !== oldPhotoVal ? '✨ New photo update requested' : '📷 Existing photo attached'}</div>
                        </div>
                      </div>
                    `);
                  }
                }
                if (diffs.length === 0) diffs.push('<span style="color:#6B7280; font-style:italic;">No text or photo field changes detected between old and new submission.</span>');

                return `
                  <div style="border: 1px solid var(--border-sand); border-radius: 10px; padding: 1.15rem; background: #FAF9F6;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.75rem;">
                      <div>
                        <h4 style="font-size: 1.05rem; font-weight: 700; margin: 0; color: var(--text-mahogany);">${req.studentName} <span style="font-size: 0.82rem; font-weight: 400; color: var(--text-muted);">(Roll #${req.rollNo} • ${req.className})</span></h4>
                        <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.2rem;">Request ID: <strong>${req.id}</strong> | Date: ${req.date}</div>
                      </div>
                      <div>
                        ${isPending ? `<span style="background: #FEF3C7; color: #92400E; padding: 0.25rem 0.75rem; border-radius: 99px; font-weight: 700; font-size: 0.8rem;">⏳ Pending Review</span>` : ''}
                        ${isApproved ? `<span style="background: #D1FAE5; color: #065F46; padding: 0.25rem 0.75rem; border-radius: 99px; font-weight: 700; font-size: 0.8rem;">✅ Approved & Updated</span>` : ''}
                        ${isRejected ? `<span style="background: #FEE2E2; color: #991B1B; padding: 0.25rem 0.75rem; border-radius: 99px; font-weight: 700; font-size: 0.8rem;">❌ Declined</span>` : ''}
                      </div>
                    </div>

                    <div style="background: #ffffff; border: 1px solid #E5E7EB; border-radius: 8px; padding: 0.85rem; margin-bottom: 0.85rem; font-size: 0.88rem; line-height: 1.6;">
                      <div style="font-weight: 600; color: var(--text-charcoal); margin-bottom: 0.4rem;">Requested Field Changes:</div>
                      <ul style="margin: 0; padding-left: 1.25rem; color: #374151;">
                        ${diffs.map(d => `<li>${d}</li>`).join('')}
                      </ul>
                    </div>

                    ${isPending ? `
                      <div class="req-action-buttons-wrap" style="display: flex; gap: 0.6rem; flex-wrap: wrap; margin-top: 0.65rem;">
                        <button class="btn btn-emerald btn-approve-request" data-id="${req.id}" style="padding: 0.5rem 1.15rem; font-size: 0.84rem; flex: 1 1 180px; min-width: 140px; justify-content: center; display: inline-flex; align-items: center; gap: 0.4rem; height: 38px;">
                          <i aria-hidden="true" class="fa-solid fa-check"></i> Approve & Apply Changes
                        </button>
                        <button class="btn btn-decline-request" data-id="${req.id}" style="background-color: #DC2626; color: #fff; padding: 0.5rem 1.15rem; font-size: 0.84rem; border: none; cursor: pointer; border-radius: 6px; font-weight: 600; flex: 1 1 130px; min-width: 110px; justify-content: center; display: inline-flex; align-items: center; gap: 0.4rem; height: 38px;">
                          <i aria-hidden="true" class="fa-solid fa-xmark"></i> Decline Request
                        </button>
                      </div>
                    ` : ''}
                  </div>
                `;
              }).join('')}
            </div>
          `}
        `}
      </div>
    `;

    // Bind Sub-Pill Toggles
    pane.querySelectorAll('.req-sub-pill').forEach(btn => {
      btn.onclick = () => {
        activeAdminReqSubTab = btn.dataset.sub;
        renderAdminRequestsManager();
      };
    });

    // Bind Payment Request Approve
    pane.querySelectorAll('.btn-approve-pay-req').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.dataset.id;
        const reqList = AppState.getRequests();
        const reqItem = reqList.find(r => r.id === id);
        if (!reqItem || !reqItem.paymentDetails) return;
        if (btn.dataset.processing === 'true') return;
        btn.dataset.processing = 'true';
        btn.disabled = true;
        btn.innerHTML = '<i aria-hidden="true" class="fa-solid fa-spinner fa-spin"></i> Verifying & Updating Database...';

        const verifierName = getActiveTeacherName();
        const restoreButton = () => {
          btn.dataset.processing = 'false';
          btn.disabled = false;
          btn.innerHTML = '<i aria-hidden="true" class="fa-solid fa-check-double"></i> Verify & Approve Payment';
        };

        // Crediting a payment happens server-side, in one transaction, and this
        // browser does no fee arithmetic at all.
        //
        // What used to be here: a status mutate whose failure was only
        // console.warn'd, then `s.paidFee = Number(s.paidFee || 0) + payVal` read
        // out of the localStorage cache and written straight back. Three ways that
        // lost money:
        //
        //   * the cache can be minutes stale, so a cash receipt entered on another
        //     device was overwritten by this write;
        //   * two admins working the same queue both read the same paidFee, and
        //     the second save discarded the first payment;
        //   * the receipt number was `REC-ONL-<timestamp>-<random>`, so a retry
        //     after a dropped response minted a *second* receipt and credited the
        //     amount twice — nothing anywhere could tell it was the same payment.
        //
        // approve_payment_request() takes FOR UPDATE on the request then the
        // student, and derives the receipt number from the request id, so a replay
        // returns the original receipt instead of creating another one.
        const approveCall = (allowSurplus) => postToApi('/api/approve-payment-request', {
          requestId: id,
          verifierName,
          allow_surplus: allowSurplus === true
        });

        let response = await approveCall(false);

        // F-R5: the server refuses amounts above live dues (+1 month grace)
        // unless the verifier explicitly overrides after seeing the figures.
        if (!response.ok && response.payload?.code === 'AMOUNT_EXCEEDS_DUES' && response.payload?.needsOverride) {
          const req = Number(response.payload.requestedAmount || 0);
          const live = Number(response.payload.livePending || 0);
          const proceed = confirm(
            `⚠️ SURPLUS APPROVAL CONFIRMATION\n\n` +
            `Requested amount: ₹${req.toLocaleString('en-IN')}\n` +
            `Student's recorded dues: ₹${live.toLocaleString('en-IN')}\n\n` +
            `This payment exceeds recorded dues. Approve anyway only if you have verified the bank transfer matches ₹${req.toLocaleString('en-IN')} exactly.\n\n` +
            `Proceed with surplus override?`
          );
          if (!proceed) {
            restoreButton();
            return;
          }
          response = await approveCall(true);
        }

        if (!response.ok) {
          const message = response.payload?.error || `Approval failed (HTTP ${response.status})`;
          // ALREADY_PROCESSED means someone else got there first; the queue is
          // stale rather than wrong, so refresh it instead of just complaining.
          if (response.payload?.code === 'ALREADY_PROCESSED') {
            alert('ℹ️ This payment request was already processed. Refreshing the queue.');
          } else {
            alert(`⚠️ ${message}`);
          }
          restoreButton();
          if (typeof SupabaseSync !== 'undefined' && SupabaseSync.pullAll) {
            try { await SupabaseSync.pullAll(); } catch (syncErr) { console.warn('Post-failure pullAll note:', syncErr.message); }
          }
          renderAdminRequestsManager();
          return;
        }

        // Authoritative figures come back from the transaction that wrote them.
        const approved = response.payload.data || {};
        const payVal = Number(approved.amount || 0);
        const recNo = approved.receipt_no || '';
        const note = approved.note || 'Online payment verified by admin';
        const utrVal = approved.utr || '';
        const studentName = approved.student_name || 'the student';

        // Mirror the server's result into the local cache so the UI is correct
        // before the refetch lands. Assignment, not arithmetic: paid_fee and
        // pending_fee are copied from the row the transaction committed.
        const students = AppState.getStudents();
        const studentIdx = students.findIndex(s =>
          (approved.student_id && s.student_id === approved.student_id)
          || (approved.student_uuid && s.id === approved.student_uuid)
          || s.id === reqItem.studentId
          || isStudentRequestMatch(reqItem, s));

        if (studentIdx !== -1) {
          const s = students[studentIdx];
          s.paidFee = Number(approved.paid_fee ?? s.paidFee ?? 0);
          s.pendingFee = Number(approved.pending_fee ?? s.pendingFee ?? 0);

          if (!Array.isArray(s.feeHistory)) s.feeHistory = [];
          // Keyed on the deterministic receipt number, so an idempotent replay
          // does not add a second history line for one payment.
          if (recNo && !s.feeHistory.some(entry => entry.receiptNo === recNo)) {
            s.feeHistory.push({
              receiptNo: recNo,
              utr: utrVal,
              date: getFormattedTimestamp(),
              amount: payVal,
              mode: approved.payment_mode || (utrVal ? `UPI / Online (UTR: ${utrVal})` : 'Verified Online Payment'),
              status: 'Paid',
              by: verifierName,
              note: note
            });
          }
          students[studentIdx] = s;
          await AppState.saveStudents(students);
        }

        reqItem.status = 'Approved';
        await AppState.saveRequests(reqList);

        // A replay is not a new approval, so it gets neither an audit entry nor a
        // second notice to the family.
        if (!response.payload.idempotent) {
          AppState.addAuditLog(verifierName, 'PAYMENT_VERIFIED', studentName, approved.student_roll || '', `Verified & approved payment request of ₹${payVal.toLocaleString()} ("${note}") for ${studentName}`, { amount: payVal, note, receiptNo: recNo });

          const notices = AppState.getNotices();
          notices.unshift({
            id: `NTC-PAY-APP-${recNo || Date.now().toString(36)}`,
            title: `✅ Payment Request Approved (₹${payVal.toLocaleString()})`,
            category: 'fees',
            date: new Date().toISOString().split('T')[0],
            message: `Dear ${studentName}, your online payment of ₹${payVal.toLocaleString()} ("${note}") has been verified and approved by ${verifierName}!`,
            targetBatch: approved.student_class || '',
            unread: true
          });
          await AppState.saveNotices(notices);
        }

        // Full refetch so every other cached figure matches the database.
        if (typeof SupabaseSync !== 'undefined' && SupabaseSync.pullAll) {
          try {
            await SupabaseSync.pullAll();
          } catch(syncErr) {
            console.warn('Post-approval pullAll note:', syncErr.message);
          }
        }

        alert(response.payload.idempotent
          ? `ℹ️ This payment was already credited for ${studentName} (receipt ${recNo}). Nothing was charged twice.`
          : `✅ Payment Request Approved for ${studentName}! ₹${payVal.toLocaleString()} credited (receipt ${recNo}).`);
        renderAdminRequestsManager();
        renderAdminDashboard();
      };
    });

    // Bind Payment Request Decline
    pane.querySelectorAll('.btn-decline-pay-req').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.dataset.id;
        const reqList = AppState.getRequests();
        const reqItem = reqList.find(r => r.id === id);
        if (!reqItem) return;
        if (btn.dataset.processing === 'true') return;
        btn.dataset.processing = 'true';
        btn.disabled = true;
        btn.innerHTML = '<i aria-hidden="true" class="fa-solid fa-spinner fa-spin"></i> Declining in Database...';

        const verifierName = getActiveTeacherName();
        const payVal = reqItem.paymentDetails?.amount || 0;
        const note = reqItem.paymentDetails?.note || '';

        // The cloud write decides the outcome. It used to be wrapped in
        // `try { await mutate(...) } catch { console.warn(...) }`, which was dead
        // code — mutate() returns its failures rather than throwing — so a
        // rejected write still produced a "Declined" alert, a decline notice to
        // the family, and an audit entry, and then pullAll() pulled the row back
        // as Pending. The student had been told their request was declined when it
        // was still sitting in the queue.
        if (typeof SupabaseSync === 'undefined' || !SupabaseSync.mutateOrThrow) {
          alert('⚠️ Cloud sync is unavailable, so this decline cannot be recorded. Nothing was changed.');
          btn.dataset.processing = 'false';
          btn.disabled = false;
          btn.innerHTML = '<i aria-hidden="true" class="fa-solid fa-xmark"></i> Decline';
          return;
        }
        try {
          await SupabaseSync.mutateOrThrow('student_requests', 'update', {
            status: 'Rejected',
            updated_at: new Date().toISOString()
          }, { where: { request_id: id } });
        } catch (e) {
          alert(`⚠️ Could not record the decline: ${e.message}\n\nNothing was changed. Please try again once you are back online.`);
          btn.dataset.processing = 'false';
          btn.disabled = false;
          btn.innerHTML = '<i aria-hidden="true" class="fa-solid fa-xmark"></i> Decline';
          return;
        }

        reqItem.status = 'Rejected';
        await AppState.saveRequests(reqList);

        const notices = AppState.getNotices();
        notices.unshift({
          id: `NTC-PAY-DEC-${Date.now().toString(36).slice(-4)}-${Math.random().toString(36).slice(2,5)}`,
          title: `❌ Payment Request Declined`,
          category: 'fees',
          date: new Date().toISOString().split('T')[0],
          message: `Dear ${reqItem.studentName}, your payment verification request for ₹${payVal.toLocaleString()} ("${note}") was reviewed and declined by ${verifierName}. Please contact the institute office.`,
          targetBatch: reqItem.className,
          unread: true
        });
        await AppState.saveNotices(notices);
        AppState.addAuditLog(verifierName, 'PAYMENT_DECLINED', reqItem.studentName, reqItem.rollNo, `Declined payment request for ₹${payVal.toLocaleString()} for ${reqItem.studentName}`, { reqId: id, amount: payVal });

        // Full Refetch from Database
        if (typeof SupabaseSync !== 'undefined' && SupabaseSync.pullAll) {
          try {
            await SupabaseSync.pullAll();
          } catch(syncErr) {
            console.warn('Post-decline pullAll note:', syncErr.message);
          }
        }

        alert(`❌ Payment Request ${id} Declined.`);
        renderAdminRequestsManager();
        renderAdminDashboard();
      };
    });

    // Bind Profile Request Approve
    pane.querySelectorAll('.btn-approve-request').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.dataset.id;
        const reqList = AppState.getRequests();
        const reqItem = reqList.find(r => r.id === id);
        if (!reqItem) return;
        if (btn.dataset.processing === 'true') return;
        btn.dataset.processing = 'true';
        btn.disabled = true;
        btn.innerHTML = '<i aria-hidden="true" class="fa-solid fa-spinner fa-spin"></i> Updating Database & Applying Changes...';

        const students = AppState.getStudents();
        const studentIdx = students.findIndex(s => isStudentRequestMatch(reqItem, s));
        const restoreApproveButton = () => {
          btn.dataset.processing = 'false';
          btn.disabled = false;
          btn.innerHTML = '<i aria-hidden="true" class="fa-solid fa-check"></i> Approve &amp; Apply Changes';
        };

        if (studentIdx !== -1) {
          const allowedProfileFields = ['name', 'mobile', 'dob', 'guardianName', 'guardian_name', 'guardianMobile', 'guardian_mobile', 'email', 'address', 'bloodGroup', 'blood_group', 'photo', 'photo_url', 'photoUrl'];
          const safeUpdates = {};
          for (const key of allowedProfileFields) {
            if (reqItem.newData && reqItem.newData[key] !== undefined) {
              safeUpdates[key] = reqItem.newData[key];
            }
          }
          const updated = {
            ...students[studentIdx],
            ...safeUpdates
          };
          const previousPhoto = students[studentIdx].photo || students[studentIdx].photoUrl || students[studentIdx].photo_url || '';
          let replacedPhoto = '';
          if (reqItem.newData?.photoUrl || reqItem.newData?.photo || reqItem.newData?.photo_url) {
            const photoVal = reqItem.newData.photoUrl || reqItem.newData.photo || reqItem.newData.photo_url;
            if (previousPhoto && previousPhoto !== photoVal && previousPhoto.includes('/pragyan-media/')) {
              replacedPhoto = previousPhoto;
            }
            updated.photo = photoVal;
            updated.photo_url = photoVal;
            updated.photoUrl = photoVal;
          }

          // Cloud first, then local. The previous order saved the student locally
          // and deleted the superseded photo BEFORE writing to the database, with
          // the write's failure swallowed by a catch that could never fire —
          // mutate() returns its errors rather than throwing. A rejected write
          // therefore left the database row pointing at a photo that had already
          // been deleted from storage, and the local cache showing changes the
          // database had never accepted.
          const stuTarget = students[studentIdx];
          const supaPayload = {
            name: updated.name,
            mobile: updated.mobile || null,
            dob: updated.dob,
            class_name: updated.className,
            guardian_name: updated.guardianName || null,
            guardian_mobile: updated.guardianMobile || null,
            email: (updated.email && updated.email.includes('@')) ? updated.email.trim() : null,
            address: updated.address || '',
            blood_group: updated.bloodGroup || '',
            photo_url: updated.photoUrl || updated.photo || ''
          };

          const stuWhere = stuTarget.student_id
            ? { student_id: stuTarget.student_id }
            : (stuTarget.rollNo ? { roll_no: stuTarget.rollNo } : (stuTarget.id ? { id: stuTarget.id } : null));

          if (!stuWhere) {
            alert('⚠️ This student has no id, roll number or database key, so the profile change cannot be written. Nothing was changed.');
            restoreApproveButton();
            return;
          }
          if (typeof SupabaseSync === 'undefined' || !SupabaseSync.mutateOrThrow) {
            alert('⚠️ Cloud sync is unavailable, so this approval cannot be recorded. Nothing was changed.');
            restoreApproveButton();
            return;
          }
          try {
            await SupabaseSync.mutateOrThrow('students', 'update', supaPayload, { where: stuWhere });
          } catch (dbErr) {
            alert(`⚠️ Could not apply the profile change: ${dbErr.message}\n\nNothing was changed. Please try again once you are back online.`);
            restoreApproveButton();
            return;
          }

          students[studentIdx] = updated;
          await AppState.saveStudents(students);

          // Only now is the old file genuinely unreferenced.
          if (replacedPhoto) {
            try { await SupabaseSync.deleteFile(replacedPhoto); } catch(e) { console.warn('Cleaned old photo note:', e.message); }
          }

          // Relational Linking: Cascade profile changes to student_fee_accounts
          const feeAccounts = AppState.getFeeAccounts();
          const accIdx = feeAccounts.findIndex(a => 
            String(a.student_id || a.studentId || '').toLowerCase() === String(students[studentIdx].id || students[studentIdx].student_id || '').toLowerCase() ||
            String(a.roll_no || a.rollNo || '').toLowerCase() === String(students[studentIdx].rollNo || students[studentIdx].roll_no || '').toLowerCase()
          );
          if (accIdx !== -1) {
            feeAccounts[accIdx].student_name = updated.name;
            feeAccounts[accIdx].studentName = updated.name;
            feeAccounts[accIdx].class_name = updated.className;
            feeAccounts[accIdx].className = updated.className;
            await AppState.saveFeeAccounts(feeAccounts);
          }

          // Persist session if current user matches
          if (AppState.currentUser) {
            const curId = (AppState.currentUser.id || AppState.currentUser.student_id || '').toString().toLowerCase();
            const curRoll = (AppState.currentUser.rollNo || AppState.currentUser.roll_no || '').toString().toLowerCase();
            const targetId = (students[studentIdx].id || students[studentIdx].student_id || '').toString().toLowerCase();
            const targetRoll = (students[studentIdx].rollNo || students[studentIdx].roll_no || '').toString().toLowerCase();
            if (curId === targetId || curId === targetRoll || curRoll === targetRoll || curRoll === targetId) {
              AppState.currentUser = students[studentIdx];
              saveSession('student', students[studentIdx]);
            }
          }
        }

        // The student row is already updated at this point, so a failure here
        // leaves the request Pending while the change is live — recoverable by
        // clicking again (the student write is idempotent), which is why this one
        // reports and stops rather than trying to roll anything back.
        if (typeof SupabaseSync !== 'undefined' && SupabaseSync.mutateOrThrow) {
          try {
            await SupabaseSync.mutateOrThrow('student_requests', 'update', {
              status: 'Approved',
              updated_at: new Date().toISOString()
            }, { where: { request_id: id } });
          } catch(e) {
            alert(`⚠️ The profile change was applied, but the request could not be marked approved: ${e.message}\n\nPlease click Approve again to clear it from the queue.`);
            restoreApproveButton();
            if (typeof SupabaseSync.pullAll === 'function') {
              try { await SupabaseSync.pullAll(); } catch (syncErr) { console.warn('Post-failure pullAll note:', syncErr.message); }
            }
            renderAdminRequestsManager();
            return;
          }
        }

        reqItem.status = 'Approved';
        await AppState.saveRequests(reqList);

        AppState.addAuditLog('Admin', 'PROFILE_APPROVED', reqItem.studentName, reqItem.rollNo, `Profile detail update request approved for ${reqItem.studentName}`, { reqId: reqItem.id });

        const notices = AppState.getNotices();
        notices.unshift({
          id: `NTC-APP-${Date.now().toString(36).slice(-4)}-${Math.random().toString(36).slice(2,5)}`,
          title: `✅ Profile Detail Update Approved`,
          category: 'general',
          date: new Date().toISOString().split('T')[0],
          message: `Dear ${reqItem.studentName}, your requested detail updates (Name, Contact, Email, Photo, Address, etc.) have been verified and approved by the Admin! Your profile is now updated.`,
          targetBatch: reqItem.className,
          unread: true
        });
        await AppState.saveNotices(notices);

        // 2. Full Refetch from Database to guarantee cloud sync
        if (typeof SupabaseSync !== 'undefined' && SupabaseSync.pullAll) {
          try {
            await SupabaseSync.pullAll();
          } catch(syncErr) {
            console.warn('Post-approval pullAll note:', syncErr.message);
          }
        }

        alert(`✅ Profile Request ${id} Approved! Student profile and photo updated.`);
        renderAdminRequestsManager();
        renderAdminDashboard();
      };
    });

    // Bind Profile Request Decline
    pane.querySelectorAll('.btn-decline-request').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.dataset.id;
        const reqList = AppState.getRequests();
        const reqItem = reqList.find(r => r.id === id);
        if (!reqItem) return;
        if (btn.dataset.processing === 'true') return;
        btn.dataset.processing = 'true';
        btn.disabled = true;
        btn.innerHTML = '<i aria-hidden="true" class="fa-solid fa-spinner fa-spin"></i> Declining in Database...';

        const newPhoto = reqItem.newData?.photoUrl || reqItem.newData?.photo || reqItem.newData?.photo_url;
        const oldPhoto = reqItem.oldData?.photoUrl || reqItem.oldData?.photo || reqItem.oldData?.photo_url;

        // Record the decline first, delete the rejected upload second. The other
        // order threw the photo away before the write, and the write's failure was
        // swallowed by a catch that could never fire, so a rejected decline left a
        // still-Pending request whose newData pointed at an object that no longer
        // existed — approving it later would set photo_url to a dead link.
        if (typeof SupabaseSync === 'undefined' || !SupabaseSync.mutateOrThrow) {
          alert('⚠️ Cloud sync is unavailable, so this decline cannot be recorded. Nothing was changed.');
          btn.dataset.processing = 'false';
          btn.disabled = false;
          btn.innerHTML = '<i aria-hidden="true" class="fa-solid fa-xmark"></i> Decline Request';
          return;
        }
        try {
          await SupabaseSync.mutateOrThrow('student_requests', 'update', {
            status: 'Rejected',
            updated_at: new Date().toISOString()
          }, { where: { request_id: id } });
        } catch(e) {
          alert(`⚠️ Could not record the decline: ${e.message}\n\nNothing was changed, and the uploaded photo has been kept. Please try again once you are back online.`);
          btn.dataset.processing = 'false';
          btn.disabled = false;
          btn.innerHTML = '<i aria-hidden="true" class="fa-solid fa-xmark"></i> Decline Request';
          return;
        }

        // Now unreferenced by any pending request.
        if (newPhoto && newPhoto !== oldPhoto && SupabaseSync.deleteFile) {
          try {
            await SupabaseSync.deleteFile(newPhoto);
          } catch(delErr) {
            console.warn('Failed to delete unapproved photo:', delErr);
          }
        }

        reqItem.status = 'Rejected';
        await AppState.saveRequests(reqList);

        const notices = AppState.getNotices();
        notices.unshift({
          id: `NTC-DEC-${Date.now().toString(36).slice(-4)}-${Math.random().toString(36).slice(2,5)}`,
          title: `❌ Profile Detail Update Request Declined`,
          category: 'general',
          date: new Date().toISOString().split('T')[0],
          message: `Dear ${reqItem.studentName}, your profile detail update request was reviewed and declined by the Admin. Please contact the institute office for details.`,
          targetBatch: reqItem.className,
          unread: true
        });
        await AppState.saveNotices(notices);
        AppState.addAuditLog('Admin', 'PROFILE_DECLINED', reqItem.studentName, reqItem.rollNo, `Declined profile update request for ${reqItem.studentName}`, { reqId: id });

        // 2. Full Refetch from Database to guarantee cloud sync
        if (typeof SupabaseSync !== 'undefined' && SupabaseSync.pullAll) {
          try {
            await SupabaseSync.pullAll();
          } catch(syncErr) {
            console.warn('Post-decline pullAll note:', syncErr.message);
          }
        }

        alert(`❌ Change Request ${id} Declined.`);
        renderAdminRequestsManager();
        renderAdminDashboard();
      };
    });
  }

  /* ==========================================================================
   * MASTER ADMIN AUDIT & ACTION HISTORY TAB
   * ========================================================================== */
  let currentAuditFilter = 'all';
  let currentAuditEducator = 'all';
  let currentAuditSearch = '';

  function renderAdminAuditHistoryTab() {
    const pane = document.getElementById('adminTabPane-history');
    if (!pane) return;

    const allLogs = AppState.getAuditLogs();

    let filteredLogs = allLogs.filter(log => {
      let matchesFilter = true;
      if (currentAuditFilter === 'FEE_PAYMENT') matchesFilter = (log.actionType === 'FEE_PAYMENT');
      else if (currentAuditFilter === 'PAYMENT_VERIFIED') matchesFilter = (log.actionType === 'PAYMENT_VERIFIED');
      else if (currentAuditFilter === 'FEE_ADJUSTMENT') matchesFilter = (log.actionType === 'FEE_ADJUSTMENT_CORRECTION' || log.actionType === 'FEE_REGULATED' || log.actionType === 'OLD_DUE_ADDED');
      else if (currentAuditFilter === 'PROFILE_APPROVED') matchesFilter = (log.actionType === 'PROFILE_APPROVED' || log.actionType === 'PROFILE_EDITED');
      else if (currentAuditFilter === 'NOTICE_BROADCAST') matchesFilter = (log.actionType === 'NOTICE_BROADCAST');
      else if (currentAuditFilter === 'STUDENT_REGISTERED') matchesFilter = (log.actionType === 'STUDENT_REGISTERED');
      else if (currentAuditFilter === 'SECURITY') matchesFilter = (log.actionType === 'STUDENT_PASSWORD_RESET' || log.actionType === 'STUDENT_PERMANENTLY_DELETED' || log.actionType === 'ADMIN_SETTINGS_UPDATED');

      let matchesEducator = true;
      if (currentAuditEducator !== 'all') {
        matchesEducator = log.actor && log.actor.toLowerCase().includes(currentAuditEducator.toLowerCase());
      }

      let matchesSearch = true;
      if (currentAuditSearch) {
        const q = currentAuditSearch.toLowerCase();
        matchesSearch = (log.studentName && log.studentName.toLowerCase().includes(q)) ||
                        (log.actor && log.actor.toLowerCase().includes(q)) ||
                        (log.description && log.description.toLowerCase().includes(q)) ||
                        (log.studentRoll && log.studentRoll.toLowerCase().includes(q));
      }
      return matchesFilter && matchesEducator && matchesSearch;
    });

    // Calculate total collection by current educator filter
    const totalCollectedByEducator = filteredLogs
      .filter(l => l.actionType === 'FEE_PAYMENT' || l.actionType === 'PAYMENT_VERIFIED')
      .reduce((sum, l) => sum + (l.details?.amount || 0), 0);

    pane.innerHTML = `
      <div class="dash-card admin-audit-main-card">
        <div class="admin-audit-header-row">
          <div>
            <h3 class="admin-audit-header-title">
              <i aria-hidden="true" class="fa-solid fa-clock-rotate-left" style="color: var(--primary-emerald);"></i> Master Administrative Audit &amp; Action History Log (${allLogs.length})
            </h3>
            <div class="admin-audit-header-desc">Complete chronological audit trail of all fee collections, approvals, announcements, adjustments, and registrations by specific educators</div>
          </div>
          <div class="admin-audit-filter-wrap">
            <select id="adminAuditEducatorSelect" aria-label="Filter the audit trail by educator" class="portal-input admin-audit-educator-select">
              <option value="all" ${currentAuditEducator === 'all' ? 'selected' : ''}>🌟 All Educators / Admins</option>
              <option value="Ravi" ${currentAuditEducator === 'Ravi' ? 'selected' : ''}>👔 Prof. Ravi Ranjan</option>
              <option value="Chandan" ${currentAuditEducator === 'Chandan' ? 'selected' : ''}>🔬 Chandan Kumar</option>
            </select>
            <input type="text" id="adminAuditSearchInput" aria-label="Search audit history" class="portal-input admin-audit-search-input" placeholder="🔍 Search audit history..." value="${escapeHtml(currentAuditSearch)}">
            ${isMainAdmin() ? `
              <button id="btnClearAllAuditLogs" class="btn btn-clear-all-audits" title="Main Admin Exclusive: Purge all audit logs from database and local storage">
                <i aria-hidden="true" class="fa-solid fa-trash-can"></i> Clear All Audits
              </button>
            ` : ''}
          </div>
        </div>

        ${currentAuditEducator !== 'all' ? `
          <div class="audit-educator-banner">
            <div>
              <div class="audit-educator-title">
                <i aria-hidden="true" class="fa-solid fa-user-tie"></i> Audit Log Filtered for Educator: <strong>${currentAuditEducator === 'Ravi' ? 'Prof. Ravi Ranjan (Director & Maths Lead)' : 'Chandan Kumar (Director & Science Lead)'}</strong>
              </div>
              <div class="audit-educator-desc">
                Total Fee Payments Verified / Accepted by this Educator: <strong class="audit-educator-amount">₹${totalCollectedByEducator.toLocaleString()}</strong> across <strong>${filteredLogs.filter(l => l.actionType === 'FEE_PAYMENT' || l.actionType === 'PAYMENT_VERIFIED').length}</strong> transactions.
              </div>
            </div>
            <button class="btn btn-clear-educator-filter" id="btnClearEducatorFilter">Clear Filter</button>
          </div>
        ` : ''}

        <!-- Filter Chips Bar -->
        <div class="admin-audit-chips-bar">
          <button type="button" class="notice-admin-filter-chip ${currentAuditFilter === 'all' ? 'active' : ''}" data-audit-filter="all">All (${allLogs.length})</button>
          <button type="button" class="notice-admin-filter-chip ${currentAuditFilter === 'FEE_ADJUSTMENT' ? 'active' : ''}" data-audit-filter="FEE_ADJUSTMENT" style="${currentAuditFilter === 'FEE_ADJUSTMENT' ? 'background: #7C3AED !important; border-color: #7C3AED !important; color: #fff !important;' : ''}">⚖️ Fee Adjustments &amp; Waivers</button>
          <button type="button" class="notice-admin-filter-chip ${currentAuditFilter === 'FEE_PAYMENT' ? 'active' : ''}" data-audit-filter="FEE_PAYMENT">💳 Direct Fee Payments</button>
          <button type="button" class="notice-admin-filter-chip ${currentAuditFilter === 'PAYMENT_VERIFIED' ? 'active' : ''}" data-audit-filter="PAYMENT_VERIFIED">✅ Verified Online Payments</button>
          <button type="button" class="notice-admin-filter-chip ${currentAuditFilter === 'PROFILE_APPROVED' ? 'active' : ''}" data-audit-filter="PROFILE_APPROVED">👤 Profile Updates</button>
          <button type="button" class="notice-admin-filter-chip ${currentAuditFilter === 'NOTICE_BROADCAST' ? 'active' : ''}" data-audit-filter="NOTICE_BROADCAST">📢 Announcements</button>
          <button type="button" class="notice-admin-filter-chip ${currentAuditFilter === 'STUDENT_REGISTERED' ? 'active' : ''}" data-audit-filter="STUDENT_REGISTERED">🎓 Student Registrations</button>
          <button type="button" class="notice-admin-filter-chip ${currentAuditFilter === 'SECURITY' ? 'active' : ''}" data-audit-filter="SECURITY">🔒 Security &amp; Deletions</button>
        </div>

        <!-- History Timeline List -->
        ${filteredLogs.length === 0 ? `
          <div style="text-align: center; color: var(--text-muted); padding: 3rem 1rem;">
            <i aria-hidden="true" class="fa-solid fa-clock" style="font-size: 2.5rem; color: #9CA3AF; margin-bottom: 0.75rem;"></i>
            <p style="font-weight: 600;">No audit history records found matching criteria.</p>
          </div>
        ` : `
          <div style="display: flex; flex-direction: column; gap: 0.85rem;">
            ${filteredLogs.map(log => {
              const aType = log.actionType || '';
              let typePill = '';
              let cardBorderLeft = 'border-left: 4px solid #CBD5E1;';
              let cardBg = '#FAF9F6;';

              if (aType === 'FEE_ADJUSTMENT_CORRECTION' || aType === 'FEE_REGULATED') {
                cardBorderLeft = 'border-left: 5px solid #7C3AED;';
                cardBg = 'linear-gradient(135deg, #FAF5FF 0%, #F5EEFF 100%);';
                typePill = '<span style="background: linear-gradient(135deg, #EDE9FE, #DDD6FE); color: #5B21B6; border: 1.5px solid #A78BFA; padding: 0.25rem 0.75rem; border-radius: 99px; font-weight: 800; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 0.35rem; box-shadow: 0 1px 4px rgba(124, 58, 237, 0.15);"><i aria-hidden="true" class="fa-solid fa-scale-balanced"></i> ⚖️ Fee Adjustment &amp; Correction</span>';
              } else if (aType === 'FEE_PAYMENT') {
                cardBorderLeft = 'border-left: 5px solid #059669;';
                cardBg = '#F0FDF4;';
                typePill = '<span style="background: #D1FAE5; color: #065F46; border: 1.5px solid #6EE7B7; padding: 0.25rem 0.75rem; border-radius: 99px; font-weight: 800; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 0.35rem;"><i aria-hidden="true" class="fa-solid fa-hand-holding-dollar"></i> Direct Partial/Cash Payment</span>';
              } else if (aType === 'PAYMENT_VERIFIED') {
                cardBorderLeft = 'border-left: 5px solid #0284C7;';
                cardBg = '#F0F9FF;';
                typePill = '<span style="background: #E0F2FE; color: #075985; border: 1.5px solid #7DD3FC; padding: 0.25rem 0.75rem; border-radius: 99px; font-weight: 800; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 0.35rem;"><i aria-hidden="true" class="fa-solid fa-check-double"></i> Online Payment Verified</span>';
              } else if (aType === 'OLD_DUE_ADDED') {
                cardBorderLeft = 'border-left: 5px solid #D97706;';
                cardBg = '#FFFBEB;';
                typePill = '<span style="background: #FEF3C7; color: #92400E; border: 1.5px solid #FCD34D; padding: 0.25rem 0.75rem; border-radius: 99px; font-weight: 800; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 0.35rem;"><i aria-hidden="true" class="fa-solid fa-clock-rotate-left"></i> Old Due Added</span>';
              } else if (aType === 'STUDENT_PERMANENTLY_DELETED') {
                cardBorderLeft = 'border-left: 5px solid #DC2626;';
                cardBg = '#FEF2F2;';
                typePill = '<span style="background: #FEE2E2; color: #991B1B; border: 1.5px solid #FCA5A5; padding: 0.25rem 0.75rem; border-radius: 99px; font-weight: 800; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 0.35rem;"><i aria-hidden="true" class="fa-solid fa-trash-can"></i> Student Deleted &amp; Purged</span>';
              } else if (aType === 'STUDENT_PASSWORD_RESET') {
                cardBorderLeft = 'border-left: 5px solid #0D9488;';
                cardBg = '#F0FDFA;';
                typePill = '<span style="background: #CCFBF1; color: #0F766E; border: 1.5px solid #5EEAD4; padding: 0.25rem 0.75rem; border-radius: 99px; font-weight: 800; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 0.35rem;"><i aria-hidden="true" class="fa-solid fa-key"></i> Password Reset to DOB</span>';
              } else if (aType === 'PROFILE_APPROVED' || aType === 'PROFILE_EDITED') {
                cardBorderLeft = 'border-left: 5px solid #2563EB;';
                cardBg = '#EFF6FF;';
                typePill = '<span style="background: #DBEAFE; color: #1E40AF; border: 1.5px solid #93C5FD; padding: 0.25rem 0.75rem; border-radius: 99px; font-weight: 800; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 0.35rem;"><i aria-hidden="true" class="fa-solid fa-user-pen"></i> Profile Updated</span>';
              } else if (aType === 'NOTICE_BROADCAST') {
                cardBorderLeft = 'border-left: 5px solid #4F46E5;';
                cardBg = '#EEF2FF;';
                typePill = '<span style="background: #E0E7FF; color: #3730A3; border: 1.5px solid #A5B4FC; padding: 0.25rem 0.75rem; border-radius: 99px; font-weight: 800; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 0.35rem;"><i aria-hidden="true" class="fa-solid fa-bullhorn"></i> Announcement</span>';
              } else {
                cardBorderLeft = 'border-left: 5px solid #C026D3;';
                cardBg = '#FDF4FF;';
                typePill = '<span style="background: #FAE8FF; color: #86198F; border: 1.5px solid #F0ABFC; padding: 0.25rem 0.75rem; border-radius: 99px; font-weight: 800; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 0.35rem;"><i aria-hidden="true" class="fa-solid fa-user-plus"></i> Student Registered</span>';
              }

              return `
                <div class="admin-audit-log-card" style="${cardBorderLeft} background: ${cardBg};">
                  <div style="flex: 1; min-width: 250px;">
                    <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; margin-bottom: 0.35rem;">
                      ${typePill}
                      <span style="font-size: 0.8rem; font-weight: 700; color: var(--primary-emerald); background: rgba(6, 78, 59, 0.08); padding: 0.15rem 0.5rem; border-radius: 4px;">
                        <i aria-hidden="true" class="fa-solid fa-user-tie"></i> ${escapeHtml(log.actor)}
                      </span>
                      <span style="font-size: 0.8rem; color: var(--text-muted);"><i aria-hidden="true" class="fa-regular fa-clock"></i> ${escapeHtml(log.timestamp)}</span>
                    </div>
                    <div style="font-weight: 700; font-size: 0.95rem; color: var(--text-mahogany); margin-bottom: 0.2rem;">${escapeHtml(log.description)}</div>
                    <div style="font-size: 0.8rem; color: var(--text-muted);">Target Student: <strong>${escapeHtml(log.studentName)}</strong> (Roll #${escapeHtml(log.studentRoll)})</div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>
    `;

    pane.querySelector('#adminAuditEducatorSelect')?.addEventListener('change', (e) => {
      currentAuditEducator = e.target.value;
      renderAdminAuditHistoryTab();
    });

    pane.querySelector('#btnClearEducatorFilter')?.addEventListener('click', () => {
      currentAuditEducator = 'all';
      renderAdminAuditHistoryTab();
    });

    let auditSearchDebounce = null;
    const searchIn = pane.querySelector('#adminAuditSearchInput');
    searchIn?.addEventListener('input', (e) => {
      currentAuditSearch = e.target.value;
      const start = e.target.selectionStart;
      const end = e.target.selectionEnd;
      if (auditSearchDebounce) clearTimeout(auditSearchDebounce);
      auditSearchDebounce = setTimeout(() => {
        renderAdminAuditHistoryTab();
        const updatedIn = document.getElementById('adminAuditSearchInput');
        if (updatedIn) {
          updatedIn.focus();
          updatedIn.setSelectionRange(start, end);
        }
      }, 120);
    });

    pane.querySelectorAll('[data-audit-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        currentAuditFilter = btn.dataset.auditFilter;
        renderAdminAuditHistoryTab();
      });
    });

    pane.querySelector('#btnClearAllAuditLogs')?.addEventListener('click', () => {
      openAuditLogPurgeSecurityModal();
    });
  }

  /* ==========================================================================
   * STRICT SECURITY AUDIT PURGE MODAL (MAIN ADMIN CHANDAN KUMAR ONLY)
   * ========================================================================== */
  function openAuditLogPurgeSecurityModal() {
    if (!isMainAdmin()) {
      alert('⚠️ Access Denied: Only Main Admin Chandan Kumar is authorized to purge the master audit history.');
      return;
    }

    const allLogs = AppState.getAuditLogs();
    const totalCount = allLogs.length;
    if (totalCount === 0) {
      alert('ℹ️ Master audit history log is already empty.');
      return;
    }

    document.getElementById('auditPurgeModal')?.remove();

    const modalHtml = `
      <div class="inner-modal-backdrop active" id="auditPurgeModal" style="display: flex; position: fixed; inset: 0; background: rgba(0,0,0,0.75); z-index: 99999; align-items: center; justify-content: center; padding: 0.75rem; backdrop-filter: blur(5px); overflow-y: auto; -webkit-overflow-scrolling: touch;">
        <div class="inner-modal-content audit-purge-modal-card" style="max-width: 540px; width: 100%; max-height: min(92vh, 92dvh); background: #FFFFFF; border-radius: 12px; border: 2.5px solid #DC2626; box-shadow: 0 20px 50px rgba(220,38,38,0.35); overflow-y: auto; -webkit-overflow-scrolling: touch; display: flex; flex-direction: column; padding: 0 !important; margin: auto;">
          
          <!-- Danger Header -->
          <div class="audit-purge-header" style="background: linear-gradient(135deg, #DC2626 0%, #991B1B 100%); color: #fff; padding: 0.85rem 1.15rem; display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; border-top-left-radius: 9px; border-top-right-radius: 9px;">
            <div style="display: flex; align-items: center; gap: 0.65rem;">
              <i aria-hidden="true" class="fa-solid fa-triangle-exclamation" style="font-size: 1.35rem; color: #FEE2E2;"></i>
              <div>
                <h3 style="margin: 0; font-size: 1rem; font-weight: 800; color: #fff; letter-spacing: 0.2px;">
                  ⚠️ STRICT SECURITY CONFIRMATION
                </h3>
                <div style="font-size: 0.75rem; color: #FEE2E2; margin-top: 0.1rem;">Main Admin Exclusive Action — Chandan Kumar</div>
              </div>
            </div>
            <button type="button" id="btnCloseAuditPurgeHeader" aria-label="Close audit purge dialog" style="background: none; border: none; color: #fff; font-size: 1.25rem; cursor: pointer; padding: 0.25rem; min-width: 36px; min-height: 36px; display: inline-flex; align-items: center; justify-content: center;">
              <i aria-hidden="true" class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <!-- Body Content -->
          <div style="padding: 1rem 1.15rem; display: flex; flex-direction: column; gap: 0.75rem;">
            
            <!-- Warning Alert Box -->
            <div style="background: #FEF2F2; border: 1.5px solid #F87171; border-radius: 8px; padding: 0.65rem 0.85rem; color: #991B1B;">
              <div style="font-weight: 800; font-size: 0.88rem; display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.25rem;">
                <i aria-hidden="true" class="fa-solid fa-trash-can"></i> Action: Permanent Deletion of All Audit Logs (${totalCount} Records)
              </div>
              <p style="font-size: 0.8rem; line-height: 1.45; margin: 0; color: #7F1D1D;">
                You are about to permanently purge all <strong>${totalCount} historical activity logs</strong> from both local browser storage and the cloud database. Once deleted, this activity timeline cannot be recovered.
              </p>
            </div>

            <!-- Guaranteed Protected Data Card -->
            <div style="background: #F0FDF4; border: 1.5px solid #86EFAC; border-radius: 8px; padding: 0.65rem 0.85rem; color: #166534;">
              <div style="font-weight: 800; font-size: 0.82rem; display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.3rem; color: #14532D;">
                <i aria-hidden="true" class="fa-solid fa-shield-halved" style="color: #16A34A;"></i> GUARANTEED DATA SAFETY (100% Protected & Zero Impact):
              </div>
              <ul style="margin: 0; padding-left: 1.1rem; font-size: 0.78rem; line-height: 1.45; color: #166534;">
                <li><strong>Student Pending Dues & Balances:</strong> 100% Intact & Unaffected</li>
                <li><strong>Collected Revenue & Fee Receipts:</strong> 100% Intact & Unaffected</li>
                <li><strong>Student Profiles, Roll Numbers & Classes:</strong> 100% Intact & Unaffected</li>
                <li><strong>Portal Passwords, Batches & Announcements:</strong> 100% Intact & Unaffected</li>
              </ul>
            </div>

            <!-- Typed Confirmation Input -->
            <div>
              <label for="confirmAuditPurgeInput" style="display: block; font-size: 0.8rem; font-weight: 700; color: var(--text-mahogany, #5A2E25); margin-bottom: 0.3rem;">
                To confirm permanent deletion, type <code style="background: #FEE2E2; color: #991B1B; padding: 0.15rem 0.45rem; border-radius: 4px; font-weight: 800;">DELETE</code> below:
              </label>
              <input type="text" id="confirmAuditPurgeInput" class="portal-input" placeholder="TYPE DELETE TO ENABLE BUTTON" style="width: 100%; font-size: 0.88rem; padding: 0.55rem 0.85rem; border: 1.5px solid #CBD5E1; border-radius: 6px; text-transform: uppercase; box-sizing: border-box;">
            </div>

            <!-- Action Buttons Footer directly inside dialog flow -->
            <div style="display: flex; justify-content: flex-end; align-items: center; gap: 0.65rem; margin-top: 0.35rem; padding-top: 0.65rem; border-top: 1px solid #E2E8F0; flex-wrap: wrap;">
              <button type="button" id="btnCancelPurgeAuditLogs" class="btn" style="background: #E2E8F0; color: #334155; font-weight: 800; padding: 0.55rem 1.1rem; font-size: 0.85rem; border-radius: 6px; cursor: pointer; border: none; min-height: 38px;">
                Cancel / Keep Data
              </button>
              <button type="button" id="btnConfirmPurgeAuditLogs" class="btn" disabled style="background: #94A3B8; color: #fff; font-weight: 800; padding: 0.55rem 1.25rem; font-size: 0.85rem; border-radius: 6px; cursor: not-allowed; display: inline-flex; align-items: center; gap: 0.4rem; border: none; min-height: 38px; transition: all 0.2s;">
                <i aria-hidden="true" class="fa-solid fa-trash-can"></i> Permanently Purge Logs
              </button>
            </div>

          </div>

        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const purgeDialog = wireModalA11y('auditPurgeModal', {
      closeOnBackdrop: false,
      initialFocus: '#confirmAuditPurgeInput'
    });

    document.getElementById('btnCloseAuditPurgeHeader')?.addEventListener('click', () => purgeDialog.close());
    document.getElementById('btnCancelPurgeAuditLogs')?.addEventListener('click', () => purgeDialog.close());

    const input = document.getElementById('confirmAuditPurgeInput');
    const confirmBtn = document.getElementById('btnConfirmPurgeAuditLogs');

    input?.addEventListener('input', (e) => {
      if (e.target.value.trim().toUpperCase() === 'DELETE') {
        confirmBtn.disabled = false;
        confirmBtn.style.background = 'linear-gradient(135deg, #DC2626 0%, #991B1B 100%)';
        confirmBtn.style.cursor = 'pointer';
        confirmBtn.style.boxShadow = '0 3px 10px rgba(220,38,38,0.35)';
      } else {
        confirmBtn.disabled = true;
        confirmBtn.style.background = '#94A3B8';
        confirmBtn.style.cursor = 'not-allowed';
        confirmBtn.style.boxShadow = 'none';
      }
    });

    confirmBtn?.addEventListener('click', async () => {
      if (input.value.trim().toUpperCase() !== 'DELETE') return;

      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<i aria-hidden="true" class="fa-solid fa-spinner fa-spin"></i> Purging Database...';

      try {
        await AppState.clearAllAuditLogs();
        purgeDialog.close();
        alert(`🗑️ Master audit log purge complete!\n\n• All ${totalCount} previous activity entries have been cleared from database & local storage.\n• Student dues, fee balances, receipts, and profiles remain 100% safe & intact.`);
        renderAdminAuditHistoryTab();
        renderAdminDashboard();
      } catch (err) {
        console.error('Failed to clear audit logs:', err);
        alert('❌ Error deleting audit logs: ' + (err.message || 'Unknown error'));
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = '<i aria-hidden="true" class="fa-solid fa-trash-can"></i> Permanently Purge Logs';
      }
    });
  }


  /* ==========================================================================
   * ADMIN ARTICLES & BLOG MANAGER
   * ========================================================================== */
  const BLOG_STORAGE_KEY = 'pragyan_db_blog_master';
  const BLOG_CATEGORIES_ADMIN = ['Board Exams', 'English Speaking', 'Study Tips', 'Institute News'];
  let blogAdminFilter = 'all';
  let blogCoverUploadUrl = '';

  const DEFAULT_SEED_BLOG_POSTS = [
    {
      id: '00000000-0000-0000-0000-000000000001',
      slug: 'class-10-cbse-bseb-board-exam-strategy-2026',
      title: 'Top 5 Strategies to Score 95%+ in Class 10th Board Exams (CBSE & BSEB)',
      excerpt: 'A step-by-step revision routine by Chandan Sir covering NCERT mastery, time management in 3-hour papers, and daily self-assessment.',
      category: 'Board Exams',
      tags: ['class-10', 'board-exams', 'revision-strategy', 'toppers-guide'],
      author_name: 'Chandan Kumar',
      author_role: 'Science Lead & Head Admin',
      read_time_minutes: 4,
      views_count: 0,
      published_at: '2026-08-20T10:00:00Z',
      created_at: '2026-08-20T10:00:00Z',
      is_published: true,
      content_markdown: `### The Golden Formula for Board Exam Success

Every year, students ask: *"How many hours should I study to get 95%+ in Class 10th?"*
The truth is that **strategy beats sheer hours**. Here is the exact roadmap we follow at Pragyan Institute.

---

#### 1. Master NCERT Exemplar & Concept Clarity
- **Science**: Focus heavily on Chemical Reactions, Electricity numericals, and Life Processes diagrams.
- **Maths**: Solve every single NCERT exercise problem twice before touching reference books.

:::tip
Always practice with a real stopwatch. Completing the paper 15 minutes before time gives you crucial revision margin.
:::

#### 2. Weekly Timed Mock Tests
Take full 80-mark mock tests every Sunday. Analyze your silly mistakes in a separate **Error Notebook**.

> "Mistakes made in practice are lessons; mistakes made in final exams are lost marks."

#### 3. Answer Presentation Matters
- Write in clean bullet points.
- Highlight final numerical answers with neat boxes.
- Draw diagrams with sharp pencils and clear labels.`
    },
    {
      id: '00000000-0000-0000-0000-000000000002',
      slug: 'spoken-english-confidence-guide-for-school-students',
      title: 'How to Speak English Fluently Without Fear: A Guide for Hindi Medium Students',
      excerpt: 'Overcoming hesitations in group discussions, building daily 10-minute vocabulary habits, and practical conversational drills.',
      category: 'English Speaking',
      tags: ['spoken-english', 'personality-development', 'communication-skills'],
      author_name: 'Aditi Singh',
      author_role: 'Language Mentor',
      read_time_minutes: 3,
      views_count: 0,
      published_at: '2026-08-21T12:00:00Z',
      created_at: '2026-08-21T12:00:00Z',
      is_published: true,
      content_markdown: `### Overcoming the Hesitation Barrier

Most students understand written English well, but when asked to speak in front of a class, fear of grammatical mistakes takes over.

---

#### 3 Simple Daily Habits for Fluency:
1. **The 2-Minute Mirror Drill**: Pick any topic (e.g. *"My favorite science topic"*) and speak continuously for 2 minutes without stopping.
2. **Think in English**: Instead of translating Hindi sentences in your mind, practice naming objects and thoughts directly in simple English.
3. **Weekly Group Discussions**: Participate actively in Pragyan's free Saturday GD sessions.

:::info
Fluency is not about using complex words — it is about expressing your ideas clearly and confidently.
:::`
    },
    {
      id: '00000000-0000-0000-0000-000000000003',
      slug: 'class-12-pcm-higher-mathematics-calculus-blueprint',
      title: 'Class 12th PCM: How to Master Calculus & Differential Equations',
      excerpt: 'Prof. Ravi Ranjan explains the highest weightage calculus topics, standard integration patterns, and shortcut methods for competitive exams.',
      category: 'Board Exams',
      tags: ['class-12', 'mathematics', 'calculus', 'integration'],
      author_name: 'Prof. Ravi Ranjan',
      author_role: 'Higher Mathematics Specialist',
      read_time_minutes: 5,
      views_count: 0,
      published_at: '2026-08-22T14:30:00Z',
      created_at: '2026-08-22T14:30:00Z',
      is_published: true,
      content_markdown: `### Calculus Accounts for 35%+ of Higher Mathematics

In Class 12th board exams, Calculus carries the highest single weightage. If you master differentiation and integration fundamentals, scoring 90+ in Maths becomes guaranteed.

---

#### Focus Areas for 12th Board Exams:
- **Definite Integrals**: Properties of definite integrals are guaranteed 5-mark questions.
- **Differential Equations**: Linear differential equations with integrating factors.
- **Application of Derivatives**: Maxima & Minima word problems.

:::tip
Draw rough sketches for Area Under Curves problems — it prevents coordinate sign errors!
:::`
    }
  ];

  function blogReadLocal() {
    try {
      if (window.SupabaseSync && typeof window.SupabaseSync.getAll === 'function') {
        const synced = window.SupabaseSync.getAll('blog_posts');
        if (Array.isArray(synced) && synced.length > 0) return synced;
      }
      const stored = localStorage.getItem(BLOG_STORAGE_KEY);
      if (stored !== null) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
      const seeds = (typeof window !== 'undefined' && Array.isArray(window.SEED_BLOG_POSTS) && window.SEED_BLOG_POSTS.length)
        ? window.SEED_BLOG_POSTS
        : DEFAULT_SEED_BLOG_POSTS;
      blogWriteLocal(seeds);
      return seeds;
    } catch (_) {
      return DEFAULT_SEED_BLOG_POSTS;
    }
  }
  function blogWriteLocal(list) {
    AppState.safeSetItem(BLOG_STORAGE_KEY, list);
    if (AppState._blogCache) AppState._blogCache = list;
  }
  function blogStripMarkdown(md) {
    return String(md || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/[#>*_`~\-]{1,}/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/\s+/g, ' ').trim();
  }

  let _isSyncingBlog = false;
  let _blogTabSyncInterval = null;

  async function syncAdminBlogPostsFromCloud(silent = false) {
    if (_isSyncingBlog) return;
    _isSyncingBlog = true;
    const btnRefresh = document.getElementById('btnRefreshBlogViews');
    if (btnRefresh && !silent) {
      btnRefresh.disabled = true;
      btnRefresh.innerHTML = '<i aria-hidden="true" class="fa-solid fa-arrows-rotate fa-spin"></i> Syncing…';
    }

    try {
      let livePosts = null;
      if (window.SupabaseSync && typeof window.SupabaseSync._apiDb === 'function') {
        try {
          const res = await window.SupabaseSync._apiDb('blog_posts', 'select', { filters: { limit: 100 } });
          if (Array.isArray(res)) livePosts = res;
        } catch (_) {}
      }
      if (!livePosts) {
        const token = sessionStorage.getItem('pragyan_portal_token') || localStorage.getItem('pragyan_portal_token') || AppState.token;
        const resp = await fetch('/api/db', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ table: 'blog_posts', operation: 'select', filters: { limit: 100 } })
        });
        const json = await resp.json().catch(() => ({}));
        if (json && json.success && Array.isArray(json.data)) {
          livePosts = json.data;
        }
      }

      // If database is completely uninitialized (0 rows), auto-seed default articles to cloud
      if (!livePosts || livePosts.length === 0) {
        try {
          const seeds = (typeof window !== 'undefined' && Array.isArray(window.SEED_BLOG_POSTS) && window.SEED_BLOG_POSTS.length)
            ? window.SEED_BLOG_POSTS
            : DEFAULT_SEED_BLOG_POSTS;
          if (window.SupabaseSync && typeof window.SupabaseSync._apiDb === 'function') {
            await window.SupabaseSync._apiDb('blog_posts', 'upsert', {
              data: seeds,
              filters: { conflict: 'slug' }
            });
            const refreshed = await window.SupabaseSync._apiDb('blog_posts', 'select', { filters: { limit: 100 } });
            if (Array.isArray(refreshed) && refreshed.length > 0) livePosts = refreshed;
          }
        } catch (seedErr) {
          console.warn('[syncAdminBlogPostsFromCloud] Seeding notice:', seedErr.message);
        }
      }

      if (Array.isArray(livePosts) && livePosts.length > 0) {
        // Also merge any local view counts from pragyan_blog_views_cache if higher
        let viewsMap = {};
        try {
          const rawV = localStorage.getItem('pragyan_blog_views_cache');
          if (rawV) viewsMap = JSON.parse(rawV);
        } catch (_) {}

        const synced = livePosts.map(lp => {
          const normalized = window.SupabaseSync?.normalizeBlogPost ? window.SupabaseSync.normalizeBlogPost(lp) : lp;
          return {
            ...normalized,
            is_published: !!lp.is_published,
            views_count: Math.max(Number(lp.views_count) || 0, Number(viewsMap[lp.slug]) || 0)
          };
        });

        blogWriteLocal(synced);
        renderAdminBlogTab(true);
        if (!silent) {
          showNotification('📊 Real-time view counts & articles synced from database!', 'success');
        }
      }
    } catch (err) {
      console.warn('[syncAdminBlogPostsFromCloud] Note:', err.message);
    } finally {
      _isSyncingBlog = false;
      if (btnRefresh) {
        btnRefresh.disabled = false;
        btnRefresh.innerHTML = '<i aria-hidden="true" class="fa-solid fa-arrows-rotate"></i> Refresh Views';
      }
    }
  }

  // Cross-tab real-time blog views & post updates listener
  try {
    const blogBc = new BroadcastChannel('pragyan_portal_sync');
    blogBc.addEventListener('message', (e) => {
      if (e.data && (e.data.type === 'BLOG_POST_UPDATED' || e.data.type === 'BLOG_VIEWS_UPDATED')) {
        if (e.data.type === 'BLOG_POST_UPDATED') {
          syncAdminBlogPostsFromCloud(true);
        } else if (e.data.slug) {
          const posts = blogReadLocal();
          const target = posts.find(p => p.slug === e.data.slug);
          if (target) {
            target.views_count = Math.max(Number(target.views_count) || 0, Number(e.data.count) || 0);
            blogWriteLocal(posts);
            const pane = document.getElementById('adminTabPane-blog');
            if (pane && (pane.classList.contains('active') || pane.style.display !== 'none')) {
              renderAdminBlogTab(true);
            }
          }
        }
      }
    });
  } catch (_) {}

  function renderAdminBlogTab(fromSync = false) {
    const pane = document.getElementById('adminTabPane-blog');
    if (!pane) return;

    const posts = blogReadLocal().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    const totalViews = posts.reduce((s, p) => s + (Number(p.views_count) || 0), 0);
    const publishedCount = posts.filter(p => p.is_published).length;

    const filtered = posts.filter(p => {
      if (blogAdminFilter === 'all') return true;
      if (blogAdminFilter === 'published') return !!p.is_published;
      if (blogAdminFilter === 'drafts') return !p.is_published;
      return p.category === blogAdminFilter;
    });

    const filterOptions = [['all','All'],['published','Published'],['drafts','Drafts']]
      .concat(BLOG_CATEGORIES_ADMIN.map(c => [c, c]));

    pane.innerHTML = `
      <div class="admin-stats-grid" style="margin-bottom:1.25rem;">
        <div class="admin-stat-card"><div class="admin-icon-square"><i aria-hidden="true" class="fa-solid fa-newspaper"></i></div>
          <div class="admin-stat-info"><h3>${posts.length}</h3><p>Total Articles</p></div></div>
        <div class="admin-stat-card"><div class="admin-icon-square"><i aria-hidden="true" class="fa-solid fa-circle-check"></i></div>
          <div class="admin-stat-info"><h3 style="color:var(--status-success-fg);">${publishedCount}</h3><p>Published</p></div></div>
        <div class="admin-stat-card"><div class="admin-icon-square" style="background-color:#FEF3C7;color:#92400E;"><i aria-hidden="true" class="fa-solid fa-pen-ruler"></i></div>
          <div class="admin-stat-info"><h3 style="color:#92400E;">${posts.length - publishedCount}</h3><p>Drafts</p></div></div>
        <div class="admin-stat-card"><div class="admin-icon-square" style="background-color:rgba(217,119,6,.14);color:var(--gold-700);"><i aria-hidden="true" class="fa-solid fa-eye"></i></div>
          <div class="admin-stat-info"><h3>${totalViews.toLocaleString('en-IN')}</h3><p>Total Reads</p></div></div>
      </div>

      <div class="dash-card">
        <div class="dash-card-header">
          <h3 class="dash-card-title"><i aria-hidden="true" class="fa-solid fa-feather-pointed"></i> Article Manager</h3>
          <div style="display:flex; gap:0.6rem; align-items:center; flex-wrap:wrap;">
            <label for="blogAdminFilter" class="sr-only">Filter articles</label>
            <select id="blogAdminFilter" style="min-height:38px; padding:0.4rem 0.7rem; border-radius:8px; border:1px solid var(--border-sand); font-weight:600;">
              ${filterOptions.map(o => `<option value="${o[0]}" ${blogAdminFilter === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}
            </select>
            <button type="button" class="btn btn-outline" id="btnRefreshBlogViews" style="min-height:38px; padding:0.4rem 0.85rem; display:inline-flex; align-items:center; gap:0.4rem; font-weight:600;" title="Sync real-time article views and database changes">
              <i aria-hidden="true" class="fa-solid fa-arrows-rotate"></i> Refresh Views
            </button>
            <button type="button" class="btn btn-emerald" id="btnNewBlogPost" style="padding:0.55rem 1.1rem;">
              <i aria-hidden="true" class="fa-solid fa-plus"></i> New Article
            </button>
          </div>
        </div>

        ${filtered.length === 0 ? `
          <div style="text-align:center; color:var(--text-secondary); padding:2.5rem 1rem;">
            <i aria-hidden="true" class="fa-solid fa-feather-pointed" style="font-size:2.2rem; opacity:.5;"></i>
            <p style="font-weight:600; margin-top:0.6rem;">No articles here yet.</p>
            <button type="button" class="btn btn-emerald" data-blog-edit="new" style="margin-top:0.75rem;">Write your first article</button>
          </div>` : `
          <div class="table-responsive">
            <table class="portal-table">
              <thead><tr>
                <th>Cover</th><th>Title</th><th>Category</th><th>Status</th><th>Views</th><th>Date</th><th>Actions</th>
              </tr></thead>
              <tbody>
                ${filtered.map(p => `
                  <tr data-blog-row="${p.id || p.slug}">
                    <td>${p.cover_image_url
                      ? `<img src="${sanitizeInput(p.cover_image_url)}" alt="" style="width:64px;height:40px;object-fit:cover;border-radius:6px;border:1px solid var(--border-sand);">`
                      : `<span style="display:inline-flex;width:64px;height:40px;border-radius:6px;background:linear-gradient(135deg,var(--primary-emerald),#022C22);color:#fff;align-items:center;justify-content:center;font-weight:800;">${escapeHtml((p.title || 'B').charAt(0))}</span>`}</td>
                    <td><strong>${sanitizeInput(p.title)}</strong><br><span style="font-size:.78rem;color:var(--text-muted);">/${sanitizeInput(p.slug)}</span></td>
                    <td>${sanitizeInput(p.category)}</td>
                    <td><span class="status-badge ${p.is_published ? 'status-verified' : 'status-adjusted'}">${p.is_published ? 'Published' : 'Draft'}</span></td>
                    <td>${(Number(p.views_count) || 0).toLocaleString('en-IN')}</td>
                    <td>${(p.published_at || p.created_at) ? new Date(p.published_at || p.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
                    <td>
                      <div style="display:flex;gap:0.35rem;flex-wrap:wrap;">
                        <button type="button" class="btn-action" data-blog-edit="${p.id || p.slug}" aria-label="Edit article ${sanitizeInput(p.title)}" title="Edit"><i aria-hidden="true" class="fa-solid fa-pen"></i></button>
                        <button type="button" class="btn-action" data-blog-toggle="${p.id || p.slug}" aria-label="${p.is_published ? 'Unpublish' : 'Publish'} article ${sanitizeInput(p.title)}" title="${p.is_published ? 'Unpublish' : 'Publish Live'}">
                          <i aria-hidden="true" class="fa-solid ${p.is_published ? 'fa-eye-slash' : 'fa-paper-plane'}"></i></button>
                        <button type="button" class="btn-action" data-blog-delete="${p.id || p.slug}" aria-label="Delete article ${sanitizeInput(p.title)}" title="Delete" style="color:#DC2626;"><i aria-hidden="true" class="fa-solid fa-trash"></i></button>
                      </div>
                    </td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>`}
      </div>`;

    pane.querySelector('#blogAdminFilter')?.addEventListener('change', (e) => {
      blogAdminFilter = e.target.value;
      renderAdminBlogTab(true);
    });
    pane.querySelector('#btnRefreshBlogViews')?.addEventListener('click', () => syncAdminBlogPostsFromCloud(false));
    pane.querySelector('#btnNewBlogPost')?.addEventListener('click', () => openBlogEditor(null));
    pane.querySelector('[data-blog-edit="new"]')?.addEventListener('click', () => openBlogEditor(null));

    pane.querySelectorAll('[data-blog-edit]').forEach(b => {
      if (b.dataset.blogEdit === 'new') return;
      b.addEventListener('click', () => {
        const post = blogReadLocal().find(x => x.id === b.dataset.blogEdit || x.slug === b.dataset.blogEdit);
        if (post) openBlogEditor(post);
      });
    });

    pane.querySelectorAll('[data-blog-toggle]').forEach(b => {
      b.addEventListener('click', async () => {
        const post = blogReadLocal().find(x => x.id === b.dataset.blogToggle || x.slug === b.dataset.blogToggle);
        if (!post) return;
        const goingLive = !post.is_published;
        if (goingLive && !confirm(`Publish "${post.title}" live to the website now?`)) return;
        b.disabled = true;
        const payload = {
          ...post,
          is_published: goingLive,
          published_at: post.published_at || (goingLive ? new Date().toISOString() : null),
          updated_at: new Date().toISOString()
        };
        delete payload._local_id;

        // Immediately update local storage and re-render admin UI stably
        const updatedList = blogReadLocal().map(x => (x.id === post.id || x.slug === post.slug) ? payload : x);
        blogWriteLocal(updatedList);
        renderAdminBlogTab(true);

        try {
          let result = null;
          if (post.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(post.id)) {
            result = await SupabaseSync.mutate('blog_posts', 'update', payload, { where: { id: post.id } });
          }
          if (!result || result.success !== true || (Array.isArray(result.data) && result.data.length === 0)) {
            result = await SupabaseSync.mutate('blog_posts', 'update', payload, { where: { slug: post.slug } });
          }
          if (!result || result.success !== true || (Array.isArray(result.data) && result.data.length === 0)) {
            result = await SupabaseSync.mutate('blog_posts', 'upsert', payload, { conflict: 'slug' });
          }

          if (result && result.success && Array.isArray(result.data) && result.data[0]) {
            const savedRow = result.data[0];
            const current = blogReadLocal().map(x => (x.id === post.id || x.slug === post.slug) ? { ...x, ...savedRow } : x);
            blogWriteLocal(current);
            renderAdminBlogTab(true);
          }
        } catch (err) {
          console.warn('[blog-toggle] Database error:', err.message);
        }

        // Broadcast publish toggle to open tabs and public home view
        try {
          const bc = new BroadcastChannel('pragyan_portal_sync');
          bc.postMessage({ type: 'BLOG_POST_UPDATED', slug: post.slug, is_published: goingLive });
          bc.close();
        } catch (_) {}

        showNotification(goingLive ? `"${post.title}" is now LIVE on the website.` : `"${post.title}" moved back to drafts.`, 'success');
      });
    });

    pane.querySelectorAll('[data-blog-delete]').forEach(b => {
      b.addEventListener('click', async () => {
        const post = blogReadLocal().find(x => x.id === b.dataset.blogDelete || x.slug === b.dataset.blogDelete);
        if (!post) return;
        if (!confirm(`DELETE "${post.title}" permanently?\n\nThis cannot be undone.`)) return;
        b.disabled = true;
        try {
          const deleteFilter = (post.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(post.id))
            ? { id: post.id }
            : { slug: post.slug };
          let res = await SupabaseSync.mutate('blog_posts', 'delete', null, { where: deleteFilter });
          if (!res || res.success !== true || (Array.isArray(res.data) && res.data.length === 0)) {
            if (post.slug && (!deleteFilter.slug)) {
              await SupabaseSync.mutate('blog_posts', 'delete', null, { where: { slug: post.slug } });
            }
          }
          const remaining = blogReadLocal().filter(x => x.id !== post.id && x.slug !== post.slug);
          blogWriteLocal(remaining);
          renderAdminBlogTab(true);

          // Broadcast deletion across tabs
          try {
            const bc = new BroadcastChannel('pragyan_portal_sync');
            bc.postMessage({ type: 'BLOG_POST_UPDATED', slug: post.slug, deleted: true });
            bc.close();
          } catch (_) {}

          showNotification('Article deleted permanently from database.', 'success');
        } catch (err) {
          alert(`Delete failed: ${err.message}`);
          b.disabled = false;
        }
      });
    });

    // If not triggered from sync, start background cloud sync to ensure view counts are real-time
    if (!fromSync) {
      syncAdminBlogPostsFromCloud(true);

      // Auto-poll real-time views every 15s while on the blog tab
      if (_blogTabSyncInterval) clearInterval(_blogTabSyncInterval);
      _blogTabSyncInterval = setInterval(() => {
        const activePane = document.getElementById('adminTabPane-blog');
        if (activePane && (activePane.classList.contains('active') || activePane.style.display !== 'none')) {
          syncAdminBlogPostsFromCloud(true);
        } else {
          clearInterval(_blogTabSyncInterval);
          _blogTabSyncInterval = null;
        }
      }, 15000);
    }
  }
  /* -- Blog editor modal ------------------------------------------------------ */
  function openBlogEditor(post) {
    document.getElementById('blogEditorModal')?.remove();
    const isNew = !post;
    const md = (typeof window !== 'undefined' && window.PragyanBlogMarkdown) || null;
    if (!md) { alert('The editor module did not load. Please refresh the page.'); return; }

    const values = {
      id: post?.id || '',
      slug: post?.slug || '',
      title: post?.title || '',
      excerpt: post?.excerpt || '',
      content_markdown: post?.content_markdown || '',
      cover_image_url: post?.cover_image_url || '',
      category: post?.category || 'Study Tips',
      tags: Array.isArray(post?.tags) ? post.tags.join(', ') : '',
      is_published: Boolean(post?.is_published),
      views_count: Number(post?.views_count) || 0,
      published_at: post?.published_at || null,
      created_at: post?.created_at || ''
    };
    blogCoverUploadUrl = values.cover_image_url;

    const modalHtml = `
      <div class="inner-modal-backdrop active" id="blogEditorModal">
        <div class="inner-modal-content" role="dialog" aria-modal="true" aria-labelledby="blogEditorTitle" tabindex="-1" style="max-width:860px; width:100%; max-height:92vh; overflow-y:auto;">
          <div class="inner-modal-header blog-editor-header">
            <div style="display:flex; align-items:center; gap:0.65rem;">
              <div class="blog-editor-icon-badge">
                <i aria-hidden="true" class="fa-solid fa-feather-pointed"></i>
              </div>
              <div>
                <h3 id="blogEditorTitle" class="blog-editor-title" style="margin:0; font-family:var(--font-heading); font-size:1.2rem; color:var(--text-mahogany);">
                  ${isNew ? 'Write a New Article' : 'Edit Article'}
                </h3>
                <p class="blog-editor-subtitle" style="margin:0.2rem 0 0; font-size:0.8rem; color:var(--text-secondary);">Compose rich academic content, strategies, and announcements</p>
              </div>
            </div>
            <button type="button" class="btn-close-inner blog-editor-close-btn" data-blog-editor-close aria-label="Close article editor" title="Close editor">
              <i aria-hidden="true" class="fa-solid fa-xmark"></i>
            </button>
          </div>
          <form id="blogEditorForm" novalidate>
            <div class="form-group">
              <label class="form-label" for="blogEdTitle">Title *</label>
              <input class="form-input" id="blogEdTitle" type="text" required maxlength="140" value="${escapeHtml(values.title)}" placeholder="e.g. Board Exam Strategy: How Toppers Revise in 30 Days">
              <p class="form-hint">The URL slug is generated automatically from the title.</p>
            </div>
            <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:0.9rem;">
              <div class="form-group">
                <label class="form-label" for="blogEdSlug">URL Slug *</label>
                <input class="form-input" id="blogEdSlug" type="text" required value="${escapeHtml(values.slug)}" placeholder="board-exam-strategy">
              </div>
              <div class="form-group">
                <label class="form-label" for="blogEdCategory">Category *</label>
                <select class="form-input" id="blogEdCategory">
                  ${BLOG_CATEGORIES_ADMIN.map(c => `<option value="${c}" ${values.category === c ? 'selected' : ''}>${c}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label" for="blogEdTags">Tags <span style="font-weight:400; color:var(--text-muted);">(comma separated)</span></label>
              <input class="form-input" id="blogEdTags" type="text" value="${escapeHtml(values.tags)}" placeholder="class-10, maths, revision">
            </div>
            <div class="form-group">
              <span class="form-label">Cover Image</span>
              <div id="blogCoverZone" tabindex="0" role="button" aria-label="Upload cover image" style="border:2px dashed var(--border-sand-dark); border-radius:var(--radius-md); padding:1rem; text-align:center; cursor:pointer; background:var(--bg-surface-cream);">
                <i aria-hidden="true" class="fa-solid fa-cloud-arrow-up" style="font-size:1.4rem; color:var(--primary-emerald);"></i>
                <div style="font-size:0.85rem; font-weight:700; margin-top:0.3rem;">Click or drop an image here</div>
                <div style="font-size:0.78rem; color:var(--text-secondary);">JPG / PNG / WebP · max 5 MB · stored in pragyan-media/blog_covers/</div>
              </div>
              <input type="file" id="blogCoverInput" accept="image/jpeg,image/png,image/webp" hidden aria-label="Upload cover image">
              <img id="blogCoverPreview" src="${escapeHtml(values.cover_image_url)}" alt="" style="${values.cover_image_url ? 'display:block' : 'display:none'}; margin-top:0.7rem; width:100%; aspect-ratio:16/9; object-fit:cover; border-radius:var(--radius-md); border:1px solid var(--border-sand);">
            </div>
            <div class="form-group">
              <label class="form-label" for="blogEdBody">Article body (Markdown) *</label>
              <textarea class="form-input" id="blogEdBody" rows="12" style="font-family:ui-monospace,Consolas,monospace; font-size:0.88rem;" placeholder="# Heading&#10;&#10;Paragraph with **bold**, *italics*, - bullets, > quotes.&#10;:::tip&#10;Callout boxes like this one.&#10;:::">${escapeHtml(values.content_markdown)}</textarea>
            </div>
            <div class="form-group">
              <button type="button" class="btn btn-outline-sage" id="blogPreviewToggle" aria-expanded="false" style="padding:0.45rem 1rem; font-size:0.85rem;">
                <i aria-hidden="true" class="fa-solid fa-eye"></i> Live Preview
              </button>
              <div id="blogPreviewPane" class="blog-reader-body" hidden style="border:1px solid var(--border-sand); border-radius:var(--radius-md); padding:1.1rem; margin-top:0.7rem; background:var(--bg-surface-pure);"></div>
            </div>
            <div class="blog-editor-actions-bar">
              <button type="button" class="btn btn-outline-sage btn-blog-cancel" data-blog-editor-close>Cancel</button>
              <button type="button" class="btn btn-sage btn-blog-save-draft" data-blog-save="draft"><i aria-hidden="true" class="fa-solid fa-floppy-disk"></i> Save as Draft</button>
              <button type="button" class="btn btn-emerald btn-blog-publish-main" data-blog-save="publish"><i aria-hidden="true" class="fa-solid fa-paper-plane"></i> Publish Live</button>
            </div>
          </form>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modalEl = document.getElementById('blogEditorModal');
    const dialog = wireModalA11y(modalEl, { closeOnBackdrop: false });
    modalEl.querySelectorAll('[data-blog-editor-close]').forEach(b => b.addEventListener('click', () => dialog.close()));

    let slugTouched = Boolean(values.slug);
    const titleIn = modalEl.querySelector('#blogEdTitle');
    const slugIn = modalEl.querySelector('#blogEdSlug');
    titleIn.addEventListener('input', () => { if (!slugTouched) slugIn.value = md.slugifyTitle(titleIn.value); });
    slugIn.addEventListener('input', () => { slugTouched = slugIn.value.trim().length > 0; });

    const zone = modalEl.querySelector('#blogCoverZone');
    const coverInput = modalEl.querySelector('#blogCoverInput');
    const preview = modalEl.querySelector('#blogCoverPreview');
    zone.addEventListener('click', () => coverInput.click());
    zone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); coverInput.click(); } });
    ['dragover', 'dragenter'].forEach(ev => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.style.borderColor = 'var(--primary-emerald)'; }));
    ['dragleave', 'drop'].forEach(ev => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.style.borderColor = 'var(--border-sand-dark)'; }));
    zone.addEventListener('drop', (e) => {
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!file) return;
      try { const dt = new DataTransfer(); dt.items.add(file); coverInput.files = dt.files; } catch (_) {}
      handleCoverFile(file);
    });
    coverInput.addEventListener('change', () => { const f = coverInput.files[0]; if (f) handleCoverFile(f); });

    async function handleCoverFile(file) {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { showNotification('Cover must be a JPG, PNG or WebP image.', 'error'); return; }
      if (file.size > 5 * 1024 * 1024) { showNotification('Cover image must be under 5 MB.', 'error'); return; }
      const icon = zone.querySelector('i');
      icon.className = 'fa-solid fa-spinner fa-spin';
      try {
        blogCoverUploadUrl = await SupabaseSync.uploadFile(file, 'blog_covers');
        preview.src = blogCoverUploadUrl;
        preview.style.display = 'block';
        showNotification('Cover uploaded.', 'success');
      } catch (err) {
        showNotification(err.message || 'Cover upload failed.', 'error');
      } finally {
        icon.className = 'fa-solid fa-cloud-arrow-up';
      }
    }

    const previewToggle = modalEl.querySelector('#blogPreviewToggle');
    const previewPane = modalEl.querySelector('#blogPreviewPane');
    previewToggle.addEventListener('click', () => {
      const showing = !previewPane.hidden;
      if (showing) {
        previewPane.hidden = true;
        previewToggle.setAttribute('aria-expanded', 'false');
        previewToggle.innerHTML = '<i aria-hidden="true" class="fa-solid fa-eye"></i> Live Preview';
      } else {
        previewPane.innerHTML = md.renderMarkdown(modalEl.querySelector('#blogEdBody').value);
        previewPane.hidden = false;
        previewToggle.setAttribute('aria-expanded', 'true');
        previewToggle.innerHTML = '<i aria-hidden="true" class="fa-solid fa-pen"></i> Back to Editing';
      }
    });

    async function saveBlog(mode) {
      const title = titleIn.value.trim();
      const slug = slugIn.value.trim();
      const bodyMd = modalEl.querySelector('#blogEdBody').value.trim();
      const category = modalEl.querySelector('#blogEdCategory').value;

      if (title.length < 5) { showNotification('Give the article a title of at least 5 characters.', 'error'); titleIn.focus(); return; }
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) { showNotification('Slug may only contain lowercase letters, numbers and single hyphens.', 'error'); slugIn.focus(); return; }
      if (bodyMd.length < 50) { showNotification('Article body needs at least 50 characters of content.', 'error'); modalEl.querySelector('#blogEdBody').focus(); return; }
      if (blogReadLocal().some(x => x.slug === slug && x.id !== values.id)) {
        showNotification('That URL slug is already used by another article. Tweak the title or slug.', 'error');
        slugIn.focus();
        return;
      }

      const publishNow = mode === 'publish';
      const plainForExcerpt = blogStripMarkdown(bodyMd);

      // Preserve live database view counts
      const existingLive = blogReadLocal().find(x => x.id === values.id || x.slug === slug);
      const preservedViews = Math.max(Number(existingLive?.views_count) || 0, Number(values.views_count) || 0);

      let postId = values.id;
      if (!postId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(postId)) {
        postId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : undefined;
      }

      const payload = {
        id: postId,
        slug,
        title,
        excerpt: plainForExcerpt.slice(0, 180) || title,
        content_markdown: bodyMd,
        cover_image_url: blogCoverUploadUrl || '',
        category,
        tags: modalEl.querySelector('#blogEdTags').value.split(',').map(t => t.trim()).filter(Boolean).slice(0, 8),
        author_name: (AppState.currentUser && AppState.currentUser.name) || 'Chandan Kumar',
        author_role: (AppState.currentUser && AppState.currentUser.role) || 'Science Lead & Head Admin',
        is_published: publishNow,
        read_time_minutes: md.estimateReadingMinutes(bodyMd),
        views_count: preservedViews,
        published_at: values.published_at || (publishNow ? new Date().toISOString() : null),
        updated_at: new Date().toISOString(),
        created_at: values.created_at || new Date().toISOString()
      };
      if (!payload.id) delete payload.id;

      const saveBtns = modalEl.querySelectorAll('[data-blog-save]');
      saveBtns.forEach(b => { b.disabled = true; });
      try {
        let result = null;
        if (!isNew && values.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(values.id)) {
          result = await SupabaseSync.mutate('blog_posts', 'update', payload, { where: { id: values.id } });
        }
        if (!result || result.success !== true || (Array.isArray(result.data) && result.data.length === 0)) {
          const targetSlug = values.slug || slug;
          result = await SupabaseSync.mutate('blog_posts', 'update', payload, { where: { slug: targetSlug } });
        }
        if (!result || result.success !== true || (Array.isArray(result.data) && result.data.length === 0)) {
          result = await SupabaseSync.mutate('blog_posts', 'upsert', payload, { conflict: 'slug' });
        }
        if (!result || result.success !== true) {
          throw new Error(result && result.error ? result.error : 'Database write rejected');
        }

        const savedRow = (Array.isArray(result.data) && result.data[0]) ? result.data[0] : payload;
        const list = blogReadLocal();
        const idx = list.findIndex(x => (values.id && x.id === values.id) || x.slug === payload.slug || (values.slug && x.slug === values.slug) || (savedRow.id && x.id === savedRow.id));
        if (idx >= 0) {
          list[idx] = Object.assign({}, list[idx], payload, savedRow);
        } else {
          list.unshift(Object.assign({}, payload, savedRow));
        }
        blogWriteLocal(list);

        // Broadcast across tabs and public home view
        try {
          const bc = new BroadcastChannel('pragyan_portal_sync');
          bc.postMessage({ type: 'BLOG_POST_UPDATED', slug: payload.slug, is_published: payload.is_published });
          bc.close();
        } catch (_) {}

        dialog.close();
        renderAdminBlogTab(true);
        showNotification(publishNow ? `"${title}" is LIVE on the website!` : `"${title}" saved as draft.`, 'success');
      } catch (err) {
        saveBtns.forEach(b => { b.disabled = false; });
        showNotification(`Save failed: ${err.message}`, 'error');
      }
    }
    modalEl.querySelectorAll('[data-blog-save]').forEach(b => b.addEventListener('click', () => saveBlog(b.dataset.blogSave)));
  }

  /* ==========================================================================
   * ADMIN PUSH NOTIFICATIONS & BROADCAST HUB
   * ========================================================================== */
  let activePushTargetType = 'ALL';
  let selectedPushBatches = new Set();
  let selectedPushStudentId = null;

  async function renderAdminPushTab() {
    const pane = document.getElementById('adminTabPane-push');
    if (!pane) return;

    const batches = window.PRAGYAN_ACADEMIC?.BATCHES || [];

    pane.innerHTML = `
      <div class="admin-push-hub">
        <div class="push-hub-header">
          <div>
            <h2 class="push-hub-title"><i aria-hidden="true" class="fa-solid fa-tower-broadcast"></i> Instant Push Notifications &amp; Broadcast Hub</h2>
            <p class="push-hub-subtitle">Send real-time mobile lockscreen alerts, fee notices, and exam announcements directly to students' devices with zero telecom/SMS charges.</p>
          </div>
          <div class="push-hub-status-badge">
            <span class="status-dot-pulse"></span>
            <span>Gateway Online · W3C VAPID Relay</span>
          </div>
        </div>

        <!-- Live Push Metric Cards -->
        <div class="stats-grid push-stats-grid" id="pushHubStatsGrid">
          <div class="stat-card stat-card-blue">
            <div class="stat-icon"><i aria-hidden="true" class="fa-solid fa-mobile-screen-button"></i></div>
            <div class="stat-content">
              <span class="stat-label">Registered Devices</span>
              <span class="stat-value" id="pushStatDevicesCount">--</span>
              <span class="stat-delta text-success"><i aria-hidden="true" class="fa-solid fa-signal"></i> Active Push Endpoints</span>
            </div>
          </div>
          <div class="stat-card stat-card-emerald">
            <div class="stat-icon"><i aria-hidden="true" class="fa-solid fa-user-check"></i></div>
            <div class="stat-content">
              <span class="stat-label">Subscribed Students</span>
              <span class="stat-value" id="pushStatStudentsCount">--</span>
              <span class="stat-delta text-emerald"><i aria-hidden="true" class="fa-solid fa-graduation-cap"></i> Authenticated</span>
            </div>
          </div>
          <div class="stat-card stat-card-purple">
            <div class="stat-icon"><i aria-hidden="true" class="fa-solid fa-paper-plane"></i></div>
            <div class="stat-content">
              <span class="stat-label">Broadcasts Delivered</span>
              <span class="stat-value" id="pushStatDeliveredCount">--</span>
              <span class="stat-delta text-purple"><i aria-hidden="true" class="fa-solid fa-clock-rotate-left"></i> Lifetime Alerts</span>
            </div>
          </div>
        </div>

        <!-- 1-Click Quick Preset Strip & Device Registration -->
        <div class="push-presets-container">
          <div class="push-presets-bar">
            <span class="preset-label"><i aria-hidden="true" class="fa-solid fa-bolt"></i> Quick Presets:</span>
            <button type="button" class="btn btn-sm btn-preset" data-preset="fee">💵 Monthly Fee Due</button>
            <button type="button" class="btn btn-sm btn-preset" data-preset="exam">🏆 Board Exam Drill</button>
            <button type="button" class="btn btn-sm btn-preset" data-preset="holiday">📢 Weather / Holiday</button>
            <button type="button" class="btn btn-sm btn-preset" data-preset="result">🎉 Result Celebration</button>
          </div>
          <button type="button" class="btn btn-sm btn-primary btn-register-device" id="btnRegisterCurrentDevice">
            <i aria-hidden="true" class="fa-solid fa-bell"></i> Enable / Register This Device
          </button>
        </div>

        <div class="push-hub-grid">
          <!-- Left Column: Audience & Composer -->
          <div class="push-composer-col">
            <!-- Audience Targeting Matrix -->
            <div class="push-card">
              <h3 class="push-card-heading"><i aria-hidden="true" class="fa-solid fa-crosshairs"></i> 1. Audience Targeting Matrix</h3>
              <div class="push-audience-options">
                <label class="push-radio-label">
                  <input type="radio" name="pushTargetType" value="ALL" checked>
                  <span><strong>🌐 All Enrolled Students &amp; Parents</strong> (Institute-wide alert)</span>
                </label>
                <label class="push-radio-label">
                  <input type="radio" name="pushTargetType" value="BATCHES">
                  <span><strong>🎓 Specific Academic Batches</strong> (Select below)</span>
                </label>
                <label class="push-radio-label">
                  <input type="radio" name="pushTargetType" value="STUDENT">
                  <span><strong>👤 Individual Student Direct Alert</strong> (1-on-1 notice)</span>
                </label>
                <label class="push-radio-label">
                  <input type="radio" name="pushTargetType" value="DUES">
                  <span><strong>💰 Fee Dues Filter Only</strong> (Students with pending balance &gt; ₹0)</span>
                </label>
              </div>

              <!-- Batch Chips Container -->
              <div id="pushBatchSelector" class="push-subselector" style="display:none;">
                <label class="subselector-label">Select Target Batches:</label>
                <div class="push-batch-chips">
                  ${batches.map(b => `
                    <button type="button" class="push-chip" data-batch-id="${escapeHtml(b.id)}">
                      ${escapeHtml(b.name || b.id)}
                    </button>
                  `).join('')}
                </div>
              </div>

              <!-- Student Search Autocomplete -->
              <div id="pushStudentSelector" class="push-subselector" style="display:none;">
                <label for="pushStudentSearchInput" class="subselector-label">Search Student by Name, Roll No, or Mobile:</label>
                <input type="text" id="pushStudentSearchInput" aria-label="Search Student by Name, Roll No, or Mobile" class="portal-input" placeholder="Type student name or roll...">
                <div id="pushStudentDropdown" class="push-student-dropdown" style="display:none; max-height:160px; overflow-y:auto; background:#fff; border:1px solid #cbd5e1; border-radius:6px; margin-top:4px;"></div>
                <div id="pushSelectedStudentBadge" class="selected-student-badge" style="display:none; margin-top:6px; font-weight:700; color:#065F46;"></div>
              </div>
            </div>

            <!-- Message Composer -->
            <div class="push-card">
              <h3 class="push-card-heading"><i aria-hidden="true" class="fa-solid fa-pen-nib"></i> 2. Message Composer &amp; Personalization</h3>
              
              <!-- Notification Title -->
              <div class="admin-form-group">
                <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                  <label for="pushTitleInput">Notification Title <span class="req-star">*</span></label>
                  <span class="admin-field-hint" id="pushTitleCount">0 / 80</span>
                </div>
                <input type="text" id="pushTitleInput" class="portal-input" maxlength="80" placeholder="e.g. 📢 Pragyan Institute Announcement" value="📢 Pragyan Institute Announcement">
              </div>

              <!-- Quick Emoji Bar -->
              <div class="push-emoji-bar">
                <span class="emoji-label">Add Emoji:</span>
                ${['📢', '🚨', '💵', '🏆', '📚', '⚡', '🎉', '🔔', '📅', '📝'].map(em => `
                  <button type="button" class="emoji-btn">${em}</button>
                `).join('')}
              </div>

              <!-- Message Body -->
              <div class="admin-form-group">
                <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                  <label for="pushBodyInput">Message Body <span class="req-star">*</span></label>
                  <span class="admin-field-hint" id="pushBodyCount">0 / 250</span>
                </div>
                <textarea id="pushBodyInput" class="portal-input" rows="3" maxlength="250" style="height:auto; min-height:80px; padding:0.65rem;" placeholder="Dear {{student_name}}, weekly evaluation test for {{batch_name}} starts at 4:00 PM tomorrow. Please be on time.">Dear {{student_name}}, weekly evaluation test for {{batch_name}} starts at 4:00 PM tomorrow. Please be on time.</textarea>
              </div>

              <!-- Dynamic Variable Chips -->
              <div class="push-vars-bar">
                <span class="vars-label">Insert Dynamic Tag:</span>
                <button type="button" class="btn-var-tag" data-tag="{{student_name}}" title="Insert Student Full Name">👤 {{student_name}}</button>
                <button type="button" class="btn-var-tag" data-tag="{{batch_name}}" title="Insert Enrolled Batch Name">🎓 {{batch_name}}</button>
                <button type="button" class="btn-var-tag" data-tag="{{pending_dues}}" title="Insert Pending Dues Amount">💵 {{pending_dues}}</button>
                <button type="button" class="btn-var-tag" data-tag="{{roll_no}}" title="Insert 6-Digit Roll Number">🆔 {{roll_no}}</button>
                <button type="button" class="btn-var-tag" data-tag="{{due_date}}" title="Insert Due Date">📅 {{due_date}}</button>
                <button type="button" class="btn-var-tag" data-tag="{{guardian_name}}" title="Insert Parent/Guardian Name">👨‍👩‍👦 {{guardian_name}}</button>
                <button type="button" class="btn-var-tag" data-tag="{{institute_name}}" title="Insert Institute Name">🏛️ {{institute_name}}</button>
                <button type="button" class="btn-var-tag" data-tag="{{pay_url}}" title="Insert Personalized Payment Link">💳 {{pay_url}}</button>
              </div>

              <!-- Action Buttons Grid -->
              <div class="push-grid-2col push-actions-grid">
                <div>
                  <label for="pushAction1Title" class="push-sub-label">Action 1 (Label)</label>
                  <input type="text" id="pushAction1Title" aria-label="Action 1 (Label)" class="portal-input" value="💳 Pay Fees ({{pending_dues}})">
                </div>
                <div>
                  <label for="pushAction1Url" class="push-sub-label">Action 1 (Target URL)</label>
                  <input type="text" id="pushAction1Url" aria-label="Action 1 (Target URL)" class="portal-input" value="/pay.html?id={{student_id}}&name={{student_name}}&amount={{pending_dues}}">
                </div>
              </div>

              <div class="push-grid-2col push-actions-grid">
                <div>
                  <label for="pushAction2Title" class="push-sub-label">Action 2 (Label - Optional)</label>
                  <input type="text" id="pushAction2Title" aria-label="Action 2 (Label - Optional)" class="portal-input" placeholder="e.g. 📄 View Notice">
                </div>
                <div>
                  <label for="pushAction2Url" class="push-sub-label">Action 2 (Target URL)</label>
                  <input type="text" id="pushAction2Url" aria-label="Action 2 (Target URL)" class="portal-input" placeholder="/#notices">
                </div>
              </div>

              <!-- Options Grid: Priority & TTL -->
              <div class="push-grid-2col push-options-grid">
                <div>
                  <label for="pushPrioritySelect" class="push-sub-label">Urgency &amp; Sound</label>
                  <select id="pushPrioritySelect" aria-label="Urgency & Sound" class="portal-input">
                    <option value="high" selected>🚨 High Priority (Chime + Dual Vibration)</option>
                    <option value="normal">🔔 Normal Priority (Standard Alert)</option>
                  </select>
                </div>
                <div>
                  <label for="pushTtlSelect" class="push-sub-label">Expiry (Time-To-Live)</label>
                  <select id="pushTtlSelect" aria-label="Expiry (Time-To-Live)" class="portal-input">
                    <option value="24" selected>24 Hours</option>
                    <option value="6">6 Hours (Time-sensitive)</option>
                    <option value="72">3 Days (Important notices)</option>
                  </select>
                </div>
              </div>

              <!-- Dispatch Action -->
              <div class="push-dispatch-wrap">
                <button type="button" class="btn btn-primary btn-dispatch-push-main" id="btnDispatchPush">
                  <i aria-hidden="true" class="fa-solid fa-paper-plane"></i> Broadcast Push Notification
                </button>
              </div>
            </div>
          </div>

          <!-- Right Column: Live Mobile Simulator -->
          <div class="push-simulator-col">
            <div class="push-card" style="position:sticky; top:1rem;">
              <h3 class="push-card-heading"><i aria-hidden="true" class="fa-solid fa-mobile-screen"></i> Smartphone Lockscreen Simulator</h3>
              <p class="admin-field-hint" style="margin-bottom:1rem;">Live preview of how this notification will appear on student and parent smartphones:</p>
              
              <div class="phone-mockup-frame">
                <div class="phone-speaker-bar"></div>
                <div class="phone-lockscreen-time">09:41</div>
                <div class="phone-lockscreen-date">Monday, 24 August</div>
                
                <!-- The Notification Card -->
                <div class="phone-notif-card" id="phoneSimNotifCard">
                  <div class="sim-notif-header">
                    <div class="sim-notif-app">
                      <img src="./assets/images/logo.png" alt="Logo" class="sim-app-icon">
                      <span class="sim-app-name">PRAGYAN INSTITUTE</span>
                    </div>
                    <span class="sim-notif-time">now</span>
                  </div>
                  <div class="sim-notif-title" id="simNotifTitle">📢 Pragyan Institute Announcement</div>
                  <div class="sim-notif-body" id="simNotifBody">Dear Rahul Sharma, weekly evaluation test for Class 10th (ACHIEVER) starts at 4:00 PM tomorrow. Please be on time.</div>
                  <div class="sim-notif-actions" id="simNotifActions">
                    <span class="sim-action-btn" id="simAction1">💳 Pay Fees</span>
                    <span class="sim-action-btn" id="simAction2" style="display:none;"></span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Sent Broadcast History & Audit Logs -->
        <div class="push-card" style="margin-top:1.5rem;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; padding-bottom:0.6rem; border-bottom:1px solid #f1f5f9;">
            <h3 class="push-card-heading" style="margin:0; padding:0; border:none;"><i aria-hidden="true" class="fa-solid fa-clock-rotate-left"></i> Broadcast Dispatch History &amp; Delivery Logs</h3>
            <button type="button" class="btn btn-sm btn-outline" id="btnRefreshPushLogs">
              <i aria-hidden="true" class="fa-solid fa-arrows-rotate"></i> Refresh Logs
            </button>
          </div>
          <div class="table-responsive" id="pushLogsTableContainer">
            <div style="padding:1.5rem; text-align:center; color:#64748B;"><i aria-hidden="true" class="fa-solid fa-spinner fa-spin"></i> Loading broadcast logs...</div>
          </div>
        </div>
      </div>
    `;

    wirePushComposerEvents(pane);
    syncPushStatsFromCloud();
    loadPushBroadcastLogs();
  }

  async function syncPushStatsFromCloud() {
    const devicesEl = document.getElementById('pushStatDevicesCount');
    const studentsEl = document.getElementById('pushStatStudentsCount');
    const deliveredEl = document.getElementById('pushStatDeliveredCount');

    try {
      const token = (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('pragyan_portal_token')) ||
        (typeof localStorage !== 'undefined' && localStorage.getItem('pragyan_portal_token')) || null;

      let subs = [];
      let logs = [];

      // 1. Try authenticated database gateway directly first
      if (window.SupabaseSync && typeof window.SupabaseSync._apiDb === 'function') {
        const [subRows, logRows] = await Promise.allSettled([
          window.SupabaseSync._apiDb('push_subscriptions', 'select', { filters: { limit: 1000 } }),
          window.SupabaseSync._apiDb('push_broadcast_logs', 'select', { filters: { limit: 100 } })
        ]);

        if (subRows.status === 'fulfilled' && Array.isArray(subRows.value)) {
          subs = subRows.value;
          const uniqueStudents = new Set(subs.map(s => s.student_id).filter(Boolean));
          if (devicesEl) devicesEl.textContent = subs.length.toLocaleString('en-IN');
          if (studentsEl) studentsEl.textContent = uniqueStudents.size.toLocaleString('en-IN');
        }

        if (logRows.status === 'fulfilled' && Array.isArray(logRows.value)) {
          logs = logRows.value;
        }
      }

      // 2. Fallback to /api/send-push GET if needed
      if (subs.length === 0 && logs.length === 0) {
        try {
          const res = await fetch('/api/send-push', {
            headers: token ? { Authorization: `Bearer ${token}` } : {}
          });
          if (res.ok) {
            const data = await res.json();
            if (data && data.success) {
              if (devicesEl && (devicesEl.textContent === '--' || devicesEl.textContent === '0')) {
                devicesEl.textContent = Number(data.subscribers || 0).toLocaleString('en-IN');
              }
              if (data.recentLogs && Array.isArray(data.recentLogs) && logs.length === 0) {
                logs = data.recentLogs;
              }
            }
          }
        } catch (_) {}
      }

      if (logs.length > 0) {
        const totalDelivered = logs.reduce((sum, l) => sum + Number(l.delivered_count || 0), 0);
        if (deliveredEl) deliveredEl.textContent = totalDelivered.toLocaleString('en-IN');
      } else {
        if (deliveredEl && (deliveredEl.textContent === '--' || deliveredEl.textContent === '')) deliveredEl.textContent = '0';
      }
      if (studentsEl && (studentsEl.textContent === '--' || studentsEl.textContent === '')) studentsEl.textContent = '0';
      if (devicesEl && (devicesEl.textContent === '--' || devicesEl.textContent === '')) devicesEl.textContent = '0';
    } catch (err) {
      console.warn('[Push] Error syncing push stats:', err);
    }
  }

  function wirePushComposerEvents(pane) {
    const titleInput = pane.querySelector('#pushTitleInput');
    const bodyInput = pane.querySelector('#pushBodyInput');
    const action1Title = pane.querySelector('#pushAction1Title');
    const action1Url = pane.querySelector('#pushAction1Url');
    const action2Title = pane.querySelector('#pushAction2Title');
    const action2Url = pane.querySelector('#pushAction2Url');

    const simTitle = pane.querySelector('#simNotifTitle');
    const simBody = pane.querySelector('#simNotifBody');
    const simAct1 = pane.querySelector('#simAction1');
    const simAct2 = pane.querySelector('#simAction2');

    const titleCount = pane.querySelector('#pushTitleCount');
    const bodyCount = pane.querySelector('#pushBodyCount');

    let lastActivePushInput = bodyInput;
    [titleInput, bodyInput, action1Title, action2Title].forEach(inp => {
      inp?.addEventListener('focus', () => { lastActivePushInput = inp; });
      inp?.addEventListener('click', () => { lastActivePushInput = inp; });
    });

    let selectedPushStudentObject = null;

    function formatINRLocal(num) {
      return '₹' + Number(num || 0).toLocaleString('en-IN');
    }

    function interpolateSample(template) {
      if (!template || typeof template !== 'string') return '';
      const sampleStudent = selectedPushStudentObject || {
        name: 'Rahul Sharma',
        class_name: 'Class 10th (ACHIEVER)',
        pending_fee: 1200,
        roll_no: '261001',
        guardian_name: 'Shri Mohan Sharma',
        mobile: '9876543210'
      };

      const sName = sampleStudent.name || 'Rahul Sharma';
      const bName = sampleStudent.class_name || sampleStudent.className || 'Class 10th (ACHIEVER)';
      let sampleDuesNum = 1200;
      if (sampleStudent.pending_fee != null) {
        sampleDuesNum = Number(sampleStudent.pending_fee);
      } else if (sampleStudent.pendingFee != null) {
        sampleDuesNum = Number(sampleStudent.pendingFee);
      }
      const sDues = formatINRLocal(sampleDuesNum);
      const sRoll = sampleStudent.roll_no || sampleStudent.rollNo || sampleStudent.student_id || '261001';
      const sGuardian = sampleStudent.guardian_name || sampleStudent.guardianName || 'Shri Mohan Sharma';
      const sMob = sampleStudent.mobile || '9876543210';
      const todayStr = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      const monthStr = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

      return template
        .replace(/\{{1,2}\s*(?:student_name|studentName|name|student)\s*\}{1,2}/gi, sName)
        .replace(/\{{1,2}\s*(?:batch_name|batchName|class_name|className|batch|class|course)\s*\}{1,2}/gi, bName)
        .replace(/\{{1,2}\s*(?:pending_dues|pendingDues|dues|pending_fee|pendingFee|amount|fee|balance)\s*\}{1,2}/gi, sDues)
        .replace(/\{{1,2}\s*(?:roll_no|rollNo|roll_number|roll)\s*\}{1,2}/gi, sRoll)
        .replace(/\{{1,2}\s*(?:student_id|studentId|id)\s*\}{1,2}/gi, sRoll)
        .replace(/\{{1,2}\s*(?:guardian_name|guardianName|parent_name|father_name)\s*\}{1,2}/gi, sGuardian)
        .replace(/\{{1,2}\s*(?:mobile|phone|contact)\s*\}{1,2}/gi, sMob)
        .replace(/\{{1,2}\s*due_date\s*\}{1,2}/gi, '5th of this month')
        .replace(/\{{1,2}\s*(?:date|today)\s*\}{1,2}/gi, todayStr)
        .replace(/\{{1,2}\s*month\s*\}{1,2}/gi, monthStr)
        .replace(/\{{1,2}\s*(?:institute_name|instituteName|institute)\s*\}{1,2}/gi, 'Pragyan Institute');
    }

    function updateSim() {
      const rawT = titleInput?.value || '📢 Pragyan Institute Alert';
      const rawB = bodyInput?.value || 'You have a new update from Pragyan Institute.';

      const sampleT = interpolateSample(rawT);
      const sampleB = interpolateSample(rawB);

      if (simTitle) simTitle.textContent = sampleT;
      if (simBody) simBody.textContent = sampleB;
      if (titleCount) titleCount.textContent = `${titleInput?.value.length || 0} / 80`;
      if (bodyCount) bodyCount.textContent = `${bodyInput?.value.length || 0} / 250`;

      if (simAct1) {
        simAct1.textContent = action1Title?.value || '💳 Pay Fees';
        simAct1.style.display = action1Title?.value ? 'block' : 'none';
      }
      if (simAct2) {
        simAct2.textContent = action2Title?.value || '📄 View Notice';
        simAct2.style.display = action2Title?.value ? 'block' : 'none';
      }
    }

    [titleInput, bodyInput, action1Title, action2Title].forEach(el => {
      el?.addEventListener('input', updateSim);
    });
    updateSim();

    function insertTextAtCursor(targetInput, text) {
      if (!targetInput) targetInput = bodyInput;
      if (!targetInput) return;
      const start = targetInput.selectionStart ?? targetInput.value.length;
      const end = targetInput.selectionEnd ?? targetInput.value.length;
      const val = targetInput.value;
      targetInput.value = val.substring(0, start) + text + val.substring(end);
      const newPos = start + text.length;
      if (typeof targetInput.setSelectionRange === 'function') {
        targetInput.setSelectionRange(newPos, newPos);
      }
      targetInput.focus();
      updateSim();
    }

    // Emoji clicks
    pane.querySelectorAll('.emoji-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const em = btn.textContent.trim();
        if (em) {
          insertTextAtCursor(lastActivePushInput || bodyInput, em + ' ');
        }
      });
    });

    // Dynamic variable tag clicks with smart cursor insertion
    pane.querySelectorAll('.btn-var-tag').forEach(btn => {
      btn.addEventListener('click', () => {
        const tag = btn.dataset.tag;
        if (tag) {
          insertTextAtCursor(lastActivePushInput || bodyInput, tag + ' ');
        }
      });
    });

    // Preset buttons
    pane.querySelectorAll('.btn-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = btn.dataset.preset;
        if (p === 'fee') {
          if (titleInput) titleInput.value = '💵 Pragyan Institute: Monthly Fee Due Alert';
          if (bodyInput) bodyInput.value = 'Dear {{student_name}}, your {{batch_name}} tuition fee of {{pending_dues}} is due. Please tap below to clear dues via UPI.';
          if (action1Title) action1Title.value = '💳 Pay via UPI';
          if (action1Url) action1Url.value = '/pay.html';
        } else if (p === 'exam') {
          if (titleInput) titleInput.value = '🏆 Upcoming Batch Test Series Announcement';
          if (bodyInput) bodyInput.value = 'Important: Special assessment test for {{batch_name}} will be conducted tomorrow at 4:00 PM. Attendance is compulsory.';
          if (action1Title) action1Title.value = '📄 Test Details';
          if (action1Url) action1Url.value = '/#batches';
        } else if (p === 'holiday') {
          if (titleInput) titleInput.value = '📢 Pragyan Institute: Holiday & Timetable Update';
          if (bodyInput) bodyInput.value = 'Notice for all students: Offline classes are rescheduled today. Please review the updated timetable on the student portal.';
          if (action1Title) action1Title.value = '📄 Open Noticeboard';
          if (action1Url) action1Url.value = '/#notices';
        } else if (p === 'result') {
          if (titleInput) titleInput.value = '🎉 Congratulations! Batch Results Announced';
          if (bodyInput) bodyInput.value = 'Pragyan Institute students achieve top percentile scores in recent evaluations. Check the merit list now.';
          if (action1Title) action1Title.value = '🏆 View Results';
          if (action1Url) action1Url.value = '/#blog';
        }
        updateSim();
      });
    });

    // Audience Radio Buttons
    pane.querySelectorAll('input[name="pushTargetType"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        activePushTargetType = e.target.value;
        const batchBox = pane.querySelector('#pushBatchSelector');
        const studentBox = pane.querySelector('#pushStudentSelector');
        if (batchBox) batchBox.style.display = activePushTargetType === 'BATCHES' ? 'block' : 'none';
        if (studentBox) studentBox.style.display = activePushTargetType === 'STUDENT' ? 'block' : 'none';
      });
    });

    // Batch Chips Multi-Select
    pane.querySelectorAll('.push-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const bid = chip.dataset.batchId;
        if (selectedPushBatches.has(bid)) {
          selectedPushBatches.delete(bid);
          chip.classList.remove('active');
        } else {
          selectedPushBatches.add(bid);
          chip.classList.add('active');
        }
      });
    });

    // Student Search Autocomplete with Multi-Identifier Capture
    const studentSearch = pane.querySelector('#pushStudentSearchInput');
    const studentDropdown = pane.querySelector('#pushStudentDropdown');
    const selectedStudentBadge = pane.querySelector('#pushSelectedStudentBadge');

    studentSearch?.addEventListener('input', () => {
      const q = studentSearch.value.trim().toLowerCase();
      if (!q || q.length < 2) {
        if (studentDropdown) studentDropdown.style.display = 'none';
        return;
      }
      const allStudents = AppState.getStudents ? AppState.getStudents() : (AppState.students || []);
      const matches = allStudents.filter(s => {
        const name = (s.name || '').toLowerCase();
        const roll = (s.roll_no || s.student_id || '').toLowerCase();
        const mob = (s.mobile || '').toLowerCase();
        return name.includes(q) || roll.includes(q) || mob.includes(q);
      }).slice(0, 8);

      if (matches.length === 0) {
        if (studentDropdown) {
          studentDropdown.innerHTML = '<div style="padding:8px 12px; color:#64748B; font-size:0.8rem;">No matching students found</div>';
          studentDropdown.style.display = 'block';
        }
        return;
      }

      if (studentDropdown) {
        studentDropdown.innerHTML = matches.map(m => `
          <div class="student-search-item" data-sid="${escapeHtml(m.student_id || m.id || m.roll_no)}" style="padding:8px 12px; cursor:pointer; font-size:0.84rem; border-bottom:1px solid #F1F5F9;">
            <strong>${escapeHtml(m.name)}</strong> (${escapeHtml(m.class_name || 'Batch')}) · Roll: ${escapeHtml(m.roll_no || m.student_id || '')}
          </div>
        `).join('');
        studentDropdown.style.display = 'block';

        studentDropdown.querySelectorAll('.student-search-item').forEach(item => {
          item.addEventListener('click', () => {
            selectedPushStudentId = item.dataset.sid;
            const chosen = matches.find(m => (m.student_id || m.id || m.roll_no) === selectedPushStudentId);
            selectedPushStudentObject = chosen || null;
            if (chosen && selectedStudentBadge) {
              selectedStudentBadge.innerHTML = `<i aria-hidden="true" class="fa-solid fa-user-check"></i> Selected: <strong>${escapeHtml(chosen.name)}</strong> (${escapeHtml(chosen.class_name || '')}) · Roll: ${escapeHtml(chosen.roll_no || chosen.student_id || '')}`;
              selectedStudentBadge.style.display = 'block';
            }
            studentDropdown.style.display = 'none';
            if (studentSearch) studentSearch.value = chosen ? chosen.name : '';
            updateSim();
          });
        });
      }
    });

    // Broadcast Dispatch Button
    const btnDispatch = pane.querySelector('#btnDispatchPush');
    btnDispatch?.addEventListener('click', async () => {
      const title = titleInput?.value.trim();
      const body = bodyInput?.value.trim();
      if (!title || !body) {
        alert('Please provide both notification title and message body.');
        return;
      }

      const target = { type: activePushTargetType };
      if (activePushTargetType === 'BATCHES') {
        target.batches = Array.from(selectedPushBatches);
        if (target.batches.length === 0) {
          alert('Please select at least one target batch chip.');
          return;
        }
      } else if (activePushTargetType === 'STUDENT') {
        if (!selectedPushStudentId) {
          alert('Please search and select a target student.');
          return;
        }
        const sObj = selectedPushStudentObject || {};
        target.students = [
          selectedPushStudentId,
          sObj.student_id,
          sObj.id,
          sObj.roll_no,
          sObj.rollNo
        ].filter(Boolean);
      }

      const actions = [];
      if (action1Title?.value.trim()) {
        actions.push({ action: 'action_1', title: action1Title.value.trim(), url: action1Url?.value.trim() || '/pay.html' });
      }
      if (action2Title?.value.trim()) {
        actions.push({ action: 'action_2', title: action2Title.value.trim(), url: action2Url?.value.trim() || '/#notices' });
      }

      const priority = pane.querySelector('#pushPrioritySelect')?.value || 'high';
      const ttlHours = pane.querySelector('#pushTtlSelect')?.value || '24';

      if (!confirm(`Are you sure you want to broadcast this push notification to ${activePushTargetType === 'ALL' ? 'ALL active devices' : activePushTargetType}?`)) {
        return;
      }

      btnDispatch.disabled = true;
      btnDispatch.innerHTML = '<i aria-hidden="true" class="fa-solid fa-spinner fa-spin"></i> Broadcasting to Devices...';

      try {
        const token = (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('pragyan_portal_token')) ||
          (typeof localStorage !== 'undefined' && localStorage.getItem('pragyan_portal_token')) || null;
        const res = await fetch('/api/send-push', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            title,
            body,
            target,
            actions,
            priority,
            ttlHours
          })
        });

        const data = await res.json();
        if (data.success) {
          showNotification(`🚀 Broadcast Dispatched! ${data.delivered} delivered (${data.audienceSize} target devices, ${data.pruned} pruned).`, 'success');
          syncPushStatsFromCloud();
          loadPushBroadcastLogs();
        } else {
          showNotification(`Broadcast failed: ${data.error || 'Unknown error'}`, 'error');
        }
      } catch (err) {
        showNotification(`Broadcast network error: ${err.message}`, 'error');
      } finally {
        btnDispatch.disabled = false;
        btnDispatch.innerHTML = '<i aria-hidden="true" class="fa-solid fa-paper-plane"></i> Broadcast Push Notification';
      }
    });

    pane.querySelector('#btnRegisterCurrentDevice')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.innerHTML = '<i aria-hidden="true" class="fa-solid fa-spinner fa-spin"></i> Subscribing Device...';
      try {
        if (!window.PushClient || typeof window.PushClient.requestAndSubscribe !== 'function') {
          throw new Error('Push notification client is not supported or loaded.');
        }
        const ok = await window.PushClient.requestAndSubscribe({ student_id: 'ADMIN', name: 'Admin Device' });
        if (ok) {
          showNotification('🔔 Device successfully registered for push notifications!', 'success');
          syncPushStatsFromCloud();
        } else {
          showNotification('Permission was not granted or push registration failed on this browser.', 'warning');
        }
      } catch (err) {
        showNotification('Push error: ' + err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i aria-hidden="true" class="fa-solid fa-bell"></i> Enable / Register This Device';
      }
    });

    pane.querySelector('#btnRefreshPushLogs')?.addEventListener('click', () => {
      syncPushStatsFromCloud();
      loadPushBroadcastLogs();
    });
  }

  async function loadPushBroadcastLogs() {
    const container = document.getElementById('pushLogsTableContainer');
    if (!container) return;

    try {
      let logs = [];
      if (window.SupabaseSync && typeof window.SupabaseSync._apiDb === 'function') {
        try {
          const res = await window.SupabaseSync._apiDb('push_broadcast_logs', 'select', {
            filters: { limit: 25, ascending: false }
          });
          logs = Array.isArray(res) ? res : (res?.data || []);
        } catch (dbErr) {
          console.warn('[PushLogs] _apiDb failed, trying fallback:', dbErr);
        }
      }

      if (!logs || logs.length === 0) {
        try {
          const token = (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('pragyan_portal_token')) ||
            (typeof localStorage !== 'undefined' && localStorage.getItem('pragyan_portal_token')) || null;
          const res = await fetch('/api/send-push', {
            headers: token ? { Authorization: `Bearer ${token}` } : {}
          });
          if (res.ok) {
            const data = await res.json();
            if (data && data.recentLogs && Array.isArray(data.recentLogs)) {
              logs = data.recentLogs;
            }
          }
        } catch (fetchErr) {
          console.warn('[PushLogs] fallback /api/send-push failed:', fetchErr);
        }
      }

      if (!logs || logs.length === 0) {
        container.innerHTML = `
          <div style="padding:2rem; text-align:center; color:#64748B;">
            <i aria-hidden="true" class="fa-solid fa-bell-slash" style="font-size:1.8rem; margin-bottom:0.5rem; display:block; opacity:0.6;"></i>
            No push broadcasts sent yet. Compose and send your first announcement above!
          </div>
        `;
        return;
      }

      container.innerHTML = `
        <div class="push-logs-desktop-wrap push-logs-scroll-wrap">
          <table class="portal-table push-logs-table">
            <thead>
              <tr>
                <th>Date &amp; Time</th>
                <th>Notification Title &amp; Message</th>
                <th>Target Audience</th>
                <th>Sent / Delivered</th>
                <th>Sender</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${logs.map(l => {
                const dt = new Date(l.created_at || Date.now()).toLocaleString('en-IN', {
                  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                });
                const targetStr = l.target_type === 'ALL' ? '🌐 All Students' :
                  l.target_type === 'BATCHES' ? '🎓 Batches' :
                  l.target_type === 'DUES' ? '💰 Dues Filter' : '👤 Student Direct';

                const isSuccess = Number(l.delivered_count || 0) > 0;
                const badgeClass = isSuccess ? 'status-pill status-verified' : 'status-pill status-danger';

                return `
                  <tr>
                    <td style="white-space:nowrap; font-size:0.82rem; color:#64748B;">${dt}</td>
                    <td>
                      <strong style="color:#0F172A; display:block;">${escapeHtml(l.title)}</strong>
                      <span style="font-size:0.8rem; color:#475569;">${escapeHtml(l.body).slice(0, 90)}${l.body.length > 90 ? '...' : ''}</span>
                    </td>
                    <td><span class="status-pill status-adjusted">${targetStr}</span></td>
                    <td style="font-weight:700; font-size:0.85rem;">
                      <span style="color:#065F46;">${l.delivered_count || 0}</span> / ${l.audience_size || l.sent_count || 0}
                      ${Number(l.pruned_count || 0) > 0 ? `<small style="color:#DC2626; display:block;">(${l.pruned_count} pruned)</small>` : ''}
                    </td>
                    <td style="font-size:0.82rem; color:#475569;">${escapeHtml(l.dispatched_by || 'CHANDAN')}</td>
                    <td><span class="${badgeClass}">${isSuccess ? 'Delivered' : (Number(l.audience_size || 0) === 0 ? '0 Audience' : 'Failed')}</span></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>

        <div class="push-logs-mobile-list">
          ${logs.map(l => {
            const dt = new Date(l.created_at || Date.now()).toLocaleString('en-IN', {
              day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
            });
            const targetStr = l.target_type === 'ALL' ? '🌐 All Students' :
              l.target_type === 'BATCHES' ? '🎓 Batches' :
              l.target_type === 'DUES' ? '💰 Dues Filter' : '👤 Student Direct';

            const isSuccess = Number(l.delivered_count || 0) > 0;
            const badgeClass = isSuccess ? 'status-pill status-verified' : 'status-pill status-danger';
            const totalAudience = Number(l.audience_size || l.sent_count || 0);
            const delivered = Number(l.delivered_count || 0);
            const pct = totalAudience > 0 ? Math.min(100, Math.round((delivered / totalAudience) * 100)) : (delivered > 0 ? 100 : 0);

            return `
              <div class="push-log-card">
                <div class="push-log-card-head">
                  <div class="push-log-card-title-group">
                    <strong class="push-log-card-title">${escapeHtml(l.title)}</strong>
                    <span class="push-log-card-time"><i aria-hidden="true" class="fa-regular fa-clock"></i> ${dt}</span>
                  </div>
                  <span class="${badgeClass}">${isSuccess ? 'Delivered' : (Number(l.audience_size || 0) === 0 ? '0 Audience' : 'Failed')}</span>
                </div>

                <div class="push-log-card-body">
                  ${escapeHtml(l.body)}
                </div>

                <div class="push-log-card-meta">
                  <span class="status-pill status-adjusted">${targetStr}</span>
                  <span class="push-log-card-sender"><i aria-hidden="true" class="fa-solid fa-user-shield"></i> ${escapeHtml(l.dispatched_by || 'CHANDAN')}</span>
                </div>

                <div class="push-log-card-progress">
                  <div class="push-log-progress-info">
                    <span>Delivery Rate: <strong>${delivered} / ${totalAudience}</strong></span>
                    <span class="push-log-progress-pct">${pct}%</span>
                  </div>
                  <div class="push-log-progress-bar">
                    <div class="push-log-progress-fill" style="width: ${pct}%;"></div>
                  </div>
                  ${Number(l.pruned_count || 0) > 0 ? `<div class="push-log-pruned-note"><i aria-hidden="true" class="fa-solid fa-triangle-exclamation"></i> ${l.pruned_count} dead/unregistered endpoints pruned</div>` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<div style="padding:1rem; color:#DC2626; text-align:center;">Failed to load logs: ${escapeHtml(err.message)}</div>`;
    }
  }

  /* ==========================================================================
   * 19. ADMIN CLASS TIMETABLE & INSTITUTE HOLIDAYS MANAGER
   * ========================================================================== */
  let activeAdminScheduleBatchId = 'BAT-10';
  let activeAdminScheduleDay = 'Monday';
  try {
    const savedBatch = sessionStorage.getItem('pragyan_admin_schedule_batch');
    if (savedBatch) activeAdminScheduleBatchId = savedBatch;
    const savedDay = sessionStorage.getItem('pragyan_admin_schedule_day');
    if (savedDay) activeAdminScheduleDay = savedDay;
  } catch (e) {}

  async function seedDefaultScheduleForBatchAndDay(batchId, day) {
    const rawSchedules = AppState.getClassSchedules ? AppState.getClassSchedules() : [];
    const allSchedules = Array.isArray(rawSchedules) ? rawSchedules : [];
    const bKey = getBatchCategoryKey(batchId);
    const batchMap = (typeof BATCH_SUBJECTS !== 'undefined' && BATCH_SUBJECTS) ? BATCH_SUBJECTS : {};
    const slotMap = (typeof BATCH_SLOTS !== 'undefined' && BATCH_SLOTS) ? BATCH_SLOTS : {};
    const subjects = batchMap[bKey] || ['Mathematics', 'Science', 'English'];
    const slots = slotMap[bKey] || ['04:00 PM – 05:00 PM', '05:00 PM – 06:00 PM', '06:00 PM – 07:00 PM'];
    const cfg = academicConfig();
    const batchObj = cfg?.resolveBatch ? cfg.resolveBatch(batchId) : null;
    const teachers = batchObj?.teachers ? batchObj.teachers.map(titleCaseName) : ['Prof. Ravi Ranjan', 'Chandan Kumar'];
    const room = batchObj?.room || 'Main Hall';

    // Find existing periods for this batch & day to track IDs that need cloud deletion
    const oldPeriodsForDay = allSchedules.filter(s => {
      if (!s || typeof s !== 'object') return false;
      const sBatch = s.batch_id || s.batchId || '';
      const sDay = String(s.day_of_week || s.dayOfWeek || '').toLowerCase();
      const isSameBatch = (sBatch === batchId) || (getBatchCategoryKey(sBatch) === bKey) || (String(sBatch).toUpperCase() === String(batchId).toUpperCase());
      const isSameDay = sDay === String(day).toLowerCase();
      return isSameBatch && isSameDay;
    });
    const oldIds = oldPeriodsForDay.map(s => String(s.id)).filter(Boolean);

    // Remove existing for this batch & day locally
    const filtered = allSchedules.filter(s => !oldPeriodsForDay.some(op => op.id === s.id));
    const newSeededPeriods = [];
    
    subjects.forEach((subj, idx) => {
      const slot = slots[idx] || '04:00 PM – 05:00 PM';
      const parts = slot.split(/[–-]/).map(p => p.trim());
      const startTime = parts[0] || '04:00 PM';
      const endTime = parts[1] || '05:00 PM';
      const teacher = teachers[idx % teachers.length] || 'Faculty Mentors';
      const detId = `SCHED-${batchId}-${String(day).slice(0, 3).toUpperCase()}-${idx + 1}`;

      const periodObj = {
        id: detId,
        batch_id: batchId,
        batchId: batchId,
        day_of_week: day,
        dayOfWeek: day,
        subject: subj,
        start_time: startTime,
        startTime: startTime,
        end_time: endTime,
        endTime: endTime,
        teacher: teacher,
        room: room,
        is_cancelled: false,
        isCancelled: false,
        sort_order: idx + 1,
        sortOrder: idx + 1,
        created_at: new Date().toISOString()
      };
      filtered.push(periodObj);
      newSeededPeriods.push(periodObj);
    });

    // Delete obsolete old IDs from Supabase if any exist
    const newIdSet = new Set(newSeededPeriods.map(p => p.id));
    const obsoleteIds = oldIds.filter(id => !newIdSet.has(id));
    if (obsoleteIds.length > 0 && typeof SupabaseSync !== 'undefined' && SupabaseSync.mutate) {
      await SupabaseSync.mutate('class_schedules', 'delete', null, { where: { id: obsoleteIds } }).catch(e => console.warn(e));
    }

    await AppState.saveClassSchedules(filtered);
    renderAdminScheduleTab();
  }

  async function replicateDayScheduleAcrossWeek(batchId, sourceDay, includeSunday = false) {
    const rawSchedules = AppState.getClassSchedules ? AppState.getClassSchedules() : [];
    const allSchedules = Array.isArray(rawSchedules) ? rawSchedules : [];
    const bKey = getBatchCategoryKey(batchId) || batchId;
    const sourcePeriods = allSchedules.filter(s => {
      if (!s || typeof s !== 'object') return false;
      const sBatch = s.batch_id || s.batchId || '';
      const isSameBatch = (sBatch === batchId) || (getBatchCategoryKey(sBatch) === bKey) || (String(sBatch).toUpperCase() === String(batchId).toUpperCase());
      const isSameDay = String(s.day_of_week || s.dayOfWeek || '').toLowerCase() === String(sourceDay).toLowerCase();
      return isSameBatch && isSameDay;
    });

    if (sourcePeriods.length === 0) {
      alert(`⚠️ No periods found for ${sourceDay}. Please add periods before replicating across the week.`);
      return;
    }

    const weekdays = includeSunday
      ? ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
      : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    const targetDesc = includeSunday ? 'all 7 days (Monday through Sunday)' : 'all weekdays (Monday through Saturday)';

    if (!confirm(`⚡ Replicate ${sourceDay}'s schedule to ${targetDesc} for batch ${batchId}?\n\nThis will update all periods across ${weekdays.length} days to match ${sourceDay}.`)) {
      return;
    }

    // Find old periods for these weekdays for this batch
    const oldWeekPeriods = allSchedules.filter(s => {
      if (!s || typeof s !== 'object') return false;
      const sBatch = s.batch_id || s.batchId || '';
      const isSameBatch = (sBatch === batchId) || (getBatchCategoryKey(sBatch) === bKey) || (String(sBatch).toUpperCase() === String(batchId).toUpperCase());
      const isWeekDay = weekdays.map(w => w.toLowerCase()).includes(String(s.day_of_week || s.dayOfWeek || '').toLowerCase());
      return isSameBatch && isWeekDay;
    });
    const oldIds = oldWeekPeriods.map(s => String(s.id)).filter(Boolean);

    // Keep other schedules not belonging to this batch weekdays
    const otherSchedules = allSchedules.filter(s => !oldWeekPeriods.some(op => op.id === s.id));
    const newReplicatedPeriods = [];

    weekdays.forEach(targetDay => {
      sourcePeriods.forEach((sp, idx) => {
        const detId = `SCHED-${batchId}-${targetDay.slice(0, 3).toUpperCase()}-${idx + 1}`;
        newReplicatedPeriods.push({
          id: detId,
          batch_id: batchId,
          batchId: batchId,
          day_of_week: targetDay,
          dayOfWeek: targetDay,
          subject: sp.subject,
          start_time: sp.start_time || sp.startTime || '04:00 PM',
          startTime: sp.start_time || sp.startTime || '04:00 PM',
          end_time: sp.end_time || sp.endTime || '05:00 PM',
          endTime: sp.end_time || sp.endTime || '05:00 PM',
          teacher: sp.teacher || 'Faculty Mentors',
          room: sp.room || 'Main Hall',
          is_cancelled: false,
          isCancelled: false,
          sort_order: sp.sort_order || sp.sortOrder || (idx + 1),
          sortOrder: sp.sort_order || sp.sortOrder || (idx + 1),
          created_at: new Date().toISOString()
        });
      });
    });

    // Delete obsolete old IDs from Supabase so no orphaned duplicate rows remain in cloud database
    const newIdSet = new Set(newReplicatedPeriods.map(p => p.id));
    const obsoleteIds = oldIds.filter(id => !newIdSet.has(id));
    if (obsoleteIds.length > 0 && typeof SupabaseSync !== 'undefined' && SupabaseSync.mutate) {
      await SupabaseSync.mutate('class_schedules', 'delete', null, { where: { id: obsoleteIds } }).catch(e => console.warn(e));
    }

    const updated = [...otherSchedules, ...newReplicatedPeriods];
    await AppState.saveClassSchedules(updated);
    alert(`✅ Weekly timetable successfully updated for ${batchId} (${includeSunday ? 'Mon–Sun' : 'Mon–Sat'}) and synced with cloud database!`);
    renderAdminScheduleTab();
  }

  async function toggleEntireDayOff(batchId, day, shouldCancel) {
    const rawSchedules = AppState.getClassSchedules ? AppState.getClassSchedules() : [];
    const allSchedules = Array.isArray(rawSchedules) ? rawSchedules : [];
    const bKey = getBatchCategoryKey(batchId);
    let affected = 0;
    allSchedules.forEach(s => {
      if (!s || typeof s !== 'object') return;
      const sBatch = s.batch_id || s.batchId || '';
      const isSameBatch = (sBatch === batchId) || (getBatchCategoryKey(sBatch) === bKey) || (String(sBatch).toUpperCase() === String(batchId).toUpperCase());
      const isSameDay = String(s.day_of_week || s.dayOfWeek || '').toLowerCase() === String(day).toLowerCase();
      if (isSameBatch && isSameDay) {
        s.is_cancelled = shouldCancel;
        s.isCancelled = shouldCancel;
        affected++;
      }
    });

    if (affected === 0) {
      alert(`No periods found for ${day}. Please add periods first.`);
      return;
    }

    await AppState.saveClassSchedules(allSchedules);
    renderAdminScheduleTab();
  }

  function openAddEditPeriodModal(existingPeriod = null) {
    const isEdit = !!existingPeriod;
    const modalId = 'adminAddEditPeriodModal';
    const existingModal = document.getElementById(modalId);
    if (existingModal) existingModal.remove();

    const batches = AppState.getBatches ? AppState.getBatches() : ((typeof ACADEMIC !== 'undefined' && ACADEMIC.BATCHES) ? ACADEMIC.BATCHES : []);
    const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

    const modalHtml = `
      <div id="${modalId}" class="portal-modal-backdrop" style="display:flex; align-items:center; justify-content:center; position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:9999; padding:1rem;">
        <div class="inner-modal-content" style="background:#fff; border-radius:14px; max-width:520px; width:100%; max-height:90vh; overflow-y:auto; padding:1.5rem; box-shadow:0 10px 25px rgba(0,0,0,0.2);">
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #E5E7EB; padding-bottom:0.75rem; margin-bottom:1.25rem;">
            <h4 style="font-weight:800; font-size:1.15rem; color:var(--text-mahogany); margin:0;">
              ${isEdit ? '✏️ Edit Class Period' : '➕ Add New Class Period'}
            </h4>
            <button type="button" id="btnClosePeriodModal" class="btn" aria-label="Close dialog" style="background:none; border:none; font-size:1.2rem; cursor:pointer; color:var(--text-muted);">&times;</button>
          </div>

          <form id="formAddEditPeriod" style="display:flex; flex-direction:column; gap:1rem;">
            <div>
              <label for="periodFormBatch" style="font-weight:700; font-size:0.85rem; color:var(--text-mahogany); display:block; margin-bottom:0.3rem;">Target Batch</label>
              <select id="periodFormBatch" class="form-input" aria-label="Target Batch" style="width:100%; padding:0.5rem; border-radius:8px;" required>
                ${batches.map(b => {
                  const bId = b.batchId || b.id || b.batch_id || '';
                  const bName = b.name || b.batch_name || b.className || bId;
                  const bKey = getBatchCategoryKey(bId || bName);
                  const curBatch = existingPeriod ? (existingPeriod.batch_id || existingPeriod.batchId) : activeAdminScheduleBatchId;
                  const curKey = getBatchCategoryKey(curBatch);
                  const sel = (bId === curBatch || (bKey && curKey && bKey === curKey) || (String(bId).toUpperCase() === String(curBatch).toUpperCase()));
                  return `<option value="${escapeHtml(bKey || bId)}" ${sel ? 'selected' : ''}>${escapeHtml(bName)} (${escapeHtml(bKey || bId)})</option>`;
                }).join('')}
              </select>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.75rem;">
              <div>
                <label for="periodFormDay" style="font-weight:700; font-size:0.85rem; color:var(--text-mahogany); display:block; margin-bottom:0.3rem;">Day of Week</label>
                <select id="periodFormDay" class="form-input" aria-label="Day of Week" style="width:100%; padding:0.5rem; border-radius:8px;" required>
                  ${daysOfWeek.map(d => {
                    const curDay = existingPeriod ? (existingPeriod.day_of_week || existingPeriod.dayOfWeek || '') : activeAdminScheduleDay;
                    const sel = (d.toLowerCase() === String(curDay).toLowerCase());
                    return `<option value="${d}" ${sel ? 'selected' : ''}>${d}</option>`;
                  }).join('')}
                </select>
              </div>
              <div>
                <label for="periodFormSort" style="font-weight:700; font-size:0.85rem; color:var(--text-mahogany); display:block; margin-bottom:0.3rem;">Sort / Period #</label>
                <input type="number" id="periodFormSort" class="form-input" aria-label="Sort or Period Number" style="width:100%; padding:0.5rem; border-radius:8px;" min="1" max="10" value="${existingPeriod?.sort_order || existingPeriod?.sortOrder || 1}" required />
              </div>
            </div>

            <div>
              <label for="periodFormSubject" style="font-weight:700; font-size:0.85rem; color:var(--text-mahogany); display:block; margin-bottom:0.3rem;">Subject Title</label>
              <input type="text" id="periodFormSubject" class="form-input" aria-label="Subject Title" style="width:100%; padding:0.5rem; border-radius:8px;" placeholder="e.g. Mathematics, Science (Physics), English" value="${escapeHtml(existingPeriod?.subject || '')}" required />
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.75rem;">
              <div>
                <label for="periodFormStartTime" style="font-weight:700; font-size:0.85rem; color:var(--text-mahogany); display:block; margin-bottom:0.3rem;">Start Time</label>
                <input type="text" id="periodFormStartTime" class="form-input" aria-label="Start Time" style="width:100%; padding:0.5rem; border-radius:8px;" placeholder="e.g. 04:00 PM" value="${escapeHtml(existingPeriod?.start_time || existingPeriod?.startTime || '04:00 PM')}" required />
              </div>
              <div>
                <label for="periodFormEndTime" style="font-weight:700; font-size:0.85rem; color:var(--text-mahogany); display:block; margin-bottom:0.3rem;">End Time</label>
                <input type="text" id="periodFormEndTime" class="form-input" aria-label="End Time" style="width:100%; padding:0.5rem; border-radius:8px;" placeholder="e.g. 05:00 PM" value="${escapeHtml(existingPeriod?.end_time || existingPeriod?.endTime || '05:00 PM')}" required />
              </div>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.75rem;">
              <div>
                <label for="periodFormTeacher" style="font-weight:700; font-size:0.85rem; color:var(--text-mahogany); display:block; margin-bottom:0.3rem;">Teacher / Faculty</label>
                <input type="text" id="periodFormTeacher" class="form-input" aria-label="Teacher or Faculty" style="width:100%; padding:0.5rem; border-radius:8px;" placeholder="e.g. Prof. Ravi Ranjan" value="${escapeHtml(existingPeriod?.teacher || 'Prof. Ravi Ranjan')}" />
              </div>
              <div>
                <label for="periodFormRoom" style="font-weight:700; font-size:0.85rem; color:var(--text-mahogany); display:block; margin-bottom:0.3rem;">Classroom / Hall</label>
                <input type="text" id="periodFormRoom" class="form-input" aria-label="Classroom or Hall" style="width:100%; padding:0.5rem; border-radius:8px;" placeholder="e.g. Classroom 1" value="${escapeHtml(existingPeriod?.room || 'Main Hall')}" />
              </div>
            </div>

            <div style="display:flex; align-items:center; gap:0.6rem; padding:0.5rem; background:#FAF9F6; border-radius:8px;">
              <input type="checkbox" id="periodFormIsCancelled" aria-label="Mark as Cancelled or Class Off" style="width:18px; height:18px; cursor:pointer;" ${(existingPeriod?.is_cancelled || existingPeriod?.isCancelled) ? 'checked' : ''} />
              <label for="periodFormIsCancelled" style="font-size:0.88rem; font-weight:700; color:#DC2626; cursor:pointer;">
                Mark as Cancelled / Class Off for this period
              </label>
            </div>

            <div style="display:flex; justify-content:flex-end; gap:0.75rem; margin-top:0.5rem; border-top:1px solid #E5E7EB; padding-top:1rem;">
              <button type="button" id="btnCancelPeriodModal" class="btn" style="background:#F3F4F6; color:var(--text-mahogany); font-weight:700; border-radius:8px; padding:0.5rem 1rem;">Cancel</button>
              <button type="submit" class="btn" style="background:var(--primary-emerald); color:#fff; font-weight:700; border-radius:8px; padding:0.5rem 1.25rem;">
                <i aria-hidden="true" class="fa-solid fa-cloud-arrow-up"></i> ${isEdit ? 'Save Period Changes' : 'Create & Sync Period'}
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modalEl = document.getElementById(modalId);
    const dialog = wireModalA11y(modalEl, { closeOnBackdrop: false });

    modalEl.querySelector('#btnClosePeriodModal')?.addEventListener('click', () => dialog.close());
    modalEl.querySelector('#btnCancelPeriodModal')?.addEventListener('click', () => dialog.close());

    modalEl.querySelector('#formAddEditPeriod')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const allSchedules = AppState.getClassSchedules ? AppState.getClassSchedules() : [];
      const batch_id = modalEl.querySelector('#periodFormBatch').value;
      const day_of_week = modalEl.querySelector('#periodFormDay').value;
      const sort_order = Number(modalEl.querySelector('#periodFormSort').value) || 1;
      const subject = modalEl.querySelector('#periodFormSubject').value.trim();
      const start_time = modalEl.querySelector('#periodFormStartTime').value.trim();
      const end_time = modalEl.querySelector('#periodFormEndTime').value.trim();
      const teacher = modalEl.querySelector('#periodFormTeacher').value.trim();
      const room = modalEl.querySelector('#periodFormRoom').value.trim();
      const is_cancelled = modalEl.querySelector('#periodFormIsCancelled').checked;

      if (isEdit && existingPeriod) {
        const targetId = String(existingPeriod.id || '');
        const idx = allSchedules.findIndex(p => String(p.id) === targetId);
        if (idx !== -1) {
          allSchedules[idx] = {
            ...allSchedules[idx],
            batch_id,
            batchId: batch_id,
            day_of_week,
            dayOfWeek: day_of_week,
            sort_order,
            sortOrder: sort_order,
            subject,
            start_time,
            startTime: start_time,
            end_time,
            endTime: end_time,
            teacher,
            room,
            is_cancelled,
            isCancelled: is_cancelled,
            updated_at: new Date().toISOString()
          };
        } else {
          allSchedules.push({
            id: existingPeriod.id || `SCHED-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            batch_id,
            batchId: batch_id,
            day_of_week,
            dayOfWeek: day_of_week,
            sort_order,
            sortOrder: sort_order,
            subject,
            start_time,
            startTime: start_time,
            end_time,
            endTime: end_time,
            teacher,
            room,
            is_cancelled,
            isCancelled: is_cancelled,
            updated_at: new Date().toISOString()
          });
        }
      } else {
        allSchedules.push({
          id: `SCHED-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          batch_id,
          batchId: batch_id,
          day_of_week,
          dayOfWeek: day_of_week,
          sort_order,
          sortOrder: sort_order,
          subject,
          start_time,
          startTime: start_time,
          end_time,
          endTime: end_time,
          teacher,
          room,
          is_cancelled,
          isCancelled: is_cancelled,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }

      await AppState.saveClassSchedules(allSchedules);
      activeAdminScheduleBatchId = batch_id;
      activeAdminScheduleDay = day_of_week;
      try {
        sessionStorage.setItem('pragyan_admin_schedule_batch', activeAdminScheduleBatchId);
        sessionStorage.setItem('pragyan_admin_schedule_day', activeAdminScheduleDay);
      } catch(err) {}
      dialog.close();
      renderAdminScheduleTab();
    });
  }

  function openAddHolidayModal(existingHoliday = null) {
    const isEdit = !!existingHoliday;
    const modalId = 'adminAddHolidayModal';
    const existingModal = document.getElementById(modalId);
    if (existingModal) existingModal.remove();

    const batches = AppState.getBatches ? AppState.getBatches() : ((typeof ACADEMIC !== 'undefined' && ACADEMIC.BATCHES) ? ACADEMIC.BATCHES : []);
    const todayStr = new Date().toISOString().split('T')[0];

    const modalHtml = `
      <div id="${modalId}" class="portal-modal-backdrop" style="display:flex; align-items:center; justify-content:center; position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:9999; padding:1rem;">
        <div class="inner-modal-content" style="background:#fff; border-radius:14px; max-width:480px; width:100%; max-height:90vh; overflow-y:auto; padding:1.5rem; box-shadow:0 10px 25px rgba(0,0,0,0.2);">
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #E5E7EB; padding-bottom:0.75rem; margin-bottom:1.25rem;">
            <h4 style="font-weight:800; font-size:1.15rem; color:#92400E; margin:0;">
              ${isEdit ? '✏️ Edit Official Holiday / Break' : '🏖️ Declare Official Holiday / Break'}
            </h4>
            <button type="button" id="btnCloseHolidayModal" class="btn" aria-label="Close dialog" style="background:none; border:none; font-size:1.2rem; cursor:pointer; color:var(--text-muted);">&times;</button>
          </div>

          <form id="formAddHoliday" style="display:flex; flex-direction:column; gap:1rem;">
            <div>
              <label for="holidayFormTitle" style="font-weight:700; font-size:0.85rem; color:var(--text-mahogany); display:block; margin-bottom:0.3rem;">Holiday / Vacation Title</label>
              <input type="text" id="holidayFormTitle" class="form-input" aria-label="Holiday Title" style="width:100%; padding:0.5rem; border-radius:8px;" placeholder="e.g. Diwali Break, Holi Festival, Independence Day" value="${escapeHtml(existingHoliday?.title || '')}" required />
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.75rem;">
              <div>
                <label for="holidayFormStartDate" style="font-weight:700; font-size:0.85rem; color:var(--text-mahogany); display:block; margin-bottom:0.3rem;">Start Date</label>
                <input type="date" id="holidayFormStartDate" class="form-input" aria-label="Start Date" style="width:100%; padding:0.5rem; border-radius:8px;" value="${existingHoliday?.start_date || existingHoliday?.startDate || todayStr}" required />
              </div>
              <div>
                <label for="holidayFormEndDate" style="font-weight:700; font-size:0.85rem; color:var(--text-mahogany); display:block; margin-bottom:0.3rem;">End Date</label>
                <input type="date" id="holidayFormEndDate" class="form-input" aria-label="End Date" style="width:100%; padding:0.5rem; border-radius:8px;" value="${existingHoliday?.end_date || existingHoliday?.endDate || existingHoliday?.start_date || existingHoliday?.startDate || todayStr}" required />
              </div>
            </div>

            <div>
              <label for="holidayFormBatch" style="font-weight:700; font-size:0.85rem; color:var(--text-mahogany); display:block; margin-bottom:0.3rem;">Target Batch Scope</label>
              <select id="holidayFormBatch" class="form-input" aria-label="Target Batch Scope" style="width:100%; padding:0.5rem; border-radius:8px;">
                <option value="ALL" ${(existingHoliday?.target_batch === 'ALL' || !existingHoliday?.target_batch) ? 'selected' : ''}>🌐 All Batches (Entire Institute Closed)</option>
                ${batches.map(b => {
                  const bId = b.batchId || b.id || b.batch_id || '';
                  const bName = b.name || b.batch_name || b.className || bId;
                  const bKey = getBatchCategoryKey(bId || bName);
                  const sel = isEdit && (existingHoliday.target_batch === bId || existingHoliday.targetBatch === bId || getBatchCategoryKey(existingHoliday.target_batch || existingHoliday.targetBatch || '') === bKey);
                  return `<option value="${escapeHtml(bKey || bId)}" ${sel ? 'selected' : ''}>🎓 ${escapeHtml(bName)} (${escapeHtml(bKey || bId)}) Only</option>`;
                }).join('')}
              </select>
            </div>

            <div>
              <label for="holidayFormDesc" style="font-weight:700; font-size:0.85rem; color:var(--text-mahogany); display:block; margin-bottom:0.3rem;">Description / Notice</label>
              <textarea id="holidayFormDesc" class="form-input" aria-label="Holiday Description" rows="2" style="width:100%; padding:0.5rem; border-radius:8px;" placeholder="e.g. Institute will remain closed on account of festival celebrations. Regular classes resume Monday.">${escapeHtml(existingHoliday?.description || '')}</textarea>
            </div>

            <div style="display:flex; justify-content:flex-end; gap:0.75rem; margin-top:0.5rem; border-top:1px solid #E5E7EB; padding-top:1rem;">
              <button type="button" id="btnCancelHolidayModal" class="btn" style="background:#F3F4F6; color:var(--text-mahogany); font-weight:700; border-radius:8px; padding:0.5rem 1rem;">Cancel</button>
              <button type="submit" class="btn" style="background:#D97706; color:#fff; font-weight:700; border-radius:8px; padding:0.5rem 1.25rem;">
                <i aria-hidden="true" class="fa-solid fa-cloud-arrow-up"></i> ${isEdit ? 'Save Holiday Changes' : 'Publish Holiday'}
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modalEl = document.getElementById(modalId);
    const dialog = wireModalA11y(modalEl, { closeOnBackdrop: false });

    modalEl.querySelector('#btnCloseHolidayModal')?.addEventListener('click', () => dialog.close());
    modalEl.querySelector('#btnCancelHolidayModal')?.addEventListener('click', () => dialog.close());

    modalEl.querySelector('#formAddHoliday')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const allHolidays = AppState.getInstituteHolidays ? AppState.getInstituteHolidays() : [];
      const title = modalEl.querySelector('#holidayFormTitle').value.trim();
      const start_date = modalEl.querySelector('#holidayFormStartDate').value;
      const end_date = modalEl.querySelector('#holidayFormEndDate').value || start_date;
      const target_batch = modalEl.querySelector('#holidayFormBatch').value;
      const description = modalEl.querySelector('#holidayFormDesc').value.trim();

      if (isEdit && existingHoliday) {
        const targetId = String(existingHoliday.id || '');
        const idx = allHolidays.findIndex(h => String(h.id) === targetId);
        if (idx !== -1) {
          allHolidays[idx] = {
            ...allHolidays[idx],
            title,
            start_date,
            startDate: start_date,
            end_date,
            endDate: end_date,
            target_batch,
            targetBatch: target_batch,
            description,
            updated_at: new Date().toISOString()
          };
        } else {
          allHolidays.push({
            id: existingHoliday.id || `HOL-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            title,
            start_date,
            startDate: start_date,
            end_date,
            endDate: end_date,
            target_batch,
            targetBatch: target_batch,
            description,
            updated_at: new Date().toISOString()
          });
        }
      } else {
        allHolidays.push({
          id: `HOL-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          title,
          start_date,
          startDate: start_date,
          end_date,
          endDate: end_date,
          target_batch,
          targetBatch: target_batch,
          description,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }

      await AppState.saveInstituteHolidays(allHolidays);
      dialog.close();
      renderAdminScheduleTab();
    });
  }

  function renderAdminScheduleTab() {
    const pane = document.getElementById('adminTabPane-schedule');
    if (!pane) return;

    try {
      const cfg = academicConfig();
      const rawBatches = AppState.getBatches ? AppState.getBatches() : (cfg?.BATCHES || []);
      const batches = Array.isArray(rawBatches) ? rawBatches : (cfg?.BATCHES || []);
      const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

      const rawSchedules = AppState.getClassSchedules ? AppState.getClassSchedules() : [];
      const allSchedules = Array.isArray(rawSchedules) ? rawSchedules : [];
      const rawHolidays = AppState.getInstituteHolidays ? AppState.getInstituteHolidays() : [];
      const allHolidays = Array.isArray(rawHolidays) ? rawHolidays : [];

      const activeKey = getBatchCategoryKey(activeAdminScheduleBatchId);

      // Filter periods for selected batch & day
      const currentPeriods = allSchedules.filter(sch => {
        if (!sch || typeof sch !== 'object') return false;
        const schB = sch.batch_id || sch.batchId || '';
        const matchB = (schB === activeAdminScheduleBatchId) ||
                       (getBatchCategoryKey(schB) === activeKey) ||
                       (String(schB).toUpperCase() === String(activeAdminScheduleBatchId).toUpperCase());
        const schD = String(sch.day_of_week || sch.dayOfWeek || '').toLowerCase();
        const matchD = schD === String(activeAdminScheduleDay || '').toLowerCase();
        return matchB && matchD;
      });

      currentPeriods.sort((a, b) => (Number(a.sort_order || a.sortOrder || 1) - Number(b.sort_order || b.sortOrder || 1)));

      const isAllOff = currentPeriods.length > 0 && currentPeriods.every(p => !!p.is_cancelled);
      const isRecurringActive = AppState.isRecurringWeekly ? AppState.isRecurringWeekly(activeAdminScheduleBatchId) : true;
      const selectedBatchObj = cfg?.resolveBatch ? cfg.resolveBatch(activeAdminScheduleBatchId) : null;
      const fallbackBatchFromState = batches.find(b => (b.batchId || b.id || b.batch_id) === activeAdminScheduleBatchId || getBatchCategoryKey(b.batchId || b.id || b.name || '') === activeKey);
      const batchName = selectedBatchObj?.name || fallbackBatchFromState?.name || fallbackBatchFromState?.batch_name || activeAdminScheduleBatchId;
      const batchTiming = fallbackBatchFromState?.timing || fallbackBatchFromState?.timings || (selectedBatchObj ? 'Regular Schedule' : 'As per timetable');
      const batchDisplayName = `${batchName} (${batchTiming})`;

    pane.innerHTML = `
      <div class="dash-card schedule-header-card" style="margin-bottom: 1.25rem;">
        <div class="schedule-header-inner">
          <div class="schedule-header-info">
            <div class="schedule-header-tags">
              <span class="section-tag"><i aria-hidden="true" class="fa-solid fa-calendar-week"></i> Academic Scheduling</span>
              <span class="pill-item pill-emerald"><i aria-hidden="true" class="fa-solid fa-cloud-arrow-up"></i> Supabase Cloud Synced</span>
            </div>
            <h3 class="schedule-header-title">
              Class Timetable, Weekly Repeating & Holiday Controls
            </h3>
            <p class="schedule-header-subtitle">
              Configure daily periods, replicate standard timetables across the entire week with 1 click, toggle sudden class-offs, and declare official holidays.
            </p>
          </div>
          
          <div class="schedule-header-actions">
            <button type="button" class="btn btn-schedule-action" id="btnAdminAddPeriod" style="background:#10B981; color:#FFFFFF; font-weight:800; border-radius:8px; padding:0.65rem 1.15rem; border:1.5px solid #34D399; box-shadow:0 4px 12px rgba(16,185,129,0.35);">
              <i aria-hidden="true" class="fa-solid fa-plus"></i> Add Period
            </button>
            <button type="button" class="btn btn-schedule-action" id="btnAdminAddHoliday" style="background:linear-gradient(135deg, #FDE68A 0%, #F59E0B 100%); color:#78350F; font-weight:800; border-radius:8px; padding:0.65rem 1.15rem; border:1.5px solid #FCD34D; box-shadow:0 4px 12px rgba(245,158,11,0.3);">
              <i aria-hidden="true" class="fa-solid fa-umbrella-beach"></i> Declare Holiday
            </button>
          </div>
        </div>
      </div>

      <!-- Controls & Filter Toolbar -->
      <div class="dash-card schedule-toolbar" style="margin-bottom: 1.25rem;">
        <div class="schedule-toolbar-top">
          <!-- Batch Selector -->
          <div class="schedule-batch-selector-wrap">
            <label for="adminScheduleBatchSelect">
              <i aria-hidden="true" class="fa-solid fa-users-rectangle" style="color:#047857;"></i> Select Batch:
            </label>
            <select id="adminScheduleBatchSelect" class="form-input schedule-batch-select" aria-label="Select Batch">
              ${batches.map(b => {
                const bId = b.batchId || b.id || b.batch_id || '';
                const bName = b.name || b.batch_name || b.className || bId;
                const bKey = getBatchCategoryKey(bId || bName);
                const isSelected = (bId === activeAdminScheduleBatchId) ||
                                   (bKey && activeKey && bKey === activeKey) ||
                                   (String(bId).toUpperCase() === String(activeAdminScheduleBatchId).toUpperCase()) ||
                                   (String(bName).toLowerCase() === String(activeAdminScheduleBatchId).toLowerCase());
                return `<option value="${escapeHtml(bKey || bId)}" ${isSelected ? 'selected' : ''}>${escapeHtml(bName)} (${escapeHtml(bKey || bId)})</option>`;
              }).join('')}
            </select>
          </div>

          <!-- Quick Action Buttons: Repeat Week & Class Off -->
          <div class="schedule-quick-actions-bar" style="display:flex; flex-wrap:wrap; gap:0.5rem; align-items:center;">
            <!-- Interactive Weekly Repeating Toggle -->
            <div class="schedule-recurring-toggle-box" style="display:inline-flex; align-items:center; gap:0.55rem; background:#F8FAFC; border:1.5px solid #CBD5E1; border-radius:8px; padding:0.35rem 0.75rem; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
              <label for="chkAutoRepeatWeekly" style="margin:0; display:inline-flex; align-items:center; cursor:pointer; gap:0.45rem; font-size:0.83rem; font-weight:800; color:#1E293B;">
                <input type="checkbox" id="chkAutoRepeatWeekly" ${isRecurringActive ? 'checked' : ''} style="cursor:pointer; width:16px; height:16px; accent-color:#047857;">
                <i aria-hidden="true" class="fa-solid fa-repeat" style="color:${isRecurringActive ? '#047857' : '#64748B'};"></i>
                <span>Repeat Mon–Sun:</span>
              </label>
              <span class="status-pill ${isRecurringActive ? 'status-verified' : 'status-pending'}" id="recurringStatusPill" style="font-size:0.75rem; font-weight:800; padding:2px 7px;">
                ${isRecurringActive ? 'Active (All 7 Days)' : 'Manual'}
              </span>
            </div>

            <button type="button" class="btn btn-repeat-week" id="btnReplicateWeek" style="background:linear-gradient(135deg, #1E40AF 0%, #2563EB 100%); border:1.5px solid #1D4ED8; color:#FFFFFF; font-weight:800; border-radius:8px; padding:0.55rem 0.9rem; font-size:0.84rem; box-shadow:0 3px 10px rgba(37,99,235,0.25);" title="Copy this day's timetable to Monday through Saturday">
              <i aria-hidden="true" class="fa-solid fa-bolt"></i> <span>⚡ Repeat for Whole Week (Mon–Sat)</span>
            </button>
            <button type="button" class="btn btn-repeat-full-week" id="btnReplicateWeekFull" style="background:linear-gradient(135deg, #047857 0%, #059669 100%); border:1.5px solid #10B981; color:#FFFFFF; font-weight:800; border-radius:8px; padding:0.55rem 0.9rem; font-size:0.84rem; box-shadow:0 3px 10px rgba(4,120,87,0.25);" title="Copy this day's timetable to the entire week (Monday through Sunday)">
              <i aria-hidden="true" class="fa-solid fa-repeat"></i> <span>🔁 Repeat for Whole Week (Mon–Sun)</span>
            </button>
            <button type="button" class="btn btn-toggle-day-off" id="btnToggleDayOff" style="background:${isAllOff ? 'linear-gradient(135deg, #065F46 0%, #047857 100%)' : 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)'}; border:1.5px solid ${isAllOff ? '#047857' : '#991B1B'}; color:#FFFFFF; font-weight:800; border-radius:8px; padding:0.55rem 0.9rem; font-size:0.84rem; box-shadow:0 3px 10px ${isAllOff ? 'rgba(4,120,87,0.25)' : 'rgba(220,38,38,0.25)'};">
              <i aria-hidden="true" class="${isAllOff ? 'fa-solid fa-circle-check' : 'fa-solid fa-ban'}"></i> <span>${isAllOff ? 'Resume All Classes' : '🚫 Mark Day as Class Off'}</span>
            </button>
          </div>
        </div>

        <!-- Days of the Week Selector Pills -->
        <div class="student-schedule-week-bar" style="margin-bottom:0;">
          ${daysOfWeek.map(d => {
            const isActive = d.toLowerCase() === activeAdminScheduleDay.toLowerCase();
            const periodsForD = allSchedules.filter(s => {
              if (!s || typeof s !== 'object') return false;
              const sB = s.batch_id || s.batchId || '';
              const matchB = (sB === activeAdminScheduleBatchId) || (getBatchCategoryKey(sB) === activeKey);
              const matchD = String(s.day_of_week || s.dayOfWeek || '').toLowerCase() === d.toLowerCase();
              return matchB && matchD;
            });
            const hasOff = periodsForD.length > 0 && periodsForD.every(p => !!p.is_cancelled);
            return `
              <button type="button" class="student-week-chip ${isActive ? 'active' : ''}" data-day="${d}" aria-label="Day ${d}">
                <span class="day-chip-name">${d}</span>
                <span class="day-chip-count">(${periodsForD.length})</span>
                ${hasOff ? '<span class="day-chip-off" title="Class Off">🚫</span>' : ''}
              </button>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Periods Grid Section -->
      <div class="dash-card schedule-periods-section" style="margin-bottom: 1.5rem;">
        <div class="dash-card-header schedule-periods-header">
          <div class="dash-card-title schedule-periods-title">
            <i aria-hidden="true" class="fa-solid fa-clock-rotate-left" style="color:#047857;"></i> Periods for ${escapeHtml(activeAdminScheduleDay)} — ${escapeHtml(batchDisplayName)}
          </div>
          <span class="schedule-count-pill">
            Total: <strong>${currentPeriods.length}</strong> period${currentPeriods.length === 1 ? '' : 's'}
          </span>
        </div>

        ${currentPeriods.length === 0 ? `
          <div class="schedule-empty-state">
            <i aria-hidden="true" class="fa-solid fa-calendar-xmark schedule-empty-icon"></i>
            <h4 class="schedule-empty-title">No Periods Scheduled for ${escapeHtml(activeAdminScheduleDay)}</h4>
            <p class="schedule-empty-subtitle">
              Create periods one-by-one or use standard template to quickly seed the batch timetable.
            </p>
            <div class="schedule-empty-actions">
              <button type="button" class="btn btn-empty-add-period" id="btnAdminEmptyAddPeriod">
                <i aria-hidden="true" class="fa-solid fa-plus"></i> Add First Period
              </button>
              <button type="button" class="btn btn-empty-seed-default" id="btnAdminSeedDefault">
                <i aria-hidden="true" class="fa-solid fa-wand-magic-sparkles"></i> Auto-Populate Standard Subjects
              </button>
            </div>
          </div>
        ` : `
          <div class="schedule-periods-grid">
            ${currentPeriods.map((p, idx) => `
              <div class="schedule-period-card ${p.is_cancelled ? 'is-off' : ''}" data-period-id="${escapeHtml(p.id)}">
                <div class="period-card-main">
                  <div class="period-top-row">
                    <span class="period-number-badge">Period #${p.sort_order || (idx + 1)}</span>
                    <span class="period-time-badge">
                      <i aria-hidden="true" class="fa-regular fa-clock"></i> ${(p.start_time && p.end_time) ? `${escapeHtml(p.start_time)} – ${escapeHtml(p.end_time)}` : escapeHtml(p.start_time || 'Timing TBA')}
                    </span>
                  </div>

                  <div class="period-subject-title">
                    <i aria-hidden="true" class="${p.is_cancelled ? 'fa-solid fa-ban' : 'fa-solid fa-book-bookmark'}" style="color:${p.is_cancelled ? '#DC2626' : '#047857'};"></i>
                    <span class="period-subject-name" style="${p.is_cancelled ? 'text-decoration:line-through; color:#991B1B;' : ''}">${escapeHtml(p.subject)}</span>
                  </div>

                  <div class="period-meta-row">
                    <div class="period-meta-item">
                      <i aria-hidden="true" class="fa-solid fa-chalkboard-user"></i>
                      <span><strong>Teacher:</strong> ${escapeHtml(p.teacher || 'Not Assigned')}</span>
                    </div>
                    <div class="period-meta-item">
                      <i aria-hidden="true" class="fa-solid fa-door-open" style="color:#2563EB;"></i>
                      <span><strong>Classroom:</strong> ${escapeHtml(p.room || 'Main Hall')}</span>
                    </div>
                    <div class="period-meta-item period-meta-status">
                      <i aria-hidden="true" class="fa-solid fa-signal" style="color:#D97706;"></i>
                      <span><strong>Status:</strong> ${p.is_cancelled ? '<span class="status-pill status-cancelled" style="background:#FEE2E2; color:#991B1B; border:1px solid #FCA5A5; font-weight:800; font-size:0.78rem; padding:0.2rem 0.55rem; border-radius:99px;"><i aria-hidden="true" class="fa-solid fa-ban"></i> Cancelled / Class Off</span>' : '<span class="status-pill status-verified" style="background:#D1FAE5; color:#065F46; border:1px solid #6EE7B7; font-weight:800; font-size:0.78rem; padding:0.2rem 0.55rem; border-radius:99px;"><i aria-hidden="true" class="fa-solid fa-circle-check"></i> Active & Scheduled</span>'}</span>
                    </div>
                  </div>
                </div>

                <div class="period-card-actions">
                  <button type="button" class="btn btn-sm btn-edit-period" data-id="${escapeHtml(p.id)}" aria-label="Edit period">
                    <i aria-hidden="true" class="fa-solid fa-pen-to-square"></i> <span>Edit</span>
                  </button>
                  <button type="button" class="btn btn-sm btn-toggle-period-off" data-id="${escapeHtml(p.id)}" aria-label="Toggle class off" style="background:${p.is_cancelled ? '#D1FAE5' : '#FEE2E2'}; border:1.5px solid ${p.is_cancelled ? '#34D399' : '#F87171'}; color:${p.is_cancelled ? '#065F46' : '#991B1B'}; font-weight:800; border-radius:6px; padding:0.4rem 0.75rem; font-size:0.82rem;">
                    <i aria-hidden="true" class="${p.is_cancelled ? 'fa-solid fa-rotate-left' : 'fa-solid fa-ban'}"></i> <span>${p.is_cancelled ? 'Resume' : 'Class Off'}</span>
                  </button>
                  <button type="button" class="btn btn-sm btn-delete-period" data-id="${escapeHtml(p.id)}" aria-label="Delete period">
                    <i aria-hidden="true" class="fa-solid fa-trash"></i> <span class="btn-delete-label">Delete</span>
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>

      <!-- Institute Holidays & Breaks Section -->
      <div class="dash-card schedule-holidays-section">
        <div class="dash-card-header schedule-holidays-header">
          <div class="schedule-holidays-head-text">
            <div class="dash-card-title schedule-holidays-title">
              <i aria-hidden="true" class="fa-solid fa-umbrella-beach" style="color:#D97706;"></i> Official Institute Holidays & Breaks
            </div>
            <div class="schedule-holidays-subtitle">
              Holidays automatically display banners across student portals and indicate day-off alerts.
            </div>
          </div>
          <button type="button" class="btn btn-add-holiday-header" id="btnAdminSectionAddHoliday" style="background:linear-gradient(135deg, #FDE68A 0%, #F59E0B 100%); color:#78350F; font-weight:800; border-radius:8px; padding:0.45rem 0.95rem; font-size:0.85rem; border:1.5px solid #FCD34D; box-shadow:0 3px 10px rgba(245,158,11,0.25);">
            <i aria-hidden="true" class="fa-solid fa-plus"></i> New Holiday
          </button>
        </div>

        ${allHolidays.length === 0 ? `
          <div class="schedule-holidays-empty">
            <i aria-hidden="true" class="fa-solid fa-sun" style="font-size:2rem; color:#F59E0B; opacity:0.8; display:block; margin-bottom:0.4rem;"></i>
            <h5 style="font-size:1rem; font-weight:800; color:#0F172A; margin-bottom:0.25rem;">No Holidays Declared</h5>
            <div style="font-size:0.86rem; color:#64748B;">No active holidays or breaks configured. Click "New Holiday" to declare one.</div>
          </div>
        ` : `
          <div class="holiday-list-grid">
            ${allHolidays.map(h => `
              <div class="holiday-item-card">
                <div>
                  <div class="holiday-title">
                    <span>🏖️ ${escapeHtml(h.title || 'Institute Holiday')}</span>
                  </div>
                  <div class="holiday-dates">
                    <i aria-hidden="true" class="fa-regular fa-calendar"></i> ${escapeHtml(h.start_date || '')} ${h.end_date && h.end_date !== h.start_date ? `to ${escapeHtml(h.end_date)}` : ''}
                  </div>
                  <div class="holiday-target-meta">
                    <strong>Target:</strong> ${h.target_batch === 'ALL' || !h.target_batch ? '<span class="status-pill status-verified" style="background:#D1FAE5; color:#065F46; border:1px solid #6EE7B7; font-weight:800; font-size:0.78rem; padding:0.2rem 0.55rem; border-radius:6px;">All Batches</span>' : `<span class="status-pill status-adjusted" style="background:#EDE9FE; color:#5B21B6; border:1px solid #DDD6FE; font-weight:800; font-size:0.78rem; padding:0.2rem 0.55rem; border-radius:6px;">${escapeHtml(h.target_batch)}</span>`}
                  </div>
                  ${h.description ? `<div class="holiday-desc">"${escapeHtml(h.description)}"</div>` : ''}
                </div>
                <div class="holiday-card-actions">
                  <button type="button" class="btn btn-sm btn-edit-holiday" data-id="${escapeHtml(h.id)}" aria-label="Edit holiday">
                    <i aria-hidden="true" class="fa-solid fa-pen-to-square"></i> Edit
                  </button>
                  <button type="button" class="btn btn-sm btn-delete-holiday" data-id="${escapeHtml(h.id)}" aria-label="Remove holiday">
                    <i aria-hidden="true" class="fa-solid fa-trash"></i> Remove
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    `;

    // Attach Event Listeners
    // Batch Selector
    pane.querySelector('#adminScheduleBatchSelect')?.addEventListener('change', (e) => {
      const val = e.target.value;
      const canonicalKey = getBatchCategoryKey(val);
      activeAdminScheduleBatchId = canonicalKey || val;
      try {
        sessionStorage.setItem('pragyan_admin_schedule_batch', activeAdminScheduleBatchId);
      } catch (err) {}
      renderAdminScheduleTab();
    });

    // Day chips
    pane.querySelectorAll('.student-week-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        activeAdminScheduleDay = chip.dataset.day || 'Monday';
        try {
          sessionStorage.setItem('pragyan_admin_schedule_day', activeAdminScheduleDay);
        } catch (err) {}
        renderAdminScheduleTab();
      });
    });

    // Add Period Buttons
    pane.querySelector('#btnAdminAddPeriod')?.addEventListener('click', () => openAddEditPeriodModal());
    pane.querySelector('#btnAdminEmptyAddPeriod')?.addEventListener('click', () => openAddEditPeriodModal());

    // Add Holiday Buttons
    pane.querySelector('#btnAdminAddHoliday')?.addEventListener('click', () => openAddHolidayModal());
    pane.querySelector('#btnAdminSectionAddHoliday')?.addEventListener('click', () => openAddHolidayModal());

    // Seed Standard Subjects
    pane.querySelector('#btnAdminSeedDefault')?.addEventListener('click', () => {
      seedDefaultScheduleForBatchAndDay(activeAdminScheduleBatchId, activeAdminScheduleDay);
    });

    // Toggle Weekly Routine Repeating (Mon–Sun Auto-Sync)
    pane.querySelector('#chkAutoRepeatWeekly')?.addEventListener('change', async (e) => {
      const isChecked = e.target.checked;
      AppState.setRecurringWeekly(activeAdminScheduleBatchId, isChecked);
      if (isChecked) {
        await replicateDayScheduleAcrossWeek(activeAdminScheduleBatchId, activeAdminScheduleDay, true);
      } else {
        renderAdminScheduleTab();
      }
    });

    // Replicate for Whole Week (Mon–Sat)
    pane.querySelector('#btnReplicateWeek')?.addEventListener('click', () => {
      replicateDayScheduleAcrossWeek(activeAdminScheduleBatchId, activeAdminScheduleDay, false);
    });

    // Replicate for Full Week (Mon–Sun)
    pane.querySelector('#btnReplicateWeekFull')?.addEventListener('click', () => {
      replicateDayScheduleAcrossWeek(activeAdminScheduleBatchId, activeAdminScheduleDay, true);
    });

    // Toggle Entire Day Off
    pane.querySelector('#btnToggleDayOff')?.addEventListener('click', () => {
      toggleEntireDayOff(activeAdminScheduleBatchId, activeAdminScheduleDay, !isAllOff);
    });

    // Edit Period
    pane.querySelectorAll('.btn-edit-period').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const pId = String(btn.dataset.id || '');
        const allSchedules = AppState.getClassSchedules ? AppState.getClassSchedules() : [];
        const period = allSchedules.find(p => String(p.id) === pId) || currentPeriods.find(p => String(p.id) === pId);
        if (period) {
          openAddEditPeriodModal(period);
        } else {
          console.warn('Period not found for ID:', pId);
        }
      });
    });

    // Edit Holiday
    pane.querySelectorAll('.btn-edit-holiday').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const hId = String(btn.dataset.id || '');
        const allHolidays = AppState.getInstituteHolidays ? AppState.getInstituteHolidays() : [];
        const holiday = allHolidays.find(h => String(h.id) === hId);
        if (holiday) openAddHolidayModal(holiday);
      });
    });

    // Toggle Single Period Off
    pane.querySelectorAll('.btn-toggle-period-off').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const pId = String(btn.dataset.id || '');
        const allSchedules = AppState.getClassSchedules ? AppState.getClassSchedules() : [];
        const period = allSchedules.find(p => String(p.id) === pId) || currentPeriods.find(p => String(p.id) === pId);
        if (period) {
          period.is_cancelled = !period.is_cancelled;
          period.isCancelled = period.is_cancelled;
          await AppState.saveClassSchedules(allSchedules);
          renderAdminScheduleTab();
        }
      });
    });

    // Delete Single Period
    pane.querySelectorAll('.btn-delete-period').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const pId = String(btn.dataset.id || '');
        if (confirm('Delete this period from schedule?')) {
          const allSchedules = AppState.getClassSchedules ? AppState.getClassSchedules() : [];
          const updated = allSchedules.filter(p => String(p.id) !== pId);
          await AppState.saveClassSchedules(updated);
          if (typeof SupabaseSync !== 'undefined' && SupabaseSync.mutate && pId) {
            SupabaseSync.mutate('class_schedules', 'delete', null, { where: { id: pId } }).catch(err => console.warn(err));
          }
          renderAdminScheduleTab();
        }
      });
    });

    // Delete Holiday
    pane.querySelectorAll('.btn-delete-holiday').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const hId = String(btn.dataset.id || '');
        if (confirm('Remove this official holiday?')) {
          const allHolidays = AppState.getInstituteHolidays ? AppState.getInstituteHolidays() : [];
          const updatedHolidays = allHolidays.filter(h => String(h.id) !== hId);
          await AppState.saveInstituteHolidays(updatedHolidays);
          if (typeof SupabaseSync !== 'undefined' && SupabaseSync.mutate && hId) {
            SupabaseSync.mutate('institute_holidays', 'delete', null, { where: { id: hId } }).catch(err => console.warn(err));
          }
          renderAdminScheduleTab();
        }
      });
    });
    } catch (err) {
      console.error('[renderAdminScheduleTab]', err);
      pane.innerHTML = `
        <div class="dash-card" style="padding: 2rem; text-align: center; color: #DC2626;">
          <i aria-hidden="true" class="fa-solid fa-triangle-exclamation" style="font-size: 2rem; margin-bottom: 0.75rem;"></i>
          <h4 style="font-weight: 800; margin-bottom: 0.5rem;">Failed to load Class Schedule controls</h4>
          <p style="font-size: 0.9rem; color: #64748B; margin-bottom: 1.25rem;">${escapeHtml(err?.message || 'An unexpected error occurred while preparing schedule view.')}</p>
          <button type="button" class="btn btn-emerald" onclick="location.reload()" style="padding: 0.5rem 1.25rem; font-weight: 700;">Refresh Dashboard</button>
        </div>
      `;
    }
  }

  /* ==========================================================================
   * ADMIN BATCHES & COURSE MASTER TAB
   * ========================================================================== */
  let adminBatchesFilterStream = 'all';
  let adminBatchesFilterStatus = 'all';
  let adminBatchesSearchQuery = '';

  function renderAdminBatchesTab() {
    const pane = document.getElementById('adminTabPane-batches');
    if (!pane) return;

    const batches = AppState.getBatches();
    const students = AppState.getStudents();

    // Map student count per batch
    const studentCountMap = {};
    students.forEach(st => {
      const bKey = getBatchCategoryKey(st.className || st.batchName || st.class_name || '');
      if (bKey) {
        studentCountMap[bKey] = (studentCountMap[bKey] || 0) + 1;
      }
    });

    // KPI Aggregations
    const totalBatches = batches.length;
    const activeBatches = batches.filter(b => (b.status || 'Active').toLowerCase() === 'active').length;
    const totalEnrolledStudents = students.length;
    const totalCapacity = batches.reduce((acc, b) => acc + (Number(b.capacity) || 40), 0);
    const totalMonthlyRevenuePotential = batches.reduce((acc, b) => {
      const bKey = getBatchCategoryKey(b.name || b.className || b.id || b.batch_id || '');
      const count = studentCountMap[bKey] || 0;
      const fee = Number(b.monthlyFee ?? b.monthly_fee) || 0;
      return acc + (fee * count);
    }, 0);

    // Filter batches
    let filteredBatches = batches.filter(b => {
      // Stream filter
      if (adminBatchesFilterStream !== 'all') {
        const bStream = (b.stream || '').toLowerCase();
        if (adminBatchesFilterStream.toLowerCase() !== bStream) {
          // Check if stream is in name or id
          const bName = (b.name || '').toLowerCase();
          if (!bName.includes(adminBatchesFilterStream.toLowerCase())) {
            return false;
          }
        }
      }

      // Status filter
      if (adminBatchesFilterStatus !== 'all') {
        const bStatus = (b.status || 'Active').toLowerCase();
        if (adminBatchesFilterStatus.toLowerCase() !== bStatus) {
          return false;
        }
      }

      // Search query
      if (adminBatchesSearchQuery) {
        const q = adminBatchesSearchQuery.toLowerCase();
        const bId = (b.id || b.batch_id || '').toLowerCase();
        const bName = (b.name || b.className || '').toLowerCase();
        const bClass = (b.className || b.class_name || '').toLowerCase();
        const bTeacher = (b.teacher || (Array.isArray(b.teachers) ? b.teachers.join(' ') : '')).toLowerCase();
        const bRoom = (b.room || '').toLowerCase();
        const bSubjects = (Array.isArray(b.subjects) ? b.subjects.map(s => typeof s === 'string' ? s : (s.name || '')).join(' ') : '').toLowerCase();
        return bId.includes(q) || bName.includes(q) || bClass.includes(q) || bTeacher.includes(q) || bRoom.includes(q) || bSubjects.includes(q);
      }

      return true;
    });

    pane.innerHTML = `
      <div class="admin-batches-container">
        <!-- Header Banner -->
        <div class="admin-batches-header">
          <div>
            <div class="admin-batches-header-title">
              <i aria-hidden="true" class="fa-solid fa-layer-group"></i> Batches &amp; Course Master
            </div>
            <div class="admin-batches-header-sub">
              Centralized Supabase-synced course catalog. Regulate class definitions, fee tariffs, lecture timings, classroom rooms, and faculty mentors directly reflected in real time across Student Profiles.
            </div>
          </div>
          <div class="admin-batches-header-actions">
            <button type="button" id="btnAdminSyncBatches" class="btn" style="background:#FFFFFF; color:var(--primary-emerald); border:1px solid rgba(255,255,255,0.4); font-weight:800; border-radius:8px; padding:0.6rem 1.25rem; display:inline-flex; align-items:center; gap:0.5rem; cursor:pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.12);">
              <i aria-hidden="true" class="fa-solid fa-arrows-rotate"></i> Sync Cloud
            </button>
          </div>
        </div>

        <!-- KPI Stat Cards -->
        <div class="admin-batches-kpi-grid">
          <div class="admin-batch-kpi-card">
            <div class="admin-batch-kpi-icon" style="background:#ECFDF5; color:#059669;">
              <i aria-hidden="true" class="fa-solid fa-book-bookmark"></i>
            </div>
            <div>
              <div class="admin-batch-kpi-label">Active / Total Batches</div>
              <div class="admin-batch-kpi-value">${activeBatches} <span style="font-size:0.95rem; color:var(--text-muted); font-weight:600;">/ ${totalBatches}</span></div>
            </div>
          </div>

          <div class="admin-batch-kpi-card">
            <div class="admin-batch-kpi-icon" style="background:#EFF6FF; color:#2563EB;">
              <i aria-hidden="true" class="fa-solid fa-user-graduate"></i>
            </div>
            <div>
              <div class="admin-batch-kpi-label">Enrolled Students</div>
              <div class="admin-batch-kpi-value">${totalEnrolledStudents} <span style="font-size:0.95rem; color:var(--text-muted); font-weight:600;">/ ${totalCapacity} Cap</span></div>
            </div>
          </div>

          <div class="admin-batch-kpi-card">
            <div class="admin-batch-kpi-icon" style="background:#FEF3C7; color:#D97706;">
              <i aria-hidden="true" class="fa-solid fa-indian-rupee-sign"></i>
            </div>
            <div>
              <div class="admin-batch-kpi-label">Monthly Fee Billing</div>
              <div class="admin-batch-kpi-value">₹${totalMonthlyRevenuePotential.toLocaleString()}</div>
            </div>
          </div>

          <div class="admin-batch-kpi-card">
            <div class="admin-batch-kpi-icon" style="background:#FAF5FF; color:#9333EA;">
              <i aria-hidden="true" class="fa-solid fa-chalkboard-user"></i>
            </div>
            <div>
              <div class="admin-batch-kpi-label">Cloud Sync State</div>
              <div class="admin-batch-kpi-value" style="font-size:1.15rem; color:#059669;">
                <i aria-hidden="true" class="fa-solid fa-circle-check"></i> Connected
              </div>
            </div>
          </div>
        </div>

        <!-- Search & Filter Toolbar -->
        <div class="admin-batches-toolbar">
          <div class="admin-batches-search-wrap">
            <i aria-hidden="true" class="fa-solid fa-magnifying-glass"></i>
            <input type="text" id="adminBatchesSearchInput" class="admin-batches-search-input" aria-label="Search Batches" placeholder="Search by batch name, code, teacher, room, or subject..." value="${escapeHtml(adminBatchesSearchQuery)}" />
          </div>

          <div class="admin-batches-filter-group">
            <select id="adminBatchesStreamFilter" class="admin-batches-filter-select" aria-label="Filter by Academic Stream">
              <option value="all" ${adminBatchesFilterStream === 'all' ? 'selected' : ''}>All Streams (All Disciplines)</option>
              <option value="Foundation" ${adminBatchesFilterStream === 'Foundation' ? 'selected' : ''}>Foundation (Classes 8th–10th)</option>
              <option value="Science" ${adminBatchesFilterStream === 'Science' ? 'selected' : ''}>Science (PCM / PCB / NEET / JEE)</option>
              <option value="Commerce" ${adminBatchesFilterStream === 'Commerce' ? 'selected' : ''}>Commerce (Accountancy &amp; Economics)</option>
              <option value="Arts" ${adminBatchesFilterStream === 'Arts' ? 'selected' : ''}>Arts &amp; Humanities</option>
              <option value="Special" ${adminBatchesFilterStream === 'Special' ? 'selected' : ''}>Specialized English &amp; Skills</option>
            </select>

            <select id="adminBatchesStatusFilter" class="admin-batches-filter-select" aria-label="Filter by Batch Status">
              <option value="all" ${adminBatchesFilterStatus === 'all' ? 'selected' : ''}>All Statuses</option>
              <option value="Active" ${adminBatchesFilterStatus === 'Active' ? 'selected' : ''}>Active Batches</option>
              <option value="Upcoming" ${adminBatchesFilterStatus === 'Upcoming' ? 'selected' : ''}>Upcoming Batches</option>
              <option value="Archived" ${adminBatchesFilterStatus === 'Archived' ? 'selected' : ''}>Archived Batches</option>
            </select>
          </div>
        </div>

        <!-- Batches Grid -->
        ${filteredBatches.length === 0 ? `
          <div class="dash-card" style="text-align:center; padding:3rem 1.5rem; color:var(--text-muted);">
            <div style="font-size:2.5rem; margin-bottom:0.75rem; color:var(--text-sand);">📚</div>
            <h3 style="font-size:1.15rem; font-weight:800; color:var(--text-mahogany);">No Batches Found</h3>
            <p style="font-size:0.88rem; margin-top:0.35rem;">No batch records matched your filter criteria. You can create a new batch or reset filters.</p>
            <button type="button" id="btnResetBatchFilters" class="btn" style="margin-top:1rem; background:var(--primary-emerald); color:#fff; font-weight:700; border-radius:8px; padding:0.5rem 1.25rem;">
              Reset Filters
            </button>
          </div>
        ` : `
          <div class="admin-batches-grid">
            ${filteredBatches.map(b => {
              const bId = b.batchId || b.id || b.batch_id || getBatchCategoryKey(b.name || b.className) || '';
              const bName = b.name || b.batch_name || b.batchName || b.className || 'Unnamed Batch';
              const bClass = b.className || b.class_name || b.name || '';
              const bStream = b.stream || (bName.includes('Science') ? 'Science' : (bName.includes('Commerce') ? 'Commerce' : (bName.includes('Arts') ? 'Arts' : (bName.includes('Foundation') ? 'Foundation' : 'Academic'))));
              const bMonthlyFee = Number(b.monthlyFee ?? b.monthly_fee) || 0;
              const bAnnualFee = Number(b.annualFee ?? b.annual_fee) || (bMonthlyFee * 12);
              const bTiming = b.timing || b.timings || 'Contact Office';
              const bRoom = b.room || b.room_no || 'Room 1';
              const bBillingDay = Number(b.billingDay ?? b.billing_day ?? 1);
              const bCapacity = Number(b.capacity || 40);
              const bTagline = b.tagline || '';
              const bStatus = b.status || 'Active';

              const bKey = getBatchCategoryKey(bName || bClass || bId);
              const enrolledCount = studentCountMap[bKey] || 0;
              const occupancyPct = Math.min(100, Math.round((enrolledCount / Math.max(1, bCapacity)) * 100));

              // Format teachers
              let teacherNames = [];
              if (Array.isArray(b.teachers) && b.teachers.length > 0) {
                teacherNames = b.teachers;
              } else if (b.teacher) {
                teacherNames = b.teacher.split(/[&,]/).map(t => t.trim()).filter(Boolean);
              }
              if (teacherNames.length === 0) teacherNames = ['Chandan Kumar (Director)'];

              // Format subjects
              let subjectsList = [];
              if (Array.isArray(b.subjects) && b.subjects.length > 0) {
                subjectsList = b.subjects.map(s => typeof s === 'string' ? s : (s.name || ''));
              } else if (typeof BATCH_SUBJECTS !== 'undefined' && BATCH_SUBJECTS[bKey]) {
                subjectsList = BATCH_SUBJECTS[bKey];
              }

              return `
                <div class="admin-batch-card" data-id="${escapeHtml(bId)}">
                  <div class="admin-batch-card-top">
                    <div class="admin-batch-card-badges">
                      <span class="admin-batch-code-badge">${escapeHtml(bId)}</span>
                      <div style="display:flex; gap:0.4rem; align-items:center;">
                        <span class="admin-batch-stream-badge">${escapeHtml(bStream)}</span>
                        <span class="admin-batch-status-badge ${bStatus.toLowerCase()}">${escapeHtml(bStatus)}</span>
                      </div>
                    </div>
                    <div class="admin-batch-card-title">${escapeHtml(bName)}</div>
                    <div class="admin-batch-card-class"><i aria-hidden="true" class="fa-solid fa-graduation-cap" style="color:var(--primary-emerald);"></i> ${escapeHtml(bClass)}</div>
                    ${bTagline ? `<div class="admin-batch-card-tagline"><i aria-hidden="true" class="fa-solid fa-star"></i> ${escapeHtml(bTagline)}</div>` : ''}
                  </div>

                  <div class="admin-batch-card-body">
                    <div class="admin-batch-fee-row">
                      <div>
                        <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">Monthly Tuition</div>
                        <div class="admin-batch-fee-val">₹${bMonthlyFee.toLocaleString()}<span style="font-size:0.78rem; font-weight:600; color:var(--text-muted);">/mo</span></div>
                      </div>
                      <div style="text-align:right;">
                        <div class="admin-batch-annual-fee">Annual: ₹${bAnnualFee.toLocaleString()}</div>
                        <div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.15rem;">
                          <i aria-hidden="true" class="fa-solid fa-calendar-check"></i> Bill Day ${bBillingDay}
                        </div>
                      </div>
                    </div>

                    <div class="admin-batch-meta-item">
                      <i aria-hidden="true" class="fa-solid fa-clock"></i>
                      <span><strong>Timing:</strong> ${escapeHtml(bTiming)}</span>
                    </div>

                    <div class="admin-batch-meta-item">
                      <i aria-hidden="true" class="fa-solid fa-door-open"></i>
                      <span><strong>Classroom:</strong> ${escapeHtml(bRoom)}</span>
                    </div>

                    <div class="admin-batch-meta-item">
                      <i aria-hidden="true" class="fa-solid fa-user-tie"></i>
                      <span><strong>Faculty:</strong> ${escapeHtml(teacherNames.join(' & '))}</span>
                    </div>

                    <div class="admin-batch-occupancy-wrap">
                      <div class="admin-batch-occupancy-labels">
                        <span><i aria-hidden="true" class="fa-solid fa-users"></i> Enrolled: ${enrolledCount} students</span>
                        <span>Capacity: ${bCapacity} (${occupancyPct}%)</span>
                      </div>
                      <div class="admin-batch-occupancy-bar">
                        <div class="admin-batch-occupancy-fill" style="width: ${occupancyPct}%; ${occupancyPct >= 90 ? 'background: linear-gradient(90deg, #F59E0B, #DC2626);' : ''}"></div>
                      </div>
                    </div>

                    ${subjectsList.length > 0 ? `
                      <div style="margin-top:0.25rem;">
                        <div style="font-size:0.76rem; font-weight:700; color:var(--text-muted); margin-bottom:0.25rem;">
                          <i aria-hidden="true" class="fa-solid fa-book-open"></i> Subjects Covered:
                        </div>
                        <div class="admin-batch-subjects-container">
                          ${subjectsList.map(s => `<span class="admin-batch-subject-chip">${escapeHtml(s)}</span>`).join('')}
                        </div>
                      </div>
                    ` : ''}
                  </div>

                  <div class="admin-batch-card-footer">
                    <button type="button" class="btn-batch-action btn-batch-edit" data-id="${escapeHtml(bId)}" title="Edit Batch Details">
                      <i aria-hidden="true" class="fa-solid fa-pen-to-square"></i> Edit Details
                    </button>
                    <button type="button" class="btn-batch-action btn-batch-view-stu" data-batch="${escapeHtml(bName)}" title="Filter Student Directory">
                      <i aria-hidden="true" class="fa-solid fa-list-check"></i> Students (${enrolledCount})
                    </button>
                    <button type="button" class="btn-batch-action btn-batch-delete" data-id="${escapeHtml(bId)}" data-enrolled="${enrolledCount}" title="Delete Batch">
                      <i aria-hidden="true" class="fa-solid fa-trash-can"></i>
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>
    `;

    // Event Listeners: Search & Filters
    pane.querySelector('#adminBatchesSearchInput')?.addEventListener('input', (e) => {
      adminBatchesSearchQuery = e.target.value;
      renderAdminBatchesTab();
    });

    pane.querySelector('#adminBatchesStreamFilter')?.addEventListener('change', (e) => {
      adminBatchesFilterStream = e.target.value;
      renderAdminBatchesTab();
    });

    pane.querySelector('#adminBatchesStatusFilter')?.addEventListener('change', (e) => {
      adminBatchesFilterStatus = e.target.value;
      renderAdminBatchesTab();
    });

    pane.querySelector('#btnResetBatchFilters')?.addEventListener('click', () => {
      adminBatchesSearchQuery = '';
      adminBatchesFilterStream = 'all';
      adminBatchesFilterStatus = 'all';
      renderAdminBatchesTab();
    });

    // Cloud Sync Button
    pane.querySelector('#btnAdminSyncBatches')?.addEventListener('click', async () => {
      const syncBtn = pane.querySelector('#btnAdminSyncBatches');
      if (syncBtn) {
        syncBtn.disabled = true;
        syncBtn.innerHTML = '<i aria-hidden="true" class="fa-solid fa-spinner fa-spin"></i> Syncing...';
      }
      try {
        if (typeof SupabaseSync !== 'undefined' && SupabaseSync.pull) {
          await SupabaseSync.pull();
        }
        alert('✅ Batches successfully synced with Supabase cloud database!');
      } catch (err) {
        alert('⚠️ Sync encountered a minor network issue. Local cache preserved.');
      } finally {
        renderAdminBatchesTab();
      }
    });

    // Batch Card Action Buttons
    pane.querySelectorAll('.btn-batch-edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const bId = btn.getAttribute('data-id') || btn.dataset.id;
        openAddEditBatchModal(bId);
      });
    });

    pane.querySelectorAll('.btn-batch-view-stu').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const batchName = btn.getAttribute('data-batch') || btn.dataset.batch;
        // Switch to student directory tab and filter by this batch
        switchAdminTab('students');
        const filterSelect = document.getElementById('adminStudentClassFilter');
        if (filterSelect) {
          filterSelect.value = batchName;
          filterSelect.dispatchEvent(new Event('change'));
        }
      });
    });

    pane.querySelectorAll('.btn-batch-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const bId = btn.getAttribute('data-id') || btn.dataset.id;
        const enrolled = Number(btn.getAttribute('data-enrolled') || btn.dataset.enrolled) || 0;
        deleteBatch(bId, enrolled);
      });
    });
  }

  /* ==========================================================================
   * ADD / EDIT BATCH MODAL
   * ========================================================================== */
  function openAddEditBatchModal(batchId = null) {
    const modalId = 'addEditBatchModal';
    const existingModal = document.getElementById(modalId);
    if (existingModal) existingModal.remove();

    const batches = AppState.getBatches ? AppState.getBatches() : ((typeof ACADEMIC !== 'undefined' && ACADEMIC.BATCHES) ? ACADEMIC.BATCHES : []);
    
    // Resilient matching across all batch ID and name formats
    const existing = batchId ? batches.find(b => {
      const id1 = String(b.batchId || b.id || b.batch_id || '').trim().toLowerCase();
      const name1 = String(b.name || b.batch_name || b.batchName || b.className || '').trim().toLowerCase();
      const target = String(batchId).trim().toLowerCase();
      if (id1 && (id1 === target || target.includes(id1) || id1.includes(target))) return true;
      if (name1 && (name1 === target || target.includes(name1) || name1.includes(target))) return true;
      const k1 = getBatchCategoryKey(id1 || name1);
      const kt = getBatchCategoryKey(target);
      return Boolean(k1 && kt && k1 === kt);
    }) : null;

    if (!batchId || !existing) return;

    const isEdit = true;
    const suggestedId = existing.batchId || existing.id || existing.batch_id || batchId || '';

    const currentFee = Number(existing.monthlyFee ?? existing.monthly_fee) || 0;
    const currentAnnual = Number(existing.annualFee ?? existing.annual_fee) || (currentFee * 12);
    const currentTeachers = Array.isArray(existing.teachers) ? existing.teachers.join(', ') : (existing.teacher || 'Chandan Kumar');
    const currentSubjects = Array.isArray(existing.subjects) ? existing.subjects.map(s => typeof s === 'string' ? s : (s.name || '')).join(', ') : 'Physics, Chemistry, Mathematics';
    const currentRoom = existing.room || existing.room_no || 'Room 1';
    const currentTiming = existing.timing || existing.timings || '04:00 PM – 06:00 PM';
    const currentBillingDay = Number(existing.billingDay ?? existing.billing_day ?? 1);
    const currentCapacity = Number(existing.capacity) || 40;
    const currentStatus = existing.status || 'Active';
    const currentStream = existing.stream || 'Science';
    const currentTagline = existing.tagline || '';
    const currentName = existing.name || existing.batch_name || existing.batchName || existing.className || '';
    const currentClass = existing.className || existing.class_name || existing.name || '';

    const modalHtml = `
      <div class="inner-modal-backdrop active portal-modal-backdrop" id="${modalId}" role="dialog" aria-modal="true" aria-labelledby="batchModalTitle">
        <div class="inner-modal-content batch-modal-content-box">
          <div class="modal-header batch-modal-header-top">
            <div>
              <h3 class="modal-title" id="batchModalTitle" style="color: #fff; font-size: 1.25rem; font-weight: 800; display: flex; align-items: center; gap: 0.5rem; margin:0;">
                <i aria-hidden="true" class="fa-solid fa-layer-group"></i> Edit Batch &amp; Tariff Master
              </h3>
              <p style="font-size: 0.84rem; color: #D1FAE5; margin: 0.3rem 0 0 0;">
                Updating class parameters for ${escapeHtml(suggestedId)}. Changes sync to Supabase database in real time.
              </p>
            </div>
            <button type="button" class="btn-close-modal" id="btnCloseBatchModal" aria-label="Close modal" style="color: #fff; background: rgba(255,255,255,0.2); border: none; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size:1.1rem;">
              <i aria-hidden="true" class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <form id="formAddEditBatch" class="batch-modal-form">
            <div class="batch-modal-grid-2col-split">
              <div>
                <label for="batchFormCode" class="batch-modal-label">Batch Code *</label>
                <input type="text" id="batchFormCode" class="form-input batch-modal-input" style="font-weight: 800; font-family: monospace;" aria-label="Batch Code" value="${escapeHtml(suggestedId)}" ${isEdit ? 'readonly' : 'required'} />
              </div>
              <div>
                <label for="batchFormName" class="batch-modal-label">Batch Display Name *</label>
                <input type="text" id="batchFormName" class="form-input batch-modal-input" aria-label="Batch Display Name" placeholder="e.g. Class 11th - Medical (NEET) FastTrack" value="${escapeHtml(currentName)}" required />
              </div>
            </div>

            <div class="batch-modal-grid-2col">
              <div>
                <label for="batchFormClass" class="batch-modal-label">Class Standard / Level *</label>
                <input type="text" id="batchFormClass" class="form-input batch-modal-input" aria-label="Class Standard or Level" placeholder="e.g. Class 11th" value="${escapeHtml(currentClass)}" required />
              </div>
              <div>
                <label for="batchFormStream" class="batch-modal-label">Academic Stream *</label>
                <select id="batchFormStream" class="form-input batch-modal-input" aria-label="Academic Stream" required>
                  <option value="Foundation" ${currentStream === 'Foundation' ? 'selected' : ''}>Foundation (Classes 8th–10th)</option>
                  <option value="Science" ${currentStream === 'Science' ? 'selected' : ''}>Science (PCM / PCB / NEET / JEE)</option>
                  <option value="Commerce" ${currentStream === 'Commerce' ? 'selected' : ''}>Commerce (Accountancy &amp; Economics)</option>
                  <option value="Arts" ${currentStream === 'Arts' ? 'selected' : ''}>Arts &amp; Humanities</option>
                  <option value="Special" ${currentStream === 'Special' ? 'selected' : ''}>Specialized English &amp; Skills</option>
                </select>
              </div>
            </div>

            <div class="batch-modal-fee-box">
              <div>
                <label for="batchFormMonthlyFee" class="batch-modal-label">Monthly Fee (₹) *</label>
                <input type="number" id="batchFormMonthlyFee" class="form-input batch-modal-input fee-highlight" aria-label="Monthly Tuition Fee in Rupees" min="0" step="50" value="${currentFee}" required />
              </div>
              <div>
                <label for="batchFormAnnualFee" class="batch-modal-label">Annual Fee (₹)</label>
                <input type="number" id="batchFormAnnualFee" class="form-input batch-modal-input" aria-label="Annual Fee in Rupees" min="0" step="500" value="${currentAnnual}" />
              </div>
              <div>
                <label for="batchFormBillingDay" class="batch-modal-label">Billing Day of Mo.</label>
                <input type="number" id="batchFormBillingDay" class="form-input batch-modal-input" aria-label="Billing Day of Month" min="1" max="28" value="${currentBillingDay}" />
              </div>
            </div>

            <div class="batch-modal-grid-3col">
              <div>
                <label for="batchFormTiming" class="batch-modal-label">Lecture Timings</label>
                <input type="text" id="batchFormTiming" class="form-input batch-modal-input" aria-label="Lecture Timings" placeholder="e.g. 04:00 PM – 06:00 PM" value="${escapeHtml(currentTiming)}" />
              </div>
              <div>
                <label for="batchFormRoom" class="batch-modal-label">Classroom / Room No</label>
                <input type="text" id="batchFormRoom" class="form-input batch-modal-input" aria-label="Classroom or Room Number" placeholder="e.g. Room 101" value="${escapeHtml(currentRoom)}" />
              </div>
              <div>
                <label for="batchFormCapacity" class="batch-modal-label">Seat Capacity</label>
                <input type="number" id="batchFormCapacity" class="form-input batch-modal-input" aria-label="Seat Capacity" min="1" max="500" value="${currentCapacity}" />
              </div>
            </div>

            <div>
              <label for="batchFormTeachers" class="batch-modal-label">
                Faculty Mentors <span class="batch-modal-hint">(Comma separated)</span>
              </label>
              <input type="text" id="batchFormTeachers" class="form-input batch-modal-input" aria-label="Faculty Mentors" placeholder="e.g. Chandan Kumar (Director), Dr. Verma" value="${escapeHtml(currentTeachers)}" />
            </div>

            <div>
              <label for="batchFormSubjects" class="batch-modal-label">
                Core Syllabus Subjects <span class="batch-modal-hint">(Comma separated)</span>
              </label>
              <input type="text" id="batchFormSubjects" class="form-input batch-modal-input" aria-label="Core Syllabus Subjects" placeholder="e.g. Physics, Chemistry, Biology, Weekly Test" value="${escapeHtml(currentSubjects)}" />
            </div>

            <div class="batch-modal-grid-tagline">
              <div>
                <label for="batchFormTagline" class="batch-modal-label">Batch Badge / Tagline</label>
                <input type="text" id="batchFormTagline" class="form-input batch-modal-input" aria-label="Batch Badge or Tagline" placeholder="e.g. Premium Board + Foundation" value="${escapeHtml(currentTagline)}" />
              </div>
              <div>
                <label for="batchFormStatus" class="batch-modal-label">Batch Status</label>
                <select id="batchFormStatus" class="form-input batch-modal-input" aria-label="Batch Status">
                  <option value="Active" ${currentStatus === 'Active' ? 'selected' : ''}>Active</option>
                  <option value="Upcoming" ${currentStatus === 'Upcoming' ? 'selected' : ''}>Upcoming</option>
                  <option value="Archived" ${currentStatus === 'Archived' ? 'selected' : ''}>Archived</option>
                </select>
              </div>
            </div>

            <div class="batch-modal-actions-footer">
              <button type="button" id="btnCancelBatchModal" class="btn btn-batch-modal-cancel">
                Cancel
              </button>
              <button type="submit" id="btnSubmitBatchForm" class="btn btn-batch-modal-submit">
                <i aria-hidden="true" class="fa-solid fa-cloud-arrow-up"></i> ${isEdit ? 'Save &amp; Sync Changes' : 'Create &amp; Publish Batch'}
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modalEl = document.getElementById(modalId);
    const dialog = wireModalA11y(modalEl, { closeOnBackdrop: false });

    modalEl.querySelector('#btnCloseBatchModal')?.addEventListener('click', () => dialog.close());
    modalEl.querySelector('#btnCancelBatchModal')?.addEventListener('click', () => dialog.close());

    modalEl.querySelector('#formAddEditBatch')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = modalEl.querySelector('#btnSubmitBatchForm');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i aria-hidden="true" class="fa-solid fa-spinner fa-spin"></i> Syncing to Cloud...';
      }

      try {
        const batch_id = modalEl.querySelector('#batchFormCode').value.trim().toUpperCase();
        const name = modalEl.querySelector('#batchFormName').value.trim();
        const class_name = modalEl.querySelector('#batchFormClass').value.trim();
        const stream = modalEl.querySelector('#batchFormStream').value;
        const monthly_fee = Number(modalEl.querySelector('#batchFormMonthlyFee').value) || 0;
        const annual_fee = Number(modalEl.querySelector('#batchFormAnnualFee').value) || (monthly_fee * 12);
        const billing_day = Number(modalEl.querySelector('#batchFormBillingDay').value) || 1;
        const timing = modalEl.querySelector('#batchFormTiming').value.trim();
        const room = modalEl.querySelector('#batchFormRoom').value.trim();
        const capacity = Number(modalEl.querySelector('#batchFormCapacity').value) || 40;
        const rawTeachers = modalEl.querySelector('#batchFormTeachers').value.trim();
        const teachers = rawTeachers ? rawTeachers.split(',').map(t => t.trim()).filter(Boolean) : ['Chandan Kumar'];
        const rawSubjects = modalEl.querySelector('#batchFormSubjects').value.trim();
        const subjects = rawSubjects ? rawSubjects.split(',').map(s => s.trim()).filter(Boolean) : [];
        const tagline = modalEl.querySelector('#batchFormTagline').value.trim();
        const status = modalEl.querySelector('#batchFormStatus').value;

        const batchObj = {
          batch_id,
          batchId: batch_id,
          id: batch_id,
          name,
          batch_name: name,
          batchName: name,
          class_name,
          className: class_name,
          stream,
          monthly_fee,
          monthlyFee: monthly_fee,
          annual_fee,
          annualFee: annual_fee,
          billing_day,
          billingDay: billing_day,
          timing,
          timings: timing,
          room,
          room_no: room,
          capacity,
          teachers,
          teacher: teachers.join(' & '),
          subjects,
          tagline,
          status,
          updated_at: new Date().toISOString()
        };

        const allBatches = AppState.getBatches().slice();
        const existingIdx = allBatches.findIndex(b => {
          const id1 = b.id || b.batch_id || b.batchId;
          const name1 = b.name || b.batch_name || b.className;
          return id1 === batch_id || 
                 getBatchCategoryKey(id1 || name1) === getBatchCategoryKey(batch_id) ||
                 (String(id1).toUpperCase() === String(batch_id).toUpperCase());
        });

        if (existingIdx !== -1) {
          allBatches[existingIdx] = { ...allBatches[existingIdx], ...batchObj };
        } else {
          allBatches.push(batchObj);
        }

        // Save locally and mutate to Supabase
        AppState._batchesCache = null;
        await AppState.saveBatches(allBatches);

        // Audit log entry
        const adminUser = AppState.currentUser || { name: 'Admin', admin_id: 'ADM-01' };
        AppState.addAuditLog(
          adminUser.name || 'Admin',
          'BATCH_MUTATION',
          'All Classes',
          batch_id,
          `Admin ${adminUser.name || 'Chandan'} ${isEdit ? 'updated' : 'created'} batch ${batch_id} (${name}) with monthly fee ₹${monthly_fee}`,
          { batch_id, name, monthly_fee, status }
        );

        dialog.close();
        AppState._batchesCache = null;
        renderAdminBatchesTab();

        alert(`✅ Batch ${batch_id} successfully ${isEdit ? 'updated' : 'created'} and synced to Supabase cloud!`);
      } catch (err) {
        console.error('Error saving batch:', err);
        alert('❌ Error updating batch: ' + (err?.message || err));
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i aria-hidden="true" class="fa-solid fa-cloud-arrow-up"></i> Retry Save';
        }
      }
    });
  }

  /* ==========================================================================
   * DELETE BATCH ACTION
   * ========================================================================== */
  async function deleteBatch(batchId, enrolledCount) {
    if (!batchId) return;

    let confirmMsg = `Are you sure you want to delete batch "${batchId}"?`;
    if (enrolledCount > 0) {
      confirmMsg = `⚠️ WARNING: There are ${enrolledCount} active students currently enrolled in batch "${batchId}".\n\nDeleting this batch from database may affect student dashboards and billing automation.\n\nAre you sure you want to delete it anyway?`;
    }

    if (!confirm(confirmMsg)) return;

    try {
      const bKey = getBatchCategoryKey(batchId);
      const allBatches = AppState.getBatches().filter(b => {
        const id1 = b.batchId || b.id || b.batch_id || '';
        const name1 = b.name || b.batch_name || b.className || '';
        const k1 = getBatchCategoryKey(id1 || name1);
        const isMatch = id1 === batchId || 
                        String(id1).toLowerCase() === String(batchId).toLowerCase() ||
                        (bKey && k1 && k1 === bKey);
        return !isMatch;
      });
      
      // Delete mutation from Supabase cloud
      if (typeof SupabaseSync !== 'undefined' && SupabaseSync.mutate) {
        await SupabaseSync.mutate('batches', 'delete', null, { where: { batch_id: batchId } }).catch(() => {});
        if (bKey && bKey !== batchId) {
          await SupabaseSync.mutate('batches', 'delete', null, { where: { batch_id: bKey } }).catch(() => {});
        }
      }

      // Clean up timetable periods associated with this deleted batch
      const allSchedules = AppState.getClassSchedules ? AppState.getClassSchedules() : [];
      const batchSchedules = allSchedules.filter(s => {
        if (!s || typeof s !== 'object') return false;
        const sBatch = s.batch_id || s.batchId || '';
        return sBatch === batchId || (bKey && getBatchCategoryKey(sBatch) === bKey) || String(sBatch).toUpperCase() === String(batchId).toUpperCase();
      });
      const schedIdsToDelete = batchSchedules.map(s => String(s.id)).filter(Boolean);
      if (schedIdsToDelete.length > 0) {
        const remainingSchedules = allSchedules.filter(s => !schedIdsToDelete.includes(String(s.id)));
        await AppState.saveClassSchedules(remainingSchedules);
        if (typeof SupabaseSync !== 'undefined' && SupabaseSync.mutate) {
          await SupabaseSync.mutate('class_schedules', 'delete', null, { where: { id: schedIdsToDelete } }).catch(e => console.warn(e));
        }
      }

      AppState._batchesCache = null;
      await AppState.saveBatches(allBatches);

      const adminUser = AppState.currentUser || { name: 'Admin' };
      AppState.addAuditLog(adminUser.name || 'Admin', 'BATCH_DELETE', 'All Classes', batchId, `Admin ${adminUser.name} deleted batch ${batchId} from course master`, { batchId });

      AppState._batchesCache = null;
      renderAdminBatchesTab();
      alert(`🗑️ Batch "${batchId}" successfully deleted from course master and cloud database!`);
    } catch (err) {
      console.error('Error deleting batch:', err);
      alert('❌ Failed to delete batch: ' + (err?.message || err));
    }
  }

  // Expose AppState and portal controllers to window for sync, testing and re-authentication
  if (typeof window !== 'undefined') {
    window.AppState = AppState;
    window.openPortal = openPortal;
    window.closePortal = closePortal;
    window.handleLogout = handleLogout;
    window.relogin = relogin;
    window.openLoginModal = relogin;
    window.showLoginModal = relogin;
  }

})();
