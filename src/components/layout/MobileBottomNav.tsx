import React from 'react'
import { useLedger } from '../../context/LedgerContext'
import type { TabType } from '../../types/ledger'
import { Badge } from '../ui/badge'

export const MobileBottomNav: React.FC = () => {
  const { activeTab, setActiveTab, tabRecordCounts, openCreateModal } =
    useLedger()

  const tabs: {
    id: TabType
    label: string
    iconName: string
    activeIconName: string
  }[] = [
    {
      id: 'customer',
      label: 'Customer',
      iconName: 'people-outline',
      activeIconName: 'people',
    },
    {
      id: 'supplier',
      label: 'Supplier',
      iconName: 'business-outline',
      activeIconName: 'business',
    },
    {
      id: 'stock',
      label: 'Stock',
      iconName: 'layers-outline',
      activeIconName: 'layers',
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
              ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
              : tab.id === 'supplier'
                ? 'text-blue-600 dark:text-blue-400 font-semibold'
                : 'text-purple-600 dark:text-purple-400 font-semibold'

          const activeBadgeClass =
            tab.id === 'customer'
              ? 'bg-emerald-600 text-white'
              : tab.id === 'supplier'
                ? 'bg-blue-600 text-white'
                : 'bg-purple-600 text-white'

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
                <ion-icon
                  name={isActive ? tab.activeIconName : tab.iconName}
                  class={`text-2xl transition-transform ${
                    isActive ? 'scale-110' : ''
                  }`}
                ></ion-icon>
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
          className="flex flex-col items-center justify-center min-h-[48px] py-1 text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 transition-colors"
          title="Add New Entry"
        >
          <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-md active:scale-95 transition-transform">
            <ion-icon name="add-outline" class="text-2xl stroke-2"></ion-icon>
          </div>
          <span className="text-[10px] font-semibold mt-0.5">New</span>
        </button>
      </div>
    </nav>
  )
}
