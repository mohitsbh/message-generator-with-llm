const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const { config } = require('dotenv');

config();
// polyfill fetch via undici when missing (Node <18)
try {
  if (typeof fetch === 'undefined') {
    // eslint-disable-next-line global-require
    const { fetch: undiciFetch, FormData, File } = require('undici');
    global.fetch = undiciFetch;
    global.FormData = FormData;
    global.File = File;
  }
} catch (e) {
  console.warn('undici fetch polyfill not available:', e && e.message);
}

const { OpenAI } = require('openai');

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || null;

// helper: make sure fetch exists (Node 18+). If not, throw a helpful error.
if (typeof fetch === 'undefined') {
  console.warn('global fetch is not available in this Node runtime. Gemini support requires Node 18+ or a fetch polyfill.');
}

// Simple rule-based generator (fallback)
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
    message: 'Hello {name}, Greetings! Here\'s a short message you can use.'
  };

  return templates[occasion] || templates['message'];
}

async function generateMessageOpenAI(prompt) {
  if (!openai) throw new Error('OPENAI_API_KEY not set');
  const system = `You are a helpful assistant that writes short, friendly customer messages. Keep it under 40 words and include a {name} placeholder where appropriate.`;
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: `Create a short customer message for the following prompt: "${prompt}"` }
  ];

  const resp = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    max_tokens: 120,
    temperature: 0.7
  });

  const text = resp.choices && resp.choices[0] && resp.choices[0].message && resp.choices[0].message.content;
  return text ? text.trim() : '';
}

async function generateMessageGemini(prompt) {
  const apiKey = geminiApiKey;
  if (!apiKey) throw new Error('GEMINI_API_KEY or GOOGLE_API_KEY not set');
  const model = process.env.GEMINI_MODEL || 'gemini-1.3';

  // Basic prompt instructions for Gemini
  const instruction = `You are a helpful assistant that writes short, friendly customer messages. Keep it under 40 words and include a {name} placeholder where appropriate. Create a single short message for this prompt: ${prompt}`;

  const url = `https://generativelanguage.googleapis.com/v1beta2/models/${model}:generateText?key=${apiKey}`;
  const body = {
    prompt: { text: instruction },
    temperature: 0.7,
    maxOutputTokens: 120
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Gemini API error: ${resp.status} ${txt}`);
  }

  const json = await resp.json();

  // The response shape can vary; try common fields
  let text = '';
  if (json.candidates && json.candidates[0]) {
    text = json.candidates[0].output || json.candidates[0].content || json.candidates[0].text || '';
  } else if (json.output && json.output[0]) {
    text = json.output[0].content || json.output[0].text || '';
  } else if (json.result) {
    text = json.result;
  }

  return (text || '').toString().trim();
}

async function handleGenerate(req, res) {
  const { prompt, useLLM, provider } = req.body;
  if (typeof prompt !== 'string') return res.status(400).json({ error: 'prompt string required' });

  try {
    if (useLLM) {
      // provider: 'openai' or 'gemini' (default to gemini when available)
      const p = (provider || (geminiApiKey ? 'gemini' : 'openai')).toLowerCase();
      if (p === 'gemini' && geminiApiKey) {
        const out = await generateMessageGemini(prompt);
        return res.json({ message: out });
      }
      if (p === 'openai' && openai) {
        const out = await generateMessageOpenAI(prompt);
        return res.json({ message: out });
      }
      // If user requested LLM but provider not configured, fall through
    }
  } catch (err) {
    console.error('LLM error:', err && err.message);
    // fall through to rule-based
  }

  const result = generateMessageRule(prompt);
  res.json({ message: result });
}

// Mount the same handler at both /generate and /api/generate so local and deployed
// routes behave the same and the frontend can use /api/generate.
app.post('/generate', handleGenerate);
app.post('/api/generate', handleGenerate);

app.get('/health', (req, res) => res.send('ok'));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Message generator running on http://localhost:${port}`));
