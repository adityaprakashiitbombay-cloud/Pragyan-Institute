/* ============================================================================
 * PRAGYAN INSTITUTE — PUBLIC SITE BEHAVIOUR
 * ----------------------------------------------------------------------------
 * Classic script (no bundler). Loads after js/academic-config.js, so every fee
 * shown on the page comes from window.PRAGYAN_ACADEMIC.PRICE_TABLE instead of a
 * hardcoded copy that drifted from the database.
 *
 * Cross-cutting rules applied throughout this file:
 *   * Nothing animates when the visitor asks for reduced motion.
 *   * Every interactive control is reachable and operable by keyboard.
 *   * Pointer-tilt effects are disabled on touch devices, where they fought
 *     with scrolling instead of adding anything.
 *   * The body scroll lock is reference counted (window.PragyanUI), because the
 *     drawer, the lightbox and the portal modal can all be open at once and the
 *     first one to close used to unlock the page under the others.
 * ========================================================================= */

(function () {
  'use strict';

  if (typeof window !== 'undefined') {
    window.escapeHtml = window.escapeHtml || function (str) {
      if (str == null) return '';
      return String(str).replace(/[&<>"']/g, function (m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
      });
    };
  }

  /* --------------------------------------------------------------------------
   * 0. Shared primitives (exported on window.PragyanUI for portal.js & pay.html)
   * -------------------------------------------------------------------------- */

  const FOCUSABLE_SELECTOR = [
    'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])', 'textarea:not([disabled])', 'iframe',
    '[tabindex]:not([tabindex="-1"])'
  ].join(', ');

  const SUPPORTS_INERT = typeof HTMLElement !== 'undefined' && 'inert' in HTMLElement.prototype;

  function mediaQuery(query) {
    return typeof window.matchMedia === 'function' ? window.matchMedia(query) : null;
  }

  const REDUCED_MOTION = mediaQuery('(prefers-reduced-motion: reduce)');
  const COARSE_POINTER = mediaQuery('(hover: none), (pointer: coarse)');

  function prefersReducedMotion() { return Boolean(REDUCED_MOTION && REDUCED_MOTION.matches); }
  function isCoarsePointer() { return Boolean(COARSE_POINTER && COARSE_POINTER.matches); }

  /** Listen for a media-query flip across old and new Safari APIs. */
  function onMediaChange(query, handler) {
    if (!query) return;
    if (typeof query.addEventListener === 'function') query.addEventListener('change', handler);
    else if (typeof query.addListener === 'function') query.addListener(handler);
  }

  // Reference counted so overlapping overlays cannot unlock each other's scroll.
  let scrollLockCount = 0;
  function lockScroll() {
    scrollLockCount += 1;
    if (scrollLockCount === 1) document.documentElement.classList.add('scroll-locked');
  }
  function unlockScroll() {
    scrollLockCount = Math.max(0, scrollLockCount - 1);
    if (scrollLockCount === 0) document.documentElement.classList.remove('scroll-locked');
  }

  function visibleFocusable(container) {
    if (!container) return [];
    return Array.prototype.filter.call(
      container.querySelectorAll(FOCUSABLE_SELECTOR),
      node => node.offsetWidth > 0 || node.offsetHeight > 0 || node === document.activeElement
    );
  }

  /**
   * Keep Tab inside an open overlay. Call from a keydown listener.
   * Returns true when the event was handled.
   */
  function trapTabKey(container, event) {
    if (!container || event.key !== 'Tab') return false;
    const items = visibleFocusable(container);
    if (!items.length) {
      event.preventDefault();
      if (typeof container.focus === 'function') container.focus();
      return true;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    const outside = !container.contains(active);

    if (event.shiftKey && (active === first || outside)) {
      event.preventDefault();
      last.focus();
      return true;
    }
    if (!event.shiftKey && (active === last || outside)) {
      event.preventDefault();
      first.focus();
      return true;
    }
    return false;
  }

  /**
   * Remove a subtree from the tab order and the accessibility tree.
   * `inert` does both natively; the fallback path is for older Safari/Firefox,
   * where an off-screen drawer's links stayed tabbable and focus disappeared.
   */
  function setInert(element, inert) {
    if (!element) return;
    if (SUPPORTS_INERT) element.inert = inert;

    if (inert) element.setAttribute('aria-hidden', 'true');
    else element.removeAttribute('aria-hidden');

    if (SUPPORTS_INERT) return;
    Array.prototype.forEach.call(element.querySelectorAll(FOCUSABLE_SELECTOR), node => {
      if (inert) {
        if (node.dataset.prevTabindex === undefined) {
          node.dataset.prevTabindex = node.getAttribute('tabindex') || '';
        }
        node.setAttribute('tabindex', '-1');
      } else if (node.dataset.prevTabindex !== undefined) {
        if (node.dataset.prevTabindex) node.setAttribute('tabindex', node.dataset.prevTabindex);
        else node.removeAttribute('tabindex');
        delete node.dataset.prevTabindex;
      }
    });
  }

  /** requestAnimationFrame-coalesced callback — at most one run per frame. */
  function rafThrottle(fn) {
    let queued = false;
    let lastArgs = null;
    return function throttled() {
      lastArgs = arguments;
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(() => {
        queued = false;
        fn.apply(null, lastArgs);
      });
    };
  }

  function academic() {
    return window.PRAGYAN_ACADEMIC || null;
  }

  function formatINR(amount) {
    const config = academic();
    if (config && typeof config.formatINR === 'function') return config.formatINR(amount);
    return '₹' + (Math.round(Number(amount) || 0)).toLocaleString('en-IN');
  }

  document.addEventListener('DOMContentLoaded', () => {
    initSkipLink();
    initNavbar();
    initHeroSlideshow();
    initScrollReveal();
    initStatCounters();
    initBatchTabs();
    init3DGallery();
    initLightboxModal();
    initContactForm();
    initFAQAccordion();
  });

  /* --------------------------------------------------------------------------
   * 1. Skip link — first stop for keyboard and screen-reader users
   * -------------------------------------------------------------------------- */
  function initSkipLink() {
    const target = document.getElementById('hero') || document.querySelector('main, section');
    if (!target || document.querySelector('.skip-to-content')) return;

    const link = document.createElement('a');
    link.className = 'skip-to-content';
    link.href = '#' + (target.id || 'hero');
    link.textContent = 'Skip to main content';
    document.body.insertBefore(link, document.body.firstChild);

    // A section is not focusable by default, so the skip target would receive
    // the hash but not the focus ring.
    link.addEventListener('click', () => {
      target.setAttribute('tabindex', '-1');
      window.setTimeout(() => target.focus({ preventScroll: false }), 0);
    });
  }

  /* --------------------------------------------------------------------------
   * 2. Header, sticky scroll state & mobile drawer
   * -------------------------------------------------------------------------- */
  function initNavbar() {
    const header = document.querySelector('.site-header');
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const mobileDrawer = document.getElementById('mobileNavDrawer');
    const mobileLinks = document.querySelectorAll('.mobile-nav-links a');
    const sections = Array.prototype.slice.call(document.querySelectorAll('section[id]'));
    const navLinks = Array.prototype.slice.call(document.querySelectorAll('.nav-links a[href^="#"]'));

    // Section offsets are measured once per layout change instead of on every
    // scroll event. Reading offsetTop inside the scroll handler forced a synchronous
    // reflow per frame, which is what made scrolling stutter on mid-range phones.
    let offsets = [];
    const measure = () => {
      offsets = sections.map(section => ({
        id: section.getAttribute('id') || '',
        top: section.offsetTop - 130
      }));
    };

    let lastActiveId = null;
    const paint = () => {
      if (header) header.classList.toggle('scrolled', window.scrollY > 40);

      let currentId = '';
      for (let i = 0; i < offsets.length; i += 1) {
        if (window.scrollY >= offsets[i].top) currentId = offsets[i].id;
      }
      if (currentId === lastActiveId) return;
      lastActiveId = currentId;

      navLinks.forEach(link => {
        const isActive = link.getAttribute('href') === '#' + currentId;
        link.classList.toggle('active', isActive);
        if (isActive) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      });
    };

    const onScroll = rafThrottle(paint);
    const onResize = rafThrottle(() => { measure(); lastActiveId = null; paint(); });

    measure();
    paint();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    window.addEventListener('load', onResize);

    if (!hamburgerBtn || !mobileDrawer) return;

    let drawerOpen = false;

    const setDrawerState = (isOpen, options) => {
      const opts = options || {};
      if (isOpen === drawerOpen) return;
      drawerOpen = isOpen;

      mobileDrawer.classList.toggle('open', isOpen);
      hamburgerBtn.classList.toggle('open', isOpen);
      hamburgerBtn.setAttribute('aria-expanded', String(isOpen));
      hamburgerBtn.setAttribute('aria-label', isOpen ? 'Close navigation menu' : 'Open navigation menu');
      setInert(mobileDrawer, !isOpen);

      if (isOpen) {
        lockScroll();
        const first = visibleFocusable(mobileDrawer)[0];
        if (first) first.focus();
      } else {
        unlockScroll();
        // Focus must come back to the control that opened the drawer, or the
        // keyboard user is dropped at the top of the document.
        if (opts.restoreFocus !== false) hamburgerBtn.focus();
      }
    };

    // Closed at load: matches the CSS (drawer parked off-canvas) and takes its
    // links out of the tab order.
    setInert(mobileDrawer, true);
    mobileDrawer.setAttribute('role', 'dialog');
    mobileDrawer.setAttribute('aria-modal', 'true');
    mobileDrawer.setAttribute('aria-label', 'Site navigation');
    mobileDrawer.removeAttribute('aria-expanded'); // aria-expanded belongs on the button
    hamburgerBtn.setAttribute('aria-expanded', 'false');

    hamburgerBtn.addEventListener('click', event => {
      event.stopPropagation();
      setDrawerState(!drawerOpen);
    });

    document.addEventListener('click', event => {
      if (!drawerOpen) return;
      if (mobileDrawer.contains(event.target) || hamburgerBtn.contains(event.target)) return;
      setDrawerState(false, { restoreFocus: false });
    });

    document.addEventListener('keydown', event => {
      if (!drawerOpen) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        setDrawerState(false);
        return;
      }
      trapTabKey(mobileDrawer, event);
    });

    mobileLinks.forEach(link => {
      link.addEventListener('click', () => setDrawerState(false, { restoreFocus: false }));
    });

    // A drawer left open while the viewport grows into the desktop layout would
    // keep the scroll locked with no visible way to close it.
    window.addEventListener('resize', rafThrottle(() => {
      if (drawerOpen && window.innerWidth > 768) setDrawerState(false, { restoreFocus: false });
    }));
  }

  /* --------------------------------------------------------------------------
   * 3. Hero slideshow — autoplay with a pause control, keyboard and swipe
   * -------------------------------------------------------------------------- */
  function initHeroSlideshow() {
    const container = document.querySelector('.hero-slideshow-container');
    const slides = Array.prototype.slice.call(document.querySelectorAll('.hero-slide'));
    const dots = Array.prototype.slice.call(document.querySelectorAll('.hero-slide-dots .dot'));
    const prevBtn = document.getElementById('heroPrevBtn');
    const nextBtn = document.getElementById('heroNextBtn');
    const playPauseBtn = document.getElementById('heroPlayPauseBtn');
    const liveRegion = document.getElementById('heroSlideStatus');

    if (!slides.length) return;

    const AUTOPLAY_MS = 5200;
    let currentIndex = Math.max(0, slides.findIndex(slide => slide.classList.contains('active')));
    let timer = null;
    // WCAG 2.2.2: motion that starts on its own must be pausable, and a visitor
    // who asked for reduced motion should never see it start at all.
    let autoplayWanted = !prefersReducedMotion();

    function announce(index) {
      if (!liveRegion) return;
      liveRegion.textContent = `Slide ${index + 1} of ${slides.length}`;
    }

    function goToSlide(index, options) {
      const opts = options || {};
      let next = index;
      if (next < 0) next = slides.length - 1;
      if (next >= slides.length) next = 0;

      slides.forEach((slide, idx) => {
        const isActive = idx === next;
        slide.classList.toggle('active', isActive);
        // Slides hold no focusable content, so aria-hidden is safe here and it
        // keeps three copies of the caption out of the screen-reader buffer.
        slide.setAttribute('aria-hidden', String(!isActive));
      });

      dots.forEach((dot, idx) => {
        const isActive = idx === next;
        dot.classList.toggle('active', isActive);
        // aria-current is the right state for "this is the slide you are on";
        // aria-selected would need a tab/option role the dots do not have.
        if (isActive) dot.setAttribute('aria-current', 'true');
        else dot.removeAttribute('aria-current');
      });

      currentIndex = next;
      if (opts.announce !== false) announce(next);
    }

    function getSlideDuration(index) {
      // First slide (Chandan Sir's Smartboard Lecture) stays for the longest time (8.0s vs 4.5s)
      return index === 0 ? 8000 : 4500;
    }

    function stopTimer() {
      if (timer) {
        window.clearTimeout(timer);
        window.clearInterval(timer);
      }
      timer = null;
    }

    function startTimer() {
      stopTimer();
      if (!autoplayWanted || document.hidden) return;
      const duration = getSlideDuration(currentIndex);
      timer = window.setTimeout(() => {
        goToSlide(currentIndex + 1, { announce: false });
        startTimer();
      }, duration);
    }

    function syncPlayPauseButton() {
      if (!playPauseBtn) return;
      const label = autoplayWanted ? 'Pause slideshow' : 'Play slideshow';
      playPauseBtn.setAttribute('aria-label', label);
      playPauseBtn.setAttribute('title', label);
      playPauseBtn.setAttribute('aria-pressed', String(!autoplayWanted));
      const icon = playPauseBtn.querySelector('i');
      if (icon) icon.className = autoplayWanted ? 'fa-solid fa-pause' : 'fa-solid fa-play';
    }

    function step(delta) {
      goToSlide(currentIndex + delta);
      if (autoplayWanted) startTimer(); // restart the dwell time after manual input
    }

    if (nextBtn) nextBtn.addEventListener('click', () => step(1));
    if (prevBtn) prevBtn.addEventListener('click', () => step(-1));

    dots.forEach((dot, idx) => {
      dot.addEventListener('click', () => {
        goToSlide(idx);
        if (autoplayWanted) startTimer();
      });
    });

    if (playPauseBtn) {
      playPauseBtn.addEventListener('click', () => {
        autoplayWanted = !autoplayWanted;
        syncPlayPauseButton();
        if (autoplayWanted) startTimer();
        else stopTimer();
      });
      syncPlayPauseButton();
    }

    if (container) {
      // Hover pause is a desktop nicety; focus pause is what a keyboard user
      // needs, and neither existed for touch, hence the explicit button above.
      container.addEventListener('mouseenter', stopTimer);
      container.addEventListener('mouseleave', () => { if (autoplayWanted) startTimer(); });
      container.addEventListener('focusin', stopTimer);
      container.addEventListener('focusout', event => {
        if (!container.contains(event.relatedTarget) && autoplayWanted) startTimer();
      });

      container.addEventListener('keydown', event => {
        if (event.key === 'ArrowRight') { event.preventDefault(); step(1); }
        else if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1); }
      });

      // Swipe. Listeners stay passive and never call preventDefault, so vertical
      // page scrolling through the carousel keeps working.
      let touchStartX = 0;
      let touchStartY = 0;
      let tracking = false;
      container.addEventListener('touchstart', event => {
        if (event.touches.length !== 1) { tracking = false; return; }
        tracking = true;
        touchStartX = event.touches[0].clientX;
        touchStartY = event.touches[0].clientY;
        stopTimer();
      }, { passive: true });

      container.addEventListener('touchend', event => {
        if (!tracking) return;
        tracking = false;
        const touch = event.changedTouches && event.changedTouches[0];
        if (touch) {
          const dx = touch.clientX - touchStartX;
          const dy = touch.clientY - touchStartY;
          if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4) step(dx < 0 ? 1 : -1);
        }
        if (autoplayWanted) startTimer();
      }, { passive: true });
    }

    // A slideshow ticking in a background tab burns battery for nobody.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopTimer();
      else if (autoplayWanted) startTimer();
    });

    onMediaChange(REDUCED_MOTION, () => {
      autoplayWanted = !prefersReducedMotion();
      syncPlayPauseButton();
      if (autoplayWanted) startTimer();
      else stopTimer();
    });

    goToSlide(currentIndex, { announce: false });
    startTimer();
  }

  /* --------------------------------------------------------------------------
   * 4. Scroll reveal
   * -------------------------------------------------------------------------- */
  function initScrollReveal() {
    const elements = Array.prototype.slice.call(document.querySelectorAll(
      '.reveal-on-scroll, .mentor-compact-card, .teacher-card, .batch-card,' +
      ' .gallery-card, .contact-card, .map-card, .faq-wrap, .scholarship-policy-card,' +
      ' .academy-pillar, .academy-card, .academy-banner'
    ));
    if (!elements.length) return;

    // Reduced motion: show everything immediately rather than fading it in.
    if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
      elements.forEach(el => el.classList.add('is-visible'));
      return;
    }

    elements.forEach((el, idx) => {
      // Never hide above-the-fold hero elements
      if (el.closest('.hero-section') || el.classList.contains('hero-content') || el.classList.contains('hero-visual')) {
        el.classList.add('is-visible');
        return;
      }
      el.classList.add('reveal-on-scroll');
      if (idx % 3 === 1) el.classList.add('delay-1');
      if (idx % 3 === 2) el.classList.add('delay-2');
    });

    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        obs.unobserve(entry.target);
      });
    }, { threshold: 0.05, rootMargin: '0px 0px 60px 0px' });

    elements.forEach(el => {
      if (el.classList.contains('is-visible')) return;
      const rect = el.getBoundingClientRect();
      if (rect.top < (window.innerHeight || document.documentElement.clientHeight) && rect.bottom > 0) {
        el.classList.add('is-visible');
      } else {
        observer.observe(el);
      }
    });
  }

  /* --------------------------------------------------------------------------
   * 5. Animated stat counters
   * -------------------------------------------------------------------------- */
  function initStatCounters() {
    const statNumbers = Array.prototype.slice.call(document.querySelectorAll('.stat-number'));
    if (!statNumbers.length) return;

    const run = el => {
      const target = parseInt(el.getAttribute('data-target') || '0', 10);
      const prefix = el.getAttribute('data-prefix') || '';
      const suffix = el.getAttribute('data-suffix') || '';
      animateCounter(el, target, prefix, suffix);
    };

    if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
      statNumbers.forEach(run);
      return;
    }

    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        run(entry.target);
        obs.unobserve(entry.target);
      });
    }, { threshold: 0.5 });

    statNumbers.forEach(el => observer.observe(el));
  }

  function formatCount(value) {
    return Number(value).toLocaleString('en-IN');
  }

  /**
   * Count up with requestAnimationFrame. The old setInterval(16ms) version
   * drifted under load, never cancelled a previous run on the same element, and
   * left a screen reader reading a hundred intermediate numbers.
   */
  function animateCounter(element, target, prefix, prefixSuffix) {
    const suffix = prefixSuffix || '';
    const head = prefix || '';
    const finalText = `${head}${formatCount(target)}${suffix}`;

    if (prefersReducedMotion() || !window.requestAnimationFrame) {
      element.textContent = finalText;
      return;
    }

    if (element._counterRaf) window.cancelAnimationFrame(element._counterRaf);
    element.setAttribute('aria-hidden', 'true');

    const duration = 1600;
    const startedAt = window.performance && window.performance.now
      ? window.performance.now()
      : Date.now();

    const tick = now => {
      const elapsed = (now || Date.now()) - startedAt;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      element.textContent = `${head}${formatCount(Math.round(target * eased))}${suffix}`;

      if (progress < 1) {
        element._counterRaf = window.requestAnimationFrame(tick);
        return;
      }
      element._counterRaf = null;
      element.textContent = finalText;
      // Announce only the settled figure.
      element.removeAttribute('aria-hidden');
    };

    element._counterRaf = window.requestAnimationFrame(tick);
  }

  /* --------------------------------------------------------------------------
   * 6. Batch filters, billing toggle & pricing
   * -------------------------------------------------------------------------- */
  function initBatchTabs() {
    const tabButtons = Array.prototype.slice.call(document.querySelectorAll('#batches .tabs-container .tab-btn'));
    const toggleSwitch = document.getElementById('billingToggle');
    const batchCards = Array.prototype.slice.call(document.querySelectorAll('.batch-card'));
    const status = document.getElementById('batchFilterStatus');

    let isAnnual = toggleSwitch ? toggleSwitch.getAttribute('aria-checked') === 'true' : false;

    function announce(message) {
      if (status) status.textContent = message;
    }

    /* ---- filtering ---- */
    function applyFilter(selected, options) {
      const opts = options || {};
      let shown = 0;

      batchCards.forEach(card => {
        const group = card.getAttribute('data-class');
        const match = selected === 'all' || group === selected;
        // A class, not `style.display = 'flex'`: hardcoding the display mode
        // overwrote whatever layout the card actually needs.
        card.classList.toggle('is-filtered-out', !match);
        card.removeAttribute('aria-hidden'); // filtering removes cards from layout entirely
        if (!match) return;
        shown += 1;
        if (!prefersReducedMotion() && opts.animate !== false) {
          card.classList.remove('batch-card-animating');
          void card.offsetWidth; // restart the entry animation
          card.classList.add('batch-card-animating');
        }
      });

      if (opts.announce !== false) {
        announce(shown === 1 ? 'Showing 1 batch' : `Showing ${shown} batches`);
      }
      return shown;
    }

    function selectTab(button, options) {
      const opts = options || {};
      tabButtons.forEach(other => {
        const isActive = other === button;
        other.classList.toggle('active', isActive);
        other.setAttribute('aria-selected', String(isActive));
        // Roving tabindex: one stop for the whole tab strip, arrows move within.
        other.setAttribute('tabindex', isActive ? '0' : '-1');
      });
      applyFilter(button.getAttribute('data-class') || 'all', opts);
      if (opts.focus) button.focus();
    }

    if (tabButtons.length) {
      const strip = tabButtons[0].parentElement;
      if (strip && !strip.getAttribute('role')) {
        strip.setAttribute('role', 'tablist');
        strip.setAttribute('aria-label', 'Filter batches by class');
      }

      tabButtons.forEach((button, index) => {
        button.setAttribute('role', 'tab');
        button.setAttribute('type', 'button');
        if (!button.id) button.id = `batchTab-${button.getAttribute('data-class') || index}`;
        const grid = document.querySelector('.batches-grid');
        if (grid) {
          if (!grid.id) grid.id = 'batchesGrid';
          button.setAttribute('aria-controls', grid.id);
        }

        button.addEventListener('click', () => selectTab(button));

        button.addEventListener('keydown', event => {
          const delta = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1
            : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1
              : 0;
          if (delta) {
            event.preventDefault();
            const next = tabButtons[(index + delta + tabButtons.length) % tabButtons.length];
            selectTab(next, { focus: true });
            return;
          }
          if (event.key === 'Home') { event.preventDefault(); selectTab(tabButtons[0], { focus: true }); }
          if (event.key === 'End') { event.preventDefault(); selectTab(tabButtons[tabButtons.length - 1], { focus: true }); }
        });
      });

      const grid = document.querySelector('.batches-grid');
      if (grid) {
        grid.setAttribute('role', 'tabpanel');
        const active = tabButtons.filter(b => b.classList.contains('active'))[0] || tabButtons[0];
        grid.setAttribute('aria-labelledby', active.id);
      }

      const initiallyActive = tabButtons.filter(b => b.classList.contains('active'))[0] || tabButtons[0];
      selectTab(initiallyActive, { animate: false, announce: false });
    }

    /* ---- pricing ---- */
    function annualTextFor(monthlyText) {
      const digits = String(monthlyText || '').replace(/[^\d]/g, '');
      if (!digits) return monthlyText;
      const config = academic();
      const monthly = Number(digits);
      const annual = config && typeof config.annualPrice === 'function'
        ? config.annualPrice(monthly)
        : Math.round(monthly * 12 * 0.95);
      return formatINR(annual);
    }

    function applyPricing(annual) {
      const table = (academic() && academic().PRICE_TABLE) || null;

      Array.prototype.forEach.call(document.querySelectorAll('[data-price-key]'), el => {
        const key = el.getAttribute('data-price-key');
        const entry = table ? table[key] : null;

        // The rendered monthly figure is captured once so a key missing from the
        // canonical table still toggles correctly instead of blanking the card.
        if (!el.dataset.monthlyText) el.dataset.monthlyText = el.textContent.trim();

        const monthlyText = entry ? entry.monthly : el.dataset.monthlyText;
        const annualText = entry ? entry.annual : annualTextFor(el.dataset.monthlyText);

        el.textContent = annual ? annualText : monthlyText;

        const row = el.parentElement;
        const period = (row && row.querySelector('.batch-period'))
          || (el.nextElementSibling && el.nextElementSibling.classList.contains('batch-period')
            ? el.nextElementSibling
            : null);
        if (period) period.textContent = annual ? '/ year (save 5%)' : '/ month';
      });
    }

    function setBilling(annual, options) {
      const opts = options || {};
      isAnnual = annual;
      if (toggleSwitch) {
        toggleSwitch.classList.toggle('active', annual);
        toggleSwitch.setAttribute('aria-checked', String(annual));
        toggleSwitch.setAttribute('aria-label', annual
          ? 'Annual billing selected. Switch to monthly billing.'
          : 'Monthly billing selected. Switch to annual billing and save 5%.');
      }
      applyPricing(annual);
      if (opts.announce !== false) {
        announce(annual
          ? 'Showing annual session fees with the 5% scholarship applied'
          : 'Showing standard monthly fees');
      }
    }

    if (toggleSwitch) {
      if (!toggleSwitch.getAttribute('role')) toggleSwitch.setAttribute('role', 'switch');
      toggleSwitch.setAttribute('type', 'button');

      toggleSwitch.addEventListener('click', () => setBilling(!isAnnual));
      // role="switch" on a <button> handles Enter and Space natively, but the
      // markup shipped without a keydown handler and earlier revisions used a
      // <div>, so both keys are wired explicitly and defensively.
      toggleSwitch.addEventListener('keydown', event => {
        if (event.key !== ' ' && event.key !== 'Spacebar' && event.key !== 'Enter') return;
        event.preventDefault();
        setBilling(!isAnnual);
      });
    }

    setBilling(isAnnual, { announce: false });
  }

  /* --------------------------------------------------------------------------
   * 7. Gallery pointer tilt (desktop only)
   * -------------------------------------------------------------------------- */
  function init3DGallery() {
    const galleryCards = Array.prototype.slice.call(document.querySelectorAll('.gallery-card'));
    if (!galleryCards.length) return;

    const reset = card => {
      card.style.transform = '';
    };

    // The old build also tilted on touchmove, which competed with the scroll
    // gesture: dragging up the page tipped the card instead of scrolling.
    if (isCoarsePointer() || prefersReducedMotion()) {
      galleryCards.forEach(reset);
      return;
    }

    galleryCards.forEach(card => {
      const applyTilt = rafThrottle((clientX, clientY) => {
        const rect = card.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const rotateX = ((clientY - rect.top - rect.height / 2) / (rect.height / 2)) * -8;
        const rotateY = ((clientX - rect.left - rect.width / 2) / (rect.width / 2)) * 8;
        card.style.transform =
          `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(1.02, 1.02, 1.02)`;
      });

      card.addEventListener('mousemove', event => applyTilt(event.clientX, event.clientY));
      card.addEventListener('mouseleave', () => reset(card));
      card.addEventListener('blur', () => reset(card));
    });
  }

  /* --------------------------------------------------------------------------
   * 8. Lightbox
   * -------------------------------------------------------------------------- */
  function initLightboxModal() {
    const cards = Array.prototype.slice.call(document.querySelectorAll('.gallery-card'));
    const modal = document.getElementById('lightboxModal');
    const modalImg = document.getElementById('lightboxImg');
    const modalVideo = document.getElementById('lightboxVideo');
    const modalCaption = document.getElementById('lightboxCaption');
    const closeBtn = document.getElementById('lightboxClose');

    if (!modal || !modalImg) return;

    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Enlarged institute media viewer');
    setInert(modal, true);

    let lastTrigger = null;
    let isOpen = false;

    function openModal(card) {
      const img = card.querySelector('img');
      const videoSrc = card.getAttribute('data-video-src');
      const title = (card.querySelector('.gallery-caption-title') || {}).textContent || '';
      const sub = (card.querySelector('.gallery-caption-sub') || {}).textContent || '';

      if (videoSrc && modalVideo) {
        // High-performance video mode: loaded strictly on-demand, 0KB loaded upfront
        modalImg.style.display = 'none';
        modalVideo.style.display = 'block';
        modalVideo.src = videoSrc;
        modalVideo.load();
        modalVideo.play().catch(() => {});
      } else if (img) {
        // Standard high-res image mode
        if (modalVideo) {
          modalVideo.pause();
          modalVideo.src = '';
          modalVideo.style.display = 'none';
        }
        modalImg.style.display = 'block';
        modalImg.src = img.currentSrc || img.src;
        modalImg.alt = img.alt || 'Institute photo';
      }

      if (modalCaption) modalCaption.textContent = [title, sub].filter(Boolean).join(' — ');

      lastTrigger = card;
      isOpen = true;
      setInert(modal, false);
      modal.style.display = 'flex';
      modal.classList.add('active');
      lockScroll();
      if (closeBtn) closeBtn.focus();
    }

    function closeModal() {
      if (!isOpen) return;
      isOpen = false;
      // Stop and clear video to immediately free up browser decoding memory and bandwidth
      if (modalVideo) {
        modalVideo.pause();
        modalVideo.src = '';
        modalVideo.style.display = 'none';
      }
      modal.classList.remove('active');
      modal.style.display = 'none';
      setInert(modal, true);
      unlockScroll();
      // Return focus to the thumbnail so the keyboard user keeps their place.
      if (lastTrigger && typeof lastTrigger.focus === 'function') lastTrigger.focus();
      lastTrigger = null;
    }

    cards.forEach(card => {
      // Gallery cards are <div>s in the markup. Without these they were
      // click-only: unreachable by keyboard and invisible to assistive tech.
      if (!card.getAttribute('role')) card.setAttribute('role', 'button');
      if (!card.hasAttribute('tabindex')) card.setAttribute('tabindex', '0');
      if (!card.getAttribute('aria-label')) {
        const title = (card.querySelector('.gallery-caption-title') || {}).textContent || 'photo';
        card.setAttribute('aria-label', `Enlarge photo: ${title.trim()}`);
      }

      card.addEventListener('click', () => openModal(card));
      card.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return;
        event.preventDefault(); // Space would otherwise scroll the page
        openModal(card);
      });
    });

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', event => {
      if (event.target === modal) closeModal();
    });

    document.addEventListener('keydown', event => {
      if (!isOpen) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeModal();
        return;
      }
      trapTabKey(modal, event);
    });
  }

  /* --------------------------------------------------------------------------
   * 9. Contact inquiry form
   * -------------------------------------------------------------------------- */

  // Letters from any script, plus the spaces, dots, apostrophes and hyphens that
  // appear in real names. The previous /^[a-zA-Z\s]+$/ rejected "Dr. A.K. Singh",
  // "D'Souza" and every name written in Devanagari.
  const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}\s.'’-]*$/u;

  /**
   * Reduce anything a visitor might type into a bare 10-digit Indian mobile
   * number, or return null. "+91 73698 91858" and "073698 91858" both used to
   * fail the length check even though they are the same valid number.
   */
  function normalizeIndianMobile(raw) {
    let digits = String(raw || '').replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
    else if (digits.length === 13 && digits.startsWith('091')) digits = digits.slice(3);
    else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
    return /^[6-9]\d{9}$/.test(digits) ? digits : null;
  }

  function fieldError(input, message) {
    if (!input) return;
    const id = `${input.id}Error`;
    let holder = document.getElementById(id);
    if (!holder) {
      holder = document.createElement('p');
      holder.id = id;
      holder.className = 'form-error-text';
      input.insertAdjacentElement('afterend', holder);
    }
    holder.textContent = message || '';
    holder.hidden = !message;

    if (message) {
      input.setAttribute('aria-invalid', 'true');
      const described = (input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
      if (described.indexOf(id) === -1) described.push(id);
      input.setAttribute('aria-describedby', described.join(' '));
    } else {
      input.removeAttribute('aria-invalid');
    }
  }

  function initContactForm() {
    const form = document.getElementById('inquiryForm');
    if (!form) return;

    const nameInput = document.getElementById('studentName');
    const phoneInput = document.getElementById('studentPhone');
    const classInput = document.getElementById('studentClass');
    const queryInput = document.getElementById('studentQuery');

    if (phoneInput) {
      phoneInput.setAttribute('inputmode', 'tel');
      phoneInput.setAttribute('autocomplete', 'tel');
    }
    if (nameInput) nameInput.setAttribute('autocomplete', 'name');

    // Clear a field's error as soon as the visitor starts correcting it.
    [nameInput, phoneInput].forEach(input => {
      if (!input) return;
      input.addEventListener('input', () => fieldError(input, ''));
    });

    function fail(input, message) {
      fieldError(input, message);
      showToast(message, 'error');
      if (input && typeof input.focus === 'function') input.focus();
    }

    form.addEventListener('submit', event => {
      event.preventDefault();

      const name = nameInput ? nameInput.value.trim() : '';
      const phoneRaw = phoneInput ? phoneInput.value.trim() : '';
      const studentClass = classInput ? classInput.value : '';
      const query = queryInput ? queryInput.value.trim() : '';

      if (!name) return fail(nameInput, 'Please enter the student or parent name.');
      if (name.length < 2 || !NAME_PATTERN.test(name)) {
        return fail(nameInput, 'Please enter a valid name (at least 2 letters).');
      }

      if (!phoneRaw) return fail(phoneInput, 'Please enter a WhatsApp contact number.');
      const phone = normalizeIndianMobile(phoneRaw);
      if (!phone) {
        return fail(phoneInput, 'Please enter a valid 10-digit Indian mobile number starting 6, 7, 8 or 9.');
      }

      fieldError(nameInput, '');
      fieldError(phoneInput, '');

      const text = `Hello Pragyan Institute, I am inquiring about admissions in Lalganj.\n\n`
        + `*Student Info:*\n• Name: ${name}\n• Phone: ${phone}\n`
        + `• Class: ${studentClass || 'Not specified'}\n• Details: ${query || 'N/A'}`;
      const waUrl = `https://wa.me/917369891858?text=${encodeURIComponent(text)}`;

      // Opened inside the submit gesture. Deferring this by a second — as the
      // previous build did, to let a toast play first — got the tab blocked as
      // an unsolicited popup on iOS Safari and Android Chrome.
      const opened = window.open(waUrl, '_blank', 'noopener');
      if (!opened) window.location.href = waUrl;

      showToast('Opening WhatsApp with your inquiry details…', 'success');
      form.reset();
    });
  }

  /* --------------------------------------------------------------------------
   * 10. FAQ accordion
   * -------------------------------------------------------------------------- */
  function initFAQAccordion() {
    const faqItems = Array.prototype.slice.call(document.querySelectorAll('.faq-item'));
    if (!faqItems.length) return;

    const entries = faqItems.map((item, index) => {
      const header = item.querySelector('.faq-header');
      const body = item.querySelector('.faq-body');
      if (!header || !body) return null;

      if (!body.id) body.id = `faqPanel-${index + 1}`;
      if (!header.id) header.id = `faqHeader-${index + 1}`;
      header.setAttribute('aria-controls', body.id);
      body.setAttribute('role', 'region');
      body.setAttribute('aria-labelledby', header.id);

      // A <div> header answered neither Enter nor Space and reported no state.
      // index.html now ships <button class="faq-header">; this keeps working if
      // any other page still has the old div.
      if (header.tagName !== 'BUTTON') {
        header.setAttribute('role', 'button');
        if (!header.hasAttribute('tabindex')) header.setAttribute('tabindex', '0');
      }

      return { item, header, body };
    }).filter(Boolean);

    // max-height is a cap, not a fixed height, so a little slack is invisible —
    // and it is needed here because padding-bottom is still animating from 0 to
    // 1.5rem at the moment scrollHeight is read.
    const PANEL_SLACK = 48;

    function setOpen(entry, open) {
      entry.item.classList.toggle('open', open);
      entry.header.setAttribute('aria-expanded', String(open));
      // Panel #4 holds the UPI block, which is far taller than the 400px cap the
      // stylesheet used to clip it to. Measuring gives an exact, content-driven
      // height and still animates.
      entry.body.style.maxHeight = open ? `${entry.body.scrollHeight + PANEL_SLACK}px` : '';
      // The collapsed panel contains a real link ("Open UPI App to Pay"), so it
      // must leave the tab order, not merely be visually clipped.
      setInert(entry.body, !open);
    }

    entries.forEach(entry => {
      const activate = () => {
        const willOpen = !entry.item.classList.contains('open');
        entries.forEach(other => {
          if (other !== entry) setOpen(other, false);
        });
        setOpen(entry, willOpen);
      };

      entry.header.addEventListener('click', activate);
      entry.header.addEventListener('keydown', event => {
        if (entry.header.tagName === 'BUTTON') return; // native activation
        if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return;
        event.preventDefault();
        activate();
      });

      setOpen(entry, entry.item.classList.contains('open'));
    });

    // An open panel's measured height goes stale when the text rewraps, which is
    // exactly what happens when a phone is rotated.
    window.addEventListener('resize', rafThrottle(() => {
      entries.forEach(entry => {
        if (!entry.item.classList.contains('open')) return;
        entry.body.style.maxHeight = 'none';
        const height = entry.body.scrollHeight;
        entry.body.style.maxHeight = `${height + PANEL_SLACK}px`;
      });
    }));
  }

  /* --------------------------------------------------------------------------
   * 11. Toast
   * -------------------------------------------------------------------------- */
  let toastTimer = null;

  function showToast(message, type) {
    let toast = document.getElementById('toastNotification');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toastNotification';
      toast.className = 'site-toast';
      // role="status" + polite live region: without these the toast was purely
      // visual and a screen-reader user got no confirmation at all.
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      toast.setAttribute('aria-atomic', 'true');
      document.body.appendChild(toast);
    }

    toast.classList.toggle('is-error', type === 'error');
    toast.textContent = message;
    toast.classList.add('is-visible');

    // Rapid successive toasts used to leave stacked timers, so the second one
    // vanished on the first one's schedule.
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.classList.remove('is-visible');
      toastTimer = null;
    }, 4500);
  }

  /* --------------------------------------------------------------------------
   * 12. Exports for the portal and payment pages
   * -------------------------------------------------------------------------- */
  window.PragyanUI = Object.assign(window.PragyanUI || {}, {
    lockScroll,
    unlockScroll,
    trapTabKey,
    setInert,
    visibleFocusable,
    showToast,
    prefersReducedMotion,
    isCoarsePointer,
    rafThrottle,
    normalizeIndianMobile,
    NAME_PATTERN
  });
})();


