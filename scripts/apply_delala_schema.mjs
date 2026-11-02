const connStr = 'postgresql://neondb_owner:npg_OtyTj7F9Aqnz@ep-red-sea-b5yphk96-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require';
const endpoint = 'https://ep-red-sea-b5yphk96.c-7.us-east-2.aws.neon.tech/sql';

async function executeSql(query, params = []) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Neon-Connection-String': connStr,
    },
    body: JSON.stringify({ query, params })
  });
  const data = await res.json();
  if (data.message) {
    throw new Error(data.message);
  }
  return data;
}

async function applyDelalaSchema() {
  console.log('--- Applying DELALA Database Schema on Neon PostgreSQL ---');

  // 1. Create brokers table
  await executeSql(`
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
  `);
  console.log('✓ brokers table ready');

  // 2. Create delala_accounts table
  await executeSql(`
    CREATE TABLE IF NOT EXISTS delala_accounts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      broker_id UUID NOT NULL REFERENCES brokers(id) ON DELETE CASCADE,
      store_id VARCHAR(64),
      account_name VARCHAR(255) NOT NULL,
      current_balance DECIMAL(14,2) NOT NULL DEFAULT 0.00,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log('✓ delala_accounts table ready');

  // 3. Create delala_transactions table
  await executeSql(`
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
  `);
  console.log('✓ delala_transactions table ready');

  // 4. Create Indexes
  await executeSql('CREATE INDEX IF NOT EXISTS brokers_store_id_idx ON brokers (store_id);');
  await executeSql('CREATE INDEX IF NOT EXISTS delala_accounts_broker_id_idx ON delala_accounts (broker_id);');
  await executeSql('CREATE INDEX IF NOT EXISTS delala_transactions_account_id_idx ON delala_transactions (account_id);');
  await executeSql('CREATE INDEX IF NOT EXISTS delala_transactions_broker_id_idx ON delala_transactions (broker_id);');
  await executeSql('CREATE INDEX IF NOT EXISTS delala_transactions_date_idx ON delala_transactions (transaction_date DESC);');
  console.log('✓ indexes ready');

  // 5. Seed initial Brokers & Transactions if empty
  const existingBrokers = await executeSql('SELECT COUNT(*) as count FROM brokers;');
  const brokerCount = parseInt(existingBrokers.rows[0].count);
  if (brokerCount === 0) {
    console.log('Seeding initial brokers...');
    // Seed Broker 1: Delala Mohammed
    const b1 = await executeSql(`
      INSERT INTO brokers (full_name, phone, business_name, location, status, notes)
      VALUES ('Delala Mohammed (ደላላ መሀመድ)', '0911223344', 'Merkato Brokerage', 'Merkato, Addis Ababa', 'active', 'Primary electrical cable broker')
      RETURNING id, full_name;
    `);
    const b1Id = b1.rows[0].id;
    const a1 = await executeSql(`
      INSERT INTO delala_accounts (broker_id, account_name, current_balance)
      VALUES ($1, 'Delala Mohammed Account', 0.00)
      RETURNING id;
    `, [b1Id]);
    const a1Id = a1.rows[0].id;

    // Seed transactions matching the user's example
    // Row 1: Goods Given | 13,450 | +1 | 13,450
    await executeSql(`
      INSERT INTO delala_transactions (account_id, broker_id, transaction_type, description, quantity, unit, unit_price, amount, accounting_effect, transaction_date)
      VALUES ($1, $2, 'goods_given', 'yebefit keri (2.5mm Wire)', 1, 'Roll', 13450.00, 13450.00, 1, CURRENT_DATE);
    `, [a1Id, b1Id]);

    // Row 2: Goods Returned | 2,000 | -1 | -2,000
    await executeSql(`
      INSERT INTO delala_transactions (account_id, broker_id, transaction_type, description, quantity, unit, unit_price, amount, accounting_effect, transaction_date)
      VALUES ($1, $2, 'goods_returned', '2.5 bmt wire returned', 1, 'Roll', 2000.00, 2000.00, -1, CURRENT_DATE);
    `, [a1Id, b1Id]);

    // Row 3: Money Received | 5,000 | -1 | -5,000
    await executeSql(`
      INSERT INTO delala_transactions (account_id, broker_id, transaction_type, description, amount, accounting_effect, payment_method, transaction_date)
      VALUES ($1, $2, 'money_received', 'Partial cash settlement', 5000.00, -1, 'Cash', CURRENT_DATE);
    `, [a1Id, b1Id]);

    // Update account balance
    await executeSql(`
      UPDATE delala_accounts SET current_balance = (
        SELECT COALESCE(SUM(amount * accounting_effect), 0)
        FROM delala_transactions WHERE account_id = $1
      ) WHERE id = $1;
    `, [a1Id]);

    // Seed Broker 2: Delala Abebe
    const b2 = await executeSql(`
      INSERT INTO brokers (full_name, phone, business_name, location, status, notes)
      VALUES ('Delala Abebe (ደላላ አበበ)', '0922334455', 'Abebe Commission Agent', 'Bole, Addis Ababa', 'active', 'Retail and wholesale broker')
      RETURNING id, full_name;
    `);
    const b2Id = b2.rows[0].id;
    const a2 = await executeSql(`
      INSERT INTO delala_accounts (broker_id, account_name, current_balance)
      VALUES ($1, 'Delala Abebe Account', 0.00)
      RETURNING id;
    `, [b2Id]);
    const a2Id = a2.rows[0].id;

    await executeSql(`
      INSERT INTO delala_transactions (account_id, broker_id, transaction_type, description, amount, accounting_effect, transaction_date)
      VALUES ($1, $2, 'commission', 'Monthly commission credit', 4500.00, -1, CURRENT_DATE);
    `, [a2Id, b2Id]);

    await executeSql(`
      UPDATE delala_accounts SET current_balance = (
        SELECT COALESCE(SUM(amount * accounting_effect), 0)
        FROM delala_transactions WHERE account_id = $1
      ) WHERE id = $1;
    `, [a2Id]);

    console.log('✓ Seeded initial brokers and transactions successfully!');
  }

  console.log('=== DELALA SYSTEM READY ON NEON POSTGRESQL ===');
}

applyDelalaSchema().catch(console.error);

