import { neon, neonConfig } from '@neondatabase/serverless'
import type { CurrencyCode, LedgerRecord, RateMode } from '../types/ledger'

// Suppress browser direct SQL warning
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

export interface DbSettings {
  currency?: CurrencyCode
  rateMode?: RateMode
  blackMarketRate?: number
  bankRate?: number
}

// Safely parse JSON or preserve already-parsed/primitive values
function parseJsonField<T>(val: unknown, fallback: T): T {
  if (val === null || val === undefined) return fallback
  if (typeof val === 'object') return val as T
  if (typeof val === 'string') {
    try {
      return JSON.parse(val) as T
    } catch {
      // It is already a plain string value (e.g. "ETB", "bank")
      return val as unknown as T
    }
  }
  return val as unknown as T
}

// Fetch all records from Neon PostgreSQL
export async function fetchRecordsFromNeon(): Promise<LedgerRecord[]> {
  const sql = getSql()
  const rows = await sql`
    SELECT id, type, title, date, notes, exchange_rate, items, created_at, updated_at
    FROM ledger_records
    ORDER BY created_at DESC
  `

  return rows.map((row) => ({
    id: String(row.id),
    type: row.type as LedgerRecord['type'],
    title: String(row.title),
    date: String(row.date),
    notes: row.notes ? String(row.notes) : undefined,
    exchangeRate: row.exchange_rate ? Number(row.exchange_rate) : 198,
    items: parseJsonField<LedgerRecord['items']>(row.items, []),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }))
}

// Insert or update a single record into Neon PostgreSQL
export async function saveRecordToNeon(record: LedgerRecord): Promise<void> {
  const sql = getSql()
  await sql`
    INSERT INTO ledger_records (
      id, type, title, date, notes, exchange_rate, items, created_at, updated_at
    ) VALUES (
      ${record.id},
      ${record.type},
      ${record.title},
      ${record.date},
      ${record.notes || null},
      ${record.exchangeRate || 198},
      ${JSON.stringify(record.items)},
      ${record.createdAt},
      ${record.updatedAt}
    )
    ON CONFLICT (id) DO UPDATE SET
      type = EXCLUDED.type,
      title = EXCLUDED.title,
      date = EXCLUDED.date,
      notes = EXCLUDED.notes,
      exchange_rate = EXCLUDED.exchange_rate,
      items = EXCLUDED.items,
      updated_at = EXCLUDED.updated_at
  `
}

// Delete a record from Neon PostgreSQL
export async function deleteRecordFromNeon(id: string): Promise<void> {
  const sql = getSql()
  await sql`
    DELETE FROM ledger_records
    WHERE id = ${id}
  `
}

// Fetch settings from Neon
export async function fetchSettingsFromNeon(): Promise<DbSettings> {
  const sql = getSql()
  const rows = await sql`
    SELECT key, value
    FROM app_settings
  `

  const settings: DbSettings = {}
  for (const row of rows) {
    const key = String(row.key)
    const val = parseJsonField(row.value, row.value)
    if (key === 'currency') settings.currency = val as CurrencyCode
    if (key === 'rate_mode') settings.rateMode = val as RateMode
    if (key === 'black_market_rate') settings.blackMarketRate = Number(val)
    if (key === 'bank_rate') settings.bankRate = Number(val)
  }
  return settings
}

// Save a setting to Neon
export async function saveSettingToNeon(
  key: 'currency' | 'rate_mode' | 'black_market_rate' | 'bank_rate',
  value: any,
): Promise<void> {
  const sql = getSql()
  await sql`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (${key}, ${JSON.stringify(value)}, ${Date.now()})
    ON CONFLICT (key) DO UPDATE SET
      value = EXCLUDED.value,
      updated_at = EXCLUDED.updated_at
  `
}
