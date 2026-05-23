const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
const { FONT_ANALYSIS_PROMPT } = require('../prompt');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

const GROQ_MODELS = [
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'meta-llama/llama-4-scout-17b-16e-instruct',
];

/**
 * Analyse a font image using Groq Llama vision model.
 *
 * v4 DEĞİŞİKLİKLER:
 * - System prompt'a serif-öncelikli talimat eklendi.
 * - "ALWAYS check for serifs FIRST" → Groq'un sans-serif'e atlama alışkanlığı kırılıyor.
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
            'You are an expert typographer and font identification specialist. ' +
            'You MUST respond with ONLY a valid JSON object — no markdown, no explanation, ' +
            'no text outside the JSON. ' +
            'CRITICAL RULE: ALWAYS check for serifs FIRST. ' +
            'Look at the bottom of capital letters H, T, I — do you see small horizontal "feet"? ' +
            'If YES → this is a SERIF font. Common serif fonts: Times New Roman, Georgia, Garamond, Palatino, Cambria. ' +
            'Times New Roman specifically has: HIGH stroke contrast (thick/thin difference), SHORT x-height, ' +
            'SHARP triangular wedge serifs, and TIGHT letter spacing. ' +
            'If you see serifs, do NOT return Arial, Calibri, Segoe UI, or any sans-serif font. ' +
            'If NO serifs → sans-serif: Arial, Helvetica, Calibri, Segoe UI, Roboto, Open Sans, etc. ' +
            'Always examine letter serifs carefully before making any decision.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: dataUri },
            },
            {
              type: 'text',
              text: FONT_ANALYSIS_PROMPT,
            },
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
      if (response.status === 429 || response.status === 503 || response.status === 404) {
        continue;
      }
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

  cleaned = cleaned
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();

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
