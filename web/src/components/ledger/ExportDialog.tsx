import React, { useRef, useState } from 'react'
import { useLedger } from '../../context/LedgerContext'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { exportRecordsToExcel, importRecordsFromExcel } from '../../lib/excelUtils'

interface ExportDialogProps {
  isOpen: boolean
  onClose: () => void
}

export const ExportDialog: React.FC<ExportDialogProps> = ({
  isOpen,
  onClose,
}) => {
  const { records, activeTab, importRecords, showToast } = useLedger()

  const [isProcessingExcel, setIsProcessingExcel] = useState(false)
  const excelFileInputRef = useRef<HTMLInputElement>(null)
  const jsonFileInputRef = useRef<HTMLInputElement>(null)

  // 1. Export to Excel (.xlsx)
  const handleExportExcel = () => {
    try {
      if (records.length === 0) {
        showToast('No records available to export', 'info')
        return
      }
      exportRecordsToExcel(records, `merkato-credit-record-${activeTab}`)
      showToast('Excel workbook (.xlsx) exported successfully', 'success')
      onClose()
    } catch (err: any) {
      console.error('Excel export error:', err)
      showToast(`Excel export failed: ${err.message || 'Unknown error'}`, 'error')
    }
  }

  // 2. Export to JSON (.json)
  const handleExportJson = () => {
    try {
      if (records.length === 0) {
        showToast('No records available to export', 'info')
        return
      }
      const jsonString = JSON.stringify(records, null, 2)
      const blob = new Blob([jsonString], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `merkato-credit-record-${activeTab}-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      showToast('JSON backup (.json) downloaded successfully', 'success')
      onClose()
    } catch (err: any) {
      console.error('JSON export error:', err)
      showToast(`JSON export failed: ${err.message || 'Unknown error'}`, 'error')
    }
  }

  // 3. Export / Print to PDF
  const handleExportPdf = () => {
    onClose()
    setTimeout(() => {
      window.print()
    }, 200)
  }

  // 4. Import from Excel ONLY (.xlsx, .csv)
  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const lowerName = file.name.toLowerCase()
    if (!lowerName.endsWith('.xlsx') && !lowerName.endsWith('.csv')) {
      showToast('Invalid file format. Only Excel (.xlsx, .csv) files are allowed', 'error')
      e.target.value = ''
      return
    }

    try {
      setIsProcessingExcel(true)
      const imported = await importRecordsFromExcel(file, activeTab)
      if (imported.length === 0) {
        showToast('No valid records found in the selected Excel file', 'error')
        return
      }
      const success = importRecords(imported)
      if (success) {
        showToast(`Imported ${imported.length} records from Excel successfully`, 'success')
        onClose()
      }
    } catch (err: any) {
      console.error('Excel import error:', err)
      showToast(
        `Failed to import Excel: ${err.message || 'Check file format'}`,
        'error',
      )
    } finally {
      setIsProcessingExcel(false)
      e.target.value = ''
    }
  }

  // 5. Import from JSON ONLY (.json)
  const handleJsonUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const lowerName = file.name.toLowerCase()
    if (!lowerName.endsWith('.json')) {
      showToast('Invalid file format. Only JSON (.json) files are allowed', 'error')
      e.target.value = ''
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string)
        if (Array.isArray(parsed)) {
          const success = importRecords(parsed)
          if (success) {
            showToast(`Imported ${parsed.length} records from JSON successfully`, 'success')
            onClose()
          }
        } else {
          showToast('Invalid JSON file: file content must be an array of records', 'error')
        }
      } catch {
        showToast('Error parsing JSON backup file. Ensure file contains valid JSON', 'error')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md sm:rounded-2xl p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <ion-icon
              name="swap-vertical-outline"
              class="text-primary text-xl"
            ></ion-icon>
            <span>Export &amp; Import Data</span>
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm text-muted-foreground">
            Export ledger records to Excel, JSON, or PDF document, and import Excel or JSON data files.
          </DialogDescription>
        </DialogHeader>

        {/* Hidden File Inputs restricted to Excel and JSON only */}
        <input
          ref={excelFileInputRef}
          type="file"
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          className="hidden"
          onChange={handleExcelUpload}
        />
        <input
          ref={jsonFileInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleJsonUpload}
        />

        <div className="space-y-4 pt-2">
          {/* Section: EXPORT */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Export Options (Excel, JSON, PDF)
              </span>
              <div className="h-px bg-border flex-1"></div>
            </div>

            <div className="space-y-2">
              {/* Option 1: Export to Excel */}
              <div className="p-3 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-card hover:bg-muted/30 transition-colors flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 shrink-0 flex items-center justify-center">
                    <ion-icon
                      name="document-text-outline"
                      class="text-xl"
                    ></ion-icon>
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-foreground truncate">
                      Export to Excel (.xlsx)
                    </h4>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      Multi-sheet spreadsheet with item details ({records.length} records)
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleExportExcel}
                  className="shrink-0 text-xs flex items-center gap-1.5 cursor-pointer font-medium hover:border-emerald-500 hover:text-emerald-600"
                >
                  <ion-icon name="download-outline" class="text-sm"></ion-icon>
                  <span>Export</span>
                </Button>
              </div>

              {/* Option 2: Export to JSON */}
              <div className="p-3 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-card hover:bg-muted/30 transition-colors flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2.5 rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400 shrink-0 flex items-center justify-center">
                    <ion-icon
                      name="code-slash-outline"
                      class="text-xl"
                    ></ion-icon>
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-foreground truncate">
                      Export to JSON (.json)
                    </h4>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      Complete structured data backup for device storage
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleExportJson}
                  className="shrink-0 text-xs flex items-center gap-1.5 cursor-pointer font-medium hover:border-indigo-500 hover:text-indigo-600"
                >
                  <ion-icon name="download-outline" class="text-sm"></ion-icon>
                  <span>Export</span>
                </Button>
              </div>

              {/* Option 3: Export / Print to PDF */}
              <div className="p-3 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-card hover:bg-muted/30 transition-colors flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2.5 rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 shrink-0 flex items-center justify-center">
                    <ion-icon
                      name="print-outline"
                      class="text-xl"
                    ></ion-icon>
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-foreground truncate">
                      Print / Export to PDF
                    </h4>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      Formatted printable ledger summary (Save as PDF)
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleExportPdf}
                  className="shrink-0 text-xs flex items-center gap-1.5 cursor-pointer font-medium hover:border-blue-500 hover:text-blue-600"
                >
                  <ion-icon name="print-outline" class="text-sm"></ion-icon>
                  <span>Print / PDF</span>
                </Button>
              </div>
            </div>
          </div>

          {/* Section: IMPORT (EXCEL & JSON ONLY) */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Import Options (Only Excel &amp; JSON)
              </span>
              <div className="h-px bg-border flex-1"></div>
            </div>

            <div className="space-y-2">
              {/* Option 4: Import from Excel */}
              <div className="p-3 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-card hover:bg-muted/30 transition-colors flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2.5 rounded-lg bg-teal-50 text-teal-600 dark:bg-teal-950/60 dark:text-teal-400 shrink-0 flex items-center justify-center">
                    <ion-icon
                      name="cloud-upload-outline"
                      class="text-xl"
                    ></ion-icon>
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-foreground truncate">
                      Import from Excel (.xlsx, .csv)
                    </h4>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      Upload an Excel workbook or CSV spreadsheet
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isProcessingExcel}
                  onClick={() => excelFileInputRef.current?.click()}
                  className="shrink-0 text-xs flex items-center gap-1.5 cursor-pointer font-medium hover:border-teal-500 hover:text-teal-600"
                >
                  {isProcessingExcel ? (
                    <>
                      <ion-icon
                        name="sync-outline"
                        class="text-sm animate-spin"
                      ></ion-icon>
                      <span>Loading...</span>
                    </>
                  ) : (
                    <>
                      <ion-icon
                        name="cloud-upload-outline"
                        class="text-sm"
                      ></ion-icon>
                      <span>Import</span>
                    </>
                  )}
                </Button>
              </div>

              {/* Option 5: Import from JSON */}
              <div className="p-3 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-card hover:bg-muted/30 transition-colors flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2.5 rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 shrink-0 flex items-center justify-center">
                    <ion-icon
                      name="file-tray-full-outline"
                      class="text-xl"
                    ></ion-icon>
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-foreground truncate">
                      Import from JSON (.json)
                    </h4>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      Restore accounts from a previously saved .json backup
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => jsonFileInputRef.current?.click()}
                  className="shrink-0 text-xs flex items-center gap-1.5 cursor-pointer font-medium hover:border-amber-500 hover:text-amber-600"
                >
                  <ion-icon
                    name="cloud-upload-outline"
                    class="text-sm"
                  ></ion-icon>
                  <span>Import</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
