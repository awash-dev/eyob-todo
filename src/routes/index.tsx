import { CircleX, FolderOpen, Menu, Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { LedgerProvider, useLedger } from '../context/LedgerContext'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import { Sidebar } from '../components/layout/Sidebar'
import { MobileBottomNav } from '../components/layout/MobileBottomNav'
import { RecordCard } from '../components/ledger/RecordCard'
import { RecordModal } from '../components/ledger/RecordModal'
import { PrintView } from '../components/ledger/PrintView'
import { ToastContainer } from '../components/ledger/ToastContainer'
import { StockSpreadsheetView } from '../components/ledger/StockSpreadsheetView'
import { TranslatorToolModal } from '../components/layout/TranslatorToolModal'
import { Button } from '../components/ui/button'
import { calculateItemTotal } from '../lib/formatters'



export const Route = createFileRoute('/')({
  component: AppContentWrapper,
})

function AppContentWrapper() {
  const { activeStoreId, user } = useAuth()
  const effectiveStoreId =
    user?.role === 'storekeeper' ? user.storeId || activeStoreId : activeStoreId
  return (
    <LedgerProvider key={effectiveStoreId || 'no-store'}>
      <MainAppView />
    </LedgerProvider>
  )
}

function MainAppView() {
  const { user } = useAuth()
  const { t } = useLanguage()
  const [sortBy] = useState<
    'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc'
  >('date-desc')
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)

  const {
    activeTab,
    filteredRecords,
    searchQuery,
    setSearchQuery,
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
    customer: t('customers', 'ደንበኞች'),
    supplier: t('suppliers', 'አቅራቢዎች'),
    stock: t('stock items', 'የመደብር ዕቃዎች'),
    delala: t('brokers', 'ደላላ'),
  }[activeTab]

  return (
    <div className="min-h-screen bg-zinc-50/70 dark:bg-zinc-950 text-foreground flex font-sans">
      <Sidebar
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col md:ml-64">
        {/* Main Container - Padded for mobile bottom nav bar */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-5 pb-24 md:pb-12 no-print">

        {user?.role === 'storekeeper' || activeTab === 'stock' ? (
          <StockSpreadsheetView onOpenMobileMenu={() => setIsMobileSidebarOpen(true)} />
        ) : (
          <>
            {/* Clean Command & Action Bar */}
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 mb-5 p-2 bg-white text-black rounded-lg border border-zinc-300 shadow-2xs">
              {/* Left: Mobile Menu Toggle + Clean Integrated Search */}
              <div className="flex items-center gap-2 flex-1">
                <button
                  type="button"
                  onClick={() => setIsMobileSidebarOpen(true)}
                  className="md:hidden p-2 rounded bg-zinc-100 hover:bg-zinc-200 text-black shrink-0 flex items-center justify-center cursor-pointer border border-zinc-300"
                  title={t('Open menu', 'ሜኑ ክፈት')}
                >
                  <Menu size={16} />
                </button>

                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center pointer-events-none text-zinc-500">
                    <Search size={15} />
                  </span>
                  <input
                    type="text"
                    placeholder={t(
                      `Search ${tabLabels} by name, notes, or items...`,
                      `በስም ፣ በማስታወሻ ወይም በዕቃዎች ፈልግ...`
                    )}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm bg-white text-black rounded border border-zinc-300 focus:outline-none focus:ring-1 focus:ring-black placeholder:text-zinc-500"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-black p-1 rounded flex items-center justify-center cursor-pointer"
                      title={t('Clear search', 'ፍለጋውን አጽዳ')}
                    >
                      <CircleX size={15} />
                    </button>
                  )}
                </div>
              </div>

              {/* Right: Add Entry Button */}
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  onClick={() => openCreateModal(activeTab)}
                  size="sm"
                  className="text-xs font-semibold shadow-2xs flex items-center gap-1.5 h-8 px-3 rounded bg-black hover:bg-zinc-800 text-white cursor-pointer"
                >
                  <Plus size={15} />
                  <span>
                    {activeTab === 'customer'
                      ? t('+ Add Customer', '+ ደንበኛ መዝግብ')
                      : activeTab === 'supplier'
                      ? t('+ Add Supplier', '+ አቅራቢ መዝግብ')
                      : activeTab === 'delala'
                      ? t('+ Add Broker', '+ ደላላ መዝግብ')
                      : t('+ Add Stock', '+ እቃ መዝግብ')}
                  </span>
                </Button>
              </div>
            </div>

            {/* Filter feedback row */}
            {searchQuery && (
              <div className="flex items-center justify-between mb-3 px-3 py-1.5 bg-muted/40 rounded-xl text-xs text-muted-foreground ring-1 ring-zinc-950/5 dark:ring-white/5">
                <span>
                  {t('Found', 'የተገኙ')} <strong className="text-foreground">{sortedRecords.length}</strong> {t('records matching', 'መዝገቦች ከ')} &ldquo;
                  <span className="text-primary font-medium">{searchQuery}</span>
                  &rdquo;
                </span>
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-primary hover:underline font-semibold cursor-pointer"
                >
                  {t('Clear filter', 'ማጣሪያውን አጽዳ')}
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
                    ? t('No matching records found', 'ምንም የተገኘ መዝገብ የለም')
                    : t(`No ${tabLabels} records yet`, `ምንም የተመዘገበ የለም`)}
                </h3>

                <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1 mb-5">
                  {searchQuery
                    ? t(`No entries match "${searchQuery}". Try a different keyword.`, `ከ "${searchQuery}" ጋር የሚዛመድ መዝገብ የለም። በሌላ ቃል ይሞክሩ።`)
                    : t('Get started by clicking "+ Add Entry" to record your first entry.', 'የመጀመሪያውን መዝገብ ለማስገባት "+ አዲስ መዝገብ" የሚለውን ይጫኑ።')}
                </p>

                <div className="flex flex-wrap items-center justify-center gap-2">
                  {searchQuery ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSearchQuery('')}
                      className="text-xs h-8 rounded-xl"
                    >
                      {t('Clear Search', 'ፍለጋውን አጽዳ')}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => openCreateModal(activeTab)}
                      className="font-semibold shadow-xs text-xs h-8 rounded-xl flex items-center gap-1.5"
                    >
                      <Plus size={16} />
                      <span>{t('Create First Record', 'የመጀመሪያ መዝገብ ፍጠር')}</span>
                    </Button>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Mobile Sticky Bottom Navigation (thumb-friendly) */}
      <MobileBottomNav />

      {/* Modals & Portals */}
      <RecordModal />
      <ToastContainer />
      <TranslatorToolModal />

        {/* Print View (visible only during browser printing) */}
        <PrintView />
      </div>
    </div>
  )
}
