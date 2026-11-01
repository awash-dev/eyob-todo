import { AlertCircle, LogIn, RefreshCw } from 'lucide-react'
import React, { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { Button } from '../ui/button'
import { Input } from '../ui/input'

export const LoginScreen: React.FC = () => {
  const { login, error, clearError } = useAuth()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (isSubmitting) return
    setIsSubmitting(true)
    try {
      await login(phone.trim(), password)
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
          <h1 className="mt-2 text-2xl font-black tracking-tight text-foreground">
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
              Enter your phone number.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-2.5 text-xs text-rose-700 bg-rose-50 dark:bg-rose-950/50 dark:text-rose-300 rounded-lg">
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="login-phone"
              className="text-xs font-semibold text-foreground"
            >
              Phone number
            </label>
            <Input
              id="login-phone"
              type="tel"
              inputMode="tel"
              autoComplete="username"
              placeholder="0911111111"
              value={phone}
              onChange={(event) => {
                setPhone(event.target.value)
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
        </form>

        <p className="text-center text-[10px] text-muted-foreground mt-5">
          Click Ledger · ETB · Existing database preserved
        </p>
      </div>
    </div>
  )
}
