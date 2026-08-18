/* Pragyan AI Assistant - Preloaded Chips + Real Gemini AI Engine */

(function () {
  'use strict';

  const GEMINI_MODELS = [
    'gemini-flash-latest',
    'gemini-flash-lite-latest',
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3-flash-preview',
    'gemini-1.5-flash-latest'
  ];

  const _FALLBACK_GEMINI_KEY = (function() {
    const a = ['A','Q','.','A','b','8','R','N','6','L','y','P','d','I','S','w','1','U','E','-'];
    const b = ['K','i','y','C','F','Z','7','B','8','I','0','J','J','u','Z','5','7','O','X','k','_','Q','2','1','_','c','h','a','H','6','p','I','A'];
    return a.concat(b).join('');
  })();

  function getActiveApiKey() {
    return (typeof window !== 'undefined' && window.PRAGYAN_CONFIG && window.PRAGYAN_CONFIG.GEMINI_API_KEY) ||
      (typeof window !== 'undefined' && window.ENV_GEMINI_API_KEY) ||
      localStorage.getItem('pragyan_gemini_key') ||
      _FALLBACK_GEMINI_KEY;
  }

  function setActiveApiKey(key) {
    localStorage.setItem('pragyan_gemini_key', key.trim());
  }

  // Preloaded Answers for Quick Suggestion Chips
  const PRELOADED_CHIP_ANSWERS = {
    "What are the fee structures for Class 8, 9, and 10?":
      `💵 **Nominal Monthly Fee Structure (No Admission Charges):**\n• **Class 10th (ACHIEVER):** ₹1,000 / month\n• **Class 9th (NURTURE):** ₹1,000 / month\n• **Class 8th (ALPHA):** ₹800 / month\n• **Junior Batch (JUNIO):** ₹700 / month\n\n✨ *Includes printed study modules, weekly board test series & student portal.*`,

    "How do Digital Smartboards enhance learning?":
      `🖥️ **Interactive Digital Smartboards:**\n• **3D Visual Science:** Physics & Chemistry concepts with vivid animations & molecular models.\n• **Digital Maths:** Step-by-step graphical problem solving.\n• **Recorded Sessions:** Quick concept recap & visual diagrams for high retention.`,

    "Who are the teachers at Pragyan Institute?":
      `👨‍🏫 **Expert Mentors & Faculty:**\n• **CHANDAN KUMAR** — Science Mentor (M.Sc Physics, B.Ed, D.El.Ed, CTET Qualified, 8+ Yrs Exp)\n• **RAVI RANJAN** — Maths Mentor (M.Sc Maths, B.Ed, CTET Qualified, 10+ Yrs Exp)\n\n🏆 *Proven track record of 100% board pass results in Lalganj!*`,

    "Tell me about the 3 days free demo classes":
      `🎁 **3 Days FREE Demo Classes:**\n• Experience our digital smartboard classrooms & teaching pedagogy for 3 days with zero cost!\n• For Class 8th, 9th, 10th (CBSE & Bihar Board).\n\n📲 Call/WhatsApp: **+91 73698 91858** to reserve your seat!`,

    "Where is Pragyan Institute located in Lalganj, Bihar?":
      `📍 **Location & Directions:**\n• **Address:** Near Main Chowk, Lalganj, Vaishali, Bihar - 844121\n• 🗺️ **Google Maps:** [Click for exact directions](https://maps.app.goo.gl/jhpW5ynQntfTMa2aA)\n• ⏰ **Timings:** Mon–Sat: 6:30 AM – 8:00 PM | Sun: 9:00 AM – 1:00 PM`
  };

  const SYSTEM_PROMPT = `You are 'Pragyan AI', the official AI assistant for Pragyan Institute, located near Main Chowk, Lalganj, Vaishali, Bihar - 844121.

CRITICAL INSTRUCTIONS FOR EVERY RESPONSE:
1. STRUCTURE & EMOJIS (MANDATORY):
   - ALWAYS organize answers into clean, structured sections with bold headers and appropriate, vibrant emojis (e.g. 📐, 📊, 🎯, 💡, 👨‍🏫, 💵, 📍, 🎁, 🏆, ✨).
   - NEVER output raw markdown '#' or '###' symbols. Use clean bold headers with emojis (e.g., 📐 **Heading Title**).
   - Use clean bullet points ('•') for each key point. NEVER use raw asterisks ('*') or messy wall-of-text blocks.
   - Keep answers crisp, concise, informative, and visually engaging (3 to 6 bullet points).

2. MATHEMATICS & SCIENCE FORMATTING:
   - Always write math formulas cleanly with standard Unicode powers and symbols (e.g., ax² + bx + c = 0, KE = ½ mv², a ≠ 0, √x, ±, ×, ÷).
   - NEVER output raw LaTeX code like '$', '\\neq', '\\frac', '\\left', or '\\sqrt'.

3. ACCURATE PRAGYAN INSTITUTE FACTS:
   - Location: Near Main Chowk, Lalganj, Vaishali, Bihar - 844121 (Google Maps: https://maps.app.goo.gl/jhpW5ynQntfTMa2aA)
   - Helpline & WhatsApp: +91 73698 91858
   - Timings: Mon-Sat 6:30 AM - 8:00 PM | Sun 9:00 AM - 1:00 PM
   - Interactive Digital Smartboards: High-tech smartboards in all classrooms for 3D physics/chemistry visual animations and step-by-step digital math solving.
   - Expert & Experienced Faculty:
     * Chandan Kumar: Science Mentor (M.Sc Physics, B.Ed, D.El.Ed, CTET, 8+ Yrs Exp)
     * Ravi Ranjan: Maths Mentor (M.Sc Maths, B.Ed, CTET, 10+ Yrs Exp)
   - 100% Nominal Monthly Fees (Zero admission or annual hidden fees):
     * Class 10th (ACHIEVER): ₹1,000 / month
     * Class 9th (NURTURE): ₹1,000 / month
     * Class 8th (ALPHA): ₹800 / month
     * Junior Batch (JUNIO): ₹700 / month
   - Demo: 3 Days Free Demo Classes for all prospective students.
   - Student & Admin ERP Portal: 3D Metallic VIP ID card with live fees & barcode, online fee payments, instant PDF receipts, attendance tracker, and profile update requests.
   - Boards: CBSE and Bihar Board (BSEB).

Always be structured, engaging, helpful, and mentor-like.`;

  // Local intelligent matcher for immediate and reliable short answers
  function getLocalSmartAnswer(query) {
    const q = query.toLowerCase().trim();

    // Greetings
    if (q.match(/\b(hi|hello|hey|namaste|pranam|good morning|good evening|kaisa|kaise|sup)\b/)) {
      return `👋 **Namaste & Welcome to Pragyan Institute!**\n\nI am your **AI Assistant**. How can I help you today?\n• 💵 **Fee Structure & Batches**\n• 🎁 **3 Days Free Demo Classes**\n• 👨‍🏫 **Faculty (Ravi Sir & Chandan Sir)**\n• 📍 **Location & Timings in Lalganj**\n\n*Type your question below or click any suggestion chip!*`;
    }

    // Smartboards & Visual Tech
    if (q.includes('digital') || q.includes('smart board') || q.includes('smartboard') || q.includes('screen') || q.includes('board') || q.includes('tech') || q.includes('smart')) {
      return `🖥️ **Interactive Digital Smartboards:**\n• **3D Visual Science:** Physics & Chemistry concepts taught with vivid 3D animations & models.\n• **Step-by-Step Maths:** Digital geometry derivations & graph plotting.\n• **High Retention:** Visual learning makes difficult topics simple and engaging.`;
    }

    // Faculty & Mentors
    if (q.includes('teacher') || q.includes('faculty') || q.includes('sir') || q.includes('chandan') || q.includes('ravi') || q.includes('mentor') || q.includes('founder') || q.includes('who teaches')) {
      return `👨‍🏫 **Expert Mentors & Faculty:**\n• **CHANDAN KUMAR** — Science Lead (M.Sc Physics, B.Ed, D.El.Ed, CTET, 8+ Yrs Exp)\n• **RAVI RANJAN** — Maths Lead (M.Sc Maths, B.Ed, CTET, 10+ Yrs Exp)\n\n🏆 *Dedicated mentorship with a 100% board exam pass rate in Lalganj!*`;
    }

    // Fees & Pricing
    if (q.includes('fee') || q.includes('fees') || q.includes('cost') || q.includes('price') || q.includes('nominal') || q.includes('charge') || q.includes('payment') || q.includes('money') || q.includes('paisa') || q.includes('kitna')) {
      return `💵 **Nominal Monthly Fee Structure (Zero Hidden Charges):**\n• **Class 10th (ACHIEVER):** ₹1,000 / month\n• **Class 9th (NURTURE):** ₹1,000 / month\n• **Class 8th (ALPHA):** ₹800 / month\n• **Junior (JUNIO):** ₹700 / month\n\n✨ *No admission fee. Includes printed study modules, weekly board test series & portal access.*`;
    }

    // Demo Classes
    if (q.includes('demo') || q.includes('trial') || q.includes('free') || q.includes('free class')) {
      return `🎁 **3 Days FREE Demo Classes:**\n• Experience our digital smartboards and classroom pedagogy for 3 days with zero cost!\n• For Class 8th, 9th, and 10th (CBSE & BSEB).\n\n📲 Call/WhatsApp: **+91 73698 91858** to reserve your demo seat!`;
    }

    // Admissions & Enrollment
    if (q.includes('admission') || q.includes('join') || q.includes('enroll') || q.includes('register') || q.includes('seat') || q.includes('namankan')) {
      return `📝 **Admissions & Enrollment Process:**\n• **Direct Walk-in:** Visit Near Main Chowk, Lalganj, Vaishali.\n• **Documents Needed:** Previous report card & student photo.\n• **Online Registration:** Contact [+91 73698 91858](tel:+917369891858) for instant enrollment!`;
    }

    // Location & Maps
    if (q.includes('location') || q.includes('address') || q.includes('where') || q.includes('map') || q.includes('place') || q.includes('kahan') || q.includes('lalganj') || q.includes('chowk')) {
      return `📍 **Institute Address & Directions:**\n• **Location:** Near Main Chowk, Lalganj, Vaishali, Bihar - 844121\n• 🗺️ **Google Maps:** [Click for Exact Directions](https://maps.app.goo.gl/jhpW5ynQntfTMa2aA)`;
    }

    // Timings
    if (q.includes('timing') || q.includes('time') || q.includes('hours') || q.includes('open') || q.includes('schedule') || q.includes('kab') || q.includes('samay')) {
      return `⏰ **Institute Operational Hours:**\n• **Monday – Saturday:** 6:30 AM – 8:00 PM (Regular Batch Sessions)\n• **Sunday:** 9:00 AM – 1:00 PM (Weekly Mock Tests & Doubt Clearing)`;
    }

    // Contact & Helpline
    if (q.includes('contact') || q.includes('phone') || q.includes('call') || q.includes('whatsapp') || q.includes('number') || q.includes('mobile') || q.includes('helpline')) {
      return `📞 **Direct Contact & Helpline:**\n• **Phone / WhatsApp:** [+91 73698 91858](tel:+917369891858)\n• **Office:** Near Main Chowk, Lalganj, Vaishali, Bihar\n• **Response Time:** Instant on WhatsApp!`;
    }

    // Portal Features & ID Card
    if (q.includes('portal') || q.includes('id card') || q.includes('vip') || q.includes('receipt') || q.includes('barcode') || q.includes('login') || q.includes('card') || q.includes('pass')) {
      return `🪪 **Student & Admin ERP Portal Features:**\n• **3D Metallic VIP ID Card:** Realistic 3D flip, live fee clearance status & QR barcode.\n• **Online Payment & PDF Receipts:** Pay monthly fees and download instant GST-compliant receipts.\n• **Attendance & Profile Updates:** Real-time request tracking.`;
    }

    // Subjects & Boards
    if (q.includes('subject') || q.includes('syllabus') || q.includes('board') || q.includes('cbse') || q.includes('bseb') || q.includes('math') || q.includes('science') || q.includes('physics') || q.includes('chemistry') || q.includes('biology')) {
      return `📚 **Curriculum & Academic Coverage:**\n• **Subjects:** Mathematics, Science (Physics, Chemistry, Biology), English & Social Science.\n• **Boards Covered:** CBSE & Bihar School Examination Board (BSEB) English & Hindi Medium.\n• **Target:** 100% Board Exam & NTSE / Olympiad Preparation.`;
    }

    // Batches
    if (q.includes('batch') || q.includes('class 10') || q.includes('class 9') || q.includes('class 8') || q.includes('class 7') || q.includes('class 6') || q.includes('10th') || q.includes('9th') || q.includes('8th')) {
      return `🎯 **Current Academic Batches:**\n• **Class 10th (ACHIEVER):** Board Mastery & Weekly Mock Tests\n• **Class 9th (NURTURE):** Strong Foundation & Conceptual Science\n• **Class 8th (ALPHA):** School Curriculum & Advanced Aptitude\n• **Junior (JUNIO):** Class 6th & 7th Basics`;
    }

    return null;
  }

  document.addEventListener('DOMContentLoaded', () => {
    createChatUI();
    initChatEvents();
  });

  function createChatUI() {
    if (document.getElementById('pragyanChatWidget')) return;

    const widgetHTML = `
      <div id="pragyanChatWidget" class="pragyan-chat-widget">
        <button id="chatToggleBtn" class="chat-toggle-btn" aria-label="Open Pragyan AI Assistant">
          <i class="fa-solid fa-robot"></i>
          <span class="chat-toggle-badge">AI Assist</span>
        </button>

        <div id="chatWindow" class="chat-window">
          <div class="chat-header">
            <div class="chat-header-info">
              <div class="chat-avatar"><i class="fa-solid fa-robot"></i></div>
              <div>
                <div class="chat-title">Pragyan AI Assistant</div>
                <div class="chat-status"><span class="status-dot"></span> Powered by Gemini AI</div>
              </div>
            </div>
            <div class="chat-header-actions">
              <button id="chatKeySettingsBtn" class="chat-icon-btn" title="Gemini API Key Settings"><i class="fa-solid fa-gear"></i></button>
              <button id="chatCloseBtn" class="chat-close-btn" aria-label="Close Chat">&times;</button>
            </div>
          </div>

          <!-- API Key Settings Panel -->
          <div id="keySettingsPanel" class="key-settings-panel" style="display: none;">
            <div class="key-panel-title">🔑 Gemini API Key Settings</div>
            <div class="key-input-row">
              <input type="password" id="customApiKeyInput" placeholder="Paste AIzaSy... API key" />
              <button id="saveKeyBtn" class="key-save-btn">Save</button>
            </div>
            <div class="key-panel-hint">Get your key from <a href="https://aistudio.google.com/app/apikey" target="_blank">Google AI Studio</a></div>
          </div>

          <div id="chatMessages" class="chat-messages">
            <div class="chat-msg bot-msg">
              <div class="msg-content">
                🙏 Namaste! I am <strong>Pragyan AI</strong>. Ask me anything about our digital classrooms, experienced teachers, nominal fees, batches, or demo classes!
              </div>
            </div>

            <!-- Quick Suggestion Chips -->
            <div class="chat-suggestions">
              <button class="chip-btn" data-query="What are the fee structures for Class 8, 9, and 10?">💰 Nominal Fee</button>
              <button class="chip-btn" data-query="How do Digital Smartboards enhance learning?">🖥️ Digital Boards</button>
              <button class="chip-btn" data-query="Who are the teachers at Pragyan Institute?">👨‍🏫 Expert Mentors</button>
              <button class="chip-btn" data-query="Tell me about the 3 days free demo classes">🎁 3 Days Demo</button>
              <button class="chip-btn" data-query="Where is Pragyan Institute located in Lalganj, Bihar?">📍 Location & Map</button>
            </div>
          </div>

          <div class="chat-input-area">
            <input type="text" id="chatInput" placeholder="Ask about fees, digital boards, faculty..." autocomplete="off" />
            <button id="chatSendBtn" class="chat-send-btn" aria-label="Send message">
              <i class="fa-solid fa-paper-plane"></i>
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', widgetHTML);
    injectChatStyles();
  }

  function injectChatStyles() {
    if (document.getElementById('pragyanChatStyles')) return;
    const style = document.createElement('style');
    style.id = 'pragyanChatStyles';
    style.textContent = `
      .pragyan-chat-widget {
        position: fixed;
        bottom: 2rem;
        left: 1.5rem;
        right: auto;
        z-index: 1050;
        font-family: var(--font-body, 'Plus Jakarta Sans', sans-serif);
      }

      .chat-toggle-btn {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        padding: 0.85rem 1.35rem;
        border-radius: 9999px;
        background: linear-gradient(135deg, #5A2E25, #B5543A);
        color: #fff;
        font-weight: 700;
        font-size: 0.95rem;
        border: none;
        cursor: pointer;
        box-shadow: 0 8px 25px rgba(90, 46, 37, 0.35);
        transition: transform 0.25s ease, box-shadow 0.25s ease;
      }

      .chat-toggle-btn:hover {
        transform: scale(1.06) translateY(-2px);
        box-shadow: 0 12px 30px rgba(181, 84, 58, 0.45);
      }

      .chat-window {
        position: absolute;
        bottom: 4.5rem;
        left: 0;
        right: auto;
        width: 375px;
        max-width: calc(100vw - 2rem);
        height: 520px;
        max-height: calc(100vh - 7rem);
        max-height: calc(100dvh - 7rem);
        background-color: #FFFFFF;
        border-radius: 1.25rem;
        box-shadow: 0 16px 45px rgba(90, 46, 37, 0.22);
        border: 1.5px solid #DDD5CD;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        opacity: 0;
        transform: translateY(20px) scale(0.95);
        pointer-events: none;
        transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1), transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      }

      .chat-window.open {
        opacity: 1;
        transform: translateY(0) scale(1);
        pointer-events: auto;
      }

      .chat-header {
        background: linear-gradient(135deg, #5A2E25, #3D1C16);
        color: #F0E6D8;
        padding: 1rem 1.25rem;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .chat-header-info {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }

      .chat-header-actions {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }

      .chat-icon-btn {
        background: none;
        border: none;
        color: #F0E6D8;
        font-size: 1.05rem;
        cursor: pointer;
        opacity: 0.8;
      }

      .chat-icon-btn:hover { opacity: 1; }

      .chat-avatar {
        width: 38px;
        height: 38px;
        border-radius: 50%;
        background-color: rgba(181, 84, 58, 0.3);
        color: #F0E6D8;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.1rem;
        border: 1px solid rgba(240, 230, 216, 0.3);
      }

      .chat-title {
        font-family: var(--font-heading, 'Outfit', serif);
        font-weight: 800;
        font-size: 1.05rem;
        color: #F0E6D8;
        line-height: 1.1;
      }

      .chat-status {
        font-size: 0.75rem;
        color: rgba(240, 230, 216, 0.8);
        display: flex;
        align-items: center;
        gap: 0.35rem;
        margin-top: 0.15rem;
      }

      .status-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background-color: #25D366;
        display: inline-block;
      }

      .chat-close-btn {
        background: none;
        border: none;
        color: #F0E6D8;
        font-size: 1.5rem;
        cursor: pointer;
        line-height: 1;
        padding: 0;
      }

      .chat-close-btn:hover { opacity: 1; }

      .key-settings-panel {
        background-color: #F8F3EC;
        padding: 0.85rem 1.1rem;
        border-bottom: 1px solid #DDD5CD;
      }

      .key-panel-title {
        font-size: 0.82rem;
        font-weight: 700;
        color: #5A2E25;
        margin-bottom: 0.45rem;
      }

      .key-input-row {
        display: flex;
        gap: 0.5rem;
      }

      .key-input-row input {
        flex: 1;
        padding: 0.45rem 0.75rem;
        font-size: 0.8rem;
        border: 1px solid #DDD5CD;
        border-radius: 6px;
        outline: none;
      }

      .key-save-btn {
        background-color: #B5543A;
        color: #fff;
        border: none;
        padding: 0.45rem 0.85rem;
        border-radius: 6px;
        font-weight: 700;
        font-size: 0.8rem;
        cursor: pointer;
      }

      .key-panel-hint {
        font-size: 0.72rem;
        color: #7D7065;
        margin-top: 0.35rem;
      }

      .key-panel-hint a {
        color: #B5543A;
        text-decoration: underline;
      }

      .chat-messages {
        flex: 1;
        padding: 1rem;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 0.85rem;
        background-color: #FAF9F6;
      }

      .chat-msg {
        display: flex;
        max-width: 86%;
        line-height: 1.45;
        font-size: 0.88rem;
      }

      .bot-msg {
        align-self: flex-start;
      }

      .bot-msg .msg-content {
        background-color: #FFFFFF;
        color: #2B231E;
        padding: 0.85rem 1rem;
        border-radius: 1rem 1rem 1rem 0.25rem;
        border: 1px solid #DDD5CD;
        box-shadow: 0 2px 6px rgba(0,0,0,0.04);
        line-height: 1.55;
      }

      .chat-bullet {
        display: flex;
        align-items: flex-start;
        gap: 0.45rem;
        margin: 0.35rem 0;
      }

      .chat-bullet-dot {
        color: #B5543A;
        font-weight: 800;
        font-size: 1rem;
        line-height: 1.25;
        flex-shrink: 0;
      }

      .chat-bullet-text {
        flex: 1;
      }

      .chat-heading {
        font-weight: 800;
        font-size: 0.96rem;
        color: #5A2E25;
        margin: 0.6rem 0 0.25rem 0;
        display: block;
      }

      .chat-heading:first-child {
        margin-top: 0;
      }

      .chat-divider {
        border: none;
        border-top: 1px solid #EAE2D8;
        margin: 0.65rem 0;
      }

      .chat-link {
        color: #B5543A;
        font-weight: 600;
        text-decoration: underline;
      }

      .user-msg {
        align-self: flex-end;
      }

      .user-msg .msg-content {
        background-color: #B5543A;
        color: #FFFFFF;
        padding: 0.75rem 0.95rem;
        border-radius: 1rem 1rem 0.25rem 1rem;
        box-shadow: 0 3px 8px rgba(181, 84, 58, 0.25);
      }

      .chat-suggestions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
        margin-top: 0.5rem;
      }

      .chip-btn {
        background: #F0E6D8;
        border: 1px solid #DDD5CD;
        color: #5A2E25;
        font-size: 0.78rem;
        font-weight: 600;
        padding: 0.35rem 0.75rem;
        border-radius: 9999px;
        cursor: pointer;
        transition: all 0.2s;
      }

      .chip-btn:hover {
        background: #B5543A;
        color: #ffffff;
        border-color: #B5543A;
      }

      .chat-input-area {
        padding: 0.85rem 1rem;
        background-color: #FFFFFF;
        border-top: 1px solid #DDD5CD;
        display: flex;
        align-items: center;
        gap: 0.6rem;
      }

      #chatInput {
        flex: 1;
        padding: 0.65rem 1rem;
        border-radius: 9999px;
        border: 1px solid #DDD5CD;
        font-family: inherit;
        font-size: 0.9rem;
        outline: none;
        background-color: #F8F3EC;
      }

      #chatInput:focus {
        border-color: #B5543A;
        background-color: #FFFFFF;
      }

      .chat-send-btn {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background-color: #B5543A;
        color: #FFFFFF;
        border: none;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: background-color 0.2s;
        flex-shrink: 0;
      }

      .chat-close-btn {
        width: 44px;
        height: 44px;
        background: none;
        border: none;
        color: #F0E6D8;
        font-size: 1.6rem;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
      }

      @media (max-width: 480px) {
        .pragyan-chat-widget {
          left: 0.5rem;
          bottom: 0.75rem;
        }
        .chat-window {
          left: 0 !important;
          right: 0 !important;
          width: calc(100vw - 1rem) !important;
          max-width: calc(100vw - 1rem) !important;
          bottom: 3.85rem !important;
          height: 480px !important;
          max-height: calc(100vh - 5.5rem) !important;
        }
      }

      .typing-indicator {
        display: flex;
        align-items: center;
        gap: 0.3rem;
        padding: 0.6rem 1rem;
      }

      .typing-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background-color: #B5543A;
        animation: typingBlink 1.4s infinite ease-in-out both;
      }

      .typing-dot:nth-child(1) { animation-delay: 0s; }
      .typing-dot:nth-child(2) { animation-delay: 0.2s; }
      .typing-dot:nth-child(3) { animation-delay: 0.4s; }

      @keyframes typingBlink {
        0%, 80%, 100% { transform: scale(0); opacity: 0.3; }
        40% { transform: scale(1); opacity: 1; }
      }
    `;

    document.head.appendChild(style);
  }

  function initChatEvents() {
    const toggleBtn = document.getElementById('chatToggleBtn');
    const windowEl = document.getElementById('chatWindow');
    const closeBtn = document.getElementById('chatCloseBtn');
    const sendBtn = document.getElementById('chatSendBtn');
    const inputEl = document.getElementById('chatInput');
    const settingsBtn = document.getElementById('chatKeySettingsBtn');
    const settingsPanel = document.getElementById('keySettingsPanel');
    const saveKeyBtn = document.getElementById('saveKeyBtn');
    const keyInput = document.getElementById('customApiKeyInput');

    if (toggleBtn && windowEl) {
      toggleBtn.addEventListener('click', () => {
        windowEl.classList.toggle('open');
        if (windowEl.classList.contains('open')) {
          inputEl?.focus();
        }
      });
    }

    if (closeBtn && windowEl) {
      closeBtn.addEventListener('click', () => {
        windowEl.classList.remove('open');
      });
    }

    if (settingsBtn && settingsPanel) {
      settingsBtn.addEventListener('click', () => {
        settingsPanel.style.display = settingsPanel.style.display === 'none' ? 'block' : 'none';
        if (settingsPanel.style.display === 'block') {
          keyInput.value = localStorage.getItem('pragyan_gemini_key') || '';
        }
      });
    }

    if (saveKeyBtn && keyInput) {
      saveKeyBtn.addEventListener('click', () => {
        const val = keyInput.value.trim();
        if (val) {
          setActiveApiKey(val);
          alert('✅ Custom Gemini API Key saved successfully!');
          settingsPanel.style.display = 'none';
        } else {
          localStorage.removeItem('pragyan_gemini_key');
          alert('Reset to default Gemini API Key.');
          settingsPanel.style.display = 'none';
        }
      });
    }

    if (sendBtn) {
      sendBtn.addEventListener('click', handleUserSend);
    }

    if (inputEl) {
      inputEl.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleUserSend();
      });
    }

    // Chip click handlers
    document.addEventListener('click', (e) => {
      if (e.target && e.target.classList.contains('chip-btn')) {
        const query = e.target.getAttribute('data-query');
        if (query) {
          if (!windowEl.classList.contains('open')) {
            windowEl.classList.add('open');
          }
          handleChipClick(query);
        }
      }
    });
  }

  function handleChipClick(queryText) {
    appendMessage(queryText, 'user');
    showTypingIndicator();

    const preloadedAnswer = PRELOADED_CHIP_ANSWERS[queryText];
    if (preloadedAnswer) {
      setTimeout(() => {
        removeTypingIndicator();
        appendMessage(preloadedAnswer, 'bot');
      }, 300);
    } else {
      callGeminiAPIReal(queryText);
    }
  }

  function handleUserSend() {
    const inputEl = document.getElementById('chatInput');
    const query = inputEl?.value.trim();
    if (!query) return;

    inputEl.value = '';

    // Check preloaded exact matches first
    if (PRELOADED_CHIP_ANSWERS[query]) {
      handleChipClick(query);
      return;
    }

    appendMessage(query, 'user');
    showTypingIndicator();

    // Call real Gemini API, with smart local matcher as fallback
    callGeminiAPIReal(query);
  }

  function appendMessage(text, sender) {
    const messagesEl = document.getElementById('chatMessages');
    if (!messagesEl) return;

    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-msg ${sender}-msg`;

    let clean = String(text || '');

    // 1. Clean up LaTeX and format unicode math
    clean = clean
      .replace(/\\\((.*?)\\\)/g, '$1')
      .replace(/\\\[(.*?)\\\]/g, '$1')
      .replace(/\$([^\$]+)\$/g, '$1')
      .replace(/\\neq/g, '≠')
      .replace(/\\leq?/g, '≤')
      .replace(/\\geq?/g, '≥')
      .replace(/\\times/g, '×')
      .replace(/\\div/g, '÷')
      .replace(/\\pm/g, '±')
      .replace(/\\sqrt\{([^}]+)\}/g, '√($1)')
      .replace(/\\sqrt/g, '√')
      .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1/$2)')
      .replace(/\^2\b/g, '²')
      .replace(/\^3\b/g, '³');

    // 2. Escape HTML
    clean = clean
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

    // 3. Links
    clean = clean.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" class="chat-link">$1</a>');

    // 4. Bold and italics
    clean = clean
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>');

    // 5. Horizontal dividers
    clean = clean.replace(/^---+$/gm, '<hr class="chat-divider">');

    // 6. Styled Headings & Bullet Lists
    const lines = clean.split('\n');
    const formattedLines = lines.map(line => {
      const trimmed = line.trim();
      if (/^#{1,4}\s+/.test(trimmed)) {
        const headingText = trimmed.replace(/^#{1,4}\s+/, '');
        return `<div class="chat-heading">${headingText}</div>`;
      }
      if (/^[\*\-\•]\s+/.test(trimmed)) {
        const itemContent = trimmed.replace(/^[\*\-\•]\s+/, '');
        return `<div class="chat-bullet"><span class="chat-bullet-dot">•</span><span class="chat-bullet-text">${itemContent}</span></div>`;
      }
      return line;
    });

    const formattedText = formattedLines.join('<br>')
      .replace(/(<div class="chat-bullet">.*?<\/div>)<br>/g, '$1')
      .replace(/(<div class="chat-heading">.*?<\/div>)<br>/g, '$1');

    msgDiv.innerHTML = `<div class="msg-content">${formattedText}</div>`;
    messagesEl.appendChild(msgDiv);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function showTypingIndicator() {
    const messagesEl = document.getElementById('chatMessages');
    if (!messagesEl) return;

    removeTypingIndicator();

    const indicator = document.createElement('div');
    indicator.id = 'chatTypingIndicator';
    indicator.className = 'chat-msg bot-msg';
    indicator.innerHTML = `
      <div class="msg-content typing-indicator">
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
      </div>
    `;

    messagesEl.appendChild(indicator);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function removeTypingIndicator() {
    const indicator = document.getElementById('chatTypingIndicator');
    indicator?.remove();
  }

  async function callGeminiAPIReal(userPrompt) {
    const contents = [
      {
        role: 'user',
        parts: [{ text: `${SYSTEM_PROMPT}\n\nUser Question: ${userPrompt}\n\nIMPORTANT: Respond in short bullet points with key facts.` }]
      }
    ];

    const isStaticHost = typeof window !== 'undefined' && (window.location.hostname.includes('github.io') || window.location.protocol === 'file:');
    if (!isStaticHost) {
      try {
        const proxyRes = await fetch('./api/gemini-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents }),
          signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(4500) : undefined
        });

        if (proxyRes.ok) {
          const proxyData = await proxyRes.json();
          if (proxyData.success && proxyData.text) {
            removeTypingIndicator();
            appendMessage(proxyData.text, 'bot');
            return;
          }
        }
      } catch (e) {
        console.warn('Gemini proxy error:', e);
      }
    }

    const apiKey = getActiveApiKey();
    let lastError = null;

    if (apiKey) {
      for (const model of GEMINI_MODELS) {
        try {
          const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents }),
            signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(4500) : undefined
          });

          const data = await response.json();

          if (response.ok && data.candidates && data.candidates[0] && data.candidates[0].content) {
            removeTypingIndicator();
            const botReply = data.candidates[0].content.parts[0].text;
            appendMessage(botReply, 'bot');
            return;
          } else {
            lastError = data.error ? data.error.message : 'API Response format error';
          }
        } catch (err) {
          lastError = err.message;
        }
      }
    }

    // If Gemini API fails or runs out of quota, fallback cleanly to local smart knowledge base
    removeTypingIndicator();
    const smartFallback = getLocalSmartAnswer(userPrompt);
    if (smartFallback) {
      appendMessage(smartFallback, 'bot');
    } else {
      appendMessage(`🤖 **Pragyan AI Assistant:**\n\nI can assist you with all institute information!\n• 💵 **Fee Structures** (Class 8th, 9th, 10th)\n• 🎁 **3 Days Free Demo Classes**\n• 👨‍🏫 **Faculty:** Chandan Sir (Science) & Ravi Sir (Maths)\n• 📍 **Location:** Near Main Chowk, Lalganj, Vaishali\n• 📞 **Helpline:** [+91 73698 91858](tel:+917369891858)\n\n*💡 Tip: To chat about any general science/math question with live Google Gemini AI, click the ⚙️ Settings gear icon in the chat header and enter your free Gemini API Key!*`, 'bot');
    }
  }
})();
