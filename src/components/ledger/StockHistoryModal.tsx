import React, { useState, useEffect, useMemo } from 'react'
import {
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  CircleX,
  Clock,
  Download,
  Package,
  RefreshCw,
  Search,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useLanguage } from '../../context/LanguageContext'
import { useLedger } from '../../context/LedgerContext'
import type { StockMovement } from '../../types/ledger'
import { getStockMovements } from '../../lib/api'
import { formatDate } from '../../lib/formatters'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'

interface StockHistoryModalProps {
  isOpen: boolean
  productId?: string
  productName?: string
  onClose: () => void
}

export const StockHistoryModal: React.FC<StockHistoryModalProps> = ({
  isOpen,
  productId,
  productName,
  onClose,
}) => {
  const { activeStoreId } = useAuth()
  const { t } = useLanguage()
  const { formatCurrency } = useLedger()

  const [movements, setMovements] = useState<StockMovement[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'IN' | 'OUT'>('ALL')
  const [dateFilter, setDateFilter] = useState('')

  const loadMovements = async () => {
    setLoading(true)
    try {
      const data = await getStockMovements(
        productId || undefined,
        activeStoreId || undefined
      )
      setMovements(data)
    } catch (err) {
      console.error('Failed to load stock movements:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      loadMovements()
    }
  }, [isOpen, productId, activeStoreId])

  const availableDates = useMemo(() => {
    const set = new Set<string>()
    movements.forEach((m) => {
      if (m.transactionDate) set.add(m.transactionDate)
    })
    return Array.from(set).sort().reverse()
  }, [movements])

  const filteredMovements = useMemo(() => {
    return movements.filter((m) => {
      if (typeFilter !== 'ALL' && m.movementType !== typeFilter) return false
      if (dateFilter && m.transactionDate !== dateFilter) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchNote = m.note?.toLowerCase().includes(q) ?? false
        const matchRef = m.referenceNumber?.toLowerCase().includes(q) ?? false
        const matchDest = m.destination?.toLowerCase().includes(q) ?? false
        const matchSource = m.sourceId?.toLowerCase().includes(q) ?? false
        return matchNote || matchRef || matchDest || matchSource
      }
      return true
    })
  }, [movements, typeFilter, dateFilter, searchQuery])

  const handleExportCsv = () => {
    const headers = [
      'No',
      'Transaction Date',
      'Movement',
      'Quantity',
      'Unit',
      'Previous Balance',
      'New Balance',
      'Unit Price (ETB)',
      'Total Value (ETB)',
      'Source / Supplier',
      'Destination / Customer',
      'Reference #',
      'Notes',
      'Performed By',
    ]

    const rows = filteredMovements.map((m, idx) => [
      String(idx + 1),
      `"${m.transactionDate}"`,
      `"${m.movementType === 'IN' ? 'Stock In' : 'Stock Out'}"`,
      m.movementType === 'IN' ? `+${m.quantity}` : `-${m.quantity}`,
      `"${m.transactionUnit}"`,
      String(m.previousStock),
      String(m.newStock),
      m.unitPrice.toFixed(2),
      m.totalPrice.toFixed(2),
      `"${(m.sourceId || '').replace(/"/g, '""')}"`,
      `"${(m.destination || '').replace(/"/g, '""')}"`,
      `"${(m.referenceNumber || '').replace(/"/g, '""')}"`,
      `"${(m.note || '').replace(/"/g, '""')}"`,
      `"${(m.createdByName || m.createdBy || '').replace(/"/g, '""')}"`,
    ])

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `stock_movements_${productId || 'all'}_${Date.now()}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden bg-card border-zinc-200 dark:border-zinc-800 rounded-3xl">
        <DialogHeader className="p-4 sm:p-5 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 flex items-center justify-center">
                <Clock size={18} />
              </div>
              <div>
                <DialogTitle className="text-base sm:text-lg font-black text-foreground">
                  {productName
                    ? `${productName} – ${t('Stock Movement History', 'የዕቃ ዝውውር ታሪክ')}`
                    : t('Complete Stock Movements Ledger', 'ሙሉ የዕቃ ዝውውር መዝገብ')}
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t(
                    'Immutable audit trail of all Stock In and Stock Out operations',
                    'የሁሉም የዕቃ ገቢና ወጪ ክንውኖች የተሟላ መዝገብ'
                  )}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              className="text-xs h-8 px-2.5 rounded-xl cursor-pointer hidden sm:flex items-center gap-1.5"
            >
              <Download size={14} />
              <span>{t('Export CSV', 'አውርድ')}</span>
            </Button>
          </div>
        </DialogHeader>

        {/* Filters Bar */}
        <div className="p-3 bg-muted/20 border-b border-zinc-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder={t('Search by customer, supplier, notes, reference...', 'በተቀባይ፣ አቅራቢ፣ ማስታወሻ ፈልግ...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-background focus:outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <CircleX size={13} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Type Filter */}
            <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg border border-zinc-200 dark:border-zinc-700">
              <button
                type="button"
                onClick={() => setTypeFilter('ALL')}
                className={`px-2 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                  typeFilter === 'ALL'
                    ? 'bg-background text-foreground shadow-2xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t('All', 'ሁሉም')}
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('IN')}
                className={`px-2 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                  typeFilter === 'IN'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                + {t('Stock In', 'ገቢ')}
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('OUT')}
                className={`px-2 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                  typeFilter === 'OUT'
                    ? 'bg-rose-600 text-white shadow-2xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                - {t('Stock Out', 'ወጪ')}
              </button>
            </div>

            {/* Date filter */}
            {availableDates.length > 0 && (
              <div className="flex items-center gap-1 bg-background rounded-lg px-2 py-1 border border-zinc-200 dark:border-zinc-700">
                <Calendar size={13} className="text-muted-foreground" />
                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="bg-transparent text-[11px] font-medium text-foreground focus:outline-none cursor-pointer"
                >
                  <option value="">{t('All Dates', 'ሁሉም ቀናት')}</option>
                  {availableDates.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={loadMovements}
              className="h-7 w-7 p-0 rounded-lg"
              title="Refresh"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </Button>
          </div>
        </div>

        {/* Movements Table */}
        <div className="flex-1 overflow-y-auto max-h-[60vh]">
          {loading ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              <RefreshCw size={20} className="animate-spin mx-auto mb-2 text-primary" />
              <span>{t('Loading stock transaction records...', 'የዕቃ ዝውውር መዝገቦችን በመጫን ላይ...')}</span>
            </div>
          ) : filteredMovements.length > 0 ? (
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-zinc-100 dark:bg-zinc-800/80 text-foreground font-bold border-b border-zinc-200 dark:border-zinc-700 sticky top-0 z-10">
                  <th className="py-2.5 px-3 w-10 text-center border-r border-zinc-200 dark:border-zinc-700">#</th>
                  <th className="py-2.5 px-3 w-28 border-r border-zinc-200 dark:border-zinc-700">{t('Date', 'ቀን')}</th>
                  <th className="py-2.5 px-3 w-28 border-r border-zinc-200 dark:border-zinc-700">{t('Type', 'ዓይነት')}</th>
                  <th className="py-2.5 px-3 w-28 text-right border-r border-zinc-200 dark:border-zinc-700">{t('Quantity', 'ብዛት')}</th>
                  <th className="py-2.5 px-3 w-36 text-center border-r border-zinc-200 dark:border-zinc-700">{t('Balance Change', 'የክምችት ለውጥ')}</th>
                  <th className="py-2.5 px-3 w-28 text-right border-r border-zinc-200 dark:border-zinc-700">{t('Unit Price', 'የአንዱ ዋጋ')}</th>
                  <th className="py-2.5 px-3 w-32 text-right border-r border-zinc-200 dark:border-zinc-700">{t('Total', 'ጠቅላላ')}</th>
                  <th className="py-2.5 px-3 border-r border-zinc-200 dark:border-zinc-700">{t('Party / Destination / Supplier', 'ተቀባይ / መድረሻ / አቅራቢ')}</th>
                  <th className="py-2.5 px-3 w-32 border-r border-zinc-200 dark:border-zinc-700">{t('Performed By', 'የፈጽመው ሰው')}</th>
                  <th className="py-2.5 px-3">{t('Notes', 'ማስታወሻ')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {filteredMovements.map((m, idx) => {
                  const isOut = m.movementType === 'OUT'
                  return (
                    <tr
                      key={m.id || idx}
                      className={
                        idx % 2 === 0
                          ? 'bg-background hover:bg-muted/30'
                          : 'bg-zinc-50/60 dark:bg-zinc-900/30 hover:bg-muted/30'
                      }
                    >
                      <td className="py-2.5 px-3 text-center text-muted-foreground border-r border-zinc-200 dark:border-zinc-800 font-medium">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3 border-r border-zinc-200 dark:border-zinc-800 font-medium whitespace-nowrap">
                        {formatDate(m.transactionDate) || m.transactionDate}
                      </td>
                      <td className="py-2.5 px-3 border-r border-zinc-200 dark:border-zinc-800">
                        {isOut ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                            <ArrowUpRight size={12} className="text-rose-600" />
                            <span>Stock Out</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            <ArrowDownRight size={12} className="text-emerald-600" />
                            <span>Stock In</span>
                          </span>
                        )}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-black border-r border-zinc-200 dark:border-zinc-800 ${
                          isOut ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {isOut ? '-' : '+'}
                        {m.quantity.toLocaleString()} {m.transactionUnit}
                      </td>
                      <td className="py-2.5 px-3 text-center border-r border-zinc-200 dark:border-zinc-800 font-medium">
                        <span className="text-muted-foreground">{m.previousStock.toLocaleString()}</span>
                        <span className="mx-1 text-muted-foreground">→</span>
                        <span className="font-extrabold text-foreground">{m.newStock.toLocaleString()}</span>
                      </td>
                      <td className="py-2.5 px-3 text-right border-r border-zinc-200 dark:border-zinc-800 font-semibold text-foreground">
                        ETB {m.unitPrice.toFixed(2)}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-black border-r border-zinc-200 dark:border-zinc-800 ${
                          isOut ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {isOut ? '-' : '+'}
                        {formatCurrency(m.totalPrice)}
                      </td>
                      <td className="py-2.5 px-3 border-r border-zinc-200 dark:border-zinc-800">
                        {m.destination ? (
                          <span className="font-bold text-foreground">
                            {t('Destination:', 'መድረሻ:')} {m.destination}
                          </span>
                        ) : m.sourceId ? (
                          <span className="font-bold text-foreground">
                            {t('Supplier:', 'አቅራቢ:')} {m.sourceId}
                          </span>
                        ) : (
                          <span className="text-muted-foreground italic">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 border-r border-zinc-200 dark:border-zinc-800">
                        {m.createdByName || m.createdBy ? (
                          <span className="font-semibold text-foreground">
                            {m.createdByName || m.createdBy}
                          </span>
                        ) : (
                          <span className="text-muted-foreground italic">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground italic">
                        {m.note || m.referenceNumber || '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <div className="p-10 text-center text-xs text-muted-foreground">
              <Package size={24} className="mx-auto mb-2 opacity-50" />
              <p>{t('No stock transaction movements found.', 'ምንም የዕቃ ዝውውር መዝገብ አልተገኘም።')}</p>
            </div>
          )}
        </div>

        <div className="p-3 bg-muted/20 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-xs text-muted-foreground shrink-0">
          <span>
            {t('Total Records:', 'ጠቅላላ መዝገቦች:')} <strong>{filteredMovements.length}</strong>
          </span>
          <Button size="sm" variant="outline" onClick={onClose} className="text-xs h-8 px-3 rounded-xl cursor-pointer">
            {t('Close', 'ዝጋ')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

