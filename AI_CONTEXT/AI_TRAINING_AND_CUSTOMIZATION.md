# 🧠 How to Train & Customize the Pragyan Website AI Assistant

The AI Assistant on your website uses Google's latest **Gemini Flash LLM** combined with an **Institute Knowledge Base**. You can teach it how to behave, talk, and answer questions through **3 simple layers**:

---

## 📍 Layer 1: The System Prompt (Persona & Guidelines)
> **File Location**: [`js/chat.js`](file:///e:/GEMINI/PragyanInstitute/js/chat.js#L38-L60)

The **`SYSTEM_PROMPT`** is the master set of instructions passed to Gemini on every single message.

### How to edit it:
Open [`js/chat.js`](file:///e:/GEMINI/PragyanInstitute/js/chat.js) and modify the `SYSTEM_PROMPT` string:

```javascript
const SYSTEM_PROMPT = `You are 'Pragyan AI', the official AI assistant for Pragyan Institute located near Main Chowk, Lalganj, Vaishali, Bihar - 844121.

CRITICAL INSTRUCTIONS:
1. TONE & FORMAT:
   - Always respond in short, crisp bullet points (Max 3 to 6 lines).
   - Use emojis (📚, 💡, 👨‍🏫, 💵, 📍) and bold keywords.
   - Speak politely in simple English or Hinglish depending on what the student asks.

2. ACCURATE FACTS TO REMEMBER:
   - Mentors: Chandan Kumar (Science Lead & Director, 10+ Yrs Exp), Prof. Ravi Ranjan (Maths Lead & Director, 15+ Yrs Exp), Aditi Singh (English & Grammar Lead, 5+ Yrs Exp).
   - Class 10th (ACHIEVER): ₹1,000 / month
   - Class 9th (NURTURE): ₹1,000 / month
   - Class 8th (ALPHA): ₹800 / month
   - Junior Batch: ₹700 / month
   - Free Offer: 3 Days Free Demo Classes.
   - Contact: +91 73698 91858

3. RULES:
   - If a student asks how to solve a math/science question, explain the concept step-by-step.
   - Always encourage students to visit the center or call for a free demo!
`;
```

---

## 📍 Layer 2: Preloaded Quick Suggestion Chips (Instant Answers)
> **File Location**: [`js/chat.js`](file:///e:/GEMINI/PragyanInstitute/js/chat.js#L21-L36)

When visitors click the prompt chips at the bottom of the chat, these answers display instantly (0ms latency).

### How to edit or add new chips:
```javascript
const PRELOADED_CHIP_ANSWERS = {
  "What are the fee structures for Class 8, 9, and 10?":
    `💵 **Nominal Monthly Fee Structure:**\n• **Class 10th:** ₹1,000 / month\n• **Class 9th:** ₹1,000 / month\n• **Class 8th:** ₹800 / month\n\n✨ *Includes printed study modules & weekly test series.*`,

  "Who are the teachers at Pragyan Institute?":
    `👨‍🏫 **Expert Mentors:**\n• **CHANDAN KUMAR** — Science Lead & Director (10+ Yrs Exp)\n• **RAVI RANJAN** — Maths Lead & Director (15+ Yrs Exp)\n• **ADITI SINGH** — English Lead (5+ Yrs Exp)\n\n🏆 *100% Board Pass Track Record!*`,

  // Add your new custom question & answer here:
  "When do new batches start?":
    `🚀 **New Batch Admissions:**\n• Fresh batches start on the 1st & 15th of every month!\n• Call **+91 73698 91858** to reserve your seat.`
};
```

---

## 📍 Layer 3: Offline Intelligent Matcher
> **File Location**: [`js/chat.js`](file:///e:/GEMINI/PragyanInstitute/js/chat.js#L61-L125)

The **`getLocalSmartAnswer(query)`** function ensures the assistant can answer immediately even if the user's internet is slow or if Gemini is temporarily unreachable.

### Example adding a keyword rule:
```javascript
if (q.includes('hostel') || q.includes('stay')) {
  return `🏢 **Hostel & Transport Information:**\n• We have tie-ups with nearby verified student hostels in Lalganj.\n• Please call [+91 73698 91858](tel:+917369891858) for assistance!`;
}
```

---

## 🚀 How to Apply Changes

Whenever you want to update the AI's personality or knowledge:
1. Tell me what new rules, facts, or answers you want to teach it.
2. I will update `js/chat.js` and push it to your live website in seconds!
