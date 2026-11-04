/**
 * Merkato Ledger — Real Inventory Acceptance Tests (TEST 1 – TEST 6)
 * ================================================================
 * Runs the REAL application backend (src/lib/api.ts) against the LIVE
 * Neon PostgreSQL database. No mock inventory data is used anywhere.
 *
 * Covered:
 *   TEST 1  stock 100, out 50   -> remaining 50,  SUCCESS
 *   TEST 2  stock 100, out 100  -> remaining 0,   SUCCESS
 *   TEST 3  stock 100, out 101  -> remaining 100, REJECTED
 *   TEST 4  stock 0,   out 1    -> REJECTED
 *   TEST 5  stock 100, in 50    -> remaining 150, SUCCESS
 *   TEST 6  two simultaneous withdrawals of 60 from 100
 *           -> exactly one succeeds, the other is rejected (40 remain)
 *   Plus:  balance integrity (Current = Total IN - Total OUT),
 *          store isolation (403), invalid quantities, audit fields,
 *          and the database CHECK backstop against negative stock.
 *
 * Usage:  node run_acceptance_tests.mjs
 * Exit code 0 = all tests passed, 1 = at least one failure.
 */
import 'dotenv/config'
import { neon } from '@neondatabase/serverless'

const DB_URL = process.env.DATABASE_URL || process.env.VITE_DATABASE_URL
if (!DB_URL) {
  console.error('No DATABASE_URL / VITE_DATABASE_URL found in .env')
  process.exit(1)
}
const sql = neon(DB_URL)

// Import the real backend used by the Store & Stock page.
const api = await import('./src/lib/api.ts')

/* ------------------------------ harness ------------------------------ */
let passed = 0
let failed = 0

function check(name, condition, details = '') {
  if (condition) {
    passed++
    console.log(`  PASS  ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${details ? `  [${details}]` : ''}`)
  }
}

const round2 = (n) => Math.round(Number(n) * 100) / 100

/* ------------------------------- setup ------------------------------- */
const stamp = Date.now()
let testStoreId = null
let testUserId = null
let secondUserId = null
const createdProductIds = []
let productCounter = 0

async function setup() {
  const { store } = await api.createStore(`Inventory Acceptance ${stamp}`)
  testStoreId = store.id

  testUserId = `user-inv-acceptance-${stamp}`
  await sql`
    INSERT INTO users (id, name, phone, password_hash, role, store_id, active)
    VALUES (${testUserId}, 'Inventory Acceptance Tester', ${'+2519' + String(stamp).slice(-8)}, '', 'storekeeper', ${testStoreId}, true)
  `

  // Second shopkeeper working in the SAME store (used by the race test).
  secondUserId = `user-inv-acceptance-2-${stamp}`
  await sql`
    INSERT INTO users (id, name, phone, password_hash, role, store_id, active)
    VALUES (${secondUserId}, 'Second Shopkeeper', ${'+2519' + String(stamp + 1).slice(-8)}, '', 'storekeeper', ${testStoreId}, true)
  `
}

async function cleanup() {
  for (const id of createdProductIds) {
    try {
      await api.deleteInventoryProduct(id)
    } catch {
      /* already gone */
    }
  }
  if (testStoreId) {
    try {
      await sql`DELETE FROM ledger_records WHERE store_id = ${testStoreId}`
    } catch { /* ignore */ }
    try {
      await sql`DELETE FROM stores WHERE id = ${testStoreId}`
    } catch { /* ignore */ }
  }
  if (testUserId) {
    try {
      await sql`DELETE FROM users WHERE id = ${testUserId}`
    } catch { /* ignore */ }
  }
  if (secondUserId) {
    try {
      await sql`DELETE FROM users WHERE id = ${secondUserId}`
    } catch { /* ignore */ }
  }
}

/* ------------------------------ helpers ------------------------------ */
const storekeeper = () => ({
  id: testUserId,
  name: 'Inventory Acceptance Tester',
  role: 'storekeeper',
  storeId: testStoreId,
})

const foreignKeeper = () => ({
  id: 'user-foreign-storekeeper',
  name: 'Foreign Storekeeper',
  role: 'storekeeper',
  storeId: 'store-someone-else',
})

const adminActor = () => ({
  id: 'user-admin-acceptance',
  name: 'Acceptance Admin',
  role: 'admin',
  storeId: null,
})

