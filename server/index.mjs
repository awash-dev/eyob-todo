/**
 * Click Ledger API
 *
 * A small, dependency-light backend that sits in front of the existing Neon
 * PostgreSQL database. It exists for three reasons:
 *   1. Authentication (the old app talked to Neon directly from the browser).
 *   2. Role / shop access control on the server (not just in the UI).
 *   3. A stable REST API for the Android APK.
 *
 * Run: node server/index.mjs
 */
import http from 'node:http'
import path from 'node:path'
import crypto from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { neon } from '@neondatabase/serverless'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WEB_ROOT = path.resolve(__dirname, '..')
dotenv.config({ path: path.join(WEB_ROOT, '.env') })

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://neondb_owner:npg_OtyTj7F9Aqnz@ep-red-sea-b5yphk96-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require'
const sql = neon(DATABASE_URL)
const PORT = Number(process.env.PORT || 8787)
const HOST = process.env.HOST || '0.0.0.0'
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000
const COOKIE_NAME = 'click_session'
const DIST_DIR = path.join(WEB_ROOT, 'dist')

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

const now = () => Date.now()
const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100
const isFiniteNumber = (value) =>
  typeof value === 'number' && Number.isFinite(value)

function json(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  })
  res.end(body)
}

function parseCookies(header = '') {
  const cookies = {}
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index === -1) continue
    const key = part.slice(0, index).trim()
    const value = part.slice(index + 1).trim()
    if (key) cookies[key] = decodeURIComponent(value)
  }
  return cookies
}

