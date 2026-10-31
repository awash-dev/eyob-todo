import React from 'react'
import { useLedger } from '../../context/LedgerContext'
import { getItemBank, getItemCustomType } from '../../lib/bankUtils'
import {
  formatDate,
  calculateRecordTotal,
  calculateItemTotal,
} from '../../lib/formatters'

export const PrintView: React.FC = () => {
  const { activeTab, currentTabRecords, formatCurrency } = useLedger()

  const grandTotal = currentTabRecords.reduce(
    (acc, rec) => acc + calculateRecordTotal(rec),
    0,
  )

  const tabTitle =
    activeTab === 'customer'
      ? 'Customer Credit Ledger Report'
      : activeTab === 'supplier'
        ? 'Supplier Credit Ledger Report'
        : 'Stock & Inventory Valuation Report'

  const isStock = activeTab === 'stock'

  const columnLabels = isStock
    ? {
        type: 'Type (+ In / - Out)',
        item: 'Item / Product',
        custom: 'Stock Type',
        unitPrice: 'Unit Cost',
        qty: 'Qty',
        amount: 'Value',
        add: '(+) In',
        deduct: '(-) Out',
      }
    : {
        type: 'Type (+ Add / - Deduct)',
        item: 'Item / Description',
        custom: '',
        unitPrice: 'Unit Price',
        qty: 'Qty',
        amount: 'Amount',
        add: '(+) Add',
        deduct: '(-) Deduct',
      }

  return (
    <div className="hidden print:block p-8 bg-white text-black text-sm">
      {/* Header */}
      <div className="border-b-2 border-zinc-800 pb-4 mb-6 flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-zinc-900 uppercase">
            Merkato Credit Record
          </h1>
          <p className="text-xs text-zinc-600 mt-1">
            Multi-Tab Credit & Inventory System
          </p>
          <h2 className="text-lg font-bold text-zinc-800 mt-3">{tabTitle}</h2>
        </div>
        <div className="text-right text-xs text-zinc-600">
          <p className="font-semibold text-zinc-900">
            Report Date: {new Date().toLocaleDateString()}
          </p>
          <p>Total Records: {currentTabRecords.length}</p>
          <p className="mt-2 text-base font-extrabold text-zinc-900">
            Grand Total: {formatCurrency(grandTotal)}
          </p>
        </div>
      </div>

      {/* Records list */}
      <div className="space-y-6">
        {currentTabRecords.map((record, index) => {
          const recTotal = calculateRecordTotal(record)
          const hasCustoms = isStock && record.items.some((it) => (it.customs || 0) > 0)

          return (
            <div
              key={record.id}
              className="border border-zinc-300 rounded p-4 break-inside-avoid"
            >
              <div className="flex justify-between items-center border-b border-zinc-200 pb-2 mb-2">
                <div>
                  <span className="font-bold text-base text-zinc-900">
                    {index + 1}. {record.title}
                  </span>
                  <span className="text-xs text-zinc-600 ml-3">
                    Date: {formatDate(record.date)}
                  </span>
                </div>
                <div className="font-mono font-bold text-sm">
                  Balance: {formatCurrency(recTotal)}
                </div>
              </div>

              {record.notes && (
                <p className="text-xs text-zinc-600 italic mb-2">
                  Notes: {record.notes}
                </p>
              )}

              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-200 text-zinc-600">
                    <th className="text-left py-1 w-20">{columnLabels.type}</th>
                    <th className="text-left py-1">{columnLabels.item}</th>
                    <th className="text-left py-1 w-20">Bank</th>
                    {isStock && (
                      <th className="text-left py-1 w-20">
                        {columnLabels.custom}
                      </th>
                    )}
                    <th className="text-right py-1 w-20">
                      {columnLabels.unitPrice}
                    </th>
                    <th className="text-right py-1 w-16">{columnLabels.qty}</th>
                    {hasCustoms && (
                      <th className="text-right py-1 w-24">Customs</th>
                    )}
                    <th className="text-right py-1 w-24">
                      {columnLabels.amount}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {record.items.map((item, itemIdx) => {
                    const isAdd = item.sign === '+'
                    const lineTotal = calculateItemTotal(item)
                    const bank = getItemBank(item, record.type)
                    const customType = getItemCustomType(item)

                    return (
                      <tr key={item.id || itemIdx}>
                        <td className="py-1 font-bold whitespace-nowrap">
                          {isAdd ? columnLabels.add : columnLabels.deduct}
                        </td>
                        <td className="py-1">
                          {item.name}
                          {isStock && item.cartons && item.pcsPerCarton ? (
                            <span className="text-zinc-500 font-mono text-[11px] ml-1.5">
                              ({item.cartons} ctns × {item.pcsPerCarton} pcs)
                            </span>
                          ) : null}
                        </td>
                        <td className="py-1 whitespace-nowrap">
                          {bank || '—'}
                        </td>
                        {isStock && (
                          <td className="py-1 whitespace-nowrap">
                            {customType || '—'}
                          </td>
                        )}
                        <td className="py-1 text-right font-mono">
                          {formatCurrency(item.unitPrice)}
                        </td>
                        <td className="py-1 text-right font-mono">
                          {item.quantity}
                        </td>
                        {hasCustoms && (
                          <td className="py-1 text-right font-mono">
                            {isAdd && item.customs
                              ? formatCurrency(item.customs)
                              : '—'}
                          </td>
                        )}
                        <td className="py-1 text-right font-mono font-semibold">
                          {formatCurrency(lineTotal)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        })}
      </div>

      {/* Signature block */}
      <div className="mt-12 pt-6 border-t border-zinc-300 flex justify-between text-xs text-zinc-600">
        <div>
          <p>Prepared By: ___________________________</p>
          <p className="mt-1">Date: ________________</p>
        </div>
        <div className="text-right">
          <p>Approved By: ___________________________</p>
          <p className="mt-1">Authorized Signature</p>
        </div>
      </div>
    </div>
  )
}
