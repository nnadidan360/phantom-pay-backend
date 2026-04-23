-- Migration: 001_initial_schema.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE creators (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address                TEXT NOT NULL UNIQUE,
  session_wallet_public_key     TEXT NOT NULL,
  encrypted_session_private_key TEXT NOT NULL,
  session_token                 TEXT,
  session_created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  session_expires_at            TIMESTAMPTZ NOT NULL,
  session_revoked               BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE payment_links (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id   UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  amount       NUMERIC(20, 9) NOT NULL CHECK (amount > 0),
  token        TEXT NOT NULL CHECK (token IN ('SOL', 'USDC')),
  description  TEXT CHECK (char_length(description) <= 200),
  expires_at   TIMESTAMPTZ,
  privacy_mode TEXT NOT NULL CHECK (privacy_mode IN ('anonymous', 'verifiable')),
  usage_type   TEXT NOT NULL CHECK (usage_type IN ('single-use', 'multi-use')),
  status       TEXT NOT NULL DEFAULT 'active'
               CHECK (status IN ('active', 'expired', 'fulfilled', 'deactivated')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payment_links_creator_id ON payment_links(creator_id);

CREATE TABLE payments (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_link_id           UUID NOT NULL REFERENCES payment_links(id) ON DELETE RESTRICT,
  amount_sol                NUMERIC(20, 9) NOT NULL,
  token                     TEXT NOT NULL CHECK (token IN ('SOL', 'USDC')),
  privacy_mode              TEXT NOT NULL CHECK (privacy_mode IN ('anonymous', 'verifiable')),
  sender_proof              TEXT,
  encrypted_sender_metadata TEXT NOT NULL,
  tx_hash                   TEXT NOT NULL,
  bags_fee_paid             BOOLEAN NOT NULL DEFAULT FALSE,
  bags_fee_amount           NUMERIC(20, 9),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_payment_link_id ON payments(payment_link_id);
