import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleHelp,
  Copy, Eye, LayoutPanelLeft, MoreHorizontal, Play, Plus, Redo2, Save, Search,
  Settings2, Sparkles, Trash2, Undo2, Workflow, X, Zap, ZoomIn, ZoomOut,
} from 'lucide-react'
import { apiRequest } from '../../../services/api'
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
  if (flowType === 'record') return { objectKey: '', trigger: 'created_or_updated', conditionMode: 'none', conditions: [], formula: '', updateMode: 'every_time', optimize: 'actions' }
  if (flowType === 'schedule') return { startDate: '', startTime: '', frequency: 'Daily', objectKey: '', conditionMode: 'none', conditions: [], formula: '' }
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

function FieldSelect({ object, value, onChange }) {
  const [fields, setFields] = useState([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    let live = true
    if (!object?.id) { setFields([]); return () => { live = false } }
    setLoading(true)
    apiRequest(`/api/platform/objects/${encodeURIComponent(object.id)}/fields`)
      .then((response) => { if (live) setFields((Array.isArray(response?.data) ? response.data : []).filter((field) => field?.active !== false)) })
      .catch(() => { if (live) setFields([]) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [object?.id])
  return <select value={value || ''} disabled={!object || loading} onChange={(event) => onChange(event.target.value)}>
    <option value="">{loading ? 'Loading fields…' : object ? 'Select a field' : 'Select an object first'}</option>
    {fields.map((field) => <option key={fieldKey(field)} value={fieldKey(field)}>{fieldLabel(field)}</option>)}
  </select>
}

function ConditionsEditor({ object, value, onChange }) {
  const rows = value || []
  const patch = (index, next) => onChange(rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...next } : row))
  return <div className="gptb-conditions">
    {rows.map((row, index) => <div className="gptb-condition-row" key={row.id || index}>
      <FieldSelect object={object} value={row.field} onChange={(field) => patch(index, { field })}/>
      <select value={row.operator || 'equals'} onChange={(event) => patch(index, { operator: event.target.value })}>
        <option value="equals">Equals</option><option value="not_equals">Does Not Equal</option><option value="greater_than">Greater Than</option><option value="greater_than_or_equal">Greater Than or Equal</option><option value="less_than">Less Than</option><option value="less_than_or_equal">Less Than or Equal</option><option value="is_empty">Is Null</option>
      </select>
      {row.operator === 'is_empty' ? <select value={String(row.value ?? true)} onChange={(event) => patch(index, { value: event.target.value === 'true' })}><option value="true">True</option><option value="false">False</option></select> : <input value={row.value ?? ''} onChange={(event) => patch(index, { value: event.target.value })} placeholder="Value"/>}
      <button aria-label={`Remove condition ${index + 1}`} onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))}><Trash2 size={14}/></button>
    </div>)}
    <button className="gptb-inline-action" onClick={() => onChange([...rows, { id: crypto.randomUUID?.() || String(Date.now()), field: '', operator: 'equals', value: '' }])}><Plus size={13}/> Add Condition</button>
  </div>
}

