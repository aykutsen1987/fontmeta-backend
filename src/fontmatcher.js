'use strict';

/**
 * FontMatcher v5 — Script/Gabriola desteği + serif metrik iyileştirme
 *
 * v5 DEĞİŞİKLİKLER:
 * ─────────────────
 * 1. FONT_LIST'e script fontlar eklendi: Great Vibes, Dancing Script, Pacifico
 *    (Gabriola Windows lisanslı → ücretsiz alternatiflerle karşılaştırma)
 * 2. Yeni metrik: curveScore — eğrilik skoru (script fontlar için)
 * 3. Yeni metrik: strokeContrast — ince/kalın fark (Times'ı ayırt eder)
 * 4. Yeni metrik: serifScore — serif çıkıntı tespiti
 * 5. buildSampleText: "HhIiTtFf" fallback → serif/sans-serif ayrımı net
 * 6. DISTANCE_THRESHOLD: 0.22 (script fontlar için biraz daha gevşek)
 * 7. Ağırlıklar: serifScore ve strokeContrast yüksek ağırlık
 */

const { createCanvas, registerFont, loadImage } = require('canvas');
const path = require('path');
const fs   = require('fs');

const FONT_DIR = process.env.FONT_DIR || path.join(__dirname, '..', 'fonts');

const RENDER_W  = 1000;
const RENDER_H  = 200;
const FONT_SIZE = 96;

const DISTANCE_THRESHOLD = parseFloat(process.env.FONT_MATCH_THRESHOLD || '0.22');

