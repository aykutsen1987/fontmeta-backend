# FontMeta Backend

Node.js/Express API that provides AI-powered font analysis for the FontMeta Android app.  
Supports **Google Gemini 2.5 Flash** and **Groq Llama 4 Scout Vision** as AI providers.

---

## Architecture

```
Android App  →  POST /api/analyze  →  Gemini 2.5 Flash
                (base64 image)       OR
                                     Groq Llama-4 Scout Vision
                     ↓
              Structured JSON font analysis (Türkçe)
```

---

## Local Development

```bash
# 1. Clone / copy this folder
cd fontmeta-backend

# 2. Install dependencies
npm install

# 3. Create .env from example
cp .env.example .env
# Edit .env and add your API keys

# 4. Start dev server
npm run dev   # uses nodemon for auto-reload
# or
npm start
```

**Test the endpoint:**
```bash
curl -X GET http://localhost:3000/health
# → {"status":"ok","providers":{"gemini":true,"groq":true}}

# Analyze an image (replace test.jpg with any image)
curl -X POST http://localhost:3000/api/analyze \
  -F "image=@test.jpg" \
  -F "provider=gemini"
```

---

## Deploy to Render

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial FontMeta backend"
git remote add origin https://github.com/YOUR_USERNAME/fontmeta-backend.git
git push -u origin main
```

### 2. Create Web Service on Render

1. Go to [render.com](https://render.com) → **New → Web Service**
2. Connect your GitHub repo
3. Settings:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free (or Starter for always-on)

### 3. Set Environment Variables

In Render dashboard → your service → **Environment**:

| Key | Value |
|-----|-------|
| `GEMINI_API_KEY` | Your Google AI Studio key |
| `GROQ_API_KEY` | Your Groq Cloud key |
| `RATE_LIMIT_MAX` | `30` (requests per IP per 15 min) |

### 4. Update Android App

After deployment, copy your Render URL (e.g. `https://fontmeta-backend.onrender.com`)  
and update `BACKEND_BASE_URL` in `FontDetector.kt`:

```kotlin
const val BACKEND_BASE_URL = "https://YOUR-APP-NAME.onrender.com"
```

---

## API Reference

### `POST /api/analyze`

Analyze font in an image.

**Request (multipart/form-data):**
```
image     : <file>              required — JPEG, PNG, or WEBP
provider  : "gemini" | "groq"  optional — default: "gemini"
```

**Request (application/json):**
```json
{
  "image"    : "<base64 string>",
  "mimeType" : "image/jpeg",
  "provider" : "gemini"
}
```

**Success Response 200:**
```json
{
  "provider": "gemini",
  "result": {
    "font_tarzi": "Sans-Serif",
    "tespit_edilen_metin": "Hello World",
    "tahminler": [
      {
        "font_adi": "Montserrat",
        "benzerlik_orani": "92%",
        "google_fonts_alternatifi": "Montserrat",
        "analiz_notu": "Geometrik sans-serif yapısı, geniş harf aralığı."
      },
      {
        "font_adi": "Poppins",
        "benzerlik_orani": "75%",
        "google_fonts_alternatifi": "Poppins",
        "analiz_notu": "Benzer geometrik form, biraz daha yuvarlak karakterler."
      },
      {
        "font_adi": "Nunito",
        "benzerlik_orani": "60%",
        "google_fonts_alternatifi": "Nunito",
        "analiz_notu": "Yuvarlak köşeler farklı ancak genel stil benzer."
      }
    ]
  }
}
```

**Error Response:**
```json
{ "error": "Hata açıklaması" }
```

### `GET /api/providers`

Returns which providers are configured.
```json
{ "gemini": true, "groq": false }
```

### `GET /health`

Health check.
```json
{ "status": "ok", "version": "1.0.0", "providers": { "gemini": true, "groq": true } }
```

---

## Getting API Keys

- **Gemini:** [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) — Free tier available
- **Groq:** [console.groq.com/keys](https://console.groq.com/keys) — Free tier available

---

## Notes on Render Free Tier

The free tier **spins down after 15 minutes of inactivity**.  
First request after spin-down takes ~30 seconds (cold start).  
The Android app has a 60-second read timeout to handle this.  
Upgrade to Starter ($7/mo) for always-on if needed.
