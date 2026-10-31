import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { LedgerRecord, SyncStatus, TabType } from '../types/ledger'
import { formatCurrency as formatCurrencyHelper } from '../lib/formatters'
import {
  createRecord as apiCreateRecord,
  deleteRecord as apiDeleteRecord,
  getRecords as apiGetRecords,
  updateRecord as apiUpdateRecord,
} from '../lib/api'
import { useAuth } from './AuthContext'

interface ToastState {
  id: number
  message: string
  type: 'success' | 'info' | 'error'
}

interface LedgerContextType {
  records: LedgerRecord[]
  activeTab: TabType
  setActiveTab: (tab: TabType) => void
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

function cacheKey(shopId: string | null) {
  return `click_ledger_records_${shopId || 'none'}`
}

function readCache(shopId: string | null): LedgerRecord[] {
  try {
    const raw = localStorage.getItem(cacheKey(shopId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeCache(shopId: string | null, records: LedgerRecord[]) {
  try {
    localStorage.setItem(cacheKey(shopId), JSON.stringify(records))
  } catch {
    // Ignore cache failures.
  }
}

export const LedgerProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { activeShopId } = useAuth()

  const [records, setRecords] = useState<LedgerRecord[]>(() =>
    readCache(activeShopId),
  )

  const [activeTab, setActiveTab] = useState<TabType>('customer')
  const [searchQuery, setSearchQuery] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
  const [editingRecord, setEditingRecord] = useState<LedgerRecord | null>(null)
  const [toasts, setToasts] = useState<ToastState[]>([])
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('syncing')
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)

  const showToast = useCallback(
    (message: string, type: 'success' | 'info' | 'error' = 'success') => {
      const id = Date.now() + Math.random()
      setToasts((prev) => [...prev, { id, message, type }])
      setTimeout(() => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id))
      }, 3500)
    },
    [],
  )

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  const syncWithNeon = useCallback(async () => {
    if (!activeShopId) {
      setRecords([])
      setSyncStatus('synced')
      return
    }
    try {
      setSyncStatus('syncing')
      const { records: nextRecords } = await apiGetRecords(
        undefined,
        activeShopId,
      )
      setRecords(nextRecords)
      writeCache(activeShopId, nextRecords)
      setSyncStatus('synced')
      setLastSyncedAt(new Date())
    } catch (err) {
      console.warn('API sync failed, using local cache:', err)
      const cached = readCache(activeShopId)
      if (cached.length > 0) {
        setRecords(cached)
      }
      setSyncStatus('offline')
    }
  }, [activeShopId])

  // Automatically fetch records & sync on initial mount and whenever active shop changes
  useEffect(() => {
    if (!activeShopId) {
      setRecords([])
      return
    }
    // 1. Immediately populate from local cache if present
    const cached = readCache(activeShopId)
    setRecords(cached)

    // 2. Automatically sync with server/Neon DB
    let isCancelled = false
    setSyncStatus('syncing')
    apiGetRecords(undefined, activeShopId)
      .then(({ records: liveRecords }) => {
        if (!isCancelled) {
          setRecords(liveRecords)
          writeCache(activeShopId, liveRecords)
          setSyncStatus('synced')
          setLastSyncedAt(new Date())
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          console.warn('API auto-sync failed, using cache:', err)
          setSyncStatus('offline')
        }
      })

    return () => {
      isCancelled = true
    }
  }, [activeShopId])

  // Automatically sync when window gains focus
  useEffect(() => {
    const handleFocus = () => {
      if (activeShopId && document.visibilityState === 'visible') {
        void syncWithNeon()
      }
    }
    window.addEventListener('visibilitychange', handleFocus)
    window.addEventListener('focus', handleFocus)
    return () => {
      window.removeEventListener('visibilitychange', handleFocus)
      window.removeEventListener('focus', handleFocus)
    }
  }, [activeShopId, syncWithNeon])

  const openCreateModal = useCallback((defaultTab?: TabType) => {
    if (defaultTab) setActiveTab(defaultTab)
    setEditingRecord(null)
    setModalMode('create')
    setIsModalOpen(true)
  }, [])

  const openEditModal = useCallback((record: LedgerRecord) => {
    setEditingRecord(record)
    setModalMode('edit')
    setIsModalOpen(true)
  }, [])

  const closeModal = useCallback(() => {
    setIsModalOpen(false)
    setEditingRecord(null)
  }, [])

