import axios, { AxiosInstance } from 'axios';
import { z } from 'zod';
import { config } from '../config';
import type { TradeParams, TradeResult, PortfolioHolding, BagsFeeEvent } from '../types/index';

// ─── Typed error ─────────────────────────────────────────────────

export class BagsApiError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'BagsApiError';
    this.statusCode = statusCode;
  }
}

// ─── Zod schemas ─────────────────────────────────────────────────

const TokenSchema = z.enum(['SOL', 'USDC']);

const BagsFeeEventSchema = z.object({
  feeId: z.string(),
  feeAmount: z.number(),
  token: TokenSchema,
  timestamp: z.string(),
});

const TradeResultSchema = z.object({
  tradeId: z.string(),
  txHash: z.string(),
  feeEvent: BagsFeeEventSchema,
});

const PortfolioHoldingSchema = z.object({
  tokenName: z.string(),
  tokenSymbol: z.string(),
  quantity: z.number(),
  estimatedValue: z.number(),
});

const PortfolioResponseSchema = z.array(PortfolioHoldingSchema);

const FeeEventsResponseSchema = z.array(BagsFeeEventSchema);

// ─── BagsClient interface ─────────────────────────────────────────

export interface BagsClient {
  executeTrade(params: TradeParams): Promise<TradeResult>;
  getPortfolio(walletPublicKey: string): Promise<PortfolioHolding[]>;
  getFeeEvents(walletPublicKey: string): Promise<BagsFeeEvent[]>;
}

// ─── Implementation ───────────────────────────────────────────────

class BagsClientImpl implements BagsClient {
  private readonly http: AxiosInstance;

  constructor() {
    this.http = axios.create({
      baseURL: config.BAGS_API_BASE_URL,
      timeout: 10_000,
      headers: {
        Authorization: `Bearer ${config.BAGS_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    // Intercept non-2xx responses and throw BagsApiError
    this.http.interceptors.response.use(
      (response) => response,
      (error) => {
        const statusCode = error.response?.status ?? 502;
        const message =
          error.response?.data?.message ??
          error.response?.data?.error ??
          'BAGS API request failed';
        throw new BagsApiError(String(message), statusCode);
      }
    );
  }

  async executeTrade(params: TradeParams): Promise<TradeResult> {
    const response = await this.http.post<unknown>('/trades', params);
    const parsed = TradeResultSchema.safeParse(response.data);
    if (!parsed.success) {
      throw new BagsApiError(
        `Invalid trade response: ${parsed.error.message}`,
        502
      );
    }
    return parsed.data;
  }

  async getPortfolio(walletPublicKey: string): Promise<PortfolioHolding[]> {
    const response = await this.http.get<unknown>(`/portfolio/${walletPublicKey}`);
    const parsed = PortfolioResponseSchema.safeParse(response.data);
    if (!parsed.success) {
      throw new BagsApiError(
        `Invalid portfolio response: ${parsed.error.message}`,
        502
      );
    }
    return parsed.data;
  }

  async getFeeEvents(walletPublicKey: string): Promise<BagsFeeEvent[]> {
    const response = await this.http.get<unknown>(`/fee-events/${walletPublicKey}`);
    const parsed = FeeEventsResponseSchema.safeParse(response.data);
    if (!parsed.success) {
      throw new BagsApiError(
        `Invalid fee events response: ${parsed.error.message}`,
        502
      );
    }
    return parsed.data;
  }
}

export const bagsClient: BagsClient = new BagsClientImpl();
