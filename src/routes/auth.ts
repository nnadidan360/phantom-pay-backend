import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as authService from '../services/authService';
import { authMiddleware } from '../middleware/auth';

export const authRouter = Router();

// ─── Zod Schemas ──────────────────────────────────────────────────

const connectSchema = z.object({
  walletAddress: z.string().min(1, 'walletAddress is required'),
  signature: z.string().min(1, 'signature is required'),
  nonce: z.string().min(1, 'nonce is required'),
});

// ─── POST /auth/challenge ─────────────────────────────────────────
authRouter.post('/challenge', (_req: Request, res: Response) => {
  const result = authService.generateChallenge();
  res.status(200).json(result);
});

// ─── POST /auth/connect ───────────────────────────────────────────
authRouter.post('/connect', async (req: Request, res: Response, next: NextFunction) => {
  const parsed = connectSchema.safeParse(req.body);
  if (!parsed.success) {
    const details = parsed.error.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    res.status(400).json({ error: 'Validation error', details });
    return;
  }

  try {
    const { walletAddress, signature, nonce } = parsed.data;
    const result = await authService.connect(walletAddress, signature, nonce);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// ─── POST /auth/revoke-session ────────────────────────────────────
authRouter.post(
  '/revoke-session',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await authService.revokeSession(req.creatorId);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
);
