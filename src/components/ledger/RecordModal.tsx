import React, { useState, useEffect, useRef } from 'react'
import { useLedger } from '../../context/LedgerContext'
import { useLanguage } from '../../context/LanguageContext'
import type { LineItem, SignType } from '../../types/ledger'
import { ETHIOPIAN_BANKS } from '../../lib/bankUtils'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'

const STOCK_TYPE_OPTIONS = [
  'Stock',
  'Goods',
  'Product',
  'Delivery',
  'Return',
] as const

export const RecordModal: React.FC = () => {
  const {
    isModalOpen,
    modalMode,
    editingRecord,
    activeTab,
    createPrefillTitle,
    editAppendRow,
    records,
    closeModal,
    addRecord,
    updateRecord,
    deleteRecord,
    formatCurrency,
  } = useLedger()
  const { t } = useLanguage()

  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<LineItem[]>([])
  const [showCustoms, setShowCustoms] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const itemListRef = useRef<HTMLDivElement>(null)

  // Initialize form state when opening create or edit modal
  useEffect(() => {
    if (!isModalOpen) {
      setError(null)
      setShowCustoms(false)
      return
    }

    if (modalMode === 'edit' && editingRecord) {
      setTitle(editingRecord.title)
      setDate(editingRecord.date || new Date().toISOString().split('T')[0])
      setNotes(editingRecord.notes || '')
      setShowCustoms(editingRecord.items.some((it) => (it.customs || 0) > 0))
      const mapped = editingRecord.items.map((it) => ({
        ...it,
        id:
          it.id ||
          `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      }))
      if (editAppendRow) {
        mapped.push({
          id: `item-${Date.now()}-new`,
          name: '',
          unitPrice: 0,
          quantity: 1,
          sign: '+',
          customType: 'Stock',
          pcsPrice: 0,
        })
      }
      setItems(mapped)
    } else {
      // Create new register
      setTitle(createPrefillTitle || '')
      setDate(new Date().toISOString().split('T')[0])
      setNotes('')
      setShowCustoms(false)
      setItems([
        {
          id: `item-${Date.now()}-1`,
          name: '',
          unitPrice: 0,
          quantity: 1,
          sign: '+',
          customType: 'Stock',
          pcsPrice: 0,
        },
      ])
    }
    setError(null)
  }, [isModalOpen, modalMode, editingRecord, createPrefillTitle, editAppendRow])

  // Helpers for line items
  const handleAddItem = () => {
    const newItem: LineItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      name: '',
      unitPrice: 0,
      quantity: 1,
      sign: '+',
      customType: 'Stock',
      pcsPrice: 0,
    }

    setItems((prev) => [...prev, newItem])

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const container = itemListRef.current
        if (!container) return
        const rows = container.querySelectorAll<HTMLElement>('[data-item-row]')
        const lastRow = rows[rows.length - 1] as HTMLElement | undefined
        lastRow?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        lastRow
          ?.querySelector<HTMLInputElement>('input[data-item-name]')
          ?.focus()
      })
    })
  }

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) {
      setItems([
        {
          id: `item-${Date.now()}-0`,
          name: '',
          unitPrice: 0,
          quantity: 1,
          sign: '+',
          customType: 'Stock',
          pcsPrice: 0,
        },
      ])
      return
    }
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  const handleItemChange = (
    index: number,
    field: keyof LineItem,
    value: string | number | SignType,
  ) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i === index) {
          return {
            ...item,
            [field]: value,
          }
        }
        return item
      }),
    )
  }

  const toggleSign = (index: number) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i === index) {
          const newSign: SignType = item.sign === '+' ? '-' : '+'
          return {
            ...item,
            sign: newSign,
            bank: newSign === '-' ? item.bank || 'CBE' : undefined,
            customType:
              newSign === '+' ? item.customType || 'Stock' : undefined,
          }
        }
        return item
      }),
    )
  }

  // Free-text Bank / Custom Type input
  const handleBankOrTypeChange = (index: number, val: string) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i === index) {
          const isDeduct = it.sign === '-'
          let newName = it.name
          if (
            isDeduct &&
            (!newName ||
              newName.startsWith('Bank Transfer -') ||
              newName === 'Payment')
          ) {
            newName = val.trim() ? `Bank Transfer - ${val.trim()}` : ''
          }
          return {
            ...it,
            name: newName,
            bank: isDeduct ? val : undefined,
            customType: !isDeduct ? val : undefined,
          }
        }
        return it
      }),
    )
  }

  // Quick Carton / Pcs calculation
  const handleCartonOrPcsChange = (
    index: number,
    field: 'cartons' | 'pcsPerCarton',
    val: number,
  ) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i === index) {
          const cartons = field === 'cartons' ? val : item.cartons || 0
          const pcs = field === 'pcsPerCarton' ? val : item.pcsPerCarton || 0
          const computedQty =
            cartons > 0 && pcs > 0
              ? cartons * pcs
              : cartons > 0
                ? cartons
                : item.quantity
          return {
            ...item,
            [field]: val > 0 ? val : undefined,
            quantity: computedQty > 0 ? computedQty : item.quantity,
          }
        }
        return item
      }),
    )
  }

  // Calculate live Grand Total
  const calculatedGrandTotal = items.reduce((acc, item) => {
    const price = Number(item.unitPrice) || 0
    const qty = Number(item.quantity) || 0
    const customs = Number(item.customs) || 0
    const base = price * qty
    return acc + (item.sign === '-' ? -base : base + customs)
  }, 0)

  // Title label based on activeTab (strictly single-language, simple short words)
  const getTabLabel = () => {
    switch (activeTab) {
      case 'customer':
        return {
          header:
            modalMode === 'edit'
              ? t('Edit Customer Entry', 'የደንበኛ መዝገብ አርትዕ')
              : t('Customer Entry', 'የደንበኛ መዝገብ'),
          placeholder: t('Customer Name *', 'የደንበኛ ስም *'),
        }
      case 'supplier':
        return {
          header:
            modalMode === 'edit'
              ? t('Edit Supplier Entry', 'የአቅራቢ መዝገብ አርትዕ')
              : t('Supplier Entry', 'የአቅራቢ መዝገብ'),
          placeholder: t('Supplier Name *', 'የአቅራቢ ስም *'),
        }
      case 'delala':
        return {
          header:
            modalMode === 'edit'
              ? t('Edit Broker Entry', 'የደላላ መዝገብ አርትዕ')
              : t('Broker Entry', 'የደላላ መዝገብ'),
          placeholder: t('Broker Name *', 'የደላላ ስም *'),
        }
      case 'stock':
        return {
          header:
            modalMode === 'edit'
              ? t('Edit Stock Entry', 'የመደብር መዝገብ አርትዕ')
              : t('Stock Entry', 'የመደብር መዝገብ'),
          placeholder: t('Item Name *', 'የዕቃ ስም *'),
        }
    }
  }

  const { header, placeholder } = getTabLabel()

  const isStockTab = activeTab === 'stock'
  const lineLabels = isStockTab
    ? {
      type: t('Bank / Type', 'ባንክ / ዓይነት'),
      item: t('Item / Description', 'ዕቃ / ዝርዝር'),
      unitPrice: t('Cost', 'የአንዱ ዋጋ'),
      quantity: t('Total Qty', 'ጠቅላላ ብዛት'),
      amount: t('Total', 'መጠን'),
    }
    : {
      type: t('Bank / Type', 'ባንክ / ዓይነት'),
      item: t('Item / Description', 'ዕቃ / ዝርዝር'),
      unitPrice: t('Unit Price', 'የአንዱ ዋጋ'),
      pcsPrice: t('Pcs Price', 'ፍሬ ዋጋ'),
      quantity: t('Qty', 'ብዛት'),
      amount: t('Amount', 'መጠን'),
    }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!title.trim()) {
      setError(t('Please enter name.', 'እባክዎ ስም ያስገቡ።'))
      return
    }

    const validItems = items.filter((it) => it.name.trim() !== '')
    if (validItems.length === 0) {
      setError(t('Please enter at least one item.', 'እባክዎ ቢያንስ አንድ ዕቃ ያስገቡ።'))
      return
    }

    const cleanedItems: LineItem[] = validItems.map((it) => {
      const bank = it.bank?.trim()
      const customType = it.customType?.trim()
      return {
        ...it,
        name: it.name.trim(),
        unitPrice: Math.max(0, Number(it.unitPrice) || 0),
        quantity: Math.max(0, Number(it.quantity) || 0),
        sign: it.sign,
        cartons: it.cartons ? Math.max(0, Number(it.cartons)) : undefined,
        pcsPerCarton: it.pcsPerCarton
          ? Math.max(0, Number(it.pcsPerCarton))
          : undefined,
        pcsPrice: it.pcsPrice ? Math.max(0, Number(it.pcsPrice)) : undefined,
        customs: it.customs ? Math.max(0, Number(it.customs)) : undefined,
        bank: bank || undefined,
        customType: customType || undefined,
      }
    })

    const recordData = {
      type: activeTab,
      title: title.trim(),
      date: date || new Date().toISOString().split('T')[0],
      notes: notes.trim(),
      items: cleanedItems,
    }

    if (modalMode === 'edit' && editingRecord) {
      updateRecord(editingRecord.id, recordData)
    } else {
      // Check if an existing record with the exact same title & tab exists
      const existingMatch = records.find(
        (r) =>
          r.type === activeTab &&
          r.title.trim().toLowerCase() === title.trim().toLowerCase(),
      )
      if (existingMatch) {
        updateRecord(existingMatch.id, {
          ...existingMatch,
          date: date || existingMatch.date,
          notes: notes.trim() || existingMatch.notes,
          items: [...existingMatch.items, ...cleanedItems],
        })
      } else {
        addRecord(recordData)
      }
    }

    closeModal()
  }

  return (
    <Dialog open={isModalOpen} onOpenChange={(open) => !open && closeModal()}>
      <DialogContent className="max-w-4xl w-[96vw] max-h-[85vh] overflow-y-auto overflow-x-hidden sm:rounded-xl p-3 sm:p-4 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-black dark:text-white shadow-xl">
        {/* Simple compact header - NO decorative icons or badges */}
        <DialogHeader className="pb-1.5 text-left flex flex-row items-center justify-between border-b border-zinc-200 dark:border-zinc-800">
          <DialogTitle className="text-sm sm:text-base font-bold text-foreground">
            {header}
          </DialogTitle>
          {isStockTab && (
            <button
              type="button"
              onClick={() => setShowCustoms(!showCustoms)}
              className="text-xs text-muted-foreground hover:text-foreground cursor-pointer mr-6"
            >
              {showCustoms ? t('Hide Customs', 'ጉምሩክ ደብቅ') : t('+ Customs', '+ ጉምሩክ')}
            </button>
          )}
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-2.5 pt-2 w-full min-w-0">
          {error && (
            <div className="p-2 text-xs text-rose-700 bg-rose-50 dark:bg-rose-950/50 dark:text-rose-300 rounded border border-rose-200 dark:border-rose-900">
              {error}
            </div>
          )}

          {/* Datalist for existing party names in this section */}
          <datalist id="existing-party-names">
            {Array.from(
              new Set(
                records
                  .filter((r) => r.type === activeTab)
                  .map((r) => r.title)
                  .filter(Boolean),
              ),
            ).map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>

          {/* Top Inputs: Name & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="sm:col-span-2">
              <Input
                list="existing-party-names"
                placeholder={placeholder}
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value)
                  if (error) setError(null)
                }}
                className="text-xs font-semibold h-8 bg-background rounded border border-zinc-300 dark:border-zinc-700 focus:border-black dark:focus:border-white"
                required
                autoFocus
              />
            </div>
            <div>
              <Input
                type="text"
                placeholder={t('Date (YYYY-MM-DD)', 'ቀን')}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="text-xs h-8 bg-background rounded border border-zinc-300 dark:border-zinc-700"
              />
            </div>
          </div>

          {/* Optional Note */}
          <div>
            <Input
              placeholder={t('Note (optional)...', 'ማስታወሻ (አማራጭ)...')}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="text-xs h-7.5 bg-background rounded border border-zinc-200 dark:border-zinc-800 text-muted-foreground"
            />
          </div>

          {/* Table Container - Compact, small height */}
          <div className="w-full min-w-0 max-w-full overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800 p-2 bg-zinc-50/50 dark:bg-zinc-900/30">
            <div className="min-w-[760px]">
              {/* Table Column Headers */}
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider pb-1 border-b border-zinc-200 dark:border-zinc-800">
                <span className="w-7 text-center shrink-0">+/-</span>
                <span className="w-28 sm:w-32 text-left shrink-0">
                  {lineLabels.type}
                </span>
                <span className="flex-1 min-w-[120px] text-left">
                  {lineLabels.item}
                </span>
                {isStockTab ? (
                  <>
                    <span className="w-14 sm:w-16 text-right shrink-0">Ctns</span>
                    <span className="w-14 sm:w-16 text-right shrink-0">Pcs/Ctn</span>
                    <span className="w-16 sm:w-20 text-right shrink-0">Total Qty</span>
                    <span className="w-20 sm:w-22 text-right shrink-0">
                      {lineLabels.unitPrice}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="w-20 sm:w-22 text-right shrink-0">
                      {lineLabels.unitPrice}
                    </span>
                    <span className="w-20 sm:w-22 text-right shrink-0">
                      {lineLabels.pcsPrice}
                    </span>
                    <span className="w-16 sm:w-20 text-center shrink-0">
                      {lineLabels.quantity}
                    </span>
                  </>
                )}
                {isStockTab && showCustoms && (
                  <span className="w-18 sm:w-20 text-right shrink-0">Customs</span>
                )}
                <span className="w-24 sm:w-28 text-right shrink-0">
                  {lineLabels.amount}
                </span>
                <span className="w-7 shrink-0"></span>
              </div>

              {/* Rows */}
              <div ref={itemListRef} className="space-y-1 pt-1">
                <datalist id="stock-type-options">
                  {STOCK_TYPE_OPTIONS.map((type) => (
                    <option key={type} value={type} />
                  ))}
                </datalist>
                <datalist id="bank-options">
                  {ETHIOPIAN_BANKS.map((bank) => (
                    <option key={bank} value={bank} />
                  ))}
                </datalist>

                {items.map((item, index) => {
                  const isAdd = item.sign === '+'
                  const baseTotal =
                    (Number(item.unitPrice) || 0) * (Number(item.quantity) || 0)
                  const lineTotal = isAdd
                    ? baseTotal + (Number(item.customs) || 0)
                    : -baseTotal

                  return (
                    <div
                      key={item.id}
                      data-item-row
                      className="flex items-center gap-1.5 py-1 border-b border-zinc-100 dark:border-zinc-800/60 last:border-0"
                    >
                      {/* +/- Toggle */}
                      <button
                        type="button"
                        onClick={() => toggleSign(index)}
                        className={`w-7 h-7 shrink-0 rounded flex items-center justify-center font-bold text-xs cursor-pointer border ${isAdd
                            ? 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/60 dark:text-blue-400 dark:border-blue-800'
                            : 'bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-950/60 dark:text-rose-400 dark:border-rose-800'
                          }`}
                        title="Toggle (+) Debit or (-) Credit"
                      >
                        {isAdd ? '+' : '−'}
                      </button>

                      {/* Type / Bank Input */}
                      <input
                        type="text"
                        list={isAdd ? 'stock-type-options' : 'bank-options'}
                        value={
                          isAdd
                            ? (item.customType ?? 'Stock')
                            : (item.bank ?? 'CBE')
                        }
                        onChange={(e) =>
                          handleBankOrTypeChange(index, e.target.value)
                        }
                        placeholder={isAdd ? 'Stock' : 'CBE'}
                        className="w-28 sm:w-32 h-7.5 px-2 text-xs bg-background rounded border border-zinc-200 dark:border-zinc-800 focus:outline-none shrink-0"
                      />

                      {/* Item / Description */}
                      <input
                        type="text"
                        data-item-name
                        value={item.name}
                        onChange={(e) =>
                          handleItemChange(index, 'name', e.target.value)
                        }
                        placeholder={t('Item / Description', 'ዕቃ / ዝርዝር')}
                        className="flex-1 min-w-[120px] h-7.5 px-2 text-xs bg-background rounded border border-zinc-200 dark:border-zinc-800 focus:outline-none"
                      />

                      {/* Unit Price */}
                      <input
                        type="number"
                        placeholder="0"
                        step="any"
                        min="0"
                        value={item.unitPrice ? item.unitPrice : ''}
                        onChange={(e) =>
                          handleItemChange(
                            index,
                            'unitPrice',
                            parseFloat(e.target.value) || 0,
                          )
                        }
                        className="w-20 sm:w-22 h-7.5 px-1.5 text-xs text-right font-mono bg-background rounded border border-zinc-200 dark:border-zinc-800 focus:outline-none shrink-0"
                      />

                      {/* Pcs Price / Ctns */}
                      {!isStockTab ? (
                        <input
                          type="number"
                          placeholder="Pcs Price"
                          step="any"
                          min="0"
                          value={item.pcsPrice ? item.pcsPrice : ''}
                          onChange={(e) =>
                            handleItemChange(
                              index,
                              'pcsPrice',
                              parseFloat(e.target.value) || 0,
                            )
                          }
                          className="w-20 sm:w-22 h-7.5 px-1.5 text-xs text-right font-mono bg-background rounded border border-zinc-200 dark:border-zinc-800 focus:outline-none shrink-0"
                        />
                      ) : (
                        <>
                          <input
                            type="number"
                            placeholder="0"
                            step="any"
                            min="0"
                            value={item.cartons ? item.cartons : ''}
                            onChange={(e) =>
                              handleCartonOrPcsChange(
                                index,
                                'cartons',
                                parseFloat(e.target.value) || 0,
                              )
                            }
                            className="w-14 sm:w-16 h-7.5 px-1.5 text-xs text-right font-mono bg-background rounded border border-zinc-200 dark:border-zinc-800 focus:outline-none shrink-0"
                          />
                          <input
                            type="number"
                            placeholder="1"
                            step="any"
                            min="0"
                            value={item.pcsPerCarton ? item.pcsPerCarton : ''}
                            onChange={(e) =>
                              handleCartonOrPcsChange(
                                index,
                                'pcsPerCarton',
                                parseFloat(e.target.value) || 0,
                              )
                            }
                            className="w-14 sm:w-16 h-7.5 px-1.5 text-xs text-right font-mono bg-background rounded border border-zinc-200 dark:border-zinc-800 focus:outline-none shrink-0"
                          />
                        </>
                      )}

                      {/* Quantity */}
                      <input
                        type="number"
                        placeholder="1"
                        step="any"
                        min="0"
                        value={item.quantity ? item.quantity : ''}
                        onChange={(e) =>
                          handleItemChange(
                            index,
                            'quantity',
                            parseFloat(e.target.value) || 0,
                          )
                        }
                        className="w-16 sm:w-20 h-7.5 px-1.5 text-xs text-center font-mono bg-background rounded border border-zinc-200 dark:border-zinc-800 focus:outline-none shrink-0"
                      />

                      {/* Line Total */}
                      <div className="w-24 sm:w-28 text-right font-mono font-bold text-xs truncate shrink-0">
                        <span
                          className={
                            isAdd
                              ? 'text-blue-600 dark:text-blue-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }
                        >
                          {isAdd ? '+' : ''}
                          {formatCurrency(lineTotal)}
                        </span>
                      </div>

                      {/* Remove Row Button */}
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(index)}
                        className="w-7 h-7 shrink-0 text-zinc-400 hover:text-rose-600 flex items-center justify-center rounded cursor-pointer text-sm font-bold"
                        title={t('Remove row', 'ረድፍ ሰርዝ')}
                      >
                        ×
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Add Item Link */}
          <button
            type="button"
            onClick={handleAddItem}
            className="text-xs font-semibold text-black dark:text-white hover:underline inline-flex items-center gap-1 py-0.5 cursor-pointer"
          >
            + {t('Add another item', 'ተጨማሪ ረድፍ ጨምር')}
          </button>

          {/* Footer - Total & Action Buttons */}
          <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3 w-full">
            <div>
              <span className="text-[11px] text-muted-foreground mr-1.5">
                {t('Total Balance', 'ጠቅላላ ቀሪ')}:
              </span>
              <span
                className={`text-base font-mono font-bold ${calculatedGrandTotal >= 0
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-rose-600 dark:text-rose-400'
                  }`}
              >
                {formatCurrency(calculatedGrandTotal)}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {modalMode === 'edit' && editingRecord && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    if (
                      window.confirm(
                        t(
                          `Are you sure you want to delete "${editingRecord.title}"?`,
                          `እርግጠኛ ነዎት "${editingRecord.title}"ን መሰረዝ ይፈልጋሉ?`,
                        ),
                      )
                    ) {
                      deleteRecord(editingRecord.id)
                      closeModal()
                    }
                  }}
                  className="text-xs h-7.5 px-2.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 cursor-pointer"
                >
                  {t('Delete', 'ሰርዝ')}
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                onClick={closeModal}
                className="text-xs h-7.5 px-3 cursor-pointer"
              >
                {t('Cancel', 'ተመለስ')}
              </Button>
              <Button
                type="submit"
                size="sm"
                className="text-xs font-semibold h-7.5 px-4 rounded bg-black hover:bg-zinc-800 text-white cursor-pointer"
              >
                {modalMode === 'edit'
                  ? t('Save Changes', 'አስቀምጥ')
                  : t('Save', 'መዝግብ')}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
