/**
 * Configuration loader — reads and validates all required environment variables at startup.
 * Exits with a non-zero code if any variable is missing or malformed.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`[config] Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

function validateDatabaseUrl(url: string): void {
  // Must start with postgresql:// or postgres://
  if (!/^postgres(?:ql)?:\/\/.+/.test(url)) {
    console.error(
      `[config] DATABASE_URL is malformed. Expected format: postgresql://user:password@host:port/dbname`
    );
    process.exit(1);
  }
}

function validateSolanaRpcUrl(url: string): void {
  if (!/^https?:\/\/.+/.test(url)) {
    console.error(
      `[config] SOLANA_RPC_URL is malformed. Expected a valid HTTP/HTTPS URL.`
    );
    process.exit(1);
  }
}

function validateEncryptionKey(key: string): void {
  // Must be exactly 64 hex characters (32 bytes for AES-256)
  if (!/^[0-9a-fA-F]{64}$/.test(key)) {
    console.error(
      `[config] ENCRYPTION_KEY is malformed. Must be exactly 64 hexadecimal characters (32 bytes).`
    );
    process.exit(1);
  }
}

const DATABASE_URL = requireEnv('DATABASE_URL');
validateDatabaseUrl(DATABASE_URL);

const SOLANA_RPC_URL = requireEnv('SOLANA_RPC_URL');
validateSolanaRpcUrl(SOLANA_RPC_URL);

const ENCRYPTION_KEY = requireEnv('ENCRYPTION_KEY');
validateEncryptionKey(ENCRYPTION_KEY);

export const config = {
  DATABASE_URL,
  JWT_SECRET: requireEnv('JWT_SECRET'),
  ENCRYPTION_KEY,
  BAGS_API_KEY: requireEnv('BAGS_API_KEY'),
  BAGS_API_BASE_URL: requireEnv('BAGS_API_BASE_URL'),
  SOLANA_RPC_URL,
  FRONTEND_ORIGIN: requireEnv('FRONTEND_ORIGIN'),
  PORT: parseInt(process.env['PORT'] ?? '3001', 10),
} as const;

export type Config = typeof config;
