import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { apiRequest } from '../../../services/api'

const fieldKey = (value) => String(value?.api_name || value?.apiName || value?.field_key || value?.key || value?.id || '')
const fieldLabel = (value) => value?.label || value?.name || fieldKey(value)
const fieldType = (value) => String(value?.field_type || value?.data_type || value?.type || '').toLowerCase()
const uid = () => globalThis.crypto?.randomUUID?.() || `scheduled-${Date.now()}-${Math.random().toString(36).slice(2)}`

function apiNameFromLabel(label, fallback = 'Scheduled_Path') {
  let value = String(label || '').trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '')
  if (!value) value = fallback
  if (!/^[A-Za-z]/.test(value)) value = `Path_${value}`
  return value.slice(0, 80).replace(/_+$/g, '')
}

function newScheduledPath() {
  return {
    id: uid(),
    label: '',
    apiName: '',
    timeSource: '$RecordTriggerEvent',
    offsetNumber: 0,
    offsetOption: 'Hours After',
    batchSize: 200,
    apiNameManual: false,
  }
}

function ScheduledPathsDialog({ value, selectedObject, onChange, onClose }) {
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(value?.scheduledPaths || [])))
  const [fields, setFields] = useState([])
  const [selectedId, setSelectedId] = useState(draft[0]?.id || '')

  useEffect(() => {
    let live = true
    if (!selectedObject?.id) { setFields([]); return () => { live = false } }
    apiRequest(`/api/platform/objects/${encodeURIComponent(selectedObject.id)}/fields`)
      .then((response) => {
        if (!live) return
        setFields((Array.isArray(response?.data) ? response.data : []).filter((field) => field?.active !== false && ['date','datetime'].includes(fieldType(field))))
      })
      .catch(() => { if (live) setFields([]) })
    return () => { live = false }
  }, [selectedObject?.id])

  const selected = draft.find((path) => path.id === selectedId) || null
  const valid = draft.length > 0 && draft.every((path) =>
    String(path.label || '').trim()
    && /^[A-Za-z][A-Za-z0-9_]*$/.test(String(path.apiName || ''))
    && Number.isInteger(Number(path.offsetNumber))
    && Number.isInteger(Number(path.batchSize))
    && Number(path.batchSize) >= 1
    && Number(path.batchSize) <= 200
  )

  const patchSelected = (changes) => {
    setDraft((current) => current.map((path) => path.id === selectedId ? { ...path, ...changes } : path))
  }

  const addPath = () => {
    const path = newScheduledPath()
    setDraft((current) => [...current, path])
    setSelectedId(path.id)
  }

  const removePath = (id) => {
    setDraft((current) => {
      const next = current.filter((path) => path.id !== id)
      if (selectedId === id) setSelectedId(next[0]?.id || '')
      return next
    })
  }

  return <div className="gptb-scheduled-backdrop">
    <section className="gptb-scheduled-dialog" role="dialog" aria-modal="true" aria-label="Configure Scheduled Paths">
      <header><div><strong>Configure Scheduled Paths</strong><small>Schedule paths to run before or after a time source.</small></div><button className="gptb-icon-button" aria-label="Close Scheduled Paths" onClick={onClose}><X size={16}/></button></header>
      <div className="gptb-scheduled-layout">
        <aside>
          <button type="button" className="gptb-scheduled-add" onClick={addPath}><Plus size={13}/> Add Scheduled Path</button>
          {draft.map((path) => <div className="gptb-scheduled-path-row" key={path.id}>
            <button type="button" className={selectedId === path.id ? 'is-active' : ''} onClick={() => setSelectedId(path.id)}><b>{path.label || 'New Scheduled Path'}</b><small>{path.apiName || 'API name generated from label'}</small></button>
            <button type="button" aria-label={`Delete ${path.label || 'scheduled path'}`} onClick={() => removePath(path.id)}><Trash2 size={12}/></button>
          </div>)}
        </aside>
        <main>
          {selected ? <>
            <label><span>Path Label <b>*</b></span><input autoFocus value={selected.label || ''} onChange={(event) => {
              const label = event.target.value
              patchSelected({ label, apiName: selected.apiNameManual ? selected.apiName : apiNameFromLabel(label) })
            }}/></label>
            <label><span>API Name <b>*</b></span><input value={selected.apiName || ''} onChange={(event) => patchSelected({ apiName: event.target.value, apiNameManual: true })}/></label>
            <label><span>Time Source <b>*</b></span><select value={selected.timeSource || '$RecordTriggerEvent'} onChange={(event) => patchSelected({ timeSource: event.target.value })}><option value="$RecordTriggerEvent">Record Trigger Event</option>{fields.map((field) => <option key={fieldKey(field)} value={`$record.${fieldKey(field)}`}>{fieldLabel(field)}</option>)}</select></label>
            <div className="gptb-scheduled-offset"><label><span>Offset Number <b>*</b></span><input type="number" min="0" step="1" value={selected.offsetNumber ?? 0} onChange={(event) => patchSelected({ offsetNumber: Number(event.target.value) })}/></label><label><span>Offset Options <b>*</b></span><select value={selected.offsetOption || 'Hours After'} onChange={(event) => patchSelected({ offsetOption: event.target.value })}><option>Minutes Before</option><option>Minutes After</option><option>Hours Before</option><option>Hours After</option><option>Days Before</option><option>Days After</option></select></label></div>
            <details><summary>Advanced Options</summary><label><span>Batch Size</span><input type="number" min="1" max="200" value={selected.batchSize ?? 200} onChange={(event) => patchSelected({ batchSize: Number(event.target.value) })}/><small>Enter a value from 1 through 200. The default and maximum is 200.</small></label></details>
          </> : <div className="gptb-scheduled-empty">Click <b>Add Scheduled Path</b> to configure a path.</div>}
        </main>
      </div>
      <footer><button className="gptb-button" onClick={onClose}>Cancel</button><button className="gptb-button is-brand" disabled={!valid} onClick={() => { onChange(draft.map(({ apiNameManual, ...path }) => path)); onClose() }}>Done</button></footer>
    </section>
  </div>
}

