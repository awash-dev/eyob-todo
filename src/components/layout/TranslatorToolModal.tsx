import React, { useState, useEffect } from 'react'
import {
  ArrowLeftRight,
  Check,
  Clock,
  Copy,
  Globe,
  Save,
  Trash2,
  X,
  Sparkles,
} from 'lucide-react'
import { useLanguage } from '../../context/LanguageContext'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'

const COMMON_PHRASES = [
  { en: 'Stock In', am: 'ዕቃ ገቢ' },
  { en: 'Stock Out', am: 'ዕቃ ወጪ' },
  { en: 'Purchase Price', am: 'የግዢ ዋጋ' },
  { en: 'Selling Price', am: 'የሽያጭ ዋጋ' },
  { en: 'Available Stock', am: 'ያለ ክምችት' },
  { en: 'Packaging Breakdown', am: 'የማሸጊያ ዝርዝር' },
  { en: 'Cash Payment', am: 'ጥሬ ገንዘብ' },
  { en: 'Bank Transfer', am: 'የባንክ ሒሳብ ማስተላለፍ' },
  { en: 'Carton', am: 'ካርቶን' },
  { en: 'Pieces', am: 'ፍሬ' },
]

export const TranslatorToolModal: React.FC = () => {
  const {
    isTranslatorOpen,
    closeTranslator,
    t,
    translateDynamic,
    translationHistory,
    addTranslationHistory,
    clearTranslationHistory,
    saveCorrection,
  } = useLanguage()

  const [sourceLang, setSourceLang] = useState<'auto' | 'en' | 'am'>('auto')
  const [targetLang, setTargetLang] = useState<'en' | 'am'>('am')
  const [sourceText, setSourceText] = useState('')
  const [translatedText, setTranslatedText] = useState('')
  const [copied, setCopied] = useState(false)
  const [savedSuccess, setSavedSuccess] = useState(false)
  const [isTranslating, setIsTranslating] = useState(false)

  // Auto-detect language
  const detectLanguage = (text: string): 'en' | 'am' => {
    // Ethiopic Unicode block: \u1200-\u137F
    const hasEthiopic = /[\u1200-\u137F]/.test(text)
    return hasEthiopic ? 'am' : 'en'
  }

  // Live translation
  useEffect(() => {
    if (!sourceText.trim()) {
      setTranslatedText('')
      return
    }

    setIsTranslating(true)
    const detected = sourceLang === 'auto' ? detectLanguage(sourceText) : sourceLang
    const effectiveTarget = sourceLang === 'auto'
      ? (detected === 'am' ? 'en' : 'am')
      : targetLang

    if (sourceLang === 'auto') {
      setTargetLang(effectiveTarget)
    }

    // Translate using dynamic master dictionary and heuristic rules
    const result = translateDynamic(sourceText, effectiveTarget)
    setTranslatedText(result)
    setIsTranslating(false)
  }, [sourceText, sourceLang, targetLang, translateDynamic])

  const handleSwap = () => {
    const newSource = targetLang
    const newTarget = sourceLang === 'auto' ? (newSource === 'am' ? 'en' : 'am') : (sourceLang as 'en' | 'am')
    setSourceLang(newSource)
    setTargetLang(newTarget)
    setSourceText(translatedText)
    setTranslatedText(sourceText)
  }

  const handleCopy = () => {
    if (!translatedText) return
    navigator.clipboard.writeText(translatedText).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const handleSaveToHistory = () => {
    if (!sourceText.trim() || !translatedText.trim()) return
    const detected = sourceLang === 'auto' ? detectLanguage(sourceText) : sourceLang
    addTranslationHistory({
      fromText: sourceText,
      toText: translatedText,
      fromLang: detected,
      toLang: targetLang,
    })
  }

  const handleSaveCorrectionToDb = async () => {
    if (!sourceText.trim() || !translatedText.trim()) return
    try {
      await saveCorrection(sourceText.trim().toLowerCase(), targetLang, translatedText.trim())
      setSavedSuccess(true)
      setTimeout(() => setSavedSuccess(false), 2500)
    } catch (e) {
      console.error(e)
    }
  }

  if (!isTranslatorOpen) return null

  return (
    <Dialog open={isTranslatorOpen} onOpenChange={(open) => !open && closeTranslator()}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden rounded-2xl bg-card border-zinc-200 dark:border-zinc-800 shadow-2xl">
        <DialogHeader className="p-4 sm:p-5 border-b border-zinc-100 dark:border-zinc-800 bg-muted/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
                <Globe size={18} />
              </div>
              <div>
                <DialogTitle className="text-base sm:text-lg font-bold text-foreground">
                  {t('Amharic ↔ English Translator', 'የአማርኛ ↔ እንግሊዝኛ ተርጓሚ')}
                </DialogTitle>
                <p className="text-xs text-muted-foreground">
                  {t(
                    'Bidirectional merchant & inventory translator for Merkato trading',
                    'ለመደብርና ለንግድ ሥራዎች የተዘጋጀ የሁለትዮሽ የትርጉም መሣሪያ'
                  )}
                </p>
              </div>
            </div>
            <button
              onClick={closeTranslator}
              className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted text-xs cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </DialogHeader>

        <div className="p-4 sm:p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Controls Bar: Source -> Swap -> Target */}
          <div className="flex items-center justify-between gap-2 p-2 bg-muted/40 rounded-xl border border-zinc-200/60 dark:border-zinc-800 text-xs">
            <div className="flex items-center gap-1.5 flex-1">
              <span className="text-muted-foreground font-medium pl-1">From:</span>
              <select
                value={sourceLang}
                onChange={(e) => setSourceLang(e.target.value as any)}
                className="bg-background border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1 text-xs font-semibold focus:outline-none"
              >
                <option value="auto">✨ Auto-Detect (ራሱ አጣራ)</option>
                <option value="en">🇬🇧 English</option>
                <option value="am">🇪🇹 አማርኛ (Amharic)</option>
              </select>
            </div>

            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleSwap}
              className="h-8 w-8 rounded-lg shrink-0 cursor-pointer hover:bg-primary/10 hover:text-primary"
              title="Swap languages"
            >
              <ArrowLeftRight size={14} />
            </Button>

            <div className="flex items-center gap-1.5 flex-1 justify-end">
              <span className="text-muted-foreground font-medium">To:</span>
              <select
                value={targetLang}
                onChange={(e) => setTargetLang(e.target.value as any)}
                className="bg-background border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1 text-xs font-semibold focus:outline-none"
              >
                <option value="am">🇪🇹 አማርኛ (Amharic)</option>
                <option value="en">🇬🇧 English</option>
              </select>
            </div>
          </div>

          {/* Translation Dual Text Boxes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Input Side */}
            <div className="flex flex-col rounded-xl border border-zinc-200 dark:border-zinc-800 bg-background overflow-hidden focus-within:ring-2 focus-within:ring-primary/20">
              <div className="flex items-center justify-between px-3 py-1.5 bg-muted/30 border-b border-zinc-100 dark:border-zinc-800 text-[11px] text-muted-foreground">
                <span>{sourceLang === 'am' ? '🇪🇹 አማርኛ' : sourceLang === 'en' ? '🇬🇧 English' : '✍️ Source Text'}</span>
                {sourceText && (
                  <button
                    onClick={() => setSourceText('')}
                    className="text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
              <textarea
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                placeholder={t(
                  'Type or paste text to translate (e.g. ወረቀት, Stock In, 10 cartons)...',
                  'ለመተርጎም እዚህ ይጻፉ (ምሳሌ፡ ወረቀት፣ Stock In፣ 10 cartons)...'
                )}
                rows={5}
                className="w-full p-3 text-sm bg-transparent resize-none focus:outline-none placeholder:text-muted-foreground/60"
              />
              <div className="p-2 border-t border-zinc-100 dark:border-zinc-800/60 flex items-center justify-between text-[11px] text-muted-foreground bg-muted/10">
                <span>{sourceText.length} characters</span>
                {sourceText.trim() && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleSaveToHistory}
                    className="h-6 px-2 text-[11px] rounded-md"
                  >
                    <Clock size={12} className="mr-1" />
                    Save to history
                  </Button>
                )}
              </div>
            </div>

            {/* Output Side */}
            <div className="flex flex-col rounded-xl border border-zinc-200 dark:border-zinc-800 bg-muted/10 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-1.5 bg-muted/30 border-b border-zinc-100 dark:border-zinc-800 text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {targetLang === 'am' ? '🇪🇹 አማርኛ' : '🇬🇧 English'}
                </span>
                {isTranslating && <span className="text-primary animate-pulse text-[10px]">Translating...</span>}
              </div>
              <div className="p-3 text-sm flex-1 min-h-[120px] font-medium text-foreground select-text whitespace-pre-wrap">
                {translatedText || (
                  <span className="text-muted-foreground/50 italic text-xs">
                    {t('Translation will appear here...', 'ትርጉሙ እዚህ ይታያል...')}
                  </span>
                )}
              </div>
              <div className="p-2 border-t border-zinc-100 dark:border-zinc-800/60 flex items-center justify-between text-[11px] bg-muted/20">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCopy}
                  disabled={!translatedText}
                  className="h-7 px-2.5 text-xs rounded-lg cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check size={12} className="mr-1 text-emerald-500" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={12} className="mr-1" />
                      <span>Copy</span>
                    </>
                  )}
                </Button>

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleSaveCorrectionToDb}
                  disabled={!sourceText || !translatedText}
                  className="h-7 px-2.5 text-xs rounded-lg text-primary hover:bg-primary/10 cursor-pointer"
                  title="Save this translation to custom database dictionary"
                >
                  {savedSuccess ? (
                    <span className="text-emerald-600 font-bold">✓ Saved to DB!</span>
                  ) : (
                    <>
                      <Save size={12} className="mr-1" />
                      <span>Save Word</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Quick Merchant Phrasebook */}
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground mb-2">
              <Sparkles size={13} className="text-amber-500" />
              <span>{t('Common Merchant Terms (ፈጣን የንግድ ቃላት):', 'ፈጣን የንግድ ቃላት:')}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_PHRASES.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setSourceText(item.en)
                    setTargetLang('am')
                  }}
                  className="text-[11px] px-2.5 py-1 rounded-lg bg-muted/60 hover:bg-muted text-foreground border border-zinc-200/50 dark:border-zinc-800 transition-colors cursor-pointer"
                >
                  {item.en} ↔ {item.am}
                </button>
              ))}
            </div>
          </div>

          {/* Translation History */}
          {translationHistory.length > 0 && (
            <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                  <Clock size={12} />
                  {t('Recent Translations', 'የቅርብ ጊዜ ትርጉሞች')}
                </span>
                <button
                  onClick={clearTranslationHistory}
                  className="text-[11px] text-muted-foreground hover:text-rose-500 flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 size={11} />
                  <span>Clear</span>
                </button>
              </div>

              <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1 text-xs">
                {translationHistory.slice(0, 8).map((hist) => (
                  <div
                    key={hist.id}
                    onClick={() => {
                      setSourceText(hist.fromText)
                      setTranslatedText(hist.toText)
                    }}
                    className="p-2 rounded-lg bg-card hover:bg-muted/40 border border-zinc-200/50 dark:border-zinc-800 flex items-center justify-between gap-3 cursor-pointer transition-colors"
                  >
                    <div className="truncate flex-1">
                      <span className="font-semibold text-foreground">{hist.fromText}</span>
                      <span className="text-muted-foreground mx-1.5">→</span>
                      <span className="text-primary font-medium">{hist.toText}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0 uppercase font-mono">
                      {hist.fromLang} → {hist.toLang}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

