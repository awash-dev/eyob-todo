import React from 'react'
import { useLedger } from '../../context/LedgerContext'
import type { TabType } from '../../types/ledger'
import { Badge } from '../ui/badge'

export const Navbar: React.FC = () => {
  const { activeTab, setActiveTab, tabRecordCounts } = useLedger()

  const tabs: {
    id: TabType
    label: string
    iconName: string
    activeIconName: string
  }[] = [
    {
      id: 'customer',
      label: 'Customer Credit',
      iconName: 'people-outline',
      activeIconName: 'people',
    },
    {
      id: 'supplier',
      label: 'Supplier Credit',
      iconName: 'business-outline',
      activeIconName: 'business',
    },
    {
      id: 'stock',
      label: 'Stock & Inventory',
      iconName: 'layers-outline',
      activeIconName: 'layers',
    },
  ]

  return (
    <header className="sticky top-0 z-30 w-full bg-card/95 backdrop-blur-sm border-b border-zinc-100/80 dark:border-zinc-800/80 shadow-xs no-print">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-center h-14 sm:h-15">
          {/* Centered 3 Tabs with clear identification */}
          <nav className="inline-flex items-center justify-center gap-1 sm:gap-1.5 bg-muted/50 p-1 rounded-xl max-w-full overflow-x-auto ring-1 ring-zinc-950/5 dark:ring-white/5">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id
              const count = tabRecordCounts[tab.id]

              const activeColorClass =
                tab.id === 'customer'
                  ? 'text-emerald-700 dark:text-emerald-300'
                  : tab.id === 'supplier'
                    ? 'text-blue-700 dark:text-blue-300'
                    : 'text-purple-700 dark:text-purple-300'

              const activeBadgeClass =
                tab.id === 'customer'
                  ? 'bg-emerald-600 text-white dark:bg-emerald-500'
                  : tab.id === 'supplier'
                    ? 'bg-blue-600 text-white dark:bg-blue-500'
                    : 'bg-purple-600 text-white dark:bg-purple-500'

              const iconColorClass =
                tab.id === 'customer'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : tab.id === 'supplier'
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-purple-600 dark:text-purple-400'

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-all duration-150 shrink-0 ${
                    isActive
                      ? `bg-card shadow-xs font-semibold ${activeColorClass}`
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/70'
                  }`}
                >
                  <ion-icon
                    name={isActive ? tab.activeIconName : tab.iconName}
                    class={`text-base shrink-0 ${
                      isActive ? iconColorClass : 'text-muted-foreground'
                    }`}
                  ></ion-icon>
                  <span className="whitespace-nowrap">{tab.label}</span>
                  <Badge
                    variant={isActive ? 'default' : 'secondary'}
                    className={`ml-1 px-1.5 py-0 text-[10px] sm:text-[11px] h-4.5 sm:h-5 min-w-4 sm:min-w-5 flex items-center justify-center font-mono ${
                      isActive
                        ? activeBadgeClass
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {count}
                  </Badge>
                </button>
              )
            })}
          </nav>
        </div>
      </div>
    </header>
  )
}
