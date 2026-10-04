import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleHelp,
  Copy, Eye, LayoutPanelLeft, MoreHorizontal, Play, Plus, Redo2, Save, Search,
  Settings2, Sparkles, Trash2, Undo2, Workflow, X, Zap, ZoomIn, ZoomOut,
} from 'lucide-react'
import { apiRequest } from '../../../services/api'
import {
  ElementPicker, FreeFormElements, PendingElementCard, elementByKey,
} from './GPTBuilderElements'
import GPTBuilderElementProperties, {
  createElementInstance, elementCommonErrors,
} from './GPTBuilderElementProperties'
import GPTBuilderGetRecords, { getRecordsRuntimeAction } from './GPTBuilderGetRecords'
import GPTBuilderRecordTriggerPaths from './GPTBuilderStartOptions'
import './GPTBuilderPage.css'

const FLOW_CATEGORIES = [
  { key: 'frequent', label: 'Frequently Used' },
  { key: 'triggered', label: 'Triggered' },
  { key: 'screens', label: 'Screens' },
  { key: 'autolaunched', label: 'Autolaunched Automations' },
]

const FLOW_TYPES = [
  { key: 'record', category: 'triggered', featured: true, label: 'Record-Triggered Flow', description: 'Launches when a record is created, updated, or deleted.', icon: Zap, tone: 'purple', startNeedsConfiguration: true },
  { key: 'screen', category: 'screens', featured: true, label: 'Screen Flow', description: 'Guides users through screens that collect or display information.', icon: LayoutPanelLeft, tone: 'blue', startNeedsConfiguration: false },
  { key: 'autolaunched', category: 'autolaunched', featured: true, label: 'Autolaunched Flow (No Trigger)', description: 'Runs in the background when another process invokes it.', icon: Workflow, tone: 'green', startNeedsConfiguration: false },
  { key: 'schedule', category: 'triggered', featured: false, label: 'Schedule-Triggered Flow', description: 'Runs in the background at a specified time and frequency.', icon: Play, tone: 'orange', startNeedsConfiguration: true },
  { key: 'platform_event', category: 'triggered', featured: false, label: 'Platform Event-Triggered Flow', description: 'Runs when a platform event message is received.', icon: Sparkles, tone: 'cyan', startNeedsConfiguration: true },
]

const objectKey = (value) => String(value?.object_key || value?.api_name || value?.apiName || value?.key || value?.id || '')
const objectLabel = (value) => value?.label || value?.name || objectKey(value)
const fieldKey = (value) => String(value?.api_name || value?.apiName || value?.field_key || value?.key || value?.id || '')
const fieldLabel = (value) => value?.label || value?.name || fieldKey(value)

function apiNameFromLabel(label, fallback = 'New_Flow') {
  let value = String(label || '').trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '')
  if (!value) value = fallback
  if (!/^[A-Za-z]/.test(value)) value = `Flow_${value}`
  return value.replace(/_+$/g, '').slice(0, 80)
}

function initialStart(flowType) {
  if (flowType === 'record') return { objectKey: '', trigger: 'created_or_updated', conditionMode: 'none', conditions: [], formula: '', updateMode: 'every_time', optimize: 'actions', asyncPath: false, scheduledPaths: [] }
  if (flowType === 'schedule') return { startDate: '', startTime: '', frequency: 'Daily', batchSize: 200, objectKey: '', conditionMode: 'none', conditions: [], formula: '' }
  if (flowType === 'platform_event') return { eventKey: '' }
  return {}
}

function flowTriggerKey(flowType, start) {
  if (flowType === 'schedule') return 'scheduled'
  if (flowType === 'platform_event') return start.eventKey || 'manual'
  if (flowType !== 'record') return 'manual'
  if (start.trigger === 'deleted') return 'after_delete'
  const fast = start.optimize === 'fast'
  if (start.trigger === 'created') return fast ? 'before_create' : 'after_create'
  if (start.trigger === 'updated') return fast ? 'before_update' : 'after_update'
  return fast ? 'before_save' : 'after_save'
}

function startSummary(flowType, start, objects) {
  if (flowType === 'record') {
    const object = objects.find((item) => objectKey(item) === start.objectKey)
    if (!object) return 'Configure Start'
    const trigger = { created: 'Created', updated: 'Updated', created_or_updated: 'Created or Updated', deleted: 'Deleted' }[start.trigger] || 'Created or Updated'
    const count = start.conditionMode === 'none' ? 0 : start.conditions?.length || 0
    return `${objectLabel(object)} · ${trigger}${count ? ` · ${count} Condition${count === 1 ? '' : 's'}` : ''}`
  }
  if (flowType === 'schedule') return start.startDate && start.startTime ? `${start.frequency} · ${start.startDate} ${start.startTime}` : 'Set Schedule'
  if (flowType === 'platform_event') return start.eventKey || 'Select Platform Event'
  return flowType === 'screen' ? 'Screen Flow' : 'No Trigger'
}

