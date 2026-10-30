import React, { useState } from 'react'
import { useLedger } from '../../context/LedgerContext'
import type { RateMode } from '../../types/ledger'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { ArrowRightLeft, Check, TrendingUp, Landmark } from 'lucide-react'

interface ForexConverterDialogProps {
  isOpen: boolean
  onClose: () => void
}

export const ForexConverterDialog: React.FC<ForexConverterDialogProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    rateMode,
    setRateMode,
    blackMarketRate,
    setBlackMarketRate,
    bankRate,
    setBankRate,
  } = useLedger()

  // Local state for manual inputs so user can type freely
  const [localBlackRate, setLocalBlackRate] = useState<string>(
    String(blackMarketRate),
  )
  const [localBankRate, setLocalBankRate] = useState<string>(String(bankRate))
  const [selectedMode, setSelectedMode] = useState<RateMode>(rateMode)

  // Sync local state when opening
  React.useEffect(() => {
    if (isOpen) {
      setLocalBlackRate(String(blackMarketRate))
      setLocalBankRate(String(bankRate))
      setSelectedMode(rateMode)
    }
  }, [isOpen, blackMarketRate, bankRate, rateMode])

  const handleSaveAndApply = () => {
    const blackVal = parseFloat(localBlackRate)
    if (blackVal > 0) {
      setBlackMarketRate(blackVal)
    }
    const bankVal = parseFloat(localBankRate)
    if (bankVal > 0) {
      setBankRate(bankVal)
    }
    setRateMode(selectedMode)
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md sm:rounded-2xl p-5 border-0 shadow-xl bg-card">
        <DialogHeader className="pb-1 text-left">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
              <ArrowRightLeft className="w-4 h-4" />
            </div>
            <div>
              <DialogTitle className="text-base sm:text-lg font-bold text-foreground">
                Exchange Rate (USDT ⇄ ETB)
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Choose Black Market or Bank Rate and enter your price manually:
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* 2 Simple Options Only */}
        <div className="space-y-3 my-3">
          {/* Option 1: Black Market Rate */}
          <div
            onClick={() => setSelectedMode('black_market')}
            className={`p-3.5 rounded-xl transition-all cursor-pointer border-0 ring-2 ${
              selectedMode === 'black_market'
                ? 'bg-emerald-500/10 ring-emerald-500 dark:bg-emerald-950/40'
                : 'bg-muted/30 ring-zinc-950/5 hover:bg-muted/50 dark:ring-white/5 opacity-70 hover:opacity-100'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div
                  className={`w-4 h-4 rounded-full flex items-center justify-center border ${
                    selectedMode === 'black_market'
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-muted-foreground/40 bg-transparent'
                  }`}
                >
                  {selectedMode === 'black_market' && (
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  )}
                </div>
                <span className="text-sm font-bold text-foreground flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                  <span>Black Market Rate</span>
                </span>
              </div>

              <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-md">
                195 – 200 ETB
              </span>
            </div>

            <p className="text-xs text-muted-foreground mb-2.5 pl-6">
              Parallel exchange & Binance P2P market in Ethiopia
            </p>

            <div
              className="pl-6 flex items-center gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              <label className="text-xs font-medium text-foreground whitespace-nowrap">
                1 USDT =
              </label>
              <div className="relative flex-1 max-w-[140px]">
                <Input
                  type="number"
                  step="0.5"
                  min="1"
                  value={localBlackRate}
                  onFocus={() => setSelectedMode('black_market')}
                  onChange={(e) => setLocalBlackRate(e.target.value)}
                  className="text-xs font-mono font-bold text-right pr-11 h-8 bg-card"
                  placeholder="198"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground">
                  ETB
                </span>
              </div>
            </div>
          </div>

          {/* Option 2: Official Bank Rate */}
          <div
            onClick={() => setSelectedMode('bank')}
            className={`p-3.5 rounded-xl transition-all cursor-pointer border-0 ring-2 ${
              selectedMode === 'bank'
                ? 'bg-blue-500/10 ring-blue-500 dark:bg-blue-950/40'
                : 'bg-muted/30 ring-zinc-950/5 hover:bg-muted/50 dark:ring-white/5 opacity-70 hover:opacity-100'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div
                  className={`w-4 h-4 rounded-full flex items-center justify-center border ${
                    selectedMode === 'bank'
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-muted-foreground/40 bg-transparent'
                  }`}
                >
                  {selectedMode === 'bank' && (
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  )}
                </div>
                <span className="text-sm font-bold text-foreground flex items-center gap-1.5">
                  <Landmark className="w-4 h-4 text-blue-600" />
                  <span>Official Bank Rate</span>
                </span>
              </div>

              <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-400 bg-blue-500/15 px-2 py-0.5 rounded-md">
                168 – 175 ETB
              </span>
            </div>

            <p className="text-xs text-muted-foreground mb-2.5 pl-6">
              Commercial bank floating rate in Ethiopia
            </p>

            <div
              className="pl-6 flex items-center gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              <label className="text-xs font-medium text-foreground whitespace-nowrap">
                1 USD =
              </label>
              <div className="relative flex-1 max-w-[140px]">
                <Input
                  type="number"
                  step="0.5"
                  min="1"
                  value={localBankRate}
                  onFocus={() => setSelectedMode('bank')}
                  onChange={(e) => setLocalBankRate(e.target.value)}
                  className="text-xs font-mono font-bold text-right pr-11 h-8 bg-card"
                  placeholder="172"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground">
                  ETB
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-muted-foreground">
            Active:{' '}
            <strong className="text-foreground">
              {selectedMode === 'black_market' ? localBlackRate : localBankRate}{' '}
              ETB
            </strong>
          </span>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="text-xs h-8 rounded-xl"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSaveAndApply}
              className="text-xs font-semibold h-8 px-4 rounded-xl shadow-xs"
            >
              Apply Rate
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