/* --------------------------------------------------------------------------
 * 12. Blog & Academic Insights Hub (public)
 *     Data: published rows via POST /api/db (anon read is gateway-approved).
 *     Rendering: PragyanBlogMarkdown.renderMarkdown() — escape-first, so
 *     article content can never inject markup.
 * -------------------------------------------------------------------------- */
const BLOG_CATEGORIES = [
  { key: 'all',            label: 'All Articles',              match: null },
  { key: 'Board Exams',    label: 'Board Exams (10th & 12th)',  match: 'Board Exams' },
  { key: 'English Speaking', label: 'English Academy',          match: 'English Speaking' },
  { key: 'Study Tips',     label: 'Study Tips & Notes',         match: 'Study Tips' },
  { key: 'Institute News', label: 'Announcements',              match: 'Institute News' }
];

let blogPostsCache = [];
let blogActiveCategory = 'all';
let blogReaderList = [];   // ordered slugs inside the active filter (prev/next)
let blogReaderOpenSlug = null;

function blogApiPost(body) {
  return fetch('/api/db', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then(async r => {
    if (r.ok) return r.json();
    throw new Error(`HTTP ${r.status}`);
  }).catch(async (err) => {
    const cfg = window.PRAGYAN_CONFIG || {};
    if (cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY) {
      try {
        if (body.operation === 'rpc' && body.fn) {
          const rpcRes = await fetch(`${cfg.SUPABASE_URL}/rest/v1/rpc/${body.fn}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': cfg.SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${cfg.SUPABASE_ANON_KEY}`
            },
            body: JSON.stringify(body.params || {})
          });
          if (rpcRes.ok) {
            const data = await rpcRes.json();
            return { success: true, data };
          }
        }
      } catch (_) {}
    }
    return { success: false, error: err.message };
  });
}

