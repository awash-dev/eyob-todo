export interface MarketRatePreset {
  id: string
  name: string
  label: string
  rate: number
  range: string
  type: 'black_market' | 'bank'
  description: string
}

export const CURRENT_ETHIOPIAN_RATES: MarketRatePreset[] = [
  {
    id: 'black_market',
    name: 'Black Market / USDT P2P',
    label: 'Black Market / P2P',
    rate: 198.0,
    range: '195 – 200 ETB',
    type: 'black_market',
    description: 'Current parallel & Binance P2P market rate for 1 USDT / USD',
  },
  {
    id: 'bank_official',
    name: 'Official Commercial Bank Rate',
    label: 'Official Bank Rate',
    rate: 172.0,
    range: '168 – 175 ETB',
    type: 'bank',
    description: 'Official commercial bank rate in Ethiopia (168 – 175 ETB)',
  },
]

export function convertUsdtToEtb(usdtAmount: number, rate: number): number {
  return Math.round(usdtAmount * rate * 100) / 100
}

export function convertEtbToUsdt(etbAmount: number, rate: number): number {
  if (rate <= 0) return 0
  return Math.round((etbAmount / rate) * 100) / 100
}