const FONT_LIST = [
  // Sans-Serif
  { family: 'fm_arial',       file: 'arial.ttf',          display: 'Arial',            category: 'Sans-Serif',  googleAlt: 'Inter',              similar: ['Helvetica', 'Liberation Sans'] },
  { family: 'fm_arialbd',     file: 'arialbd.ttf',        display: 'Arial Bold',       category: 'Sans-Serif',  googleAlt: 'Inter',              similar: ['Helvetica Bold'] },
  { family: 'fm_calibri',     file: 'calibri.ttf',        display: 'Calibri',          category: 'Sans-Serif',  googleAlt: 'Nunito',             similar: ['Myriad Pro', 'Gill Sans'] },
  { family: 'fm_calibribd',   file: 'calibrib.ttf',       display: 'Calibri Bold',     category: 'Sans-Serif',  googleAlt: 'Nunito Bold',        similar: ['Myriad Pro Bold'] },
  { family: 'fm_segoeui',     file: 'segoeui.ttf',        display: 'Segoe UI',         category: 'Sans-Serif',  googleAlt: 'Nunito',             similar: ['Frutiger', 'Myriad'] },
  { family: 'fm_segoeuib',    file: 'segoeuib.ttf',       display: 'Segoe UI Bold',    category: 'Sans-Serif',  googleAlt: 'Nunito Bold',        similar: [] },
  { family: 'fm_verdana',     file: 'verdana.ttf',        display: 'Verdana',          category: 'Sans-Serif',  googleAlt: 'Open Sans',          similar: ['Bitstream Vera Sans'] },
  { family: 'fm_tahoma',      file: 'tahoma.ttf',         display: 'Tahoma',           category: 'Sans-Serif',  googleAlt: 'Open Sans',          similar: ['Geneva'] },
  { family: 'fm_trebuc',      file: 'trebuc.ttf',         display: 'Trebuchet MS',     category: 'Sans-Serif',  googleAlt: 'Source Sans Pro',    similar: [] },
  { family: 'fm_gothic',      file: 'GOTHIC.TTF',         display: 'Century Gothic',   category: 'Sans-Serif',  googleAlt: 'Josefin Sans',       similar: ['Futura'] },
  { family: 'fm_impact',      file: 'impact.ttf',         display: 'Impact',           category: 'Display',     googleAlt: 'Anton',              similar: ['Haettenschweiler'] },
  // Serif
  { family: 'fm_times',       file: 'times.ttf',          display: 'Times New Roman',  category: 'Serif',       googleAlt: 'Lora',               similar: ['Times', 'Liberation Serif'] },
  { family: 'fm_timesbd',     file: 'timesbd.ttf',        display: 'Times NR Bold',    category: 'Serif',       googleAlt: 'Lora Bold',          similar: ['Times Bold'] },
  { family: 'fm_georgia',     file: 'georgia.ttf',        display: 'Georgia',          category: 'Serif',       googleAlt: 'Merriweather',       similar: ['Book Antiqua'] },
  { family: 'fm_georgiab',    file: 'georgiab.ttf',       display: 'Georgia Bold',     category: 'Serif',       googleAlt: 'Merriweather Bold',  similar: [] },
  { family: 'fm_garamond',    file: 'GARA.TTF',           display: 'Garamond',         category: 'Serif',       googleAlt: 'EB Garamond',        similar: ['Adobe Garamond'] },
  { family: 'fm_palatino',    file: 'pala.ttf',           display: 'Palatino',         category: 'Serif',       googleAlt: 'EB Garamond',        similar: ['Book Antiqua'] },
  // Monospace
  { family: 'fm_cour',        file: 'cour.ttf',           display: 'Courier New',      category: 'Monospace',   googleAlt: 'Courier Prime',      similar: ['Courier'] },
  { family: 'fm_courbd',      file: 'courbd.ttf',         display: 'Courier New Bold', category: 'Monospace',   googleAlt: 'Courier Prime',      similar: [] },
  // Handwriting / Script
  { family: 'fm_comic',       file: 'comic.ttf',          display: 'Comic Sans MS',    category: 'Handwriting', googleAlt: 'Patrick Hand',       similar: ['Chalkboard'] },
  { family: 'fm_great_vibes', file: 'great_vibes.ttf',    display: 'Great Vibes',      category: 'Script',      googleAlt: 'Great Vibes',        similar: ['Gabriola', 'Edwardian Script'] },
  { family: 'fm_dancing',     file: 'dancing_script.ttf', display: 'Dancing Script',   category: 'Script',      googleAlt: 'Dancing Script',     similar: ['Gabriola', 'Pacifico'] },
  { family: 'fm_pacifico',    file: 'pacifico.ttf',       display: 'Pacifico',         category: 'Script',      googleAlt: 'Pacifico',           similar: ['Gabriola'] },
  // Symbol
  { family: 'fm_symbol',      file: 'symbol.ttf',         display: 'Symbol',           category: 'Symbol',      googleAlt: 'Symbol',             similar: [] },
  { family: 'fm_wingding',    file: 'wingding.ttf',       display: 'Wingdings',        category: 'Symbol',      googleAlt: 'Wingdings',          similar: [] },
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
    } else {
      console.warn(`[FontMatcher] Font dosyası bulunamadı: ${filePath}`);
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
      ? `Pixel karşılaştırma — mesafe: ${r.distance.toFixed(3)}, serif: ${r.metrics.serifScore.toFixed(3)}, kontrast: ${r.metrics.strokeContrast.toFixed(3)}, eğri: ${r.metrics.curveScore.toFixed(3)}`
      : `Alternatif${r.font.similar?.length ? ` (${r.font.similar.slice(0,2).join(', ')})` : ''}`,
  }));

  console.log(
    `[FontMatcher v5] text="${sampleText}" | Top-3: ` +
    top3.map(r => `${r.font.display} d=${r.distance.toFixed(3)}`).join(', ') +
    ` | serif=${photoMetrics.serifScore.toFixed(3)} contrast=${photoMetrics.strokeContrast.toFixed(3)} curve=${photoMetrics.curveScore.toFixed(3)}`
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
    // Kamera görüntüsü için threshold düşürüldü (gürültü toleransı)
    binary[i]  = gray < 155 ? 1 : 0;
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

  // 2. Yatay profil varyansı (satır başına siyah piksel)
  const rowSums = new Float32Array(H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) rowSums[y] += binary[y * W + x];
  const rowMean = rowSums.reduce((a, b) => a + b, 0) / H;
  const hVariance = rowSums.reduce((s, v) => s + (v - rowMean) ** 2, 0) / H / (W * W);

  // 3. Dikey profil varyansı (sütun başına siyah piksel)
  const colSums = new Float32Array(W);
  for (let x = 0; x < W; x++)
    for (let y = 0; y < H; y++) colSums[x] += binary[y * W + x];
  const colMean   = colSums.reduce((a, b) => a + b, 0) / W;
  const vVariance = colSums.reduce((s, v) => s + (v - colMean) ** 2, 0) / W / (H * H);

  // 4. Ascender bölgesi yoğunluğu
  const ascH = Math.floor(H * 0.33);
  let ascInk = 0;
  for (let y = 0; y < ascH; y++)
    for (let x = 0; x < W; x++) ascInk += binary[y * W + x];
  const ascenderDensity = ascH > 0 ? ascInk / (ascH * W) : 0;

  // 5. Mid-zone yoğunluğu (x-height)
  const midStart = Math.floor(H * 0.33);
  const midEnd   = Math.floor(H * 0.66);
  let midInk = 0;
  for (let y = midStart; y < midEnd; y++)
    for (let x = 0; x < W; x++) midInk += binary[y * W + x];
  const midDensity = (midEnd - midStart) > 0 ? midInk / ((midEnd - midStart) * W) : 0;

  // 6. Descender yoğunluğu
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

  // 9. serifScore — serif çıkıntı tespiti
  // Harflerin üst/alt %15 satırlarında yatay varyans yüksekliği = serif işareti
  const topH     = Math.floor(H * 0.15);
  const botStart = Math.floor(H * 0.85);

  const topRowSums = [];
  for (let y = 0; y < topH; y++) topRowSums.push(rowSums[y]);
  let topRowVar = 0;
  if (topRowSums.length > 1) {
    const tm = topRowSums.reduce((a,b) => a+b, 0) / topRowSums.length;
    topRowVar = topRowSums.reduce((s,v) => s + (v-tm)**2, 0) / topRowSums.length / (W*W);
  }

  const botRowSums = [];
  for (let y = botStart; y < H; y++) botRowSums.push(rowSums[y]);
  let botRowVar = 0;
  if (botRowSums.length > 1) {
    const bm = botRowSums.reduce((a,b) => a+b, 0) / botRowSums.length;
    botRowVar = botRowSums.reduce((s,v) => s + (v-bm)**2, 0) / botRowSums.length / (W*W);
  }

  const edgeVar    = (topRowVar + botRowVar) / 2;
  const serifScore = hVariance > 0 ? Math.min(edgeVar / hVariance, 3.0) / 3.0 : 0;

  // 10. strokeContrast — ince/kalın stroke farkı (Times'ta yüksek)
  const activeColDensities = [];
  for (let x = 0; x < W; x++) {
    if (colSums[x] > H * 0.05) activeColDensities.push(colSums[x] / H);
  }
  let strokeContrast = 0;
  if (activeColDensities.length > 4) {
    activeColDensities.sort((a, b) => a - b);
    const p10 = activeColDensities[Math.floor(activeColDensities.length * 0.10)];
    const p90 = activeColDensities[Math.floor(activeColDensities.length * 0.90)];
    strokeContrast = Math.max(0, p90 - p10);
  }

  // 11. curveScore — eğrilik skoru (script/handwriting fontları için)
  // Script fontlarda ink diagonal olarak dağılır → diagonal piksel komşuluğu yüksek
  let diagonalNeighbors = 0;
  let totalInkPixels = 0;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (binary[y * W + x] === 1) {
        totalInkPixels++;
        // Diagonal komşu kontrolü
        const ul = binary[(y-1) * W + (x-1)];
        const ur = binary[(y-1) * W + (x+1)];
        const dl = binary[(y+1) * W + (x-1)];
        const dr = binary[(y+1) * W + (x+1)];
        // Yatay komşu
        const l  = binary[y * W + (x-1)];
        const r  = binary[y * W + (x+1)];
        // Eğer diagonal komşu var ama yatay komşu yoksa → eğri kontur
        if ((ul || ur || dl || dr) && !(l && r)) diagonalNeighbors++;
      }
    }
  }
  const curveScore = totalInkPixels > 100 ? diagonalNeighbors / totalInkPixels : 0;

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
    curveScore,
  };
}

// Ağırlıklar — serif, kontrast ve eğrilik öne çıkarıldı
const WEIGHTS = {
  inkDensity:       1.5,
  hVariance:        2.0,
  vVariance:        1.5,
  ascenderDensity:  1.5,
  midDensity:       2.0,
  descenderDensity: 1.0,
  inkWidth:         1.5,
  cv:               1.5,
  serifScore:       3.5,   // Serif/sans-serif ayrımı — en kritik
  strokeContrast:   3.0,   // Times vs Calibri/Arial
  curveScore:       3.0,   // Script/Gabriola vs düz fontlar
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
  // H ve I: serif çıkıntıları en net görünen harfler
  // T: üst serif + yatay çizgi → Times vs Calibri farkı net
  // f ve g: script fontlarda çok farklı şekil
  if (trimmed.length >= 4 && /[HhIiTtFfGgAa]/.test(trimmed)) return trimmed;
  return 'HhIiTtFf';
}

module.exports = { matchFont, registerFonts };
