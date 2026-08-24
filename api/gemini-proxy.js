import { applyCors } from './_lib/auth.js';

// ---------------------------------------------------------------------------
// Rate limiting: the endpoint is intentionally callable without a session
// (the public-site chat widget uses it), so per-IP throttling is what stands
// between anonymous traffic and the institute's Gemini quota.
// Best-effort in-memory limiter — per warm instance, resets on cold start.
// ---------------------------------------------------------------------------
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX_REQUESTS = 15;
const rateBuckets = new Map(); // ip -> { count, windowStart }

function isRateLimited(ip) {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || bucket.windowStart + RATE_WINDOW_MS < now) {
    rateBuckets.set(ip, { count: 1, windowStart: now });
    // Opportunistic cleanup so the Map cannot grow unbounded.
    if (rateBuckets.size > 5000) {
      for (const [key, value] of rateBuckets) {
        if (value.windowStart + RATE_WINDOW_MS < now) rateBuckets.delete(key);
      }
    }
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_MAX_REQUESTS;
}

// Hard caps so one request cannot carry an unbounded prompt on our quota.
const MAX_PROMPT_CHARS = 4000;
const MAX_CONTENTS_ITEMS = 30;

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
    .toString().split(',')[0].trim();
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please try again in a minute.' });
  }

  const { prompt, contents, systemInstruction } = req.body || {};
  if (!prompt && (!contents || !contents.length)) {
    return res.status(400).json({ error: 'Prompt or contents are required' });
  }

  // SECURITY: no embedded credential fallback. The committed base64 key was a
  // live secret readable by anyone with repo access; the proxy now requires
  // GEMINI_API_KEY to be configured server-side and fails closed otherwise.
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'Server AI configuration is missing' });
  }

  let payloadContents = Array.isArray(contents) ? contents.slice(0, MAX_CONTENTS_ITEMS) : null;
  if (!payloadContents) {
    const text = String(prompt || '').slice(0, MAX_PROMPT_CHARS);
    payloadContents = [{ role: 'user', parts: [{ text }] }];
  }

  const requestBody = { contents: payloadContents };
  if (systemInstruction) {
    requestBody.system_instruction = {
      parts: [{ text: typeof systemInstruction === 'string'
        ? systemInstruction.slice(0, MAX_PROMPT_CHARS * 2)
        : JSON.stringify(systemInstruction).slice(0, MAX_PROMPT_CHARS * 2) }]
    };
  }

  const models = [
    'gemini-3.6-flash',
    'gemini-3.5-flash-lite',
    'gemini-3-flash-preview',
    'gemini-3.7-flash'
  ];

  let lastError = null;

  for (const model of models) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7500);

    try {
      // Key travels in the header rather than the query string so it cannot
      // leak into upstream/proxy access logs.
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timer);

      const data = await response.json();
      if (response.ok && data.candidates && data.candidates[0]?.content) {
        const text = data.candidates[0].content.parts[0]?.text || '';
        return res.status(200).json({ success: true, text, model });
      } else {
        // Do not forward Google's error text to anonymous callers — it leaks
        // quota state and key validity. Log it server-side instead.
        console.warn(`[gemini-proxy] ${model} failed (${response.status}):`,
          data.error?.message?.slice(0, 200) || 'API response error');
        lastError = 'The AI service could not answer right now.';
      }
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        lastError = 'The AI service took too long to respond. Please try again.';
      } else {
        console.warn('[gemini-proxy] network error:', err.message);
        lastError = 'The AI service is unreachable right now.';
      }
    }
  }

  return res.status(502).json({ error: lastError || 'All Gemini models failed' });
}
