import { Router, Request, Response, NextFunction } from 'express';
import * as earningsService from '../services/earningsService';
import { authMiddleware } from '../middleware/auth';

export const earningsRouter = Router();

// ─── GET /earnings (auth required) ───────────────────────────────
earningsRouter.get(
  '/',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const earnings = await earningsService.getEarnings(req.creatorId);
      res.status(200).json(earnings);
    } catch (err) {
      next(err);
    }
  }
);
