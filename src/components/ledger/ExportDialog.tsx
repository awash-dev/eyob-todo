import React, { useRef, useState } from 'react'
import { useLedger } from '../../context/LedgerContext'
import { generateTabSummaryText } from '../../lib/formatters'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog'
import { Button } from '../ui/button'
import {
  Copy,
  Download,
  Upload,
  Printer,
  Check,
  FileText,
  Cloud,
  Loader2,
} from 'lucide-react'
import { uploadBackupToS3 } from '../../lib/s3Client'

interface ExportDialogProps {
  isOpen: boolean
  onClose: () => void
}

export const ExportDialog: React.FC<ExportDialogProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    records,
    activeTab,
    currentTabRecords,
    importRecords,
    showToast,
    currency,
  } = useLedger()
  const [copiedText, setCopiedText] = useState(false)
  const [copiedJson, setCopiedJson] = useState(false)
  const [isUploadingS3, setIsUploadingS3] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleUploadToS3 = async () => {
    try {
      setIsUploadingS3(true)
      const filename = await uploadBackupToS3(records)
      showToast(
        `Cloud backup saved to Neon S3: ${filename.split('/').pop()}`,
        'success',
      )
    } catch (err: any) {
      console.error('S3 upload error:', err)
      showToast(
        `Cloud backup failed: ${err.message || 'Unknown error'}`,
        'error',
      )
    } finally {
      setIsUploadingS3(false)
    }
  }

  const handleCopySummary = () => {
    const text = generateTabSummaryText(activeTab, currentTabRecords, currency)
    navigator.clipboard.writeText(text).then(() => {
      setCopiedText(true)
      showToast('Formatted text summary copied to clipboard!', 'success')
      setTimeout(() => setCopiedText(false), 2000)
    })
  }

  const handleCopyJson = () => {
    const jsonString = JSON.stringify(records, null, 2)
    navigator.clipboard.writeText(jsonString).then(() => {
      setCopiedJson(true)
      showToast('All records JSON copied to clipboard!', 'success')
      setTimeout(() => setCopiedJson(false), 2000)
    })
  }

  const handleDownloadBackup = () => {
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
    showToast('Backup file downloaded successfully', 'success')
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
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

  const handlePrint = () => {
    onClose()
    setTimeout(() => {
      window.print()
    }, 200)
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md sm:rounded-2xl p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            Export, Share & Backup
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm text-muted-foreground">
            Easily copy, print, or download your ledger accounts data for
            offline records and sharing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-3">
          {/* Action 1: Copy Tab Summary */}
          <div className="p-3.5 rounded-xl border bg-card hover:bg-muted/30 transition-colors flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-foreground">
                  Copy Active Tab Summary
                </h4>
                <p className="text-xs text-muted-foreground">
                  Text summary of {currentTabRecords.length} {activeTab} records
                  for WhatsApp or notes
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCopySummary}
              className="shrink-0 text-xs"
            >
              {copiedText ? (
                <>
                  <Check className="w-3.5 h-3.5 mr-1 text-emerald-500" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 mr-1" />
                  Copy
                </>
              )}
            </Button>
          </div>

          {/* Action 2: Print / PDF */}
          <div className="p-3.5 rounded-xl border bg-card hover:bg-muted/30 transition-colors flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
                <Printer className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-foreground">
                  Print / PDF Report
                </h4>
                <p className="text-xs text-muted-foreground">
                  Generates clean printable statement via browser print dialog
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handlePrint}
              className="shrink-0 text-xs"
            >
              <Printer className="w-3.5 h-3.5 mr-1" />
              Print
            </Button>
          </div>

          {/* Action 3: Copy JSON */}
          <div className="p-3.5 rounded-xl border bg-card hover:bg-muted/30 transition-colors flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-50 text-purple-600 dark:bg-purple-950 dark:text-purple-400">
                <Copy className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-foreground">
                  Copy All JSON Data
                </h4>
                <p className="text-xs text-muted-foreground">
                  Raw JSON text payload for clipboard transfer
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCopyJson}
              className="shrink-0 text-xs"
            >
              {copiedJson ? (
                <>
                  <Check className="w-3.5 h-3.5 mr-1 text-emerald-500" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 mr-1" />
                  Copy
                </>
              )}
            </Button>
          </div>

          {/* Action 4: Download Backup file */}
          <div className="p-3.5 rounded-xl border bg-card hover:bg-muted/30 transition-colors flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
                <Download className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-foreground">
                  Download Backup (.json)
                </h4>
                <p className="text-xs text-muted-foreground">
                  Save all {records.length} records safely to your device
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleDownloadBackup}
              className="shrink-0 text-xs"
            >
              <Download className="w-3.5 h-3.5 mr-1" />
              Download
            </Button>
          </div>

          {/* Action 5: Cloud Backup to Neon S3 */}
          <div className="p-3.5 rounded-xl border bg-card hover:bg-muted/30 transition-colors flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-sky-50 text-sky-600 dark:bg-sky-950 dark:text-sky-400">
                <Cloud className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-foreground">
                  Backup to Neon Cloud S3
                </h4>
                <p className="text-xs text-muted-foreground">
                  Save snapshot to your Neon S3 bucket ({records.length}{' '}
                  records)
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={isUploadingS3}
              onClick={handleUploadToS3}
              className="shrink-0 text-xs"
            >
              {isUploadingS3 ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Cloud className="w-3.5 h-3.5 mr-1" />
                  Save to S3
                </>
              )}
            </Button>
          </div>

          {/* Action 5: Restore / Import */}
          <div className="p-3.5 rounded-xl border bg-card hover:bg-muted/30 transition-colors flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
                <Upload className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-foreground">
                  Restore from Backup
                </h4>
                <p className="text-xs text-muted-foreground">
                  Import records from previously saved JSON file
                </p>
              </div>
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleFileUpload}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="shrink-0 text-xs"
              >
                <Upload className="w-3.5 h-3.5 mr-1" />
                Import
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
