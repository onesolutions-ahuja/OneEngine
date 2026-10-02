import { useEffect, useMemo, useState } from 'react'
import { Bug, Clipboard, Plus, RefreshCw, Save, Search } from 'lucide-react'
import { apiRequest } from '../../services/api'

const EMPTY = {
  code: '',
  category: 'API',
  title: '',
  userMessage: '',
  internalDescription: '',
  severity: 'ERROR',
  retryable: false,
  active: true,
  matchPattern: '',
}

function displayDate(value) {
  if (!value) return '—'
  try { return new Date(value).toLocaleString() } catch { return String(value) }
}

export default function DebugCodesAdmin({ onError = () => {} }) {
  const [codes, setCodes] = useState([])
  const [events, setEvents] = useState([])
  const [query, setQuery] = useState('')
  const [selectedCode, setSelectedCode] = useState('')
  const [draft, setDraft] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [mode, setMode] = useState('codes')

  const load = async () => {
    try {
      setLoading(true)
      onError('')
      const [codeResponse, eventResponse] = await Promise.all([
        apiRequest('/api/platform/developer/debug-codes'),
        apiRequest('/api/platform/developer/debug-events'),
      ])
      const nextCodes = Array.isArray(codeResponse?.data) ? codeResponse.data : []
      setCodes(nextCodes)
      setEvents(Array.isArray(eventResponse?.data) ? eventResponse.data : [])
      if (selectedCode) {
        const current = nextCodes.find((item) => item.code === selectedCode)
        if (current) setDraft({ ...EMPTY, ...current })
      }
    } catch (error) {
      onError(error?.message || 'Unable to load OneEngine Debug')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filteredCodes = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return codes
    return codes.filter((item) =>
      [item.code, item.category, item.title, item.userMessage, item.internalDescription]
        .some((value) => String(value || '').toLowerCase().includes(q))
    )
  }, [codes, query])

  const filteredEvents = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return events
    return events.filter((item) =>
      [item.reference, item.code, item.category, item.title, item.endpoint, item.technicalCode, item.technicalMessage]
        .some((value) => String(value || '').toLowerCase().includes(q))
    )
  }, [events, query])

  const choose = (item) => {
    setSelectedCode(item.code)
    setDraft({ ...EMPTY, ...item })
  }

  const createNew = () => {
    setSelectedCode('')
    setDraft(EMPTY)
    setMode('codes')
  }

  const save = async () => {
    try {
      setSaving(true)
      onError('')
      const code = String(draft.code || '').trim().toUpperCase()
      const method = selectedCode ? 'PATCH' : 'POST'
      const path = selectedCode
        ? `/api/platform/developer/debug-codes/${encodeURIComponent(selectedCode)}`
        : '/api/platform/developer/debug-codes'
      await apiRequest(path, {
        method,
        body: JSON.stringify({ ...draft, code }),
      })
      setSelectedCode(code)
      await load()
    } catch (error) {
      onError(error?.message || 'Unable to save debug code')
    } finally {
      setSaving(false)
    }
  }

  const copy = async (value) => {
    try { await navigator.clipboard.writeText(String(value || '')) } catch {}
  }

  return (
    <div className="oe-debug">
      <div className="oe-debug-toolbar">
        <div className="oe-debug-tabs">
          <button type="button" className={mode === 'codes' ? 'is-active' : ''} onClick={() => setMode('codes')}>Error Codes</button>
          <button type="button" className={mode === 'events' ? 'is-active' : ''} onClick={() => setMode('events')}>Recent Events</button>
        </div>
        <label className="oe-debug-search">
          <Search size={15}/>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search code, cause, endpoint or reference" />
        </label>
        <button type="button" className="oe-debug-icon-button" onClick={load} title="Refresh"><RefreshCw size={15}/></button>
        <button type="button" className="oe-debug-primary" onClick={createNew}><Plus size={15}/> New Code</button>
      </div>

      <div className="oe-debug-note">
        <Bug size={16}/>
        <span>Global OneEngine registry. Codes are shared by every tenant. The code itself is permanent; edit its message or diagnostics, but never reuse it for another cause.</span>
      </div>

      {loading ? <div className="settings-state-card">Loading OneEngine Debug…</div> : mode === 'events' ? (
        <div className="oe-debug-table-wrap">
          <table className="oe-debug-table">
            <thead><tr><th>Time</th><th>Code</th><th>Reference</th><th>Endpoint</th><th>Technical cause</th><th>Status</th></tr></thead>
            <tbody>
              {filteredEvents.map((item) => (
                <tr key={`${item.reference}:${item.createdAt}`}>
                  <td>{displayDate(item.createdAt)}</td>
                  <td><button type="button" className="oe-debug-code" onClick={() => { setMode('codes'); const found = codes.find((row) => row.code === item.code); if (found) choose(found) }}>{item.code}</button></td>
                  <td><button type="button" className="oe-debug-reference" onClick={() => copy(`${item.code} · ${item.reference}`)}>{item.reference}<Clipboard size={12}/></button></td>
                  <td>{item.httpMethod || ''} {item.endpoint || '—'}</td>
                  <td className="oe-debug-cause">{item.technicalMessage || item.technicalCode || '—'}</td>
                  <td>{item.httpStatus || '—'}</td>
                </tr>
              ))}
              {!filteredEvents.length ? <tr><td colSpan="6" className="oe-debug-empty">No matching debug events.</td></tr> : null}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="oe-debug-grid">
          <div className="oe-debug-list">
            {filteredCodes.map((item) => (
              <button key={item.code} type="button" className={item.code === selectedCode ? 'is-active' : ''} onClick={() => choose(item)}>
                <span className="oe-debug-code">{item.code}</span>
                <span className="oe-debug-list-copy"><strong>{item.title}</strong><small>{item.category} · {item.severity}{item.active ? '' : ' · Inactive'}</small></span>
              </button>
            ))}
          </div>

          <div className="oe-debug-editor">
            <div className="oe-debug-editor-head">
              <div><h3>{selectedCode || 'New debug code'}</h3><p>{selectedCode ? 'Edit the global definition and matching diagnostics.' : 'Add a new compact global OE code.'}</p></div>
              {selectedCode ? <button type="button" className="oe-debug-copy" onClick={() => copy(selectedCode)}><Clipboard size={14}/> Copy</button> : null}
            </div>

            <div className="oe-debug-form">
              <label><span>Code</span><input value={draft.code} disabled={Boolean(selectedCode)} maxLength={6} placeholder="OED03" onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value.toUpperCase() }))}/><small>Format: OE + category letter + 2–3 digits.</small></label>
              <label><span>Category</span><input value={draft.category} onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))} placeholder="Database"/></label>
              <label><span>Severity</span><select value={draft.severity} onChange={(e) => setDraft((d) => ({ ...d, severity: e.target.value }))}><option>INFO</option><option>WARNING</option><option>ERROR</option><option>CRITICAL</option><option>FATAL</option></select></label>
              <label className="oe-debug-wide"><span>Developer title</span><input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} placeholder="Database resource limit"/></label>
              <label className="oe-debug-wide"><span>User-facing message</span><textarea rows="2" value={draft.userMessage} onChange={(e) => setDraft((d) => ({ ...d, userMessage: e.target.value }))} placeholder="OneEngine data services are temporarily unavailable."/></label>
              <label className="oe-debug-wide"><span>Internal technical meaning</span><textarea rows="3" value={draft.internalDescription} onChange={(e) => setDraft((d) => ({ ...d, internalDescription: e.target.value }))} placeholder="Exact cause developers should investigate."/></label>
              <label className="oe-debug-wide"><span>Technical match pattern (optional)</span><input value={draft.matchPattern || ''} onChange={(e) => setDraft((d) => ({ ...d, matchPattern: e.target.value }))} placeholder="quota|allowance|resource limit"/><small>Case-insensitive regular expression used to classify matching backend failures.</small></label>
              <label className="oe-debug-check"><input type="checkbox" checked={draft.retryable === true} onChange={(e) => setDraft((d) => ({ ...d, retryable: e.target.checked }))}/><span>User can retry</span></label>
              <label className="oe-debug-check"><input type="checkbox" checked={draft.active !== false} onChange={(e) => setDraft((d) => ({ ...d, active: e.target.checked }))}/><span>Active</span></label>
            </div>

            <div className="oe-debug-actions">
              <button type="button" className="oe-debug-primary" disabled={saving} onClick={save}><Save size={15}/>{saving ? ' Saving…' : ' Save Code'}</button>
              {draft.builtIn ? <span className="oe-debug-built-in">Built-in OneEngine code</span> : null}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
