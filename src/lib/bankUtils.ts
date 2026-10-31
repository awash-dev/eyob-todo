import type { LineItem, TabType } from '../types/ledger'

export const ETHIOPIAN_BANKS = [
  'CBE',
  'CBE Birr',
  'Awash',
  'Dashen',
  'BoA',
  'Abyssinia',
  'Pawza',
  'Telebirr',
  'Amhara',
  'Oromia',
  'Coop',
  'Hibret',
  'Zemen',
  'Berhan',
  'Nib',
  'Wegagen',
  'Abay',
  'Bunna',
  'Enat',
  'Sinqee',
  'Cash',
  'Check',
  'Other',
] as const

export interface ItemTypeInfo {
  label: string
  icon: string
  bgClass: string
  textClass: string
  borderClass: string
  isBank: boolean
}

export function getItemTypeInfo(
  item: LineItem,
  recordType: TabType = 'stock',
): ItemTypeInfo {
  const bankOrType = (item.bank || item.customType || '').trim()

  if (bankOrType) {
    const lower = bankOrType.toLowerCase()
    if (lower.includes('cbe birr')) {
      return {
        label: 'CBE Birr',
        icon: 'phone-portrait-outline',
        bgClass: 'bg-purple-100 dark:bg-purple-950/70',
        textClass: 'text-purple-700 dark:text-purple-300',
        borderClass: 'border-purple-200 dark:border-purple-800',
        isBank: true,
      }
    }
    if (lower.includes('cbe') || lower.includes('commercial bank')) {
      return {
        label: 'CBE',
        icon: 'business-outline',
        bgClass: 'bg-purple-100 dark:bg-purple-950/70',
        textClass: 'text-purple-700 dark:text-purple-300',
        borderClass: 'border-purple-200 dark:border-purple-800',
        isBank: true,
      }
    }
    if (lower.includes('awash') || lower.includes('awashi')) {
      return {
        label: 'Awash',
        icon: 'card-outline',
        bgClass: 'bg-amber-100 dark:bg-amber-950/70',
        textClass: 'text-amber-800 dark:text-amber-300',
        borderClass: 'border-amber-200 dark:border-amber-800',
        isBank: true,
      }
    }
    if (lower.includes('dashen')) {
      return {
        label: 'Dashen',
        icon: 'wallet-outline',
        bgClass: 'bg-blue-100 dark:bg-blue-950/70',
        textClass: 'text-blue-800 dark:text-blue-300',
        borderClass: 'border-blue-200 dark:border-blue-800',
        isBank: true,
      }
    }
    if (lower.includes('boa') || lower.includes('abyssinia')) {
      return {
        label: 'BoA',
        icon: 'cash-outline',
        bgClass: 'bg-yellow-100 dark:bg-yellow-950/70',
        textClass: 'text-yellow-800 dark:text-yellow-300',
        borderClass: 'border-yellow-200 dark:border-yellow-800',
        isBank: true,
      }
    }
    if (lower.includes('coop') || lower.includes('oromia')) {
      return {
        label: 'Coop',
        icon: 'briefcase-outline',
        bgClass: 'bg-emerald-100 dark:bg-emerald-950/70',
        textClass: 'text-emerald-800 dark:text-emerald-300',
        borderClass: 'border-emerald-200 dark:border-emerald-800',
        isBank: true,
      }
    }
    if (lower.includes('hibret')) {
      return {
        label: 'Hibret',
        icon: 'shield-checkmark-outline',
        bgClass: 'bg-teal-100 dark:bg-teal-950/70',
        textClass: 'text-teal-800 dark:text-teal-300',
        borderClass: 'border-teal-200 dark:border-teal-800',
        isBank: true,
      }
    }
    if (lower.includes('zemen')) {
      return {
        label: 'Zemen',
        icon: 'business-outline',
        bgClass: 'bg-rose-100 dark:bg-rose-950/70',
        textClass: 'text-rose-800 dark:text-rose-300',
        borderClass: 'border-rose-200 dark:border-rose-800',
        isBank: true,
      }
    }
    if (lower.includes('berhan')) {
      return {
        label: 'Berhan',
        icon: 'sunny-outline',
        bgClass: 'bg-orange-100 dark:bg-orange-950/70',
        textClass: 'text-orange-800 dark:text-orange-300',
        borderClass: 'border-orange-200 dark:border-orange-800',
        isBank: true,
      }
    }
    if (lower.includes('nib')) {
      return {
        label: 'Nib',
        icon: 'business-outline',
        bgClass: 'bg-amber-100 dark:bg-amber-950/70',
        textClass: 'text-amber-800 dark:text-amber-300',
        borderClass: 'border-amber-200 dark:border-amber-800',
        isBank: true,
      }
    }
    if (lower.includes('wegagen')) {
      return {
        label: 'Wegagen',
        icon: 'business-outline',
        bgClass: 'bg-red-100 dark:bg-red-950/70',
        textClass: 'text-red-800 dark:text-red-300',
        borderClass: 'border-red-200 dark:border-red-800',
        isBank: true,
      }
    }
    if (lower.includes('telebirr')) {
      return {
        label: 'Telebirr',
        icon: 'phone-portrait-outline',
        bgClass: 'bg-sky-100 dark:bg-sky-950/70',
        textClass: 'text-sky-800 dark:text-sky-300',
        borderClass: 'border-sky-200 dark:border-sky-800',
        isBank: true,
      }
    }
    if (lower.includes('cash') || lower.includes('pawza')) {
      return {
        label: 'Cash',
        icon: 'cash-outline',
        bgClass: 'bg-emerald-50 dark:bg-emerald-950/60',
        textClass: 'text-emerald-700 dark:text-emerald-300',
        borderClass: 'border-emerald-200 dark:border-emerald-800',
        isBank: true,
      }
    }
    if (lower.includes('check') || lower.includes('cheque')) {
      return {
        label: 'Check',
        icon: 'receipt-outline',
        bgClass: 'bg-indigo-100 dark:bg-indigo-950/70',
        textClass: 'text-indigo-800 dark:text-indigo-300',
        borderClass: 'border-indigo-200 dark:border-indigo-800',
        isBank: true,
      }
    }
    // Custom label
    return {
      label: bankOrType,
      icon: item.sign === '-' ? 'arrow-down-circle-outline' : 'cube-outline',
      bgClass:
        item.sign === '-' ? 'bg-rose-50 dark:bg-rose-950/60' : 'bg-muted/60',
      textClass:
        item.sign === '-'
          ? 'text-rose-700 dark:text-rose-300'
          : 'text-foreground',
      borderClass: 'border-zinc-200 dark:border-zinc-700',
      isBank: item.sign === '-',
    }
  }

  // Automatic detection from item.name for deductions/payments
  if (item.sign === '-') {
    const nameLower = item.name.toLowerCase()
    if (nameLower.includes('cbe birr')) {
      return {
        label: 'CBE Birr',
        icon: 'phone-portrait-outline',
        bgClass: 'bg-purple-100 dark:bg-purple-950/70',
        textClass: 'text-purple-700 dark:text-purple-300',
        borderClass: 'border-purple-200 dark:border-purple-800',
        isBank: true,
      }
    }
    if (nameLower.includes('cbe') || nameLower.includes('commercial bank')) {
      return {
        label: 'CBE',
        icon: 'business-outline',
        bgClass: 'bg-purple-100 dark:bg-purple-950/70',
        textClass: 'text-purple-700 dark:text-purple-300',
        borderClass: 'border-purple-200 dark:border-purple-800',
        isBank: true,
      }
    }
    if (nameLower.includes('awash') || nameLower.includes('awashi')) {
      return {
        label: 'Awash',
        icon: 'card-outline',
        bgClass: 'bg-amber-100 dark:bg-amber-950/70',
        textClass: 'text-amber-800 dark:text-amber-300',
        borderClass: 'border-amber-200 dark:border-amber-800',
        isBank: true,
      }
    }
    if (nameLower.includes('dashen')) {
      return {
        label: 'Dashen',
        icon: 'wallet-outline',
        bgClass: 'bg-blue-100 dark:bg-blue-950/70',
        textClass: 'text-blue-800 dark:text-blue-300',
        borderClass: 'border-blue-200 dark:border-blue-800',
        isBank: true,
      }
    }
    if (nameLower.includes('abyssinia') || nameLower.includes('boa')) {
      return {
        label: 'BoA',
        icon: 'cash-outline',
        bgClass: 'bg-yellow-100 dark:bg-yellow-950/70',
        textClass: 'text-yellow-800 dark:text-yellow-300',
        borderClass: 'border-yellow-200 dark:border-yellow-800',
        isBank: true,
      }
    }
    if (nameLower.includes('coop') || nameLower.includes('oromia')) {
      return {
        label: 'Coop',
        icon: 'briefcase-outline',
        bgClass: 'bg-emerald-100 dark:bg-emerald-950/70',
        textClass: 'text-emerald-800 dark:text-emerald-300',
        borderClass: 'border-emerald-200 dark:border-emerald-800',
        isBank: true,
      }
    }
    if (nameLower.includes('hibret')) {
      return {
        label: 'Hibret',
        icon: 'shield-checkmark-outline',
        bgClass: 'bg-teal-100 dark:bg-teal-950/70',
        textClass: 'text-teal-800 dark:text-teal-300',
        borderClass: 'border-teal-200 dark:border-teal-800',
        isBank: true,
      }
    }
    if (nameLower.includes('zemen')) {
      return {
        label: 'Zemen',
        icon: 'business-outline',
        bgClass: 'bg-rose-100 dark:bg-rose-950/70',
        textClass: 'text-rose-800 dark:text-rose-300',
        borderClass: 'border-rose-200 dark:border-rose-800',
        isBank: true,
      }
    }
    if (nameLower.includes('telebirr')) {
      return {
        label: 'Telebirr',
        icon: 'phone-portrait-outline',
        bgClass: 'bg-sky-100 dark:bg-sky-950/70',
        textClass: 'text-sky-800 dark:text-sky-300',
        borderClass: 'border-sky-200 dark:border-sky-800',
        isBank: true,
      }
    }
    if (
      nameLower.includes('pawza') ||
      nameLower.includes('pwza') ||
      nameLower.includes('cash') ||
      nameLower.includes('jkf')
    ) {
      return {
        label: 'Cash',
        icon: 'cash-outline',
        bgClass: 'bg-emerald-50 dark:bg-emerald-950/60',
        textClass: 'text-emerald-700 dark:text-emerald-300',
        borderClass: 'border-emerald-200 dark:border-emerald-800',
        isBank: true,
      }
    }
    return {
      label: 'Payment',
      icon: 'remove-circle-outline',
      bgClass: 'bg-rose-100/70 dark:bg-rose-950/70',
      textClass: 'text-rose-700 dark:text-rose-300',
      borderClass: 'border-rose-200 dark:border-rose-800',
      isBank: false,
    }
  }

  // Item / Goods
  return {
    label: recordType === 'stock' ? 'Stock' : 'Goods',
    icon: 'cube-outline',
    bgClass: 'bg-emerald-100/70 dark:bg-emerald-950/70',
    textClass: 'text-emerald-800 dark:text-emerald-300',
    borderClass: 'border-emerald-200 dark:border-emerald-800',
    isBank: false,
  }
}

/**
 * Resolve which bank / payment channel an item belongs to.
 * Uses the explicit `bank` field first, then falls back to detecting a
 * bank name from the item description (for older records/imports).
 */
export function getItemBank(
  item: LineItem,
  recordType: TabType = 'stock',
): string {
  const explicit = item.bank?.trim()
  if (explicit) return explicit

  const info = getItemTypeInfo(item, recordType)
  return item.sign === '-' && info.isBank ? info.label : ''
}

/**
 * Resolve the custom item type/category (Stock, Goods, Delivery, ...).
 * Additions default to "Stock" when no custom type was chosen.
 */
export function getItemCustomType(item: LineItem): string {
  const explicit = item.customType?.trim()
  if (explicit) return explicit
  return item.sign === '+' ? 'Stock' : ''
}
