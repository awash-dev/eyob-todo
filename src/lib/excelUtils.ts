import * as XLSX from 'xlsx'
import type { LedgerRecord, LineItem, TabType, SignType } from '../types/ledger'
import { getItemBank, getItemCustomType } from './bankUtils'
import { calculateItemTotal } from './formatters'

/**
 * Format Excel date serial numbers or date strings into YYYY-MM-DD
 */
function parseExcelDate(val: any): string {
  if (!val) {
    return new Date().toISOString().split('T')[0]
  }
  // Excel serial date number (e.g. 45229)
  if (typeof val === 'number' && val > 20000 && val < 80000) {
    try {
      const date = new Date(Math.round((val - 25569) * 86400 * 1000))
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0]
      }
    } catch {
      // fallback
    }
  }
  if (typeof val === 'string') {
    const trimmed = val.trim()
    // Already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed
    }
    const parsed = new Date(trimmed)
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0]
    }
  }
  return new Date().toISOString().split('T')[0]
}

/**
 * Normalize tab type from string
 */
function normalizeTabType(
  val: any,
  defaultType: TabType = 'customer',
): TabType {
  if (!val) return defaultType
  const s = String(val).toLowerCase().trim()
  if (s.includes('supp')) return 'supplier'
  if (s.includes('stock') || s.includes('invent') || s.includes('item'))
    return 'stock'
  if (s.includes('cust') || s.includes('client')) return 'customer'
  return defaultType
}

/**
 * Export all records to a clean, multi-sheet Excel (.xlsx) file
 */
export function exportRecordsToExcel(
  records: LedgerRecord[],
  filenamePrefix = 'eyoba-ledger',
): void {
  const wb = XLSX.utils.book_new()

  // Sheet 1: Detailed Items
  const detailedRows = records.flatMap((rec) =>
    rec.items.length > 0
      ? rec.items.map((item) => {
          const itemTotal = calculateItemTotal(item)
          return {
            'Record ID': rec.id,
            'Account Type': rec.type,
            'Name / Title': rec.title,
            Date: rec.date,
            Type: item.sign === '+' ? '(+ Add)' : '(- Deduct)',
            'Item Description': item.name,
            Bank: getItemBank(item, rec.type),
            'Custom Type': getItemCustomType(item),
            Sign: item.sign,
            'Unit Price': item.unitPrice,
            Quantity: item.quantity,
            Customs: item.customs || 0,
            'Total Amount': itemTotal,
            Notes: rec.notes || '',
          }
        })
      : [
          {
            'Record ID': rec.id,
            'Account Type': rec.type,
            'Name / Title': rec.title,
            Date: rec.date,
            Type: '(+ Add)',
            'Item Description': 'No items',
            Bank: '',
            'Custom Type': '',
            Sign: '+',
            'Unit Price': 0,
            Quantity: 1,
            Customs: 0,
            'Total Amount': 0,
            Notes: rec.notes || '',
          },
        ],
  )

  const wsDetailed = XLSX.utils.json_to_sheet(detailedRows)
  XLSX.utils.book_append_sheet(wb, wsDetailed, 'Ledger Details')

  // Sheet 2: Accounts Summary
  const summaryRows = records.map((rec) => {
    const netBalance = rec.items.reduce(
      (sum, it) => sum + calculateItemTotal(it),
      0,
    )

    return {
      'Record ID': rec.id,
      'Account Type': rec.type,
      'Name / Title': rec.title,
      Date: rec.date,
      'Items Count': rec.items.length,
      'Net Balance': netBalance,
      Notes: rec.notes || '',
    }
  })

  const wsSummary = XLSX.utils.json_to_sheet(summaryRows)
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Accounts Summary')

  const dateStr = new Date().toISOString().split('T')[0]
  XLSX.writeFile(wb, `${filenamePrefix}-${dateStr}.xlsx`)
}

/**
 * Import records from an uploaded Excel (.xlsx, .xls, .csv) file
 */
