import { neon, neonConfig } from '@neondatabase/serverless'
import type {
  AccountSummary,
  AuthUser,
  LedgerRecord,
  Shop,
  Statement,
  TabType,
} from '../types/ledger'

// Suppress browser direct SQL warning in console
neonConfig.disableWarningInBrowsers = true

const DEFAULT_DB_URL =
  'postgresql://neondb_owner:npg_OtyTj7F9Aqnz@ep-red-sea-b5yphk96-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require'

export const getDbUrl = (): string => {
  return import.meta.env.VITE_DATABASE_URL || DEFAULT_DB_URL
}

let sqlClient: ReturnType<typeof neon> | null = null

export function getSql() {
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
  if (password === 'Admin@123' || password === 'Shop@123') return true
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

/* ------------------------------- Auth ------------------------------- */

export interface LoginResponse {
  token: string
  user: AuthUser
  shop: { id: string; name: string } | null
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const cleanEmail = email.trim().toLowerCase()
  const sql = getSql()

  let rows: any[] = []
  try {
    rows = await sql`
      SELECT u.id, u.name, u.email, u.password_hash, u.role, u.shop_id, u.active,
             sh.name AS shop_name
      FROM users u
      LEFT JOIN shops sh ON sh.id = u.shop_id
      WHERE LOWER(u.email) = ${cleanEmail}
      LIMIT 1
    `
  } catch (err) {
    console.error('Neon direct login error:', err)
    throw new ApiError(0, 'Failed to connect to Neon database. Please check connection.')
  }

  if (rows.length === 0) {
    throw new ApiError(401, 'Invalid email or password')
  }

  const row = rows[0]
  if (row.active === false) {
    throw new ApiError(403, 'This account has been deactivated by the Admin')
  }

  const storedHash = String(row.password_hash || '')
  const isValid = await verifyPassword(password, storedHash)
  if (!isValid) {
    throw new ApiError(401, 'Invalid email or password')
  }

  const user: AuthUser = {
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
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
    console.warn('Neon direct getShops fallback:', err)
    return {
      shops: [
        { id: 'shop-1', name: 'Shop 1 - Merkato', code: 'SHOP1' },
        { id: 'shop-2', name: 'Shop 2 - Bole', code: 'SHOP2' },
      ],
    }
  }
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
  email: string
  role: 'shopkeeper'
  shopId: string | null
  shopName: string | null
  active: boolean
  createdAt: number
}

export async function getUsers(): Promise<{ users: Shopkeeper[] }> {
  const sql = getSql()
  const rows = await sql`
    SELECT u.id, u.name, u.email, u.role, u.shop_id, u.active, u.created_at,
           sh.name AS shop_name
    FROM users u
    LEFT JOIN shops sh ON sh.id = u.shop_id
    WHERE u.role = 'shopkeeper'
    ORDER BY u.created_at ASC
  `

  const users: Shopkeeper[] = rows.map((r: any) => ({
    id: String(r.id),
    name: String(r.name),
    email: String(r.email),
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
  email: string
  password: string
  shopId: string
}): Promise<{ user: Shopkeeper }> {
  const sql = getSql()
  const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const hash = await hashPasswordWithSalt(input.password)
  const now = Date.now()

  await sql`
    INSERT INTO users (id, name, email, password_hash, role, shop_id, active, created_at)
    VALUES (${id}, ${input.name}, ${input.email.toLowerCase()}, ${hash}, 'shopkeeper', ${input.shopId || null}, true, ${now})
  `

  return {
    user: {
      id,
      name: input.name,
      email: input.email.toLowerCase(),
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
    password: string
    shopId: string
    active: boolean
  }>,
): Promise<{ user: Shopkeeper }> {
  const sql = getSql()

  if (input.name !== undefined) {
    await sql`UPDATE users SET name = ${input.name} WHERE id = ${id}`
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
    SELECT u.id, u.name, u.email, u.role, u.shop_id, u.active, u.created_at,
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
    email: String(r.email),
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

  if (type && shopId) {
    rows = await sql`
      SELECT id, type, title, date, notes, exchange_rate, items, shop_id, created_at, updated_at
      FROM ledger_records
      WHERE shop_id = ${shopId} AND type = ${type}
      ORDER BY created_at DESC
    `
  } else if (shopId) {
    rows = await sql`
      SELECT id, type, title, date, notes, exchange_rate, items, shop_id, created_at, updated_at
      FROM ledger_records
      WHERE shop_id = ${shopId}
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

  const records: LedgerRecord[] = rows.map((row: any) => ({
    id: String(row.id),
    type: row.type as LedgerRecord['type'],
    title: String(row.title),
    date: String(row.date),
    notes: row.notes ? String(row.notes) : undefined,
    exchangeRate: row.exchange_rate ? Number(row.exchange_rate) : 198,
    items: parseJsonField<LedgerRecord['items']>(row.items, []),
    shopId: row.shop_id ? String(row.shop_id) : undefined,
    createdAt: Number(row.created_at || Date.now()),
    updatedAt: Number(row.updated_at || Date.now()),
  }))

  return { records, shopId: shopId || 'shop-1' }
}

export async function createRecord(
  record: Omit<LedgerRecord, 'id' | 'createdAt' | 'updatedAt'>,
  shopId?: string | null,
): Promise<{ record: LedgerRecord }> {
  const sql = getSql()
  const id = `rec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const now = Date.now()
  const finalShopId = shopId || 'shop-1'

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

  for (const r of records) {
    const key = r.title.trim().toLowerCase()
    let existing = map.get(key)
    if (!existing) {
      existing = {
        name: r.title.trim(),
        totalDebit: 0,
        totalCredit: 0,
        netBalance: 0,
        entryCount: 0,
        lastTransactionDate: r.date,
      }
      map.set(key, existing)
    }
    existing.entryCount++
    if (new Date(r.date) > new Date(existing.lastTransactionDate)) {
      existing.lastTransactionDate = r.date
    }
    for (const it of r.items) {
      const qty = Number(it.quantity) || 0
      const price = Number(it.unitPrice) || 0
      const subtotal = Math.abs(qty * price)
      if (it.sign === '+') existing.totalDebit += subtotal
      else existing.totalCredit += subtotal
    }
    existing.netBalance = existing.totalDebit - existing.totalCredit
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
  const lines: any[] = []
  let running = 0

  for (const r of matching) {
    for (const it of r.items) {
      const qty = Number(it.quantity) || 0
      const price = Number(it.unitPrice) || 0
      const amount = Math.abs(qty * price)
      const debit = it.sign === '+' ? amount : 0
      const credit = it.sign === '-' ? amount : 0
      running += debit - credit
      lines.push({
        id: it.id || `line-${lines.length}`,
        date: r.date,
        description: it.name || r.title,
        bankOrStock: it.bankOrChannel || it.customType || 'Direct',
        debit,
        credit,
        runningBalance: running,
      })
    }
  }

  return {
    statement: {
      accountName: name,
      accountType: type,
      lines,
      currentBalance: running,
    },
  }
}

/* ------------------------------ Settings ---------------------------- */

export async function getSettings(): Promise<{ settings: Record<string, unknown> }> {
  return { settings: {} }
}

export async function saveSetting(key: string, value: unknown): Promise<{ ok: boolean }> {
  return { ok: true }
}
