import { BookOpen, RefreshCw } from 'lucide-react'
import React from 'react'
import { Outlet } from '@tanstack/react-router'
import { useAuth } from '../../context/AuthContext'
import { LoginScreen } from './LoginScreen'

export const AuthGate: React.FC = () => {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50/70 dark:bg-zinc-950 flex flex-col items-center justify-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-600/20">
          <BookOpen size={24} />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <RefreshCw size={16} className="animate-spin" />
          <span>Loading your workspace...</span>
        </div>
      </div>
    )
  }

  if (!user) return <LoginScreen />

  return <Outlet />
}
