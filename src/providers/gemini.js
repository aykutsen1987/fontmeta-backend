const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
const { FONT_ANALYSIS_PROMPT } = require('../prompt');

const GEMINI_MODEL   = 'gemini-2.5-flash';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

/**
 * v5 DEĞİŞİKLİKLER:
 * - thinkingBudget: 0 → 512 (serif/script ayrımı için az düşünme süresi verelim)
 * - system_instruction eklendi: script → serif → sans-serif sıralaması
 */
async function analyzeWithGemini(base64Image, mimeType) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY ortam değişkeni tanımlı değil.');

  const url = `${GEMINI_API_URL}?key=${apiKey}`;

  const body = {
    system_instruction: {
      parts: [{
        text:
          'You are an expert typographer. ' +
          'ALWAYS follow this identification order: ' +
          '1) SCRIPT FIRST — flowing cursive, calligraphic, ornate? → Script fonts (Gabriola has floral swashes, Great Vibes is elegant, Dancing Script is casual). ' +
          '2) SERIF — horizontal feet at base of H/T/I? → Times New Roman (sharp wedge serifs, high contrast, tight spacing), Georgia (rounded serifs, tall x-height), Garamond (low contrast). ' +
          '3) SANS-SERIF LAST — only if no script and no serifs. ' +
          'This is a camera photo. Slight blur is normal. Focus on letterform structure, not image quality.'
      }]
    },
    contents: [
      {
        parts: [
          { inline_data: { mime_type: mimeType, data: base64Image } },
          { text: FONT_ANALYSIS_PROMPT },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1,
      maxOutputTokens: 4096,
      thinkingConfig: { thinkingBudget: 512 },
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API hatası ${response.status}: ${errText}`);
  }

  const data = await response.json();

  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  let rawText = parts.find(p => !p.thought && p.text)?.text;
  if (!rawText) rawText = parts.find(p => p.text)?.text;

  if (!rawText) {
    const finishReason = data?.candidates?.[0]?.finishReason;
    throw new Error(
      finishReason && finishReason !== 'STOP'
        ? `Gemini yanıtı tamamlanamadı (${finishReason}).`
        : 'Gemini boş yanıt döndürdü.'
    );
  }

  return parseJsonResponse(rawText);
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

module.exports = { analyzeWithGemini };
