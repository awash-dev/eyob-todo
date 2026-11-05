-- Merkato Credit Record — Neon PostgreSQL schema
-- Apply with: node db/apply-schema.mjs   (or paste into the Neon SQL Editor)

-- Retail store sites
CREATE TABLE IF NOT EXISTS stores (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  code       TEXT,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT
);

-- Backward & forward compatibility view for shops
CREATE OR REPLACE VIEW shops AS 
SELECT id, name, code, created_at FROM stores;

-- Admin & storekeeper accounts
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT,
  phone         TEXT UNIQUE,
  password_hash TEXT NOT NULL DEFAULT '',
  role          TEXT NOT NULL DEFAULT 'storekeeper',
  store_id      TEXT,
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
  store_id      TEXT,
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
CREATE INDEX IF NOT EXISTS ledger_records_store_id_idx ON ledger_records (store_id);
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



-- ============================================================================
-- SMART INVENTORY & PRODUCT CATALOG (Stock In / Stock Out Ledger)
-- ============================================================================
CREATE TABLE IF NOT EXISTS store_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id VARCHAR(64),
  product_name VARCHAR(255) NOT NULL,
  sku VARCHAR(64),
  category VARCHAR(128) DEFAULT 'General',
  base_unit VARCHAR(32) DEFAULT 'Pcs',
  current_quantity DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  minimum_stock DECIMAL(14,2) DEFAULT 0.00,
  unit_price DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  cost_price DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  pcs_per_carton DECIMAL(14,2) DEFAULT 1.00,
  supplier_name VARCHAR(255),
  last_transaction_date VARCHAR(64),
  description TEXT,
  created_by VARCHAR(64),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_store_inventory_store ON store_inventory (store_id);
CREATE INDEX IF NOT EXISTS idx_store_inventory_name ON store_inventory (product_name);

CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id VARCHAR(64),
  product_id UUID NOT NULL REFERENCES store_inventory(id) ON DELETE CASCADE,
  movement_type VARCHAR(16) NOT NULL CHECK (movement_type IN ('IN', 'OUT')),
  quantity DECIMAL(14,2) NOT NULL,
  transaction_unit VARCHAR(32) NOT NULL DEFAULT 'Pcs',
  conversion_factor DECIMAL(14,4) NOT NULL DEFAULT 1.0000,
  base_quantity DECIMAL(14,2) NOT NULL,
  previous_stock DECIMAL(14,2) NOT NULL,
  new_stock DECIMAL(14,2) NOT NULL,
  unit_price DECIMAL(14,2) NOT NULL,
  total_price DECIMAL(14,2) NOT NULL,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  source_type VARCHAR(64),
  source_id VARCHAR(128),
  destination VARCHAR(128),
  reference_number VARCHAR(100),
  note TEXT,
  created_by VARCHAR(64),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_store ON stock_movements (store_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements (product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_date ON stock_movements (transaction_date DESC);

-- Numeric inventory corrections for existing databases.
DO $$
BEGIN
  ALTER TABLE store_inventory ALTER COLUMN current_quantity TYPE DECIMAL(14,3) USING COALESCE(current_quantity, 0)::DECIMAL(14,3);
  ALTER TABLE store_inventory ALTER COLUMN current_quantity SET DEFAULT 0;
  ALTER TABLE store_inventory ALTER COLUMN minimum_stock TYPE DECIMAL(14,3) USING COALESCE(minimum_stock, 0)::DECIMAL(14,3);
  ALTER TABLE store_inventory ALTER COLUMN unit_price TYPE DECIMAL(14,2) USING COALESCE(unit_price, 0)::DECIMAL(14,2);
  ALTER TABLE store_inventory ALTER COLUMN unit_price SET DEFAULT 0;
  ALTER TABLE store_inventory ALTER COLUMN cost_price TYPE DECIMAL(14,2) USING COALESCE(cost_price, 0)::DECIMAL(14,2);
  ALTER TABLE store_inventory ALTER COLUMN cost_price SET DEFAULT 0;
  ALTER TABLE store_inventory ALTER COLUMN pcs_per_carton TYPE DECIMAL(14,3) USING COALESCE(pcs_per_carton, 1)::DECIMAL(14,3);
  ALTER TABLE store_inventory ALTER COLUMN pcs_per_carton SET DEFAULT 1;

  ALTER TABLE stock_movements ALTER COLUMN quantity TYPE DECIMAL(14,3) USING COALESCE(quantity, 0)::DECIMAL(14,3);
  ALTER TABLE stock_movements ALTER COLUMN base_quantity TYPE DECIMAL(14,3) USING COALESCE(base_quantity, 0)::DECIMAL(14,3);
  ALTER TABLE stock_movements ALTER COLUMN previous_stock TYPE DECIMAL(14,3) USING COALESCE(previous_stock, 0)::DECIMAL(14,3);
  ALTER TABLE stock_movements ALTER COLUMN new_stock TYPE DECIMAL(14,3) USING COALESCE(new_stock, 0)::DECIMAL(14,3);
  ALTER TABLE stock_movements ALTER COLUMN unit_price TYPE DECIMAL(14,2) USING COALESCE(unit_price, 0)::DECIMAL(14,2);
  ALTER TABLE stock_movements ALTER COLUMN unit_price SET DEFAULT 0;
  ALTER TABLE stock_movements ALTER COLUMN total_price TYPE DECIMAL(14,2) USING COALESCE(total_price, 0)::DECIMAL(14,2);
  ALTER TABLE stock_movements ALTER COLUMN total_price SET DEFAULT 0;

  -- Kena Store Product schema extension
  ALTER TABLE store_inventory ADD COLUMN IF NOT EXISTS quantity_cartons DECIMAL(14,3) NOT NULL DEFAULT 0;
  ALTER TABLE store_inventory ADD COLUMN IF NOT EXISTS quantity_per_carton DECIMAL(14,3) NOT NULL DEFAULT 1;
  ALTER TABLE store_inventory ADD COLUMN IF NOT EXISTS total_quantity DECIMAL(14,3) NOT NULL DEFAULT 0;
  ALTER TABLE store_inventory ADD COLUMN IF NOT EXISTS unit VARCHAR(32) NOT NULL DEFAULT 'PCS';
  ALTER TABLE store_inventory ADD COLUMN IF NOT EXISTS price_per_piece DECIMAL(14,2) NOT NULL DEFAULT 0;
  ALTER TABLE store_inventory ADD COLUMN IF NOT EXISTS total_value DECIMAL(14,2) NOT NULL DEFAULT 0;
  ALTER TABLE store_inventory ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
  ALTER TABLE store_inventory ADD COLUMN IF NOT EXISTS updated_by VARCHAR(64);
END $$;

-- Indexes for Store Inventory
CREATE INDEX IF NOT EXISTS idx_store_inventory_active ON store_inventory (is_active);
CREATE INDEX IF NOT EXISTS idx_store_inventory_sku ON store_inventory (sku);

-- Non-negative constraints for store inventory
DO $$
BEGIN
  ALTER TABLE store_inventory
    ADD CONSTRAINT store_inventory_non_negative_calc CHECK (
      quantity_cartons >= 0 AND 
      quantity_per_carton >= 0 AND 
      total_quantity >= 0 AND 
      price_per_piece >= 0 AND 
      total_value >= 0
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Safe backfill for existing inventory records
UPDATE store_inventory SET
  quantity_per_carton = COALESCE(NULLIF(pcs_per_carton, 0), 1),
  total_quantity = COALESCE(current_quantity, 0),
  quantity_cartons = CASE 
    WHEN COALESCE(pcs_per_carton, 1) > 0 THEN ROUND(COALESCE(current_quantity, 0) / COALESCE(pcs_per_carton, 1), 3) 
    ELSE 0 
  END,
  unit = COALESCE(NULLIF(base_unit, ''), 'PCS'),
  price_per_piece = COALESCE(NULLIF(unit_price, 0), cost_price, 0),
  total_value = ROUND(COALESCE(current_quantity, 0) * COALESCE(NULLIF(unit_price, 0), cost_price, 0), 2),
  is_active = CASE WHEN is_deleted = true THEN false ELSE true END
WHERE total_quantity = 0 AND current_quantity > 0 OR quantity_cartons = 0;

-- Existing data repair: quantity, price, and balance values must never be NULL/undefined.
UPDATE store_inventory SET
  current_quantity = COALESCE(current_quantity, 0),
  minimum_stock = COALESCE(minimum_stock, 0),
  unit_price = COALESCE(unit_price, 0),
  cost_price = COALESCE(cost_price, 0),
  pcs_per_carton = CASE WHEN COALESCE(pcs_per_carton, 0) > 0 THEN pcs_per_carton ELSE 1 END;

ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS cartons DECIMAL(14,3) NOT NULL DEFAULT 0;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS loose_pieces DECIMAL(14,3) NOT NULL DEFAULT 0;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS total_pieces DECIMAL(14,3) NOT NULL DEFAULT 0;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS payment_amount DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS outstanding_balance DECIMAL(14,2) NOT NULL DEFAULT 0;

UPDATE stock_movements SET
  quantity = COALESCE(quantity, 0),
  base_quantity = COALESCE(base_quantity, 0),
  previous_stock = COALESCE(previous_stock, 0),
  new_stock = COALESCE(new_stock, 0),
  unit_price = COALESCE(unit_price, 0),
  total_price = COALESCE(total_price, 0),
  cartons = COALESCE(cartons, 0),
  loose_pieces = COALESCE(loose_pieces, 0),
  total_pieces = CASE WHEN COALESCE(total_pieces, 0) > 0 THEN total_pieces ELSE COALESCE(base_quantity, quantity, 0) END,
  payment_amount = COALESCE(payment_amount, 0),
  outstanding_balance = COALESCE(outstanding_balance, 0);

-- Simple party ledger and payment records. Existing ledger_records are preserved.
CREATE TABLE IF NOT EXISTS ledger_parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id VARCHAR(64) NOT NULL,
  party_type VARCHAR(16) NOT NULL CHECK (party_type IN ('customer', 'supplier')),
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(64),
  address TEXT,
  notes TEXT,
  created_by VARCHAR(64),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ledger_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id VARCHAR(64) NOT NULL,
  party_id UUID REFERENCES ledger_parties(id) ON DELETE SET NULL,
  party_name VARCHAR(255) NOT NULL,
  party_type VARCHAR(16) NOT NULL CHECK (party_type IN ('customer', 'supplier')),
  transaction_type VARCHAR(32) NOT NULL,
  product_id UUID REFERENCES store_inventory(id) ON DELETE SET NULL,
  product_name VARCHAR(255),
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  quantity DECIMAL(14,3) NOT NULL DEFAULT 0,
  cartons DECIMAL(14,3) NOT NULL DEFAULT 0,
  pieces_per_carton DECIMAL(14,3) NOT NULL DEFAULT 0,
  loose_pieces DECIMAL(14,3) NOT NULL DEFAULT 0,
  total_pieces DECIMAL(14,3) NOT NULL DEFAULT 0,
  unit_price DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  debit_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  credit_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  payment_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  outstanding_balance DECIMAL(14,2) NOT NULL DEFAULT 0,
  payment_method VARCHAR(32),
  bank_name VARCHAR(255),
  reference_number VARCHAR(100),
  notes TEXT,
  created_by VARCHAR(64),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ledger_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id VARCHAR(64) NOT NULL,
  party_id UUID REFERENCES ledger_parties(id) ON DELETE SET NULL,
  transaction_id UUID REFERENCES ledger_transactions(id) ON DELETE SET NULL,
  party_name VARCHAR(255) NOT NULL,
  party_type VARCHAR(16) NOT NULL CHECK (party_type IN ('customer', 'supplier')),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount DECIMAL(14,2) NOT NULL CHECK (amount >= 0),
  payment_method VARCHAR(32) NOT NULL DEFAULT 'Cash',
  bank_name VARCHAR(255),
  reference_number VARCHAR(100),
  notes TEXT,
  created_by VARCHAR(64),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS store_cash_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id VARCHAR(64) NOT NULL,
  account_name VARCHAR(255) NOT NULL,
  payment_method VARCHAR(32) NOT NULL DEFAULT 'Cash',
  balance DECIMAL(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (store_id, payment_method, account_name)
);

CREATE INDEX IF NOT EXISTS idx_ledger_parties_store_name ON ledger_parties (store_id, party_type, name);
CREATE INDEX IF NOT EXISTS idx_ledger_transactions_party ON ledger_transactions (party_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_transactions_store ON ledger_transactions (store_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_payments_party ON ledger_payments (party_id, payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_payments_store ON ledger_payments (store_id, payment_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_parties_unique_name
  ON ledger_parties (store_id, party_type, LOWER(name));

-- Authoritative database guard: on-hand inventory can NEVER go negative,
-- no matter which client writes. The application uses atomic conditional
-- updates (WHERE current_quantity >= qty) as the first line of defence;
-- this CHECK constraint is the hard backstop against any code path that
-- would otherwise allow negative stock.
DO $$
BEGIN
  ALTER TABLE store_inventory
    ADD CONSTRAINT store_inventory_non_negative CHECK (current_quantity >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- BILINGUAL LOCALIZATION & TRANSLATIONS (Amharic <-> English)
-- ============================================================================
CREATE TABLE IF NOT EXISTS translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  translation_key TEXT NOT NULL,
  language_code VARCHAR(10) NOT NULL,
  translated_text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(translation_key, language_code)
);

CREATE TABLE IF NOT EXISTS product_translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id VARCHAR(100) NOT NULL,
  language_code VARCHAR(10) NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(product_id, language_code)
);

CREATE TABLE IF NOT EXISTS user_language_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(100) NOT NULL UNIQUE,
  language_code VARCHAR(10) NOT NULL DEFAULT 'en',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
