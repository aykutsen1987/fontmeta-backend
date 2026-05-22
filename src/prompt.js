/**
 * The exact JSON-only prompt sent to both Gemini and Groq.
 * Both providers are instructed to return ONLY a JSON object.
 *
 * Prompt, font tespitinde daha kesin ve gerçekçi sonuç almak için
 * aşırı yüksek benzerlik oranlarını engeller ve Arial/Helvetica gibi
 * temel sistem fontlarını öncelikle dikkate almasını ister.
 */
const FONT_ANALYSIS_PROMPT = `Sen profesyonel bir tipografi uzmanısın. Görseldeki metnin yazı tipini (fontunu) analiz et.

ÖNEMLİ KURALLAR:
- Önce Arial, Helvetica, Times New Roman, Georgia, Verdana, Tahoma gibi yaygın sistem fontlarını değerlendir.
- Karakterlerin tırnak yapısını (serif/sans-serif), köşe yuvarlıklığını, harfler arası boşluğu ve x-yüksekliğini dikkate al.
- Benzerlik oranlarını gerçekçi tut; birinci tahmin nadiren %95'in üzerinde olmalı.
- Eğer görsel sistem fontuna benziyorsa, önce onu yaz.

Cevabını SADECE ve SADECE aşağıdaki JSON formatında döndür. Başında veya sonunda hiçbir metin, selamlama veya markdown işareti (örn. \`\`\`json) ekleme. Doğrudan { ile başla.

{
  "font_tarzi": "Yazı tipi kategorisi (Örn: Serif, Sans-Serif, Script, Display, Monospace)",
  "tespit_edilen_metin": "Görselde fontu analiz edilen örnek kelime veya cümle",
  "tahminler": [
    {
      "font_adi": "En yakın tahmini 1. fontun adı",
      "benzerlik_orani": "Tahmini doğruluk yüzdesi (Örn: 88%)",
      "google_fonts_alternatifi": "Font ücretliyse Google Fonts'taki en yakın ücretsiz muadili. Font zaten ücretsizse kendisi.",
      "analiz_notu": "Bu fontu seçme nedenin (kıvrım, tırnak veya karakter yapısına dair çok kısa Türkçe açıklama)."
    },
    {
      "font_adi": "En yakın tahmini 2. fontun adı",
      "benzerlik_orani": "Tahmini doğruluk yüzdesi (Örn: 70%)",
      "google_fonts_alternatifi": "En yakın ücretsiz Google Fonts alternatif adı",
      "analiz_notu": "Karakter yapısına dair ikinci tahmini destekleyen kısa Türkçe açıklama."
    },
    {
      "font_adi": "En yakın tahmini 3. fontun adı",
      "benzerlik_orani": "Tahmini doğruluk yüzdesi (Örn: 55%)",
      "google_fonts_alternatifi": "En yakın ücretsiz Google Fonts alternatif adı",
      "analiz_notu": "Üçüncü alternatif font için kısa Türkçe açıklama."
    }
  ]
}`;

module.exports = { FONT_ANALYSIS_PROMPT };
