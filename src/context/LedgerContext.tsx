import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react'
import type {
  CurrencyCode,
  LedgerRecord,
  RateMode,
  SyncStatus,
  TabType,
} from '../types/ledger'
import { INITIAL_LEDGER_DATA } from '../data/initialData'
import { formatCurrency as formatCurrencyHelper } from '../lib/formatters'
import {
  fetchRecordsFromNeon,
  saveRecordToNeon,
  deleteRecordFromNeon,
  fetchSettingsFromNeon,
  saveSettingToNeon,
  getSql,
} from '../lib/neonClient'

const STORAGE_KEY = 'eyoba_ledger_records_v1'
const CURRENCY_STORAGE_KEY = 'eyoba_ledger_currency_v2'
const RATE_MODE_STORAGE_KEY = 'eyoba_ledger_rate_mode_v2'
const BLACK_RATE_STORAGE_KEY = 'eyoba_ledger_black_rate_v2'
const BANK_RATE_STORAGE_KEY = 'eyoba_ledger_bank_rate_v2'

interface ToastState {
  id: number
  message: string
  type: 'success' | 'info' | 'error'
}

interface LedgerContextType {
  records: LedgerRecord[]
  activeTab: TabType
  setActiveTab: (tab: TabType) => void
  currency: CurrencyCode
  setCurrency: (c: CurrencyCode) => void
  rateMode: RateMode
  setRateMode: (mode: RateMode) => void
  blackMarketRate: number
  setBlackMarketRate: (rate: number) => void
  bankRate: number
  setBankRate: (rate: number) => void
  usdtRate: number
  setUsdtRate: (rate: number) => void
  formatCurrency: (amount: number) => string
  searchQuery: string
  setSearchQuery: (query: string) => void
  syncStatus: SyncStatus
  lastSyncedAt: Date | null
  syncWithNeon: () => Promise<void>
  isModalOpen: boolean
  modalMode: 'create' | 'edit'
  editingRecord: LedgerRecord | null
  openCreateModal: (defaultTab?: TabType) => void
  openEditModal: (record: LedgerRecord) => void
  closeModal: () => void
  addRecord: (
    record: Omit<LedgerRecord, 'id' | 'createdAt' | 'updatedAt'>,
  ) => void
  updateRecord: (
    id: string,
    updates: Partial<Omit<LedgerRecord, 'id' | 'createdAt'>>,
  ) => void
  deleteRecord: (id: string) => void
  resetToDemo: () => void
  clearAll: () => void
  importRecords: (imported: LedgerRecord[]) => boolean
  currentTabRecords: LedgerRecord[]
  filteredRecords: LedgerRecord[]
  tabRecordCounts: Record<TabType, number>
  toasts: ToastState[]
  showToast: (message: string, type?: 'success' | 'info' | 'error') => void
  removeToast: (id: number) => void
}

const LedgerContext = createContext<LedgerContextType | undefined>(undefined)

