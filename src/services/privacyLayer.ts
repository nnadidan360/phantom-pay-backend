import { createPublicKey, verify as cryptoVerify } from 'crypto';
import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { encrypt, decrypt } from './encryption';
import type { PaymentHistoryItem } from '../types/index';

// ─── Metadata encryption helpers ─────────────────────────────────

/**
 * Serialize and encrypt a metadata object using AES-256-GCM.
 * Returns the stored "iv:authTag:ciphertext" string.
 */
export function encryptMetadata(metadata: object, keyHex: string): string {
  return encrypt(JSON.stringify(metadata), keyHex);
}

/**
 * Decrypt and deserialize a stored metadata string.
 * Returns the original metadata object.
 */
export function decryptMetadata(stored: string, keyHex: string): object {
  return JSON.parse(decrypt(stored, keyHex));
}

// ─── Identity stripping ───────────────────────────────────────────

/**
 * Return a copy of a payment history item with all payer identity fields removed.
 * Ensures `walletAddress`, `payerWallet`, and `encryptedSenderMetadata` are never present.
 */
export function stripPayerIdentity(paymentRow: PaymentHistoryItem): PaymentHistoryItem {
  const {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ...safe
  } = paymentRow as PaymentHistoryItem & {
    walletAddress?: unknown;
    payerWallet?: unknown;
    encryptedSenderMetadata?: unknown;
  };

  // Explicitly delete any identity fields that may have been spread in
  delete (safe as Record<string, unknown>)['walletAddress'];
  delete (safe as Record<string, unknown>)['payerWallet'];
  delete (safe as Record<string, unknown>)['encryptedSenderMetadata'];

  return safe as PaymentHistoryItem;
}

// ─── Sender proof verification ────────────────────────────────────

/**
 * Verify an Ed25519 sender proof (signature) against a wallet address and message.
 *
 * @param proof         Base58-encoded Ed25519 signature
 * @param walletAddress Base58-encoded Solana public key (32 bytes)
 * @param message       The plaintext message that was signed
 * @returns `true` if the signature is valid, `false` otherwise
 * @throws  Typed error with statusCode 400 if the proof format is invalid
 */
export function verifySenderProof(
  proof: string,
  walletAddress: string,
  message: string
): boolean {
  let pubKeyBytes: Uint8Array;
  let signatureBytes: Uint8Array;

  // Decode wallet address → 32-byte public key
  try {
    pubKeyBytes = new PublicKey(walletAddress).toBytes();
    if (pubKeyBytes.length !== 32) {
      throw new Error('Public key must be 32 bytes');
    }
  } catch {
    const err = new Error('Invalid wallet address format') as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }

  // Decode base58 proof → signature bytes
  try {
    signatureBytes = bs58.decode(proof);
    if (signatureBytes.length !== 64) {
      throw new Error('Signature must be 64 bytes');
    }
  } catch (inner) {
    // Re-throw our own typed errors; wrap decode errors
    if ((inner as { statusCode?: number }).statusCode === 400) throw inner;
    const err = new Error('Invalid sender proof format') as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }

  // Build DER-encoded SubjectPublicKeyInfo for Ed25519
  // OID 1.3.101.112 = Ed25519, DER prefix: 302a300506032b6570032100
  const derPrefix = Buffer.from('302a300506032b6570032100', 'hex');
  const spkiDer = Buffer.concat([derPrefix, Buffer.from(pubKeyBytes)]);
  const publicKey = createPublicKey({ key: spkiDer, format: 'der', type: 'spki' });

  const messageBytes = Buffer.from(message, 'utf8');

  try {
    return cryptoVerify(null, messageBytes, publicKey, Buffer.from(signatureBytes));
  } catch {
    return false;
  }
}
