import React, { createContext, useContext, useState, useEffect } from 'react'

export type Language = 'en' | 'am'

interface LanguageContextType {
  language: Language
  isAmharic: boolean
  setLanguage: (lang: Language) => void
  toggleLanguage: () => void
  t: (en: string, am: string) => string
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

const STORAGE_KEY = 'app_language'

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [language, setLanguageState] = useState<Language>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved === 'am' || saved === 'en') return saved
    }
    return 'en'
  })

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, language)
      document.documentElement.lang = language === 'am' ? 'am' : 'en'
    } catch {
      // LocalStorage access might fail in restricted iframe / sandbox
    }
  }, [language])

  const setLanguage = (lang: Language) => {
    setLanguageState(lang)
  }

  const toggleLanguage = () => {
    setLanguageState((prev) => (prev === 'am' ? 'en' : 'am'))
  }

  const t = (en: string, am: string) => {
    return language === 'am' ? am : en
  }

  const isAmharic = language === 'am'

  return (
    <LanguageContext.Provider
      value={{
        language,
        isAmharic,
        setLanguage,
        toggleLanguage,
        t,
      }}
    >
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage(): LanguageContextType {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider')
  }
  return context
}

