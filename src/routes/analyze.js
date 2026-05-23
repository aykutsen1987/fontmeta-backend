'use strict';

const express = require('express');
const sharp   = require('sharp');
const { upload }            = require('../middleware/upload');
const { analyzeWithGemini } = require('../providers/gemini');
const { analyzeWithGroq }   = require('../providers/groq');
const { matchFont }         = require('../fontmatcher');

const router = express.Router();

/**
 * POST /api/analyze
 *
 * Akis (v3 — hibrit yerel + AI):
 * 1. Gorsel al (multipart veya base64 JSON)
 * 2. FontMatcher ile piksel karsilastirma yap (backend/fonts/ klasoru)
 * 3. Yuksek guven (>= 0.80) → AI'a gitme, direkt don
 * 4. Dusuk guven → Gemini veya Groq'a gonder
 * 5. AI basarisiz → FontMatcher sonucunu kullan (varsa)
 *
 * Body: { image: "<base64>", mimeType: "image/jpeg", provider: "gemini"|"groq", ocrText: "..." }
 * ocrText: Android'den OCR sonucu (opsiyonel, varsa karsilastirma daha dogru)
 */
router.post('/analyze', upload.single('image'), async (req, res) => {
  try {
    let imageBuffer, mimeType, provider, ocrText;

    // ── Girdi formatini belirle ──────────────────────────────────────────────
    if (req.file) {
      imageBuffer = req.file.buffer;
      mimeType    = req.file.mimetype;
      provider    = (req.body?.provider  || 'gemini').toLowerCase().trim();
      ocrText     = req.body?.ocrText    || '';
    } else if (req.body?.image) {
      const stripped = req.body.image.replace(/^data:[^;]+;base64,/, '');
      imageBuffer    = Buffer.from(stripped, 'base64');
      mimeType       = req.body.mimeType  || 'image/jpeg';
      provider       = (req.body.provider || 'gemini').toLowerCase().trim();
      ocrText        = req.body.ocrText   || '';
    } else {
      return res.status(400).json({ error: 'Gorsel bulunamadi. "image" alani zorunludur.' });
    }

    if (!['gemini', 'groq'].includes(provider)) {
      return res.status(400).json({ error: `Gecersiz provider: "${provider}".` });
    }

    // ── JPEG'e cevir (sadece gerekirse) ─────────────────────────────────────
    let jpegBuffer;
    if (mimeType === 'image/jpeg') {
      jpegBuffer = imageBuffer;
    } else {
      jpegBuffer = await sharp(imageBuffer).jpeg({ quality: 90 }).toBuffer();
    }

    // ── 1. ADIM: Yerel piksel karsilastirma ─────────────────────────────────
    let localMatch = null;
    try {
      localMatch = await matchFont(jpegBuffer, ocrText);
    } catch (e) {
      console.warn('[FontMatcher] hata:', e.message);
    }

    // Yuksek guven → AI'a gitmeden don
    if (localMatch?.matched) {
      console.log(`[analyze] Yerel eslesme: ${localMatch.result.tahminler[0].font_adi} (${localMatch.topScore.toFixed(2)})`);
      return res.json({
        provider: 'local',
        source:   'pixel-match',
        result:   localMatch.result,
      });
    }

    // ── 2. ADIM: AI analizi ──────────────────────────────────────────────────
    const base64Image = jpegBuffer.toString('base64');
    let result;

    try {
      if (provider === 'gemini') {
        result = await analyzeWithGemini(base64Image, 'image/jpeg');
      } else {
        result = await analyzeWithGroq(base64Image, 'image/jpeg');
      }
    } catch (aiErr) {
      // AI basarisiz → dusuk guvenli yerel sonucu kullan (varsa)
      if (localMatch?.result) {
        console.warn('[analyze] AI basarisiz, yerel sonuc kullaniliyor:', aiErr.message);
        return res.json({
          provider: 'local-fallback',
          source:   'pixel-match-fallback',
          result:   localMatch.result,
        });
      }
      throw aiErr;
    }

    // ── Yanit dogrulama ──────────────────────────────────────────────────────
    if (!result?.tahminler || !Array.isArray(result.tahminler) || result.tahminler.length === 0) {
      return res.status(502).json({
        error: 'AI modeli beklenen formatta yanit vermedi.',
        raw:   result,
      });
    }

    return res.json({ provider, source: 'ai', result });

  } catch (err) {
    console.error('[/api/analyze]', err.message);
    const status = err.message.includes('API hatasi') ? 502 : 500;
    return res.status(status).json({ error: err.message });
  }
});

// GET /api/providers
router.get('/providers', (_req, res) => {
  res.json({
    gemini: !!process.env.GEMINI_API_KEY,
    groq:   !!process.env.GROQ_API_KEY,
  });
});

module.exports = router;
