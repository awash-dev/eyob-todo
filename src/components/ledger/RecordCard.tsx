import React, { useState } from 'react'
import type { LedgerRecord } from '../../types/ledger'
import { useLedger } from '../../context/LedgerContext'
import {
  formatDate,
  calculateRecordTotal,
  calculateItemTotal,
  generateRecordShareText,
} from '../../lib/formatters'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
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
    currency,
    usdtRate,
  } = useLedger()

  const total = calculateRecordTotal(record)
  const isPositive = total >= 0

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    const text = generateRecordShareText(record, currency)
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
    <div className="bg-card rounded-xl shadow-xs hover:shadow-sm ring-1 ring-zinc-950/5 dark:ring-white/5 transition-all duration-200 overflow-hidden mb-2.5 print-shadow-none">
      {/* Header row / Accordion toggle */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="p-3.5 sm:px-4 sm:py-3 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-muted/20 transition-colors"
      >
        <div className="flex items-start gap-2.5">
          <button
            type="button"
            className="p-1 rounded-md text-muted-foreground hover:bg-muted/60 transition-colors mt-0.5 no-print flex items-center justify-center min-w-[28px] min-h-[28px]"
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            <ion-icon
              name={isExpanded ? 'chevron-up-outline' : 'chevron-down-outline'}
              class="text-base text-muted-foreground"
            ></ion-icon>
          </button>

          <div>
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <h3 className="font-bold text-sm sm:text-base text-foreground tracking-tight">
                {record.title}
              </h3>
              <Badge
                variant="outline"
                className="text-[10px] text-muted-foreground font-normal border-0 bg-muted/60 px-1.5 py-0 h-4.5"
              >
                {record.items.length}{' '}
                {record.items.length === 1 ? 'item' : 'items'}
              </Badge>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 text-[11px] text-muted-foreground mt-0.5">
              <span className="flex items-center gap-1 font-medium">
                <ion-icon name="calendar-outline" class="text-xs"></ion-icon>
                <span>{formatDate(record.date)}</span>
              </span>
              {record.notes && (
                <span className="flex items-center gap-1 max-w-xs sm:max-w-md truncate text-zinc-500">
                  <ion-icon
                    name="document-text-outline"
                    class="text-xs shrink-0"
                  ></ion-icon>
                  <span className="truncate">{record.notes}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right side: Balance and quick actions */}
        <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0 ml-7 sm:ml-0">
          <div className="text-right">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block">
              {record.type === 'stock' ? 'Total Value' : 'Net Balance'}
            </span>
            <div
              className={`text-base sm:text-lg font-bold tracking-tight ${
                isPositive
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {formatCurrency(total)}
            </div>
            {total !== 0 && currency === 'ETB' && (
              <span className="text-[10px] text-muted-foreground font-mono block">
                ≈ {(Math.abs(total) / usdtRate).toFixed(1)} USDT
              </span>
            )}
          </div>

          {/* Action buttons with touch-friendly sizing */}
          <div className="flex items-center gap-1 no-print">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleEdit}
              className="h-8 w-8 text-muted-foreground hover:text-foreground flex items-center justify-center rounded-lg"
              title="Edit Record"
            >
              <ion-icon name="create-outline" class="text-base"></ion-icon>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground flex items-center justify-center rounded-lg"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ion-icon
                    name="ellipsis-vertical-outline"
                    class="text-base"
                  ></ion-icon>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem
                  onClick={handleEdit}
                  className="cursor-pointer text-xs flex items-center"
                >
                  <ion-icon
                    name="create-outline"
                    class="text-sm mr-2 text-muted-foreground"
                  ></ion-icon>
                  <span>Edit Record</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleCopy}
                  className="cursor-pointer text-xs flex items-center"
                >
                  <ion-icon
                    name="copy-outline"
                    class="text-sm mr-2 text-muted-foreground"
                  ></ion-icon>
                  <span>Copy Summary</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleDelete}
                  className="cursor-pointer text-destructive focus:text-destructive text-xs flex items-center"
                >
                  <ion-icon
                    name="trash-outline"
                    class="text-sm mr-2 text-destructive"
                  ></ion-icon>
                  <span>Delete</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Expanded Line Items Detail */}
      {isExpanded && (
        <div className="border-t border-zinc-100 dark:border-zinc-800/80 bg-muted/15 px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-100 dark:border-zinc-800 text-muted-foreground text-[10px] uppercase tracking-wider">
                  <th className="text-left font-semibold py-1.5 w-16">Type</th>
                  <th className="text-left font-semibold py-1.5">
                    Item / Description
                  </th>
                  <th className="text-right font-semibold py-1.5 w-24">
                    Unit Price
                  </th>
                  <th className="text-right font-semibold py-1.5 w-14">Qty</th>
                  <th className="text-right font-semibold py-1.5 w-24">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {record.items.map((item, idx) => {
                  const isAdd = item.sign === '+'
                  const itemTotal = calculateItemTotal(item)

                  return (
                    <tr
                      key={item.id || idx}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      {/* Sign indicator */}
                      <td className="py-2">
                        {isAdd ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-[10px] text-emerald-700 bg-emerald-100/70 dark:bg-emerald-950/70 dark:text-emerald-300 px-1.5 py-0.5 rounded-md">
                            <ion-icon
                              name="add-circle-outline"
                              class="text-xs"
                            ></ion-icon>
                            <span>Add</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-semibold text-[10px] text-rose-700 bg-rose-100/70 dark:bg-rose-950/70 dark:text-rose-300 px-1.5 py-0.5 rounded-md">
                            <ion-icon
                              name="remove-circle-outline"
                              class="text-xs"
                            ></ion-icon>
                            <span>Deduct</span>
                          </span>
                        )}
                      </td>

                      {/* Name */}
                      <td className="py-2 font-medium text-foreground pr-2">
                        {item.name}
                      </td>

                      {/* Unit Price */}
                      <td className="py-2 text-right text-muted-foreground font-mono">
                        {formatCurrency(item.unitPrice)}
                      </td>

                      {/* Quantity */}
                      <td className="py-2 text-right text-muted-foreground font-mono">
                        {item.quantity}
                      </td>

                      {/* Total */}
                      <td
                        className={`py-2 text-right font-mono font-semibold ${
                          isAdd
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {formatCurrency(itemTotal)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Subtotal summary footer within expanded card */}
          <div className="flex items-center justify-between pt-2.5 mt-2 border-t border-zinc-200/60 dark:border-zinc-800/60 text-xs">
            <span className="text-[11px] text-muted-foreground">
              Total of {record.items.length} items
            </span>
            <div className="font-mono font-bold text-sm text-foreground">
              {formatCurrency(total)}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
