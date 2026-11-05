import React, { useState, useEffect, useMemo } from 'react'
import {
  ethiopianToGregorian,
  gregorianToEthiopian,
  formatIsoDate,
  parseIsoDate,
  getEthiopianDaysInMonth,
  ETHIOPIAN_MONTHS_AM,
  ETHIOPIAN_MONTHS_EN,
  formatEthiopianDisplay,
} from '../../lib/ethiopianCalendar'
import { useLanguage } from '../../context/LanguageContext'

interface EthioDatePickerProps {
  value: string // Normalized ISO 'YYYY-MM-DD'
  onChange: (isoDate: string) => void
  disabled?: boolean
  label?: string
  className?: string
}

export const EthioDatePicker: React.FC<EthioDatePickerProps> = ({
  value,
  onChange,
  disabled = false,
  label,
  className = '',
}) => {
  const { language } = useLanguage()
  const isAm = language === 'am'

  // Calendar mode: 'ethiopian' or 'gregorian'
  const [calendarMode, setCalendarMode] = useState<'ethiopian' | 'gregorian'>('ethiopian')

  // Parse current value
  const currentGreg = useMemo(() => parseIsoDate(value), [value])
  const currentEth = useMemo(
    () => gregorianToEthiopian(currentGreg.year, currentGreg.month, currentGreg.day),
    [currentGreg]
  )

  // Ethiopian states
  const [ethYear, setEthYear] = useState<number>(currentEth.year)
  const [ethMonth, setEthMonth] = useState<number>(currentEth.month)
  const [ethDay, setEthDay] = useState<number>(currentEth.day)

  // Keep in sync when external value changes
  useEffect(() => {
    setEthYear(currentEth.year)
    setEthMonth(currentEth.month)
    setEthDay(currentEth.day)
  }, [currentEth.year, currentEth.month, currentEth.day])

  // Days available in selected Ethiopian month
  const maxDays = useMemo(() => {
    return getEthiopianDaysInMonth(ethYear, ethMonth)
  }, [ethYear, ethMonth])

  // Adjust day if month changed to Pagume
  useEffect(() => {
    if (ethDay > maxDays) {
      setEthDay(maxDays)
      const greg = ethiopianToGregorian(ethYear, ethMonth, maxDays)
      onChange(formatIsoDate(greg))
    }
  }, [maxDays, ethDay, ethYear, ethMonth, onChange])

  const handleEthChange = (newYear: number, newMonth: number, newDay: number) => {
    const daysInM = getEthiopianDaysInMonth(newYear, newMonth)
    const clampedDay = Math.min(newDay, daysInM)
    setEthYear(newYear)
    setEthMonth(newMonth)
    setEthDay(clampedDay)
    const greg = ethiopianToGregorian(newYear, newMonth, clampedDay)
    onChange(formatIsoDate(greg))
  }

  const handleGregChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    if (val) {
      onChange(val)
    }
  }

  // Month names based on language
  const monthNames = isAm ? ETHIOPIAN_MONTHS_AM : ETHIOPIAN_MONTHS_EN

  // Year options: past 10 years to next 5 years
  const yearOptions = useMemo(() => {
    const years: number[] = []
    const start = currentEth.year - 8
    const end = currentEth.year + 5
    for (let y = start; y <= end; y++) {
      years.push(y)
    }
    return years
  }, [currentEth.year])

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        {label && (
          <label className="text-xs font-semibold text-foreground block">
            {label}
          </label>
        )}
        <div className="inline-flex rounded-md border border-zinc-200 dark:border-zinc-700 p-0.5 bg-muted/30 text-[10px]">
          <button
            type="button"
            onClick={() => setCalendarMode('ethiopian')}
            className={`px-2 py-0.5 rounded font-medium transition-colors ${
              calendarMode === 'ethiopian'
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {isAm ? 'ዓ.ም' : 'E.C.'}
          </button>
          <button
            type="button"
            onClick={() => setCalendarMode('gregorian')}
            className={`px-2 py-0.5 rounded font-medium transition-colors ${
              calendarMode === 'gregorian'
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {isAm ? 'ፈረንጅ' : 'G.C.'}
          </button>
        </div>
      </div>

      {calendarMode === 'ethiopian' ? (
        <div className="space-y-1">
          <div className="grid grid-cols-3 gap-1.5">
            {/* Day */}
            <div>
              <select
                disabled={disabled}
                value={ethDay}
                onChange={(e) =>
                  handleEthChange(ethYear, ethMonth, parseInt(e.target.value, 10))
                }
                className="w-full h-8.5 px-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {Array.from({ length: maxDays }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            {/* Month */}
            <div>
              <select
                disabled={disabled}
                value={ethMonth}
                onChange={(e) =>
                  handleEthChange(ethYear, parseInt(e.target.value, 10), ethDay)
                }
                className="w-full h-8.5 px-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {Array.from({ length: 13 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {monthNames[m]}
                  </option>
                ))}
              </select>
            </div>

            {/* Year */}
            <div>
              <select
                disabled={disabled}
                value={ethYear}
                onChange={(e) =>
                  handleEthChange(parseInt(e.target.value, 10), ethMonth, ethDay)
                }
                className="w-full h-8.5 px-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y} {isAm ? 'ዓ.ም' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground px-1">
            <span>{formatEthiopianDisplay({ year: ethYear, month: ethMonth, day: ethDay }, isAm ? 'am' : 'en')}</span>
            <span className="font-mono">G.C. {value}</span>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <input
            type="date"
            disabled={disabled}
            value={value}
            onChange={handleGregChange}
            className="w-full h-8.5 px-2.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono"
          />
          <div className="flex items-center justify-between text-[10px] text-muted-foreground px-1">
            <span>
              {isAm ? 'ኢትዮጵያ፡ ' : 'Ethiopian: '}
              {formatEthiopianDisplay(currentEth, isAm ? 'am' : 'en')}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

