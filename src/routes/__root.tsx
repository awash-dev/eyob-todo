import { createRootRoute } from '@tanstack/react-router'
import '../styles.css'
import { AuthProvider } from '../context/AuthContext'
import { LanguageProvider } from '../context/LanguageContext'
import { AuthGate } from '../components/auth/AuthGate'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </LanguageProvider>
  )
}