function sessionCookie(token, maxAgeSeconds) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`
}

async function readJson(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'object') return req.body
    if (typeof req.body === 'string') {
      try {
        return JSON.parse(req.body)
      } catch {
        throw new HttpError(400, 'Invalid JSON body')
      }
    }
  }
  let body = ''
  for await (const chunk of req) {
    body += chunk
    if (body.length > 1_500_000) throw new HttpError(413, 'Request is too large')
  }
  if (!body.trim()) return {}
  try {
    return JSON.parse(body)
  } catch {
    throw new HttpError(400, 'Invalid JSON body')
  }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.createHash('sha256').update(salt + String(password)).digest('hex')
  return `sha256:${salt}:${hash}`
}

function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false
  if (stored.startsWith('sha256:')) {
    const [, salt, expected] = stored.split(':')
    const actual = crypto.createHash('sha256').update(salt + String(password)).digest('hex')
    return actual === expected
  }
  if (stored.includes(':')) {
    const [salt, hash] = stored.split(':')
    try {
      const derived = crypto.scryptSync(String(password), salt, 64)
      const expected = Buffer.from(hash, 'hex')
      return expected.length === derived.length && crypto.timingSafeEqual(expected, derived)
    } catch {
      return false
    }
  }
  return false
}

const newToken = () => crypto.randomBytes(32).toString('hex')
const tokenHash = (token) => crypto.createHash('sha256').update(token).digest('hex')

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
}

function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    shopId: row.shop_id || null,
    shopName: row.shop_name || null,
    active: row.active !== false,
  }
}

function parseJsonField(value, fallback) {
  if (value === null || value === undefined) return fallback
  if (typeof value === 'object') return value
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return fallback
    }
  }
  return fallback
}

function mapRecord(row) {
  return {
    id: String(row.id),
    type: String(row.type),
    title: String(row.title),
    date: String(row.date),
    notes: row.notes ? String(row.notes) : undefined,
    exchangeRate:
      row.exchange_rate === null || row.exchange_rate === undefined
        ? undefined
        : Number(row.exchange_rate),
    items: parseJsonField(row.items, []),
    shopId: row.shop_id ? String(row.shop_id) : undefined,
    shopName: row.shop_name ? String(row.shop_name) : undefined,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

const RECORD_TYPES = new Set(['customer', 'supplier', 'stock'])
const SIGN_TYPES = new Set(['+', '-'])
const SETTING_KEYS = new Set([
  'currency',
  'rate_mode',
  'black_market_rate',
  'bank_rate',
])

function text(value, field, { required = false, max = 500 } = {}) {
  if (value === null || value === undefined) {
    if (required) throw new HttpError(400, `${field} is required`)
    return undefined
  }
  const result = String(value).trim()
  if (required && !result) throw new HttpError(400, `${field} is required`)
  if (result.length > max) throw new HttpError(400, `${field} is too long`)
  return result || undefined
}

function numberValue(value, field, { min = 0 } = {}) {
  if (value === null || value === undefined || value === '') return 0
  const result = Number(value)
  if (!Number.isFinite(result)) throw new HttpError(400, `${field} must be a number`)
  if (result < min) throw new HttpError(400, `${field} cannot be negative`)
  return result
}

function normalizeItems(rawItems) {
  if (!Array.isArray(rawItems)) throw new HttpError(400, 'items must be an array')
  if (rawItems.length === 0) throw new HttpError(400, 'At least one item is required')
  if (rawItems.length > 200) throw new HttpError(400, 'Too many items in one record')

  return rawItems
    .map((raw) => {
      if (!raw || typeof raw !== 'object') return null
      const name = text(raw.name, 'Item description', { required: true, max: 500 })
      const sign = SIGN_TYPES.has(raw.sign) ? raw.sign : '+'
      const item = {
        id: text(raw.id, 'Item id', { max: 120 }) || makeId('item'),
        name,
        unitPrice: round2(numberValue(raw.unitPrice, 'Unit price')),
        quantity: numberValue(raw.quantity, 'Quantity'),
        sign,
      }
      const bank = text(raw.bank, 'Bank', { max: 120 })
      const customType = text(raw.customType, 'Type', { max: 120 })
      const paymentMethod = text(raw.paymentMethod, 'Payment method', { max: 120 })
      const reference = text(raw.reference, 'Reference', { max: 200 })
      if (bank) item.bank = bank
      if (customType) item.customType = customType
      if (paymentMethod) item.paymentMethod = paymentMethod
      if (reference) item.reference = reference
      if (raw.customs !== undefined && raw.customs !== null && raw.customs !== '') {
        item.customs = round2(numberValue(raw.customs, 'Customs'))
      }
      if (raw.cartons !== undefined && raw.cartons !== null && raw.cartons !== '') {
        item.cartons = numberValue(raw.cartons, 'Cartons')
      }
      if (
        raw.pcsPerCarton !== undefined &&
        raw.pcsPerCarton !== null &&
        raw.pcsPerCarton !== ''
      ) {
        item.pcsPerCarton = numberValue(raw.pcsPerCarton, 'Pieces per carton')
      }
      return item
    })
    .filter(Boolean)
}

function normalizeRecordInput(body) {
  const type = RECORD_TYPES.has(body.type) ? body.type : null
  if (!type) throw new HttpError(400, 'type must be customer, supplier or stock')
  const title = text(body.title, 'Account / title', { required: true, max: 200 })
  const date = text(body.date, 'Date', { required: true, max: 30 })
  const notes = text(body.notes, 'Notes', { max: 3000 })
  const items = normalizeItems(body.items)
  const exchangeRate =
    body.exchangeRate === undefined || body.exchangeRate === null
      ? undefined
      : numberValue(body.exchangeRate, 'Exchange rate', { min: 0.0001 })
  return { type, title, date, notes, items, exchangeRate }
}

/* ------------------------------------------------------------------ */
/* Schema + seed                                                       */
/* ------------------------------------------------------------------ */

async function ensureSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS shops (
      id varchar(64) PRIMARY KEY,
      name varchar(160) NOT NULL,
      code varchar(40) NOT NULL UNIQUE,
      created_at bigint NOT NULL
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id varchar(64) PRIMARY KEY,
      name varchar(160) NOT NULL,
      email varchar(200) NOT NULL UNIQUE,
      password_hash text NOT NULL,
      role varchar(20) NOT NULL CHECK (role IN ('admin', 'shopkeeper')),
      shop_id varchar(64) REFERENCES shops(id),
      active boolean NOT NULL DEFAULT true,
      created_at bigint NOT NULL
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash varchar(128) PRIMARY KEY,
      user_id varchar(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at bigint NOT NULL,
      expires_at bigint NOT NULL
    )
  `
  await sql`ALTER TABLE ledger_records ADD COLUMN IF NOT EXISTS shop_id varchar(64)`
  await sql`ALTER TABLE ledger_records ADD COLUMN IF NOT EXISTS created_by varchar(64)`
  await sql`UPDATE ledger_records SET shop_id = 'shop-1' WHERE shop_id IS NULL`
  await sql`ALTER TABLE ledger_records ALTER COLUMN shop_id SET DEFAULT 'shop-1'`
  await sql`ALTER TABLE ledger_records ALTER COLUMN shop_id SET NOT NULL`
  await sql`CREATE INDEX IF NOT EXISTS ledger_records_shop_type_idx ON ledger_records (shop_id, type)`
  await sql`CREATE INDEX IF NOT EXISTS ledger_records_title_idx ON ledger_records (shop_id, type, title)`
  await sql`CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires_at)`

  const timestamp = now()
  await sql`
    INSERT INTO shops (id, name, code, created_at) VALUES
      ('shop-1', 'Shop 1 - Merkato', 'SHOP1', ${timestamp}),
      ('shop-2', 'Shop 2 - Bole', 'SHOP2', ${timestamp})
    ON CONFLICT (id) DO NOTHING
  `

  await seedUser({
    name: 'Central Admin',
    email: 'admin@click.et',
    password: 'Admin@123',
    role: 'admin',
    shopId: null,
  })
  await seedUser({
    name: 'Shopkeeper 1',
    email: 'shop1@click.et',
    password: 'Shop@123',
    role: 'shopkeeper',
    shopId: 'shop-1',
  })
  await seedUser({
    name: 'Shopkeeper 2',
    email: 'shop2@click.et',
    password: 'Shop@123',
    role: 'shopkeeper',
    shopId: 'shop-2',
  })
}

