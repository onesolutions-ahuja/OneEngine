import { useEffect, useMemo, useState } from 'react'
import { apiRequest } from '../../services/api'

function emptyValue(component) {
  if (['CHECKBOX_GROUP','MULTI_SELECT','DATA_TABLE','FILE_UPLOAD'].includes(component.type)) return []
  if (['CHECKBOX','TOGGLE'].includes(component.type)) return false
  if (component.type === 'ADDRESS') return { street: '', city: '', postcode: '', country: '' }
  return component.defaultValue ?? ''
}

function widthColumns(width) {
  if (width === '1/2') return 6
  if (width === '1/3') return 4
  if (width === '2/3') return 8
  const numeric = Number(width)
  return Number.isInteger(numeric) ? Math.max(1, Math.min(12, numeric)) : 12
}

function componentLayoutStyle(component, nested = false) {
  const width = nested ? 12 : widthColumns(component?.width)
  const alignment = String(component?.verticalAlignment || 'top')
  const alignSelf = alignment === 'bottom' ? 'end' : alignment === 'center' ? 'center' : 'start'
  const style = component?.style || {}
  return {
    gridColumn: `span ${width} / span ${width}`,
    alignSelf,
    color: style.textColor || undefined,
    backgroundColor: style.backgroundColor || undefined,
    borderColor: style.borderColor || undefined,
    borderWidth: style.borderWidth || undefined,
    borderRadius: style.borderRadius || undefined,
  }
}

function localResourceValue(path, values) {
  if (!path) return undefined
  const raw = String(path)
  if (raw.startsWith('variables.')) return raw.slice('variables.'.length).split('.').filter(Boolean).reduce((current, part) => current == null ? undefined : current?.[part], values)
  if (Object.prototype.hasOwnProperty.call(values || {}, raw)) return values[raw]
  return undefined
}

function evaluateVisibilityCondition(condition, values, fallbackValue) {
  const localValue = localResourceValue(condition?.resource, values)
  const actual = localValue === undefined ? fallbackValue : localValue
  const operator = condition?.operator || 'truthy'
  const expected = condition?.value
  const empty = actual == null || actual === '' || (Array.isArray(actual) && actual.length === 0)
  const falsy = empty || actual === false
  if (operator === 'falsy') return falsy
  if (operator === 'is_empty') return empty
  if (operator === 'is_not_empty') return !empty
  if (operator === 'equals') return String(actual ?? '') === String(expected ?? '')
  if (operator === 'not_equals') return String(actual ?? '') !== String(expected ?? '')
  if (operator === 'contains') return Array.isArray(actual) ? actual.map(String).includes(String(expected ?? '')) : String(actual ?? '').includes(String(expected ?? ''))
  if (operator === 'not_contains') return Array.isArray(actual) ? !actual.map(String).includes(String(expected ?? '')) : !String(actual ?? '').includes(String(expected ?? ''))
  if (['greater_than','greater_or_equal','less_than','less_or_equal'].includes(operator)) {
    const left = Number(actual); const right = Number(expected)
    if (!Number.isFinite(left) || !Number.isFinite(right)) return false
    if (operator === 'greater_than') return left > right
    if (operator === 'greater_or_equal') return left >= right
    if (operator === 'less_than') return left < right
    return left <= right
  }
  return !falsy
}

function evaluateVisibilityLogic(logic, results) {
  const tokens = String(logic || '').match(/\d+|AND|OR|NOT|\(|\)/gi) || []
  let cursor = 0
  const factor = () => {
    const token = String(tokens[cursor++] || '')
    if (token.toUpperCase() === 'NOT') return !factor()
    if (token === '(') {
      const value = or()
      if (tokens[cursor++] !== ')') return false
      return value
    }
    return /^\d+$/.test(token) ? Boolean(results[Number(token) - 1]) : false
  }
  const and = () => {
    let value = factor()
    while (String(tokens[cursor] || '').toUpperCase() === 'AND') { cursor += 1; value = value && factor() }
    return value
  }
  const or = () => {
    let value = and()
    while (String(tokens[cursor] || '').toUpperCase() === 'OR') { cursor += 1; value = value || and() }
    return value
  }
  return tokens.length ? or() && cursor === tokens.length : false
}

