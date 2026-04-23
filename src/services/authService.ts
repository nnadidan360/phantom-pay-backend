import { randomUUID } from 'crypto';
import { createPublicKey, verify as cryptoVerify } from 'crypto';
import jwt from 'jsonwebtoken';
import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { pool } from '../db/client';
import { config } from '../config';
import { sessionWalletManager } from './sessionWalletManager';
import type { AuthConnectResponse } from '../types/index';

// ─── Nonce store: nonce → { expiry (ms), message } ───────────────
interface NonceEntry {
  expiry: number;
  message: string;
}
const nonceStore = new Map<string, NonceEntry>();
const NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Periodically clean up expired nonces to prevent unbounded growth
setInterval(() => {
  const now = Date.now();
  for (const [nonce, entry] of nonceStore.entries()) {
    if (now > entry.expiry) nonceStore.delete(nonce);
  }
}, 60_000).unref();

// ─── Challenge generation ─────────────────────────────────────────

export interface ChallengeResponse {
  nonce: string;
  message: string;
}

export function generateChallenge(): ChallengeResponse {
  const nonce = randomUUID();
  const iso8601 = new Date().toISOString();
  const message = `PhantomPay authentication challenge: ${nonce}\nTimestamp: ${iso8601}`;
  nonceStore.set(nonce, { expiry: Date.now() + NONCE_TTL_MS, message });
  return { nonce, message };
}

// ─── Signature verification ───────────────────────────────────────

/**
 * Verify an Ed25519 signature using Node.js built-in crypto.
 * The public key is derived from the base58 wallet address.
 * The signature is base58-encoded.
 */
function verifyEd25519Signature(
  walletAddress: string,
  signatureBase58: string,
  messageText: string
): boolean {
  try {
    // Decode the base58 wallet address to get the 32-byte public key
    const pubKeyBytes = new PublicKey(walletAddress).toBytes();

    // Build a DER-encoded SubjectPublicKeyInfo for Ed25519
    // OID 1.3.101.112 = Ed25519, DER prefix: 302a300506032b6570032100
    const derPrefix = Buffer.from('302a300506032b6570032100', 'hex');
    const spkiDer = Buffer.concat([derPrefix, Buffer.from(pubKeyBytes)]);
    const publicKey = createPublicKey({ key: spkiDer, format: 'der', type: 'spki' });

    // Decode the base58 signature
    const signatureBytes = bs58.decode(signatureBase58);

    // Verify against the UTF-8 encoded message
    const messageBytes = Buffer.from(messageText, 'utf8');
    return cryptoVerify(null, messageBytes, publicKey, signatureBytes);
  } catch {
    return false;
  }
}

// ─── Connect (authenticate) ───────────────────────────────────────

export async function connect(
  walletAddress: string,
  signature: string,
  nonce: string
): Promise<AuthConnectResponse> {
  // 1. Verify nonce exists and hasn't expired
  const entry = nonceStore.get(nonce);
  if (!entry || Date.now() > entry.expiry) {
    const err = new Error('Invalid or expired nonce') as Error & { statusCode: number };
    err.statusCode = 401;
    throw err;
  }

  // 2. Consume the nonce immediately (prevent replay)
  nonceStore.delete(nonce);
  const challengeMessage = entry.message;

  // 3. Verify Ed25519 signature against the stored challenge message
  const isValid = verifyEd25519Signature(walletAddress, signature, challengeMessage);
  if (!isValid) {
    const err = new Error('Invalid wallet signature') as Error & { statusCode: number };
    err.statusCode = 401;
    throw err;
  }

  // 4. Check for existing active session and deactivate it
  const existingResult = await pool.query<{ id: string }>(
    'SELECT id FROM creators WHERE wallet_address = $1 AND session_revoked = FALSE',
    [walletAddress]
  );
  if (existingResult.rowCount && existingResult.rowCount > 0) {
    const existingCreatorId = existingResult.rows[0]!.id;
    await sessionWalletManager.deactivateSessionWallet(existingCreatorId);
  }

  // 5. Upsert creator row to get stable creatorId
  //    Use placeholder values for session wallet fields; we'll update them after generation.
  const sessionExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

  const upsertResult = await pool.query<{ id: string }>(
    `INSERT INTO creators (
       wallet_address,
       session_wallet_public_key,
       encrypted_session_private_key,
       session_token,
       session_created_at,
       session_expires_at,
       session_revoked
     ) VALUES ($1, 'pending', 'pending', NULL, NOW(), $2, FALSE)
     ON CONFLICT (wallet_address) DO UPDATE
       SET session_revoked = FALSE,
           session_created_at = NOW(),
           session_expires_at = $2,
           session_token = NULL
     RETURNING id`,
    [walletAddress, sessionExpiresAt]
  );

  const creatorId = upsertResult.rows[0]!.id;

  // 6. Generate new session wallet using the stable creatorId
  const sessionWallet = await sessionWalletManager.createSessionWallet(creatorId);

  // 7. Issue JWT (HS256, 24h)
  const jwtPayload = {
    creatorId,
    sessionWalletPublicKey: sessionWallet.publicKey,
  };
  const sessionToken = jwt.sign(jwtPayload, config.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '24h',
  });

  // 8. Update creator row with real session wallet data and JWT
  //    NEVER include session private key in response or logs
  await pool.query(
    `UPDATE creators
     SET session_wallet_public_key = $1,
         encrypted_session_private_key = $2,
         session_token = $3
     WHERE id = $4`,
    [sessionWallet.publicKey, sessionWallet.encryptedPrivateKey, sessionToken, creatorId]
  );

  return {
    sessionToken,
    sessionWalletPublicKey: sessionWallet.publicKey,
  };
}

// ─── Revoke session ───────────────────────────────────────────────

export async function revokeSession(creatorId: string): Promise<{ message: string }> {
  await sessionWalletManager.deactivateSessionWallet(creatorId);
  await pool.query(
    'UPDATE creators SET session_token = NULL WHERE id = $1',
    [creatorId]
  );
  return { message: 'Session revoked' };
}