/** The second shopkeeper of the same store (used by the race test). */
const secondKeeper = () => ({
  id: secondUserId,
  name: 'Second Shopkeeper',
  role: 'storekeeper',
  storeId: testStoreId,
})

async function makeProduct(initialQty, baseUnit = 'pieces') {
  productCounter++
  const product = await api.registerNewProduct({
    storeId: testStoreId,
    createdBy: testUserId,
    productName: `Acceptance Product ${productCounter}`,
    sku: `ACC-SKU-${String(productCounter).padStart(3, '0')}`,
    category: 'Acceptance',
    baseUnit,
    initialQuantity: initialQty,
    minimumStock: 0,
    unitPrice: 10,
    costPrice: 8,
  })
  createdProductIds.push(product.id)
  return product
}

async function qtyOf(productId) {
  const p = await api.getInventoryProductById(productId)
  return p ? Number(p.currentQuantity) : NaN
}

async function stockOut(productId, quantity, actor = storekeeper()) {
  try {
    const result = await api.executeStockTransaction({
      storeId: testStoreId,
      productId,
      movementType: 'OUT',
      quantity,
      unitPrice: 10,
      supplierOrDestination: 'Acceptance Customer',
      transactionDate: new Date().toISOString().split('T')[0],
      note: 'acceptance test withdrawal',
      requestedBy: actor,
    })
    return { ok: true, result }
  } catch (error) {
    return { ok: false, error }
  }
}

async function stockIn(productId, quantity, actor = storekeeper()) {
  try {
    const result = await api.executeStockTransaction({
      storeId: testStoreId,
      productId,
      movementType: 'IN',
      quantity,
      unitPrice: 8,
      supplierOrDestination: 'Acceptance Supplier',
      transactionDate: new Date().toISOString().split('T')[0],
      note: 'acceptance test receipt',
      requestedBy: actor,
    })
    return { ok: true, result }
  } catch (error) {
    return { ok: false, error }
  }
}

/** Current Stock must always equal Total Stock In - Total Stock Out. */
async function checkBalanceIntegrity(productId, label) {
  const movements = await api.getStockMovements(productId, testStoreId)
  let sum = 0
  for (const m of movements) {
    sum += m.movementType === 'IN' ? Number(m.quantity) : -Number(m.quantity)
  }
  const current = await qtyOf(productId)
  check(
    `${label}: Current Stock = Total IN - Total OUT`,
    Math.abs(current - sum) < 1e-9,
    `current=${current}, sum(in-out)=${sum}`
  )
}

