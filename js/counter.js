/* Animated Stat Counters - Pragyan Institute */

export function initCounters() {
  const statElements = document.querySelectorAll('.stat-number');
  if (!statElements.length) return;

  const observerOptions = {
    threshold: 0.5
  };

  if (!('IntersectionObserver' in window)) {
    statElements.forEach(el => {
      const targetValue = parseInt(el.getAttribute('data-target') || '0', 10);
      const prefix = el.getAttribute('data-prefix') || '';
      const suffix = el.getAttribute('data-suffix') || '';
      animateCounter(el, targetValue, prefix, suffix);
    });
    return;
  }

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const targetValue = parseInt(el.getAttribute('data-target') || '0', 10);
        const prefix = el.getAttribute('data-prefix') || '';
        const suffix = el.getAttribute('data-suffix') || '';
        
        animateCounter(el, targetValue, prefix, suffix);
        obs.unobserve(el);
      }
    });
  }, observerOptions);

  statElements.forEach(el => observer.observe(el));
}

function animateCounter(element, target, prefix = '', suffix = '') {
  let start = 0;
  const duration = 2000;
  const stepTime = 20;
  const totalSteps = duration / stepTime;
  const increment = target / totalSteps;

  const timer = setInterval(() => {
    start += increment;
    if (start >= target) {
      element.textContent = `${prefix}${target}${suffix}`;
      clearInterval(timer);
    } else {
      element.textContent = `${prefix}${Math.floor(start)}${suffix}`;
    }
  }, stepTime);
}
