import type { LineItem } from '../types/ledger'

export interface LedgerTableEntry {
  id: string
  date: string
  description: string
  isProduct: boolean
  isPayment: boolean
  isReturn: boolean
  isAdvance: boolean
  quantity: number | null
  unitPrice: number | null
  totalAmount: number
  paymentMethod: string
  debit: number
  credit: number
  balance: number
}

export interface LedgerTableData {
  entries: LedgerTableEntry[]
  totalDebit: number
  totalCredit: number
  outstandingBalance: number
}

export interface AccountCreditStats {
  totalCreditSalesOrPurchases: number
  totalPayments: number
  totalAdvances: number
  totalAdvancesAllocated: number
  unappliedAdvance: number
  outstanding: number
}

/**
 * Checks if a ledger record is a demo/test record.
 */
export function isDemoRecord(title: string): boolean {
  if (!title) return false
  const t = title.trim().toLowerCase()
  return t === 'sample' || t.startsWith('sample ') || t.includes('test customer') || t.includes('test supplier')
}

/**
 * Robust double-entry accounting calculator for Customer, Supplier, and Broker credit balances.
 * Generates the clean 9-column Excel ledger table:
 * | Date | Product / Description | Quantity | Unit Price | Total Amount | Payment Method | Debit | Credit | Balance |
 */
export function generateLedgerTableEntries(
  type: 'customer' | 'supplier' | 'delala',
  items: LineItem[],
): LedgerTableData {
  const entries: LedgerTableEntry[] = []
  let runningBalance = 0
  let totalDebit = 0
  let totalCredit = 0

  for (const item of items) {
    const rawName = String(item.name || '').trim()
    const isPayment =
      item.isPayment === true ||
      item.packagingUnit === 'Payment' ||
      item.customType === 'Payment' ||
      rawName.toLowerCase().includes('payment') ||
      rawName.toLowerCase().includes('ክፍያ')

    const isReturn =
      item.customType === 'Return' ||
      rawName.toLowerCase().includes('return') ||
      rawName.toLowerCase().includes('ተመለሰ')

    const isAdvance =
      item.isAdvance === true ||
      item.customType === 'Advance' ||
      item.customType === 'Customer Advance' ||
      item.customType === 'Supplier Advance'

    const isAdvanceAllocation =
      item.customType === 'Advance Allocation' ||
      item.customType === 'Apply Advance'

    let qty: number | null = null
    let price: number | null = null
    let total = 0

    if (isPayment || isAdvance || isAdvanceAllocation) {
      qty = null
      price = null
      const baseAmount = Number(item.amount) || Number(item.allocatedAmount) || 0
      if (baseAmount > 0) {
        total = baseAmount
      } else {
        const itemQty = Number(item.quantity) || 1
        // If pcsPrice is present (historical data), prefer it if unitPrice is small
        const itemPrice = Number(item.unitPrice) > 0 ? Number(item.unitPrice) : Number(item.pcsPrice) || 0
        total = Math.abs(itemQty * itemPrice)
      }
    } else {
      // Product delivery or return
      const rawQty = Number(item.quantity)
      // Standardize: Total Amount = Quantity × Unit Price
      // If historical record had pcsPrice different from unitPrice (e.g. sample having unitPrice 4 but pcsPrice 1000),
      // we use the actual pricing so quantity * price == total
      let effectivePrice = Number(item.unitPrice) || 0
      if (effectivePrice <= 0 && Number(item.pcsPrice) > 0) {
        effectivePrice = Number(item.pcsPrice)
      }

      qty = !isNaN(rawQty) && rawQty > 0 ? rawQty : 1
      price = effectivePrice > 0 ? effectivePrice : 0
      total = Math.round(qty * price * 100) / 100
    }

    const method = item.bank || item.paymentMethod || (isPayment ? 'Cash' : isReturn ? 'Stock Return' : 'Stock')

    let debit = 0
    let credit = 0

    if (type === 'customer' || type === 'delala') {
      if (isPayment || isReturn || isAdvanceAllocation) {
        // Customer or broker paid or returned goods -> Credit (reduces customer/broker debt)
        debit = 0
        credit = total
        runningBalance -= credit
      } else if (isAdvance) {
        // Advance deposit -> Credit
        debit = 0
        credit = total
        runningBalance -= credit
      } else {
        // Goods delivered / credit sale / broker transaction -> Debit (party owes us money)
        debit = total
        credit = 0
        runningBalance += debit
      }
    } else {
      // Supplier
      if (isPayment || isReturn || isAdvanceAllocation) {
        // Store paid supplier or returned goods to supplier -> Debit (reduces supplier payable)
        debit = total
        credit = 0
        runningBalance -= debit
      } else if (isAdvance) {
        // Advance paid to supplier -> Debit
        debit = total
        credit = 0
        runningBalance -= debit
      } else {
        // Goods purchased from supplier -> Credit (unpaid purchases increase supplier payable)
        debit = 0
        credit = total
        runningBalance += credit
      }
    }

    totalDebit += debit
    totalCredit += credit

    entries.push({
      id: item.id || `entry-${Date.now()}-${Math.random()}`,
      date: item.date || '',
      description: rawName || (isPayment ? 'Payment' : 'Goods'),
      isProduct: !isPayment && !isAdvance && !isAdvanceAllocation,
      isPayment,
      isReturn,
      isAdvance,
      quantity: qty,
      unitPrice: price,
      totalAmount: total,
      paymentMethod: method,
      debit: Math.round(debit * 100) / 100,
      credit: Math.round(credit * 100) / 100,
      balance: Math.round(runningBalance * 100) / 100,
    })
  }

  const outstandingBalance = (type === 'customer' || type === 'delala')
    ? Math.max(0, Math.round((totalDebit - totalCredit) * 100) / 100)
    : Math.max(0, Math.round((totalCredit - totalDebit) * 100) / 100)

  return {
    entries,
    totalDebit: Math.round(totalDebit * 100) / 100,
    totalCredit: Math.round(totalCredit * 100) / 100,
    outstandingBalance,
  }
}

