/* Complete Web Application Script - Pragyan Institute Lalganj */

(function () {
  'use strict';

  if (typeof window !== 'undefined') {
    window.escapeHtml = window.escapeHtml || function(str) {
      if (str == null) return '';
      return String(str).replace(/[&<>"']/g, function(m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
      });
    };
  }

  document.addEventListener('DOMContentLoaded', () => {
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
   * 1. Header & Navigation Logic
   * -------------------------------------------------------------------------- */
  function initNavbar() {
    const header = document.querySelector('.site-header');
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const mobileDrawer = document.getElementById('mobileNavDrawer');
    const mobileLinks = document.querySelectorAll('.mobile-nav-links a');
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav-links a[href^="#"]');

    // Sticky Scroll Effect
    window.addEventListener('scroll', () => {
      if (window.scrollY > 40) {
        header?.classList.add('scrolled');
      } else {
        header?.classList.remove('scrolled');
      }

      // Active Navigation Link Highlight
      let currentSection = '';
      sections.forEach(section => {
        const sectionTop = section.offsetTop - 130;
        if (window.scrollY >= sectionTop) {
          currentSection = section.getAttribute('id') || '';
        }
      });

      navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === `#${currentSection}`) {
          link.classList.add('active');
        }
      });
    });

    // Mobile Hamburger Menu Toggle with ARIA Accessibility
    if (hamburgerBtn && mobileDrawer) {
      const setDrawerState = (isOpen) => {
        mobileDrawer.classList.toggle('open', isOpen);
        hamburgerBtn.classList.toggle('open', isOpen);
        hamburgerBtn.setAttribute('aria-expanded', String(isOpen));
        mobileDrawer.setAttribute('aria-expanded', String(isOpen));
        mobileDrawer.setAttribute('aria-hidden', String(!isOpen));
        document.body.style.overflow = isOpen ? 'hidden' : '';
      };

      hamburgerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = !mobileDrawer.classList.contains('open');
        setDrawerState(isOpen);
      });

      document.addEventListener('click', (e) => {
        if (!mobileDrawer.contains(e.target) && !hamburgerBtn.contains(e.target)) {
          setDrawerState(false);
        }
      });

      mobileLinks.forEach(link => {
        link.addEventListener('click', () => {
          setDrawerState(false);
        });
      });
    }
  }

  /* --------------------------------------------------------------------------
   * 1b. Hero Slideshow Carousel (Auto Play + Navigation)
   * -------------------------------------------------------------------------- */
  function initHeroSlideshow() {
    const slides = document.querySelectorAll('.hero-slide');
    const dots = document.querySelectorAll('.hero-slide-dots .dot');
    const prevBtn = document.getElementById('heroPrevBtn');
    const nextBtn = document.getElementById('heroNextBtn');
    const container = document.querySelector('.hero-slideshow-container');

    if (!slides.length) return;

    let currentIndex = 0;
    let autoPlayTimer = null;

    function goToSlide(index) {
      if (index < 0) index = slides.length - 1;
      if (index >= slides.length) index = 0;

      slides.forEach((slide, idx) => {
        slide.classList.toggle('active', idx === index);
      });

      dots.forEach((dot, idx) => {
        dot.classList.toggle('active', idx === index);
      });

      currentIndex = index;
    }

    function nextSlide() {
      goToSlide(currentIndex + 1);
    }

    function prevSlide() {
      goToSlide(currentIndex - 1);
    }

    function startAutoPlay() {
      stopAutoPlay();
      autoPlayTimer = setInterval(nextSlide, 3500);
    }

    function stopAutoPlay() {
      if (autoPlayTimer) clearInterval(autoPlayTimer);
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        nextSlide();
        startAutoPlay();
      });
    }

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        prevSlide();
        startAutoPlay();
      });
    }

    dots.forEach((dot, idx) => {
      dot.addEventListener('click', () => {
        goToSlide(idx);
        startAutoPlay();
      });
    });

    if (container) {
      container.addEventListener('mouseenter', stopAutoPlay);
      container.addEventListener('mouseleave', startAutoPlay);
    }

    startAutoPlay();
  }

  /* --------------------------------------------------------------------------
   * 2. Smooth Scroll Reveal (Intersection Observer)
   * -------------------------------------------------------------------------- */
  function initScrollReveal() {
    const elementsToReveal = document.querySelectorAll(
      '.hero-content, .hero-visual, .teacher-card, .batch-card, .gallery-card, .contact-card, .map-card, .faq-wrap'
    );

    elementsToReveal.forEach((el, idx) => {
      el.classList.add('reveal-on-scroll');
      if (idx % 3 === 1) el.classList.add('delay-1');
      if (idx % 3 === 2) el.classList.add('delay-2');
    });

    if (!('IntersectionObserver' in window)) {
      elementsToReveal.forEach(el => el.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
          }
        });
      },
      { threshold: 0.15 }
    );

    elementsToReveal.forEach(el => observer.observe(el));
  }

  /* --------------------------------------------------------------------------
   * 3. Animated Stat Counters
   * -------------------------------------------------------------------------- */
  function initStatCounters() {
    const statNumbers = document.querySelectorAll('.stat-number');
    if (!statNumbers.length) return;

    if (!('IntersectionObserver' in window)) {
      statNumbers.forEach(el => {
        const target = parseInt(el.getAttribute('data-target') || '0', 10);
        const prefix = el.getAttribute('data-prefix') || '';
        const suffix = el.getAttribute('data-suffix') || '';
        animateCounter(el, target, prefix, suffix);
      });
      return;
    }

    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const el = entry.target;
            const target = parseInt(el.getAttribute('data-target') || '0', 10);
            const prefix = el.getAttribute('data-prefix') || '';
            const suffix = el.getAttribute('data-suffix') || '';

            animateCounter(el, target, prefix, suffix);
            obs.unobserve(el);
          }
        });
      },
      { threshold: 0.5 }
    );

    statNumbers.forEach(el => observer.observe(el));
  }

  function animateCounter(element, target, prefix = '', suffix = '') {
    let current = 0;
    const duration = 1800;
    const stepTime = 16;
    const steps = duration / stepTime;
    const increment = target / steps;

    const timer = setInterval(() => {
      current += increment;
      if (current >= target) {
        element.textContent = `${prefix}${target}${suffix}`;
        clearInterval(timer);
      } else {
        element.textContent = `${prefix}${Math.floor(current)}${suffix}`;
      }
    }, stepTime);

    // Store timer reference for cleanup if needed
    if (!element._counterTimer) {
      element._counterTimer = timer;
    }
  }

  /* --------------------------------------------------------------------------
   * 4. Batches & Pricing Filter Tabs & Billing Toggle
   * -------------------------------------------------------------------------- */
  function initBatchTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const toggleSwitch = document.getElementById('billingToggle');
    const batchCards = document.querySelectorAll('.batch-card');

    const pricingData = {
      junior:  { monthly: '₹700',   annual: '₹7,980' },
      class8:  { monthly: '₹800',   annual: '₹9,120' },
      class9:  { monthly: '₹1,000', annual: '₹11,400' },
      class10: { monthly: '₹1,000', annual: '₹11,400' }
    };

    let isAnnual = false;

    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        tabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const selectedClass = btn.getAttribute('data-class');

        batchCards.forEach(card => {
          const cardClass = card.getAttribute('data-class');
          if (selectedClass === 'all' || cardClass === selectedClass) {
            card.style.display = 'flex';
            card.classList.remove('batch-card-animating');
            void card.offsetWidth; // trigger reflow
            card.classList.add('batch-card-animating');
          } else {
            card.style.display = 'none';
          }
        });
      });
    });

    if (toggleSwitch) {
      toggleSwitch.addEventListener('click', () => {
        isAnnual = !isAnnual;
        toggleSwitch.classList.toggle('active', isAnnual);
        toggleSwitch.setAttribute('aria-checked', String(isAnnual));

        const priceElements = document.querySelectorAll('[data-price-key]');
        priceElements.forEach(el => {
          const key = el.getAttribute('data-price-key');
          if (pricingData[key]) {
            const priceText = isAnnual ? pricingData[key].annual : pricingData[key].monthly;
            const periodText = isAnnual ? '/ year (save 5%)' : '/ month';

            el.textContent = priceText;
            const periodEl = el.nextElementSibling;
            if (periodEl && periodEl.classList.contains('batch-period')) {
              periodEl.textContent = periodText;
            }
          }
        });
      });
    }
  }

  /* --------------------------------------------------------------------------
   * 5. 3D Gallery Interactive Tilt
   * -------------------------------------------------------------------------- */
  function init3DGallery() {
    const galleryCards = document.querySelectorAll('.gallery-card');

    galleryCards.forEach(card => {
      // Mouse events for desktop
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const rotateX = ((y - centerY) / centerY) * -10;
        const rotateY = ((x - centerX) / centerX) * 10;

        card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.03, 1.03, 1.03)`;
      });

      card.addEventListener('mouseleave', () => {
        card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
      });

      // Touch events for mobile devices
      card.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1) {
          const touch = e.touches[0];
          const rect = card.getBoundingClientRect();
          const x = touch.clientX - rect.left;
          const y = touch.clientY - rect.top;

          const centerX = rect.width / 2;
          const centerY = rect.height / 2;

          const rotateX = ((y - centerY) / centerY) * -10;
          const rotateY = ((x - centerX) / centerX) * 10;

          card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.03, 1.03, 1.03)`;
        }
      });

      card.addEventListener('touchend', () => {
        card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
      });
    });
  }

  /* --------------------------------------------------------------------------
   * 6. Lightbox Modal Zoom
   * -------------------------------------------------------------------------- */
  function initLightboxModal() {
    const cards = document.querySelectorAll('.gallery-card');
    const modal = document.getElementById('lightboxModal');
    const modalImg = document.getElementById('lightboxImg');
    const modalCaption = document.getElementById('lightboxCaption');
    const closeBtn = document.getElementById('lightboxClose');

    cards.forEach(card => {
      card.addEventListener('click', () => {
        const img = card.querySelector('img');
        const title = card.querySelector('.gallery-caption-title')?.textContent || '';
        const sub = card.querySelector('.gallery-caption-sub')?.textContent || '';

        if (img && modal && modalImg) {
          modalImg.src = img.src;
          modalImg.alt = img.alt;
          if (modalCaption) {
            modalCaption.textContent = `${title} — ${sub}`;
          }
          modal.style.display = 'flex';
          modal.classList.add('active');
          document.body.style.overflow = 'hidden';
        }
      });
    });

    const closeModal = () => {
      if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
        document.body.style.overflow = '';
      }
    };

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal?.classList.contains('active')) {
        closeModal();
      }
    });
  }

  /* --------------------------------------------------------------------------
   * 7. Contact Inquiry Form Validation & WhatsApp Trigger
   * -------------------------------------------------------------------------- */
  function initContactForm() {
    const form = document.getElementById('inquiryForm');
    if (!form) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();

      const name = document.getElementById('studentName')?.value.trim();
      const phone = document.getElementById('studentPhone')?.value.trim();
      const studentClass = document.getElementById('studentClass')?.value;
      const query = document.getElementById('studentQuery')?.value.trim();

      // Validation: Check required fields
      if (!name || !phone) {
        showToast('Please enter your name and contact phone number.', 'error');
        return;
      }

      // Validation: Check name format (at least 2 characters, only letters and spaces)
      if (name.length < 2 || !/^[a-zA-Z\s]+$/.test(name)) {
        showToast('Please enter a valid name (letters only, minimum 2 characters).', 'error');
        return;
      }

      // Validation: Check phone format (10 digits, Indian mobile number)
      const cleanPhone = phone.replace(/\D/g, '');
      if (cleanPhone.length !== 10 || !/^[6-9]\d{9}$/.test(cleanPhone)) {
        showToast('Please enter a valid 10-digit Indian mobile number.', 'error');
        return;
      }

      const text = `Hello Pragyan Institute, I am inquiring about admissions in Lalganj.\n\n*Student Info:*\n• Name: ${name}\n• Phone: ${cleanPhone}\n• Class: ${studentClass}\n• Details: ${query || 'N/A'}`;
      const encodedText = encodeURIComponent(text);
      const waUrl = `https://wa.me/917369891858?text=${encodedText}`;

      showToast('Opening WhatsApp with your inquiry details...', 'success');

      setTimeout(() => {
        window.open(waUrl, '_blank');
        form.reset();
      }, 1000);
    });
  }

  /* --------------------------------------------------------------------------
   * 8. FAQ Accordion Toggle
   * -------------------------------------------------------------------------- */
  function initFAQAccordion() {
    const faqItems = document.querySelectorAll('.faq-item');

    faqItems.forEach(item => {
      const header = item.querySelector('.faq-header');

      header?.addEventListener('click', () => {
        const isOpen = item.classList.contains('open');

        // Close all other items for clean single accordion effect
        faqItems.forEach(otherItem => {
          if (otherItem !== item) {
            otherItem.classList.remove('open');
          }
        });

        // Toggle current item
        if (isOpen) {
          item.classList.remove('open');
        } else {
          item.classList.add('open');
        }
      });
    });
  }


  /* Helper: Toast Notifications */
  function showToast(message, type = 'success') {
    let toast = document.getElementById('toastNotification');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toastNotification';
      toast.style.cssText = `
        position: fixed;
        bottom: 6rem;
        left: 50%;
        transform: translateX(-50%);
        padding: 0.9rem 1.85rem;
        border-radius: 9999px;
        font-weight: 700;
        font-size: 0.925rem;
        z-index: 2500;
        color: #fff;
        box-shadow: 0 10px 28px rgba(0,0,0,0.22);
        transition: opacity 0.35s ease, transform 0.35s ease;
        opacity: 0;
      `;
      document.body.appendChild(toast);
    }

    toast.style.backgroundColor = type === 'success' ? '#6F7F5F' : '#B5543A';
    toast.textContent = message;
    toast.style.opacity = '1';

    setTimeout(() => {
      toast.style.opacity = '0';
    }, 4000);
  }
})();
