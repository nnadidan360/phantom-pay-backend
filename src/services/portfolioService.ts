import { pool } from '../db/client';
import { bagsClient, BagsApiError } from './bagsClient';
import type { PortfolioHolding } from '../types/index';

export async function getPortfolio(creatorId: string): Promise<PortfolioHolding[]> {
  const result = await pool.query<{ session_wallet_public_key: string }>(
    'SELECT session_wallet_public_key FROM creators WHERE id = $1',
    [creatorId]
  );

  if (result.rows.length === 0) {
    const err = new Error('Creator not found') as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  const { session_wallet_public_key } = result.rows[0];

  try {
    return await bagsClient.getPortfolio(session_wallet_public_key);
  } catch (error) {
    if (error instanceof BagsApiError) {
      const err = new Error('Portfolio service unavailable') as Error & { statusCode: number };
      err.statusCode = 502;
      throw err;
    }
    throw error;
  }
}