function componentVisible(component, values) {
  if (component?.visible === false) return false
  const mode = String(component?.visibilityMode || '')
  const conditions = Array.isArray(component?.visibilityConditions) ? component.visibilityConditions : []
  if (mode && mode !== 'always' && conditions.length) {
    const results = conditions.map((condition, index) => evaluateVisibilityCondition(condition, values, component?.visibilityInitialValues?.[index]))
    if (mode === 'any') return results.some(Boolean)
    if (mode === 'custom') return evaluateVisibilityLogic(component.visibilityLogic, results)
    return results.every(Boolean)
  }
  if (!component?.visibilityResource) return true
  return evaluateVisibilityCondition({
    resource: component.visibilityResource,
    operator: component.visibilityOperator,
    value: component.visibilityValue,
  }, values, component.visibilityInitialValue)
}

function componentOptions(component, values) {
  const options = Array.isArray(component?.options) ? component.options : []
  if (!component?.controllingComponent) return options
  const controller = values?.[component.controllingComponent]
  const selected = Array.isArray(controller) ? controller.map(String) : [String(controller ?? '')]
  return options.filter((option) => {
    const allowed = Array.isArray(option?.controllingValues) ? option.controllingValues.map(String) : []
    if (!allowed.length) return true
    return selected.some((value) => allowed.includes(value))
  })
}