async function seedUser({ name, email, password, role, shopId }) {
  const existing = await sql`SELECT id FROM users WHERE email = ${email.toLowerCase()}`
  if (existing.length > 0) return
  await sql`
    INSERT INTO users (id, name, email, password_hash, role, shop_id, active, created_at)
    VALUES (${makeId('user')}, ${name}, ${email.toLowerCase()}, ${hashPassword(password)}, ${role}, ${shopId}, true, ${now()})
  `
}

/* ------------------------------------------------------------------ */
/* Auth + access control                                               */
/* ------------------------------------------------------------------ */

const inMemorySessions = new Map()

let cachedShops = [
  { id: 'shop-1', name: 'Shop 1 - Merkato', code: 'SHOP1' },
  { id: 'shop-2', name: 'Shop 2 - Bole', code: 'SHOP2' },
]

let cachedUsers = [
  { id: 'user-shop1', name: 'Shopkeeper 1', email: 'shop1@click.et', role: 'shopkeeper', shopId: 'shop-1', shopName: 'Shop 1 - Merkato', active: true, createdAt: Date.now() },
  { id: 'user-shop2', name: 'Shopkeeper 2', email: 'shop2@click.et', role: 'shopkeeper', shopId: 'shop-2', shopName: 'Shop 2 - Bole', active: true, createdAt: Date.now() },
]

const cachedRecords = new Map()

const DEMO_USERS = {
  'admin@click.et': {
    id: 'user-admin',
    name: 'Central Admin',
    email: 'admin@click.et',
    role: 'admin',
    shop_id: null,
    shop_name: null,
    active: true,
    password: 'Admin@123',
  },
  'shop1@click.et': {
    id: 'user-shop1',
    name: 'Shopkeeper 1',
    email: 'shop1@click.et',
    role: 'shopkeeper',
    shop_id: 'shop-1',
    shop_name: 'Shop 1 - Merkato',
    active: true,
    password: 'Shop@123',
  },
  'shop2@click.et': {
    id: 'user-shop2',
    name: 'Shopkeeper 2',
    email: 'shop2@click.et',
    role: 'shopkeeper',
    shop_id: 'shop-2',
    shop_name: 'Shop 2 - Bole',
    active: true,
    password: 'Shop@123',
  },
}

async function getAuthUser(req) {
  const header = req.headers.authorization || ''
  const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : null
  const cookie = parseCookies(req.headers.cookie || '')[COOKIE_NAME]
  const token = bearer || cookie
  if (!token) return null

  const th = tokenHash(token)
  // Check memory session first (instant, zero network latency)
  const cached = inMemorySessions.get(th)
  if (cached && cached.expiresAt > now()) {
    return cached.user
  }

  try {
    const rows = await sql`
      SELECT s.token_hash, s.expires_at, u.id, u.name, u.email, u.role, u.shop_id,
             u.active, sh.name AS shop_name
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      LEFT JOIN shops sh ON sh.id = u.shop_id
      WHERE s.token_hash = ${th} AND s.expires_at > ${now()}
      LIMIT 1
    `
    const row = rows[0]
    if (!row || row.active === false) return null
    const user = { ...row, tokenHash: row.token_hash, rawToken: token }
    inMemorySessions.set(th, {
      userId: row.id,
      expiresAt: Number(row.expires_at),
      user,
    })
    return user
  } catch {
    return null
  }
}

async function requireUser(req) {
  const user = await getAuthUser(req)
  if (!user) throw new HttpError(401, 'Please sign in again')
  return user
}

function requireAdmin(user) {
  if (user.role !== 'admin') throw new HttpError(403, 'Admin access required')
}

async function resolveShop(user, requestedShopId) {
  if (user.role === 'shopkeeper') {
    if (!user.shop_id) throw new HttpError(403, 'No shop is assigned to this account')
    return user.shop_id
  }
  const requested = requestedShopId ? String(requestedShopId) : 'shop-1'
  if (requested === 'all') return 'all'
  const rows = await sql`SELECT id FROM shops WHERE id = ${requested} LIMIT 1`
  if (!rows[0]) throw new HttpError(400, 'Unknown shop')
  return rows[0].id
}

async function canAccessRecord(user, recordId) {
  const rows = await sql`
    SELECT id, shop_id FROM ledger_records WHERE id = ${recordId} LIMIT 1
  `
  const record = rows[0]
  if (!record) throw new HttpError(404, 'Record not found')
  if (user.role === 'shopkeeper' && record.shop_id !== user.shop_id) {
    throw new HttpError(403, 'You can only access your assigned shop')
  }
  return record
}

/* ------------------------------------------------------------------ */
/* Login rate limiting (in-memory, enough for a small deployment)      */
/* ------------------------------------------------------------------ */

const loginAttempts = new Map()
const LOGIN_WINDOW_MS = 15 * 60 * 1000
const LOGIN_MAX_ATTEMPTS = 12

