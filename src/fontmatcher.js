'use strict';

/**
 * FontMatcher v4 — Serif-Aware Render Karşılaştırma
 *
 * v4 DEĞİŞİKLİKLER:
 * ─────────────────
 * 1. buildSampleText: Fallback metin "HhIiTtFf1" → serif çıkıntıları H/I/T'de çok belirgin
 * 2. Yeni metrik: serifScore — harflerin köşe/kenar piksel yoğunluğu (serif çıkıntıları)
 * 3. Yeni metrik: strokeContrast — stroke kalınlık farkı (Times'ın yüksek kontrastı)
 * 4. WEIGHTS: serif metrikleri daha yüksek ağırlık aldı
 * 5. DISTANCE_THRESHOLD: 0.18 → 0.20 (serif fontlar için biraz daha gevşek)
 * 6. Kanal normalizasyonu: her metrik 0-1 aralığında normalize ediliyor
 *
 * TEMEL FİKİR (korundu):
 * OCR metni → tüm fontlarla render et → metrik vektörü → Öklid mesafesi
 *
 * METRİK VEKTÖRÜ (10 boyut):
 *  1. inkDensity           — toplam siyah piksel / alan
 *  2. hVariance            — yatay profil varyansı (serif çıkıntıları)
 *  3. vVariance            — dikey profil varyansı
 *  4. ascenderDensity      — ascender bölgesi yoğunluğu
 *  5. midDensity           — x-height bölgesi yoğunluğu (serif x-height tespiti)
 *  6. descenderDensity     — descender bölgesi
 *  7. inkWidth             — karakter genişliği tahmini
 *  8. cv                   — stroke uniformity (serif'te daha yüksek)
 *  9. serifScore [YENİ]    — köşe piksel yoğunluğu (serif çıkıntı tespiti)
 * 10. strokeContrast [YENİ] — ince/kalın stroke farkı (Times'ta çok yüksek)
 */

const { createCanvas, registerFont, loadImage } = require('canvas');
const path = require('path');
const fs   = require('fs');

const FONT_DIR = process.env.FONT_DIR || path.join(__dirname, '..', 'fonts');

const RENDER_W  = 1000;
const RENDER_H  = 200;
const FONT_SIZE = 96;

// 0.18 → 0.20: serif fontlar için biraz daha toleranslı
const DISTANCE_THRESHOLD = parseFloat(process.env.FONT_MATCH_THRESHOLD || '0.20');

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

