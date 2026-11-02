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

-- Ledger entries (customer / supplier / delala / stock)
-- `items` holds the JSON array of line items as text so both the web and
-- mobile clients can read it back unchanged.
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

-- Esmiz Schema (Delala commission ledger)
CREATE TABLE IF NOT EXISTS esmiz_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  reference_id UUID,
  created_by VARCHAR(64),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS esmiz_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  esmiz_id UUID NOT NULL REFERENCES esmiz_records(id) ON DELETE CASCADE,
  description VARCHAR(255) NOT NULL,
  amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  sign SMALLINT NOT NULL CHECK (sign IN (-1, 1)),
  position INTEGER NOT NULL DEFAULT 0,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS esmiz_entries_esmiz_id_idx ON esmiz_entries (esmiz_id);
CREATE INDEX IF NOT EXISTS esmiz_entries_position_idx ON esmiz_entries (esmiz_id, position);
