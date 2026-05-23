'use strict';

/**
 * FontMatcher v2 — Yapısal Glyph Karşılaştırması
 *
 * Neden v1 (histogram) yanlış buluyordu?
 * ──────────────────────────────────────
 * Gri histogram sadece görüntünün genel siyah/beyaz dağılımını karşılaştırır.
 * Arial, Calibri, Segoe UI gibi benzer fontlar neredeyse aynı histogramı
 * üretir → skor daima düşük → AI'a düşer → AI da yeterli bağlam olmadan
 * tahmin yapar.
 *
 * v2 çözümü:
 * ──────────
 * 1. OCR metnini her fontla render et (siyah metin, beyaz zemin)
 * 2. Gelen görseli de aynı boyuta normalize et
 * 3. İki karşılaştırma metodu birleştir:
 *    a) Binarize piksel overlap — glyph şekillerini doğrudan karşılaştırır
 *    b) Yatay projeksiyon profili — satır başına düşen siyah piksel sayısı,
 *       x-height ve ascender oranını yakalar
 * 4. Sonuçları ağırlıklı birleştir → en iyi font adayını seç
 *
 * Kalibri'nin yumuşak köşeleri, Arial'ın açılı kesikleri, Segoe UI'ın
 * dik terminalleri → binarize piksel farkı → bu yöntem bu farkı görür.
 *
 * Güven eşiği: 0.72 (v1'den düşürüldü — yapısal benzerlik doğası gereği
 * daha düşük mutlak skorlar üretir ama daha AYIRTEDİCİ sonuçlar verir)
 */

const { createCanvas, registerFont, loadImage } = require('canvas');
const path = require('path');
const fs   = require('fs');

const FONT_DIR = process.env.FONT_DIR || path.join(__dirname, '..', 'fonts');

// Render boyutları — büyük canvas daha iyi glyph detayı sağlar
const RENDER_W  = 800;
const RENDER_H  = 160;
const FONT_SIZE = 80;

// Yapısal eşik — 0.72 üstü güvenilir eşleşme
const HIGH_CONFIDENCE = parseFloat(process.env.FONT_MATCH_THRESHOLD || '0.72');

// Binarize eşiği (0-255) — bu değerin altındaki piksel "siyah" (mürekkep) sayılır
const BINARY_THRESHOLD = 128;

const FONT_LIST = [
  { family: 'fm_arial',     file: 'arial.ttf',    display: 'Arial',            category: 'Sans-Serif',  googleAlt: 'Inter' },
  { family: 'fm_arialbd',   file: 'arialbd.ttf',  display: 'Arial Bold',       category: 'Sans-Serif',  googleAlt: 'Inter' },
  { family: 'fm_ariali',    file: 'ariali.ttf',   display: 'Arial Italic',     category: 'Sans-Serif',  googleAlt: 'Inter' },
  { family: 'fm_calibri',   file: 'calibri.ttf',  display: 'Calibri',          category: 'Sans-Serif',  googleAlt: 'Nunito' },
  { family: 'fm_calibribd', file: 'calibrib.ttf', display: 'Calibri Bold',     category: 'Sans-Serif',  googleAlt: 'Nunito' },
  { family: 'fm_calibrii',  file: 'calibrii.ttf', display: 'Calibri Italic',   category: 'Sans-Serif',  googleAlt: 'Nunito' },
  { family: 'fm_times',     file: 'times.ttf',    display: 'Times New Roman',  category: 'Serif',       googleAlt: 'Lora' },
  { family: 'fm_timesbd',   file: 'timesbd.ttf',  display: 'Times NR Bold',    category: 'Serif',       googleAlt: 'Lora' },
  { family: 'fm_timesi',    file: 'timesi.ttf',   display: 'Times NR Italic',  category: 'Serif',       googleAlt: 'Lora' },
  { family: 'fm_georgia',   file: 'georgia.ttf',  display: 'Georgia',          category: 'Serif',       googleAlt: 'Merriweather' },
  { family: 'fm_georgiab',  file: 'georgiab.ttf', display: 'Georgia Bold',     category: 'Serif',       googleAlt: 'Merriweather' },
  { family: 'fm_verdana',   file: 'verdana.ttf',  display: 'Verdana',          category: 'Sans-Serif',  googleAlt: 'Open Sans' },
  { family: 'fm_verdanab',  file: 'verdanab.ttf', display: 'Verdana Bold',     category: 'Sans-Serif',  googleAlt: 'Open Sans' },
  { family: 'fm_segoeui',   file: 'segoeui.ttf',  display: 'Segoe UI',         category: 'Sans-Serif',  googleAlt: 'Nunito' },
  { family: 'fm_segoeuib',  file: 'segoeuib.ttf', display: 'Segoe UI Bold',    category: 'Sans-Serif',  googleAlt: 'Nunito' },
  { family: 'fm_tahoma',    file: 'tahoma.ttf',   display: 'Tahoma',           category: 'Sans-Serif',  googleAlt: 'Open Sans' },
  { family: 'fm_trebuc',    file: 'trebuc.ttf',   display: 'Trebuchet MS',     category: 'Sans-Serif',  googleAlt: 'Source Sans Pro' },
  { family: 'fm_garamond',  file: 'GARA.TTF',     display: 'Garamond',         category: 'Serif',       googleAlt: 'EB Garamond' },
  { family: 'fm_gothic',    file: 'GOTHIC.TTF',   display: 'Century Gothic',   category: 'Sans-Serif',  googleAlt: 'Josefin Sans' },
  { family: 'fm_impact',    file: 'impact.ttf',   display: 'Impact',           category: 'Display',     googleAlt: 'Anton' },
  { family: 'fm_comic',     file: 'comic.ttf',    display: 'Comic Sans MS',    category: 'Handwriting', googleAlt: 'Patrick Hand' },
  { family: 'fm_symbol',    file: 'symbol.ttf',   display: 'Symbol',           category: 'Symbol',      googleAlt: 'Symbol' },
  { family: 'fm_wingding',  file: 'wingding.ttf', display: 'Wingdings',        category: 'Symbol',      googleAlt: 'Wingdings' },
  { family: 'fm_palatino',  file: 'pala.ttf',     display: 'Palatino',         category: 'Serif',       googleAlt: 'EB Garamond' },
  { family: 'fm_cour',      file: 'cour.ttf',     display: 'Courier New',      category: 'Monospace',   googleAlt: 'Courier Prime' },
  { family: 'fm_courbd',    file: 'courbd.ttf',   display: 'Courier New Bold', category: 'Monospace',   googleAlt: 'Courier Prime' },
];

