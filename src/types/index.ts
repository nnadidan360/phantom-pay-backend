// ─── Core Domain Types ───────────────────────────────────────────

export type PrivacyMode = 'anonymous' | 'verifiable';
export type UsageType = 'single-use' | 'multi-use';
export type PaymentLinkStatus = 'active' | 'expired' | 'fulfilled' | 'deactivated';
export type Token = 'SOL' | 'USDC';

// ─── Database Row Types ──────────────────────────────────────────

export interface CreatorRow {
  id: string;                          // UUID v4
  walletAddress: string;               // base58 Solana public key
  sessionWalletPublicKey: string;      // base58 session wallet public key
  encryptedSessionPrivateKey: string;  // AES-256-GCM: "iv:authTag:ciphertext" (base64)
  sessionToken: string | null;         // current JWT
  sessionCreatedAt: Date;
  sessionExpiresAt: Date;
  sessionRevoked: boolean;
}

export interface PaymentLinkRow {
  id: string;                          // UUID v4 (linkId)
  creatorId: string;                   // FK → creators.id
  amount: number;
  token: Token;
  description: string | null;
  expiresAt: Date | null;
  privacyMode: PrivacyMode;
  usageType: UsageType;
  status: PaymentLinkStatus;
  createdAt: Date;
}

export interface PaymentRow {
  id: string;                          // UUID v4
  paymentLinkId: string;               // FK → payment_links.id
  amountSOL: number;
  token: Token;
  privacyMode: PrivacyMode;
  senderProof: string | null;          // base58 signature (VerifiableMode only)
  encryptedSenderMetadata: string;     // AES-256-GCM: "iv:authTag:ciphertext"
  txHash: string;
  bagsFeePaid: boolean;
  bagsFeeAmount: number | null;
  createdAt: Date;
}

// ─── API Request / Response Types ───────────────────────────────

export interface AuthConnectRequest {
  walletAddress: string;
  signature: string;   // base58-encoded Ed25519 signature
  nonce: string;       // server-issued challenge nonce
}

export interface AuthConnectResponse {
  sessionToken: string;
  sessionWalletPublicKey: string;
}

export interface CreatePaymentLinkRequest {
  amount: number;
  token: Token;
  description?: string;
  expiresAt?: string;   // ISO 8601
  privacyMode: PrivacyMode;
  usageType: UsageType;
}

export interface PaymentLinkPublicResponse {
  linkId: string;
  amount: number;
  token: Token;
  description: string | null;
  expiresAt: string | null;
  privacyMode: PrivacyMode;
  status: PaymentLinkStatus;
}

export interface PaymentLinkPrivateResponse extends PaymentLinkPublicResponse {
  usageType: UsageType;
  createdAt: string;
}

export interface PayRequest {
  senderProof?: string;  // required for VerifiableMode if Payer wants proof
}

export interface PayResponse {
  txHash: string;
  proofValid: boolean;
}

export interface PaymentHistoryItem {
  id: string;
  paymentLinkId: string;
  amountSOL: number;
  token: Token;
  privacyMode: PrivacyMode;
  txHash: string;
  createdAt: string;
  proofValid: boolean;
  senderProof?: string;  // only for Creator's own history, VerifiableMode
}

export interface PaymentHistoryResponse {
  payments: PaymentHistoryItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PortfolioHolding {
  tokenName: string;
  tokenSymbol: string;
  quantity: number;
  estimatedValue: number;
}

export interface EarningsSummary {
  totalEarningsSOL: number;
  totalEarningsUSDC: number;
  paymentCount: number;
  bagsFeesGenerated: number;
}

// ─── BAGS API Types ──────────────────────────────────────────────

export interface TradeParams {
  walletPublicKey: string;
  amount: number;
  token: Token;
  creatorTokenAddress: string;
}

export interface TradeResult {
  tradeId: string;
  txHash: string;
  feeEvent: BagsFeeEvent;
}

export interface BagsFeeEvent {
  feeId: string;
  feeAmount: number;
  token: Token;
  timestamp: string;
}

// ─── Internal Service Types ──────────────────────────────────────

export interface SessionWalletRecord {
  publicKey: string;
  encryptedPrivateKey: string;
}

export interface JwtPayload {
  creatorId: string;
  sessionWalletPublicKey: string;
  iat: number;
  exp: number;
}

export interface ErrorResponse {
  error: string;
  details?: Array<{ field: string; message: string }>;
}
