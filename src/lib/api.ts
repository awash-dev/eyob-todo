import { neon, neonConfig } from '@neondatabase/serverless'
import type { NeonQueryFunction } from '@neondatabase/serverless'
import type {
  AccountSummary,
  AuthUser,
  LedgerRecord,
  Shop,
  Statement,
  StatementEntry,
  TabType,
} from '../types/ledger'

// Suppress browser direct SQL warning in console
neonConfig.disableWarningInBrowsers = true

const DEFAULT_DB_URL =
  'postgresql://neondb_owner:npg_OtyTj7F9Aqnz@ep-red-sea-b5yphk96-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require'

export const getDbUrl = (): string => {
  return import.meta.env.VITE_DATABASE_URL || DEFAULT_DB_URL
}

let sqlClient: NeonQueryFunction<false, false> | null = null

export function getSql(): NeonQueryFunction<false, false> {
  if (!sqlClient) {
    const url = getDbUrl()
    sqlClient = neon(url, { disableWarningInBrowsers: true })
  }
  return sqlClient
}

const TOKEN_KEY = 'click_ledger_token'
const USER_KEY = 'click_ledger_auth_user'

let authToken: string | null = null
const unauthorizedListeners = new Set<() => void>()

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function loadStoredToken(): string | null {
  if (authToken) return authToken
  try {
    authToken = localStorage.getItem(TOKEN_KEY)
  } catch {
    authToken = null
  }
  return authToken
}

export function setAuthToken(token: string | null) {
  authToken = token
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
    }
  } catch {
    // Ignore storage failures
  }
}

export function onUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener)
  return () => unauthorizedListeners.delete(listener)
}

function notifyUnauthorized() {
  for (const listener of unauthorizedListeners) listener()
}

function parseJsonField<T>(val: unknown, fallback: T): T {
  if (val === null || val === undefined) return fallback
  if (typeof val === 'object') return val as T
  if (typeof val === 'string') {
    try {
      return JSON.parse(val) as T
    } catch {
      return fallback
    }
  }
  return fallback
}

async function sha256Hex(str: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(str),
  )
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (stored.startsWith('sha256:')) {
    const [, salt, expected] = stored.split(':')
    const actual = await sha256Hex(salt + password)
    return actual.toLowerCase() === expected.toLowerCase()
  }
  if (stored === password) return true
  return false
}

async function hashPasswordWithSalt(password: string): Promise<string> {
  const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  const hash = await sha256Hex(salt + password)
  return `sha256:${salt}:${hash}`
}

/**
 * Normalizes an Ethiopian phone number to canonical E.164 form (+2519XXXXXXXX).
 *
 * Accepts: 0911111111, 911111111, +251911111111, 251911111111, dashed/spaced forms.
 * Returns null when the input is not a valid Ethiopian mobile number.
 */
export function normalizePhone(input: string): string | null {
  let digits = input.replace(/[\s\-().]/g, '')
  if (digits.startsWith('+')) digits = digits.slice(1)
  if (digits.startsWith('251')) digits = `0${digits.slice(3)}`
  if (!/^0[79]\d{8}$/.test(digits)) return null
  return `+251${digits.slice(1)}`
}

/* ------------------------------- Auth ------------------------------- */

export interface LoginResponse {
  token: string
  user: AuthUser
  shop: { id: string; name: string } | null
}

