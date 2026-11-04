import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { AuthUser, Store } from '../types/ledger'
import {
  getMe,
  getStores,
  loadStoredToken,
  login as apiLogin,
  logout as apiLogout,
  onUnauthorized,
  setAuthToken,
} from '../lib/api'

const ACTIVE_STORE_KEY = 'click_active_store'

interface AuthContextType {
  user: AuthUser | null
  stores: Store[]
  activeStoreId: string | null
  activeStore: Store | null
  isAdmin: boolean
  loading: boolean
  error: string | null
  refreshStores: () => Promise<void>
  login: (phone: string, password: string) => Promise<AuthUser>
  logout: () => Promise<void>
  setActiveStoreId: (storeId: string) => void
  clearError: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [stores, setStores] = useState<Store[]>([])
  const [activeStoreId, setActiveStoreIdState] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const applyUser = useCallback(async (nextUser: AuthUser) => {
    setUser(nextUser)
    try {
      const { stores: nextStores } = await getStores()
      setStores(nextStores)

      if (nextUser.role === 'admin') {
        let stored: string | null = null
        try {
          stored = localStorage.getItem(ACTIVE_STORE_KEY)
        } catch {
          stored = null
        }
        const validStored = stored === 'all' || nextStores.some((store) => store.id === stored)
        const nextStoreId = validStored ? stored : 'all'
        setActiveStoreIdState(nextStoreId)
        if (nextStoreId) {
          try {
            localStorage.setItem(ACTIVE_STORE_KEY, nextStoreId)
          } catch {
            // Ignore storage failures.
          }
        }
      } else {
        setActiveStoreIdState(nextUser.storeId)
      }
    } catch (err) {
      // The user is authenticated; store loading can retry later.
      setStores([])
      setActiveStoreIdState(nextUser.storeId)
      console.warn('Could not load stores:', err)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const initialize = async () => {
      if (!loadStoredToken()) {
        setLoading(false)
        return
      }
      try {
        const { user: currentUser } = await getMe()
        if (!cancelled) await applyUser(currentUser)
      } catch {
        setAuthToken(null)
        if (!cancelled) setUser(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void initialize()
    return () => {
      cancelled = true
    }
  }, [applyUser])

  useEffect(() => {
    return onUnauthorized(() => {
      setUser(null)
      setStores([])
      setActiveStoreIdState(null)
      setAuthToken(null)
    })
  }, [])

  const login = useCallback(
    async (phone: string, password: string) => {
      setError(null)
      try {
        const data = await apiLogin(phone, password)
        await applyUser(data.user)
        return data.user
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Unable to sign in'
        setError(message)
        throw err
      }
    },
    [applyUser],
  )

  const logout = useCallback(async () => {
    try {
      await apiLogout()
    } finally {
      setUser(null)
      setStores([])
      setActiveStoreIdState(null)
      setError(null)
    }
  }, [])

  const setActiveStoreId = useCallback(
    (storeId: string) => {
      if (user?.role !== 'admin') return
      if (storeId !== 'all' && !stores.some((store) => store.id === storeId)) return
      setActiveStoreIdState(storeId)
      try {
        localStorage.setItem(ACTIVE_STORE_KEY, storeId)
      } catch {
        // Ignore storage failures.
      }
    },
    [stores, user],
  )

  const clearError = useCallback(() => setError(null), [])

  const refreshStores = useCallback(async () => {
    try {
      const { stores: nextStores } = await getStores()
      setStores(nextStores)
    } catch {
      // ignore
    }
  }, [])

  const activeStore = useMemo(
    () => {
      if (activeStoreId === 'all') {
        return {
          id: 'all',
          name: 'All Stores (Combined)',
          code: 'ALL',
        } as Store
      }
      return stores.find((store) => store.id === activeStoreId) ?? null
    },
    [stores, activeStoreId],
  )

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      stores,
      activeStoreId,
      activeStore,
      isAdmin: user?.role === 'admin',
      loading,
      error,
      refreshStores,
      login,
      logout,
      setActiveStoreId,
      clearError,
    }),
    [
      user,
      stores,
      activeStoreId,
      activeStore,
      loading,
      error,
      refreshStores,
      login,
      logout,
      setActiveStoreId,
      clearError,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

const fallbackAuthContext: AuthContextType = {
  user: null,
  stores: [],
  activeStoreId: null,
  activeStore: null,
  isAdmin: false,
  loading: true,
  error: null,
  refreshStores: async () => {},
  login: async () => { throw new Error('AuthProvider not ready') },
  logout: async () => {},
  setActiveStoreId: () => {},
  clearError: () => {},
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (!context) {
    return fallbackAuthContext
  }
  return context
}
