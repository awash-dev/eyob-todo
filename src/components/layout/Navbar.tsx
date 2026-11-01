import { BookOpen, LogOut, Store, Users } from 'lucide-react'
import React, { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { AdminPanel } from '../admin/AdminPanel'

export const Navbar: React.FC = () => {
  const {
    user,
    shops,
    activeShopId,
    setActiveShopId,
    isAdmin,
    logout,
  } = useAuth()
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false)

  return (
    <header className="md:hidden sticky top-0 z-30 w-full bg-card/95 backdrop-blur-sm border-b border-zinc-100/80 dark:border-zinc-800/80 shadow-xs no-print">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Account / shop bar */}
        <div className="flex items-center justify-between gap-2 h-11 border-b border-zinc-100/70 dark:border-zinc-800/60">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
              <BookOpen size={16} />
            </div>
            <span className="text-sm font-black tracking-tight text-foreground">
              Merkato Credit Record
            </span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            {isAdmin && shops.length > 0 && (
              <div className="flex items-center gap-1 min-w-0">
                <Store size={14} className="text-muted-foreground hidden sm:inline" />
                <select
                  value={activeShopId || 'all'}
                  onChange={(event) => setActiveShopId(event.target.value)}
                  className="h-7 max-w-[150px] sm:max-w-[230px] rounded-lg border border-input bg-background px-2 text-[11px] font-semibold text-foreground"
                  title="Select shop or combined view"
                >
                  <option value="all">🌐 All Shops (Combined)</option>
                  {shops.map((shop) => (
                    <option key={shop.id} value={shop.id}>
                      {shop.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {isAdmin && (
              <button
                type="button"
                onClick={() => setIsAdminPanelOpen(true)}
                className="h-7 px-2 rounded-lg bg-muted/60 hover:bg-muted text-[11px] font-semibold text-foreground inline-flex items-center gap-1"
                title="Create and assign shopkeeper accounts"
              >
                <Users size={14} />
                <span className="hidden sm:inline">Shopkeepers</span>
              </button>
            )}

            <div className="hidden md:flex items-center gap-1.5 pl-1.5 border-l border-zinc-200 dark:border-zinc-800">
              <div className="text-right leading-tight">
                <p className="text-[11px] font-semibold text-foreground max-w-[120px] truncate">
                  {user?.name}
                </p>
                <p className="text-[9px] text-muted-foreground max-w-[120px] truncate">
                  {user?.phone}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void logout()}
              className="h-7 w-7 rounded-lg text-muted-foreground hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center justify-center"
              title="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </div>

      <AdminPanel
        isOpen={isAdminPanelOpen}
        onClose={() => setIsAdminPanelOpen(false)}
      />
    </header>
  )
}