/**
 * Calculates account summary stats for Customer, Supplier, and Broker.
 */
export function calculateAccountBalances(
  type: 'customer' | 'supplier' | 'delala',
  items: LineItem[],
): AccountCreditStats {
  const tableData = generateLedgerTableEntries(type, items)

  let totalAdvances = 0
  let totalAdvancesAllocated = 0

  for (const item of items) {
    const isAdv =
      item.isAdvance === true ||
      item.customType === 'Advance' ||
      item.customType === 'Customer Advance' ||
      item.customType === 'Supplier Advance'
    const isAlloc =
      item.customType === 'Advance Allocation' ||
      item.customType === 'Apply Advance'

    if (isAdv) {
      const q = Number(item.quantity) || 1
      const p = Number(item.unitPrice) || 0
      totalAdvances += Math.abs(q * p)
    }
    if (isAlloc) {
      const alloc = item.allocatedAmount ? Math.abs(Number(item.allocatedAmount)) : 0
      totalAdvancesAllocated += alloc
    }
  }

  const unappliedAdvance = Math.max(0, totalAdvances - totalAdvancesAllocated)

  return {
    totalCreditSalesOrPurchases: (type === 'customer' || type === 'delala') ? tableData.totalDebit : tableData.totalCredit,
    totalPayments: (type === 'customer' || type === 'delala') ? tableData.totalCredit : tableData.totalDebit,
    totalAdvances: Math.round(totalAdvances * 100) / 100,
    totalAdvancesAllocated: Math.round(totalAdvancesAllocated * 100) / 100,
    unappliedAdvance: Math.round(unappliedAdvance * 100) / 100,
    outstanding: tableData.outstandingBalance,
  }
}

export interface CreditTransactionParams {
  type: 'customer' | 'supplier' | 'delala'
  partyName: string
  transactionCategory:
    | 'credit_sale'
    | 'credit_purchase'
    | 'payment_received'
    | 'payment_made'
    | 'customer_return'
    | 'supplier_return'
    | 'advance_received'
    | 'advance_paid'
    | 'allocate_advance'
  amount: number
  description: string
  paymentMethod?: string
  date: string
  reference?: string
  notes?: string
  invoiceId?: string
  quantity?: number
  unitPrice?: number
  productId?: string
  productName?: string
  cartons?: number
  piecesPerCarton?: number
  loosePieces?: number
  paymentAmount?: number
  bankName?: string
}

/**
 * Validates transaction parameters according to accounting rules.
 */
