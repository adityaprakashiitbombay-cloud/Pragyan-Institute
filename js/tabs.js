/* Batches & Pricing Interactive Tabs */

const batchData = {
  junior: {
    monthly: '₹700',
    annual: '₹7,980',
    timing: 'Afternoon: 2:30 PM – 4:30 PM',
    waText: 'Hello Pragyan Institute, I am interested in Junior Foundation batch admissions in Lalganj.'
  },
  class8: {
    monthly: '₹800',
    annual: '₹9,120',
    timing: 'Morning: 7:00 AM – 8:30 AM',
    waText: 'Hello Pragyan Institute, I am interested in Class 8th batch admissions in Lalganj.'
  },
  class9: {
    monthly: '₹1,000',
    annual: '₹11,400',
    timing: 'Evening: 4:30 PM – 6:30 PM',
    waText: 'Hello Pragyan Institute, I am interested in Class 9th batch admissions in Lalganj.'
  },
  class10: {
    monthly: '₹1,000',
    annual: '₹11,400',
    timing: 'Morning: 6:30 AM – 8:30 AM (Includes Board Test Series)',
    waText: 'Hello Pragyan Institute, I am interested in Class 10th Board Exam batch admissions in Lalganj.'
  }
};

let isAnnual = false;
let currentClass = 'all';

export function initTabs() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const toggleSwitch = document.querySelector('.toggle-switch');
  const batchCards = document.querySelectorAll('.batch-card');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      currentClass = btn.getAttribute('data-class');
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
}

function filterBatchCards(selectedClass, cards) {
  cards.forEach(card => {
    const cardClass = card.getAttribute('data-class');
    if (selectedClass === 'all' || cardClass === selectedClass) {
      card.style.display = 'flex';
      card.style.animation = 'countUpFade 0.4s ease forwards';
    } else {
      card.style.display = 'none';
    }
  });
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
