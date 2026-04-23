import { randomUUID } from 'crypto';
import { z } from 'zod';
import { pool } from '../db/client';
import type {
  CreatePaymentLinkRequest,
  PaymentLinkPrivateResponse,
  PaymentLinkPublicResponse,
  PaymentLinkRow,
  PaymentLinkStatus,
} from '../types/index';

// ─── Validation Schema ────────────────────────────────────────────

const createPaymentLinkSchema = z.object({
  amount: z.number().positive({ message: 'amount must be greater than 0' }),
  token: z.enum(['SOL', 'USDC'], { message: 'token must be SOL or USDC' }),
  description: z
    .string()
    .max(200, { message: 'description must be 200 characters or fewer' })
    .optional(),
  expiresAt: z
    .string()
    .datetime({ message: 'expiresAt must be a valid ISO 8601 datetime' })
    .optional(),
  privacyMode: z.enum(['anonymous', 'verifiable'], {
    message: 'privacyMode must be anonymous or verifiable',
  }),
  usageType: z.enum(['single-use', 'multi-use'], {
    message: 'usageType must be single-use or multi-use',
  }),
});

// ─── Status Evaluation ───────────────────────────────────────────

/**
 * Evaluates the current status of a PaymentLink at request time.
 *
 * - Terminal states (`fulfilled`, `deactivated`) are returned as-is.
 * - If `expiresAt` is set and has passed (UTC), returns `'expired'`.
 * - Otherwise returns `'active'`.
 *
 * Requirements: 4.1, 4.8, 17.9
 */
export function evaluateLinkStatus(link: PaymentLinkRow): PaymentLinkStatus {
  if (link.status === 'fulfilled' || link.status === 'deactivated') {
    return link.status;
  }
  if (link.expiresAt !== null && new Date(link.expiresAt).getTime() < Date.now()) {
    return 'expired';
  }
  return 'active';
}

// ─── Helpers ──────────────────────────────────────────────────────

function toPrivateResponse(row: {
  id: string;
  amount: string | number;
  token: string;
  description: string | null;
  expires_at: Date | null;
  privacy_mode: string;
  usage_type: string;
  status: string;
  created_at: Date;
}): PaymentLinkPrivateResponse {
  const link: PaymentLinkRow = {
    id: row.id,
    creatorId: '',  // not needed for status evaluation
    amount: Number(row.amount),
    token: row.token as PaymentLinkRow['token'],
    description: row.description,
    expiresAt: row.expires_at,
    privacyMode: row.privacy_mode as PaymentLinkRow['privacyMode'],
    usageType: row.usage_type as PaymentLinkRow['usageType'],
    status: row.status as PaymentLinkStatus,
    createdAt: row.created_at,
  };

  return {
    linkId: row.id,
    amount: Number(row.amount),
    token: row.token as PaymentLinkPrivateResponse['token'],
    description: row.description,
    expiresAt: row.expires_at ? row.expires_at.toISOString() : null,
    privacyMode: row.privacy_mode as PaymentLinkPrivateResponse['privacyMode'],
    status: evaluateLinkStatus(link),
    usageType: row.usage_type as PaymentLinkPrivateResponse['usageType'],
    createdAt: row.created_at.toISOString(),
  };
}

function toPublicResponse(row: {
  id: string;
  amount: string | number;
  token: string;
  description: string | null;
  expires_at: Date | null;
  privacy_mode: string;
  status: string;
}): PaymentLinkPublicResponse {
  const link: PaymentLinkRow = {
    id: row.id,
    creatorId: '',  // not needed for status evaluation
    amount: Number(row.amount),
    token: row.token as PaymentLinkRow['token'],
    description: row.description,
    expiresAt: row.expires_at,
    privacyMode: row.privacy_mode as PaymentLinkRow['privacyMode'],
    usageType: 'single-use',  // not needed for status evaluation
    status: row.status as PaymentLinkStatus,
    createdAt: new Date(),    // not needed for status evaluation
  };

  return {
    linkId: row.id,
    amount: Number(row.amount),
    token: row.token as PaymentLinkPublicResponse['token'],
    description: row.description,
    expiresAt: row.expires_at ? row.expires_at.toISOString() : null,
    privacyMode: row.privacy_mode as PaymentLinkPublicResponse['privacyMode'],
    status: evaluateLinkStatus(link),
  };
}

