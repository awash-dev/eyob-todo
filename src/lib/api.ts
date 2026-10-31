import type {
  AccountSummary,
  AuthUser,
  LedgerRecord,
  Shop,
  Statement,
  TabType,
} from '../types/ledger'

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
const TOKEN_KEY = 'click_ledger_token'

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
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Ignore storage failures (private mode).
  }
}

export function onUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener)
  return () => unauthorizedListeners.delete(listener)
}

function notifyUnauthorized() {
  for (const listener of unauthorizedListeners) listener()
}

async function request<T>(
  path: string,
  options: RequestInit & { skipAuth?: boolean } = {},
): Promise<T> {
  const headers = new Headers(options.headers)
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json')
  }
  const token = options.skipAuth ? null : loadStoredToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      credentials: 'include',
    })
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection.')
  }

  const contentType = response.headers.get('content-type') || ''
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : null

  if (!response.ok) {
    if (response.status === 401) notifyUnauthorized()
    throw new ApiError(
      response.status,
      payload?.error || `Request failed (${response.status})`,
    )
  }

  return payload as T
}

/* ------------------------------- Auth ------------------------------- */

export interface LoginResponse {
  token: string
  user: AuthUser
  shop: { id: string; name: string } | null
}

export async function login(email: string, password: string) {
  const data = await request<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
    skipAuth: true,
  })
  setAuthToken(data.token)
  return data
}

export async function logout() {
  try {
    await request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' })
  } finally {
    setAuthToken(null)
  }
}

export async function getMe() {
  return request<{ user: AuthUser }>('/api/auth/me')
}

/* ------------------------------- Shops ------------------------------ */

export async function getShops() {
  return request<{ shops: Shop[] }>('/api/shops')
}

export async function createShop(name: string, code?: string) {
  return request<{ shop: Shop }>('/api/shops', {
    method: 'POST',
    body: JSON.stringify({ name, code }),
  })
}

export async function deleteShop(id: string) {
  return request<{ ok: boolean; deleted: string; name: string }>(
    `/api/shops/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
    },
  )
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

export async function getUsers() {
  return request<{ users: Shopkeeper[] }>('/api/users')
}

export async function createUser(input: {
  name: string
  email: string
  password: string
  shopId: string
}) {
  return request<{ user: Shopkeeper }>('/api/users', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function updateUser(
  id: string,
  input: Partial<{
    name: string
    password: string
    shopId: string
    active: boolean
  }>,
) {
  return request<{ user: Shopkeeper }>(`/api/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export async function deleteUser(id: string) {
  return request<{ ok: boolean; deleted: string; name: string }>(
    `/api/users/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
    },
  )
}

/* ------------------------------ Records ----------------------------- */

export async function getRecords(type?: TabType, shopId?: string | null) {
  const params = new URLSearchParams()
  if (type) params.set('type', type)
  if (shopId) params.set('shopId', shopId)
  return request<{ records: LedgerRecord[]; shopId: string }>(
    `/api/records?${params.toString()}`,
  )
}

export async function createRecord(
  record: Omit<LedgerRecord, 'id' | 'createdAt' | 'updatedAt'>,
  shopId?: string | null,
) {
  return request<{ record: LedgerRecord }>('/api/records', {
    method: 'POST',
    body: JSON.stringify({ ...record, shopId: shopId || undefined }),
  })
}

export async function updateRecord(
  id: string,
  record: Omit<LedgerRecord, 'id' | 'createdAt' | 'updatedAt'>,
) {
  return request<{ record: LedgerRecord }>(
    `/api/records/${encodeURIComponent(id)}`,
    {
      method: 'PUT',
      body: JSON.stringify(record),
    },
  )
}

export async function deleteRecord(id: string) {
  return request<{ ok: boolean }>(`/api/records/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

/* --------------------------- Accounts / statements ------------------ */

export async function getAccounts(
  type: 'customer' | 'supplier',
  shopId?: string | null,
) {
  const params = new URLSearchParams({ type })
  if (shopId) params.set('shopId', shopId)
  return request<{ accounts: AccountSummary[] }>(
    `/api/accounts?${params.toString()}`,
  )
}

export async function getStatement(
  type: 'customer' | 'supplier',
  name: string,
  shopId?: string | null,
) {
  const params = new URLSearchParams({ type, name })
  if (shopId) params.set('shopId', shopId)
  return request<{ statement: Statement }>(
    `/api/statements?${params.toString()}`,
  )
}

/* ------------------------------ Settings ---------------------------- */

export async function getSettings() {
  return request<{ settings: Record<string, unknown> }>('/api/settings')
}

export async function saveSetting(key: string, value: unknown) {
  return request<{ ok: boolean }>('/api/settings', {
    method: 'PUT',
    body: JSON.stringify({ key, value }),
  })
}
