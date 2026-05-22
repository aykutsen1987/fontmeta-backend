const express = require('express');
const sharp = require('sharp');
const { upload } = require('../middleware/upload');
const { analyzeWithGemini } = require('../providers/gemini');
const { analyzeWithGroq } = require('../providers/groq');

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/analyze
//
// Accepts TWO formats from the Android client:
//
//  1. multipart/form-data
//     - Field "image"    : the image file
//     - Field "provider" : "gemini" | "groq"  (default: "gemini")
//
//  2. application/json
//     - { "image": "<base64 string>", "mimeType": "image/jpeg", "provider": "gemini" }
//
// Returns:
//   { "provider": "gemini", "result": { ...font JSON... } }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/analyze', upload.single('image'), async (req, res) => {
  try {
    let imageBuffer;
    let mimeType;
    let provider;

    // ── Determine input format ───────────────────────────────────────────────
    if (req.file) {
      // Multipart upload
      imageBuffer = req.file.buffer;
      mimeType = req.file.mimetype;
      provider = (req.body?.provider || 'gemini').toLowerCase().trim();
    } else if (req.body?.image) {
      // JSON body with base64 image
      const base64Raw = req.body.image;
      // Strip data-URI prefix if present (data:image/jpeg;base64,...)
      const stripped = base64Raw.replace(/^data:[^;]+;base64,/, '');
      imageBuffer = Buffer.from(stripped, 'base64');
      mimeType = req.body.mimeType || 'image/jpeg';
      provider = (req.body.provider || 'gemini').toLowerCase().trim();
    } else {
      return res.status(400).json({ error: 'Görsel bulunamadı. "image" alanı zorunludur.' });
    }

    // ── Validate provider ────────────────────────────────────────────────────
    if (!['gemini', 'groq'].includes(provider)) {
      return res.status(400).json({ error: `Geçersiz provider: "${provider}". "gemini" veya "groq" kullanın.` });
    }

    // ── Resize + optimise image before sending to AI ─────────────────────────
    // Max 1024px on longest side, convert to JPEG to reduce token cost
    const optimised = await sharp(imageBuffer)
      .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();

    const base64Image = optimised.toString('base64');
    const finalMime = 'image/jpeg';

    // ── Call the selected provider ───────────────────────────────────────────
    let result;
    if (provider === 'gemini') {
      result = await analyzeWithGemini(base64Image, finalMime);
    } else {
      result = await analyzeWithGroq(base64Image, finalMime);
    }

    // ── Validate response shape ──────────────────────────────────────────────
    if (!result?.tahminler || !Array.isArray(result.tahminler)) {
      return res.status(502).json({
        error: 'AI modeli beklenen formatta yanıt vermedi.',
        raw: result,
      });
    }

    return res.json({ provider, result });

  } catch (err) {
    console.error('[/api/analyze]', err.message);

    // Pass provider-level errors back with a clear message
    const status = err.message.includes('API hatası') ? 502 : 500;
    return res.status(status).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/providers
// Returns which providers are currently configured on the server.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/providers', (_req, res) => {
  res.json({
    gemini: !!process.env.GEMINI_API_KEY,
    groq:   !!process.env.GROQ_API_KEY,
  });
});

module.exports = router;