export default function ScreenFlowRuntimePage({ sessionId }) {
  const [session, setSession] = useState(null)
  const [values, setValues] = useState({})
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [recordSearch, setRecordSearch] = useState({})
  const [uploading, setUploading] = useState({})
  const [collapsedSections, setCollapsedSections] = useState({})

  const screen = session?.screen || {}
  const components = useMemo(() => Array.isArray(screen.components) ? screen.components : [], [screen.components])

  const hydrate = (data) => {
    if (!data) return
    setSession(data)
    const initial = { ...(data.values || {}) }
    for (const component of Array.isArray(data.screen?.components) ? data.screen.components : []) {
      if (component.input === false || !component.name) continue
      if (!Object.prototype.hasOwnProperty.call(initial, component.name)) initial[component.name] = emptyValue(component)
    }
    setValues(initial)
    setErrors({})
  }

  useEffect(() => {
    let live = true
    apiRequest(`/api/platform/flow-sessions/${encodeURIComponent(sessionId)}`)
      .then((response) => { if (live) hydrate(response?.data) })
      .catch((error) => { if (live) setMessage(error.message || 'Unable to load this screen.') })
    return () => { live = false }
  }, [sessionId])

  const setValue = (name, value) => setValues((current) => ({ ...current, [name]: value }))

  const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      resolve(result.includes(',') ? result.slice(result.indexOf(',') + 1) : result)
    }
    reader.onerror = () => reject(reader.error || new Error('Unable to read file'))
    reader.readAsDataURL(file)
  })

  const uploadFiles = async (component, files) => {
    const name = component?.name
    const target = component?.fileTarget || {}
    if (!name || !target.objectKey || !target.recordId) {
      setErrors((current) => ({ ...current, [name]: 'A valid file target record is required.' }))
      return
    }
    const maxFiles = Math.max(1, Math.min(10, Number(component.maxFiles || 1)))
    const selectedFiles = Array.from(files || []).slice(0, maxFiles)
    if (!selectedFiles.length) return
    setUploading((current) => ({ ...current, [name]: true }))
    setErrors((current) => ({ ...current, [name]: '' }))
    try {
      const uploaded = []
      for (const file of selectedFiles) {
        const base64 = await fileToBase64(file)
        const response = await apiRequest('/api/platform/files', {
          method: 'POST',
          body: JSON.stringify({
            objectKey: target.objectKey,
            recordId: target.recordId,
            filename: file.name,
            mimeType: file.type || 'application/octet-stream',
            base64,
            category: target.category || null,
            metadata: { source: 'screen_flow', screenSessionId: session?.id || null, component: name },
          }),
        })
        if (response?.data?.id) uploaded.push(response.data.id)
      }
      setValue(name, uploaded)
    } catch (error) {
      setErrors((current) => ({ ...current, [name]: error.message || 'Unable to upload file.' }))
    } finally {
      setUploading((current) => ({ ...current, [name]: false }))
    }
  }

  const searchRecords = async (component, query) => {
    const name = component?.name
    if (!name) return
    const q = String(query || '').trim()
    const minChars = Math.max(1, Math.min(5, Number(component.searchMinChars ?? 2)))
    setRecordSearch((current) => ({ ...current, [name]: { query: q, loading: q.length >= minChars, results: [], searched: q.length >= minChars } }))
    if (q.length < minChars) return
    try {
      const response = await apiRequest(`/api/platform/search?q=${encodeURIComponent(q)}`)
      const results = Array.isArray(response?.data?.results) ? response.data.results : []
      const filtered = component.objectKey ? results.filter((item) => String(item.objectApiName) === String(component.objectKey)) : results
      setRecordSearch((current) => ({ ...current, [name]: { query: q, loading: false, results: filtered, searched: true } }))
    } catch {
      setRecordSearch((current) => ({ ...current, [name]: { query: q, loading: false, results: [], searched: true, failed: true } }))
    }
  }

  const renderRegisteredComponent = (component) => {
    const key = String(component.registryKey || '')
    const config = component.registryConfig || {}
    const value = values[component.name]
    const inputClass = "w-full rounded-lg border border-slate-300 px-3 py-2"
    if (key === 'header' || key === 'modern_section_header') {
      return <div><h2 className="text-lg font-semibold text-slate-900">{config.title || component.label}</h2>{config.subtitle ? <p className="mt-1 text-sm text-slate-500">{config.subtitle}</p> : null}</div>
    }
    if (key === 'text') return <div className="text-sm leading-6 text-slate-700">{config.content || config.text || component.label}</div>
    if (key === 'divider') return <hr className="border-slate-200" />
    if (key === 'spacer') return <div style={{ minHeight: Number(config.height || 24) }} />
    if (key === 'text_input') return <input className={inputClass} type={config.inputType || 'text'} value={value ?? ''} placeholder={config.placeholder || component.placeholder || ''} onChange={(event) => setValue(component.name, event.target.value)} />
    if (key === 'long_text') return <textarea className={inputClass} rows={Number(config.rows || 4)} value={value ?? ''} placeholder={config.placeholder || component.placeholder || ''} onChange={(event) => setValue(component.name, event.target.value)} />
    if (key === 'number' || key === 'currency') return <input className={inputClass} type="number" step={key === 'currency' ? (config.step || '0.01') : (config.step || 'any')} min={config.min} max={config.max} value={value ?? ''} onChange={(event) => setValue(component.name, event.target.value)} />
    if (key === 'date' || key === 'datetime') return <input className={inputClass} type={key === 'datetime' ? 'datetime-local' : 'date'} value={value ?? ''} onChange={(event) => setValue(component.name, event.target.value)} />
    if (key === 'checkbox') return <label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(value)} onChange={(event) => setValue(component.name, event.target.checked)} /><span>{config.label || component.label}</span></label>
    if (key === 'picklist') {
      const options = Array.isArray(config.options) ? config.options : []
      return <select className={inputClass} value={value ?? ''} onChange={(event) => setValue(component.name, event.target.value)}><option value="">{config.placeholder || 'Select…'}</option>{options.map((option, index) => {
        const item = typeof option === 'object' ? option : { label: String(option), value: option }
        return <option key={item.value ?? index} value={item.value ?? item.label}>{item.label ?? item.value}</option>
      })}</select>
    }
    if (key === 'lookup') return <input className={inputClass} value={value ?? ''} placeholder={config.placeholder || 'Record ID or lookup value'} onChange={(event) => setValue(component.name, event.target.value)} />
    if (key === 'signature') return <textarea className={inputClass} rows={3} value={value ?? ''} placeholder="Signature / acknowledgement" onChange={(event) => setValue(component.name, event.target.value)} />
    if (key === 'clock_widget') return <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-700">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: config.showSeconds ? '2-digit' : undefined })}</div>
    if (key === 'calendar_widget') return <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-700">{new Date().toLocaleDateString([], { weekday: config.showWeekday === false ? undefined : 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
    if (key === 'modern_data_card') return <div className="rounded-xl border border-slate-200 p-4"><div className="text-xs text-slate-500">{config.title || component.label}</div><div className="mt-1 text-xl font-semibold text-slate-900">{config.value ?? value ?? ''}</div>{config.meta ? <div className="mt-1 text-xs text-slate-500">{config.meta}</div> : null}</div>
    if (key === 'icon_action_tile') return <button type="button" className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left text-sm font-semibold text-slate-800" onClick={() => component.name && setValue(component.name, config.action || true)}>{config.label || component.label}</button>
    return <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">Registered component “{component.registryKey}” has no Screen renderer.</div>
  }

  const submit = async (navigation) => {
    if (busy) return
    setBusy(true)
    setMessage('')
    setErrors({})
    try {
      const response = await apiRequest(`/api/platform/flow-sessions/${encodeURIComponent(session.id)}/submit`, {
        method: 'POST',
        body: JSON.stringify({ navigation, values }),
      })
      const data = response?.data || {}
      if (data.screenSessionId && data.screen) {
        hydrate({ id: data.screenSessionId, status: 'ACTIVE', screen: data.screen, values: data.values || {} })
        if (window.history?.replaceState) {
          const base = import.meta.env.BASE_URL.replace(/\/$/, '')
          window.history.replaceState(null, '', `${base}/flow/${encodeURIComponent(data.screenSessionId)}`)
        }
      } else if (data.status === 'PAUSED') {
        setSession({ id: data.screenSessionId || session.id, status: 'PAUSED', screen: data.screen || screen, values: data.values || values })
        setMessage('Flow paused.')
      } else {
        setSession({ status: data.status || 'COMPLETED', screen: null })
        setMessage(data.status === 'COMPLETED' ? 'Flow completed.' : 'Flow is waiting.')
      }
    } catch (error) {
      const payload = error?.data || error?.response?.data || {}
      if (payload?.errors) setErrors(payload.errors)
      setMessage(payload?.message || error.message || 'Unable to continue this flow.')
    } finally {
      setBusy(false)
    }
  }

  const renderInput = (component) => {
    const value = values[component.name]
    const common = {
      id: component.id || component.name,
      name: component.name,
      disabled: busy || component.disabled === true,
      required: component.required === true,
      'aria-invalid': Boolean(errors[component.name]),
    }
    if (component.type === 'TEXT_AREA') {
      return <textarea {...common} rows={component.rows || 4} minLength={component.minLength === '' || component.minLength == null ? undefined : Number(component.minLength)} maxLength={component.maxLength === '' || component.maxLength == null ? undefined : Number(component.maxLength)} className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder={component.placeholder || ''} value={value ?? ''} onChange={(event) => setValue(component.name, event.target.value)} />
    }
    if (['TEXT','EMAIL','PASSWORD','DATE','DATETIME','NUMBER'].includes(component.type)) {
      const type = component.type === 'DATETIME' ? 'datetime-local' : component.type.toLowerCase()
      return <input {...common} type={type} min={component.min} max={component.max} step={component.type === 'NUMBER' ? (component.step || 'any') : undefined} minLength={component.minLength === '' || component.minLength == null ? undefined : Number(component.minLength)} maxLength={component.maxLength === '' || component.maxLength == null ? undefined : Number(component.maxLength)} pattern={component.pattern || undefined} className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder={component.placeholder || ''} value={value ?? ''} onChange={(event) => setValue(component.name, component.type === 'NUMBER' ? event.target.value : event.target.value)} />
    }
    if (['CHECKBOX','TOGGLE'].includes(component.type)) {
      return <label className="flex items-center gap-2"><input {...common} type="checkbox" checked={Boolean(value)} onChange={(event) => setValue(component.name, event.target.checked)} /><span>{component.toggleLabel || component.helpText || component.label}</span></label>
    }
    if (component.type === 'RADIO') {
      return <div className="space-y-2">{componentOptions(component, values).map((option) => <label key={option.value} className="flex items-center gap-2"><input {...common} type="radio" value={option.value} checked={String(value ?? '') === String(option.value)} onChange={() => setValue(component.name, option.value)} /><span>{option.label}</span></label>)}</div>
    }
    if (component.type === 'CHECKBOX_GROUP') {
      const selected = Array.isArray(value) ? value : []
      return <div className="space-y-2">{componentOptions(component, values).map((option) => <label key={option.value} className="flex items-center gap-2"><input {...common} type="checkbox" checked={selected.includes(option.value)} onChange={(event) => setValue(component.name, event.target.checked ? [...selected, option.value] : selected.filter((item) => item !== option.value))} /><span>{option.label}</span></label>)}</div>
    }
    if (component.type === 'SELECT') {
      return <select {...common} className="w-full rounded-lg border border-slate-300 px-3 py-2" value={value ?? ''} onChange={(event) => setValue(component.name, event.target.value)}><option value="">{component.placeholder || 'Select…'}</option>{componentOptions(component, values).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
    }
    if (component.type === 'MULTI_SELECT') {
      const selected = Array.isArray(value) ? value : []
      return <select {...common} multiple className="w-full rounded-lg border border-slate-300 px-3 py-2" value={selected} onChange={(event) => setValue(component.name, Array.from(event.target.selectedOptions).map((option) => option.value))}>{componentOptions(component, values).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
    }
    if (component.type === 'SLIDER') {
      return <div><input {...common} className="w-full" type="range" min={component.min ?? 0} max={component.max ?? 100} step={component.step ?? 1} value={value ?? component.min ?? 0} onChange={(event) => setValue(component.name, Number(event.target.value))} /><div className="text-right text-xs text-slate-500">{value ?? component.min ?? 0}</div></div>
    }
    if (component.type === 'ADDRESS') {
      const address = value && typeof value === 'object' ? value : {}
      return <div className="grid gap-2 md:grid-cols-2">
        <input className="rounded-lg border border-slate-300 px-3 py-2 md:col-span-2" placeholder="Street" value={address.street || ''} onChange={(event) => setValue(component.name, { ...address, street: event.target.value })} />
        <input className="rounded-lg border border-slate-300 px-3 py-2" placeholder="City" value={address.city || ''} onChange={(event) => setValue(component.name, { ...address, city: event.target.value })} />
        <input className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Postcode" value={address.postcode || ''} onChange={(event) => setValue(component.name, { ...address, postcode: event.target.value })} />
        <input className="rounded-lg border border-slate-300 px-3 py-2 md:col-span-2" placeholder="Country" value={address.country || ''} onChange={(event) => setValue(component.name, { ...address, country: event.target.value })} />
      </div>
    }
    if (component.type === 'FILE_UPLOAD') {
      const uploaded = Array.isArray(value) ? value : []
      return <div className="space-y-2">
        <input
          {...common}
          type="file"
          accept={(component.acceptedTypes || []).join(',') || undefined}
          multiple={Number(component.maxFiles || 1) > 1}
          disabled={busy || uploading[component.name] === true}
          onChange={(event) => uploadFiles(component, event.target.files)}
        />
        {uploading[component.name] ? <div className="text-xs text-slate-500">Uploading…</div> : null}
        {uploaded.length ? <div className="text-xs text-slate-500">{uploaded.length} file{uploaded.length === 1 ? '' : 's'} uploaded</div> : null}
      </div>
    }
    if (component.type === 'RECORD_PICKER') {
      const minChars = Math.max(1, Math.min(5, Number(component.searchMinChars ?? 2)))
      const state = recordSearch[component.name] || { query: '', loading: false, results: [], searched: false }
      return <div className="relative">
        <div className="flex gap-2">
          <input {...common} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2" placeholder={component.placeholder || 'Search records…'} value={state.query} onChange={(event) => searchRecords(component, event.target.value)} />
          {value && component.allowClear !== false ? <button type="button" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50" onClick={() => { setValue(component.name, ''); setRecordSearch((current) => ({ ...current, [component.name]: { query: '', loading: false, results: [], searched: false } })); }}>Clear</button> : null}
        </div>
        {state.query.length > 0 && state.query.length < minChars ? <div className="mt-1 text-xs text-slate-500">Type {minChars - state.query.length} more character{minChars - state.query.length === 1 ? '' : 's'} to search.</div> : null}
        {state.loading ? <div className="mt-1 text-xs text-slate-500">Searching…</div> : null}
        {!state.loading && state.searched && !state.results.length ? <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">{state.failed ? 'Search is temporarily unavailable.' : (component.noResultsMessage || 'No matching records')}</div> : null}
        {state.results.length ? <div className="mt-1 max-h-48 overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          {state.results.map((item) => <button key={`${item.objectApiName}:${item.recordId}`} type="button" className="block w-full border-b border-slate-100 px-3 py-2 text-left hover:bg-slate-50" onClick={() => {
            setValue(component.name, item.recordId)
            setRecordSearch((current) => ({ ...current, [component.name]: { query: item.primaryLabel || String(item.recordId), loading: false, results: [], searched: false } }))
          }}>
            <div className="text-sm font-medium text-slate-800">{item.primaryLabel || item.recordId}</div>
            <div className="text-xs text-slate-500">{item.objectLabel}{item.secondaryLabel ? ` · ${item.secondaryLabel}` : ''}</div>
          </button>)}
        </div> : null}
        {value ? <div className="mt-1 text-[11px] text-slate-500">Selected record: {String(value)}</div> : null}
      </div>
    }
    if (component.type === 'DATA_TABLE') {
      const rows = Array.isArray(component.rows) ? component.rows : []
      const selected = Array.isArray(value) ? value : []
      const columns = Array.isArray(component.columns) && component.columns.length
        ? component.columns
        : [...new Set(rows.flatMap((row) => Object.keys(row || {})).filter((key) => key !== 'id'))].slice(0, 8)
      const cell = (row, path) => String(path || '').split('.').filter(Boolean).reduce((current, part) => current == null ? undefined : current?.[part], row)
      const rowKey = (row, index) => row?.id ?? index
      const toggle = (key) => {
        if (component.selectionMode === 'none') return
        if (component.selectionMode === 'single') return setValue(component.name, selected.includes(key) ? [] : [key])
        setValue(component.name, selected.includes(key) ? selected.filter((item) => item !== key) : [...selected, key])
      }
      return <div className="overflow-auto rounded-lg border border-slate-200"><table className="min-w-full text-sm">
        <thead className="bg-slate-50"><tr>{component.selectionMode !== 'none' ? <th className="p-2 text-left" /> : null}{columns.map((column) => <th key={column} className="p-2 text-left text-xs font-semibold text-slate-600">{column}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => {
          const key = rowKey(row, index)
          return <tr key={key} className="border-t border-slate-100">{component.selectionMode !== 'none' ? <td className="p-2"><input type={component.selectionMode === 'single' ? 'radio' : 'checkbox'} checked={selected.includes(key)} onChange={() => toggle(key)} /></td> : null}{columns.map((column) => <td key={column} className="p-2">{String(cell(row, column) ?? '')}</td>)}</tr>
        })}</tbody>
      </table></div>
    }
    return <input {...common} className="w-full rounded-lg border border-slate-300 px-3 py-2" value={value ?? ''} onChange={(event) => setValue(component.name, event.target.value)} />
  }

  const renderScreenComponent = (component, index, { nested = false } = {}) => {
    if (!componentVisible(component, values)) return null
    const key = component.id || index
    const spanClass = 'col-span-12'
    const layoutStyle = componentLayoutStyle(component, nested)
    const childComponents = component.id
      ? components.filter((candidate) => candidate?.layoutParentId === component.id && componentVisible(candidate, values))
      : []

    if (component.type === 'CUSTOM_COMPONENT') return <div key={key} className={spanClass} style={layoutStyle}>{renderRegisteredComponent(component)}</div>
    if (component.type === 'SECTION') {
      const isCollapsed = component.collapsible === true && collapsedSections[component.id] === true
      return <section key={key} className={`${spanClass} overflow-hidden rounded-xl border border-slate-200 bg-white`} style={layoutStyle}>
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div className="min-w-0"><div className="text-sm font-semibold text-slate-800">{component.heading || component.label || 'Section'}</div>{component.helpText ? <div className="mt-0.5 text-xs text-slate-500">{component.helpText}</div> : null}</div>
          {component.collapsible ? <button type="button" className="shrink-0 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100" aria-expanded={!isCollapsed} onClick={() => setCollapsedSections((current) => ({ ...current, [component.id]: !isCollapsed }))}>{isCollapsed ? 'Expand' : 'Collapse'}</button> : null}
        </div>
        {!isCollapsed ? <div className="grid grid-cols-12 gap-4 p-4">{childComponents.length ? childComponents.map((child) => renderScreenComponent(child, components.indexOf(child))) : <div className="col-span-12 text-xs text-slate-400">No content in this section.</div>}</div> : null}
      </section>
    }
    if (component.type === 'COLUMNS') {
      const columnCount = Math.max(2, Math.min(4, Number(component.columnCount || 2)))
      const gap = component.columnGap === 'compact' ? 'gap-2' : component.columnGap === 'wide' ? 'gap-8' : 'gap-4'
      const buckets = Array.from({ length: columnCount }, () => [])
      childComponents.forEach((child) => {
        const requested = Number(child.layoutColumn || 1)
        const bucket = Math.max(1, Math.min(columnCount, Number.isFinite(requested) ? requested : 1)) - 1
        buckets[bucket].push(child)
      })
      return <div key={key} className={`${spanClass} grid ${gap}`} style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}>
        {buckets.map((bucket, columnIndex) => <div key={columnIndex} className="grid min-w-0 grid-cols-12 content-start gap-4">{bucket.length ? bucket.map((child) => renderScreenComponent(child, components.indexOf(child), { nested: true })) : <div className="col-span-12 min-h-10 rounded-lg border border-dashed border-slate-200" aria-hidden="true" />}</div>)}
      </div>
    }
    if (component.type === 'DISPLAY_TEXT') return <div key={key} className={`${spanClass} text-sm leading-6 text-slate-700`}>{component.text || component.label}</div>
    if (component.type === 'PROGRESS') {
      const stages = Array.isArray(screen.stages) ? screen.stages : []
      const currentStage = component.resolvedStage ?? screen.currentStage
      const currentValue = currentStage?.value ?? currentStage
      const currentOrder = Number(currentStage?.order || 0)
      return <div key={key} className={spanClass} style={layoutStyle}>
        {component.progressStyle === 'bar' ? <div><div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-slate-900" style={{ width: `${stages.length ? Math.max(0, Math.min(100, ((Math.max(1, currentOrder || 1)) / stages.length) * 100)) : 0}%` }} /></div>{component.showStageLabels !== false ? <div className="mt-2 text-xs text-slate-600">{currentStage?.label || currentValue || ''}</div> : null}</div>
        : component.progressStyle === 'compact' ? <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">{currentStage?.label || currentValue || 'In progress'}</div>
        : <div className="flex items-center gap-2 overflow-x-auto">{stages.map((stage, stageIndex) => { const active = currentValue != null ? String(stage.value) === String(currentValue) : currentOrder ? Number(stage.order) === currentOrder : stageIndex === 0; const complete = currentOrder ? Number(stage.order) < currentOrder : false; return <div key={stage.value || stage.label || stageIndex} className="flex min-w-0 flex-1 items-center gap-2"><span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[11px] font-semibold ${active ? 'border-slate-900 bg-slate-900 text-white' : complete ? 'border-slate-400 bg-slate-200 text-slate-700' : 'border-slate-300 bg-white text-slate-500'}`}>{stageIndex + 1}</span>{component.showStageLabels !== false ? <span className={`truncate text-xs ${active ? 'font-semibold text-slate-900' : 'text-slate-500'}`}>{stage.label}</span> : null}</div> })}</div>}
      </div>
    }
    if (component.type === 'IMAGE') return <div key={key} className={spanClass} style={layoutStyle}><img src={component.resolvedSource || component.source || ''} alt={component.altText || component.label || ''} className="max-h-80 max-w-full rounded-lg object-contain" /></div>
    if (component.type === 'LINK') return <div key={key} className={spanClass} style={layoutStyle}><a href={component.resolvedHref || component.href || '#'} target={component.linkTarget === 'new' ? '_blank' : '_self'} rel={component.linkTarget === 'new' ? 'noreferrer' : undefined} className="text-sm font-medium text-blue-700 underline">{component.label || component.resolvedHref || component.href}</a></div>
    return <div key={key} className={spanClass} style={layoutStyle}>
      <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor={component.id || component.name}>{component.label || component.name}{component.required ? <span className="ml-1 text-red-600">*</span> : null}</label>
      {renderInput(component)}
      {component.helpText && !['CHECKBOX','TOGGLE'].includes(component.type) ? <p className="mt-1 text-xs text-slate-500">{component.helpText}</p> : null}
      {errors[component.name] ? <p className="mt-1 text-xs font-medium text-red-600">{errors[component.name]}</p> : null}
    </div>
  }

  if (!session) return <div className="min-h-screen bg-slate-50 p-8 text-sm text-slate-600">{message || 'Loading flow…'}</div>
  if (session.status === 'PAUSED') return <div className="min-h-screen bg-slate-50 p-8"><div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm"><h1 className="text-xl font-semibold text-slate-900">Flow paused</h1><p className="mt-3 text-sm text-slate-600">{message || 'Resume when you are ready to continue.'}</p><button type="button" className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white" onClick={async () => { try { const response = await apiRequest(`/api/platform/flow-sessions/${encodeURIComponent(session.id)}/resume`, { method: 'POST' }); hydrate(response?.data); setMessage(''); } catch (error) { setMessage(error.message || 'Unable to resume this flow.') } }}>Resume</button></div></div>
  if (session.status !== 'ACTIVE' || !screen) return <div className="min-h-screen bg-slate-50 p-8"><div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm"><h1 className="text-xl font-semibold text-slate-900">Flow</h1><p className="mt-3 text-sm text-slate-600">{message || `This flow session is ${String(session.status || 'closed').toLowerCase()}.`}</p></div></div>

  const containerStyle = screen.style?.container || {}
  const headerStyle = screen.style?.header || {}
  const footerStyle = screen.style?.footer || {}

  return <div className="min-h-screen bg-slate-50 px-4 py-8">
    <main className="mx-auto max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" style={{backgroundColor:containerStyle.backgroundColor||undefined,borderColor:containerStyle.borderColor||undefined,borderWidth:containerStyle.borderWidth||undefined,borderRadius:containerStyle.borderRadius||undefined}}>
      {screen.showHeader !== false ? <header className="border-b border-slate-200 px-6 py-5" style={{backgroundColor:headerStyle.backgroundColor||undefined,color:headerStyle.textColor||undefined}}>
        <h1 className="text-xl font-semibold text-slate-900">{screen.label || 'Flow'}</h1>
        {screen.description ? <p className="mt-1 text-sm text-slate-500">{screen.description}</p> : null}
        {Array.isArray(screen.stages) && screen.stages.length ? <div className="mt-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {screen.stages.map((stage, index) => {
              const currentValue = screen.currentStage?.value ?? screen.currentStage
              const currentOrder = Number(screen.currentStage?.order || 0)
              const active = currentValue != null ? String(stage.value) === String(currentValue) : currentOrder ? Number(stage.order) === currentOrder : index === 0
              const complete = currentOrder ? Number(stage.order) < currentOrder : false
              return <div key={stage.value || stage.label || index} className="flex min-w-0 flex-1 items-center gap-2">
                <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${active ? 'border-slate-900 bg-slate-900 text-white' : complete ? 'border-slate-400 bg-slate-200 text-slate-700' : 'border-slate-300 bg-white text-slate-500'}`}>{index + 1}</div>
                <span className={`truncate text-xs ${active ? 'font-semibold text-slate-900' : 'text-slate-500'}`}>{stage.label}</span>
                {index < screen.stages.length - 1 ? <span className="h-px flex-1 bg-slate-200" /> : null}
              </div>
            })}
          </div>
        </div> : null}
      </header> : null}
      <section className="grid grid-cols-12 gap-4 p-6">
        {components.filter((component) => !component?.layoutParentId).map((component, index) => renderScreenComponent(component, index))}
      </section>
      {message ? <div className="mx-6 mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{message}</div> : null}
      {screen.showFooter !== false ? <footer className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4" style={{backgroundColor:footerStyle.backgroundColor||undefined}}>
        <div>{screen.allowBack ? <button type="button" disabled={busy} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50" onClick={() => submit('BACK')}>{screen.backLabel || 'Previous'}</button> : null}</div>
        <div className="flex gap-2">
          {screen.allowPause ? <button type="button" disabled={busy} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50" onClick={() => submit('PAUSE')}>{screen.pauseLabel || 'Pause'}</button> : null}
          {screen.allowFinish ? <button type="button" disabled={busy} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50" onClick={() => submit('FINISH')}>{screen.finishLabel || 'Finish'}</button> : null}
          {screen.allowNext !== false ? <button type="button" disabled={busy} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={() => submit('NEXT')}>{busy ? 'Working…' : (screen.nextLabel || 'Next')}</button> : null}
        </div>
      </footer> : null}
    </main>
  </div>
}
