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
  recordCreditTransaction as apiRecordCreditTransaction,
} from '../lib/api'
import type { CreditTransactionParams } from '../lib/creditAccounting'
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
  createPrefillTitle?: string
  editAppendRow?: boolean
  openCreateModal: (defaultTab?: TabType, prefillTitle?: string) => void
  openEditModal: (record: LedgerRecord, appendRow?: boolean) => void
  closeModal: () => void
  addRecord: (
    record: Omit<LedgerRecord, 'id' | 'createdAt' | 'updatedAt'>,
  ) => void
  updateRecord: (
    id: string,
    updates: Partial<Omit<LedgerRecord, 'id' | 'createdAt'>>,
  ) => void
  deleteRecord: (id: string) => void
  clearAll: () => void
  importRecords: (imported: LedgerRecord[]) => boolean
  currentTabRecords: LedgerRecord[]
  filteredRecords: LedgerRecord[]
  tabRecordCounts: Record<TabType, number>
  toasts: ToastState[]
  showToast: (message: string, type?: 'success' | 'info' | 'error') => void
  removeToast: (id: number) => void
  isPaymentModalOpen: boolean
  paymentTargetType: 'customer' | 'supplier' | 'delala'
  paymentTargetParty: string | null
  paymentTargetCategory: CreditTransactionParams['transactionCategory'] | null
  openPaymentModal: (
    type?: 'customer' | 'supplier' | 'delala',
    partyName?: string,
    category?: CreditTransactionParams['transactionCategory'],
  ) => void
  closePaymentModal: () => void
  recordCreditTx: (params: CreditTransactionParams) => Promise<void>
}

const LedgerContext = createContext<LedgerContextType | undefined>(undefined)

