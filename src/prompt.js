/**
 * The exact JSON-only prompt sent to both Gemini and Groq.
 *
 * DEĞİŞİKLİKLER (v2):
 * - "Önce Arial değerlendir" kuralı KALDIRILDI → Arial/Helvetica bias düzeltildi
 * - Modele net talimat: hangi özelliklere bakacağı, nasıl ayırt edeceği
 * - Serif/Sans-Serif ayrımını önce yap, sonra font adını ver
 * - Yanılma toleransı açıkça belirtildi
 */
const FONT_ANALYSIS_PROMPT = `Sen deneyimli bir tipografi uzmanısın. Sana verilen görseldeki metnin yazı tipini (fontunu) titizlikle analiz et.

ANALİZ ADIMLARI (SIRASINA GÖRE UY):
1. Önce kategoriyi belirle: Serif mi, Sans-Serif mi, Script/El Yazısı mı, Display mı, Monospace mi?
   - Serif: Harf uçlarında ince çıkıntılar (tırnaklar) var mı? → Times New Roman, Georgia, Garamond, Palatino
   - Sans-Serif: Düz, tırnaksız harfler → Helvetica, Arial, Roboto, Open Sans, Futura
   - NOT: Serif fontları Arial/Helvetica ile KARIŞTIRMA. Tırnaklar varsa kesinlikle Serif kategorisidir.

2. Harflerin detaylarını incele:
   - "a" harfi: Tek katlı mı (Futura, Gill Sans) yoksa çift katlı mı (Times New Roman, Georgia, Arial)?
   - "g" harfi: Tek katlı mı (Gill Sans) yoksa çift katlı mı (Times New Roman, Arial)?
   - "R" harfi: Bacağı düz mı eğri mi?
   - "Q" harfi: Kuyruğu nerede başlıyor?
   - x-yüksekliği: Büyük/küçük harf oranı nedir?
   - Letter-spacing: Harfler arası boşluk dar mı, geniş mi?

3. En yakın 3 fontu tahmin et — dikkatli ol, sık yapılan hatalar:
   - Times New Roman ≠ Arial (birincisi Serif, ikincisi Sans-Serif)
   - Helvetica ≠ Arial (çok benzer ama Helvetica daha geometrik)
   - Benzerlik oranı gerçekçi ol, nadiren %95 üzeri yaz.

Cevabını SADECE ve SADECE aşağıdaki JSON formatında döndür. Başında veya sonunda hiçbir metin, selamlama veya markdown işareti (örn. \`\`\`json) ekleme. Doğrudan { ile başla.

{
  "font_tarzi": "Yazı tipi kategorisi (Serif, Sans-Serif, Script, Display veya Monospace)",
  "tespit_edilen_metin": "Görselde analiz ettiğin örnek kelime veya cümle",
  "tahminler": [
    {
      "font_adi": "1. tahmin font adı",
      "benzerlik_orani": "Yüzde tahmini (Örn: 87%)",
      "google_fonts_alternatifi": "Font ücretliyse Google Fonts'taki ücretsiz alternatifi, ücretsizse kendisi",
      "analiz_notu": "Bu fontu seçme nedenin: tırnak yapısı, harf biçimi gibi somut özellikler (Türkçe, kısa)"
    },
    {
      "font_adi": "2. tahmin font adı",
      "benzerlik_orani": "Yüzde tahmini (Örn: 68%)",
      "google_fonts_alternatifi": "En yakın ücretsiz Google Fonts alternatifi",
      "analiz_notu": "İkinci tahmini destekleyen kısa Türkçe açıklama"
    },
    {
      "font_adi": "3. tahmin font adı",
      "benzerlik_orani": "Yüzde tahmini (Örn: 51%)",
      "google_fonts_alternatifi": "En yakın ücretsiz Google Fonts alternatifi",
      "analiz_notu": "Üçüncü alternatif için kısa Türkçe açıklama"
    }
  ]
}`;

module.exports = { FONT_ANALYSIS_PROMPT };
