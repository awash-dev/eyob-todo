import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { getTranslationsFromDb, saveCustomTranslation } from '../lib/api'

export type Language = 'en' | 'am'

export interface TranslationHistoryItem {
  id: string
  fromText: string
  toText: string
  fromLang: string
  toLang: string
  timestamp: number
}

interface LanguageContextType {
  language: Language
  isAmharic: boolean
  setLanguage: (lang: Language) => void
  toggleLanguage: () => void
  t: (enOrKey: string, amFallback?: string) => string
  translateDynamic: (text: string, targetLang?: Language) => string
  translateDbText: (text: string | null | undefined) => string
  // Advanced Translation Tool Modal
  isTranslatorOpen: boolean
  openTranslator: () => void
  closeTranslator: () => void
  translationHistory: TranslationHistoryItem[]
  addTranslationHistory: (item: Omit<TranslationHistoryItem, 'id' | 'timestamp'>) => void
  clearTranslationHistory: () => void
  saveCorrection: (key: string, lang: Language, text: string) => Promise<void>
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

const STORAGE_KEY = 'app_language'
const HISTORY_KEY = 'translation_history'

// Comprehensive Bilingual Master Dictionary
const MASTER_DICTIONARY: Record<string, { en: string; am: string }> = {
  // Navigation & Tabs
  'customers': { en: 'Customers', am: 'ደንበኞች' },
  'suppliers': { en: 'Suppliers', am: 'አቅራቢዎች' },
  'stock items': { en: 'Stock & Store', am: 'የመደብር ዕቃዎች' },
  'statements': { en: 'Statements', am: 'የሒሳብ መግለጫ' },
  'settings': { en: 'Settings', am: 'ቅንብሮች' },
  'translator': { en: 'Translator Tool', am: 'ተርጓሚ መሣሪያ' },
  'all shops': { en: 'All Shops', am: 'ሁሉም መደብሮች' },

  // Commands & Common Actions
  'search': { en: 'Search', am: 'ፈልግ' },
  'clear search': { en: 'Clear Search', am: 'ፍለጋውን አጽዳ' },
  'clear filter': { en: 'Clear Filter', am: 'ማጣሪያውን አጽዳ' },
  'add': { en: 'Add', am: 'አክል' },
  'edit': { en: 'Edit', am: 'አስተካክል' },
  'delete': { en: 'Delete', am: 'ሰርዝ' },
  'cancel': { en: 'Cancel', am: 'ተመለስ' },
  'save': { en: 'Save', am: 'አስቀምጥ' },
  'saving': { en: 'Saving...', am: 'በማስቀመጥ ላይ...' },
  'submit': { en: 'Submit', am: 'መዝግብ' },
  'copy summary': { en: 'Copy Summary', am: 'ማጠቃለያ ቅዳ' },
  'export': { en: 'Export', am: 'አውርድ' },
  'refresh': { en: 'Refresh', am: 'አድስ' },
  'close': { en: 'Close', am: 'ዝጋ' },
  'actions': { en: 'Actions', am: 'እርምጃዎች' },
  'open menu': { en: 'Open menu', am: 'ሜኑ ክፈት' },

  // Smart Inventory & Stock In / Stock Out
  'smart inventory management': { en: 'Smart Inventory Management', am: 'ዘመናዊ የመደብር ዕቃ አስተዳደር' },
  'stock in': { en: 'Stock In (+)', am: 'ዕቃ ገቢ (+)' },
  'stock out': { en: 'Stock Out (-)', am: 'ዕቃ ወጪ (-)' },
  'register product': { en: 'Register Product', am: 'አዲስ ምርት መዝግብ' },
  'product name': { en: 'Product / Item Name', am: 'የምርት / ዕቃ ስም' },
  'product / item name': { en: 'Product / Item Name', am: 'የምርት / ዕቃ ስም' },
  'product id / sku': { en: 'Product ID / SKU', am: 'የዕቃ መለያ' },
  'category': { en: 'Category', am: 'ምድብ' },
  'available stock': { en: 'Available Stock', am: 'ያለ ክምችት' },
  'previous stock': { en: 'Previous Stock', am: 'የቀድሞ ክምችት' },
  'incoming quantity': { en: 'Incoming Quantity', am: 'ገቢ ብዛት' },
  'outgoing quantity': { en: 'Outgoing Quantity', am: 'ወጪ ብዛት' },
  'new stock': { en: 'New Stock', am: 'አዲስ ክምችት' },
  'new stock balance': { en: 'New Stock Balance', am: 'አዲስ የክምችት መጠን' },
  'remaining stock': { en: 'Remaining Stock', am: 'ቀሪ ክምችት' },
  'purchase price': { en: 'Purchase Price (ETB)', am: 'የግዢ ዋጋ (ብር)' },
  'purchase price (etb)': { en: 'Purchase Price (ETB)', am: 'የግዢ ዋጋ (ብር)' },
  'selling price': { en: 'Selling Price (ETB)', am: 'የሽያጭ ዋጋ (ብር)' },
  'selling price (etb)': { en: 'Selling Price (ETB)', am: 'የሽያጭ ዋጋ (ብር)' },
  'unit cost (etb)': { en: 'Unit Cost (ETB)', am: 'የአንዱ ዋጋ (ብር)' },
  'total value (etb)': { en: 'Total Value (ETB)', am: 'ጠቅላላ ዋጋ (ብር)' },
  'total value': { en: 'Total Value', am: 'ጠቅላላ ዋጋ' },
  'packaging breakdown': { en: 'Packaging Breakdown', am: 'የማሸጊያ ዝርዝር' },
  'total units': { en: 'Total Units', am: 'ጠቅላላ ፍሬ / ዩኒት' },
  'cartons': { en: 'Cartons', am: 'ካርቶን' },
  'pieces per carton': { en: 'Pieces per Carton', am: 'ፍሬ በካርቶን' },
  'base unit': { en: 'Base Unit', am: 'ዋና መለኪያ' },
  'supplier': { en: 'Supplier', am: 'አቅራቢ' },
  'supplier / source': { en: 'Supplier / Source', am: 'አቅራቢ / ምንጭ' },
  'customer / destination': { en: 'Customer / Destination', am: 'ተቀባይ / መዳረሻ' },
  'reference / invoice #': { en: 'Reference / Invoice #', am: 'የማመሳከሪያ / ደረሰኝ ቁጥር' },
  'stock valuation:': { en: 'Stock Valuation:', am: 'የዕቃ ክምችት ግምት:' },
  'total:': { en: 'Total:', am: 'ጠቅላላ:' },
  'total products': { en: 'Total Products', am: 'ጠቅላላ ምርቶች' },
  'cartons total': { en: 'cartons total', am: 'ጠቅላላ ካርቶን' },
  'units': { en: 'units', am: 'ፍሬ / ዩኒት' },
  'pieces': { en: 'pieces', am: 'ፍሬ' },
  'pcs': { en: 'pcs', am: 'ፍሬ' },
  'direct units': { en: 'Direct Units', am: 'ቀጥታ ፍሬ' },
  'stock total': { en: 'Stock Total', am: 'ጠቅላላ የክምችት ዋጋ' },
  'net balance': { en: 'Net Balance', am: 'የተጣራ ቀሪ ሂሳብ' },
  'select existing product': { en: 'Select existing product...', am: 'ያለ ምርት ይምረጡ...' },
  'or register a new product': { en: 'or register a new product', am: 'ወይም አዲስ ምርት ይመዝግቡ' },

  // Validation & Prompts
  'insufficient stock warning': {
    en: 'Outgoing quantity exceeds available stock!',
    am: 'ወጪ የተደረገው ብዛት ካለው ክምችት በላይ ነው!',
  },
  'cannot exceed stock': {
    en: 'Cannot exceed available stock quantity.',
    am: 'ካለው የክምችት መጠን በላይ ማውጣት አይቻልም።',
  },
  'product not found': {
    en: 'Product not found. Please register a new product first.',
    am: 'ምርቱ አልተገኘም። እባክዎ መጀመሪያ አዲስ ምርት ይመዝግቡ።',
  },
  'auto filled': {
    en: 'Automatically populated from existing product data',
    am: 'ከነበረው የምርት መረጃ በራሱ ተሞልቷል',
  },

  // DELALA Module
  'delala name': { en: 'Delala Name', am: 'የደላላ ስም' },
  'product': { en: 'Product', am: 'ምርት' },
  'price': { en: 'Price', am: 'ዋጋ' },
  'sign': { en: 'Sign (+ / -)', am: 'ምልክት (+ / -)' },
  'positive': { en: '+ Positive', am: '+ ገቢ / አዎንታዊ' },
  'negative': { en: '- Negative', am: '- ወጪ / አሉታዊ' },
  'total positive': { en: 'Total Positive (+)', am: 'ጠቅላላ ገቢ (+)' },
  'total negative': { en: 'Total Negative (-)', am: 'ጠቅላላ ወጪ (-)' },
  'final balance': { en: 'Final Balance', am: 'የመጨረሻ ሂሳብ' },
  'add delala entry': { en: '+ Add Delala Entry', am: '+ አዲስ የደላላ መዝገብ' },
  'filter by date': { en: 'Filter by date', am: 'በቀን አጣራ' },
  'all dates': { en: 'All dates', am: 'ሁሉም ቀናት' },

  // Customer & Supplier Ledger
  'add customer entry': { en: '+ Add Customer Entry', am: '+ አዲስ የደንበኛ መዝገብ' },
  'add supplier entry': { en: '+ Add Supplier Entry', am: '+ አዲስ የአቅራቢ መዝገብ' },
  'add stock entry': { en: '+ Add Stock Entry', am: '+ አዲስ የመደብር መዝገብ' },
  'debit (+ owes)': { en: 'Debit (+ Goods)', am: 'ዕቃ ወሰደ / ገቢ (+)' },
  'credit (- payment)': { en: 'Credit (- Payment)', am: 'ክፍያ ከፈለ / ወጪ (-)' },
  'goods': { en: 'Goods', am: 'ዕቃ' },
  'payment': { en: 'Payment', am: 'ክፍያ' },
  'cash': { en: 'Cash', am: 'ጥሬ ገንዘብ' },
  'cbe': { en: 'CBE', am: 'የኢትዮጵያ ንግድ ባንክ' },
  'awash': { en: 'Awash Bank', am: 'አዋሽ ባንክ' },
  'telebirr': { en: 'Telebirr', am: 'ቴሌብር' },

  // Table Headers & Layout
  'item': { en: 'item', am: 'ዕቃ' },
  'items': { en: 'items', am: 'ዕቃዎች' },
  'date': { en: 'Date', am: 'ቀን' },
  'notes': { en: 'Notes', am: 'ማስታወሻ' },
  'no matching records': { en: 'No matching records found', am: 'ምንም የተገኘ መዝገብ የለም' },
  'no records yet': { en: 'No records yet', am: 'ምንም የተመዘገበ የለም' },
}

// Common dictionary for Amharic words to English (Pure English only)
const AMHARIC_TO_ENGLISH_MAP: Record<string, string> = {
  'ወረቀት': 'Paper',
  'አምፖል': 'Bulb',
  'ሽቦ': 'Wire',
  'የኤሌክትሪክ ሽቦ': 'Electric Wire',
  'ማብሪያ': 'Switch',
  'ሶኬት': 'Socket',
  'ቆጣሪ': 'Breaker / Meter',
  'ሰርኪውት ብሬከር': 'Circuit Breaker',
  'ስኳር': 'Sugar',
  'ዘይት': 'Oil',
  'ሳሙና': 'Soap',
  'ዱቄት': 'Flour',
  'መርካቶ': 'Merkato',
  'ቦሌ': 'Bole',
  'መደብር': 'Store',
  'ደላላ': 'Broker',
  'ደንበኛ': 'Customer',
  'አቅራቢ': 'Supplier',
  'ገቢ': 'Incoming',
  'ወጪ': 'Outgoing',
  'ጥሬ ገንዘብ': 'Cash',
  'ካርቶን': 'Carton',
  'ፍሬ': 'Pieces',
  'ብር': 'ETB',
  'ናሙና': 'Sample',
  'ሙከራ': 'Test',
  'ሙከራ 2': 'Test 2',
  'ጠቅላላ': 'General',
  'መሀመድ': 'Mohammed',
  'አህመድ': 'Ahmed',
  'አሌክስ ጆንሰን': 'Alex Johnson',
  'ከሊል አጊንቢ': 'Kelil Aginbi',
  'አዋሽ ኬብል ፋብሪካ': 'Awash Cable Factory',
  'አዋሽ ወረቀት ፋብሪካ': 'Awash Paper Mill',
  'የተወሰደ እቃ': 'Goods Delivered',
  'የተመለሰ እቃ': 'Returned Goods',
  'የተመለሰ ሽቦ': 'Returned Wire',
  'ጥሬ ገንዘብ የተከፈለ': 'Cash Payment Received',
  'የጥሬ ገንዘብ ክፍያ': 'Cash Payment Received',
  'የዕቃ ዝውውር': 'Stock Delivery',
  'ንግድ ባንክ': 'CBE',
  'ቴሌብር': 'Telebirr',
  'አዋሽ ባንክ': 'Awash Bank',
  'ዳሽን ባንክ': 'Dashen Bank',
  'አቢሲኒያ ባንክ': 'Bank of Abyssinia',
  'ሲቢኢ ብር': 'CBE Birr',
}

// Comprehensive DB Attribute & Dynamic Data Dictionary (Pure Amharic only - No English in parentheses)
export const DB_ATTRIBUTE_MAP: Record<string, string> = {
  // Commodities & Products
  'paper': 'ወረቀት',
  'wire': 'ሽቦ',
  'cable': 'ኬብል',
  'bulb': 'አምፖል',
  'switch': 'ማብሪያ',
  'socket': 'ሶኬት',
  'breaker': 'ሰርኪውት ብሬከር',
  'meter': 'ቆጣሪ',
  'flour': 'ዱቄት',
  'sugar': 'ስኳር',
  'oil': 'ዘይት',
  'soap': 'ሳሙና',
  'general': 'ጠቅላላ',
  'sample': 'ናሙና',
  'test': 'ሙከራ',
  'test2': 'ሙከራ 2',
  'tre': 'ትሬ',
  'safari': 'ሳፋሪ',
  '12w safari': '12W ሳፋሪ',
  '2.5 bmt': '2.5 BMT ሽቦ',
  '2.5 bmt wire': '2.5 BMT ሽቦ',
  'returned wire': 'የተመለሰ ሽቦ',
  'cash payment received': 'የጥሬ ገንዘብ ክፍያ',
  'goods taken on credit': 'በብድር የተወሰደ ዕቃ',
  'goods returned': 'የተመለሰ ዕቃ',
  'alex johnson': 'አሌክስ ጆንሰን',
  'mohammed': 'መሀመድ',
  'ahmed': 'አህመድ',
  'kelil aginbi': 'ከሊል አጊንቢ',
  'awash cable factory': 'አዋሽ ኬብል ፋብሪካ',
  'awash paper mill': 'አዋሽ ወረቀት ፋብሪካ',

  // Units
  'pcs': 'ፍሬ',
  'pieces': 'ፍሬ',
  'roll': 'ሮል',
  'rolls': 'ሮል',
  'carton': 'ካርቶን',
  'cartons': 'ካርቶን',
  'ctn': 'ካርቶን',
  'ctns': 'ካርቶን',
  'box': 'ሳጥን',
  'boxes': 'ሳጥን',
  'packet': 'ፓኬት',
  'packets': 'ፓኬት',
  'bundle': 'ጥቅል',
  'bundles': 'ጥቅል',
  'direct units': 'ቀጥታ ፍሬ',
  'units': 'ፍሬ',

  // Banks & Payment Channels
  'cbe': 'ንግድ ባንክ',
  'commercial bank of ethiopia': 'የኢትዮጵያ ንግድ ባንክ',
  'cbe birr': 'ሲቢኢ ብር',
  'telebirr': 'ቴሌብር',
  'awash': 'አዋሽ ባንክ',
  'awash bank': 'አዋሽ ባንክ',
  'dashen': 'ዳሽን ባንክ',
  'dashen bank': 'ዳሽን ባንክ',
  'boa': 'አቢሲኒያ ባንክ',
  'abyssinia': 'አቢሲኒያ ባንክ',
  'bank of abyssinia': 'አቢሲኒያ ባንክ',
  'cash': 'ጥሬ ገንዘብ',
  'check': 'ቼክ',
  'oromia': 'ኦሮሚያ ባንክ',
  'coop': 'ኅብረት ሥራ ባንክ',
  'hibret': 'ኅብረት ባንክ',
  'zemen': 'ዘመን ባንክ',
  'berhan': 'ብርሃን ባንክ',
  'nib': 'ንብ ባንክ',
  'wegagen': 'ወጋገን ባንክ',
  'abay': 'አባይ ባንክ',
  'bunna': 'ቡና ባንክ',
  'enat': 'እናት ባንክ',
  'sinqee': 'ሲንቄ ባንክ',
  'stock delivery': 'የዕቃ ዝውውር',
  'delivery': 'ዝውውር',
  'payment': 'ክፍያ',
  'deposit': 'ተቀማጭ',
}

const PHRASE_RULES: Array<[RegExp, (match: string, ...groups: any[]) => string]> = [
  // Compound merchant phrases (Pure Amharic only - no English in parentheses)
  [/merkato wholesale customer\s*-\s*delala credit account/gi, () => 'የመርካቶ ጅምላ ደንበኛ - የደላላ ብድር ሒሳብ'],
  [/merkato wholesale customer\s*-\s*delala-linked invoice/gi, () => 'የመርካቶ ጅምላ ደንበኛ - ከደላላ ጋር የተገናኘ ደረሰኝ'],
  [/delala credit account/gi, () => 'የደላላ ብድር ሒሳብ'],
  [/delala-linked invoice/gi, () => 'ከደላላ ጋር የተገናኘ ደረሰኝ'],
  [/broker-linked invoice/gi, () => 'ከደላላ ጋር የተገናኘ ደረሰኝ'],
  [/broker account/gi, () => 'የደላላ ሒሳብ'],
  [/defective roll returned/gi, () => 'የተበላሸ ጥቅል ተመላሽ'],
  [/defective roll/gi, () => 'የተበላሸ ጥቅል'],
  [/telebirr confirmation(?:\s+([a-zA-Z0-9_-]+))?/gi, (_, tx) => tx ? `የቴሌብር ማረጋገጫ ${tx}` : 'የቴሌብር ማረጋገጫ'],
  [/cash payment received(?:\s*\([^)]*\))?/gi, () => 'የጥሬ ገንዘብ ክፍያ'],
  [/goods taken on credit/gi, () => 'በብድር የተወሰደ ዕቃ'],
  [/goods returned/gi, () => 'የተመለሰ ዕቃ'],
  [/wholesale customer/gi, () => 'የጅምላ ደንበኛ'],
  [/credit account/gi, () => 'የብድር ሒሳብ'],
  [/paper mill/gi, () => 'ወረቀት ፋብሪካ'],
  [/cable factory/gi, () => 'ኬብል ፋብሪካ'],
  [/returned wire(?:\s*\([^)]*\))?/gi, () => 'የተመለሰ ሽቦ'],
  [/2\.5\s*bmt\s*wire(?:\s*\([^)]*\))?/gi, () => '2.5 BMT ሽቦ'],

  // Packaging and Unit expressions
  [/(\d+(?:,\d+)?)\s*ctns?\s*[×x*]\s*(\d+(?:,\d+)?)\s*pcs?\b/gi, (_, c, p) => `${c} ካርቶን × ${p} ፍሬ`],
  [/(\d+(?:,\d+)?)\s*ctns?\s*\+\s*(\d+(?:,\d+)?)\s*pcs?\b/gi, (_, c, p) => `${c} ካርቶን + ${p} ፍሬ`],
  [/(\d+(?:,\d+)?)\s*rolls?\b/gi, (_, qty) => `${qty} ሮል`],
  [/(\d+(?:,\d+)?)\s*ctns?\b/gi, (_, qty) => `${qty} ካርቶን`],
  [/(\d+(?:,\d+)?)\s*cartons?\b/gi, (_, qty) => `${qty} ካርቶን`],
  [/(\d+(?:,\d+)?)\s*pcs\b/gi, (_, qty) => `${qty} ፍሬ`],
  [/(\d+(?:,\d+)?)\s*pieces\b/gi, (_, qty) => `${qty} ፍሬ`],
  [/direct units?\s*(?:\(([^)]+)\))?/gi, (_, u) => u ? `ቀጥታ ፍሬ (${u})` : 'ቀጥታ ፍሬ'],

  // Dates with English month names inside notes / subtitles
  [/\bJan(?:uary)?\s+(\d{1,2}),?\s*(\d{4})\b/gi, (_, d, y) => `ጥር ${d}, ${y}`],
  [/\bFeb(?:ruary)?\s+(\d{1,2}),?\s*(\d{4})\b/gi, (_, d, y) => `የካቲት ${d}, ${y}`],
  [/\bMar(?:ch)?\s+(\d{1,2}),?\s*(\d{4})\b/gi, (_, d, y) => `መጋቢት ${d}, ${y}`],
  [/\bApr(?:il)?\s+(\d{1,2}),?\s*(\d{4})\b/gi, (_, d, y) => `ሚያዝያ ${d}, ${y}`],
  [/\bMay\s+(\d{1,2}),?\s*(\d{4})\b/gi, (_, d, y) => `ግንቦት ${d}, ${y}`],
  [/\bJun(?:e)?\s+(\d{1,2}),?\s*(\d{4})\b/gi, (_, d, y) => `ሰኔ ${d}, ${y}`],
  [/\bJul(?:y)?\s+(\d{1,2}),?\s*(\d{4})\b/gi, (_, d, y) => `ሐምሌ ${d}, ${y}`],
  [/\bAug(?:ust)?\s+(\d{1,2}),?\s*(\d{4})\b/gi, (_, d, y) => `ነሐሴ ${d}, ${y}`],
  [/\bSep(?:tember)?\s+(\d{1,2}),?\s*(\d{4})\b/gi, (_, d, y) => `መስከረም ${d}, ${y}`],
  [/\bOct(?:ober)?\s+(\d{1,2}),?\s*(\d{4})\b/gi, (_, d, y) => `ጥቅምት ${d}, ${y}`],
  [/\bNov(?:ember)?\s+(\d{1,2}),?\s*(\d{4})\b/gi, (_, d, y) => `ህዳር ${d}, ${y}`],
  [/\bDec(?:ember)?\s+(\d{1,2}),?\s*(\d{4})\b/gi, (_, d, y) => `ታህሳስ ${d}, ${y}`],

  // Common keywords in merchant notes
  [/\bwholesale\b/gi, () => 'ጅምላ'],
  [/\bretail\b/gi, () => 'ችርቻሮ'],
  [/\bdefective\b/gi, () => 'የተበላሸ'],
  [/\breturned\b/gi, () => 'ተመላሽ'],
  [/\bconfirmation\b/gi, () => 'ማረጋገጫ'],
  [/\binvoice\b/gi, () => 'ደረሰኝ'],
  [/\bcustomer\b/gi, () => 'ደንበኛ'],
  [/\bsupplier\b/gi, () => 'አቅራቢ'],
  [/\bpayment\b/gi, () => 'ክፍያ'],
  [/\breceived\b/gi, () => 'የተቀበለ'],
  [/\btransfer\b/gi, () => 'ዝውውር'],
  [/\bdeposit\b/gi, () => 'ተቀማጭ'],
  [/\bfactory\b/gi, () => 'ፋብሪካ'],
  [/\bwire\b/gi, () => 'ሽቦ'],
]