function NewAutomation({ onCreate, onClose }) {
  const [step, setStep] = useState('source')
  const [source, setSource] = useState('scratch')
  const [category, setCategory] = useState('frequent')
  const [selected, setSelected] = useState('record')
  const [search, setSearch] = useState('')
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return FLOW_TYPES.filter((flow) => {
      const inCategory = category === 'frequent' ? flow.featured : flow.category === category
      return inCategory && (!needle || `${flow.label} ${flow.description}`.toLowerCase().includes(needle))
    })
  }, [category, search])

  if (step === 'source') return <div className="gptb-modal-backdrop">
    <section className="gptb-new-automation" role="dialog" aria-modal="true" aria-labelledby="gptb-new-title">
      <header className="gptb-new-head"><div><h2 id="gptb-new-title">New Automation</h2><p>How do you want to start?</p></div><button className="gptb-icon-button" aria-label="Close" onClick={onClose}><X size={18}/></button></header>
      <div className="gptb-source-grid">
        <button className={`gptb-source-card ${source === 'scratch' ? 'is-selected' : ''}`} onClick={() => setSource('scratch')}><span className="gptb-source-icon"><Plus size={21}/></span><strong>Start From Scratch</strong><span>Build a new automation from an empty canvas.</span><i>{source === 'scratch' ? '✓' : ''}</i></button>
        <button className={`gptb-source-card ${source === 'template' ? 'is-selected' : ''}`} onClick={() => setSource('template')}><span className="gptb-source-icon"><Copy size={20}/></span><strong>Use a Template</strong><span>Start from a reusable automation template.</span><i>{source === 'template' ? '✓' : ''}</i></button>
      </div>
      <footer className="gptb-new-footer"><button className="gptb-button" onClick={onClose}>Cancel</button><button className="gptb-button is-brand" onClick={() => setStep(source === 'scratch' ? 'type' : 'template')}>Next</button></footer>
    </section>
  </div>

  if (step === 'template') return <div className="gptb-modal-backdrop">
    <section className="gptb-new-automation gptb-template-dialog" role="dialog" aria-modal="true" aria-labelledby="gptb-template-title">
      <header className="gptb-new-head"><div><h2 id="gptb-template-title">New Automation</h2><p>Use a Template</p></div><button className="gptb-icon-button" aria-label="Close" onClick={onClose}><X size={18}/></button></header>
      <div className="gptb-template-body"><label className="gptb-modal-search"><Search size={15}/><input aria-label="Search templates" placeholder="Search templates"/></label><div className="gptb-empty-template"><Copy size={30}/><strong>No templates available</strong><span>GPT Builder does not have any published templates yet.</span></div></div>
      <footer className="gptb-new-footer"><button className="gptb-button" onClick={() => setStep('source')}><ChevronLeft size={14}/> Back</button><span className="gptb-footer-spacer"/><button className="gptb-button" onClick={onClose}>Cancel</button></footer>
    </section>
  </div>

  return <div className="gptb-modal-backdrop">
    <section className="gptb-new-automation gptb-type-dialog" role="dialog" aria-modal="true" aria-labelledby="gptb-type-title">
      <header className="gptb-new-head"><div><h2 id="gptb-type-title">New Automation</h2><p>Start From Scratch</p></div><button className="gptb-icon-button" aria-label="Close" onClick={onClose}><X size={18}/></button></header>
      <div className="gptb-type-layout">
        <aside className="gptb-type-categories">{FLOW_CATEGORIES.map((item) => <button key={item.key} className={category === item.key ? 'is-active' : ''} onClick={() => { setCategory(item.key); setSearch('') }}><span>{item.label}</span><ChevronRight size={14}/></button>)}</aside>
        <div className="gptb-type-content">
          <label className="gptb-modal-search"><Search size={15}/><input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search automation types" placeholder="Search automation types"/></label>
          <div className="gptb-type-grid">{rows.length ? rows.map((flow) => { const Icon = flow.icon; return <button key={flow.key} className={`gptb-type-card ${selected === flow.key ? 'is-selected' : ''}`} onClick={() => setSelected(flow.key)}><span className={`gptb-type-icon is-${flow.tone}`}><Icon size={21}/></span><span><strong>{flow.label}</strong><small>{flow.description}</small></span><i>{selected === flow.key ? '✓' : ''}</i></button> }) : <div className="gptb-no-results">No automation types match your search.</div>}</div>
        </div>
      </div>
      <footer className="gptb-new-footer"><button className="gptb-button" onClick={() => setStep('source')}><ChevronLeft size={14}/> Back</button><span className="gptb-footer-spacer"/><button className="gptb-button" onClick={onClose}>Cancel</button><button className="gptb-button is-brand" onClick={() => onCreate(FLOW_TYPES.find((flow) => flow.key === selected))}>Create</button></footer>
    </section>
  </div>
}

function startFieldType(field) {
  return String(field?.field_type || field?.data_type || field?.type || 'text').toLowerCase()
}

function startOperators(field, allowIsChanged = false) {
  const type = startFieldType(field)
  const operators = [
    ['equals', 'Equals'],
    ['not_equals', 'Does Not Equal'],
    ['is_empty', 'Is Null'],
  ]
  if (['number','decimal','currency','date','datetime','time'].includes(type)) operators.push(
    ['greater_than', 'Greater Than'],
    ['greater_than_or_equal', 'Greater Than or Equal'],
    ['less_than', 'Less Than'],
    ['less_than_or_equal', 'Less Than or Equal'],
  )
  if (allowIsChanged) operators.push(['changed', 'Is Changed'])
  return operators
}

function StartConditionValue({ field, row, onChange }) {
  if (row.operator === 'is_empty' || row.operator === 'changed') {
    return <select value={String(row.value ?? true)} onChange={(event) => onChange(event.target.value === 'true')}><option value="true">True</option><option value="false">False</option></select>
  }
  const type = startFieldType(field)
  const options = field?.config?.options || field?.config?.values || field?.options || []
  if (['select','picklist'].includes(type) && Array.isArray(options) && options.length) {
    return <select value={row.value ?? ''} onChange={(event) => onChange(event.target.value)}><option value="">Select a value</option>{options.map((option) => {
      const value = typeof option === 'object' ? option.value ?? option.key ?? option.label : option
      const label = typeof option === 'object' ? option.label ?? option.value ?? option.key : option
      return <option key={String(value)} value={String(value)}>{String(label)}</option>
    })}</select>
  }
  if (type === 'boolean') return <select value={String(row.value ?? false)} onChange={(event) => onChange(event.target.value === 'true')}><option value="false">False</option><option value="true">True</option></select>
  if (['number','decimal','currency'].includes(type)) return <input type="number" value={row.value ?? ''} onChange={(event) => onChange(event.target.value === '' ? '' : Number(event.target.value))}/>
  if (type === 'date') return <input type="date" value={row.value || ''} onChange={(event) => onChange(event.target.value)}/>
  if (type === 'datetime') return <input type="datetime-local" value={row.value || ''} onChange={(event) => onChange(event.target.value)}/>
  return <input value={row.value ?? ''} onChange={(event) => onChange(event.target.value)} placeholder="Value"/>
}

