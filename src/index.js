require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const analyzeRouter = require('./routes/analyze');

const app = express();
const PORT = process.env.PORT || 3000;

/*
|--------------------------------------------------------------------------
| TRUST PROXY
|--------------------------------------------------------------------------
| Render proxy arkasinda calistigi icin gerekli.
| express-rate-limit hatasini cozer.
|--------------------------------------------------------------------------
*/
app.set('trust proxy', true);

/*
|--------------------------------------------------------------------------
| SECURITY
|--------------------------------------------------------------------------
*/
app.use(helmet());

/*
|--------------------------------------------------------------------------
| CORS
|--------------------------------------------------------------------------
*/
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'X-API-Provider'],
}));

/*
|--------------------------------------------------------------------------
| RATE LIMIT
|--------------------------------------------------------------------------
*/
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 dakika
  max: parseInt(process.env.RATE_LIMIT_MAX || '60'),

  standardHeaders: true,
  legacyHeaders: false,

  message: {
    error: 'Cok fazla istek. 15 dakika sonra tekrar deneyin.',
  },
});

app.use('/api/', limiter);

/*
|--------------------------------------------------------------------------
| JSON BODY
|--------------------------------------------------------------------------
*/
app.use(express.json({
  limit: '20mb',
}));

/*
|--------------------------------------------------------------------------
| ROUTES
|--------------------------------------------------------------------------
*/
app.use('/api', analyzeRouter);

/*
|--------------------------------------------------------------------------
| HEALTH CHECK
|--------------------------------------------------------------------------
*/
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: '4.0.0',

    providers: {
      gemini: !!process.env.GEMINI_API_KEY,
      groq: !!process.env.GROQ_API_KEY,
    },
  });
});

/*
|--------------------------------------------------------------------------
| 404
|--------------------------------------------------------------------------
*/
app.use((_req, res) => {
  res.status(404).json({
    error: 'Endpoint bulunamadi.',
  });
});

/*
|--------------------------------------------------------------------------
| GLOBAL ERROR HANDLER
|--------------------------------------------------------------------------
*/
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err);

  res.status(500).json({
    error: err.message || 'Sunucu hatasi.',
  });
});

/*
|--------------------------------------------------------------------------
| START SERVER
|--------------------------------------------------------------------------
*/
app.listen(PORT, () => {
  console.log(`FontMeta Backend -- port ${PORT}`);
  console.log(`Gemini: ${process.env.GEMINI_API_KEY ? 'OK' : 'EKSIK'}`);
  console.log(`Groq  : ${process.env.GROQ_API_KEY ? 'OK' : 'EKSIK'}`);
});
