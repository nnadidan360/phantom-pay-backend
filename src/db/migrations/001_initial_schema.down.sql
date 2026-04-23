-- Rollback: 001_initial_schema.down.sql

DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS payment_links;
DROP TABLE IF EXISTS creators;

DROP EXTENSION IF EXISTS "pgcrypto";
