-- Merkato Credit Record — Neon PostgreSQL schema
-- Apply with: node db/apply-schema.mjs   (or paste into the Neon SQL Editor)

-- Retail shop sites
CREATE TABLE IF NOT EXISTS shops (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  code       TEXT,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT
);

-- Admin & storekeeper accounts
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT,
  phone         TEXT UNIQUE,
  password_hash TEXT NOT NULL DEFAULT '',
  role          TEXT NOT NULL DEFAULT 'shopkeeper',
  shop_id       TEXT,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT
);

-- Ledger entries (customer / supplier / stock)
CREATE TABLE IF NOT EXISTS ledger_records (
  id            TEXT PRIMARY KEY,
  type          TEXT NOT NULL,
  title         TEXT NOT NULL,
  date          TEXT NOT NULL,
  notes         TEXT,
  exchange_rate DOUBLE PRECISION NOT NULL DEFAULT 198,
  items         TEXT NOT NULL DEFAULT '[]',
  shop_id       TEXT,
  created_at    BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT,
  updated_at    BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT
);

-- Login sessions (token hash only)
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS users_phone_key ON users (phone);
CREATE INDEX IF NOT EXISTS ledger_records_shop_id_idx ON ledger_records (shop_id);
CREATE INDEX IF NOT EXISTS ledger_records_type_idx ON ledger_records (type);
CREATE INDEX IF NOT EXISTS ledger_records_created_at_idx ON ledger_records (created_at DESC);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at);

-- ============================================================================
-- DELALA — External Broker Management System
-- ============================================================================

CREATE TABLE IF NOT EXISTS brokers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id VARCHAR(64),
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(64),
  alternative_phone VARCHAR(64),
  business_name VARCHAR(255),
  location VARCHAR(255),
  website VARCHAR(255),
  reference_number VARCHAR(100),
  notes TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_by VARCHAR(64),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS delala_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id UUID NOT NULL REFERENCES brokers(id) ON DELETE CASCADE,
  store_id VARCHAR(64),
  account_name VARCHAR(255) NOT NULL,
  current_balance DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS delala_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES delala_accounts(id) ON DELETE CASCADE,
  broker_id UUID NOT NULL REFERENCES brokers(id) ON DELETE CASCADE,
  store_id VARCHAR(64),
  transaction_type VARCHAR(64) NOT NULL,
  description VARCHAR(255) NOT NULL,
  product_id VARCHAR(100),
  quantity DECIMAL(12,2),
  unit VARCHAR(50),
  unit_price DECIMAL(14,2),
  amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  accounting_effect SMALLINT NOT NULL CHECK (accounting_effect IN (-1, 1)),
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method VARCHAR(64),
  reference_number VARCHAR(100),
  notes TEXT,
  created_by VARCHAR(64),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS brokers_store_id_idx ON brokers (store_id);
CREATE INDEX IF NOT EXISTS delala_accounts_broker_id_idx ON delala_accounts (broker_id);
CREATE INDEX IF NOT EXISTS delala_transactions_account_id_idx ON delala_transactions (account_id);
CREATE INDEX IF NOT EXISTS delala_transactions_broker_id_idx ON delala_transactions (broker_id);
CREATE INDEX IF NOT EXISTS delala_transactions_date_idx ON delala_transactions (transaction_date DESC);

-- ============================================================================
-- DELALA ENTRIES (Spreadsheet Ledger)
-- ============================================================================
CREATE TABLE IF NOT EXISTS delala_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delala_name VARCHAR(255) NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  unit_price DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  pieces DECIMAL(14,3) NOT NULL DEFAULT 0.000,
  sign SMALLINT NOT NULL CHECK (sign IN (-1, 1)),
  total DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  transaction_date VARCHAR(64) NOT NULL,
  store_id VARCHAR(64),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_delala_entries_name ON delala_entries (delala_name);
CREATE INDEX IF NOT EXISTS idx_delala_entries_product ON delala_entries (product_name);
CREATE INDEX IF NOT EXISTS idx_delala_entries_store ON delala_entries (store_id);
CREATE INDEX IF NOT EXISTS idx_delala_entries_date ON delala_entries (created_at DESC);

