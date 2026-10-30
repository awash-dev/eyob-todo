import React, { useState, useEffect } from 'react'
import { useLedger } from '../../context/LedgerContext'
import type { LineItem, SignType } from '../../types/ledger'
import { convertUsdtToEtb } from '../../data/forexRates'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'

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
  const [error, setError] = useState<string | null>(null)

  // Initialize form state when opening create or edit modal
  useEffect(() => {
    if (!isModalOpen) {
      setError(null)
      setShowUsdtHelper(false)
      return
    }

    if (modalMode === 'edit' && editingRecord) {
      setTitle(editingRecord.title)
      setDate(editingRecord.date || new Date().toISOString().split('T')[0])
      setNotes(editingRecord.notes || '')
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
      setItems([
        {
          id: `item-${Date.now()}-1`,
          name: '',
          unitPrice: 0,
          quantity: 1,
          sign: '+',
        },
      ])
    }
    setError(null)
  }, [isModalOpen, modalMode, editingRecord])

  // Helpers for line items
  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: `item-${Date.now()}-${prev.length + 1}`,
        name: '',
        unitPrice: 0,
        quantity: 1,
        sign: '+',
      },
    ])
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
          return { ...item, sign: newSign }
        }
        return item
      }),
    )
  }

  // Quick USDT conversion helper: converts USDT amount into ETB for a row
  const handleConvertUsdtToEtbRow = (index: number, usdtAmount: number) => {
    const etbPrice = convertUsdtToEtb(usdtAmount, usdtRate)
    handleItemChange(index, 'unitPrice', etbPrice)
  }

  // Calculate live Grand Total
  const calculatedGrandTotal = items.reduce((acc, item) => {
    const mult = item.sign === '-' ? -1 : 1
    const price = Number(item.unitPrice) || 0
    const qty = Number(item.quantity) || 0
    return acc + mult * price * qty
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

    const cleanedItems: LineItem[] = validItems.map((it) => ({
      ...it,
      name: it.name.trim(),
      unitPrice: Math.max(0, Number(it.unitPrice) || 0),
      quantity: Math.max(0, Number(it.quantity) || 0),
      sign: it.sign,
    }))

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
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto sm:rounded-2xl p-4 sm:p-5 border-0 shadow-xl bg-card">
        <DialogHeader className="pb-1 text-left">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base sm:text-lg font-bold text-foreground">
              {header}
            </DialogTitle>
            <button
              type="button"
              onClick={() => setShowUsdtHelper(!showUsdtHelper)}
              className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
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
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3 pt-1">
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

          {/* Line Items - Clean, minimal, non-bulky layout */}
          <div className="pt-1">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1 px-0.5">
              <span>Line Items</span>
              <span>Click +/- to toggle</span>
            </div>

            <div className="space-y-1.5">
              {items.map((item, index) => {
                const isAdd = item.sign === '+'
                const lineTotal =
                  (isAdd ? 1 : -1) *
                  (Number(item.unitPrice) || 0) *
                  (Number(item.quantity) || 0)

                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-1.5 py-1 border-b border-zinc-100 dark:border-zinc-800/80 last:border-0"
                  >
                    {/* Minimal Sign Toggle */}
                    <button
                      type="button"
                      onClick={() => toggleSign(index)}
                      className={`w-7 h-7 shrink-0 rounded-md flex items-center justify-center font-bold text-xs transition-colors cursor-pointer ${
                        isAdd
                          ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 hover:bg-emerald-100'
                          : 'bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 hover:bg-rose-100'
                      }`}
                      title="Toggle (+) Add or (-) Deduct"
                    >
                      {isAdd ? '+' : '−'}
                    </button>

                    {/* Description */}
                    <input
                      placeholder="Item name"
                      value={item.name}
                      onChange={(e) =>
                        handleItemChange(index, 'name', e.target.value)
                      }
                      className="flex-1 min-w-[110px] h-7.5 px-2 text-xs bg-muted/20 focus:bg-background rounded-md border-0 ring-1 ring-zinc-950/5 focus:ring-primary focus:outline-none transition-colors"
                      required
                    />

                    {/* Price in ETB */}
                    <input
                      type="number"
                      placeholder="Price (ETB)"
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
                      className="w-20 sm:w-24 h-7.5 px-1.5 text-xs text-right font-mono bg-muted/20 focus:bg-background rounded-md border-0 ring-1 ring-zinc-950/5 focus:ring-primary focus:outline-none transition-colors"
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
                        className="text-[10px] font-mono text-emerald-600 bg-emerald-100/60 dark:bg-emerald-950 px-1 py-1 rounded cursor-pointer"
                        title="Convert from USDT"
                      >
                        USDT
                      </button>
                    )}

                    {/* Qty */}
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
                      className="w-12 sm:w-14 h-7.5 px-1 text-xs text-right font-mono bg-muted/20 focus:bg-background rounded-md border-0 ring-1 ring-zinc-950/5 focus:ring-primary focus:outline-none transition-colors"
                    />

                    {/* Subtotal */}
                    <div className="hidden sm:block w-20 text-right font-mono font-medium text-xs truncate">
                      <span
                        className={isAdd ? 'text-emerald-600' : 'text-rose-600'}
                      >
                        {formatCurrency(lineTotal)}
                      </span>
                    </div>

                    {/* Remove item button with ion-icon */}
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(index)}
                      className="w-7 h-7 shrink-0 text-muted-foreground hover:text-rose-600 flex items-center justify-center rounded transition-colors cursor-pointer"
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
          <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-muted-foreground block">
                Total Balance
              </span>
              <div className="flex items-baseline gap-2">
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

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={closeModal}
                className="text-xs h-8 px-3 rounded-lg"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                className="text-xs font-semibold h-8 px-4 rounded-lg shadow-xs"
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
