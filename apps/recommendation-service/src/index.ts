import express, { type Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';

const app: Application = express();
const PORT = process.env['PORT'] ?? 3007;

// ─── Middleware ─────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env['CORS_ORIGIN'] ?? 'http://localhost:5173', credentials: true }));
app.use(express.json());

// ─── Health Check ───────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ service: 'recommendation-service', status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Routes ─────────────────────────────────────────────────────────────────
// TODO Step 12: mount recommendation routes
// import recommendationRouter from './routes/recommendation.routes.js';
// app.use('/recommendations', recommendationRouter);

app.listen(PORT, () => {
  console.warn(`[recommendation-service] listening on http://localhost:${PORT}`);
});

export default app;
