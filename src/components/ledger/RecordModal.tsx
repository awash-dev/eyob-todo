import React, { useState, useEffect, useRef } from 'react'
import { useLedger } from '../../context/LedgerContext'
import type { LineItem, SignType } from '../../types/ledger'
import { convertUsdtToEtb } from '../../data/forexRates'
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
    closeModal,
    addRecord,
    updateRecord,
    formatCurrency,
    usdtRate,
  } = useLedger()

  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<LineItem[]>([])
  const [showUsdtHelper, setShowUsdtHelper] = useState(false)
  const [showCustoms, setShowCustoms] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const itemListRef = useRef<HTMLDivElement>(null)

  // Initialize form state when opening create or edit modal
  useEffect(() => {
    if (!isModalOpen) {
      setError(null)
      setShowUsdtHelper(false)
      setShowCustoms(false)
      return
    }

    if (modalMode === 'edit' && editingRecord) {
      setTitle(editingRecord.title)
      setDate(editingRecord.date || new Date().toISOString().split('T')[0])
      setNotes(editingRecord.notes || '')
      setShowCustoms(editingRecord.items.some((it) => (it.customs || 0) > 0))
      setItems(
        editingRecord.items.map((it) => ({
          ...it,
          id:
            it.id ||
            `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        })),
      )
    } else {
      // Create new
      setTitle('')
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
        },
      ])
    }
    setError(null)
  }, [isModalOpen, modalMode, editingRecord])

  // Helpers for line items
  const handleAddItem = () => {
    const newItem: LineItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      name: '',
      unitPrice: 0,
      quantity: 1,
      sign: '+',
      customType: 'Stock',
    }

    setItems((prev) => [...prev, newItem])

    // After the new row renders, bring it into view and focus its name field.
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

  // Free-text Bank / Custom Type input (accepts any custom value)
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

  // Quick USDT conversion helper: converts USDT amount into ETB for a row
  const handleConvertUsdtToEtbRow = (index: number, usdtAmount: number) => {
    const etbPrice = convertUsdtToEtb(usdtAmount, usdtRate)
    handleItemChange(index, 'unitPrice', etbPrice)
  }

  // Quick Carton tool: Cartons × Pcs/Ctn = Total Quantity
  const handleCartonCalculation = (index: number) => {
    const currentItem = items[index]
    const cartonsInput = window.prompt(
      `Carton Tool for "${currentItem.name || 'Item'}":\nEnter number of Cartons / Boxes (e.g. 10):`,
      '10',
    )
    if (!cartonsInput) return
    const cartons = parseFloat(cartonsInput)
    if (isNaN(cartons) || cartons <= 0) return

    const pcsInput = window.prompt(`Enter Pieces per Carton (e.g. 100):`, '100')
    if (!pcsInput) return
    const pcs = parseFloat(pcsInput)
    if (isNaN(pcs) || pcs <= 0) return

    const totalQty = cartons * pcs
    let newName = currentItem.name
    if (!newName) {
      newName = `(${cartons} ctns × ${pcs} pcs)`
    } else if (!newName.includes('ctn')) {
      newName = `${newName} (${cartons} ctns × ${pcs} pcs)`
    }

    setItems((prev) =>
      prev.map((it, i) => {
        if (i === index) {
          return {
            ...it,
            name: newName,
            quantity: totalQty,
          }
        }
        return it
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

  // Title label based on activeTab
  const getTabLabel = () => {
    switch (activeTab) {
      case 'customer':
        return {
          header:
            modalMode === 'create'
              ? 'New Customer Entry'
              : 'Edit Customer Entry',
          placeholder: 'Customer / Store name (e.g. Alex Johnson)',
        }
      case 'supplier':
        return {
          header:
            modalMode === 'create'
              ? 'New Supplier Entry'
              : 'Edit Supplier Entry',
          placeholder: 'Supplier / Vendor name (e.g. Global Tech)',
        }
      case 'stock':
        return {
          header:
            modalMode === 'create' ? 'New Stock Entry' : 'Edit Stock Entry',
          placeholder: 'Depot or Item batch (e.g. Warehouse A)',
        }
    }
  }

  const { header, placeholder } = getTabLabel()

  const isStockTab = activeTab === 'stock'
  const lineLabels = isStockTab
    ? {
        type: 'Bank / Stock Type',
        item: 'Item / Product',
        unitPrice: 'Unit Cost',
        quantity: 'Qty',
        amount: 'Value',
      }
    : {
        type: 'Bank / Type',
        item: 'Item / Description',
        unitPrice: 'Unit Price',
        quantity: 'Qty',
        amount: 'Amount',
      }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!title.trim()) {
      setError('Please provide a title or name.')
      return
    }

    const validItems = items.filter((it) => it.name.trim() !== '')
    if (validItems.length === 0) {
      setError('Please provide at least one line item.')
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
        customs: Math.max(0, Number(it.customs) || 0),
        bank: bank || undefined,
        customType: customType || undefined,
      }
    })

    const recordData = {
      type: activeTab,
      title: title.trim(),
      date: date || new Date().toISOString().split('T')[0],
      notes: notes.trim(),
      exchangeRate: usdtRate,
      items: cleanedItems,
    }

    if (modalMode === 'edit' && editingRecord) {
      updateRecord(editingRecord.id, recordData)
    } else {
      addRecord(recordData)
    }

    closeModal()
  }

  return (
    <Dialog open={isModalOpen} onOpenChange={(open) => !open && closeModal()}>
      <DialogContent className="max-w-5xl w-[95vw] max-h-[92vh] overflow-y-auto overflow-x-hidden sm:rounded-2xl p-4 sm:p-6 border-0 shadow-2xl bg-card">
        <DialogHeader className="pb-2 text-left pr-10">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="text-base sm:text-lg font-bold text-foreground">
              {header}
            </DialogTitle>
            <div className="flex items-center gap-3 shrink-0">
              {isStockTab && (
                <button
                  type="button"
                  onClick={() => setShowCustoms(!showCustoms)}
                  className={`text-[11px] font-medium flex items-center gap-1 cursor-pointer shrink-0 transition-colors ${
                    showCustoms
                      ? 'text-amber-600 dark:text-amber-400 font-semibold underline'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  title="Toggle optional Customs duty / tariff column for imported items"
                >
                  <ion-icon
                    name="shield-checkmark-outline"
                    class="text-sm"
                  ></ion-icon>
                  <span>{showCustoms ? 'Hide Customs' : '+ Customs Duty'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowUsdtHelper(!showUsdtHelper)}
                className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer shrink-0"
                title="Toggle USDT to ETB conversion helper"
              >
                <ion-icon
                  name="swap-horizontal-outline"
                  class="text-sm"
                ></ion-icon>
                <span>
                  {showUsdtHelper ? 'Hide USDT Tool' : 'USDT ⇄ ETB Helper'}
                </span>
              </button>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3 pt-1 w-full min-w-0 max-w-full">
          {error && (
            <div className="flex items-center gap-2 p-2.5 text-xs text-rose-700 bg-rose-50 dark:bg-rose-950/50 dark:text-rose-300 rounded-lg">
              <ion-icon
                name="alert-circle-outline"
                class="text-base shrink-0"
              ></ion-icon>
              <span>{error}</span>
            </div>
          )}

          {/* Title & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="sm:col-span-2">
              <Input
                placeholder={placeholder}
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value)
                  if (error) setError(null)
                }}
                className="text-xs sm:text-sm font-medium h-9 bg-muted/30 focus:bg-background rounded-lg border-0 ring-1 ring-zinc-950/10 dark:ring-white/10"
                required
                autoFocus
              />
            </div>
            <div>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="text-xs h-9 bg-muted/30 focus:bg-background rounded-lg border-0 ring-1 ring-zinc-950/10 dark:ring-white/10"
              />
            </div>
          </div>

          {/* Optional Notes */}
          <div>
            <Input
              placeholder="Notes, phone, or invoice reference (optional)..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="text-xs text-muted-foreground h-8 bg-muted/30 focus:bg-background rounded-lg border-0 ring-1 ring-zinc-950/10 dark:ring-white/10"
            />
          </div>

          {/* Optional USDT converter bar if enabled */}
          {showUsdtHelper && (
            <div className="p-2.5 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/30 text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
              <span>
                Active rate: <strong>1 USDT = {usdtRate} ETB</strong>
              </span>
              <span className="text-[11px] text-muted-foreground">
                Prices below are saved in ETB
              </span>
            </div>
          )}

          {/* Line Items - Clean, spacious layout with Bank and Custom Type support */}
          <div className="pt-1 w-full min-w-0 max-w-full">
            <div className="w-full min-w-0 max-w-full overflow-x-auto pb-1.5 scrollbar-thin rounded-xl border border-zinc-100 dark:border-zinc-800/80 p-2 sm:p-3 bg-muted/10">
              <div className={isStockTab && showCustoms ? 'min-w-[760px]' : 'min-w-[660px]'}>
                <div className="flex items-center gap-2 text-[10px] sm:text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 px-1 border-b border-zinc-100 dark:border-zinc-800/80 pb-1.5">
                  <span className="w-8 text-center shrink-0">+/-</span>
                  <span className="w-32 sm:w-36 text-left shrink-0">
                    {lineLabels.type}
                  </span>
                  <span className="flex-1 min-w-[140px] text-left">
                    {lineLabels.item}
                  </span>
                  <span className="w-20 sm:w-24 text-right shrink-0">
                    {lineLabels.unitPrice}
                  </span>
                  <span className="w-24 sm:w-26 text-center shrink-0">
                    {lineLabels.quantity}
                  </span>
                  {isStockTab && showCustoms && (
                    <span className="w-20 sm:w-24 text-right shrink-0">Customs</span>
                  )}
                  <span className="w-24 sm:w-28 text-right shrink-0">
                    {lineLabels.amount}
                  </span>
                  <span className="w-8 shrink-0"></span>
                </div>

                <div ref={itemListRef} className="space-y-1.5">
                  {/* Suggestion lists for the free-text Bank / Stock Type inputs */}
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
                      (Number(item.unitPrice) || 0) *
                      (Number(item.quantity) || 0)
                    const lineTotal = isAdd
                      ? baseTotal + (Number(item.customs) || 0)
                      : -baseTotal

                    return (
                      <div
                        key={item.id}
                        data-item-row
                        className="flex items-center gap-2 py-1.5 border-b border-zinc-100 dark:border-zinc-800/60 last:border-0"
                      >
                        {/* Minimal Sign Toggle */}
                        <button
                          type="button"
                          onClick={() => toggleSign(index)}
                          className={`w-8 h-8 shrink-0 rounded-md flex items-center justify-center font-bold text-xs transition-colors cursor-pointer ${
                            isAdd
                              ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 hover:bg-emerald-100'
                              : 'bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 hover:bg-rose-100'
                          }`}
                          title="Toggle (+) Add or (-) Deduct"
                        >
                          {isAdd ? '+' : '−'}
                        </button>

                        {/* Bank / Custom Type free-text input */}
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
                          placeholder={isAdd ? 'Stock type' : 'Bank'}
                          className="w-32 sm:w-36 h-8 px-2 text-[11px] font-medium bg-muted/30 hover:bg-muted focus:bg-background rounded-md border-0 ring-1 ring-zinc-950/10 focus:ring-primary focus:outline-none shrink-0"
                          title={
                            isAdd
                              ? 'Type any stock type (Stock, Goods, Delivery, ...)'
                              : 'Type any bank or payment channel'
                          }
                        />

                        {/* Description */}
                        <input
                          data-item-name
                          placeholder={
                            isAdd
                              ? 'Item name (e.g. 12W SAFARI)'
                              : 'Payment reference or notes'
                          }
                          value={item.name}
                          onChange={(e) =>
                            handleItemChange(index, 'name', e.target.value)
                          }
                          className="flex-1 min-w-[140px] h-8 px-2 text-xs bg-muted/20 focus:bg-background rounded-md border-0 ring-1 ring-zinc-950/10 focus:ring-primary focus:outline-none transition-colors"
                          required
                        />

                        {/* Price in ETB */}
                        <input
                          type="number"
                          placeholder="Price"
                          step="any"
                          min="0"
                          value={item.unitPrice === 0 ? '' : item.unitPrice}
                          onChange={(e) =>
                            handleItemChange(
                              index,
                              'unitPrice',
                              parseFloat(e.target.value) || 0,
                            )
                          }
                          className="w-20 sm:w-24 h-8 px-1.5 text-xs text-right font-mono bg-muted/20 focus:bg-background rounded-md border-0 ring-1 ring-zinc-950/10 focus:ring-primary focus:outline-none transition-colors shrink-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />

                        {/* Optional USDT helper button for row */}
                        {showUsdtHelper && (
                          <button
                            type="button"
                            onClick={() => {
                              const val = window.prompt(
                                'Enter price in USDT (e.g. 50):',
                                '50',
                              )
                              if (val && !isNaN(Number(val))) {
                                handleConvertUsdtToEtbRow(index, Number(val))
                              }
                            }}
                            className="text-[10px] font-mono text-emerald-600 bg-emerald-100/60 dark:bg-emerald-950 px-1.5 py-1 rounded cursor-pointer shrink-0"
                            title="Convert from USDT"
                          >
                            USDT
                          </button>
                        )}

                        {/* Qty & Carton tool group */}
                        <div className="flex items-center gap-1 w-24 sm:w-26 shrink-0">
                          <input
                            type="number"
                            placeholder="Qty"
                            step="any"
                            min="0"
                            value={item.quantity === 0 ? '' : item.quantity}
                            onChange={(e) =>
                              handleItemChange(
                                index,
                                'quantity',
                                parseFloat(e.target.value) || 0,
                              )
                            }
                            className="flex-1 min-w-0 h-8 px-1 text-xs text-right font-mono bg-muted/20 focus:bg-background rounded-md border-0 ring-1 ring-zinc-950/10 focus:ring-primary focus:outline-none transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleCartonCalculation(index)}
                            className="text-[10px] font-mono font-medium text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted/80 px-1.5 h-8 rounded flex items-center justify-center cursor-pointer shrink-0 border border-dashed border-zinc-300 dark:border-zinc-700 transition-colors"
                            title="Carton Tool: Cartons × Pcs/Ctn = Qty (e.g. 10 ctns × 100 pcs = 1000)"
                          >
                            ctn
                          </button>
                        </div>

                        {/* Customs duty (optional toggle, stock additions only) */}
                        {isStockTab && showCustoms && (
                          isAdd ? (
                            <input
                              type="number"
                              placeholder="Customs"
                              step="any"
                              min="0"
                              value={item.customs ? item.customs : ''}
                              onChange={(e) =>
                                handleItemChange(
                                  index,
                                  'customs',
                                  parseFloat(e.target.value) || 0,
                                )
                              }
                              className="w-20 sm:w-24 h-8 px-1.5 text-xs text-right font-mono bg-muted/20 focus:bg-background rounded-md border-0 ring-1 ring-zinc-950/10 focus:ring-primary focus:outline-none transition-colors shrink-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              title="Customs / duty amount for this line (added to the value)"
                            />
                          ) : (
                            <div className="w-20 sm:w-24 h-8 flex items-center justify-center text-muted-foreground/40 text-xs shrink-0 font-mono">
                              —
                            </div>
                          )
                        )}

                        {/* Subtotal */}
                        <div className="w-24 sm:w-28 text-right font-mono font-semibold text-xs truncate shrink-0">
                          <span
                            className={
                              isAdd
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-rose-600 dark:text-rose-400'
                            }
                          >
                            {formatCurrency(lineTotal)}
                          </span>
                        </div>

                        {/* Remove item button with ion-icon */}
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(index)}
                          className="w-8 h-8 shrink-0 text-muted-foreground hover:text-rose-600 flex items-center justify-center rounded transition-colors cursor-pointer"
                          title="Remove row"
                        >
                          <ion-icon
                            name="trash-outline"
                            class="text-sm"
                          ></ion-icon>
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Add Line Item simple link */}
            <button
              type="button"
              onClick={handleAddItem}
              className="mt-2 text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1.5 py-1 cursor-pointer"
            >
              <ion-icon name="add-outline" class="text-base"></ion-icon>
              <span>Add another item</span>
            </button>
          </div>

          {/* Simple Clean Grand Total Bar */}
          <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between gap-3 w-full min-w-0">
            <div className="min-w-0">
              <span className="text-[11px] text-muted-foreground block">
                Total Balance
              </span>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span
                  className={`text-base sm:text-lg font-mono font-bold ${
                    calculatedGrandTotal >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {formatCurrency(calculatedGrandTotal)}
                </span>
                {calculatedGrandTotal !== 0 && (
                  <span className="text-[11px] text-muted-foreground font-mono">
                    (≈ {(calculatedGrandTotal / usdtRate).toFixed(1)} USDT)
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button
                type="button"
                variant="ghost"
                onClick={closeModal}
                className="text-xs h-8 px-3 rounded-lg cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                className="text-xs font-semibold h-8 px-4 rounded-lg shadow-xs cursor-pointer whitespace-nowrap"
              >
                {modalMode === 'edit' ? 'Save Changes' : 'Create Entry'}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
