import { pool } from '../db/client';
import type { EarningsSummary } from '../types/index';

export async function getEarnings(creatorId: string): Promise<EarningsSummary> {
  const result = await pool.query<{
    total_earnings_sol: string;
    total_earnings_usdc: string;
    payment_count: string;
    bags_fees_generated: string;
  }>(
    `SELECT
      COALESCE(SUM(CASE WHEN p.token = 'SOL' THEN p.amount_sol ELSE 0 END), 0) AS total_earnings_sol,
      COALESCE(SUM(CASE WHEN p.token = 'USDC' THEN p.amount_sol ELSE 0 END), 0) AS total_earnings_usdc,
      COUNT(p.id) AS payment_count,
      COUNT(CASE WHEN p.bags_fee_paid = true THEN 1 END) AS bags_fees_generated
    FROM payments p
    JOIN payment_links pl ON p.payment_link_id = pl.id
    WHERE pl.creator_id = $1
      AND p.bags_fee_paid = true`,
    [creatorId]
  );

  const row = result.rows[0];

  return {
    totalEarningsSOL: parseFloat(row.total_earnings_sol),
    totalEarningsUSDC: parseFloat(row.total_earnings_usdc),
    paymentCount: parseInt(row.payment_count, 10),
    bagsFeesGenerated: parseInt(row.bags_fees_generated, 10),
  };
}