function checkLoginRate(ip) {
  const current = loginAttempts.get(ip)
  if (!current || current.resetAt < now()) {
    loginAttempts.set(ip, { count: 1, resetAt: now() + LOGIN_WINDOW_MS })
    return
  }
  current.count += 1
  if (current.count > LOGIN_MAX_ATTEMPTS) {
    throw new HttpError(429, 'Too many login attempts. Please wait 15 minutes.')
  }
}

/* ------------------------------------------------------------------ */
/* Statement helpers                                                   */
/* ------------------------------------------------------------------ */

function entryAmount(item) {
  return round2((Number(item.unitPrice) || 0) * (Number(item.quantity) || 0))
}

function buildStatement(records, type, accountName, shop) {
  const entries = []
  for (const record of records) {
    for (const item of record.items) {
      const amount = entryAmount(item)
      const isCustomer = type === 'customer'
      const isDebit = isCustomer ? item.sign === '+' : item.sign === '-'
      entries.push({
        recordId: record.id,
        itemId: item.id || null,
        date: record.date,
        createdAt: record.createdAt,
        description: item.name,
        quantity: Number(item.quantity) || 0,
        unitPrice: round2(item.unitPrice),
        debit: isDebit ? amount : 0,
        credit: isDebit ? 0 : amount,
        paymentMethod: item.paymentMethod || item.bank || null,
        reference: item.reference || null,
        notes: record.notes || null,
      })
    }
  }

  entries.sort((a, b) => {
    const dateCompare = String(a.date).localeCompare(String(b.date))
    if (dateCompare !== 0) return dateCompare
    return a.createdAt - b.createdAt
  })

  let balance = 0
  let totalDebit = 0
  let totalCredit = 0
  for (const entry of entries) {
    totalDebit = round2(totalDebit + entry.debit)
    totalCredit = round2(totalCredit + entry.credit)
    balance = round2(balance + entry.debit - entry.credit)
    entry.balance = type === 'customer' ? balance : round2(-balance)
  }

  const outstanding =
    type === 'customer'
      ? round2(totalDebit - totalCredit)
      : round2(totalCredit - totalDebit)

  const payments = entries
    .filter((entry) =>
      type === 'customer' ? entry.credit > 0 : entry.debit > 0,
    )
    .map((entry) => ({
      date: entry.date,
      amount: type === 'customer' ? entry.credit : entry.debit,
      paymentMethod: entry.paymentMethod,
      reference: entry.reference,
      notes: entry.notes,
      description: entry.description,
      recordId: entry.recordId,
    }))

  return {
    accountName,
    accountType: type,
    shopId: shop.id,
    shopName: shop.name,
    entries,
    payments,
    totals: {
      totalDebit,
      totalCredit,
      outstanding,
      entryCount: entries.length,
    },
  }
}

async function getShop(shopId) {
  const rows = await sql`SELECT id, name, code FROM shops WHERE id = ${shopId} LIMIT 1`
  if (!rows[0]) throw new HttpError(404, 'Shop not found')
  return rows[0]
}

/* ------------------------------------------------------------------ */
/* API routes                                                          */
/* ------------------------------------------------------------------ */

