import { BookOpen, Globe, LogOut, Store, Users } from 'lucide-react'
import React, { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useLanguage } from '../../context/LanguageContext'
import { AdminPanel } from '../admin/AdminPanel'

export const Navbar: React.FC = () => {
  const {
    user,
    stores,
    activeStoreId,
    activeStore,
    setActiveStoreId,
    isAdmin,
    logout,
  } = useAuth()
  const { toggleLanguage, t, isAmharic } = useLanguage()

  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false)


  return (
    <header className="sticky top-0 z-30 w-full bg-card/95 backdrop-blur-sm border-b border-zinc-100/80 dark:border-zinc-800/80 shadow-xs no-print">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        {/* Account / store / settings bar */}
        <div className="flex items-center justify-between gap-2 h-12">
          {/* Left: Mobile Brand / Desktop Context */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <BookOpen size={15} />
            </div>
            <div className="min-w-0">
              <span className="text-xs sm:text-sm font-black tracking-tight text-foreground truncate block">
                {t('Merkato Credit Record', 'መርካቶ የሂሳብ መዝገብ')}
              </span>
              <span className="text-[10px] text-muted-foreground hidden sm:block truncate">
                {isAdmin ? t('Central Admin', 'ዋና አስተዳዳሪ') : activeStore?.name || t('Store', 'ሱቅ')}
              </span>
            </div>
          </div>

          {/* Right: Actions, Store Selector, Language Switcher, Settings & Profile */}
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            {/* Store Selector for Admin */}
            {isAdmin && stores.length > 0 && (
              <div className="flex items-center gap-1 min-w-0">
                <Store size={14} className="text-muted-foreground hidden lg:inline" />
                <select
                  value={activeStoreId || 'all'}
                  onChange={(event) => setActiveStoreId(event.target.value)}
                  className="h-8 max-w-[130px] sm:max-w-[200px] rounded-xl border border-input bg-background px-2 text-[11px] font-semibold text-foreground cursor-pointer"
                  title={t('Select store or combined view', 'ሱቅ ይምረጡ ወይም ሁሉንም ይመልከቱ')}
                >
                  <option value="all">
                    🌐 {t('All Stores (Combined)', 'ሁሉም ሱቆች')}
                  </option>
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Storekeepers Button for Admin */}
            {isAdmin && (
              <button
                type="button"
                onClick={() => setIsAdminPanelOpen(true)}
                className="h-8 px-2.5 rounded-xl bg-muted/60 hover:bg-muted text-[11px] font-semibold text-foreground inline-flex items-center gap-1 cursor-pointer transition-colors"
                title={t('Create and assign storekeeper accounts', 'ሱቅ ጠባቂዎችን ያስተዳድሩ')}
              >
                <Users size={14} />
                <span className="hidden md:inline">{t('Storekeepers', 'ሱቅ ጠባቂዎች')}</span>
              </button>
            )}

            {/* Direct Language Quick Switcher */}
            <button
              type="button"
              onClick={toggleLanguage}
              className="h-8 px-2.5 rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/70 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-950/70 text-blue-700 dark:text-blue-300 text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
              title={t('Switch to Amharic / English', 'ቋንቋ ወደ አማርኛ / English ቀይር')}
            >
              <Globe size={13} className="shrink-0" />
              <span>{isAmharic ? '🇬🇧 English' : '🇪🇹 አማርኛ'}</span>
            </button>

            {/* User Profile Info (Hidden on small mobile) */}
            <div className="hidden lg:flex items-center gap-1.5 pl-1.5 border-l border-zinc-200 dark:border-zinc-800">
              <div className="text-right leading-tight">
                <p className="text-[11px] font-semibold text-foreground max-w-[110px] truncate">
                  {user?.name}
                </p>
                <p className="text-[9px] text-muted-foreground max-w-[110px] truncate">
                  {user?.phone}
                </p>
              </div>
            </div>

            {/* Logout Button */}
            <button
              type="button"
              onClick={() => void logout()}
              className="h-8 w-8 rounded-xl text-muted-foreground hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center justify-center cursor-pointer transition-colors"
              title={t('Sign out', 'ውጣ')}
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Admin Panel Modal */}
      <AdminPanel
        isOpen={isAdminPanelOpen}
        onClose={() => setIsAdminPanelOpen(false)}
      />
    </header>
  )
}
