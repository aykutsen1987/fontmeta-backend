/**
 * The exact JSON-only prompt sent to both Gemini and Groq.
 * Both providers are instructed to return ONLY a JSON object
 * with no markdown, no preamble, no trailing text.
 */
const FONT_ANALYSIS_PROMPT = `Görevin, sana gönderilen görseldeki metnin yazı tipini (fontunu) profesyonel bir tipografi uzmanı gibi analiz etmektir. Karakterlerin tırnak yapılarını, kıvrımlarını, kalınlıklarını ve tasarım stilini incele.

Cevabını SADECE ve SADECE aşağıdaki JSON formatında döndür. JSON dışında hiçbir açıklama metni, selamlama, giriş-gelişme cümlesi veya markdown işareti ekleme. Doğrudan süslü parantez ile başla ve bitir.

{
  "font_tarzi": "Yazı tipi kategorisi (Örn: Serif, Sans-Serif, Script, Display, Monospace)",
  "tespit_edilen_metin": "Görselde fontu analiz edilen örnek kelime veya cümle",
  "tahminler": [
    {
      "font_adi": "En yakın tahmini 1. fontun adı",
      "benzerlik_orani": "Tahmini doğruluk yüzdesi (Örn: 95%)",
      "google_fonts_alternatifi": "Font ücretliyse Google Fonts'taki en yakın ücretsiz muadili. Font zaten ücretsizse kendisi.",
      "analiz_notu": "Bu fontu seçme nedenin (Kıvrım, tırnak veya karakter yapısına dair çok kısa Türkçe açıklama)."
    },
    {
      "font_adi": "En yakın tahmini 2. fontun adı",
      "benzerlik_orani": "Tahmini doğruluk yüzdesi (Örn: 75%)",
      "google_fonts_alternatifi": "En yakın ücretsiz Google Fonts alternatif adı",
      "analiz_notu": "Karakter yapısına dair ikinci tahmini destekleyen kısa Türkçe açıklama."
    },
    {
      "font_adi": "En yakın tahmini 3. fontun adı",
      "benzerlik_orani": "Tahmini doğruluk yüzdesi (Örn: 60%)",
      "google_fonts_alternatifi": "En yakın ücretsiz Google Fonts alternatif adı",
      "analiz_notu": "Üçüncü alternatif font için kısa Türkçe açıklama."
    }
  ]
}`;

module.exports = { FONT_ANALYSIS_PROMPT };