async function matchFont(imageBuffer, ocrText) {
  registerFonts();

  if (registeredFonts.length === 0) {
    return { matched: false, results: [], topScore: 0 };
  }

  const sampleText = buildSampleText(ocrText);
  const photoMetrics = await extractPhotoMetrics(imageBuffer);

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

  const scored = candidates.map(c => ({
    font:     c.font,
    metrics:  c.metrics,
    distance: euclidean(photoMetrics, c.metrics),
  }));

  scored.sort((a, b) => a.distance - b.distance);

  const top3    = scored.slice(0, 3);
  const best    = top3[0];
  const topScore = Math.max(0, 1 - best.distance / 0.5);

  const results = top3.map((r, i) => ({
    font_adi:                 r.font.display,
    benzerlik_orani:          `${Math.round(topScore * (i === 0 ? 1 : i === 1 ? 0.8 : 0.6) * 100)}%`,
    google_fonts_alternatifi: r.font.googleAlt,
    analiz_notu:              i === 0
      ? `Render metrik karşılaştırması — mesafe: ${r.distance.toFixed(3)}, serifScore: ${r.metrics.serifScore.toFixed(3)}`
      : `Alternatif öneri${r.font.similar?.length ? ` (${r.font.similar.slice(0,2).join(', ')})` : ''}`,
  }));

  console.log(
    `[FontMatcher v4] sampleText="${sampleText}" | Top-3: ` +
    top3.map(r => `${r.font.display} d=${r.distance.toFixed(3)}`).join(', ') +
    ` | photoSerif=${photoMetrics.serifScore.toFixed(3)} photoContrast=${photoMetrics.strokeContrast.toFixed(3)}`
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

async function extractPhotoMetrics(buffer) {
  const img    = await loadImage(buffer);
  const canvas = createCanvas(RENDER_W, RENDER_H);
  const ctx    = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, RENDER_W, RENDER_H);

  const scale = Math.min(RENDER_W / img.width, RENDER_H / img.height);
  const dw    = img.width  * scale;
  const dh    = img.height * scale;
  ctx.drawImage(img, (RENDER_W - dw) / 2, (RENDER_H - dh) / 2, dw, dh);

  const data   = ctx.getImageData(0, 0, RENDER_W, RENDER_H).data;
  const binary = new Uint8Array(RENDER_W * RENDER_H);
  for (let i = 0; i < RENDER_W * RENDER_H; i++) {
    const gray = (data[i*4] + data[i*4+1] + data[i*4+2]) / 3;
    binary[i]  = gray < 160 ? 1 : 0;
  }

  return computeMetrics(binary);
}

function computeMetrics(binary) {
  const W = RENDER_W, H = RENDER_H;
  const total = W * H;

  // 1. Ink density
  let inkCount = 0;
  for (let i = 0; i < total; i++) inkCount += binary[i];
  const inkDensity = inkCount / total;

  // 2. Yatay profil varyansı
  const rowSums = new Float32Array(H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) rowSums[y] += binary[y * W + x];
  const rowMean = rowSums.reduce((a, b) => a + b, 0) / H;
  const hVariance = rowSums.reduce((s, v) => s + (v - rowMean) ** 2, 0) / H / (W * W);

  // 3. Dikey profil varyansı
  const colSums = new Float32Array(W);
  for (let x = 0; x < W; x++)
    for (let y = 0; y < H; y++) colSums[x] += binary[y * W + x];
  const colMean   = colSums.reduce((a, b) => a + b, 0) / W;
  const vVariance = colSums.reduce((s, v) => s + (v - colMean) ** 2, 0) / W / (H * H);

  // 4. Ascender bölgesi (%33 üst)
  const ascH = Math.floor(H * 0.33);
  let ascInk = 0;
  for (let y = 0; y < ascH; y++)
    for (let x = 0; x < W; x++) ascInk += binary[y * W + x];
  const ascenderDensity = ascH > 0 ? ascInk / (ascH * W) : 0;

  // 5. Mid-zone (%33-%66)
  const midStart = Math.floor(H * 0.33);
  const midEnd   = Math.floor(H * 0.66);
  let midInk = 0;
  for (let y = midStart; y < midEnd; y++)
    for (let x = 0; x < W; x++) midInk += binary[y * W + x];
  const midDensity = (midEnd - midStart) > 0 ? midInk / ((midEnd - midStart) * W) : 0;

  // 6. Descender bölgesi (%75 alt)
  const descStart = Math.floor(H * 0.75);
  let descInk = 0;
  for (let y = descStart; y < H; y++)
    for (let x = 0; x < W; x++) descInk += binary[y * W + x];
  const descenderDensity = (H - descStart) > 0 ? descInk / ((H - descStart) * W) : 0;

  // 7. Ink width
  let firstInkCol = W, lastInkCol = 0;
  for (let x = 0; x < W; x++) {
    if (colSums[x] > 0) {
      if (x < firstInkCol) firstInkCol = x;
      if (x > lastInkCol)  lastInkCol  = x;
    }
  }
  const inkWidth = lastInkCol > firstInkCol ? (lastInkCol - firstInkCol) / W : 0;

  // 8. CV (stroke uniformity)
  const cv = colMean > 0 ? Math.sqrt(vVariance) / (colMean / H) : 0;

  // 9. [YENİ] serifScore — Serif çıkıntı tespiti
  // Harflerin alt ve üst 15% bölgesindeki yatay çıkıntılar serifin işareti.
  // Serif fontlarda bu bölgeler yatay çizgiler (sermeler) nedeniyle daha yoğun.
  // Yöntem: alt %15 satırlarının yatay varyansı / orta bölge varyansı oranı
  const topH   = Math.floor(H * 0.15);
  const botStart = Math.floor(H * 0.85);

  let topRowVar = 0, botRowVar = 0;
  // Üst bölge satır varyansları
  const topRowSums = [];
  for (let y = 0; y < topH; y++) topRowSums.push(rowSums[y]);
  if (topRowSums.length > 1) {
    const tmean = topRowSums.reduce((a,b) => a+b, 0) / topRowSums.length;
    topRowVar = topRowSums.reduce((s,v) => s + (v-tmean)**2, 0) / topRowSums.length / (W*W);
  }
  // Alt bölge satır varyansları
  const botRowSums = [];
  for (let y = botStart; y < H; y++) botRowSums.push(rowSums[y]);
  if (botRowSums.length > 1) {
    const bmean = botRowSums.reduce((a,b) => a+b, 0) / botRowSums.length;
    botRowVar = botRowSums.reduce((s,v) => s + (v-bmean)**2, 0) / botRowSums.length / (W*W);
  }
  // serifScore: kenar varyansının orta varyansa oranı — serif'te yüksek
  const edgeVar   = (topRowVar + botRowVar) / 2;
  const midVar    = hVariance;
  const serifScore = midVar > 0 ? Math.min(edgeVar / midVar, 3.0) / 3.0 : 0;

  // 10. [YENİ] strokeContrast — Stroke kalınlık farkı
  // Sütun doluluk oranlarının max ile min farkı — yüksek kontrast = Times/Bodoni
  const activeColDensities = colSums
    .filter(v => v > H * 0.05)  // boş sütunları atla
    .map(v => v / H);
  let strokeContrast = 0;
  if (activeColDensities.length > 4) {
    activeColDensities.sort((a, b) => a - b);
    const p10 = activeColDensities[Math.floor(activeColDensities.length * 0.10)];
    const p90 = activeColDensities[Math.floor(activeColDensities.length * 0.90)];
    strokeContrast = Math.max(0, p90 - p10);
  }

  return {
    inkDensity,
    hVariance,
    vVariance,
    ascenderDensity,
    midDensity,
    descenderDensity,
    inkWidth,
    cv,
    serifScore,
    strokeContrast,
  };
}

// Ağırlıklar — serif metrikleri öne çıkarıldı
const WEIGHTS = {
  inkDensity:       2.0,
  hVariance:        2.5,
  vVariance:        1.5,
  ascenderDensity:  1.5,
  midDensity:       2.0,
  descenderDensity: 1.0,
  inkWidth:         1.5,
  cv:               2.0,
  serifScore:       3.5,  // [YENİ] en yüksek ağırlık — serif/sans-serif ayrımı
  strokeContrast:   3.0,  // [YENİ] Times vs Calibri/Arial farkı
};

function euclidean(a, b) {
  let sum = 0;
  for (const key of Object.keys(WEIGHTS)) {
    const diff = (a[key] || 0) - (b[key] || 0);
    sum += WEIGHTS[key] * diff * diff;
  }
  return Math.sqrt(sum);
}

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
  // v4: Serif ayırıcı karakterler: H (yatay serif), I (çift serif), T (üst serif), f (eğri vs düz)
  // Bunlar serifScore ve strokeContrast metriklerini daha iyi aktive eder
  if (trimmed.length >= 4 && /[HhIiTtFfGaAl]/.test(trimmed)) return trimmed;
  // Fallback: H ve I serifin en belirgin göründüğü harfler
  return 'HhIiTtFf';
}

module.exports = { matchFont, registerFonts };
