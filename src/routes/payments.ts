import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as paymentLinkService from '../services/paymentLinkService';
import * as paymentProcessor from '../services/paymentProcessor';
import * as paymentHistoryService from '../services/paymentHistoryService';
import { authMiddleware } from '../middleware/auth';
import { strictLimiter } from '../middleware/rateLimiter';

export const paymentsRouter = Router();

// ─── Zod Schemas ──────────────────────────────────────────────────

const createLinkSchema = z.object({
  amount: z.number({ required_error: 'amount is required' }).positive('amount must be greater than 0'),
  token: z.enum(['SOL', 'USDC'], { required_error: 'token is required' }),
  description: z.string().max(200, 'description must be 200 characters or fewer').optional(),
  expiresAt: z.string().datetime({ message: 'expiresAt must be a valid ISO 8601 datetime' }).optional(),
  privacyMode: z.enum(['anonymous', 'verifiable'], { required_error: 'privacyMode is required' }),
  usageType: z.enum(['single-use', 'multi-use'], { required_error: 'usageType is required' }),
});

const paySchema = z.object({
  senderProof: z.string().optional(),
  payerWallet: z.string().optional(),
});

const historyQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});

// ─── Helper: parse zod errors into field-level details ────────────
function zodDetails(errors: z.ZodError) {
  return errors.errors.map((e) => ({
    field: e.path.join('.'),
    message: e.message,
  }));
}

// ─── POST /payments/links (auth required) ─────────────────────────
paymentsRouter.post(
  '/links',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = createLinkSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation error', details: zodDetails(parsed.error) });
      return;
    }

    try {
      const link = await paymentLinkService.createPaymentLink(req.creatorId, parsed.data);
      res.status(201).json(link);
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /payments/links (auth required) ──────────────────────────
paymentsRouter.get(
  '/links',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const links = await paymentLinkService.getLinksForCreator(req.creatorId);
      res.status(200).json(links);
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /payments/links/:linkId (no auth) ────────────────────────
paymentsRouter.get(
  '/links/:linkId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const link = await paymentLinkService.getPublicLink(req.params['linkId'] as string);
      res.status(200).json(link);
    } catch (err) {
      next(err);
    }
  }
);

// ─── PATCH /payments/links/:linkId/deactivate (auth required) ─────
paymentsRouter.patch(
  '/links/:linkId/deactivate',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await paymentLinkService.deactivateLink(req.creatorId, req.params['linkId'] as string);
      res.status(200).json({ message: 'Payment link deactivated' });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /payments/pay/:linkId (no auth required) ────────────────
paymentsRouter.post(
  '/pay/:linkId',
  strictLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = paySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation error', details: zodDetails(parsed.error) });
      return;
    }

    try {
      const result = await paymentProcessor.processPayment(req.params['linkId'] as string, parsed.data);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /payments/history (auth required) ────────────────────────
paymentsRouter.get(
  '/history',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = historyQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation error', details: zodDetails(parsed.error) });
      return;
    }

    try {
      const { page, pageSize } = parsed.data;
      const history = await paymentHistoryService.getHistory(req.creatorId, page, pageSize);
      res.status(200).json(history);
    } catch (err) {
      next(err);
    }
  }
);