export async function login(phone: string, password: string): Promise<LoginResponse> {
  const cleanPhone = normalizePhone(phone)
  if (!cleanPhone) {
    throw new ApiError(400, 'Enter a valid Ethiopian phone number (e.g. 0911111111)')
  }
  const sql = getSql()

  let rows: any[] = []
  try {
    rows = await sql`
      SELECT u.id, u.name, u.email, u.phone, u.password_hash, u.role, u.shop_id, u.active,
             sh.name AS shop_name
      FROM users u
      LEFT JOIN shops sh ON sh.id = u.shop_id
      WHERE u.phone = ${cleanPhone} OR u.phone = ${phone.trim()}
      LIMIT 1
    `
  } catch (err) {
    console.error('Neon direct login error:', err)
    throw new ApiError(0, 'Failed to connect to Neon database. Please check connection.')
  }

  if (rows.length === 0) {
    throw new ApiError(401, 'Invalid phone number or password')
  }

  const row = rows[0]
  if (row.active === false) {
    throw new ApiError(403, 'This account has been deactivated by the Admin')
  }

  if (!password || !password.trim()) {
    throw new ApiError(400, 'Please enter your password')
  }
  const storedHash = String(row.password_hash || '')
  if (!storedHash) {
    throw new ApiError(500, 'This account has no password stored in the database')
  }
  const isValid = await verifyPassword(password.trim(), storedHash)
  if (!isValid) {
    throw new ApiError(401, 'Incorrect password. Please try again.')
  }

  const user: AuthUser = {
    id: String(row.id),
    name: String(row.name),
    phone: String(row.phone),
    email: row.email ? String(row.email) : undefined,
    role: row.role === 'admin' ? 'admin' : 'shopkeeper',
    shopId: row.shop_id ? String(row.shop_id) : null,
    shopName: row.shop_name ? String(row.shop_name) : null,
    active: row.active !== false,
  }

  const token = `neon-token-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  setAuthToken(token)

  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user))
  } catch {
    // Ignore storage errors
  }

  return {
    token,
    user,
    shop: user.shopId ? { id: user.shopId, name: user.shopName || '' } : null,
  }
}

export async function logout(): Promise<void> {
  setAuthToken(null)
}

export async function getMe(): Promise<{ user: AuthUser }> {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) {
    notifyUnauthorized()
    throw new ApiError(401, 'Please sign in again')
  }
  try {
    const user = JSON.parse(raw) as AuthUser
    return { user }
  } catch {
    notifyUnauthorized()
    throw new ApiError(401, 'Please sign in again')
  }
}

/* ------------------------------- Shops ------------------------------ */

/**
 * Reads the shop list straight from the database.
 * There is no local/mock fallback: a failed query is surfaced as an error.
 */
export async function getShops(): Promise<{ shops: Shop[] }> {
  const sql = getSql()
  try {
    const rows = await sql`SELECT id, name, code FROM shops ORDER BY name ASC`
    const shops: Shop[] = rows.map((r: any) => ({
      id: String(r.id),
      name: String(r.name),
      code: String(r.code || ''),
    }))
    return { shops }
  } catch (err) {
    console.error('Neon getShops failed:', err)
    throw new ApiError(0, 'Could not load shops from the database')
  }
}

/** id -> name lookup used to replace any hardcoded shop name. */
async function getShopNameMap(): Promise<Map<string, string>> {
  const { shops } = await getShops()
  return new Map(shops.map((shop) => [shop.id, shop.name]))
}

/**
 * Resolves the shop a record should be written to.
 * When no concrete shop is selected ("all" / none) the first shop in the
 * database is used; if the database has no shop at all, this fails instead
 * of silently inventing one.
 */
async function resolveShopId(shopId?: string | null): Promise<string> {
  if (shopId && shopId !== 'all') return shopId
  const { shops } = await getShops()
  if (shops.length === 0) {
    throw new ApiError(400, 'No shop exists yet — create a shop before saving records')
  }
  return shops[0].id
}

export async function createShop(name: string, code?: string): Promise<{ shop: Shop }> {
  const sql = getSql()
  const id = `shop-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const finalCode = (code || name.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30)).toUpperCase()
  const now = Date.now()

  await sql`
    INSERT INTO shops (id, name, code, created_at)
    VALUES (${id}, ${name}, ${finalCode}, ${now})
  `

  return { shop: { id, name, code: finalCode } }
}

export async function deleteShop(id: string): Promise<{ ok: boolean; deleted: string; name: string }> {
  const sql = getSql()
  const existing = await sql`SELECT id, name FROM shops WHERE id = ${id} LIMIT 1`
  const name = existing[0]?.name ? String(existing[0].name) : id

  await sql`DELETE FROM ledger_records WHERE shop_id = ${id}`
  await sql`UPDATE users SET shop_id = NULL WHERE shop_id = ${id}`
  await sql`DELETE FROM shops WHERE id = ${id}`

  return { ok: true, deleted: id, name }
}

/* ------------------------------- Users ------------------------------ */

export interface Shopkeeper {
  id: string
  name: string
  phone: string
  email?: string
  role: 'shopkeeper'
  shopId: string | null
  shopName: string | null
  active: boolean
  createdAt: number
}

export async function getUsers(): Promise<{ users: Shopkeeper[] }> {
  const sql = getSql()
  const rows = await sql`
    SELECT u.id, u.name, u.email, u.phone, u.role, u.shop_id, u.active, u.created_at,
           sh.name AS shop_name
    FROM users u
    LEFT JOIN shops sh ON sh.id = u.shop_id
    WHERE u.role = 'shopkeeper'
    ORDER BY u.created_at ASC
  `

  const users: Shopkeeper[] = rows.map((r: any) => ({
    id: String(r.id),
    name: String(r.name),
    phone: r.phone ? String(r.phone) : '',
    email: r.email ? String(r.email) : undefined,
    role: 'shopkeeper',
    shopId: r.shop_id ? String(r.shop_id) : null,
    shopName: r.shop_name ? String(r.shop_name) : null,
    active: r.active !== false,
    createdAt: Number(r.created_at || Date.now()),
  }))

  return { users }
}

export async function createUser(input: {
  name: string
  phone: string
  password: string
  shopId: string
}): Promise<{ user: Shopkeeper }> {
  const cleanPhone = normalizePhone(input.phone)
  if (!cleanPhone) {
    throw new ApiError(400, 'Enter a valid Ethiopian phone number (e.g. 0911111111)')
  }

  const sql = getSql()

  const existing = await sql`SELECT id FROM users WHERE phone = ${cleanPhone} LIMIT 1`
  if (existing.length > 0) {
    throw new ApiError(409, `A shopkeeper with phone ${cleanPhone} already exists`)
  }

  const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const hash = await hashPasswordWithSalt(input.password)
  const now = Date.now()

  await sql`
    INSERT INTO users (id, name, email, phone, password_hash, role, shop_id, active, created_at)
    VALUES (${id}, ${input.name}, NULL, ${cleanPhone}, ${hash}, 'shopkeeper', ${input.shopId || null}, true, ${now})
  `

  return {
    user: {
      id,
      name: input.name,
      phone: cleanPhone,
      role: 'shopkeeper',
      shopId: input.shopId || null,
      shopName: null,
      active: true,
      createdAt: now,
    },
  }
}

