import type {
  CurrencyCode,
  LedgerRecord,
  LineItem,
  TabType,
} from '../types/ledger'
import { getItemBank, getItemCustomType } from './bankUtils'

export function formatCurrency(
  amount: number,
  currency: CurrencyCode = 'ETB',
): string {
  const isNegative = amount < 0
  const absoluteValue = Math.abs(amount)
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(absoluteValue)

  return isNegative ? `-${formatted}` : formatted
}

export function formatDate(dateString: string): string {
  if (!dateString) return ''
  try {
    const date = new Date(dateString)
    if (isNaN(date.getTime())) return dateString
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date)
  } catch {
    return dateString
  }
}

export function calculateItemTotal(item: LineItem): number {
  const base = (item.unitPrice || 0) * (item.quantity || 0)
  if (item.sign === '-') {
    return -base
  }
  return base + (item.customs || 0)
}

export function calculateRecordTotal(record: LedgerRecord): number {
  return record.items.reduce((acc, item) => acc + calculateItemTotal(item), 0)
}

export function calculateRecordQuantity(record: LedgerRecord): number {
  return record.items.reduce((acc, item) => acc + (item.quantity || 0), 0)
}

export function generateRecordShareText(
  record: LedgerRecord,
  currency: CurrencyCode = 'ETB',
): string {
  const typeLabel =
    record.type === 'customer'
      ? 'Customer Credit Record'
      : record.type === 'supplier'
        ? 'Supplier Credit Record'
        : 'Stock Inventory Record'

  const total = calculateRecordTotal(record)

  let text = `📋 ${typeLabel.toUpperCase()}\n`
  text += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`
  text += `📌 Title: ${record.title}\n`
  text += `📅 Date: ${formatDate(record.date)}\n`
  if (record.notes) {
    text += `📝 Notes: ${record.notes}\n`
  }
  text += `\n📦 Line Items:\n`

  record.items.forEach((item, index) => {
    const sign = item.sign === '+' ? '(+ Added)' : '(- Deducted)'
    const itemTotal = calculateItemTotal(item)
    const bank = getItemBank(item, record.type)
    const customType = getItemCustomType(item)
    text += `  ${index + 1}. ${item.name}\n`
    if (bank) text += `     🏦 Bank: ${bank}\n`
    if (customType) text += `     🏷️ Custom Type: ${customType}\n`
    if (item.customs) {
      text += `     🛃 Customs: ${formatCurrency(item.customs, currency)}\n`
    }
    text += `     ${item.quantity} × ${formatCurrency(item.unitPrice, currency)} = ${formatCurrency(itemTotal, currency)} ${sign}\n`
  })

  text += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`
  text += `💰 TOTAL BALANCE: ${formatCurrency(total, currency)}\n`

  return text
}

export function generateTabSummaryText(
  tab: TabType,
  records: LedgerRecord[],
  currency: CurrencyCode = 'ETB',
): string {
  const title =
    tab === 'customer'
      ? 'CUSTOMER CREDIT SUMMARY'
      : tab === 'supplier'
        ? 'SUPPLIER CREDIT SUMMARY'
        : 'STOCK INVENTORY SUMMARY'

  const grandTotal = records.reduce(
    (acc, r) => acc + calculateRecordTotal(r),
    0,
  )

  let text = `📊 ${title}\n`
  text += `Generated: ${new Date().toLocaleDateString()}\n`
  text += `Total Records: ${records.length}\n`
  text += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`

  records.forEach((r, idx) => {
    const rTotal = calculateRecordTotal(r)
    text += `${idx + 1}. ${r.title} (${formatDate(r.date)}): ${formatCurrency(rTotal, currency)}\n`
  })

  text += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`
  text += `💵 GRAND TOTAL: ${formatCurrency(grandTotal, currency)}\n`

  return text
}
