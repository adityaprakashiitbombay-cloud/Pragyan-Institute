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
    return (typeof localStorage !== 'undefined' && localStorage.getItem('pragyan_gemini_key')) ||
      (typeof window !== 'undefined' && window.PRAGYAN_CONFIG && window.PRAGYAN_CONFIG.GEMINI_API_KEY) ||
      (typeof window !== 'undefined' && window.ENV_GEMINI_API_KEY) ||
      '';
  }

  function setActiveApiKey(key) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('pragyan_gemini_key', key.trim());
    }
  }

  // Multi-Turn Sliding Window Conversation Memory
  let chatSessionHistory = [];
  const MAX_HISTORY_MESSAGES = 20;

  // ── Canonical academic facts ────────────────────────────────────────────────
  // Every fee, batch and faculty line the assistant speaks is derived from
  // js/academic-config.js. Hardcoding them here had drifted badly, and this is
  // the one file whose output goes to prospective parents before they enrol:
  //
  //   * The fee answer quoted "Class 11th & 12th (ASCEND): ₹1,200 – ₹1,500" —
  //     the real rate is a flat ₹1,500 and ₹1,200 is not a rate this institute
  //     charges for anything, so the assistant was under-quoting by ₹300/month.
  //   * The Gemini system prompt taught the model "Junior Batch (JUNIO): ₹700",
  //     which conflates the ₹500 Class 1st–5th batch with the ₹700 Class 6th–7th
  //     one, and JUNIO is a retired batch key.
  //   * Eight of the twelve batches were absent — including all three of Aditi
  //     Singh's Special English batches, whom the same answer names as faculty.
  //     A parent asking about Special English 1st–5th (₹500) was quoted either
  //     nothing or Class 8th's ₹800.
  function academic() {
    return (typeof window !== 'undefined' && window.PRAGYAN_ACADEMIC) || null;
  }

  function inr(amount) {
    return '₹' + Number(amount).toLocaleString('en-IN');
  }

  /**
   * Batches grouped by monthly fee, dearest tier first. Grouping keeps the
   * answer to five bullets instead of twelve — readable on a phone — while
   * still naming every batch, so nothing is silently omitted.
   */
  function feeTiers() {
    const cfg = academic();
    if (!cfg) return [];
    const byFee = new Map();
    cfg.BATCHES.forEach(function (b) {
      if (!byFee.has(b.monthlyFee)) byFee.set(b.monthlyFee, []);
      byFee.get(b.monthlyFee).push(b);
    });
    return Array.from(byFee.keys())
      .sort(function (a, b) { return b - a; })
      .map(function (fee) { return { fee: fee, batches: byFee.get(fee) }; });
  }

  /** "• **₹1,500 / month** — Class 12th PCM, Class 12th PCB, …" per tier. */
  function feeTierLines(bullet) {
    const mark = bullet || '•';
    return feeTiers().map(function (tier) {
      return mark + ' **' + inr(tier.fee) + ' / month** — ' +
        tier.batches.map(function (b) { return b.name; }).join(', ');
    }).join('\n');
  }

  /** Every batch on its own line with its own rate, for "which batches" asks. */
  function batchLines(bullet) {
    const cfg = academic();
    const mark = bullet || '•';
    if (!cfg) return '';
    return cfg.BATCHES.map(function (b) {
      return mark + ' **' + b.name + '** — ' + inr(b.monthlyFee) + '/month · ' + b.tagline;
    }).join('\n');
  }

  /** The class range the institute actually teaches, e.g. "Class 1st to 12th". */
  function classRangeLabel() {
    const cfg = academic();
    if (!cfg) return 'all classes';
    const codes = cfg.BATCHES
      .map(function (b) { return parseInt(b.classCode, 10); })
      .filter(function (n) { return Number.isFinite(n) && n > 1; });
    const highest = Math.max.apply(null, codes);
    return 'Class 1st to ' + highest + 'th';
  }

  /** Faculty lines with the roles the config records, not invented titles. */
  function facultyLines(bullet) {
    const cfg = academic();
    const mark = bullet || '•';
    if (!cfg) return '';
    return cfg.FACULTY.map(function (f) {
      const taught = cfg.BATCHES.filter(function (b) {
        return b.teachers.indexOf(f.name) !== -1;
      }).length;
      return mark + ' **' + f.name + '** — ' + f.role + ' (' + f.experience +
        ', teaches ' + taught + ' batch' + (taught === 1 ? '' : 'es') + ')';
    }).join('\n');
  }

  function annualDiscountLabel() {
    const cfg = academic();
    const pct = cfg ? Math.round(cfg.ANNUAL_DISCOUNT_PCT * 100) : 5;
    return pct + '% scholarship discount on the full-year advance lump sum';
  }

  // Preloaded Answers for Quick Suggestion Chips.
  function preloadedChipAnswers() {
    return {
      "What are the fee structures for all batches?":
        `💵 **Nominal Monthly Fee Structure (Zero Hidden Charges):**\n${feeTierLines()}\n• **Annual Advance Scholarship:** ${annualDiscountLabel()}\n\n✨ *No admission fees ever. Includes printed concept modules, Sunday board mock test series & 3D VIP digital pass access.*`,

      "How do Digital Smartboards enhance learning?":
        `🖥️ **Interactive Digital Smartboards & Visual Learning:**\n• 🎯 **3D Visual Science:** Physics & Chemistry concepts visualized with vivid 3D animations and atomic/molecular models.\n• 💡 **Step-by-Step Maths:** Digital geometry derivations, coordinate graphing & algebraic proofs.\n• ⚡ **High Retention & Memory:** Visual demonstrations turn abstract board topics into intuitive concepts.\n• 🌟 **Interactive Concept Recaps:** Rapid revision sessions before weekly Sunday board mock tests.`,

      "Who are the teachers at Pragyan Institute?":
        `👨‍🏫 **Expert Mentors & Leadership Faculty:**\n${facultyLines()}\n\n🏆 *Proven track record of 100% board exam pass rates and top ranks across Lalganj & Vaishali!*`,

      "Tell me about the 3 days free demo classes":
        `🎁 **3 Days FREE Demo Classes:**\n• 🎯 **Zero Risk Trial:** Experience our digital smartboards, concept-first pedagogy, and teaching excellence for 3 days with **zero cost and zero admission fee**!\n• 💡 **All Batches Covered:** Open for every batch from ${classRangeLabel()} (CBSE & BSEB), including Special English.\n• ⚡ **Direct Teacher Interaction:** Attend live lectures, ask doubts freely, and receive free introductory notes.\n\n📲 Call / WhatsApp: **[+91 73698 91858](tel:+917369891858)** to reserve your demo seat today!`,

      "Where is Pragyan Institute located in Lalganj, Bihar?":
        `📍 **Location & Directions:**\n• 🎯 **Address:** At Moti Market, Near Jagdamba Sthan, Vaishali Bus Stand Road, Lalganj\n• 🗺️ **Google Maps:** [Click for exact directions](https://maps.app.goo.gl/jhpW5ynQntfTMa2aA)\n• ⏰ **Timings:** Mon–Sat: 6:30 AM – 8:00 PM | Sun: 9:00 AM – 1:00 PM`
    };
  }

  function systemPrompt() {
    const cfg = academic();
    const facultyBlock = cfg
      ? cfg.FACULTY.map(function (f) {
          return '     * ' + f.name + ': ' + f.role + ' (' + f.experience + ')';
        }).join('\n')
      : '     * Chandan Kumar: Managing Director & Science Lead';
    const feeBlock = feeTierLines('     *') || '     * Contact the helpline for the current fee schedule.';
    const batchBlock = cfg
      ? cfg.BATCHES.map(function (b) {
          return '     * ' + b.name + ' — ' + inr(b.monthlyFee) + '/month, annual ' +
            inr(cfg.annualPrice(b.monthlyFee)) + ' (taught by ' + b.teachers.join(' & ') + ')';
        }).join('\n')
      : '';

    return `You are 'Pragyan AI', the charismatic, inspiring, and brilliant official AI Academic Mentor for Pragyan Institute (Lalganj, Bihar) and a universal, all-round genius assistant.

🌟 YOUR PERSONA & TEACHING PHILOSOPHY:
- You are energetic, warm, intellectually curious, encouraging, and deeply knowledgeable — like a top IITian mentor who loves transforming complex, intimidating concepts into crystal-clear, fascinating "Aha!" insights.
- You make learning fun, intuitive, and unforgettable through vivid real-world analogies, step-by-step logic, and curiosity challenges.
- Multi-lingual Mastery: You effortlessly understand and respond in English, Hindi (हिन्दी), and natural conversational Hinglish depending on how the student communicates.

🎯 THE "PRAGYAN 4-POINT SPARK" RESPONSE FRAMEWORK:
Structure EVERY answer with EXACTLY 3 TO 4 crisp, visually captivating bullet points using bold emoji headers:
1. 🎯 **The Big Idea / Core Concept**: 1 crisp, vivid definition or foundational truth that instantly demystifies the topic.
2. 💡 **Real-World Analogy / "Aha!" Insight**: Connect abstract science, maths, history, coding, or daily life to an intuitive real-world picture (e.g., comparing gravity to a trampoline, cells to a bustling city, recursion to Russian nesting dolls).
3. ⚡ **Key Formula / Logic / Exam Hack**: Precise mathematical formulas, scientific laws, or high-yield rules formatted in clean Unicode (e.g., F = ma, v = u + at, KE = ½ mv², a² + b² = c², H₂SO₄, sin²θ + cos²θ = 1).
4. 🌟 **Curiosity Spark / Interactive Challenge**: Conclude with an intriguing follow-up question, thought experiment, or invitation to test their understanding (e.g., "🧠 Quick Brain-Teaser: What happens if...? Reply to find out!" or for institute queries, "🎁 Ready to experience this live on 3D smartboards? Ask for our 3-day free demo!").

📚 COMPREHENSIVE PRAGYAN INSTITUTE DATA & FACTS:
- Institute Name: Pragyan Institute (प्रज्ञान इंस्टीट्यूट, Lalganj, Vaishali, Bihar)
- Location & Campus: At Moti Market, Near Jagdamba Sthan, Vaishali Bus Stand Road, Lalganj, Vaishali, Bihar - 844121 (Google Maps: https://maps.app.goo.gl/jhpW5ynQntfTMa2aA)
- Contact Helpline & WhatsApp: +91 73698 91858 (Instant WhatsApp response, active 24/7)
- Operational Timings: Mon-Sat 6:30 AM - 8:00 PM | Sun 9:00 AM - 1:00 PM (Weekly Sunday Board Mock Tests & 1-on-1 Doubt Sessions)
- Expert Faculty Leadership:
${facultyBlock}
- 100% Nominal Monthly Fees (Zero admission or annual hidden fees):
${feeBlock}
  * ${annualDiscountLabel()}.
- Complete Batch List (${classRangeLabel()} — CBSE & BSEB in English & Hindi mediums):
${batchBlock}
- Interactive Digital Smartboards: High-tech smartboards across all classrooms for 3D physics/chemistry visual animations and step-by-step digital math solving.
- 3 Days Free Demo Classes for all prospective students (Zero registration fee).
- Academic Excellence: 100% board exam pass rates and top ranks across Lalganj & Vaishali.
- Digital ERP Portal: Features 3D metallic VIP student ID card with gyroscopic physics, instant online UPI fee payments, computerized PDF receipts, live notices, and interactive class channels.

💻 CREATOR & ARCHITECT OF PRAGYAN AI & DIGITAL PLATFORM:
- Creator & Developer: Aditya, a brilliant developer from Patna, Bihar — currently studying at ALLEN Patna.
- Engineering & Purpose: Designed and coded Pragyan AI, full-stack cloud serverless backend, real-time database sync, and the 3D student ERP portal to bring top-tier educational technology to students in Lalganj & Vaishali.

📐 FORMATTING RULES:
- Provide EXACTLY 3 TO 4 punchy bullet points ('•' or '1.', '2.', '3.', '4.'). Avoid massive essays or walls of plain text.
- NEVER output raw markdown headers ('#' or '###').
- Format math/science with clean Unicode characters (x², ³, √x, ±, ×, ÷, ≠, ≤, ≥, θ, π, ½, ⅓, ¼). NEVER output raw LaTeX ('$', '\\frac', '\\sqrt').`;
  }

  // Local intelligent knowledge matcher for instant, zero-latency answers
  function getLocalSmartAnswer(query) {
    const q = query.toLowerCase().trim();

    // 1. Greetings & Conversational Openers
    if (q.match(/\b(hi|hello|hey|namaste|pranam|good morning|good afternoon|good evening|kaisa|kaise|sup|hal|chal|kaise ho)\b/)) {
      return `👋 **Namaste & Welcome to Pragyan Institute!**\n\nI am **Pragyan AI**, your charismatic 24/7 Academic Mentor & Learning Companion. What would you like to explore today?\n• 🎯 **Academic Batches & Free Demo:** Experience our digital classrooms (${classRangeLabel()}) with 3 days free trial!\n• 💵 **Nominal Fee Structure:** 100% transparent monthly fees with zero admission charges.\n• 🧠 **Concepts, Science & Maths:** Ask any doubt in Physics, Chemistry, Maths, Biology, Coding, or English!\n• 💡 **Study Hacks & Motivation:** Smart exam scoring blueprints and active recall techniques.\n\n🌟 *Type your question or choose any quick shortcut chip below!*`;
    }

    // 2. Fees, Pricing & Scholarships
    if (q.includes('fee') || q.includes('cost') || q.includes('price') || q.includes('nominal') ||
        q.includes('charge') || q.includes('payment') || q.includes('money') ||
        q.includes('scholarship') || q.includes('discount') || q.includes('paisa') ||
        q.includes('kitna') || q.includes('shulk')) {
      return `💵 **Nominal Monthly Fee Structure (Zero Hidden Charges):**\n${feeTierLines()}\n• **Annual Advance Scholarship:** ${annualDiscountLabel()}\n\n✨ *No admission fee ever. Includes printed study modules, weekly board test series & 3D VIP portal access.*`;
    }

    // 3. Smartboards & Visual Tech
    if (/\b(smart ?boards?|digital board|interactive board|smart class(room)?s?|projector|screens?)\b/.test(q) ||
        q.includes('smartboard') || q.includes('digital classroom') || q.includes('3d animation')) {
      return `🖥️ **Interactive Digital Smartboards & Visual Learning:**\n• 🎯 **3D Visual Science:** Physics & Chemistry concepts visualized with vivid 3D animations and atomic/molecular models.\n• 💡 **Step-by-Step Maths:** Digital geometry derivations, coordinate graphing & algebraic proofs.\n• ⚡ **High Retention:** Visual demonstrations significantly improve memory recall for board exams.\n• 🌟 **Recorded Revision:** Quick concept recap sessions before weekly mock tests.\n\n✨ *Ready to see it live? Ask about our 3 days free demo classes!*`;
    }

    // 4. Faculty & Mentors
    if (q.includes('teacher') || q.includes('faculty') || q.includes('sir') || q.includes('ma\'am') ||
        q.includes('madam') || q.includes('chandan') || q.includes('ravi') || q.includes('aditi') ||
        q.includes('mentor') || q.includes('founder') || q.includes('who teaches') ||
        q.includes('principal') || q.includes('director')) {
      return `👨‍🏫 **Expert Mentors & Faculty Leadership:**\n${facultyLines()}\n\n🏆 *Dedicated mentorship with a proven 100% board exam pass rate across Lalganj & Vaishali!*`;
    }

    // 5. Demo Classes
    if (q.includes('demo') || q.includes('trial') || /\bfree\b/.test(q)) {
      return `🎁 **3 Days FREE Demo Classes:**\n• 🎯 **Zero Risk Trial:** Experience our digital smartboards, concept-first pedagogy, and teaching excellence for 3 days with **zero cost and zero admission fee**!\n• 💡 **All Batches Covered:** Open for every batch from ${classRangeLabel()} (CBSE & BSEB), including the Special English batches.\n• ⚡ **Direct Teacher Interaction:** Attend live lectures, ask doubts freely, and receive free introductory notes.\n\n📲 Call / WhatsApp: **[+91 73698 91858](tel:+917369891858)** to reserve your demo seat!`;
    }

    // 6. Scientific Study Hacks & Active Recall
    if (q.includes('study tip') || q.includes('how to study') || q.includes('memorize') || q.includes('active recall') ||
        q.includes('pomodoro') || q.includes('feynman') || q.includes('padhai kaise') || q.includes('yaad kaise')) {
      return `🧠 **Scientific Study Hacks for High Exam Scores:**\n• 🎯 **The Feynman Technique:** Explain any concept in simple words as if teaching a 10-year-old; identify your gaps and simplify further.\n• 💡 **Active Recall & Spaced Repetition:** Instead of passive re-reading, test yourself with closed-book flash questions on Day 1, Day 3, and Day 7.\n• ⚡ **The 25/5 Pomodoro Rule:** 25 minutes of laser-focused study with ZERO distractions, followed by a 5-minute brain refresh break.\n• 🌟 **Sunday Mock Test Mastery:** Pragyan Institute conducts weekly mock tests so the real board exam feels effortless!`;
    }

    // 7. Exam Motivation & Overcoming Fear
    if (q.includes('motivat') || q.includes('stress') || q.includes('fear') || q.includes('dar') ||
        q.includes('procrastinat') || q.includes('man nahi lag') || q.includes('bore') || q.includes('focus')) {
      return `🔥 **Top-Rank Mindset & Daily Motivation:**\n• 🎯 **Break Mountains into Pebbles:** Don't focus on the entire 500-page syllabus at once. Conquer just 1 chapter or 3 numericals right now.\n• 💡 **Action Precedes Motivation:** You don't need to 'feel ready' to study. Start a 5-minute timer and just begin reading — momentum will take over!\n• ⚡ **Focus on Mastery, Not Marks:** When concepts click deeply, top board ranks and exam confidence follow automatically.\n• 🌟 **1-on-1 Mentorship:** Our faculty (Chandan Sir, Ravi Sir & Aditi Ma'am) provide personal guidance and doubt support at every step!`;
    }

    // 8. Physics Concepts & Mechanics
    if (q.includes('newton') || q.includes('gravity') || q.includes('motion') || q.includes('ohm') ||
        q.includes('electricity') || q.includes('force') || q.includes('energy') || q.includes('light') ||
        q.includes('reflection') || q.includes('refraction')) {
      return `💡 **Physics Conceptual Spark (Chandan Sir's Method):**\n• 🎯 **The Core Principle:** Every physical phenomenon is governed by universal conservation laws (F = ma, V = IR, KE = ½ mv²).\n• 💡 **Real-World Picture:** When you jump off a skateboard, it rolls backward (Newton's 3rd Law — Action & Reaction in action!).\n• ⚡ **3D Smartboard Visuals:** We plot magnetic field lines, ray optics, and current circuits live on interactive digital screens.\n• 🌟 **Board Exam Edge:** 10-year chapterwise question bank solving ensures full marks on numericals!`;
    }

    // 9. Mathematics & Derivations
    if (q.includes('trigonometry') || q.includes('quadratic') || q.includes('pythagoras') || q.includes('triangle') ||
        q.includes('formula') || q.includes('theorem') || q.includes('algebra') || q.includes('geometry') || q.includes('calculus')) {
      return `📐 **Mathematics Mastery (Ravi Sir's Method):**\n• 🎯 **Visual Intuition Over Rote Learning:** Trigonometric ratios (sin²θ + cos²θ = 1) and Pythagoras (a² + b² = c²) are proven with geometric step-by-step logic.\n• 💡 **Speed Shortcuts & DPPs:** Daily Practice Problem sheets equip students with rapid calculation tricks for board and competitive exams.\n• ⚡ **Zero Doubt Guarantee:** Every derivation is broken into simple algebraic steps with dedicated Sunday 1-on-1 sessions.\n• 🌟 **Challenge:** Want to see how Ravi Sir solves complex quadratic roots in under 15 seconds? Join our demo classes!`;
    }

    // 10. Chemistry & Natural Science
    if (q.includes('photosynthesis') || q.includes('cell') || q.includes('reaction') || q.includes('acid') ||
        q.includes('base') || q.includes('periodic') || q.includes('respiration') || q.includes('atom') || q.includes('molecule')) {
      return `🔬 **Chemistry & Life Sciences (Concept-First):**\n• 🎯 **Atomic Precision:** Understand chemical bonding, pH scales, and balancing reactions (6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂) with molecular logic.\n• 💡 **Vivid Smartboard Models:** Interactive 3D molecular structures turn textbook diagrams into exciting visual experiences.\n• ⚡ **NCERT Activity Mastery:** Complete coverage of textbook experiments, color change reactions, and board-favourite questions.\n• 🌟 **Printed Formula Sheets:** Concise mind maps and reaction summary sheets provided to all students!`;
    }

    // 11. Special English & Language Excellence
    if (q.includes('english') || q.includes('grammar') || q.includes('tense') || q.includes('vocabulary') ||
        q.includes('speaking') || q.includes('communication') || q.includes('writing') || q.includes('voice')) {
      return `✨ **Special English & Language Excellence (Aditi Ma'am's Batches):**\n• 🎯 **Root-Level Grammar Mastery:** Tenses, Active/Passive Voice, Prepositions, and Sentence Framing taught with clear rules.\n• 💡 **Spoken English & Fluency:** Interactive debate, dialogue practice, and vocabulary building to speak with effortless confidence.\n• ⚡ **Board Exam Writing Sections:** High-scoring formats for Letters, Essays, Notices, and Literature chapter analysis.\n• 🌟 **Available for All Classes:** Dedicated Special English batches running for Class 1st to 12th!`;
    }

    // 12. Coding, Programming & AI
    if (q.includes('coding') || q.includes('python') || q.includes('programming') || q.includes('javascript') ||
        q.includes('computer') || q.includes('artificial intelligence') || q.includes('machine learning') || q.includes('software')) {
      return `💻 **Computer Science & Digital Skills:**\n• 🎯 **Logic & Computational Thinking:** Programming is simply breaking a big puzzle into small, step-by-step algorithms.\n• 💡 **Core Languages:** Learn Python, JavaScript, and C++ foundations with practical coding examples and interactive problem solving.\n• ⚡ **AI & Future Tech:** Understand how Machine Learning, neural networks, and modern software engines power today's world.\n• 🌟 **Curiosity:** Computers only understand 0 and 1 (binary), yet can create 3D video games and AI assistants like me!`;
    }

    // 13. Space, Universe & Astronomy
    if (q.includes('space') || q.includes('black hole') || q.includes('universe') || q.includes('planet') ||
        q.includes('solar system') || q.includes('star') || q.includes('speed of light') || q.includes('galaxy') || q.includes('mars')) {
      return `🌌 **Cosmic Wonders & Astronomy:**\n• 🎯 **Speed of Light:** Light travels at approximately 300,000 km/s — fast enough to circle the Earth 7.5 times in a single second!\n• 💡 **Black Holes & Gravity:** Gravity is so intense in a black hole that not even light can escape its event horizon.\n• ⚡ **Our Cosmic Address:** Earth is the 3rd rock orbiting the Sun in the Orion Arm of the Milky Way Galaxy among 2 trillion galaxies.\n• 🌟 **Brain Teaser:** When you gaze at distant stars at night, you are literally looking back in time millions of years!`;
    }

    // 14. Fun Brain Teaser / Logic Riddle
    if (q.includes('riddle') || q.includes('puzzle') || q.includes('brain teaser') || q.includes('paheli') || q.includes('game') || q.includes('quiz')) {
      return `🧩 **Brain-Teaser Challenge:**\n• 🎯 **The Riddle:** *"I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?"*\n• 💡 **Hint:** You often hear me in deep mountain valleys and empty classrooms!\n• ⚡ **Think about it:** Send me your answer and see if you guessed right (Answer: An Echo 🔊)!\n• 🌟 *Want another puzzle or a rapid-fire maths question? Just ask!*`;
    }

    // 15. Admissions & Enrollment
    if (q.includes('admission') || q.includes('join') || q.includes('enroll') || q.includes('register') || q.includes('seat') || q.includes('namankan')) {
      return `📝 **Admissions & Enrollment Process:**\n• 🎯 **Direct Walk-in:** Visit At Moti Market, Near Jagdamba Sthan, Vaishali Bus Stand Road, Lalganj.\n• 💡 **Documents Needed:** Previous report card & student photo.\n• ⚡ **Zero Admission Fee:** Only nominal monthly tuition fee applies.\n• 🌟 **Online Registration:** Contact [+91 73698 91858](tel:+917369891858) for instant enrollment!`;
    }

    // 16. Location & Maps
    if (q.includes('location') || q.includes('address') || q.includes('where') || q.includes('map') || q.includes('place') || q.includes('kahan') || q.includes('lalganj') || q.includes('chowk')) {
      return `📍 **Institute Address & Directions:**\n• 🎯 **Location:** At Moti Market, Near Jagdamba Sthan, Vaishali Bus Stand Road, Lalganj\n• 🗺️ **Google Maps:** [Click for Exact Directions](https://maps.app.goo.gl/jhpW5ynQntfTMa2aA)\n• ⏰ **Timings:** Mon–Sat: 6:30 AM – 8:00 PM | Sun: 9:00 AM – 1:00 PM`;
    }

    // 17. Operational Timings
    if (q.includes('timing') || q.includes('time') || q.includes('hours') || q.includes('open') || q.includes('schedule') || q.includes('kab') || q.includes('samay')) {
      return `⏰ **Institute Operational Hours:**\n• 🎯 **Monday – Saturday:** 6:30 AM – 8:00 PM (Regular Batch Sessions & Practical Problem Solving)\n• 💡 **Sunday:** 9:00 AM – 1:00 PM (Weekly Sunday Board Mock Tests & Special Doubt Clearing)\n• ⚡ **Helpline Active:** 24/7 on WhatsApp!`;
    }

    // 18. Contact & Helpline
    if (q.includes('contact') || q.includes('phone') || q.includes('call') || q.includes('whatsapp') || q.includes('number') || q.includes('mobile') || q.includes('helpline')) {
      return `📞 **Direct Contact & Helpline:**\n• 🎯 **Phone / WhatsApp:** [+91 73698 91858](tel:+917369891858)\n• 💡 **Office:** At Moti Market, Near Jagdamba Sthan, Vaishali Bus Stand Road, Lalganj\n• ⚡ **Response Time:** Instant on WhatsApp!`;
    }

    // 19. Portal Features & 3D VIP ID Card
    if (q.includes('portal') || q.includes('id card') || q.includes('vip') || q.includes('receipt') || q.includes('barcode') || q.includes('login') || q.includes('card') || q.includes('pass')) {
      return `🪪 **Digital Student ERP Portal Features:**\n• 🎯 **3D Metallic VIP ID Pass:** Gyroscopic physics, 3D flip animation, live fee clearance status & QR barcode.\n• 💡 **Online UPI Payment & PDF Receipts:** Pay monthly fees securely via UPI/PhonePe/GPay and download instant computerized receipts.\n• ⚡ **Attendance & Notices:** Real-time class notices and community forum discussions.`;
    }

    // 20. Subjects & Boards
    if (q.includes('subject') || q.includes('syllabus') || q.includes('board') || q.includes('cbse') || q.includes('bseb') || q.includes('math') || q.includes('science') || q.includes('physics') || q.includes('chemistry') || q.includes('biology')) {
      return `📚 **Curriculum & Academic Coverage:**\n• 🎯 **Subjects Offered:** Mathematics, Science (Physics, Chemistry, Biology), English & Social Studies.\n• 💡 **Boards Supported:** Central Board of Secondary Education (CBSE) & Bihar School Examination Board (BSEB) English & Hindi Medium.\n• ⚡ **Target:** 100% Board Exam Success + Olympiad / NTSE Foundation.`;
    }

    // 21. Batches & Streams
    if (q.includes('batch') || q.includes('stream') || q.includes('pcm') || q.includes('pcb') ||
        /\bclass\s*(1|2|3|4|5|6|7|8|9|10|11|12)\b/.test(q) ||
        /\b(1st|2nd|3rd|4th|5th|6th|7th|8th|9th|10th|11th|12th)\b/.test(q) ||
        q.includes('special english') || q.includes('junior') || q.includes('achiever') ||
        q.includes('nurture') || q.includes('alpha') || q.includes('pioneer') || q.includes('ascend')) {
      return `🎯 **All Academic Batches (${classRangeLabel()}):**\n${batchLines()}\n\n💡 *${annualDiscountLabel()} — ask for the annual price of any batch.*`;
    }

    // 22. Creator, Developer & Architect (Aditya from Patna studying in ALLEN Patna)
    if (q.includes('who made') || q.includes('who created') || q.includes('who built') ||
        q.includes('who developed') || q.includes('developer') || q.includes('creator') ||
        q.includes('kisne banaya') || q.includes('kon banaya') || q.includes('who coded') ||
        q.includes('architect') || q.includes('aditya') || q.includes('allen patna')) {
      return `💻 **Architect & Developer of Pragyan AI & Portal:**\n• 🎯 **Creator:** Built & engineered by **Aditya**, from Patna, Bihar — currently studying at **ALLEN Patna**.\n• 💡 **Vision & Engineering:** Designed as a next-gen full-stack digital platform featuring Gemini AI mentorship, offline-first sync, and a 3D metallic VIP student ERP portal.\n• ⚡ **Mission:** Bringing top-tier educational technology and modern digital learning tools to students in Lalganj & Vaishali.\n• 🌟 **Academic Spirit:** Empowering every learner with 24/7 instant doubt clearing and smart conceptual learning!`;
    }

    return null;
  }

  document.addEventListener('DOMContentLoaded', () => {
    createChatUI();
    initChatEvents();
  });

  /**
   * The five suggestion chips. One definition, used by both the initial render
   * and the reset handler — they were two separate copies of the same markup,
   * and the first fee-chip rename left the reset copy pointing at a question
   * preloadedChipAnswers() no longer had a key for, so resetting the chat
   * downgraded the fee chip to a live Gemini call.
   */
  const SUGGESTION_CHIPS = [
    { query: 'What are the fee structures for all batches?', label: '💰 Nominal Fee' },
    { query: 'How do Digital Smartboards enhance learning?', label: '🖥️ Digital Boards' },
    { query: 'Who are the teachers at Pragyan Institute?', label: '👨‍🏫 Expert Mentors' },
    { query: 'Tell me about the 3 days free demo classes', label: '🎁 3 Days Demo' },
    { query: 'Where is Pragyan Institute located in Lalganj, Bihar?', label: '📍 Location & Map' }
  ];

  /** Attribute-safe: the chip queries contain apostrophes and question marks. */
  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function chipsMarkup() {
    const buttons = SUGGESTION_CHIPS.map(function (chip) {
      return `<button type="button" class="chip-btn" data-query="${escapeHtml(chip.query)}">${chip.label}</button>`;
    }).join('\n              ');
    // A labelled group: five unlabelled buttons in a row read as an anonymous
    // pile to a screen reader, with no clue they are optional shortcuts.
    return `<div class="chat-suggestions" id="chatChipsContainer" role="group" aria-label="Suggested questions">
              ${buttons}
            </div>`;
  }

  function createChatUI() {
    if (document.getElementById('pragyanChatWidget')) return;

    const widgetHTML = `
      <div id="pragyanChatWidget" class="pragyan-chat-widget">
        <button id="chatToggleBtn" class="chat-toggle-btn" type="button"
                aria-label="Open Pragyan AI Assistant" aria-expanded="false" aria-controls="chatWindow">
          <i class="fa-solid fa-robot" aria-hidden="true"></i>
          <span class="chat-toggle-badge">AI Assist</span>
        </button>

        <div id="chatWindow" class="chat-window" role="dialog" aria-modal="false" aria-labelledby="chatWindowTitle">
          <div class="chat-header">
            <div class="chat-header-info">
              <div class="chat-avatar"><i class="fa-solid fa-robot" aria-hidden="true"></i></div>
              <div>
                <div class="chat-title" id="chatWindowTitle">Pragyan AI Assistant</div>
                <div class="chat-status"><span class="status-dot" aria-hidden="true"></span> Active • Gemini 3.6 Flash</div>
              </div>
            </div>
            <div class="chat-header-actions">
              <button id="chatResetBtn" class="chat-icon-btn" type="button"
                      title="Start Fresh Chat / Reset Memory" aria-label="Start fresh chat and clear conversation memory"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i></button>
              <button id="chatKeySettingsBtn" class="chat-icon-btn" type="button"
                      title="Gemini API Key Settings" aria-label="Gemini API key settings"
                      aria-expanded="false" aria-controls="keySettingsPanel"><i class="fa-solid fa-gear" aria-hidden="true"></i></button>
              <button id="chatCloseBtn" class="chat-close-btn" type="button" aria-label="Close chat">&times;</button>
            </div>
          </div>

          <!-- API Key Settings Panel -->
          <div id="keySettingsPanel" class="key-settings-panel" hidden>
            <div class="key-panel-title" id="keyPanelTitle">🔑 Custom Gemini API Key Settings</div>
            <div class="key-input-row">
              <!-- A visible label would crowd a 320px-wide panel, so the field is
                   named for assistive tech instead. It was previously a bare
                   password box whose only description was its placeholder, which
                   most screen readers do not announce once text is entered. -->
              <label class="sr-only-chat" for="customApiKeyInput">Custom Gemini API key</label>
              <input type="password" id="customApiKeyInput" placeholder="Paste custom API key"
                     autocomplete="off" spellcheck="false" aria-describedby="keyPanelHint" />
              <button id="saveKeyBtn" class="key-save-btn" type="button">Save</button>
            </div>
            <div class="key-panel-hint" id="keyPanelHint">Pre-configured with official Pragyan Institute key. Optional custom key from <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer">Google AI Studio<span class="sr-only-chat"> (opens in a new tab)</span></a>.</div>
          </div>

          <!-- role="log" + polite: each reply is announced as it arrives without
               interrupting what the user is typing. The transcript was silent
               before, so a screen-reader user got no indication an answer had
               appeared at all. -->
          <div id="chatMessages" class="chat-messages" role="log" aria-live="polite"
               aria-relevant="additions text" aria-label="Conversation with Pragyan AI" tabindex="0">
            <div class="chat-msg bot-msg">
              <div class="msg-content">
                🙏 Namaste! I am <strong>Pragyan AI</strong>, your official academic assistant. Ask me anything about our digital classrooms, experienced teachers, nominal fee structure, batches, or 3-day demo classes!
              </div>
            </div>

            <!-- Quick Suggestion Chips -->
            ${chipsMarkup()}
          </div>

          <div class="chat-input-area">
            <label class="sr-only-chat" for="chatInput">Your message to Pragyan AI</label>
            <input type="text" id="chatInput" placeholder="Ask about fees, faculty, smartboards, demo..."
                   autocomplete="off" enterkeyhint="send" />
            <button id="chatSendBtn" class="chat-send-btn" type="button" aria-label="Send message">
              <i class="fa-solid fa-paper-plane" aria-hidden="true"></i>
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
      /* Visually hidden but announced. Used for the labels on the message box and
         the API-key field, whose only prior description was a placeholder — and a
         placeholder stops being read once the field has text in it. Not
         display:none, which removes it from the accessibility tree too. */
      .sr-only-chat {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }

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
        /* visibility, not just opacity: an opacity-0 panel is still in the tab
           order and the accessibility tree, so a keyboard or screen-reader user
           on the homepage used to land inside a chat window they could not see —
           five suggestion chips, three header buttons, a password field and a
           message box, all invisible. pointer-events blocks the mouse, not Tab.
           The 0.3s visibility delay lets the fade-out finish before it hides. */
        visibility: hidden;
        transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1),
                    transform 0.3s cubic-bezier(0.16, 1, 0.3, 1),
                    visibility 0s linear 0.3s;
      }

      .chat-window.open {
        opacity: 1;
        transform: translateY(0) scale(1);
        pointer-events: auto;
        visibility: visible;
        transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1),
                    transform 0.3s cubic-bezier(0.16, 1, 0.3, 1),
                    visibility 0s;
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

      .chat-inline-code {
        font-family: 'JetBrains Mono', 'Fira Code', monospace;
        background: #F1EBE4;
        color: #5A2E25;
        padding: 0.15rem 0.35rem;
        border-radius: 4px;
        font-size: 0.82rem;
        border: 1px solid #DDD5CD;
      }

      .chat-code-block {
        font-family: 'JetBrains Mono', 'Fira Code', monospace;
        background: #231C18;
        color: #F8F3EC;
        padding: 0.75rem 0.9rem;
        border-radius: 8px;
        font-size: 0.8rem;
        overflow-x: auto;
        margin: 0.5rem 0;
        line-height: 1.4;
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
        min-width: 0;
        padding: 0.65rem 1rem;
        border-radius: 9999px;
        border: 1px solid #DDD5CD;
        font-family: inherit;
        /* 16px exactly. iOS Safari zooms the whole page when a focused input is
           under 16px, and this was 0.9rem (14.4px) — so tapping the chat box
           zoomed the homepage and left the layout scrolled sideways with the
           send button off-screen. 16px is the documented threshold. */
        font-size: 16px;
        outline: none;
        background-color: #F8F3EC;
      }

      #chatInput:focus {
        border-color: #B5543A;
        background-color: #FFFFFF;
      }

      /* Keyboard focus was invisible everywhere in this widget: the input traded
         its outline for a 1px border tint and the buttons had nothing at all. */
      .chat-toggle-btn:focus-visible,
      .chat-close-btn:focus-visible,
      .chat-icon-btn:focus-visible,
      .chat-send-btn:focus-visible,
      .chip-btn:focus-visible,
      .key-save-btn:focus-visible,
      #chatInput:focus-visible,
      #customApiKeyInput:focus-visible {
        outline: 3px solid #1D4ED8;
        outline-offset: 2px;
      }
      .chat-close-btn:focus-visible,
      .chat-icon-btn:focus-visible {
        outline-color: #FFFFFF;
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

      @media (max-width: 768px) {
        .pragyan-chat-widget {
          left: 0.75rem;
          bottom: max(0.75rem, env(safe-area-inset-bottom));
          right: 0.75rem;
        }
        .chat-window {
          left: 0 !important;
          right: 0 !important;
          width: 100% !important;
          max-width: calc(100vw - 1.5rem) !important;
          bottom: max(3.85rem, calc(env(safe-area-inset-bottom) + 3.2rem)) !important;
          height: clamp(380px, calc(100dvh - 5.5rem), 580px) !important;
          max-height: calc(100vh - 5.5rem) !important;
          max-height: calc(100dvh - 5.5rem) !important;
          min-height: 320px;
          border-radius: 1.15rem !important;
        }
      }

      @media (max-width: 480px) {
        .pragyan-chat-widget {
          left: 0.5rem;
          bottom: max(0.6rem, env(safe-area-inset-bottom));
          right: 0.5rem;
        }
        .chat-toggle-btn {
          padding: 0.65rem 1.15rem;
          font-size: 0.88rem;
          box-shadow: 0 4px 18px rgba(90, 46, 37, 0.35);
        }
        .chat-window {
          left: 0 !important;
          right: 0 !important;
          width: calc(100vw - 1rem) !important;
          max-width: calc(100vw - 1rem) !important;
          bottom: max(3.85rem, calc(env(safe-area-inset-bottom) + 3.2rem)) !important;
          /* dvh, and it has to be repeated here: the desktop rule's dvh
             max-height was overridden by this block's !important vh value, so on
             every phone with a retracting address bar the panel was sized against
             the tall viewport and its input row sat below the fold — the send
             button could not be reached at all. */
          height: clamp(380px, calc(100dvh - 5.5rem), 560px) !important;
          max-height: calc(100vh - 5.5rem) !important;
          max-height: calc(100dvh - 5.5rem) !important;
          min-height: 320px;
          border-radius: 1.15rem !important;
        }
        .chat-header {
          padding: 0.75rem 0.95rem;
        }
        /* 44px touch targets. These were ~25px (0.3rem padding on a 0.95rem
           glyph), which is under the 24px AA floor once the icon is inset and
           well under the 44px comfortable minimum, so reset / settings / close
           were all easy to miss and hard to hit accurately with a thumb. */
        .chat-icon-btn,
        .chat-close-btn {
          min-width: 44px;
          min-height: 44px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .chat-header-actions { gap: 0.15rem; }
        /* Same iOS zoom rule as #chatInput: this password field was 0.8rem
           (12.8px), so tapping it zoomed the page and pushed the Save button
           off the right edge of the panel. */
        .key-input-row input { font-size: 16px; }
        .key-save-btn { min-height: 44px; }
        .chat-messages {
          padding: 0.75rem;
          gap: 0.65rem;
        }
        .chat-msg {
          max-width: 90%;
          font-size: 0.85rem;
          word-break: break-word;
        }
        .chat-suggestions {
          gap: 0.35rem;
          margin-top: 0.35rem;
        }
        .chip-btn {
          font-size: 0.75rem;
          padding: 0.3rem 0.65rem;
        }
        .chat-input-area {
          padding: 0.65rem 0.75rem;
          padding-bottom: max(0.65rem, env(safe-area-inset-bottom));
          gap: 0.45rem;
        }
        #chatInput {
          font-size: 16px;
          padding: 0.55rem 0.85rem;
        }
        .chat-send-btn {
          width: 42px;
          height: 42px;
        }
      }

      /* The panel fades and slides, the typing dots bounce and the toggle scales
         on hover. All of it is decoration, so honour the OS setting. */
      @media (prefers-reduced-motion: reduce) {
        .chat-window,
        .chat-window.open {
          transition: visibility 0s;
        }
        .chat-toggle-btn,
        .chat-toggle-btn:hover {
          transition: none;
          transform: none;
        }
        .typing-dot { animation: none !important; }
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

    /**
     * One place that opens or closes the panel, so aria-expanded and the toggle's
     * own label can never disagree with what is on screen. The label used to read
     * "Open Pragyan AI Assistant" permanently — a screen-reader user with the
     * panel open was told the only way to close it was to open it.
     */
    function setChatOpen(open) {
      if (!windowEl) return;
      windowEl.classList.toggle('open', open);
      if (toggleBtn) {
        toggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        toggleBtn.setAttribute('aria-label',
          open ? 'Close Pragyan AI Assistant' : 'Open Pragyan AI Assistant');
      }
      if (open) {
        inputEl?.focus();
      } else if (toggleBtn) {
        // Focus has to come back to the toggle. Closing used to leave it on a
        // button inside a now-hidden panel, which drops the keyboard caret to
        // the top of the document — the user loses their place on the page.
        toggleBtn.focus();
      }
    }

    function setSettingsOpen(open) {
      if (!settingsPanel) return;
      settingsPanel.hidden = !open;
      settingsBtn?.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open && keyInput) {
        keyInput.value = localStorage.getItem('pragyan_gemini_key') || '';
        keyInput.focus();
      }
    }

    if (toggleBtn && windowEl) {
      toggleBtn.addEventListener('click', () => {
        setChatOpen(!windowEl.classList.contains('open'));
      });
    }

    if (closeBtn && windowEl) {
      closeBtn.addEventListener('click', () => setChatOpen(false));
    }

    // Escape closes, the way every other dialog on the web does. Without it a
    // keyboard user had to Tab through the whole transcript to reach the ×.
    if (windowEl) {
      windowEl.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (settingsPanel && !settingsPanel.hidden) {
          setSettingsOpen(false);
          settingsBtn?.focus();
        } else {
          setChatOpen(false);
        }
        e.stopPropagation();
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        chatSessionHistory = [];
        const messagesEl = document.getElementById('chatMessages');
        if (messagesEl) {
          // <strong>, not **…**: this string is assigned with innerHTML and never
          // runs through the markdown converter, so the user read a literal
          // "**Conversation memory cleared.**" with the asterisks showing.
          messagesEl.innerHTML = `
            <div class="chat-msg bot-msg">
              <div class="msg-content">
                🔄 <strong>Conversation memory cleared.</strong> How can I assist you with Pragyan Institute today?
              </div>
            </div>
            ${chipsMarkup()}
          `;
        }
        inputEl?.focus();
      });
    }

    if (settingsBtn && settingsPanel) {
      settingsBtn.addEventListener('click', () => setSettingsOpen(settingsPanel.hidden));
    }

    if (saveKeyBtn && keyInput) {
      saveKeyBtn.addEventListener('click', () => {
        const val = keyInput.value.trim();
        if (val) {
          setActiveApiKey(val);
          alert('✅ Custom Gemini API Key saved successfully!');
        } else {
          localStorage.removeItem('pragyan_gemini_key');
          alert('Reset to official Pragyan Institute default Gemini Key.');
        }
        setSettingsOpen(false);
        settingsBtn?.focus();
      });
      // Enter in a single-field panel should submit it, not do nothing.
      keyInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          saveKeyBtn.click();
        }
      });
    }

    if (sendBtn) {
      sendBtn.addEventListener('click', handleUserSend);
    }

    if (inputEl) {
      // keydown, not keypress: keypress is deprecated and is not fired at all by
      // some Android IME keyboards, so Enter did nothing on those phones and the
      // only way to send was the paper-plane button.
      inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
          e.preventDefault();
          handleUserSend();
        }
      });
    }

    // Chip click handlers. closest(), not classList on the target: a tap that
    // lands on the emoji text node inside the button reports that node as the
    // target on some engines and the chip silently did nothing.
    document.addEventListener('click', (e) => {
      const chip = e.target?.closest?.('.chip-btn');
      if (!chip) return;
      const query = chip.getAttribute('data-query');
      if (!query) return;
      if (windowEl && !windowEl.classList.contains('open')) setChatOpen(true);
      handleChipClick(query);
    });
  }

  function handleChipClick(queryText) {
    appendMessage(queryText, 'user');
    showTypingIndicator();

    const preloadedAnswer = preloadedChipAnswers()[queryText];
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
    if (preloadedChipAnswers()[query]) {
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
      .replace(/\\approx/g, '≈')
      .replace(/\\Delta/g, 'Δ')
      .replace(/\\pi/g, 'π')
      .replace(/\\theta/g, 'θ')
      .replace(/\\alpha/g, 'α')
      .replace(/\\beta/g, 'β')
      .replace(/\\lambda/g, 'λ')
      .replace(/\\infty/g, '∞')
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

    // 3. Multi-line Code Blocks
    clean = clean.replace(/```(?:[a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g, '<pre class="chat-code-block"><code>$1</code></pre>');

    // 4. Inline Code
    clean = clean.replace(/`([^`]+)`/g, '<code class="chat-inline-code">$1</code>');

    // 5. Links
    clean = clean.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|tel:[^\s)]+|mailto:[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" class="chat-link">$1</a>');

    // 6. Bold and italics
    clean = clean
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>');

    // 7. Horizontal dividers
    clean = clean.replace(/^---+$/gm, '<hr class="chat-divider">');

    // 8. Styled Headings & Bullet Lists
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
      .replace(/(<div class="chat-heading">.*?<\/div>)<br>/g, '$1')
      .replace(/(<pre class="chat-code-block">.*?<\/pre>)<br>/g, '$1');

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
          parts: [{ text: `${systemPrompt()}\n\nUser Question: ${item.parts[0].text}` }]
        };
      }
      return item;
    });

    // Attempt Serverless Proxy First
    try {
      const proxyRes = await fetch('/api/gemini-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: userPrompt, contents, systemInstruction: systemPrompt() }),
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
          // Key travels in the header, not the query string — URLs end up in
          // history and proxy logs; headers do not.
          const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify({
              contents,
              system_instruction: { parts: [{ text: systemPrompt() }] }
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
      appendMessage(`💡 **Pragyan AI Academic Mentor:**\n\nI am currently operating in offline mode. Please check your internet connection or ask any of our core subjects:\n• 📚 **Science & Maths Concepts:** Formulas, definitions, and board exam derivations.\n• 💵 **Fee & Admissions:** All ${classRangeLabel()} batches & 3-day free demo classes.\n• 📞 **Educator Helpline:** WhatsApp [+91 73698 91858](tel:+917369891858) for instant guidance!`, 'bot');
    }
  }
})();