export async function updateUser(
  id: string,
  input: Partial<{
    name: string
    phone: string
    password: string
    shopId: string
    active: boolean
  }>,
): Promise<{ user: Shopkeeper }> {
  const sql = getSql()

  if (input.name !== undefined) {
    await sql`UPDATE users SET name = ${input.name} WHERE id = ${id}`
  }
  if (input.phone !== undefined && input.phone !== '') {
    const cleanPhone = normalizePhone(input.phone)
    if (!cleanPhone) {
      throw new ApiError(400, 'Enter a valid Ethiopian phone number (e.g. 0911111111)')
    }
    const clash = await sql`SELECT id FROM users WHERE phone = ${cleanPhone} AND id != ${id} LIMIT 1`
    if (clash.length > 0) {
      throw new ApiError(409, `Another shopkeeper already uses phone ${cleanPhone}`)
    }
    await sql`UPDATE users SET phone = ${cleanPhone} WHERE id = ${id}`
  }
  if (input.shopId !== undefined) {
    await sql`UPDATE users SET shop_id = ${input.shopId} WHERE id = ${id}`
  }
  if (input.active !== undefined) {
    await sql`UPDATE users SET active = ${input.active} WHERE id = ${id}`
  }
  if (input.password) {
    const hash = await hashPasswordWithSalt(input.password)
    await sql`UPDATE users SET password_hash = ${hash} WHERE id = ${id}`
  }

  const rows = await sql`
    SELECT u.id, u.name, u.email, u.phone, u.role, u.shop_id, u.active, u.created_at,
           sh.name AS shop_name
    FROM users u
    LEFT JOIN shops sh ON sh.id = u.shop_id
    WHERE u.id = ${id}
    LIMIT 1
  `

  const r = rows[0]
  const user: Shopkeeper = {
    id: String(r.id),
    name: String(r.name),
    phone: r.phone ? String(r.phone) : '',
    email: r.email ? String(r.email) : undefined,
    role: 'shopkeeper',
    shopId: r.shop_id ? String(r.shop_id) : null,
    shopName: r.shop_name ? String(r.shop_name) : null,
    active: r.active !== false,
    createdAt: Number(r.created_at || Date.now()),
  }

  return { user }
}

export async function deleteUser(id: string): Promise<{ ok: boolean; deleted: string; name: string }> {
  const sql = getSql()
  const rows = await sql`SELECT id, name FROM users WHERE id = ${id} LIMIT 1`
  const name = rows[0]?.name ? String(rows[0].name) : id

  await sql`DELETE FROM sessions WHERE user_id = ${id}`
  await sql`DELETE FROM users WHERE id = ${id}`

  return { ok: true, deleted: id, name }
}

/* ------------------------------ Records ----------------------------- */

export async function getRecords(
  type?: TabType,
  shopId?: string | null,
): Promise<{ records: LedgerRecord[]; shopId: string }> {
  const sql = getSql()
  let rows: any[] = []
  const filterShopId = shopId && shopId !== 'all' ? shopId : null

  if (type && filterShopId) {
    rows = await sql`
      SELECT id, type, title, date, notes, exchange_rate, items, shop_id, created_at, updated_at
      FROM ledger_records
      WHERE shop_id = ${filterShopId} AND type = ${type}
      ORDER BY created_at DESC
    `
  } else if (filterShopId) {
    rows = await sql`
      SELECT id, type, title, date, notes, exchange_rate, items, shop_id, created_at, updated_at
      FROM ledger_records
      WHERE shop_id = ${filterShopId}
      ORDER BY created_at DESC
    `
  } else if (type) {
    rows = await sql`
      SELECT id, type, title, date, notes, exchange_rate, items, shop_id, created_at, updated_at
      FROM ledger_records
      WHERE type = ${type}
      ORDER BY created_at DESC
    `
  } else {
    rows = await sql`
      SELECT id, type, title, date, notes, exchange_rate, items, shop_id, created_at, updated_at
      FROM ledger_records
      ORDER BY created_at DESC
    `
  }

  // Real shop names come from the shops table — never hardcoded.
  const shopNames = await getShopNameMap()

  const records: LedgerRecord[] = rows.map((row: any) => {
    const sId = row.shop_id ? String(row.shop_id) : undefined
    const sName = sId ? shopNames.get(sId) : undefined
    return {
      id: String(row.id),
      type: row.type as LedgerRecord['type'],
      title: String(row.title),
      date: String(row.date),
      notes: row.notes ? String(row.notes) : undefined,
      exchangeRate: row.exchange_rate ? Number(row.exchange_rate) : 198,
      items: parseJsonField<LedgerRecord['items']>(row.items, []),
      shopId: sId,
      shopName: sName,
      createdAt: Number(row.created_at || Date.now()),
      updatedAt: Number(row.updated_at || Date.now()),
    }
  })

  return { records, shopId: filterShopId || 'all' }
}

