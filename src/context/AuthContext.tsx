import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { AuthUser, Shop } from '../types/ledger'
import {
  getMe,
  getShops,
  loadStoredToken,
  login as apiLogin,
  logout as apiLogout,
  onUnauthorized,
  setAuthToken,
} from '../lib/api'

const ACTIVE_SHOP_KEY = 'click_active_shop'

interface AuthContextType {
  user: AuthUser | null
  shops: Shop[]
  activeShopId: string | null
  activeShop: Shop | null
  isAdmin: boolean
  loading: boolean
  error: string | null
  refreshShops: () => Promise<void>
  login: (phone: string, password: string) => Promise<AuthUser>
  logout: () => Promise<void>
  setActiveShopId: (shopId: string) => void
  clearError: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [shops, setShops] = useState<Shop[]>([])
  const [activeShopId, setActiveShopIdState] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const applyUser = useCallback(async (nextUser: AuthUser) => {
    setUser(nextUser)
    try {
      const { shops: nextShops } = await getShops()
      setShops(nextShops)

      if (nextUser.role === 'admin') {
        let stored: string | null = null
        try {
          stored = localStorage.getItem(ACTIVE_SHOP_KEY)
        } catch {
          stored = null
        }
        const validStored = stored === 'all' || nextShops.some((shop) => shop.id === stored)
        const nextShopId = validStored ? stored : 'all'
        setActiveShopIdState(nextShopId)
        if (nextShopId) {
          try {
            localStorage.setItem(ACTIVE_SHOP_KEY, nextShopId)
          } catch {
            // Ignore storage failures.
          }
        }
      } else {
        setActiveShopIdState(nextUser.shopId)
      }
    } catch (err) {
      // The user is authenticated; shop loading can retry later.
      setShops([])
      setActiveShopIdState(nextUser.shopId)
      console.warn('Could not load shops:', err)
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
      setShops([])
      setActiveShopIdState(null)
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
      setShops([])
      setActiveShopIdState(null)
      setError(null)
    }
  }, [])

  const setActiveShopId = useCallback(
    (shopId: string) => {
      if (user?.role !== 'admin') return
      if (shopId !== 'all' && !shops.some((shop) => shop.id === shopId)) return
      setActiveShopIdState(shopId)
      try {
        localStorage.setItem(ACTIVE_SHOP_KEY, shopId)
      } catch {
        // Ignore storage failures.
      }
    },
    [shops, user],
  )

  const clearError = useCallback(() => setError(null), [])

  const refreshShops = useCallback(async () => {
    try {
      const { shops: nextShops } = await getShops()
      setShops(nextShops)
    } catch {
      // ignore
    }
  }, [])

  const activeShop = useMemo(
    () => {
      if (activeShopId === 'all') {
        return {
          id: 'all',
          name: 'All Shops (Combined)',
          code: 'ALL',
        } as Shop
      }
      return shops.find((shop) => shop.id === activeShopId) ?? null
    },
    [shops, activeShopId],
  )

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      shops,
      activeShopId,
      activeShop,
      isAdmin: user?.role === 'admin',
      loading,
      error,
      refreshShops,
      login,
      logout,
      setActiveShopId,
      clearError,
    }),
    [
      user,
      shops,
      activeShopId,
      activeShop,
      loading,
      error,
      refreshShops,
      login,
      logout,
      setActiveShopId,
      clearError,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