function blogFmtDate(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function blogCatClass(category) {
  switch (category) {
    case 'Board Exams':      return 'blog-cat-board';
    case 'English Speaking': return 'blog-cat-english';
    case 'Institute News':   return 'blog-cat-news';
    default:                 return 'blog-cat-study';
  }
}

const SEED_BLOG_POSTS = [
  {
    id: 'seed-post-1',
    slug: 'class-10-cbse-bseb-board-exam-strategy-2026',
    title: 'Top 5 Strategies to Score 95%+ in Class 10th Board Exams (CBSE & BSEB)',
    excerpt: 'A step-by-step revision routine by Chandan Sir covering NCERT mastery, time management in 3-hour papers, and daily self-assessment.',
    category: 'Board Exams',
    author_name: 'Chandan Kumar',
    author_role: 'Science Lead & Head Admin',
    read_time_minutes: 4,
    views_count: 0,
    published_at: '2026-08-20T10:00:00Z',
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
- Draw diagrams with sharp pencils and clear labels.
`
  },
  {
    id: 'seed-post-2',
    slug: 'spoken-english-confidence-guide-for-school-students',
    title: 'How to Speak English Fluently Without Fear: A Guide for Hindi Medium Students',
    excerpt: 'Overcoming hesitations in group discussions, building daily 10-minute vocabulary habits, and practical conversational drills.',
    category: 'English Speaking',
    author_name: 'Aditi Singh',
    author_role: 'Language Mentor',
    read_time_minutes: 3,
    views_count: 0,
    published_at: '2026-08-21T12:00:00Z',
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
:::
`
  },
  {
    id: 'seed-post-3',
    slug: 'class-12-pcm-higher-mathematics-calculus-blueprint',
    title: 'Class 12th PCM: How to Master Calculus & Differential Equations',
    excerpt: 'Prof. Ravi Ranjan explains the highest weightage calculus topics, standard integration patterns, and shortcut methods for competitive exams.',
    category: 'Board Exams',
    author_name: 'Prof. Ravi Ranjan',
    author_role: 'Higher Mathematics Specialist',
    read_time_minutes: 5,
    views_count: 0,
    published_at: '2026-08-22T14:30:00Z',
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
:::
`
  }
];

function getBlogViewsMap() {
  try {
    const raw = localStorage.getItem('pragyan_blog_views_cache');
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

function saveBlogViewsMap(slug, count) {
  try {
    const map = getBlogViewsMap();
    map[slug] = Number(count) || 0;
    localStorage.setItem('pragyan_blog_views_cache', JSON.stringify(map));
  } catch (_) {}
}

function mergeStoredBlogViews(posts) {
  const viewsMap = getBlogViewsMap();
  return posts.map(p => {
    const stored = Number(viewsMap[p.slug]);
    if (stored && stored > (Number(p.views_count) || 0)) {
      p.views_count = stored;
    }
    return p;
  });
}

async function fetchPublishedPosts() {
  const grid = document.getElementById('blogGrid');
  if (!grid || grid.dataset.loading === '1') return;
  grid.dataset.loading = '1';
  grid.innerHTML = '<div class="blog-loading"><i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i> Loading articles…</div>';
  
  // Try local sync store first for instant render
  try {
    if (window.SupabaseSync && typeof window.SupabaseSync.getAll === 'function') {
      const cached = window.SupabaseSync.getAll('blog_posts');
      if (Array.isArray(cached) && cached.length) {
        blogPostsCache = cached.filter(p => p.is_published !== false);
      }
    }
  } catch (_) {}

  try {
    const json = await blogApiPost({ table: 'blog_posts', operation: 'select', filters: { limit: 100 } });
    if (json && json.success && Array.isArray(json.data) && json.data.length > 0) {
      blogPostsCache = json.data;
    } else if (!blogPostsCache.length) {
      blogPostsCache = SEED_BLOG_POSTS.map(x => ({ ...x }));
    }
  } catch (err) {
    if (!blogPostsCache.length) {
      blogPostsCache = SEED_BLOG_POSTS.map(x => ({ ...x }));
    }
  }
  blogPostsCache = mergeStoredBlogViews(blogPostsCache);
  delete grid.dataset.loading;
  renderBlogGrid();
}

function renderBlogGrid() {
  const grid = document.getElementById('blogGrid');
  if (!grid) return;
  const conf = BLOG_CATEGORIES.find(c => c.key === blogActiveCategory) || BLOG_CATEGORIES[0];
  const list = blogPostsCache
    .filter(p => !conf.match || p.category === conf.match)
    .sort((a, b) => String(b.published_at || '').localeCompare(String(a.published_at || '')));

  blogReaderList = list.map(p => p.slug);

  if (!list.length) {
    grid.innerHTML = '<div class="blog-empty">No articles in this section yet — check back soon!</div>';
    return;
  }

  grid.innerHTML = list.map(p => {
    const cover = p.cover_image_url
      ? `<img src="${escapeHtml(p.cover_image_url)}" alt="" loading="lazy">`
      : `<div class="blog-cover-fallback" aria-hidden="true">${escapeHtml((p.title || 'P').charAt(0))}</div>`;
    return `
      <article class="blog-card reveal-on-scroll is-visible">
        <a class="blog-card-open" href="#read=${encodeURIComponent(p.slug)}" data-slug="${escapeHtml(p.slug)}" aria-label="Read article: ${escapeHtml(p.title)}">
          <div class="blog-cover">${cover}</div>
          <div class="blog-card-body">
            <div class="blog-meta-row">
              <span class="blog-cat-pill ${blogCatClass(p.category)}">${escapeHtml(p.category)}</span>
              <span class="blog-read-badge">⏱️ ${Number(p.read_time_minutes) || 3} min read</span>
            </div>
            <h3 class="blog-title">${escapeHtml(p.title)}</h3>
            <p class="blog-excerpt">${escapeHtml(p.excerpt)}</p>
            <div class="blog-foot">
              <span class="blog-date">${blogFmtDate(p.published_at || p.created_at)}</span>
              <span class="blog-views" data-views-for="${escapeHtml(p.slug)}">👁 ${Number(p.views_count) || 0}</span>
            </div>
            <span class="blog-read-btn" aria-hidden="true">Read Article <i aria-hidden="true" class="fa-solid fa-arrow-right"></i></span>
          </div>
        </a>
      </article>`;
  }).join('');
}

function onBlogTabClick(btn) {
  document.querySelectorAll('.blog-tab').forEach(b => {
    const active = b === btn;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', String(active));
  });
  blogActiveCategory = btn.dataset.blogCat || 'all';
  // F-R10: persist the filter so reloads and shared links land on the same view.
  try {
    const newHash = blogActiveCategory === 'all'
      ? ''
      : `#category=${encodeURIComponent(blogActiveCategory)}`;
    history.replaceState(null, '', newHash || location.pathname + location.search);
  } catch (_) {}
  renderBlogGrid();
}

function restoreBlogCategoryFromHash() {
  const m = /^[#&]?category=([^&]+)/.exec((location.hash || '').slice(1) ? `#${location.hash.slice(1)}` : location.hash || '');
  const raw = m ? decodeURIComponent(m[1]) : '';
  const conf = BLOG_CATEGORIES.find(c => c.key === raw);
  if (!conf) return null;
  const btn = document.querySelector(`.blog-tab[data-blog-cat="${conf.key}"]`);
  if (!btn) return null;
  document.querySelectorAll('.blog-tab').forEach(b => {
    const active = b === btn;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', String(active));
  });
  blogActiveCategory = conf.key;
  return conf.key;
}

/* -- Reader ---------------------------------------------------------------- */
function closeBlogReader() {
  const overlay = document.getElementById('blogReaderOverlay');
  if (!overlay) return;
  overlay.remove();
  window.PragyanUI && window.PragyanUI.unlockScroll();
  blogReaderOpenSlug = null;
  if (location.hash && location.hash.startsWith('#read=')) {
    try {
      const fallbackHash = blogActiveCategory !== 'all' ? `#category=${encodeURIComponent(blogActiveCategory)}` : '';
      history.replaceState(null, '', location.pathname + location.search + fallbackHash);
    } catch (_) {}
  }
}

function openBlogReader(slug) {
  const post = blogPostsCache.find(p => p.slug === slug);
  if (!post || typeof window.PragyanBlogMarkdown !== 'object') return;

  closeBlogReader();
  blogReaderOpenSlug = slug;

  const md = window.PragyanBlogMarkdown;
  const idx = blogReaderList.indexOf(slug);
  const prevSlug = idx > 0 ? blogReaderList[idx - 1] : null;
  const nextSlug = idx >= 0 && idx < blogReaderList.length - 1 ? blogReaderList[idx + 1] : null;
  const shareUrl = `${location.origin}${location.pathname}#read=${encodeURIComponent(post.slug)}`;
  const shareHref = `https://wa.me/?text=${encodeURIComponent(`${post.title} — ${shareUrl}`)}`;

  const overlay = document.createElement('div');
  overlay.className = 'blog-reader-overlay';
  overlay.id = 'blogReaderOverlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'blogReaderTitle');
  overlay.innerHTML = `
    <div class="blog-reader-panel" tabindex="-1">
      <div class="blog-reader-top-bar">
        <span class="blog-cat-pill ${blogCatClass(post.category)}">${escapeHtml(post.category)}</span>
        <button type="button" class="blog-reader-close" aria-label="Close article reader"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
      </div>
      <header class="blog-reader-head">
        <h2 id="blogReaderTitle">${escapeHtml(post.title)}</h2>
        <div class="blog-reader-byline">
          <span class="byline-item byline-author"><i class="fa-solid fa-user-pen" aria-hidden="true"></i> <strong>${escapeHtml(post.author_name)}</strong> (${escapeHtml(post.author_role)})</span>
          <span class="byline-item byline-date"><i class="fa-regular fa-calendar-days" aria-hidden="true"></i> ${blogFmtDate(post.published_at || post.created_at)}</span>
          <span class="byline-item byline-time"><i class="fa-regular fa-clock" aria-hidden="true"></i> ${Number(post.read_time_minutes) || 3} min read</span>
          <span class="byline-item byline-views"><i class="fa-regular fa-eye" aria-hidden="true"></i> <span data-live-views>${Number(post.views_count) || 0}</span> views</span>
        </div>
        ${post.cover_image_url ? `<img class="blog-reader-cover" src="${escapeHtml(post.cover_image_url)}" alt="${escapeHtml(post.title)}" loading="lazy">` : ''}
      </header>
      <div class="blog-reader-body">${md.renderMarkdown(post.content_markdown)}</div>
      <footer class="blog-reader-footer">
        <div class="blog-reader-nav">
          <button type="button" class="blog-nav-btn" data-blog-nav="prev" ${prevSlug ? '' : 'disabled'}>
            <i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Previous
          </button>
          <button type="button" class="blog-nav-btn" data-blog-nav="next" ${nextSlug ? '' : 'disabled'}>
            Next <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
          </button>
        </div>
        <a class="blog-share-btn" href="${shareHref}" target="_blank" rel="noopener">
          <i class="fa-brands fa-whatsapp" aria-hidden="true"></i> Share on WhatsApp
        </a>
      </footer>
    </div>`;
  document.body.appendChild(overlay);

  window.PragyanUI && window.PragyanUI.lockScroll();

  const panel = overlay.querySelector('.blog-reader-panel');
  panel?.focus?.();
  const focusables = () => Array.from(overlay.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])'))
    .filter(el => el.offsetParent !== null);
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closeBlogReader(); return; }
    if (e.key !== 'Tab') return;
    const items = focusables();
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  overlay.querySelector('.blog-reader-close').addEventListener('click', closeBlogReader);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeBlogReader(); });

  // View counter: optimistic display + local persistence + atomic server increment + grid badge sync
  const viewsEl = overlay.querySelector('[data-live-views]');
  post.views_count = (Number(post.views_count) || 0) + 1;
  saveBlogViewsMap(post.slug, post.views_count);

  const updateGridBadges = (cnt) => {
    document.querySelectorAll(`[data-views-for="${post.slug}"]`).forEach(el => {
      el.textContent = `👁 ${Number(cnt).toLocaleString('en-IN')}`;
    });
  };
  if (viewsEl) viewsEl.textContent = Number(post.views_count).toLocaleString('en-IN');
  updateGridBadges(post.views_count);

  blogApiPost({ operation: 'rpc', fn: 'increment_blog_views', params: { p_slug: post.slug } })
    .then(json => {
      if (json && json.success && json.data != null) {
        const liveCount = Number(json.data);
        post.views_count = liveCount;
        saveBlogViewsMap(post.slug, liveCount);
        if (viewsEl) viewsEl.textContent = liveCount.toLocaleString('en-IN');
        updateGridBadges(liveCount);
      }
    })
    .catch(() => {});

  overlay.querySelector('[data-blog-nav="prev"]')?.addEventListener('click', () => prevSlug && openBlogReader(prevSlug));
  overlay.querySelector('[data-blog-nav="next"]')?.addEventListener('click', () => nextSlug && openBlogReader(nextSlug));

  history.replaceState(null, '', `#read=${encodeURIComponent(slug)}`);
}