/**
 * Translate database attributes, item descriptions, and user notes:
 * - When targetLang is 'en': 100% pure English (no Amharic script, no 'Delala' prefix in names)
 * - When targetLang is 'am': 100% pure Amharic (no English in parentheses)
 */
export function translateDbText(
  text: string | null | undefined,
  targetLang: Language = 'am',
  customDbDict?: Record<string, string>
): string {
  if (!text) return ''
  const trimmed = text.trim()
  if (!trimmed) return ''

  if (targetLang === 'en') {
    // 1. Look in custom DB translations
    if (customDbDict && customDbDict[trimmed]) {
      return customDbDict[trimmed]
    }
    // 2. Exact match in AMHARIC_TO_ENGLISH_MAP
    if (AMHARIC_TO_ENGLISH_MAP[trimmed]) return AMHARIC_TO_ENGLISH_MAP[trimmed]
    const lower = trimmed.toLowerCase()
    if (AMHARIC_TO_ENGLISH_MAP[lower]) return AMHARIC_TO_ENGLISH_MAP[lower]

    // 3. Search MASTER_DICTIONARY for reverse match
    for (const entry of Object.values(MASTER_DICTIONARY)) {
      if (entry.am.toLowerCase() === lower) return entry.en
    }

    // 4. Strip "Delala" / "ደላላ" prefix from person names
    let cleaned = trimmed.replace(/\b(delala|ደላላ)\b/gi, '').trim()

    // 5. Remove parenthetical Amharic parts: e.g. "2.5 BMT Wire (የተወሰደ እቃ)" -> "2.5 BMT Wire"
    cleaned = cleaned.replace(/\s*\([\u1200-\u137F\s]+\)/g, '').trim()

    // 6. Remove any remaining Amharic characters: e.g. "Mohammed (ደላላ መሀመድ)" -> "Mohammed"
    cleaned = cleaned
      .replace(/[\u1200-\u137F]+/g, '')
      .replace(/\s*\(\s*\)/g, '')
      .replace(/\s+/g, ' ')
      .trim()

    // 7. If string was purely Amharic that got emptied by regex, translate known keywords
    if (!cleaned) {
      for (const [amText, enText] of Object.entries(AMHARIC_TO_ENGLISH_MAP)) {
        if (trimmed.includes(amText)) return enText
      }
      return trimmed
    }
    return cleaned
  }

  // targetLang === 'am': Pure Amharic only
  // 1. Look in DB custom translations
  if (customDbDict && customDbDict[trimmed]) {
    return customDbDict[trimmed]
  }

  // 2. Strip "Delala" / "ደላላ" prefix from person names
  let normalized = trimmed.replace(/\b(delala|ደላላ)\b/gi, '').trim()
  // Remove parenthetical English parts: e.g. "መሀመድ (Mohammed)" -> "መሀመድ"
  normalized = normalized.replace(/\s*\([a-zA-Z\s0-9._-]+\)/g, '').trim()

  const lower = normalized.toLowerCase()
  if (DB_ATTRIBUTE_MAP[lower]) {
    return DB_ATTRIBUTE_MAP[lower]
  }

  if (MASTER_DICTIONARY[lower]) {
    return MASTER_DICTIONARY[lower].am
  }

  // 3. Apply regex phrase rules
  let result = normalized
  for (const [pattern, replacer] of PHRASE_RULES) {
    result = result.replace(pattern, replacer)
  }

  // 4. Remove any residual English in parentheses
  result = result.replace(/\s*\([a-zA-Z\s0-9._-]+\)/g, '').trim()

  return result
}

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

  const [dbTranslations, setDbTranslations] = useState<Record<string, string>>({})
  const [isTranslatorOpen, setIsTranslatorOpen] = useState(false)
  const [translationHistory, setTranslationHistory] = useState<TranslationHistoryItem[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(HISTORY_KEY)
        return saved ? JSON.parse(saved) : []
      } catch {
        return []
      }
    }
    return []
  })

  // Load translations from DB whenever language changes
  useEffect(() => {
    getTranslationsFromDb(language)
      .then((dict) => {
        if (dict && Object.keys(dict).length > 0) {
          setDbTranslations(dict)
        }
      })
      .catch((err) => console.warn('Could not load translations from database:', err))
  }, [language])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, language)
      document.documentElement.lang = language === 'am' ? 'am' : 'en'
    } catch {
      // LocalStorage access might fail in restricted sandboxes
    }
  }, [language])

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang)
  }, [])

  const toggleLanguage = useCallback(() => {
    setLanguageState((prev) => (prev === 'am' ? 'en' : 'am'))
  }, [])

  // Smart t function:
  // 1. If amFallback is explicitly passed, use it when language === 'am'.
  // 2. Check DB translations.
  // 3. Check MASTER_DICTIONARY.
  // 4. Return enOrKey fallback.
  const t = useCallback(
    (enOrKey: string, amFallback?: string): string => {
      if (!enOrKey) return ''

      // If amFallback explicitly provided
      if (amFallback && language === 'am') {
        return amFallback
      }

      // 1. Look in database translations
      if (dbTranslations[enOrKey]) {
        return dbTranslations[enOrKey]
      }

      // 2. Look in Master Dictionary
      const normalized = enOrKey.trim().toLowerCase()
      if (MASTER_DICTIONARY[normalized]) {
        return language === 'am' ? MASTER_DICTIONARY[normalized].am : MASTER_DICTIONARY[normalized].en
      }

      // 3. Fallback when language is English but text is in Amharic
      if (language === 'en' && AMHARIC_TO_ENGLISH_MAP[enOrKey.trim()]) {
        return AMHARIC_TO_ENGLISH_MAP[enOrKey.trim()]
      }

      // Default: Return original English text
      return amFallback && language === 'am' ? amFallback : enOrKey
    },
    [language, dbTranslations]
  )

  // Dynamic bidirectional translation helper
  const translateDynamic = useCallback(
    (text: string, targetLang?: Language): string => {
      if (!text) return ''
      const target = targetLang || language
      const trimmed = text.trim()

      if (target === 'en') {
        if (AMHARIC_TO_ENGLISH_MAP[trimmed]) return AMHARIC_TO_ENGLISH_MAP[trimmed]
        // Search dictionary in reverse
        for (const entry of Object.values(MASTER_DICTIONARY)) {
          if (entry.am.toLowerCase() === trimmed.toLowerCase()) return entry.en
        }
      } else {
        // Target is Amharic
        const lower = trimmed.toLowerCase()
        if (MASTER_DICTIONARY[lower]) return MASTER_DICTIONARY[lower].am
        for (const [amText, enText] of Object.entries(AMHARIC_TO_ENGLISH_MAP)) {
          if (enText.toLowerCase() === lower) return amText
        }
      }
      return text
    },
    [language]
  )

  const openTranslator = useCallback(() => setIsTranslatorOpen(true), [])
  const closeTranslator = useCallback(() => setIsTranslatorOpen(false), [])

  const addTranslationHistory = useCallback((item: Omit<TranslationHistoryItem, 'id' | 'timestamp'>) => {
    const newItem: TranslationHistoryItem = {
      ...item,
      id: `trans-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now(),
    }
    setTranslationHistory((prev) => {
      const updated = [newItem, ...prev.slice(0, 49)]
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(updated))
      } catch { }
      return updated
    })
  }, [])

  const clearTranslationHistory = useCallback(() => {
    setTranslationHistory([])
    try {
      localStorage.removeItem(HISTORY_KEY)
    } catch { }
  }, [])

  const saveCorrection = useCallback(
    async (key: string, lang: Language, text: string) => {
      await saveCustomTranslation(key, lang, text)
      setDbTranslations((prev) => ({ ...prev, [key]: text }))
    },
    []
  )

  const translateDb = useCallback(
    (text: string | null | undefined): string => {
      if (!text) return ''
      return translateDbText(text, language, dbTranslations)
    },
    [language, dbTranslations]
  )

  const isAmharic = language === 'am'

  return (
    <LanguageContext.Provider
      value={{
        language,
        isAmharic,
        setLanguage,
        toggleLanguage,
        t,
        translateDynamic,
        translateDbText: translateDb,
        isTranslatorOpen,
        openTranslator,
        closeTranslator,
        translationHistory,
        addTranslationHistory,
        clearTranslationHistory,
        saveCorrection,
      }}
    >
      {children}
    </LanguageContext.Provider>
  )
}

const fallbackLanguageContext: LanguageContextType = {
  language: 'en',
  isAmharic: false,
  setLanguage: () => {},
  toggleLanguage: () => {},
  t: (key: string) => key,
  translateDynamic: (text: string) => text,
  translateDbText: (text: string | null | undefined) => text || '',
  isTranslatorOpen: false,
  openTranslator: () => {},
  closeTranslator: () => {},
  translationHistory: [],
  addTranslationHistory: () => {},
  clearTranslationHistory: () => {},
  saveCorrection: async () => {},
}

export function useLanguage(): LanguageContextType {
  const context = useContext(LanguageContext)
  if (!context) {
    return fallbackLanguageContext
  }
  return context
}