function ConditionsEditor({ object, value, onChange, allowIsChanged = false, customLogic = '', onCustomLogicChange }) {
  const rows = value || []
  const [fields, setFields] = useState([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    let live = true
    if (!object?.id) { setFields([]); return () => { live = false } }
    setLoading(true)
    apiRequest(`/api/platform/objects/${encodeURIComponent(object.id)}/fields`)
      .then((response) => { if (live) setFields((Array.isArray(response?.data) ? response.data : []).filter((field) => field?.active !== false && field?.readable !== false)) })
      .catch(() => { if (live) setFields([]) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [object?.id])
  const patch = (index, next) => onChange(rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...next } : row))
  return <div className="gptb-conditions">
    {rows.map((row, index) => {
      const metadata = fields.find((field) => fieldKey(field) === row.field)
      const operators = startOperators(metadata, allowIsChanged)
      return <div className="gptb-condition-row" key={row.id || index}>
        <select value={row.field || ''} disabled={!object || loading} onChange={(event) => patch(index, { field: event.target.value, operator: 'equals', value: '' })}><option value="">{loading ? 'Loading fields…' : object ? 'Select a field' : 'Select an object first'}</option>{fields.map((field) => <option key={fieldKey(field)} value={fieldKey(field)}>{fieldLabel(field)}</option>)}</select>
        <select value={row.operator || 'equals'} onChange={(event) => patch(index, { operator: event.target.value, value: ['changed','is_empty'].includes(event.target.value) ? true : '' })}>{operators.map(([operator,label]) => <option key={operator} value={operator}>{label}</option>)}</select>
        <StartConditionValue field={metadata} row={row} onChange={(nextValue) => patch(index, { value: nextValue })}/>
        <button aria-label={`Remove condition ${index + 1}`} onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))}><Trash2 size={14}/></button>
      </div>
    })}
    <button className="gptb-inline-action" onClick={() => onChange([...rows, { id: crypto.randomUUID?.() || String(Date.now()), field: '', operator: 'equals', value: '' }])}><Plus size={13}/> Add Condition</button>
    {onCustomLogicChange ? <label className="gptb-start-custom-logic">Condition Logic<input value={customLogic || ''} onChange={(event) => onCustomLogicChange(event.target.value)} placeholder="Example: 1 AND (2 OR 3)"/></label> : null}
  </div>
}

function StartPanel({ flowType, value, onChange, objects, eventTypes, onDone, onCancel }) {
  const selectedObject = objects.find((item) => objectKey(item) === value.objectKey)
  const showUpdateMode = flowType === 'record' && ['updated', 'created_or_updated'].includes(value.trigger) && value.conditionMode !== 'none'
  return <aside className="gptb-config-panel" aria-label="Configure Start">
    <header><div><strong>{flowType === 'schedule' ? 'Set a Schedule' : flowType === 'platform_event' ? 'Configure Start' : 'Configure Start'}</strong><small>{FLOW_TYPES.find((item) => item.key === flowType)?.label}</small></div><button className="gptb-icon-button" aria-label="Close Start configuration" onClick={onCancel}><X size={16}/></button></header>
    <div className="gptb-config-body">
      {flowType === 'record' ? <>
        <section><h3>Select Object</h3><label>Object<select value={value.objectKey || ''} onChange={(event) => onChange({ ...value, objectKey: event.target.value, conditions: [] })}><option value="">Select an object</option>{objects.map((item) => <option key={item.id || objectKey(item)} value={objectKey(item)}>{objectLabel(item)}</option>)}</select></label></section>
        <section><h3>Configure Trigger</h3><label>Trigger the Flow When<select value={value.trigger || 'created_or_updated'} onChange={(event) => onChange({ ...value, trigger: event.target.value })}><option value="created">A record is created</option><option value="updated">A record is updated</option><option value="created_or_updated">A record is created or updated</option><option value="deleted">A record is deleted</option></select></label></section>
        <section><h3>Set Entry Conditions</h3><label>Condition Requirements<select value={value.conditionMode || 'none'} onChange={(event) => onChange({ ...value, conditionMode: event.target.value })}><option value="none">None</option><option value="all">All Conditions Are Met (AND)</option><option value="any">Any Condition Is Met (OR)</option><option value="custom">Custom Condition Logic Is Met</option><option value="formula">Formula Evaluates to True</option></select></label>{value.conditionMode === 'formula' ? <label>Formula<textarea rows={4} value={value.formula || ''} onChange={(event) => onChange({ ...value, formula: event.target.value })} placeholder="Enter a boolean formula"/></label> : value.conditionMode !== 'none' ? <ConditionsEditor object={selectedObject} value={value.conditions} allowIsChanged={['updated','created_or_updated'].includes(value.trigger)} customLogic={value.customConditionLogic || ''} onCustomLogicChange={value.conditionMode === 'custom' ? (customConditionLogic) => onChange({ ...value, customConditionLogic }) : null} onChange={(conditions) => onChange({ ...value, conditions })}/> : null}</section>
        {showUpdateMode ? <section><h3>When to Run the Flow for Updated Records</h3><label className="gptb-radio"><input type="radio" name="gptb-update-mode" checked={(value.updateMode || 'every_time') === 'every_time'} onChange={() => onChange({ ...value, updateMode: 'every_time' })}/><span><b>Every time a record is updated and meets the condition requirements</b></span></label><label className="gptb-radio"><input type="radio" name="gptb-update-mode" checked={value.updateMode === 'transition'} onChange={() => onChange({ ...value, updateMode: 'transition' })}/><span><b>Only when a record is updated to meet the condition requirements</b></span></label></section> : null}
        {value.trigger !== 'deleted' ? <section><h3>Optimize the Flow for</h3><label className="gptb-radio"><input type="radio" name="gptb-optimize" checked={value.optimize === 'fast'} onChange={() => onChange({ ...value, optimize: 'fast', asyncPath: false, scheduledPaths: [] })}/><span><b>Fast Field Updates</b><small>Update fields on the record that triggered the flow before the record is saved.</small></span></label><label className="gptb-radio"><input type="radio" name="gptb-optimize" checked={(value.optimize || 'actions') === 'actions'} onChange={() => onChange({ ...value, optimize: 'actions' })}/><span><b>Actions and Related Records</b><small>Perform actions and update any related records after the record is saved.</small></span></label></section> : null}
        <GPTBuilderRecordTriggerPaths value={value} selectedObject={selectedObject} onChange={onChange}/>
      </> : null}
      {flowType === 'schedule' ? <>
        <section><h3>Set a Schedule</h3><div className="gptb-two-col"><label>Start Date<input type="date" value={value.startDate || ''} onChange={(event) => onChange({ ...value, startDate: event.target.value })}/></label><label>Start Time<input type="time" value={value.startTime || ''} onChange={(event) => onChange({ ...value, startTime: event.target.value })}/></label></div><label>Frequency<select value={value.frequency || 'Daily'} onChange={(event) => onChange({ ...value, frequency: event.target.value })}><option>Once</option><option>Daily</option><option>Weekly</option></select></label><details><summary>Advanced Options</summary><label>Batch Size<input type="number" min="1" max="200" value={value.batchSize ?? 200} onChange={(event) => onChange({ ...value, batchSize: Number(event.target.value) })}/><small>Enter a value from 1 through 200. The default is 200.</small></label></details></section>
        <section><h3>Choose Object <small>(Optional)</small></h3><label>Object<select value={value.objectKey || ''} onChange={(event) => onChange({ ...value, objectKey: event.target.value, conditions: [] })}><option value="">None</option>{objects.map((item) => <option key={item.id || objectKey(item)} value={objectKey(item)}>{objectLabel(item)}</option>)}</select></label>{value.objectKey ? <><label>Condition Requirements<select value={value.conditionMode || 'none'} onChange={(event) => onChange({ ...value, conditionMode: event.target.value })}><option value="none">None</option><option value="all">All Conditions Are Met (AND)</option><option value="any">Any Condition Is Met (OR)</option><option value="custom">Custom Condition Logic Is Met</option></select></label>{value.conditionMode !== 'none' ? <ConditionsEditor object={selectedObject} value={value.conditions} customLogic={value.customConditionLogic || ''} onCustomLogicChange={value.conditionMode === 'custom' ? (customConditionLogic) => onChange({ ...value, customConditionLogic }) : null} onChange={(conditions) => onChange({ ...value, conditions })}/> : null}</> : null}</section>
      </> : null}
      {flowType === 'platform_event' ? <section><h3>Select Platform Event</h3><label>Platform Event<select value={value.eventKey || ''} onChange={(event) => onChange({ ...value, eventKey: event.target.value })}><option value="">Select an event</option>{eventTypes.map((item) => <option key={item.event_type} value={item.event_type}>{item.event_type}</option>)}</select></label>{value.eventKey ? <p className="gptb-help-text">{eventTypes.find((item) => item.event_type === value.eventKey)?.description || 'The flow runs when this event message is received.'}</p> : null}</section> : null}
    </div>
    <footer><button className="gptb-button" onClick={onCancel}>Cancel</button><button className="gptb-button is-brand" onClick={onDone}>Done</button></footer>
  </aside>
}