/* ------------------------------- tests ------------------------------- */
async function runTests() {
  /* ------------------------------------------------------------------ */
  console.log('\n--- TEST 1: stock 100, withdraw 50 -> 50 (SUCCESS) ---')
  const p1 = await makeProduct(100)
  const t1 = await stockOut(p1.id, 50)
  check('withdrawal of 50 is ALLOWED', t1.ok, t1.error?.message)
  check('remaining stock is 50', round2(await qtyOf(p1.id)) === 50, `got ${await qtyOf(p1.id)}`)
  if (t1.ok) {
    check('movement records previous balance 100', t1.result.movement.previousStock === 100)
    check('movement records new balance 50', t1.result.movement.newStock === 50)
    check('movement records the acting user', t1.result.movement.createdBy === testUserId)
  }
  await checkBalanceIntegrity(p1.id, 'TEST 1')

  /* ------------------------------------------------------------------ */
  console.log('\n--- TEST 2: stock 100, withdraw 100 -> 0 (SUCCESS) ---')
  const p2 = await makeProduct(100)
  const t2 = await stockOut(p2.id, 100)
  check('withdrawal of exactly all stock is ALLOWED', t2.ok, t2.error?.message)
  check('remaining stock is 0', round2(await qtyOf(p2.id)) === 0, `got ${await qtyOf(p2.id)}`)

  console.log('  ... draining to zero blocks any further withdrawal')
  const t2b = await stockOut(p2.id, 1)
  check('further withdrawal from 0 stock is REJECTED', !t2b.ok)
  check('stock still 0 after rejected attempt', round2(await qtyOf(p2.id)) === 0)
  await checkBalanceIntegrity(p2.id, 'TEST 2')

  /* ------------------------------------------------------------------ */
  console.log('\n--- TEST 3: stock 100, withdraw 101 -> REJECTED, stays 100 ---')
  const p3 = await makeProduct(100)
  const t3 = await stockOut(p3.id, 101)
  check('withdrawal of 101 from 100 is REJECTED', !t3.ok)
  check('stock unchanged at 100', round2(await qtyOf(p3.id)) === 100, `got ${await qtyOf(p3.id)}`)
  const msg3 = t3.error?.message || ''
  check(
    'error message (English) matches required format',
    msg3.includes('Insufficient stock! Available quantity is 100 pieces. You cannot withdraw 101 pieces.'),
    msg3
  )
  check(
    'error message (Amharic) matches required format',
    msg3.includes('በቂ እቃ የለም! በመደብሩ ያለው መጠን 100 ብቻ ነው። 101 መውሰድ አይቻልም።'),
    msg3
  )
  await checkBalanceIntegrity(p3.id, 'TEST 3')

  /* ------------------------------------------------------------------ */
  console.log('\n--- TEST 4: stock 0, withdraw 1 -> REJECTED ---')
  const p4 = await makeProduct(0)
  const t4 = await stockOut(p4.id, 1)
  check('withdrawal from zero stock is REJECTED', !t4.ok, t4.error?.message)
  check('stock remains 0', round2(await qtyOf(p4.id)) === 0)
  await checkBalanceIntegrity(p4.id, 'TEST 4')

  /* ------------------------------------------------------------------ */
  console.log('\n--- TEST 5: stock 100, stock in 50 -> 150 (SUCCESS) ---')
  const p5 = await makeProduct(100)
  const t5 = await stockIn(p5.id, 50)
  check('stock in of 50 is ALLOWED', t5.ok, t5.error?.message)
  check('new stock is 150', round2(await qtyOf(p5.id)) === 150, `got ${await qtyOf(p5.id)}`)
  if (t5.ok) {
    check('movement records previous balance 100', t5.result.movement.previousStock === 100)
    check('movement records new balance 150', t5.result.movement.newStock === 150)
  }
  await checkBalanceIntegrity(p5.id, 'TEST 5')

  /* ------------------------------------------------------------------ */
  console.log('\n--- TEST 6: two shopkeepers simultaneously withdraw 60 from 100 ---')
  const p6 = await makeProduct(100)
  const [r1, r2] = await Promise.all([
    stockOut(p6.id, 60, storekeeper()),
    stockOut(p6.id, 60, secondKeeper()),
  ])
  const successes = [r1, r2].filter((r) => r.ok)
  const rejections = [r1, r2].filter((r) => !r.ok)
  check('exactly one withdrawal succeeded', successes.length === 1, `succeeded=${successes.length}`)
  check('the second withdrawal was rejected', rejections.length === 1, `rejected=${rejections.length}`)
  check(
    'rejected because only 40 pieces remain',
    rejections.length === 1 && (rejections[0].error?.message || '').includes('40'),
    rejections[0]?.error?.message
  )
  check('final stock is 40', round2(await qtyOf(p6.id)) === 40, `got ${await qtyOf(p6.id)}`)
  await checkBalanceIntegrity(p6.id, 'TEST 6')

  /* ------------------------------------------------------------------ */
  console.log('\n--- REAL-TIME CALCULATION: 50 +100 -30 = 120, then -20 = 100 ---')
  const pr = await makeProduct(50)
  await stockIn(pr.id, 100)
  await stockOut(pr.id, 30)
  check('on-hand is 120 after +100 / -30', round2(await qtyOf(pr.id)) === 120, `got ${await qtyOf(pr.id)}`)
  await stockOut(pr.id, 20)
  check('on-hand is 100 after another -20', round2(await qtyOf(pr.id)) === 100, `got ${await qtyOf(pr.id)}`)
  await checkBalanceIntegrity(pr.id, 'REAL-TIME')

  /* ------------------------------------------------------------------ */
  console.log('\n--- STRICT QUANTITY VALIDATION (bypassing the frontend) ---')
  const pv = await makeProduct(10)
  check('quantity 0 is REJECTED', !(await stockOut(pv.id, 0)).ok)
  check('negative quantity is REJECTED', !(await stockOut(pv.id, -5)).ok)
  check('NaN quantity is REJECTED', !(await stockOut(pv.id, NaN)).ok)
  check('non-numeric quantity is REJECTED', !(await stockOut(pv.id, 'abc')).ok)
  check('stock unchanged after invalid attempts', round2(await qtyOf(pv.id)) === 10)

  /* ------------------------------------------------------------------ */
  console.log('\n--- STORE ISOLATION (backend rejects foreign storekeepers) ---')
  const pi = await makeProduct(100)
  const foreign = await stockOut(pi.id, 10, foreignKeeper())
  check('foreign storekeeper gets 403', !foreign.ok && foreign.error?.status === 403, foreign.error?.message)
  check('stock unchanged after cross-store attempt', round2(await qtyOf(pi.id)) === 100)

  let scopeRejected = false
  try {
    await api.executeStockTransaction({
      storeId: 'store-different-scope',
      productId: pi.id,
      movementType: 'OUT',
      quantity: 10,
      unitPrice: 10,
      requestedBy: adminActor(),
    })
  } catch (error) {
    scopeRejected = error?.status === 403
  }
  check('mismatched requested store is rejected (403)', scopeRejected)

  const ownOk = await stockOut(pi.id, 10, storekeeper())
  check('own-store storekeeper is allowed', ownOk.ok, ownOk.error?.message)

  /* ------------------------------------------------------------------ */
  console.log('\n--- AUDIT TRAIL (every record: product, store, type, qty, balances, user, date, notes) ---')
  const movements = await api.getStockMovements(p1.id, testStoreId)
  const out50 = movements.find((m) => m.movementType === 'OUT' && Number(m.quantity) === 50)
  check('movement exists for TEST 1 withdrawal', Boolean(out50))
  if (out50) {
    check('record has product id', out50.productId === p1.id)
    check('record has store id', out50.storeId === testStoreId)
    check('record has transaction type', out50.movementType === 'OUT')
    check('record has quantity', Number(out50.quantity) === 50)
    check('record has previous balance', Number(out50.previousStock) === 100)
    check('record has new balance', Number(out50.newStock) === 50)
    check('record has user id (created_by)', out50.createdBy === testUserId)
    check('record resolves user display name', out50.createdByName === 'Inventory Acceptance Tester')
    check('record has transaction date', Boolean(out50.transactionDate))
    check('record has notes', Boolean(out50.note))
  }
  const ledgerCount = await sql`
    SELECT count(*)::int AS n FROM ledger_records
    WHERE store_id = ${testStoreId} AND type = 'stock'
  `
  check('stock movements are synced to ledger_records', ledgerCount[0].n > 0, `n=${ledgerCount[0].n}`)

  /* ------------------------------------------------------------------ */
  console.log('\n--- DATABASE BACKSTOP: raw SQL can never drive stock negative ---')
  let guardBlocked = false
  let guardMessage = ''
  try {
    await sql`UPDATE store_inventory SET current_quantity = -1 WHERE id = ${pi.id}`
  } catch (error) {
    guardMessage = String(error?.message || error)
    guardBlocked = /check constraint|store_inventory_non_negative/i.test(guardMessage)
  }
  check('CHECK constraint rejects negative inventory', guardBlocked, guardMessage)
  check('stock unchanged after blocked negative update', round2(await qtyOf(pi.id)) === 90)

  /* ------------------------------------------------------------------ */
  console.log('\n--- HISTORY IMMUTABILITY: no movement rows deleted or rewritten ---')
  const before = (await api.getStockMovements(undefined, testStoreId)).length
  await stockOut(p1.id, 5, storekeeper())
  const after = await api.getStockMovements(undefined, testStoreId)
  check('history only grows (append-only)', after.length === before + 1, `before=${before}, after=${after.length}`)
}

/* ------------------------------- runner ------------------------------ */
console.log('================================================================')
console.log('  MERKATO LEDGER — INVENTORY ACCEPTANCE TESTS (live database)')
console.log('================================================================')

try {
  await setup()
  console.log(`Test store: ${testStoreId}`)
  await runTests()
} catch (error) {
  failed++
  console.error('\nFATAL during tests:', error)
} finally {
  await cleanup()
  console.log('\nTest data cleaned up.')
}

console.log('================================================================')
console.log(`  RESULT: ${passed} passed, ${failed} failed`)
console.log('================================================================')
process.exit(failed > 0 ? 1 : 0)
