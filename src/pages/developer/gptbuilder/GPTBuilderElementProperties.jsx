import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, RotateCcw, X } from 'lucide-react'
import { elementByKey } from './GPTBuilderElements'

export function apiNameFromElementLabel(label, fallback = 'Element') {
  let value = String(label || '').trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '')
  if (!value) value = fallback
  if (!/^[A-Za-z]/.test(value)) value = `${fallback}_${value}`
  return value.slice(0, 80).replace(/_+$/g, '')
}

function uniqueLabel(base, elements, excludeId = '') {
  const clean = String(base || 'Element').trim() || 'Element'
  const used = new Set(elements.filter((item) => item.id !== excludeId).map((item) => String(item.label || '').toLowerCase()))
  if (!used.has(clean.toLowerCase())) return clean
  let number = 2
  while (used.has(`${clean} ${number}`.toLowerCase())) number += 1
  return `${clean} ${number}`
}

function uniqueApiName(base, elements, excludeId = '') {
  const clean = apiNameFromElementLabel(base)
  const used = new Set(elements.filter((item) => item.id !== excludeId).map((item) => String(item.apiName || '').toLowerCase()))
  if (!used.has(clean.toLowerCase())) return clean
  let number = 2
  while (used.has(`${clean}_${number}`.toLowerCase())) number += 1
  return `${clean}_${number}`
}

export function generatedLabelForElement(elementKey, config = {}) {
  const element = elementByKey(elementKey)
  const base = element?.label || 'Element'
  // Phase-specific editors can provide the same semantic hint without
  // reimplementing shared naming behavior.
  const explicit = String(config.generatedLabel || config.autoLabel || config.summaryLabel || '').trim()
  if (explicit) return explicit
  if (config.objectLabel) {
    const verbs = {
      get_records: 'Get',
      create_records: 'Create',
      update_records: 'Update',
      delete_records: 'Delete',
    }
    if (verbs[elementKey]) return `${verbs[elementKey]} ${config.objectLabel}`
  }
  if (elementKey === 'subflow' && config.flowLabel) return `Run ${config.flowLabel}`
  if (elementKey === 'action' && config.actionLabel) return config.actionLabel
  if (elementKey === 'loop' && config.collectionLabel) return `Loop ${config.collectionLabel}`
  if (elementKey === 'collection_filter' && config.collectionLabel) return `Filter ${config.collectionLabel}`
  if (elementKey === 'collection_sort' && config.collectionLabel) return `Sort ${config.collectionLabel}`
  if (elementKey === 'transform' && config.targetLabel) return `Transform to ${config.targetLabel}`
  return base
}