export function validateTransaction(
  params: CreditTransactionParams,
  currentStats: AccountCreditStats,
): { valid: boolean; error?: string } {
  if (!params.partyName.trim()) {
    return { valid: false, error: 'Party name is required.' }
  }

  if (params.amount <= 0) {
    return { valid: false, error: 'Amount must be greater than zero.' }
  }

  // Reject payments exceeding outstanding unless explicitly recorded as advances
  if (
    params.transactionCategory === 'payment_received' ||
    params.transactionCategory === 'payment_made'
  ) {
    if (params.amount > currentStats.outstanding) {
      return {
        valid: false,
        error: `Payment amount (${params.amount.toLocaleString()} ETB) exceeds outstanding balance (${currentStats.outstanding.toLocaleString()} ETB). Please record the excess as an Advance instead.`,
      }
    }
  }

  // Validate advance allocation
  if (params.transactionCategory === 'allocate_advance') {
    if (currentStats.unappliedAdvance <= 0) {
      return {
        valid: false,
        error: 'No available advance deposit to allocate for this account.',
      }
    }
    if (params.amount > currentStats.unappliedAdvance) {
      return {
        valid: false,
        error: `Cannot allocate ${params.amount.toLocaleString()} ETB; available advance is only ${currentStats.unappliedAdvance.toLocaleString()} ETB.`,
      }
    }
    if (params.amount > currentStats.outstanding) {
      return {
        valid: false,
        error: `Cannot allocate more than the outstanding debt (${currentStats.outstanding.toLocaleString()} ETB).`,
      }
    }
  }

  return { valid: true }
}

/**
 * Creates a clean LineItem based on transaction category and accounting sign.
 */
export function buildTransactionLineItem(params: CreditTransactionParams): LineItem {
  const id = `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
  const isPayment =
    params.transactionCategory === 'payment_received' ||
    params.transactionCategory === 'payment_made'

  const qty = !isPayment && params.quantity && params.quantity > 0 ? params.quantity : isPayment ? undefined : 1
  const price = !isPayment && params.unitPrice && params.unitPrice > 0 ? params.unitPrice : isPayment ? undefined : params.amount / (qty || 1)

  let sign: '+' | '-' = '+'
  let customType = 'Stock'
  let isAdvance = false
  let allocatedAmount: number | undefined

  if (params.type === 'customer' || params.type === 'delala') {
    switch (params.transactionCategory) {
      case 'credit_sale':
      case 'credit_purchase':
        sign = '+'
        customType = params.type === 'delala' ? 'Broker Deal' : 'Credit Sale'
        break
      case 'customer_return':
      case 'supplier_return':
        sign = '-'
        customType = 'Return'
        break
      case 'payment_received':
      case 'payment_made':
        sign = '-'
        customType = 'Payment'
        break
      case 'advance_received':
      case 'advance_paid':
        sign = '-'
        customType = 'Advance'
        isAdvance = true
        break
      case 'allocate_advance':
        sign = '-'
        customType = 'Advance Allocation'
        allocatedAmount = params.amount
        break
      default:
        sign = '+'
        customType = params.type === 'delala' ? 'Broker Deal' : 'Credit Sale'
        break
    }
  } else {
    // Supplier
    switch (params.transactionCategory) {
      case 'credit_purchase':
        sign = '-'
        customType = 'Credit Purchase'
        break
      case 'supplier_return':
        sign = '+'
        customType = 'Return'
        break
      case 'payment_made':
        sign = '+'
        customType = 'Payment'
        break
      case 'advance_paid':
        sign = '+'
        customType = 'Advance'
        isAdvance = true
        break
      case 'allocate_advance':
        sign = '+'
        customType = 'Advance Allocation'
        allocatedAmount = params.amount
        break
    }
  }

  return {
    id,
    name: params.description.trim(),
    quantity: qty ?? 1,
    unitPrice: price ?? params.amount ?? 0,
    amount: params.amount,
    sign,
    customType,
    isAdvance,
    isPayment,
    allocatedAmount,
    bank: params.paymentMethod,
    paymentMethod: params.paymentMethod,
    reference: params.reference?.trim() || undefined,
    date: params.date,
    notes: params.notes?.trim() || undefined,
    invoiceId: params.invoiceId,
  }
}
