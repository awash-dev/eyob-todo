import {
  BookOpen,
  Building2,
  Handshake,
  Layers,
  LogOut,
  Users,
  X,
} from 'lucide-react'
import React, { useState } from 'react'
import { useLedger } from '../../context/LedgerContext'
import { useAuth } from '../../context/AuthContext'
import { useLanguage } from '../../context/LanguageContext'
import type { TabType } from '../../types/ledger'
import { Badge } from '../ui/badge'
import { AdminPanel } from '../admin/AdminPanel'

interface SidebarProps {
  isMobileOpen?: boolean
  onCloseMobile?: () => void
}

export const Sidebar: React.FC<SidebarProps> = ({
  isMobileOpen = false,
  onCloseMobile,
}) => {
  const { activeTab, setActiveTab, tabRecordCounts } = useLedger()
  const {
    user,
    stores,
    activeStoreId,
    activeStore,
    setActiveStoreId,
    isAdmin,
    logout,
  } = useAuth()
  const { t, language, setLanguage } = useLanguage()

  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false)


  const tabs: {
    id: TabType
    label: string
    Icon: React.ComponentType<{ size?: number; className?: string }>
    activeClass: string
  }[] = [
    {
      id: 'customer',
      label: t('Customer Credit', 'የደንበኛ ሂሳብ'),
      Icon: Users,
      activeClass:
        'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
    },
    {
      id: 'supplier',
      label: t('Supplier Credit', 'የአቅራቢ ሂሳብ'),
      Icon: Building2,
      activeClass:
        'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
    },
    {
      id: 'delala',
      label: t('Broker Credit', 'የደላላ ሂሳብ'),
      Icon: Handshake,
      activeClass:
        'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
    },
    {
      id: 'stock',
      label: t('Store & Stock', 'መደብርና ክምችት'),
      Icon: Layers,
      activeClass:
        'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
    },
  ]

  const handleTabClick = (tabId: TabType) => {
    setActiveTab(tabId)
    if (onCloseMobile) {
      onCloseMobile()
    }
  }

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isMobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs md:hidden animate-in fade-in duration-200"
          aria-hidden="true"
        />
      )}

      {/* Responsive Sidebar (docked on desktop, slide-out drawer on mobile) */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 h-[100dvh] bg-card border-r border-zinc-200/80 dark:border-zinc-800/80 flex flex-col max-md:overflow-y-auto md:overflow-hidden no-print transition-transform duration-200 ease-in-out md:translate-x-0 ${
          isMobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Brand header */}
        <div className="p-4 border-b border-zinc-100 dark:border-zinc-800/70 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <BookOpen size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-black tracking-tight text-foreground truncate">
                {t('Merkato Ledger', 'መርካቶ የሂሳብ መዝገብ')}
              </p>
              <p className="text-[10px] text-muted-foreground truncate">
                {isAdmin ? t('Central Admin', 'ዋና አስተዳዳሪ') : activeStore?.name || t('Store', 'ሱቅ')}
              </p>
            </div>
          </div>

          {/* Close button on mobile */}
          <button
            type="button"
            onClick={onCloseMobile}
            className="md:hidden p-1 rounded-lg text-muted-foreground hover:text-foreground cursor-pointer"
            title={t('Close menu', 'ዝጋ')}
          >
            <X size={18} />
          </button>
        </div>

        {/* Store selector for Admin */}
        {isAdmin && stores.length > 0 && (
          <div className="px-4 pt-3">
            <label
              htmlFor="sidebar-store"
              className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
            >
              {t('Active Store', 'የተመረጠ ሱቅ')}
            </label>
            <select
              id="sidebar-store"
              value={activeStoreId || 'all'}
              onChange={(event) => setActiveStoreId(event.target.value)}
              className="mt-1 w-full h-8 rounded-xl border border-input bg-background px-2 text-[11px] font-semibold text-foreground cursor-pointer"
            >
              <option value="all">🌐 {t('All Stores (Combined)', 'ሁሉም ሱቆች')}</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Navigation Tabs */}
        <nav className="flex-1 p-3 space-y-1">
          <p className="px-2 pt-1 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {user?.role === 'storekeeper' ? t('Store', 'መደብር') : t('Ledger', 'የሂሳብ መዝገቦች')}
          </p>
          {(user?.role === 'storekeeper'
            ? tabs.filter((t) => t.id === 'stock')
            : tabs
          ).map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabClick(tab.id)}
                className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                  isActive
                    ? `${tab.activeClass} font-semibold shadow-2xs`
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <tab.Icon size={16} className="shrink-0" />
                  <span className="truncate">{tab.label}</span>
                </span>
                <Badge
                  variant="secondary"
                  className="h-4 min-w-4 px-1 text-[10px] font-mono flex items-center justify-center"
                >
                  {tabRecordCounts[tab.id]}
                </Badge>
              </button>
            )
          })}

          {isAdmin && (
            <>
              <p className="px-2 pt-4 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t('Admin', 'አስተዳዳሪ')}
              </p>
              <button
                type="button"
                onClick={() => {
                  setIsAdminPanelOpen(true)
                  onCloseMobile?.()
                }}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
              >
                <Users size={16} className="shrink-0" />
                <span>{t('Storekeepers', 'ሱቅ ጠባቂዎች')}</span>
              </button>
            </>
          )}

          {/* Language Chooser Dropdown */}
          <div className="pt-4 px-1">
            <label
              htmlFor="sidebar-language"
              className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
            >
              {t('Language', 'ቋንቋ')}
            </label>
            <select
              id="sidebar-language"
              value={language}
              onChange={(event) => setLanguage(event.target.value as 'en' | 'am')}
              className="mt-1 w-full h-8 rounded-xl border border-input bg-background px-2 text-[11px] font-semibold text-foreground cursor-pointer"
            >
              <option value="en">🇬🇧 English</option>
              <option value="am">🇪🇹 አማርኛ (Amharic)</option>
            </select>
          </div>
        </nav>

        {/* User Footer */}
        <div className="p-3 border-t border-zinc-100 dark:border-zinc-800/70">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xs font-bold shrink-0">
              {user?.name.slice(0, 1).toUpperCase() || 'A'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold text-foreground truncate">
                {user?.name}
              </p>
              <p className="text-[10px] text-muted-foreground truncate">
                {user?.phone}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void logout()}
              className="w-7 h-7 rounded-lg text-muted-foreground hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center justify-center cursor-pointer"
              title={t('Sign out', 'ውጣ')}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <AdminPanel
        isOpen={isAdminPanelOpen}
        onClose={() => setIsAdminPanelOpen(false)}
      />
    </>
  )
}