export const LedgerProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [records, setRecords] = useState<LedgerRecord[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) {
          const hasKelil = parsed.some((r) => r.id === 'stock-kelil-aginbi')
          if (!hasKelil) {
            const stockSamples = INITIAL_LEDGER_DATA.filter(
              (r) => r.type === 'stock',
            )
            const nonStock = parsed.filter((r) => r.type !== 'stock')
            return [...stockSamples, ...nonStock]
          }
          return parsed
        }
      }
    } catch (e) {
      console.error('Failed to parse records from localStorage:', e)
    }
    return INITIAL_LEDGER_DATA
  })

  // Currency state: defaults to ETB
  const [currency, setCurrencyState] = useState<CurrencyCode>(() => {
    try {
      const saved = localStorage.getItem(CURRENCY_STORAGE_KEY)
      if (
        saved === 'ETB' ||
        saved === 'USD' ||
        saved === 'EUR' ||
        saved === 'GBP'
      ) {
        return saved
      }
    } catch (e) {
      console.error('Failed to parse currency from localStorage:', e)
    }
    return 'ETB'
  })

  // Rate mode state: 'black_market' (default 195–200) vs 'bank' (168–175)
  const [rateMode, setRateModeState] = useState<RateMode>(() => {
    try {
      const saved = localStorage.getItem(RATE_MODE_STORAGE_KEY)
      if (saved === 'black_market' || saved === 'bank') {
        return saved
      }
    } catch (e) {
      console.error('Failed to parse rateMode from localStorage:', e)
    }
    return 'black_market'
  })

  // Manual Black Market rate: defaults to 198 ETB
  const [blackMarketRate, setBlackMarketRateState] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(BLACK_RATE_STORAGE_KEY)
      if (saved && !isNaN(Number(saved)) && Number(saved) > 0) {
        return Number(saved)
      }
    } catch (e) {
      console.error('Failed to parse blackMarketRate from localStorage:', e)
    }
    return 198
  })

  // Manual Bank rate: defaults to 172 ETB
  const [bankRate, setBankRateState] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(BANK_RATE_STORAGE_KEY)
      if (saved && !isNaN(Number(saved)) && Number(saved) > 0) {
        return Number(saved)
      }
    } catch (e) {
      console.error('Failed to parse bankRate from localStorage:', e)
    }
    return 172
  })

  // Active rate based on mode
  const usdtRate = rateMode === 'black_market' ? blackMarketRate : bankRate

  const [activeTab, setActiveTab] = useState<TabType>('customer')
  const [searchQuery, setSearchQuery] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
  const [editingRecord, setEditingRecord] = useState<LedgerRecord | null>(null)
  const [toasts, setToasts] = useState<ToastState[]>([])

  const [syncStatus, setSyncStatus] = useState<SyncStatus>('syncing')
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)

  // Real-time synchronization with Neon PostgreSQL
  const syncWithNeon = useCallback(async () => {
    try {
      setSyncStatus('syncing')
      // 1. Fetch records from Neon
      const dbRecords = await fetchRecordsFromNeon()
      if (dbRecords.length > 0) {
        setRecords(dbRecords)
      } else {
        // First-time sync: seed Neon with initial records
        setRecords(INITIAL_LEDGER_DATA)
        for (const r of INITIAL_LEDGER_DATA) {
          await saveRecordToNeon(r)
        }
      }

      // 2. Fetch shared settings from Neon
      const settings = await fetchSettingsFromNeon()
      if (settings.currency) setCurrencyState(settings.currency)
      if (settings.rateMode) setRateModeState(settings.rateMode)
      if (settings.blackMarketRate)
        setBlackMarketRateState(settings.blackMarketRate)
      if (settings.bankRate) setBankRateState(settings.bankRate)

      setSyncStatus('synced')
      setLastSyncedAt(new Date())
    } catch (err) {
      console.warn('Neon real-time sync notice (offline mode active):', err)
      setSyncStatus('offline')
    }
  }, [])

  // Initial load from Neon and background live sync
  useEffect(() => {
    syncWithNeon()

    // Background live check every 25 seconds for multi-tab / multi-user updates
    const interval = setInterval(() => {
      fetchRecordsFromNeon()
        .then((dbRecords) => {
          if (dbRecords.length > 0) {
            setRecords(dbRecords)
            setSyncStatus('synced')
            setLastSyncedAt(new Date())
          }
        })
        .catch(() => {
          setSyncStatus('offline')
        })
    }, 25000)

    return () => clearInterval(interval)
  }, [syncWithNeon])

  // Save records to localStorage as offline cache
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
    } catch (e) {
      console.error('Failed to save to localStorage:', e)
    }
  }, [records])

  // Save currency to localStorage & Neon
  const setCurrency = (newCurrency: CurrencyCode) => {
    setCurrencyState(newCurrency)
    try {
      localStorage.setItem(CURRENCY_STORAGE_KEY, newCurrency)
    } catch (e) {
      console.error('Failed to save currency to localStorage:', e)
    }
    showToast(`Currency changed to ${newCurrency}`, 'info')
    saveSettingToNeon('currency', newCurrency).catch(() => {})
  }

  // Switch rate mode (Black vs Bank) & sync with Neon
  const setRateMode = (mode: RateMode) => {
    setRateModeState(mode)
    try {
      localStorage.setItem(RATE_MODE_STORAGE_KEY, mode)
    } catch (e) {
      console.error('Failed to save rateMode to localStorage:', e)
    }
    const rate = mode === 'black_market' ? blackMarketRate : bankRate
    const label =
      mode === 'black_market' ? 'Black Market Rate' : 'Official Bank Rate'
    showToast(`Switched to ${label}: 1 USDT = ${rate} ETB`, 'info')
    saveSettingToNeon('rate_mode', mode).catch(() => {})
  }

  // Set manual black market rate & sync with Neon
  const setBlackMarketRate = (newRate: number) => {
    const validRate = Math.max(1, newRate)
    setBlackMarketRateState(validRate)
    try {
      localStorage.setItem(BLACK_RATE_STORAGE_KEY, String(validRate))
    } catch (e) {
      console.error('Failed to save blackMarketRate to localStorage:', e)
    }
    if (rateMode === 'black_market') {
      showToast(`Black market rate set: 1 USDT = ${validRate} ETB`, 'success')
    }
    saveSettingToNeon('black_market_rate', validRate).catch(() => {})
  }

  // Set manual bank rate & sync with Neon
  const setBankRate = (newRate: number) => {
    const validRate = Math.max(1, newRate)
    setBankRateState(validRate)
    try {
      localStorage.setItem(BANK_RATE_STORAGE_KEY, String(validRate))
    } catch (e) {
      console.error('Failed to save bankRate to localStorage:', e)
    }
    if (rateMode === 'bank') {
      showToast(`Bank rate set: 1 USDT = ${validRate} ETB`, 'success')
    }
    saveSettingToNeon('bank_rate', validRate).catch(() => {})
  }

  // Set active USDT rate (updates whichever is currently selected)
  const setUsdtRate = (newRate: number) => {
    if (rateMode === 'black_market') {
      setBlackMarketRate(newRate)
    } else {
      setBankRate(newRate)
    }
  }

  const showToast = (
    message: string,
    type: 'success' | 'info' | 'error' = 'success',
  ) => {
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3500)
  }

  const removeToast = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  const openCreateModal = (defaultTab?: TabType) => {
    if (defaultTab) {
      setActiveTab(defaultTab)
    }
    setEditingRecord(null)
    setModalMode('create')
    setIsModalOpen(true)
  }

  const openEditModal = (record: LedgerRecord) => {
    setEditingRecord(record)
    setModalMode('edit')
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setEditingRecord(null)
  }

  const addRecord = (
    data: Omit<LedgerRecord, 'id' | 'createdAt' | 'updatedAt'>,
  ) => {
    const newRecord: LedgerRecord = {
      ...data,
      id: `${data.type}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    // Optimistic UI update
    setRecords((prev) => [newRecord, ...prev])
    showToast(`Added: "${newRecord.title}"`, 'success')

    // Real-time write to Neon PostgreSQL
    saveRecordToNeon(newRecord)
      .then(() => {
        setSyncStatus('synced')
        setLastSyncedAt(new Date())
      })
      .catch((err) => {
        console.error('Failed to save to Neon:', err)
        setSyncStatus('offline')
      })
  }

  const updateRecord = (
    id: string,
    updates: Partial<Omit<LedgerRecord, 'id' | 'createdAt'>>,
  ) => {
    const existing = records.find((r) => r.id === id)
    if (!existing) return

    const updatedRecord: LedgerRecord = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    }

    setRecords((prev) =>
      prev.map((rec) => (rec.id === id ? updatedRecord : rec)),
    )
    showToast('Record updated successfully', 'success')

    // Real-time write to Neon PostgreSQL
    saveRecordToNeon(updatedRecord)
      .then(() => {
        setSyncStatus('synced')
        setLastSyncedAt(new Date())
      })
      .catch((err) => {
        console.error('Failed to update in Neon:', err)
        setSyncStatus('offline')
      })
  }

  const deleteRecord = (id: string) => {
    const target = records.find((r) => r.id === id)
    setRecords((prev) => prev.filter((rec) => rec.id !== id))
    showToast(target ? `Deleted "${target.title}"` : 'Record removed', 'info')

    // Real-time delete in Neon PostgreSQL
    deleteRecordFromNeon(id)
      .then(() => {
        setSyncStatus('synced')
        setLastSyncedAt(new Date())
      })
      .catch((err) => {
        console.error('Failed to delete from Neon:', err)
        setSyncStatus('offline')
      })
  }

  const resetToDemo = () => {
    setRecords(INITIAL_LEDGER_DATA)
    showToast('Reset to demo sample data', 'info')
    Promise.all(INITIAL_LEDGER_DATA.map((r) => saveRecordToNeon(r)))
      .then(() => {
        setSyncStatus('synced')
        setLastSyncedAt(new Date())
      })
      .catch((e) => console.warn('Neon sync reset error:', e))
  }

  const clearAll = () => {
    setRecords([])
    showToast('All records cleared', 'info')
    try {
      const sql = getSql()
      sql`DELETE FROM ledger_records`
        .then(() => {
          setSyncStatus('synced')
          setLastSyncedAt(new Date())
        })
        .catch((e) => console.warn('Neon clear error:', e))
    } catch (e) {
      console.warn('Neon clear failed:', e)
    }
  }

  const importRecords = (imported: LedgerRecord[]): boolean => {
    if (!Array.isArray(imported)) {
      showToast('Invalid data format. Expected an array of records.', 'error')
      return false
    }
    setRecords(imported)
    showToast(`Successfully imported ${imported.length} records`, 'success')
    // Background sync to Neon PostgreSQL
    Promise.all(imported.map((r) => saveRecordToNeon(r))).catch((e) =>
      console.warn('Neon sync during import error:', e),
    )
    return true
  }

  // Filter records by tab
  const currentTabRecords = records.filter((r) => r.type === activeTab)

  // Filter records by search query
  const filteredRecords = currentTabRecords.filter((rec) => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    const matchTitle = rec.title.toLowerCase().includes(q)
    const matchNotes = rec.notes?.toLowerCase().includes(q) ?? false
    const matchItems = rec.items.some((item) =>
      item.name.toLowerCase().includes(q),
    )
    return matchTitle || matchNotes || matchItems
  })

  // Count by tab for badges
  const tabRecordCounts = {
    customer: records.filter((r) => r.type === 'customer').length,
    supplier: records.filter((r) => r.type === 'supplier').length,
    stock: records.filter((r) => r.type === 'stock').length,
  }

  // Helper to format currency using active currency
  const formatCurrency = (amount: number) => {
    return formatCurrencyHelper(amount, currency)
  }

  return (
    <LedgerContext.Provider
      value={{
        records,
        activeTab,
        setActiveTab,
        currency,
        setCurrency,
        rateMode,
        setRateMode,
        blackMarketRate,
        setBlackMarketRate,
        bankRate,
        setBankRate,
        usdtRate,
        setUsdtRate,
        formatCurrency,
        searchQuery,
        setSearchQuery,
        syncStatus,
        lastSyncedAt,
        syncWithNeon,
        isModalOpen,
        modalMode,
        editingRecord,
        openCreateModal,
        openEditModal,
        closeModal,
        addRecord,
        updateRecord,
        deleteRecord,
        resetToDemo,
        clearAll,
        importRecords,
        currentTabRecords,
        filteredRecords,
        tabRecordCounts,
        toasts,
        showToast,
        removeToast,
      }}
    >
      {children}
    </LedgerContext.Provider>
  )
}

export function useLedger(): LedgerContextType {
  const context = useContext(LedgerContext)
  if (!context) {
    throw new Error('useLedger must be used within a LedgerProvider')
  }
  return context
}
