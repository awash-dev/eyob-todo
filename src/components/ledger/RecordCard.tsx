import { MoreVertical, Pencil, Trash2 } from 'lucide-react'
import React from 'react'
import type { LedgerRecord } from '../../types/ledger'
import { useLedger } from '../../context/LedgerContext'
import { useLanguage } from '../../context/LanguageContext'
import {
  formatDate,
  calculateRecordTotal,
  calculateItemTotal,
} from '../../lib/formatters'
import {
  generateLedgerTableEntries,
  isDemoRecord,
} from '../../lib/creditAccounting'
import { getItemCustomType } from '../../lib/bankUtils'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'

interface RecordCardProps {
  record: LedgerRecord
}

export const RecordCard: React.FC<RecordCardProps> = ({ record }) => {
  const {
    openEditModal,
    deleteRecord,
    formatCurrency,
    openPaymentModal,
  } = useLedger()
  const { t, isAmharic, translateDbText } = useLanguage()

  const isCustomer = record.type === 'customer'
  const isSupplier = record.type === 'supplier'
  const isBroker = record.type === 'delala'
  const isStock = record.type === 'stock'
  const isDemo = isDemoRecord(record.title)

  // Calculations for Stock
  const totalCartons = record.items.reduce(
    (sum, it) => sum + (Number(it.cartons) || 0),
    0,
  )
  const totalUnits = record.items.reduce(
    (sum, it) => sum + (Number(it.quantity) || 0),
    0,
  )
  const stockTotal = calculateRecordTotal(record)

  // Double-entry accounting table data for Customer, Supplier & Broker
  const tableData = (isCustomer || isSupplier || isBroker)
    ? generateLedgerTableEntries(record.type as 'customer' | 'supplier' | 'delala', record.items)
    : null

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    const confirmMsg = isDemo
      ? t(`Delete confirmed demo record "${record.title}"?`, `የተረጋገጠ የሙከራ መዝገብ "${record.title}"ን መሰረዝ ይፈልጋሉ?`)
      : t(`Are you sure you want to delete "${record.title}"?`, `እርግጠኛ ነዎት "${record.title}"ን መሰረዝ ይፈልጋሉ?`)
    if (window.confirm(confirmMsg)) {
      deleteRecord(record.id)
    }
  }

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    openEditModal(record)
  }

  /* ========================================================================== */
  /* 1. STOCK INVENTORY RECORD                                                  */
  /* ========================================================================== */
  if (isStock) {
    return (
      <div className="bg-white text-black border border-zinc-300 rounded-md shadow-2xs mb-5 overflow-hidden">
        <div className="px-4 py-3 bg-white border-b border-zinc-300 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <h3 className="font-bold text-sm sm:text-base text-black">
              {translateDbText(record.title)}
            </h3>
            <span className="text-xs text-zinc-600 font-medium">
              {formatDate(record.date, isAmharic)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleEdit}
              className="h-8 text-xs font-medium px-2.5 rounded border-zinc-300 text-black hover:bg-zinc-100 cursor-pointer"
            >
              <Pencil size={13} className="mr-1" />
              <span>{t('Edit', 'አስተካክል')}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDelete}
              className="h-8 text-xs font-medium px-2.5 rounded border-zinc-300 text-black hover:bg-zinc-100 cursor-pointer"
            >
              <Trash2 size={13} className="mr-1" />
              <span>{t('Delete', 'ሰርዝ')}</span>
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse border-t border-zinc-300 bg-white text-black">
            <thead>
              <tr className="bg-zinc-100 text-black font-bold">
                <th className="py-2 px-3 border border-zinc-300 w-10 text-center">#</th>
                <th className="py-2 px-3 border border-zinc-300">{t('Product / Item Name', 'የምርት / ዕቃ ስም')}</th>
                <th className="py-2 px-3 border border-zinc-300 w-44">{t('Packaging Breakdown', 'የማሸጊያ ዝርዝር')}</th>
                <th className="py-2 px-3 border border-zinc-300 w-28 text-right">{t('Total Units', 'ጠቅላላ ፍሬ')}</th>
                <th className="py-2 px-3 border border-zinc-300 w-32 text-right">{t('Unit Cost', 'የአንዱ ዋጋ')}</th>
                <th className="py-2 px-3 border border-zinc-300 w-36 text-right font-bold">{t('Total Value', 'ጠቅላላ ዋጋ')}</th>
              </tr>
            </thead>
            <tbody>
              {record.items.map((item, idx) => {
                const itemTotal = calculateItemTotal(item)
                const ctns = Number(item.cartons) || 0
                const pcs = Number(item.pcsPerCarton) || 0
                const unit = item.packagingUnit || (ctns > 0 ? 'Carton' : 'Pcs')
                const customType = getItemCustomType(item)

                return (
                  <tr key={item.id || idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-zinc-50/60'}>
                    <td className="py-2 px-3 text-center border border-zinc-300 text-zinc-600">{idx + 1}</td>
                    <td className="py-2 px-3 font-semibold text-black border border-zinc-300">
                      <span>{translateDbText(item.name)}</span>
                      {customType && (
                        <span className="ml-2 text-[10px] font-normal border border-zinc-300 px-1.5 py-0.5 rounded text-black bg-zinc-100">
                          {translateDbText(customType)}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-zinc-700 border border-zinc-300 font-medium">
                      {ctns > 0 && pcs > 0 && unit === 'Carton' ? (
                        <span><strong>{ctns}</strong> {t('ctns', 'ካርቶን')} × <strong>{pcs}</strong> {t('pcs', 'ፍሬ')}</span>
                      ) : ctns > 0 ? (
                        <span><strong>{ctns}</strong> {translateDbText(unit)}</span>
                      ) : (
                        <span>{t('Direct units', 'ቀጥታ ፍሬ')} ({translateDbText(unit)})</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right font-medium text-black border border-zinc-300">
                      {Number(item.quantity).toLocaleString()} {unit === 'Carton' ? t('pcs', 'ፍሬ') : translateDbText(unit.toLowerCase())}
                    </td>
                    <td className="py-2 px-3 text-right text-black border border-zinc-300">
                      {formatCurrency(item.unitPrice)}
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-black border border-zinc-300">
                      {formatCurrency(itemTotal)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-zinc-100 font-bold border-t-2 border-zinc-300 text-black">
                <td colSpan={2} className="py-2.5 px-3 border border-zinc-300">
                  {t('Total:', 'ጠቅላላ:')} {record.items.length} {t('Products', 'ምርቶች')}
                </td>
                <td className="py-2.5 px-3 border border-zinc-300 text-zinc-700">
                  {totalCartons > 0 ? `${totalCartons} ${t('cartons total', 'ጠቅላላ ካርቶን')}` : '—'}
                </td>
                <td className="py-2.5 px-3 text-right border border-zinc-300">
                  {totalUnits.toLocaleString()} {t('units', 'ፍሬ')}
                </td>
                <td className="py-2.5 px-3 text-right border border-zinc-300 text-zinc-700 uppercase text-[10px]">
                  {t('Stock Valuation:', 'የዕቃ ክምችት ግምት:')}
                </td>
                <td className="py-2.5 px-3 text-right text-sm text-black font-extrabold border border-zinc-300">
                  {formatCurrency(stockTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    )
  }

  /* ========================================================================== */
  /* 2. CUSTOMER CREDIT & SUPPLIER CREDIT – EXCEL-LIKE SPREADSHEET TABLE        */
  /* ========================================================================== */
  return (
    <div className="bg-white text-black border border-zinc-300 rounded-md shadow-2xs mb-6 overflow-hidden">
      {/* Clean Header: ONLY Person's Name and Transaction Date */}
      <div className="px-4 py-3 bg-white border-b border-zinc-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h3 className="font-bold text-base sm:text-lg text-black tracking-tight">
            {translateDbText(record.title)}
          </h3>
          <span className="text-xs text-zinc-600 font-medium">
            {formatDate(record.date, isAmharic)}
          </span>
          {isDemo && (
            <span className="text-[10px] uppercase font-bold px-2 py-0.5 bg-zinc-100 text-black border border-zinc-300 rounded">
              {t('Demo Data', 'የሙከራ መረጃ')}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isDemo && (
            <button
              type="button"
              onClick={handleDelete}
              className="text-xs px-2.5 py-1 bg-zinc-100 hover:bg-zinc-200 text-black border border-zinc-300 rounded font-medium cursor-pointer"
              title={t('Clean up confirmed demo record', 'የተረጋገጠ የሙከራ መዝገብ አጽዳ')}
            >
              {t('Delete Demo Record', 'የሙከራ መዝገብ ሰርዝ')}
            </button>
          )}

          <button
            type="button"
            onClick={() => openPaymentModal(record.type as 'customer' | 'supplier' | 'delala', record.title)}
            className="text-xs font-semibold px-2.5 py-1 bg-black hover:bg-zinc-800 text-white rounded cursor-pointer transition-colors"
          >
            {isCustomer
              ? t('+ Add Entry', '+ ሂሳብ መዝግብ')
              : isSupplier
              ? t('+ Add Purchase', '+ ግዢ መዝግብ')
              : t('+ Add Deal', '+ ደላላ መዝግብ')}
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 text-black border-zinc-300 hover:bg-zinc-100 rounded cursor-pointer"
              >
                <MoreVertical size={15} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40 bg-white border border-zinc-300 text-black shadow-md">
              <DropdownMenuItem onClick={handleEdit} className="cursor-pointer text-xs">
                <Pencil size={13} className="mr-2" />
                <span>{t('Edit Record', 'መዝገብ አስተካክል')}</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-zinc-200" />
              <DropdownMenuItem onClick={handleDelete} className="cursor-pointer text-xs text-black">
                <Trash2 size={13} className="mr-2" />
                <span>{t('Delete Record', 'መዝገብ ሰርዝ')}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Excel-like Table with Exact Columns Specified in Section 2 & 3 */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left border-collapse border-t border-zinc-300 bg-white text-black">
          <thead>
            <tr className="bg-zinc-100 text-black font-bold">
              <th className="py-2.5 px-3 border border-zinc-300 w-28 whitespace-nowrap">{t('Date', 'ቀን')}</th>
              <th className="py-2.5 px-3 border border-zinc-300 min-w-[180px]">{t('Product / Description', 'ምርት / መግለጫ')}</th>
              <th className="py-2.5 px-3 border border-zinc-300 w-20 text-right">{t('Quantity', 'ብዛት')}</th>
              <th className="py-2.5 px-3 border border-zinc-300 w-28 text-right">{t('Unit Price', 'የአንዱ ዋጋ')}</th>
              <th className="py-2.5 px-3 border border-zinc-300 w-32 text-right">{t('Total Amount', 'ጠቅላላ ዋጋ')}</th>
              <th className="py-2.5 px-3 border border-zinc-300 w-32">{t('Payment Method', 'የክፍያ ዘዴ')}</th>
              <th className="py-2.5 px-3 border border-zinc-300 w-32 text-right">
                {isCustomer || isBroker
                  ? t('Debit (+)', 'ዴቢት (+)')
                  : t('Debit (-)', 'ዴቢት (-)')}
              </th>
              <th className="py-2.5 px-3 border border-zinc-300 w-32 text-right">
                {isCustomer || isBroker
                  ? t('Credit (-)', 'ክሬዲት (-)')
                  : t('Credit (+)', 'ክሬዲት (+)')}
              </th>
              <th className="py-2.5 px-3 border border-zinc-300 w-36 text-right font-bold">{t('Balance', 'ቀሪ ሂሳብ')}</th>
            </tr>
          </thead>
          <tbody>
            {tableData && tableData.entries.length > 0 ? (
              tableData.entries.map((row, idx) => (
                <tr
                  key={row.id || idx}
                  className={idx % 2 === 0 ? 'bg-white' : 'bg-zinc-50/50'}
                >
                  <td className="py-2 px-3 border border-zinc-300 text-black whitespace-nowrap">
                    {row.date ? formatDate(row.date, isAmharic) : '—'}
                  </td>
                  <td className="py-2 px-3 border border-zinc-300 text-black font-medium">
                    {translateDbText(row.description)}
                  </td>
                  <td className="py-2 px-3 border border-zinc-300 text-black text-right">
                    {row.quantity !== null && !isNaN(row.quantity)
                      ? Number(row.quantity).toLocaleString()
                      : '—'}
                  </td>
                  <td className="py-2 px-3 border border-zinc-300 text-black text-right">
                    {row.unitPrice !== null && !isNaN(row.unitPrice)
                      ? formatCurrency(row.unitPrice)
                      : '—'}
                  </td>
                  <td className="py-2 px-3 border border-zinc-300 text-black text-right font-medium">
                    {formatCurrency(row.totalAmount)}
                  </td>
                  <td className="py-2 px-3 border border-zinc-300 text-black">
                    {translateDbText(row.paymentMethod)}
                  </td>
                  <td className="py-2 px-3 border border-zinc-300 text-black text-right font-medium">
                    {row.debit > 0
                      ? `${isCustomer || isBroker ? '+' : '-'}${formatCurrency(row.debit)}`
                      : '—'}
                  </td>
                  <td className="py-2 px-3 border border-zinc-300 text-black text-right font-medium">
                    {row.credit > 0
                      ? `${isCustomer || isBroker ? '-' : '+'}${formatCurrency(row.credit)}`
                      : '—'}
                  </td>
                  <td className="py-2 px-3 border border-zinc-300 text-black text-right font-bold">
                    {formatCurrency(row.balance)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={9} className="py-6 text-center text-zinc-500 border border-zinc-300">
                  {t('No transactions recorded yet.', 'ምንም የተመዘገበ ዝውውር የለም።')}
                </td>
              </tr>
            )}
          </tbody>
          {tableData && tableData.entries.length > 0 && (
            <tfoot>
              <tr className="bg-zinc-100 font-bold border-t-2 border-zinc-300 text-black">
                <td colSpan={2} className="py-2.5 px-3 border border-zinc-300">
                  {t('Total', 'ጠቅላላ')} ({tableData.entries.length} {tableData.entries.length === 1 ? t('record', 'መዝገብ') : t('records', 'መዝገቦች')})
                </td>
                <td colSpan={4} className="py-2.5 px-3 text-right border border-zinc-300 font-bold text-zinc-800">
                  {t('Subtotals:', 'ንዑስ ድምር:')}
                </td>
                <td className="py-2.5 px-3 text-right border border-zinc-300 font-bold">
                  {tableData.totalDebit > 0
                    ? `${isCustomer || isBroker ? '+' : '-'}${formatCurrency(tableData.totalDebit)}`
                    : formatCurrency(0)}
                </td>
                <td className="py-2.5 px-3 text-right border border-zinc-300 font-bold">
                  {tableData.totalCredit > 0
                    ? `${isCustomer || isBroker ? '-' : '+'}${formatCurrency(tableData.totalCredit)}`
                    : formatCurrency(0)}
                </td>
                <td className="py-2.5 px-3 border border-zinc-300"></td>
              </tr>
              <tr className="bg-white font-extrabold border-t border-zinc-300 text-black">
                <td colSpan={6} className="py-2.5 px-3 text-right uppercase text-xs tracking-wider border border-zinc-300">
                  {isCustomer
                    ? t('Outstanding Customer Balance:', 'የተጣራ ቀሪ የደንበኛ ሂሳብ:')
                    : isSupplier
                    ? t('Outstanding Supplier Balance:', 'የተጣራ ቀሪ የአቅራቢ ሂሳብ:')
                    : t('Outstanding Broker Balance:', 'የተጣራ ቀሪ የደላላ ሂሳብ:')}
                </td>
                <td colSpan={3} className="py-2.5 px-3 text-right text-sm border border-zinc-300 font-extrabold text-black">
                  {formatCurrency(tableData.outstandingBalance)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
