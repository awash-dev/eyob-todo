import { CircleX, FolderOpen, Plus, Search, Store } from 'lucide-react'
import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { LedgerProvider, useLedger } from '../context/LedgerContext'
import { useAuth } from '../context/AuthContext'
import { Navbar } from '../components/layout/Navbar'
import { Sidebar } from '../components/layout/Sidebar'
import { MobileBottomNav } from '../components/layout/MobileBottomNav'
import { RecordCard } from '../components/ledger/RecordCard'
import { RecordModal } from '../components/ledger/RecordModal'
import { PrintView } from '../components/ledger/PrintView'
import { ToastContainer } from '../components/ledger/ToastContainer'
import { Button } from '../components/ui/button'
import { calculateItemTotal } from '../lib/formatters'

export const Route = createFileRoute('/')({
  component: AppContentWrapper,
})

function AppContentWrapper() {
  const { activeShopId } = useAuth()
  return (
    <LedgerProvider key={activeShopId || 'no-shop'}>
      <MainAppView />
    </LedgerProvider>
  )
}

function MainAppView() {
  const { activeShop } = useAuth()
  const [sortBy, setSortBy] = useState<
    'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc'
  >('date-desc')

  const {
    activeTab,
    filteredRecords,
    searchQuery,
    setSearchQuery,
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
      (sum, item) => sum + calculateItemTotal(item),
      0,
    )
    const totalB = b.items.reduce(
      (sum, item) => sum + calculateItemTotal(item),
      0,
    )
    if (sortBy === 'amount-desc') {
      return totalB - totalA
    }
    return totalA - totalB
  })

  const tabLabels = {
    customer: 'customers',
    supplier: 'suppliers',
    stock: 'stock items',
    delala: 'delala brokers',
  }[activeTab]

  return (
    <div className="min-h-screen bg-zinc-50/70 dark:bg-zinc-950 text-foreground flex font-sans">
      <Sidebar />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Sticky Navbar (mobile tabs + unified header) */}
        <Navbar />

        {/* Main Container - Padded for mobile bottom nav bar */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-5 pb-24 md:pb-12 no-print">

        {activeTab === 'stock' && activeShop && (
          <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-purple-50/70 dark:bg-purple-950/30 ring-1 ring-purple-200/60 dark:ring-purple-900/40 text-[11px]">
            <Store size={14} className="text-purple-600 dark:text-purple-300" />
            <span className="text-purple-800 dark:text-purple-200">
              Store: <strong>{activeShop.name}</strong>
            </span>
            <span className="text-purple-600/70 dark:text-purple-300/70 ml-auto hidden sm:inline">
              Stock products are saved to this shop only
            </span>
          </div>
        )}

        {/* Modern Unified Command & Action Bar */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 mb-4 p-1.5 sm:p-2 bg-card rounded-2xl shadow-xs ring-1 ring-zinc-950/5 dark:ring-white/5">
          {/* Left: Clean Integrated Search */}
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center pointer-events-none text-muted-foreground">
              <Search size={16} />
            </span>
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
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 rounded-md flex items-center justify-center cursor-pointer"
                title="Clear search"
              >
                <CircleX size={16} />
              </button>
            )}
          </div>

          {/* Right: Add Entry Button */}
          <div className="flex items-center gap-2 shrink-0">
            <Button
              onClick={() => openCreateModal(activeTab)}
              size="sm"
              className="text-xs font-semibold shadow-xs flex items-center gap-1.5 h-8 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
            >
              <Plus size={16} />
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
              className="text-primary hover:underline font-semibold cursor-pointer"
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
                <Search size={24} />
              ) : (
                <FolderOpen size={24} />
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
                  className="font-semibold shadow-xs text-xs h-8 rounded-xl flex items-center gap-1.5"
                >
                  <Plus size={16} />
                  <span>Create First Record</span>
                </Button>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Mobile Sticky Bottom Navigation (thumb-friendly) */}
      <MobileBottomNav />

      {/* Modals & Portals */}
      <RecordModal />
      <ToastContainer />

        {/* Print View (visible only during browser printing) */}
        <PrintView />
      </div>
    </div>
  )
}