function StartPanel({ flowType, value, onChange, objects, eventTypes, onDone, onCancel }) {
  const selectedObject = objects.find((item) => objectKey(item) === value.objectKey)
  const showUpdateMode = flowType === 'record' && ['updated', 'created_or_updated'].includes(value.trigger)
  return <aside className="gptb-config-panel" aria-label="Configure Start">
    <header><div><strong>{flowType === 'schedule' ? 'Set a Schedule' : flowType === 'platform_event' ? 'Configure Start' : 'Configure Start'}</strong><small>{FLOW_TYPES.find((item) => item.key === flowType)?.label}</small></div><button className="gptb-icon-button" aria-label="Close Start configuration" onClick={onCancel}><X size={16}/></button></header>
    <div className="gptb-config-body">
      {flowType === 'record' ? <>
        <section><h3>Select Object</h3><label>Object<select value={value.objectKey || ''} onChange={(event) => onChange({ ...value, objectKey: event.target.value, conditions: [] })}><option value="">Select an object</option>{objects.map((item) => <option key={item.id || objectKey(item)} value={objectKey(item)}>{objectLabel(item)}</option>)}</select></label></section>
        <section><h3>Configure Trigger</h3><label>Trigger the Flow When<select value={value.trigger || 'created_or_updated'} onChange={(event) => onChange({ ...value, trigger: event.target.value })}><option value="created">A record is created</option><option value="updated">A record is updated</option><option value="created_or_updated">A record is created or updated</option><option value="deleted">A record is deleted</option></select></label></section>
        <section><h3>Set Entry Conditions</h3><label>Condition Requirements<select value={value.conditionMode || 'none'} onChange={(event) => onChange({ ...value, conditionMode: event.target.value })}><option value="none">None</option><option value="all">All Conditions Are Met (AND)</option><option value="any">Any Condition Is Met (OR)</option><option value="formula">Formula Evaluates to True</option></select></label>{value.conditionMode === 'formula' ? <label>Formula<textarea rows={4} value={value.formula || ''} onChange={(event) => onChange({ ...value, formula: event.target.value })} placeholder="Enter a boolean formula"/></label> : value.conditionMode !== 'none' ? <ConditionsEditor object={selectedObject} value={value.conditions} onChange={(conditions) => onChange({ ...value, conditions })}/> : null}</section>
        {showUpdateMode ? <section><h3>When to Run the Flow for Updated Records</h3><label className="gptb-radio"><input type="radio" name="gptb-update-mode" checked={(value.updateMode || 'every_time') === 'every_time'} onChange={() => onChange({ ...value, updateMode: 'every_time' })}/><span><b>Every time a record is updated and meets the condition requirements</b></span></label><label className="gptb-radio"><input type="radio" name="gptb-update-mode" checked={value.updateMode === 'transition'} onChange={() => onChange({ ...value, updateMode: 'transition' })}/><span><b>Only when a record is updated to meet the condition requirements</b></span></label></section> : null}
        {value.trigger !== 'deleted' ? <section><h3>Optimize the Flow for</h3><label className="gptb-radio"><input type="radio" name="gptb-optimize" checked={value.optimize === 'fast'} onChange={() => onChange({ ...value, optimize: 'fast' })}/><span><b>Fast Field Updates</b><small>Update fields on the record that triggered the flow before the record is saved.</small></span></label><label className="gptb-radio"><input type="radio" name="gptb-optimize" checked={(value.optimize || 'actions') === 'actions'} onChange={() => onChange({ ...value, optimize: 'actions' })}/><span><b>Actions and Related Records</b><small>Perform actions and update any related records after the record is saved.</small></span></label></section> : null}
      </> : null}
      {flowType === 'schedule' ? <>
        <section><h3>Set a Schedule</h3><div className="gptb-two-col"><label>Start Date<input type="date" value={value.startDate || ''} onChange={(event) => onChange({ ...value, startDate: event.target.value })}/></label><label>Start Time<input type="time" value={value.startTime || ''} onChange={(event) => onChange({ ...value, startTime: event.target.value })}/></label></div><label>Frequency<select value={value.frequency || 'Daily'} onChange={(event) => onChange({ ...value, frequency: event.target.value })}><option>Once</option><option>Daily</option><option>Weekly</option></select></label></section>
        <section><h3>Choose Object <small>(Optional)</small></h3><label>Object<select value={value.objectKey || ''} onChange={(event) => onChange({ ...value, objectKey: event.target.value, conditions: [] })}><option value="">None</option>{objects.map((item) => <option key={item.id || objectKey(item)} value={objectKey(item)}>{objectLabel(item)}</option>)}</select></label>{value.objectKey ? <><label>Condition Requirements<select value={value.conditionMode || 'none'} onChange={(event) => onChange({ ...value, conditionMode: event.target.value })}><option value="none">None</option><option value="all">All Conditions Are Met (AND)</option><option value="any">Any Condition Is Met (OR)</option><option value="formula">Custom Condition Logic Is Met</option></select></label>{value.conditionMode !== 'none' ? <ConditionsEditor object={selectedObject} value={value.conditions} onChange={(conditions) => onChange({ ...value, conditions })}/> : null}</> : null}</section>
      </> : null}
      {flowType === 'platform_event' ? <section><h3>Select Platform Event</h3><label>Platform Event<select value={value.eventKey || ''} onChange={(event) => onChange({ ...value, eventKey: event.target.value })}><option value="">Select an event</option>{eventTypes.map((item) => <option key={item.event_type} value={item.event_type}>{item.event_type}</option>)}</select></label>{value.eventKey ? <p className="gptb-help-text">{eventTypes.find((item) => item.event_type === value.eventKey)?.description || 'The flow runs when this event message is received.'}</p> : null}</section> : null}
    </div>
    <footer><button className="gptb-button" onClick={onCancel}>Cancel</button><button className="gptb-button is-brand" onClick={onDone}>Done</button></footer>
  </aside>
}

