/* Batches & Pricing Interactive Tabs */

export const batchData = {
  class12pcm: {
    monthly: '₹1,500',
    annual: '₹17,100',
    timing: 'Morning: 6:00 AM – 8:30 AM',
    waText: 'Hello Pragyan Institute, I am interested in Class 12th PCM batch admissions.'
  },
  class12pcb: {
    monthly: '₹1,500',
    annual: '₹17,100',
    timing: 'Morning: 6:00 AM – 8:30 AM',
    waText: 'Hello Pragyan Institute, I am interested in Class 12th PCB batch admissions.'
  },
  class11pcm: {
    monthly: '₹1,500',
    annual: '₹17,100',
    timing: 'Evening: 3:30 PM – 6:00 PM',
    waText: 'Hello Pragyan Institute, I am interested in Class 11th PCM batch admissions.'
  },
  class11pcb: {
    monthly: '₹1,500',
    annual: '₹17,100',
    timing: 'Evening: 3:30 PM – 6:00 PM',
    waText: 'Hello Pragyan Institute, I am interested in Class 11th PCB batch admissions.'
  },
  class10: {
    monthly: '₹1,000',
    annual: '₹11,400',
    timing: 'Morning: 6:30 AM – 8:30 AM (Board Test Series)',
    waText: 'Hello Pragyan Institute, I am interested in Class 10th Board Exam batch admissions.'
  },
  class9: {
    monthly: '₹1,000',
    annual: '₹11,400',
    timing: 'Evening: 4:30 PM – 6:30 PM',
    waText: 'Hello Pragyan Institute, I am interested in Class 9th Foundation batch admissions.'
  },
  class8: {
    monthly: '₹800',
    annual: '₹9,120',
    timing: 'Morning: 7:00 AM – 8:30 AM',
    waText: 'Hello Pragyan Institute, I am interested in Class 8th Alpha batch admissions.'
  },
  class67: {
    monthly: '₹700',
    annual: '₹7,980',
    timing: 'Afternoon: 2:30 PM – 4:30 PM',
    waText: 'Hello Pragyan Institute, I am interested in Class 6th & 7th Pioneer batch admissions.'
  },
  class15: {
    monthly: '₹500',
    annual: '₹5,700',
    timing: 'Afternoon: 1:00 PM – 3:00 PM',
    waText: 'Hello Pragyan Institute, I am interested in Class 1st to 5th Junior Foundation batch admissions.'
  },
  junior: {
    monthly: '₹500',
    annual: '₹5,700',
    timing: 'Afternoon: 1:00 PM – 3:00 PM',
    waText: 'Hello Pragyan Institute, I am interested in Junior Foundation batch admissions.'
  },
  eng912: {
    monthly: '₹1,000',
    annual: '₹11,400',
    timing: 'Evening: 5:30 PM – 6:45 PM',
    waText: 'Hello Pragyan Institute, I am interested in Special English (9th to 12th) by Aditi Singh.'
  },
  eng68: {
    monthly: '₹700',
    annual: '₹7,980',
    timing: 'Afternoon: 4:30 PM – 5:30 PM',
    waText: 'Hello Pragyan Institute, I am interested in Special English (6th to 8th) by Aditi Singh.'
  },
  eng15: {
    monthly: '₹500',
    annual: '₹5,700',
    timing: 'Afternoon: 3:30 PM – 4:30 PM',
    waText: 'Hello Pragyan Institute, I am interested in Special English (1st to 5th) by Aditi Singh.'
  }
};

const englishData = {
  eng912: {
    title: 'Special English (Class 9th to 12th)',
    timing: 'Mon – Sat: 5:30 PM – 6:45 PM',
    monthly: '₹1,000',
    annual: '₹11,400',
    priceKey: 'eng912',
    features: [
      'Advanced English Grammar, Tenses & Clause Transformations',
      'Board Essay, Letter, Notice & Formal Writing Masterclasses',
      'High-Scoring Answer Structuring & Error Correction Drills',
      'Spoken English Fluency & Vocabulary Expansion'
    ],
    waText: 'Hello Pragyan Institute, I am interested in Special English for Classes 9th to 12th by Aditi Singh.'
  },
  eng68: {
    title: 'Special English (Class 6th to 8th)',
    timing: 'Mon – Sat: 4:30 PM – 5:30 PM',
    monthly: '₹700',
    annual: '₹7,980',
    priceKey: 'eng68',
    features: [
      'Tenses, Active/Passive Voice, Prepositions & Narration',
      'Vocabulary Expansion, Synonyms/Antonyms & Word Power',
      'Spoken English Pronunciation & Daily Fluency Drills',
      'Reading Comprehension, Storytelling & School Sync'
    ],
    waText: 'Hello Pragyan Institute, I am interested in Special English for Classes 6th to 8th by Aditi Singh.'
  },
  eng15: {
    title: 'Special English (Class 1st to 5th)',
    timing: 'Mon – Sat: 3:30 PM – 4:30 PM',
    monthly: '₹500',
    annual: '₹5,700',
    priceKey: 'eng15',
    features: [
      'Phonics, Sound Blending & Accurate Pronunciation',
      'Basic Parts of Speech, Articles & Sentence Building',
      'Picture Story Reading & Early Reader Confidence',
      'Fun Interactive Language Games & Mentor Attention'
    ],
    waText: 'Hello Pragyan Institute, I am interested in Special English for Classes 1st to 5th by Aditi Singh.'
  }
};

let isAnnual = false;
let currentClass = 'all';

