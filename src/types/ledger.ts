export type TabType = 'customer' | 'supplier' | 'stock' | 'delala'

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
  bank?: string
  customType?: string
  customs?: number
  cartons?: number
  pcsPerCarton?: number
  pcsPrice?: number // Price per individual piece
  paymentMethod?: string
  reference?: string
  packagingUnit?: string
  date?: string
  notes?: string
}

export interface LedgerRecord {
  id: string
  type: TabType
  title: string
  date: string
  notes?: string
  exchangeRate?: number
  items: LineItem[]
  shopId?: string
  shopName?: string
  createdAt: number
  updatedAt: number
}

export type UserRole = 'admin' | 'shopkeeper'

export interface AuthUser {
  id: string
  name: string
  phone: string
  email?: string
  role: UserRole
  shopId: string | null
  shopName: string | null
  active: boolean
}

export interface Shop {
  id: string
  name: string
  code: string
}

export interface AccountSummary {
  name: string
  type: 'customer' | 'supplier'
  shopId: string
  shopName: string
  recordCount: number
  totalDebit: number
  totalCredit: number
  outstanding: number
  lastDate: string
}

export interface StatementEntry {
  recordId: string
  itemId: string | null
  date: string
  description: string
  quantity: number
  unitPrice: number
  debit: number
  credit: number
  balance: number
  paymentMethod: string | null
  reference: string | null
  notes: string | null
}

export interface StatementPayment {
  date: string
  amount: number
  paymentMethod: string | null
  reference: string | null
  notes: string | null
  description: string
  recordId: string
}

export interface Statement {
  accountName: string
  accountType: 'customer' | 'supplier'
  shopId: string
  shopName: string
  entries: StatementEntry[]
  payments: StatementPayment[]
  totals: {
    totalDebit: number
    totalCredit: number
    outstanding: number
    entryCount: number
  }
}

export interface LedgerStats {
  grandTotal: number
  totalItemsCount: number
  recordCount: number
  positiveTotal: number
  negativeTotal: number
}
