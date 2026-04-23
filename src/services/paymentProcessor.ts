import { randomUUID } from 'crypto';
import { Transaction } from '@solana/web3.js';
import { pool } from '../db/client';
import { config } from '../config';
import { bagsClient, BagsApiError } from './bagsClient';
import { evaluateLinkStatus } from './paymentLinkService';
import { encryptMetadata, verifySenderProof } from './privacyLayer';
import { sessionWalletManager } from './sessionWalletManager';
import { TransactionTimeoutError } from './solanaClient';
import type { PayRequest, PayResponse, PaymentLinkRow } from '../types/index';

const CHALLENGE_MESSAGE = 'PhantomPay payment proof';

function makeError(message: string, statusCode: number): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}

export async function processPayment(
  linkId: string,
  payRequest: PayRequest
): Promise<PayResponse> {
  const client = await pool.connect();
  let committed = false;

  try {
    // 1. Begin transaction
    await client.query('BEGIN');

    // 2. Fetch + lock the payment_links row (FOR UPDATE = single-use atomicity)
    const linkResult = await client.query<{
      id: string;
      creator_id: string;
      amount: string;
      token: string;
      description: string | null;
      expires_at: Date | null;
      privacy_mode: string;
      usage_type: string;
      status: string;
      created_at: Date;
    }>(
      `SELECT id, creator_id, amount, token, description, expires_at,
              privacy_mode, usage_type, status, created_at
       FROM payment_links
       WHERE id = $1
       FOR UPDATE`,
      [linkId]
    );

    // 3. Not found → 404
    if (linkResult.rowCount === 0) {
      throw makeError('Payment link not found', 404);
    }

    const row = linkResult.rows[0]!;

    // 4. Build PaymentLinkRow and evaluate status
    const link: PaymentLinkRow = {
      id: row.id,
      creatorId: row.creator_id,
      amount: Number(row.amount),
      token: row.token as PaymentLinkRow['token'],
      description: row.description,
      expiresAt: row.expires_at,
      privacyMode: row.privacy_mode as PaymentLinkRow['privacyMode'],
      usageType: row.usage_type as PaymentLinkRow['usageType'],
      status: row.status as PaymentLinkRow['status'],
      createdAt: row.created_at,
    };

    const status = evaluateLinkStatus(link);

    // 5. Expired → 422
    if (status === 'expired') {
      throw makeError('Payment link has expired', 422);
    }
    // 6. Fulfilled → 422
    if (status === 'fulfilled') {
      throw makeError('Payment link has already been fulfilled', 422);
    }
    // 7. Deactivated → 422
    if (status === 'deactivated') {
      throw makeError('Payment link is no longer active', 422);
    }

    // 8. Verifiable mode proof verification
    let proofValid = false;
    if (link.privacyMode === 'verifiable' && payRequest.senderProof) {
      const payerWalletAddress =
        (payRequest as PayRequest & { payerWallet?: string }).payerWallet ?? '';
      try {
        const result = verifySenderProof(
          payRequest.senderProof,
          payerWalletAddress,
          CHALLENGE_MESSAGE
        );
        if (!result) {
          throw makeError('Invalid sender proof', 400);
        }
        proofValid = true;
      } catch (err) {
        const e = err as Error & { statusCode?: number };
        if (e.statusCode === 400) throw e;
        throw makeError('Invalid sender proof', 400);
      }
    }

    // 9. Fetch creator session wallet public key for the BAGS trade
    const creatorResult = await client.query<{ session_wallet_public_key: string }>(
      'SELECT session_wallet_public_key FROM creators WHERE id = $1',
      [link.creatorId]
    );

    const creatorSessionWalletPublicKey =
      creatorResult.rowCount! > 0
        ? creatorResult.rows[0]!.session_wallet_public_key
        : '';

    // Execute BAGS trade
    let tradeResult;
    try {
      tradeResult = await bagsClient.executeTrade({
        walletPublicKey: creatorSessionWalletPublicKey,
        amount: link.amount,
        token: link.token,
        creatorTokenAddress: 'placeholder',
      });
    } catch (err) {
      if (err instanceof BagsApiError) {
        throw makeError('Payment routing service unavailable', 502);
      }
      throw err;
    }

    // 10. Confirm feeEvent exists
    if (!tradeResult.feeEvent) {
      throw makeError('Payment routing service unavailable', 502);
    }

    // 11-13. Build minimal transaction, sign via session wallet manager,
    //        use BAGS txHash (BAGS handles actual on-chain execution)
    const tx = new Transaction();
    await sessionWalletManager.signTransaction(link.creatorId, tx);
    const txHash = tradeResult.txHash;

    // 14. Encrypt sender metadata
    const encryptedSenderMetadata = encryptMetadata(
      { ip: 'redacted', timestamp: new Date().toISOString() },
      config.ENCRYPTION_KEY
    );

    // 15. Insert payment record
    const paymentId = randomUUID();
    await client.query(
      `INSERT INTO payments
         (id, payment_link_id, amount_sol, token, privacy_mode, sender_proof,
          encrypted_sender_metadata, tx_hash, bags_fee_paid, bags_fee_amount)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        paymentId,
        linkId,
        link.amount,
        link.token,
        link.privacyMode,
        payRequest.senderProof ?? null,
        encryptedSenderMetadata,
        txHash,
        true,
        tradeResult.feeEvent.feeAmount,
      ]
    );

    // Fulfill single-use link
    if (link.usageType === 'single-use') {
      await client.query(
        `UPDATE payment_links SET status = 'fulfilled' WHERE id = $1`,
        [linkId]
      );
    }

    // 16. Commit
    await client.query('COMMIT');
    committed = true;

    // 17. Return result
    return { txHash, proofValid };
  } catch (err) {
    if (!committed) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore rollback errors
      }
    }

    if (err instanceof BagsApiError) {
      throw makeError('Payment routing service unavailable', 502);
    }
    if (err instanceof TransactionTimeoutError) {
      throw makeError('Transaction confirmation timed out', 504);
    }

    throw err;
  } finally {
    client.release();
  }
}