export function createElementInstance(elementKey, elements, options = {}) {
  const id = options.id || (globalThis.crypto?.randomUUID?.() || `element-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const source = options.source || 'auto'
  const generated = uniqueLabel(generatedLabelForElement(elementKey, options.config || {}), elements, id)
  const apiName = uniqueApiName(apiNameFromElementLabel(generated, 'Element'), elements, id)
  return {
    id,
    key: elementKey,
    label: generated,
    apiName,
    description: '',
    labelSource: 'auto',
    apiNameSource: 'auto',
    config: options.config || {},
    configured: false,
    source,
    position: options.position || null,
  }
}

export function refreshGeneratedIdentity(instance, elements, nextConfig) {
  const config = nextConfig || instance.config || {}
  if (instance.labelSource === 'manual') return { ...instance, config }
  const nextLabel = uniqueLabel(generatedLabelForElement(instance.key, config), elements, instance.id)
  const nextApi = instance.apiNameSource === 'manual'
    ? instance.apiName
    : uniqueApiName(apiNameFromElementLabel(nextLabel, 'Element'), elements, instance.id)
  return { ...instance, config, label: nextLabel, apiName: nextApi }
}

export function elementCommonErrors(instance, elements) {
  const errors = []
  if (!String(instance?.label || '').trim()) errors.push('Label is required.')
  const api = String(instance?.apiName || '')
  if (!api) errors.push('API Name is required.')
  else if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(api) || api.endsWith('_') || api.includes('__')) errors.push('API Name must begin with a letter and contain only letters, numbers, and single underscores.')
  if (elements.some((item) => item.id !== instance.id && String(item.apiName || '').toLowerCase() === api.toLowerCase())) errors.push('API Name must be unique in the flow.')
  return errors
}

function CommonFields({ draft, elements, onChange, newElement }) {
  const labelRef = useRef(null)
  const errors = useMemo(() => elementCommonErrors(draft, elements), [draft, elements])

  useEffect(() => {
    if (!newElement || !labelRef.current) return
    labelRef.current.focus()
    labelRef.current.select()
  }, [newElement])

  const patchLabel = (label) => {
    const apiName = draft.apiNameSource === 'manual'
      ? draft.apiName
      : uniqueApiName(apiNameFromElementLabel(label, 'Element'), elements, draft.id)
    onChange({ ...draft, label, apiName, labelSource: 'manual' })
  }
  const patchApi = (apiName) => onChange({ ...draft, apiName, apiNameSource: 'manual' })

  return <div className="gptb-shared-properties">
    <label><span>Label <b>*</b></span><input ref={labelRef} value={draft.label || ''} onChange={(event) => patchLabel(event.target.value)}/></label>
    <label><span>API Name <b>*</b></span><input value={draft.apiName || ''} onChange={(event) => patchApi(event.target.value)}/><small>Auto-populated from the label until you edit the API name.</small></label>
    <label><span>Description</span><textarea rows={3} value={draft.description || ''} onChange={(event) => onChange({ ...draft, description: event.target.value })} placeholder="Describe what this element does."/></label>
    {errors.length ? <div className="gptb-element-validation" role="alert"><AlertTriangle size={14}/><span>{errors.map((error) => <small key={error}>{error}</small>)}</span></div> : null}
  </div>
}

export default function GPTBuilderElementProperties({
  instance,
  elements,
  layout,
  isNew,
  onLiveChange,
  onCommit,
  onCancel,
  onClose,
  children,
}) {
  const element = elementByKey(instance?.key)
  const isScreen = instance?.key === 'screen'
  const isAction = instance?.key === 'action'
  const useDialog = layout === 'free' || isScreen || isAction
  const [draft, setDraft] = useState(instance)
  const [history, setHistory] = useState([])
  const original = useRef(instance)

  useEffect(() => {
    setDraft(instance)
    original.current = instance
    setHistory([])
  }, [instance?.id])

  if (!instance || !element) return null

  const change = (next) => {
    setHistory((current) => [...current, draft].slice(-25))
    setDraft(next)
    if (!useDialog) onLiveChange?.(next)
  }

  const undo = () => {
    setHistory((current) => {
      if (!current.length) return current
      const previous = current[current.length - 1]
      setDraft(previous)
      if (!useDialog) onLiveChange?.(previous)
      return current.slice(0, -1)
    })
  }

  const commonErrors = elementCommonErrors(draft, elements)
  const canDone = commonErrors.length === 0

  const closePanel = () => {
    // Current auto-layout property panels keep edits when closed. Generated
    // labels are refreshed at close unless the user manually edited Label.
    const refreshed = refreshGeneratedIdentity(draft, elements, draft.config)
    onLiveChange?.(refreshed)
    onClose?.(refreshed)
  }

  const cancelDialog = () => {
    onCancel?.(original.current, { removeNew: isNew })
  }

  const doneDialog = () => {
    if (!canDone) return
    const refreshed = refreshGeneratedIdentity(draft, elements, draft.config)
    onCommit?.(refreshed)
  }

  const updateConfig = (nextConfig) => {
    const next = refreshGeneratedIdentity({ ...draft, config: nextConfig }, elements, nextConfig)
    change(next)
  }
  const setConfigured = (configured, validationErrors = []) => {
    const next = { ...draft, configured: Boolean(configured), validationErrors }
    setDraft(next)
    if (!useDialog) onLiveChange?.(next)
  }

  const body = <>
    <CommonFields draft={draft} elements={elements} onChange={change} newElement={isNew}/>
    <div className="gptb-element-specific-slot">
      {typeof children === 'function'
        ? children({ draft, updateConfig, setConfigured })
        : children || <div className="gptb-shared-phase-note">Element-specific configuration is added in its dedicated parity phase.</div>}
    </div>
  </>

  if (useDialog) {
    return <div className="gptb-element-editor-modal-backdrop">
      <section className={`gptb-element-dialog ${isScreen ? 'is-screen' : ''}`} role="dialog" aria-modal="true" aria-label={`${isNew ? 'New' : 'Edit'} ${element.label}`}>
        <header><div><strong>{isNew ? `New ${element.label}` : draft.label}</strong><small>{element.label}</small></div><button className="gptb-icon-button" aria-label={`Close ${element.label}`} onClick={cancelDialog}><X size={16}/></button></header>
        <div className="gptb-element-dialog-body">{body}</div>
        <footer><button className="gptb-button" onClick={cancelDialog}>Cancel</button><button className="gptb-button is-brand" disabled={!canDone} onClick={doneDialog}>Done</button></footer>
      </section>
    </div>
  }

  return <aside className="gptb-element-properties-panel" aria-label={`${element.label} Properties`}>
    <header>
      <div><strong>{isNew ? `New ${element.label}` : draft.label}</strong><small>{element.label}</small></div>
      <div><button className="gptb-icon-button" aria-label="Undo element change" disabled={!history.length} onClick={undo}><RotateCcw size={15}/></button><button className="gptb-icon-button" aria-label={`Close ${element.label} properties`} onClick={closePanel}><X size={16}/></button></div>
    </header>
    <div className="gptb-element-properties-body">{body}</div>
    <div className="gptb-panel-save-note">Changes stay in the draft when you close this panel. Use Undo to reverse individual edits.</div>
  </aside>
}
