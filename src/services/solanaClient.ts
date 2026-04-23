import { Connection, Transaction, Keypair, sendAndConfirmTransaction } from '@solana/web3.js';
import { config } from '../config';

const CONFIRMATION_TIMEOUT_MS = 30_000;

export class TransactionTimeoutError extends Error {
  constructor() {
    super('Transaction confirmation timed out');
    this.name = 'TransactionTimeoutError';
  }
}

export class SolanaClient {
  private connection: Connection;

  constructor(rpcUrl: string) {
    this.connection = new Connection(rpcUrl, 'confirmed');
  }

  async submitAndConfirm(tx: Transaction, signerKeypair: Keypair): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIRMATION_TIMEOUT_MS);
    try {
      const txHash = await sendAndConfirmTransaction(this.connection, tx, [signerKeypair]);
      return txHash;
    } catch (err) {
      if (controller.signal.aborted) throw new TransactionTimeoutError();
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const solanaClient = new SolanaClient(config.SOLANA_RPC_URL);