function FlowPropertiesModal({ value, saved, saving, flowType, onChange, onCancel, onSave }) {
  const [draft, setDraft] = useState(value)
  const [manualApi, setManualApi] = useState(saved)
  const valid = draft.label.trim() && /^[A-Za-z][A-Za-z0-9_]*$/.test(draft.apiName) && !draft.apiName.endsWith('_') && !draft.apiName.includes('__')
  return <div className="gptb-modal-backdrop">
    <section className="gptb-properties-modal" role="dialog" aria-modal="true" aria-labelledby="gptb-properties-title">
      <header className="gptb-new-head"><div><h2 id="gptb-properties-title">{saved ? 'Flow Properties' : 'Save the Flow'}</h2><p>{saved ? 'Flow Version Properties' : 'Enter the flow details before the first save.'}</p></div><button className="gptb-icon-button" aria-label="Close properties" onClick={onCancel}><X size={18}/></button></header>
      <div className="gptb-properties-body">
        <label><span>Flow Label <b>*</b></span><input autoFocus value={draft.label} onChange={(event) => { const label = event.target.value; setDraft((current) => ({ ...current, label, apiName: !saved && !manualApi ? apiNameFromLabel(label) : current.apiName })) }}/></label>
        <label><span>Flow API Name <b>*</b></span><input value={draft.apiName} disabled={saved} onChange={(event) => { setManualApi(true); setDraft((current) => ({ ...current, apiName: event.target.value })) }}/>{saved ? <small>The API name can’t be edited after the flow is saved.</small> : <small>Auto-filled from the Flow Label. You can edit it before the first save.</small>}</label>
        <label><span>Description</span><textarea rows={4} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}/></label>
        <label><span>Interview Label</span><input value={draft.interviewLabel || ''} onChange={(event) => setDraft((current) => ({ ...current, interviewLabel: event.target.value }))}/><small>By default, interviews use the flow label and the current date/time.</small></label>
        <details><summary>Advanced</summary>
          <label><span>How to Run the Flow</span><select value={draft.runContext || 'default'} onChange={(event) => setDraft((current) => ({ ...current, runContext: event.target.value }))}><option value="default">Default Context</option><option value="system_with_sharing">System Context with Sharing</option><option value="system_without_sharing">System Context without Sharing</option></select></label>
          <label><span>Type</span><input value={FLOW_TYPES.find((item) => item.key === flowType)?.label || flowType} disabled/></label>
          <label><span>API Version for Running the Flow</span><select value={draft.apiVersion || '68.0'} onChange={(event) => setDraft((current) => ({ ...current, apiVersion: event.target.value }))}><option value="68.0">68.0</option><option value="67.0">67.0</option><option value="66.0">66.0</option><option value="65.0">65.0</option><option value="64.0">64.0</option></select><small>New flows use the latest supported runtime API version.</small></label>
          {flowType === 'record' ? <label><span>Trigger Order</span><input type="number" min="1" max="2000" value={draft.triggerOrder || ''} onChange={(event) => setDraft((current) => ({ ...current, triggerOrder: event.target.value }))}/></label> : null}
          {flowType === 'screen' ? <label className="gptb-properties-check"><input type="checkbox" checked={draft.showProgress === true} onChange={(event) => setDraft((current) => ({ ...current, showProgress: event.target.checked }))}/><span>Show a progress indicator on screen elements</span></label> : null}
          <label className="gptb-properties-check"><input type="checkbox" checked={draft.isTemplate === true} onChange={(event) => setDraft((current) => ({ ...current, isTemplate: event.target.checked }))}/><span>Template</span></label>
          <label className="gptb-properties-check"><input type="checkbox" checked={draft.overridable === true} onChange={(event) => setDraft((current) => ({ ...current, overridable: event.target.checked }))}/><span>Overridable</span></label>
        </details>
      </div>
      <footer className="gptb-new-footer"><button className="gptb-button" onClick={onCancel}>Cancel</button><button className="gptb-button is-brand" disabled={!valid || saving} onClick={() => { onChange(draft); onSave(draft) }}>{saving ? 'Saving…' : 'Save'}</button></footer>
    </section>
  </div>
}