  const addRecord = useCallback(
    (data: Omit<LedgerRecord, 'id' | 'createdAt' | 'updatedAt'>) => {
      const tempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const optimistic: LedgerRecord = {
        ...data,
        id: tempId,
        shopId: activeShopId || undefined,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      setRecords((prev) => {
        const next = [optimistic, ...prev]
        if (activeShopId) writeCache(activeShopId, next)
        return next
      })
      showToast(`Added: "${data.title}"`, 'success')

      setSyncStatus('syncing')
      apiCreateRecord(data, activeShopId)
        .then(({ record }) => {
          setRecords((prev) => {
            const next = prev.map((item) =>
              item.id === tempId ? record : item,
            )
            if (activeShopId) writeCache(activeShopId, next)
            return next
          })
          setSyncStatus('synced')
          setLastSyncedAt(new Date())
        })
        .catch((err) => {
          setRecords((prev) => {
            const next = prev.filter((item) => item.id !== tempId)
            if (activeShopId) writeCache(activeShopId, next)
            return next
          })
          setSyncStatus('offline')
          showToast(
            err instanceof Error ? err.message : 'Could not save the record',
            'error',
          )
        })
    },
    [activeShopId, showToast],
  )

  const updateRecord = useCallback(
    (id: string, updates: Partial<Omit<LedgerRecord, 'id' | 'createdAt'>>) => {
      const existing = records.find((record) => record.id === id)
      if (!existing) return
      const updated: LedgerRecord = {
        ...existing,
        ...updates,
        updatedAt: Date.now(),
      }
      setRecords((prev) => {
        const next = prev.map((record) => (record.id === id ? updated : record))
        if (activeShopId) writeCache(activeShopId, next)
        return next
      })
      showToast('Record updated successfully', 'success')

      setSyncStatus('syncing')
      apiUpdateRecord(id, updated)
        .then(({ record }) => {
          setRecords((prev) => {
            const next = prev.map((item) => (item.id === id ? record : item))
            if (activeShopId) writeCache(activeShopId, next)
            return next
          })
          setSyncStatus('synced')
          setLastSyncedAt(new Date())
        })
        .catch((err) => {
          setRecords((prev) => {
            const next = prev.map((record) =>
              record.id === id ? existing : record,
            )
            if (activeShopId) writeCache(activeShopId, next)
            return next
          })
          setSyncStatus('offline')
          showToast(
            err instanceof Error ? err.message : 'Could not update the record',
            'error',
          )
        })
    },
    [activeShopId, records, showToast],
  )

  const deleteRecord = useCallback(
    (id: string) => {
      const target = records.find((record) => record.id === id)
      setRecords((prev) => {
        const next = prev.filter((record) => record.id !== id)
        if (activeShopId) writeCache(activeShopId, next)
        return next
      })
      showToast(target ? `Deleted "${target.title}"` : 'Record removed', 'info')

      setSyncStatus('syncing')
      apiDeleteRecord(id)
        .then(() => {
          setSyncStatus('synced')
          setLastSyncedAt(new Date())
        })
        .catch((err) => {
          if (target) {
            setRecords((prev) => {
              const next = [target, ...prev]
              if (activeShopId) writeCache(activeShopId, next)
              return next
            })
          }
          setSyncStatus('offline')
          showToast(
            err instanceof Error ? err.message : 'Could not delete the record',
            'error',
          )
        })
    },
    [activeShopId, records, showToast],
  )

  const clearAll = useCallback(() => {
    const current = [...records]
    setRecords([])
    showToast('All records in this shop cleared', 'info')
    Promise.all(current.map((record) => apiDeleteRecord(record.id))).catch(
      (err) => {
        console.warn('Could not clear all records:', err)
        setRecords(current)
        showToast('Could not clear all records', 'error')
      },
    )
  }, [records, showToast])

  const resetToDemo = useCallback(() => {
    showToast('Demo reset is disabled for live shop data', 'info')
  }, [showToast])

  const importRecords = useCallback(
    (imported: LedgerRecord[]): boolean => {
      if (!Array.isArray(imported)) {
        showToast('Invalid data format. Expected an array of records.', 'error')
        return false
      }
      if (!activeShopId) {
        showToast('Select a shop before importing records', 'error')
        return false
      }
      showToast(`Importing ${imported.length} records...`, 'info')
      Promise.all(
        imported.map((record) =>
          apiCreateRecord(
            {
              type: record.type,
              title: record.title,
              date: record.date,
              notes: record.notes,
              exchangeRate: record.exchangeRate,
              items: record.items,
            },
            activeShopId,
          ),
        ),
      )
        .then((results) => {
          const created = results.map((result) => result.record)
          setRecords((prev) => [...created, ...prev])
          showToast(`Imported ${created.length} records`, 'success')
        })
        .catch((err) => {
          showToast(
            err instanceof Error ? err.message : 'Import failed',
            'error',
          )
        })
      return true
    },
    [activeShopId, showToast],
  )

  const currentTabRecords = useMemo(
    () => records.filter((record) => record.type === activeTab),
    [records, activeTab],
  )

  const filteredRecords = useMemo(() => {
    if (!searchQuery.trim()) return currentTabRecords
    const query = searchQuery.toLowerCase()
    return currentTabRecords.filter((record) => {
      const matchTitle = record.title.toLowerCase().includes(query)
      const matchNotes = record.notes?.toLowerCase().includes(query) ?? false
      const matchItems = record.items.some((item) =>
        item.name.toLowerCase().includes(query),
      )
      return matchTitle || matchNotes || matchItems
    })
  }, [currentTabRecords, searchQuery])

  const tabRecordCounts = useMemo(
    () => ({
      customer: records.filter((record) => record.type === 'customer').length,
      supplier: records.filter((record) => record.type === 'supplier').length,
      stock: records.filter((record) => record.type === 'stock').length,
    }),
    [records],
  )

  const formatCurrency = useCallback(
    (amount: number) => formatCurrencyHelper(amount, 'ETB'),
    [],
  )

  const value = useMemo<LedgerContextType>(
    () => ({
      records,
      activeTab,
      setActiveTab,
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
    }),
    [
      records,
      activeTab,
      formatCurrency,
      searchQuery,
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
    ],
  )

  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>
}

export function useLedger(): LedgerContextType {
  const context = useContext(LedgerContext)
  if (!context) {
    throw new Error('useLedger must be used within a LedgerProvider')
  }
  return context
}