function FlowPropertiesModal({ value, saved, saving, onChange, onCancel, onSave }) {
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
        <details><summary>Advanced</summary><label><span>How to Run the Flow</span><select value={draft.runContext || 'default'} onChange={(event) => setDraft((current) => ({ ...current, runContext: event.target.value }))}><option value="default">Default Context</option><option value="system_with_sharing">System Context with Sharing</option><option value="system_without_sharing">System Context without Sharing</option></select></label></details>
      </div>
      <footer className="gptb-new-footer"><button className="gptb-button" onClick={onCancel}>Cancel</button><button className="gptb-button is-brand" disabled={!valid || saving} onClick={() => { onChange(draft); onSave(draft) }}>{saving ? 'Saving…' : 'Save'}</button></footer>
    </section>
  </div>
}

function DiagnosticsPanel({ issues, onClose }) {
  return <aside className="gptb-diagnostics" aria-label="Errors and Warnings">
    <header><strong>Errors and Warnings</strong><button className="gptb-icon-button" aria-label="Close Errors and Warnings" onClick={onClose}><X size={16}/></button></header>
    <div>{issues.length ? issues.map((issue) => <div className={`gptb-diagnostic is-${issue.level}`} key={issue.id}>{issue.level === 'error' ? <AlertTriangle size={16}/> : <CircleHelp size={16}/>}<span><b>{issue.title}</b><small>{issue.detail}</small></span></div>) : <div className="gptb-no-issues"><CheckCircle2 size={22}/><strong>No errors or warnings</strong></div>}</div>
  </aside>
}

