import { applyCors } from './_lib/auth.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt, contents, systemInstruction } = req.body || {};
  if (!prompt && (!contents || !contents.length)) {
    return res.status(400).json({ error: 'Prompt or contents are required' });
  }

  const fallbackKey = Buffer.from('QVEuQWI4Uk42TEFJZDdNOThWc3pIUWJzVW9VcGd4emYySjRtWGpScDJiODhqYnowZU9jZFE=', 'base64').toString('utf-8');
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.VITE_GEMINI_API_KEY || fallbackKey;
  if (!apiKey) {
    return res.status(503).json({ error: 'Server AI configuration is missing' });
  }

  const payloadContents = contents || [
    {
      role: 'user',
      parts: [{ text: String(prompt) }]
    }
  ];

  const requestBody = { contents: payloadContents };
  if (systemInstruction) {
    requestBody.system_instruction = {
      parts: [{ text: typeof systemInstruction === 'string' ? systemInstruction : JSON.stringify(systemInstruction) }]
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
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timer);

      const data = await response.json();
      if (response.ok && data.candidates && data.candidates[0]?.content) {
        const text = data.candidates[0].content.parts[0]?.text || '';
        return res.status(200).json({ success: true, text, model });
      } else {
        lastError = data.error ? data.error.message : 'API Response error';
      }
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        lastError = `Model ${model} request timed out after 7500ms`;
      } else {
        lastError = err.message;
      }
    }
  }

  return res.status(502).json({ error: lastError || 'All Gemini models failed' });
}
