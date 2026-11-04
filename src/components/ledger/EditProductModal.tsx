import React, { useState, useEffect } from 'react'
import { AlertCircle, Pencil, Save } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useLanguage } from '../../context/LanguageContext'
import { useLedger } from '../../context/LedgerContext'
import type { StoreInventoryItem } from '../../types/ledger'
import { updateInventoryProduct } from '../../lib/api'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'

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
  const { isAdmin } = useAuth()
  const { t } = useLanguage()
  const { showToast } = useLedger()

  if (isAdmin) return null

  const [productName, setProductName] = useState('')
  const [sku, setSku] = useState('')
  const [category, setCategory] = useState('General')
  const [baseUnit, setBaseUnit] = useState('Pcs')
  const [minimumStock, setMinimumStock] = useState<number>(10)
  const [costPrice, setCostPrice] = useState<number>(0)
  const [unitPrice, setUnitPrice] = useState<number>(0)
  const [pcsPerCarton, setPcsPerCarton] = useState<number>(1)
  const [supplierName, setSupplierName] = useState('')
  const [description, setDescription] = useState('')

  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    if (product) {
      setProductName(product.productName)
      setSku(product.sku || '')
      setCategory(product.category || 'General')
      setBaseUnit(product.baseUnit || 'Pcs')
      setMinimumStock(product.minimumStock || 10)
      setCostPrice(product.costPrice || 0)
      setUnitPrice(product.unitPrice || 0)
      setPcsPerCarton(product.pcsPerCarton || 1)
      setSupplierName(product.supplierName || '')
      setDescription(product.description || '')
      setErrorMsg(null)
    }
  }, [product, isOpen])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!product) return

    if (!productName.trim()) {
      setErrorMsg(t('Product name is required.', 'የምርት ስም ማስገባት ግዴታ ነው።'))
      return
    }

    setSaving(true)
    setErrorMsg(null)
    try {
      await updateInventoryProduct(product.id, {
        productName: productName.trim(),
        sku: sku.trim() || undefined,
        category: category.trim() || 'General',
        baseUnit: baseUnit.trim() || 'Pcs',
        minimumStock: Number(minimumStock) || 0,
        costPrice: Number(costPrice) || 0,
        unitPrice: Number(unitPrice) || 0,
        pcsPerCarton: Number(pcsPerCarton) || 1,
        supplierName: supplierName.trim() || undefined,
        description: description.trim() || undefined,
      })
      showToast(t(`Updated "${productName}" successfully!`, `"${productName}" በተሳካ ሁኔታ ተሻሽሏል!`), 'success')
      onSuccess()
      onClose()
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update product.')
    } finally {
      setSaving(false)
    }
  }

  if (!product) return null

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg p-0 overflow-hidden bg-card border-zinc-200 dark:border-zinc-800 rounded-3xl">
        <DialogHeader className="p-4 sm:p-5 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-zinc-100 text-foreground dark:bg-zinc-800 flex items-center justify-center">
              <Pencil size={18} />
            </div>
            <div>
              <DialogTitle className="text-base font-black text-foreground">
                {t('Edit Product Details', 'የምርት ዝርዝሮችን አስተካክል')}
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {product.productName} ({product.sku || 'No SKU'})
              </p>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSave} className="p-4 sm:p-5 space-y-3.5 max-h-[75vh] overflow-y-auto">
          {errorMsg && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0 text-rose-500" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-foreground block mb-1">
              {t('Product Name *', 'የምርት ስም *')}
            </label>
            <input
              type="text"
              required
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-background focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">
                {t('SKU / Code', 'የምርት መለያ (SKU)')}
              </label>
              <input
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-background focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">
                {t('Category', 'ምድብ')}
              </label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-background focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">
                {t('Base Unit', 'መለኪያ')}
              </label>
              <input
                type="text"
                value={baseUnit}
                onChange={(e) => setBaseUnit(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-background focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">
                {t('Minimum Stock Level (Low Stock Alert)', 'አነስተኛ ክምችት ማስጠንቀቂያ')}
              </label>
              <input
                type="number"
                min="0"
                value={minimumStock}
                onChange={(e) => setMinimumStock(Number(e.target.value) || 0)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-background focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">
                {t('Purchase / Cost Price (ETB)', 'የግዢ ዋጋ (ብር)')}
              </label>
              <input
                type="number"
                step="any"
                value={costPrice}
                onChange={(e) => setCostPrice(Number(e.target.value) || 0)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-background focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">
                {t('Selling Price (ETB)', 'የሽያጭ ዋጋ (ብር)')}
              </label>
              <input
                type="number"
                step="any"
                value={unitPrice}
                onChange={(e) => setUnitPrice(Number(e.target.value) || 0)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-background focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">
                {t('Pcs Per Carton', 'ፍሬ በካርቶን')}
              </label>
              <input
                type="number"
                min="1"
                value={pcsPerCarton}
                onChange={(e) => setPcsPerCarton(Number(e.target.value) || 1)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-background focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">
                {t('Default Supplier', 'ነባሪ አቅራቢ')}
              </label>
              <input
                type="text"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-background focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
            <Button type="button" variant="outline" onClick={onClose} className="text-xs h-9 rounded-xl cursor-pointer">
              {t('Cancel', 'ተመለስ')}
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="text-xs h-9 px-4 rounded-xl font-semibold bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer shadow-xs"
            >
              <Save size={14} className="mr-1.5" />
              {saving ? t('Saving...', 'በማስቀመጥ ላይ...') : t('Save Changes', 'ለውጦችን መዝግብ')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

