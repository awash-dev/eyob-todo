import React, { useState, useEffect, useMemo } from 'react'
import { AlertCircle, Pencil, Save } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useLanguage } from '../../context/LanguageContext'
import { useLedger } from '../../context/LedgerContext'
import type { StoreInventoryItem } from '../../types/ledger'
import { updateInventoryProduct } from '../../lib/api'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { EthioDatePicker } from '../common/EthioDatePicker'

interface EditProductModalProps {
  isOpen: boolean
  product: StoreInventoryItem | null
  onClose: () => void
  onSuccess: () => void
}

export const EditProductModal: React.FC<EditProductModalProps> = ({
  isOpen,
  product,
  onClose,
  onSuccess,
}) => {
  const { user, isAdmin } = useAuth()
  const { t } = useLanguage()
  const { showToast, formatCurrency } = useLedger()

  // Form Fields
  const [productName, setProductName] = useState('')
  const [sku, setSku] = useState('')
  const [quantityCartons, setQuantityCartons] = useState<number>(0)
  const [quantityPerCarton, setQuantityPerCarton] = useState<number>(1)
  const [unit, setUnit] = useState('PCS')
  const [pricePerPiece, setPricePerPiece] = useState<number>(0)
  const [isActive, setIsActive] = useState<boolean>(true)
  const [category, setCategory] = useState('General')
  const [supplierName, setSupplierName] = useState('')
  const [description, setDescription] = useState('')
  const [transactionDate, setTransactionDate] = useState(
    new Date().toISOString().split('T')[0]
  )

  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Populate form when product changes
  useEffect(() => {
    if (product) {
      setProductName(product.productName)
      setSku(product.sku || '')
      setQuantityCartons(Number(product.quantityCartons) || 0)
      setQuantityPerCarton(
        Number(product.quantityPerCarton) || Number(product.pcsPerCarton) || 1
      )
      setUnit(product.unit || product.baseUnit || 'PCS')
      setPricePerPiece(
        Number(product.pricePerPiece) || Number(product.unitPrice) || Number(product.costPrice) || 0
      )
      setIsActive(product.isActive !== false)
      setCategory(product.category || 'General')
      setSupplierName(product.supplierName || '')
      setDescription(product.description || '')
      setTransactionDate(
        product.lastTransactionDate || new Date().toISOString().split('T')[0]
      )
      setErrorMsg(null)
    }
  }, [product, isOpen])

  // Live Automatic Calculations:
  // total_quantity = quantity_cartons * quantity_per_carton
  const calculatedTotalQuantity = useMemo(() => {
    const ctns = Math.max(0, Number(quantityCartons) || 0)
    const perCtn = Math.max(0, Number(quantityPerCarton) || 0)
    return Math.round(ctns * perCtn * 1000) / 1000
  }, [quantityCartons, quantityPerCarton])

  // total_value = total_quantity * price_per_piece
  const calculatedTotalValue = useMemo(() => {
    const price = Math.max(0, Number(pricePerPiece) || 0)
    return Math.round(calculatedTotalQuantity * price * 100) / 100
  }, [calculatedTotalQuantity, pricePerPiece])

  // Security check: Only Admin can access
  if (!isOpen || !product || !isAdmin) return null

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!product) return

    if (!productName.trim()) {
      setErrorMsg(t('Product name is required.', 'የምርት ስም ማስገባት ግዴታ ነው።'))
      return
    }

    if (quantityCartons < 0 || quantityPerCarton < 0 || pricePerPiece < 0) {
      setErrorMsg(t('Quantities and prices cannot be negative.', 'መጠኖችና ዋጋዎች ከዜሮ በታች መሆን አይችሉም።'))
      return
    }

    setSaving(true)
    setErrorMsg(null)

    try {
      await updateInventoryProduct(
        product.id,
        {
          productName: productName.trim(),
          sku: sku.trim() || undefined,
          quantityCartons: Number(quantityCartons) || 0,
          quantityPerCarton: Math.max(0.001, Number(quantityPerCarton) || 1),
          totalQuantity: calculatedTotalQuantity,
          unit: unit.trim() || 'PCS',
          pricePerPiece: Number(pricePerPiece) || 0,
          totalValue: calculatedTotalValue,
          isActive,
          category: category.trim() || 'General',
          baseUnit: unit.trim() || 'PCS',
          costPrice: Number(pricePerPiece) || 0,
          unitPrice: Number(pricePerPiece) || 0,
          pcsPerCarton: Math.max(0.001, Number(quantityPerCarton) || 1),
          supplierName: supplierName.trim() || undefined,
          description: description.trim() || undefined,
          transactionDate,
        },
        user
      )

      showToast(
        t(`Updated "${productName}" successfully!`, `"${productName}" በተሳካ ሁኔታ ተሻሽሏል!`),
        'success'
      )
      onSuccess()
      onClose()
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update product.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg p-0 overflow-hidden bg-card border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl">
        <DialogHeader className="p-4 sm:p-5 border-b border-zinc-200 dark:border-zinc-800 bg-muted/20">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 flex items-center justify-center">
              <Pencil size={16} />
            </div>
            <div>
              <DialogTitle className="text-sm sm:text-base font-bold text-foreground">
                {t('Edit Store Product', 'የመደብር ዕቃ አስተካክል')}
              </DialogTitle>
              <p className="text-xs text-muted-foreground">
                {product.productName} ({product.sku || 'No SKU'})
              </p>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSave} className="p-4 sm:p-5 space-y-3 max-h-[78vh] overflow-y-auto text-xs">
          {errorMsg && (
            <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-lg text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0 text-rose-500" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Product Name */}
          <div>
            <label className="text-xs font-semibold text-foreground block mb-1">
              {t('Product / Item Name *', 'የዕቃ ስም *')}
            </label>
            <input
              type="text"
              required
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              className="w-full h-8.5 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* SKU & Packaging Unit */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">
                {t('SKU / Code', 'የዕቃ መለያ')}
              </label>
              <input
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className="w-full h-8.5 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-background text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">
                {t('Packaging / Unit', 'መለኪያ')}
              </label>
              <input
                type="text"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="PCS / Carton"
                className="w-full h-8.5 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* Quantity in Cartons & Quantity per Carton */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">
                {t('Quantity (Cartons) *', 'ብዛት (ካርቶን) *')}
              </label>
              <input
                type="number"
                min="0"
                step="any"
                required
                value={quantityCartons}
                onChange={(e) => setQuantityCartons(Number(e.target.value) || 0)}
                className="w-full h-8.5 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-background text-foreground font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">
                {t('Quantity per Carton *', 'ፍሬ በካርቶን *')}
              </label>
              <input
                type="number"
                min="0.001"
                step="any"
                required
                value={quantityPerCarton}
                onChange={(e) => setQuantityPerCarton(Number(e.target.value) || 1)}
                className="w-full h-8.5 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-background text-foreground font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* Price per Piece */}
          <div>
            <label className="text-xs font-semibold text-foreground block mb-1">
              {t('Price per Piece (ETB) *', 'የአንዱ ዋጋ (ብር) *')}
            </label>
            <input
              type="number"
              min="0"
              step="any"
              required
              value={pricePerPiece}
              onChange={(e) => setPricePerPiece(Number(e.target.value) || 0)}
              className="w-full h-8.5 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-background text-foreground font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Read-Only Summary Box (Live Calculations) */}
          <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/60 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                {t('Total Quantity (Auto):', 'ጠቅላላ ፍሬ (ራስ-ሰር)፡')}
              </span>
              <span className="font-bold text-foreground">
                {calculatedTotalQuantity.toLocaleString()} {unit}
                <span className="text-[10px] text-muted-foreground font-normal ml-1">
                  ({quantityCartons} × {quantityPerCarton})
                </span>
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-zinc-200/60 dark:border-zinc-700/60 pt-1.5">
              <span className="text-muted-foreground font-semibold">
                {t('Total Value (Auto):', 'ጠቅላላ ዋጋ (ራስ-ሰር)፡')}
              </span>
              <span className="text-sm font-black text-blue-600 dark:text-blue-400">
                {formatCurrency(calculatedTotalValue)}
              </span>
            </div>
          </div>

          {/* Date Picker (Ethiopian & Gregorian) */}
          <EthioDatePicker
            value={transactionDate}
            onChange={setTransactionDate}
            label={t('Date (Ethiopian / Gregorian)', 'ቀን (ኢትዮጵያ / ፈረንጅ)')}
          />

          {/* Supplier & Status */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">
                {t('Supplier / Source', 'አቅራቢ / ምንጭ')}
              </label>
              <input
                type="text"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="e.g. Awash Factory"
                className="w-full h-8.5 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">
                {t('Product Status', 'የዕቃ ሁኔታ')}
              </label>
              <div className="flex items-center gap-2 h-8.5">
                <button
                  type="button"
                  onClick={() => setIsActive(!isActive)}
                  className={`w-full h-8.5 rounded-lg font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                    isActive
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                      : 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isActive ? 'bg-white' : 'bg-zinc-400'
                    }`}
                  />
                  <span>
                    {isActive
                      ? t('Active (ንቁ)', 'ንቁ (Active)')
                      : t('Inactive (ቦዝኗል)', 'ቦዝኗል (Inactive)')}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Note / Description */}
          <div>
            <label className="text-xs font-semibold text-foreground block mb-1">
              {t('Note / Description', 'ማስታወሻ')}
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Initial batch / store record"
              className="w-full h-8.5 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-200 dark:border-zinc-800">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="text-xs h-8.5 rounded-lg cursor-pointer"
            >
              {t('Cancel', 'ይቅር')}
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="text-xs h-8.5 px-4 rounded-lg font-semibold bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 cursor-pointer shadow-2xs"
            >
              <Save size={14} className="mr-1.5" />
              {saving ? t('Saving...', 'በማስቀመጥ ላይ...') : t('Save Changes', 'መዝግብ')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
