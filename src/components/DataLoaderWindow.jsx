import { useRef, useState } from 'react'
import { Download, FileSpreadsheet, Upload, X } from 'lucide-react'
import { apiRequest } from '../services/api'

export default function DataLoaderWindow({
  objectKey,
  objectLabel,
  initialMode = 'import',
  onClose,
  onImported,
}) {
  const [mode, setMode] = useState(initialMode)
  const [csv, setCsv] = useState('')
  const [operation, setOperation] = useState('auto')
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const fileRef = useRef(null)

  const readFile = async (file) => {
    if (!file) return
    setMessage('')
    setPreview(null)
    setCsv(await file.text())
  }

  const validate = async () => {
    if (!csv.trim()) return
    setBusy(true)
    setMessage('')
    try {
      const result = await apiRequest(`/api/platform/objects/${encodeURIComponent(objectKey)}/records/import/validate`, {
        method: 'POST',
        body: JSON.stringify({ csv, operation }),
      })
      setPreview(result?.data || null)
      setMessage('Validation complete.')
    } catch (error) {
      setMessage(error?.message || 'Unable to validate CSV.')
    } finally {
      setBusy(false)
    }
  }

  const runImport = async () => {
    if (!csv.trim()) return
    setBusy(true)
    setMessage('')
    try {
      const result = await apiRequest(`/api/platform/objects/${encodeURIComponent(objectKey)}/records/import`, {
        method: 'POST',
        body: JSON.stringify({ csv, operation }),
      })
      const summary = result?.data?.summary || result?.data || {}
      setMessage(
        `Import complete. ${summary.created ?? summary.create ?? 0} created, ${summary.updated ?? summary.update ?? 0} updated, ${summary.skipped ?? summary.skip ?? 0} skipped.`,
      )
      await onImported?.()
    } catch (error) {
      setMessage(error?.message || 'Unable to import CSV.')
    } finally {
      setBusy(false)
    }
  }

  const runExport = async () => {
    setBusy(true)
    setMessage('')
    try {
      const csvText = await apiRequest(`/api/platform/objects/${encodeURIComponent(objectKey)}/records/export`)
      const blob = new Blob([typeof csvText === 'string' ? csvText : ''], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${objectKey}-records-export-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
      setMessage('Export ready.')
    } catch (error) {
      setMessage(error?.message || 'Unable to export CSV.')
    } finally {
      setBusy(false)
    }
  }

  const summary = preview?.summary || {}

  return (
    <div className="data-loader-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose?.()
    }}>
      <section className="data-loader-window" role="dialog" aria-modal="true" aria-label="Data Loader">
        <header className="data-loader-titlebar">
          <div className="data-loader-title">
            <span className="data-loader-app-icon"><FileSpreadsheet size={18} /></span>
            <div>
              <strong>Data Loader</strong>
              <span>{objectLabel || objectKey}</span>
            </div>
          </div>
          <button type="button" className="data-loader-close" onClick={onClose} disabled={busy}>
            <X size={16} />
          </button>
        </header>

        <div className="data-loader-mode-tabs">
          <button type="button" className={mode === 'import' ? 'is-active' : ''} onClick={() => setMode('import')}>
            <Upload size={15} /> Import
          </button>
          <button type="button" className={mode === 'export' ? 'is-active' : ''} onClick={() => setMode('export')}>
            <Download size={15} /> Export
          </button>
        </div>

        {mode === 'import' ? (
          <div className="data-loader-body">
            <div className="data-loader-object-strip">
              <span>Selected object</span>
              <strong>{objectLabel || objectKey}</strong>
              <small>{objectKey}</small>
            </div>

            <div className="data-loader-grid">
              <label>
                <span>Operation</span>
                <select value={operation} onChange={(event) => setOperation(event.target.value)}>
                  <option value="auto">Auto — create or update</option>
                  <option value="create">Create only</option>
                  <option value="update">Update only</option>
                </select>
              </label>

              <div className="data-loader-file-row">
                <button type="button" className="data-loader-file-pick" onClick={() => fileRef.current?.click()}>
                  <Upload size={15} />
                  Choose CSV
                </button>
                <input
                  ref={fileRef}
                  hidden
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => readFile(event.target.files?.[0])}
                />
                <span>{csv.trim() ? 'CSV loaded' : 'No file selected'}</span>
              </div>
            </div>

            {preview ? (
              <div className="data-loader-summary">
                <div><span>Rows</span><strong>{preview.rowCount ?? summary.total ?? 0}</strong></div>
                <div><span>Valid</span><strong>{preview.valid ?? 0}</strong></div>
                <div><span>Create</span><strong>{summary.create ?? 0}</strong></div>
                <div><span>Update</span><strong>{summary.update ?? 0}</strong></div>
                <div><span>Errors</span><strong>{preview.errors?.length ?? preview.errors ?? summary.errors ?? 0}</strong></div>
              </div>
            ) : (
              <div className="data-loader-drop-hint">
                Choose a CSV file, then validate it before importing.
              </div>
            )}

            {Array.isArray(preview?.errors) && preview.errors.length ? (
              <div className="data-loader-errors">
                {preview.errors.slice(0, 6).map((item, index) => (
                  <div key={index}>Row {item.row}: {item.message}</div>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="data-loader-body">
            <div className="data-loader-object-strip">
              <span>Selected object</span>
              <strong>{objectLabel || objectKey}</strong>
              <small>{objectKey}</small>
            </div>
            <div className="data-loader-export-card">
              <Download size={28} />
              <strong>Export {objectLabel || objectKey}</strong>
              <span>Download the records you are allowed to export as CSV.</span>
            </div>
          </div>
        )}

        <footer className="data-loader-footer">
          <div className="data-loader-message">{message}</div>
          <div>
            <button type="button" className="data-loader-secondary" onClick={onClose} disabled={busy}>Close</button>
            {mode === 'import' ? (
              <>
                <button type="button" className="data-loader-secondary" onClick={validate} disabled={busy || !csv.trim()}>
                  Validate
                </button>
                <button type="button" className="data-loader-primary" onClick={runImport} disabled={busy || !csv.trim()}>
                  {busy ? 'Working…' : 'Import'}
                </button>
              </>
            ) : (
              <button type="button" className="data-loader-primary" onClick={runExport} disabled={busy}>
                {busy ? 'Working…' : 'Export CSV'}
              </button>
            )}
          </div>
        </footer>
      </section>
    </div>
  )
}
