import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  ArrowDownUp,
  Download,
  Package,
  PackagePlus,
  Store,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useLanguage } from '../../context/LanguageContext'
import { useLedger } from '../../context/LedgerContext'
import type { StoreInventoryItem } from '../../types/ledger'
import { getInventoryProducts } from '../../lib/api'
import { Button } from '../ui/button'
import { SmartStockModal } from './SmartStockModal'

interface StockSpreadsheetViewProps {
  onOpenMobileMenu?: () => void
}

export const StockSpreadsheetView: React.FC<StockSpreadsheetViewProps> = ({
  onOpenMobileMenu,
}) => {
  const { activeStoreId, isAdmin } = useAuth()
  const { t, translateDbText } = useLanguage()
  const { formatCurrency, showToast, searchQuery } = useLedger()

  // Products from store_inventory master catalog
  const [products, setProducts] = useState<StoreInventoryItem[]>([])
  const [loading, setLoading] = useState(false)

  // Modals state
  const [isStockModalOpen, setIsStockModalOpen] = useState(false)
  const [stockModalMode, setStockModalMode] = useState<'IN' | 'OUT' | 'REGISTER'>('IN')
  const [targetProductName, setTargetProductName] = useState<string | undefined>(undefined)

  // Fetch real-time products catalog from Neon database
  const loadProducts = useCallback(async () => {
    setLoading(true)
    try {
      const items = await getInventoryProducts(activeStoreId || undefined)
      setProducts(items)
    } catch (err) {
      console.error('Failed to load inventory products:', err)
      showToast(t('Failed to load inventory products.', 'የዕቃ ክምችት ዝርዝር መጫን አልተቻለም።'), 'error')
    } finally {
      setLoading(false)
    }
  }, [activeStoreId, showToast, t])

  useEffect(() => {
    loadProducts()
  }, [loadProducts])

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchName = p.productName.toLowerCase().includes(q)
        const matchSku = p.sku?.toLowerCase().includes(q) ?? false
        const matchCategory = p.category?.toLowerCase().includes(q) ?? false
        const matchSupplier = p.supplierName?.toLowerCase().includes(q) ?? false
        return matchName || matchSku || matchCategory || matchSupplier
      }

      return true
    })
  }, [products, searchQuery])

  // Modal Handlers
  const handleOpenStockIn = (productName?: string) => {
    if (isAdmin) return
    setTargetProductName(productName)
    setStockModalMode('IN')
    setIsStockModalOpen(true)
  }

  const handleOpenRegister = () => {
    if (isAdmin) return
    setTargetProductName(undefined)
    setStockModalMode('REGISTER')
    setIsStockModalOpen(true)
  }

  // Export to CSV
  const handleExportCsv = () => {
    const headers = [
      'No',
      'Product Name',
      'SKU',
      'Current On-Hand Stock',
      'Unit',
      'Packaging Breakdown',
      'Cost Price (ETB)',
      'Selling Price (ETB)',
      'Total Value (ETB)',
      'Date',
      'Supplier',
    ]

    const rows = filteredProducts.map((p, idx) => {
      const qty = Number(p.currentQuantity) || 0
      const cost = Number(p.costPrice) || 0
      const pcsPerCtn = Number(p.pcsPerCarton) || 1
      const ctns = pcsPerCtn > 1 ? Math.floor(qty / pcsPerCtn) : 0
      const remPcs = pcsPerCtn > 1 ? qty % pcsPerCtn : 0
      const packaging =
        pcsPerCtn > 1
          ? `${ctns} ctns + ${remPcs} pcs (${pcsPerCtn}/ctn)`
          : `Direct ${p.baseUnit}`

      const dateStr = (p.lastTransactionDate || p.updatedAt || p.createdAt || '').split('T')[0]

      return [
        String(idx + 1),
        `"${p.productName.replace(/"/g, '""')}"`,
        `"${p.sku || ''}"`,
        String(qty),
        `"${p.baseUnit}"`,
        `"${packaging}"`,
        cost.toFixed(2),
        (Number(p.unitPrice) || 0).toFixed(2),
        (qty * cost).toFixed(2),
        `"${dateStr}"`,
        `"${(p.supplierName || '').replace(/"/g, '""')}"`,
      ]
    })

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `inventory_products_${Date.now()}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="space-y-4">
      {/* Action / Toolbar Header */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 p-2 bg-white text-black rounded-lg border border-zinc-300 shadow-2xs">
        <div className="flex items-center gap-2">
          {onOpenMobileMenu && (
            <button
              type="button"
              onClick={onOpenMobileMenu}
              className="md:hidden p-2 rounded bg-zinc-100 hover:bg-zinc-200 text-black shrink-0 flex items-center justify-center cursor-pointer border border-zinc-300"
              title={t('Open menu', 'ሜኑ ክፈት')}
            >
              <Store size={16} />
            </button>
          )}
          <span className="text-sm font-bold text-foreground">
            {t('Store & Stock Inventory', 'የመደብርና ዕቃዎች ክምችት')}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {!isAdmin && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleOpenStockIn()}
                className="text-xs h-8 rounded-lg border-zinc-300 hover:bg-zinc-100 font-semibold cursor-pointer"
              >
                <ArrowDownUp size={14} className="mr-1" />
                <span>{t('Stock Movement', 'የዕቃ ዝውውር')}</span>
              </Button>
              <Button
                size="sm"
                onClick={handleOpenRegister}
                className="text-xs h-8 rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 font-semibold cursor-pointer"
              >
                <PackagePlus size={14} className="mr-1" />
                <span>{t('New Product', 'አዲስ ዕቃ')}</span>
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={handleExportCsv}
            className="text-xs h-8 rounded-lg border-zinc-300 hover:bg-zinc-100 font-semibold cursor-pointer"
            title={t('Export as CSV', 'በCSV አውርድ')}
          >
            <Download size={14} className="mr-1" />
            <span>{t('Export CSV', 'CSV አውርድ')}</span>
          </Button>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* REAL INVENTORY PRODUCTS TABLE (ONLY STORE LIST VIEW MODE)             */}
      {/* ===================================================================== */}
      {loading ? (
        <div className="p-10 text-center rounded-2xl bg-card border border-zinc-200 dark:border-zinc-800 shadow-xs my-4">
          <p className="text-sm font-semibold text-muted-foreground">
            {t('Loading stock inventory...', 'የክምችት ዝርዝር በመጫን ላይ...')}
          </p>
        </div>
      ) : filteredProducts.length > 0 ? (
        <div className="bg-card rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                {/* Totals summary row (moved to top of table) */}
                <tr className="bg-zinc-100 dark:bg-zinc-800/90 font-bold text-xs text-foreground border-b-2 border-zinc-300 dark:border-zinc-600">
                  <td colSpan={3} className="py-2.5 px-3 border-r border-zinc-200 dark:border-zinc-700 font-black">
                    {t('Total Products:', 'ጠቅላላ ምርቶች:')} {filteredProducts.length}
                  </td>
                  <td className="py-2.5 px-3 text-right border-r border-zinc-200 dark:border-zinc-700 font-black">
                    {filteredProducts.reduce((sum, p) => sum + (Number(p.currentQuantity) || 0), 0).toLocaleString()}
                  </td>
                  <td className="py-2.5 px-3 border-r border-zinc-200 dark:border-zinc-700 text-muted-foreground">
                    {t('Units', 'ፍሬ / ዩኒት')}
                  </td>
                  <td className="py-2.5 px-3 text-right border-r border-zinc-200 dark:border-zinc-700 text-muted-foreground uppercase text-[10px] font-bold">
                    {t('Total Inventory Valuation:', 'ጠቅላላ የክምችት ዋጋ:')}
                  </td>
                  <td className="py-2.5 px-3 text-right text-sm font-black text-blue-600 dark:text-blue-400 border-r border-zinc-200 dark:border-zinc-700">
                    {formatCurrency(
                      filteredProducts.reduce(
                        (sum, p) => sum + (Number(p.currentQuantity) || 0) * (Number(p.costPrice) || 0),
                        0
                      )
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-center text-muted-foreground text-[10px]">
                    —
                  </td>
                </tr>
                <tr className="bg-zinc-100 dark:bg-zinc-800/80 text-foreground font-bold border-b border-zinc-200 dark:border-zinc-700">
                  <th className="py-2.5 px-3 w-10 text-center border-r border-zinc-200 dark:border-zinc-700">
                    #
                  </th>
                  <th className="py-2.5 px-3 border-r border-zinc-200 dark:border-zinc-700">
                    {t('Product / Item Name', 'የምርት ስም')}
                  </th>
                  <th className="py-2.5 px-3 w-32 border-r border-zinc-200 dark:border-zinc-700">
                    {t('SKU / Code', 'የዕቃ መለያ')}
                  </th>
                  <th className="py-2.5 px-3 w-36 text-right border-r border-zinc-200 dark:border-zinc-700">
                    {t('Current On-Hand', 'ያለ ክምችት')}
                  </th>
                  <th className="py-2.5 px-3 w-24 border-r border-zinc-200 dark:border-zinc-700">
                    {t('Unit', 'መለኪያ')}
                  </th>
                  <th className="py-2.5 px-3 w-32 text-right border-r border-zinc-200 dark:border-zinc-700">
                    {t('Purchase Price (ETB)', 'የግዢ ዋጋ')}
                  </th>
                  <th className="py-2.5 px-3 w-32 text-right border-r border-zinc-200 dark:border-zinc-700">
                    {t('Selling Price (ETB)', 'የሽያጭ ዋጋ')}
                  </th>
                  <th className="py-2.5 px-3 w-32 text-center border-r border-zinc-200 dark:border-zinc-700">
                    {t('Date', 'ቀን')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {filteredProducts.map((p, idx) => {
                  const qty = Number(p.currentQuantity) || 0
                  const cost = Number(p.costPrice) || 0
                  const price = Number(p.unitPrice) || 0
                  const pcsPerCtn = Number(p.pcsPerCarton) || 1
                  const ctns = pcsPerCtn > 1 ? Math.floor(qty / pcsPerCtn) : 0
                  const remPcs = pcsPerCtn > 1 ? qty % pcsPerCtn : 0

                  return (
                    <tr
                      key={p.id}
                      className={
                        idx % 2 === 0
                          ? 'bg-background hover:bg-muted/30 transition-colors'
                          : 'bg-zinc-50/60 dark:bg-zinc-900/30 hover:bg-muted/30 transition-colors'
                      }
                    >
                      {/* # */}
                      <td className="py-2.5 px-3 text-center text-muted-foreground border-r border-zinc-200 dark:border-zinc-800 font-medium">
                        {idx + 1}
                      </td>

                      {/* Product Name */}
                      <td className="py-2.5 px-3 border-r border-zinc-200 dark:border-zinc-800 font-bold text-foreground">
                        {translateDbText(p.productName)}
                      </td>

                      {/* SKU / Code */}
                      <td className="py-2.5 px-3 border-r border-zinc-200 dark:border-zinc-800">
                        <span className="font-mono text-xs font-semibold bg-muted/70 px-2 py-0.5 rounded border border-zinc-200/60 dark:border-zinc-700/60 text-foreground">
                          {p.sku || 'N/A'}
                        </span>
                      </td>

                      {/* Current On-Hand Stock */}
                      <td className="py-2.5 px-3 text-right border-r border-zinc-200 dark:border-zinc-800">
                        <div className="text-sm font-bold text-foreground">
                          {qty.toLocaleString()}
                        </div>
                        {pcsPerCtn > 1 && (
                          <div className="text-[10px] text-muted-foreground font-medium">
                            {ctns > 0 ? `${ctns} ${t('ctns', 'ካርቶን')}` : ''} {remPcs > 0 ? `+ ${remPcs} ${t('pcs', 'ፍሬ')}` : ''}
                          </div>
                        )}
                      </td>

                      {/* Unit */}
                      <td className="py-2.5 px-3 border-r border-zinc-200 dark:border-zinc-800 font-medium text-foreground">
                        {translateDbText(p.baseUnit || 'Pieces')}
                      </td>

                      {/* Purchase Price */}
                      <td className="py-2.5 px-3 text-right border-r border-zinc-200 dark:border-zinc-800 font-semibold text-foreground">
                        {formatCurrency(cost)}
                      </td>

                      {/* Selling Price */}
                      <td className="py-2.5 px-3 text-right border-r border-zinc-200 dark:border-zinc-800 font-semibold text-foreground">
                        {formatCurrency(price)}
                      </td>

                      {/* Date / Calendar */}
                      <td className="py-2.5 px-3 text-center border-r border-zinc-200 dark:border-zinc-800 font-mono text-xs text-foreground font-semibold">
                        {(() => {
                          const raw = p.lastTransactionDate || p.updatedAt || p.createdAt
                          if (!raw) return '—'
                          return raw.includes('T') ? raw.split('T')[0] : raw
                        })()}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Empty State */
        <div className="p-10 text-center rounded-2xl bg-card border border-zinc-200 dark:border-zinc-800 shadow-xs my-4">
          <div className="w-12 h-12 rounded-2xl bg-muted text-muted-foreground flex items-center justify-center mx-auto mb-3">
            <Package size={24} />
          </div>
          <h3 className="text-base font-bold text-foreground">
            {searchQuery
              ? t('No matching products found', 'ምንም የተገኘ ምርት የለም')
              : t('No products registered in this store yet', 'በዚህ መደብር የተመዘገበ ምርት የለም')}
          </h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1 mb-5">
            {isAdmin
              ? t(
                  'Products and stock levels will appear here once registered by assigned storekeepers.',
                  'ምርቶች በመደብር ኃላፊዎች ሲመዘገቡ እዚህ ይታያሉ።'
                )
              : t(
                  'Register your products to track real-time inventory, on-hand balances, and strict Stock In/Out movements.',
                  'ምርቶችዎን በመመዝገብ ትክክለኛ የክምችት መጠንና የዕቃ ገቢ/ወጪ ዝውውሮችን ያስተዳድሩ።'
                )}
          </p>
          {!isAdmin && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                size="sm"
                onClick={handleOpenRegister}
                className="text-xs font-semibold h-8 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer shadow-xs"
              >
                <PackagePlus size={14} className="mr-1" />
                <span>{t('Register First Product', 'የመጀመሪያውን ምርት መዝግብ')}</span>
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Smart Stock In / Stock Out / Register Modal */}
      <SmartStockModal
        isOpen={isStockModalOpen}
        initialMode={stockModalMode}
        preselectedProductName={targetProductName}
        onClose={() => {
          setIsStockModalOpen(false)
          setTargetProductName(undefined)
        }}
        onSuccess={() => loadProducts()}
      />
    </div>
  )
}