export const LedgerProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { activeStoreId, user, stores } = useAuth()

  // For storekeepers, always prioritize their assigned store even if activeStoreId hasn't synced yet
  const effectiveStoreId = useMemo(() => {
    if (user?.role === 'storekeeper') {
      return user.storeId || activeStoreId || stores[0]?.id || null
    }
    return activeStoreId
  }, [user?.role, user?.storeId, activeStoreId, stores])

  // Records are always fetched from the database — there is no local cache
  // and no seeded/demo data to fall back on.
  const [records, setRecords] = useState<LedgerRecord[]>([])

  // Toast notifications state & handlers (declared first so all callbacks can use them)
  const [toasts, setToasts] = useState<ToastState[]>([])

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

  // Sync state
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('syncing')
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)

  // Tab & Search state
  const [activeTab, setActiveTabState] = useState<TabType>(() =>
    user?.role === 'storekeeper' ? 'stock' : 'customer',
  )

  // Ensure storekeepers are locked to 'stock' tab whenever user is loaded
  useEffect(() => {
    if (user?.role === 'storekeeper' && activeTab !== 'stock') {
      setActiveTabState('stock')
    }
  }, [user?.role, activeTab])

  const setActiveTab = useCallback(
    (tab: TabType) => {
      if (user?.role === 'storekeeper') {
        setActiveTabState('stock')
        return
      }
      setActiveTabState(tab)
    },
    [user?.role],
  )

  const [searchQuery, setSearchQuery] = useState('')

  // Edit / Create Record Modal state
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
  const [editingRecord, setEditingRecord] = useState<LedgerRecord | null>(null)
  const [createPrefillTitle, setCreatePrefillTitle] = useState('')
  const [editAppendRow, setEditAppendRow] = useState(false)

  // Credit & Payment Transaction Modal state
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
  const [paymentTargetType, setPaymentTargetType] = useState<'customer' | 'supplier' | 'delala'>('customer')
  const [paymentTargetParty, setPaymentTargetParty] = useState<string | null>(null)
  const [paymentTargetCategory, setPaymentTargetCategory] = useState<
    CreditTransactionParams['transactionCategory'] | null
  >(null)

  const closePaymentModal = useCallback(() => {
    setIsPaymentModalOpen(false)
    setPaymentTargetParty(null)
    setPaymentTargetCategory(null)
  }, [])

  const recordCreditTx = useCallback(
    async (params: CreditTransactionParams) => {
      const resolvedStoreId =
        effectiveStoreId && effectiveStoreId !== 'all' ? effectiveStoreId : stores[0]?.id
      if (!resolvedStoreId) {
        showToast('No active store selected', 'error')
        throw new Error('No active store selected')
      }

      setSyncStatus('syncing')
      try {
        const { record } = await apiRecordCreditTransaction(params, resolvedStoreId)
        setRecords((prev) => {
          const index = prev.findIndex((r) => r.id === record.id)
          if (index >= 0) {
            const next = [...prev]
            next[index] = record
            return next
          }
          return [record, ...prev]
        })
        setSyncStatus('synced')
        setLastSyncedAt(new Date())
        showToast(
          `Transaction saved: ${params.partyName} (${params.amount.toLocaleString()} ETB)`,
          'success',
        )
      } catch (err) {
        setSyncStatus('offline')
        const message = err instanceof Error ? err.message : 'Failed to record transaction'
        showToast(message, 'error')
        throw err
      }
    },
    [effectiveStoreId, stores, showToast],
  )

    const syncWithNeon = useCallback(async () => {
    if (!effectiveStoreId) {
      setRecords([])
      setSyncStatus('synced')
      return
    }
    try {
      setSyncStatus('syncing')
      const { records: nextRecords } = await apiGetRecords(
        undefined,
        effectiveStoreId,
      )
      setRecords(nextRecords)
      setSyncStatus('synced')
      setLastSyncedAt(new Date())
    } catch (err) {
      console.warn('Database sync failed:', err)
      // Online-only: never substitute local/demo data for the database.
      setRecords([])
      setSyncStatus('offline')
    }
  }, [effectiveStoreId])

  // Automatically fetch records & sync on initial mount and whenever active store changes
  useEffect(() => {
    if (!effectiveStoreId) {
      setRecords([])
      setSyncStatus('synced')
      return
    }

    let isCancelled = false
    setRecords([])
    setSyncStatus('syncing')
    apiGetRecords(undefined, effectiveStoreId)
      .then(({ records: liveRecords }) => {
        if (!isCancelled) {
          setRecords(liveRecords)
          setSyncStatus('synced')
          setLastSyncedAt(new Date())
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          console.warn('Database fetch failed:', err)
          setRecords([])
          setSyncStatus('offline')
        }
      })

    return () => {
      isCancelled = true
    }
  }, [effectiveStoreId])

  // Automatically sync when window gains focus
  useEffect(() => {
    const handleFocus = () => {
      if (effectiveStoreId && document.visibilityState === 'visible') {
        void syncWithNeon()
      }
    }
    window.addEventListener('visibilitychange', handleFocus)
    window.addEventListener('focus', handleFocus)
    return () => {
      window.removeEventListener('visibilitychange', handleFocus)
      window.removeEventListener('focus', handleFocus)
    }
  }, [effectiveStoreId, syncWithNeon])

  const openCreateModal = useCallback((defaultTab?: TabType, prefillTitle?: string) => {
    if (defaultTab) setActiveTab(defaultTab)
    setEditingRecord(null)
    setCreatePrefillTitle(prefillTitle || '')
    setEditAppendRow(false)
    setModalMode('create')
    setIsModalOpen(true)
  }, [])

  const openEditModal = useCallback((record: LedgerRecord, appendRow?: boolean) => {
    setEditingRecord(record)
    setCreatePrefillTitle('')
    setEditAppendRow(!!appendRow)
    setModalMode('edit')
    setIsModalOpen(true)
  }, [])

  const closeModal = useCallback(() => {
    setIsModalOpen(false)
    setEditingRecord(null)
    setCreatePrefillTitle('')
    setEditAppendRow(false)
  }, [])

  const openPaymentModal = useCallback(
    (
      type?: 'customer' | 'supplier' | 'delala',
      partyName?: string,
      category?: CreditTransactionParams['transactionCategory'],
    ) => {
      const targetType = type || (activeTab === 'supplier' ? 'supplier' : activeTab === 'delala' ? 'delala' : 'customer')
      setPaymentTargetType(targetType)
      setPaymentTargetParty(partyName || null)
      setPaymentTargetCategory(category || null)

      if (partyName) {
        const existing = records.find(
          (r) => r.type === targetType && r.title.trim().toLowerCase() === partyName.trim().toLowerCase(),
        )
        if (existing) {
          openEditModal(existing, true)
          return
        }
        openCreateModal(targetType, partyName)
        return
      }
      openCreateModal(targetType)
    },
    [activeTab, records, openEditModal, openCreateModal],
  )

  const addRecord = useCallback(
    (data: Omit<LedgerRecord, 'id' | 'createdAt' | 'updatedAt'>) => {
      // Never invent a store id: use the selected store, or the first store
      // that actually exists in the database.
      const resolvedStoreId =
        effectiveStoreId && effectiveStoreId !== 'all' ? effectiveStoreId : stores[0]?.id
      if (!resolvedStoreId) {
        showToast(
          'No store exists in the database yet — create a store first',
          'error',
        )
        return
      }

      const tempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const optimistic: LedgerRecord = {
        ...data,
        id: tempId,
        storeId: resolvedStoreId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      setRecords((prev) => [optimistic, ...prev])
      showToast(`Added: "${data.title}"`, 'success')

      setSyncStatus('syncing')
      apiCreateRecord(data, resolvedStoreId)
        .then(({ record }) => {
          setRecords((prev) =>
            prev.map((item) => (item.id === tempId ? record : item)),
          )
          setSyncStatus('synced')
          setLastSyncedAt(new Date())
        })
        .catch((err) => {
          setRecords((prev) => prev.filter((item) => item.id !== tempId))
          setSyncStatus('offline')
          showToast(
            err instanceof Error ? err.message : 'Could not save the record',
            'error',
          )
        })
    },
    [effectiveStoreId, stores, showToast],
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
      setRecords((prev) =>
        prev.map((record) => (record.id === id ? updated : record)),
      )
      showToast('Record updated successfully', 'success')

      setSyncStatus('syncing')
      apiUpdateRecord(id, updated)
        .then(({ record }) => {
          setRecords((prev) =>
            prev.map((item) => (item.id === id ? record : item)),
          )
          setSyncStatus('synced')
          setLastSyncedAt(new Date())
        })
        .catch((err) => {
          setRecords((prev) =>
            prev.map((record) => (record.id === id ? existing : record)),
          )
          setSyncStatus('offline')
          showToast(
            err instanceof Error ? err.message : 'Could not update the record',
            'error',
          )
        })
    },
    [records, showToast],
  )

  const deleteRecord = useCallback(
    (id: string) => {
      const target = records.find((record) => record.id === id)
      setRecords((prev) => prev.filter((record) => record.id !== id))
      showToast(target ? `Deleted "${target.title}"` : 'Record removed', 'info')

      setSyncStatus('syncing')
      apiDeleteRecord(id)
        .then(() => {
          setSyncStatus('synced')
          setLastSyncedAt(new Date())
        })
        .catch((err) => {
          if (target) {
            setRecords((prev) => [target, ...prev])
          }
          setSyncStatus('offline')
          showToast(
            err instanceof Error ? err.message : 'Could not delete the record',
            'error',
          )
        })
    },
    [records, showToast],
  )

  const clearAll = useCallback(() => {
    const current = [...records]
    setRecords([])
    showToast('All records in this store cleared', 'info')
    Promise.all(current.map((record) => apiDeleteRecord(record.id))).catch(
      (err) => {
        console.warn('Could not clear all records:', err)
        setRecords(current)
        showToast('Could not clear all records', 'error')
      },
    )
  }, [records, showToast])

  const importRecords = useCallback(
    (imported: LedgerRecord[]): boolean => {
      if (!Array.isArray(imported)) {
        showToast('Invalid data format. Expected an array of records.', 'error')
        return false
      }
      if (!effectiveStoreId) {
        showToast('Select a store before importing records', 'error')
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
            effectiveStoreId,
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
    [effectiveStoreId, showToast],
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
      delala: records.filter((record) => record.type === 'delala').length,
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
      createPrefillTitle,
      editAppendRow,
      openCreateModal,
      openEditModal,
      closeModal,
      addRecord,
      updateRecord,
      deleteRecord,
      clearAll,
      importRecords,
      currentTabRecords,
      filteredRecords,
      tabRecordCounts,
      toasts,
      showToast,
      removeToast,
      isPaymentModalOpen,
      paymentTargetType,
      paymentTargetParty,
      paymentTargetCategory,
      openPaymentModal,
      closePaymentModal,
      recordCreditTx,
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
      createPrefillTitle,
      editAppendRow,
      openCreateModal,
      openEditModal,
      closeModal,
      addRecord,
      updateRecord,
      deleteRecord,
      clearAll,
      importRecords,
      currentTabRecords,
      filteredRecords,
      tabRecordCounts,
      toasts,
      showToast,
      removeToast,
      isPaymentModalOpen,
      paymentTargetType,
      paymentTargetParty,
      paymentTargetCategory,
      openPaymentModal,
      closePaymentModal,
      recordCreditTx,
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
