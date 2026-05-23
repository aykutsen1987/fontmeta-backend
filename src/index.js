require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const analyzeRouter = require('./routes/analyze');

const app = express();
const PORT = process.env.PORT || 3000;


// Render proxy arkasinda -- trust proxy olmadan rate-limit hata verir
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'X-API-Provider'],
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX || '60'),
  validate: { xForwardedForHeader: false }, // ← bu satırı ekle
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Cok fazla istek. 15 dakika sonra tekrar deneyin.' },
});
app.use('/api/', limiter);

app.use(express.json({ limit: '20mb' }));
app.use('/api', analyzeRouter);

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: '4.0.0',
    providers: {
      gemini: !!process.env.GEMINI_API_KEY,
      groq:   !!process.env.GROQ_API_KEY,
    },
  });
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint bulunamadi.' });
});

app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err);
  res.status(500).json({ error: err.message || 'Sunucu hatasi.' });
});

app.listen(PORT, () => {
  console.log(`FontMeta Backend -- port ${PORT}`);
  console.log(`Gemini: ${process.env.GEMINI_API_KEY ? 'OK' : 'EKSIK'}`);
  console.log(`Groq  : ${process.env.GROQ_API_KEY   ? 'OK' : 'EKSIK'}`);
});
