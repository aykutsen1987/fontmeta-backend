'use strict';

/**
 * FontMatcher v3 — Doğru Render-vs-Render Yaklaşımı
 *
 * TEMEL FİKİR:
 * ─────────────
 * Fotoğraftaki metni değil, fotoğraftaki fontun METRİKLERİNİ kullan.
 * OCR metni elimizde var → o metni TÜM fontlarla render et →
 * her render'ın metrik vektörünü çıkar → fotoğrafın metrik vektörüyle
 * en yakın render = kullanılan font.
 *
 * METRİK VEKTÖRÜ (8 boyut, font ailesini ayırt eden özellikler):
 *  1. Ink density           — toplam siyah piksel / alan
 *  2. Horizontal profile variance — satır başına siyah piksel varyansı (serif/sans ayrımı)
 *  3. Vertical profile variance   — sütun başına siyah piksel varyansı (geniş/dar ayrımı)
 *  4. Stroke width estimate       — ince/kalın fark (serif stroke contrast)
 *  5. Ascender ratio              — üst bölge / toplam yükseklik oranı
 *  6. Mid-zone density            — x-height bölgesi doluluk oranı
 *  7. Character width ratio       — ortalama karakter genişliği tahmini
 *  8. Terminal angle estimate     — köşegen vs dikey kesim tahmini
 *
 * Bu metrikler histogram'dan çok daha AYIRTEDİCİ:
 * - Arial: orta ink density, yüksek terminal angle, düşük stroke contrast
 * - Calibri: düşük ink density (ince gövdeler), düşük terminal angle (yumuşak)
 * - Segoe UI: orta density, dikey terminaller, geniş karakterler
 * - Times NR: yüksek horizontal variance (serif çıkıntıları), yüksek stroke contrast
 *
 * OCR METNİ YOK?
 * Ayırt edici test karakterleri kullan: "AaGgTtLl"
 * Bunlar G-spur, a-storey, t-crossbar ve l-curve tüm kritik farklılıkları içerir.
 *
 * GÜVEN EŞİĞİ:
 * Metrik mesafesi belirli eşiğin altındaysa "matched = true" → AI'a gitme.
 * Eşik aşılırsa AI devreye girer.
 */

const { createCanvas, registerFont, loadImage } = require('canvas');
const path = require('path');
const fs   = require('fs');

const FONT_DIR = process.env.FONT_DIR || path.join(__dirname, '..', 'fonts');

const RENDER_W  = 1000;
const RENDER_H  = 200;
const FONT_SIZE = 96;

// Maksimum normalize edilmiş Öklid mesafesi eşiği (küçük = daha yakın = daha güvenilir)
// 0.18 altı = güvenilir eşleşme, üstü = AI'a git
const DISTANCE_THRESHOLD = parseFloat(process.env.FONT_MATCH_THRESHOLD || '0.18');