function handleHashForBlog() {
  const m = /^#read=([\w-]+)$/.exec(location.hash || '');
  if (m) openBlogReader(decodeURIComponent(m[1]));
}

function initBlog() {
  const section = document.getElementById('blog');
  if (!section) return;

  const tabs = section.querySelectorAll('.blog-tab');
  tabs.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      onBlogTabClick(btn);
    });
  });

  const grid = document.getElementById('blogGrid');
  if (grid) {
    grid.addEventListener('click', (e) => {
      const target = e.target.closest('a[data-slug], [data-slug], .blog-card');
      if (!target) return;
      const anchor = target.matches('a[data-slug]') ? target : target.querySelector('a[data-slug]') || target.closest('a[data-slug]');
      const slug = target.dataset.slug || anchor?.dataset.slug;
      if (slug) {
        e.preventDefault();
        openBlogReader(slug);
      }
    });
  }

  window.addEventListener('hashchange', () => {
    handleHashForBlog();
  });
  restoreBlogCategoryFromHash();
  handleHashForBlog();

  fetchPublishedPosts();
}

/* --------------------------------------------------------------------------
 * 13. Interactive Faculty & Mentor Ratings (Real-Time Supabase Sync)
 * -------------------------------------------------------------------------- */
const MENTOR_BASE_RATINGS = {
  'chandan-kumar': { average_rating: 0.0, total_ratings: 0, name: 'Chandan Sir' },
  'ravi-ranjan':   { average_rating: 0.0, total_ratings: 0, name: 'Ravi Sir' },
  'aditi-singh':   { average_rating: 0.0, total_ratings: 0, name: 'Aditi Ma\'am' }
};