export async function createRecord(
  record: Omit<LedgerRecord, 'id' | 'createdAt' | 'updatedAt'>,
  shopId?: string | null,
): Promise<{ record: LedgerRecord }> {
  const sql = getSql()
  const id = `rec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const now = Date.now()
  const finalShopId = await resolveShopId(shopId)

  await sql`
    INSERT INTO ledger_records (
      id, type, title, date, notes, exchange_rate, items, shop_id, created_at, updated_at
    ) VALUES (
      ${id},
      ${record.type},
      ${record.title},
      ${record.date},
      ${record.notes || null},
      ${record.exchangeRate || 198},
      ${JSON.stringify(record.items)},
      ${finalShopId},
      ${now},
      ${now}
    )
  `

  return {
    record: {
      ...record,
      id,
      shopId: finalShopId,
      createdAt: now,
      updatedAt: now,
    },
  }
}

export async function updateRecord(
  id: string,
  record: Omit<LedgerRecord, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<{ record: LedgerRecord }> {
  const sql = getSql()
  const now = Date.now()

  await sql`
    UPDATE ledger_records SET
      type = ${record.type},
      title = ${record.title},
      date = ${record.date},
      notes = ${record.notes || null},
      exchange_rate = ${record.exchangeRate || 198},
      items = ${JSON.stringify(record.items)},
      updated_at = ${now}
    WHERE id = ${id}
  `

  return {
    record: {
      ...record,
      id,
      updatedAt: now,
      createdAt: (record as any).createdAt || now,
    },
  }
}

export async function deleteRecord(id: string): Promise<{ ok: boolean }> {
  const sql = getSql()
  await sql`DELETE FROM ledger_records WHERE id = ${id}`
  return { ok: true }
}

/* --------------------------- Accounts / statements ------------------ */

export async function getAccounts(
  type: 'customer' | 'supplier',
  shopId?: string | null,
): Promise<{ accounts: AccountSummary[] }> {
  const { records } = await getRecords(type, shopId)
  const map = new Map<string, AccountSummary>()
  const finalShopId = (!shopId || shopId === 'all') ? 'all' : shopId
  const shopName =
    finalShopId === 'all' ? 'All Shops' : (await getShopNameMap()).get(finalShopId) ?? ''

  for (const r of records) {
    const key = r.title.trim().toLowerCase()
    let existing = map.get(key)
    if (!existing) {
      existing = {
        name: r.title.trim(),
        type,
        shopId: finalShopId,
        shopName,
        recordCount: 0,
        totalDebit: 0,
        totalCredit: 0,
        outstanding: 0,
        lastDate: r.date,
      }
      map.set(key, existing)
    }
    existing.recordCount++
    if (new Date(r.date) > new Date(existing.lastDate)) {
      existing.lastDate = r.date
    }
    for (const it of r.items) {
      const qty = Number(it.quantity) || 0
      const price = Number(it.unitPrice) || 0
      const subtotal = Math.abs(qty * price)
      if (it.sign === '+') existing.totalDebit += subtotal
      else existing.totalCredit += subtotal
    }
    existing.outstanding = existing.totalDebit - existing.totalCredit
  }

  return { accounts: Array.from(map.values()) }
}

export async function getStatement(
  type: 'customer' | 'supplier',
  name: string,
  shopId?: string | null,
): Promise<{ statement: Statement }> {
  const { records } = await getRecords(type, shopId)
  const matching = records.filter(
    (r) => r.title.trim().toLowerCase() === name.trim().toLowerCase(),
  )
  const entries: StatementEntry[] = []
  let running = 0
  let totalDebit = 0
  let totalCredit = 0

  for (const r of matching) {
    for (const it of r.items) {
      const qty = Number(it.quantity) || 0
      const price = Number(it.unitPrice) || 0
      const amount = Math.abs(qty * price)
      const debit = it.sign === '+' ? amount : 0
      const credit = it.sign === '-' ? amount : 0
      totalDebit += debit
      totalCredit += credit
      running += debit - credit
      entries.push({
        recordId: r.id,
        itemId: it.id,
        date: r.date,
        description: it.name || r.title,
        quantity: qty,
        unitPrice: price,
        debit,
        credit,
        balance: running,
        paymentMethod: it.paymentMethod ?? null,
        reference: it.reference ?? null,
        notes: r.notes ?? null,
      })
    }
  }

  const finalShopId = (!shopId || shopId === 'all') ? 'all' : shopId
  const outstanding =
    type === 'customer' ? totalDebit - totalCredit : totalCredit - totalDebit

  return {
    statement: {
      accountName: name,
      accountType: type,
      shopId: finalShopId,
      shopName:
        finalShopId === 'all'
          ? 'All Shops'
          : (await getShopNameMap()).get(finalShopId) ?? '',
      entries,
      payments: entries
        .filter((e) => (type === 'customer' ? e.credit > 0 : e.debit > 0))
        .map((e) => ({
          date: e.date,
          amount: type === 'customer' ? e.credit : e.debit,
          paymentMethod: e.paymentMethod,
          reference: e.reference,
          notes: e.notes,
          description: e.description,
          recordId: e.recordId,
        })),
      totals: {
        totalDebit,
        totalCredit,
        outstanding,
        entryCount: entries.length,
      },
    },
  }
}

/* ------------------------------ Settings ---------------------------- */

export async function getSettings(): Promise<{ settings: Record<string, unknown> }> {
  return { settings: {} }
}

export async function saveSetting(_key: string, _value: unknown): Promise<{ ok: boolean }> {
  return { ok: true }
}

/* -------------------------------------------------------------------------- */
/* DELALA — External Broker Management System API                             */
/* -------------------------------------------------------------------------- */

export interface Broker {
  id: string
  storeId?: string | null
  fullName: string
  phone?: string | null
  alternativePhone?: string | null
  businessName?: string | null
  location?: string | null
  website?: string | null
  referenceNumber?: string | null
  notes?: string | null
  status: 'active' | 'inactive' | 'suspended'
  createdBy?: string | null
  createdAt: string
  updatedAt: string
  currentBalance: number
  transactionCount: number
  accountId: string
}

export type DelalaTransactionType =
  | 'goods_given'
  | 'goods_returned'
  | 'money_received'
  | 'money_paid'
  | 'direct_sale'
  | 'commission'
  | 'adjustment'

export interface DelalaTransaction {
  id: string
  accountId: string
  brokerId: string
  storeId?: string | null
  transactionType: DelalaTransactionType
  description: string
  productId?: string | null
  quantity?: number | null
  unit?: string | null
  unitPrice?: number | null
  amount: number
  accountingEffect: -1 | 1
  transactionDate: string
  paymentMethod?: string | null
  referenceNumber?: string | null
  notes?: string | null
  createdBy?: string | null
  createdAt: string
  updatedAt: string
  rowTotal: number
}

export interface DelalaDashboardStats {
  totalBrokers: number
  activeBrokers: number
  totalReceivables: number // Positive balances (brokers owe store)
  totalPayables: number    // Negative balances (store owes brokers)
  netBalance: number
  totalTransactions: number
}

export async function getBrokers(storeId?: string): Promise<Broker[]> {
  const sql = getSql()
  const rows = await sql`
    SELECT
      b.id,
      b.store_id,
      b.full_name,
      b.phone,
      b.alternative_phone,
      b.business_name,
      b.location,
      b.website,
      b.reference_number,
      b.notes,
      b.status,
      b.created_by,
      b.created_at,
      b.updated_at,
      COALESCE(a.id, b.id) as account_id,
      COALESCE(a.current_balance, 0) as current_balance,
      COUNT(t.id) as transaction_count
    FROM brokers b
    LEFT JOIN delala_accounts a ON a.broker_id = b.id
    LEFT JOIN delala_transactions t ON t.account_id = a.id
    GROUP BY b.id, b.store_id, b.full_name, b.phone, b.alternative_phone, b.business_name,
             b.location, b.website, b.reference_number, b.notes, b.status, b.created_by,
             b.created_at, b.updated_at, a.id, a.current_balance
    ORDER BY b.created_at ASC
  `

  return rows.map((r: any) => ({
    id: String(r.id),
    storeId: r.store_id ? String(r.store_id) : null,
    fullName: String(r.full_name || 'Delala Broker'),
    phone: r.phone ? String(r.phone) : null,
    alternativePhone: r.alternative_phone ? String(r.alternative_phone) : null,
    businessName: r.business_name ? String(r.business_name) : null,
    location: r.location ? String(r.location) : null,
    website: r.website ? String(r.website) : null,
    referenceNumber: r.reference_number ? String(r.reference_number) : null,
    notes: r.notes ? String(r.notes) : null,
    status: (r.status || 'active') as 'active' | 'inactive' | 'suspended',
    createdBy: r.created_by ? String(r.created_by) : null,
    createdAt: String(r.created_at || ''),
    updatedAt: String(r.updated_at || ''),
    currentBalance: Number(r.current_balance) || 0,
    transactionCount: Number(r.transaction_count) || 0,
    accountId: String(r.account_id),
  }))
}

export async function createBroker(data: {
  fullName: string
  phone?: string
  alternativePhone?: string
  businessName?: string
  location?: string
  website?: string
  referenceNumber?: string
  notes?: string
  storeId?: string
}): Promise<Broker> {
  const sql = getSql()
  const cleanName = data.fullName.trim()
  if (!cleanName) throw new ApiError(400, 'Broker full name is required')

  const inserted = await sql`
    INSERT INTO brokers (
      full_name, phone, alternative_phone, business_name, location,
      website, reference_number, notes, store_id, status
    ) VALUES (
      ${cleanName},
      ${data.phone?.trim() || null},
      ${data.alternativePhone?.trim() || null},
      ${data.businessName?.trim() || null},
      ${data.location?.trim() || null},
      ${data.website?.trim() || null},
      ${data.referenceNumber?.trim() || null},
      ${data.notes?.trim() || null},
      ${data.storeId || null},
      'active'
    )
    RETURNING id, full_name, phone, alternative_phone, business_name, location, website, reference_number, notes, status, created_at, updated_at
  `
  const b = inserted[0]

  // Create associated account
  const acc = await sql`
    INSERT INTO delala_accounts (broker_id, store_id, account_name, current_balance)
    VALUES (${b.id}, ${data.storeId || null}, ${cleanName + ' Account'}, 0.00)
    RETURNING id
  `

  return {
    id: String(b.id),
    storeId: data.storeId || null,
    fullName: String(b.full_name),
    phone: b.phone ? String(b.phone) : null,
    alternativePhone: b.alternative_phone ? String(b.alternative_phone) : null,
    businessName: b.business_name ? String(b.business_name) : null,
    location: b.location ? String(b.location) : null,
    website: b.website ? String(b.website) : null,
    referenceNumber: b.reference_number ? String(b.reference_number) : null,
    notes: b.notes ? String(b.notes) : null,
    status: 'active',
    createdAt: String(b.created_at),
    updatedAt: String(b.updated_at),
    currentBalance: 0,
    transactionCount: 0,
    accountId: String(acc[0].id),
  }
}

export async function updateBroker(
  id: string,
  data: {
    fullName?: string
    phone?: string
    alternativePhone?: string
    businessName?: string
    location?: string
    website?: string
    referenceNumber?: string
    notes?: string
    status?: 'active' | 'inactive' | 'suspended'
  }
): Promise<{ ok: boolean }> {
  const sql = getSql()
  await sql`
    UPDATE brokers
    SET
      full_name = COALESCE(${data.fullName ? data.fullName.trim() : null}, full_name),
      phone = ${data.phone !== undefined ? data.phone.trim() : null},
      alternative_phone = ${data.alternativePhone !== undefined ? data.alternativePhone.trim() : null},
      business_name = ${data.businessName !== undefined ? data.businessName.trim() : null},
      location = ${data.location !== undefined ? data.location.trim() : null},
      website = ${data.website !== undefined ? data.website.trim() : null},
      reference_number = ${data.referenceNumber !== undefined ? data.referenceNumber.trim() : null},
      notes = ${data.notes !== undefined ? data.notes.trim() : null},
      status = COALESCE(${data.status || null}, status),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ${id}
  `

  if (data.fullName) {
    await sql`
      UPDATE delala_accounts
      SET account_name = ${data.fullName.trim() + ' Account'}, updated_at = CURRENT_TIMESTAMP
      WHERE broker_id = ${id}
    `
  }

  return { ok: true }
}

export async function deleteBroker(id: string): Promise<{ ok: boolean }> {
  const sql = getSql()
  await sql`DELETE FROM brokers WHERE id = ${id}`
  return { ok: true }
}

export async function getDelalaTransactions(brokerId?: string): Promise<{
  broker?: Broker
  transactions: DelalaTransaction[]
  totalBalance: number
}> {
  const sql = getSql()
  let broker: Broker | undefined

  if (brokerId) {
    const brokers = await getBrokers()
    broker = brokers.find((b) => b.id === brokerId)
  }

  const rawTx = brokerId
    ? await sql`
        SELECT * FROM delala_transactions
        WHERE broker_id = ${brokerId}
        ORDER BY transaction_date ASC, created_at ASC
      `
    : await sql`
        SELECT * FROM delala_transactions
        ORDER BY transaction_date ASC, created_at ASC
      `

  let totalBalance = 0
  const transactions: DelalaTransaction[] = rawTx.map((row: any) => {
    const amount = Number(row.amount) || 0
    const effect = (Number(row.accounting_effect) === -1 ? -1 : 1) as -1 | 1
    const rowTotal = amount * effect
    totalBalance += rowTotal

    return {
      id: String(row.id),
      accountId: String(row.account_id),
      brokerId: String(row.broker_id),
      storeId: row.store_id ? String(row.store_id) : null,
      transactionType: row.transaction_type as DelalaTransactionType,
      description: String(row.description || ''),
      productId: row.product_id ? String(row.product_id) : null,
      quantity: row.quantity !== null ? Number(row.quantity) : null,
      unit: row.unit ? String(row.unit) : null,
      unitPrice: row.unit_price !== null ? Number(row.unit_price) : null,
      amount,
      accountingEffect: effect,
      transactionDate: String(row.transaction_date || new Date().toISOString().split('T')[0]),
      paymentMethod: row.payment_method ? String(row.payment_method) : null,
      referenceNumber: row.reference_number ? String(row.reference_number) : null,
      notes: row.notes ? String(row.notes) : null,
      createdBy: row.created_by ? String(row.created_by) : null,
      createdAt: String(row.created_at || ''),
      updatedAt: String(row.updated_at || ''),
      rowTotal,
    }
  })

  return {
    broker,
    transactions,
    totalBalance,
  }
}

export async function createDelalaTransaction(data: {
  brokerId: string
  accountId?: string
  storeId?: string
  transactionType: DelalaTransactionType
  description: string
  productId?: string
  quantity?: number
  unit?: string
  unitPrice?: number
  amount: number
  accountingEffect?: -1 | 1
  transactionDate?: string
  paymentMethod?: string
  referenceNumber?: string
  notes?: string
}): Promise<DelalaTransaction> {
  const sql = getSql()

  // Resolve account_id if omitted
  let accountId = data.accountId
  if (!accountId) {
    const acc = await sql`SELECT id FROM delala_accounts WHERE broker_id = ${data.brokerId} LIMIT 1`
    if (acc.length > 0) {
      accountId = acc[0].id
    } else {
      const newAcc = await sql`
        INSERT INTO delala_accounts (broker_id, account_name, current_balance)
        VALUES (${data.brokerId}, 'Delala Account', 0.00)
        RETURNING id
      `
      accountId = newAcc[0].id
    }
  }

  // Determine accounting effect according to official Delala accounting rules:
  // Positive (+1): Broker owes the store
  // Negative (-1): Store owes the broker / Broker paid
  let effect: -1 | 1 = 1
  if (data.accountingEffect !== undefined) {
    effect = data.accountingEffect
  } else {
    switch (data.transactionType) {
      case 'goods_given':
      case 'money_paid':
      case 'direct_sale':
        effect = 1
        break
      case 'goods_returned':
      case 'money_received':
      case 'commission':
        effect = -1
        break
      case 'adjustment':
      default:
        effect = 1
        break
    }
  }

  const txDate = data.transactionDate || new Date().toISOString().split('T')[0]
  const inserted = await sql`
    INSERT INTO delala_transactions (
      account_id, broker_id, store_id, transaction_type, description,
      product_id, quantity, unit, unit_price, amount, accounting_effect,
      transaction_date, payment_method, reference_number, notes
    ) VALUES (
      ${accountId},
      ${data.brokerId},
      ${data.storeId || null},
      ${data.transactionType},
      ${data.description.trim()},
      ${data.productId || null},
      ${data.quantity || null},
      ${data.unit || null},
      ${data.unitPrice || null},
      ${data.amount},
      ${effect},
      ${txDate},
      ${data.paymentMethod || null},
      ${data.referenceNumber || null},
      ${data.notes || null}
    )
    RETURNING *
  `
  const row = inserted[0]

  // Automatically recalculate and sync account balance
  await sql`
    UPDATE delala_accounts
    SET current_balance = (
      SELECT COALESCE(SUM(amount * accounting_effect), 0)
      FROM delala_transactions
      WHERE account_id = ${accountId}
    ), updated_at = CURRENT_TIMESTAMP
    WHERE id = ${accountId}
  `

  return {
    id: String(row.id),
    accountId: String(row.account_id),
    brokerId: String(row.broker_id),
    storeId: row.store_id ? String(row.store_id) : null,
    transactionType: row.transaction_type as DelalaTransactionType,
    description: String(row.description),
    productId: row.product_id ? String(row.product_id) : null,
    quantity: row.quantity !== null ? Number(row.quantity) : null,
    unit: row.unit ? String(row.unit) : null,
    unitPrice: row.unit_price !== null ? Number(row.unit_price) : null,
    amount: Number(row.amount),
    accountingEffect: effect,
    transactionDate: String(row.transaction_date),
    paymentMethod: row.payment_method ? String(row.payment_method) : null,
    referenceNumber: row.reference_number ? String(row.reference_number) : null,
    notes: row.notes ? String(row.notes) : null,
    createdBy: row.created_by ? String(row.created_by) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    rowTotal: Number(row.amount) * effect,
  }
}

export async function updateDelalaTransaction(
  id: string,
  data: {
    transactionType?: DelalaTransactionType
    description?: string
    productId?: string
    quantity?: number
    unit?: string
    unitPrice?: number
    amount?: number
    accountingEffect?: -1 | 1
    transactionDate?: string
    paymentMethod?: string
    referenceNumber?: string
    notes?: string
  }
): Promise<{ ok: boolean }> {
  const sql = getSql()

  const existing = await sql`SELECT account_id, accounting_effect, transaction_type FROM delala_transactions WHERE id = ${id}`
  if (existing.length === 0) throw new ApiError(404, 'Transaction not found')

  const accountId = existing[0].account_id
  let effect = data.accountingEffect
  if (effect === undefined && data.transactionType) {
    switch (data.transactionType) {
      case 'goods_given':
      case 'money_paid':
      case 'direct_sale':
        effect = 1
        break
      case 'goods_returned':
      case 'money_received':
      case 'commission':
        effect = -1
        break
      default:
        effect = existing[0].accounting_effect
    }
  }

  await sql`
    UPDATE delala_transactions
    SET
      transaction_type = COALESCE(${data.transactionType || null}, transaction_type),
      description = COALESCE(${data.description ? data.description.trim() : null}, description),
      product_id = ${data.productId !== undefined ? data.productId : null},
      quantity = ${data.quantity !== undefined ? data.quantity : null},
      unit = ${data.unit !== undefined ? data.unit : null},
      unit_price = ${data.unitPrice !== undefined ? data.unitPrice : null},
      amount = COALESCE(${data.amount !== undefined ? data.amount : null}, amount),
      accounting_effect = COALESCE(${effect !== undefined ? effect : null}, accounting_effect),
      transaction_date = COALESCE(${data.transactionDate || null}, transaction_date),
      payment_method = ${data.paymentMethod !== undefined ? data.paymentMethod : null},
      reference_number = ${data.referenceNumber !== undefined ? data.referenceNumber : null},
      notes = ${data.notes !== undefined ? data.notes : null},
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ${id}
  `

  // Recalculate balance
  await sql`
    UPDATE delala_accounts
    SET current_balance = (
      SELECT COALESCE(SUM(amount * accounting_effect), 0)
      FROM delala_transactions
      WHERE account_id = ${accountId}
    ), updated_at = CURRENT_TIMESTAMP
    WHERE id = ${accountId}
  `

  return { ok: true }
}

export async function deleteDelalaTransaction(id: string): Promise<{ ok: boolean }> {
  const sql = getSql()
  const existing = await sql`SELECT account_id FROM delala_transactions WHERE id = ${id}`
  if (existing.length === 0) return { ok: true }
  const accountId = existing[0].account_id

  await sql`DELETE FROM delala_transactions WHERE id = ${id}`

  // Recalculate balance
  await sql`
    UPDATE delala_accounts
    SET current_balance = (
      SELECT COALESCE(SUM(amount * accounting_effect), 0)
      FROM delala_transactions
      WHERE account_id = ${accountId}
    ), updated_at = CURRENT_TIMESTAMP
    WHERE id = ${accountId}
  `

  return { ok: true }
}

export async function getDelalaDashboardStats(): Promise<DelalaDashboardStats> {
  const brokers = await getBrokers()
  let totalReceivables = 0
  let totalPayables = 0
  let totalTransactions = 0
  let activeBrokers = 0

  for (const b of brokers) {
    if (b.status === 'active') activeBrokers++
    totalTransactions += b.transactionCount
    if (b.currentBalance > 0) {
      totalReceivables += b.currentBalance
    } else {
      totalPayables += Math.abs(b.currentBalance)
    }
  }

  return {
    totalBrokers: brokers.length,
    activeBrokers,
    totalReceivables,
    totalPayables,
    netBalance: totalReceivables - totalPayables,
    totalTransactions,
  }
}

/* ============================================================================
   DELALA SPREADSHEET ENTRIES API
   ============================================================================ */
export interface DelalaEntry {
  id: string
  delalaName: string
  productName: string
  unitPrice: number
  pieces: number
  sign: 1 | -1
  total: number
  transactionDate: string
  storeId?: string
  createdAt?: string
  updatedAt?: string
}

export function cleanDelalaName(name: string): string {
  return name.replace(/^(delala|ደላላ)\s+/i, '').trim()
}

export async function getDelalaEntries(storeId?: string): Promise<DelalaEntry[]> {
  const sql = getSql()
  const rows = storeId && storeId !== 'all'
    ? await sql`
        SELECT id, delala_name, product_name, unit_price, pieces, sign, total, transaction_date, store_id, created_at, updated_at
        FROM delala_entries
        WHERE store_id = ${storeId} OR store_id IS NULL
        ORDER BY created_at ASC
      `
    : await sql`
        SELECT id, delala_name, product_name, unit_price, pieces, sign, total, transaction_date, store_id, created_at, updated_at
        FROM delala_entries
        ORDER BY created_at ASC
      `

  return rows.map((r: any) => ({
    id: String(r.id),
    delalaName: cleanDelalaName(String(r.delala_name || '')),
    productName: String(r.product_name || ''),
    unitPrice: Number(r.unit_price) || 0,
    pieces: Number(r.pieces) || 0,
    sign: (Number(r.sign) === -1 ? -1 : 1) as 1 | -1,
    total: Number(r.total) || 0,
    transactionDate: String(r.transaction_date || ''),
    storeId: r.store_id ? String(r.store_id) : undefined,
    createdAt: r.created_at ? String(r.created_at) : undefined,
    updatedAt: r.updated_at ? String(r.updated_at) : undefined,
  }))
}

export async function createDelalaEntry(data: {
  delalaName: string
  productName: string
  unitPrice: number
  pieces: number
  sign: 1 | -1
  transactionDate: string
  storeId?: string
}): Promise<DelalaEntry> {
  const sql = getSql()
  const cleanName = cleanDelalaName(data.delalaName)
  const cleanProduct = data.productName.trim()
  if (!cleanName) throw new ApiError(400, 'Name is required')
  if (!cleanProduct) throw new ApiError(400, 'Product name is required')

  const sign = data.sign === -1 ? -1 : 1
  const price = Number(data.unitPrice) || 0
  const pieces = Number(data.pieces) || 0
  const total = Number((price * pieces * sign).toFixed(2))
  const date = data.transactionDate.trim() || new Date().toISOString().split('T')[0]

  const inserted = await sql`
    INSERT INTO delala_entries (
      delala_name, product_name, unit_price, pieces, sign, total, transaction_date, store_id
    ) VALUES (
      ${cleanName}, ${cleanProduct}, ${price}, ${pieces}, ${sign}, ${total}, ${date}, ${data.storeId || 'shop_1'}
    )
    RETURNING *
  `

  const r = inserted[0]
  return {
    id: String(r.id),
    delalaName: cleanDelalaName(String(r.delala_name)),
    productName: String(r.product_name),
    unitPrice: Number(r.unit_price),
    pieces: Number(r.pieces),
    sign: Number(r.sign) as 1 | -1,
    total: Number(r.total),
    transactionDate: String(r.transaction_date),
    storeId: r.store_id ? String(r.store_id) : undefined,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  }
}

export async function updateDelalaEntry(
  id: string,
  data: {
    delalaName?: string
    productName?: string
    unitPrice?: number
    pieces?: number
    sign?: 1 | -1
    transactionDate?: string
    storeId?: string
  }
): Promise<DelalaEntry> {
  const sql = getSql()
  const existing = await sql`SELECT * FROM delala_entries WHERE id = ${id}`
  if (!existing.length) throw new ApiError(404, 'Delala entry not found')
  const cur = existing[0]

  const delalaName = data.delalaName !== undefined ? cleanDelalaName(data.delalaName) : cur.delala_name
  const productName = data.productName !== undefined ? data.productName.trim() : cur.product_name
  const unitPrice = data.unitPrice !== undefined ? Number(data.unitPrice) : Number(cur.unit_price)
  const pieces = data.pieces !== undefined ? Number(data.pieces) : Number(cur.pieces)
  const sign = data.sign !== undefined ? (data.sign === -1 ? -1 : 1) : Number(cur.sign)
  const total = Number((unitPrice * pieces * sign).toFixed(2))
  const transactionDate = data.transactionDate !== undefined ? data.transactionDate.trim() : cur.transaction_date
  const storeId = data.storeId !== undefined ? data.storeId : cur.store_id

  const updated = await sql`
    UPDATE delala_entries
    SET delala_name = ${delalaName},
        product_name = ${productName},
        unit_price = ${unitPrice},
        pieces = ${pieces},
        sign = ${sign},
        total = ${total},
        transaction_date = ${transactionDate},
        store_id = ${storeId},
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ${id}
    RETURNING *
  `

  const r = updated[0]
  return {
    id: String(r.id),
    delalaName: cleanDelalaName(String(r.delala_name)),
    productName: String(r.product_name),
    unitPrice: Number(r.unit_price),
    pieces: Number(r.pieces),
    sign: Number(r.sign) as 1 | -1,
    total: Number(r.total),
    transactionDate: String(r.transaction_date),
    storeId: r.store_id ? String(r.store_id) : undefined,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  }
}

export async function deleteDelalaEntry(id: string): Promise<{ ok: boolean }> {
  const sql = getSql()
  await sql`DELETE FROM delala_entries WHERE id = ${id}`
  return { ok: true }
}



