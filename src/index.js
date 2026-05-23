require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const analyzeRouter = require('./routes/analyze');

const app = express();
const PORT = process.env.PORT || 3000;

// Render proxy arkasinda calistigimiz icin trust proxy gerekli
app.set('trust proxy', 1);

// ── Security middleware ────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: '*', // Android app can come from any IP
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'X-API-Provider'],
}));

// ── Rate limiting ──────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX || '30'),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Çok fazla istek gönderildi. 15 dakika sonra tekrar deneyin.' },
});
app.use('/api/', limiter);

// ── Body parsing ───────────────────────────────────────────────────────────
app.use(express.json({ limit: '20mb' }));

// ── Routes ─────────────────────────────────────────────────────────────────
app.use('/api', analyzeRouter);

// ── Health check ───────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    providers: {
      gemini: !!process.env.GEMINI_API_KEY,
      groq: !!process.env.GROQ_API_KEY,
    },
  });
});

// ── 404 handler ────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint bulunamadı.' });
});

// ── Global error handler ───────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err);
  res.status(500).json({ error: err.message || 'Sunucu hatası oluştu.' });
});

// ── Start ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ FontMeta Backend — port ${PORT}`);
  console.log(`   Gemini: ${process.env.GEMINI_API_KEY ? '✓ configured' : '✗ missing GEMINI_API_KEY'}`);
  console.log(`   Groq  : ${process.env.GROQ_API_KEY   ? '✓ configured' : '✗ missing GROQ_API_KEY'}`);
});
