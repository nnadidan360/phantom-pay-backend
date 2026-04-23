import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests for config validation logic.
 * We test the validation functions in isolation by re-implementing them here,
 * since the actual config module calls process.exit() on failure.
 */

const HEX_64 = /^[0-9a-fA-F]{64}$/;
const DB_URL = /^postgres(?:ql)?:\/\/.+/;
const RPC_URL = /^https?:\/\/.+/;

describe('Config validation', () => {
  describe('ENCRYPTION_KEY', () => {
    it('accepts exactly 64 lowercase hex chars', () => {
      expect(HEX_64.test('a'.repeat(64))).toBe(true);
    });

    it('accepts exactly 64 uppercase hex chars', () => {
      expect(HEX_64.test('F'.repeat(64))).toBe(true);
    });

    it('accepts mixed-case 64 hex chars', () => {
      expect(HEX_64.test('0123456789abcdefABCDEF'.padEnd(64, '0'))).toBe(true);
    });

    it('rejects 63 hex chars', () => {
      expect(HEX_64.test('a'.repeat(63))).toBe(false);
    });

    it('rejects 65 hex chars', () => {
      expect(HEX_64.test('a'.repeat(65))).toBe(false);
    });

    it('rejects non-hex characters', () => {
      expect(HEX_64.test('g'.repeat(64))).toBe(false);
    });

    it('rejects empty string', () => {
      expect(HEX_64.test('')).toBe(false);
    });
  });

  describe('DATABASE_URL', () => {
    it('accepts postgresql:// scheme', () => {
      expect(DB_URL.test('postgresql://user:pass@localhost:5432/db')).toBe(true);
    });

    it('accepts postgres:// scheme', () => {
      expect(DB_URL.test('postgres://user:pass@localhost:5432/db')).toBe(true);
    });

    it('rejects mysql:// scheme', () => {
      expect(DB_URL.test('mysql://user:pass@localhost:3306/db')).toBe(false);
    });

    it('rejects plain string', () => {
      expect(DB_URL.test('not-a-url')).toBe(false);
    });
  });

  describe('SOLANA_RPC_URL', () => {
    it('accepts https:// URL', () => {
      expect(RPC_URL.test('https://api.devnet.solana.com')).toBe(true);
    });

    it('accepts http:// URL', () => {
      expect(RPC_URL.test('http://localhost:8899')).toBe(true);
    });

    it('rejects non-URL string', () => {
      expect(RPC_URL.test('devnet.solana.com')).toBe(false);
    });
  });
});
