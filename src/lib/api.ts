import {
  calculateAccountBalances,
  buildTransactionLineItem,
  validateTransaction,
  type CreditTransactionParams,
  type AccountCreditStats,
} from './creditAccounting.ts'
import { neon, neonConfig } from '@neondatabase/serverless'
import type { NeonQueryFunction } from '@neondatabase/serverless'
import type {
  AccountSummary,
  AuthUser,
  LedgerRecord,
  LineItem,
  Store,
  Statement,
  StatementEntry,
  TabType,
} from '../types/ledger.ts'

const DEFAULT_DB_URL =
  'postgresql://neondb_owner:npg_OtyTj7F9Aqnz@ep-red-sea-b5yphk96-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require'

export const getDbUrl = (): string => {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_DATABASE_URL) {
    return import.meta.env.VITE_DATABASE_URL
  }
  if (typeof process !== 'undefined' && (process.env?.VITE_DATABASE_URL || process.env?.DATABASE_URL)) {
    return (process.env.VITE_DATABASE_URL || process.env.DATABASE_URL)!
  }
  return DEFAULT_DB_URL
}

// In browsers, route SQL queries through the same-origin `/api/sql` proxy to eliminate CORS restrictions
neonConfig.disableWarningInBrowsers = true
neonConfig.fetchEndpoint = (host: string) => {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/sql`
  }
  return `https://${host}/sql`
}

let sqlClient: NeonQueryFunction<false, false> | null = null

