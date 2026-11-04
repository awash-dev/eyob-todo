import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  Package,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react'
import React, { useEffect, useMemo, useState } from 'react'
import { useLedger } from '../../context/LedgerContext'
import { useLanguage } from '../../context/LanguageContext'
import { useAuth } from '../../context/AuthContext'
import {
  type AccountCreditStats,
  type CreditTransactionParams,
  calculateAccountBalances,
} from '../../lib/creditAccounting'
import { getInventoryProducts } from '../../lib/api'
import type { StoreInventoryItem } from '../../types/ledger'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'

export const PaymentTransactionModal: React.FC = () => {
  const {
    isPaymentModalOpen,
    paymentTargetType,
    paymentTargetParty,
    paymentTargetCategory,
    closePaymentModal,
    recordCreditTx,
    records,
    formatCurrency,
  } = useLedger()

  const { activeStoreId } = useAuth()
  const { t, translateDbText } = useLanguage()

  // Form states
  const [accountType, setAccountType] = useState<'customer' | 'supplier' | 'delala'>('customer')
  const [isNewParty, setIsNewParty] = useState(false)
  const [selectedParty, setSelectedParty] = useState('')
  const [newPartyName, setNewPartyName] = useState('')
  const [newPartyPhone, setNewPartyPhone] = useState('')
  const [newPartyAddress, setNewPartyAddress] = useState('')

  const [category, setCategory] = useState<CreditTransactionParams['transactionCategory']>('payment_received')
  const [packaging, setPackaging] = useState<'Piece' | 'Carton'>('Piece')
  const [cartonsStr, setCartonsStr] = useState('')
  const [piecesPerCartonStr, setPiecesPerCartonStr] = useState('')
  const [productName, setProductName] = useState('')
  const [selectedProductId, setSelectedProductId] = useState('')
  const [quantityStr, setQuantityStr] = useState('1')
  const [unitPriceStr, setUnitPriceStr] = useState('')
  const [paymentAmountStr, setPaymentAmountStr] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('Cash')
  const [bankName, setBankName] = useState('CBE')
  const [reference, setReference] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')

  // Available store products
  const [inventoryProducts, setInventoryProducts] = useState<StoreInventoryItem[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Load inventory products for active store
  useEffect(() => {
    if (isPaymentModalOpen) {
      getInventoryProducts(activeStoreId || undefined)
        .then((items) => setInventoryProducts(items))
        .catch((err) => console.warn('Could not load inventory products:', err))
    }
  }, [isPaymentModalOpen, activeStoreId])

  // Distinct existing parties for the selected account type
  const existingParties = useMemo(() => {
    const matching = records.filter((r) => r.type === accountType)
    const map = new Map<string, { name: string; stats: AccountCreditStats }>()

    for (const r of matching) {
      const clean = r.title.trim()
      const key = clean.toLowerCase()
      if (!map.has(key)) {
        const partyItems = matching
          .filter((m) => m.title.trim().toLowerCase() === key)
          .flatMap((m) => m.items)
        const stats = calculateAccountBalances(accountType, partyItems)
        map.set(key, { name: clean, stats })
      }
    }

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [records, accountType])

  // Current active party's accounting stats
  const activePartyStats = useMemo<AccountCreditStats | null>(() => {
    const partyName = isNewParty ? newPartyName.trim() : selectedParty.trim()
    if (!partyName) return null
    const found = existingParties.find(
      (p) => p.name.toLowerCase() === partyName.toLowerCase(),
    )
    if (found) return found.stats
    return {
      totalCreditSalesOrPurchases: 0,
      totalPayments: 0,
      totalAdvances: 0,
      totalAdvancesAllocated: 0,
      unappliedAdvance: 0,
      outstanding: 0,
    }
  }, [isNewParty, newPartyName, selectedParty, existingParties])

  // Selected product metadata from inventory
  const selectedProductInfo = useMemo(() => {
    if (!productName) return null
    return inventoryProducts.find(
      (p) => p.productName.toLowerCase() === productName.toLowerCase(),
    ) || null
  }, [productName, inventoryProducts])

  // Is product transaction vs payment vs advance
  const isProductTx = category === 'credit_sale' || category === 'credit_purchase' || category === 'customer_return' || category === 'supplier_return'

  // Computed quantities and total amount
  const isCarton = packaging === 'Carton'
  const numericCartons = parseFloat(cartonsStr) || 0
  const numericPcsPerCarton = parseFloat(piecesPerCartonStr) || 0
  const effectiveQuantity = isCarton
    ? numericCartons * numericPcsPerCarton
    : (parseFloat(quantityStr) || 0)
  const numericUnitPrice = parseFloat(unitPriceStr) || 0
  const computedProductTotal = Math.round(effectiveQuantity * numericUnitPrice * 100) / 100
  const numericPaymentAmount = parseFloat(paymentAmountStr) || 0

  const transactionAmount = isProductTx ? computedProductTotal : numericPaymentAmount

  // Handle product dropdown selection
  const handleProductSelect = (name: string) => {
    setProductName(name)
    const match = inventoryProducts.find((p) => p.productName.toLowerCase() === name.toLowerCase())
    if (match) {
      setSelectedProductId(match.id)
      setUnitPriceStr(String(match.unitPrice || match.costPrice || ''))
      if (match.pcsPerCarton && Number(match.pcsPerCarton) > 0) {
        setPiecesPerCartonStr(String(match.pcsPerCarton))
      }
    } else {
      setSelectedProductId('')
    }
  }

  // Initialize or reset form when modal opens
  useEffect(() => {
    if (!isPaymentModalOpen) {
      setFormError(null)
      setIsSubmitting(false)
      return
    }

    const type = paymentTargetType || 'customer'
    setAccountType(type)

    if (paymentTargetParty) {
      setIsNewParty(false)
      setSelectedParty(paymentTargetParty)
    } else if (existingParties.length > 0) {
      setIsNewParty(false)
      setSelectedParty(existingParties[0].name)
    } else {
      setIsNewParty(true)
      setSelectedParty('')
    }

    if (paymentTargetCategory) {
      setCategory(paymentTargetCategory)
    } else if (type === 'customer') {
      setCategory('payment_received')
    } else if (type === 'supplier') {
      setCategory('payment_made')
    } else {
      setCategory('credit_sale')
    }

    setPackaging('Piece')
    setCartonsStr('')
    setPiecesPerCartonStr('')
    setProductName('')
    setSelectedProductId('')
    setQuantityStr('1')
    setUnitPriceStr('')
    setPaymentAmountStr('')
    setPaymentMethod('Cash')
    setBankName('CBE')
    setReference('')
    setDate(new Date().toISOString().split('T')[0])
    setNotes('')
    setNewPartyName('')
    setNewPartyPhone('')
    setNewPartyAddress('')
    setFormError(null)
  }, [isPaymentModalOpen, paymentTargetType, paymentTargetParty, paymentTargetCategory])

  // Real-time calculation preview
  const preview = useMemo(() => {
    const curOutstanding = activePartyStats ? activePartyStats.outstanding : 0
    let projectedOutstanding = curOutstanding
    let warning: string | null = null

    if (accountType === 'customer' || accountType === 'delala') {
      if (category === 'credit_sale' || category === 'credit_purchase') {
        projectedOutstanding = curOutstanding + transactionAmount
        // Stock check
        if (selectedProductInfo && effectiveQuantity > selectedProductInfo.currentQuantity) {
          warning = t(
            `Insufficient stock! Available: ${selectedProductInfo.currentQuantity.toLocaleString()} pieces.`,
            `በመደብር ውስጥ በቂ ዕቃ የለም! ያለው: ${selectedProductInfo.currentQuantity.toLocaleString()} ፍሬ።`,
          )
        }
      } else if (category === 'payment_received') {
        projectedOutstanding = Math.max(0, curOutstanding - transactionAmount)
        if (transactionAmount > curOutstanding && curOutstanding > 0) {
          warning = t(
            `Payment amount (${transactionAmount.toLocaleString()} ETB) exceeds outstanding debt (${curOutstanding.toLocaleString()} ETB).`,
            `የክፍያው መጠን (${transactionAmount.toLocaleString()} ብር) ካለበት ቀሪ ዕዳ (${curOutstanding.toLocaleString()} ብር) ይበልጣል።`,
          )
        }
      } else if (category === 'payment_made') {
        projectedOutstanding = curOutstanding + transactionAmount
      } else if (category === 'customer_return' || category === 'supplier_return') {
        projectedOutstanding = Math.max(0, curOutstanding - transactionAmount)
      } else if (category === 'allocate_advance') {
        projectedOutstanding = Math.max(0, curOutstanding - transactionAmount)
      }
    } else {
      // Supplier
      if (category === 'credit_purchase') {
        projectedOutstanding = curOutstanding + transactionAmount
      } else if (category === 'payment_made') {
        projectedOutstanding = Math.max(0, curOutstanding - transactionAmount)
      } else if (category === 'supplier_return') {
        projectedOutstanding = Math.max(0, curOutstanding - transactionAmount)
      } else if (category === 'allocate_advance') {
        projectedOutstanding = Math.max(0, curOutstanding - transactionAmount)
      }
    }

    return {
      curOutstanding,
      projectedOutstanding: Math.round(projectedOutstanding * 100) / 100,
      warning,
    }
  }, [accountType, category, transactionAmount, activePartyStats, selectedProductInfo, effectiveQuantity, t])

  // Submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    const finalPartyName = isNewParty ? newPartyName.trim() : selectedParty.trim()
    if (!finalPartyName) {
      setFormError(t('Please specify the person/party name', 'እባክዎ የስም ዝርዝር ያስገቡ'))
      return
    }

    if (isProductTx) {
      if (!productName.trim()) {
        setFormError(t('Product name is required', 'የምርት ስም ማስገባት ግዴታ ነው'))
        return
      }
      if (effectiveQuantity <= 0) {
        setFormError(t('Quantity must be greater than 0', 'ብዛት ከ0 በላይ መሆን አለበት'))
        return
      }
      if (numericUnitPrice <= 0) {
        setFormError(t('Unit price must be greater than 0', 'የአንዱ ዋጋ ከ0 በላይ መሆን አለበት'))
        return
      }
      if ((category === 'credit_sale' || accountType === 'delala') && selectedProductInfo && effectiveQuantity > selectedProductInfo.currentQuantity) {
        setFormError(t(`Cannot deliver more than available stock (${selectedProductInfo.currentQuantity} pieces)`, `ካለው ክምችት በላይ መሸጥ አይቻልም (${selectedProductInfo.currentQuantity} ፍሬ)`))
        return
      }
    } else {
      // Payment or Advance
      if (transactionAmount <= 0) {
        setFormError(t('Payment amount must be greater than 0', 'የክፍያው መጠን ከ0 በላይ መሆን አለበት'))
        return
      }
    }

    let finalDesc = isProductTx ? productName.trim() : (category === 'payment_received' ? 'Payment Received' : category === 'payment_made' ? 'Payment Made' : 'Advance')
    if (category === 'customer_return') finalDesc = `Returned: ${productName.trim()}`
    if (category === 'supplier_return') finalDesc = `Return to Supplier: ${productName.trim()}`

    const finalMethod = isProductTx ? (category.includes('return') ? 'Stock Return' : 'Stock') : (paymentMethod === 'Bank Transfer' ? bankName : paymentMethod)

    setIsSubmitting(true)
    try {
      await recordCreditTx({
        type: accountType,
        partyName: finalPartyName,
        transactionCategory: category,
        amount: transactionAmount,
        description: finalDesc,
        productId: selectedProductId || undefined,
        productName: isProductTx ? productName.trim() : undefined,
        quantity: isProductTx ? effectiveQuantity : undefined,
        cartons: isProductTx && isCarton ? numericCartons : undefined,
        piecesPerCarton: isProductTx && isCarton ? numericPcsPerCarton : undefined,
        unitPrice: isProductTx ? numericUnitPrice : undefined,
        paymentMethod: finalMethod,
        bankName: paymentMethod === 'Bank Transfer' ? bankName : undefined,
        reference: reference.trim() || undefined,
        date: date || new Date().toISOString().split('T')[0],
        notes: notes.trim() || undefined,
      })

      closePaymentModal()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('Failed to save transaction', 'ዝውውሩን ማስቀመጥ አልተቻለም'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const isCustomer = accountType === 'customer'
  const isSupplier = accountType === 'supplier'
  const isBroker = accountType === 'delala'

  return (
    <Dialog open={isPaymentModalOpen} onOpenChange={(open) => !open && closePaymentModal()}>
      <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto p-4 sm:p-6 bg-white text-black border border-zinc-300 rounded-lg shadow-xl">
        <DialogHeader className="pb-3 border-b border-zinc-200">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded bg-black text-white">
              {isCustomer ? <Users size={18} /> : isSupplier ? <Building2 size={18} /> : <Package size={18} />}
            </div>
            <div>
              <DialogTitle className="text-base sm:text-lg font-bold text-black">
                {isCustomer
                  ? t('Customer Credit & Payment', 'የደንበኛ ሂሳብ እና ክፍያ')
                  : isSupplier
                  ? t('Supplier Credit & Payment', 'የአቅራቢ ሂሳብ እና ክፍያ')
                  : t('Broker Credit & Payment', 'የደላላ ሂሳብ እና ክፍያ')}
              </DialogTitle>
              <p className="text-xs text-zinc-600 mt-0.5">
                {isCustomer
                  ? t('Record product delivery on credit, payments, or returns', 'የዱቤ ዕቃ ሽያጭ ፣ የተቀበሉት ክፍያ ወይም ተመላሽ ይመዝግቡ')
                  : isSupplier
                  ? t('Record product delivery from supplier, payments, or returns', 'የገባ የዱቤ ዕቃ ፣ የተከፈለ ክፍያ ወይም ተመላሽ ይመዝግቡ')
                  : t('Record broker deals on credit, payments, or returns', 'የደላላ የዱቤ ዕቃ ፣ ክፍያ ወይም ተመላሽ ይመዝግቡ')}
              </p>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2 text-black">
          {formError && (
            <div className="flex items-start gap-2 p-3 text-xs bg-zinc-100 text-black rounded border border-zinc-300">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {/* Account Type Selector (Customer, Supplier, Broker) */}
          <div className="grid grid-cols-3 gap-2 bg-zinc-100 p-1 rounded border border-zinc-300">
            <button
              type="button"
              onClick={() => {
                setAccountType('customer')
                setCategory('payment_received')
              }}
              className={`py-1.5 text-xs font-semibold rounded transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                accountType === 'customer'
                  ? 'bg-black text-white shadow-xs'
                  : 'text-zinc-600 hover:text-black'
              }`}
            >
              <Users size={14} />
              <span>{t('Customer', 'ደንበኛ')}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAccountType('supplier')
                setCategory('payment_made')
              }}
              className={`py-1.5 text-xs font-semibold rounded transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                accountType === 'supplier'
                  ? 'bg-black text-white shadow-xs'
                  : 'text-zinc-600 hover:text-black'
              }`}
            >
              <Building2 size={14} />
              <span>{t('Supplier', 'አቅራቢ')}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAccountType('delala')
                setCategory('credit_sale')
              }}
              className={`py-1.5 text-xs font-semibold rounded transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                accountType === 'delala'
                  ? 'bg-black text-white shadow-xs'
                  : 'text-zinc-600 hover:text-black'
              }`}
            >
              <Package size={14} />
              <span>{t('Broker', 'ደላላ')}</span>
            </button>
          </div>

          {/* Party Selection (Existing vs New) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-black flex items-center gap-1.5">
                {isCustomer
                  ? t('Customer Name', 'የደንበኛ ስም')
                  : isSupplier
                  ? t('Supplier Name', 'የአቅራቢ ስም')
                  : t('Broker Name', 'የደላላ ስም')}
                <span className="text-zinc-500">*</span>
              </label>

              <button
                type="button"
                onClick={() => setIsNewParty(!isNewParty)}
                className="text-xs text-black hover:underline flex items-center gap-1 font-semibold cursor-pointer"
              >
                {isNewParty ? (
                  <>
                    <UserCheck size={13} />
                    <span>{t('Choose Existing', 'ከተመዘገበ ምረጥ')}</span>
                  </>
                ) : (
                  <>
                    <UserPlus size={13} />
                    <span>
                      {isCustomer
                        ? t('+ New Customer', '+ አዲስ ደንበኛ')
                        : isSupplier
                        ? t('+ New Supplier', '+ አዲስ አቅራቢ')
                        : t('+ New Broker', '+ አዲስ ደላላ')}
                    </span>
                  </>
                )}
              </button>
            </div>

            {isNewParty ? (
              <div className="space-y-2 p-3 rounded bg-zinc-50 border border-zinc-300">
                <Input
                  required
                  placeholder={
                    isCustomer
                      ? t('Customer Full Name...', 'የደንበኛ ሙሉ ስም...')
                      : isSupplier
                      ? t('Supplier Name...', 'የአቅራቢ ስም...')
                      : t('Broker Full Name...', 'የደላላ ሙሉ ስም...')
                  }
                  value={newPartyName}
                  onChange={(e) => setNewPartyName(e.target.value)}
                  className="text-xs bg-white text-black border-zinc-300 h-9 rounded"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Input
                    placeholder={t('Phone Number (Optional)', 'ስልክ ቁጥር (አማራጭ)')}
                    value={newPartyPhone}
                    onChange={(e) => setNewPartyPhone(e.target.value)}
                    className="text-xs bg-white text-black border-zinc-300 h-8 rounded"
                  />
                  <Input
                    placeholder={t('Address (Optional)', 'አድራሻ (አማራጭ)')}
                    value={newPartyAddress}
                    onChange={(e) => setNewPartyAddress(e.target.value)}
                    className="text-xs bg-white text-black border-zinc-300 h-8 rounded"
                  />
                </div>
              </div>
            ) : (
              <div>
                {existingParties.length === 0 ? (
                  <div className="p-3 text-xs text-zinc-500 bg-zinc-50 rounded border border-zinc-200 text-center">
                    {isCustomer
                      ? t('No customers registered yet. Click "+ New Customer" above.', 'ምንም ደንበኛ የለም። "+ አዲስ ደንበኛ" የሚለውን ይጫኑ።')
                      : isSupplier
                      ? t('No suppliers registered yet. Click "+ New Supplier" above.', 'ምንም አቅራቢ የለም። "+ አዲስ አቅራቢ" የሚለውን ይጫኑ።')
                      : t('No brokers registered yet. Click "+ New Broker" above.', 'ምንም ደላላ የለም። "+ አዲስ ደላላ" የሚለውን ይጫኑ።')}
                  </div>
                ) : (
                  <select
                    value={selectedParty}
                    onChange={(e) => setSelectedParty(e.target.value)}
                    className="w-full text-xs font-semibold px-3 py-2 bg-white text-black border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-black cursor-pointer"
                  >
                    {existingParties.map((p) => (
                      <option key={p.name} value={p.name}>
                        {translateDbText(p.name)} — {t('Outstanding Balance:', 'ቀሪ ሂሳብ:')} {formatCurrency(p.stats.outstanding)}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>

          {/* Transaction Category Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-black">
              {t('Transaction Type', 'የዝውውር ዓይነት')}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              {isBroker ? (
                <>
                  <button
                    type="button"
                    onClick={() => setCategory('credit_sale')}
                    className={`p-2.5 rounded border text-left font-medium transition-all cursor-pointer flex flex-col gap-0.5 ${
                      category === 'credit_sale' || category === 'credit_purchase'
                        ? 'border-black bg-zinc-100 text-black font-bold ring-1 ring-black'
                        : 'border-zinc-300 hover:bg-zinc-50 text-black'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <ArrowUpRight size={14} />
                      <span>{t('Broker Deal / Goods', 'የተሰጠ ዕቃ / ዱቤ')}</span>
                    </div>
                    <span className="text-[10px] text-zinc-600 font-normal">{t('Goods given to broker (+)', 'ለደላላ የተሰጠ ዕቃ (+)')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCategory('payment_received')}
                    className={`p-2.5 rounded border text-left font-medium transition-all cursor-pointer flex flex-col gap-0.5 ${
                      category === 'payment_received'
                        ? 'border-black bg-zinc-100 text-black font-bold ring-1 ring-black'
                        : 'border-zinc-300 hover:bg-zinc-50 text-black'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <ArrowDownLeft size={14} />
                      <span>{t('Payment Received', 'የተቀበሉት ክፍያ')}</span>
                    </div>
                    <span className="text-[10px] text-zinc-600 font-normal">{t('Broker pays money (-)', 'ደላላው ሲከፍል (-)')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCategory('payment_made')}
                    className={`p-2.5 rounded border text-left font-medium transition-all cursor-pointer flex flex-col gap-0.5 ${
                      category === 'payment_made'
                        ? 'border-black bg-zinc-100 text-black font-bold ring-1 ring-black'
                        : 'border-zinc-300 hover:bg-zinc-50 text-black'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <ArrowUpRight size={14} />
                      <span>{t('Payment Made', 'የተከፈለ ክፍያ')}</span>
                    </div>
                    <span className="text-[10px] text-zinc-600 font-normal">{t('Store pays broker', 'ለደላላ የተከፈለ')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCategory('customer_return')}
                    className={`p-2.5 rounded border text-left font-medium transition-all cursor-pointer flex flex-col gap-0.5 ${
                      category === 'customer_return' || category === 'supplier_return'
                        ? 'border-black bg-zinc-100 text-black font-bold ring-1 ring-black'
                        : 'border-zinc-300 hover:bg-zinc-50 text-black'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 size={14} />
                      <span>{t('Broker Return', 'የተመለሰ ዕቃ')}</span>
                    </div>
                    <span className="text-[10px] text-zinc-600 font-normal">{t('Broker returns goods (-)', 'ዕቃ ሲመለስ (-)')}</span>
                  </button>
                </>
              ) : isCustomer ? (
                <>
                  <button
                    type="button"
                    onClick={() => setCategory('payment_received')}
                    className={`p-2.5 rounded border text-left font-medium transition-all cursor-pointer flex flex-col gap-0.5 ${
                      category === 'payment_received'
                        ? 'border-black bg-zinc-100 text-black font-bold ring-1 ring-black'
                        : 'border-zinc-300 hover:bg-zinc-50 text-black'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <ArrowDownLeft size={14} />
                      <span>{t('Payment Received', 'የተቀበሉት ክፍያ')}</span>
                    </div>
                    <span className="text-[10px] text-zinc-600 font-normal">{t('Customer pays money', 'ደንበኛው ሲከፍል')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCategory('credit_sale')}
                    className={`p-2.5 rounded border text-left font-medium transition-all cursor-pointer flex flex-col gap-0.5 ${
                      category === 'credit_sale'
                        ? 'border-black bg-zinc-100 text-black font-bold ring-1 ring-black'
                        : 'border-zinc-300 hover:bg-zinc-50 text-black'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <ArrowUpRight size={14} />
                      <span>{t('Product Delivery', 'የተሰጠ ዕቃ / ዱቤ')}</span>
                    </div>
                    <span className="text-[10px] text-zinc-600 font-normal">{t('Goods given on credit', 'ዕቃ በዱቤ ሲሰጥ')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCategory('customer_return')}
                    className={`p-2.5 rounded border text-left font-medium transition-all cursor-pointer flex flex-col gap-0.5 ${
                      category === 'customer_return'
                        ? 'border-black bg-zinc-100 text-black font-bold ring-1 ring-black'
                        : 'border-zinc-300 hover:bg-zinc-50 text-black'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 size={14} />
                      <span>{t('Customer Return', 'የተመለሰ ዕቃ')}</span>
                    </div>
                    <span className="text-[10px] text-zinc-600 font-normal">{t('Goods returned to store', 'ደንበኛ ዕቃ ሲመልስ')}</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setCategory('payment_made')}
                    className={`p-2.5 rounded border text-left font-medium transition-all cursor-pointer flex flex-col gap-0.5 ${
                      category === 'payment_made'
                        ? 'border-black bg-zinc-100 text-black font-bold ring-1 ring-black'
                        : 'border-zinc-300 hover:bg-zinc-50 text-black'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <ArrowUpRight size={14} />
                      <span>{t('Payment Made', 'የተከፈለ ክፍያ')}</span>
                    </div>
                    <span className="text-[10px] text-zinc-600 font-normal">{t('Store pays supplier', 'መደብሩ ለአቅራቢ ሲከፍል')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCategory('credit_purchase')}
                    className={`p-2.5 rounded border text-left font-medium transition-all cursor-pointer flex flex-col gap-0.5 ${
                      category === 'credit_purchase'
                        ? 'border-black bg-zinc-100 text-black font-bold ring-1 ring-black'
                        : 'border-zinc-300 hover:bg-zinc-50 text-black'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <ArrowDownLeft size={14} />
                      <span>{t('Product Delivery', 'የገባ ዕቃ')}</span>
                    </div>
                    <span className="text-[10px] text-zinc-600 font-normal">{t('Goods received from supplier', 'ከአቅራቢ ዕቃ ሲገባ')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCategory('supplier_return')}
                    className={`p-2.5 rounded border text-left font-medium transition-all cursor-pointer flex flex-col gap-0.5 ${
                      category === 'supplier_return'
                        ? 'border-black bg-zinc-100 text-black font-bold ring-1 ring-black'
                        : 'border-zinc-300 hover:bg-zinc-50 text-black'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 size={14} />
                      <span>{t('Return to Supplier', 'ለአቅራቢ የተመለሰ')}</span>
                    </div>
                    <span className="text-[10px] text-zinc-600 font-normal">{t('Goods returned to supplier', 'ዕቃ ለአቅራቢው ሲመለስ')}</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Form Fields: DISTINCT FOR PRODUCT vs PAYMENT */}
          {isProductTx ? (
            /* PRODUCT TRANSACTION FORM */
            <div className="space-y-3 p-3.5 rounded bg-zinc-50 border border-zinc-300">
              <div>
                <label className="text-xs font-bold text-black block mb-1">
                  {t('Product / Item Name', 'የምርት / ዕቃ ስም')}
                  <span className="text-zinc-500">*</span>
                </label>
                <div className="space-y-1.5">
                  <Input
                    required
                    placeholder={t('e.g. Paper, Wire, 12W Safari...', 'ለምሳሌ ወረቀት ፣ ገመድ...')}
                    value={productName}
                    onChange={(e) => handleProductSelect(e.target.value)}
                    className="text-xs bg-white text-black border-zinc-300 h-9 rounded"
                  />
                  {inventoryProducts.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 items-center text-[11px] text-zinc-600 pt-1">
                      <span className="font-medium text-black">{t('Quick Pick:', 'ፈጣን ምርጫ:')}</span>
                      {inventoryProducts.slice(0, 5).map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => handleProductSelect(p.productName)}
                          className="px-2 py-0.5 rounded border border-zinc-300 bg-white hover:bg-zinc-100 text-black cursor-pointer"
                        >
                          {p.productName} ({Number(p.currentQuantity).toLocaleString()} pcs)
                        </button>
                      ))}
                    </div>
                  )}
                  {selectedProductInfo && (
                    <div className="text-[11px] text-zinc-700 bg-white p-2 rounded border border-zinc-300 flex items-center justify-between">
                      <span>{t('In Stock:', 'በክምችት ያለው:')} <strong>{Number(selectedProductInfo.currentQuantity).toLocaleString()} {selectedProductInfo.baseUnit || 'pcs'}</strong></span>
                      <span>{t('Default Unit Price:', 'የአንዱ ዋጋ:')} <strong>{formatCurrency(selectedProductInfo.unitPrice || selectedProductInfo.costPrice || 0)}</strong></span>
                    </div>
                  )}
                </div>
              </div>

              {/* Packaging Mode & Quantity Breakdown */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-black">
                    {t('Packaging & Quantity', 'ማሸጊያና ብዛት')}
                  </label>
                  <div className="flex items-center p-0.5 bg-zinc-200 border border-zinc-300 rounded text-xs">
                    <button
                      type="button"
                      onClick={() => setPackaging('Piece')}
                      className={`px-3 py-1 font-semibold rounded cursor-pointer transition-colors ${
                        packaging === 'Piece' ? 'bg-black text-white' : 'text-zinc-700 hover:text-black'
                      }`}
                    >
                      {t('Piece', 'ፍሬ')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPackaging('Carton')}
                      className={`px-3 py-1 font-semibold rounded cursor-pointer transition-colors ${
                        packaging === 'Carton' ? 'bg-black text-white' : 'text-zinc-700 hover:text-black'
                      }`}
                    >
                      {t('Carton', 'ካርቶን')}
                    </button>
                  </div>
                </div>

                {isCarton ? (
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                    <div>
                      <label className="text-xs font-medium text-black block mb-1">
                        {t('Cartons', 'ካርቶን ብዛት')}
                        <span className="text-zinc-500">*</span>
                      </label>
                      <Input
                        required
                        type="number"
                        step="any"
                        min="0.001"
                        placeholder="1"
                        value={cartonsStr}
                        onChange={(e) => setCartonsStr(e.target.value)}
                        className="font-semibold text-xs bg-white text-black border-zinc-300 h-9 rounded"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-black block mb-1">
                        {t('Pieces / Ctn', 'ፍሬ በካርቶን')}
                        <span className="text-zinc-500">*</span>
                      </label>
                      <Input
                        required
                        type="number"
                        step="any"
                        min="1"
                        placeholder="100"
                        value={piecesPerCartonStr}
                        onChange={(e) => setPiecesPerCartonStr(e.target.value)}
                        className="font-semibold text-xs bg-white text-black border-zinc-300 h-9 rounded"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-black block mb-1">
                        {t('Total Pieces', 'ጠቅላላ ፍሬ')}
                      </label>
                      <div className="h-9 px-3 bg-zinc-100 border border-zinc-300 rounded flex items-center justify-end font-bold text-xs text-black">
                        {effectiveQuantity.toLocaleString()} {t('pcs', 'ፍሬ')}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-black block mb-1">
                        {t('Price / Piece (ETB)', 'የአንዱ ዋጋ')}
                        <span className="text-zinc-500">*</span>
                      </label>
                      <Input
                        required
                        type="number"
                        step="any"
                        min="0.01"
                        placeholder="0.00"
                        value={unitPriceStr}
                        onChange={(e) => setUnitPriceStr(e.target.value)}
                        className="font-semibold text-xs bg-white text-black border-zinc-300 h-9 rounded"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-xs font-medium text-black block mb-1">
                        {t('Quantity (Pieces)', 'ብዛት (በፍሬ)')}
                        <span className="text-zinc-500">*</span>
                      </label>
                      <Input
                        required
                        type="number"
                        step="any"
                        min="0.001"
                        placeholder="1"
                        value={quantityStr}
                        onChange={(e) => setQuantityStr(e.target.value)}
                        className="font-semibold text-xs bg-white text-black border-zinc-300 h-9 rounded"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-black block mb-1">
                        {t('Unit Price (ETB)', 'የአንዱ ዋጋ (ብር)')}
                        <span className="text-zinc-500">*</span>
                      </label>
                      <Input
                        required
                        type="number"
                        step="any"
                        min="0.01"
                        placeholder="0.00"
                        value={unitPriceStr}
                        onChange={(e) => setUnitPriceStr(e.target.value)}
                        className="font-semibold text-xs bg-white text-black border-zinc-300 h-9 rounded"
                      />
                    </div>
                  </div>
                )}

                <div className="pt-1">
                  <div className="flex items-center justify-between p-2 rounded bg-zinc-200/80 border border-zinc-300 text-xs">
                    <span className="font-bold text-black">{t('Total Amount (ETB):', 'ጠቅላላ ዋጋ (ብር):')}</span>
                    <span className="font-extrabold text-sm text-black">{formatCurrency(computedProductTotal)}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* PAYMENT TRANSACTION FORM (NO PRODUCT, NO FAKE QUANTITY/PRICE) */
            <div className="space-y-3 p-3.5 rounded bg-zinc-50 border border-zinc-300">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="text-xs font-bold text-black block mb-1">
                    {t('Payment Amount (ETB)', 'የክፍያ መጠን (ብር)')}
                    <span className="text-zinc-500">*</span>
                  </label>
                  <Input
                    required
                    type="number"
                    step="any"
                    min="0.01"
                    placeholder="0.00"
                    value={paymentAmountStr}
                    onChange={(e) => setPaymentAmountStr(e.target.value)}
                    className="font-bold text-sm bg-white text-black border-zinc-300 h-10 rounded"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-black block mb-1">
                    {t('Payment Method', 'የክፍያ ዘዴ')}
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full text-xs font-medium px-3 h-10 bg-white text-black border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-black cursor-pointer"
                  >
                    <option value="Cash">{t('Cash', 'ጥሬ ገንዘብ')}</option>
                    <option value="Bank Transfer">{t('Bank Transfer', 'የባንክ ዝውውር')}</option>
                    <option value="Telebirr">Telebirr (ቴሌብር)</option>
                    <option value="CBE">CBE (የኢትዮጵያ ንግድ ባንክ)</option>
                    <option value="Awash Bank">Awash Bank (አዋሽ ባንክ)</option>
                    <option value="Bank of Abyssinia">Bank of Abyssinia (አቢሲኒያ)</option>
                    <option value="Dashen Bank">Dashen Bank (ዳሽን ባንክ)</option>
                  </select>
                </div>
              </div>

              {paymentMethod === 'Bank Transfer' && (
                <div>
                  <label className="text-xs font-medium text-black block mb-1">
                    {t('Bank Name', 'የባንክ ስም')}
                  </label>
                  <select
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    className="w-full text-xs font-medium px-3 h-9 bg-white text-black border border-zinc-300 rounded cursor-pointer"
                  >
                    <option value="CBE">Commercial Bank of Ethiopia (CBE)</option>
                    <option value="Awash Bank">Awash Bank</option>
                    <option value="Bank of Abyssinia">Bank of Abyssinia</option>
                    <option value="Dashen Bank">Dashen Bank</option>
                    <option value="Telebirr">Telebirr SuperApp</option>
                    <option value="Cooperative Bank of Oromia">Cooperative Bank of Oromia</option>
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Date, Reference #, Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="text-xs font-medium text-black block mb-1">
                {t('Transaction Date', 'የዝውውር ቀን')}
              </label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="text-xs bg-white text-black border-zinc-300 h-9 rounded"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-black block mb-1">
                {t('Reference / Receipt #', 'የደረሰኝ / ማጣቀሻ ቁጥር')}
              </label>
              <Input
                placeholder={t('e.g. TX-9842, REC-001', 'ለምሳሌ TX-9842...')}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="text-xs bg-white text-black border-zinc-300 h-9 rounded"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-black block mb-1">
              {t('Notes / Memo (Optional)', 'ማስታወሻ (አማራጭ)')}
            </label>
            <Input
              placeholder={t('Additional notes...', 'ተጨማሪ ማስታወሻ...')}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="text-xs bg-white text-black border-zinc-300 h-9 rounded"
            />
          </div>

          {/* Real-time Calculation Summary Box (Black text on white background) */}
          <div className="p-3 bg-zinc-100 border border-zinc-300 rounded space-y-1 text-xs text-black">
            <div className="flex justify-between">
              <span>
                {isCustomer
                  ? t('Current Outstanding Debt:', 'ያለበት ቀሪ ዕዳ:')
                  : isSupplier
                  ? t('Current Outstanding Payable:', 'ለአቅራቢ የሚከፈል:')
                  : t('Current Outstanding Balance:', 'ቀሪ የደላላ ሂሳብ:')}
              </span>
              <span className="font-semibold">{formatCurrency(preview.curOutstanding)}</span>
            </div>
            <div className="flex justify-between">
              <span>{t('This Transaction:', 'የዚህ ዝውውር ውጤት:')}</span>
              <span className="font-bold">
                {category === 'credit_sale' || category === 'credit_purchase' ? '+' : '-'} {formatCurrency(transactionAmount)}
              </span>
            </div>
            <div className="flex justify-between font-bold pt-1 border-t border-zinc-300">
              <span>
                {isCustomer
                  ? t('Projected New Debt:', 'አዲስ ቀሪ ዕዳ:')
                  : isSupplier
                  ? t('Projected New Payable:', 'አዲስ የሚከፈል ቀሪ:')
                  : t('Projected New Balance:', 'አዲስ ቀሪ ሂሳብ:')}
              </span>
              <span className="text-sm font-extrabold">{formatCurrency(preview.projectedOutstanding)}</span>
            </div>
          </div>

          {preview.warning && (
            <div className="p-2.5 text-xs bg-zinc-100 text-black rounded border border-zinc-400 flex items-start gap-1.5">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <span>{preview.warning}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-200">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={closePaymentModal}
              disabled={isSubmitting}
              className="text-xs h-9 rounded px-4 border-zinc-300 text-black hover:bg-zinc-100 cursor-pointer"
            >
              {t('Cancel', 'ሰርዝ')}
            </Button>

            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting || transactionAmount <= 0}
              className="text-xs h-9 rounded px-5 font-semibold bg-black hover:bg-zinc-800 text-white cursor-pointer"
            >
              {isSubmitting ? t('Saving...', 'በማስቀመጥ ላይ...') : t('Save Transaction', 'ዝውውሩን መዝግብ')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
