/**
 * Ethiopian Calendar (ባሕረ ሐሳብ) & Gregorian Calendar Converter
 * 
 * Supports:
 * - Bidirectional Ethiopian <-> Gregorian conversions
 * - Accurate Leap-year handling (Ethiopian leap year: year % 4 === 3)
 * - 13th Month (Pagume / ጳጉሜን) 5 or 6 days
 * - Amharic and English month names and date formatting
 * - ISO Gregorian string normalization for database persistence
 */

export interface EthiopianDate {
  year: number
  month: number
  day: number
}

export interface GregorianDate {
  year: number
  month: number
  day: number
}

export const ETHIOPIAN_MONTHS_AM = [
  '',
  'መስከረም',
  'ጥቅምት',
  'ኅዳር',
  'ታኅሣሥ',
  'ጥር',
  'የካቲት',
  'መጋቢት',
  'ሚያዝያ',
  'ግንቦት',
  'ሰኔ',
  'ሐምሌ',
  'ነሐሴ',
  'ጳጉሜን',
]

export const ETHIOPIAN_MONTHS_EN = [
  '',
  'Meskerem',
  'Tikimt',
  'Hidar',
  'Tahsas',
  'Tir',
  'Yakatit',
  'Megabit',
  'Miazia',
  'Ginbot',
  'Sene',
  'Hamle',
  'Nehase',
  'Pagume',
]

export const GREGORIAN_MONTHS_EN = [
  '',
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export const GREGORIAN_MONTHS_AM = [
  '',
  'ጃንዋሪ',
  'ፌብሩዋሪ',
  'ማርች',
  'ኤፕሪል',
  'ሜይ',
  'ጁን',
  'ጁላይ',
  'ኦገስት',
  'ሴፕቴምበር',
  'ኦክቶበር',
  'ኖቬምበር',
  'ዲሴምበር',
]

// Day anchor: Meskerem 1, 2017 EE = September 11, 2024 CE = Unix Day 19977
const ANCHOR_ETH_YEAR = 2017
const ANCHOR_UNIX_DAY = 19977

/** Checks if an Ethiopian year is a leap year (Pagume has 6 days). */
export function isEthiopianLeapYear(year: number): boolean {
  return ((year % 4) + 4) % 4 === 3
}

/** Returns the number of days in a given Ethiopian month (1 to 13). */
export function getEthiopianDaysInMonth(year: number, month: number): number {
  if (month < 1 || month > 13) return 30
  if (month === 13) {
    return isEthiopianLeapYear(year) ? 6 : 5
  }
  return 30
}

/** Calculates the Unix day number for Meskerem 1 of an Ethiopian year. */
function ethiopianNewYearUnixDay(ethYear: number): number {
  if (ethYear === ANCHOR_ETH_YEAR) return ANCHOR_UNIX_DAY

  if (ethYear > ANCHOR_ETH_YEAR) {
    let days = (ethYear - ANCHOR_ETH_YEAR) * 365
    for (let y = ANCHOR_ETH_YEAR; y < ethYear; y++) {
      if (isEthiopianLeapYear(y)) days += 1
    }
    return ANCHOR_UNIX_DAY + days
  } else {
    let days = (ANCHOR_ETH_YEAR - ethYear) * 365
    for (let y = ethYear; y < ANCHOR_ETH_YEAR; y++) {
      if (isEthiopianLeapYear(y)) days += 1
    }
    return ANCHOR_UNIX_DAY - days
  }
}

/** Converts Gregorian Date (or Y, M, D) to days since 1970-01-01 UTC. */
function gregorianToUnixDay(year: number, month: number, day: number): number {
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000)
}

/** Converts Unix day count to Gregorian Y, M, D. */
function unixDayToGregorian(unixDay: number): GregorianDate {
  const d = new Date(unixDay * 86400000)
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  }
}

/**
 * Converts an Ethiopian date to a Gregorian date.
 */