export function getSql(): NeonQueryFunction<false, false> {
  if (!sqlClient) {
    sqlClient = neon(getDbUrl(), {
      disableWarningInBrowsers: true,
    })
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
  store: { id: string; name: string } | null
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
      SELECT u.id, u.name, u.email, u.phone, u.password_hash, u.role, u.store_id, u.active,
             sh.name AS store_name
      FROM users u
      LEFT JOIN stores sh ON sh.id = u.store_id
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
    role: row.role === 'admin' ? 'admin' : 'storekeeper',
    storeId: row.store_id ? String(row.store_id) : null,
    storeName: row.store_name ? String(row.store_name) : null,
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
    store: user.storeId ? { id: user.storeId, name: user.storeName || '' } : null,
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

/* ------------------------------- Stores ------------------------------ */

/**
 * Reads the store list straight from the database.
 * There is no local/mock fallback: a failed query is surfaced as an error.
 */
export async function getStores(): Promise<{ stores: Store[] }> {
  const sql = getSql()
  try {
    const rows = await sql`SELECT id, name, code FROM stores ORDER BY name ASC`
    const stores: Store[] = rows.map((r: any) => ({
      id: String(r.id),
      name: String(r.name),
      code: String(r.code || ''),
    }))
    return { stores }
  } catch (err) {
    console.error('Neon getStores failed:', err)
    throw new ApiError(0, 'Could not load stores from the database')
  }
}

/** id -> name lookup used to replace any hardcoded store name. */
async function getStoreNameMap(): Promise<Map<string, string>> {
  const { stores } = await getStores()
  return new Map(stores.map((store) => [store.id, store.name]))
}

/**
 * Resolves the store a record should be written to.
 * When no concrete store is selected ("all" / none) the first store in the
 * database is used; if the database has no store at all, this fails instead
 * of silently inventing one.
 */
async function resolveStoreId(storeId?: string | null): Promise<string> {
  if (storeId && storeId !== 'all') return storeId
  const { stores } = await getStores()
  if (stores.length === 0) {
    throw new ApiError(400, 'No store exists yet — create a store before saving records')
  }
  return stores[0].id
}

export async function createStore(name: string, code?: string): Promise<{ store: Store }> {
  const sql = getSql()
  const id = `store-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const finalCode = (code || name.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30)).toUpperCase()
  const now = Date.now()

  await sql`
    INSERT INTO stores (id, name, code, created_at)
    VALUES (${id}, ${name}, ${finalCode}, ${now})
  `

  return { store: { id, name, code: finalCode } }
}

export async function deleteStore(id: string): Promise<{ ok: boolean; deleted: string; name: string }> {
  const sql = getSql()
  const existing = await sql`SELECT id, name FROM stores WHERE id = ${id} LIMIT 1`
  const name = existing[0]?.name ? String(existing[0].name) : id

  await sql`DELETE FROM ledger_records WHERE store_id = ${id} OR shop_id = ${id}`
  await sql`UPDATE users SET store_id = NULL, shop_id = NULL WHERE store_id = ${id} OR shop_id = ${id}`
  await sql`DELETE FROM stores WHERE id = ${id}`

  return { ok: true, deleted: id, name }
}

// Backward compatibility aliases for older clients querying shops
export const getShops = getStores
export const createShop = createStore
export const deleteShop = deleteStore

/* ------------------------------- Users ------------------------------ */

export interface Storekeeper {
  id: string
  name: string
  phone: string
  email?: string
  role: 'storekeeper'
  storeId: string | null
  storeName: string | null
  active: boolean
  createdAt: number
}

export async function getUsers(): Promise<{ users: Storekeeper[] }> {
  const sql = getSql()
  const rows = await sql`
    SELECT u.id, u.name, u.email, u.phone, u.role, u.store_id, u.active, u.created_at,
           sh.name AS store_name
    FROM users u
    LEFT JOIN stores sh ON sh.id = u.store_id
    WHERE u.role = 'storekeeper'
    ORDER BY u.created_at ASC
  `

  const users: Storekeeper[] = rows.map((r: any) => ({
    id: String(r.id),
    name: String(r.name),
    phone: r.phone ? String(r.phone) : '',
    email: r.email ? String(r.email) : undefined,
    role: 'storekeeper',
    storeId: r.store_id ? String(r.store_id) : null,
    storeName: r.store_name ? String(r.store_name) : null,
    active: r.active !== false,
    createdAt: Number(r.created_at || Date.now()),
  }))

  return { users }
}

export async function createUser(input: {
  name: string
  phone: string
  password: string
  storeId: string
}): Promise<{ user: Storekeeper }> {
  const cleanPhone = normalizePhone(input.phone)
  if (!cleanPhone) {
    throw new ApiError(400, 'Enter a valid Ethiopian phone number (e.g. 0911111111)')
  }

  const sql = getSql()

  const existing = await sql`SELECT id FROM users WHERE phone = ${cleanPhone} LIMIT 1`
  if (existing.length > 0) {
    throw new ApiError(409, `A storekeeper with phone ${cleanPhone} already exists`)
  }

  const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const hash = await hashPasswordWithSalt(input.password)
  const now = Date.now()

  await sql`
    INSERT INTO users (id, name, email, phone, password_hash, role, store_id, active, created_at)
    VALUES (${id}, ${input.name}, NULL, ${cleanPhone}, ${hash}, 'storekeeper', ${input.storeId || null}, true, ${now})
  `

  return {
    user: {
      id,
      name: input.name,
      phone: cleanPhone,
      role: 'storekeeper',
      storeId: input.storeId || null,
      storeName: null,
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
    storeId: string
    active: boolean
  }>,
): Promise<{ user: Storekeeper }> {
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
      throw new ApiError(409, `Another storekeeper already uses phone ${cleanPhone}`)
    }
    await sql`UPDATE users SET phone = ${cleanPhone} WHERE id = ${id}`
  }
  if (input.storeId !== undefined) {
    await sql`UPDATE users SET store_id = ${input.storeId} WHERE id = ${id}`
  }
  if (input.active !== undefined) {
    await sql`UPDATE users SET active = ${input.active} WHERE id = ${id}`
  }
  if (input.password) {
    const hash = await hashPasswordWithSalt(input.password)
    await sql`UPDATE users SET password_hash = ${hash} WHERE id = ${id}`
  }

  const rows = await sql`
    SELECT u.id, u.name, u.email, u.phone, u.role, u.store_id, u.active, u.created_at,
           sh.name AS store_name
    FROM users u
    LEFT JOIN stores sh ON sh.id = u.store_id
    WHERE u.id = ${id}
    LIMIT 1
  `

  const r = rows[0]
  const user: Storekeeper = {
    id: String(r.id),
    name: String(r.name),
    phone: r.phone ? String(r.phone) : '',
    email: r.email ? String(r.email) : undefined,
    role: 'storekeeper',
    storeId: r.store_id ? String(r.store_id) : null,
    storeName: r.store_name ? String(r.store_name) : null,
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
  storeId?: string | null,
): Promise<{ records: LedgerRecord[]; storeId: string }> {
  const sql = getSql()
  let rows: any[] = []
  const filterStoreId = storeId && storeId !== 'all' ? storeId : null

  if (type && filterStoreId) {
    rows = await sql`
      SELECT id, type, title, date, notes, exchange_rate, items, store_id, created_at, updated_at
      FROM ledger_records
      WHERE (store_id = ${filterStoreId} OR shop_id = ${filterStoreId}) AND type = ${type}
      ORDER BY created_at DESC
    `
  } else if (filterStoreId) {
    rows = await sql`
      SELECT id, type, title, date, notes, exchange_rate, items, store_id, created_at, updated_at
      FROM ledger_records
      WHERE (store_id = ${filterStoreId} OR shop_id = ${filterStoreId})
      ORDER BY created_at DESC
    `
  } else if (type) {
    rows = await sql`
      SELECT id, type, title, date, notes, exchange_rate, items, store_id, created_at, updated_at
      FROM ledger_records
      WHERE type = ${type}
      ORDER BY created_at DESC
    `
  } else {
    rows = await sql`
      SELECT id, type, title, date, notes, exchange_rate, items, store_id, created_at, updated_at
      FROM ledger_records
      ORDER BY created_at DESC
    `
  }

  // Real store names come from the stores table — never hardcoded.
  const storeNames = await getStoreNameMap()

  const records: LedgerRecord[] = rows.map((row: any) => {
    const sId = row.store_id ? String(row.store_id) : undefined
    const sName = sId ? storeNames.get(sId) : undefined
    return {
      id: String(row.id),
      type: row.type as LedgerRecord['type'],
      title: String(row.title),
      date: String(row.date),
      notes: row.notes ? String(row.notes) : undefined,
      exchangeRate: row.exchange_rate ? Number(row.exchange_rate) : 198,
      items: parseJsonField<LedgerRecord['items']>(row.items, []),
      storeId: sId,
      storeName: sName,
      createdAt: Number(row.created_at || Date.now()),
      updatedAt: Number(row.updated_at || Date.now()),
    }
  })

  // Consolidate any records with same title and type for customer/supplier/broker accounts
  const consolidatedMap = new Map<string, LedgerRecord>()
  const finalRecords: LedgerRecord[] = []

  for (const r of records) {
    if (r.type === 'customer' || r.type === 'supplier' || r.type === 'delala') {
      const key = `${r.type}:${r.title.trim().toLowerCase()}:${r.storeId || ''}`
      const existing = consolidatedMap.get(key)
      if (existing) {
        existing.items.push(...r.items)
        if (new Date(r.date) > new Date(existing.date)) {
          existing.date = r.date
        }
      } else {
        const copy: LedgerRecord = { ...r, items: [...r.items] }
        consolidatedMap.set(key, copy)
        finalRecords.push(copy)
      }
    } else {
      finalRecords.push(r)
    }
  }

  // Also include any standalone entries from delala_entries if not already in ledger_records
  try {
    const delalaRows = filterStoreId
      ? await sql`SELECT id, delala_name, product_name, unit_price, pieces, sign, total, transaction_date, store_id FROM delala_entries WHERE (store_id = ${filterStoreId} OR store_id IS NULL) ORDER BY created_at ASC`
      : await sql`SELECT id, delala_name, product_name, unit_price, pieces, sign, total, transaction_date, store_id FROM delala_entries ORDER BY created_at ASC`

    for (const d of delalaRows) {
      const dName = cleanDelalaName(String(d.delala_name || ''))
      if (!dName) continue
      const key = `delala:${dName.toLowerCase()}:${d.store_id || ''}`
      const signNum = Number(d.sign) === -1 ? -1 : 1
      const isPayment = signNum === -1
      const dItem: LineItem = {
        id: `delala-item-${d.id}`,
        name: String(d.product_name || (isPayment ? 'Payment' : 'Goods')),
        quantity: Number(d.pieces) || 1,
        unitPrice: Number(d.unit_price) || 0,
        amount: Math.abs(Number(d.total) || 0),
        sign: isPayment ? '-' : '+',
        customType: isPayment ? 'Payment' : 'Broker Deal',
        isPayment,
        date: String(d.transaction_date || ''),
        paymentMethod: isPayment ? 'Cash' : 'Stock',
      }

      const existing = consolidatedMap.get(key)
      if (existing) {
        const hasItem = existing.items.some(
          (it) => it.id === dItem.id || (it.name === dItem.name && it.date === dItem.date && it.amount === dItem.amount)
        )
        if (!hasItem) {
          existing.items.push(dItem)
        }
      } else {
        const newBrokerRecord: LedgerRecord = {
          id: `delala-rec-${d.id}`,
          type: 'delala',
          title: dName,
          date: String(d.transaction_date || new Date().toISOString().split('T')[0]),
          exchangeRate: 198,
          items: [dItem],
          storeId: d.store_id ? String(d.store_id) : undefined,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
        consolidatedMap.set(key, newBrokerRecord)
        finalRecords.push(newBrokerRecord)
      }
    }
  } catch {
    // Delala table read optional fallback
  }

  return { records: finalRecords, storeId: filterStoreId || 'all' }
}

export async function createRecord(
  record: Omit<LedgerRecord, 'id' | 'createdAt' | 'updatedAt'>,
  storeId?: string | null,
): Promise<{ record: LedgerRecord }> {
  const sql = getSql()
  const now = Date.now()
  const finalStoreId = await resolveStoreId(storeId)

  // Smart Merge: for customer, supplier, and broker, if an account already exists with the same title in this store,
  // append the items and update instead of creating a duplicate row!
  if (record.type === 'customer' || record.type === 'supplier' || record.type === 'delala') {
    const cleanTitle = record.title.trim()
    let existingRows: any[] = []
    if (finalStoreId && finalStoreId !== 'all') {
      existingRows = await sql`
        SELECT id, type, title, date, notes, items, store_id, created_at, updated_at
        FROM ledger_records
        WHERE LOWER(TRIM(title)) = LOWER(${cleanTitle})
          AND type = ${record.type}
          AND (store_id = ${finalStoreId} OR store_id IS NULL)
        LIMIT 1
      `
    } else {
      existingRows = await sql`
        SELECT id, type, title, date, notes, items, store_id, created_at, updated_at
        FROM ledger_records
        WHERE LOWER(TRIM(title)) = LOWER(${cleanTitle})
          AND type = ${record.type}
        LIMIT 1
      `
    }

    if (existingRows.length > 0) {
      const existing = existingRows[0]
      const existingItems = parseJsonField<LedgerRecord['items']>(existing.items, [])
      const mergedItems = [...existingItems, ...record.items]
      const mergedNotes = record.notes && record.notes.trim().length > 0
        ? record.notes.trim()
        : (existing.notes || null)

      await sql`
        UPDATE ledger_records SET
          items = ${JSON.stringify(mergedItems)},
          notes = ${mergedNotes},
          date = ${record.date || existing.date},
          updated_at = ${now}
        WHERE id = ${existing.id}
      `

      return {
        record: {
          id: String(existing.id),
          type: record.type,
          title: String(existing.title),
          date: record.date || String(existing.date),
          notes: mergedNotes || undefined,
          exchangeRate: record.exchangeRate || 198,
          items: mergedItems,
          storeId: existing.store_id ? String(existing.store_id) : finalStoreId,
          createdAt: Number(existing.created_at || now),
          updatedAt: now,
        },
      }
    }
  }

  const id = `rec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  await sql`
    INSERT INTO ledger_records (
      id, type, title, date, notes, exchange_rate, items, store_id, created_at, updated_at
    ) VALUES (
      ${id},
      ${record.type},
      ${record.title},
      ${record.date},
      ${record.notes || null},
      ${record.exchangeRate || 198},
      ${JSON.stringify(record.items)},
      ${finalStoreId},
      ${now},
      ${now}
    )
  `

  return {
    record: {
      ...record,
      id,
      storeId: finalStoreId,
      createdAt: now,
      updatedAt: now,
    },
  }
}

/**
 * Record a Customer Credit or Supplier Credit transaction (Sale, Purchase, Payment, Advance, Allocation)
 * with atomic validation and smart account merging.
 */
export async function recordCreditTransaction(
  params: CreditTransactionParams,
  storeId?: string | null,
): Promise<{
  record: LedgerRecord
  stats: AccountCreditStats
}> {
  const sql = getSql()
  const cleanName = params.partyName.trim()
  if (!cleanName) {
    throw new ApiError(400, 'Party name cannot be empty')
  }
  if (params.amount <= 0) {
    throw new ApiError(400, 'Transaction amount must be greater than zero')
  }

  const finalStoreId = await resolveStoreId(storeId)

  // 1. Fetch existing account if any
  let existingRows: any[] = []
  if (finalStoreId && finalStoreId !== 'all') {
    existingRows = await sql`
      SELECT id, type, title, date, notes, items, store_id, created_at, updated_at
      FROM ledger_records
      WHERE LOWER(TRIM(title)) = LOWER(${cleanName})
        AND type = ${params.type}
        AND (store_id = ${finalStoreId} OR store_id IS NULL)
      LIMIT 1
    `
  } else {
    existingRows = await sql`
      SELECT id, type, title, date, notes, items, store_id, created_at, updated_at
      FROM ledger_records
      WHERE LOWER(TRIM(title)) = LOWER(${cleanName})
        AND type = ${params.type}
      LIMIT 1
    `
  }

  const existingItems: LineItem[] = existingRows.length > 0
    ? parseJsonField<LineItem[]>(existingRows[0].items, [])
    : []

  // 2. Calculate current stats and validate
  const currentStats = calculateAccountBalances(params.type, existingItems)
  const validation = validateTransaction(params, currentStats)
  if (!validation.valid) {
    throw new ApiError(400, validation.error || 'Invalid transaction')
  }

  // 3. Build new LineItem
  const newItem = buildTransactionLineItem(params)
  const updatedItems = [...existingItems, newItem]
  const newStats = calculateAccountBalances(params.type, updatedItems)

  const now = Date.now()
  const targetId = existingRows.length > 0 ? existingRows[0].id : `rec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const targetNotes = params.notes?.trim() || (existingRows.length > 0 ? existingRows[0].notes : null)

  if (existingRows.length > 0) {
    await sql`
      UPDATE ledger_records SET
        items = ${JSON.stringify(updatedItems)},
        date = ${params.date},
        notes = ${targetNotes},
        updated_at = ${now}
      WHERE id = ${targetId}
    `
  } else {
    await sql`
      INSERT INTO ledger_records (
        id, type, title, date, notes, exchange_rate, items, store_id, created_at, updated_at
      ) VALUES (
        ${targetId},
        ${params.type},
        ${cleanName},
        ${params.date},
        ${targetNotes},
        198,
        ${JSON.stringify(updatedItems)},
        ${finalStoreId},
        ${now},
        ${now}
      )
    `
  }

  // Normalize the party and every transaction/payment without creating duplicate accounts.
  const partyType = params.type
  let existingPartyRows = await sql`
    SELECT id FROM ledger_parties
    WHERE (store_id = ${finalStoreId} OR store_id IS NULL)
      AND party_type = ${partyType}
      AND LOWER(TRIM(name)) = LOWER(${cleanName})
    LIMIT 1
  `
  let partyId: string
  if (existingPartyRows.length > 0) {
    partyId = String(existingPartyRows[0].id)
  } else {
    const insertedParty = await sql`
      INSERT INTO ledger_parties (store_id, party_type, name, notes, created_at, updated_at)
      VALUES (${finalStoreId}, ${partyType}, ${cleanName}, ${params.notes?.trim() || null}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id
    `
    partyId = String(insertedParty[0].id)
  }

  const cartons = Math.max(0, Number(params.cartons) || 0)
  const piecesPerCarton = Math.max(0, Number(params.piecesPerCarton) || 0)
  const loosePieces = Math.max(0, Number(params.loosePieces) || 0)
  const quantity = cartons > 0
    ? (cartons * piecesPerCarton) + loosePieces
    : Math.max(0, Number(params.quantity) || 0)
  const unitPrice = Math.max(0, Number(params.unitPrice) || (quantity > 0 ? params.amount / quantity : params.amount))
  const isPayment = params.transactionCategory === 'payment_received' ||
    params.transactionCategory === 'payment_made'

  if (isPayment) {
    await sql`
      INSERT INTO ledger_payments (
        store_id, party_id, party_name, party_type, payment_date,
        amount, payment_method, bank_name, reference_number, notes
      ) VALUES (
        ${finalStoreId}, ${partyId}, ${cleanName}, ${partyType}, ${params.date}::date,
        ${params.amount}, ${params.paymentMethod || 'Cash'}, ${params.bankName || null},
        ${params.reference || null}, ${params.notes?.trim() || null}
      )
    `

    const accountName = params.bankName?.trim() ||
      (params.paymentMethod === 'Cash' ? 'Cash' : params.paymentMethod || 'Cash')
    const paymentMethod = params.paymentMethod === 'Cash' ? 'Cash' : 'Bank Transfer'

    if (params.type === 'customer' || params.type === 'delala') {
      // Customer or broker payment received: increases cash/bank balance
      await sql`
        INSERT INTO store_cash_balances (store_id, account_name, payment_method, balance)
        VALUES (${finalStoreId}, ${accountName}, ${paymentMethod}, ${params.amount})
        ON CONFLICT (store_id, payment_method, account_name) DO UPDATE SET
          balance = store_cash_balances.balance + ${params.amount},
          updated_at = CURRENT_TIMESTAMP
      `

      if (params.type === 'delala') {
        try {
          await sql`
            INSERT INTO delala_entries (
              delala_name, product_name, unit_price, pieces, sign, total, transaction_date, store_id
            ) VALUES (
              ${cleanName}, ${newItem.name || 'Payment'}, ${unitPrice || 0}, ${quantity || 1}, -1, ${-Math.abs(params.amount)}, ${params.date}, ${finalStoreId}
            )
          `
        } catch {
          // optional sync
        }
      }
    } else {
      // Supplier payment made: decreases cash/bank balance
      await sql`
        INSERT INTO store_cash_balances (store_id, account_name, payment_method, balance)
        VALUES (${finalStoreId}, ${accountName}, ${paymentMethod}, 0)
        ON CONFLICT (store_id, payment_method, account_name) DO UPDATE SET
          balance = GREATEST(0, store_cash_balances.balance - ${params.amount}),
          updated_at = CURRENT_TIMESTAMP
      `
    }
  } else {
    const isSupplier = params.type === 'supplier'
    const transactionType = params.transactionCategory === 'credit_purchase'
      ? 'PURCHASE'
      : params.transactionCategory === 'credit_sale'
        ? 'SALE'
        : params.transactionCategory === 'advance_received' || params.transactionCategory === 'advance_paid'
          ? 'ADVANCE'
          : params.transactionCategory === 'customer_return' || params.transactionCategory === 'supplier_return'
            ? 'RETURN'
            : 'ALLOCATION'
    const debitAmount = !isSupplier && transactionType === 'SALE' ? params.amount : 0
    const creditAmount = isSupplier && transactionType === 'PURCHASE' ? params.amount : 0

    // Stock Integration (Section 6)
    const prodName = (params.productName || params.description || '').trim()
    if (prodName && quantity > 0) {
      let invRows: any[] = []
      if (params.productId) {
        invRows = await sql`
          SELECT id, product_name, current_quantity, unit_price, cost_price
          FROM store_inventory
          WHERE id = ${params.productId}
          LIMIT 1
        `
      }
      if (invRows.length === 0) {
        invRows = await sql`
          SELECT id, product_name, current_quantity, unit_price, cost_price
          FROM store_inventory
          WHERE (store_id = ${finalStoreId} OR store_id IS NULL)
            AND (LOWER(TRIM(product_name)) = LOWER(${prodName}) OR LOWER(TRIM(product_name)) = LOWER(${params.description.trim()}))
            AND is_deleted = false
          LIMIT 1
        `
      }

      if (params.transactionCategory === 'credit_sale') {
        // Customer credit sale: reduce available stock
        if (invRows.length > 0) {
          const prod = invRows[0]
          const availableStock = Number(prod.current_quantity) || 0
          if (availableStock < quantity) {
            throw new ApiError(
              400,
              `Insufficient stock for "${prod.product_name}". Current available: ${availableStock.toLocaleString()} pieces, requested: ${quantity.toLocaleString()} pieces.`,
            )
          }
          await sql`
            UPDATE store_inventory
            SET current_quantity = current_quantity - ${quantity},
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ${prod.id} AND current_quantity >= ${quantity}
          `
          await sql`
            INSERT INTO stock_movements (
              store_id, product_id, movement_type, quantity, transaction_unit,
              base_quantity, previous_stock, new_stock, unit_price, total_price,
              transaction_date, source_type, destination, note
            ) VALUES (
              ${finalStoreId}, ${prod.id}, 'OUT', ${quantity}, 'pieces',
              ${quantity}, ${availableStock}, ${availableStock - quantity},
              ${unitPrice}, ${params.amount}, ${params.date}::date, 'CUSTOMER',
              ${cleanName}, ${params.notes || 'Customer credit sale'}
            )
          `
        }
      } else if (params.transactionCategory === 'credit_purchase') {
        // Supplier credit purchase: increase available stock
        if (invRows.length > 0) {
          const prod = invRows[0]
          const prevStock = Number(prod.current_quantity) || 0
          await sql`
            UPDATE store_inventory
            SET current_quantity = current_quantity + ${quantity},
                cost_price = ${unitPrice > 0 ? unitPrice : Number(prod.cost_price)},
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ${prod.id}
          `
          await sql`
            INSERT INTO stock_movements (
              store_id, product_id, movement_type, quantity, transaction_unit,
              base_quantity, previous_stock, new_stock, unit_price, total_price,
              transaction_date, source_type, source_id, note
            ) VALUES (
              ${finalStoreId}, ${prod.id}, 'IN', ${quantity}, 'pieces',
              ${quantity}, ${prevStock}, ${prevStock + quantity},
              ${unitPrice}, ${params.amount}, ${params.date}::date, 'SUPPLIER',
              ${cleanName}, ${params.notes || 'Supplier delivery'}
            )
          `
        } else {
          // Auto-register inventory item if not already in catalog
          const insertedProd = await sql`
            INSERT INTO store_inventory (
              store_id, product_name, current_quantity, unit_price, cost_price, base_unit, created_at, updated_at
            ) VALUES (
              ${finalStoreId}, ${prodName}, ${quantity}, ${unitPrice}, ${unitPrice}, 'pieces',
              CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
            RETURNING id
          `
          await sql`
            INSERT INTO stock_movements (
              store_id, product_id, movement_type, quantity, transaction_unit,
              base_quantity, previous_stock, new_stock, unit_price, total_price,
              transaction_date, source_type, source_id, note
            ) VALUES (
              ${finalStoreId}, ${insertedProd[0].id}, 'IN', ${quantity}, 'pieces',
              ${quantity}, 0, ${quantity},
              ${unitPrice}, ${params.amount}, ${params.date}::date, 'SUPPLIER',
              ${cleanName}, ${params.notes || 'Supplier delivery'}
            )
          `
        }
      } else if (params.transactionCategory === 'customer_return') {
        // Customer return: increase inventory
        if (invRows.length > 0) {
          const prod = invRows[0]
          const prevStock = Number(prod.current_quantity) || 0
          await sql`
            UPDATE store_inventory
            SET current_quantity = current_quantity + ${quantity},
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ${prod.id}
          `
          await sql`
            INSERT INTO stock_movements (
              store_id, product_id, movement_type, quantity, transaction_unit,
              base_quantity, previous_stock, new_stock, unit_price, total_price,
              transaction_date, source_type, source_id, note
            ) VALUES (
              ${finalStoreId}, ${prod.id}, 'RETURN', ${quantity}, 'pieces',
              ${quantity}, ${prevStock}, ${prevStock + quantity},
              ${unitPrice}, ${params.amount}, ${params.date}::date, 'CUSTOMER',
              ${cleanName}, ${params.notes || 'Customer return'}
            )
          `
        }
      } else if (params.transactionCategory === 'supplier_return') {
        // Supplier return: decrease inventory
        if (invRows.length > 0) {
          const prod = invRows[0]
          const prevStock = Number(prod.current_quantity) || 0
          if (prevStock < quantity) {
            throw new ApiError(
              400,
              `Cannot return ${quantity} pieces to supplier. Current available stock is only ${prevStock} pieces.`,
            )
          }
          await sql`
            UPDATE store_inventory
            SET current_quantity = current_quantity - ${quantity},
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ${prod.id} AND current_quantity >= ${quantity}
          `
          await sql`
            INSERT INTO stock_movements (
              store_id, product_id, movement_type, quantity, transaction_unit,
              base_quantity, previous_stock, new_stock, unit_price, total_price,
              transaction_date, source_type, destination, note
            ) VALUES (
              ${finalStoreId}, ${prod.id}, 'RETURN', ${quantity}, 'pieces',
              ${quantity}, ${prevStock}, ${prevStock - quantity},
              ${unitPrice}, ${params.amount}, ${params.date}::date, 'SUPPLIER',
              ${cleanName}, ${params.notes || 'Supplier return'}
            )
          `
        }
      }
    }

    await sql`
      INSERT INTO ledger_transactions (
        store_id, party_id, party_name, party_type, transaction_type,
        product_id, product_name, transaction_date, quantity, cartons,
        pieces_per_carton, loose_pieces, total_pieces, unit_price,
        total_amount, debit_amount, credit_amount, payment_amount,
        outstanding_balance, payment_method, bank_name, reference_number, notes
      ) VALUES (
        ${finalStoreId}, ${partyId}, ${cleanName}, ${partyType}, ${transactionType},
        ${params.productId || null}, ${params.productName || params.description?.trim() || null},
        ${params.date}::date, ${quantity}, ${cartons}, ${piecesPerCarton}, ${loosePieces},
        ${quantity}, ${unitPrice}, ${params.amount}, ${debitAmount}, ${creditAmount},
        ${Math.max(0, Number(params.paymentAmount) || 0)}, ${newStats.outstanding},
        ${params.paymentMethod || null}, ${params.bankName || null},
        ${params.reference || null}, ${params.notes?.trim() || null}
      )
    `

    if (params.type === 'delala') {
      try {
        await sql`
          INSERT INTO delala_entries (
            delala_name, product_name, unit_price, pieces, sign, total, transaction_date, store_id
          ) VALUES (
            ${cleanName}, ${prodName || 'Broker Goods'}, ${unitPrice}, ${quantity}, 1, ${params.amount}, ${params.date}, ${finalStoreId}
          )
        `
      } catch {
        // optional sync
      }
    }
  }

  return {
    record: {
      id: String(targetId),
      type: params.type,
      title: cleanName,
      date: params.date,
      notes: targetNotes || undefined,
      exchangeRate: 198,
      items: updatedItems,
      storeId: finalStoreId,
      createdAt: existingRows.length > 0 ? Number(existingRows[0].created_at) : now,
      updatedAt: now,
    },
    stats: newStats,
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
  storeId?: string | null,
): Promise<{ accounts: AccountSummary[] }> {
  const { records } = await getRecords(type, storeId)
  const map = new Map<string, AccountSummary>()
  const finalStoreId = (!storeId || storeId === 'all') ? 'all' : storeId
  const storeName =
    finalStoreId === 'all' ? 'All Stores' : (await getStoreNameMap()).get(finalStoreId) ?? ''

  for (const r of records) {
    const key = r.title.trim().toLowerCase()
    let existing = map.get(key)
    if (!existing) {
      existing = {
        name: r.title.trim(),
        type,
        storeId: finalStoreId,
        storeName,
        recordCount: 0,
        totalDebit: 0,
        totalCredit: 0,
        outstanding: 0,
        advanceBalance: 0,
        lastDate: r.date,
        notes: r.notes,
      }
      map.set(key, existing)
    }
    existing.recordCount += r.items.length
    const stats = calculateAccountBalances(type, r.items)
    existing.totalDebit = stats.totalCreditSalesOrPurchases
    existing.totalCredit = stats.totalPayments
    existing.outstanding = stats.outstanding
    existing.advanceBalance = stats.unappliedAdvance
    if (new Date(r.date) > new Date(existing.lastDate)) {
      existing.lastDate = r.date
    }
  }

  return { accounts: Array.from(map.values()) }
}

export async function getStatement(
  type: 'customer' | 'supplier',
  name: string,
  storeId?: string | null,
): Promise<{ statement: Statement }> {
  const { records } = await getRecords(type, storeId)
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

  const finalStoreId = (!storeId || storeId === 'all') ? 'all' : storeId
  const allItems: LineItem[] = matching.flatMap((r) => r.items)
  const stats = calculateAccountBalances(type, allItems)

  return {
    statement: {
      accountName: name,
      accountType: type,
      storeId: finalStoreId,
      storeName:
        finalStoreId === 'all'
          ? 'All Stores'
          : (await getStoreNameMap()).get(finalStoreId) ?? '',
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
        totalDebit: stats.totalCreditSalesOrPurchases,
        totalCredit: stats.totalPayments,
        outstanding: stats.outstanding,
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

export async function getBrokers(): Promise<Broker[]> {
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
  if (!name) return ''
  return name
    .replace(/\b(delala|ደላላ)\b/gi, '')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
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
      ${cleanName}, ${cleanProduct}, ${price}, ${pieces}, ${sign}, ${total}, ${date}, ${data.storeId || 'store_1'}
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





// ============================================================================
// SMART INVENTORY & PRODUCT CATALOG API
// ============================================================================
import type {
  StoreInventoryItem,
  NewProductInput,
  StockMovement,
  StockTransactionInput,
} from '../types/ledger'

export async function getInventoryProducts(storeId?: string): Promise<StoreInventoryItem[]> {
  const sql = getSql()
  let rows: any[]

  if (storeId && storeId !== 'all') {
    rows = await sql`
      SELECT * FROM store_inventory
      WHERE store_id = ${storeId} OR store_id IS NULL
      ORDER BY product_name ASC
    `
  } else {
    rows = await sql`
      SELECT * FROM store_inventory
      ORDER BY product_name ASC
    `
  }

  return rows.map((r) => ({
    id: String(r.id),
    storeId: r.store_id ? String(r.store_id) : undefined,
    productName: String(r.product_name),
    sku: r.sku ? String(r.sku) : undefined,
    category: r.category ? String(r.category) : 'General',
    baseUnit: r.base_unit ? String(r.base_unit) : 'Pcs',
    currentQuantity: Number(r.current_quantity) || 0,
    minimumStock: Number(r.minimum_stock) || 0,
    unitPrice: Number(r.unit_price) || 0,
    costPrice: Number(r.cost_price) || 0,
    pcsPerCarton: Number(r.pcs_per_carton) || 1,
    supplierName: r.supplier_name ? String(r.supplier_name) : undefined,
    lastTransactionDate: r.last_transaction_date ? String(r.last_transaction_date) : undefined,
    description: r.description ? String(r.description) : undefined,
    createdBy: r.created_by ? String(r.created_by) : undefined,
    createdAt: r.created_at ? String(r.created_at) : undefined,
    updatedAt: r.updated_at ? String(r.updated_at) : undefined,
  }))
}

export async function getInventoryProductById(id: string): Promise<StoreInventoryItem | null> {
  const sql = getSql()
  const rows = await sql`
    SELECT * FROM store_inventory WHERE id = ${id} LIMIT 1
  `
  if (!rows.length) return null
  const r = rows[0]
  return {
    id: String(r.id),
    storeId: r.store_id ? String(r.store_id) : undefined,
    productName: String(r.product_name),
    sku: r.sku ? String(r.sku) : undefined,
    category: r.category ? String(r.category) : 'General',
    baseUnit: r.base_unit ? String(r.base_unit) : 'Pcs',
    currentQuantity: Number(r.current_quantity) || 0,
    minimumStock: Number(r.minimum_stock) || 0,
    unitPrice: Number(r.unit_price) || 0,
    costPrice: Number(r.cost_price) || 0,
    pcsPerCarton: Number(r.pcs_per_carton) || 1,
    supplierName: r.supplier_name ? String(r.supplier_name) : undefined,
    lastTransactionDate: r.last_transaction_date ? String(r.last_transaction_date) : undefined,
    description: r.description ? String(r.description) : undefined,
  }
}

export async function registerNewProduct(input: NewProductInput): Promise<StoreInventoryItem> {
  const sql = getSql()
  const sku = input.sku || `SKU-${Date.now().toString(36).toUpperCase()}`
  const initialQty = Number(input.initialQuantity) || 0
  const unitPrice = Number(input.unitPrice) || 0
  const costPrice = Number(input.costPrice) || unitPrice
  const pcsPerCtn = Number(input.pcsPerCarton) || 1

  // Register the product and its initial stock movement atomically
  // (one statement = one transaction), and record who registered it.
  const inserted = initialQty > 0
    ? await sql`
        WITH ins AS (
          INSERT INTO store_inventory (
            store_id, product_name, sku, category, base_unit,
            current_quantity, minimum_stock, unit_price, cost_price,
            pcs_per_carton, supplier_name, last_transaction_date, description, created_by
          ) VALUES (
            ${input.storeId || null},
            ${input.productName.trim()},
            ${sku},
            ${input.category || 'General'},
            ${input.baseUnit || 'Pcs'},
            ${initialQty},
            ${Number(input.minimumStock) || 0},
            ${unitPrice},
            ${costPrice},
            ${pcsPerCtn},
            ${input.supplierName || null},
            ${new Date().toISOString().split('T')[0]},
            ${input.description || null},
            ${input.createdBy || null}
          )
          RETURNING *
        ),
        mv AS (
          INSERT INTO stock_movements (
            store_id, product_id, movement_type, quantity,
            transaction_unit, conversion_factor, base_quantity,
            previous_stock, new_stock, unit_price, total_price,
            transaction_date, source_type, source_id, note, created_by
          )
          SELECT
            i.store_id, i.id, 'IN', ${initialQty},
            ${input.baseUnit || 'Pcs'}, ${pcsPerCtn}, ${initialQty},
            0, i.current_quantity, ${costPrice}, ${initialQty * costPrice},
            CURRENT_DATE, 'INITIAL', ${input.supplierName || null},
            'Initial product registration stock', ${input.createdBy || null}
          FROM ins i
          RETURNING id
        )
        SELECT i.*, mv.id AS initial_movement_id
        FROM ins i
        LEFT JOIN mv ON TRUE
      `
    : await sql`
        INSERT INTO store_inventory (
          store_id, product_name, sku, category, base_unit,
          current_quantity, minimum_stock, unit_price, cost_price,
          pcs_per_carton, supplier_name, last_transaction_date, description, created_by
        ) VALUES (
          ${input.storeId || null},
          ${input.productName.trim()},
          ${sku},
          ${input.category || 'General'},
          ${input.baseUnit || 'Pcs'},
          ${initialQty},
          ${Number(input.minimumStock) || 0},
          ${unitPrice},
          ${costPrice},
          ${pcsPerCtn},
          ${input.supplierName || null},
          ${new Date().toISOString().split('T')[0]},
          ${input.description || null},
          ${input.createdBy || null}
        )
        RETURNING *
      `

  const r = inserted[0]
  const productId = String(r.id)

  // Save product translations if provided
  if (input.amharicName) {
    await sql`
      INSERT INTO product_translations (product_id, language_code, product_name)
      VALUES (${productId}, 'am', ${input.amharicName})
      ON CONFLICT (product_id, language_code) DO UPDATE SET product_name = ${input.amharicName}
    `
  }
  if (input.englishName) {
    await sql`
      INSERT INTO product_translations (product_id, language_code, product_name)
      VALUES (${productId}, 'en', ${input.englishName})
      ON CONFLICT (product_id, language_code) DO UPDATE SET product_name = ${input.englishName}
    `
  }

  return {
    id: productId,
    storeId: r.store_id ? String(r.store_id) : undefined,
    productName: String(r.product_name),
    sku: String(r.sku),
    category: String(r.category),
    baseUnit: String(r.base_unit),
    currentQuantity: Number(r.current_quantity),
    minimumStock: Number(r.minimum_stock),
    unitPrice: Number(r.unit_price),
    costPrice: Number(r.cost_price),
    pcsPerCarton: Number(r.pcs_per_carton),
    supplierName: r.supplier_name ? String(r.supplier_name) : undefined,
    lastTransactionDate: r.last_transaction_date ? String(r.last_transaction_date) : undefined,
    description: r.description ? String(r.description) : undefined,
  }
}

/** Normalizes user-entered transaction dates (YYYY-MM-DD / DD/MM/YYYY) to ISO YYYY-MM-DD. */
function normalizeTransactionDate(value?: string): string {
  const fallback = new Date().toISOString().split('T')[0]
  if (!value) return fallback
  const v = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  const dmy = v.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/)
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  }
  const parsed = new Date(v)
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0]
  return fallback
}

/**
 * Authoritative store-isolation check.
 * A storekeeper may only perform stock transactions on products that belong
 * to the store their account is assigned to.
 */
function assertStockAccess(prod: any, input: StockTransactionInput): void {
  const productStoreId = prod.store_id ? String(prod.store_id) : null
  const requestedStoreId =
    input.storeId && input.storeId !== 'all' ? String(input.storeId) : null

  if (requestedStoreId && productStoreId && requestedStoreId !== productStoreId) {
    throw new ApiError(
      403,
      'Access denied: this product belongs to a different store. (ይፈቀድልም: ይህ ምርት በሌላ መደብር ነው።)'
    )
  }

  const actor = input.requestedBy
  if (actor && actor.role === 'storekeeper') {
    const actorStoreId = actor.storeId || null
    if (!actorStoreId) {
      throw new ApiError(
        403,
        'Access denied: your account is not assigned to any store. (ይፈቀድልም: መለያዎ በምንም መደብር አልተመደበም።)'
      )
    }
    if (productStoreId && actorStoreId !== productStoreId) {
      throw new ApiError(
        403,
        'Access denied: you do not have access to this store. (ይፈቀድልም: ወደዚህ መደብር መድረስ አልችሉም።)'
      )
    }
  }
}

export async function executeStockTransaction(input: StockTransactionInput): Promise<{
  movement: StockMovement
  updatedProduct: StoreInventoryItem
  ledgerRecordId: string
}> {
  const sql = getSql()

  // 1. Validate the requested quantity — never trust the frontend.
  const qty = Number(input.quantity)
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new ApiError(400, 'Quantity must be a valid number greater than zero.')
  }

  // 2. Read the product record.
  const products = await sql`
    SELECT * FROM store_inventory WHERE id = ${input.productId} LIMIT 1
  `
  if (!products.length) {
    throw new ApiError(404, `Product not found: ${input.productId}`)
  }
  const prod = products[0]

  // 3. Verify the authenticated shopkeeper has access to this store.
  assertStockAccess(prod, input)

  const isOut = input.movementType === 'OUT'
  const unitOfMeasure = String(prod.base_unit || 'pieces')
  const unitPrice = Number(input.unitPrice) || 0
  const totalPrice = Math.round(qty * unitPrice * 100) / 100
  const paymentAmount = Math.max(0, Number(input.paymentAmount) || 0)
  if (!Number.isFinite(paymentAmount) || paymentAmount > totalPrice) {
    throw new ApiError(400, 'Payment amount cannot exceed the total transaction amount.')
  }
  const txnDate = normalizeTransactionDate(input.transactionDate)
  const pcsPerCtn = Number(input.pcsPerCarton) || Number(prod.pcs_per_carton) || 1
  const cartons = Number(input.cartons) || 0
  const transactionUnit =
    input.packagingUnit || (cartons > 0 ? 'Carton' : String(prod.base_unit || 'Pcs'))

  const actor = input.requestedBy || null
  const createdById = actor ? actor.id : null
  const movementStoreId =
    input.storeId && input.storeId !== 'all'
      ? String(input.storeId)
      : prod.store_id
      ? String(prod.store_id)
      : null

  const party = input.supplierOrDestination?.trim() || null // supplier (IN) / destination (OUT)
  const sourceId = isOut ? null : party
  const destination = isOut ? party : null
  const sourceType = isOut ? 'CUSTOMER' : 'SUPPLIER'
  const referenceNumber = input.referenceNumber?.trim() || null
  const note = input.note?.trim() || null

  const nowMs = Date.now()
  const ledgerId = `rec-stock-${nowMs}-${Math.random().toString(36).substring(2, 6)}`
  const ledgerItem = {
    id: `item-${nowMs}-1`,
    name: String(prod.product_name),
    unitPrice,
    quantity: qty,
    sign: isOut ? '-' : '+',
    customType: isOut ? 'Stock Out' : 'Goods',
    cartons,
    pcsPerCarton: pcsPerCtn,
    packagingUnit: transactionUnit,
    date: txnDate,
    notes:
      note || referenceNumber || (isOut ? 'Stock Out (Outgoing)' : 'Stock In (Incoming)'),
  }
  const ledgerNotes = party
    ? isOut
      ? `Destination: ${party}`
      : `Supplier: ${party}`
    : ''

  // 4.-9. ONE atomic database statement (a single transaction):
  //   a) atomic conditional balance update (row lock + re-evaluated guard)
  //   b) immutable stock_movements record (previous/new balance, user, date)
  //   c) ledger_records sync record
  // PostgreSQL executes the whole statement all-or-nothing, so a rejected
  // withdrawal writes nothing, and two simultaneous withdrawals can never both
  // succeed when only one has stock — the loser re-evaluates
  // "current_quantity >= qty" against the winner's committed row.
  const rows: any[] = isOut
    ? await sql`
        WITH upd AS (
          UPDATE store_inventory
          SET current_quantity = current_quantity - ${qty},
              unit_price = ${unitPrice > 0 ? unitPrice : Number(prod.unit_price)},
              last_transaction_date = ${txnDate},
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ${input.productId}
            AND current_quantity >= ${qty}
          RETURNING *, (current_quantity + ${qty}) AS previous_qty
        ),
        mv AS (
          INSERT INTO stock_movements (
            store_id, product_id, movement_type, quantity,
            transaction_unit, conversion_factor, base_quantity,
            previous_stock, new_stock, unit_price, total_price,
            transaction_date, source_type, source_id, destination,
            reference_number, note, created_by
          )
          SELECT
            ${movementStoreId}, u.id, 'OUT', ${qty},
            ${transactionUnit}, ${pcsPerCtn}, ${qty},
            u.previous_qty, u.current_quantity, ${unitPrice}, ${totalPrice},
            ${txnDate}::date, ${sourceType}, ${sourceId}, ${destination},
            ${referenceNumber}, ${note}, ${createdById}
          FROM upd u
          RETURNING id, previous_stock, new_stock, created_at
        ),
        lg AS (
          INSERT INTO ledger_records (
            id, type, title, date, notes, exchange_rate, items, store_id, created_at, updated_at
          )
          SELECT ${ledgerId}, 'stock', ${String(prod.product_name)}, ${txnDate},
                 ${ledgerNotes}, 198, ${JSON.stringify([ledgerItem])},
                 ${movementStoreId}, ${nowMs}, ${nowMs}
          FROM mv
          RETURNING id
        )
        SELECT u.*,
               mv.id AS movement_id,
               mv.previous_stock AS movement_previous_stock,
               mv.new_stock AS movement_new_stock,
               mv.created_at AS movement_created_at,
               lg.id AS ledger_id
        FROM upd u
        JOIN mv ON TRUE
        JOIN lg ON TRUE
      `
    : await sql`
        WITH upd AS (
          UPDATE store_inventory
          SET current_quantity = current_quantity + ${qty},
              cost_price = ${unitPrice > 0 ? unitPrice : Number(prod.cost_price)},
              pcs_per_carton = ${pcsPerCtn},
              supplier_name = COALESCE(${party}, supplier_name),
              last_transaction_date = ${txnDate},
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ${input.productId}
          RETURNING *, (current_quantity - ${qty}) AS previous_qty
        ),
        mv AS (
          INSERT INTO stock_movements (
            store_id, product_id, movement_type, quantity,
            transaction_unit, conversion_factor, base_quantity,
            previous_stock, new_stock, unit_price, total_price,
            transaction_date, source_type, source_id, destination,
            reference_number, note, created_by
          )
          SELECT
            ${movementStoreId}, u.id, 'IN', ${qty},
            ${transactionUnit}, ${pcsPerCtn}, ${qty},
            u.previous_qty, u.current_quantity, ${unitPrice}, ${totalPrice},
            ${txnDate}::date, ${sourceType}, ${sourceId}, ${destination},
            ${referenceNumber}, ${note}, ${createdById}
          FROM upd u
          RETURNING id, previous_stock, new_stock, created_at
        ),
        lg AS (
          INSERT INTO ledger_records (
            id, type, title, date, notes, exchange_rate, items, store_id, created_at, updated_at
          )
          SELECT ${ledgerId}, 'stock', ${String(prod.product_name)}, ${txnDate},
                 ${ledgerNotes}, 198, ${JSON.stringify([ledgerItem])},
                 ${movementStoreId}, ${nowMs}, ${nowMs}
          FROM mv
          RETURNING id
        )
        SELECT u.*,
               mv.id AS movement_id,
               mv.previous_stock AS movement_previous_stock,
               mv.new_stock AS movement_new_stock,
               mv.created_at AS movement_created_at,
               lg.id AS ledger_id
        FROM upd u
        JOIN mv ON TRUE
        JOIN lg ON TRUE
      `

  if (!rows.length) {
    if (isOut) {
      // Rejected: available stock was insufficient (possibly a concurrent
      // withdrawal that won the race). Re-read for an accurate message.
      const fresh = await sql`
        SELECT current_quantity, base_unit FROM store_inventory
        WHERE id = ${input.productId} LIMIT 1
      `
      if (!fresh.length) {
        throw new ApiError(404, `Product not found: ${input.productId}`)
      }
      const freshStock = Number(fresh[0].current_quantity) || 0
      const freshUnit = String(fresh[0].base_unit || unitOfMeasure)
      throw new ApiError(
        400,
        `Insufficient stock! Available quantity is ${freshStock} ${freshUnit}. You cannot withdraw ${qty} ${freshUnit}. (በቂ እቃ የለም! በመደብሩ ያለው መጠን ${freshStock} ብቻ ነው። ${qty} መውሰድ አይቻልም።)`
      )
    }
    throw new ApiError(404, `Product not found: ${input.productId}`)
  }

  const row = rows[0]

  const loosePieces = Math.max(0, Number(input.loosePieces) || 0)
  const totalPieces = qty
  const outstandingBalance = Math.max(0, totalPrice - paymentAmount)

  await sql`
    UPDATE stock_movements SET
      cartons = ${cartons},
      loose_pieces = ${loosePieces},
      total_pieces = ${totalPieces},
      payment_amount = ${paymentAmount},
      outstanding_balance = ${outstandingBalance}
    WHERE id = ${String(row.movement_id)}
  `

  if (party) {
    const partyType = isOut ? 'customer' : 'supplier'
    const partyRows = await sql`
      INSERT INTO ledger_parties (store_id, party_type, name, created_at, updated_at)
      VALUES (${movementStoreId}, ${partyType}, ${party}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (store_id, party_type, LOWER(name)) DO UPDATE SET
        name = EXCLUDED.name,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id
    `
    const partyId = String(partyRows[0].id)
    await sql`
      INSERT INTO ledger_transactions (
        store_id, party_id, party_name, party_type, transaction_type,
        product_id, product_name, transaction_date, quantity, cartons,
        pieces_per_carton, loose_pieces, total_pieces, unit_price,
        total_amount, debit_amount, credit_amount, payment_amount,
        outstanding_balance, payment_method, bank_name, reference_number, notes
      ) VALUES (
        ${movementStoreId}, ${partyId}, ${party}, ${partyType},
        ${isOut ? 'SALE' : 'PURCHASE'}, ${input.productId}, ${String(prod.product_name)},
        ${txnDate}::date, ${totalPieces}, ${cartons}, ${pcsPerCtn}, ${loosePieces},
        ${totalPieces}, ${unitPrice}, ${totalPrice},
        ${isOut ? totalPrice : 0}, ${isOut ? 0 : totalPrice},
        ${paymentAmount}, ${outstandingBalance},
        ${input.bankName ? 'Bank Transfer' : 'Cash'}, ${input.bankName || null},
        ${referenceNumber}, ${note}
      )
    `

    if (paymentAmount > 0) {
      await sql`
        INSERT INTO ledger_payments (
          store_id, party_id, party_name, party_type, payment_date,
          amount, payment_method, bank_name, reference_number, notes
        ) VALUES (
          ${movementStoreId}, ${partyId}, ${party}, ${partyType}, ${txnDate}::date,
          ${paymentAmount}, ${input.bankName ? 'Bank Transfer' : 'Cash'},
          ${input.bankName || null}, ${referenceNumber}, ${note}
        )
      `
      const accountName = input.bankName?.trim() || 'Cash'
      const cashMethod = input.bankName?.trim() ? 'Bank Transfer' : 'Cash'
      await sql`
        INSERT INTO store_cash_balances (store_id, account_name, payment_method, balance)
        VALUES (
          ${movementStoreId}, ${accountName}, ${cashMethod},
          ${isOut ? paymentAmount : -paymentAmount}
        )
        ON CONFLICT (store_id, payment_method, account_name) DO UPDATE SET
          balance = store_cash_balances.balance + ${isOut ? paymentAmount : -paymentAmount},
          updated_at = CURRENT_TIMESTAMP
      `
    }
  }

  return {
    movement: {
      id: String(row.movement_id),
      storeId: row.store_id ? String(row.store_id) : undefined,
      productId: String(row.id),
      movementType: isOut ? 'OUT' : 'IN',
      quantity: qty,
      transactionUnit,
      conversionFactor: pcsPerCtn,
      baseQuantity: qty,
      previousStock: Number(row.movement_previous_stock),
      newStock: Number(row.movement_new_stock),
      unitPrice,
      totalPrice,
      transactionDate: txnDate,
      sourceType,
      sourceId: sourceId ?? undefined,
      destination: destination ?? undefined,
      referenceNumber: referenceNumber ?? undefined,
      note: note ?? undefined,
      createdBy: createdById ?? undefined,
      createdAt: row.movement_created_at ? String(row.movement_created_at) : undefined,
    },
    updatedProduct: {
      id: String(row.id),
      storeId: row.store_id ? String(row.store_id) : undefined,
      productName: String(row.product_name),
      sku: row.sku ? String(row.sku) : undefined,
      category: row.category ? String(row.category) : 'General',
      baseUnit: row.base_unit ? String(row.base_unit) : 'Pcs',
      currentQuantity: Number(row.current_quantity),
      minimumStock: Number(row.minimum_stock),
      unitPrice: Number(row.unit_price),
      costPrice: Number(row.cost_price),
      pcsPerCarton: Number(row.pcs_per_carton),
      supplierName: row.supplier_name ? String(row.supplier_name) : undefined,
      lastTransactionDate: row.last_transaction_date
        ? String(row.last_transaction_date)
        : undefined,
      description: row.description ? String(row.description) : undefined,
    },
    ledgerRecordId: String(row.ledger_id || ledgerId),
  }
}

export async function getStockMovements(productId?: string, storeId?: string): Promise<StockMovement[]> {
  const sql = getSql()
  let rows: any[]

  if (productId) {
    rows = await sql`
      SELECT sm.*, u.name AS created_by_name
      FROM stock_movements sm
      LEFT JOIN users u ON u.id = sm.created_by
      WHERE sm.product_id = ${productId}
      ORDER BY sm.transaction_date DESC, sm.created_at DESC
      LIMIT 100
    `
  } else if (storeId && storeId !== 'all') {
    rows = await sql`
      SELECT sm.*, u.name AS created_by_name
      FROM stock_movements sm
      LEFT JOIN users u ON u.id = sm.created_by
      WHERE sm.store_id = ${storeId} OR sm.store_id IS NULL
      ORDER BY sm.transaction_date DESC, sm.created_at DESC
      LIMIT 100
    `
  } else {
    rows = await sql`
      SELECT sm.*, u.name AS created_by_name
      FROM stock_movements sm
      LEFT JOIN users u ON u.id = sm.created_by
      ORDER BY sm.transaction_date DESC, sm.created_at DESC
      LIMIT 100
    `
  }

  return rows.map((m) => ({
    id: String(m.id),
    storeId: m.store_id ? String(m.store_id) : undefined,
    productId: String(m.product_id),
    movementType: String(m.movement_type) as 'IN' | 'OUT',
    quantity: Number(m.quantity),
    transactionUnit: String(m.transaction_unit),
    conversionFactor: Number(m.conversion_factor),
    baseQuantity: Number(m.base_quantity),
    previousStock: Number(m.previous_stock),
    newStock: Number(m.new_stock),
    unitPrice: Number(m.unit_price),
    totalPrice: Number(m.total_price),
    transactionDate: String(m.transaction_date),
    sourceType: m.source_type ? String(m.source_type) : undefined,
    sourceId: m.source_id ? String(m.source_id) : undefined,
    destination: m.destination ? String(m.destination) : undefined,
    referenceNumber: m.reference_number ? String(m.reference_number) : undefined,
    note: m.note ? String(m.note) : undefined,
    createdBy: m.created_by ? String(m.created_by) : undefined,
    createdByName: m.created_by_name ? String(m.created_by_name) : undefined,
    createdAt: m.created_at ? String(m.created_at) : undefined,
  }))
}

export async function updateInventoryProduct(
  id: string,
  updates: {
    productName?: string
    sku?: string
    category?: string
    baseUnit?: string
    minimumStock?: number
    costPrice?: number
    unitPrice?: number
    pcsPerCarton?: number
    supplierName?: string
    description?: string
  }
): Promise<StoreInventoryItem> {
  const sql = getSql()
  const rows = await sql`
    UPDATE store_inventory
    SET product_name = COALESCE(${updates.productName || null}, product_name),
        sku = COALESCE(${updates.sku || null}, sku),
        category = COALESCE(${updates.category || null}, category),
        base_unit = COALESCE(${updates.baseUnit || null}, base_unit),
        minimum_stock = COALESCE(${updates.minimumStock != null ? updates.minimumStock : null}, minimum_stock),
        cost_price = COALESCE(${updates.costPrice != null ? updates.costPrice : null}, cost_price),
        unit_price = COALESCE(${updates.unitPrice != null ? updates.unitPrice : null}, unit_price),
        pcs_per_carton = COALESCE(${updates.pcsPerCarton != null ? updates.pcsPerCarton : null}, pcs_per_carton),
        supplier_name = COALESCE(${updates.supplierName || null}, supplier_name),
        description = COALESCE(${updates.description || null}, description),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ${id}
    RETURNING *
  `
  if (!rows.length) {
    throw new ApiError(404, `Product not found: ${id}`)
  }
  const r = rows[0]
  return {
    id: String(r.id),
    storeId: r.store_id ? String(r.store_id) : undefined,
    productName: String(r.product_name),
    sku: r.sku ? String(r.sku) : undefined,
    category: r.category ? String(r.category) : 'General',
    baseUnit: r.base_unit ? String(r.base_unit) : 'Pcs',
    currentQuantity: Number(r.current_quantity) || 0,
    minimumStock: Number(r.minimum_stock) || 0,
    unitPrice: Number(r.unit_price) || 0,
    costPrice: Number(r.cost_price) || 0,
    pcsPerCarton: Number(r.pcs_per_carton) || 1,
    supplierName: r.supplier_name ? String(r.supplier_name) : undefined,
    lastTransactionDate: r.last_transaction_date ? String(r.last_transaction_date) : undefined,
    description: r.description ? String(r.description) : undefined,
    createdBy: r.created_by ? String(r.created_by) : undefined,
    createdAt: r.created_at ? String(r.created_at) : undefined,
    updatedAt: r.updated_at ? String(r.updated_at) : undefined,
  }
}

export async function deleteInventoryProduct(id: string): Promise<void> {
  const sql = getSql()
  await sql`DELETE FROM store_inventory WHERE id = ${id}`
}

// ============================================================================
// BILINGUAL TRANSLATION & LOCALIZATION DATABASE API
// ============================================================================
export async function getTranslationsFromDb(lang: 'en' | 'am'): Promise<Record<string, string>> {
  const sql = getSql()
  try {
    const rows = await sql`
      SELECT translation_key, translated_text FROM translations
      WHERE language_code = ${lang}
    `
    const dict: Record<string, string> = {}
    for (const r of rows) {
      dict[r.translation_key] = String(r.translated_text)
    }
    return dict
  } catch (e) {
    console.warn('Could not load translations from DB, using fallback dictionary:', e)
    return {}
  }
}

export async function saveCustomTranslation(
  key: string,
  lang: 'en' | 'am',
  text: string
): Promise<void> {
  const sql = getSql()
  await sql`
    INSERT INTO translations (translation_key, language_code, translated_text)
    VALUES (${key}, ${lang}, ${text})
    ON CONFLICT (translation_key, language_code)
    DO UPDATE SET translated_text = ${text}, updated_at = CURRENT_TIMESTAMP
  `
}

export async function getProductTranslations(productId: string): Promise<{ en?: string; am?: string }> {
  const sql = getSql()
  try {
    const rows = await sql`
      SELECT language_code, product_name FROM product_translations
      WHERE product_id = ${productId}
    `
    const res: { en?: string; am?: string } = {}
    for (const r of rows) {
      if (r.language_code === 'en') res.en = String(r.product_name)
      if (r.language_code === 'am') res.am = String(r.product_name)
    }
    return res
  } catch {
    return {}
  }
}

export async function saveProductTranslation(
  productId: string,
  lang: 'en' | 'am',
  name: string,
  description?: string
): Promise<void> {
  const sql = getSql()
  await sql`
    INSERT INTO product_translations (product_id, language_code, product_name, description)
    VALUES (${productId}, ${lang}, ${name}, ${description || null})
    ON CONFLICT (product_id, language_code)
    DO UPDATE SET product_name = ${name}, description = ${description || null}, updated_at = CURRENT_TIMESTAMP
  `
}

export async function getUserLanguagePreference(userId: string): Promise<string | null> {
  const sql = getSql()
  try {
    const rows = await sql`
      SELECT language_code FROM user_language_preferences WHERE user_id = ${userId} LIMIT 1
    `
    return rows.length ? String(rows[0].language_code) : null
  } catch {
    return null
  }
}

export async function saveUserLanguagePreference(userId: string, lang: 'en' | 'am'): Promise<void> {
  const sql = getSql()
  try {
    await sql`
      INSERT INTO user_language_preferences (user_id, language_code)
      VALUES (${userId}, ${lang})
      ON CONFLICT (user_id)
      DO UPDATE SET language_code = ${lang}, updated_at = CURRENT_TIMESTAMP
    `
  } catch (e) {
    console.warn('Failed to save user language preference:', e)
  }
}
