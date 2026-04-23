import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { config } from './config';
import { pool } from './db/client';
import { authRouter } from './routes/auth';
import { paymentsRouter } from './routes/payments';
import { portfolioRouter } from './routes/portfolio';
import { earningsRouter } from './routes/earnings';
import type { ErrorResponse } from './types/index';
import { globalLimiter } from './middleware/rateLimiter';

export const app = express();

// ─── CORS ─────────────────────────────────────────────────────────
app.use(
  cors({
    origin: config.FRONTEND_ORIGIN,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

// ─── Body Parser ──────────────────────────────────────────────────
app.use(express.json());

// ─── Rate Limiting ────────────────────────────────────────────────
app.use(globalLimiter);

// ─── Health Endpoint ──────────────────────────────────────────────
app.get('/api/v1/health', async (_req: Request, res: Response) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'degraded', reason: 'database' });
  }
});

// ─── Routes ───────────────────────────────────────────────────────
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/payments', paymentsRouter);
app.use('/api/v1/portfolio', portfolioRouter);
app.use('/api/v1/earnings', earningsRouter);

// ─── Global Error Handler ─────────────────────────────────────────
// Must have 4 parameters for Express to treat it as an error handler
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error & { statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => {
  const statusCode = err.statusCode ?? 500;

  // Never expose stack traces or internal details in responses
  const body: ErrorResponse =
    statusCode >= 500
      ? { error: 'Internal server error' }
      : { error: err.message };

  res.status(statusCode).json(body);
});
