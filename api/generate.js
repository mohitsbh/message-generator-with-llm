// Vercel Serverless function for /api/generate
// Accepts POST { prompt, useLLM, provider }
const fetch = global.fetch || require('undici').fetch;

function generateMessageRule(prompt) {
  const p = (prompt || '').toLowerCase();
  let occasion = 'message';
  if (p.includes('diwali') || p.includes('deepavali')) occasion = 'diwali';
  else if (p.includes('christmas')) occasion = 'christmas';
  else if (p.includes('new year') || p.includes('newyear')) occasion = 'newyear';
  else if (p.includes('birthday')) occasion = 'birthday';

  const templates = {
    diwali: 'Hello {name}, Diwali greetings! We wish you the best holiday. Namaste!',
    christmas: 'Hello {name}, Merry Christmas! Wishing you joy and peace this season.',
    newyear: 'Hello {name}, Happy New Year! Wishing you a prosperous year ahead.',
    birthday: 'Hello {name}, Happy Birthday! Hope you have a wonderful day filled with joy.',
    message: "Hello {name}, Greetings! Here's a short message you can use."
  };

  return templates[occasion] || templates['message'];
}

async function generateMessageGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');
  const model = process.env.GEMINI_MODEL || 'gemini-1.3';
  const instruction = `You are a helpful assistant that writes short, friendly customer messages. Keep it under 40 words and include a {name} placeholder where appropriate. Create a single short message for this prompt: ${prompt}`;
  const url = `https://generativelanguage.googleapis.com/v1beta2/models/${model}:generateText?key=${apiKey}`;
  const body = { prompt: { text: instruction }, temperature: 0.7, maxOutputTokens: 120 };

  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gemini API error: ${res.status} ${t}`);
  }
  const j = await res.json();
  let text = '';
  if (j.candidates && j.candidates[0]) text = j.candidates[0].output || j.candidates[0].content || '';
  else if (j.output && j.output[0]) text = j.output[0].content || '';
  return (text || '').toString().trim();
}

async function generateMessageOpenAI(prompt) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not configured');
  const url = 'https://api.openai.com/v1/chat/completions';
  const messages = [
    { role: 'system', content: 'You are a helpful assistant that writes short, friendly customer messages. Keep it under 40 words and include a {name} placeholder.' },
    { role: 'user', content: `Create a short customer message for: ${prompt}` }
  ];
  const body = { model: process.env.OPENAI_MODEL || 'gpt-4o-mini', messages, max_tokens: 120, temperature: 0.7 };
  const res = await fetch(url, { method: 'POST', headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpenAI API error: ${res.status} ${t}`);
  }
  const j = await res.json();
  const text = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
  return (text || '').trim();
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { prompt, useLLM, provider } = req.body || {};
  if (typeof prompt !== 'string') return res.status(400).json({ error: 'prompt string required' });

  try {
    if (useLLM) {
      const p = (provider || (process.env.GEMINI_API_KEY ? 'gemini' : 'openai')).toLowerCase();
      if (p === 'gemini') {
        const out = await generateMessageGemini(prompt);
        return res.status(200).json({ message: out });
      }
      if (p === 'openai') {
        const out = await generateMessageOpenAI(prompt);
        return res.status(200).json({ message: out });
      }
    }
  } catch (err) {
    // Log and fall back to rule-based
    console.error('LLM error:', err && err.message);
  }

  const fallback = generateMessageRule(prompt);
  return res.status(200).json({ message: fallback });
};
