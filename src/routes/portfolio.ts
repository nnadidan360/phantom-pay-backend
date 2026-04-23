import { Router, Request, Response, NextFunction } from 'express';
import * as portfolioService from '../services/portfolioService';
import { authMiddleware } from '../middleware/auth';

export const portfolioRouter = Router();

// ─── GET /portfolio (auth required) ──────────────────────────────
portfolioRouter.get(
  '/',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const holdings = await portfolioService.getPortfolio(req.creatorId);
      res.status(200).json(holdings);
    } catch (err) {
      next(err);
    }
  }
);
