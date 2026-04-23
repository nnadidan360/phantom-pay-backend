import { Keypair, Transaction } from '@solana/web3.js';
import { encrypt, decrypt } from './encryption';
import { pool } from '../db/client';
import { config } from '../config';
import type { SessionWalletRecord } from '../types/index';

export interface SessionWalletManager {
  createSessionWallet(creatorId: string): Promise<SessionWalletRecord>;
  signTransaction(creatorId: string, tx: Transaction): Promise<Transaction>;
  deactivateSessionWallet(creatorId: string): Promise<void>;
}

class SessionWalletManagerImpl implements SessionWalletManager {
  async createSessionWallet(creatorId: string): Promise<SessionWalletRecord> {
    const keypair = Keypair.generate();
    const secretKeyB64 = Buffer.from(keypair.secretKey).toString('base64');
    const encryptedPrivateKey = encrypt(secretKeyB64, config.ENCRYPTION_KEY);
    const publicKey = keypair.publicKey.toBase58();

    return { publicKey, encryptedPrivateKey };
  }

  async signTransaction(creatorId: string, tx: Transaction): Promise<Transaction> {
    const result = await pool.query(
      'SELECT id, encrypted_session_private_key, session_revoked FROM creators WHERE id = $1',
      [creatorId]
    );

    if (result.rowCount === 0) {
      throw new Error('Creator not found');
    }

    const row = result.rows[0];

    if (row.id !== creatorId) {
      throw new Error('Creator ID mismatch');
    }

    if (row.session_revoked) {
      throw new Error('Session has been revoked');
    }

    // Decrypt private key in-memory only — never log or expose
    const secretKeyB64: string = decrypt(row.encrypted_session_private_key, config.ENCRYPTION_KEY);
    const keypair = Keypair.fromSecretKey(Buffer.from(secretKeyB64, 'base64'));

    tx.sign(keypair);

    // Drop reference to decrypted key material
    (keypair as unknown as { _secretKey: Uint8Array })._secretKey?.fill(0);

    return tx;
  }

  async deactivateSessionWallet(creatorId: string): Promise<void> {
    await pool.query(
      'UPDATE creators SET session_revoked = TRUE WHERE id = $1',
      [creatorId]
    );
  }
}

export const sessionWalletManager: SessionWalletManager = new SessionWalletManagerImpl();
