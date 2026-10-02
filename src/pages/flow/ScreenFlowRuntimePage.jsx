import { useEffect, useMemo, useState } from 'react'
import { apiRequest } from '../../services/api'

function emptyValue(component) {
  if (['CHECKBOX_GROUP','MULTI_SELECT','DATA_TABLE','FILE_UPLOAD'].includes(component.type)) return []
  if (['CHECKBOX','TOGGLE'].includes(component.type)) return false
  if (component.type === 'ADDRESS') return { street: '', city: '', postcode: '', country: '' }
  return component.defaultValue ?? ''
}

function widthClass(width) {
  if (width === '1/2') return 'md:col-span-6'
  if (width === '1/3') return 'md:col-span-4'
  if (width === '2/3') return 'md:col-span-8'
  return 'md:col-span-12'
}

function localResourceValue(path, values) {
  if (!path) return undefined
  const raw = String(path)
  if (raw.startsWith('variables.')) return raw.slice('variables.'.length).split('.').filter(Boolean).reduce((current, part) => current == null ? undefined : current?.[part], values)
  if (Object.prototype.hasOwnProperty.call(values || {}, raw)) return values[raw]
  return undefined
}

function componentVisible(component, values) {
  if (component?.visible === false) return false
  if (!component?.visibilityResource) return true
  const localValue = localResourceValue(component.visibilityResource, values)
  const actual = localValue === undefined ? component.visibilityInitialValue : localValue
  const operator = component.visibilityOperator || 'truthy'
  if (operator === 'falsy') return actual == null || actual === '' || actual === false || (Array.isArray(actual) && actual.length === 0)
  if (operator === 'equals') return String(actual ?? '') === String(component.visibilityValue ?? '')
  if (operator === 'not_equals') return String(actual ?? '') !== String(component.visibilityValue ?? '')
  return !(actual == null || actual === '' || actual === false || (Array.isArray(actual) && actual.length === 0))
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
      return <textarea {...common} rows={component.rows || 4} className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder={component.placeholder || ''} value={value ?? ''} onChange={(event) => setValue(component.name, event.target.value)} />
    }
    if (['TEXT','EMAIL','PASSWORD','DATE','DATETIME','NUMBER'].includes(component.type)) {
      const type = component.type === 'DATETIME' ? 'datetime-local' : component.type.toLowerCase()
      return <input {...common} type={type} min={component.min} max={component.max} pattern={component.pattern || undefined} className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder={component.placeholder || ''} value={value ?? ''} onChange={(event) => setValue(component.name, component.type === 'NUMBER' ? event.target.value : event.target.value)} />
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
      return <input {...common} type="file" multiple={component.multiple !== false} onChange={(event) => setValue(component.name, Array.from(event.target.files || []).map((file) => ({ name: file.name, size: file.size, type: file.type })))} />
    }
    if (component.type === 'RECORD_PICKER') {
      return <input {...common} className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder={component.placeholder || 'Record ID or search value'} value={value ?? ''} onChange={(event) => setValue(component.name, event.target.value)} />
    }
    if (component.type === 'DATA_TABLE') {
      const rows = Array.isArray(component.rows) ? component.rows : []
      const selected = Array.isArray(value) ? value : []
      return <div className="overflow-auto rounded-lg border border-slate-200"><table className="min-w-full text-sm"><tbody>{rows.map((row, index) => <tr key={row.id || index} className="border-b border-slate-100"><td className="p-2"><input type="checkbox" checked={selected.includes(row.id || index)} onChange={(event) => setValue(component.name, event.target.checked ? [...selected, row.id || index] : selected.filter((item) => item !== (row.id || index)))} /></td>{Object.entries(row).filter(([key]) => key !== 'id').map(([key, cell]) => <td key={key} className="p-2">{String(cell ?? '')}</td>)}</tr>)}</tbody></table></div>
    }
    return <input {...common} className="w-full rounded-lg border border-slate-300 px-3 py-2" value={value ?? ''} onChange={(event) => setValue(component.name, event.target.value)} />
  }

  if (!session) return <div className="min-h-screen bg-slate-50 p-8 text-sm text-slate-600">{message || 'Loading flow…'}</div>
  if (session.status !== 'ACTIVE' || !screen) return <div className="min-h-screen bg-slate-50 p-8"><div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm"><h1 className="text-xl font-semibold text-slate-900">Flow</h1><p className="mt-3 text-sm text-slate-600">{message || `This flow session is ${String(session.status || 'closed').toLowerCase()}.`}</p></div></div>

  return <div className="min-h-screen bg-slate-50 px-4 py-8">
    <main className="mx-auto max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {screen.showHeader !== false ? <header className="border-b border-slate-200 px-6 py-5">
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
        {components.filter((component) => componentVisible(component, values)).map((component, index) => {
          if (component.type === 'SECTION') return <div key={component.id || index} className="col-span-12 border-b border-slate-200 pb-2 text-sm font-semibold text-slate-800">{component.label}</div>
          if (component.type === 'COLUMNS') return <div key={component.id || index} className="col-span-12 grid grid-cols-12 gap-4" />
          if (component.type === 'DISPLAY_TEXT') return <div key={component.id || index} className={`col-span-12 ${widthClass(component.width)} text-sm leading-6 text-slate-700`}>{component.text || component.label}</div>
          if (component.type === 'IMAGE') return <div key={component.id || index} className={`col-span-12 ${widthClass(component.width)}`}><img src={component.src || component.url || ''} alt={component.alt || component.label || ''} className="max-h-80 max-w-full rounded-lg object-contain" /></div>
          if (component.type === 'LINK') return <div key={component.id || index} className={`col-span-12 ${widthClass(component.width)}`}><a href={component.url || '#'} target={component.newWindow === false ? '_self' : '_blank'} rel="noreferrer" className="text-sm font-medium text-blue-700 underline">{component.label || component.url}</a></div>
          return <div key={component.id || index} className={`col-span-12 ${widthClass(component.width)}`}>
            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor={component.id || component.name}>{component.label || component.name}{component.required ? <span className="ml-1 text-red-600">*</span> : null}</label>
            {renderInput(component)}
            {component.helpText && !['CHECKBOX','TOGGLE'].includes(component.type) ? <p className="mt-1 text-xs text-slate-500">{component.helpText}</p> : null}
            {errors[component.name] ? <p className="mt-1 text-xs font-medium text-red-600">{errors[component.name]}</p> : null}
          </div>
        })}
      </section>
      {message ? <div className="mx-6 mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{message}</div> : null}
      {screen.showFooter !== false ? <footer className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
        <div>{screen.allowBack ? <button type="button" disabled={busy} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50" onClick={() => submit('BACK')}>{screen.backLabel || 'Previous'}</button> : null}</div>
        <div className="flex gap-2">
          {screen.allowFinish ? <button type="button" disabled={busy} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50" onClick={() => submit('FINISH')}>{screen.finishLabel || 'Finish'}</button> : null}
          <button type="button" disabled={busy} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={() => submit('NEXT')}>{busy ? 'Working…' : (screen.nextLabel || 'Next')}</button>
        </div>
      </footer> : null}
    </main>
  </div>
}
