import React, { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { LedgerProvider, useLedger } from '../context/LedgerContext'
import { Navbar } from '../components/layout/Navbar'
import { StatsOverview } from '../components/ledger/StatsOverview'
import { RecordCard } from '../components/ledger/RecordCard'
import { RecordModal } from '../components/ledger/RecordModal'
import { ExportDialog } from '../components/ledger/ExportDialog'
import { ForexConverterDialog } from '../components/ledger/ForexConverterDialog'
import { PrintView } from '../components/ledger/PrintView'
import { ToastContainer } from '../components/ledger/ToastContainer'
import {
  Plus,
  Search,
  X,
  Printer,
  Share2,
  SlidersHorizontal,
  ArrowRightLeft,
  FolderOpen,
} from 'lucide-react'
import { Button } from '../components/ui/button'

export const Route = createFileRoute('/')({
  component: AppContentWrapper,
})

function AppContentWrapper() {
  return (
    <LedgerProvider>
      <MainAppView />
    </LedgerProvider>
  )
}

function MainAppView() {
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false)
  const [isForexDialogOpen, setIsForexDialogOpen] = useState(false)
  const [sortBy, setSortBy] = useState<
    'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc'
  >('date-desc')

  const {
    activeTab,
    filteredRecords,
    searchQuery,
    setSearchQuery,
    usdtRate,
    rateMode,
    syncStatus,
    syncWithNeon,
    openCreateModal,
  } = useLedger()

  // Sort filtered records
  const sortedRecords = [...filteredRecords].sort((a, b) => {
    if (sortBy === 'date-desc') {
      return new Date(b.date).getTime() - new Date(a.date).getTime()
    }
    if (sortBy === 'date-asc') {
      return new Date(a.date).getTime() - new Date(b.date).getTime()
    }
    const totalA = a.items.reduce(
      (sum, item) =>
        sum + (item.sign === '-' ? -1 : 1) * item.unitPrice * item.quantity,
      0,
    )
    const totalB = b.items.reduce(
      (sum, item) =>
        sum + (item.sign === '-' ? -1 : 1) * item.unitPrice * item.quantity,
      0,
    )
    if (sortBy === 'amount-desc') {
      return totalB - totalA
    }
    return totalA - totalB
  })

  const handlePrint = () => {
    window.print()
  }

  const tabLabels = {
    customer: 'customers',
    supplier: 'suppliers',
    stock: 'stock items',
  }[activeTab]

  return (
    <div className="min-h-screen bg-zinc-50/70 dark:bg-zinc-950 text-foreground flex flex-col font-sans">
      {/* Top Centered Navbar: 3 Tabs Only */}
      <Navbar />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-5 pb-12 no-print">
        {/* Compact Dynamic Metric Cards */}
        <StatsOverview />

        {/* Modern Unified Command & Action Bar */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 mb-4 p-1.5 sm:p-2 bg-card rounded-2xl shadow-xs ring-1 ring-zinc-950/5 dark:ring-white/5">
          {/* Left: Clean Integrated Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder={`Search ${tabLabels} by name, notes, or items...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm bg-transparent rounded-xl transition-colors focus:outline-none placeholder:text-muted-foreground/70"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 rounded-md"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Right: Modern controls & actions */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap sm:flex-nowrap justify-end border-t md:border-t-0 pt-1.5 md:pt-0">
            {/* Real-time Neon Cloud Sync Pill */}
            <button
              type="button"
              onClick={() => void syncWithNeon()}
              className="h-8 px-2.5 text-xs gap-1.5 inline-flex items-center rounded-xl bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              title={
                syncStatus === 'synced'
                  ? 'Real-time connected to Neon PostgreSQL database (Click to refresh)'
                  : syncStatus === 'syncing'
                    ? 'Syncing with Neon...'
                    : 'Offline (local storage cache active - click to retry)'
              }
            >
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  syncStatus === 'synced'
                    ? 'bg-emerald-500 shadow-xs'
                    : syncStatus === 'syncing'
                      ? 'bg-amber-500 animate-pulse'
                      : 'bg-zinc-400'
                }`}
              />
              <span className="hidden sm:inline text-[11px] font-medium">
                {syncStatus === 'synced'
                  ? 'Live Sync'
                  : syncStatus === 'syncing'
                    ? 'Syncing...'
                    : 'Offline'}
              </span>
            </button>

            {/* USDT to ETB Forex Rate Pill: 2 simple options (Black or Bank) */}
            <button
              type="button"
              onClick={() => setIsForexDialogOpen(true)}
              className="h-8 px-2.5 text-xs gap-1.5 inline-flex items-center rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 font-semibold transition-colors"
              title="Click to switch between Black Market and Bank rate"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              <span>
                {rateMode === 'black_market' ? 'Black' : 'Bank'}: 1 USDT ={' '}
                {usdtRate} ETB
              </span>
            </button>

            {/* Sort Selector */}
            <div className="flex items-center gap-1 bg-muted/60 px-2.5 py-1 rounded-xl text-xs h-8">
              <SlidersHorizontal className="w-3 h-3 text-muted-foreground" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-transparent text-xs font-medium text-foreground focus:outline-none cursor-pointer pr-1"
              >
                <option value="date-desc">Newest</option>
                <option value="date-asc">Oldest</option>
                <option value="amount-desc">High Total</option>
                <option value="amount-asc">Low Total</option>
              </select>
            </div>

            {/* Print Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePrint}
              className="h-8 px-2.5 text-xs gap-1.5 text-muted-foreground hover:text-foreground rounded-xl"
              title="Print Statement (PDF)"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Print</span>
            </Button>

            {/* Export & Backup Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExportDialogOpen(true)}
              className="h-8 px-2.5 text-xs gap-1.5 text-muted-foreground hover:text-foreground rounded-xl"
              title="Export Data & Backup"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export</span>
            </Button>

            {/* Primary New Entry Button */}
            <Button
              onClick={() => openCreateModal(activeTab)}
              size="sm"
              className="text-xs font-semibold shadow-xs flex items-center gap-1.5 h-8 px-3.5 rounded-xl shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Entry</span>
            </Button>
          </div>
        </div>

        {/* Filter feedback row */}
        {searchQuery && (
          <div className="flex items-center justify-between mb-3 px-3 py-1.5 bg-muted/40 rounded-xl text-xs text-muted-foreground ring-1 ring-zinc-950/5 dark:ring-white/5">
            <span>
              Found{' '}
              <strong className="text-foreground">
                {sortedRecords.length}
              </strong>{' '}
              records matching &ldquo;
              <span className="text-primary font-medium">{searchQuery}</span>
              &rdquo;
            </span>
            <button
              onClick={() => setSearchQuery('')}
              className="text-primary hover:underline font-semibold"
            >
              Clear filter
            </button>
          </div>
        )}

        {/* Records List / Accordion */}
        {sortedRecords.length > 0 ? (
          <div className="space-y-2.5">
            {sortedRecords.map((record) => (
              <RecordCard key={record.id} record={record} />
            ))}
          </div>
        ) : (
          /* Empty State */
          <div className="p-8 sm:p-10 text-center rounded-2xl bg-card shadow-xs ring-1 ring-zinc-950/5 dark:ring-white/5 my-4">
            <div className="w-12 h-12 rounded-2xl bg-muted/70 text-muted-foreground flex items-center justify-center mx-auto mb-3 shadow-inner">
              {searchQuery ? (
                <Search className="w-6 h-6" />
              ) : (
                <FolderOpen className="w-6 h-6" />
              )}
            </div>

            <h3 className="text-sm sm:text-base font-bold text-foreground">
              {searchQuery
                ? 'No matching records found'
                : `No ${tabLabels} records yet`}
            </h3>

            <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1 mb-5">
              {searchQuery
                ? `No entries match "${searchQuery}". Try a different keyword.`
                : `Get started by clicking "+ Add Entry" to record your first entry.`}
            </p>

            <div className="flex flex-wrap items-center justify-center gap-2">
              {searchQuery ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSearchQuery('')}
                  className="text-xs h-8 rounded-xl"
                >
                  Clear Search
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => openCreateModal(activeTab)}
                  className="font-semibold shadow-xs text-xs h-8 rounded-xl"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  <span>Create First Record</span>
                </Button>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Modals & Portals */}
      <RecordModal />
      <ForexConverterDialog
        isOpen={isForexDialogOpen}
        onClose={() => setIsForexDialogOpen(false)}
      />
      <ExportDialog
        isOpen={isExportDialogOpen}
        onClose={() => setIsExportDialogOpen(false)}
      />
      <ToastContainer />

      {/* Print View (visible only during browser printing) */}
      <PrintView />
    </div>
  )
}
