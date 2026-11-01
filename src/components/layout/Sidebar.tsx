import { BookOpen, Building2, Handshake, Layers, LogOut, Users } from 'lucide-react'
import React, { useState } from 'react'
import { useLedger } from '../../context/LedgerContext'
import { useAuth } from '../../context/AuthContext'
import type { TabType } from '../../types/ledger'
import { Badge } from '../ui/badge'
import { AdminPanel } from '../admin/AdminPanel'

export const Sidebar: React.FC = () => {
  const { activeTab, setActiveTab, tabRecordCounts } = useLedger()
  const {
    user,
    shops,
    activeShopId,
    activeShop,
    setActiveShopId,
    isAdmin,
    logout,
  } = useAuth()
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false)

  const tabs: {
    id: TabType
    label: string
    Icon: React.ComponentType<{ size?: number; className?: string }>
    activeClass: string
  }[] = [
    {
      id: 'customer',
      label: 'Customer Credit',
      Icon: Users,
      activeClass:
        'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
    },
    {
      id: 'supplier',
      label: 'Supplier Credit',
      Icon: Building2,
      activeClass:
        'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
    },
    {
      id: 'delala',
      label: 'Delala Credit',
      Icon: Handshake,
      activeClass:
        'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
    },
    {
      id: 'stock',
      label: 'Stock & Inventory',
      Icon: Layers,
      activeClass:
        'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
    },
  ]

  return (
    <>
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-zinc-200/80 dark:border-zinc-800/80 bg-card min-h-screen sticky top-0 h-screen no-print">
        <div className="p-4 border-b border-zinc-100 dark:border-zinc-800/70">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
              <BookOpen size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-black tracking-tight text-foreground">
                Merkato Credit Record
              </p>
              <p className="text-[10px] text-muted-foreground truncate">
                {isAdmin ? 'Central admin' : activeShop?.name || 'Shop'}
              </p>
            </div>
          </div>

          {isAdmin && shops.length > 0 && (
            <div className="mt-3">
              <label
                htmlFor="sidebar-shop"
                className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
              >
                Active shop
              </label>
              <select
                id="sidebar-shop"
                value={activeShopId || ''}
                onChange={(event) => setActiveShopId(event.target.value)}
                className="mt-1 w-full h-8 rounded-lg border border-input bg-background px-2 text-[11px] font-semibold text-foreground"
              >
                {shops.map((shop) => (
                  <option key={shop.id} value={shop.id}>
                    {shop.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          <p className="px-2 pt-1 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {user?.role === 'shopkeeper' ? 'Store' : 'Ledger'}
          </p>
          {(user?.role === 'shopkeeper'
            ? tabs.filter((t) => t.id === 'stock')
            : tabs
          ).map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                  isActive
                    ? `${tab.activeClass} font-semibold`
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
                Admin
              </p>
              <button
                type="button"
                onClick={() => setIsAdminPanelOpen(true)}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
              >
                <Users size={16} className="shrink-0" />
                <span>Shopkeepers</span>
              </button>
            </>
          )}
        </nav>

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
              className="w-7 h-7 rounded-lg text-muted-foreground hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center justify-center"
              title="Sign out"
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