function Toolbox({ layout, onClose }) {
  const [tab, setTab] = useState(layout === 'free' ? 'elements' : 'manager')
  const effectiveTab = layout === 'auto' ? 'manager' : tab
  return <aside className="gptb-toolbox" aria-label="Toolbox">
    <div className="gptb-toolbox-tabs">{layout === 'free' ? <button className={effectiveTab === 'elements' ? 'is-active' : ''} onClick={() => setTab('elements')}>Elements</button> : null}<button className={effectiveTab === 'manager' ? 'is-active' : ''} onClick={() => setTab('manager')}>Manager</button><button className="gptb-toolbox-close" aria-label="Close toolbox" onClick={onClose}><X size={15}/></button></div>
    <div className="gptb-toolbox-placeholder">{effectiveTab === 'elements' ? <><Search size={18}/><strong>Elements</strong><span>Element discovery is built in the next parity phase.</span></> : <><Workflow size={18}/><strong>Manager</strong><span>Resources and flow contents are built in the Manager phase.</span></>}</div>
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
  const [flowProps, setFlowProps] = useState({ label: '', apiName: '', description: '', runContext: 'default' })
  const [propertiesOpen, setPropertiesOpen] = useState(false)
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)
  const [workflowId, setWorkflowId] = useState('')
  const [saving, setSaving] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState('')
  const [dirty, setDirty] = useState(true)
  const [message, setMessage] = useState('')
  const [saveError, setSaveError] = useState('')

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
    if (flow.key === 'record' && !startConfig.objectKey) next.push({ id: 'record-object', level: 'error', title: 'Start isn’t configured', detail: 'Select the object that triggers this flow.' })
    if (flow.key === 'schedule' && (!startConfig.startDate || !startConfig.startTime)) next.push({ id: 'schedule', level: 'error', title: 'Schedule isn’t configured', detail: 'Enter a start date and start time.' })
    if (flow.key === 'platform_event' && !startConfig.eventKey) next.push({ id: 'event', level: 'error', title: 'Platform event isn’t configured', detail: 'Select the event that triggers this flow.' })
    next.push({ id: 'elements', level: 'error', title: 'The flow has no executable elements', detail: 'Add at least one element before activating the flow.' })
    if (dirty && workflowId) next.push({ id: 'unsaved', level: 'warning', title: 'Unsaved changes', detail: 'Save the flow before Run, Debug, or Activate uses the latest design.' })
    return next
  }, [flow.key, startConfig, dirty, workflowId])

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
      apiVersion: '66.0',
      flowType: flow.key,
      runContext: props.runContext || 'default',
      match: startConfig.conditionMode === 'any' ? 'any' : 'all',
      entryTransition: startConfig.updateMode === 'transition' ? 'UPDATED_TO_MEET' : 'EVERY_TIME',
      start: startConfig,
      layout: { mode: layout === 'free' ? 'FREE_FORM' : 'AUTO' },
      actions: [],
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

  const openStart = () => { setStartDraft(structuredClone(startConfig)); setStartOpen(true); setDiagnosticsOpen(false) }
  const finishStart = () => { setStartConfig(startDraft); setStartOpen(false); setDirty(true); setMessage('') }
  const flowName = workflowId ? flowProps.label : flow.label

  return <section className="gptb-builder" aria-label="GPT Builder workspace">
    <header className="gptb-buttonbar">
      <div className="gptb-brand"><span className="gptb-brand-icon"><Workflow size={19}/></span><span><strong>Flow Builder</strong><small>{flowName}</small></span></div>
      <div className="gptb-status"><span className="gptb-status-dot"/>Inactive <i>·</i> {lastSavedAt ? (dirty ? 'Unsaved changes' : 'Saved') : 'Never saved'}</div>
      <div className="gptb-toolbar" role="toolbar" aria-label="Flow Builder controls">
        <button className={toolboxOpen ? 'is-on' : ''} aria-label={toolboxOpen ? 'Hide Toolbox' : 'Show Toolbox'} onClick={() => setToolboxOpen((value) => !value)}><LayoutPanelLeft size={16}/></button>
        <button className={selecting ? 'is-on' : ''} aria-label="Select Elements" onClick={() => setSelecting((value) => !value)}><Copy size={16}/></button>
        <span className="gptb-toolbar-separator"/>
        <button aria-label="Undo" disabled><Undo2 size={16}/></button><button aria-label="Redo" disabled><Redo2 size={16}/></button>
        <button className={issues.length ? 'has-issues' : ''} aria-label="Errors and Warnings" title="Errors and Warnings" onClick={() => { setDiagnosticsOpen((value) => !value); setStartOpen(false) }}><AlertTriangle size={16}/>{issues.length ? <em>{issues.length}</em> : null}</button>
        <button aria-label="View Properties" title="View Properties" onClick={() => setPropertiesOpen(true)}><Settings2 size={16}/></button>
        <div className="gptb-layout-picker"><button className="gptb-layout-button" aria-haspopup="menu" aria-expanded={layoutOpen} onClick={() => setLayoutOpen((value) => !value)}>{layout === 'auto' ? 'Auto-Layout' : 'Free-Form'} <ChevronDown size={13}/></button>{layoutOpen ? <div className="gptb-layout-menu" role="menu"><button role="menuitemradio" aria-checked={layout === 'auto'} onClick={() => { setLayout('auto'); setLayoutOpen(false); setDirty(true) }}><span>{layout === 'auto' ? '✓' : ''}</span>Auto-Layout</button><button role="menuitemradio" aria-checked={layout === 'free'} onClick={() => { setLayout('free'); setLayoutOpen(false); setToolboxOpen(true); setDirty(true) }}><span>{layout === 'free' ? '✓' : ''}</span>Free-Form</button></div> : null}</div>
        <span className="gptb-toolbar-separator"/>
        <button className="gptb-text-tool" disabled={!workflowId || dirty}><Play size={14}/> Run</button><button className="gptb-text-tool" disabled={!workflowId || dirty}><Eye size={14}/> Debug</button>
        <button className="gptb-text-tool" disabled={saving} onClick={() => workflowId ? void save(flowProps) : setPropertiesOpen(true)}><Save size={14}/> {saving ? 'Saving…' : 'Save'}</button>
        <button className="gptb-text-tool is-brand" disabled={!workflowId || dirty || issues.some((issue) => issue.level === 'error')}>Activate</button><button aria-label="More actions"><MoreHorizontal size={16}/></button>
      </div>
    </header>
    {message ? <div className="gptb-toast is-success">{message}<button aria-label="Dismiss message" onClick={() => setMessage('')}><X size={13}/></button></div> : null}
    {saveError ? <div className="gptb-toast is-error">{saveError}<button aria-label="Dismiss error" onClick={() => setSaveError('')}><X size={13}/></button></div> : null}
    <div className={`gptb-workspace ${toolboxOpen ? 'has-toolbox' : ''}`}>
      {toolboxOpen ? <Toolbox key={layout} layout={layout} onClose={() => setToolboxOpen(false)}/> : null}
      <main className="gptb-canvas" aria-label="Flow canvas">
        <div className="gptb-canvas-stage" style={{ transform: `scale(${zoom / 100})` }}>{layout === 'auto' ? <>
          <button className={`gptb-start-card ${!startConfigured ? 'needs-config' : ''}`} aria-label="Start" onClick={openStart}><span className="gptb-start-dot"/><span><strong>Start</strong><small>{startSummary(flow.key, startConfig, objects)}</small></span><ChevronRight size={14}/></button><div className="gptb-connector"/><button className="gptb-add-node" aria-label="Add element"><Plus size={15}/></button><div className="gptb-connector"/><div className="gptb-end-node"><span>■</span><strong>End</strong></div>
        </> : <><button className="gptb-free-start" onClick={openStart}><span className="gptb-start-dot"/><strong>Start</strong></button><div className="gptb-free-hint">Drag elements from the Elements tab and connect them on the canvas.</div></>}</div>
        <div className="gptb-zoom" role="group" aria-label="Canvas zoom"><button aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(50, value - 10))} disabled={zoom <= 50}><ZoomOut size={15}/></button><button className="gptb-zoom-value" aria-label="Reset zoom" onClick={() => setZoom(100)}>{zoom}%</button><button aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(150, value + 10))} disabled={zoom >= 150}><ZoomIn size={15}/></button></div>
        <div className="gptb-canvas-help"><CircleHelp size={14}/><span>{layout === 'auto' ? 'Auto-Layout keeps the flow arranged and connected automatically.' : 'Free-Form lets you position and connect elements manually.'}</span></div>
      </main>
      {startOpen && flow.startNeedsConfiguration ? <StartPanel flowType={flow.key} value={startDraft} onChange={setStartDraft} objects={objects} eventTypes={eventTypes} onDone={finishStart} onCancel={() => setStartOpen(false)}/> : null}
      {diagnosticsOpen ? <DiagnosticsPanel issues={issues} onClose={() => setDiagnosticsOpen(false)}/> : null}
    </div>
    <button className="gptb-new-flow-link" onClick={onNew}>New Automation</button>
    {propertiesOpen ? <FlowPropertiesModal value={flowProps} saved={Boolean(workflowId)} saving={saving} onChange={(next) => { setFlowProps(next); setDirty(true) }} onCancel={() => setPropertiesOpen(false)} onSave={(next) => void save(next)}/> : null}
  </section>
}

export default function GPTBuilderPage() {
  const [newOpen, setNewOpen] = useState(true)
  const [flow, setFlow] = useState(null)
  return <section className="gptb-root" aria-label="GPT Builder">{flow ? <FlowShell key={flow.key} flow={flow} onNew={() => setNewOpen(true)}/> : <main className="gptb-empty-home"><span className="gptb-empty-logo"><Workflow size={28}/></span><h1>GPT Builder</h1><p>Create a Salesforce-style automation in the isolated GPT Builder workspace.</p><button className="gptb-button is-brand" onClick={() => setNewOpen(true)}><Plus size={15}/> New Automation</button></main>}{newOpen ? <NewAutomation onCreate={(definition) => { setFlow(definition); setNewOpen(false) }} onClose={() => setNewOpen(false)}/> : null}</section>
}
