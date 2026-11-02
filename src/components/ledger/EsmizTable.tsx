import React, { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2, Calendar, Check, X, Loader2 } from 'lucide-react'
import {
  getEsmizTable,
  createEsmizEntry,
  updateEsmizEntry,
  deleteEsmizEntry,
} from '../../lib/api'

interface EsmizItem {
  id: string
  esmizId: string
  description: string
  amount: number
  sign: -1 | 1
  position: number
  transactionDate: string
  rowTotal: number
}

export function EsmizTable() {
  const [entries, setEntries] = useState<EsmizItem[]>([])
  const [totalBalance, setTotalBalance] = useState<number>(0)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Dialog state for Add / Edit
  const [modalOpen, setModalOpen] = useState<boolean>(false)
  const [editingItem, setEditingItem] = useState<EsmizItem | null>(null)
  const [description, setDescription] = useState<string>('')
  const [amount, setAmount] = useState<string>('')
  const [sign, setSign] = useState<-1 | 1>(-1)
  const [transactionDate, setTransactionDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  )
  const [saving, setSaving] = useState<boolean>(false)

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await getEsmizTable()
      setEntries(data.entries)
      setTotalBalance(data.totalBalance)
    } catch (err: any) {
      setError(err?.message || 'Failed to load Esmiz table')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleOpenAdd = () => {
    setEditingItem(null)
    setDescription('')
    setAmount('')
    setSign(-1)
    setTransactionDate(new Date().toISOString().split('T')[0])
    setModalOpen(true)
  }

  const handleOpenEdit = (item: EsmizItem) => {
    setEditingItem(item)
    setDescription(item.description)
    setAmount(item.amount.toString())
    setSign(item.sign)
    setTransactionDate(item.transactionDate)
    setModalOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this row?')) return
    try {
      await deleteEsmizEntry(id)
      await loadData()
    } catch (err: any) {
      alert('Failed to delete row: ' + (err?.message || 'Error'))
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!description.trim()) {
      alert('Please enter a description (የእቃው አይነት)')
      return
    }
    const numAmount = parseFloat(amount.replace(/,/g, ''))
    if (isNaN(numAmount) || numAmount <= 0) {
      alert('Please enter a valid positive amount (ዋጋ)')
      return
    }

    try {
      setSaving(true)
      if (editingItem) {
        await updateEsmizEntry(editingItem.id, {
          description,
          amount: numAmount,
          sign,
          transactionDate,
        })
      } else {
        await createEsmizEntry({
          description,
          amount: numAmount,
          sign,
          transactionDate,
        })
      }
      setModalOpen(false)
      await loadData()
    } catch (err: any) {
      alert('Failed to save entry: ' + (err?.message || 'Error'))
    } finally {
      setSaving(false)
    }
  }

  // Format currency with commas
  const formatNumber = (num: number) => {
    return num.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })
  }

  return (
    <div className="w-full bg-white dark:bg-zinc-900 rounded-xl shadow-xs border border-gray-200 dark:border-zinc-800 p-4 sm:p-6 mb-8 font-sans">
      {/* Header bar matching exact screenshot requirement */}
      <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-zinc-800 mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
            Esmiz
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Delala (ደላላ) Account Ledger & Commission Records
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors cursor-pointer"
        >
          <Plus size={15} />
          <span>Add Row</span>
        </button>
      </div>

      {loading ? (
        <div className="py-12 flex flex-col items-center justify-center text-gray-400 gap-2">
          <Loader2 className="animate-spin" size={24} />
          <span className="text-xs">Loading Esmiz table...</span>
        </div>
      ) : error ? (
        <div className="p-4 rounded-lg bg-red-50 text-red-700 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={loadData}
            className="underline font-semibold ml-4 cursor-pointer"
          >
            Retry
          </button>
        </div>
      ) : (
        /* The Spreadsheet Table */
        <div className="overflow-x-auto border border-gray-300 dark:border-zinc-700 rounded-md">
          <table className="w-full border-collapse text-xs sm:text-sm text-left">
            {/* Table Header: Light-gray header background, thin gray borders */}
            <thead>
              <tr className="bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-200 border-b border-gray-300 dark:border-zinc-700 font-semibold select-none">
                <th className="py-2.5 px-3 border-r border-gray-300 dark:border-zinc-700 w-12 text-center">
                  No.
                </th>
                <th className="py-2.5 px-3 border-r border-gray-300 dark:border-zinc-700">
                  የእቃው አይነት
                </th>
                <th className="py-2.5 px-3 border-r border-gray-300 dark:border-zinc-700 text-right w-28 sm:w-36">
                  ዋጋ
                </th>
                <th className="py-2.5 px-3 border-r border-gray-300 dark:border-zinc-700 text-right w-20 sm:w-24">
                  ብዛት
                </th>
                <th className="py-2.5 px-3 border-r border-gray-300 dark:border-zinc-700 text-right w-28 sm:w-36">
                  ድምር
                </th>
                <th className="py-2.5 px-2 text-center w-16 no-print">
                  Edit
                </th>
              </tr>
            </thead>

            {/* Table Body: White rows, thin gray borders */}
            <tbody className="divide-y divide-gray-200 dark:divide-zinc-700 bg-white dark:bg-zinc-900">
              {entries.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="py-8 text-center text-xs text-gray-400"
                  >
                    No Esmiz entries yet. Click &quot;Add Row&quot; above to create one.
                  </td>
                </tr>
              ) : (
                entries.map((item, index) => {
                  const isNegative = item.rowTotal < 0
                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-gray-50/80 dark:hover:bg-zinc-800/50 transition-colors"
                    >
                      {/* 1. Left-side row numbering */}
                      <td className="py-2.5 px-3 border-r border-gray-200 dark:border-zinc-700 text-center font-mono text-gray-500 text-xs">
                        {index + 1}
                      </td>

                      {/* 2. የእቃው አይነት */}
                      <td className="py-2.5 px-3 border-r border-gray-200 dark:border-zinc-700 font-medium text-gray-800 dark:text-gray-200">
                        <span>{item.description}</span>
                        {item.transactionDate && (
                          <span className="block text-[10px] text-gray-400 font-normal">
                            {item.transactionDate}
                          </span>
                        )}
                      </td>

                      {/* 3. ዋጋ (Right-aligned) */}
                      <td className="py-2.5 px-3 border-r border-gray-200 dark:border-zinc-700 text-right font-mono text-gray-700 dark:text-gray-300">
                        {formatNumber(item.amount)}
                      </td>

                      {/* 4. ብዛት (-1 or +1) */}
                      <td className="py-2.5 px-3 border-r border-gray-200 dark:border-zinc-700 text-right font-mono font-medium">
                        <span
                          className={
                            item.sign === -1
                              ? 'text-blue-600 dark:text-blue-400'
                              : 'text-gray-700 dark:text-gray-300'
                          }
                        >
                          {item.sign === -1 ? '-1' : '+1'}
                        </span>
                      </td>

                      {/* 5. ድምር (amount * sign) */}
                      <td
                        className={`py-2.5 px-3 border-r border-gray-200 dark:border-zinc-700 text-right font-mono font-bold ${
                          isNegative
                            ? 'text-blue-600 dark:text-blue-400'
                            : 'text-gray-800 dark:text-gray-100'
                        }`}
                      >
                        {formatNumber(item.rowTotal)}
                      </td>

                      {/* 6. Action icons */}
                      <td className="py-2.5 px-2 text-center no-print">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => handleOpenEdit(item)}
                            title="Edit row"
                            className="p-1 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded transition-colors cursor-pointer"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => handleDelete(item.id)}
                            title="Delete row"
                            className="p-1 text-gray-400 hover:text-red-600 rounded transition-colors cursor-pointer"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}

              {/* Bottom Total Row: Simple, minimal spreadsheet appearance */}
              <tr className="bg-gray-100 dark:bg-zinc-800/90 font-bold border-t-2 border-gray-300 dark:border-zinc-700 select-none">
                <td className="py-3 px-3 border-r border-gray-300 dark:border-zinc-700 text-center"></td>
                <td className="py-3 px-3 border-r border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-gray-100">
                  ጠቅላላ ድምር
                </td>
                <td className="py-3 px-3 border-r border-gray-300 dark:border-zinc-700 text-right"></td>
                <td className="py-3 px-3 border-r border-gray-300 dark:border-zinc-700 text-right"></td>
                {/* Negative balance in blue */}
                <td
                  className={`py-3 px-3 border-r border-gray-300 dark:border-zinc-700 text-right font-mono text-base ${
                    totalBalance < 0
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-gray-900 dark:text-gray-100'
                  }`}
                >
                  {formatNumber(totalBalance)}
                </td>
                <td className="py-3 px-2 text-center no-print"></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Row Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-xl shadow-xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
            <div className="px-5 py-3.5 bg-gray-50 dark:bg-zinc-800 border-b border-gray-200 dark:border-zinc-700 flex items-center justify-between">
              <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100">
                {editingItem ? 'Edit Esmiz Row' : 'Add Esmiz Row (አዲስ ረድፍ)'}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-5 space-y-4 text-xs sm:text-sm">
              {/* የእቃው አይነት (Description) */}
              <div>
                <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">
                  የእቃው አይነት (Description) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. yebefit keri, 2.5 bmt, 2.5 elusdy..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-zinc-700 rounded-lg bg-transparent text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* ዋጋ (Amount) & ብዛት (Sign) in 2 columns */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">
                    ዋጋ (Amount) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="e.g. 13450"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-zinc-700 rounded-lg bg-transparent font-mono text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">
                    ብዛት / Sign (-1 or +1) *
                  </label>
                  <select
                    value={sign}
                    onChange={(e) => setSign(parseInt(e.target.value) as -1 | 1)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-zinc-700 rounded-lg bg-transparent font-mono text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value={-1}>-1 (Subtract / ተቀናሽ)</option>
                    <option value={1}>+1 (Add / ተደማሪ)</option>
                  </select>
                </div>
              </div>

              {/* Date Selection */}
              <div>
                <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1.5">
                  <Calendar size={14} />
                  <span>Transaction Date (ቀን)</span>
                </label>
                <input
                  type="date"
                  value={transactionDate}
                  onChange={(e) => setTransactionDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-zinc-700 rounded-lg bg-transparent text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Calculated preview */}
              {amount && !isNaN(parseFloat(amount)) && (
                <div className="p-2.5 rounded-lg bg-blue-50/70 dark:bg-blue-950/30 text-blue-800 dark:text-blue-300 text-xs flex justify-between font-mono">
                  <span>Calculated Row Total:</span>
                  <span className="font-bold">
                    {formatNumber(parseFloat(amount) * sign)} ETB
                  </span>
                </div>
              )}

              {/* Form buttons */}
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg border border-gray-300 dark:border-zinc-700 hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-700 dark:text-gray-300 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {saving ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Check size={14} />
                  )}
                  <span>Save Entry</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

