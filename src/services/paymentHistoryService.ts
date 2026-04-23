import { pool } from '../db/client';
import type { PaymentHistoryItem, PaymentHistoryResponse, PrivacyMode, Token } from '../types/index';

interface PaymentRow {
  id: string;
  payment_link_id: string;
  amount_sol: string;
  token: Token;
  privacy_mode: PrivacyMode;
  sender_proof: string | null;
  tx_hash: string;
  bags_fee_paid: boolean;
  created_at: Date;
}

export async function getHistory(
  creatorId: string,
  page: number = 1,
  pageSize: number = 25
): Promise<PaymentHistoryResponse> {
  const offset = (page - 1) * pageSize;

  const [paymentsResult, countResult] = await Promise.all([
    pool.query<PaymentRow>(
      `SELECT p.id, p.payment_link_id, p.amount_sol, p.token, p.privacy_mode,
              p.sender_proof, p.tx_hash, p.bags_fee_paid, p.created_at
       FROM payments p
       JOIN payment_links pl ON p.payment_link_id = pl.id
       WHERE pl.creator_id = $1
       ORDER BY p.created_at DESC
       LIMIT $2 OFFSET $3`,
      [creatorId, pageSize, offset]
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*) FROM payments p
       JOIN payment_links pl ON p.payment_link_id = pl.id
       WHERE pl.creator_id = $1`,
      [creatorId]
    ),
  ]);

  const payments: PaymentHistoryItem[] = paymentsResult.rows.map((row) => {
    const item: PaymentHistoryItem = {
      id: row.id,
      paymentLinkId: row.payment_link_id,
      amountSOL: parseFloat(row.amount_sol),
      token: row.token,
      privacyMode: row.privacy_mode,
      txHash: row.tx_hash,
      createdAt: row.created_at.toISOString(),
      proofValid: row.sender_proof !== null,
    };

    if (row.privacy_mode === 'verifiable' && row.sender_proof !== null) {
      item.senderProof = row.sender_proof;
    }

    return item;
  });

  return {
    payments,
    total: parseInt(countResult.rows[0].count, 10),
    page,
    pageSize,
  };
}
