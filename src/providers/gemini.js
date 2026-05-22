const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
const { FONT_ANALYSIS_PROMPT } = require('../prompt');

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

/**
 * Analyse a font image using Google Gemini 2.5 Flash.
 *
 * DEĞİŞİKLİKLER (v2):
 * - maxOutputTokens 1024 → 2048 (kesilmiş JSON hatasını önler)
 * - parseJsonResponse daha sağlam hale getirildi (markdown fence + BOM temizliği)
 * - Hata mesajı daha açıklayıcı
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
      responseMimeType: 'application/json',
      temperature: 0.1,
      maxOutputTokens: 2048, // ← 1024'ten artırıldı: kesilmiş JSON hatasını önler
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

  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    // Finish reason kontrolü — güvenlik filtresi mi?
    const finishReason = data?.candidates?.[0]?.finishReason;
    throw new Error(
      finishReason && finishReason !== 'STOP'
        ? `Gemini yanıtı tamamlanamadı (${finishReason}). Görseli kontrol edin.`
        : 'Gemini boş yanıt döndürdü.'
    );
  }

  return parseJsonResponse(rawText);
}

/**
 * Safely parse the model's text as JSON.
 * Handles: markdown fences, BOM characters, trailing commas (best-effort).
 */
function parseJsonResponse(text) {
  // 1. BOM ve başındaki/sonundaki boşlukları temizle
  let cleaned = text.replace(/^\uFEFF/, '').trim();

  // 2. ```json ... ``` veya ``` ... ``` bloklarını kaldır
  cleaned = cleaned
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/,  '')
    .trim();

  // 3. İlk { ile son } arasını kes (bazen model önüne metin ekler)
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
