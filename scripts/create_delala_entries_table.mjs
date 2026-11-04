import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';

dotenv.config();
const sql = neon(process.env.DATABASE_URL);

async function run() {
  console.log('--- Creating delala_entries table on Neon PostgreSQL ---');

  await sql`
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
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_delala_entries_name ON delala_entries (delala_name);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_delala_entries_product ON delala_entries (product_name);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_delala_entries_store ON delala_entries (store_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_delala_entries_date ON delala_entries (created_at DESC);`;

  console.log('✓ delala_entries table and indexes ready');

  // Seed sample rows from user specification if empty
  const countRes = await sql`SELECT COUNT(*) as count FROM delala_entries;`;
  const count = parseInt(countRes[0]?.count || '0', 10);
  if (count === 0) {
    console.log('Seeding sample rows from specification (Ahmed & Mohammed)...');
    // Row 1: Ahmed | 12W Safari | 65 | 10 | -1 | -650 | 02/11/2026
    await sql`
      INSERT INTO delala_entries (delala_name, product_name, unit_price, pieces, sign, total, transaction_date, store_id)
      VALUES ('Ahmed', '12W Safari', 65.00, 10.000, -1, -650.00, '02/11/2026', 'store_1');
    `;
    // Row 2: Mohammed | Product B | 100 | 5 | +1 | +500 | 02/11/2026
    await sql`
      INSERT INTO delala_entries (delala_name, product_name, unit_price, pieces, sign, total, transaction_date, store_id)
      VALUES ('Mohammed', 'Product B', 100.00, 5.000, 1, 500.00, '02/11/2026', 'store_1');
    `;
    console.log('✓ Seeded sample rows successfully!');
  } else {
    console.log(`delala_entries already contains ${count} rows.`);
  }

  const allRows = await sql`SELECT * FROM delala_entries ORDER BY created_at ASC;`;
  console.log('Current delala_entries:');
  console.table(allRows);
}

run().catch(console.error);