let mentorRatingsCache = {
  'chandan-kumar': { ...MENTOR_BASE_RATINGS['chandan-kumar'] },
  'ravi-ranjan':   { ...MENTOR_BASE_RATINGS['ravi-ranjan'] },
  'aditi-singh':   { ...MENTOR_BASE_RATINGS['aditi-singh'] }
};

function getRatingClientId() {
  let cid = '';
  try { cid = localStorage.getItem('pragyan_rating_client_id') || ''; } catch (_) {}
  if (!cid) {
    cid = 'cid_' + (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 11));
    try { localStorage.setItem('pragyan_rating_client_id', cid); } catch (_) {}
  }
  return cid;
}

function getMentorVotesMap() {
  try {
    const raw = localStorage.getItem('pragyan_mentor_all_votes');
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

function getUserMentorRating(mentorId) {
  const clientId = getRatingClientId();
  const all = getMentorVotesMap();
  const mentorVotes = all[mentorId] || {};
  return Number(mentorVotes[clientId]) || 0;
}

function saveMentorVote(mentorId, rating) {
  const clientId = getRatingClientId();
  try {
    const all = getMentorVotesMap();
    if (!all[mentorId]) all[mentorId] = {};
    all[mentorId][clientId] = Number(rating);
    localStorage.setItem('pragyan_mentor_all_votes', JSON.stringify(all));
  } catch (_) {}
}

function computeMentorAggregates(mentorId) {
  const all = getMentorVotesMap();
  const mentorVotes = all[mentorId] || {};
  const scores = Object.values(mentorVotes).map(Number).filter(n => n >= 1 && n <= 5);
  const total = scores.length;
  if (total === 0) {
    return { average_rating: 0.0, total_ratings: 0 };
  }
  const sum = scores.reduce((a, b) => a + b, 0);
  const avg = Number((sum / total).toFixed(1));
  return { average_rating: avg, total_ratings: total };
}

function syncMentorRatingsFromLocalVotes() {
  ['chandan-kumar', 'ravi-ranjan', 'aditi-singh'].forEach(mId => {
    const agg = computeMentorAggregates(mId);
    mentorRatingsCache[mId] = {
      average_rating: agg.average_rating,
      total_ratings: agg.total_ratings,
      name: mentorRatingsCache[mId]?.name || 'Faculty Mentor'
    };
  });
  saveMentorRatingsLocal();
}

function loadMentorRatingsLocal() {
  try {
    const raw = localStorage.getItem('pragyan_mentor_ratings_cache');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        Object.keys(parsed).forEach(mId => {
          if (mentorRatingsCache[mId]) {
            const rawAvg = Number(parsed[mId].average_rating);
            const rawCount = Number(parsed[mId].total_ratings);
            mentorRatingsCache[mId].average_rating = (rawAvg > 0 && rawCount > 0) ? rawAvg : 0.0;
            mentorRatingsCache[mId].total_ratings = Math.max(0, rawCount || 0);
          }
        });
      }
    }
  } catch (_) {}
  // Re-verify against vote records to guarantee zero arithmetic errors
  syncMentorRatingsFromLocalVotes();
}

