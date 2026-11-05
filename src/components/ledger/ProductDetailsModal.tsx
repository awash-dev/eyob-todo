import React from 'react'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Eye,
  Info,
  Pencil,
  XCircle,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useLanguage } from '../../context/LanguageContext'
import { useLedger } from '../../context/LedgerContext'
import type { StoreInventoryItem } from '../../types/ledger'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'

interface ProductDetailsModalProps {
  isOpen: boolean
  product: StoreInventoryItem | null
  onClose: () => void
  onStockIn: (product: StoreInventoryItem) => void
  onStockOut: (product: StoreInventoryItem) => void
  onHistory: (product: StoreInventoryItem) => void
  onEdit: (product: StoreInventoryItem) => void
}

type ProductStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK'

/**
 * Read-only product details dialog: full master data, live on-hand quantity,
 * stock status and quick Stock In / Stock Out / History actions.
 */
export const ProductDetailsModal: React.FC<ProductDetailsModalProps> = ({
  isOpen,
  product,
  onClose,
  onStockIn,
  onStockOut,
  onHistory,
  onEdit,
}) => {
  const { isAdmin } = useAuth()
  const { t, translateDbText } = useLanguage()
  const { formatCurrency } = useLedger()

  if (!product) return null

  const qty = Number(product.currentQuantity) || 0
  const min = Number(product.minimumStock) || 0
  const cost = Number(product.costPrice) || 0
  const price = Number(product.unitPrice) || 0

  const status: ProductStatus =
    qty <= 0 ? 'OUT_OF_STOCK' : qty <= min ? 'LOW_STOCK' : 'IN_STOCK'

  const formatDate = (value?: string) => {
    if (!value) return '—'
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString()
  }

  const detailRows: Array<{ label: string; value: React.ReactNode }> = [
    {
      label: t('SKU Code', 'የዕቃ መለያ'),
      value: (
        <span className="font-mono font-semibold">{product.sku || 'N/A'}</span>
      ),
    },
    { label: t('Category', 'ምድብ'), value: translateDbText(product.category || 'General') },
    { label: t('Unit', 'መለኪያ'), value: translateDbText(product.baseUnit || 'Pcs') },
    {
      label: t('Minimum Stock Level', 'አነስተኛ የክምችት መጠን'),
      value: min.toLocaleString(),
    },
    {
      label: t('Purchase Price', 'የግዢ ዋጋ'),
      value: <span className="font-semibold">{formatCurrency(cost)}</span>,
    },
    {
      label: t('Selling Price', 'የሽያጭ ዋጋ'),
      value: <span className="font-semibold">{formatCurrency(price)}</span>,
    },
    {
      label: t('Pieces per Carton', 'ፍሬ በካርቶን'),
      value:
        Number(product.pcsPerCarton) > 1
          ? `${Number(product.pcsPerCarton)} ${t('pcs/ctn', 'ፍሬ/ካርቶን')}`
          : t('Direct units', 'በቀጥታ ፍሬ'),
    },
    { label: t('Supplier', 'አቅራቢ'), value: translateDbText(product.supplierName || '—') },
    {
      label: t('Last Transaction', 'የመጨረሻ ዝውውር'),
      value: product.lastTransactionDate || '—',
    },
    { label: t('Registered On', 'የተመዘገበበት ቀን'), value: formatDate(product.createdAt) },
    { label: t('Last Updated', 'የተሻሻለበት ቀን'), value: formatDate(product.updatedAt) },
    {
      label: t('Inventory Value (at cost)', 'የክምችት ዋጋ (በግዢ)'),
      value: <span className="font-bold text-blue-600 dark:text-blue-400">{formatCurrency(qty * cost)}</span>,
    },
  ]

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg p-0 overflow-hidden bg-card border-zinc-200 dark:border-zinc-800 rounded-3xl">
        <DialogHeader className="p-4 sm:p-5 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 flex items-center justify-center shrink-0">
                <Info size={18} />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-base font-black text-foreground truncate">
                  {t('Product Details', 'የምርት ዝርዝሮች')}
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {translateDbText(product.productName)} ({product.sku || 'No SKU'})
                </p>
              </div>
            </div>
            {isAdmin && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shrink-0">
                <Eye size={12} />
                <span>{t('View Mode', 'እይታ ሁኔታ')}</span>
              </span>
            )}
          </div>
        </DialogHeader>

        <div className="p-4 sm:p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Live on-hand quantity + status */}
          <div
            className={`p-3.5 rounded-xl border flex items-center justify-between ${
              status === 'IN_STOCK'
                ? 'bg-emerald-50/70 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900/50'
                : status === 'LOW_STOCK'
                ? 'bg-amber-50/70 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/50'
                : 'bg-rose-50/70 border-rose-200 dark:bg-rose-950/30 dark:border-rose-900/50'
            }`}
          >
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                {t('Current On-Hand Quantity', 'ያለ የክምችት መጠን')}
              </div>
              <div
                className={`text-2xl font-black tracking-tight ${
                  status === 'IN_STOCK'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : status === 'LOW_STOCK'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {qty.toLocaleString()}{' '}
                <span className="text-sm font-bold">{translateDbText(product.baseUnit)}</span>
              </div>
            </div>
            {status === 'IN_STOCK' ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 size={13} />
                {t('In Stock', 'ክምችት አለ')}
              </span>
            ) : status === 'LOW_STOCK' ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                <AlertTriangle size={13} />
                {t('Low Stock', 'አነስተኛ ክምችት')}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                <XCircle size={13} />
                {t('Out of Stock', 'ያለቀ')}
              </span>
            )}
          </div>

          {/* Detail grid */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-xs">
            {detailRows.map((row) => (
              <div key={row.label} className="min-w-0">
                <span className="text-muted-foreground block text-[11px]">
                  {row.label}
                </span>
                <span className="text-foreground font-semibold break-words">
                  {row.value}
                </span>
              </div>
            ))}
          </div>

          {/* Description */}
          <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800">
            <span className="text-muted-foreground block text-[11px] mb-1">
              {t('Description', 'ማብራሪያ')}
            </span>
            <span className="text-xs text-foreground">
              {product.description || '—'}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="p-3.5 bg-muted/20 border-t border-zinc-100 dark:border-zinc-800 flex flex-wrap items-center justify-end gap-2">
          {!isAdmin && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onEdit(product)}
              className="text-xs h-8 rounded-xl cursor-pointer"
            >
              <Pencil size={13} className="mr-1" />
              {t('Edit', 'አስተካክል')}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onHistory(product)}
            className="text-xs h-8 rounded-xl cursor-pointer"
          >
            <Clock size={13} className="mr-1" />
            {t('Stock History', 'የዕቃ ታሪክ')}
          </Button>
          {!isAdmin && (
            <>
              <Button
                type="button"
                size="sm"
                onClick={() => onStockIn(product)}
                className="text-xs h-8 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-xs"
              >
                <ArrowDownRight size={13} className="mr-1" />
                {t('+ Stock In', '+ ዕቃ ገቢ')}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={qty <= 0}
                onClick={() => onStockOut(product)}
                className={`text-xs h-8 rounded-xl shadow-xs ${
                  qty <= 0
                    ? 'bg-rose-400/60 text-white cursor-not-allowed'
                    : 'bg-rose-600 hover:bg-rose-700 text-white cursor-pointer'
                }`}
                title={
                  qty <= 0
                    ? t('Cannot stock out: product is out of stock', 'ክምችት ስለሌለ ወጪ ማድረግ አይቻልም')
                    : undefined
                }
              >
                <ArrowUpRight size={13} className="mr-1" />
                {t('- Stock Out', '- ዕቃ ወጪ')}
              </Button>
            </>
          )}
          {isAdmin && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="text-xs h-8 rounded-xl cursor-pointer font-semibold"
            >
              {t('Close', 'ዝጋ')}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
