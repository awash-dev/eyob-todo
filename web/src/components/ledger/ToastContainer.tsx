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
              <ion-icon
                name="checkmark-circle-outline"
                class="text-base text-emerald-400 shrink-0"
              ></ion-icon>
            )}
            {toast.type === 'error' && (
              <ion-icon
                name="alert-circle-outline"
                class="text-base text-rose-400 shrink-0"
              ></ion-icon>
            )}
            {toast.type === 'info' && (
              <ion-icon
                name="information-circle-outline"
                class="text-base text-blue-400 shrink-0"
              ></ion-icon>
            )}
            <span>{toast.message}</span>
          </div>
          <button
            onClick={() => removeToast(toast.id)}
            className="text-zinc-400 hover:text-white ml-3 p-1 rounded transition-colors flex items-center justify-center cursor-pointer"
            title="Dismiss"
          >
            <ion-icon name="close-outline" class="text-base"></ion-icon>
          </button>
        </div>
      ))}
    </div>
  )
}
