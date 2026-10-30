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
      exportRecordsToExcel(records, `eyoba-ledger-${activeTab}`)
      showToast('Excel workbook exported successfully (.xlsx)', 'success')
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
      a.download = `eyoba-ledger-backup-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      showToast('JSON backup file downloaded successfully', 'success')
      onClose()
    } catch (err: any) {
      console.error('JSON export error:', err)
      showToast(`JSON export failed: ${err.message || 'Unknown error'}`, 'error')
    }
  }

  // 3. Import from Excel (.xlsx, .xls, .csv)
  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      setIsProcessingExcel(true)
      const imported = await importRecordsFromExcel(file, activeTab)
      if (imported.length === 0) {
        showToast('No valid records found in the selected Excel file', 'error')
        return
      }
      const success = importRecords(imported)
      if (success) {
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

  // 4. Import from JSON (.json)
  const handleJsonUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string)
        if (Array.isArray(parsed)) {
          const success = importRecords(parsed)
          if (success) {
            onClose()
          }
        } else {
          showToast('Invalid file: JSON must be an array of records', 'error')
        }
      } catch {
        showToast('Error parsing JSON backup file', 'error')
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
            <span>Export & Import Data</span>
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm text-muted-foreground">
            Export your ledger records to Excel or JSON, and import data files
            seamlessly.
          </DialogDescription>
        </DialogHeader>

        {/* Hidden File Inputs */}
        <input
          ref={excelFileInputRef}
          type="file"
          accept=".xlsx, .xls, .csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
          className="hidden"
          onChange={handleExcelUpload}
        />
        <input
          ref={jsonFileInputRef}
          type="file"
          accept=".json, application/json"
          className="hidden"
          onChange={handleJsonUpload}
        />

        <div className="space-y-4 pt-2">
          {/* Section: EXPORT */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Export Options
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
                      Multi-sheet spreadsheet with item details ({records.length}{' '}
                      records)
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
            </div>
          </div>

          {/* Section: IMPORT */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Import Options
              </span>
              <div className="h-px bg-border flex-1"></div>
            </div>

            <div className="space-y-2">
              {/* Option 3: Import from Excel */}
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
                      Import from Excel
                    </h4>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      Upload .xlsx, .xls, or .csv workbook
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

              {/* Option 4: Import from JSON */}
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
                      Import from JSON
                    </h4>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      Restore accounts from a previously saved .json file
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
