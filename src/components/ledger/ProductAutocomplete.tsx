import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Search, Plus, Check } from 'lucide-react'
import type { StoreInventoryItem } from '../../types/ledger'
import { searchInventoryProducts } from '../../lib/api'
import { useLanguage } from '../../context/LanguageContext'

interface ProductAutocompleteProps {
  value: string
  onChange: (value: string) => void
  onSelectProduct: (product: StoreInventoryItem) => void
  storeId?: string
  placeholder?: string
  disabled?: boolean
  required?: boolean
}

export const ProductAutocomplete: React.FC<ProductAutocompleteProps> = ({
  value,
  onChange,
  onSelectProduct,
  storeId,
  placeholder,
  disabled = false,
  required = true,
}) => {
  const { t } = useLanguage()
  const [suggestions, setSuggestions] = useState<StoreInventoryItem[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Debounced search against real database records
  const queryTimerRef = useRef<NodeJS.Timeout | null>(null)

  const performSearch = useCallback(
    async (searchTerm: string) => {
      setLoading(true)
      try {
        const results = await searchInventoryProducts(searchTerm, storeId, true)
        setSuggestions(results)
      } catch (err) {
        console.error('Error searching products:', err)
        setSuggestions([])
      } finally {
        setLoading(false)
      }
    },
    [storeId]
  )

  useEffect(() => {
    if (queryTimerRef.current) clearTimeout(queryTimerRef.current)

    queryTimerRef.current = setTimeout(() => {
      performSearch(value)
    }, 250)

    return () => {
      if (queryTimerRef.current) clearTimeout(queryTimerRef.current)
    }
  }, [value, performSearch])

  // Click outside listener to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (product: StoreInventoryItem) => {
    onChange(product.productName)
    onSelectProduct(product)
    setIsOpen(false)
  }

  const isExactMatch = suggestions.some(
    (p) => p.productName.trim().toLowerCase() === value.trim().toLowerCase()
  )

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <input
          type="text"
          required={required}
          disabled={disabled}
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            setIsOpen(true)
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={
            placeholder || t('Search existing product...', 'ያሉ ምርቶችን ይፈልጉ...')
          }
          className="w-full h-9 pl-3 pr-8 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs"
          autoComplete="off"
        />
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
          {loading ? (
            <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          ) : (
            <Search size={14} />
          )}
        </div>
      </div>

      {/* Dropdown Suggestions */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-700 bg-popover text-popover-foreground shadow-lg text-xs">
          {suggestions.length > 0 ? (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {suggestions.map((p) => {
                const isSelected =
                  p.productName.toLowerCase() === value.trim().toLowerCase()
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(p)}
                      className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-muted/50 cursor-pointer transition-colors ${
                        isSelected ? 'bg-primary/10 font-bold' : ''
                      }`}
                    >
                      <div className="flex-1 min-w-0 pr-2">
                        <div className="font-semibold text-foreground truncate">
                          {p.productName}
                        </div>
                        <div className="text-[10px] text-muted-foreground flex items-center gap-2 mt-0.5">
                          {p.sku && <span>SKU: {p.sku}</span>}
                          <span>
                            {p.pcsPerCarton} {t('pcs/ctn', 'ፍሬ/ካርቶን')}
                          </span>
                          <span>
                            ETB {Number(p.pricePerPiece || p.unitPrice).toFixed(2)}
                          </span>
                        </div>
                      </div>
                      {isSelected && (
                        <Check size={14} className="text-primary shrink-0" />
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : value.trim() ? (
            <div className="p-2.5 text-center text-muted-foreground text-xs">
              <p>{t('No matching product found.', 'ምንም የተገኘ ምርት የለም።')}</p>
              <div className="mt-1 text-[11px] text-primary font-medium flex items-center justify-center gap-1">
                <Plus size={12} />
                <span>
                  {t(
                    `Create new product: "${value.trim()}"`,
                    `አዲስ ምርት መዝግብ፡ "${value.trim()}"`
                  )}
                </span>
              </div>
            </div>
          ) : (
            <div className="p-2.5 text-center text-muted-foreground text-xs">
              {t('Type to search products...', 'ምርቶችን ለመፈለግ ጽሑፍ ያስገቡ...')}
            </div>
          )}

          {value.trim() && !isExactMatch && suggestions.length > 0 && (
            <div className="border-t border-zinc-200 dark:border-zinc-700 bg-muted/20 p-2 text-[11px] text-primary flex items-center gap-1 font-semibold">
              <Plus size={12} />
              <span>
                {t(
                  `Will register new: "${value.trim()}"`,
                  `እንደ አዲስ ይመዘገባል፡ "${value.trim()}"`
                )}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

