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

const AMHARIC_MONTHS = [
  'ጥር', 'የካቲት', 'መጋቢት', 'ሚያዝያ', 'ግንቦት', 'ሰኔ',
  'ሐምሌ', 'ነሐሴ', 'መስከረም', 'ጥቅምት', 'ህዳር', 'ታህሳስ'
]

const MONTH_NAME_MAP: Record<string, string> = {
  jan: 'ጥር', january: 'ጥር',
  feb: 'የካቲት', february: 'የካቲት',
  mar: 'መጋቢት', march: 'መጋቢት',
  apr: 'ሚያዝያ', april: 'ሚያዝያ',
  may: 'ግንቦት',
  jun: 'ሰኔ', june: 'ሰኔ',
  jul: 'ሐምሌ', july: 'ሐምሌ',
  aug: 'ነሐሴ', august: 'ነሐሴ',
  sep: 'መስከረም', september: 'መስከረም',
  oct: 'ጥቅምት', october: 'ጥቅምት',
  nov: 'ህዳር', november: 'ህዳር',
  dec: 'ታህሳስ', december: 'ታህሳስ',
}

export function formatDate(dateString: string, isAmharic?: boolean): string {
  if (!dateString) return ''
  const isAm =
    isAmharic !== undefined
      ? isAmharic
      : typeof document !== 'undefined' && document.documentElement.lang === 'am'

  try {
    const trimmed = dateString.trim()
    // Handle DD/MM/YYYY or DD-MM-YYYY formats (e.g. 23/02/2019)
    const dmy = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
    let date: Date
    if (dmy) {
      date = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]))
    } else {
      date = new Date(trimmed)
    }

    if (isNaN(date.getTime())) {
      if (isAm) {
        // Handle pre-formatted dates with English month names like "Nov 1, 2026"
        return trimmed.replace(
          /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b/gi,
          (m) => MONTH_NAME_MAP[m.toLowerCase()] || m
        )
      }
      return trimmed
    }
    if (isAm) {
      return `${AMHARIC_MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
    }
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
  // If pieces price (pcsPrice) is set, calculate per-piece total
  // Otherwise fall back to unitPrice × quantity
  let base: number
  if (item.pcsPrice != null && item.pcsPrice > 0) {
    base = item.pcsPrice * (item.quantity || 0)
  } else {
    base = (item.unitPrice || 0) * (item.quantity || 0)
  }
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
    if (item.cartons && item.pcsPerCarton) {
      text += `     📦 Packing: ${item.cartons} ctns × ${item.pcsPerCarton} pcs/ctn (${item.quantity} units)\n`
    }
    if (item.pcsPrice != null && item.pcsPrice > 0) {
      text += `     💎 Pcs Price: ${formatCurrency(item.pcsPrice, currency)}\n`
    }
    if (item.customs) {
      text += `     🛃 Customs: ${formatCurrency(item.customs, currency)}\n`
    }
    const displayPrice = item.pcsPrice != null && item.pcsPrice > 0 ? item.pcsPrice : item.unitPrice
    text += `     ${item.quantity} × ${formatCurrency(displayPrice, currency)} = ${formatCurrency(itemTotal, currency)} ${sign}\n`
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