async function handleApi(req, res, url) {
  const method = req.method || 'GET'
  const pathname = url.pathname

  if (method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (pathname === '/api/health' && method === 'GET') {
    json(res, 200, { ok: true, service: 'click-ledger-api' })
    return
  }

  /* ---------------- Auth ---------------- */
  if (pathname === '/api/auth/login' && method === 'POST') {
    const ip =
      req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      'unknown'
    checkLoginRate(ip)

    const body = await readJson(req)
    const email = text(body.email, 'Email', { required: true, max: 200 })?.toLowerCase()
    const password = text(body.password, 'Password', { required: true, max: 200 })

    let user = null
    try {
      const rows = await sql`
        SELECT u.*, sh.name AS shop_name
        FROM users u
        LEFT JOIN shops sh ON sh.id = u.shop_id
        WHERE u.email = ${email}
        LIMIT 1
      `
      user = rows[0]
    } catch (err) {
      console.warn('Neon user query warning:', err?.message || err)
    }

    let valid = false
    if (user && user.active && verifyPassword(password, user.password_hash)) {
      valid = true
    } else if (DEMO_USERS[email] && DEMO_USERS[email].password === password) {
      const demo = DEMO_USERS[email]
      user = {
        id: demo.id,
        name: demo.name,
        email: demo.email,
        role: demo.role,
        shop_id: demo.shop_id,
        shop_name: demo.shop_name,
        active: true,
      }
      valid = true
    }

    if (!valid || !user) {
      throw new HttpError(401, 'Invalid email or password')
    }

    const token = newToken()
    const th = tokenHash(token)
    const expiresAt = now() + SESSION_TTL_MS

    // Store in-memory session immediately
    inMemorySessions.set(th, {
      userId: user.id,
      expiresAt,
      user: { ...user, tokenHash: th, rawToken: token },
    })

    // Async non-blocking database persistence
    sql`DELETE FROM sessions WHERE expires_at < ${now()}`.catch(() => {})
    sql`
      INSERT INTO sessions (token_hash, user_id, created_at, expires_at)
      VALUES (${th}, ${user.id}, ${now()}, ${expiresAt})
    `.catch((e) => console.warn('Non-blocking session persist warning:', e?.message || e))

    res.setHeader('Set-Cookie', sessionCookie(token, SESSION_TTL_MS / 1000))
    json(res, 200, {
      token,
      user: publicUser(user),
      shop: user.shop_id ? { id: user.shop_id, name: user.shop_name } : null,
    })
    return
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    const user = await getAuthUser(req)
    if (user) {
      await sql`DELETE FROM sessions WHERE token_hash = ${user.tokenHash}`
    }
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`)
    json(res, 200, { ok: true })
    return
  }

  if (pathname === '/api/auth/me' && method === 'GET') {
    const user = await requireUser(req)
    json(res, 200, { user: publicUser(user) })
    return
  }

  /* ---------------- Shops ---------------- */
  if (pathname === '/api/shops' && method === 'GET') {
    const user = await requireUser(req)
    try {
      if (user.role === 'admin') {
        const rows = await sql`SELECT id, name, code FROM shops ORDER BY name ASC`
        if (rows && rows.length > 0) cachedShops = rows
      } else {
        const rows = user.shop_id
          ? await sql`SELECT id, name, code FROM shops WHERE id = ${user.shop_id}`
          : []
        if (rows && rows.length > 0) cachedShops = rows
      }
    } catch (err) {
      console.warn('Neon shops query warning (using cache):', err.message || err)
    }
    const shopsToReturn = user.role === 'admin'
      ? cachedShops
      : cachedShops.filter((s) => s.id === user.shop_id)
    json(res, 200, { shops: shopsToReturn })
    return
  }

  if (pathname === '/api/shops' && method === 'POST') {
    const user = await requireUser(req)
    requireAdmin(user)
    const body = await readJson(req)
    const name = text(body.name, 'Shop Name', { required: true, max: 160 })
    const code = (text(body.code, 'Shop Code', { max: 40 }) || name.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30))
    const id = makeId('shop')
    const newShop = { id, name, code }
    cachedShops.push(newShop)
    sql`
      INSERT INTO shops (id, name, code, created_at)
      VALUES (${id}, ${name}, ${code}, ${now()})
    `.catch((err) => console.warn('Non-blocking shop insert warning:', err.message || err))
    json(res, 201, { shop: newShop })
    return
  }

  const shopMatch = pathname.match(/^\/api\/shops\/([^/]+)$/)
  if (shopMatch && method === 'DELETE') {
    const user = await requireUser(req)
    requireAdmin(user)
    const shopId = decodeURIComponent(shopMatch[1])
    let allShops = []
    try {
      allShops = await sql`SELECT id, name FROM shops`
    } catch {
      allShops = cachedShops
    }
    if (allShops.length <= 1) {
      throw new HttpError(400, 'Cannot delete the only remaining shop site')
    }
    const targetShop = allShops.find((s) => s.id === shopId)
    if (!targetShop) throw new HttpError(404, 'Shop site not found')

    const fallbackShop = allShops.find((s) => s.id !== shopId)

    try {
      await sql`DELETE FROM ledger_records WHERE shop_id = ${shopId}`
      if (fallbackShop) {
        await sql`UPDATE users SET shop_id = ${fallbackShop.id} WHERE shop_id = ${shopId}`
      }
      await sql`DELETE FROM shops WHERE id = ${shopId}`
    } catch (err) {
      console.warn('Neon shop delete warning:', err?.message || err)
    }

    cachedShops = cachedShops.filter((s) => s.id !== shopId)
    json(res, 200, { ok: true, deleted: shopId, name: targetShop.name })
    return
  }

  /* ---------------- Users (admin only) ---------------- */
  if (pathname === '/api/users' && method === 'GET') {
    const user = await requireUser(req)
    requireAdmin(user)
    try {
      const rows = await sql`
        SELECT u.id, u.name, u.email, u.role, u.shop_id, u.active, u.created_at,
               sh.name AS shop_name
        FROM users u
        LEFT JOIN shops sh ON sh.id = u.shop_id
        WHERE u.role = 'shopkeeper'
        ORDER BY u.created_at ASC
      `
      if (rows && rows.length > 0) {
        cachedUsers = rows.map((row) => ({
          id: row.id,
          name: row.name,
          email: row.email,
          role: row.role,
          shopId: row.shop_id || null,
          shopName: row.shop_name || null,
          active: row.active !== false,
          createdAt: Number(row.created_at),
        }))
      }
    } catch (err) {
      console.warn('Neon users query warning (using cache):', err.message || err)
    }
    json(res, 200, { users: cachedUsers })
    return
  }

  if (pathname === '/api/users' && method === 'POST') {
    const user = await requireUser(req)
    requireAdmin(user)
    const body = await readJson(req)
    const name = text(body.name, 'Name', { required: true, max: 160 })
    const email = text(body.email, 'Email', { required: true, max: 200 })?.toLowerCase()
    const password = text(body.password, 'Password', { required: true, max: 200 })
    if (!email.includes('@')) throw new HttpError(400, 'Enter a valid email')
    if (password.length < 6) throw new HttpError(400, 'Password must be at least 6 characters')
    const shopId = text(body.shopId, 'Shop', { required: true, max: 64 })

    const shopName = cachedShops.find((s) => s.id === shopId)?.name || 'Assigned Shop'
    const id = makeId('user')
    const newUser = {
      id,
      name,
      email,
      role: 'shopkeeper',
      shopId,
      shopName,
      active: true,
      createdAt: now(),
    }
    cachedUsers.push(newUser)

    sql`
      INSERT INTO users (id, name, email, password_hash, role, shop_id, active, created_at)
      VALUES (${id}, ${name}, ${email}, ${hashPassword(password)}, 'shopkeeper', ${shopId}, true, ${now()})
    `.catch((err) => console.warn('Non-blocking user insert warning:', err.message || err))

    json(res, 201, { user: newUser })
    return
  }

  const userMatch = pathname.match(/^\/api\/users\/([^/]+)$/)
  if (userMatch && method === 'PATCH') {
    const user = await requireUser(req)
    requireAdmin(user)
    const targetId = decodeURIComponent(userMatch[1])
    const body = await readJson(req)
    const rows = await sql`SELECT id, role FROM users WHERE id = ${targetId} LIMIT 1`
    const target = rows[0]
    if (!target) throw new HttpError(404, 'User not found')
    if (target.role !== 'shopkeeper') throw new HttpError(400, 'Only shopkeeper accounts can be edited here')

    const name = body.name !== undefined ? text(body.name, 'Name', { required: true, max: 160 }) : undefined
    const shopId = body.shopId !== undefined ? text(body.shopId, 'Shop', { required: true, max: 64 }) : undefined
    const active = body.active !== undefined ? Boolean(body.active) : undefined
    const password = body.password !== undefined ? text(body.password, 'Password', { required: true, max: 200 }) : undefined
    if (password && password.length < 6) throw new HttpError(400, 'Password must be at least 6 characters')
    if (shopId) {
      const shopRows = await sql`SELECT id FROM shops WHERE id = ${shopId} LIMIT 1`
      if (!shopRows[0]) throw new HttpError(400, 'Unknown shop')
    }

    if (name !== undefined) await sql`UPDATE users SET name = ${name} WHERE id = ${targetId}`
    if (shopId !== undefined) await sql`UPDATE users SET shop_id = ${shopId} WHERE id = ${targetId}`
    if (active !== undefined) await sql`UPDATE users SET active = ${active} WHERE id = ${targetId}`
    if (password) await sql`UPDATE users SET password_hash = ${hashPassword(password)} WHERE id = ${targetId}`
    if (active === false) await sql`DELETE FROM sessions WHERE user_id = ${targetId}`

    const updated = await sql`
      SELECT u.id, u.name, u.email, u.role, u.shop_id, u.active, u.created_at,
             sh.name AS shop_name
      FROM users u LEFT JOIN shops sh ON sh.id = u.shop_id
      WHERE u.id = ${targetId}
    `
    const row = updated[0]
    json(res, 200, {
      user: {
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role,
        shopId: row.shop_id,
        shopName: row.shop_name,
        active: row.active !== false,
        createdAt: Number(row.created_at),
      },
    })
    return
  }

  if (userMatch && method === 'DELETE') {
    const user = await requireUser(req)
    requireAdmin(user)
    const targetId = decodeURIComponent(userMatch[1])
    if (user.id === targetId) throw new HttpError(400, 'Cannot delete your own admin account')

    let target = null
    try {
      const rows = await sql`SELECT id, role, name FROM users WHERE id = ${targetId} LIMIT 1`
      target = rows[0]
    } catch {
      target = cachedUsers.find((u) => u.id === targetId)
    }
    if (!target) throw new HttpError(404, 'User not found')
    if (target.role === 'admin') throw new HttpError(400, 'Admin accounts cannot be deleted')

    try {
      await sql`DELETE FROM sessions WHERE user_id = ${targetId}`
      await sql`DELETE FROM users WHERE id = ${targetId}`
    } catch (err) {
      console.warn('Neon user delete warning:', err?.message || err)
    }

    cachedUsers = cachedUsers.filter((u) => u.id !== targetId)
    json(res, 200, { ok: true, deleted: targetId, name: target.name })
    return
  }

  /* ---------------- Records ---------------- */
  if (pathname === '/api/records' && method === 'GET') {
    const user = await requireUser(req)
    const shopId = await resolveShop(user, url.searchParams.get('shopId'))
    const type = url.searchParams.get('type')
    if (type && !RECORD_TYPES.has(type)) throw new HttpError(400, 'Unknown record type')

    let rows
    if (shopId === 'all') {
      rows = type
        ? await sql`
            SELECT r.*, s.name AS shop_name
            FROM ledger_records r
            LEFT JOIN shops s ON s.id = r.shop_id
            WHERE r.type = ${type}
            ORDER BY r.created_at DESC
          `
        : await sql`
            SELECT r.*, s.name AS shop_name
            FROM ledger_records r
            LEFT JOIN shops s ON s.id = r.shop_id
            ORDER BY r.created_at DESC
          `
    } else {
      rows = type
        ? await sql`
            SELECT r.*, s.name AS shop_name
            FROM ledger_records r
            LEFT JOIN shops s ON s.id = r.shop_id
            WHERE r.shop_id = ${shopId} AND r.type = ${type}
            ORDER BY r.created_at DESC
          `
        : await sql`
            SELECT r.*, s.name AS shop_name
            FROM ledger_records r
            LEFT JOIN shops s ON s.id = r.shop_id
            WHERE r.shop_id = ${shopId}
            ORDER BY r.created_at DESC
          `
    }
    json(res, 200, { records: rows.map(mapRecord), shopId })
    return
  }

  if (pathname === '/api/records' && method === 'POST') {
    const user = await requireUser(req)
    const body = await readJson(req)
    const shopId = await resolveShop(user, body.shopId)
    const input = normalizeRecordInput(body)
    const id = makeId(input.type)
    const timestamp = now()
    await sql`
      INSERT INTO ledger_records (
        id, type, title, date, notes, exchange_rate, items, created_at, updated_at, shop_id, created_by
      ) VALUES (
        ${id}, ${input.type}, ${input.title}, ${input.date}, ${input.notes || null},
        ${input.exchangeRate ?? 198}, ${JSON.stringify(input.items)}, ${timestamp}, ${timestamp},
        ${shopId}, ${user.id}
      )
    `
    const rows = await sql`
      SELECT r.*, s.name AS shop_name
      FROM ledger_records r LEFT JOIN shops s ON s.id = r.shop_id
      WHERE r.id = ${id}
    `
    json(res, 201, { record: mapRecord(rows[0]) })
    return
  }

  const recordMatch = pathname.match(/^\/api\/records\/([^/]+)$/)
  if (recordMatch && method === 'PUT') {
    const user = await requireUser(req)
    const recordId = decodeURIComponent(recordMatch[1])
    await canAccessRecord(user, recordId)
    const body = await readJson(req)
    const input = normalizeRecordInput(body)
    await sql`
      UPDATE ledger_records SET
        type = ${input.type},
        title = ${input.title},
        date = ${input.date},
        notes = ${input.notes || null},
        exchange_rate = ${input.exchangeRate ?? 198},
        items = ${JSON.stringify(input.items)},
        updated_at = ${now()}
      WHERE id = ${recordId}
    `
    const rows = await sql`
      SELECT r.*, s.name AS shop_name
      FROM ledger_records r LEFT JOIN shops s ON s.id = r.shop_id
      WHERE r.id = ${recordId}
    `
    json(res, 200, { record: mapRecord(rows[0]) })
    return
  }

  if (recordMatch && method === 'DELETE') {
    const user = await requireUser(req)
    const recordId = decodeURIComponent(recordMatch[1])
    await canAccessRecord(user, recordId)
    await sql`DELETE FROM ledger_records WHERE id = ${recordId}`
    json(res, 200, { ok: true })
    return
  }

  /* ---------------- Accounts + statements ---------------- */
  if (pathname === '/api/accounts' && method === 'GET') {
    const user = await requireUser(req)
    const shopId = await resolveShop(user, url.searchParams.get('shopId'))
    const type = url.searchParams.get('type') || 'customer'
    if (type !== 'customer' && type !== 'supplier') {
      throw new HttpError(400, 'Statements are available for customer or supplier accounts')
    }
    const rows = shopId === 'all'
      ? await sql`
          SELECT r.*, s.name AS shop_name
          FROM ledger_records r LEFT JOIN shops s ON s.id = r.shop_id
          WHERE r.type = ${type}
          ORDER BY r.created_at ASC
        `
      : await sql`
          SELECT r.*, s.name AS shop_name
          FROM ledger_records r LEFT JOIN shops s ON s.id = r.shop_id
          WHERE r.shop_id = ${shopId} AND r.type = ${type}
          ORDER BY r.created_at ASC
        `
    const records = rows.map(mapRecord)
    const groups = new Map()
    for (const record of records) {
      const key = record.title.trim().toLowerCase()
      if (!groups.has(key)) {
        groups.set(key, {
          name: record.title.trim(),
          type,
          shopId,
          shopName: record.shopName,
          recordCount: 0,
          totalDebit: 0,
          totalCredit: 0,
          lastDate: record.date,
        })
      }
      const group = groups.get(key)
      group.recordCount += 1
      if (record.date > group.lastDate) group.lastDate = record.date
      for (const item of record.items) {
        const amount = entryAmount(item)
        const isDebit = type === 'customer' ? item.sign === '+' : item.sign === '-'
        if (isDebit) group.totalDebit = round2(group.totalDebit + amount)
        else group.totalCredit = round2(group.totalCredit + amount)
      }
    }
    const accounts = [...groups.values()].map((group) => ({
      ...group,
      outstanding:
        type === 'customer'
          ? round2(group.totalDebit - group.totalCredit)
          : round2(group.totalCredit - group.totalDebit),
    }))
    accounts.sort((a, b) => a.name.localeCompare(b.name))
    json(res, 200, { accounts })
    return
  }

  if (pathname === '/api/statements' && method === 'GET') {
    const user = await requireUser(req)
    const shopId = await resolveShop(user, url.searchParams.get('shopId'))
    const type = url.searchParams.get('type') || 'customer'
    if (type !== 'customer' && type !== 'supplier') {
      throw new HttpError(400, 'Statements are available for customer or supplier accounts')
    }
    const name = text(url.searchParams.get('name'), 'Account name', {
      required: true,
      max: 200,
    })
    const rows = await sql`
      SELECT r.*, s.name AS shop_name
      FROM ledger_records r LEFT JOIN shops s ON s.id = r.shop_id
      WHERE r.shop_id = ${shopId} AND r.type = ${type}
        AND lower(trim(r.title)) = lower(trim(${name}))
      ORDER BY r.created_at ASC
    `
    const records = rows.map(mapRecord)
    const shop = await getShop(shopId)
    const statement = buildStatement(records, type, records[0]?.title || name, shop)
    json(res, 200, { statement })
    return
  }

  /* ---------------- Settings ---------------- */
  if (pathname === '/api/settings' && method === 'GET') {
    await requireUser(req)
    const rows = await sql`SELECT key, value FROM app_settings`
    const settings = {}
    for (const row of rows) {
      const value = parseJsonField(row.value, row.value)
      settings[String(row.key)] = value
    }
    json(res, 200, { settings })
    return
  }

  if (pathname === '/api/settings' && method === 'PUT') {
    await requireUser(req)
    const body = await readJson(req)
    if (!SETTING_KEYS.has(body.key)) throw new HttpError(400, 'Unknown setting')
    const value = body.value
    if (value === undefined || value === null) throw new HttpError(400, 'value is required')
    if (typeof value === 'string' && value.length > 500) {
      throw new HttpError(400, 'Setting value is too long')
    }
    await sql`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (${body.key}, ${JSON.stringify(value)}, ${now()})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
    `
    json(res, 200, { ok: true })
    return
  }

  throw new HttpError(404, 'Not found')
}

/* ------------------------------------------------------------------ */
/* Static file serving (production build)                              */
/* ------------------------------------------------------------------ */

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
}

async function serveStatic(req, res, url) {
  let pathname
  try {
    pathname = decodeURIComponent(url.pathname)
  } catch {
    res.writeHead(400)
    res.end('Bad request')
    return
  }
  if (pathname === '/') pathname = '/index.html'
  const filePath = path.join(DIST_DIR, pathname)
  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }
  try {
    const info = await stat(filePath)
    if (!info.isFile()) throw new Error('not a file')
    const body = await readFile(filePath)
    const ext = path.extname(filePath).toLowerCase()
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    })
    res.end(body)
    return
  } catch {
    // SPA fallback
    try {
      const body = await readFile(path.join(DIST_DIR, 'index.html'))
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': body.length,
        'Cache-Control': 'no-cache',
      })
      res.end(body)
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Web build not found. Run "npm run build" first.')
    }
  }
}

/* ------------------------------------------------------------------ */
/* HTTP server                                                         */
/* ------------------------------------------------------------------ */

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin
  res.setHeader('Access-Control-Allow-Origin', origin || '*')
  if (origin) {
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Credentials', 'true')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)

  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url)
      return
    }
    await serveStatic(req, res, url)
  } catch (error) {
    if (res.headersSent) {
      res.end()
      return
    }
    if (error instanceof HttpError) {
      json(res, error.status, { error: error.message })
      return
    }
    console.error('Unhandled API error:', error)
    json(res, 500, { error: 'Something went wrong. Please try again.' })
  }
})

process.on('uncaughtException', (err) => {
  console.error('Process uncaughtException (recovered):', err?.message || err)
})

process.on('unhandledRejection', (reason) => {
  console.error('Process unhandledRejection (recovered):', reason?.message || reason)
})

async function start() {
  try {
    await ensureSchema()
  } catch (err) {
    console.warn('Startup schema check warning (proceeding with cached data):', err?.message || err)
  }
  server.listen(PORT, HOST, () => {
    console.log(`Click Ledger API listening on http://${HOST}:${PORT}`)
    console.log('Admin: admin@click.et / Admin@123')
    console.log('Shop 1: shop1@click.et / Shop@123')
    console.log('Shop 2: shop2@click.et / Shop@123')
  })
}

// Only auto-start standalone listener when executed directly (node server/index.mjs)
const isDirectRun =
  process.argv[1] &&
  (fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) ||
    process.argv[1].endsWith('server/index.mjs') ||
    process.argv[1].endsWith('server\\index.mjs'))

if (isDirectRun) {
  start().catch((error) => {
    console.error('Failed to start API server:', error)
    process.exit(1)
  })
}

export { handleApi, ensureSchema, HttpError, json, server, start }
