import { describe, it, expect, vi, afterEach } from 'vitest';

// Mock the db client to avoid requiring DATABASE_URL in pure unit tests
vi.mock('../../db/client', () => ({ pool: {} }));

import { evaluateLinkStatus } from '../../services/paymentLinkService';
import type { PaymentLinkRow } from '../../types/index';

function makeLink(overrides: Partial<PaymentLinkRow> = {}): PaymentLinkRow {
  return {
    id: 'test-id',
    creatorId: 'creator-id',
    amount: 10,
    token: 'SOL',
    description: null,
    expiresAt: null,
    privacyMode: 'anonymous',
    usageType: 'single-use',
    status: 'active',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('evaluateLinkStatus', () => {
  it('returns active when no expiry and status is active', () => {
    expect(evaluateLinkStatus(makeLink())).toBe('active');
  });

  it('returns expired when expiresAt is in the past', () => {
    const link = makeLink({ expiresAt: new Date('2020-01-01T00:00:00Z') });
    expect(evaluateLinkStatus(link)).toBe('expired');
  });

  it('returns active when expiresAt is in the future', () => {
    const link = makeLink({ expiresAt: new Date(Date.now() + 60_000) });
    expect(evaluateLinkStatus(link)).toBe('active');
  });

  it('returns fulfilled regardless of expiresAt (terminal state)', () => {
    const link = makeLink({
      status: 'fulfilled',
      expiresAt: new Date('2020-01-01T00:00:00Z'),
    });
    expect(evaluateLinkStatus(link)).toBe('fulfilled');
  });

  it('returns deactivated regardless of expiresAt (terminal state)', () => {
    const link = makeLink({
      status: 'deactivated',
      expiresAt: new Date('2020-01-01T00:00:00Z'),
    });
    expect(evaluateLinkStatus(link)).toBe('deactivated');
  });

  it('re-evaluates expiry at call time, not a cached value', () => {
    vi.useFakeTimers();
    // Set time before expiry
    vi.setSystemTime(new Date('2024-06-01T12:00:00Z'));
    const link = makeLink({ expiresAt: new Date('2024-06-01T13:00:00Z') });

    expect(evaluateLinkStatus(link)).toBe('active');

    // Advance time past expiry
    vi.setSystemTime(new Date('2024-06-01T14:00:00Z'));
    expect(evaluateLinkStatus(link)).toBe('expired');
  });

  it('returns active when expiresAt is null', () => {
    const link = makeLink({ expiresAt: null, status: 'active' });
    expect(evaluateLinkStatus(link)).toBe('active');
  });
});