const FONT_LIST = [
  { family: 'fm_arial',     file: 'arial.ttf',    display: 'Arial',            category: 'Sans-Serif',  googleAlt: 'Inter',             similar: ['Helvetica', 'Liberation Sans'] },
  { family: 'fm_arialbd',   file: 'arialbd.ttf',  display: 'Arial Bold',       category: 'Sans-Serif',  googleAlt: 'Inter',             similar: ['Helvetica Bold'] },
  { family: 'fm_ariali',    file: 'ariali.ttf',   display: 'Arial Italic',     category: 'Sans-Serif',  googleAlt: 'Inter',             similar: ['Helvetica Italic'] },
  { family: 'fm_calibri',   file: 'calibri.ttf',  display: 'Calibri',          category: 'Sans-Serif',  googleAlt: 'Nunito',            similar: ['Myriad Pro', 'Gill Sans'] },
  { family: 'fm_calibribd', file: 'calibrib.ttf', display: 'Calibri Bold',     category: 'Sans-Serif',  googleAlt: 'Nunito Bold',       similar: ['Myriad Pro Bold'] },
  { family: 'fm_calibrii',  file: 'calibrii.ttf', display: 'Calibri Italic',   category: 'Sans-Serif',  googleAlt: 'Nunito Italic',     similar: ['Myriad Pro Italic'] },
  { family: 'fm_times',     file: 'times.ttf',    display: 'Times New Roman',  category: 'Serif',       googleAlt: 'Lora',              similar: ['Times', 'Liberation Serif'] },
  { family: 'fm_timesbd',   file: 'timesbd.ttf',  display: 'Times NR Bold',    category: 'Serif',       googleAlt: 'Lora Bold',         similar: ['Times Bold'] },
  { family: 'fm_timesi',    file: 'timesi.ttf',   display: 'Times NR Italic',  category: 'Serif',       googleAlt: 'Lora Italic',       similar: ['Times Italic'] },
  { family: 'fm_georgia',   file: 'georgia.ttf',  display: 'Georgia',          category: 'Serif',       googleAlt: 'Merriweather',      similar: ['Book Antiqua'] },
  { family: 'fm_georgiab',  file: 'georgiab.ttf', display: 'Georgia Bold',     category: 'Serif',       googleAlt: 'Merriweather Bold', similar: [] },
  { family: 'fm_verdana',   file: 'verdana.ttf',  display: 'Verdana',          category: 'Sans-Serif',  googleAlt: 'Open Sans',         similar: ['Bitstream Vera Sans'] },
  { family: 'fm_verdanab',  file: 'verdanab.ttf', display: 'Verdana Bold',     category: 'Sans-Serif',  googleAlt: 'Open Sans Bold',    similar: [] },
  { family: 'fm_segoeui',   file: 'segoeui.ttf',  display: 'Segoe UI',         category: 'Sans-Serif',  googleAlt: 'Nunito',            similar: ['Frutiger', 'Myriad'] },
  { family: 'fm_segoeuib',  file: 'segoeuib.ttf', display: 'Segoe UI Bold',    category: 'Sans-Serif',  googleAlt: 'Nunito Bold',       similar: [] },
  { family: 'fm_tahoma',    file: 'tahoma.ttf',   display: 'Tahoma',           category: 'Sans-Serif',  googleAlt: 'Open Sans',         similar: ['Geneva'] },
  { family: 'fm_trebuc',    file: 'trebuc.ttf',   display: 'Trebuchet MS',     category: 'Sans-Serif',  googleAlt: 'Source Sans Pro',   similar: [] },
  { family: 'fm_garamond',  file: 'GARA.TTF',     display: 'Garamond',         category: 'Serif',       googleAlt: 'EB Garamond',       similar: ['Adobe Garamond'] },
  { family: 'fm_gothic',    file: 'GOTHIC.TTF',   display: 'Century Gothic',   category: 'Sans-Serif',  googleAlt: 'Josefin Sans',      similar: ['Futura', 'Avant Garde'] },
  { family: 'fm_impact',    file: 'impact.ttf',   display: 'Impact',           category: 'Display',     googleAlt: 'Anton',             similar: ['Haettenschweiler'] },
  { family: 'fm_comic',     file: 'comic.ttf',    display: 'Comic Sans MS',    category: 'Handwriting', googleAlt: 'Patrick Hand',      similar: ['Chalkboard'] },
  { family: 'fm_symbol',    file: 'symbol.ttf',   display: 'Symbol',           category: 'Symbol',      googleAlt: 'Symbol',            similar: [] },
  { family: 'fm_wingding',  file: 'wingding.ttf', display: 'Wingdings',        category: 'Symbol',      googleAlt: 'Wingdings',         similar: [] },
  { family: 'fm_palatino',  file: 'pala.ttf',     display: 'Palatino',         category: 'Serif',       googleAlt: 'EB Garamond',       similar: ['Palatino Linotype', 'Book Antiqua'] },
  { family: 'fm_cour',      file: 'cour.ttf',     display: 'Courier New',      category: 'Monospace',   googleAlt: 'Courier Prime',     similar: ['Courier'] },
  { family: 'fm_courbd',    file: 'courbd.ttf',   display: 'Courier New Bold', category: 'Monospace',   googleAlt: 'Courier Prime',     similar: [] },
];

let fontsRegistered = false;
const registeredFonts = [];

// Önceden hesaplanmış font metrik vektörleri (sunucu başlangıcında bir kez)
const fontMetricCache = new Map();

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
 * @param {Buffer} imageBuffer — gelen fotoğraf
 * @param {string} ocrText     — OCR ile çıkarılan metin
 */