export default function GPTBuilderRecordTriggerPaths({ value, selectedObject, onChange }) {
  const [scheduledOpen, setScheduledOpen] = useState(false)
  const scheduledPaths = Array.isArray(value?.scheduledPaths) ? value.scheduledPaths : []
  const includesUpdates = ['updated', 'created_or_updated'].includes(value?.trigger)
  const canSchedule = value?.optimize === 'actions' && (!includesUpdates || value?.updateMode === 'transition')
  const canAsync = value?.optimize === 'actions' && value?.trigger !== 'deleted'

  if (value?.optimize !== 'actions' || value?.trigger === 'deleted') return null

  return <section className="gptb-record-extra-paths">
    <h3>Run Asynchronously</h3>
    <label className="gptb-radio"><input type="checkbox" checked={value?.asyncPath === true} disabled={!canAsync} onChange={(event) => onChange({ ...value, asyncPath: event.target.checked })}/><span><b>Include a Run Asynchronously path to access an external system after the original transaction for the triggering record is successfully committed.</b></span></label>

    <h3>Scheduled Paths</h3>
    <p>Run part of this flow at a scheduled time based on the record trigger event or a date/date-time field.</p>
    {includesUpdates && value?.updateMode !== 'transition' ? <div className="gptb-start-path-warning">Scheduled paths require <b>Only when a record is updated to meet the condition requirements</b> for flows that can run on updates.</div> : null}
    {scheduledPaths.length ? <div className="gptb-start-path-list">{scheduledPaths.map((path) => <div key={path.id}><b>{path.label}</b><small>{path.offsetNumber} {path.offsetOption} · Batch {path.batchSize}</small></div>)}</div> : null}
    <button type="button" className="gptb-button" disabled={!canSchedule || !selectedObject} onClick={() => setScheduledOpen(true)}>{scheduledPaths.length ? 'Edit Scheduled Paths' : 'Add Scheduled Paths (Optional)'}</button>
    {scheduledOpen ? <ScheduledPathsDialog value={value} selectedObject={selectedObject} onChange={(scheduledPaths) => onChange({ ...value, scheduledPaths })} onClose={() => setScheduledOpen(false)}/> : null}
  </section>
}