let fontsRegistered = false;
const registeredFonts = [];

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
        console.warn(`[FontMatcher] registerFont başarısız: ${font.file} — ${e.message}`);
      }
    }
  }
  console.log(`[FontMatcher] ${registeredFonts.length}/${FONT_LIST.length} font yüklendi.`);
}

// ── Ana karşılaştırma fonksiyonu ─────────────────────────────────────────────

/**
 * @param {Buffer} imageBuffer — gelen görsel (JPEG/PNG)
 * @param {string} ocrText    — OCR ile çıkarılan metin (boş olabilir)
 * @returns {{ matched: boolean, results: Array, topScore: number }}
 */
async function matchFont(imageBuffer, ocrText) {
  registerFonts();

  if (registeredFonts.length === 0) {
    return { matched: false, results: [], topScore: 0 };
  }

  // Karşılaştırma için kullanacağımız metin
  // Ayırt edici karakterleri tercih et: G, a, t, l, R
  const raw = (ocrText || '').trim();
  const sampleText = chooseBestSample(raw);

  // Gelen görseli normalize et → binarize piksel dizisi + projeksiyon profili
  const refBinary  = await imageToBinary(imageBuffer);
  const refProfile = horizontalProfile(refBinary);

  const scores = [];

  for (const font of registeredFonts) {
    try {
      const canvas      = renderText(sampleText, font.family);
      const rendBinary  = canvasToBinary(canvas);
      const rendProfile = horizontalProfile(rendBinary);

      // Skor 1: Binarize piksel overlap (glyph şekli)
      const overlapScore = binaryOverlap(refBinary, rendBinary);

      // Skor 2: Projeksiyon profili korelasyonu (x-height, ascender oranı)
      const profileScore = profileCorrelation(refProfile, rendProfile);

      // Ağırlıklı birleştirme — overlap daha güvenilir
      const combined = overlapScore * 0.65 + profileScore * 0.35;

      scores.push({ font, score: combined, overlapScore, profileScore });
    } catch (_) {
      // Bu font render edemediyse atla
    }
  }

  if (scores.length === 0) return { matched: false, results: [], topScore: 0 };

  scores.sort((a, b) => b.score - a.score);

  const topScore = scores[0].score;
  const top3     = scores.slice(0, 3);

  const results = top3.map((s, i) => ({
    font_adi:                 s.font.display,
    benzerlik_orani:          `${Math.round(s.score * 100)}%`,
    google_fonts_alternatifi: s.font.googleAlt,
    analiz_notu:              i === 0
      ? `Yapısal glyph karşılaştırması (overlap: ${(s.overlapScore * 100).toFixed(1)}%, profil: ${(s.profileScore * 100).toFixed(1)}%)`
      : 'Alternatif öneri',
  }));

  console.log(
    `[FontMatcher] Top-3: ` +
    scores.slice(0, 3).map(s => `${s.font.display}=${(s.score*100).toFixed(1)}%`).join(', ')
  );

  return {
    matched:  topScore >= HIGH_CONFIDENCE,
    topScore,
    result: {
      font_tarzi:          top3[0].font.category,
      tespit_edilen_metin: sampleText,
      tahminler:           results,
    },
  };
}

// ── Yardımcı: Örnek metin seçimi ─────────────────────────────────────────────

