import { Building2, Handshake, Layers, Plus, Users } from 'lucide-react'
import React from 'react'
import { useLedger } from '../../context/LedgerContext'
import { useAuth } from '../../context/AuthContext'
import type { TabType } from '../../types/ledger'

export const MobileBottomNav: React.FC = () => {
  const { activeTab, setActiveTab, tabRecordCounts, openCreateModal } =
    useLedger()
  const { user } = useAuth()

  // Storekeeper handles only stock; bottom navigation is not needed
  if (user?.role === 'shopkeeper') {
    return null
  }

  const tabs: {
    id: TabType
    label: string
    Icon: React.ComponentType<{ size?: number; className?: string }>
  }[] = [
    {
      id: 'customer',
      label: 'Customer',
      Icon: Users,
    },
    {
      id: 'supplier',
      label: 'Supplier',
      Icon: Building2,
    },
    {
      id: 'delala',
      label: 'Delala',
      Icon: Handshake,
    },
    {
      id: 'stock',
      label: 'Stock',
      Icon: Layers,
    },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-md border-t border-zinc-200/80 dark:border-zinc-800/80 shadow-lg md:hidden no-print pb-safe">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id
          const count = tabRecordCounts[tab.id]

          const activeColorClass =
            tab.id === 'customer'
              ? 'text-blue-600 dark:text-blue-400 font-semibold'
              : tab.id === 'supplier'
                ? 'text-blue-600 dark:text-blue-400 font-semibold'
                : tab.id === 'delala'
                  ? 'text-blue-600 dark:text-blue-400 font-semibold'
                  : 'text-blue-600 dark:text-blue-400 font-semibold'

          const activeBadgeClass =
            tab.id === 'customer'
              ? 'bg-blue-600 text-white'
              : tab.id === 'supplier'
                ? 'bg-blue-600 text-white'
                : tab.id === 'delala'
                  ? 'bg-blue-600 text-white'
                  : 'bg-blue-600 text-white'

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex flex-col items-center justify-center min-h-[48px] py-1 transition-all relative ${
                isActive
                  ? activeColorClass
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <div className="relative">
                <tab.Icon
                  size={24}
                  className={`transition-transform ${
                    isActive ? 'scale-110' : ''
                  }`}
                />
                {count > 0 && (
                  <span
                    className={`absolute -top-1 -right-2 text-[9px] font-mono px-1 min-w-[15px] h-[15px] flex items-center justify-center rounded-full leading-none ${
                      isActive
                        ? activeBadgeClass
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </div>
              <span className="text-[11px] mt-0.5 tracking-tight">
                {tab.label}
              </span>
            </button>
          )
        })}

        {/* Quick Add Floating Button on Mobile */}
        <button
          type="button"
          onClick={() => openCreateModal(activeTab)}
          className="flex flex-col items-center justify-center min-h-[48px] py-1 text-blue-600 dark:text-blue-400 hover:text-blue-700 transition-colors"
          title="Add New Entry"
        >
          <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-md active:scale-95 transition-transform">
            <Plus size={24} className="stroke-2" />
          </div>
          <span className="text-[10px] font-semibold mt-0.5">New</span>
        </button>
      </div>
    </nav>
  )
}
