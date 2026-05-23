'use strict';

/**
 * FontMatcher — Render sunucusunda piksel tabanlı font karşılaştırma
 *
 * Akış:
 * 1. Telefon OCR metnini + görseli gönderir
 * 2. Sunucu aynı metni bilinen her fontla Canvas'a render eder
 * 3. Render edilen görsel ile gelen görsel histogram ile karşılaştırılır
 * 4. Yüksek güven varsa AI'a gidilmez → sonuç direkt döner
 * 5. Düşük güven → AI'a gönderilir
 *
 * Render'da fontlar: /app/fonts/ klasörüne deploy sırasında konur
 * (render.yaml ile FONT_DIR env ya da static klasör)
 */

const { createCanvas, registerFont, loadImage } = require('canvas');
const path = require('path');
const fs   = require('fs');

// ── Render sunucusundaki font dizini ────────────────────────────────────────
// Render'da repo içindeki backend/fonts/ klasörü kullanılır
const FONT_DIR = process.env.FONT_DIR || path.join(__dirname, '..', 'fonts');

// ── Karşılaştırma sabitleri ──────────────────────────────────────────────────
const RENDER_W       = 600;
const RENDER_H       = 120;
const FONT_SIZE      = 72;
const HISTOGRAM_BINS = 128;

// Yüksek güven eşiği — bunun üstündeyse AI'a gitme
const HIGH_CONFIDENCE = parseFloat(process.env.FONT_MATCH_THRESHOLD || '0.80');

// ── Bilinen font listesi ─────────────────────────────────────────────────────
// { family: Canvas'a kayıt adı, file: FONT_DIR/file, display: kullanıcıya gösterilen ad, category, googleAlt }
const FONT_LIST = [
  { family: 'fm_arial',       file: 'arial.ttf',     display: 'Arial',            category: 'Sans-Serif', googleAlt: 'Inter' },
  { family: 'fm_arialbd',     file: 'arialbd.ttf',   display: 'Arial Bold',       category: 'Sans-Serif', googleAlt: 'Inter' },
  { family: 'fm_ariali',      file: 'ariali.ttf',    display: 'Arial Italic',     category: 'Sans-Serif', googleAlt: 'Inter' },
  { family: 'fm_calibri',     file: 'calibri.ttf',   display: 'Calibri',          category: 'Sans-Serif', googleAlt: 'Nunito' },
  { family: 'fm_calibribd',   file: 'calibrib.ttf',  display: 'Calibri Bold',     category: 'Sans-Serif', googleAlt: 'Nunito' },
  { family: 'fm_calibrii',    file: 'calibrii.ttf',  display: 'Calibri Italic',   category: 'Sans-Serif', googleAlt: 'Nunito' },
  { family: 'fm_times',       file: 'times.ttf',     display: 'Times New Roman',  category: 'Serif',      googleAlt: 'Lora' },
  { family: 'fm_timesbd',     file: 'timesbd.ttf',   display: 'Times NR Bold',    category: 'Serif',      googleAlt: 'Lora' },
  { family: 'fm_timesi',      file: 'timesi.ttf',    display: 'Times NR Italic',  category: 'Serif',      googleAlt: 'Lora' },
  { family: 'fm_georgia',     file: 'georgia.ttf',   display: 'Georgia',          category: 'Serif',      googleAlt: 'Merriweather' },
  { family: 'fm_georgiab',    file: 'georgiab.ttf',  display: 'Georgia Bold',     category: 'Serif',      googleAlt: 'Merriweather' },
  { family: 'fm_verdana',     file: 'verdana.ttf',   display: 'Verdana',          category: 'Sans-Serif', googleAlt: 'Open Sans' },
  { family: 'fm_verdanab',    file: 'verdanab.ttf',  display: 'Verdana Bold',     category: 'Sans-Serif', googleAlt: 'Open Sans' },
  { family: 'fm_segoeui',     file: 'segoeui.ttf',   display: 'Segoe UI',         category: 'Sans-Serif', googleAlt: 'Nunito' },
  { family: 'fm_segoeuib',    file: 'segoeuib.ttf',  display: 'Segoe UI Bold',    category: 'Sans-Serif', googleAlt: 'Nunito' },
  { family: 'fm_tahoma',      file: 'tahoma.ttf',    display: 'Tahoma',           category: 'Sans-Serif', googleAlt: 'Open Sans' },
  { family: 'fm_trebuc',      file: 'trebuc.ttf',    display: 'Trebuchet MS',     category: 'Sans-Serif', googleAlt: 'Source Sans Pro' },
  { family: 'fm_cambria',     file: 'cambria.ttf',   display: 'Cambria',          category: 'Serif',      googleAlt: 'Lora' },
  { family: 'fm_cour',        file: 'cour.ttf',      display: 'Courier New',      category: 'Monospace',  googleAlt: 'Courier Prime' },
  { family: 'fm_courbd',      file: 'courbd.ttf',    display: 'Courier New Bold', category: 'Monospace',  googleAlt: 'Courier Prime' },
  { family: 'fm_helvetica',   file: 'helvetica.ttf', display: 'Helvetica',        category: 'Sans-Serif', googleAlt: 'Inter' },
  { family: 'fm_garamond',    file: 'GARA.TTF',      display: 'Garamond',         category: 'Serif',      googleAlt: 'EB Garamond' },
  { family: 'fm_gothic',      file: 'GOTHIC.TTF',    display: 'Century Gothic',   category: 'Sans-Serif', googleAlt: 'Josefin Sans' },
  { family: 'fm_impact',      file: 'impact.ttf',    display: 'Impact',           category: 'Display',    googleAlt: 'Anton' },
  { family: 'fm_comic',       file: 'comic.ttf',     display: 'Comic Sans MS',    category: 'Handwriting',googleAlt: 'Patrick Hand' },
  { family: 'fm_symbol',      file: 'symbol.ttf',    display: 'Symbol',           category: 'Symbol',     googleAlt: 'Symbol' },
  { family: 'fm_wingding',    file: 'wingding.ttf',  display: 'Wingdings',        category: 'Symbol',     googleAlt: 'Wingdings' },
  { family: 'fm_palatino',    file: 'pala.ttf',      display: 'Palatino',         category: 'Serif',      googleAlt: 'EB Garamond' },
];