export function initTabs() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const toggleSwitch = document.querySelector('.toggle-switch');
  const batchCards = document.querySelectorAll('.batches-grid .batch-card');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      currentClass = btn.getAttribute('data-class') || 'all';
      filterBatchCards(currentClass, batchCards);
    });
  });

  if (toggleSwitch) {
    toggleSwitch.addEventListener('click', () => {
      isAnnual = !isAnnual;
      toggleSwitch.classList.toggle('active', isAnnual);
      updatePrices();
    });
  }

  initStreamSwitches();
  initEnglishShowcase();
}

function initStreamSwitches() {
  const switchContainers = document.querySelectorAll('.batch-stream-switch');
  switchContainers.forEach(container => {
    const cardId = container.getAttribute('data-card-id');
    const card = document.getElementById(cardId) || container.closest('.batch-card');
    if (!card) return;

    const streamBtns = container.querySelectorAll('.stream-btn');
    streamBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const stream = btn.getAttribute('data-stream'); // 'pcm' or 'pcb'
        streamBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const pcmPane = card.querySelector('.stream-pane-pcm');
        const pcbPane = card.querySelector('.stream-pane-pcb');
        const titleEl = card.querySelector('.batch-class');

        if (stream === 'pcb') {
          if (pcmPane) pcmPane.style.display = 'none';
          if (pcbPane) {
            pcbPane.style.display = 'block';
            pcbPane.style.animation = 'countUpFade 0.25s ease forwards';
          }
          if (titleEl) {
            const is12th = card.id.includes('12');
            titleEl.textContent = is12th ? 'Class 12th — PCB' : 'Class 11th — PCB';
          }
        } else {
          if (pcbPane) pcbPane.style.display = 'none';
          if (pcmPane) {
            pcmPane.style.display = 'block';
            pcmPane.style.animation = 'countUpFade 0.25s ease forwards';
          }
          if (titleEl) {
            const is12th = card.id.includes('12');
            titleEl.textContent = is12th ? 'Class 12th — PCM' : 'Class 11th — PCM';
          }
        }
      });
    });
  });
}

function initEnglishShowcase() {
  const levelBtns = document.querySelectorAll('.english-level-btn');
  const titleEl = document.getElementById('englishLevelTitle');
  const timingEl = document.getElementById('englishLevelTiming');
  const priceEl = document.getElementById('englishPriceDisplay');
  const featuresList = document.getElementById('englishFeaturesList');
  const waBtn = document.getElementById('englishWhatsAppBtn');

  levelBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const level = btn.getAttribute('data-eng-level');
      if (!englishData[level]) return;

      levelBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const data = englishData[level];
      if (titleEl) titleEl.textContent = data.title;
      if (timingEl) timingEl.innerHTML = `<i class="fa-regular fa-clock"></i> ${data.timing}`;
      if (priceEl) {
        priceEl.setAttribute('data-price-key', data.priceKey);
        priceEl.textContent = isAnnual ? data.annual : data.monthly;
      }
        if (featuresList) {
          featuresList.innerHTML = data.features.map(f => `
            <li><span class="check-icon"><i class="fa-solid fa-check"></i></span> ${window.escapeHtml ? window.escapeHtml(f) : f}</li>
          `).join('');
        }
      if (waBtn) {
        waBtn.href = `https://wa.me/917369891858?text=${encodeURIComponent(data.waText)}`;
      }
    });
  });
}

function filterBatchCards(selectedClass, cards) {
  const englishShowcase = document.getElementById('specialEnglishShowcase');

  cards.forEach(card => {
    const cardClass = card.getAttribute('data-class') || '';
    const cardCategory = card.getAttribute('data-category') || '';
    
    let isMatch = false;
    if (selectedClass === 'all') {
      isMatch = true;
    } else if (selectedClass === 'senior') {
      isMatch = cardCategory.includes('senior') || cardClass.includes('12') || cardClass.includes('11');
    } else if (selectedClass === 'high') {
      isMatch = cardCategory.includes('high') || cardClass.includes('10') || cardClass.includes('9');
    } else if (selectedClass === 'middle') {
      isMatch = cardCategory.includes('middle') || cardClass.includes('8') || cardClass.includes('67');
    } else if (selectedClass === 'junior') {
      isMatch = cardCategory.includes('junior') || cardClass.includes('15') || cardClass.includes('junior');
    } else if (selectedClass === 'english') {
      isMatch = false;
    }

    if (isMatch) {
      card.style.display = 'flex';
      card.style.animation = 'countUpFade 0.3s ease forwards';
    } else {
      card.style.display = 'none';
    }
  });

  if (englishShowcase) {
    if (selectedClass === 'english') {
      englishShowcase.style.display = 'block';
      englishShowcase.style.animation = 'countUpFade 0.35s ease forwards';
      englishShowcase.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else if (selectedClass === 'all') {
      englishShowcase.style.display = 'block';
    } else {
      englishShowcase.style.display = 'none';
    }
  }
}

function updatePrices() {
  const priceElements = document.querySelectorAll('[data-price-key]');
  priceElements.forEach(el => {
    const key = el.getAttribute('data-price-key');
    if (batchData[key]) {
      const priceText = isAnnual ? batchData[key].annual : batchData[key].monthly;
      const periodText = isAnnual ? '/ year (save 5%)' : '/ month';
      
      el.textContent = priceText;
      const periodEl = el.nextElementSibling;
      if (periodEl && periodEl.classList.contains('batch-period')) {
        periodEl.textContent = periodText;
      }
    }
  });
}
