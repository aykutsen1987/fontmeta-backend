const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
const { FONT_ANALYSIS_PROMPT } = require('../prompt');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct'; // best vision model on Groq as of 2025

/**
 * Analyse a font image using Groq Llama vision model.
 *
 * @param {string} base64Image  - base64-encoded image (no data-URI prefix)
 * @param {string} mimeType     - e.g. "image/jpeg" | "image/png" | "image/webp"
 * @returns {Promise<object>}   - parsed JSON result from the model
 */
async function analyzeWithGroq(base64Image, mimeType) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY ortam değişkeni tanımlı değil.');

  const dataUri = `data:${mimeType};base64,${base64Image}`;

  const body = {
    model: GROQ_MODEL,
    temperature: 0.1,
    max_tokens: 1024,
    // Force JSON output — Groq OpenAI-compatible endpoint supports this
    response_format: { type: 'json_object' },
    messages: [
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
 */
function parseJsonResponse(text) {
  const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error(`Model geçerli JSON döndürmedi: ${cleaned.slice(0, 200)}`);
  }
}

module.exports = { analyzeWithGroq };
