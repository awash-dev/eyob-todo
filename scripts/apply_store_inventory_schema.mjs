import https from 'https';

const connectionString = 'postgresql://neondb_owner:npg_OtyTj7F9Aqnz@ep-red-sea-b5yphk96-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require';
const endpoint = 'ep-red-sea-b5yphk96.c-7.us-east-2.aws.neon.tech';

function executeSql(query, params = []) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query, params });
    const req = https.request({
      hostname: endpoint,
      path: '/sql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Neon-Connection-String': connectionString,
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode >= 400 || parsed.message || parsed.error) {
            reject(new Error(parsed.message || parsed.error || body));
          } else {
            resolve(parsed.rows || []);
          }
        } catch (e) {
          reject(new Error(`Parse error: ${e.message} - ${body}`));
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function run() {
  console.log('--- Applying STORE INVENTORY Schema on Neon PostgreSQL ---');

  // 1. store_inventory table
  await executeSql(`
    CREATE TABLE IF NOT EXISTS store_inventory (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      store_id VARCHAR(64),
      product_name VARCHAR(255) NOT NULL,
      sku VARCHAR(100),
      category VARCHAR(100) DEFAULT 'General',
      base_unit VARCHAR(50) NOT NULL DEFAULT 'Piece',
      current_quantity DECIMAL(14,2) NOT NULL DEFAULT 0.00,
      minimum_stock DECIMAL(14,2) NOT NULL DEFAULT 10.00,
      unit_price DECIMAL(14,2) NOT NULL DEFAULT 0.00,
      cost_price DECIMAL(14,2) NOT NULL DEFAULT 0.00,
      description TEXT,
      created_by VARCHAR(64),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log(' store_inventory table ready');

  // 2. product_units table
  await executeSql(`
    CREATE TABLE IF NOT EXISTS product_units (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id UUID NOT NULL REFERENCES store_inventory(id) ON DELETE CASCADE,
      unit_name VARCHAR(50) NOT NULL,
      conversion_factor DECIMAL(12,4) NOT NULL DEFAULT 1.0000,
      is_base_unit BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log(' product_units table ready');

  // 3. stock_movements table
  await executeSql(`
    CREATE TABLE IF NOT EXISTS stock_movements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      store_id VARCHAR(64),
      product_id UUID NOT NULL REFERENCES store_inventory(id) ON DELETE CASCADE,
      movement_type VARCHAR(10) NOT NULL CHECK (movement_type IN ('IN', 'OUT')),
      quantity DECIMAL(12,2) NOT NULL,
      transaction_unit VARCHAR(50) NOT NULL,
      conversion_factor DECIMAL(12,4) NOT NULL DEFAULT 1.0000,
      base_quantity DECIMAL(14,2) NOT NULL,
      previous_stock DECIMAL(14,2) NOT NULL DEFAULT 0.00,
      new_stock DECIMAL(14,2) NOT NULL DEFAULT 0.00,
      unit_price DECIMAL(14,2) NOT NULL DEFAULT 0.00,
      total_price DECIMAL(14,2) NOT NULL DEFAULT 0.00,
      transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
      source_type VARCHAR(64),
      source_id VARCHAR(100),
      destination VARCHAR(255),
      reference_number VARCHAR(100),
      note TEXT,
      created_by VARCHAR(64),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log(' stock_movements table ready');

  // 4. Indexes for high performance
  await executeSql(`CREATE INDEX IF NOT EXISTS idx_store_inventory_store_id ON store_inventory (store_id);`);
  await executeSql(`CREATE INDEX IF NOT EXISTS idx_store_inventory_sku ON store_inventory (sku);`);
  await executeSql(`CREATE INDEX IF NOT EXISTS idx_product_units_product_id ON product_units (product_id);`);
  await executeSql(`CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements (product_id);`);
  await executeSql(`CREATE INDEX IF NOT EXISTS idx_stock_movements_store_id ON stock_movements (store_id);`);
  await executeSql(`CREATE INDEX IF NOT EXISTS idx_stock_movements_date ON stock_movements (transaction_date DESC);`);
  await executeSql(`CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON stock_movements (movement_type);`);
  console.log(' Indexes created successfully');

  // 5. Seed initial realistic store products if table is empty
  const countRes = await executeSql(`SELECT COUNT(*) as count FROM store_inventory`);
  const count = parseInt(countRes[0]?.count || '0', 10);
  if (count === 0) {
    console.log('Seeding initial products and sample stock movements...');
    // Product 1: 12W Safari (Carton = 24 Pieces)
    const p1 = await executeSql(`
      INSERT INTO store_inventory (product_name, sku, category, base_unit, current_quantity, minimum_stock, unit_price, cost_price, description)
      VALUES ('12W Safari', 'P001', 'Electrical', 'Piece', 120.00, 20.00, 350.00, 280.00, '12W LED Safari Lamp with holder')
      RETURNING id;
    `);
    const p1Id = p1[0].id;
    await executeSql(`
      INSERT INTO product_units (product_id, unit_name, conversion_factor, is_base_unit)
      VALUES 
        ('${p1Id}', 'Piece', 1.0000, true),
        ('${p1Id}', 'Carton', 24.0000, false);
    `);
    // Sample movements: 150 IN, 30 OUT -> 120 available
    await executeSql(`
      INSERT INTO stock_movements (product_id, movement_type, quantity, transaction_unit, conversion_factor, base_quantity, previous_stock, new_stock, unit_price, total_price, source_type, reference_number, note)
      VALUES ('${p1Id}', 'IN', 150.00, 'Piece', 1.0000, 150.00, 0.00, 150.00, 350.00, 52500.00, 'Supplier', 'PO-1001', 'Initial stock batch');
    `);
    await executeSql(`
      INSERT INTO stock_movements (product_id, movement_type, quantity, transaction_unit, conversion_factor, base_quantity, previous_stock, new_stock, unit_price, total_price, destination, reference_number, note)
      VALUES ('${p1Id}', 'OUT', 30.00, 'Piece', 1.0000, 30.00, 150.00, 120.00, 350.00, 10500.00, 'Merkato Customer', 'INV-2001', 'Direct store sale');
    `);

    // Product 2: 2.5 BMT Cable (Roll = 100 Meters)
    const p2 = await executeSql(`
      INSERT INTO store_inventory (product_name, sku, category, base_unit, current_quantity, minimum_stock, unit_price, cost_price, description)
      VALUES ('2.5 BMT Cable', 'P002', 'Cables', 'Roll', 10.00, 15.00, 11200.00, 9500.00, '2.5mm copper building electrical wire')
      RETURNING id;
    `);
    const p2Id = p2[0].id;
    await executeSql(`
      INSERT INTO product_units (product_id, unit_name, conversion_factor, is_base_unit)
      VALUES 
        ('${p2Id}', 'Roll', 1.0000, true),
        ('${p2Id}', 'Carton', 5.0000, false);
    `);
    await executeSql(`
      INSERT INTO stock_movements (product_id, movement_type, quantity, transaction_unit, conversion_factor, base_quantity, previous_stock, new_stock, unit_price, total_price, source_type, reference_number, note)
      VALUES ('${p2Id}', 'IN', 100.00, 'Roll', 1.0000, 100.00, 0.00, 100.00, 11200.00, 1120000.00, 'Supplier', 'PO-1002', 'Bulk shipment');
    `);
    await executeSql(`
      INSERT INTO stock_movements (product_id, movement_type, quantity, transaction_unit, conversion_factor, base_quantity, previous_stock, new_stock, unit_price, total_price, destination, reference_number, note)
      VALUES ('${p2Id}', 'OUT', 90.00, 'Roll', 1.0000, 90.00, 100.00, 10.00, 11200.00, 1008000.00, 'Contractor Apex', 'INV-2002', 'Wholesale order');
    `);

    // Product 3: 2.5 Elusdy
    const p3 = await executeSql(`
      INSERT INTO store_inventory (product_name, sku, category, base_unit, current_quantity, minimum_stock, unit_price, cost_price, description)
      VALUES ('2.5 Elusdy', 'P003', 'Cables', 'Roll', 45.00, 10.00, 7000.00, 5800.00, '2.5mm flexible wiring')
      RETURNING id;
    `);
    const p3Id = p3[0].id;
    await executeSql(`
      INSERT INTO product_units (product_id, unit_name, conversion_factor, is_base_unit)
      VALUES ('${p3Id}', 'Roll', 1.0000, true);
    `);
    await executeSql(`
      INSERT INTO stock_movements (product_id, movement_type, quantity, transaction_unit, conversion_factor, base_quantity, previous_stock, new_stock, unit_price, total_price, source_type, reference_number, note)
      VALUES ('${p3Id}', 'IN', 45.00, 'Roll', 1.0000, 45.00, 0.00, 45.00, 7000.00, 315000.00, 'Supplier', 'PO-1003', 'Initial stock');
    `);

    console.log(' Sample products seeded successfully!');
  } else {
    console.log(` store_inventory already has ${count} records.`);
  }

  console.log('--- STORE INVENTORY Schema Application Complete! ---');
}

run().catch((err) => {
  console.error('Schema application error:', err);
  process.exit(1);
});

