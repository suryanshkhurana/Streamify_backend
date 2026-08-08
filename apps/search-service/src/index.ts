import express, { type Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';

const app: Application = express();
const PORT = process.env['PORT'] ?? 3005;

// ─── Middleware ─────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env['CORS_ORIGIN'] ?? 'http://localhost:5173', credentials: true }));
app.use(express.json());

// ─── Health Check ───────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ service: 'search-service', status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Routes ─────────────────────────────────────────────────────────────────
import searchRouter from './routes/search.routes.js';
app.use('/search', searchRouter);

import { initElasticsearch } from './config/elasticsearch.js';
import { initRabbitMQ } from './events/consumer.js';

app.listen(PORT, async () => {
  await initElasticsearch();
  await initRabbitMQ();
  console.warn(`[search-service] listening on http://localhost:${PORT}`);
});

export default app;
