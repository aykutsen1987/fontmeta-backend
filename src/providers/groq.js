const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
const { FONT_ANALYSIS_PROMPT } = require('../prompt');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL   = 'meta-llama/llama-4-scout-17b-16e-instruct';

/**
 * Analyse a font image using Groq Llama vision model.
 *
 * DEĞİŞİKLİKLER (v2):
 * - max_tokens 1024 → 2048 (kesilmiş JSON hatasını önler)
 * - parseJsonResponse Gemini ile aynı sağlam hale getirildi
 * - system prompt eklendi: "sadece JSON döndür" talimatı model seviyesinde de var
 */
async function analyzeWithGroq(base64Image, mimeType) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY ortam değişkeni tanımlı değil.');

  const dataUri = `data:${mimeType};base64,${base64Image}`;

  const body = {
    model: GROQ_MODEL,
    temperature: 0.1,
    max_tokens: 2048, // ← 1024'ten artırıldı
    response_format: { type: 'json_object' },
    messages: [
      {
        // System prompt: modeli saf JSON moduna al
        role: 'system',
        content: 'You are a typography expert. You MUST respond with ONLY a valid JSON object. No markdown, no explanation, no text outside the JSON.',
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
    throw new Error(`Groq API hatası ${response.status}: ${errText}`);
  }

  const data = await response.json();

  const rawText = data?.choices?.[0]?.message?.content;
  if (!rawText) throw new Error('Groq boş yanıt döndürdü.');

  return parseJsonResponse(rawText);
}

/**
 * Safely parse the model's text as JSON.
 * Handles: markdown fences, BOM characters, surrounding text.
 */
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