function saveMentorRatingsLocal() {
  try {
    localStorage.setItem('pragyan_mentor_ratings_cache', JSON.stringify(mentorRatingsCache));
  } catch (_) {}
}

function renderMentorRatingWidget(widget) {
  const mentorId = widget.dataset.mentorId;
  if (!mentorId) return;
  const data = mentorRatingsCache[mentorId] || MENTOR_BASE_RATINGS[mentorId] || { average_rating: 0.0, total_ratings: 0 };
  const userRating = getUserMentorRating(mentorId);

  const scoreEl = widget.querySelector('[data-rating-score]');
  const countEl = widget.querySelector('[data-rating-count]');
  const countVal = Number(data.total_ratings || 0);
  const scoreVal = Number(data.average_rating || 0).toFixed(1);

  if (scoreEl) scoreEl.textContent = scoreVal;
  if (countEl) countEl.textContent = `(${countVal.toLocaleString('en-IN')})`;

  const starBtns = widget.querySelectorAll('.star-btn');
  starBtns.forEach(btn => {
    const starVal = Number(btn.dataset.star);
    const activeThreshold = userRating > 0 ? userRating : (countVal > 0 ? Math.round(Number(data.average_rating)) : 0);
    btn.classList.toggle('is-active', starVal <= activeThreshold);
  });
}

