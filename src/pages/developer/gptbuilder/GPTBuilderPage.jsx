import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleHelp,
  Copy, Eye, History, LayoutPanelLeft, Play, Plus, Redo2, Save, Search,
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
import GPTBuilderFormulaBuilder, { basicFormulaCheck } from './GPTBuilderFormulaBuilder'
import GPTBuilderNewAutomation from './GPTBuilderNewAutomation'
import {
  GPTBuilderEditHistoryPanel, GPTBuilderSaveAsFlowDialog, GPTBuilderSaveAsMenu, GPTBuilderUnsavedHistoryDialog,
} from './GPTBuilderSaveHistory'
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

function interviewLabelFromFlowLabel(label) {
  const value = String(label || '').trim()
  return value ? `${value} {!$Flow.CurrentDateTime}` : ''
}

function defaultRunContextForFlowType(flowType) {
  return ['record', 'schedule', 'platform_event'].includes(flowType) ? 'system_without_sharing' : 'default'
}

function FlowReferencePicker({ value, onChange, flows, kind }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const isTemplate = kind === 'template'
  const matches = flows.filter((item) => {
    const action = item?.action || {}
    if (isTemplate ? action.isTemplate !== true : action.overridable !== true) return false
    const needle = query.trim().toLowerCase()
    return !needle || `${item.name || ''} ${action.apiName || ''}`.toLowerCase().includes(needle)
  }).slice(0, 25)
  const selected = flows.find((item) => String(item.id) === String(value))
  return <div className="gptb-flow-ref-picker" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
    <Search size={14}/>
    <input
      value={open ? query : (selected?.name || '')}
      placeholder={isTemplate ? 'Enter the template name...' : 'Search overridable packaged flows...'}
      onFocus={() => { setQuery(selected?.name || ''); setOpen(true) }}
      onChange={(event) => { setQuery(event.target.value); setOpen(true) }}
      aria-label={isTemplate ? 'Source Template' : 'Original Flow'}
    />
    {value ? <button type="button" aria-label={isTemplate ? 'Clear Source Template' : 'Clear Original Flow'} onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(''); setQuery(''); setOpen(false) }}><X size={13}/></button> : null}
    {open ? <div className="gptb-flow-ref-menu">
      {matches.length ? matches.map((item) => <button type="button" key={item.id} onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(String(item.id)); setOpen(false) }}><b>{item.name}</b><small>{item.action?.apiName || 'Workflow'}</small></button>) : <span>No matching flows</span>}
    </div> : null}
  </div>
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
  if (start.trigger === 'deleted') return 'before_delete'
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

function validateStartConditionLogic(logic, count) {
  const text = String(logic || '').trim()
  if (!text) return 'Enter condition logic.'
  const tokens = text.match(/\d+|AND|OR|NOT|\(|\)/gi) || []
  if (!tokens.length || tokens.join('').toUpperCase() !== text.replace(/\s+/g, '').toUpperCase()) return 'Enter valid condition logic.'
  const refs = tokens.filter((token) => /^\d+$/.test(token)).map(Number)
  if (!refs.length || refs.some((number) => number < 1 || number > count)) return 'Condition logic references a condition that isn’t available.'
  let depth = 0
  for (const token of tokens) {
    if (token === '(') depth += 1
    if (token === ')') depth -= 1
    if (depth < 0) return 'Condition logic has unmatched parentheses.'
  }
  return depth === 0 ? '' : 'Condition logic has unmatched parentheses.'
}

function startConfigurationErrors(flowType, value) {
  const errors = []
  if (flowType === 'record') {
    if (!value.objectKey) errors.push('Select an object.')
    if (!value.trigger) errors.push('Select when the flow is triggered.')
    if (value.conditionMode === 'formula') {
      const error = basicFormulaCheck(value.formula)
      if (error) errors.push(error)
    } else if (value.conditionMode !== 'none') {
      if (!(value.conditions || []).length) errors.push('Add at least one entry condition.')
      ;(value.conditions || []).forEach((row, index) => {
        if (!row.field) errors.push(`Condition ${index + 1}: select a field.`)
        if (!row.operator) errors.push(`Condition ${index + 1}: select an operator.`)
        if (!['is_empty', 'changed'].includes(row.operator) && (row.value === '' || row.value == null)) errors.push(`Condition ${index + 1}: enter a value.`)
      })
      if (value.conditionMode === 'custom') {
        const error = validateStartConditionLogic(value.customConditionLogic, (value.conditions || []).length)
        if (error) errors.push(error)
      }
    }
    if (value.trigger !== 'deleted' && !['fast','actions'].includes(value.optimize)) errors.push('Select how to optimize the flow.')
  }
  if (flowType === 'schedule') {
    if (!value.startDate) errors.push('Enter a start date.')
    if (!value.startTime) errors.push('Enter a start time.')
    if (!['Once','Daily','Weekly'].includes(value.frequency || 'Daily')) errors.push('Select a supported frequency.')
    const batchSize = Number(value.batchSize ?? 200)
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 200) errors.push('Batch Size must be from 1 through 200.')
    if (value.objectKey && value.conditionMode !== 'none') {
      if (!(value.conditions || []).length) errors.push('Add at least one entry condition.')
      if (value.conditionMode === 'custom') {
        const error = validateStartConditionLogic(value.customConditionLogic, (value.conditions || []).length)
        if (error) errors.push(error)
      }
    }
  }
  if (flowType === 'platform_event' && !value.eventKey) errors.push('Select a platform event.')
  return errors
}

