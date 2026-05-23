require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const analyzeRouter = require('./routes/analyze');

const app = express();


/*
|--------------------------------------------------------------------------
| EN ÖNEMLİ SATIR
|--------------------------------------------------------------------------
*/
app.enable('trust proxy');


const PORT = process.env.PORT || 3000;


/*
|--------------------------------------------------------------------------
| MIDDLEWARE
|--------------------------------------------------------------------------
*/
app.use(helmet());

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
  windowMs: 15 * 60 * 1000,
  max: 60,

  // HATAYI TAMAMEN KAPAT
  validate: false,

  standardHeaders: true,
  legacyHeaders: false,

  message: {
    error: 'Cok fazla istek. Daha sonra tekrar deneyin.',
  },
});

app.use('/api', limiter);


/*
|--------------------------------------------------------------------------
| BODY PARSER
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
| HEALTH
|--------------------------------------------------------------------------
*/
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: '4.0.0',
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
| ERROR HANDLER
|--------------------------------------------------------------------------
*/
app.use((err, _req, res, _next) => {
  console.error(err);

  res.status(500).json({
    error: err.message || 'Sunucu hatasi',
  });
});


/*
|--------------------------------------------------------------------------
| START
|--------------------------------------------------------------------------
*/
app.listen(PORT, () => {
  console.log(`✅ FontMeta Backend — port ${PORT}`);
  console.log(`   Gemini: ${process.env.GEMINI_API_KEY ? '✓ configured' : '✗ missing'}`);
  console.log(`   Groq  : ${process.env.GROQ_API_KEY ? '✓ configured' : '✗ missing'}`);
});
