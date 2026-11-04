const connStr = 'postgresql://neondb_owner:npg_OtyTj7F9Aqnz@ep-red-sea-b5yphk96-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require';
const endpoint = 'https://ep-red-sea-b5yphk96.c-7.us-east-2.aws.neon.tech/sql';

async function query(sql, params = []) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Neon-Connection-String': connStr,
    },
    body: JSON.stringify({ query: sql, params })
  });
  return res.json();
}

async function main() {
  console.log('--- Migrating & Seeding Multiple Delala Records ---');
  
  // 1. Ensure store_id on esmiz_records
  await query('ALTER TABLE esmiz_records ADD COLUMN IF NOT EXISTS store_id VARCHAR(64);');
  
  // 2. Fetch existing esmiz_records
  const records = await query('SELECT * FROM esmiz_records ORDER BY created_at ASC;');
  console.log('Current Delala records:', records.rows);

  if (records.rows.length === 1 && records.rows[0].title === 'Esmiz') {
    await query("UPDATE esmiz_records SET title = 'Delala Mohammed (ደላላ መሀመድ)' WHERE id = $1;", [records.rows[0].id]);
    console.log('Updated default Esmiz to Delala Mohammed');
  }

  // 3. Insert a second Delala if only 1 exists
  const count = (await query('SELECT COUNT(*) as c FROM esmiz_records;')).rows[0].c;
  if (parseInt(count) < 2) {
    const inserted = await query(
      "INSERT INTO esmiz_records (title) VALUES ('Delala Abebe (ደላላ አበበ)') RETURNING id, title;"
    );
    const newId = inserted.rows[0].id;
    console.log('Created new Delala record:', inserted.rows[0]);

    // Insert sample entries for Delala Abebe
    await query(
      "INSERT INTO esmiz_entries (esmiz_id, description, amount, sign, position, transaction_date) VALUES ($1, 'comm adv (ኮሚሽን)', 3500.00, -1, 1, CURRENT_DATE);",
      [newId]
    );
    await query(
      "INSERT INTO esmiz_entries (esmiz_id, description, amount, sign, position, transaction_date) VALUES ($1, 'payment received (ክፍያ)', 1500.00, 1, 2, CURRENT_DATE);",
      [newId]
    );
    console.log('Added initial Esmiz entries for Delala Abebe');
  }

  const all = await query(`
    SELECT r.id, r.title, r.store_id, r.created_at,
           COUNT(e.id) as entries_count,
           COALESCE(SUM(e.amount * e.sign), 0) as total_balance
    FROM esmiz_records r
    LEFT JOIN esmiz_entries e ON e.esmiz_id = r.id
    GROUP BY r.id, r.title, r.store_id, r.created_at
    ORDER BY r.created_at ASC;
  `);
  console.log('All Delalas in DB:', all.rows);
}

main().catch(console.error);

