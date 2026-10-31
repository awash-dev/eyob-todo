import { CirclePlus, CircleX, RefreshCw, Store, Trash2, Users } from 'lucide-react'
import React, { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import type { Shopkeeper } from '../../lib/api'
import {
  createUser,
  getUsers,
  updateUser,
  deleteUser,
  createShop,
  deleteShop,
} from '../../lib/api'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'

interface AdminPanelProps {
  isOpen: boolean
  onClose: () => void
}

const emptyForm = {
  name: '',
  email: '',
  password: '',
  shopId: '',
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ isOpen, onClose }) => {
  const { shops, refreshShops, activeShopId, setActiveShopId } = useAuth()
  const [users, setUsers] = useState<Shopkeeper[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // New Shop Site State
  const [showNewShop, setShowNewShop] = useState(false)
  const [newShopName, setNewShopName] = useState('')
  const [savingShop, setSavingShop] = useState(false)

  const loadUsers = useCallback(async () => {
    setLoading(true)
    try {
      const { users: nextUsers } = await getUsers()
      setUsers(nextUsers)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load accounts')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleDeleteUser = async (user: Shopkeeper) => {
    if (
      !window.confirm(
        `Are you sure you want to permanently delete shopkeeper "${user.name}" (${user.email})?`,
      )
    ) {
      return
    }
    setError(null)
    setMessage(null)
    try {
      await deleteUser(user.id)
      setUsers((prev) => prev.filter((item) => item.id !== user.id))
      setMessage(`Shopkeeper account "${user.name}" deleted`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete shopkeeper')
    }
  }

  const handleDeleteShop = async (shop: { id: string; name: string }) => {
    if (shops.length <= 1) {
      setError('Cannot delete the only remaining shop site')
      return
    }
    if (
      !window.confirm(
        `Are you sure you want to delete shop site "${shop.name}"? Records belonging to this shop will also be removed.`,
      )
    ) {
      return
    }
    setError(null)
    setMessage(null)
    try {
      await deleteShop(shop.id)
      await refreshShops()
      if (activeShopId === shop.id) {
        const remaining = shops.filter((s) => s.id !== shop.id)
        if (remaining[0]) setActiveShopId(remaining[0].id)
      }
      setMessage(`Shop site "${shop.name}" deleted`)
      await loadUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete shop site')
    }
  }

  useEffect(() => {
    if (!isOpen) return
    setMessage(null)
    setError(null)
    setForm((prev) => ({
      ...prev,
      shopId: prev.shopId || shops[0]?.id || '',
    }))
    void loadUsers()
  }, [isOpen, loadUsers, shops])

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      await createUser(form)
      setMessage(`Shopkeeper account created for ${form.name.trim()}`)
      setForm({ ...emptyForm, shopId: shops[0]?.id || '' })
      await loadUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create account')
    } finally {
      setSaving(false)
    }
  }

  const handleCreateShop = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!newShopName.trim()) return
    setSavingShop(true)
    setError(null)
    setMessage(null)
    try {
      const { shop } = await createShop(newShopName.trim())
      await refreshShops()
      setForm((prev) => ({ ...prev, shopId: shop.id }))
      setNewShopName('')
      setShowNewShop(false)
      setMessage(`New shop site "${shop.name}" created and assigned!`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create shop site')
    } finally {
      setSavingShop(false)
    }
  }

  const handleShopChange = async (user: Shopkeeper, shopId: string) => {
    setError(null)
    setMessage(null)
    try {
      const { user: updated } = await updateUser(user.id, { shopId })
      setUsers((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item)),
      )
      setMessage(`${updated.name} assigned to ${updated.shopName || shopId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update account')
    }
  }

  const handleActiveToggle = async (user: Shopkeeper) => {
    setError(null)
    setMessage(null)
    try {
      const { user: updated } = await updateUser(user.id, {
        active: !user.active,
      })
      setUsers((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item)),
      )
      setMessage(
        `${updated.name} ${updated.active ? 'enabled' : 'disabled'}`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update account')
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto sm:rounded-2xl p-4 sm:p-6">
        <DialogHeader className="text-left">
          <DialogTitle className="text-lg font-bold flex items-center gap-2">
            <Users size={20} className="text-primary" />
            <span>Admin Shopkeepers &amp; Shop Sites</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Manage your shopkeeper accounts and add new retail shop sites.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="mt-2 p-2.5 text-xs text-rose-700 bg-rose-50 dark:bg-rose-950/50 dark:text-rose-300 rounded-lg">
            {error}
          </div>
        )}
        {message && (
          <div className="mt-2 p-2.5 text-xs text-emerald-700 bg-emerald-50 dark:bg-emerald-950/50 dark:text-emerald-300 rounded-lg">
            {message}
          </div>
        )}

        {/* Existing Shop Sites Summary */}
        <div className="mt-3 p-3 rounded-xl bg-card border border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Current Shop Sites ({shops.length})
            </span>
            <button
              type="button"
              onClick={() => setShowNewShop(!showNewShop)}
              className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              {showNewShop ? (
                <CircleX size={14} />
              ) : (
                <CirclePlus size={14} />
              )}
              <span>{showNewShop ? 'Cancel' : '+ Add New Shop Site'}</span>
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {shops.map((s) => (
              <span
                key={s.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-muted/60 text-foreground border border-zinc-200/80 dark:border-zinc-800"
              >
                <Store size={12} className="text-emerald-600" />
                <span>{s.name}</span>
                {shops.length > 1 && (
                  <button
                    type="button"
                    onClick={() => void handleDeleteShop(s)}
                    className="text-muted-foreground hover:text-rose-600 p-0.5 rounded cursor-pointer transition-colors"
                    title={`Delete shop site ${s.name}`}
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </span>
            ))}
          </div>

          {/* New Shop Site Form */}
          {showNewShop && (
            <form onSubmit={handleCreateShop} className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center gap-2">
              <Input
                placeholder="New Shop Name (e.g. Shop 3 - Piassa)"
                value={newShopName}
                onChange={(e) => setNewShopName(e.target.value)}
                required
                className="h-8 text-xs bg-background flex-1"
                autoFocus
              />
              <Button
                type="submit"
                size="sm"
                disabled={savingShop}
                className="h-8 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
              >
                {savingShop ? 'Adding...' : 'Add Site'}
              </Button>
            </form>
          )}
        </div>

        {/* Create Shopkeeper Account */}
        <form
          onSubmit={handleCreate}
          className="mt-3 p-3 rounded-xl bg-muted/30 ring-1 ring-zinc-950/5 dark:ring-white/10 space-y-2.5"
        >
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Create New Shopkeeper
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Input
              placeholder="Full name"
              value={form.name}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, name: event.target.value }))
              }
              required
              className="h-9 text-xs bg-background"
            />
            <Input
              type="email"
              placeholder="Email address"
              value={form.email}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, email: event.target.value }))
              }
              required
              className="h-9 text-xs bg-background"
            />
            <Input
              type="password"
              placeholder="Password (min 6 chars)"
              value={form.password}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, password: event.target.value }))
              }
              required
              minLength={6}
              className="h-9 text-xs bg-background"
            />
            <select
              value={form.shopId}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, shopId: event.target.value }))
              }
              required
              className="h-9 rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="">Assign to Shop Site...</option>
              {shops.map((shop) => (
                <option key={shop.id} value={shop.id}>
                  {shop.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end">
            <Button
              type="submit"
              size="sm"
              disabled={saving}
              className="text-xs h-8 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {saving ? 'Creating...' : 'Create Account'}
            </Button>
          </div>
        </form>

        {/* Existing Shopkeepers List */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Current Shopkeepers ({users.length})
            </p>
            <button
              type="button"
              onClick={() => void loadUsers()}
              className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw size={14} />
              Refresh
            </button>
          </div>

          {loading ? (
            <p className="text-xs text-muted-foreground py-4 text-center">
              Loading accounts...
            </p>
          ) : users.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">
              No shopkeeper accounts yet.
            </p>
          ) : (
            <div className="space-y-2">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="p-2.5 rounded-xl bg-card ring-1 ring-zinc-950/5 dark:ring-white/10 flex flex-col sm:flex-row sm:items-center gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-foreground truncate">
                      {u.name}
                      {!u.active && (
                        <span className="ml-1.5 text-[10px] text-rose-600 font-bold">
                          [Disabled]
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {u.email}
                    </p>
                  </div>
                  <select
                    value={u.shopId || ''}
                    onChange={(event) =>
                      void handleShopChange(u, event.target.value)
                    }
                    className="h-8 rounded-md border border-input bg-background px-2 text-[11px]"
                  >
                    {shops.map((shop) => (
                      <option key={shop.id} value={shop.id}>
                        {shop.name}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleActiveToggle(u)}
                      className={`h-8 px-2.5 rounded-md text-[11px] font-semibold cursor-pointer ${
                        u.active
                          ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
                          : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                      }`}
                    >
                      {u.active ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteUser(u)}
                      className="h-8 px-2 rounded-md text-[11px] font-semibold cursor-pointer bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/50 flex items-center gap-1"
                      title={`Delete shopkeeper ${u.name}`}
                    >
                      <Trash2 size={13} />
                      <span className="hidden sm:inline">Delete</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