export function ethiopianToGregorian(
  ethYear: number,
  ethMonth: number,
  ethDay: number
): GregorianDate {
  const clampedMonth = Math.min(Math.max(1, ethMonth), 13)
  const maxDay = getEthiopianDaysInMonth(ethYear, clampedMonth)
  const clampedDay = Math.min(Math.max(1, ethDay), maxDay)

  const newYearUnixDay = ethiopianNewYearUnixDay(ethYear)
  const dayInYear = (clampedMonth - 1) * 30 + (clampedDay - 1)
  const targetUnixDay = newYearUnixDay + dayInYear
  return unixDayToGregorian(targetUnixDay)
}

/**
 * Converts a Gregorian date (Date object or year, month, day numbers) to Ethiopian date.
 */
export function gregorianToEthiopian(
  yearOrDate: Date | number,
  month?: number,
  day?: number
): EthiopianDate {
  let gYear: number
  let gMonth: number
  let gDay: number

  if (yearOrDate instanceof Date) {
    gYear = yearOrDate.getFullYear()
    gMonth = yearOrDate.getMonth() + 1
    gDay = yearOrDate.getDate()
  } else {
    gYear = yearOrDate
    gMonth = month || 1
    gDay = day || 1
  }

  const targetUnixDay = gregorianToUnixDay(gYear, gMonth, gDay)

  let ethYear = gYear - 8
  while (ethiopianNewYearUnixDay(ethYear + 1) <= targetUnixDay) {
    ethYear++
  }
  while (ethiopianNewYearUnixDay(ethYear) > targetUnixDay) {
    ethYear--
  }

  const daysIntoYear = targetUnixDay - ethiopianNewYearUnixDay(ethYear)
  const ethMonth = Math.floor(daysIntoYear / 30) + 1
  const ethDay = (daysIntoYear % 30) + 1

  return { year: ethYear, month: ethMonth, day: ethDay }
}

/**
 * Parses an ISO date string (YYYY-MM-DD) into Gregorian date numbers.
 */
export function parseIsoDate(isoString: string): GregorianDate {
  const clean = (isoString || '').trim().split('T')[0]
  const parts = clean.split('-').map((p) => parseInt(p, 10))
  if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    return { year: parts[0], month: parts[1], day: parts[2] }
  }
  const now = new Date()
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  }
}

/**
 * Formats Gregorian numbers into canonical ISO 'YYYY-MM-DD' string for database storage.
 */
export function formatIsoDate(g: GregorianDate): string {
  const y = String(g.year).padStart(4, '0')
  const m = String(g.month).padStart(2, '0')
  const d = String(g.day).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Formats Ethiopian date numbers into 'YYYY-MM-DD' format string.
 */
export function formatEthiopianDateString(eth: EthiopianDate): string {
  const y = String(eth.year).padStart(4, '0')
  const m = String(eth.month).padStart(2, '0')
  const d = String(eth.day).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Formats Ethiopian date for user interface display.
 * e.g. "ጥቅምት 25, 2019" (Amharic) or "Tikimt 25, 2019" (English).
 */
export function formatEthiopianDisplay(
  eth: EthiopianDate,
  lang: 'am' | 'en' = 'am'
): string {
  const monthName =
    lang === 'am'
      ? ETHIOPIAN_MONTHS_AM[eth.month] || `ወር ${eth.month}`
      : ETHIOPIAN_MONTHS_EN[eth.month] || `Month ${eth.month}`
  return `${monthName} ${eth.day}, ${eth.year}`
}

/**
 * Converts ISO Gregorian date string (e.g. from DB) into Ethiopian display string.
 */
export function isoToEthiopianDisplay(
  isoDateStr: string,
  lang: 'am' | 'en' = 'am'
): string {
  if (!isoDateStr) return '—'
  const greg = parseIsoDate(isoDateStr)
  const eth = gregorianToEthiopian(greg.year, greg.month, greg.day)
  return formatEthiopianDisplay(eth, lang)
}

