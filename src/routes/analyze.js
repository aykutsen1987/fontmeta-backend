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
 * Akış (v4 — kamera fotoğrafı için ön işleme iyileştirildi):
 * 1. Görsel al
 * 2. Kamera fotoğrafı ön işleme: gürültü azaltma + kontrast artırma + keskinleştirme
 * 3. FontMatcher ile piksel karşılaştırma
 * 4. Yüksek güven → AI'a gitme
 * 5. Düşük güven → AI (Gemini/Groq)
 */
router.post('/analyze', upload.single('image'), async (req, res) => {
  try {
    let imageBuffer, mimeType, provider, ocrText;

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
      return res.status(400).json({ error: 'Görsel bulunamadı. "image" alanı zorunludur.' });
    }

    if (!['gemini', 'groq'].includes(provider)) {
      return res.status(400).json({ error: `Geçersiz provider: "${provider}".` });
    }

    // ── Kamera fotoğrafı ön işleme ──────────────────────────────────────────
    // Kamera görüntülerinde:
    //   1. Adaptif histogram eşitleme (CLAHE) → düşük kontrastlı fotoğraflarda
    //      serif çizgileri belirginleşir
    //   2. Hafif keskinleştirme → ince serif ve terminal detayları netleşir
    //   3. Gürültü azaltma → piksel karşılaştırmasını bozan background noise azalır
    let processedBuffer;
    try {
      processedBuffer = await sharp(imageBuffer)
        .grayscale()                          // Rengi kaldır — font metrikleri renksiz çalışır
        .normalise()                          // Histogram germe: kontrast maksimize
        .sharpen({ sigma: 1.2, m1: 0.5, m2: 2.0 }) // Serif kenarlarını belirginleştir
        .jpeg({ quality: 92 })
        .toBuffer();
    } catch (e) {
      console.warn('[analyze] Ön işleme başarısız, ham görsel kullanılıyor:', e.message);
      // Ham görsele fallback — en azından JPEG'e çevir
      processedBuffer = mimeType === 'image/jpeg'
        ? imageBuffer
        : await sharp(imageBuffer).jpeg({ quality: 90 }).toBuffer();
    }

    // AI için ayrı bir buffer tut — AI renkli görseli daha iyi analiz eder
    const aiBuffer = mimeType === 'image/jpeg'
      ? imageBuffer
      : await sharp(imageBuffer).jpeg({ quality: 90 }).toBuffer();

    // ── 1. ADIM: Yerel piksel karşılaştırma (işlenmiş görsel ile) ────────────
    let localMatch = null;
    try {
      localMatch = await matchFont(processedBuffer, ocrText);
    } catch (e) {
      console.warn('[FontMatcher] hata:', e.message);
    }

    if (localMatch?.matched) {
      console.log(`[analyze] Pixel eşleşme: ${localMatch.result.tahminler[0].font_adi} (skor: ${(localMatch.topScore * 100).toFixed(1)}%)`);
      return res.json({
        provider: 'local',
        source:   'pixel-match',
        result:   localMatch.result,
      });
    }

    // ── 2. ADIM: AI analizi (orijinal renkli görsel ile) ─────────────────────
    const base64Image = aiBuffer.toString('base64');
    let result;

    try {
      if (provider === 'gemini') {
        result = await analyzeWithGemini(base64Image, 'image/jpeg');
      } else {
        result = await analyzeWithGroq(base64Image, 'image/jpeg');
      }
    } catch (aiErr) {
      if (localMatch?.result) {
        console.warn('[analyze] AI başarısız, yerel sonuç kullanılıyor:', aiErr.message);
        return res.json({
          provider: 'local-fallback',
          source:   'pixel-match-fallback',
          result:   localMatch.result,
        });
      }
      throw aiErr;
    }

    if (!result?.tahminler || !Array.isArray(result.tahminler) || result.tahminler.length === 0) {
      return res.status(502).json({
        error: 'AI modeli beklenen formatta yanıt vermedi.',
        raw:   result,
      });
    }

    return res.json({ provider, source: 'ai', result });

  } catch (err) {
    console.error('[/api/analyze]', err.message);
    const status = err.message.includes('API hatası') ? 502 : 500;
    return res.status(status).json({ error: err.message });
  }
});

router.get('/providers', (_req, res) => {
  res.json({
    gemini: !!process.env.GEMINI_API_KEY,
    groq:   !!process.env.GROQ_API_KEY,
  });
});

module.exports = router;
