import React, { useState, useEffect, useMemo } from 'react'
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  PackagePlus,
  Search,
  Store,
  X,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useLanguage } from '../../context/LanguageContext'
import { useLedger } from '../../context/LedgerContext'
import type { StoreInventoryItem } from '../../types/ledger'
import {
  getInventoryProducts,
  registerNewProduct,
  executeStockTransaction,
} from '../../lib/api'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { EthioDatePicker } from '../common/EthioDatePicker'

interface SmartStockModalProps {
  isOpen: boolean
  initialMode: 'IN' | 'OUT' | 'REGISTER'
  preselectedProductName?: string
  onClose: () => void
  onSuccess: () => void
}

export const SmartStockModal: React.FC<SmartStockModalProps> = ({
  isOpen,
  initialMode,
  preselectedProductName,
  onClose,
  onSuccess,
}) => {
  const { activeStoreId, activeStore, user } = useAuth()
  const { t, formatCurrency: fmtCurr } = { ...useLanguage(), ...useLedger() }
  const { showToast } = useLedger()

  // Mode: IN = Stock In, OUT = Stock Out, REGISTER = Register New Product
  const [mode, setMode] = useState<'IN' | 'OUT' | 'REGISTER'>(initialMode)

  // Catalog products
  const [products, setProducts] = useState<StoreInventoryItem[]>([])
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [productSearch, setProductSearch] = useState('')
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)

  // Selected product
  const [selectedProduct, setSelectedProduct] = useState<StoreInventoryItem | null>(null)

  // Form Fields for Stock In / Out
  const [packaging, setPackaging] = useState<'Carton' | 'Piece'>('Carton')
  const [enteredQuantity, setEnteredQuantity] = useState<number>(1)
  const [pcsPerCarton, setPcsPerCarton] = useState<number>(1)
  const [price, setPrice] = useState<number>(0)
  const [supplierOrDestination, setSupplierOrDestination] = useState('')
  const [referenceNumber, setReferenceNumber] = useState('')
  const [transactionDate, setTransactionDate] = useState(
    new Date().toISOString().split('T')[0]
  )
  const [notes, setNotes] = useState('')

  // New Product Registration Form Fields
  const [regName, setRegName] = useState('')
  const [regSku, setRegSku] = useState('')
  const [regCategory, setRegCategory] = useState('General')
  const [regBaseUnit, setRegBaseUnit] = useState('Pcs')
  const [regInitialQty, setRegInitialQty] = useState<number>(0)
  const [regMinStock, setRegMinStock] = useState<number>(10)
  const [regCostPrice, setRegCostPrice] = useState<number>(0)
  const [regSellingPrice, setRegSellingPrice] = useState<number>(0)
  const [regPcsPerCarton, setRegPcsPerCarton] = useState<number>(1)
  const [regSupplier, setRegSupplier] = useState('')
  const [regDescription, setRegDescription] = useState('')

  // Status & Feedback
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Load products when modal opens
  useEffect(() => {
    if (!isOpen) return
    setMode(initialMode)
    setErrorMsg(null)
    loadProductCatalog()
  }, [isOpen, initialMode, preselectedProductName, activeStoreId])

  const loadProductCatalog = async () => {
    setLoadingProducts(true)
    try {
      const items = await getInventoryProducts(activeStoreId || undefined)
      setProducts(items)
      if (preselectedProductName) {
        const found = items.find(
          (p) => p.productName.toLowerCase() === preselectedProductName.toLowerCase()
        )
        if (found) {
          handleSelectProduct(found)
        } else {
          setProductSearch(preselectedProductName)
        }
      }
    } catch (e: any) {
      console.error('Failed to load products:', e)
    } finally {
      setLoadingProducts(false)
    }
  }

  // Handle selecting an existing product
  const handleSelectProduct = (prod: StoreInventoryItem) => {
    setSelectedProduct(prod)
    setPcsPerCarton(prod.pcsPerCarton > 0 ? prod.pcsPerCarton : 1)

    // For Stock In, default to cost price; for Stock Out, default to selling price
    if (mode === 'IN') {
      setPrice(prod.costPrice > 0 ? prod.costPrice : prod.unitPrice)
      setSupplierOrDestination(prod.supplierName || '')
    } else {
      setPrice(prod.unitPrice > 0 ? prod.unitPrice : prod.costPrice)
      setSupplierOrDestination('')
    }

    setProductSearch(prod.productName)
    setIsDropdownOpen(false)
    setErrorMsg(null)
  }

  // Filtered products for dropdown search
  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return products
    const q = productSearch.toLowerCase()
    return products.filter(
      (p) =>
        p.productName.toLowerCase().includes(q) ||
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q))
    )
  }, [products, productSearch])

  // --- Dynamic Formula Calculations ---
  // Total Pieces: if Carton -> Quantity × Pieces per Carton; if Piece -> Quantity
  const totalPieces = useMemo(() => {
    const qty = Number(enteredQuantity) || 0
    if (packaging === 'Piece') return qty
    const factor = Number(pcsPerCarton) > 0 ? Number(pcsPerCarton) : 1
    return qty * factor
  }, [packaging, enteredQuantity, pcsPerCarton])

  // Total Price: Total Pieces × Unit Price per Piece
  const calculatedTotal = useMemo(() => {
    const unitP = Number(price) || 0
    return Math.round(totalPieces * unitP * 100) / 100
  }, [totalPieces, price])

  const availablePieces = selectedProduct ? selectedProduct.currentQuantity : 0
  const availableCartons = useMemo(() => {
    if (!selectedProduct) return 0
    const factor = selectedProduct.pcsPerCarton > 0 ? selectedProduct.pcsPerCarton : 1
    return Math.floor(selectedProduct.currentQuantity / factor)
  }, [selectedProduct])

  const newStockBalance = useMemo(() => {
    if (mode === 'IN') {
      return availablePieces + totalPieces
    } else if (mode === 'OUT') {
      return availablePieces - totalPieces
    }
    return availablePieces
  }, [mode, availablePieces, totalPieces])

  const newStockCartons = useMemo(() => {
    const factor = Number(pcsPerCarton) > 0 ? Number(pcsPerCarton) : 1
    return Math.floor(Math.max(0, newStockBalance) / factor)
  }, [newStockBalance, pcsPerCarton])

  // Strict Outgoing Validation Check
  const stockOutValidationError = useMemo(() => {
    if (mode !== 'OUT') return null
    if (!selectedProduct) return null
    const avail = availablePieces
    const req = totalPieces
    if (avail <= 0) {
      return {
        en: `Insufficient stock! Available quantity is 0 pieces. You cannot withdraw ${req} pieces.`,
        am: `በቂ እቃ የለም! በመደብሩ ያለው መጠን 0 ብቻ ነው። ${req} መውሰድ አይቻልም።`,
      }
    }
    if (isNaN(req) || req <= 0) {
      return {
        en: 'Outgoing quantity must be a valid number greater than zero.',
        am: 'የሚወጣው መጠን ከዜሮ በላይ የሆነ ትክክለኛ ቁጥር መሆን አለበት።',
      }
    }
    if (req > avail) {
      return {
        en: `Insufficient stock! Available quantity: ${avail.toLocaleString()} pieces (${availableCartons} cartons). You cannot withdraw ${req.toLocaleString()} pieces.`,
        am: `በቂ እቃ የለም! በመደብሩ ያለው መጠን ${avail.toLocaleString()} ፍሬ (${availableCartons} ካርቶን) ብቻ ነው። ከዚህ በላይ ማውጣት አይቻልም።`,
      }
    }
    return null
  }, [mode, selectedProduct, availablePieces, availableCartons, totalPieces])

  const isInvalidStockOut = Boolean(stockOutValidationError)
  const isStockOutExceeded = isInvalidStockOut

  // Handle Stock In / Stock Out submission
  const handleSubmitTransaction = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)

    if (!selectedProduct) {
      setErrorMsg(t('Please select an existing product or register a new one first.', 'እባክዎ መጀመሪያ ያለ ምርት ይምረጡ ወይም አዲስ ምርት ይመዝግቡ።'))
      return
    }

    if (totalPieces <= 0) {
      setErrorMsg(t('Quantity must be greater than zero.', 'ብዛት ከዜሮ በላይ መሆን አለበት።'))
      return
    }

    if (mode === 'OUT' && stockOutValidationError) {
      setErrorMsg(
        t(stockOutValidationError.en, stockOutValidationError.am)
      )
      return
    }

    setSubmitting(true)
    try {
      const finalCartons = packaging === 'Carton' ? enteredQuantity : Math.floor(totalPieces / (pcsPerCarton || 1))
      const loosePieces = packaging === 'Piece' ? enteredQuantity : 0

      await executeStockTransaction({
        storeId: activeStoreId || selectedProduct.storeId,
        productId: selectedProduct.id,
        movementType: mode === 'IN' ? 'IN' : 'OUT',
        quantity: totalPieces,
        unitPrice: price,
        packagingUnit: packaging === 'Carton' ? 'Carton' : 'Pcs',
        cartons: finalCartons,
        pcsPerCarton: pcsPerCarton > 0 ? pcsPerCarton : 1,
        loosePieces,
        supplierOrDestination: supplierOrDestination.trim() || undefined,
        referenceNumber: referenceNumber.trim() || undefined,
        transactionDate: transactionDate,
        note: notes.trim() || undefined,
        requestedBy: user
          ? {
              id: user.id,
              name: user.name,
              role: user.role,
              storeId: user.storeId,
            }
          : undefined,
      })

      showToast(
        mode === 'IN'
          ? t(`Successfully added ${totalPieces} units of "${selectedProduct.productName}" to stock!`, `ለ"${selectedProduct.productName}" ${totalPieces} ፍሬ ገቢ ተደርጓል!`)
          : t(`Successfully dispatched ${totalPieces} units of "${selectedProduct.productName}"!`, `ከ"${selectedProduct.productName}" ${totalPieces} ፍሬ ወጪ ተደርጓል!`),
        'success'
      )
      onSuccess()
      onClose()
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to execute stock transaction.')
    } finally {
      setSubmitting(false)
    }
  }

  // Handle New Product Registration
  const handleRegisterProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)

    if (!regName.trim()) {
      setErrorMsg(t('Product name is required.', 'የምርት ስም ማስገባት ግዴታ ነው።'))
      return
    }

    setSubmitting(true)
    try {
      const created = await registerNewProduct(
        {
          storeId: activeStoreId || undefined,
          createdBy: user?.id,
          productName: regName.trim(),
          sku: regSku.trim() || undefined,
          category: regCategory.trim() || 'General',
          baseUnit: regBaseUnit.trim() || 'Pcs',
          initialQuantity: regInitialQty,
          quantityCartons:
            regPcsPerCarton > 0 ? Math.floor(regInitialQty / regPcsPerCarton) : 0,
          quantityPerCarton: regPcsPerCarton > 0 ? regPcsPerCarton : 1,
          totalQuantity: regInitialQty,
          unit: regBaseUnit.trim() || 'PCS',
          pricePerPiece: regCostPrice > 0 ? regCostPrice : regSellingPrice,
          totalValue:
            regInitialQty * (regCostPrice > 0 ? regCostPrice : regSellingPrice),
          minimumStock: regMinStock,
          unitPrice: regSellingPrice,
          costPrice: regCostPrice > 0 ? regCostPrice : regSellingPrice,
          pcsPerCarton: regPcsPerCarton > 0 ? regPcsPerCarton : 1,
          supplierName: regSupplier.trim() || undefined,
          description: regDescription.trim() || undefined,
        },
        user
      )

      showToast(
        t(`Product "${created.productName}" registered successfully!`, `ምርት "${created.productName}" በተሳካ ሁኔታ ተመዝግቧል!`),
        'success'
      )

      // Auto-select this newly registered product and switch to Stock In
      await loadProductCatalog()
      handleSelectProduct(created)
      setMode('IN')
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to register product.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden rounded-2xl bg-card border-zinc-200 dark:border-zinc-800 shadow-2xl">
        {/* Header with Mode Switcher */}
        <DialogHeader className="p-4 sm:p-5 border-b border-zinc-100 dark:border-zinc-800 bg-muted/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-xs ${
                  mode === 'IN'
                    ? 'bg-blue-600'
                    : mode === 'OUT'
                    ? 'bg-rose-600'
                    : 'bg-emerald-600'
                }`}
              >
                {mode === 'IN' ? (
                  <ArrowDownRight size={20} />
                ) : mode === 'OUT' ? (
                  <ArrowUpRight size={20} />
                ) : (
                  <PackagePlus size={20} />
                )}
              </div>
              <div>
                <DialogTitle className="text-base sm:text-lg font-bold text-foreground">
                  {mode === 'IN'
                    ? t('Stock In (+)', 'ዕቃ ገቢ (+)')
                    : mode === 'OUT'
                    ? t('Stock Out (-)', 'ዕቃ ወጪ (-)')
                    : t('Register New Product', 'አዲስ ምርት መዝግብ')}
                </DialogTitle>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Store size={12} />
                  <span>{activeStore?.name || 'All Stores'}</span>
                  <span>•</span>
                  <span>{t('Smart Automatic Inventory', 'ዘመናዊ አውቶማቲክ የክምችት አስተዳደር')}</span>
                </div>
              </div>
            </div>

            {/* Mode Toggle Pills */}
            <div className="flex items-center gap-1 bg-muted/80 p-1 rounded-xl self-start sm:self-auto border border-zinc-200/50 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => {
                  setMode('IN')
                  setErrorMsg(null)
                }}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  mode === 'IN'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                + {t('Stock In', 'ገቢ')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('OUT')
                  setErrorMsg(null)
                }}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  mode === 'OUT'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                - {t('Stock Out', 'ወጪ')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('REGISTER')
                  setErrorMsg(null)
                }}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  mode === 'REGISTER'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                + {t('New Product', 'አዲስ ምርት')}
              </button>
            </div>
          </div>
        </DialogHeader>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 max-h-[75vh] overflow-y-auto space-y-4">
          {errorMsg && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0 text-rose-500" />
              <span>{errorMsg}</span>
            </div>
          )}

          {mode === 'REGISTER' ? (
            /* ================================================================= */
            /* 1. NEW PRODUCT REGISTRATION FORM                                  */
            /* ================================================================= */
            <form onSubmit={handleRegisterProduct} className="space-y-4">
              <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/40 rounded-xl text-xs text-emerald-800 dark:text-emerald-300">
                {t(
                  'Registering a master product record allows both Stock In and Stock Out tracking with automatic prefill and valuation.',
                  'አዲስ ምርት መመዝገብ ለዕቃ ገቢና ወጪ አውቶማቲክ መረጃ መሙላትና የዋጋ ግምት ያስችላል።'
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    {t('Product / Item Name *', 'የምርት / ዕቃ ስም *')}
                  </label>
                  <input
                    type="text"
                    required
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder={t('e.g. Paper, 12W Safari...', 'ምሳሌ፦ ወረቀት፣ 12W ሳፋሪ...')}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    {t('SKU Code', 'የዕቃ መለያ')}
                  </label>
                  <input
                    type="text"
                    value={regSku}
                    onChange={(e) => setRegSku(e.target.value)}
                    placeholder={t('Auto-generated if blank', 'ካልተሞላ በራሱ ይሰጣል')}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-background focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    {t('Category', 'ምድብ')}
                  </label>
                  <input
                    type="text"
                    value={regCategory}
                    onChange={(e) => setRegCategory(e.target.value)}
                    placeholder="e.g. Electrical, Stationery, Cables"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-background focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    {t('Base Unit of Measurement', 'ዋና መለኪያ')}
                  </label>
                  <select
                    value={regBaseUnit}
                    onChange={(e) => setRegBaseUnit(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-background focus:outline-none"
                  >
                    <option value="Pcs">{t('Pcs', 'ፍሬ')}</option>
                    <option value="Carton">{t('Carton', 'ካርቶን')}</option>
                    <option value="Roll">{t('Roll', 'ጥቅል')}</option>
                    <option value="Meter">{t('Meter', 'ሜትር')}</option>
                    <option value="Kg">{t('Kg', 'ኪሎ')}</option>
                    <option value="Set">{t('Set', 'ስብስብ')}</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    {t('Pieces / Carton', 'ፍሬ በካርቶን')}
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={regPcsPerCarton || ''}
                    onChange={(e) => setRegPcsPerCarton(Number(e.target.value) || 1)}
                    placeholder="e.g. 500"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-background focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    {t('Purchase Price (ETB)', 'የግዢ ዋጋ')}
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={regCostPrice || ''}
                    onChange={(e) => setRegCostPrice(Number(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-background focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    {t('Selling Price (ETB)', 'የሽያጭ ዋጋ')}
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={regSellingPrice || ''}
                    onChange={(e) => setRegSellingPrice(Number(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-background focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    {t('Initial Stock Quantity', 'የመጀመሪያ ክምችት ብዛት')}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={regInitialQty || ''}
                    onChange={(e) => setRegInitialQty(Number(e.target.value) || 0)}
                    placeholder="0"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-background focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    {t('Minimum Stock Level', 'ዝቅተኛ ክምችት')}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={regMinStock || ''}
                    onChange={(e) => setRegMinStock(Number(e.target.value) || 0)}
                    placeholder="e.g. 10"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-background focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    {t('Default Supplier', 'ነባሪ አቅራቢ')}
                  </label>
                  <input
                    type="text"
                    value={regSupplier}
                    onChange={(e) => setRegSupplier(e.target.value)}
                    placeholder="e.g. Awash Factory, CBE Merchant"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-background focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">
                  {t('Description / Notes', 'መግለጫ / ማስታወሻ')}
                </label>
                <textarea
                  rows={2}
                  value={regDescription}
                  onChange={(e) => setRegDescription(e.target.value)}
                  placeholder={t(
                    'Optional details about this product...',
                    'ስለ ይህ ምርት አማራጭ ዝርዝሮች...'
                  )}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-background focus:outline-none resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setMode('IN')}
                  className="text-xs h-9 rounded-xl cursor-pointer"
                >
                  {t('Cancel', 'ተመለስ')}
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="text-xs h-9 px-4 rounded-xl font-semibold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-xs"
                >
                  {submitting ? t('Saving...', 'በማስቀመጥ ላይ...') : t('Save & Register Product', 'ምርቱን መዝግብ')}
                </Button>
              </div>
            </form>
          ) : (
            /* ================================================================= */
            /* 2. SMART STOCK IN & STOCK OUT TRANSACTION FORM                     */
            /* ================================================================= */
            <form onSubmit={handleSubmitTransaction} className="space-y-4">
              {/* Product Selector with Live Auto-Data Population */}
              <div className="relative">
                <label className="text-xs font-semibold text-foreground block mb-1">
                  {t('Product Name', 'የዕቃ ስም')}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                    <Search size={15} />
                  </span>
                  <input
                    type="text"
                    value={productSearch}
                    onFocus={() => setIsDropdownOpen(true)}
                    onChange={(e) => {
                      setProductSearch(e.target.value)
                      setIsDropdownOpen(true)
                    }}
                    placeholder={t(
                      'Search product...',
                      'ዕቃ ይፈልጉ...'
                    )}
                    className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  {productSearch && (
                    <button
                      type="button"
                      onClick={() => {
                        setProductSearch('')
                        setSelectedProduct(null)
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Dropdown Options */}
                {isDropdownOpen && (
                  <div className="absolute z-20 left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-card border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl divide-y divide-zinc-100 dark:divide-zinc-800">
                    {loadingProducts ? (
                      <div className="p-3 text-center text-xs text-muted-foreground animate-pulse">
                        {t('Loading products...', 'ምርቶችን በመጫን ላይ...')}
                      </div>
                    ) : filteredProducts.length > 0 ? (
                      filteredProducts.map((p) => (
                        <div
                          key={p.id}
                          onClick={() => handleSelectProduct(p)}
                          className="p-2.5 hover:bg-muted/60 cursor-pointer flex items-center justify-between gap-3 text-xs transition-colors"
                        >
                          <div>
                            <div className="font-bold text-foreground">{p.productName}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {p.sku || 'No SKU'} • {p.category || 'General'}
                            </div>
                          </div>
                          <div className="text-right">
                            <span
                              className={`font-semibold px-2 py-0.5 rounded text-[11px] ${
                                p.currentQuantity > 0
                                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                  : 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                              }`}
                            >
                              {p.currentQuantity.toLocaleString()} {p.baseUnit}
                            </span>
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              {mode === 'IN' ? `Cost: ${fmtCurr(p.costPrice)}` : `Price: ${fmtCurr(p.unitPrice)}`}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-3 text-center text-xs text-muted-foreground">
                        <p>{t('No matching products found.', 'ምንም የተገኘ ምርት የለም።')}</p>
                        <button
                          type="button"
                          onClick={() => {
                            setIsDropdownOpen(false)
                            setRegName(productSearch)
                            setMode('REGISTER')
                          }}
                          className="mt-1.5 text-xs text-primary font-bold hover:underline cursor-pointer"
                        >
                          + {t(`Register "${productSearch}" as new product`, `"${productSearch}"ን እንደ አዲስ ምርት መዝግብ`)}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Automatically populated product info panel (Immediately below Item field) */}
              {selectedProduct ? (
                <div className="p-3 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-900/40 rounded-xl space-y-2 text-xs">
                  <div className="flex items-center justify-between border-b border-blue-200/50 dark:border-blue-900/50 pb-1.5">
                    <span className="font-bold text-blue-950 dark:text-blue-100 text-sm">
                      {selectedProduct.productName}
                    </span>
                    <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100/70 dark:bg-emerald-950/60 px-2.5 py-0.5 rounded-md">
                      {availableCartons} {t('Cartons', 'ካርቶን')} ({availablePieces.toLocaleString()} {t('Pieces', 'ፍሬ')})
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                    <div>
                      <span className="text-muted-foreground block">{t('Available Cartons:', 'ያለ ካርቶን:')}</span>
                      <strong className="text-foreground text-sm font-extrabold">
                        {availableCartons} {t('Cartons', 'ካርቶን')}
                      </strong>
                    </div>

                    <div>
                      <span className="text-muted-foreground block">{t('Pieces / Carton:', 'በካርቶን ፍሬ:')}</span>
                      <strong className="text-foreground text-sm font-extrabold">{pcsPerCarton} pcs/ctn</strong>
                    </div>

                    <div>
                      <span className="text-muted-foreground block">{t('Total Pieces Available:', 'ያለው ጠቅላላ ፍሬ:')}</span>
                      <strong className="text-foreground text-sm font-extrabold">
                        {availablePieces.toLocaleString()} {t('Pieces', 'ፍሬ')}
                      </strong>
                    </div>

                    <div>
                      <span className="text-muted-foreground block">{t('Existing Unit Price:', 'የአንዱ ዋጋ:')}</span>
                      <strong className="text-foreground text-sm font-extrabold">{fmtCurr(selectedProduct.unitPrice)}</strong>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-2.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-xl text-xs text-amber-800 dark:text-amber-300 flex items-center justify-between">
                  <span>{t('Select an existing product above or click to register a new product.', 'ከላይ ያለ ምርት ይምረጡ ወይም አዲስ ለመመዝገብ ይጫኑ።')}</span>
                  <button
                    type="button"
                    onClick={() => setMode('REGISTER')}
                    className="font-bold underline text-amber-900 dark:text-amber-200 cursor-pointer"
                  >
                    + {t('Register', 'መዝግብ')}
                  </button>
                </div>
              )}

              {/* Quantity & Packaging & Unit Price Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* 1. Quantity input */}
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    {t('Quantity', 'ብዛት')}
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    required
                    value={enteredQuantity || ''}
                    onChange={(e) => setEnteredQuantity(Number(e.target.value) || 0)}
                    className={`w-full px-3 py-2 text-sm font-bold rounded-xl border bg-background focus:outline-none ${
                      isStockOutExceeded
                        ? 'border-rose-500 ring-2 ring-rose-200 dark:ring-rose-950'
                        : 'border-zinc-200 dark:border-zinc-700'
                    }`}
                  />
                </div>

                {/* 2. Packaging Selection (Carton / Piece) */}
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    {t('Packaging', 'ማሸጊያ')}
                  </label>
                  <div className="flex rounded-xl border border-zinc-200 dark:border-zinc-700 p-1 bg-zinc-50 dark:bg-zinc-800/60 h-10">
                    <button
                      type="button"
                      onClick={() => setPackaging('Carton')}
                      className={`flex-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                        packaging === 'Carton'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {t('Carton', 'ካርቶን')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPackaging('Piece')}
                      className={`flex-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                        packaging === 'Piece'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {t('Piece', 'ፍሬ')}
                    </button>
                  </div>
                </div>

                {/* 3. Pieces per Carton */}
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    {t('Pieces per Carton', 'ፍሬ በካርቶን')}
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    disabled={packaging === 'Piece'}
                    value={pcsPerCarton || ''}
                    onChange={(e) => setPcsPerCarton(Math.max(1, Number(e.target.value) || 1))}
                    className={`w-full px-3 py-2 text-sm font-bold rounded-xl border bg-background focus:outline-none ${
                      packaging === 'Piece' ? 'opacity-50 cursor-not-allowed bg-zinc-100 dark:bg-zinc-800' : 'border-zinc-200 dark:border-zinc-700'
                    }`}
                  />
                </div>
              </div>

              {/* Unit Price (ETB) & Total Price (ETB) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Unit Price */}
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    {t('Unit Price (ETB)', 'የአንዱ ዋጋ (ብር)')}
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={price || ''}
                    onChange={(e) => setPrice(Number(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 text-sm font-bold rounded-xl border border-zinc-200 dark:border-zinc-700 bg-background focus:outline-none"
                  />
                </div>

                {/* Live Total Price (Immediately reactive) */}
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    {t('Total Price (ETB)', 'ጠቅላላ ዋጋ (ብር)')}
                  </label>
                  <div className="w-full px-3 py-2 text-sm font-extrabold rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/60 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 flex items-center justify-between h-10">
                    <span>{fmtCurr(calculatedTotal)}</span>
                    <span className="text-[11px] font-normal text-muted-foreground">
                      {totalPieces.toLocaleString()} pcs × {price} ETB
                    </span>
                  </div>
                </div>
              </div>

              {/* Strict Stock Out Validation Error Banner */}
              {stockOutValidationError && (
                <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2 shadow-2xs">
                  <AlertCircle size={15} className="shrink-0 text-rose-600 mt-0.5" />
                  <div>
                    <p className="font-bold">{stockOutValidationError.en}</p>
                    <p className="text-[11px] font-medium mt-0.5">{stockOutValidationError.am}</p>
                  </div>
                </div>
              )}

              {/* Source / Destination & Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    {mode === 'IN'
                      ? t('Supplier', 'አቅራቢ')
                      : t('Customer', 'ደንበኛ')}
                  </label>
                  <input
                    type="text"
                    value={supplierOrDestination}
                    onChange={(e) => setSupplierOrDestination(e.target.value)}
                    placeholder={mode === 'IN' ? 'e.g. Awash Factory' : 'e.g. Ahmed'}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-background focus:outline-none"
                  />
                </div>

                <div>
                  <EthioDatePicker
                    value={transactionDate}
                    onChange={setTransactionDate}
                    label={t('Date *', 'ቀን *')}
                  />
                </div>
              </div>

              {/* Reference / Invoice # */}
              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">
                  {t('Invoice #', 'ደረሰኝ ቁጥር')}
                </label>
                <input
                  type="text"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  placeholder="e.g. INV-1049"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-background focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">
                  {t('Note', 'ማስታወሻ')}
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t('Optional notes...', 'ተጨማሪ ማስታወሻ...')}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-background focus:outline-none"
                />
              </div>

              {/* Live Calculations Summary Box */}
              <div className="p-3 bg-card border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-1.5 shadow-xs">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{t('Previous Stock:', 'የቀድሞ ክምችት:')}</span>
                  <span className="font-semibold">{availablePieces.toLocaleString()} {t('Pieces', 'ፍሬ')} ({availableCartons} {t('Cartons', 'ካርቶን')})</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {mode === 'IN' ? t('Incoming (+):', 'ገቢ (+):') : t('Outgoing (-):', 'ወጪ (-):')}
                  </span>
                  <span className={`font-bold ${mode === 'IN' ? 'text-blue-600' : 'text-rose-600'}`}>
                    {mode === 'IN' ? `+${totalPieces.toLocaleString()}` : `-${totalPieces.toLocaleString()}`} {t('Pieces', 'ፍሬ')}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs font-bold pt-1 border-t border-zinc-100 dark:border-zinc-800">
                  <span className="text-foreground">
                    {mode === 'IN' ? t('New Stock Balance:', 'አዲስ የክምችት መጠን:') : t('Remaining Stock:', 'ቀሪ ክምችት:')}
                  </span>
                  <span className={`text-sm ${newStockBalance < 0 ? 'text-rose-600' : 'text-foreground'}`}>
                    {Math.max(0, newStockBalance).toLocaleString()} {t('Pieces', 'ፍሬ')} ({newStockCartons} {t('Cartons', 'ካርቶን')})
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs font-bold pt-1 border-t border-zinc-100 dark:border-zinc-800">
                  <span className="text-foreground">
                    {mode === 'IN' ? t('Total Purchase Cost:', 'ጠቅላላ የግዢ ዋጋ:') : t('Total Sales Amount:', 'ጠቅላላ የሽያጭ ዋጋ:')}
                  </span>
                  <span className="text-base text-blue-600 dark:text-blue-400 font-extrabold">
                    {fmtCurr(calculatedTotal)}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  className="text-xs h-9 rounded-xl cursor-pointer"
                >
                  {t('Cancel', 'ይቅር')}
                </Button>
                <Button
                  type="submit"
                  disabled={submitting || isInvalidStockOut || !selectedProduct || totalPieces <= 0}
                  className={`text-xs h-9 px-4 rounded-xl font-semibold text-white shadow-xs cursor-pointer ${
                    mode === 'IN'
                      ? 'bg-blue-600 hover:bg-blue-700'
                      : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {submitting
                    ? t('Saving...', 'በማስቀመጥ ላይ...')
                    : mode === 'IN'
                    ? t('Save Stock In', 'ገቢ መዝግብ')
                    : t('Save Stock Out', 'ወጪ መዝግብ')}
                </Button>
              </div>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
