export type TabType = 'customer' | 'supplier' | 'stock'

export type SignType = '+' | '-'

export type CurrencyCode = 'ETB' | 'USD' | 'EUR' | 'GBP'

export type RateMode = 'black_market' | 'bank'

export type SyncStatus = 'synced' | 'syncing' | 'offline'

export interface LineItem {
  id: string
  name: string
  unitPrice: number
  quantity: number
  sign: SignType
}

export interface LedgerRecord {
  id: string
  type: TabType
  title: string
  date: string
  notes?: string
  exchangeRate?: number
  items: LineItem[]
  createdAt: number
  updatedAt: number
}

export interface LedgerStats {
  grandTotal: number
  totalItemsCount: number
  recordCount: number
  positiveTotal: number
  negativeTotal: number
}
