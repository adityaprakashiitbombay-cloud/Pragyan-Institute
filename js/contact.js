/* Contact Form & WhatsApp Intent Handlers */

export function initContact() {
  const contactForm = document.getElementById('inquiryForm');
  
  if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const name = document.getElementById('studentName')?.value.trim();
      const phone = document.getElementById('studentPhone')?.value.trim();
      const studentClass = document.getElementById('studentClass')?.value;
      const query = document.getElementById('studentQuery')?.value.trim();

      if (!name || !phone) {
        showNotification('Please provide your name and phone number.', 'error');
        return;
      }

      // Generate pre-filled WhatsApp message
      const text = `Hello Pragyan Institute, I would like to inquire about admissions in Lalganj.\n\n*Details:*\n• Name: ${name}\n• Class: ${studentClass}\n• Phone: ${phone}\n• Query: ${query || 'N/A'}`;
      const encodedText = encodeURIComponent(text);
      const whatsappUrl = `https://wa.me/917369891858?text=${encodedText}`;

      showNotification('Opening WhatsApp with your inquiry details...', 'success');
      
      setTimeout(() => {
        window.open(whatsappUrl, '_blank');
        contactForm.reset();
      }, 1000);
    });
  }
}

function showNotification(message, type = 'success') {
  let toast = document.getElementById('toastNotification');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toastNotification';
    toast.style.cssText = `
      position: fixed;
      bottom: 6rem;
      left: 50%;
      transform: translateX(-50%);
      padding: 0.85rem 1.75rem;
      border-radius: 9999px;
      font-weight: 700;
      font-size: 0.9rem;
      z-index: 2500;
      color: #fff;
      box-shadow: 0 8px 24px rgba(0,0,0,0.2);
      transition: all 0.3s ease;
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
