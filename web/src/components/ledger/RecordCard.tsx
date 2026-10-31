import React, { useState } from 'react'
import type { LedgerRecord } from '../../types/ledger'
import { useLedger } from '../../context/LedgerContext'
import {
  formatDate,
  calculateRecordTotal,
  calculateItemTotal,
  generateRecordShareText,
} from '../../lib/formatters'
import { getItemBank, getItemCustomType } from '../../lib/bankUtils'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'

interface RecordCardProps {
  record: LedgerRecord
}

export const RecordCard: React.FC<RecordCardProps> = ({ record }) => {
  const [isExpanded, setIsExpanded] = useState(true)
  const {
    openEditModal,
    deleteRecord,
    showToast,
    formatCurrency,
  } = useLedger()

  const total = calculateRecordTotal(record)
  const isPositive = total >= 0
  const isStock = record.type === 'stock'

  // Calculations for Customer / Supplier
  const totalDebit = record.items
    .filter((it) => it.sign === '+')
    .reduce((sum, it) => sum + calculateItemTotal(it), 0)

  const totalCredit = record.items
    .filter((it) => it.sign === '-')
    .reduce((sum, it) => sum + Math.abs(calculateItemTotal(it)), 0)

  // Calculations for Stock
  const totalCartons = record.items.reduce(
    (sum, it) => sum + (Number(it.cartons) || 0),
    0,
  )
  const totalUnits = record.items.reduce(
    (sum, it) => sum + (Number(it.quantity) || 0),
    0,
  )

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    const text = generateRecordShareText(record, 'ETB')
    navigator.clipboard.writeText(text).then(
      () => {
        showToast(`Copied "${record.title}" summary to clipboard!`, 'success')
      },
      () => {
        showToast('Failed to copy to clipboard', 'error')
      },
    )
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (window.confirm(`Are you sure you want to delete "${record.title}"?`)) {
      deleteRecord(record.id)
    }
  }

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    openEditModal(record)
  }

  return (
    <div className="bg-card rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xs hover:border-zinc-300 dark:hover:border-zinc-700 transition-all overflow-hidden mb-3">
      {/* Header bar */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="p-3 sm:px-4 sm:py-3 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-card hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-start gap-2.5 min-w-0">
          <button
            type="button"
            className="p-1 rounded-md text-muted-foreground hover:bg-muted transition-colors mt-0.5 shrink-0"
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            <ion-icon
              name={isExpanded ? 'chevron-up-outline' : 'chevron-down-outline'}
              class="text-base text-muted-foreground"
            ></ion-icon>
          </button>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md ${
                  record.type === 'customer'
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                    : record.type === 'supplier'
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                      : 'bg-purple-50 text-purple-700 dark:bg-purple-950/70 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                }`}
              >
                <ion-icon
                  name={
                    record.type === 'customer'
                      ? 'people-outline'
                      : record.type === 'supplier'
                        ? 'business-outline'
                        : 'layers-outline'
                  }
                  class="text-xs"
                ></ion-icon>
                <span>
                  {record.type === 'customer'
                    ? 'Customer'
                    : record.type === 'supplier'
                      ? 'Supplier'
                      : 'Stock'}
                </span>
              </span>

              <h3 className="font-bold text-sm sm:text-base text-foreground tracking-tight">
                {record.title}
              </h3>

              {record.shopName && (
                <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  {record.shopName}
                </span>
              )}

              <span className="text-xs text-muted-foreground">
                ({record.items.length} {record.items.length === 1 ? 'item' : 'items'})
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-0.5">
              <span>{formatDate(record.date)}</span>
              {record.notes && (
                <span className="text-zinc-500 dark:text-zinc-400 truncate max-w-md">
                  • {record.notes}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right side: Balance and actions */}
        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 ml-7 sm:ml-0">
          <div className="text-right">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block">
              {isStock ? 'Stock Total' : 'Net Balance'}
            </span>
            <div
              className={`text-base sm:text-lg font-bold ${
                isPositive
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {formatCurrency(total)}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleEdit}
              className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-lg"
              title="Edit"
            >
              <ion-icon name="create-outline" class="text-base"></ion-icon>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-lg"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ion-icon
                    name="ellipsis-vertical-outline"
                    class="text-base"
                  ></ion-icon>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={handleEdit} className="cursor-pointer text-xs">
                  <ion-icon name="create-outline" class="text-sm mr-2"></ion-icon>
                  <span>Edit</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleCopy} className="cursor-pointer text-xs">
                  <ion-icon name="copy-outline" class="text-sm mr-2"></ion-icon>
                  <span>Copy Summary</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleDelete} className="cursor-pointer text-rose-600 text-xs">
                  <ion-icon name="trash-outline" class="text-sm mr-2"></ion-icon>
                  <span>Delete</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Expanded Table: Distinct clean designs for Stock vs Credit */}
      {isExpanded && (
        <div className="border-t border-zinc-200 dark:border-zinc-800 bg-background">
          <div className="overflow-x-auto">
            {isStock ? (
              /* ==================== STOCK & INVENTORY REDESIGN ==================== */
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-zinc-100 dark:bg-zinc-800/80 text-foreground font-bold border-b border-zinc-200 dark:border-zinc-700">
                    <th className="py-2.5 px-3 w-10 text-center border-r border-zinc-200 dark:border-zinc-700">#</th>
                    <th className="py-2.5 px-3 border-r border-zinc-200 dark:border-zinc-700">Product / Item Name</th>
                    <th className="py-2.5 px-3 w-48 border-r border-zinc-200 dark:border-zinc-700">Packaging Breakdown</th>
                    <th className="py-2.5 px-3 w-28 text-right border-r border-zinc-200 dark:border-zinc-700">Total Units</th>
                    <th className="py-2.5 px-3 w-32 text-right border-r border-zinc-200 dark:border-zinc-700">Unit Cost (ETB)</th>
                    <th className="py-2.5 px-3 w-36 text-right">Total Value (ETB)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {record.items.map((item, idx) => {
                    const itemTotal = calculateItemTotal(item)
                    const ctns = Number(item.cartons) || 0
                    const pcs = Number(item.pcsPerCarton) || 0
                    const customType = getItemCustomType(item)

                    return (
                      <tr
                        key={item.id || idx}
                        className={idx % 2 === 0 ? 'bg-background' : 'bg-zinc-50/60 dark:bg-zinc-900/30'}
                      >
                        <td className="py-2 px-3 text-center text-muted-foreground border-r border-zinc-200 dark:border-zinc-800 font-medium">
                          {idx + 1}
                        </td>
                        <td className="py-2 px-3 font-semibold text-foreground border-r border-zinc-200 dark:border-zinc-800">
                          {item.name}
                          {customType && (
                            <span className="ml-2 text-[10px] font-normal text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 px-1.5 py-0.5 rounded border border-purple-200 dark:border-purple-800">
                              {customType}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-muted-foreground border-r border-zinc-200 dark:border-zinc-800 font-medium">
                          {ctns > 0 && pcs > 0 ? (
                            <span>
                              <strong>{ctns}</strong> ctns × <strong>{pcs}</strong> pcs
                            </span>
                          ) : ctns > 0 ? (
                            <span>{ctns} cartons</span>
                          ) : (
                            <span>Direct units</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-foreground border-r border-zinc-200 dark:border-zinc-800">
                          {Number(item.quantity).toLocaleString()} pcs
                        </td>
                        <td className="py-2 px-3 text-right text-foreground border-r border-zinc-200 dark:border-zinc-800">
                          {formatCurrency(item.unitPrice)}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(itemTotal)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-zinc-100 dark:bg-zinc-800/90 font-bold border-t-2 border-zinc-300 dark:border-zinc-600 text-xs text-foreground">
                    <td colSpan={2} className="py-2.5 px-3 border-r border-zinc-200 dark:border-zinc-700">
                      Total: {record.items.length} Products
                    </td>
                    <td className="py-2.5 px-3 border-r border-zinc-200 dark:border-zinc-700 text-muted-foreground">
                      {totalCartons > 0 ? `${totalCartons} cartons total` : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right border-r border-zinc-200 dark:border-zinc-700">
                      {totalUnits.toLocaleString()} units
                    </td>
                    <td className="py-2.5 px-3 text-right border-r border-zinc-200 dark:border-zinc-700 text-muted-foreground uppercase text-[10px]">
                      Stock Valuation:
                    </td>
                    <td className="py-2.5 px-3 text-right text-sm text-emerald-600 dark:text-emerald-400 font-extrabold">
                      {formatCurrency(total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            ) : (
              /* ==================== CUSTOMER & SUPPLIER REDESIGN ==================== */
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-zinc-100 dark:bg-zinc-800/80 text-foreground font-bold border-b border-zinc-200 dark:border-zinc-700">
                    <th className="py-2.5 px-3 border-r border-zinc-200 dark:border-zinc-700">
                      {record.type === 'customer' ? 'Item / Goods Delivered' : 'Item / Goods Received'}
                    </th>
                    <th className="py-2.5 px-3 w-32 border-r border-zinc-200 dark:border-zinc-700">Payment / Bank</th>
                    <th className="py-2.5 px-3 w-20 text-right border-r border-zinc-200 dark:border-zinc-700">Qty</th>
                    <th className="py-2.5 px-3 w-28 text-right border-r border-zinc-200 dark:border-zinc-700">Unit Price</th>
                    <th className="py-2.5 px-3 w-36 text-right border-r border-zinc-200 dark:border-zinc-700 text-emerald-700 dark:text-emerald-400">
                      Debit (+)
                    </th>
                    <th className="py-2.5 px-3 w-36 text-right text-rose-700 dark:text-rose-400">
                      Credit (-)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {record.items.map((item, idx) => {
                    const isAdd = item.sign === '+'
                    const itemTotal = calculateItemTotal(item)
                    const bank = getItemBank(item, record.type)

                    return (
                      <tr
                        key={item.id || idx}
                        className={idx % 2 === 0 ? 'bg-background' : 'bg-zinc-50/60 dark:bg-zinc-900/30'}
                      >
                        <td className="py-2 px-3 font-semibold text-foreground border-r border-zinc-200 dark:border-zinc-800">
                          {item.name}
                        </td>
                        <td className="py-2 px-3 border-r border-zinc-200 dark:border-zinc-800">
                          {bank ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                              {bank}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">Stock Delivery</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right font-medium text-foreground border-r border-zinc-200 dark:border-zinc-800">
                          {item.quantity}
                        </td>
                        <td className="py-2 px-3 text-right text-muted-foreground border-r border-zinc-200 dark:border-zinc-800">
                          {formatCurrency(item.unitPrice)}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400 border-r border-zinc-200 dark:border-zinc-800">
                          {isAdd ? formatCurrency(itemTotal) : '—'}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-rose-600 dark:text-rose-400">
                          {!isAdd ? formatCurrency(Math.abs(itemTotal)) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-zinc-100 dark:bg-zinc-800/90 font-bold border-t-2 border-zinc-300 dark:border-zinc-600 text-xs text-foreground">
                    <td colSpan={2} className="py-2.5 px-3 border-r border-zinc-200 dark:border-zinc-700">
                      Total ({record.items.length} records)
                    </td>
                    <td colSpan={2} className="py-2.5 px-3 text-right border-r border-zinc-200 dark:border-zinc-700 text-muted-foreground">
                      Subtotals:
                    </td>
                    <td className="py-2.5 px-3 text-right text-emerald-600 dark:text-emerald-400 font-bold border-r border-zinc-200 dark:border-zinc-700">
                      {formatCurrency(totalDebit)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-rose-600 dark:text-rose-400 font-bold">
                      {formatCurrency(totalCredit)}
                    </td>
                  </tr>
                  <tr className="bg-zinc-50 dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800">
                    <td colSpan={4} className="py-2 px-3 text-right uppercase text-[10px] font-bold text-muted-foreground">
                      Outstanding Net Balance:
                    </td>
                    <td colSpan={2} className={`py-2 px-3 text-right font-extrabold text-sm ${
                      total >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                    }`}>
                      {formatCurrency(total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
