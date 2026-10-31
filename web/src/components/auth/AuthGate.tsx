import React from 'react'
import { Outlet } from '@tanstack/react-router'
import { useAuth } from '../../context/AuthContext'
import { LoginScreen } from './LoginScreen'

const ShopkeeperWebNotice: React.FC = () => {
  const { user, logout } = useAuth()
  return (
    <div className="min-h-screen bg-zinc-50/70 dark:bg-zinc-950 flex items-center justify-center px-4 py-10 font-sans">
      <div className="w-full max-w-sm text-center bg-card rounded-2xl shadow-sm ring-1 ring-zinc-950/5 dark:ring-white/10 p-6">
        <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300 flex items-center justify-center mx-auto">
          <ion-icon name="phone-portrait-outline" class="text-2xl"></ion-icon>
        </div>
        <h1 className="mt-4 text-lg font-bold text-foreground">
          Use the Android app
        </h1>
        <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
          Shopkeeper accounts work in the Click Ledger Android APK. This web
          screen is reserved for the admin.
        </p>
        {user && (
          <p className="text-[11px] text-muted-foreground mt-3">
            Signed in as <strong>{user.email}</strong>
            {user.shopName ? ` · ${user.shopName}` : ''}
          </p>
        )}
        <button
          type="button"
          onClick={() => void logout()}
          className="mt-5 w-full h-9 rounded-xl bg-primary text-primary-foreground text-xs font-semibold"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}

export const AuthGate: React.FC = () => {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50/70 dark:bg-zinc-950 flex flex-col items-center justify-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-600/20">
          <ion-icon name="book-outline" class="text-2xl"></ion-icon>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ion-icon name="sync-outline" class="text-base animate-spin"></ion-icon>
          <span>Loading your workspace...</span>
        </div>
      </div>
    )
  }

  if (!user) return <LoginScreen />

  if (user.role !== 'admin') return <ShopkeeperWebNotice />

  return <Outlet />
}
