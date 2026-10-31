import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import React from 'react'
import { useLedger } from '../../context/LedgerContext'

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useLedger()

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none no-print">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-center justify-between p-3 sm:p-3.5 rounded-xl shadow-lg border text-xs sm:text-sm font-medium transition-all duration-300 animate-in slide-in-from-top-2 ${
            toast.type === 'success'
              ? 'bg-emerald-950 text-emerald-100 border-emerald-800'
              : toast.type === 'error'
                ? 'bg-rose-950 text-rose-100 border-rose-800'
                : 'bg-zinc-900 text-zinc-100 border-zinc-700'
          }`}
        >
          <div className="flex items-center gap-2">
            {toast.type === 'success' && (
              <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
            )}
            {toast.type === 'error' && (
              <AlertCircle size={16} className="text-rose-400 shrink-0" />
            )}
            {toast.type === 'info' && (
              <Info size={16} className="text-blue-400 shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
          <button
            onClick={() => removeToast(toast.id)}
            className="text-zinc-400 hover:text-white ml-3 p-1 rounded transition-colors flex items-center justify-center cursor-pointer"
            title="Dismiss"
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  )
}