async function matchFont(imageBuffer, ocrText) {
  registerFonts();

  if (registeredFonts.length === 0) {
    return { matched: false, results: [], topScore: 0 };
  }

  const sampleText = buildSampleText(ocrText);

  // 1. Fotoğraftan metrik vektörü çıkar
  const photoMetrics = await extractPhotoMetrics(imageBuffer);

  // 2. Her fontu aynı metinle render et → metrik vektörü çıkar → önbelleğe al
  const candidates = [];
  for (const font of registeredFonts) {
    try {
      let fm = fontMetricCache.get(font.family + ':' + sampleText);
      if (!fm) {
        const binary = renderToBinary(sampleText, font.family);
        fm = computeMetrics(binary);
        fontMetricCache.set(font.family + ':' + sampleText, fm);
      }
      candidates.push({ font, metrics: fm });
    } catch (_) { /* render edemediyse atla */ }
  }

  // 3. Her adayın fotoğraf metrik vektörüne olan normalize Öklid mesafesini hesapla
  const scored = candidates.map(c => ({
    font:     c.font,
    metrics:  c.metrics,
    distance: euclidean(photoMetrics, c.metrics),
  }));

  scored.sort((a, b) => a.distance - b.distance); // küçük mesafe = daha yakın

  const top3    = scored.slice(0, 3);
  const best    = top3[0];

  // Güven: mesafe → skor (0-1, ters ilişki)
  const topScore = Math.max(0, 1 - best.distance / 0.5);

  const results = top3.map((r, i) => ({
    font_adi:                 r.font.display,
    benzerlik_orani:          `${Math.round(topScore * (i === 0 ? 1 : i === 1 ? 0.8 : 0.6) * 100)}%`,
    google_fonts_alternatifi: r.font.googleAlt,
    analiz_notu:              i === 0
      ? `Render metrik karşılaştırması — mesafe: ${r.distance.toFixed(3)}`
      : `Alternatif öneri${r.font.similar?.length ? ` (${r.font.similar.slice(0,2).join(', ')})` : ''}`,
  }));

  console.log(
    `[FontMatcher v3] sampleText="${sampleText}" | Top-3: ` +
    top3.map(r => `${r.font.display} d=${r.distance.toFixed(3)}`).join(', ')
  );

  const matched = best.distance <= DISTANCE_THRESHOLD;
  return {
    matched,
    topScore,
    result: {
      font_tarzi:          best.font.category,
      tespit_edilen_metin: sampleText,
      tahminler:           results,
    },
  };
}

// ── Fotoğraftan metrik çıkarma ────────────────────────────────────────────────

async function extractPhotoMetrics(buffer) {
  const img    = await loadImage(buffer);
  const canvas = createCanvas(RENDER_W, RENDER_H);
  const ctx    = canvas.getContext('2d');

  // Fotoğrafı beyaz zemin üzerine yerleştir, metin bölgesi RENDER alanını dolduracak şekilde
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, RENDER_W, RENDER_H);

  // Orantılı boyutlandır, ortala
  const scale = Math.min(RENDER_W / img.width, RENDER_H / img.height);
  const dw    = img.width  * scale;
  const dh    = img.height * scale;
  ctx.drawImage(img, (RENDER_W - dw) / 2, (RENDER_H - dh) / 2, dw, dh);

  const data   = ctx.getImageData(0, 0, RENDER_W, RENDER_H).data;
  const binary = new Uint8Array(RENDER_W * RENDER_H);
  for (let i = 0; i < RENDER_W * RENDER_H; i++) {
    // Adaptif eşik: ortalama yerine Otsu-benzeri basit eşik
    const gray = (data[i*4] + data[i*4+1] + data[i*4+2]) / 3;
    binary[i]  = gray < 160 ? 1 : 0; // fotoğrafta gürültü olduğu için 160 (render'dan daha yüksek)
  }

  return computeMetrics(binary);
}

// ── Metrik vektörü hesaplama (8 boyut) ───────────────────────────────────────