function initMentorRatings() {
  const widgets = document.querySelectorAll('.mentor-rating-widget');
  if (!widgets.length) return;

  loadMentorRatingsLocal();
  widgets.forEach(renderMentorRatingWidget);

  blogApiPost({ operation: 'rpc', fn: 'get_mentor_ratings', params: {} })
    .then(json => {
      if (json && json.success && json.data && typeof json.data === 'object') {
        Object.keys(json.data).forEach(mId => {
          if (mentorRatingsCache[mId]) {
            mentorRatingsCache[mId].average_rating = Number(json.data[mId].average_rating) || 0.0;
            mentorRatingsCache[mId].total_ratings = Number(json.data[mId].total_ratings) || 0;
          }
        });
        saveMentorRatingsLocal();
        widgets.forEach(renderMentorRatingWidget);
      }
    })
    .catch(() => {});

  widgets.forEach(widget => {
    const mentorId = widget.dataset.mentorId;
    const mentorName = widget.dataset.mentorName || 'Faculty Mentor';
    const starBtns = widget.querySelectorAll('.star-btn');

    starBtns.forEach(btn => {
      const starVal = Number(btn.dataset.star);

      btn.addEventListener('mouseenter', () => {
        starBtns.forEach(b => b.classList.toggle('is-hover', Number(b.dataset.star) <= starVal));
      });

      widget.addEventListener('mouseleave', () => {
        starBtns.forEach(b => b.classList.remove('is-hover'));
      });

      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        
        // 1. Save individual user vote into map and compute exact totals
        saveMentorVote(mentorId, starVal);
        syncMentorRatingsFromLocalVotes();
        renderMentorRatingWidget(widget);

        // 2. Immediate feedback toast
        const toastMsg = `Thank you! Rated ${mentorName} ${starVal}★`;
        if (typeof window.showToast === 'function') {
          window.showToast(toastMsg, 'success');
        } else if (window.PragyanUI && typeof window.PragyanUI.showToast === 'function') {
          window.PragyanUI.showToast(toastMsg);
        }

        // 3. Sync to Supabase cloud
        const clientId = getRatingClientId();
        try {
          const res = await blogApiPost({
            operation: 'rpc',
            fn: 'submit_mentor_rating',
            params: {
              p_mentor_id: mentorId,
              p_rating: starVal,
              p_client_id: clientId
            }
          });
          if (res && res.success && res.data && typeof res.data === 'object') {
            mentorRatingsCache[mentorId].average_rating = Number(res.data.average_rating) || mentorRatingsCache[mentorId].average_rating;
            mentorRatingsCache[mentorId].total_ratings = Number(res.data.total_ratings) || mentorRatingsCache[mentorId].total_ratings;
            saveMentorRatingsLocal();
            renderMentorRatingWidget(widget);
          }
        } catch (_) {}
      });
    });
  });
}

