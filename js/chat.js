/* Pragyan AI Assistant - Multi-Turn Session Memory + Active Gemini 3.6/3.5/3.7 Engine */

(function () {
  'use strict';

  // Active Google Gemini Models in order of latency and performance
  const GEMINI_MODELS = [
    'gemini-3.6-flash',
    'gemini-3.5-flash-lite',
    'gemini-3-flash-preview',
    'gemini-3.7-flash'
  ];

  function getActiveApiKey() {
    const custom = (typeof localStorage !== 'undefined' && localStorage.getItem('pragyan_gemini_key')) ||
      (typeof window !== 'undefined' && window.PRAGYAN_CONFIG && window.PRAGYAN_CONFIG.GEMINI_API_KEY) ||
      (typeof window !== 'undefined' && window.ENV_GEMINI_API_KEY) ||
      '';
    if (custom) return custom;
    try {
      return (typeof atob === 'function') ? atob('QVEuQWI4Uk42TEFJZDdNOThWc3pIUWJzVW9VcGd4emYySjRtWGpScDJiODhqYnowZU9jZFE=') : '';
    } catch (_) {
      return '';
    }
  }

  function setActiveApiKey(key) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('pragyan_gemini_key', key.trim());
    }
  }

  // Multi-Turn Sliding Window Conversation Memory
  let chatSessionHistory = [];
  const MAX_HISTORY_MESSAGES = 20;

  // Preloaded Answers for Quick Suggestion Chips
  const PRELOADED_CHIP_ANSWERS = {
    "What are the fee structures for Class 8, 9, and 10?":
      `💵 **Nominal Monthly Fee Structure (Zero Hidden Charges):**\n• **Class 12th (PCM & PCB):** ₹1,500 / month\n• **Class 11th (PCM & PCB):** ₹1,500 / month\n• **Class 10th & 9th (Matric & Foundation):** ₹1,000 / month\n• **Class 8th (ALPHA):** ₹800 / month | **Class 6th & 7th:** ₹700 / month | **Class 1st to 5th:** ₹500 / month\n• **Special English by Aditi Singh:** 1st–5th (₹500), 6th–8th (₹700), 9th–12th (₹1,000)\n• **Annual Advance Scholarship:** 5% scholarship discount on full-year lump sum payment\n\n✨ *Includes printed study modules, Sunday board mock test series & digital smartboard access.*`,

    "How do Digital Smartboards enhance learning?":
      `🖥️ **Interactive Digital Smartboards & Visual Tech:**\n• **3D Animated Science:** Complex Physics & Chemistry concepts visualized with 3D molecular and mechanical models.\n• **Digital Maths Derivations:** Step-by-step graphical plotting and interactive geometry derivations.\n• **High Retention & Engagement:** Visual explanations make abstract board topics easy to understand.\n• **Recorded Concept Recaps:** Rapid revision before weekly mock tests.`,

    "Who are the teachers at Pragyan Institute?":
      `👨‍🏫 **Expert Mentors & Leadership Faculty:**\n• **CHANDAN KUMAR** — Science Lead & Sole Administrator (M.Sc Physics, B.Ed, D.El.Ed, CTET Qualified, 10+ Yrs Exp, **10,000+ Students Mentored**)\n• **PROF. RAVI RANJAN** — Mathematics Mentor (M.Sc Maths, B.Ed, CTET Qualified, 15+ Yrs Exp, **12,000+ Students Mentored**)\n• **ADITI SINGH** — English & Grammar Mentor (M.Com, 5+ Yrs Exp, **1,000+ Students Mentored**)\n\n🏆 *Proven track record of 100% board exam pass rates and top ranks across Lalganj & Vaishali!*`,

    "Tell me about the 3 days free demo classes":
      `🎁 **3 Days FREE Demo Classes:**\n• Experience our digital smartboards, concept-first pedagogy, and teaching excellence for 3 days with **zero cost and zero admission fee**!\n• Available for Class 1st to 12th and Special English Batches.\n\n📲 Call / WhatsApp: **[+91 73698 91858](tel:+917369891858)** to reserve your demo seat today!`,

    "Where is Pragyan Institute located in Lalganj, Bihar?":
      `📍 **Location & Directions:**\n• **Address:** At Moti Market, Near Jagdamba Sthan, Vaishali Bus Stand Road, Lalganj\n• 🗺️ **Google Maps:** [Click for exact directions](https://maps.app.goo.gl/jhpW5ynQntfTMa2aA)\n• ⏰ **Timings:** Mon–Sat: 6:30 AM – 8:00 PM | Sun: 9:00 AM – 1:00 PM`
  };

  const SYSTEM_PROMPT = `You are 'Pragyan AI', the official AI Academic Mentor for Pragyan Institute (Lalganj, Bihar) and a universal, all-round intelligent assistant.

CORE OBJECTIVE:
1. UNIVERSAL GENERAL PURPOSE & ACADEMIC SUPPORT: You are NOT restricted to only institute questions. You answer ANY general purpose questions, science, mathematics, animals, biology, history, literature, coding, general facts, and everyday inquiries (e.g. "what is a dog", "explain photosynthesis", "how does gravity work", "what is machine learning", etc.).
2. INSTITUTIONAL QUERIES: For Pragyan Institute questions, provide accurate details regarding faculty, fees, digital smartboards, demo classes, and location.

STRICT ANSWER FORMATTING & LENGTH RULES:
1. CONCISE & STRUCTURED (EXACTLY 3 TO 4 BULLET POINTS):
   - Every answer must be structured with crisp, clean bullet points ('•') or numbered points ('1.', '2.', '3.', '4.').
   - Provide EXACTLY 3 TO 4 clear, punchy bullet points. Avoid lengthy essays or walls of text.
   - Use bold emoji headers for each bullet point to make it visually engaging (e.g. 🐾 **Species & Nature**, 🧠 **Key Attributes**, 💡 **Importance**).
   - NEVER output raw markdown '#' or '###' header tags.

2. ACCURATE PRAGYAN INSTITUTE FACTS & ACADEMIC STRUCTURE:
   - Location: At Moti Market, Near Jagdamba Sthan, Vaishali Bus Stand Road, Lalganj (Google Maps: https://maps.app.goo.gl/jhpW5ynQntfTMa2aA)
   - Helpline & WhatsApp: +91 73698 91858
   - Timings: Mon-Sat 6:30 AM - 8:00 PM | Sun 9:00 AM - 1:00 PM
   - Interactive Digital Smartboards: High-tech smartboards in all classrooms for 3D physics/chemistry visual animations and step-by-step digital math solving.
   - Sole Administrator & Expert Faculty:
     * Chandan Kumar: Science Lead & Sole Administrator (M.Sc Physics, B.Ed, D.El.Ed, CTET, 10+ Yrs Exp, 10,000+ Students Mentored)
     * Prof. Ravi Ranjan: Higher Mathematics Lead (M.Sc Maths, B.Ed, CTET, 15+ Yrs Exp, 12,000+ Students Mentored)
     * Aditi Singh: English & Grammar Mentor (M.Com, 5+ Yrs Exp, 1,000+ Students Mentored)
   - Master 12 Canonical Batches & Nominal Monthly Fees:
     * Class 12th PCM: ₹1,500 / month
     * Class 12th PCB: ₹1,500 / month
     * Class 11th PCM: ₹1,500 / month
     * Class 11th PCB: ₹1,500 / month
     * Class 10th (ACHIEVER / Matric Board): ₹1,000 / month
     * Class 9th (NURTURE / Foundation): ₹1,000 / month
     * Class 8th (ALPHA / Middle School): ₹800 / month
     * Class 6th & 7th (PIONEER Foundation): ₹700 / month
     * Class 1st to 5th (Junior Foundation): ₹500 / month
     * Special English (Class 9th to 12th) by Aditi Singh: ₹1,000 / month
     * Special English (Class 6th to 8th) by Aditi Singh: ₹700 / month
     * Special English (Class 1st to 5th) by Aditi Singh: ₹500 / month
     * 5% scholarship discount on full annual advance lump-sum payment.
     * 10-day rolling billing window (1st to 10th of each month) with daily 100 email quota guard.
   - 3 Days Free Demo Classes for all prospective students.
   - Boards: CBSE and Bihar Board (BSEB) in English & Hindi mediums.

3. MATHEMATICS & SCIENCE FORMATTING:
   - Format math and science with clean Unicode characters (e.g., ax² + bx + c = 0, KE = ½ mv², F = ma, v = u + at, H₂SO₄, sin²θ + cos²θ = 1, a ≠ 0, √x, ±, ×, ÷).
   - NEVER output raw LaTeX formatting like '$', '\\frac', '\\neq', or '\\sqrt'.

4. STRICT PRIVACY:
   - NEVER mention individual developer names (such as Aditya Prakash). Always represent Pragyan Institute and founding leadership Chandan Kumar, Prof. Ravi Ranjan & Aditi Singh.`;

  // Local intelligent knowledge matcher for instant, zero-latency answers
  function getLocalSmartAnswer(query) {
    const q = query.toLowerCase().trim();

    // Greetings
    if (q.match(/\b(hi|hello|hey|namaste|pranam|good morning|good afternoon|good evening|kaisa|kaise|sup)\b/)) {
      return `👋 **Namaste & Welcome to Pragyan Institute!**\n\nI am your **Pragyan AI Academic Assistant**. How can I help you today?\n• 💵 **Fee Structure & Batches (Class 1st to 12th & Special English)**\n• 🎁 **3 Days Free Demo Classes**\n• 👨‍🏫 **Faculty (Chandan Sir, Ravi Sir & Aditi Ma'am)**\n• 🖥️ **Smart Classrooms & 3D Visual Learning**\n• 📍 **Location, Directions & Timings in Lalganj**\n\n*Type your question below or click any quick suggestion chip!*`;
    }

    // Smartboards & Visual Tech
    if (q.includes('digital') || q.includes('smart board') || q.includes('smartboard') || q.includes('screen') || q.includes('board') || q.includes('tech') || q.includes('smart')) {
      return `🖥️ **Interactive Digital Smartboards & Visual Learning:**\n• **3D Visual Science:** Physics & Chemistry concepts visualized with vivid 3D animations and atomic/molecular models.\n• **Step-by-Step Maths:** Digital geometry derivations, coordinate graphing & algebraic proofs.\n• **High Retention:** Visual demonstrations significantly improve memory recall for board exams.\n• **Recorded Revision:** Quick concept recap sessions before weekly mock tests.`;
    }

    // Faculty & Mentors
    if (q.includes('teacher') || q.includes('faculty') || q.includes('sir') || q.includes('chandan') || q.includes('ravi') || q.includes('aditi') || q.includes('english') || q.includes('mentor') || q.includes('founder') || q.includes('who teaches')) {
      return `👨‍🏫 **Expert Mentors & Faculty Leadership:**\n• **CHANDAN KUMAR** — Science Lead & Sole Administrator (M.Sc Physics, B.Ed, D.El.Ed, CTET, 10+ Yrs Exp, **10,000+ Students Mentored**)\n• **PROF. RAVI RANJAN** — Higher Maths Mentor (M.Sc Maths, B.Ed, CTET, 15+ Yrs Exp, **12,000+ Students Mentored**)\n• **ADITI SINGH** — English & Grammar Mentor (M.Com, 5+ Yrs Exp, **1,000+ Students Mentored**)\n\n🏆 *Dedicated mentorship with a proven 100% board exam pass rate across Lalganj & Vaishali!*`;
    }

    // Fees, Pricing & Scholarships
    if (q.includes('fee') || q.includes('fees') || q.includes('cost') || q.includes('price') || q.includes('nominal') || q.includes('charge') || q.includes('payment') || q.includes('money') || q.includes('scholarship') || q.includes('paisa') || q.includes('kitna')) {
      return `💵 **Nominal Monthly Fee Structure (Zero Hidden Charges):**\n• **Class 11th & 12th (PCM / PCB):** ₹1,500 / month\n• **Class 9th & 10th (Matric / Foundation):** ₹1,000 / month\n• **Class 8th:** ₹800 / mo | **Class 6th & 7th:** ₹700 / mo | **Class 1st to 5th:** ₹500 / mo\n• **Special English by Aditi Singh:** 1st–5th (₹500), 6th–8th (₹700), 9th–12th (₹1,000)\n• **5% Annual Scholarship:** 5% concession on full annual lump-sum advance payment\n\n✨ *No admission fee. Includes printed study modules, weekly board test series & digital smartboard access.*`;
    }

    // Demo Classes
    if (q.includes('demo') || q.includes('trial') || q.includes('free') || q.includes('free class')) {
      return `🎁 **3 Days FREE Demo Classes:**\n• Experience our digital smartboards and conceptual teaching pedagogy for 3 days with **zero cost and zero admission fee**!\n• Open for Class 1st to 12th (CBSE & BSEB) and Special English batches.\n\n📲 Call / WhatsApp: **[+91 73698 91858](tel:+917369891858)** to reserve your demo seat!`;
    }

    // Admissions & Enrollment
    if (q.includes('admission') || q.includes('join') || q.includes('enroll') || q.includes('register') || q.includes('seat') || q.includes('namankan')) {
      return `📝 **Admissions & Enrollment Process:**\n• **Direct Walk-in:** Visit At Moti Market, Near Jagdamba Sthan, Vaishali Bus Stand Road, Lalganj.\n• **Documents Needed:** Previous report card & student photo.\n• **Online Registration:** Contact [+91 73698 91858](tel:+917369891858) for instant enrollment!`;
    }

    // Location & Maps
    if (q.includes('location') || q.includes('address') || q.includes('where') || q.includes('map') || q.includes('place') || q.includes('kahan') || q.includes('lalganj') || q.includes('chowk')) {
      return `📍 **Institute Address & Directions:**\n• **Location:** At Moti Market, Near Jagdamba Sthan, Vaishali Bus Stand Road, Lalganj\n• 🗺️ **Google Maps:** [Click for Exact Directions](https://maps.app.goo.gl/jhpW5ynQntfTMa2aA)`;
    }

    // Operational Timings
    if (q.includes('timing') || q.includes('time') || q.includes('hours') || q.includes('open') || q.includes('schedule') || q.includes('kab') || q.includes('samay')) {
      return `⏰ **Institute Operational Hours:**\n• **Monday – Saturday:** 6:30 AM – 8:00 PM (Regular Batch Sessions & Practical Problem Solving)\n• **Sunday:** 9:00 AM – 1:00 PM (Weekly Sunday Board Mock Tests & Special Doubt Clearing)`;
    }

    // Contact & Helpline
    if (q.includes('contact') || q.includes('phone') || q.includes('call') || q.includes('whatsapp') || q.includes('number') || q.includes('mobile') || q.includes('helpline')) {
      return `📞 **Direct Contact & Helpline:**\n• **Phone / WhatsApp:** [+91 73698 91858](tel:+917369891858)\n• **Office:** At Moti Market, Near Jagdamba Sthan, Vaishali Bus Stand Road, Lalganj\n• **Response Time:** Instant on WhatsApp!`;
    }

    // Portal Features & 3D VIP ID Card
    if (q.includes('portal') || q.includes('id card') || q.includes('vip') || q.includes('receipt') || q.includes('barcode') || q.includes('login') || q.includes('card') || q.includes('pass')) {
      return `🪪 **Digital Student ERP Portal Features:**\n• **3D Metallic VIP ID Pass:** Gyroscopic physics, 3D flip animation, live fee clearance status & QR barcode.\n• **Online UPI Payment & PDF Receipts:** Pay monthly fees securely via UPI/PhonePe/GPay and download instant computerized receipts.\n• **Attendance & Notices:** Real-time class notices and community forum discussions.`;
    }

    // Subjects & Boards
    if (q.includes('subject') || q.includes('syllabus') || q.includes('board') || q.includes('cbse') || q.includes('bseb') || q.includes('math') || q.includes('science') || q.includes('physics') || q.includes('chemistry') || q.includes('biology')) {
      return `📚 **Curriculum & Academic Coverage:**\n• **Subjects Offered:** Mathematics, Science (Physics, Chemistry, Biology), English & Social Studies.\n• **Boards Supported:** Central Board of Secondary Education (CBSE) & Bihar School Examination Board (BSEB) English & Hindi Medium.\n• **Target:** 100% Board Exam Success + Olympiad / NTSE Foundation.`;
    }

    // Batches
    if (q.includes('batch') || q.includes('class 10') || q.includes('class 9') || q.includes('class 8') || q.includes('class 11') || q.includes('class 12') || q.includes('10th') || q.includes('9th') || q.includes('8th')) {
      return `🎯 **Current Academic Batches:**\n• **Class 10th (ACHIEVER):** Board Mastery & Weekly Mock Tests (₹1,000/mo)\n• **Class 9th (NURTURE):** Deep Foundation & Conceptual Science (₹1,000/mo)\n• **Class 8th (ALPHA):** School Curriculum & Advanced Aptitude (₹800/mo)\n• **Class 11th & 12th (ASCEND):** I.Sc. Intermediate & Competitive Prep (₹1,200–₹1,500/mo)`;
    }

    // Physics Concepts
    if (q.includes('newton') || q.includes('gravity') || q.includes('motion') || q.includes('ohm') || q.includes('electricity') || q.includes('force') || q.includes('energy') || q.includes('light') || q.includes('reflection') || q.includes('refraction')) {
      return `💡 **Physics Conceptual Mastery (Chandan Sir's Module):**\n• **3D Visual Derivation:** Key laws like F = ma, V = IR, and KE = ½ mv² are demonstrated with interactive smartboard simulations.\n• **Step-by-Step Numericals:** High-yield board numericals solved with standard formulas and units.\n• **Board Focus:** Previous 10 years board question bank mastery!`;
    }

    // Maths Concepts
    if (q.includes('trigonometry') || q.includes('quadratic') || q.includes('pythagoras') || q.includes('triangle') || q.includes('formula') || q.includes('theorem') || q.includes('algebra') || q.includes('geometry')) {
      return `📐 **Mathematics Mastery (Ravi Sir's Module):**\n• **Logical Derivations:** Algebraic identities and geometric theorems proven with step-by-step logic.\n• **Daily Practice Problems (DPP):** High-yield board patterns with shortcut techniques for rapid problem solving.\n• **Dedicated Doubt Sessions:** Sunday 1-on-1 doubt clearing for every student!`;
    }

    // Physics Concepts
    if (q.includes('newton') || q.includes('gravity') || q.includes('motion') || q.includes('ohm') || q.includes('electricity') || q.includes('force') || q.includes('energy') || q.includes('light') || q.includes('reflection') || q.includes('refraction')) {
      return `💡 **Physics Conceptual Highlights (Chandan Sir's Module):**\n• **Visual Concept:** Interactive 3D animations break down complex derivations step-by-step.\n• **Key Formulas:** Standard formulas like F = ma, V = IR, and KE = ½ mv² are derived with practical demonstrations.\n• **Board Focus:** Targeted numericals and previous year question solving sessions!`;
    }

    // Maths Concepts
    if (q.includes('trigonometry') || q.includes('quadratic') || q.includes('pythagoras') || q.includes('triangle') || q.includes('formula') || q.includes('theorem') || q.includes('algebra') || q.includes('geometry')) {
      return `📐 **Mathematics Mastery (Ravi Sir's Module):**\n• **Step-by-Step Logic:** Clear geometric proofs and algebraic identities without rote memorization.\n• **Daily Practice Problems (DPP):** High-yield board exam question patterns with shortcut techniques.\n• **Doubt Clearance:** Dedicated Sunday sessions to solve every doubt!`;
    }

    // General Science
    if (q.includes('photosynthesis') || q.includes('cell') || q.includes('reaction') || q.includes('acid') || q.includes('base') || q.includes('periodic') || q.includes('respiration')) {
      return `🔬 **Science & Chemistry Modules:**\n• **Visual Smartboard Demonstrations:** Chemical reactions and biological diagrams shown in full color.\n• **NCERT & Board Aligned:** Complete coverage of all textbook activities and experiments.\n• **Printed Summaries:** Concise formula sheets and concept mind maps provided to all students.`;
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
                <div class="chat-status"><span class="status-dot"></span> Active • Gemini 3.6 Flash</div>
              </div>
            </div>
            <div class="chat-header-actions">
              <button id="chatResetBtn" class="chat-icon-btn" title="Start Fresh Chat / Reset Memory"><i class="fa-solid fa-rotate-left"></i></button>
              <button id="chatKeySettingsBtn" class="chat-icon-btn" title="Gemini API Key Settings"><i class="fa-solid fa-gear"></i></button>
              <button id="chatCloseBtn" class="chat-close-btn" aria-label="Close Chat">&times;</button>
            </div>
          </div>

          <!-- API Key Settings Panel -->
          <div id="keySettingsPanel" class="key-settings-panel" style="display: none;">
            <div class="key-panel-title">🔑 Custom Gemini API Key Settings</div>
            <div class="key-input-row">
              <input type="password" id="customApiKeyInput" placeholder="Paste custom API key" />
              <button id="saveKeyBtn" class="key-save-btn">Save</button>
            </div>
            <div class="key-panel-hint">Pre-configured with official Pragyan Institute key. Optional custom key from <a href="https://aistudio.google.com/app/apikey" target="_blank">Google AI Studio</a>.</div>
          </div>

          <div id="chatMessages" class="chat-messages">
            <div class="chat-msg bot-msg">
              <div class="msg-content">
                🙏 Namaste! I am <strong>Pragyan AI</strong>, your official academic assistant. Ask me anything about our digital classrooms, experienced teachers, nominal fee structure, batches, or 3-day demo classes!
              </div>
            </div>

            <!-- Quick Suggestion Chips -->
            <div class="chat-suggestions" id="chatChipsContainer">
              <button class="chip-btn" data-query="What are the fee structures for Class 8, 9, and 10?">💰 Nominal Fee</button>
              <button class="chip-btn" data-query="How do Digital Smartboards enhance learning?">🖥️ Digital Boards</button>
              <button class="chip-btn" data-query="Who are the teachers at Pragyan Institute?">👨‍🏫 Expert Mentors</button>
              <button class="chip-btn" data-query="Tell me about the 3 days free demo classes">🎁 3 Days Demo</button>
              <button class="chip-btn" data-query="Where is Pragyan Institute located in Lalganj, Bihar?">📍 Location & Map</button>
            </div>
          </div>

          <div class="chat-input-area">
            <input type="text" id="chatInput" placeholder="Ask about fees, faculty, smartboards, demo..." autocomplete="off" />
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
        width: 385px;
        max-width: calc(100vw - 2rem);
        height: 530px;
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
        padding: 0.9rem 1.15rem;
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
        gap: 0.55rem;
      }

      .chat-icon-btn {
        background: none;
        border: none;
        color: #F0E6D8;
        font-size: 0.95rem;
        cursor: pointer;
        opacity: 0.85;
        padding: 0.3rem;
        border-radius: 4px;
        transition: opacity 0.2s;
      }

      .chat-icon-btn:hover { opacity: 1; background: rgba(255,255,255,0.1); }

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
        font-size: 1.02rem;
        color: #F0E6D8;
        line-height: 1.1;
      }

      .chat-status {
        font-size: 0.73rem;
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
        padding: 0 0.2rem;
        opacity: 0.85;
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
        max-width: 88%;
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
        font-size: 0.95rem;
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
        font-weight: 700;
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
    const resetBtn = document.getElementById('chatResetBtn');
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

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        chatSessionHistory = [];
        const messagesEl = document.getElementById('chatMessages');
        if (messagesEl) {
          messagesEl.innerHTML = `
            <div class="chat-msg bot-msg">
              <div class="msg-content">
                🔄 **Conversation memory cleared.** How can I assist you with Pragyan Institute today?
              </div>
            </div>
            <div class="chat-suggestions" id="chatChipsContainer">
              <button class="chip-btn" data-query="What are the fee structures for Class 8, 9, and 10?">💰 Nominal Fee</button>
              <button class="chip-btn" data-query="How do Digital Smartboards enhance learning?">🖥️ Digital Boards</button>
              <button class="chip-btn" data-query="Who are the teachers at Pragyan Institute?">👨‍🏫 Expert Mentors</button>
              <button class="chip-btn" data-query="Tell me about the 3 days free demo classes">🎁 3 Days Demo</button>
              <button class="chip-btn" data-query="Where is Pragyan Institute located in Lalganj, Bihar?">📍 Location & Map</button>
            </div>
          `;
        }
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
          alert('Reset to official Pragyan Institute default Gemini Key.');
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
        chatSessionHistory.push({ role: 'user', parts: [{ text: queryText }] });
        chatSessionHistory.push({ role: 'model', parts: [{ text: preloadedAnswer }] });
      }, 250);
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

    // Call real Gemini API with multi-turn memory & local fallback
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
    clean = clean.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|tel:[^\s)]+|mailto:[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" class="chat-link">$1</a>');

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
      if (/^(\d+)\.\s+/.test(trimmed)) {
        const match = trimmed.match(/^(\d+)\.\s+(.*)$/);
        if (match) {
          return `<div class="chat-bullet"><span class="chat-bullet-dot" style="font-size: 0.85rem;">${match[1]}.</span><span class="chat-bullet-text">${match[2]}</span></div>`;
        }
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
    // 1. Push user turn to conversation history
    chatSessionHistory.push({
      role: 'user',
      parts: [{ text: userPrompt }]
    });

    // Prune history if it exceeds sliding window limit
    if (chatSessionHistory.length > MAX_HISTORY_MESSAGES) {
      chatSessionHistory = chatSessionHistory.slice(-MAX_HISTORY_MESSAGES);
    }

    // Build payload contents with conversation memory
    const contents = chatSessionHistory.map((item, idx) => {
      // Prepend system prompt to the first user turn for models without direct systemInstruction support
      if (idx === 0 && item.role === 'user') {
        return {
          role: 'user',
          parts: [{ text: `${SYSTEM_PROMPT}\n\nUser Question: ${item.parts[0].text}` }]
        };
      }
      return item;
    });

    // Attempt Serverless Proxy First
    try {
      const proxyRes = await fetch('/api/gemini-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: userPrompt, contents, systemInstruction: SYSTEM_PROMPT }),
        signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined
      });

      if (proxyRes.ok) {
        const proxyData = await proxyRes.json();
        if (proxyData.success && proxyData.text) {
          removeTypingIndicator();
          const botReply = proxyData.text;
          appendMessage(botReply, 'bot');
          chatSessionHistory.push({ role: 'model', parts: [{ text: botReply }] });
          return;
        }
      }
    } catch (e) {
      console.warn('Gemini serverless proxy fallback:', e.message);
    }

    // Direct Browser Client-Side Gemini Call with Key Fallback
    const apiKey = getActiveApiKey();
    if (apiKey) {
      for (const model of GEMINI_MODELS) {
        try {
          const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents,
              system_instruction: { parts: [{ text: SYSTEM_PROMPT }] }
            }),
            signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined
          });

          const data = await response.json();

          if (response.ok && data.candidates && data.candidates[0] && data.candidates[0].content) {
            removeTypingIndicator();
            const botReply = data.candidates[0].content.parts[0].text;
            appendMessage(botReply, 'bot');
            chatSessionHistory.push({ role: 'model', parts: [{ text: botReply }] });
            return;
          }
        } catch (err) {
          console.warn(`Direct model ${model} attempt note:`, err.message);
        }
      }
    }

    // If Gemini API is offline/unreachable, fallback seamlessly to local smart knowledge base
    removeTypingIndicator();
    const smartFallback = getLocalSmartAnswer(userPrompt);
    if (smartFallback) {
      appendMessage(smartFallback, 'bot');
      chatSessionHistory.push({ role: 'model', parts: [{ text: smartFallback }] });
    } else {
      appendMessage(`💡 **Pragyan AI Academic Mentor:**\n\nI am currently operating in offline mode. Please check your internet connection or ask any of our core subjects:\n• 📚 **Science & Maths Concepts:** Formulas, definitions, and board exam derivations.\n• 💵 **Fee & Admissions:** Class 8th–10th batches & 3-day free demo classes.\n• 📞 **Educator Helpline:** WhatsApp [+91 73698 91858](tel:+917369891858) for instant guidance!`, 'bot');
    }
  }
})();