// ── Başlangıçta fontları kaydet ──────────────────────────────────────────────
let fontsRegistered = false;
const registeredFonts = []; // sadece dosyası bulunan fontlar

function registerFonts() {
  if (fontsRegistered) return;
  fontsRegistered = true;

  for (const font of FONT_LIST) {
    const filePath = path.join(FONT_DIR, font.file);
    if (fs.existsSync(filePath)) {
      try {
        registerFont(filePath, { family: font.family });
        registeredFonts.push(font);
      } catch (e) {
        console.warn(`[FontMatcher] registerFont basarisiz: ${font.file} — ${e.message}`);
      }
    }
    // Dosya yoksa sessizce atla (fonts/ klasorune konmamissa)
  }
  console.log(`[FontMatcher] ${registeredFonts.length}/${FONT_LIST.length} font yuklendi.`);
}

// ── Ana karşılaştırma fonksiyonu ─────────────────────────────────────────────

/**
 * @param {Buffer} imageBuffer  — gelen görsel (JPEG/PNG)
 * @param {string} ocrText      — OCR ile çıkarılan metin
 * @returns {{ matched: boolean, results: Array, topScore: number }}
 */
async function matchFont(imageBuffer, ocrText) {
  registerFonts();

  if (registeredFonts.length === 0) {
    return { matched: false, results: [], topScore: 0 };
  }

  // Örnek metin
  const sampleText = (ocrText || '').trim().slice(0, 18) || 'AaBbCc 123';

  // Orijinal görseli gri histograma çevir
  const refHistogram = await imageToHistogram(imageBuffer);

  const scores = [];

  for (const font of registeredFonts) {
    try {
      const rendered       = renderText(sampleText, font.family);
      const rendHistogram  = canvasToHistogram(rendered);
      const score          = histogramIntersection(refHistogram, rendHistogram);
      scores.push({ font, score });
    } catch (e) {
      // Bu font render edemediyse atla
    }
  }

  if (scores.length === 0) return { matched: false, results: [], topScore: 0 };

  scores.sort((a, b) => b.score - a.score);

  const topScore = scores[0].score;
  const top3 = scores.slice(0, 3);

  const results = top3.map((s, i) => ({
    font_adi:               s.font.display,
    benzerlik_orani:        `${Math.round(s.score * 100)}%`,
    google_fonts_alternatifi: s.font.googleAlt,
    analiz_notu:            i === 0
      ? `Piksel karsilastirma ile tespit edildi (skor: ${(s.score * 100).toFixed(1)}%)`
      : `Alternatif oneri`,
  }));

  return {
    matched:  topScore >= HIGH_CONFIDENCE,
    topScore,
    result: {
      font_tarzi:        top3[0].font.category,
      tespit_edilen_metin: sampleText,
      tahminler:         results,
    },
  };
}

// ── Yardımcı fonksiyonlar ────────────────────────────────────────────────────

function renderText(text, family) {
  const canvas = createCanvas(RENDER_W, RENDER_H);
  const ctx    = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, RENDER_W, RENDER_H);
  ctx.fillStyle = '#000000';
  ctx.font      = `${FONT_SIZE}px "${family}"`;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 12, RENDER_H / 2);
  return canvas;
}

function canvasToHistogram(canvas) {
  const ctx  = canvas.getContext('2d');
  const data = ctx.getImageData(0, 0, RENDER_W, RENDER_H).data; // RGBA
  return buildHistogram(data);
}

async function imageToHistogram(buffer) {
  // canvas loadImage ile buffer'dan yükle, RENDER_W x RENDER_H'e scale et
  const img    = await loadImage(buffer);
  const canvas = createCanvas(RENDER_W, RENDER_H);
  const ctx    = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, RENDER_W, RENDER_H);
  ctx.drawImage(img, 0, 0, RENDER_W, RENDER_H);
  const data = ctx.getImageData(0, 0, RENDER_W, RENDER_H).data;
  return buildHistogram(data);
}

function buildHistogram(rgbaData) {
  const hist  = new Float32Array(HISTOGRAM_BINS);
  const total = rgbaData.length / 4;
  for (let i = 0; i < rgbaData.length; i += 4) {
    const gray = Math.round(0.299 * rgbaData[i] + 0.587 * rgbaData[i + 1] + 0.114 * rgbaData[i + 2]);
    const bin  = Math.min(Math.floor(gray * HISTOGRAM_BINS / 256), HISTOGRAM_BINS - 1);
    hist[bin]++;
  }
  for (let i = 0; i < HISTOGRAM_BINS; i++) hist[i] /= total;
  return hist;
}

function histogramIntersection(a, b) {
  let sum = 0;
  for (let i = 0; i < HISTOGRAM_BINS; i++) sum += Math.min(a[i], b[i]);
  return sum;
}

module.exports = { matchFont, registerFonts };
