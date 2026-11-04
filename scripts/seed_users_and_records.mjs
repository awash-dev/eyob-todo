import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';
import crypto from 'node:crypto';

dotenv.config();

const sql = neon(process.env.DATABASE_URL);

function hashPasswordWithSalt(password) {
  const salt = Date.now().toString();
  const hash = crypto.createHash('sha256').update(salt + password).digest('hex');
  return `sha256:${salt}:${hash}`;
}

async function seed() {
  console.log('=== SEEDING USERS, STORES & DELALA-STYLE CUSTOMER RECORDS ===');

  // 1. Remove obsolete esmiz tables if any exist
  console.log('1. Cleaning up obsolete esmiz tables...');
  await sql`DROP TABLE IF EXISTS esmiz_entries CASCADE;`;
  await sql`DROP TABLE IF EXISTS esmiz_records CASCADE;`;
  console.log('✓ Obsolete esmiz tables removed.');

  // 2. Seed Stores
  console.log('2. Seeding stores...');
  await sql`
    INSERT INTO stores (id, name, code, created_at)
    VALUES 
      ('store_1', 'Merkato Store (መደብር 1 - መርካቶ)', 'MERKATO', ${Date.now()}),
      ('store_2', 'Bole Store (መደብር 2 - ቦሌ)', 'BOLE', ${Date.now()})
    ON CONFLICT (id) DO UPDATE SET 
      name = EXCLUDED.name,
      code = EXCLUDED.code;
  `;
  console.log('✓ 2 Stores seeded (Merkato & Bole).');

  // 3. Seed Users (1 Admin + 2 Storekeepers)
  console.log('3. Seeding 1 Admin and 2 Storekeepers...');
  const adminHash = hashPasswordWithSalt('Admin@123');
  const storekeeperHash = hashPasswordWithSalt('Store@123');

  // Admin Controller
  await sql`
    INSERT INTO users (id, name, email, phone, password_hash, role, store_id, active, created_at)
    VALUES 
      ('usr_admin_1', 'Admin Controller', 'admin@merkato.com', '+251911111111', ${adminHash}, 'admin', NULL, true, ${Date.now()})
    ON CONFLICT (id) DO UPDATE SET 
      name = EXCLUDED.name,
      phone = EXCLUDED.phone,
      password_hash = EXCLUDED.password_hash,
      role = EXCLUDED.role,
      active = true;
  `;

  // Storekeeper 1 (Merkato)
  await sql`
    INSERT INTO users (id, name, email, phone, password_hash, role, store_id, active, created_at)
    VALUES 
      ('usr_storekeeper_1', 'Storekeeper 1 (Merkato)', 'store1@merkato.com', '+251922222222', ${storekeeperHash}, 'storekeeper', 'store_1', true, ${Date.now()})
    ON CONFLICT (id) DO UPDATE SET 
      name = EXCLUDED.name,
      phone = EXCLUDED.phone,
      password_hash = EXCLUDED.password_hash,
      role = EXCLUDED.role,
      store_id = 'store_1',
      active = true;
  `;

  // Storekeeper 2 (Bole)
  await sql`
    INSERT INTO users (id, name, email, phone, password_hash, role, store_id, active, created_at)
    VALUES 
      ('usr_storekeeper_2', 'Storekeeper 2 (Bole)', 'store2@merkato.com', '+251933333333', ${storekeeperHash}, 'storekeeper', 'store_2', true, ${Date.now()})
    ON CONFLICT (id) DO UPDATE SET 
      name = EXCLUDED.name,
      phone = EXCLUDED.phone,
      password_hash = EXCLUDED.password_hash,
      role = EXCLUDED.role,
      store_id = 'store_2',
      active = true;
  `;
  console.log('✓ 1 Admin and 2 Storekeepers seeded successfully!');

  // 4. Seed Customer Credit Records structured like DELALA with Credit/Debit line items
  console.log('4. Seeding Customer & Supplier credit records with Delala credit/debit structure...');
  
  // Customer 1: Alex Johnson (አሌክስ ጆንሰን)
  // Has 3 transactions:
  // 1) 2.5 BMT Wire taken on credit: 13,450 (Debit +1 / Customer owes store)
  // 2) Partial wire returned: 2,000 (Credit -1)
  // 3) Cash payment received: 5,000 (Credit -1)
  // Balance: 13,450 - 2,000 - 5,000 = 6,450 (Customer owes store)
  const alexItems = JSON.stringify([
    {
      id: 'item_alex_1',
      name: '2.5 BMT Wire (የተወሰደ እቃ)',
      quantity: 1,
      unitPrice: 13450,
      packagingUnit: 'Roll',
      cartons: 1,
      pcsPerCarton: 1,
      isCredit: false, // false = Debit (+1 / Owes)
      date: new Date().toISOString().split('T')[0],
      notes: 'Delala-linked invoice'
    },
    {
      id: 'item_alex_2',
      name: 'Returned Wire (የተመለሰ እቃ)',
      quantity: 1,
      unitPrice: 2000,
      packagingUnit: 'Roll',
      cartons: 1,
      pcsPerCarton: 1,
      isCredit: true, // true = Credit (-1 / Paid/Return)
      date: new Date().toISOString().split('T')[0],
      notes: 'Defective roll returned'
    },
    {
      id: 'item_alex_3',
      name: 'Cash Payment Received (ጥሬ ገንዘብ የተከፈለ)',
      quantity: 1,
      unitPrice: 5000,
      packagingUnit: 'Payment',
      cartons: 0,
      pcsPerCarton: 0,
      isCredit: true, // true = Credit (-1 / Paid)
      date: new Date().toISOString().split('T')[0],
      notes: 'Telebirr confirmation TX-4928'
    }
  ]);

  await sql`
    INSERT INTO ledger_records (id, type, title, date, notes, exchange_rate, items, store_id, created_at, updated_at)
    VALUES (
      'rec_cust_alex',
      'customer',
      'Alex Johnson (አሌክስ ጆንሰን)',
      ${new Date().toISOString().split('T')[0]},
      'Merkato wholesale customer - Delala credit account',
      198,
      ${alexItems},
      'store_1',
      ${Date.now()},
      ${Date.now()}
    )
    ON CONFLICT (id) DO UPDATE SET 
      title = EXCLUDED.title,
      items = EXCLUDED.items,
      notes = EXCLUDED.notes;
  `;

  // Customer 2: Kelil Aginbi (ከሊል አጊንቢ)
  const kelilItems = JSON.stringify([
    {
      id: 'item_kelil_1',
      name: '12W Safari LED Lamps (10 Cartons)',
      quantity: 240,
      unitPrice: 350,
      packagingUnit: 'Carton',
      cartons: 10,
      pcsPerCarton: 24,
      isCredit: false,
      date: new Date().toISOString().split('T')[0],
      notes: '10 cartons delivered'
    },
    {
      id: 'item_kelil_2',
      name: 'Bank Transfer Payment (ንግድ ባንክ ክፍያ)',
      quantity: 1,
      unitPrice: 50000,
      packagingUnit: 'Payment',
      cartons: 0,
      pcsPerCarton: 0,
      isCredit: true,
      date: new Date().toISOString().split('T')[0],
      notes: 'CBE slip ref 98234'
    }
  ]);

  await sql`
    INSERT INTO ledger_records (id, type, title, date, notes, exchange_rate, items, store_id, created_at, updated_at)
    VALUES (
      'rec_cust_kelil',
      'customer',
      'Kelil Aginbi (ከሊል አጊንቢ)',
      ${new Date().toISOString().split('T')[0]},
      'Bole electrical contractor',
      198,
      ${kelilItems},
      'store_2',
      ${Date.now()},
      ${Date.now()}
    )
    ON CONFLICT (id) DO UPDATE SET 
      title = EXCLUDED.title,
      items = EXCLUDED.items,
      notes = EXCLUDED.notes;
  `;

  // Supplier 1: Awash Cable Factory (አዋሽ ፋብሪካ)
  const awashItems = JSON.stringify([
    {
      id: 'item_awash_1',
      name: 'Bulk 2.5 BMT Wire (100 Rolls)',
      quantity: 100,
      unitPrice: 9500,
      packagingUnit: 'Roll',
      cartons: 20,
      pcsPerCarton: 5,
      isCredit: false, // We owe supplier
      date: new Date().toISOString().split('T')[0],
      notes: 'Direct factory delivery'
    },
    {
      id: 'item_awash_2',
      name: 'Factory Settlement Payment (የተከፈለ ክፍያ)',
      quantity: 1,
      unitPrice: 500000,
      packagingUnit: 'Payment',
      cartons: 0,
      pcsPerCarton: 0,
      isCredit: true, // Store paid supplier
      date: new Date().toISOString().split('T')[0],
      notes: 'Bank wire transfer'
    }
  ]);

  await sql`
    INSERT INTO ledger_records (id, type, title, date, notes, exchange_rate, items, store_id, created_at, updated_at)
    VALUES (
      'rec_supp_awash',
      'supplier',
      'Awash Cable Factory (አዋሽ ፋብሪካ)',
      ${new Date().toISOString().split('T')[0]},
      'Primary wire and electrical supplier',
      198,
      ${awashItems},
      'store_1',
      ${Date.now()},
      ${Date.now()}
    )
    ON CONFLICT (id) DO UPDATE SET 
      title = EXCLUDED.title,
      items = EXCLUDED.items,
      notes = EXCLUDED.notes;
  `;

  console.log('✓ Customer and Supplier records seeded with Delala credit/debit structure.');

  // 5. Verify all users in database
  const allUsers = await sql`SELECT id, name, phone, role, store_id, active FROM users;`;
  console.log('\nVerified Database Users:');
  console.table(allUsers);

  // 6. Verify records count
  const recCount = await sql`SELECT type, count(*) FROM ledger_records GROUP BY type;`;
  console.log('\nVerified Records Count:');
  console.table(recCount);

  // 7. Verify brokers
  const brokerRows = await sql`SELECT b.full_name, b.phone, a.current_balance FROM brokers b LEFT JOIN delala_accounts a ON a.broker_id = b.id;`;
  console.log('\nVerified Delala Brokers:');
  console.table(brokerRows);

  console.log('\n=== ALL USERS, STORES & DELALA RECORDS READY IN DATABASE! ===');
}

seed().catch(console.error);

