import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';

dotenv.config();
const sql = neon(process.env.DATABASE_URL);

async function syncDelalaData() {
  console.log('Syncing all Delala records to delala_entries...');
  
  // Check existing product_names in delala_entries
  const existing = await sql`SELECT delala_name, product_name, total FROM delala_entries`;
  const existingSet = new Set(existing.map(e => `${e.delala_name}:::${e.product_name}:::${e.total}`));

  const toAdd = [
    {
      delala_name: 'Ahmed',
      product_name: '12W Safari',
      unit_price: 65.00,
      pieces: 10.000,
      sign: -1,
      total: -650.00,
      transaction_date: '02/11/2026',
      store_id: 'store_1'
    },
    {
      delala_name: 'Mohammed',
      product_name: 'Product B',
      unit_price: 100.00,
      pieces: 5.000,
      sign: 1,
      total: 500.00,
      transaction_date: '02/11/2026',
      store_id: 'store_1'
    },
    {
      delala_name: 'Mohammed',
      product_name: 'yebefit keri (2.5mm Wire)',
      unit_price: 13450.00,
      pieces: 1.000,
      sign: 1,
      total: 13450.00,
      transaction_date: '02/11/2026',
      store_id: 'store_1'
    },
    {
      delala_name: 'Mohammed',
      product_name: '2.5 bmt wire returned',
      unit_price: 2000.00,
      pieces: 1.000,
      sign: -1,
      total: -2000.00,
      transaction_date: '02/11/2026',
      store_id: 'store_1'
    },
    {
      delala_name: 'Mohammed',
      product_name: 'Cash settlement (ጥሬ ገንዘብ)',
      unit_price: 5000.00,
      pieces: 1.000,
      sign: -1,
      total: -5000.00,
      transaction_date: '02/11/2026',
      store_id: 'store_1'
    }
  ];

  for (const item of toAdd) {
    const key = `${item.delala_name}:::${item.product_name}:::${item.total}`;
    if (!existingSet.has(key)) {
      await sql`
        INSERT INTO delala_entries (
          delala_name, product_name, unit_price, pieces, sign, total, transaction_date, store_id
        ) VALUES (
          ${item.delala_name}, ${item.product_name}, ${item.unit_price}, ${item.pieces}, ${item.sign}, ${item.total}, ${item.transaction_date}, ${item.store_id}
        )
      `;
      console.log(`+ Added: ${item.delala_name} - ${item.product_name}`);
    } else {
      console.log(`= Already exists: ${item.delala_name} - ${item.product_name}`);
    }
  }

  const current = await sql`SELECT * FROM delala_entries ORDER BY created_at ASC`;
  console.table(current);
}

syncDelalaData().catch(console.error);