function DiagnosticsPanel({ issues, onClose, onIssueClick }) {
  const errorCount = issues.filter((issue) => issue.level === 'error').length
  const warningCount = issues.filter((issue) => issue.level === 'warning').length
  const [tab, setTab] = useState(errorCount ? 'error' : 'warning')
  const visible = issues.filter((issue) => issue.level === tab)
  const grouped = visible.reduce((map, issue) => {
    const key = issue.group || issue.title || 'Flow'
    const current = map.get(key) || []
    current.push(issue)
    map.set(key, current)
    return map
  }, new Map())
  return <aside className="gptb-diagnostics" aria-label="Errors and Warnings">
    <header><strong>Errors and Warnings</strong><button className="gptb-icon-button" aria-label="Close Errors and Warnings" onClick={onClose}><X size={16}/></button></header>
    <nav className="gptb-diagnostic-tabs"><button className={tab === 'error' ? 'is-active' : ''} onClick={() => setTab('error')}>Errors <span>{errorCount}</span></button><button className={tab === 'warning' ? 'is-active' : ''} onClick={() => setTab('warning')}>Warnings <span>{warningCount}</span></button></nav>
    <div>{visible.length ? [...grouped.entries()].map(([group, rows]) => <section className="gptb-diagnostic-group" key={group}><h4>{group}</h4>{rows.map((issue) => <div className={`gptb-diagnostic is-${issue.level}`} key={issue.id}>{issue.level === 'error' ? <AlertTriangle size={16}/> : <CircleHelp size={16}/>}<span><button type="button" onClick={() => onIssueClick?.(issue)}>{issue.title}</button><small>{issue.detail}</small></span></div>)}</section>) : <div className="gptb-no-issues"><CheckCircle2 size={22}/><strong>No {tab === 'error' ? 'errors' : 'warnings'}</strong></div>}</div>
  </aside>
}

function Toolbox({ layout, onClose, flowType, startConfig }) {
  const [tab, setTab] = useState(layout === 'free' ? 'elements' : 'manager')
  const effectiveTab = layout === 'auto' ? 'manager' : tab
  return <aside className="gptb-toolbox" aria-label="Toolbox">
    <div className="gptb-toolbox-tabs">{layout === 'free' ? <button className={effectiveTab === 'elements' ? 'is-active' : ''} onClick={() => setTab('elements')}>Elements</button> : null}<button className={effectiveTab === 'manager' ? 'is-active' : ''} onClick={() => setTab('manager')}>Manager</button><button className="gptb-toolbox-close" aria-label="Close toolbox" onClick={onClose}><X size={15}/></button></div>
    {effectiveTab === 'elements'
      ? <FreeFormElements flowType={flowType} startConfig={startConfig}/>
      : <div className="gptb-toolbox-placeholder"><Workflow size={18}/><strong>Manager</strong><span>Resources and flow contents are built in the Manager phase.</span></div>}
  </aside>
}