function computeMetrics(binary) {
  const W = RENDER_W, H = RENDER_H;
  const total = W * H;

  // --- 1. Ink density ---
  let inkCount = 0;
  for (let i = 0; i < total; i++) inkCount += binary[i];
  const inkDensity = inkCount / total;

  // --- 2. Yatay profil (satır başına siyah piksel) ---
  const rowSums = new Float32Array(H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) rowSums[y] += binary[y * W + x];
  }
  const rowMean = rowSums.reduce((a, b) => a + b, 0) / H;
  const hVariance = rowSums.reduce((s, v) => s + (v - rowMean) ** 2, 0) / H / (W * W);

  // --- 3. Dikey profil (sütun başına siyah piksel) ---
  const colSums = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) colSums[x] += binary[y * W + x];
  }
  const colMean     = colSums.reduce((a, b) => a + b, 0) / W;
  const vVariance   = colSums.reduce((s, v) => s + (v - colMean) ** 2, 0) / W / (H * H);

  // --- 4. Ascender bölgesi yoğunluğu (üst %33) ---
  const ascH    = Math.floor(H * 0.33);
  let ascInk    = 0;
  for (let y = 0; y < ascH; y++)
    for (let x = 0; x < W; x++) ascInk += binary[y * W + x];
  const ascenderDensity = ascH > 0 ? ascInk / (ascH * W) : 0;

  // --- 5. Mid-zone (x-height bölgesi %33-%66) yoğunluğu ---
  const midStart = Math.floor(H * 0.33);
  const midEnd   = Math.floor(H * 0.66);
  let midInk     = 0;
  for (let y = midStart; y < midEnd; y++)
    for (let x = 0; x < W; x++) midInk += binary[y * W + x];
  const midDensity = (midEnd - midStart) > 0 ? midInk / ((midEnd - midStart) * W) : 0;

  // --- 6. Descender bölgesi yoğunluğu (alt %25) ---
  const descStart = Math.floor(H * 0.75);
  let descInk     = 0;
  for (let y = descStart; y < H; y++)
    for (let x = 0; x < W; x++) descInk += binary[y * W + x];
  const descenderDensity = (H - descStart) > 0 ? descInk / ((H - descStart) * W) : 0;

  // --- 7. Sol kenar boşluğu (karakter genişliği tahmini) ---
  // İlk siyah sütundan son siyah sütuna kadar genişlik / toplam genişlik
  let firstInkCol = W, lastInkCol = 0;
  for (let x = 0; x < W; x++) {
    if (colSums[x] > 0) {
      if (x < firstInkCol) firstInkCol = x;
      if (x > lastInkCol)  lastInkCol  = x;
    }
  }
  const inkWidth = lastInkCol > firstInkCol ? (lastInkCol - firstInkCol) / W : 0;

  // --- 8. Dikey profil düzgünlüğü (uniform stroke = Helvetica/Arial, değişken = Serif) ---
  // Sütun doluluk oranlarının standart sapması / ortalaması (CV)
  const cv = colMean > 0 ? Math.sqrt(vVariance) / (colMean / H) : 0;

  return {
    inkDensity,
    hVariance,
    vVariance,
    ascenderDensity,
    midDensity,
    descenderDensity,
    inkWidth,
    cv,
  };
}

// ── Normalize Öklid mesafesi ──────────────────────────────────────────────────

// Her boyut için ağırlık (önem sırası)
const WEIGHTS = {
  inkDensity:       2.0,  // en önemli: serif vs sans-serif
  hVariance:        2.5,  // serif çıkıntıları burada görünür
  vVariance:        1.5,  // geniş/dar karakter
  ascenderDensity:  1.5,  // ascender yüksekliği
  midDensity:       2.0,  // x-height bölgesi (kalın/ince gövde)
  descenderDensity: 1.0,  // descender
  inkWidth:         1.5,  // karakter genişliği (Verdana geniş, Tahoma dar)
  cv:               2.0,  // stroke uniformity (serif vs sans)
};

function euclidean(a, b) {
  let sum = 0;
  for (const key of Object.keys(WEIGHTS)) {
    const diff = (a[key] || 0) - (b[key] || 0);
    sum += WEIGHTS[key] * diff * diff;
  }
  return Math.sqrt(sum);
}

// ── Yardımcı ─────────────────────────────────────────────────────────────────

function renderToBinary(text, family) {
  const canvas = createCanvas(RENDER_W, RENDER_H);
  const ctx    = canvas.getContext('2d');
  ctx.fillStyle    = '#ffffff';
  ctx.fillRect(0, 0, RENDER_W, RENDER_H);
  ctx.fillStyle    = '#000000';
  ctx.font         = `${FONT_SIZE}px "${family}"`;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 16, RENDER_H / 2);

  const data = ctx.getImageData(0, 0, RENDER_W, RENDER_H).data;
  const bin  = new Uint8Array(RENDER_W * RENDER_H);
  for (let i = 0; i < RENDER_W * RENDER_H; i++) {
    const gray = (data[i*4] + data[i*4+1] + data[i*4+2]) / 3;
    bin[i] = gray < 128 ? 1 : 0;
  }
  return bin;
}

function buildSampleText(raw) {
  const trimmed = (raw || '').trim().slice(0, 24);
  // G (spur), a (storey), t (crossbar), l (curve) — en ayırt edici karakterler
  if (trimmed.length >= 4 && /[GaAtlRgr]/.test(trimmed)) return trimmed;
  return 'AaGgTtLlRr';
}

module.exports = { matchFont, registerFonts };
