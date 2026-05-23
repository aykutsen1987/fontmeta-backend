const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
const { FONT_ANALYSIS_PROMPT } = require('../prompt');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

const GROQ_MODELS = [
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'meta-llama/llama-4-scout-17b-16e-instruct',
];

/**
 * v5 DEĞİŞİKLİKLER:
 * - Script/Gabriola farkındalığı system prompt'a eklendi.
 * - Serif-first kuralı korundu.
 * - "Never default to sans-serif" kuralı eklendi.
 */
async function analyzeWithGroq(base64Image, mimeType) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY ortam değişkeni tanımlı değil.');

  const dataUri = `data:${mimeType};base64,${base64Image}`;

  let lastError = null;

  for (const model of GROQ_MODELS) {
    const body = {
      model,
      temperature: 0.1,
      max_tokens: 3000,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You are an expert typographer. Respond ONLY with valid JSON — no markdown, no text outside JSON. ' +
            'IDENTIFICATION ORDER — follow this EVERY TIME: ' +
            '(1) SCRIPT CHECK FIRST: Is the text flowing, calligraphic, cursive, or decorative? ' +
            'If yes → Script fonts: Gabriola (ornate swashes), Great Vibes, Dancing Script, Pacifico, Edwardian Script. ' +
            'Gabriola has extremely ornate capital letters with floral flourishes and hairline strokes. ' +
            '(2) SERIF CHECK: Look at base of capital H or T — do you see horizontal feet (serifs)? ' +
            'If yes → Times New Roman (sharp wedge serifs, tight spacing, high contrast), ' +
            'Georgia (rounded serifs, tall x-height), Garamond (low contrast, narrow), Palatino. ' +
            '(3) SANS-SERIF LAST: Only if no script and no serifs → Arial, Calibri, Segoe UI, Verdana. ' +
            'NEVER default to sans-serif. If you see curves or serifs, use the correct category. ' +
            'This is a camera photo — slight blur is normal, look at overall letterform structure.',
        },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: dataUri } },
            { type: 'text', text: FONT_ANALYSIS_PROMPT },
          ],
        },
      ],
    };

    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      lastError = new Error(`Groq API hatası ${response.status} (${model}): ${errText}`);
      if (response.status === 429 || response.status === 503 || response.status === 404) continue;
      throw lastError;
    }

    const data = await response.json();
    const rawText = data?.choices?.[0]?.message?.content;
    if (!rawText) {
      lastError = new Error(`Groq boş yanıt döndürdü (${model}).`);
      continue;
    }

    return parseJsonResponse(rawText);
  }

  throw lastError ?? new Error('Groq: kullanılabilir model bulunamadı.');
}

function parseJsonResponse(text) {
  let cleaned = text.replace(/^\uFEFF/, '').trim();
  cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/, '').trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace  = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`Model geçerli JSON döndürmedi: ${cleaned.slice(0, 300)}`);
  }
}

module.exports = { analyzeWithGroq };
