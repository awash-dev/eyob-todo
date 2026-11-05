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
  invoiceId?: string
  isAdvance?: boolean
  allocatedAmount?: number
  amount?: number
  isPayment?: boolean
}

export interface LedgerRecord {
  id: string
  type: TabType
  title: string
  date: string
  notes?: string
  exchangeRate?: number
  items: LineItem[]
  storeId?: string
  storeName?: string
  createdAt: number
  updatedAt: number
  phone?: string
  address?: string
}

export type UserRole = 'admin' | 'storekeeper'

export interface AuthUser {
  id: string
  name: string
  phone: string
  email?: string
  role: UserRole
  storeId: string | null
  storeName: string | null
  active: boolean
}

export interface Store {
  id: string
  name: string
  code: string
}

export interface AccountSummary {
  name: string
  type: 'customer' | 'supplier'
  storeId: string
  storeName: string
  recordCount: number
  totalDebit: number
  totalCredit: number
  outstanding: number
  advanceBalance: number
  lastDate: string
  phone?: string
  address?: string
  notes?: string
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
  storeId: string
  storeName: string
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

export interface EsmizRecord {
  id: string
  title: string
  referenceId?: string | null
  createdBy?: string | null
  createdAt: string | number
  updatedAt: string | number
}

export interface EsmizEntry {
  id: string
  esmizId: string
  description: string
  amount: number
  sign: -1 | 1
  position: number
  transactionDate: string
  createdAt: string | number
  updatedAt: string | number
}


// ============================================================================
// SMART INVENTORY & PRODUCT CATALOG TYPES
// ============================================================================
export interface StoreInventoryItem {
  id: string
  storeId?: string
  productName: string
  sku?: string
  category?: string
  baseUnit: string
  currentQuantity: number
  minimumStock: number
  unitPrice: number
  costPrice: number
  pcsPerCarton: number
  supplierName?: string
  lastTransactionDate?: string
  description?: string
  createdBy?: string
  createdAt?: string
  updatedAt?: string
  // Kena Store Product schema fields
  quantityCartons: number
  quantityPerCarton: number
  totalQuantity: number
  unit: string
  pricePerPiece: number
  totalValue: number
  isActive: boolean
  updatedBy?: string
}

export interface NewProductInput {
  storeId?: string
  /** Authenticated user performing the registration (recorded for audit). */
  createdBy?: string
  productName: string
  sku?: string
  category?: string
  baseUnit?: string
  initialQuantity?: number
  minimumStock?: number
  unitPrice?: number
  costPrice?: number
  pcsPerCarton?: number
  supplierName?: string
  description?: string
  englishName?: string
  amharicName?: string
  // Kena Store Product schema fields
  quantityCartons?: number
  quantityPerCarton?: number
  totalQuantity?: number
  unit?: string
  pricePerPiece?: number
  totalValue?: number
  isActive?: boolean
  transactionDate?: string
}

export interface UpdateProductInput {
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
  // Kena Store Product schema fields
  quantityCartons?: number
  quantityPerCarton?: number
  totalQuantity?: number
  unit?: string
  pricePerPiece?: number
  totalValue?: number
  isActive?: boolean
  updatedBy?: string
  transactionDate?: string
}

export type StockMovementType = 'IN' | 'OUT'

export interface StockMovement {
  id: string
  storeId?: string
  productId: string
  movementType: StockMovementType
  quantity: number
  transactionUnit: string
  conversionFactor: number
  baseQuantity: number
  previousStock: number
  newStock: number
  unitPrice: number
  totalPrice: number
  transactionDate: string
  sourceType?: string
  sourceId?: string
  destination?: string
  referenceNumber?: string
  note?: string
  createdBy?: string
  /** Display name resolved by joining the users table on created_by. */
  createdByName?: string
  createdAt?: string
}

/**
 * The authenticated user who requested a stock transaction.
 * The backend uses this to enforce store isolation and to
 * record who performed every movement.
 */
export interface StockActor {
  id: string
  name: string
  role: 'admin' | 'storekeeper'
  storeId?: string | null
}

export interface StockTransactionInput {
  storeId?: string
  productId: string
  movementType: StockMovementType
  quantity: number
  unitPrice: number
  loosePieces?: number
  paymentAmount?: number
  bankName?: string
  packagingUnit?: string
  cartons?: number
  pcsPerCarton?: number
  supplierOrDestination?: string
  referenceNumber?: string
  transactionDate?: string
  note?: string
  /** Authenticated user performing the transaction (verified against the store). */
  requestedBy?: StockActor
}

// ============================================================================
// TRANSLATION & LOCALIZATION TYPES
// ============================================================================
export interface TranslationItem {
  id?: string
  translationKey: string
  languageCode: 'en' | 'am'
  translatedText: string
}

export interface ProductTranslationItem {
  id?: string
  productId: string
  languageCode: 'en' | 'am'
  productName: string
  description?: string
}
