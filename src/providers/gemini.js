const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
const { FONT_ANALYSIS_PROMPT } = require('../prompt');

const GEMINI_MODEL = 'gemini-2.5-flash-preview-05-20';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

/**
 * Analyse a font image using Google Gemini 2.5 Flash.
 *
 * @param {string} base64Image  - base64-encoded image (no data-URI prefix)
 * @param {string} mimeType     - e.g. "image/jpeg" | "image/png" | "image/webp"
 * @returns {Promise<object>}   - parsed JSON result from the model
 */
async function analyzeWithGemini(base64Image, mimeType) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY ortam değişkeni tanımlı değil.');

  const url = `${GEMINI_API_URL}?key=${apiKey}`;

  const body = {
    contents: [
      {
        parts: [
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Image,
            },
          },
          { text: FONT_ANALYSIS_PROMPT },
        ],
      },
    ],
    generationConfig: {
      // Force JSON-only output — Gemini 2.5 supports this natively
      responseMimeType: 'application/json',
      temperature: 0.1,
      maxOutputTokens: 1024,
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

  // Extract text from the first candidate part
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error('Gemini boş yanıt döndürdü.');

  return parseJsonResponse(rawText);
}

/**
 * Safely parse the model's text as JSON.
 * Strips any accidental markdown fences just in case.
 */
function parseJsonResponse(text) {
  // Strip possible ```json ... ``` wrapper (model should never add this, but just in case)
  const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error(`Model geçerli JSON döndürmedi: ${cleaned.slice(0, 200)}`);
  }
}

module.exports = { analyzeWithGemini };