function initBlog() {
  const tabsWrap = document.querySelector('.blog-tabs');
  tabsWrap?.querySelectorAll('.blog-tab').forEach(btn => {
    btn.addEventListener('click', () => onBlogTabClick(btn));
  });

  const grid = document.getElementById('blogGrid');
  grid?.addEventListener('click', (e) => {
    const opener = e.target.closest('[data-slug]');
    if (!opener) return;
    e.preventDefault();
    openBlogReader(opener.dataset.slug);
  });

  window.addEventListener('hashchange', handleHashForBlog);

  restoreBlogCategoryFromHash();
  fetchPublishedPosts().then(() => { handleHashForBlog(); });
}

function initStreamToggles() {
  document.querySelectorAll('.batch-card[data-has-streams]').forEach(card => {
    const streamBtns = card.querySelectorAll('.stream-btn');
    const streamPanes = card.querySelectorAll('.stream-pane');
    const titleStreamEl = card.querySelector('[data-stream-title]');

    streamBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const targetStream = btn.dataset.stream;
        if (!targetStream) return;

        streamBtns.forEach(b => {
          const isActive = b === btn;
          b.classList.toggle('active', isActive);
          b.setAttribute('aria-pressed', String(isActive));
        });

        streamPanes.forEach(pane => {
          const match = pane.dataset.streamPane === targetStream;
          pane.classList.toggle('is-hidden', !match);
        });

        if (titleStreamEl) {
          titleStreamEl.textContent = targetStream.toUpperCase();
        }
      });
    });
  });
}

function initPublicFeatures() {
  initBlog();
  initMentorRatings();
  initStreamToggles();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPublicFeatures);
} else {
  initPublicFeatures();
}