// ─── Service Functions ────────────────────────────────────────────

export async function createPaymentLink(
  creatorId: string,
  input: CreatePaymentLinkRequest
): Promise<PaymentLinkPrivateResponse> {
  const parsed = createPaymentLinkSchema.safeParse(input);
  if (!parsed.success) {
    const err = new Error(
      parsed.error.errors.map((e) => e.message).join(', ')
    ) as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }

  const { amount, token, description, expiresAt, privacyMode, usageType } = parsed.data;
  const linkId = randomUUID();

  const result = await pool.query<{
    id: string;
    amount: string;
    token: string;
    description: string | null;
    expires_at: Date | null;
    privacy_mode: string;
    usage_type: string;
    status: string;
    created_at: Date;
  }>(
    `INSERT INTO payment_links
       (id, creator_id, amount, token, description, expires_at, privacy_mode, usage_type, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')
     RETURNING id, amount, token, description, expires_at, privacy_mode, usage_type, status, created_at`,
    [
      linkId,
      creatorId,
      amount,
      token,
      description ?? null,
      expiresAt ?? null,
      privacyMode,
      usageType,
    ]
  );

  return toPrivateResponse(result.rows[0]!);
}

export async function getLinksForCreator(
  creatorId: string
): Promise<PaymentLinkPrivateResponse[]> {
  const result = await pool.query<{
    id: string;
    amount: string;
    token: string;
    description: string | null;
    expires_at: Date | null;
    privacy_mode: string;
    usage_type: string;
    status: string;
    created_at: Date;
  }>(
    `SELECT id, amount, token, description, expires_at, privacy_mode, usage_type, status, created_at
     FROM payment_links
     WHERE creator_id = $1
     ORDER BY created_at DESC`,
    [creatorId]
  );

  return result.rows.map(toPrivateResponse);
}

export async function getPublicLink(linkId: string): Promise<PaymentLinkPublicResponse> {
  const result = await pool.query<{
    id: string;
    amount: string;
    token: string;
    description: string | null;
    expires_at: Date | null;
    privacy_mode: string;
    status: string;
  }>(
    `SELECT id, amount, token, description, expires_at, privacy_mode, status
     FROM payment_links
     WHERE id = $1`,
    [linkId]
  );

  if (result.rowCount === 0) {
    const err = new Error('Payment link not found') as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  return toPublicResponse(result.rows[0]!);
}

export async function deactivateLink(
  creatorId: string,
  linkId: string
): Promise<PaymentLinkPrivateResponse> {
  // First check if the link exists at all
  const existing = await pool.query<{ id: string; creator_id: string }>(
    `SELECT id, creator_id FROM payment_links WHERE id = $1`,
    [linkId]
  );

  if (existing.rowCount === 0) {
    const err = new Error('Payment link not found') as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  if (existing.rows[0]!.creator_id !== creatorId) {
    const err = new Error('Forbidden') as Error & { statusCode: number };
    err.statusCode = 403;
    throw err;
  }

  const result = await pool.query<{
    id: string;
    amount: string;
    token: string;
    description: string | null;
    expires_at: Date | null;
    privacy_mode: string;
    usage_type: string;
    status: string;
    created_at: Date;
  }>(
    `UPDATE payment_links
     SET status = 'deactivated'
     WHERE id = $1
     RETURNING id, amount, token, description, expires_at, privacy_mode, usage_type, status, created_at`,
    [linkId]
  );

  return toPrivateResponse(result.rows[0]!);
}