function StartPanel({ flowType, value, onChange, objects, eventTypes, onDone, onCancel }) {
  const [attemptedDone, setAttemptedDone] = useState(false)
  const selectedObject = objects.find((item) => objectKey(item) === value.objectKey)
  const showUpdateMode = flowType === 'record' && ['updated', 'created_or_updated'].includes(value.trigger) && value.conditionMode !== 'none'
  const errors = startConfigurationErrors(flowType, value)
  const finish = () => {
    setAttemptedDone(true)
    if (!errors.length) onDone()
  }
  return <aside className="gptb-config-panel" aria-label="Configure Start">
    <header><div><strong>{flowType === 'schedule' ? 'Set a Schedule' : flowType === 'platform_event' ? 'Configure Start' : 'Configure Start'}</strong><small>{FLOW_TYPES.find((item) => item.key === flowType)?.label}</small></div><button className="gptb-icon-button" aria-label="Close Start configuration" onClick={onCancel}><X size={16}/></button></header>
    <div className="gptb-config-body">
      {flowType === 'record' ? <>
        <section><h3>Select Object</h3><label>Object<select value={value.objectKey || ''} onChange={(event) => onChange({ ...value, objectKey: event.target.value, conditions: [] })}><option value="">Select an object</option>{objects.map((item) => <option key={item.id || objectKey(item)} value={objectKey(item)}>{objectLabel(item)}</option>)}</select></label></section>
        <section><h3>Configure Trigger</h3><label>Trigger the Flow When<select value={value.trigger || 'created_or_updated'} onChange={(event) => onChange({ ...value, trigger: event.target.value })}><option value="created">A record is created</option><option value="updated">A record is updated</option><option value="created_or_updated">A record is created or updated</option><option value="deleted">A record is deleted</option></select></label></section>
        <section><h3>Set Entry Conditions</h3><label>Condition Requirements<select value={value.conditionMode || 'none'} onChange={(event) => onChange({ ...value, conditionMode: event.target.value })}><option value="none">None</option><option value="all">All Conditions Are Met (AND)</option><option value="any">Any Condition Is Met (OR)</option><option value="custom">Custom Condition Logic Is Met</option><option value="formula">Formula Evaluates to True</option></select></label>{value.conditionMode === 'formula' ? <div className="gptb-start-formula"><span>Formula</span><GPTBuilderFormulaBuilder object={selectedObject} value={value.formula || ''} onChange={(formula) => onChange({ ...value, formula })}/></div> : value.conditionMode !== 'none' ? <ConditionsEditor object={selectedObject} value={value.conditions} allowIsChanged={['updated','created_or_updated'].includes(value.trigger)} customLogic={value.customConditionLogic || ''} onCustomLogicChange={value.conditionMode === 'custom' ? (customConditionLogic) => onChange({ ...value, customConditionLogic }) : null} onChange={(conditions) => onChange({ ...value, conditions })}/> : null}</section>
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
    {attemptedDone && errors.length ? <div className="gptb-start-errors" role="alert"><AlertTriangle size={14}/><span>{errors.map((error) => <small key={error}>{error}</small>)}</span></div> : null}
    <footer><button className="gptb-button" onClick={onCancel}>Cancel</button><button className="gptb-button is-brand" onClick={finish}>Done</button></footer>
  </aside>
}

function FlowPropertiesModal({ value, saved, saving, flowType, availableFlows, onChange, onCancel, onSave }) {
  const [draft, setDraft] = useState(value)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [manualApi, setManualApi] = useState(saved)
  const [manualInterview, setManualInterview] = useState(saved || Boolean(value.interviewLabel))
  const valid = draft.label.trim() && /^[A-Za-z][A-Za-z0-9_]*$/.test(draft.apiName) && !draft.apiName.endsWith('_') && !draft.apiName.includes('__')
  return <div className="gptb-modal-backdrop">
    <section className="gptb-properties-modal" role="dialog" aria-modal="true" aria-labelledby="gptb-properties-title">
      <header className="gptb-new-head"><div><h2 id="gptb-properties-title">{saved ? 'Flow Properties' : 'Save the Flow'}</h2><p>{saved ? 'Flow Version Properties' : 'Enter the flow details before the first save.'}</p></div><button className="gptb-icon-button" aria-label="Close properties" onClick={onCancel}><X size={18}/></button></header>
      <div className="gptb-properties-body">
        <label><span>Flow Label <b>*</b></span><input autoFocus value={draft.label} onChange={(event) => { const label = event.target.value; setDraft((current) => ({ ...current, label, apiName: !saved && !manualApi ? apiNameFromLabel(label) : current.apiName, interviewLabel: !saved && !manualInterview ? interviewLabelFromFlowLabel(label) : current.interviewLabel })) }}/></label>
        <label><span>Flow API Name <b>*</b></span><input value={draft.apiName} disabled={saved} onChange={(event) => { setManualApi(true); setDraft((current) => ({ ...current, apiName: event.target.value })) }}/>{saved ? <small>The API name can’t be edited after the flow is saved.</small> : <small>Auto-filled from the Flow Label. You can edit it before the first save.</small>}</label>
        <label><span>Description</span><textarea rows={4} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}/></label>
        <label><span>Interview Label</span><input value={draft.interviewLabel || ''} placeholder="Insert a resource..." onChange={(event) => { setManualInterview(true); setDraft((current) => ({ ...current, interviewLabel: event.target.value })) }}/><small>Default: {interviewLabelFromFlowLabel(draft.label) || 'Flow Label {!$Flow.CurrentDateTime}'}</small></label>
        <button type="button" className="gptb-inline-action gptb-properties-advanced-toggle" aria-expanded={advancedOpen} onClick={() => setAdvancedOpen((value) => !value)}>{advancedOpen ? 'Hide Advanced' : 'Show Advanced'} <ChevronDown size={13}/></button>
        {advancedOpen ? <div className="gptb-properties-advanced">
          {['screen','autolaunched'].includes(flowType) ? <label><span>How to Run the Flow</span><select value={draft.runContext || 'default'} onChange={(event) => setDraft((current) => ({ ...current, runContext: event.target.value }))}><option value="default">User or System Context—Depends on How Flow Is Launched</option>{Number.parseFloat(draft.apiVersion || '68.0') >= 68 ? <option value="user_enforced">User Context—Enforces User Permissions</option> : null}<option value="system_with_sharing">System Context with Sharing—Enforces Record-Level Access</option><option value="system_without_sharing">System Context Without Sharing—Access All Data</option></select></label> : null}
          <label><span>Type</span><input value={FLOW_TYPES.find((item) => item.key === flowType)?.label || flowType} disabled/></label>
          <label><span>Source Template</span><FlowReferencePicker value={draft.sourceTemplateId || ''} onChange={(sourceTemplateId) => setDraft((current) => ({ ...current, sourceTemplateId }))} flows={availableFlows || []} kind="template"/></label>
          <label className="gptb-properties-check"><input type="checkbox" checked={draft.isTemplate === true} onChange={(event) => setDraft((current) => ({ ...current, isTemplate: event.target.checked }))}/><span>Template</span></label>
          <label><span>Original Flow</span><FlowReferencePicker value={draft.originalFlowId || ''} onChange={(originalFlowId) => setDraft((current) => ({ ...current, originalFlowId }))} flows={availableFlows || []} kind="original"/></label>
          <label className="gptb-properties-check"><input type="checkbox" checked={draft.overridable === true} onChange={(event) => setDraft((current) => ({ ...current, overridable: event.target.checked }))}/><span>Overridable</span></label>
          <label><span>API Version for Running the Flow</span><select value={draft.apiVersion || '68.0'} onChange={(event) => { const apiVersion = event.target.value; setDraft((current) => ({ ...current, apiVersion, runContext: Number.parseFloat(apiVersion) < 68 && current.runContext === 'user_enforced' ? 'default' : current.runContext })) }}><option value="68.0">68.0</option><option value="67.0">67.0</option><option value="66.0">66.0</option><option value="65.0">65.0</option><option value="64.0">64.0</option></select><small>New flows use the latest supported runtime API version.</small></label>
          {flowType === 'record' ? <label><span>Trigger Order</span><input type="number" min="1" max="2000" value={draft.triggerOrder || ''} onChange={(event) => setDraft((current) => ({ ...current, triggerOrder: event.target.value }))}/></label> : null}
          {flowType === 'screen' ? <><label className="gptb-properties-check"><input type="checkbox" checked={draft.showProgress === true} onChange={(event) => setDraft((current) => ({ ...current, showProgress: event.target.checked }))}/><span>Show a progress indicator on screen elements</span></label>{draft.showProgress ? <label><span>Progress Indicator Type</span><select value={draft.progressIndicatorType || 'simple_top'} onChange={(event) => setDraft((current) => ({ ...current, progressIndicatorType: event.target.value }))}><option value="simple_top">Simple: Top of Screen</option><option value="path_top">Path: Top of Screen</option><option value="simple_footer">Simple: Footer of Screen</option></select></label> : null}</> : null}
        </div> : null}
      </div>
      <footer className="gptb-new-footer"><button className="gptb-button" onClick={onCancel}>Cancel</button><button className="gptb-button is-brand" disabled={!valid || saving} onClick={() => { onChange(draft); onSave(draft) }}>{saving ? 'Saving…' : saved ? 'Done' : 'Save'}</button></footer>
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

function FlowShell({ flow, onNew, initialRule = null, onWorkflowSaved }) {
  const templateAction = initialRule?.action || flow.templateRule?.action || {}
  const [layout, setLayout] = useState(templateAction.layout?.mode === 'FREE_FORM' ? 'free' : 'auto')
  const [toolboxOpen, setToolboxOpen] = useState(true)
  const [selecting, setSelecting] = useState(false)
  const [zoom, setZoom] = useState(100)
  const [layoutOpen, setLayoutOpen] = useState(false)
  const [objects, setObjects] = useState([])
  const [eventTypes, setEventTypes] = useState([])
  const [availableFlows, setAvailableFlows] = useState([])
  const [startConfig, setStartConfig] = useState(() => templateAction.start ? structuredClone(templateAction.start) : initialStart(flow.key))
  const [startDraft, setStartDraft] = useState(() => templateAction.start ? structuredClone(templateAction.start) : initialStart(flow.key))
  const [startOpen, setStartOpen] = useState(!initialRule && flow.startNeedsConfiguration && !flow.templateRule)
  const [flowProps, setFlowProps] = useState(() => ({ label: initialRule?.name || '', apiName: templateAction.apiName || '', description: templateAction.description || '', interviewLabel: templateAction.interviewLabel || '', runContext: templateAction.runContext || defaultRunContextForFlowType(flow.key), apiVersion: templateAction.apiVersion || '68.0', triggerOrder: templateAction.triggerOrder ?? '', showProgress: templateAction.showProgress ?? (flow.key === 'screen'), progressIndicatorType: templateAction.progressIndicatorType || 'simple_top', sourceTemplateId: templateAction.sourceTemplateId || '', originalFlowId: templateAction.originalFlowId || '', isTemplate: templateAction.isTemplate === true, overridable: templateAction.overridable === true }))
  const [propertiesOpen, setPropertiesOpen] = useState(false)
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)
  const [workflowId, setWorkflowId] = useState(() => String(initialRule?.id || ''))
  const [saving, setSaving] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState(() => initialRule?.updated_at || initialRule?.created_at || '')
  const [dirty, setDirty] = useState(() => !initialRule)
  const [activeStatus, setActiveStatus] = useState(() => initialRule?.active === true || initialRule?.lifecycle_status === 'ACTIVE')
  const [message, setMessage] = useState('')
  const [saveError, setSaveError] = useState('')
  const [elementPickerOpen, setElementPickerOpen] = useState(false)
  const [elements, setElements] = useState(() => Array.isArray(templateAction.gptBuilderElements) ? structuredClone(templateAction.gptBuilderElements) : [])
  const [resources, setResources] = useState(() => Array.isArray(templateAction.resources) ? structuredClone(templateAction.resources) : [])
  const [editingElement, setEditingElement] = useState(null)
  const [selectedElementIds, setSelectedElementIds] = useState([])
  const [freeSelectedIds, setFreeSelectedIds] = useState([])
  const [freeConnectorDraft, setFreeConnectorDraft] = useState(null)
  const canvasRef = useRef(null)
  const [copiedElements, setCopiedElements] = useState([])
  const [connectMode, setConnectMode] = useState(false)
  const [goToConnections, setGoToConnections] = useState(() => Array.isArray(templateAction.goToConnections) ? structuredClone(templateAction.goToConnections) : [])
  const historyRef = useRef([])
  const futureRef = useRef([])
  const currentSnapshotRef = useRef(null)
  const applyingHistoryRef = useRef(false)
  const [historyRevision, setHistoryRevision] = useState(0)
  const [saveAsOpen, setSaveAsOpen] = useState(false)
  const [saveAsFlowOpen, setSaveAsFlowOpen] = useState(false)
  const [editHistoryOpen, setEditHistoryOpen] = useState(false)
  const [editHistoryPending, setEditHistoryPending] = useState(false)
  const [editHistoryEntries, setEditHistoryEntries] = useState([])
  const [editHistoryLoading, setEditHistoryLoading] = useState(false)
  const [editHistoryVersion, setEditHistoryVersion] = useState(null)

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
      apiRequest('/api/platform/rules').catch(() => ({ data: [] })),
    ]).then(([objectResponse, eventResponse, rulesResponse]) => {
      if (!live) return
      setObjects(objectResponse?.data?.objects || objectResponse?.data || [])
      setEventTypes(Array.isArray(eventResponse?.data) ? eventResponse.data : [])
      setAvailableFlows((Array.isArray(rulesResponse?.data) ? rulesResponse.data : []).filter((item) => item?.action?.type === 'workflow'))
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
      runContext: props.runContext || defaultRunContextForFlowType(flow.key),
      interviewLabel: props.interviewLabel || interviewLabelFromFlowLabel(props.label),
      triggerOrder: props.triggerOrder ? Number(props.triggerOrder) : undefined,
      showProgress: props.showProgress === true,
      progressIndicatorType: props.progressIndicatorType || 'simple_top',
      sourceTemplateId: props.sourceTemplateId || undefined,
      originalFlowId: props.originalFlowId || undefined,
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

  const save = async (props = flowProps, options = {}) => {
    setSaving(true); setSaveError(''); setMessage('')
    try {
      const forceNewFlow = options.forceNewFlow === true
      const forceNewVersion = options.forceNewVersion === true
      const payload = {
        ...buildPayload(props),
        ...(forceNewVersion ? { forceNewVersion: true } : {}),
      }
      if (forceNewFlow) {
        payload.name = options.newFlow?.label || props.label || 'New Flow'
        payload.action = {
          ...payload.action,
          apiName: options.newFlow?.apiName || props.apiName,
          description: options.newFlow?.description ?? props.description,
          originalFlowId: workflowId || props.originalFlowId || undefined,
        }
      }
      const response = await apiRequest(workflowId && !forceNewFlow ? `/api/platform/rules/${encodeURIComponent(workflowId)}` : '/api/platform/rules', {
        method: workflowId && !forceNewFlow ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      })
      const saved = response?.data || {}
      if (saved.id) { setWorkflowId(String(saved.id)); onWorkflowSaved?.(String(saved.id)) }
      if (saved.active !== undefined || saved.lifecycle_status) setActiveStatus(saved.active === true || saved.lifecycle_status === 'ACTIVE')
      const nextProps = forceNewFlow
        ? { ...props, label: payload.name, apiName: payload.action.apiName, description: payload.action.description, originalFlowId: workflowId || props.originalFlowId || '' }
        : props
      setFlowProps(nextProps)
      setLastSavedAt(new Date().toISOString())
      setDirty(false)
      setPropertiesOpen(false)
      setSaveAsOpen(false)
      setSaveAsFlowOpen(false)
      setMessage(forceNewFlow ? 'Flow saved as a new flow.' : forceNewVersion ? 'Flow saved as a new version.' : 'Flow saved.')
      return saved
    } catch (error) {
      setSaveError(error?.message || 'Unable to save flow')
      if (workflowId) setPropertiesOpen(false)
      return null
    } finally {
      setSaving(false)
    }
  }

  const activateFlow = async () => {
    if (!workflowId || dirty || issues.some((issue) => issue.level === 'error')) return
    setSaving(true); setSaveError(''); setMessage('')
    try {
      const payload = { ...buildPayload(flowProps), active: true, lifecycleStatus: 'ACTIVE' }
      const response = await apiRequest(`/api/platform/rules/${encodeURIComponent(workflowId)}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      })
      const activated = response?.data || {}
      setActiveStatus(activated.active === true || activated.lifecycle_status === 'ACTIVE')
      setLastSavedAt(new Date().toISOString())
      setDirty(false)
      setMessage('Flow activated.')
      if (activated.id) onWorkflowSaved?.(String(activated.id))
    } catch (error) {
      setSaveError(error?.message || 'Unable to activate flow')
    } finally {
      setSaving(false)
    }
  }

  const loadEditHistory = async (id = workflowId) => {
    if (!id) return
    setEditHistoryLoading(true)
    try {
      const response = await apiRequest(`/api/platform/rules/${encodeURIComponent(id)}/versions`)
      const rows = Array.isArray(response?.data) ? response.data : []
      setEditHistoryEntries(rows)
      setEditHistoryVersion(rows[0]?.version ?? null)
      setEditHistoryOpen(true)
    } catch (error) {
      setSaveError(error?.message || 'Unable to load edit history')
    } finally {
      setEditHistoryLoading(false)
    }
  }

  const openEditHistory = async () => {
    setSaveAsOpen(false)
    if (dirty) { setEditHistoryPending(true); return }
    await loadEditHistory()
  }

  const saveAndOpenEditHistory = async () => {
    const saved = await save(flowProps)
    setEditHistoryPending(false)
    if (saved?.id || workflowId) await loadEditHistory(saved?.id || workflowId)
  }

  const definitionToBuilder = (definition) => {
    const action = definition?.action || {}
    const restoredElements = Array.isArray(action.gptBuilderElements) ? action.gptBuilderElements : []
    setFlowProps((current) => ({
      ...current,
      label: definition?.name || current.label,
      apiName: action.apiName || current.apiName,
      description: action.description || '',
      interviewLabel: action.interviewLabel || '',
      runContext: action.runContext || defaultRunContextForFlowType(flow.key),
      apiVersion: action.apiVersion || current.apiVersion,
      triggerOrder: action.triggerOrder ?? '',
      showProgress: action.showProgress === true,
      progressIndicatorType: action.progressIndicatorType || 'simple_top',
      sourceTemplateId: action.sourceTemplateId || '',
      originalFlowId: action.originalFlowId || '',
      isTemplate: action.isTemplate === true,
      overridable: action.overridable === true,
    }))
    setStartConfig(action.start || initialStart(flow.key))
    setStartDraft(action.start || initialStart(flow.key))
    setLayout(action.layout?.mode === 'FREE_FORM' ? 'free' : 'auto')
    setElements(restoredElements)
    setResources(Array.isArray(action.resources) ? action.resources : [])
    setGoToConnections(Array.isArray(action.goToConnections) ? action.goToConnections : [])
    setEditingElement(null)
    setStartOpen(false)
    setDiagnosticsOpen(false)
    setElementPickerOpen(false)
  }

  const restoreHistoryEntry = async (entry) => {
    if (!workflowId || !entry?.version) return
    setSaving(true); setSaveError('')
    try {
      const response = await apiRequest(`/api/platform/rules/${encodeURIComponent(workflowId)}/versions/${encodeURIComponent(entry.version)}/restore`, { method: 'POST', body: '{}' })
      const restored = response?.data || {}
      definitionToBuilder(restored)
      setDirty(false)
      setLastSavedAt(new Date().toISOString())
      setEditHistoryOpen(false)
      setMessage(`Restored save ${entry.version} as a new draft version.`)
    } catch (error) {
      setSaveError(error?.message || 'Unable to restore edit history')
    } finally {
      setSaving(false)
    }
  }

  const saveHistoryAsNewVersion = async (entry) => {
    await restoreHistoryEntry(entry)
  }

  const saveHistoryAsNewFlow = (entry) => {
    if (entry?.definition) definitionToBuilder(entry.definition)
    setEditHistoryOpen(false)
    setDirty(true)
    setSaveAsFlowOpen(true)
  }

  const openStart = () => { setStartDraft(structuredClone(startConfig)); setStartOpen(true); setDiagnosticsOpen(false); setElementPickerOpen(false); setEditingElement(null) }
  const finishStart = () => { setStartConfig(startDraft); setStartOpen(false); setDirty(true); setMessage('') }
  const updateElement = (next) => {
    setElements((current) => current.map((item) => item.id === next.id ? next : item))
    setDirty(true)
  }
  const toggleElementSelection = (id) => setSelectedElementIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])
  const uniqueCopiedIdentity = (label, allElements) => {
    const root = String(label || 'Element').replace(/\s+Copy(?:\s+\d+)?$/i, '')
    const usedLabels = new Set(allElements.map((item) => String(item.label || '').toLowerCase()))
    let number = 1
    let nextLabel = `${root} Copy`
    while (usedLabels.has(nextLabel.toLowerCase())) {
      number += 1
      nextLabel = `${root} Copy ${number}`
    }
    const usedApi = new Set(allElements.map((item) => String(item.apiName || '').toLowerCase()))
    let baseApi = nextLabel.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'Element_Copy'
    if (!/^[A-Za-z]/.test(baseApi)) baseApi = `Element_${baseApi}`
    let nextApi = baseApi
    let apiNumber = 2
    while (usedApi.has(nextApi.toLowerCase())) nextApi = `${baseApi}_${apiNumber++}`
    return { label: nextLabel, apiName: nextApi }
  }
  const copySelectedElements = () => {
    const picked = elements.filter((element) => selectedElementIds.includes(element.id))
    setCopiedElements(JSON.parse(JSON.stringify(picked)))
    setSelecting(false)
    setSelectedElementIds([])
  }
  const pasteCopiedElements = () => {
    if (!copiedElements.length) return
    const existing = [...elements]
    const clones = copiedElements.map((element) => {
      const base = createElementInstance(element.key, existing, { source: 'auto', config: JSON.parse(JSON.stringify(element.config || {})) })
      const identity = uniqueCopiedIdentity(element.label || base.label, existing)
      const clone = { ...base, ...identity, description: element.description || '', configured: element.configured }
      existing.push(clone)
      return clone
    })
    setElements((current) => [...current, ...clones])
    setDirty(true)
    setElementPickerOpen(false)
  }
  const duplicateFreeElement = () => {
    if (freeSelectedIds.length !== 1) return
    const original = elements.find((element) => element.id === freeSelectedIds[0])
    if (!original) return
    const base = createElementInstance(original.key, elements, {
      source: 'free',
      position: { x: Number(original.position?.x || 220) + 28, y: Number(original.position?.y || 180) + 28 },
      config: JSON.parse(JSON.stringify(original.config || {})),
    })
    const identity = uniqueCopiedIdentity(original.label || base.label, elements)
    const clone = { ...base, ...identity, description: original.description || '', configured: original.configured }
    setElements((current) => [...current, clone])
    setFreeSelectedIds([clone.id])
    setDirty(true)
  }
  const removeFreeSelection = () => {
    if (!freeSelectedIds.length) return
    const removed = new Set(freeSelectedIds)
    setElements((current) => current.filter((element) => !removed.has(element.id)))
    setGoToConnections((current) => current.filter((edge) => !removed.has(edge.sourceId) && !removed.has(edge.targetId)))
    setFreeSelectedIds([])
    setDirty(true)
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
  const canvasPoint = (clientX, clientY) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const scale = zoom / 100
    return {
      x: Math.max(20, (clientX - rect.left + canvas.scrollLeft) / scale),
      y: Math.max(20, (clientY - rect.top + canvas.scrollTop) / scale),
    }
  }
  const dropElement = (event) => {
    if (layout !== 'free') return
    const existingId = event.dataTransfer.getData('application/x-gptbuilder-existing')
    const key = event.dataTransfer.getData('application/x-gptbuilder-element')
    if (!existingId && !elementByKey(key)) return
    event.preventDefault()
    const point = canvasPoint(event.clientX, event.clientY)
    if (existingId) {
      setElements((current) => current.map((element) => element.id === existingId ? { ...element, position: point } : element))
      setDirty(true)
      return
    }
    chooseElement(elementByKey(key), 'free', point)
  }
  const startFreeConnector = (sourceId, event) => {
    const point = canvasPoint(event.clientX, event.clientY)
    setFreeConnectorDraft({ sourceId, x: point.x, y: point.y })
  }
  const finishFreeConnector = (targetId) => {
    if (!freeConnectorDraft || freeConnectorDraft.sourceId === targetId) { setFreeConnectorDraft(null); return }
    setGoToConnections((current) => [...current.filter((edge) => !(edge.sourceId === freeConnectorDraft.sourceId && edge.targetId === targetId)), { sourceId: freeConnectorDraft.sourceId, targetId }])
    setFreeConnectorDraft(null)
    setDirty(true)
  }
  const zoomToFit = () => {
    const canvas = canvasRef.current
    const stage = canvas?.querySelector('.gptb-canvas-stage')
    if (!canvas || !stage) return
    const width = Math.max(stage.scrollWidth, stage.offsetWidth, 1)
    const height = Math.max(stage.scrollHeight, stage.offsetHeight, 1)
    const next = Math.max(25, Math.min(150, Math.floor(Math.min((canvas.clientWidth - 30) / width, (canvas.clientHeight - 30) / height) * 100)))
    setZoom(next)
    requestAnimationFrame(() => { canvas.scrollLeft = 0; canvas.scrollTop = 0 })
  }
  useEffect(() => {
    const onKeyDown = (event) => {
      const tag = event.target?.tagName
      if (['INPUT','TEXTAREA','SELECT'].includes(tag) || event.target?.isContentEditable) return
      const primary = event.ctrlKey || event.metaKey
      if (layout === 'free' && (event.key === 'Delete' || event.key === 'Backspace') && freeSelectedIds.length) {
        event.preventDefault(); removeFreeSelection(); return
      }
      if (primary && event.altKey && (event.key === '+' || event.key === '=')) { event.preventDefault(); setZoom((value) => Math.min(150, value + 10)); return }
      if (primary && event.altKey && event.key === '-') { event.preventDefault(); setZoom((value) => Math.max(25, value - 10)); return }
      if (primary && event.altKey && event.key === '0') { event.preventDefault(); setZoom(100); return }
      if (primary && event.altKey && event.key === '1') { event.preventDefault(); zoomToFit(); return }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [layout, freeSelectedIds, zoom, elements])

  const flowName = workflowId ? flowProps.label : flow.label
  const editHistorySupported = ['autolaunched','schedule','platform_event'].includes(flow.key)
  const activeElement = editingElement ? elements.find((item) => item.id === editingElement.id) || null : null
  const hasFlowErrors = issues.some((issue) => issue.level === 'error')
  const hasUnsavableIncomplete = layout === 'free'
    ? hasFlowErrors
    : elements.some((item) => !item.configured && ['screen', 'action'].includes(item.key))
  const saveBlockedReason = layout === 'free' && hasFlowErrors
    ? 'Resolve flow errors before saving in Free-Form.'
    : hasUnsavableIncomplete
      ? 'Complete Screen and Action elements before saving.'
      : 'Save'

  return <section className="gptb-builder" aria-label="GPT Builder workspace">
    <header className="gptb-buttonbar">
      <div className="gptb-brand"><span className="gptb-brand-icon"><Workflow size={19}/></span><span><strong>Flow Builder</strong><small>{flowName}</small></span></div>
      <div className="gptb-status"><span className="gptb-status-dot"/>{activeStatus ? 'Active' : 'Inactive'} <i>·</i> {lastSavedAt ? (dirty ? 'Unsaved changes' : 'Saved') : 'Never saved'}</div>
      <div className="gptb-toolbar" role="toolbar" aria-label="Flow Builder controls">
        <button className={toolboxOpen ? 'is-on' : ''} aria-label={toolboxOpen ? 'Hide Toolbox' : 'Show Toolbox'} onClick={() => setToolboxOpen((value) => !value)}><LayoutPanelLeft size={16}/></button>
        {layout === 'auto' ? <button className={selecting ? 'is-on' : ''} aria-label="Select Elements" onClick={() => { setSelecting((value) => !value); setSelectedElementIds([]); setConnectMode(false) }}><Copy size={16}/></button> : null}
        {layout === 'auto' && selecting ? <button aria-label="Copy Elements" title="Copy Elements" disabled={!selectedElementIds.length} onClick={copySelectedElements}><Copy size={16}/><em>{selectedElementIds.length || ''}</em></button> : null}
        {layout === 'free' ? <button aria-label="Duplicate Element" title="Duplicate Element" disabled={freeSelectedIds.length !== 1} onClick={duplicateFreeElement}><Copy size={16}/></button> : null}
        <span className="gptb-toolbar-separator"/>
        <button aria-label="Undo" title="Undo" disabled={!historyRef.current.length} onClick={undoFlowChange}><Undo2 size={16}/></button><button aria-label="Redo" title="Redo" disabled={!futureRef.current.length} onClick={redoFlowChange}><Redo2 size={16}/></button>
        {issues.length ? <button className={issues.some((issue) => issue.level === 'error') ? 'has-issues is-error' : 'has-issues is-warning'} aria-label={issues.some((issue) => issue.level === 'error') ? 'Show Errors' : 'Show Warnings'} title={issues.some((issue) => issue.level === 'error') ? 'Show Errors' : 'Show Warnings'} onClick={() => { setDiagnosticsOpen((value) => !value); setStartOpen(false); setEditingElement(null) }}><AlertTriangle size={16}/><em>{issues.filter((issue) => issue.level === (issues.some((row) => row.level === 'error') ? 'error' : 'warning')).length}</em></button> : null}
        <button aria-label="View Properties" title="View Properties" onClick={() => setPropertiesOpen(true)}><Settings2 size={16}/></button>
        <div className="gptb-layout-picker"><button className="gptb-layout-button" aria-haspopup="menu" aria-expanded={layoutOpen} onClick={() => setLayoutOpen((value) => !value)}>{layout === 'auto' ? 'Auto-Layout' : 'Free-Form'} <ChevronDown size={13}/></button>{layoutOpen ? <div className="gptb-layout-menu" role="menu"><button role="menuitemradio" aria-checked={layout === 'auto'} onClick={() => { setLayout('auto'); setLayoutOpen(false); setDirty(true) }}><span>{layout === 'auto' ? '✓' : ''}</span>Auto-Layout</button><button role="menuitemradio" aria-checked={layout === 'free'} onClick={() => { setLayout('free'); setLayoutOpen(false); setToolboxOpen(true); setDirty(true) }}><span>{layout === 'free' ? '✓' : ''}</span>Free-Form</button></div> : null}</div>
        <span className="gptb-toolbar-separator"/>
        <button className="gptb-text-tool" disabled={!workflowId}><Play size={14}/> Run</button>{['record','autolaunched'].includes(flow.key) ? <button className="gptb-text-tool" disabled={!workflowId}><Eye size={14}/> Test Mode</button> : <button className="gptb-text-tool" disabled={!workflowId}><Eye size={14}/> Debug</button>}
        <button className="gptb-text-tool" disabled={saving || hasUnsavableIncomplete} title={saveBlockedReason} onClick={() => workflowId ? void save(flowProps) : setPropertiesOpen(true)}><Save size={14}/> {saving ? 'Saving…' : 'Save'}</button>
        <GPTBuilderSaveAsMenu open={saveAsOpen} disabled={!workflowId || saving} onToggle={() => setSaveAsOpen((value) => !value)} onNewVersion={() => void save(flowProps, { forceNewVersion: true })} onNewFlow={() => { setSaveAsOpen(false); setSaveAsFlowOpen(true) }}/>
        {editHistorySupported ? <button aria-label="Edit History" title="Edit History" disabled={!workflowId || saving} onClick={() => void openEditHistory()}><History size={16}/></button> : null}
        <button className="gptb-text-tool is-brand" disabled={saving || !workflowId || dirty || issues.some((issue) => issue.level === 'error')} onClick={() => void activateFlow()}>Activate</button>
      </div>
    </header>
    {message ? <div className="gptb-toast is-success">{message}<button aria-label="Dismiss message" onClick={() => setMessage('')}><X size={13}/></button></div> : null}
    {saveError ? <div className="gptb-toast is-error">{saveError}<button aria-label="Dismiss error" onClick={() => setSaveError('')}><X size={13}/></button></div> : null}
    <div className={`gptb-workspace ${toolboxOpen ? 'has-toolbox' : ''} ${editHistoryOpen ? 'is-history-mode' : ''}`}>
      {toolboxOpen ? <Toolbox key={layout} layout={layout} flowType={flow.key} startConfig={startConfig} onClose={() => setToolboxOpen(false)}/> : null}
      <main
        ref={canvasRef}
        className="gptb-canvas"
        aria-label="Flow canvas"
        onDragOver={layout === 'free' ? (event) => { if (event.dataTransfer.types.includes('application/x-gptbuilder-element') || event.dataTransfer.types.includes('application/x-gptbuilder-existing')) event.preventDefault() } : undefined}
        onDrop={dropElement}
        onPointerMove={layout === 'free' && freeConnectorDraft ? (event) => { const point = canvasPoint(event.clientX, event.clientY); setFreeConnectorDraft((current) => current ? { ...current, x: point.x, y: point.y } : current) } : undefined}
        onPointerUp={layout === 'free' && freeConnectorDraft ? () => setFreeConnectorDraft(null) : undefined}
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
          <svg className="gptb-free-connections" aria-hidden="true">
            {goToConnections.map((edge) => {
              const source = edge.sourceId === 'start' ? { x: 170, y: 115 } : elements.find((element) => element.id === edge.sourceId)?.position
              const target = elements.find((element) => element.id === edge.targetId)?.position
              if (!source || !target) return null
              const sx = Number(source.x) + (edge.sourceId === 'start' ? 60 : 110)
              const sy = Number(source.y)
              const tx = Number(target.x) - 110
              const ty = Number(target.y)
              const bend = Math.max(40, Math.abs(tx - sx) / 2)
              return <path key={`${edge.sourceId}-${edge.targetId}`} d={`M ${sx} ${sy} C ${sx + bend} ${sy}, ${tx - bend} ${ty}, ${tx} ${ty}`}/>
            })}
            {freeConnectorDraft ? <path className="is-draft" d={`M ${freeConnectorDraft.sourceId === 'start' ? 230 : (elements.find((element) => element.id === freeConnectorDraft.sourceId)?.position?.x || 0) + 110} ${freeConnectorDraft.sourceId === 'start' ? 115 : (elements.find((element) => element.id === freeConnectorDraft.sourceId)?.position?.y || 0)} L ${freeConnectorDraft.x} ${freeConnectorDraft.y}`}/> : null}
          </svg>
          <button className="gptb-free-start" onClick={openStart}><span className="gptb-start-dot"/><strong>Start</strong><span className="gptb-free-connector is-output" onPointerDown={(event) => { event.stopPropagation(); event.preventDefault(); startFreeConnector('start', event) }}/></button>
          {elements.filter((element) => element.source === 'free').map((element) => <PendingElementCard
            key={element.id}
            instance={element}
            free
            selected={freeSelectedIds.includes(element.id)}
            onFreeSelect={(event) => setFreeSelectedIds((current) => event.shiftKey ? (current.includes(element.id) ? current.filter((id) => id !== element.id) : [...current, element.id]) : [element.id])}
            onOpen={() => openElement(element)}
            onConnectorStart={(event) => startFreeConnector(element.id, event)}
            onConnectorEnd={() => finishFreeConnector(element.id)}
          />)}
          <div className="gptb-free-hint">Drag elements from the Elements tab, move them anywhere, and drag connectors between elements.</div>
        </>}</div>
        <div className="gptb-zoom" role="group" aria-label="Canvas zoom"><button aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(25, value - 10))} disabled={zoom <= 25}><ZoomOut size={15}/></button><button className="gptb-zoom-value" aria-label="Reset zoom" onClick={() => setZoom(100)}>{zoom}%</button><button aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(150, value + 10))} disabled={zoom >= 150}><ZoomIn size={15}/></button><button className="gptb-fit-view" aria-label="Zoom to fit" onClick={zoomToFit}>Fit</button></div>
        <div className="gptb-canvas-help"><CircleHelp size={14}/><span>{layout === 'auto' ? 'Auto-Layout keeps the flow arranged and connected automatically.' : 'Free-Form lets you position and connect elements manually.'}</span></div>
      </main>
      {startOpen && flow.startNeedsConfiguration ? <StartPanel flowType={flow.key} value={startDraft} onChange={setStartDraft} objects={objects} eventTypes={eventTypes} onDone={finishStart} onCancel={() => setStartOpen(false)}/> : null}
      {diagnosticsOpen ? <DiagnosticsPanel issues={issues} onClose={() => setDiagnosticsOpen(false)} onIssueClick={(issue) => {
        if (issue.targetId === 'start') { openStart(); return }
        const target = elements.find((element) => element.id === issue.targetId)
        if (target) openElement(target)
      }}/> : null}
      {editHistoryOpen ? <GPTBuilderEditHistoryPanel entries={editHistoryEntries} loading={editHistoryLoading} selectedVersion={editHistoryVersion} onSelect={setEditHistoryVersion} onRestore={(entry) => void restoreHistoryEntry(entry)} onSaveAsVersion={(entry) => void saveHistoryAsNewVersion(entry)} onSaveAsFlow={saveHistoryAsNewFlow} onClose={() => setEditHistoryOpen(false)}/> : null}
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
    {propertiesOpen ? <FlowPropertiesModal value={flowProps} saved={Boolean(workflowId)} saving={saving} flowType={flow.key} availableFlows={availableFlows} onChange={(next) => { setFlowProps(next); setDirty(true) }} onCancel={() => setPropertiesOpen(false)} onSave={(next) => void save(next)}/> : null}
    {saveAsFlowOpen ? <GPTBuilderSaveAsFlowDialog value={flowProps} saving={saving} onCancel={() => setSaveAsFlowOpen(false)} onSave={(next) => void save(flowProps, { forceNewFlow: true, newFlow: next })}/> : null}
    {editHistoryPending ? <GPTBuilderUnsavedHistoryDialog saving={saving} onCancel={() => setEditHistoryPending(false)} onSaveAndView={() => void saveAndOpenEditHistory()}/> : null}
  </section>
}

export default function GPTBuilderPage({ initialWorkflowId = '', onWorkflowOpen }) {
  const [newOpen, setNewOpen] = useState(() => !initialWorkflowId)
  const [flow, setFlow] = useState(null)
  const [initialRule, setInitialRule] = useState(null)
  const [loadingExisting, setLoadingExisting] = useState(Boolean(initialWorkflowId))
  const [openError, setOpenError] = useState('')

  useEffect(() => {
    let live = true
    const id = String(initialWorkflowId || '')
    if (!id) {
      setInitialRule(null)
      setLoadingExisting(false)
      return () => { live = false }
    }
    setLoadingExisting(true)
    setOpenError('')
    apiRequest('/api/platform/rules')
      .then((response) => {
        if (!live) return
        const rows = Array.isArray(response?.data) ? response.data : []
        const saved = rows.find((item) => String(item?.id || '') === id)
        if (!saved) throw new Error('Saved GPT Builder flow not found.')
        if (saved.action?.gptBuilder !== true) throw new Error('This workflow was not created by GPT Builder.')
        const definition = FLOW_TYPES.find((item) => item.key === saved.action?.flowType)
        if (!definition) throw new Error('This GPT Builder flow type is not supported.')
        setInitialRule(saved)
        setFlow(definition)
        setNewOpen(false)
      })
      .catch((error) => { if (live) { setInitialRule(null); setFlow(null); setOpenError(error?.message || 'Unable to reopen flow.') } })
      .finally(() => { if (live) setLoadingExisting(false) })
    return () => { live = false }
  }, [initialWorkflowId])

  const startNew = () => {
    setInitialRule(null)
    setNewOpen(true)
    onWorkflowOpen?.('')
  }

  return <section className="gptb-root" aria-label="GPT Builder">
    {loadingExisting ? <main className="gptb-empty-home"><span className="gptb-empty-logo"><Workflow size={28}/></span><h1>GPT Builder</h1><p>Opening saved flow…</p></main>
      : flow ? <FlowShell key={initialRule?.id || flow.key} flow={flow} initialRule={initialRule} onWorkflowSaved={onWorkflowOpen} onNew={startNew}/>
      : <main className="gptb-empty-home"><span className="gptb-empty-logo"><Workflow size={28}/></span><h1>GPT Builder</h1>{openError ? <p role="alert">{openError}</p> : <p>Create a Salesforce-style automation in the isolated GPT Builder workspace.</p>}<button className="gptb-button is-brand" onClick={() => setNewOpen(true)}><Plus size={15}/> New Automation</button></main>}
    {newOpen ? <GPTBuilderNewAutomation flowTypes={FLOW_TYPES} onCreate={(definition) => { setInitialRule(null); setFlow(definition); setNewOpen(false); onWorkflowOpen?.('') }} onClose={() => setNewOpen(false)}/> : null}
  </section>
}