/**
 * Ayırt edici karakterler içeriyorsa metni olduğu gibi kullan.
 * Çok kısa ya da boşsa iyi bir test dizisi kullan.
 */
function chooseBestSample(raw) {
  if (!raw) return 'AaBbGgRr';

  // İlk 20 karakteri al
  const trimmed = raw.slice(0, 20);

  // Ayırt edici harf testi: G, a, t, l, R içeriyorsa iyi
  const hasDiscriminators = /[GaAtlRr]/.test(trimmed);
  if (hasDiscriminators && trimmed.length >= 4) return trimmed;

  // Yoksa test dizisini öne ekle
  return 'AaGg ' + trimmed.slice(0, 10);
}

// ── Render ───────────────────────────────────────────────────────────────────

function renderText(text, family) {
  const canvas = createCanvas(RENDER_W, RENDER_H);
  const ctx    = canvas.getContext('2d');
  // Beyaz arka plan
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, RENDER_W, RENDER_H);
  // Siyah metin — anti-aliasing açık (gerçek görüntüye daha yakın)
  ctx.fillStyle    = '#000000';
  ctx.font         = `${FONT_SIZE}px "${family}"`;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 16, RENDER_H / 2);
  return canvas;
}

// ── Binarizasyon ─────────────────────────────────────────────────────────────

/**
 * Canvas RGBA verisini Uint8Array'e dönüştür:
 * piksel < BINARY_THRESHOLD (karanlık = mürekkep) → 1, diğeri → 0
 */
function binarize(rgbaData, w, h) {
  const bin = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = rgbaData[i * 4];
    const g = rgbaData[i * 4 + 1];
    const b = rgbaData[i * 4 + 2];
    const gray = (r + g + b) / 3;
    bin[i] = gray < BINARY_THRESHOLD ? 1 : 0;
  }
  return bin;
}

function canvasToBinary(canvas) {
  const ctx  = canvas.getContext('2d');
  const data = ctx.getImageData(0, 0, RENDER_W, RENDER_H).data;
  return binarize(data, RENDER_W, RENDER_H);
}

async function imageToBinary(buffer) {
  const img    = await loadImage(buffer);
  const canvas = createCanvas(RENDER_W, RENDER_H);
  const ctx    = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, RENDER_W, RENDER_H);
  // Görüntüyü metin bloğuna oranlı olacak şekilde ortaya yerleştir
  const scale = Math.min(RENDER_W / img.width, RENDER_H / img.height, 1);
  const dw    = img.width  * scale;
  const dh    = img.height * scale;
  const dx    = (RENDER_W - dw) / 2;
  const dy    = (RENDER_H - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
  const data = ctx.getImageData(0, 0, RENDER_W, RENDER_H).data;
  return binarize(data, RENDER_W, RENDER_H);
}

// ── Karşılaştırma metrikleri ──────────────────────────────────────────────────

/**
 * Binarize piksel overlap (Dice katsayısı benzeri)
 * İki binary dizinin kesişim pikseli / (birleşim piksel) oranı.
 * Glyph şekillerini doğrudan karşılaştırır.
 */
function binaryOverlap(a, b) {
  let intersection = 0;
  let unionCount   = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === 1 && b[i] === 1) intersection++;
    if (a[i] === 1 || b[i] === 1) unionCount++;
  }
  if (unionCount === 0) return 0;
  // Dice: 2 * intersection / (|A| + |B|)  ← daha istikrarlı
  const aCount = a.reduce((s, v) => s + v, 0);
  const bCount = b.reduce((s, v) => s + v, 0);
  const denom  = aCount + bCount;
  return denom === 0 ? 0 : (2 * intersection) / denom;
}

/**
 * Yatay projeksiyon profili: her satırdaki siyah piksel sayısını normalize eder.
 * X-height oranı, ascender/descender varlığı → fontlara özgü imza.
 */
function horizontalProfile(binary) {
  const profile = new Float32Array(RENDER_H);
  for (let y = 0; y < RENDER_H; y++) {
    let count = 0;
    for (let x = 0; x < RENDER_W; x++) {
      count += binary[y * RENDER_W + x];
    }
    profile[y] = count / RENDER_W;
  }
  return profile;
}

/**
 * İki profil arasındaki Pearson korelasyonu (−1 … +1 → 0 … 1 normalize edilir).
 */
function profileCorrelation(a, b) {
  const n   = a.length;
  let sumA  = 0, sumB = 0;
  for (let i = 0; i < n; i++) { sumA += a[i]; sumB += b[i]; }
  const meanA = sumA / n;
  const meanB = sumB / n;

  let num = 0, varA = 0, varB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    num  += da * db;
    varA += da * da;
    varB += db * db;
  }
  const denom = Math.sqrt(varA * varB);
  if (denom === 0) return 0;
  // Pearson: −1…+1 → (r+1)/2 → 0…1
  return (num / denom + 1) / 2;
}

module.exports = { matchFont, registerFonts };
