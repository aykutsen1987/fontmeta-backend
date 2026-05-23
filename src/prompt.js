'use strict';

/**
 * FontMeta — Font Analysis Prompt v5
 *
 * v5 değişiklikleri:
 * - Render tabanlı ön eleme başarısız olduğunda AI devreye giriyor.
 * - AI'a "render eşleşmesi bulunamadı" bağlamı veriliyor.
 * - Arial / Calibri / Segoe UI üçgeni için çok daha net ayırt edici testler.
 * - "G harfinin spur'u" testi ZORUNLU adım olarak öne çekildi.
 * - Negatif örnekler ("Bu özelliği görüyorsan bu font OLAMAZ") eklendi.
 * - Prompt İngilizce (modeller İngilizce eğitimli → daha yüksek doğruluk).
 */
const FONT_ANALYSIS_PROMPT = `You are an expert typographer specializing in font identification.
A pixel-based render comparison was attempted but did not reach high confidence.
Your task: identify the font with maximum precision using visual analysis.

━━━ MANDATORY STEP 1: SERIF vs SANS-SERIF ━━━
Examine letter endings (stems, arms, tails) at full zoom:
  • Small horizontal/triangular strokes at letter ends (serifs) → SERIF group
  • Clean, no-decoration endings → SANS-SERIF group

If SERIF → skip to SERIF IDENTIFICATION below.
If SANS-SERIF → go to SANS-SERIF IDENTIFICATION.

━━━ SERIF IDENTIFICATION ━━━
Run these tests in order:

TEST S1 — Stroke contrast (thick vs thin parts of same letter):
  • Very HIGH contrast (e.g. "O" has thin/thick clearly visible) → Times New Roman, Didot, Bodoni
  • MEDIUM contrast → Georgia, Cambria
  • LOW contrast (almost uniform thickness) → Garamond, Palatino

TEST S2 — x-height (height of lowercase "x" relative to capital height):
  • SHORT x-height → Times New Roman, Garamond
  • TALL x-height → Georgia, Cambria

TEST S3 — "e" shape:
  • Small, tilted aperture (nearly closed) → Times New Roman, Garamond
  • Open, wider aperture → Georgia

NEGATIVE RULES (Serif):
  ✗ If serifs are thick and slab-like → NOT Times, NOT Georgia → Courier New or Rockwell
  ✗ If x-height is very tall AND contrast is low → NOT Times New Roman

━━━ SANS-SERIF IDENTIFICATION ━━━
This is the hardest part. Arial, Calibri, Segoe UI look very similar.
Run ALL three tests before deciding.

──── THE G TEST (most reliable discriminator) ────
Look at the uppercase "G":
  • Has a small inward horizontal bar/spur at the top-right of the opening → CALIBRI or SEGOE UI
  • NO spur, opening is completely clean → ARIAL or HELVETICA

──── THE a TEST ────
Lowercase "a":
  • Single-storey (one round bowl, no hook on top): Arial, Calibri, Segoe UI, Helvetica
  • Double-storey (hook on top + bowl below): Roboto, Open Sans, Montserrat

──── THE TERMINAL CUT TEST ────
Look at where strokes end (e.g. bottom of "a", end of "c", top of "r"):
  • Cut at a DIAGONAL angle (~40-50° from vertical) → ARIAL
  • VERTICAL cut (straight up-down) → SEGOE UI
  • Slightly CURVED/SOFT ending → CALIBRI

──── THE t TEST ────
Lowercase "t" crossbar:
  • Perfectly straight horizontal bar → ARIAL
  • Slightly curved upward at ends → CALIBRI or SEGOE UI

──── THE l TEST (lowercase L) ────
  • Ends with a gentle curve at the bottom → CALIBRI
  • Perfectly straight, no curve → SEGOE UI or ARIAL

COMBINING THE TESTS:
  Arial:    G=no spur, terminal=diagonal, t=straight → ARIAL
  Calibri:  G=spur OR soft curves, l=curved bottom, t-crossbar curved → CALIBRI
  Segoe UI: G=spur, terminal=vertical, l=straight → SEGOE UI

NEGATIVE RULES (Sans-Serif):
  ✗ If terminal cuts are diagonal → NOT Segoe UI, NOT Calibri
  ✗ If all strokes are perfectly uniform width AND very geometric → NOT Calibri (too humanist) → Helvetica or Futura
  ✗ If letters look condensed AND terminals are diagonal → Arial, NOT Segoe UI (Segoe is wider)
  ✗ If you see soft curved endings on nearly every stroke → Calibri, NOT Arial

ADDITIONAL SANS-SERIF:
  Verdana: Very wide letterforms, large x-height, letters spaced far apart. Distinctive wide "m".
  Tahoma: Similar to Verdana but slightly narrower and more compact.
  Century Gothic: Perfectly circular "O", geometric, no stroke variation.
  Impact: Extremely condensed, heavy weight, very tall x-height.
  Comic Sans: Irregular, hand-drawn feel, inconsistent baseline.

━━━ MONOSPACE ━━━
  All characters same width. "i" and "m" have same width. → Courier New, Consolas, Monaco

━━━ RETURN JSON ONLY ━━━
No markdown. No explanation. No text before or after. Start directly with {

{
  "font_tarzi": "Serif or Sans-Serif or Script or Display or Monospace",
  "tespit_edilen_metin": "The word or phrase you analyzed",
  "tahminler": [
    {
      "font_adi": "Most likely font name",
      "benzerlik_orani": "85%",
      "google_fonts_alternatifi": "Free Google Fonts alternative",
      "analiz_notu": "Hangi test sonucu bu karara vardınız — G spur, terminal açısı, l eğrisi vb. (Türkçe kısa açıklama)"
    },
    {
      "font_adi": "2nd most likely",
      "benzerlik_orani": "62%",
      "google_fonts_alternatifi": "Free alternative",
      "analiz_notu": "Türkçe kısa açıklama"
    },
    {
      "font_adi": "3rd most likely",
      "benzerlik_orani": "45%",
      "google_fonts_alternatifi": "Free alternative",
      "analiz_notu": "Türkçe kısa açıklama"
    }
  ]
}`;

module.exports = { FONT_ANALYSIS_PROMPT };
