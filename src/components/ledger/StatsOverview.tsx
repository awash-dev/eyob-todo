import React from 'react'
import { useLedger } from '../../context/LedgerContext'
import { calculateRecordTotal } from '../../lib/formatters'

export const StatsOverview: React.FC = () => {
  const { activeTab, currentTabRecords, formatCurrency } = useLedger()

  // Calculate totals
  const grandTotal = currentTabRecords.reduce(
    (acc, rec) => acc + calculateRecordTotal(rec),
    0,
  )

  const totalItemsCount = currentTabRecords.reduce(
    (acc, rec) => acc + rec.items.length,
    0,
  )

  const totalUnitsQuantity = currentTabRecords.reduce((acc, rec) => {
    return (
      acc +
      rec.items.reduce(
        (itemAcc, item) =>
          itemAcc + (item.sign === '-' ? -item.quantity : item.quantity),
        0,
      )
    )
  }, 0)

  const positiveSubtotal = currentTabRecords.reduce((acc, rec) => {
    return (
      acc +
      rec.items
        .filter((i) => i.sign === '+')
        .reduce((itemAcc, i) => itemAcc + i.unitPrice * i.quantity, 0)
    )
  }, 0)

  const negativeSubtotal = currentTabRecords.reduce((acc, rec) => {
    return (
      acc +
      rec.items
        .filter((i) => i.sign === '-')
        .reduce((itemAcc, i) => itemAcc + i.unitPrice * i.quantity, 0)
    )
  }, 0)

  if (activeTab === 'customer') {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 mb-4">
        {/* Total Credit Due */}
        <div className="p-3 sm:px-3.5 sm:py-2.5 rounded-xl bg-card shadow-xs ring-1 ring-zinc-950/5 dark:ring-white/5 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] sm:text-[11px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
              Total Credit Due
            </span>
            <div className="p-1 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400 shrink-0 flex items-center justify-center">
              <ion-icon name="wallet-outline" class="text-sm"></ion-icon>
            </div>
          </div>
          <div className="mt-1">
            <div className="text-base sm:text-lg font-bold text-foreground tracking-tight">
              {formatCurrency(grandTotal)}
            </div>
            <p className="text-[10px] text-muted-foreground truncate">
              Net customer receivables
            </p>
          </div>
        </div>

        {/* Total Credit Given */}
        <div className="p-3 sm:px-3.5 sm:py-2.5 rounded-xl bg-card shadow-xs ring-1 ring-zinc-950/5 dark:ring-white/5 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] sm:text-[11px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
              Credit Given
            </span>
            <div className="p-1 rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400 shrink-0 flex items-center justify-center">
              <ion-icon name="arrow-up-circle-outline" class="text-sm"></ion-icon>
            </div>
          </div>
          <div className="mt-1">
            <div className="text-base sm:text-lg font-bold text-foreground tracking-tight">
              {formatCurrency(positiveSubtotal)}
            </div>
            <p className="text-[10px] text-muted-foreground truncate">
              Invoiced sales on credit
            </p>
          </div>
        </div>

        {/* Payments Received */}
        <div className="p-3 sm:px-3.5 sm:py-2.5 rounded-xl bg-card shadow-xs ring-1 ring-zinc-950/5 dark:ring-white/5 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] sm:text-[11px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
              Payments In
            </span>
            <div className="p-1 rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400 shrink-0 flex items-center justify-center">
              <ion-icon name="arrow-down-circle-outline" class="text-sm"></ion-icon>
            </div>
          </div>
          <div className="mt-1">
            <div className="text-base sm:text-lg font-bold text-foreground tracking-tight">
              {formatCurrency(negativeSubtotal)}
            </div>
            <p className="text-[10px] text-muted-foreground truncate">
              Settlements & returns
            </p>
          </div>
        </div>

        {/* Active Accounts */}
        <div className="p-3 sm:px-3.5 sm:py-2.5 rounded-xl bg-card shadow-xs ring-1 ring-zinc-950/5 dark:ring-white/5 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] sm:text-[11px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
              Accounts
            </span>
            <div className="p-1 rounded-lg bg-purple-50 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400 shrink-0 flex items-center justify-center">
              <ion-icon name="people-outline" class="text-sm"></ion-icon>
            </div>
          </div>
          <div className="mt-1">
            <div className="text-base sm:text-lg font-bold text-foreground tracking-tight">
              {currentTabRecords.length}
            </div>
            <p className="text-[10px] text-muted-foreground truncate">
              Across {totalItemsCount} line items
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (activeTab === 'supplier') {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 mb-4">
        {/* Total Payables Due */}
        <div className="p-3 sm:px-3.5 sm:py-2.5 rounded-xl bg-card shadow-xs ring-1 ring-zinc-950/5 dark:ring-white/5 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] sm:text-[11px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
              Total Payables Due
            </span>
            <div className="p-1 rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400 shrink-0 flex items-center justify-center">
              <ion-icon name="wallet-outline" class="text-sm"></ion-icon>
            </div>
          </div>
          <div className="mt-1">
            <div className="text-base sm:text-lg font-bold text-foreground tracking-tight">
              {formatCurrency(grandTotal)}
            </div>
            <p className="text-[10px] text-muted-foreground truncate">
              Total owed to suppliers
            </p>
          </div>
        </div>

        {/* Total Purchases */}
        <div className="p-3 sm:px-3.5 sm:py-2.5 rounded-xl bg-card shadow-xs ring-1 ring-zinc-950/5 dark:ring-white/5 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] sm:text-[11px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
              Total Purchases
            </span>
            <div className="p-1 rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400 shrink-0 flex items-center justify-center">
              <ion-icon name="receipt-outline" class="text-sm"></ion-icon>
            </div>
          </div>
          <div className="mt-1">
            <div className="text-base sm:text-lg font-bold text-foreground tracking-tight">
              {formatCurrency(positiveSubtotal)}
            </div>
            <p className="text-[10px] text-muted-foreground truncate">
              Supplied orders
            </p>
          </div>
        </div>

        {/* Payments Disbursed */}
        <div className="p-3 sm:px-3.5 sm:py-2.5 rounded-xl bg-card shadow-xs ring-1 ring-zinc-950/5 dark:ring-white/5 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] sm:text-[11px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
              Payments Disbursed
            </span>
            <div className="p-1 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400 shrink-0 flex items-center justify-center">
              <ion-icon name="checkmark-done-circle-outline" class="text-sm"></ion-icon>
            </div>
          </div>
          <div className="mt-1">
            <div className="text-base sm:text-lg font-bold text-foreground tracking-tight">
              {formatCurrency(negativeSubtotal)}
            </div>
            <p className="text-[10px] text-muted-foreground truncate">
              Wire, cash & bank transfers
            </p>
          </div>
        </div>

        {/* Active Suppliers */}
        <div className="p-3 sm:px-3.5 sm:py-2.5 rounded-xl bg-card shadow-xs ring-1 ring-zinc-950/5 dark:ring-white/5 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] sm:text-[11px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
              Active Suppliers
            </span>
            <div className="p-1 rounded-lg bg-orange-50 text-orange-600 dark:bg-orange-950/50 dark:text-orange-400 shrink-0 flex items-center justify-center">
              <ion-icon name="business-outline" class="text-sm"></ion-icon>
            </div>
          </div>
          <div className="mt-1">
            <div className="text-base sm:text-lg font-bold text-foreground tracking-tight">
              {currentTabRecords.length}
            </div>
            <p className="text-[10px] text-muted-foreground truncate">
              Across {totalItemsCount} invoice items
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Stock Management Tab
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 mb-4">
      {/* Total Inventory Value */}
      <div className="p-3 sm:px-3.5 sm:py-2.5 rounded-xl bg-card shadow-xs ring-1 ring-zinc-950/5 dark:ring-white/5 flex flex-col justify-between">
        <div className="flex items-center justify-between gap-1">
          <span className="text-[10px] sm:text-[11px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
            Inventory Value
          </span>
          <div className="p-1 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400 shrink-0 flex items-center justify-center">
            <ion-icon name="wallet-outline" class="text-sm"></ion-icon>
          </div>
        </div>
        <div className="mt-1">
          <div className="text-base sm:text-lg font-bold text-foreground tracking-tight">
            {formatCurrency(grandTotal)}
          </div>
          <p className="text-[10px] text-muted-foreground truncate">
            Current warehouse valuation
          </p>
        </div>
      </div>

      {/* Units in Stock */}
      <div className="p-3 sm:px-3.5 sm:py-2.5 rounded-xl bg-card shadow-xs ring-1 ring-zinc-950/5 dark:ring-white/5 flex flex-col justify-between">
        <div className="flex items-center justify-between gap-1">
          <span className="text-[10px] sm:text-[11px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
            Total Units
          </span>
          <div className="p-1 rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400 shrink-0 flex items-center justify-center">
            <ion-icon name="cube-outline" class="text-sm"></ion-icon>
          </div>
        </div>
        <div className="mt-1">
          <div className="text-base sm:text-lg font-bold text-foreground tracking-tight">
            {totalUnitsQuantity.toLocaleString()}
          </div>
          <p className="text-[10px] text-muted-foreground truncate">
            Tracked product items
          </p>
        </div>
      </div>

      {/* Stock Batches / Records */}
      <div className="p-3 sm:px-3.5 sm:py-2.5 rounded-xl bg-card shadow-xs ring-1 ring-zinc-950/5 dark:ring-white/5 flex flex-col justify-between">
        <div className="flex items-center justify-between gap-1">
          <span className="text-[10px] sm:text-[11px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
            Stock Lots
          </span>
          <div className="p-1 rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400 shrink-0 flex items-center justify-center">
            <ion-icon name="layers-outline" class="text-sm"></ion-icon>
          </div>
        </div>
        <div className="mt-1">
          <div className="text-base sm:text-lg font-bold text-foreground tracking-tight">
            {currentTabRecords.length}
          </div>
          <p className="text-[10px] text-muted-foreground truncate">
            Warehouses & depots
          </p>
        </div>
      </div>

      {/* Distinct Line Items */}
      <div className="p-3 sm:px-3.5 sm:py-2.5 rounded-xl bg-card shadow-xs ring-1 ring-zinc-950/5 dark:ring-white/5 flex flex-col justify-between">
        <div className="flex items-center justify-between gap-1">
          <span className="text-[10px] sm:text-[11px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
            Line Items
          </span>
          <div className="p-1 rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400 shrink-0 flex items-center justify-center">
            <ion-icon name="pricetags-outline" class="text-sm"></ion-icon>
          </div>
        </div>
        <div className="mt-1">
          <div className="text-base sm:text-lg font-bold text-foreground tracking-tight">
            {totalItemsCount}
          </div>
          <p className="text-[10px] text-muted-foreground truncate">
            Individual SKU entries
          </p>
        </div>
      </div>
    </div>
  )
}