export async function importRecordsFromExcel(
  file: File,
  fallbackTab: TabType = 'customer',
): Promise<LedgerRecord[]> {
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array' })

  if (wb.SheetNames.length === 0) {
    throw new Error('No worksheets found in this Excel file')
  }

  // Prefer 'Ledger Details' sheet if present, otherwise use the first sheet
  const targetSheetName =
    wb.SheetNames.find((name) => name.toLowerCase().includes('detail')) ||
    wb.SheetNames[0]

  const sheet = wb.Sheets[targetSheetName]
  const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' })

  if (rows.length === 0) {
    throw new Error('The selected Excel worksheet contains no data rows')
  }

  // Map to group rows by Record
  const recordMap = new Map<string, LedgerRecord>()

  rows.forEach((row, idx) => {
    // Flexible column lookup (case-insensitive & space-stripped)
    const normalizedRow: Record<string, any> = {}
    Object.keys(row).forEach((k) => {
      const cleanKey = k.toLowerCase().replace(/[^a-z0-9]/g, '')
      normalizedRow[cleanKey] = row[k]
    })

    const title =
      normalizedRow.title ||
      normalizedRow.name ||
      normalizedRow.nametitle ||
      normalizedRow.customer ||
      normalizedRow.supplier ||
      normalizedRow.account ||
      `Imported Entry #${idx + 1}`

    const type = normalizeTabType(
      normalizedRow.accounttype ||
        normalizedRow.tab ||
        normalizedRow.category ||
        normalizedRow.type,
      fallbackTab,
    )

    const date = parseExcelDate(normalizedRow.date)
    const notes = String(
      normalizedRow.notes || normalizedRow.memo || normalizedRow.remarks || '',
    ).trim()

    // Key to group rows that belong to the same record
    const explicitId =
      normalizedRow.id || normalizedRow.recordid || normalizedRow.recid
    const groupKey = explicitId
      ? String(explicitId)
      : `${type}__${title}__${date}`

    // Parse line item
    const itemName = String(
      normalizedRow.item ||
        normalizedRow.itemdescription ||
        normalizedRow.description ||
        normalizedRow.product ||
        'Item',
    ).trim()

    const rawUnitPrice = parseFloat(
      normalizedRow.unitprice ||
        normalizedRow.price ||
        normalizedRow.rate ||
        normalizedRow.amount ||
        normalizedRow.totalamount ||
        normalizedRow.netbalance ||
        '0',
    )
    const unitPrice = isNaN(rawUnitPrice) ? 0 : Math.abs(rawUnitPrice)

    const rawQty = parseFloat(
      normalizedRow.quantity || normalizedRow.qty || normalizedRow.count || '1',
    )
    const quantity = isNaN(rawQty) || rawQty <= 0 ? 1 : rawQty

    const signRaw = String(
      normalizedRow.sign || normalizedRow.signtype || normalizedRow.type || '',
    ).trim()
    let sign: SignType = '+'
    if (
      signRaw === '-' ||
      signRaw.toLowerCase().includes('debit') ||
      signRaw.toLowerCase().includes('deduct') ||
      rawUnitPrice < 0
    ) {
      sign = '-'
    }

    const lineItem: LineItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name: itemName,
      unitPrice,
      quantity,
      sign,
    }

    // Parse the dedicated Bank / Custom Type columns. Older exports used a
    // single "Type / Bank" column, so fall back to it when needed.
    const legacyTypeBank = String(normalizedRow.typebank || '').trim()
    let bank = String(
      normalizedRow.bank ||
        normalizedRow.bankname ||
        normalizedRow.bankchannel ||
        '',
    ).trim()
    let customType = String(
      normalizedRow.customtype || normalizedRow.custom || '',
    ).trim()

    if (!bank && !customType && legacyTypeBank) {
      if (sign === '-') {
        bank = legacyTypeBank
      } else {
        customType = legacyTypeBank
      }
    }

    if (bank) lineItem.bank = bank
    if (customType) lineItem.customType = customType

    const rawCustoms = parseFloat(
      normalizedRow.customs ||
        normalizedRow.customsduty ||
        normalizedRow.duty ||
        '0',
    )
    const customs = isNaN(rawCustoms) ? 0 : Math.max(0, rawCustoms)
    if (customs) lineItem.customs = customs

    if (!recordMap.has(groupKey)) {
      const newRec: LedgerRecord = {
        id: explicitId
          ? String(explicitId)
          : `${type}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        type,
        title: String(title).trim(),
        date,
        notes: notes || undefined,
        items: [lineItem],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      recordMap.set(groupKey, newRec)
    } else {
      const existing = recordMap.get(groupKey)!
      existing.items.push(lineItem)
      if (!existing.notes && notes) {
        existing.notes = notes
      }
    }
  })

  return Array.from(recordMap.values())
}
