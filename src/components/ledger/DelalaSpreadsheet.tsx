import { useState, useEffect, useMemo } from 'react'
import {
  Plus,
  Search,
  Trash2,
  Edit2,
  RefreshCw,
  Calendar,
  X,
  Check,
  AlertCircle,
  FileSpreadsheet,
  Menu,
  ChevronDown,
  ChevronRight,
  Eye,
} from 'lucide-react'
import {
  getDelalaEntries,
  createDelalaEntry,
  updateDelalaEntry,
  deleteDelalaEntry,
  type DelalaEntry,
} from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { useLanguage } from '../../context/LanguageContext'
import { Button } from '../ui/button'


function cleanDelalaName(name: string): string {
  return name.replace(/^(delala|ደላላ)\s+/i, '').trim()
}

function getTodayEthiopianDatePlaceholder(): string {
  const d = new Date()
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}/${month}/${year}`
}

export function DelalaSpreadsheet({
  onOpenMobileMenu,
}: {
  onOpenMobileMenu?: () => void
} = {}) {
  const { activeStore, activeStoreId } = useAuth()
  const { t } = useLanguage()
  const [entries, setEntries] = useState<DelalaEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFilter, setDateFilter] = useState('')

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<DelalaEntry | null>(null)
  const [delalaName, setDelalaName] = useState('')
  const [productName, setProductName] = useState('')
  const [unitPrice, setUnitPrice] = useState('')
  const [pieces, setPieces] = useState('')
  const [cartons, setCartons] = useState('')
  const [piecesPerCarton, setPiecesPerCarton] = useState('')
  const [sign, setSign] = useState<1 | -1>(1)
  const [transactionDate, setTransactionDate] = useState(getTodayEthiopianDatePlaceholder())
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Delete confirm
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [expandedNames, setExpandedNames] = useState<Set<string>>(new Set())

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)
      const storeId = !activeStoreId || activeStoreId === 'all' ? undefined : activeStoreId
      const data = await getDelalaEntries(storeId)
      setEntries(data)
    } catch (err: any) {
      console.error('Failed to load Delala entries:', err)
      setError(err?.message || 'Failed to load Delala entries')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [activeStoreId, activeStore?.id])


  // Summary stats
  const { finalBalance } = useMemo(() => {
    let pos = 0
    let neg = 0
    for (const e of entries) {
      if (e.total >= 0) pos += e.total
      else neg += Math.abs(e.total)
    }
    return {
      totalPositive: pos,
      totalNegative: neg,
      finalBalance: pos - neg,
    }
  }, [entries])

  // Filtered rows
  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const df = dateFilter.trim().toLowerCase()
    return entries.filter((e) => {
      const matchSearch =
        !q ||
        e.delalaName.toLowerCase().includes(q) ||
        e.productName.toLowerCase().includes(q)
      const matchDate = !df || e.transactionDate.toLowerCase().includes(df)
      return matchSearch && matchDate
    })
  }, [entries, searchQuery, dateFilter])

  const mergedEntries = useMemo(() => {
    const merged = new Map<string, DelalaEntry>()
    for (const entry of filteredEntries) {
      const name = cleanDelalaName(entry.delalaName).trim()
      const key = `${name.toLowerCase()}|${entry.productName.trim().toLowerCase()}`
      const existing = merged.get(key)
      if (!existing) {
        merged.set(key, { ...entry, delalaName: name || entry.delalaName })
        continue
      }
      const netPieces = existing.pieces * existing.sign + entry.pieces * entry.sign
      const netTotal = existing.total + entry.total
      const representative =
        (entry.updatedAt || entry.createdAt || '') >=
        (existing.updatedAt || existing.createdAt || '')
          ? entry
          : existing
      merged.set(key, {
        ...representative,
        delalaName: name || representative.delalaName,
        pieces: Math.abs(netPieces),
        sign: (netTotal !== 0 ? netTotal : netPieces) >= 0 ? 1 : -1,
        total: netTotal,
      })
    }
    return Array.from(merged.values())
  }, [filteredEntries])

  const groupedEntries = useMemo(() => {
    const grouped = new Map<string, DelalaEntry[]>()
    for (const entry of filteredEntries) {
      const name = cleanDelalaName(entry.delalaName).trim()
      const key = (name || entry.delalaName).toLowerCase()
      const displayName = name || entry.delalaName
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)!.push({ ...entry, delalaName: displayName })
    }
    return Array.from(grouped.entries()).map(([key, rows]) => ({
      key,
      name: rows[0].delalaName,
      rows: rows.sort((a, b) =>
        (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''),
      ),
      total: rows.reduce((sum, row) => sum + row.total, 0),
      date: rows[0].transactionDate,
    }))
  }, [filteredEntries])

  // Live total in modal
  const livePrice = parseFloat(unitPrice) || 0
  const liveLoosePieces = parseFloat(pieces) || 0
  const liveCartons = parseFloat(cartons) || 0
  const livePiecesPerCarton = parseFloat(piecesPerCarton) || 1
  const livePieces = liveCartons * livePiecesPerCarton + liveLoosePieces
  const liveTotal = parseFloat((livePrice * livePieces * sign).toFixed(2))
  const nameSuggestions = Array.from(new Set(entries.map((entry) => cleanDelalaName(entry.delalaName)).filter(Boolean))).sort((a, b) => a.localeCompare(b))
  const productSuggestions = Array.from(new Set(entries.map((entry) => entry.productName.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b))

  const openAddModal = () => {
    setEditingEntry(null)
    setDelalaName('')
    setProductName('')
    setUnitPrice('')
    setPieces('')
    setCartons('')
    setPiecesPerCarton('1')
    setSign(1)
    setTransactionDate(new Date().toISOString().split('T')[0])
    setFormError(null)
    setIsModalOpen(true)
  }

  const openEditModal = (entry: DelalaEntry) => {
    setEditingEntry(entry)
    setDelalaName(entry.delalaName)
    setProductName(entry.productName)
    setUnitPrice(entry.unitPrice.toString())
    setPieces(entry.pieces.toString())
    setCartons('')
    setPiecesPerCarton('1')
    setSign(entry.sign)
    setTransactionDate(entry.transactionDate)
    setFormError(null)
    setIsModalOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleanName = cleanDelalaName(delalaName)
    if (!cleanName) {
      setFormError(t('Please enter name', 'እባክዎ ስም ያስገቡ'))
      return
    }
    if (!productName.trim()) {
      setFormError(t('Please enter item name', 'እባክዎ የዕቃ ዓይነት ያስገቡ'))
      return
    }
    if (isNaN(livePrice) || livePrice < 0) {
      setFormError(t('Please enter a valid unit price', 'እባክዎ ትክክለኛ ዋጋ ያስገቡ'))
      return
    }
    if (isNaN(livePieces) || livePieces <= 0) {
      setFormError(t('Please enter valid quantity', 'እባክዎ ትክክለኛ ብዛት ያስገቡ'))
      return
    }
    if (!transactionDate.trim()) {
      setFormError(t('Please enter date', 'እባክዎ ቀን ያስገቡ'))
      return
    }

    try {
      setSubmitting(true)
      setFormError(null)
      if (editingEntry) {
        const updated = await updateDelalaEntry(editingEntry.id, {
          delalaName: cleanName,
          productName: productName.trim(),
          unitPrice: livePrice,
          pieces: livePieces,
          sign,
          transactionDate: transactionDate.trim(),
        })
        setEntries((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
      } else {
        const created = await createDelalaEntry({
          delalaName: cleanName,
          productName: productName.trim(),
          unitPrice: livePrice,
          pieces: livePieces,
          sign,
          transactionDate: transactionDate.trim(),
          storeId: activeStore?.id,
        })
        setEntries((prev) => [...prev, created])
      }
      setIsModalOpen(false)
    } catch (err: any) {
      setFormError(err?.message || 'Error saving Delala entry')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      setDeletingId(id)
      await deleteDelalaEntry(id)
      setEntries((prev) => prev.filter((e) => e.id !== id))
    } catch (err: any) {
      alert(err?.message || 'Failed to delete Delala entry')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Error alert */}
      {error && (
        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={loadData}
            className="font-bold underline cursor-pointer hover:opacity-80 ml-2"
          >
            {t('Retry', 'እንደገና ሞክር')}
          </button>
        </div>
      )}

      {/* Modern Unified Command & Action Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 p-1.5 sm:p-2 bg-card rounded-2xl shadow-xs ring-1 ring-zinc-950/5 dark:ring-white/5">
        {/* Left: Mobile Menu + Search */}
        <div className="flex items-center gap-2 flex-1">
          {onOpenMobileMenu && (
            <button
              type="button"
              onClick={onOpenMobileMenu}
              className="md:hidden p-2 rounded-xl bg-muted/60 hover:bg-muted text-foreground shrink-0 flex items-center justify-center cursor-pointer shadow-2xs"
              title={t('Open menu', 'ሜኑ ክፈት')}
            >
              <Menu size={18} />
            </button>
          )}

          {/* Search Delala Name & Product */}
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
              <Search size={16} />
            </span>
            <input
              type="text"
              placeholder={t(
                'Search by Delala name or Product...',
                'በደላላ ስም ወይም ዕቃ ፈልግ...'
              )}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm bg-transparent rounded-xl focus:outline-none placeholder:text-muted-foreground/70"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 cursor-pointer"
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>

        {/* Middle/Right: Ethiopian Date Filter */}
        <div className="relative w-full md:w-60">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
            <Calendar size={15} />
          </span>
          <input
            type="text"
            placeholder={t('Filter date (DD/MM/YYYY)', 'በቀን ፈልግ (02/11/2026)')}
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm bg-muted/30 rounded-xl focus:outline-none placeholder:text-muted-foreground/70 ring-1 ring-zinc-200 dark:ring-zinc-800"
          />
          {dateFilter && (
            <button
              onClick={() => setDateFilter('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 cursor-pointer"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* Right: Actions (Refresh + Add Entry) */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="h-8 text-xs rounded-xl flex items-center gap-1.5 cursor-pointer"
            title={t('Refresh', 'አድስ')}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">{t('Refresh', 'አድስ')}</span>
          </Button>

          <Button
            size="sm"
            onClick={openAddModal}
            className="h-8 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Plus size={16} />
            <span>{t('Add Delala Entry', 'አዲስ የደላላ መዝገብ')}</span>
          </Button>
        </div>
      </div>


      {/* Spreadsheet Table */}
      <div className="rounded-2xl bg-card ring-1 ring-zinc-950/5 dark:ring-white/5 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm border-collapse">
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-muted-foreground">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw size={18} className="animate-spin text-blue-600" />
                      <span className="text-xs font-medium">
                        {t('Loading Delala entries...', 'የደላላ መዝገቦችን በመጫን ላይ...')}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : mergedEntries.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-muted-foreground">
                    {searchQuery || dateFilter
                      ? t('No entries match your filter.', 'ምንም የተገኘ መዝገብ የለም።')
                      : t('No Delala entries recorded yet.', 'ምንም የተመዘገበ የደላላ መዝገብ የለም።')}
                  </td>
                </tr>
              ) : (
                groupedEntries.map((group) => {
                  const expanded = expandedNames.has(group.key)
                  return (
                    <tr key={group.key}>
                      <td colSpan={9} className="p-2">
                        <div className="rounded-xl border border-zinc-300 dark:border-zinc-700 bg-card overflow-hidden">
                          <button
                            type="button"
                            onClick={() => setExpandedNames((prev) => {
                              const next = new Set(prev)
                              if (next.has(group.key)) next.delete(group.key)
                              else next.add(group.key)
                              return next
                            })}
                            className="w-full px-3 py-3 flex items-center gap-3 text-left cursor-pointer"
                          >
                            {expanded
                              ? <ChevronDown size={16} className="text-muted-foreground shrink-0" />
                              : <ChevronRight size={16} className="text-muted-foreground shrink-0" />}
                            <div className="min-w-0 flex-1">
                              <div className="font-bold text-foreground text-sm truncate">{group.name}</div>
                              <div className="text-xs text-muted-foreground mt-1">
                                {group.date}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-extrabold text-black dark:text-white tabular-nums text-sm">
                                {group.total < 0 ? '-' : 'ETB '}
                                {Math.abs(group.total).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </span>
                              <Eye size={16} className="text-blue-600" />
                            </div>
                          </button>
                          {expanded && (
                            <div className="border-t border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-200 dark:divide-zinc-800">
                              {group.rows.map((row) => (
                                <div key={row.id} className="px-3 py-2.5 grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 items-center">
                                  <div className="min-w-0">
                                    <div className="font-semibold text-foreground truncate">{row.productName || t('Birr only', 'ብር ብቻ')}</div>
                                    <div className="text-xs text-muted-foreground">{row.transactionDate}</div>
                                  </div>
                                  <div className="text-right text-xs">
                                    <div>{row.pieces.toLocaleString()} pcs</div>
                                    <div className="font-bold tabular-nums">
                                      {row.total >= 0 ? '+' : ''}
                                      {row.total.toLocaleString(undefined, { minimumFractionDigits: 2 })} ETB
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <button onClick={() => openEditModal(row)} className="p-1 text-muted-foreground hover:text-blue-600 cursor-pointer" title="Edit entry">
                                      <Edit2 size={14} />
                                    </button>
                                    <button onClick={() => handleDelete(row.id)} disabled={deletingId === row.id} className="p-1 text-muted-foreground hover:text-rose-600 cursor-pointer" title="Delete entry">
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Dialog: Add / Edit Entry */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-card w-full max-w-md rounded-2xl ring-1 ring-zinc-950/10 dark:ring-white/10 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <div className="flex items-center gap-2">
                <FileSpreadsheet size={18} className="text-blue-600" />
                <h3 className="font-bold text-base text-foreground">
                  {editingEntry
                    ? t('Edit Delala Entry', 'የደላላ መዝገብ አርትዕ')
                    : t('Add Delala Entry', 'አዲስ የደላላ መዝገብ')}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-3.5">
                            {/* Delala Name (No prefix) */}
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  {t('1. Name *', '1. ስም *')}
                </label>
                <input type="text" required placeholder={t('e.g. Ahmed', 'ምሳሌ፦ አህመድ')} value={delalaName} list="delala-name-options"
                  onChange={(e) => {
                    const value = e.target.value
                    setDelalaName(value)
                    const matches = entries.filter((entry) => cleanDelalaName(entry.delalaName).toLowerCase() === value.trim().toLowerCase())
                    if (matches.length > 0) {
                      const latest = [...matches].sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')))[0]
                      setDelalaName(cleanDelalaName(latest.delalaName))
                      if (latest.productName) setProductName(latest.productName)
                      setUnitPrice(latest.unitPrice.toString())
                      setPieces(latest.pieces.toString())
                    }
                  }} className="w-full px-3 py-2 text-xs sm:text-sm bg-background rounded-xl border border-border focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                <datalist id="delala-name-options">
                  {nameSuggestions.map((name) => <option key={name} value={name} />)}
                </datalist>
              </div>
              {/* Item / Product */}
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  {t('2. Item / Product *', '2. የዕቃ ዓይነት *')}
                </label>
                <input type="text" required placeholder={t('e.g. 12W Safari / 2.5 bmt', 'ምሳሌ፦ 12W ሳፋሪ')} value={productName} list="delala-product-options"
                  onChange={(e) => {
                    const value = e.target.value
                    setProductName(value)
                    const person = delalaName.trim().toLowerCase()
                    const matches = entries.filter((entry) => entry.productName.trim().toLowerCase() === value.trim().toLowerCase() && (!person || cleanDelalaName(entry.delalaName).toLowerCase() === person))
                    if (matches.length > 0) {
                      const latest = [...matches].sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')))[0]
                      setProductName(latest.productName)
                      setUnitPrice(latest.unitPrice.toString())
                      setPieces(latest.pieces.toString())
                    }
                  }} className="w-full px-3 py-2 text-xs sm:text-sm bg-background rounded-xl border border-border focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                <datalist id="delala-product-options">
                  {productSuggestions.map((product) => <option key={product} value={product} />)}
                </datalist>
              </div>
              {/* Unit Price & Pieces */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">{t('3. Unit Price (ETB) *', '3. ዋጋ (ብር) *')}</label>
                  <input type="number" step="0.01" min="0" required placeholder="65" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} className="w-full px-3 py-2 text-xs sm:text-sm bg-background rounded-xl border border-border focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">{t('4. Cartons', '4. ካርቶን')}</label>
                  <input type="number" step="0.001" min="0" placeholder="0" value={cartons} onChange={(e) => setCartons(e.target.value)} className="w-full px-3 py-2 text-xs sm:text-sm bg-background rounded-xl border border-border focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">{t('Pcs per Carton', 'ንጥሎች በካርቶን')}</label>
                  <input type="number" step="0.001" min="0.001" placeholder="1" value={piecesPerCarton} onChange={(e) => setPiecesPerCarton(e.target.value)} className="w-full px-3 py-2 text-xs sm:text-sm bg-background rounded-xl border border-border focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">{t('Loose Pieces', 'ብቸኛ ቁጥር')}</label>
                  <input type="number" step="0.001" min="0" placeholder="0" value={pieces} onChange={(e) => setPieces(e.target.value)} className="w-full px-3 py-2 text-xs sm:text-sm bg-background rounded-xl border border-border focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                </div>
              </div>
{/* Sign Selector (+ / -) */}
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  {t('5. Sign *', '5. ምልክት *')}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSign(1)}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      sign === 1
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                        : 'bg-background text-foreground border-border hover:bg-muted'
                    }`}
                  >
                    <span>{t('+ Positive (+)', '+ ተቀባይ (+)')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSign(-1)}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      sign === -1
                        ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                        : 'bg-background text-foreground border-border hover:bg-muted'
                    }`}
                  >
                    <span>{t('- Negative (-)', '- ተከፋይ (-)')}</span>
                  </button>
                </div>
              </div>

              {/* Live Total Display */}
              <div className="p-3 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-border flex items-center justify-between">
                <div>
                  <span className="text-xs text-muted-foreground block">
                    {t('6. Total:', '6. ጠቅላላ ድምር:')}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {livePrice} × {livePieces} × {sign === -1 ? '-1' : '+1'}
                  </span>
                </div>
                <div
                  className={`text-lg font-black ${
                    liveTotal < 0
                      ? 'text-blue-600 dark:text-blue-400'
                      : liveTotal > 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-foreground'
                  }`}
                >
                  {liveTotal >= 0 ? '+' : ''}
                  {liveTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} {t('ETB', 'ብር')}
                </div>
              </div>

              {/* Date Input (Ethiopian Calendar text) */}
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  {t('7. Date *', '7. ቀን *')}
                </label>
                <input
                  type="date"
                  required
                  value={transactionDate}
                  onChange={(e) => setTransactionDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs sm:text-sm bg-background rounded-xl border border-border focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <span className="text-[10px] text-muted-foreground mt-0.5 block">
                  {t('Accepts Ethiopian calendar format as text (e.g. 02/11/2026)', 'የኢትዮጵያ ቀን አቆጣጠር በጽሑፍ ያስገቡ (ምሳሌ፦ 02/11/2026)')}
                </span>
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl h-9 text-xs"
                >
                  {t('Cancel', 'ይቅር')}
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={submitting}
                  className="rounded-xl h-9 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 shadow-xs"
                >
                  <Check size={14} />
                  <span>
                    {submitting
                      ? t('Saving...', 'በማስቀመጥ ላይ...')
                      : editingEntry
                      ? t('Update Entry', 'መዝገብ አድስ')
                      : t('Save Entry', 'መዝግብ (አስቀምጥ)')}
                  </span>
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
