import { AlertCircle, BookOpen, LogIn, RefreshCw, ShieldCheck } from 'lucide-react'
import React, { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { Button } from '../ui/button'
import { Input } from '../ui/input'

export const LoginScreen: React.FC = () => {
  const { login, error, clearError } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (isSubmitting) return
    setIsSubmitting(true)
    try {
      await login(email.trim(), password)
    } catch {
      // Error is shown from auth context.
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50/70 dark:bg-zinc-950 flex items-center justify-center px-4 py-10 font-sans">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-emerald-600 text-white flex items-center justify-center mx-auto shadow-lg shadow-emerald-600/20">
            <BookOpen size={30} />
          </div>
          <h1 className="mt-4 text-2xl font-black tracking-tight text-foreground">
            Merkato Credit Record
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Customer &amp; supplier credit and stock ledger
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-card rounded-2xl shadow-sm ring-1 ring-zinc-950/5 dark:ring-white/10 p-5 sm:p-6 space-y-4"
        >
          <div>
            <h2 className="text-base font-bold text-foreground">Sign in</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Use the account provided by your admin.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-2.5 text-xs text-rose-700 bg-rose-50 dark:bg-rose-950/50 dark:text-rose-300 rounded-lg">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="login-email"
              className="text-xs font-semibold text-foreground"
            >
              Email
            </label>
            <Input
              id="login-email"
              type="email"
              autoComplete="username"
              placeholder="you@click.et"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
                if (error) clearError()
              }}
              required
              autoFocus
              className="h-10 text-sm bg-muted/30 focus:bg-background rounded-lg border-0 ring-1 ring-zinc-950/10 dark:ring-white/10"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="login-password"
              className="text-xs font-semibold text-foreground"
            >
              Password
            </label>
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value)
                if (error) clearError()
              }}
              required
              className="h-10 text-sm bg-muted/30 focus:bg-background rounded-lg border-0 ring-1 ring-zinc-950/10 dark:ring-white/10"
            />
          </div>

          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-10 text-sm font-semibold rounded-xl shadow-xs flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <RefreshCw size={16} className="animate-spin" />
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <LogIn size={16} />
                <span>Sign in</span>
              </>
            )}
          </Button>

          <div className="flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground pt-1">
            <ShieldCheck size={12} />
            <span>Shop data is protected on the server</span>
          </div>
        </form>

        {import.meta.env.DEV && (
          <details className="mt-4 text-[11px] text-muted-foreground bg-card/60 rounded-xl p-3 ring-1 ring-zinc-950/5 dark:ring-white/10">
            <summary className="cursor-pointer font-semibold">
              Test accounts (development only)
            </summary>
            <div className="mt-2 space-y-1 font-mono">
              <p>Admin: admin@click.et / Admin@123</p>
              <p>Shop 1: shop1@click.et / Shop@123</p>
              <p>Shop 2: shop2@click.et / Shop@123</p>
            </div>
          </details>
        )}

        <p className="text-center text-[10px] text-muted-foreground mt-5">
          Click Ledger · ETB · Existing database preserved
        </p>
      </div>
    </div>
  )
}
