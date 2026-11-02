import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
import crypto from 'node:crypto';

const connStr = process.env.DATABASE_URL ||
  'postgresql://neondb_owner:npg_OtyTj7F9Aqnz@ep-red-sea-b5yphk96-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require';
const match = connStr.match(/@([^/:]+)/);
const host = match ? match[1].replace('-pooler', '') : '';
const endpoint = 'https://' + host + '/sql';

async function executeSql(sqlQuery) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Neon-Connection-String': connStr
    },
    body: JSON.stringify({ query: sqlQuery })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`HTTP ${res.status}: ${errText}`);
  }
  const data = await res.json();
  return data.rows;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHash('sha256').update(salt + String(password)).digest('hex');
  return `sha256:${salt}:${hash}`;
}

async function setupDatabase() {
  console.log('--- Initializing Database Tables on Neon PostgreSQL ---');

  // 1. pgcrypto for UUID generation
  await executeSql(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);

  // 2. Shops
  await executeSql(`
    CREATE TABLE IF NOT EXISTS shops (
      id varchar(64) PRIMARY KEY,
      name varchar(160) NOT NULL,
      code varchar(40) NOT NULL UNIQUE,
      created_at bigint NOT NULL
    );
  `);
  console.log('✅ shops table ensured');

  // 3. Users
  await executeSql(`
    CREATE TABLE IF NOT EXISTS users (
      id varchar(64) PRIMARY KEY,
      name varchar(160) NOT NULL,
      email varchar(200),
      phone varchar(30),
      password_hash text NOT NULL,
      role varchar(20) NOT NULL CHECK (role IN ('admin', 'shopkeeper')),
      shop_id varchar(64) REFERENCES shops(id),
      active boolean NOT NULL DEFAULT true,
      created_at bigint NOT NULL
    );
  `);
  await executeSql(`CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique_idx ON users (phone) WHERE phone IS NOT NULL;`);
  console.log('✅ users table ensured');

  // 4. Sessions
  await executeSql(`
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash varchar(128) PRIMARY KEY,
      user_id varchar(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at bigint NOT NULL,
      expires_at bigint NOT NULL
    );
  `);
  console.log('✅ sessions table ensured');

  // 5. Ledger Records
  await executeSql(`
    CREATE TABLE IF NOT EXISTS ledger_records (
      id varchar(64) PRIMARY KEY,
      type varchar(30) NOT NULL,
      title varchar(255) NOT NULL,
      date varchar(30) NOT NULL,
      notes text,
      exchange_rate numeric,
      items jsonb DEFAULT '[]'::jsonb,
      shop_id varchar(64) REFERENCES shops(id),
      created_at bigint NOT NULL,
      updated_at bigint NOT NULL
    );
  `);
  await executeSql(`CREATE INDEX IF NOT EXISTS ledger_records_shop_type_idx ON ledger_records (shop_id, type);`);
  console.log('✅ ledger_records table ensured');

  // 6. Esmiz Records (as requested)
  // id (UUID, primary key)
  // title (VARCHAR)
  // reference_id (UUID, nullable)
  // created_by (UUID, user reference or VARCHAR)
  // created_at (TIMESTAMP)
  // updated_at (TIMESTAMP)
  await executeSql(`
    CREATE TABLE IF NOT EXISTS esmiz_records (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title VARCHAR(255) NOT NULL,
      reference_id UUID NULL,
      created_by VARCHAR(64) NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log('✅ esmiz_records table ensured');

  // 7. Esmiz Entries (as requested)
  // id (UUID, primary key)
  // esmiz_id (UUID, foreign key -> esmiz_records.id)
  // description (VARCHAR)
  // amount (DECIMAL 14,2)
  // sign (SMALLINT, only -1 or +1)
  // position (INTEGER)
  // transaction_date (DATE)
  // created_at (TIMESTAMP)
  // updated_at (TIMESTAMP)
  await executeSql(`
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
  `);
  await executeSql(`CREATE INDEX IF NOT EXISTS esmiz_entries_esmiz_id_idx ON esmiz_entries (esmiz_id);`);
  await executeSql(`CREATE INDEX IF NOT EXISTS esmiz_entries_position_idx ON esmiz_entries (esmiz_id, position);`);
  console.log('✅ esmiz_entries table ensured');

  // Seed default Shops & Users if empty
  const now = Date.now();
  await executeSql(`
    INSERT INTO shops (id, name, code, created_at) VALUES
      ('shop-1', 'Shop 1 - Merkato', 'SHOP1', ${now}),
      ('shop-2', 'Shop 2 - Bole', 'SHOP2', ${now})
    ON CONFLICT (id) DO NOTHING;
  `);

  const adminHash = hashPassword('Admin@123');
  const shopHash = hashPassword('Shop@123');

  await executeSql(`
    INSERT INTO users (id, name, email, phone, password_hash, role, shop_id, active, created_at) VALUES
      ('user-admin-1', 'Central Admin', 'admin@click.et', '+251911111111', '${adminHash}', 'admin', NULL, true, ${now}),
      ('user-shop-1', 'Shopkeeper 1', 'shop1@click.et', '+251922222222', '${shopHash}', 'shopkeeper', 'shop-1', true, ${now}),
      ('user-shop-2', 'Shopkeeper 2', 'shop2@click.et', '+251933333333', '${shopHash}', 'shopkeeper', 'shop-2', true, ${now})
    ON CONFLICT (id) DO NOTHING;
  `);

  console.log('✅ Default shops & users seeded.');

  // Seed sample Esmiz Record if empty
  const existingEsmiz = await executeSql(`SELECT id FROM esmiz_records LIMIT 1;`);
  if (!existingEsmiz || existingEsmiz.length === 0) {
    console.log('Seeding initial sample Esmiz table matching user screenshot...');
    const [insertedRecord] = await executeSql(`
      INSERT INTO esmiz_records (title, created_by)
      VALUES ('Esmiz', 'user-admin-1')
      RETURNING id;
    `);
    const esmizId = insertedRecord.id;

    // Seed entries matching the table in prompt:
    // 1 | yebefit keri | 13,450 | -1 | -13,450
    // 2 | 2.5 bmt      | 11,200 | -1 | -11,200
    // 3 | 2.5 elusdy   |  7,000 | +1 |   7,000
    await executeSql(`
      INSERT INTO esmiz_entries (esmiz_id, description, amount, sign, position, transaction_date) VALUES
        ('${esmizId}', 'yebefit keri', 13450.00, -1, 1, CURRENT_DATE),
        ('${esmizId}', '2.5 bmt', 11200.00, -1, 2, CURRENT_DATE),
        ('${esmizId}', '2.5 elusdy', 7000.00, 1, 3, CURRENT_DATE);
    `);
    console.log('✅ Initial Esmiz sample entries seeded.');
  }

  console.log('🎉 Database setup complete!');
}

setupDatabase().catch(err => {
  console.error('Database setup failed:', err);
  process.exit(1);
});