function FlowShell({ flow, onNew }) {
  const [layout, setLayout] = useState('auto')
  const [toolboxOpen, setToolboxOpen] = useState(true)
  const [selecting, setSelecting] = useState(false)
  const [zoom, setZoom] = useState(100)
  const [layoutOpen, setLayoutOpen] = useState(false)
  const [objects, setObjects] = useState([])
  const [eventTypes, setEventTypes] = useState([])
  const [startConfig, setStartConfig] = useState(() => initialStart(flow.key))
  const [startDraft, setStartDraft] = useState(() => initialStart(flow.key))
  const [startOpen, setStartOpen] = useState(flow.startNeedsConfiguration)
  const [flowProps, setFlowProps] = useState({ label: '', apiName: '', description: '', interviewLabel: '', runContext: 'default', apiVersion: '68.0', triggerOrder: '', showProgress: false, isTemplate: false, overridable: false })
  const [propertiesOpen, setPropertiesOpen] = useState(false)
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)
  const [workflowId, setWorkflowId] = useState('')
  const [saving, setSaving] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState('')
  const [dirty, setDirty] = useState(true)
  const [message, setMessage] = useState('')
  const [saveError, setSaveError] = useState('')
  const [elementPickerOpen, setElementPickerOpen] = useState(false)
  const [elements, setElements] = useState([])
  const [resources, setResources] = useState([])
  const [editingElement, setEditingElement] = useState(null)
  const [selectedElementIds, setSelectedElementIds] = useState([])
  const [copiedElements, setCopiedElements] = useState([])
  const [connectMode, setConnectMode] = useState(false)
  const [goToConnections, setGoToConnections] = useState([])
  const historyRef = useRef([])
  const futureRef = useRef([])
  const currentSnapshotRef = useRef(null)
  const applyingHistoryRef = useRef(false)
  const [historyRevision, setHistoryRevision] = useState(0)

  useEffect(() => {
    const snapshot = JSON.parse(JSON.stringify({ layout, startConfig, elements, resources, goToConnections }))
    const serialized = JSON.stringify(snapshot)
    if (!currentSnapshotRef.current) {
      currentSnapshotRef.current = { value: snapshot, serialized }
      return
    }
    if (applyingHistoryRef.current) {
      currentSnapshotRef.current = { value: snapshot, serialized }
      applyingHistoryRef.current = false
      setHistoryRevision((value) => value + 1)
      return
    }
    if (currentSnapshotRef.current.serialized !== serialized) {
      historyRef.current = [...historyRef.current, currentSnapshotRef.current.value].slice(-100)
      futureRef.current = []
      currentSnapshotRef.current = { value: snapshot, serialized }
      setHistoryRevision((value) => value + 1)
    }
  }, [layout, startConfig, elements, resources, goToConnections])

  const applyHistorySnapshot = (snapshot) => {
    applyingHistoryRef.current = true
    setLayout(snapshot.layout)
    setStartConfig(snapshot.startConfig)
    setStartDraft(snapshot.startConfig)
    setElements(snapshot.elements)
    setResources(snapshot.resources)
    setGoToConnections(snapshot.goToConnections || [])
    setEditingElement(null)
    setElementPickerOpen(false)
    setDiagnosticsOpen(false)
    setStartOpen(false)
    setDirty(true)
  }

  const undoFlowChange = () => {
    const previous = historyRef.current.pop()
    if (!previous || !currentSnapshotRef.current) return
    futureRef.current = [currentSnapshotRef.current.value, ...futureRef.current].slice(0, 100)
    applyHistorySnapshot(previous)
    setHistoryRevision((value) => value + 1)
  }

  const redoFlowChange = () => {
    const next = futureRef.current.shift()
    if (!next || !currentSnapshotRef.current) return
    historyRef.current = [...historyRef.current, currentSnapshotRef.current.value].slice(-100)
    applyHistorySnapshot(next)
    setHistoryRevision((value) => value + 1)
  }

  useEffect(() => {
    let live = true
    Promise.all([
      apiRequest('/api/platform/objects').catch(() => ({ data: [] })),
      apiRequest('/api/platform/event-types').catch(() => ({ data: [] })),
    ]).then(([objectResponse, eventResponse]) => {
      if (!live) return
      setObjects(objectResponse?.data?.objects || objectResponse?.data || [])
      setEventTypes(Array.isArray(eventResponse?.data) ? eventResponse.data : [])
    })
    return () => { live = false }
  }, [])

  const issues = useMemo(() => {
    const next = []
    if (flow.key === 'record' && !startConfig.objectKey) next.push({ id: 'record-object', level: 'error', group: 'Start', targetId: 'start', title: 'Start isn’t configured', detail: 'Select the object that triggers this flow.' })
    if (flow.key === 'schedule' && (!startConfig.startDate || !startConfig.startTime)) next.push({ id: 'schedule', level: 'error', group: 'Start', targetId: 'start', title: 'Schedule isn’t configured', detail: 'Enter a start date and start time.' })
    if (flow.key === 'platform_event' && !startConfig.eventKey) next.push({ id: 'event', level: 'error', group: 'Start', targetId: 'start', title: 'Platform event isn’t configured', detail: 'Select the event that triggers this flow.' })
    if (!elements.length) next.push({ id: 'elements', level: 'error', group: 'Flow', title: 'The flow has no executable elements', detail: 'Add at least one element before activating the flow.' })
    elements.forEach((element) => {
      const common = elementCommonErrors(element, elements)
      common.forEach((detail, index) => next.push({ id: `element-${element.id}-common-${index}`, level: 'error', group: element.label || 'Element', targetId: element.id, title: `${element.label || 'Element'} needs attention`, detail }))
      if (!element.configured) next.push({ id: `element-${element.id}-incomplete`, level: 'error', group: element.label || 'Element', targetId: element.id, title: `${element.label || 'Element'} isn’t fully configured`, detail: 'Complete this element before activating the flow.' })
    })
    if (dirty && workflowId) next.push({ id: 'unsaved', level: 'warning', group: 'Flow', title: 'Unsaved changes', detail: 'Run, Test, and Debug use the most recent saved version until you save these changes.' })
    return next
  }, [flow.key, startConfig, dirty, workflowId, elements])

  const startConfigured = !issues.some((issue) => ['record-object', 'schedule', 'event'].includes(issue.id))
  const buildPayload = (props = flowProps) => ({
    name: props.label || 'New Flow',
    objectKey: startConfig.objectKey || null,
    triggerKey: flowTriggerKey(flow.key, startConfig),
    conditions: startConfig.conditionMode === 'none' ? [] : (startConfig.conditions || []).filter((condition) => condition.field),
    active: false,
    lifecycleStatus: 'DRAFT',
    version: 1,
    action: {
      type: 'workflow',
      gptBuilder: true,
      apiName: props.apiName,
      description: props.description,
      apiVersion: props.apiVersion || '68.0',
      flowType: flow.key,
      runContext: props.runContext || 'default',
      interviewLabel: props.interviewLabel || (props.label ? `${props.label} - {!$Flow.CurrentDateTime}` : ''),
      triggerOrder: props.triggerOrder ? Number(props.triggerOrder) : undefined,
      showProgress: props.showProgress === true,
      isTemplate: props.isTemplate === true,
      overridable: props.overridable === true,
      match: startConfig.conditionMode === 'custom' ? 'custom' : startConfig.conditionMode === 'any' ? 'any' : 'all',
      conditionLogic: startConfig.conditionMode === 'custom' ? startConfig.customConditionLogic || '' : '',
      entryFormula: startConfig.conditionMode === 'formula' ? startConfig.formula || '' : '',
      entryTransition: startConfig.updateMode === 'transition' ? 'UPDATED_TO_MEET' : 'EVERY_TIME',
      start: startConfig,
      layout: { mode: layout === 'free' ? 'FREE_FORM' : 'AUTO' },
      gptBuilderElements: elements.map((element) => ({
        id: element.id,
        key: element.key,
        label: element.label,
        apiName: element.apiName,
        description: element.description,
        labelSource: element.labelSource,
        apiNameSource: element.apiNameSource,
        config: element.config,
        configured: element.configured,
        source: element.source,
        position: element.position,
      })),
      resources,
      goToConnections,
      actions: elements.filter((element) => element.configured).map((element) => {
        if (element.key === 'get_records') return getRecordsRuntimeAction(element)
        return null
      }).filter(Boolean),
    },
  })

  const save = async (props = flowProps) => {
    setSaving(true); setSaveError(''); setMessage('')
    try {
      const response = await apiRequest(workflowId ? `/api/platform/rules/${encodeURIComponent(workflowId)}` : '/api/platform/rules', {
        method: workflowId ? 'PUT' : 'POST',
        body: JSON.stringify(buildPayload(props)),
      })
      const saved = response?.data || {}
      if (saved.id) setWorkflowId(String(saved.id))
      setFlowProps(props)
      setLastSavedAt(new Date().toISOString())
      setDirty(false)
      setPropertiesOpen(false)
      setMessage('Flow saved.')
    } catch (error) {
      setSaveError(error?.message || 'Unable to save flow')
      if (workflowId) setPropertiesOpen(false)
    } finally {
      setSaving(false)
    }
  }

  const openStart = () => { setStartDraft(structuredClone(startConfig)); setStartOpen(true); setDiagnosticsOpen(false); setElementPickerOpen(false); setEditingElement(null) }
  const finishStart = () => { setStartConfig(startDraft); setStartOpen(false); setDirty(true); setMessage('') }
  const updateElement = (next) => {
    setElements((current) => current.map((item) => item.id === next.id ? next : item))
    setDirty(true)
  }
  const toggleElementSelection = (id) => setSelectedElementIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])
  const copySelectedElements = () => {
    const picked = elements.filter((element) => selectedElementIds.includes(element.id))
    setCopiedElements(JSON.parse(JSON.stringify(picked)))
    setSelecting(false)
    setSelectedElementIds([])
  }
  const pasteCopiedElements = () => {
    if (!copiedElements.length) return
    const existing = [...elements]
    const clones = copiedElements.map((element, index) => {
      const base = createElementInstance(element.key, [...existing], { source: 'auto', config: JSON.parse(JSON.stringify(element.config || {})) })
      const clone = {
        ...base,
        label: `${element.label || base.label} ${index ? index + 2 : 'Copy'}`,
        description: element.description || '',
        configured: element.configured,
      }
      clone.apiName = clone.label.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || base.apiName
      existing.push(clone)
      return clone
    })
    setElements((current) => [...current, ...clones])
    setDirty(true)
    setElementPickerOpen(false)
  }
  const beginConnectToElement = () => {
    if (!elements.length) return
    setConnectMode(true)
    setElementPickerOpen(false)
    setSelecting(false)
    setSelectedElementIds([])
  }
  const connectToElement = (targetId) => {
    const sourceId = elements.filter((element) => element.source === 'auto').at(-1)?.id || 'start'
    if (targetId === sourceId) return
    setGoToConnections((current) => [...current.filter((edge) => edge.sourceId !== sourceId), { sourceId, targetId }])
    setConnectMode(false)
    setDirty(true)
  }

  const chooseElement = (element, source = 'auto', position = null) => {
    setElementPickerOpen(false)
    setDiagnosticsOpen(false)
    setStartOpen(false)
    if (!element || element.key === 'end') return
    const instance = createElementInstance(element.key, elements, { source, position })
    setElements((current) => [...current, instance])
    setEditingElement({ id: instance.id, isNew: true })
    setDirty(true)
  }
  const openElement = (instance) => {
    setElementPickerOpen(false)
    setStartOpen(false)
    setDiagnosticsOpen(false)
    setEditingElement({ id: instance.id, isNew: false })
  }
  const dropElement = (event) => {
    if (layout !== 'free') return
    const key = event.dataTransfer.getData('application/x-gptbuilder-element')
    if (!elementByKey(key)) return
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    const scale = zoom / 100
    const x = Math.max(20, (event.clientX - rect.left + event.currentTarget.scrollLeft) / scale)
    const y = Math.max(20, (event.clientY - rect.top + event.currentTarget.scrollTop) / scale)
    chooseElement(elementByKey(key), 'free', { x, y })
  }
  const flowName = workflowId ? flowProps.label : flow.label
  const activeElement = editingElement ? elements.find((item) => item.id === editingElement.id) || null : null
  const hasUnsavableIncomplete = elements.some((item) => !item.configured && ['screen', 'action'].includes(item.key))

  return <section className="gptb-builder" aria-label="GPT Builder workspace">
    <header className="gptb-buttonbar">
      <div className="gptb-brand"><span className="gptb-brand-icon"><Workflow size={19}/></span><span><strong>Flow Builder</strong><small>{flowName}</small></span></div>
      <div className="gptb-status"><span className="gptb-status-dot"/>Inactive <i>·</i> {lastSavedAt ? (dirty ? 'Unsaved changes' : 'Saved') : 'Never saved'}</div>
      <div className="gptb-toolbar" role="toolbar" aria-label="Flow Builder controls">
        <button className={toolboxOpen ? 'is-on' : ''} aria-label={toolboxOpen ? 'Hide Toolbox' : 'Show Toolbox'} onClick={() => setToolboxOpen((value) => !value)}><LayoutPanelLeft size={16}/></button>
        {layout === 'auto' ? <button className={selecting ? 'is-on' : ''} aria-label="Select Elements" onClick={() => { setSelecting((value) => !value); setSelectedElementIds([]); setConnectMode(false) }}><Copy size={16}/></button> : null}
        {layout === 'auto' && selecting ? <button aria-label="Copy Elements" title="Copy Elements" disabled={!selectedElementIds.length} onClick={copySelectedElements}><Copy size={16}/><em>{selectedElementIds.length || ''}</em></button> : null}
        <span className="gptb-toolbar-separator"/>
        <button aria-label="Undo" title="Undo" disabled={!historyRef.current.length} onClick={undoFlowChange}><Undo2 size={16}/></button><button aria-label="Redo" title="Redo" disabled={!futureRef.current.length} onClick={redoFlowChange}><Redo2 size={16}/></button>
        {issues.length ? <button className={issues.some((issue) => issue.level === 'error') ? 'has-issues is-error' : 'has-issues is-warning'} aria-label={issues.some((issue) => issue.level === 'error') ? 'Show Errors' : 'Show Warnings'} title={issues.some((issue) => issue.level === 'error') ? 'Show Errors' : 'Show Warnings'} onClick={() => { setDiagnosticsOpen((value) => !value); setStartOpen(false); setEditingElement(null) }}><AlertTriangle size={16}/><em>{issues.filter((issue) => issue.level === (issues.some((row) => row.level === 'error') ? 'error' : 'warning')).length}</em></button> : null}
        <button aria-label="View Properties" title="View Properties" onClick={() => setPropertiesOpen(true)}><Settings2 size={16}/></button>
        <div className="gptb-layout-picker"><button className="gptb-layout-button" aria-haspopup="menu" aria-expanded={layoutOpen} onClick={() => setLayoutOpen((value) => !value)}>{layout === 'auto' ? 'Auto-Layout' : 'Free-Form'} <ChevronDown size={13}/></button>{layoutOpen ? <div className="gptb-layout-menu" role="menu"><button role="menuitemradio" aria-checked={layout === 'auto'} onClick={() => { setLayout('auto'); setLayoutOpen(false); setDirty(true) }}><span>{layout === 'auto' ? '✓' : ''}</span>Auto-Layout</button><button role="menuitemradio" aria-checked={layout === 'free'} onClick={() => { setLayout('free'); setLayoutOpen(false); setToolboxOpen(true); setDirty(true) }}><span>{layout === 'free' ? '✓' : ''}</span>Free-Form</button></div> : null}</div>
        <span className="gptb-toolbar-separator"/>
        <button className="gptb-text-tool" disabled={!workflowId}><Play size={14}/> Run</button>{['record','autolaunched'].includes(flow.key) ? <button className="gptb-text-tool" disabled={!workflowId}><Eye size={14}/> Test Mode</button> : <button className="gptb-text-tool" disabled={!workflowId}><Eye size={14}/> Debug</button>}
        <button className="gptb-text-tool" disabled={saving || hasUnsavableIncomplete} title={hasUnsavableIncomplete ? 'Complete Screen and Action elements before saving.' : 'Save'} onClick={() => workflowId ? void save(flowProps) : setPropertiesOpen(true)}><Save size={14}/> {saving ? 'Saving…' : 'Save'}</button>
        <button className="gptb-text-tool is-brand" disabled={!workflowId || dirty || issues.some((issue) => issue.level === 'error')}>Activate</button><button aria-label="More actions"><MoreHorizontal size={16}/></button>
      </div>
    </header>
    {message ? <div className="gptb-toast is-success">{message}<button aria-label="Dismiss message" onClick={() => setMessage('')}><X size={13}/></button></div> : null}
    {saveError ? <div className="gptb-toast is-error">{saveError}<button aria-label="Dismiss error" onClick={() => setSaveError('')}><X size={13}/></button></div> : null}
    <div className={`gptb-workspace ${toolboxOpen ? 'has-toolbox' : ''}`}>
      {toolboxOpen ? <Toolbox key={layout} layout={layout} flowType={flow.key} startConfig={startConfig} onClose={() => setToolboxOpen(false)}/> : null}
      <main
        className="gptb-canvas"
        aria-label="Flow canvas"
        onDragOver={layout === 'free' ? (event) => { if (event.dataTransfer.types.includes('application/x-gptbuilder-element')) event.preventDefault() } : undefined}
        onDrop={dropElement}
      >
        <div className="gptb-canvas-stage" style={{ transform: `scale(${zoom / 100})` }}>{layout === 'auto' ? <>
          <button className={`gptb-start-card ${!startConfigured ? 'needs-config' : ''}`} aria-label="Start" onClick={openStart}><span className="gptb-start-dot"/><span><strong>Start</strong><small>{startSummary(flow.key, startConfig, objects)}</small></span><ChevronRight size={14}/></button>
          <div className="gptb-connector"/>
          {elements.filter((element) => element.source === 'auto').map((element) => <div className="gptb-auto-element-slot" key={element.id}><PendingElementCard instance={element} onOpen={() => openElement(element)} selecting={selecting} selected={selectedElementIds.includes(element.id)} onSelectToggle={() => toggleElementSelection(element.id)} connecting={connectMode} onConnectTarget={() => connectToElement(element.id)}/><div className="gptb-connector"/></div>)}
          <div className="gptb-add-slot">
            <button className="gptb-add-node" aria-label="Add element" aria-expanded={elementPickerOpen} onClick={() => { setElementPickerOpen((value) => !value); setStartOpen(false); setDiagnosticsOpen(false); setEditingElement(null) }}><Plus size={15}/></button>
            {elementPickerOpen ? <ElementPicker flowType={flow.key} startConfig={startConfig} hasExistingElements={elements.some((element) => element.source === 'auto')} copiedCount={copiedElements.length} onPaste={pasteCopiedElements} onConnect={beginConnectToElement} onSelect={(element) => chooseElement(element, 'auto')} onClose={() => setElementPickerOpen(false)}/> : null}
          </div>
          <div className="gptb-connector"/><div className="gptb-end-node"><span>■</span><strong>End</strong></div>
        </> : <>
          <button className="gptb-free-start" onClick={openStart}><span className="gptb-start-dot"/><strong>Start</strong></button>
          {elements.filter((element) => element.source === 'free').map((element) => <PendingElementCard key={element.id} instance={element} free onOpen={() => openElement(element)}/>)}
          <div className="gptb-free-hint">Drag elements from the Elements tab and connect them on the canvas.</div>
        </>}</div>
        <div className="gptb-zoom" role="group" aria-label="Canvas zoom"><button aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(50, value - 10))} disabled={zoom <= 50}><ZoomOut size={15}/></button><button className="gptb-zoom-value" aria-label="Reset zoom" onClick={() => setZoom(100)}>{zoom}%</button><button aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(150, value + 10))} disabled={zoom >= 150}><ZoomIn size={15}/></button></div>
        <div className="gptb-canvas-help"><CircleHelp size={14}/><span>{layout === 'auto' ? 'Auto-Layout keeps the flow arranged and connected automatically.' : 'Free-Form lets you position and connect elements manually.'}</span></div>
      </main>
      {startOpen && flow.startNeedsConfiguration ? <StartPanel flowType={flow.key} value={startDraft} onChange={setStartDraft} objects={objects} eventTypes={eventTypes} onDone={finishStart} onCancel={() => setStartOpen(false)}/> : null}
      {diagnosticsOpen ? <DiagnosticsPanel issues={issues} onClose={() => setDiagnosticsOpen(false)} onIssueClick={(issue) => {
        if (issue.targetId === 'start') { openStart(); return }
        const target = elements.find((element) => element.id === issue.targetId)
        if (target) openElement(target)
      }}/> : null}
      {activeElement ? <GPTBuilderElementProperties
        instance={activeElement}
        elements={elements}
        layout={layout}
        isNew={Boolean(editingElement?.isNew)}
        onLiveChange={updateElement}
        onClose={(next) => { updateElement(next); setEditingElement(null) }}
        onCommit={(next) => { updateElement(next); setEditingElement(null) }}
        onCancel={(original, options) => {
          if (options?.removeNew) setElements((current) => current.filter((item) => item.id !== activeElement.id))
          else updateElement(original)
          setEditingElement(null)
        }}
      >{({ draft, updateConfig, setConfigured }) => activeElement.key === 'get_records'
        ? <GPTBuilderGetRecords
            draft={draft}
            updateConfig={updateConfig}
            objects={objects}
            flowType={flow.key}
            startConfig={startConfig}
            elements={elements}
            resources={resources}
            onResourcesChange={(next) => { setResources(next); setDirty(true) }}
            onConfiguredChange={setConfigured}
          />
        : null}</GPTBuilderElementProperties> : null}
    </div>
    <button className="gptb-new-flow-link" onClick={onNew}>New Automation</button>
    {propertiesOpen ? <FlowPropertiesModal value={flowProps} saved={Boolean(workflowId)} saving={saving} flowType={flow.key} onChange={(next) => { setFlowProps(next); setDirty(true) }} onCancel={() => setPropertiesOpen(false)} onSave={(next) => void save(next)}/> : null}
  </section>
}

export default function GPTBuilderPage() {
  const [newOpen, setNewOpen] = useState(true)
  const [flow, setFlow] = useState(null)
  return <section className="gptb-root" aria-label="GPT Builder">{flow ? <FlowShell key={flow.key} flow={flow} onNew={() => setNewOpen(true)}/> : <main className="gptb-empty-home"><span className="gptb-empty-logo"><Workflow size={28}/></span><h1>GPT Builder</h1><p>Create a Salesforce-style automation in the isolated GPT Builder workspace.</p><button className="gptb-button is-brand" onClick={() => setNewOpen(true)}><Plus size={15}/> New Automation</button></main>}{newOpen ? <NewAutomation onCreate={(definition) => { setFlow(definition); setNewOpen(false) }} onClose={() => setNewOpen(false)}/> : null}</section>
}
