import { createRootRoute } from '@tanstack/react-router'
import '../styles.css'
import { AuthGate } from '../components/auth/AuthGate'

export const Route = createRootRoute({
  component: RootComponent,
  errorComponent: RootErrorComponent,
})

function RootComponent() {
  return <AuthGate />
}

function RootErrorComponent({
  error,
  reset,
}: {
  error: unknown
  reset: () => void
}) {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full p-6 bg-white dark:bg-zinc-900 rounded-xl shadow-lg border border-zinc-200 dark:border-zinc-800">
        <h2 className="text-lg font-bold text-red-600 dark:text-red-400 mb-2">
          Application Notice
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4 break-words">
          {error instanceof Error ? error.message : 'An unexpected error occurred.'}
        </p>
        <div className="flex gap-2 justify-center">
          <button
            type="button"
            onClick={() => reset()}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition"
          >
            Try Again
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-300 transition"
          >
            Reload Page
          </button>
        </div>
      </div>
    </div>
  )
}


