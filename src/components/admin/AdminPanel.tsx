import { CirclePlus, CircleX, RefreshCw, Store, Trash2, Users } from 'lucide-react'
import React, { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import type { Storekeeper } from '../../lib/api'
import {
  createUser,
  getUsers,
  updateUser,
  deleteUser,
  createStore,
  deleteStore,
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
  phone: '',
  password: '',
  storeId: '',
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ isOpen, onClose }) => {
  const { stores, refreshStores, activeStoreId, setActiveStoreId } = useAuth()
  const [users, setUsers] = useState<Storekeeper[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // New Store Site State
  const [showNewStore, setShowNewStore] = useState(false)
  const [newStoreName, setNewStoreName] = useState('')
  const [savingStore, setSavingStore] = useState(false)

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

  const handleDeleteUser = async (user: Storekeeper) => {
    if (
      !window.confirm(
        `Are you sure you want to permanently delete storekeeper "${user.name}" (${user.phone || 'no phone'})?`,
      )
    ) {
      return
    }
    setError(null)
    setMessage(null)
    try {
      await deleteUser(user.id)
      setUsers((prev) => prev.filter((item) => item.id !== user.id))
      setMessage(`Storekeeper account "${user.name}" deleted`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete storekeeper')
    }
  }

  const handleDeleteStore = async (store: { id: string; name: string }) => {
    if (stores.length <= 1) {
      setError('Cannot delete the only remaining store site')
      return
    }
    if (
      !window.confirm(
        `Are you sure you want to delete store site "${store.name}"? Records belonging to this store will also be removed.`,
      )
    ) {
      return
    }
    setError(null)
    setMessage(null)
    try {
      await deleteStore(store.id)
      await refreshStores()
      if (activeStoreId === store.id) {
        const remaining = stores.filter((s) => s.id !== store.id)
        if (remaining[0]) setActiveStoreId(remaining[0].id)
      }
      setMessage(`Store site "${store.name}" deleted`)
      await loadUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete store site')
    }
  }

  useEffect(() => {
    if (!isOpen) return
    setMessage(null)
    setError(null)
    setForm((prev) => ({
      ...prev,
      storeId: prev.storeId || stores[0]?.id || '',
    }))
    void loadUsers()
  }, [isOpen, loadUsers, stores])

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      await createUser(form)
      setMessage(`Storekeeper account created for ${form.name.trim()}`)
      setForm({ ...emptyForm, storeId: stores[0]?.id || '' })
      await loadUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create account')
    } finally {
      setSaving(false)
    }
  }

  const handleCreateStore = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!newStoreName.trim()) return
    setSavingStore(true)
    setError(null)
    setMessage(null)
    try {
      const { store } = await createStore(newStoreName.trim())
      await refreshStores()
      setForm((prev) => ({ ...prev, storeId: store.id }))
      setNewStoreName('')
      setShowNewStore(false)
      setMessage(`New store site "${store.name}" created and assigned!`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create store site')
    } finally {
      setSavingStore(false)
    }
  }

  const handleStoreChange = async (user: Storekeeper, storeId: string) => {
    setError(null)
    setMessage(null)
    try {
      const { user: updated } = await updateUser(user.id, { storeId })
      setUsers((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item)),
      )
      setMessage(`${updated.name} assigned to ${updated.storeName || storeId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update account')
    }
  }

  const handleActiveToggle = async (user: Storekeeper) => {
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
            <span>Admin Storekeepers &amp; Store Sites</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Manage your storekeeper accounts and add new retail store sites.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="mt-2 p-2.5 text-xs text-rose-700 bg-rose-50 dark:bg-rose-950/50 dark:text-rose-300 rounded-lg">
            {error}
          </div>
        )}
        {message && (
          <div className="mt-2 p-2.5 text-xs text-blue-700 bg-blue-50 dark:bg-blue-950/50 dark:text-blue-300 rounded-lg">
            {message}
          </div>
        )}

        {/* Existing Store Sites Summary */}
        <div className="mt-3 p-3 rounded-xl bg-card border border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Current Store Sites ({stores.length})
            </span>
            <button
              type="button"
              onClick={() => setShowNewStore(!showNewStore)}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              {showNewStore ? (
                <CircleX size={14} />
              ) : (
                <CirclePlus size={14} />
              )}
              <span>{showNewStore ? 'Cancel' : '+ Add New Store Site'}</span>
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {stores.map((s) => (
              <span
                key={s.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-muted/60 text-foreground border border-zinc-200/80 dark:border-zinc-800"
              >
                <Store size={12} className="text-blue-600" />
                <span>{s.name}</span>
                {stores.length > 1 && (
                  <button
                    type="button"
                    onClick={() => void handleDeleteStore(s)}
                    className="text-muted-foreground hover:text-rose-600 p-0.5 rounded cursor-pointer transition-colors"
                    title={`Delete store site ${s.name}`}
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </span>
            ))}
          </div>

          {/* New Store Site Form */}
          {showNewStore && (
            <form onSubmit={handleCreateStore} className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center gap-2">
              <Input
                placeholder="New Store Name (e.g. Store 3 - Piassa)"
                value={newStoreName}
                onChange={(e) => setNewStoreName(e.target.value)}
                required
                className="h-8 text-xs bg-background flex-1"
                autoFocus
              />
              <Button
                type="submit"
                size="sm"
                disabled={savingStore}
                className="h-8 px-3 text-xs bg-blue-600 hover:bg-blue-700 text-white shrink-0"
              >
                {savingStore ? 'Adding...' : 'Add Site'}
              </Button>
            </form>
          )}
        </div>

        {/* Create Storekeeper Account */}
        <form
          onSubmit={handleCreate}
          className="mt-3 p-3 rounded-xl bg-muted/30 ring-1 ring-zinc-950/5 dark:ring-white/10 space-y-2.5"
        >
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Create New Storekeeper
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
              type="tel"
              inputMode="tel"
              placeholder="Phone number (e.g. 0911111111)"
              value={form.phone}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, phone: event.target.value }))
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
              value={form.storeId}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, storeId: event.target.value }))
              }
              required
              className="h-9 rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="">Assign to Store Site...</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end">
            <Button
              type="submit"
              size="sm"
              disabled={saving}
              className="text-xs h-8 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
            >
              {saving ? 'Creating...' : 'Create Account'}
            </Button>
          </div>
        </form>

        {/* Existing Storekeepers List */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Current Storekeepers ({users.length})
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
              No storekeeper accounts yet.
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
                      {u.phone || 'No phone'}
                    </p>
                  </div>
                  <select
                    value={u.storeId || ''}
                    onChange={(event) =>
                      void handleStoreChange(u, event.target.value)
                    }
                    className="h-8 rounded-md border border-input bg-background px-2 text-[11px]"
                  >
                    {stores.map((store) => (
                      <option key={store.id} value={store.id}>
                        {store.name}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleActiveToggle(u)}
                      className={`h-8 px-2.5 rounded-md text-[11px] font-semibold cursor-pointer ${
                        u.active
                          ? 'bg-blue-50 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300'
                          : 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300'
                      }`}
                    >
                      {u.active ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteUser(u)}
                      className="h-8 px-2 rounded-md text-[11px] font-semibold cursor-pointer bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/50 flex items-center gap-1"
                      title={`Delete storekeeper ${u.name}`}
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
