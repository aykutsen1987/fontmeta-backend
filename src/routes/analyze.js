const express = require('express');
const sharp   = require('sharp');
const { upload }           = require('../middleware/upload');
const { analyzeWithGemini } = require('../providers/gemini');
const { analyzeWithGroq }   = require('../providers/groq');

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
// DEĞİŞİKLİKLER (v2):
// - Android zaten 1024px resize yapıyor → backend resize KALDIRILDI (double-resize yok)
//   Sadece JPEG'e çevirme yapılır, boyut küçültülmez.
// - Hata mesajları daha açık
// ─────────────────────────────────────────────────────────────────────────────
router.post('/analyze', upload.single('image'), async (req, res) => {
  try {
    let imageBuffer;
    let mimeType;
    let provider;

    // ── Determine input format ───────────────────────────────────────────────
    if (req.file) {
      imageBuffer = req.file.buffer;
      mimeType    = req.file.mimetype;
      provider    = (req.body?.provider || 'gemini').toLowerCase().trim();
    } else if (req.body?.image) {
      const base64Raw = req.body.image;
      const stripped  = base64Raw.replace(/^data:[^;]+;base64,/, '');
      imageBuffer     = Buffer.from(stripped, 'base64');
      mimeType        = req.body.mimeType || 'image/jpeg';
      provider        = (req.body.provider || 'gemini').toLowerCase().trim();
    } else {
      return res.status(400).json({ error: 'Görsel bulunamadı. "image" alanı zorunludur.' });
    }

    // ── Validate provider ────────────────────────────────────────────────────
    if (!['gemini', 'groq'].includes(provider)) {
      return res.status(400).json({ error: `Geçersiz provider: "${provider}". "gemini" veya "groq" kullanın.` });
    }

    // ── Sadece JPEG'e çevir, yeniden boyutlandırma YOK ──────────────────────
    // Android istemci zaten 1024px'e düşürüp JPEG yapıyor.
    // Burada tekrar resize yapmak: (a) kalite kaybı, (b) gereksiz CPU.
    // Yalnızca JPEG olmayan formatları (PNG, WebP) JPEG'e çeviriyoruz.
    let base64Image;
    if (mimeType === 'image/jpeg') {
      // Zaten JPEG — direkt base64'e çevir
      base64Image = imageBuffer.toString('base64');
    } else {
      // PNG/WebP → JPEG dönüşümü (boyut değiştirme yok)
      const converted = await sharp(imageBuffer)
        .jpeg({ quality: 90 })
        .toBuffer();
      base64Image = converted.toString('base64');
    }
    const finalMime = 'image/jpeg';

    // ── Call the selected provider ───────────────────────────────────────────
    let result;
    if (provider === 'gemini') {
      result = await analyzeWithGemini(base64Image, finalMime);
    } else {
      result = await analyzeWithGroq(base64Image, finalMime);
    }

    // ── Validate response shape ──────────────────────────────────────────────
    if (!result?.tahminler || !Array.isArray(result.tahminler) || result.tahminler.length === 0) {
      return res.status(502).json({
        error: 'AI modeli beklenen formatta yanıt vermedi (tahminler listesi eksik).',
        raw: result,
      });
    }

    return res.json({ provider, result });

  } catch (err) {
    console.error('[/api/analyze]', err.message);
    const status = err.message.includes('API hatası') ? 502 : 500;
    return res.status(status).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/providers
// ─────────────────────────────────────────────────────────────────────────────
router.get('/providers', (_req, res) => {
  res.json({
    gemini: !!process.env.GEMINI_API_KEY,
    groq:   !!process.env.GROQ_API_KEY,
  });
});

module.exports = router;
