import React, { useEffect, useMemo, useRef, useState } from 'react'
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
import GPTBuilderCreateRecords, { createRecordsRuntimeAction } from './GPTBuilderCreateRecords'
import GPTBuilderUpdateRecords, { updateRecordsRuntimeAction } from './GPTBuilderUpdateRecords'
import GPTBuilderDeleteRecords, { deleteRecordsRuntimeAction } from './GPTBuilderDeleteRecords'
import GPTBuilderAssignment, { assignmentRuntimeAction } from './GPTBuilderAssignment'
import GPTBuilderDecision, { decisionRuntimeAction } from './GPTBuilderDecision'
import GPTBuilderLoop, { loopRuntimeAction } from './GPTBuilderLoop'
import GPTBuilderCollectionFilter, { collectionFilterRuntimeAction } from './GPTBuilderCollectionFilter'
import GPTBuilderCollectionSort, { collectionSortRuntimeAction } from './GPTBuilderCollectionSort'
import GPTBuilderTransform, { transformRuntimeAction } from './GPTBuilderTransform'
import GPTBuilderWaitDuration, { waitDurationRuntimeAction } from './GPTBuilderWaitDuration'
import GPTBuilderWaitConditions, { waitConditionsRuntimeAction } from './GPTBuilderWaitConditions'
import GPTBuilderWaitUntilDate, { waitUntilDateRuntimeAction } from './GPTBuilderWaitUntilDate'
import GPTBuilderCustomError, { customErrorRuntimeAction } from './GPTBuilderCustomError'
import GPTBuilderGroup from './GPTBuilderGroup'
import GPTBuilderAction, { actionRuntimeAction } from './GPTBuilderAction'
import GPTBuilderRunAgent, { runAgentRuntimeAction } from './GPTBuilderRunAgent'
import GPTBuilderScreen, { screenRuntimeAction } from './GPTBuilderScreen'
import GPTBuilderSubflow, { subflowRuntimeAction } from './GPTBuilderSubflow'
import GPTBuilderRecordTriggerPaths from './GPTBuilderStartOptions'
import GPTBuilderFormulaBuilder, { basicFormulaCheck } from './GPTBuilderFormulaBuilder'
import GPTBuilderNewAutomation from './GPTBuilderNewAutomation'
import {
  GPTBuilderCompareVersionsPanel, GPTBuilderEditHistoryPanel, GPTBuilderSaveAsFlowDialog, GPTBuilderSaveAsMenu, GPTBuilderUnsavedHistoryDialog,
} from './GPTBuilderSaveHistory'
import './GPTBuilderPage.css'

const FLOW_CATEGORIES = [
  { key: 'frequent', label: 'Frequently Used' },
  { key: 'triggered', label: 'Triggered' },
  { key: 'screens', label: 'Screens' },
  { key: 'autolaunched', label: 'Autolaunched Automations' },
]

const FLOW_TYPES = [
  { key: 'screen', category: 'screens', featured: true, label: 'Screen Flow', description: 'Guides users through screens that collect or display information.', icon: LayoutPanelLeft, tone: 'blue', startNeedsConfiguration: false },
  { key: 'record', category: 'triggered', featured: true, label: 'Record-Triggered Flow', description: 'Launches when a record is created, updated, or deleted.', icon: Zap, tone: 'purple', startNeedsConfiguration: true },
  { key: 'schedule', category: 'scheduled', featured: true, label: 'Schedule-Triggered Flow', description: 'Runs in batches at configured times.', icon: Play, tone: 'orange', startNeedsConfiguration: true },
  { key: 'platform_event', category: 'triggered', featured: false, label: 'Platform Event—Triggered Flow', description: 'Runs when a platform event message arrives.', icon: Sparkles, tone: 'cyan', startNeedsConfiguration: true },
  { key: 'autolaunched', category: 'autolaunched', featured: true, label: 'Autolaunched Flow (No Trigger)', description: 'Runs in the background when another process invokes it.', icon: Workflow, tone: 'green', startNeedsConfiguration: false },
  { key: 'automation_event', category: 'triggered', featured: false, label: 'Automation Event-Triggered Flow', description: 'Background event flow.', icon: Zap, tone: 'purple', startNeedsConfiguration: false, pickerOnlyReference: true },
  { key: 'user_provisioning', category: 'screens', featured: false, label: 'User Provisioning Flow', description: 'User provisioning automation.', icon: LayoutPanelLeft, tone: 'blue', startNeedsConfiguration: false, pickerOnlyReference: true },
  { key: 'contact_request', category: 'screens', featured: false, label: 'Contact Request Flow', description: 'Contact request automation.', icon: LayoutPanelLeft, tone: 'blue', startNeedsConfiguration: false, pickerOnlyReference: true },
  { key: 'cart_async', category: 'autolaunched', featured: false, label: 'Cart Async Flow', description: 'Asynchronous cart automation.', icon: Workflow, tone: 'green', startNeedsConfiguration: false, pickerOnlyReference: true },
  { key: 'recommendation_strategy', category: 'autolaunched', featured: false, label: 'Recommendation Strategy', description: 'Recommendation strategy automation.', icon: Workflow, tone: 'green', startNeedsConfiguration: false, pickerOnlyReference: true },
  { key: 'autolaunched_orchestration', category: 'autolaunched', featured: false, label: 'Autolaunched Orchestration (No Trigger)', description: 'Autolaunched orchestration.', icon: Workflow, tone: 'green', startNeedsConfiguration: false, pickerOnlyReference: true },
  { key: 'record_orchestration', category: 'triggered', featured: false, label: 'Record-Triggered Orchestration', description: 'Record-triggered orchestration.', icon: Zap, tone: 'purple', startNeedsConfiguration: false, pickerOnlyReference: true },
  { key: 'evaluation', category: 'autolaunched', featured: false, label: 'Evaluation Flow', description: 'Evaluation automation.', icon: Workflow, tone: 'green', startNeedsConfiguration: false, pickerOnlyReference: true },
  { key: 'cms_orchestration', category: 'autolaunched', featured: false, label: 'Flow Orchestration for CMS', description: 'CMS orchestration automation.', icon: Workflow, tone: 'green', startNeedsConfiguration: false, pickerOnlyReference: true },
  { key: 'individual_object_linking', category: 'screens', featured: false, label: 'Individual-Object Linking Flow', description: 'Individual-object linking automation.', icon: LayoutPanelLeft, tone: 'blue', startNeedsConfiguration: false, pickerOnlyReference: true },
  { key: 'autolaunched_approval', category: 'autolaunched', featured: false, label: 'Autolaunched Flow Approval Process (No Trigger)', description: 'Autolaunched approval process flow.', icon: Workflow, tone: 'green', startNeedsConfiguration: false, pickerOnlyReference: true },
  { key: 'record_approval', category: 'triggered', featured: false, label: 'Record-Triggered Flow Approval Process', description: 'Record-triggered approval process flow.', icon: Zap, tone: 'purple', startNeedsConfiguration: false, pickerOnlyReference: true },
  { key: 'identity_registration', category: 'autolaunched', featured: false, label: 'Identity User Registration Flow', description: 'Identity registration automation.', icon: Workflow, tone: 'green', startNeedsConfiguration: false, pickerOnlyReference: true },
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
        <section><h3>Select Object</h3><label>Object<select value={value.objectKey || ''} onChange={(event) => onChange({ ...value, objectKey: event.target.value, conditions: [], formula: '', customConditionLogic: '' })}><option value="">Select an object</option>{objects.map((item) => <option key={item.id || objectKey(item)} value={objectKey(item)}>{objectLabel(item)}</option>)}</select></label></section>
        <section><h3>Configure Trigger</h3><label>Trigger the Flow When<select value={value.trigger || 'created_or_updated'} onChange={(event) => {
          const trigger = event.target.value
          const allowsChanged = ['updated','created_or_updated'].includes(trigger)
          const conditions = (value.conditions || []).map((row) => !allowsChanged && row.operator === 'changed' ? { ...row, operator: 'equals', value: '' } : row)
          const next = { ...value, trigger, conditions }
          if (trigger === 'deleted') {
            next.asyncPath = false
            next.scheduledPaths = []
            next.optimize = 'actions'
          }
          if (!['updated','created_or_updated'].includes(trigger)) next.updateMode = 'every_time'
          onChange(next)
        }}><option value="created">A record is created</option><option value="updated">A record is updated</option><option value="created_or_updated">A record is created or updated</option><option value="deleted">A record is deleted</option></select></label></section>
        <section><h3>Set Entry Conditions</h3><label>Condition Requirements<select value={value.conditionMode || 'none'} onChange={(event) => onChange({ ...value, conditionMode: event.target.value })}><option value="none">None</option><option value="all">All Conditions Are Met (AND)</option><option value="any">Any Condition Is Met (OR)</option><option value="custom">Custom Condition Logic Is Met</option><option value="formula">Formula Evaluates to True</option></select></label>{value.conditionMode === 'formula' ? <div className="gptb-start-formula"><span>Formula</span><GPTBuilderFormulaBuilder object={selectedObject} value={value.formula || ''} onChange={(formula) => onChange({ ...value, formula })}/></div> : value.conditionMode !== 'none' ? <ConditionsEditor object={selectedObject} value={value.conditions} allowIsChanged={['updated','created_or_updated'].includes(value.trigger)} customLogic={value.customConditionLogic || ''} onCustomLogicChange={value.conditionMode === 'custom' ? (customConditionLogic) => onChange({ ...value, customConditionLogic }) : null} onChange={(conditions) => onChange({ ...value, conditions })}/> : null}</section>
        {showUpdateMode ? <section><h3>When to Run the Flow for Updated Records</h3><label className="gptb-radio"><input type="radio" name="gptb-update-mode" checked={(value.updateMode || 'every_time') === 'every_time'} onChange={() => onChange({ ...value, updateMode: 'every_time' })}/><span><b>Every time a record is updated and meets the condition requirements</b></span></label><label className="gptb-radio"><input type="radio" name="gptb-update-mode" checked={value.updateMode === 'transition'} onChange={() => onChange({ ...value, updateMode: 'transition' })}/><span><b>Only when a record is updated to meet the condition requirements</b></span></label></section> : null}
        {value.trigger !== 'deleted' ? <section><h3>Optimize the Flow for</h3><label className="gptb-radio"><input type="radio" name="gptb-optimize" checked={value.optimize === 'fast'} onChange={() => onChange({ ...value, optimize: 'fast', asyncPath: false, scheduledPaths: [] })}/><span><b>Fast Field Updates</b><small>Update fields on the record that triggered the flow before the record is saved.</small></span></label><label className="gptb-radio"><input type="radio" name="gptb-optimize" checked={(value.optimize || 'actions') === 'actions'} onChange={() => onChange({ ...value, optimize: 'actions' })}/><span><b>Actions and Related Records</b><small>Perform actions and update any related records after the record is saved.</small></span></label></section> : null}
        <GPTBuilderRecordTriggerPaths value={value} selectedObject={selectedObject} onChange={onChange}/>
      </> : null}
      {flowType === 'schedule' ? <>
        <section><h3>Set a Schedule</h3><div className="gptb-two-col"><label>Start Date<input type="date" value={value.startDate || ''} onChange={(event) => onChange({ ...value, startDate: event.target.value })}/></label><label>Start Time<input type="time" value={value.startTime || ''} onChange={(event) => onChange({ ...value, startTime: event.target.value })}/></label></div><label>Frequency<select value={value.frequency || 'Daily'} onChange={(event) => onChange({ ...value, frequency: event.target.value })}><option>Once</option><option>Daily</option><option>Weekly</option></select></label><details><summary>Advanced Options</summary><label>Batch Size<input type="number" min="1" max="200" value={value.batchSize ?? 200} onChange={(event) => onChange({ ...value, batchSize: Number(event.target.value) })}/><small>Enter a value from 1 through 200. The default is 200.</small></label></details></section>
        <section><h3>Choose Object <small>(Optional)</small></h3><label>Object<select value={value.objectKey || ''} onChange={(event) => onChange({ ...value, objectKey: event.target.value, conditions: [], customConditionLogic: '' })}><option value="">None</option>{objects.map((item) => <option key={item.id || objectKey(item)} value={objectKey(item)}>{objectLabel(item)}</option>)}</select></label>{value.objectKey ? <><label>Condition Requirements<select value={value.conditionMode || 'none'} onChange={(event) => onChange({ ...value, conditionMode: event.target.value })}><option value="none">None</option><option value="all">All Conditions Are Met (AND)</option><option value="any">Any Condition Is Met (OR)</option><option value="custom">Custom Condition Logic Is Met</option></select></label>{value.conditionMode !== 'none' ? <ConditionsEditor object={selectedObject} value={value.conditions} customLogic={value.customConditionLogic || ''} onCustomLogicChange={value.conditionMode === 'custom' ? (customConditionLogic) => onChange({ ...value, customConditionLogic }) : null} onChange={(conditions) => onChange({ ...value, conditions })}/> : null}</> : null}</section>
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
      <footer className="gptb-new-footer"><button className="gptb-button" onClick={onCancel}>Cancel</button><button className="gptb-button is-brand" disabled={!valid || saving} onClick={() => {
        onChange(draft)
        if (saved) onCancel()
        else onSave(draft)
      }}>{saving ? 'Saving…' : saved ? 'Done' : 'Save'}</button></footer>
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

const MANAGER_RESOURCE_TYPES = [
  ['Variable', 'variable'],
  ['Constant', 'constant'],
  ['Formula', 'formula'],
  ['Text Template', 'text_template'],
  ['Choice', 'choice'],
  ['Collection Choice Set', 'collection_choice_set'],
  ['Record Choice Set', 'record_choice_set'],
  ['Picklist Choice Set', 'picklist_choice_set'],
  ['Stage', 'stage'],
  ['Value Map', 'value_map'],
  ['Collection Filter Criteria', 'collection_filter_criteria'],
]

function ManagerNewResource({ resources, onCreate, onClose }) {
  const [resourceType, setResourceType] = useState('variable')
  const [apiName, setApiName] = useState('')
  const [description, setDescription] = useState('')
  const [dataType, setDataType] = useState('text')
  const [value, setValue] = useState('')
  const [formula, setFormula] = useState('')
  const [isCollection, setIsCollection] = useState(false)
  const [availableForInput, setAvailableForInput] = useState(false)
  const [availableForOutput, setAvailableForOutput] = useState(false)
  const duplicate = resources.some((resource) => String(resource.apiName || '').toLowerCase() === apiName.trim().toLowerCase())
  const validName = /^[A-Za-z][A-Za-z0-9_]*$/.test(apiName) && !apiName.endsWith('_') && !apiName.includes('__') && !duplicate
  const supportsDataType = ['variable','constant','formula'].includes(resourceType)
  const create = () => {
    if (!validName) return
    onCreate({
      id: globalThis.crypto?.randomUUID?.() || `resource-${Date.now()}`,
      resourceType,
      apiName: apiName.trim(),
      label: apiName.trim(),
      description: description.trim(),
      dataType: supportsDataType ? dataType : resourceType === 'text_template' ? 'text' : ['value_map','collection_filter_criteria'].includes(resourceType) ? 'object' : 'choice',
      value: resourceType === 'constant' ? value : undefined,
      formula: resourceType === 'formula' ? formula : undefined,
      text: resourceType === 'text_template' ? value : undefined,
      isCollection: resourceType === 'variable' ? isCollection : false,
      availableForInput: resourceType === 'variable' ? availableForInput : false,
      availableForOutput: resourceType === 'variable' ? availableForOutput : false,
      source: 'manager',
    })
  }
  return <div className="gptb-modal-backdrop" role="presentation"><section className="gptb-properties-modal gptb-manager-resource-dialog" role="dialog" aria-modal="true" aria-label="New Resource">
    <header><strong>New Resource</strong><button className="gptb-icon-button" aria-label="Close New Resource" onClick={onClose}><X size={16}/></button></header>
    <div className="gptb-properties-body">
      <label><span>Resource Type</span><select value={resourceType} onChange={(event) => setResourceType(event.target.value)}>{MANAGER_RESOURCE_TYPES.map(([label,key]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label><span>API Name <b>*</b></span><input autoFocus value={apiName} onChange={(event) => setApiName(event.target.value)}/>{duplicate ? <small className="gptb-manager-error">API Name must be unique in the flow.</small> : null}</label>
      <label><span>Description</span><textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)}/></label>
      {supportsDataType ? <label><span>Data Type</span><select value={dataType} onChange={(event) => setDataType(event.target.value)}><option value="text">Text</option><option value="number">Number</option><option value="currency">Currency</option><option value="boolean">Boolean</option><option value="date">Date</option><option value="datetime">Date/Time</option><option value="record">Record</option></select></label> : null}
      {resourceType === 'constant' ? <label><span>Value</span><input value={value} onChange={(event) => setValue(event.target.value)}/></label> : null}
      {resourceType === 'formula' ? <label><span>Formula</span><textarea rows={5} value={formula} onChange={(event) => setFormula(event.target.value)}/></label> : null}
      {resourceType === 'text_template' ? <label><span>Body</span><textarea rows={7} value={value} onChange={(event) => setValue(event.target.value)}/></label> : null}
      {resourceType === 'variable' ? <>
        <label className="gptb-properties-check"><input type="checkbox" checked={isCollection} onChange={(event) => setIsCollection(event.target.checked)}/><span>Allow multiple values (collection)</span></label>
        <label className="gptb-properties-check"><input type="checkbox" checked={availableForInput} onChange={(event) => setAvailableForInput(event.target.checked)}/><span>Available for input</span></label>
        <label className="gptb-properties-check"><input type="checkbox" checked={availableForOutput} onChange={(event) => setAvailableForOutput(event.target.checked)}/><span>Available for output</span></label>
      </> : null}
    </div>
    <footer><button className="gptb-button" onClick={onClose}>Cancel</button><button className="gptb-button is-brand" disabled={!validName} onClick={create}>Done</button></footer>
  </section></div>
}

function ManagerPanel({ elements, resources, goToConnections, onNewResource, onOpenElement }) {
  const [query, setQuery] = useState('')
  const [showUnusedOnly, setShowUnusedOnly] = useState(false)
  const [selected, setSelected] = useState(null)
  const needle = query.trim().toLowerCase()
  const elementRows = elements.filter((element) => !needle || `${element.label} ${element.apiName} ${element.key}`.toLowerCase().includes(needle))
  const resourceUsage = (resource) => {
    const api = String(resource.apiName || '')
    if (!api) return []
    const needles = [`variables.${api}`, `{!${api}}`, api]
    return elements.filter((element) => needles.some((value) => JSON.stringify(element.config || {}).includes(value))).map((element) => element.label || element.apiName || element.key)
  }
  const resourceRows = resources.filter((resource) => (!needle || `${resource.label || ''} ${resource.apiName || ''} ${resource.resourceType || resource.source || ''}`.toLowerCase().includes(needle)) && (!showUnusedOnly || resourceUsage(resource).length === 0))
  const typeLabel = (resource) => {
    const key = resource.resourceType || resource.source || 'variable'
    return MANAGER_RESOURCE_TYPES.find(([,value]) => value === key)?.[0] || (resource.isCollection ? 'Collection' : 'Resource')
  }
  const usageForResource = resourceUsage
  const incomingForElement = (element) => (goToConnections || [])
    .filter((edge) => String(edge.targetId) === String(element.id))
    .map((edge) => edge.sourceId === 'start' ? 'Start' : (elements.find((item) => item.id === edge.sourceId)?.label || edge.sourceId))
  const outputsForElement = (element) => {
    if (element.key === 'get_records') {
      const first = element.config?.recordLimit === 'first'
      return [first ? `${element.apiName}.record` : `${element.apiName}.records`]
    }
    return Array.isArray(element.config?.outputs)
      ? element.config.outputs.map((output) => output?.name || output?.apiName || String(output)).filter(Boolean)
      : []
  }
  return <div className="gptb-manager">
    <div className="gptb-manager-actions"><button className="gptb-button is-brand" onClick={onNewResource}><Plus size={13}/> New Resource</button></div>
    <label className="gptb-manager-search"><Search size={13}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search this flow…"/></label><label className="gptb-properties-check"><input type="checkbox" checked={showUnusedOnly} onChange={(event)=>setShowUnusedOnly(event.target.checked)}/><span>Unused Resources Only</span></label>
    {selected ? <div className="gptb-manager-detail">
      <button className="gptb-manager-back" onClick={() => setSelected(null)}><ChevronLeft size={13}/> Back</button>
      <h3>{selected.kind === 'element' ? selected.row.label : (selected.row.label || selected.row.apiName)}</h3>
      <dl>
        <div><dt>Type</dt><dd>{selected.kind === 'element' ? (elementByKey(selected.row.key)?.label || selected.row.key) : typeLabel(selected.row)}</dd></div>
        <div><dt>API Name</dt><dd>{selected.row.apiName || '—'}</dd></div>
        {selected.kind === 'resource' ? <><div><dt>Data Type</dt><dd>{selected.row.dataType || '—'}{selected.row.isCollection ? ' Collection' : ''}</dd></div><div><dt>Available for Input</dt><dd>{selected.row.availableForInput ? 'Yes' : 'No'}</dd></div><div><dt>Available for Output</dt><dd>{selected.row.availableForOutput ? 'Yes' : 'No'}</dd></div><div><dt>Usage</dt><dd>{usageForResource(selected.row).length ? usageForResource(selected.row).join(', ') : 'Not used'}</dd></div></> : null}
        <div><dt>Description</dt><dd>{selected.row.description || '—'}</dd></div>
        {selected.kind === 'element' ? <><div><dt>Outputs</dt><dd>{outputsForElement(selected.row).length ? outputsForElement(selected.row).join(', ') : 'None'}</dd></div><div><dt>Incoming Go To Connections</dt><dd>{incomingForElement(selected.row).length ? incomingForElement(selected.row).join(', ') : 'None'}</dd></div></> : null}
      </dl>
      {selected.kind === 'element' ? <button className="gptb-inline-action" onClick={() => onOpenElement(selected.row)}>Open Element</button> : null}
    </div> : <>
      <section className="gptb-manager-section"><h3>Elements <span>{elementRows.length}</span></h3>{elementRows.length ? elementRows.map((element) => <button className="gptb-manager-row" key={element.id} onClick={() => setSelected({ kind:'element', row:element })}><span><strong>{element.label}</strong><small>{elementByKey(element.key)?.label || element.key}</small></span><ChevronRight size={14}/></button>) : <p>No elements found.</p>}</section>
      <section className="gptb-manager-section"><h3>Resources <span>{resourceRows.length}</span></h3>{resourceRows.length ? resourceRows.map((resource) => <button className="gptb-manager-row" key={resource.id || resource.apiName} onClick={() => setSelected({ kind:'resource', row:resource })}><span><strong>{resource.label || resource.apiName}</strong><small>{typeLabel(resource)}</small></span><ChevronRight size={14}/></button>) : <p>No resources found.</p>}</section>
    </>}
  </div>
}

function Toolbox({ layout, onClose, flowType, startConfig, elements, resources, goToConnections, onResourcesChange, onOpenElement }) {
  const [tab, setTab] = useState(layout === 'free' ? 'elements' : 'manager')
  const [newResourceOpen, setNewResourceOpen] = useState(false)
  const effectiveTab = layout === 'auto' ? 'manager' : tab
  const availableResources = Array.isArray(resources) ? resources : []
  return <aside className="gptb-toolbox" aria-label="Toolbox">
    <div className="gptb-toolbox-tabs">{layout === 'free' ? <button className={effectiveTab === 'elements' ? 'is-active' : ''} onClick={() => setTab('elements')}>Elements</button> : null}<button className={effectiveTab === 'manager' ? 'is-active' : ''} onClick={() => setTab('manager')}>Manager</button><button className="gptb-toolbox-close" aria-label="Close toolbox" onClick={onClose}><X size={15}/></button></div>
    {effectiveTab === 'elements'
      ? <FreeFormElements flowType={flowType} startConfig={startConfig}/>
      : <ManagerPanel elements={elements} resources={availableResources} goToConnections={goToConnections} onNewResource={() => setNewResourceOpen(true)} onOpenElement={onOpenElement}/>}
    {newResourceOpen ? <ManagerNewResource resources={availableResources} onClose={() => setNewResourceOpen(false)} onCreate={(resource) => { onResourcesChange([...resources, resource]); setNewResourceOpen(false) }}/> : null}
  </aside>
}


function AutoDecisionCard({ decision, elements, onOpenDecision, onOpenMember, onAddElement, selecting, selectedIds, onSelectToggle, flowType, startConfig, copiedCount }) {
  const [openPath, setOpenPath] = useState('')
  const outcomes = Array.isArray(decision.config?.outcomes) ? decision.config.outcomes : []
  const paths = [
    ...outcomes.map((outcome, index) => ({ id: outcome.id || `outcome-${index + 1}`, label: outcome.label || `Outcome ${index + 1}`, memberIds: Array.isArray(outcome.branch) ? outcome.branch : [] })),
    { id: '__DEFAULT__', label: decision.config?.defaultLabel || 'Default Outcome', memberIds: Array.isArray(decision.config?.defaultBranch) ? decision.config.defaultBranch : [] },
  ]
  return <div className="gptb-auto-decision">
    <PendingElementCard instance={decision} onOpen={onOpenDecision} selecting={selecting} selected={selectedIds.includes(decision.id)} onSelectToggle={() => onSelectToggle(decision.id)}/>
    <div className="gptb-decision-branches" data-decision-id={decision.id}>
      {paths.map((path) => <section className="gptb-decision-branch" key={path.id}>
        <header><span className="gptb-decision-branch-dot"/><strong>{path.label}</strong></header>
        <div className="gptb-decision-branch-line"/>
        {path.memberIds.map((id) => {
          const member = elements.find((item) => item.id === id)
          return member ? <div className="gptb-decision-branch-member" key={id}><PendingElementCard instance={member} onOpen={() => onOpenMember(member)} selecting={selecting} selected={selectedIds.includes(member.id)} onSelectToggle={() => onSelectToggle(member.id)}/></div> : null
        })}
        <div className="gptb-decision-branch-add">
          <button type="button" className="gptb-add-node" aria-label={`Add element to ${path.label}`} aria-expanded={openPath === path.id} onClick={() => setOpenPath((current) => current === path.id ? '' : path.id)}><Plus size={14}/></button>
          {openPath === path.id ? <ElementPicker flowType={flowType} startConfig={startConfig} hasExistingElements={path.memberIds.length > 0} copiedCount={copiedCount} onSelect={(picked) => { onAddElement(decision.id, path.id, picked); setOpenPath('') }} onClose={() => setOpenPath('')}/> : null}
        </div>
      </section>)}
    </div>
  </div>
}

function GPTBuilderAnalyticsPanel({ runs, days, onDaysChange, elements, onClose }) {
  const cutoff=Date.now()-(Number(days)||30)*86400000
  const filtered=runs.filter((run)=>new Date(run.started_at||run.created_at||0).getTime()>=cutoff)
  const durations=filtered.map((run)=>run.completed_at&&run.started_at?Math.max(0,new Date(run.completed_at)-new Date(run.started_at)):null).filter((value)=>Number.isFinite(value))
  const average=durations.length?Math.round(durations.reduce((sum,value)=>sum+value,0)/durations.length):0
  const statuses=filtered.reduce((acc,run)=>{const key=String(run.status||'UNKNOWN').toUpperCase();acc[key]=(acc[key]||0)+1;return acc},{})
  const elementRuns=new Map(elements.map((element)=>[String(element.id),{label:element.label||element.apiName||element.id,count:0}]))
  filtered.forEach((run)=>{const visited=run.metadata?.visitedElementIds||run.metadata?.visitedElements||[];(Array.isArray(visited)?visited:[]).forEach((id)=>{const row=elementRuns.get(String(id));if(row)row.count+=1})})
  return <aside className="gptb-config-panel gptb-analytics-panel" aria-label="Flow Analytics"><header><div><strong>Analytics</strong><small>Runtime metrics for this flow.</small></div><button className="gptb-icon-button" aria-label="Close Analytics" onClick={onClose}><X size={16}/></button></header><div className="gptb-config-body"><label><span>Date Range</span><select value={days} onChange={(event)=>onDaysChange(Number(event.target.value))}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select></label><div className="gptb-analytics-kpis"><div><b>{filtered.length}</b><span>Total Runs</span></div><div><b>{average} ms</b><span>Average Duration</span></div></div><section><h3>Run Statuses</h3>{Object.entries(statuses).map(([status,count])=><div className="gptb-analytics-row" key={status}><span>{status}</span><b>{count}</b></div>)}</section><section><h3>Element Analytics</h3>{[...elementRuns.values()].map((row)=><div className="gptb-analytics-row" key={row.label}><span>{row.label}</span><b>{row.count} runs</b></div>)}</section></div></aside>
}

function GPTBuilderExecutionPanel({ mode, workflowId, flowType, objectKey, inputContract = [], resources = [], elements = [], onClose }) {
  const [records, setRecords] = useState([])
  const [recordSearch, setRecordSearch] = useState('')
  const [recordId, setRecordId] = useState('')
  const [inputs, setInputs] = useState({})
  const [rollback, setRollback] = useState(mode === 'test')
  const [runAsUser, setRunAsUser] = useState('')
  const [resultSearch, setResultSearch] = useState('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [savedTests, setSavedTests] = useState([])
  const [selectedTestId, setSelectedTestId] = useState('')
  const [scenarioName, setScenarioName] = useState('')
  const [savingScenario, setSavingScenario] = useState(false)
  const [automationEnabled, setAutomationEnabled] = useState(false)
  const [assertions, setAssertions] = useState([])
  const [skipStartConditions, setSkipStartConditions] = useState(false)
  const [debugWaitBehavior, setDebugWaitBehavior] = useState(false)
  const [debugWaitPaths, setDebugWaitPaths] = useState({})
  const waitElements = elements.filter((element) => ['wait_duration','wait_conditions','wait_until_date'].includes(element.key))
  const executionStorageKey = `gptbuilder.execution.${workflowId || 'new'}.${mode}`

  useEffect(() => {
    let live = true
    if (mode === 'test' && workflowId) {
      apiRequest(`/api/platform/rules/${encodeURIComponent(workflowId)}/tests`)
        .then((response) => { if (live) setSavedTests(Array.isArray(response?.data) ? response.data : []) })
        .catch((requestError) => { if (live) setError(requestError?.message || 'Unable to load saved test scenarios.') })
    }
    return () => { live = false }
  }, [mode, workflowId])

  useEffect(() => {
    let live = true
    if (!objectKey || flowType !== 'record') return () => { live = false }
    apiRequest(`/api/platform/objects/${encodeURIComponent(objectKey)}/records?limit=50`)
      .then((response) => {
        if (!live) return
        const rows = response?.records || response?.data?.records || (Array.isArray(response?.data) ? response.data : [])
        setRecords(Array.isArray(rows) ? rows : [])
      })
      .catch((requestError) => { if (live) setError(requestError?.message || 'Unable to load records.') })
    return () => { live = false }
  }, [objectKey, flowType])

  useEffect(() => {
    setRollback(mode === 'test')
    setResult(null)
    setError('')
  }, [mode])

  useEffect(() => {
    if (!workflowId) return
    try {
      const saved = JSON.parse(sessionStorage.getItem(executionStorageKey) || 'null')
      if (!saved || typeof saved !== 'object') return
      setRecordId(saved.recordId || '')
      setInputs(saved.inputs && typeof saved.inputs === 'object' ? saved.inputs : {})
      setRollback(mode === 'test' && flowType === 'record' ? true : saved.rollback ?? (mode === 'test'))
      setRunAsUser(saved.runAsUser || '')
      setSelectedTestId(saved.selectedTestId || '')
      setAutomationEnabled(saved.automationEnabled === true)
      setAssertions(Array.isArray(saved.assertions) ? saved.assertions : [])
      setSkipStartConditions(saved.skipStartConditions === true)
      setDebugWaitBehavior(saved.debugWaitBehavior === true)
      setDebugWaitPaths(saved.debugWaitPaths && typeof saved.debugWaitPaths === 'object' ? saved.debugWaitPaths : {})
    } catch {}
  }, [executionStorageKey, workflowId])

  useEffect(() => {
    if (!workflowId) return
    try {
      sessionStorage.setItem(executionStorageKey, JSON.stringify({ recordId, inputs, rollback, runAsUser, selectedTestId, automationEnabled, assertions, skipStartConditions, debugWaitBehavior, debugWaitPaths }))
    } catch {}
  }, [executionStorageKey, workflowId, recordId, JSON.stringify(inputs), rollback, runAsUser, selectedTestId, automationEnabled, JSON.stringify(assertions), skipStartConditions, debugWaitBehavior, JSON.stringify(debugWaitPaths)])

  const resetExecutionSettings = () => {
    setRecordId('')
    setRecordSearch('')
    setInputs({})
    setRollback(mode === 'test')
    setRunAsUser('')
    setResultSearch('')
    setSelectedTestId('')
    setAutomationEnabled(false)
    setAssertions([])
    setSkipStartConditions(false)
    setDebugWaitBehavior(false)
    setDebugWaitPaths({})
    setResult(null)
    setError('')
    try { sessionStorage.removeItem(executionStorageKey) } catch {}
  }

  const selectSavedTest = (nextTestId) => {
    setSelectedTestId(nextTestId)
    setResult(null)
    setError('')
    const savedTest = savedTests.find((test) => String(test.id) === String(nextTestId))
    if (!savedTest) {
      setRecordId('')
      setRecordSearch('')
      setInputs({})
      setRollback(mode === 'test')
      setAutomationEnabled(false)
      setAssertions([])
      setSkipStartConditions(false)
      setDebugWaitBehavior(false)
      setDebugWaitPaths({})
      return
    }
    const config = savedTest.config && typeof savedTest.config === 'object' ? savedTest.config : {}
    setRecordId(config.recordMode === 'specific' ? String(config.recordId || '') : '')
    setRecordSearch('')
    setInputs(config.inputs && typeof config.inputs === 'object' ? config.inputs : {})
    const savedAutomationEnabled = config.scenarioTestingAutomation === true
    setAutomationEnabled(savedAutomationEnabled)
    setRollback(flowType === 'record' || savedAutomationEnabled ? true : (config.rollback ?? true))
    setAssertions(Array.isArray(config.assertions) ? config.assertions.map((assertion, index) => ({
      id: assertion.id || `saved-assertion-${index + 1}`,
      type: String(assertion.type || 'RESOURCE_CONDITION').toUpperCase(),
      resource: assertion.resource || '',
      stepId: assertion.stepId || '',
      operator: assertion.operator || 'equals',
      value: assertion.expected ?? assertion.value ?? '',
    })) : [])
    setSkipStartConditions(config.skipStartConditionRequirements === true)
    setDebugWaitBehavior(config.debugWaitElementBehavior === true)
    setDebugWaitPaths(config.debugWaitPaths && typeof config.debugWaitPaths === 'object' ? config.debugWaitPaths : {})
  }

  const filteredRecords = records.filter((record) => {
    const needle = recordSearch.trim().toLowerCase()
    if (!needle) return true
    return Object.values(record || {}).some((value) => String(value ?? '').toLowerCase().includes(needle))
  }).slice(0, 50)

  const serializeAssertion = (assertion) => {
    const type = String(assertion?.type || 'RESOURCE_CONDITION').toUpperCase()
    if (type === 'RUN_STATUS') return { type, expected: assertion.value || 'COMPLETED' }
    if (type === 'STEP_STATUS') return { type, stepId: assertion.stepId || '', expected: assertion.value || 'COMPLETED' }
    if (type === 'DECISION_OUTCOME') return { type, stepId: assertion.stepId || '', expected: assertion.value || '' }
    return { type: 'RESOURCE_CONDITION', resource: assertion.resource || '', operator: assertion.operator || 'equals', expected: assertion.value }
  }

  const assertionIsComplete = (assertion) => {
    const type = String(assertion?.type || 'RESOURCE_CONDITION').toUpperCase()
    if (type === 'RUN_STATUS') return Boolean(assertion.value)
    if (type === 'STEP_STATUS') return Boolean(assertion.stepId && assertion.value)
    if (type === 'DECISION_OUTCOME') return Boolean(assertion.stepId && assertion.value)
    if (!assertion.resource) return false
    return ['is_empty','is_not_empty'].includes(assertion.operator) || assertion.value !== ''
  }
  const invalidAssertions = automationEnabled && assertions.some((assertion) => !assertionIsComplete(assertion))

  const execute = async () => {
    setRunning(true); setError(''); setResult(null)
    try {
      const endpoint = mode === 'test' && selectedTestId
        ? `/api/platform/rules/${encodeURIComponent(workflowId)}/tests/${encodeURIComponent(selectedTestId)}/run`
        : mode === 'run'
          ? `/api/platform/rules/${encodeURIComponent(workflowId)}/run`
          : `/api/platform/rules/${encodeURIComponent(workflowId)}/debug`
      const response = await apiRequest(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          ...(recordId ? { recordId } : {}),
          inputs,
          ...(mode === 'debug' ? { mode: 'debug', rollback, ...(runAsUser ? { runAsUser } : {}), debugWaitElementBehavior: debugWaitBehavior, debugWaitPaths: debugWaitBehavior ? debugWaitPaths : {} } : {}),
          ...(mode === 'test' ? { mode: 'test', rollback: (flowType === 'record' || automationEnabled) ? true : rollback, skipStartConditionRequirements: flowType === 'record' ? skipStartConditions : false, debugWaitElementBehavior: flowType === 'autolaunched' ? debugWaitBehavior : false, debugWaitPaths: flowType === 'autolaunched' && debugWaitBehavior ? debugWaitPaths : {}, assertions: automationEnabled ? assertions.map(serializeAssertion) : [] } : {}),
        }),
      })
      setResult(response?.data || {})
      if (mode === 'test') {
        const refreshed = await apiRequest(`/api/platform/rules/${encodeURIComponent(workflowId)}/tests`).catch(() => null)
        if (refreshed) setSavedTests(Array.isArray(refreshed?.data) ? refreshed.data : [])
      }
    } catch (requestError) {
      setError(requestError?.message || `Unable to ${mode} flow.`)
    } finally {
      setRunning(false)
    }
  }

  const saveScenario = async () => {
    if (!scenarioName.trim()) return
    setSavingScenario(true); setError('')
    try {
      const response = await apiRequest(`/api/platform/rules/${encodeURIComponent(workflowId)}/tests`, {
        method: 'POST',
        body: JSON.stringify({
          name: scenarioName.trim(),
          config: {
            recordMode: recordId ? 'specific' : 'latest',
            ...(recordId ? { recordId } : {}),
            inputs,
            rollback: (flowType === 'record' || automationEnabled) ? true : rollback,
            scenarioTestingAutomation: automationEnabled,
            skipStartConditionRequirements: flowType === 'record' ? skipStartConditions : false,
            debugWaitElementBehavior: flowType === 'autolaunched' ? debugWaitBehavior : false,
            debugWaitPaths: flowType === 'autolaunched' && debugWaitBehavior ? debugWaitPaths : {},
            assertions: automationEnabled ? assertions.map(serializeAssertion) : [],
          },
        }),
      })
      const saved = response?.data
      setScenarioName('')
      const refreshed = await apiRequest(`/api/platform/rules/${encodeURIComponent(workflowId)}/tests`)
      setSavedTests(Array.isArray(refreshed?.data) ? refreshed.data : [])
      if (saved?.id) setSelectedTestId(String(saved.id))
    } catch (requestError) {
      setError(requestError?.message || 'Unable to save test scenario.')
    } finally {
      setSavingScenario(false)
    }
  }

  const title = mode === 'test' ? 'View Tests' : mode === 'debug' ? 'Debug' : 'Run'
  const needsRecord = flowType === 'record'
  return <aside className="gptb-config-panel gptb-execution-panel" aria-label={title}>
    <header><div><strong>{title}</strong><small>Uses the most recent saved version.</small></div><button className="gptb-icon-button" aria-label={`Close ${title}`} onClick={onClose}><X size={16}/></button></header>
    <div className="gptb-config-body">
      {mode === 'test' ? <section><h3>Test Scenario</h3><p className="gptb-help-text">Configure test data and run options for this scenario.</p><label><span>Saved Test</span><select value={selectedTestId} onChange={(event) => selectSavedTest(event.target.value)}><option value="">New Scenario</option>{savedTests.map((test) => <option key={test.id} value={test.id}>{test.name}{test.last_status ? ` — ${test.last_status}` : ''}</option>)}</select></label><label><span>Scenario Name</span><input value={scenarioName} onChange={(event) => setScenarioName(event.target.value)} placeholder="Enter test name"/></label><button className="gptb-inline-action" disabled={savingScenario || !scenarioName.trim() || invalidAssertions} onClick={() => void saveScenario()}><Save size={13}/> {savingScenario ? 'Saving…' : 'Save Scenario'}</button></section> : null}
      {needsRecord ? <section><h3>{mode === 'test' ? 'Set Triggering Record' : 'Triggering Record'}</h3>
        <label><span>Search records</span><span className="gptb-execution-search"><Search size={13}/><input value={recordSearch} onChange={(event) => setRecordSearch(event.target.value)} placeholder="Search records…"/></span></label>
        <label><span>Record</span><select value={recordId} onChange={(event) => setRecordId(event.target.value)}><option value="">Select a record…</option>{filteredRecords.map((record) => {
          const id = String(record?.id || record?.record_id || '')
          const label = record?.name || record?.label || record?.display_name || record?.title || id
          return <option key={id} value={id}>{String(label)}{String(label) !== id ? ` — ${id}` : ''}</option>
        })}</select></label>
      </section> : null}
      {inputContract.length ? <section><h3>Define Input Values</h3>{inputContract.map((input) => <label key={input.name}><span>{input.label || input.name}{input.required ? ' *' : ''}</span><input value={inputs[input.name] ?? input.defaultValue ?? ''} onChange={(event) => setInputs((current) => ({ ...current, [input.name]: event.target.value }))}/></label>)}</section> : null}
      {mode === 'test' ? <section><h3>Expected Results</h3>
        <label className="gptb-properties-check"><input type="checkbox" checked={automationEnabled} onChange={(event) => setAutomationEnabled(event.target.checked)}/><span>Scenario Testing Automation</span></label>
        {automationEnabled ? <>
          <p className="gptb-help-text">Add expected results for the overall run, individual elements, Decision outcomes, or resource values.</p>
          <div className="gptb-test-assertions">{assertions.map((assertion, index) => {
            const type = String(assertion.type || 'RESOURCE_CONDITION').toUpperCase()
            const decision = elements.find((element) => element.id === assertion.stepId && element.key === 'decision')
            const decisionOutcomes = decision?.config?.outcomes || []
            return <div key={assertion.id || index}>
              <span>{index + 1}</span>
              <select aria-label={`Assertion ${index + 1} type`} value={type} onChange={(event) => setAssertions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, type: event.target.value, resource: '', stepId: '', operator: 'equals', value: event.target.value === 'RUN_STATUS' || event.target.value === 'STEP_STATUS' ? 'COMPLETED' : '' } : item))}>
                <option value="RESOURCE_CONDITION">Resource Value</option>
                <option value="RUN_STATUS">Run Status</option>
                <option value="STEP_STATUS">Element Status</option>
                <option value="DECISION_OUTCOME">Decision Outcome</option>
              </select>
              {type === 'RESOURCE_CONDITION' ? <>
                <select value={assertion.resource || ''} onChange={(event) => setAssertions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, resource: event.target.value } : item))}><option value="">Select resource</option>{resources.filter((resource) => resource?.isCollection !== true).map((resource) => <option key={resource.id || resource.apiName} value={`variables.${resource.apiName}`}>{resource.label || resource.apiName}</option>)}</select>
                <select value={assertion.operator || 'equals'} onChange={(event) => setAssertions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, operator: event.target.value } : item))}><option value="equals">Equals</option><option value="not_equals">Does Not Equal</option><option value="greater_than">Greater Than</option><option value="greater_than_or_equal">Greater Than or Equal</option><option value="less_than">Less Than</option><option value="less_than_or_equal">Less Than or Equal</option><option value="is_empty">Is Empty</option><option value="is_not_empty">Is Not Empty</option></select>
                {!['is_empty','is_not_empty'].includes(assertion.operator) ? <input value={assertion.value ?? ''} onChange={(event) => setAssertions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item))} placeholder="Expected value"/> : <span/>}
              </> : type === 'RUN_STATUS' ? <>
                <span className="gptb-assertion-target">Entire automation</span>
                <span className="gptb-assertion-target">Status</span>
                <select value={assertion.value || 'COMPLETED'} onChange={(event) => setAssertions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item))}><option value="COMPLETED">Completed</option><option value="FAILED">Failed</option><option value="NOT_STARTED">Not Started</option></select>
              </> : type === 'STEP_STATUS' ? <>
                <select value={assertion.stepId || ''} onChange={(event) => setAssertions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, stepId: event.target.value } : item))}><option value="">Select element</option>{elements.filter((element) => element.key !== 'group').map((element) => <option key={element.id} value={element.id}>{element.label || element.apiName}</option>)}</select>
                <span className="gptb-assertion-target">Status</span>
                <select value={assertion.value || 'COMPLETED'} onChange={(event) => setAssertions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item))}><option value="COMPLETED">Completed</option><option value="FAILED">Failed</option><option value="NOT_RUN">Not Run</option></select>
              </> : <>
                <select value={assertion.stepId || ''} onChange={(event) => setAssertions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, stepId: event.target.value, value: '' } : item))}><option value="">Select Decision</option>{elements.filter((element) => element.key === 'decision').map((element) => <option key={element.id} value={element.id}>{element.label || element.apiName}</option>)}</select>
                <span className="gptb-assertion-target">Outcome</span>
                <select value={assertion.value || ''} disabled={!assertion.stepId} onChange={(event) => setAssertions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item))}><option value="">Select outcome</option>{decisionOutcomes.map((outcome, outcomeIndex) => <option key={outcome.id || outcomeIndex} value={outcome.id || `outcome-${outcomeIndex + 1}`}>{outcome.label || `Outcome ${outcomeIndex + 1}`}</option>)}<option value="__DEFAULT__">{decision?.config?.defaultLabel || 'Default Outcome'}</option></select>
              </>}
              <button type="button" aria-label={`Remove assertion ${index + 1}`} onClick={() => setAssertions((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={13}/></button>
            </div>
          })}</div>
          <button className="gptb-inline-action" type="button" onClick={() => setAssertions((current) => [...current, { id: globalThis.crypto?.randomUUID?.() || `assertion-${Date.now()}`, type: 'RESOURCE_CONDITION', resource: '', stepId: '', operator: 'equals', value: '' }])}><Plus size={13}/> Add Assertion</button>
          {invalidAssertions ? <p className="gptb-execution-error" role="alert">Complete every assertion before saving or running the scenario.</p> : null}
        </> : null}
      </section> : null}
      {mode !== 'run' ? <section><h3>Select Run Options</h3>{mode === 'debug'?<label><span>Run as another user</span><input value={runAsUser} onChange={(event)=>setRunAsUser(event.target.value)} placeholder="User ID or username"/></label>:null}
        {mode === 'test' && flowType === 'record' ? <label className="gptb-properties-check"><input type="checkbox" checked={skipStartConditions} onChange={(event) => setSkipStartConditions(event.target.checked)}/><span>Skip start condition requirements</span></label> : null}
        {(mode === 'test' || mode === 'debug') && flowType === 'autolaunched' && waitElements.length ? <>
          <label className="gptb-properties-check"><input type="checkbox" checked={debugWaitBehavior} onChange={(event) => setDebugWaitBehavior(event.target.checked)}/><span>Debug wait element behavior</span></label>
          {debugWaitBehavior ? <div className="gptb-debug-wait-paths">{waitElements.map((element) => {
            const options = element.key === 'wait_conditions'
              ? [...(element.config?.configurations || []).map((configuration, index) => ({ value: configuration.id || `configuration-${index+1}`, label: configuration.label || `Wait Configuration ${index+1}` })), { value: '__DEFAULT__', label: 'Default Path' }]
              : [{ value: '__WAIT__', label: element.key === 'wait_duration' ? 'Wait for Amount of Time' : 'Wait Until Date' }]
            return <label key={element.id}><span>{element.label || element.apiName}</span><select value={debugWaitPaths[element.id] || ''} onChange={(event) => setDebugWaitPaths((current) => ({ ...current, [element.id]: event.target.value }))}><option value="">Select a Wait Path</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          })}</div> : null}
        </> : null}
        <label className="gptb-properties-check"><input type="checkbox" checked={mode === 'test' && (flowType === 'record' || automationEnabled) ? true : rollback} disabled={mode === 'test' && (flowType === 'record' || automationEnabled)} onChange={(event) => setRollback(event.target.checked)}/><span>Run automation in rollback mode</span></label>
        {mode === 'test' && flowType === 'record' ? <p className="gptb-help-text">Rollback is required for record-triggered test scenarios.</p> : null}
        {mode === 'test' && automationEnabled && flowType !== 'record' ? <p className="gptb-help-text">Rollback is required when Scenario Testing Automation and assertions are enabled.</p> : null}
      </section> : null}
      {error ? <div className="gptb-execution-error" role="alert">{error}</div> : null}
      {result ? <section className="gptb-execution-result"><h3>Details</h3><label><span>Search debug output</span><span className="gptb-execution-search"><Search size={13}/><input value={resultSearch} onChange={(event)=>setResultSearch(event.target.value)} placeholder="Search output…"/></span></label><div className="gptb-debug-result-actions"><button type="button" className="gptb-inline-action" onClick={()=>navigator.clipboard?.writeText(JSON.stringify(result,null,2))}>Copy Log</button>{mode==='debug'?<><button type="button" className="gptb-inline-action" disabled={running} onClick={()=>void execute()}>Debug Again</button><button type="button" className="gptb-inline-action" onClick={()=>{setSelectedTestId('');setScenarioName(`Debug ${new Date().toLocaleString()}`);setAutomationEnabled(true)}}>Convert to Test</button></>:null}</div><pre className="gptb-debug-output">{JSON.stringify(result,null,2).split('\n').filter((line)=>!resultSearch.trim()||line.toLowerCase().includes(resultSearch.trim().toLowerCase())).join('\n')}</pre><dl><div><dt>Status</dt><dd>{result.status || result.run?.status || 'Completed'}</dd></div>{result.runId || result.run?.id ? <div><dt>Run ID</dt><dd>{result.runId || result.run?.id}</dd></div> : null}{Array.isArray(result.steps) ? <div><dt>Steps</dt><dd>{result.steps.length}</dd></div> : null}{mode === 'test' && result.testPassed !== null && result.testPassed !== undefined ? <div><dt>Test Result</dt><dd>{result.testPassed ? 'Passed' : 'Failed'}</dd></div> : null}</dl>{mode === 'test' && Array.isArray(result.assertionResult?.checks) && result.assertionResult.checks.length ? <div className="gptb-expected-results"><h4>Expected Results</h4>{result.assertionResult.checks.map((check) => <details key={check.index} open={!check.passed}><summary><span>{check.passed ? 'Passed' : 'Failed'}</span><b>{check.resource || check.label || `Assertion ${check.index + 1}`}</b></summary><dl><div><dt>Operator</dt><dd>{check.operator || 'equals'}</dd></div><div><dt>Expected</dt><dd>{String(check.expected ?? '')}</dd></div><div><dt>Actual</dt><dd>{typeof check.actual === 'object' ? JSON.stringify(check.actual) : String(check.actual ?? '')}</dd></div></dl></details>)}</div> : null}</section> : null}
    </div>
    <footer><button className="gptb-button" onClick={onClose}>Close</button>{mode !== 'run' ? <button className="gptb-button" onClick={resetExecutionSettings}>Reset Settings</button> : null}<button className="gptb-button is-brand" disabled={running || (needsRecord && !recordId) || invalidAssertions} onClick={() => void execute()}>{running ? 'Running…' : mode === 'test' ? 'Run Scenario' : 'Run'}</button></footer>
  </aside>
}

function AutoGroupCard({ group, members, onOpenGroup, onOpenMember, selecting, selectedIds, onSelectToggle, connecting, onConnectTarget, flowType, startConfig, copiedCount, onAddElement, onDeleteGroup }) {
  const storageKey = `gptbuilder.group.${group.id}.collapsed`
  const [adding, setAdding] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(storageKey) === 'true' } catch { return false }
  })
  const toggle = () => setCollapsed((current) => {
    const next = !current
    try { localStorage.setItem(storageKey, String(next)) } catch {}
    return next
  })
  return <div className={`gptb-auto-group${collapsed ? ' is-collapsed' : ''}`} data-gptb-group-id={group.id}>
    <div className="gptb-auto-group-header">
      <button type="button" className="gptb-auto-group-toggle" aria-expanded={!collapsed} onClick={toggle}>{collapsed ? <ChevronRight size={14}/> : <ChevronDown size={14}/>}<span><strong>{group.label}</strong><small>{members.length} element{members.length===1?'':'s'}</small></span></button>
      <span className="gptb-auto-group-actions"><button type="button" className="gptb-auto-group-edit" onClick={onOpenGroup}>Edit</button><button type="button" className="gptb-auto-group-delete" aria-label={`Delete group ${group.label}`} onClick={onDeleteGroup}><Trash2 size={12}/></button></span>
    </div>
    {!collapsed ? <div className="gptb-auto-group-body">
      {members.length ? members.map((element)=><div className="gptb-auto-group-member" key={element.id}><PendingElementCard instance={element} onOpen={()=>onOpenMember(element)} selecting={selecting} selected={selectedIds.includes(element.id)} onSelectToggle={()=>onSelectToggle(element.id)} connecting={connecting} onConnectTarget={()=>onConnectTarget(element.id)}/></div>) : <div className="gptb-auto-group-empty">This group is empty.</div>}
      <div className="gptb-group-add-slot"><button type="button" className="gptb-add-node" aria-label={`Add element to ${group.label}`} aria-expanded={adding} onClick={()=>setAdding((value)=>!value)}><Plus size={14}/></button>{adding?<ElementPicker flowType={flowType} startConfig={startConfig} hasExistingElements={members.length>0} copiedCount={copiedCount} onSelect={(element)=>{onAddElement?.(element);setAdding(false)}} onClose={()=>setAdding(false)}/>:null}</div>
    </div> : null}
  </div>
}

function FlowShell({ flow, onNew, initialRule = null, onWorkflowSaved }) {
  const templateAction = initialRule?.action || flow.templateRule?.action || {}
  const [layout, setLayout] = useState(templateAction.layout?.mode === 'FREE_FORM' ? 'free' : 'auto')
  const [toolboxOpen, setToolboxOpen] = useState(true)
  const [selecting, setSelecting] = useState(false)
  const [zoom, setZoom] = useState(100)
  const [layoutOpen, setLayoutOpen] = useState(false)
  const [layoutSwitchError, setLayoutSwitchError] = useState('')
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
  const [activeStatus, setActiveStatus] = useState(() => initialRule?.runtime_active === true || initialRule?.active === true || initialRule?.lifecycle_status === 'ACTIVE')
  const [message, setMessage] = useState('')
  const [saveError, setSaveError] = useState('')
  const [elementPickerOpen, setElementPickerOpen] = useState(false)
  const [autoInsertIndex, setAutoInsertIndex] = useState(null)
  const [elements, setElements] = useState(() => Array.isArray(templateAction.gptBuilderElements) ? structuredClone(templateAction.gptBuilderElements) : [])
  const [resources, setResources] = useState(() => Array.isArray(templateAction.resources) ? structuredClone(templateAction.resources) : [])
  const [providerResources, setProviderResources] = useState([])
  // Keep the resource list safe during the first render of every flow type. Provider
  // metadata arrives asynchronously and must never make Builder creation depend on it.
  const automaticResources = useMemo(() => {
    const common = [
      { id:'auto-user-id', apiName:'$User.Id', path:'$User.Id', label:'Current User ID', dataType:'text', resourceType:'automatic', writable:false },
      { id:'auto-current-datetime', apiName:'$Flow.CurrentDateTime', path:'$Flow.CurrentDateTime', label:'Current Date/Time', dataType:'datetime', resourceType:'automatic', writable:false },
      { id:'auto-current-date', apiName:'$Flow.CurrentDate', path:'$Flow.CurrentDate', label:'Current Date', dataType:'date', resourceType:'automatic', writable:false },
      { id:'auto-current-stage', apiName:'$Flow.CurrentStage', path:'$Flow.CurrentStage', label:'Current Stage', dataType:'text', resourceType:'automatic', writable:false },
    ]
    if (flow.key === 'record') common.push(
      { id:'auto-record', apiName:'$Record', path:'$Record', label:'Triggering Record', dataType:'record', objectKey:startConfig.objectKey || '', resourceType:'automatic', writable:true },
      { id:'auto-record-prior', apiName:'$Record__Prior', path:'$Record__Prior', label:'Prior Triggering Record', dataType:'record', objectKey:startConfig.objectKey || '', resourceType:'automatic', writable:false },
    )
    if (flow.key === 'platform_event') common.push({ id:'auto-event-record', apiName:'$Record', path:'$Record', label:'Platform Event Record', dataType:'record', resourceType:'automatic', writable:false })
    return common
  }, [flow.key, startConfig.objectKey])
  const availableResources = useMemo(
    () => [...automaticResources, ...(Array.isArray(resources) ? resources : []), ...(Array.isArray(providerResources) ? providerResources : [])],
    [automaticResources, resources, providerResources],
  )
  const applyResourceChanges = (next) => {
    setResources((Array.isArray(next) ? next : []).filter((resource) => resource?.providerResource !== true))
    setDirty(true)
  }
  const [editingElement, setEditingElement] = useState(null)
  const [selectedElementIds, setSelectedElementIds] = useState([])
  const [freeSelectedIds, setFreeSelectedIds] = useState([])
  const [freeConnectorDraft, setFreeConnectorDraft] = useState(null)
  const canvasRef = useRef(null)
  const toolbarRef = useRef(null)
  const toolboxFocusRef = useRef(null)
  const shortcutSequenceRef = useRef('')
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false)
  const [descriptionPopup, setDescriptionPopup] = useState(null)
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
  const [compareVersionsOpen, setCompareVersionsOpen] = useState(false)
  const [analyticsOpen, setAnalyticsOpen] = useState(false)
  const [analyticsDays, setAnalyticsDays] = useState(30)
  const [analyticsRuns, setAnalyticsRuns] = useState([])
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [executionMode, setExecutionMode] = useState(null)
  const [groupDeleteTarget, setGroupDeleteTarget] = useState(null)

  useEffect(() => {
    if (!dirty) return undefined
    const protectUnsavedFlow = (event) => {
      event.preventDefault()
      event.returnValue = ''
      return ''
    }
    window.addEventListener('beforeunload', protectUnsavedFlow)
    return () => window.removeEventListener('beforeunload', protectUnsavedFlow)
  }, [dirty])

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
      apiRequest('/api/platform/workflow-providers').catch(() => ({ data: [] })),
    ]).then(([objectResponse, eventResponse, rulesResponse, providerResponse]) => {
      if (!live) return
      setObjects(objectResponse?.data?.objects || objectResponse?.data || [])
      setEventTypes(Array.isArray(eventResponse?.data) ? eventResponse.data : [])
      setAvailableFlows((Array.isArray(rulesResponse?.data) ? rulesResponse.data : []).filter((item) => item?.action?.type === 'workflow'))
      const providers = Array.isArray(providerResponse?.data) ? providerResponse.data : []
      setProviderResources(providers.flatMap((provider) => (provider.fields || []).map((field) => ({
        id: `provider-${provider.id}-${field.key}`,
        apiName: `${provider.variableName}.${field.key}`,
        label: `${provider.name} › ${field.label || field.key}`,
        dataType: typeof field.value === 'number' ? 'number' : typeof field.value === 'boolean' ? 'boolean' : 'text',
        isCollection: false,
        writable: false,
        providerResource: true,
        providerKey: provider.providerKey,
        providerName: provider.name,
        providerField: field.key,
        secure: field.secure === true,
        previewValue: field.secure === true ? '********' : field.value,
        resourceType: 'provider_field',
      }))))
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
  const buildPayload = (props = flowProps, startOverride = startConfig) => ({
    name: props.label || 'New Flow',
    objectKey: startOverride.objectKey || null,
    triggerKey: flowTriggerKey(flow.key, startOverride),
    conditions: startOverride.conditionMode === 'none' ? [] : (startOverride.conditions || []).filter((condition) => condition.field),
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
      match: startOverride.conditionMode === 'custom' ? 'custom' : startOverride.conditionMode === 'any' ? 'any' : 'all',
      conditionLogic: startOverride.conditionMode === 'custom' ? startOverride.customConditionLogic || '' : '',
      entryFormula: startOverride.conditionMode === 'formula' ? startOverride.formula || '' : '',
      entryTransition: startOverride.updateMode === 'transition' ? 'UPDATED_TO_MEET' : 'EVERY_TIME',
      start: startOverride,
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
        if (element.key === 'create_records') return createRecordsRuntimeAction(element)
        if (element.key === 'update_records') return updateRecordsRuntimeAction(element)
        if (element.key === 'delete_records') return deleteRecordsRuntimeAction(element)
        if (element.key === 'assignment') return assignmentRuntimeAction(element, resources)
        if (element.key === 'decision') return decisionRuntimeAction(element)
        if (element.key === 'loop') return loopRuntimeAction(element, resources)
        if (element.key === 'collection_filter') return collectionFilterRuntimeAction(element, resources)
        if (element.key === 'collection_sort') return collectionSortRuntimeAction(element, resources)
        if (element.key === 'transform') return transformRuntimeAction(element)
        if (element.key === 'wait_duration') return waitDurationRuntimeAction(element)
        if (element.key === 'wait_conditions') return waitConditionsRuntimeAction(element)
        if (element.key === 'wait_until_date') return waitUntilDateRuntimeAction(element, resources)
        if (element.key === 'custom_error') return customErrorRuntimeAction(element)
        if (element.key === 'action') return actionRuntimeAction(element)
        if (element.key === 'run_agent') return runAgentRuntimeAction(element)
        if (element.key === 'screen') return screenRuntimeAction(element)
        if (element.key === 'subflow') return subflowRuntimeAction(element)
        return null
      }).filter(Boolean),
    },
  })

  const save = async (props = flowProps, options = {}, startOverride = startConfig) => {
    setSaving(true); setSaveError(''); setMessage('')
    try {
      const forceNewFlow = options.forceNewFlow === true
      const forceNewVersion = options.forceNewVersion === true
      const payload = {
        ...buildPayload(props, startOverride),
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
      if (saved.active !== undefined || saved.lifecycle_status || saved.runtime_active !== undefined) setActiveStatus(saved.runtime_active === true || saved.active === true || saved.lifecycle_status === 'ACTIVE')
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

  const setFlowActivation = async (shouldActivate) => {
    if (!workflowId || dirty || (shouldActivate && issues.some((issue) => issue.level === 'error'))) return
    setSaving(true); setSaveError(''); setMessage('')
    try {
      const response = await apiRequest(`/api/platform/rules/${encodeURIComponent(workflowId)}`, {
        method: 'PUT',
        body: JSON.stringify(shouldActivate
          ? { ...buildPayload(flowProps), active: true, lifecycleStatus: 'ACTIVE' }
          : { active: false }),
      })
      const updated = response?.data || {}
      setActiveStatus(updated.runtime_active === true || updated.active === true || updated.lifecycle_status === 'ACTIVE')
      setLastSavedAt(new Date().toISOString())
      setDirty(false)
      setMessage(shouldActivate ? 'Flow activated.' : 'Flow deactivated.')
      if (updated.id) onWorkflowSaved?.(String(updated.id))
    } catch (error) {
      setSaveError(error?.message || (shouldActivate ? 'Unable to activate flow' : 'Unable to deactivate flow'))
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

  const openCompareVersions = async () => {
    setSaveAsOpen(false)
    if (dirty) { setSaveError('Save changes before comparing versions.'); return }
    await loadEditHistory()
    setEditHistoryOpen(false)
    setCompareVersionsOpen(true)
  }

  const openAnalytics = async () => {
    if (!workflowId) return
    setAnalyticsLoading(true); setSaveError('')
    try {
      const response = await apiRequest('/api/platform/workflow-runs?limit=200')
      const rows = Array.isArray(response?.data) ? response.data : []
      setAnalyticsRuns(rows.filter((run) => String(run.workflow_id || '') === String(workflowId)))
      setAnalyticsOpen(true)
    } catch (error) { setSaveError(error?.message || 'Unable to load flow analytics') }
    finally { setAnalyticsLoading(false) }
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

  const openStart = () => {
    if (!flow.startNeedsConfiguration) return
    setStartDraft(structuredClone(startConfig))
    setStartOpen(true)
    setDiagnosticsOpen(false)
    setElementPickerOpen(false)
    setEditingElement(null)
  }
  const finishStart = () => {
    const committedStart = structuredClone(startDraft)
    setStartConfig(committedStart)
    setStartDraft(committedStart)
    setStartOpen(false)
    setDiagnosticsOpen(false)
    setDirty(true)
    setMessage('')
  }
  const handleSaveRequest = () => {
    // Save must never validate a stale committed Start while the user is editing a
    // valid draft. Commit the current draft first, then open first-save properties.
    if (startOpen && flow.startNeedsConfiguration) {
      const errors = startConfigurationErrors(flow.key, startDraft)
      if (errors.length) {
        setDiagnosticsOpen(false)
        return
      }
      const committedStart = structuredClone(startDraft)
      setStartConfig(committedStart)
      setStartDraft(committedStart)
      setStartOpen(false)
      setDiagnosticsOpen(false)
      setDirty(true)
    }
    if (workflowId) {
      // Pass the committed draft directly. React state updates are asynchronous, so
      // deferring with a microtask can still serialize the previous Start snapshot.
      const startForSave = startOpen && flow.startNeedsConfiguration ? structuredClone(startDraft) : startConfig
      void save(flowProps, {}, startForSave)
    } else {
      setPropertiesOpen(true)
    }
  }
  const updateElement = (next) => {
    setElements((current) => {
      const previous = current.find((item) => item.id === next.id)
      if (previous?.key === 'decision' && next?.key === 'decision') {
        const previousBranchIds = new Set([
          ...(previous.config?.outcomes || []).flatMap((outcome) => Array.isArray(outcome.branch) ? outcome.branch : []),
          ...(Array.isArray(previous.config?.defaultBranch) ? previous.config.defaultBranch : []),
        ])
        const nextBranchIds = new Set([
          ...(next.config?.outcomes || []).flatMap((outcome) => Array.isArray(outcome.branch) ? outcome.branch : []),
          ...(Array.isArray(next.config?.defaultBranch) ? next.config.defaultBranch : []),
        ])
        const orphaned = new Set([...previousBranchIds].filter((id) => !nextBranchIds.has(id)))
        return current.filter((item) => !orphaned.has(item.id)).map((item) => item.id === next.id ? next : item)
      }
      return current.map((item) => item.id === next.id ? next : item)
    })
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
  const cutSelectedAutoElements = () => {
    if (!selectedElementIds.length) return
    const removed = new Set(selectedElementIds)
    setCopiedElements(JSON.parse(JSON.stringify(elements.filter((element) => removed.has(element.id)))))
    setElements((current) => current.filter((element) => !removed.has(element.id)))
    setGoToConnections((current) => current.filter((edge) => !removed.has(edge.sourceId) && !removed.has(edge.targetId)))
    setSelectedElementIds([])
    setDirty(true)
  }
  const focusAutoElement = (direction, axis = 'vertical') => {
    if (layout !== 'auto') return
    const nodes = [...document.querySelectorAll('[data-gptb-auto-focus="true"]')]
    if (!nodes.length) return
    const activeNode = nodes.find((node) => node === document.activeElement || node.contains(document.activeElement))
    if (axis === 'horizontal' && activeNode) {
      const activeId = activeNode.getAttribute('data-gptb-element-id') || 'start'
      const edge = direction > 0
        ? goToConnections.find((row) => String(row.sourceId) === String(activeId))
        : goToConnections.find((row) => String(row.targetId) === String(activeId))
      const targetId = direction > 0 ? edge?.targetId : edge?.sourceId
      if (targetId) {
        const target = nodes.find((node) => String(node.getAttribute('data-gptb-element-id') || 'start') === String(targetId))
        if (target) { target.focus?.(); return }
      }
    }
    const activeIndex = nodes.findIndex((node) => node === activeNode)
    const nextIndex = activeIndex < 0 ? (direction > 0 ? 0 : nodes.length - 1) : Math.max(0, Math.min(nodes.length - 1, activeIndex + direction))
    nodes[nextIndex]?.focus?.()
  }
  const switchPanelFocus = () => {
    const panels = [
      toolbarRef.current,
      toolboxFocusRef.current,
      canvasRef.current,
      document.querySelector('.gptb-config-panel, .gptb-diagnostics, .gptb-properties-modal'),
    ].filter(Boolean)
    if (!panels.length) return
    const current = panels.findIndex((panel) => panel === document.activeElement || panel.contains?.(document.activeElement))
    panels[(current + 1) % panels.length]?.focus?.()
  }
  const switchToFreeForm = () => {
    if (layout === 'free') { setLayoutOpen(false); return }
    const autoElements = elements.filter((element) => element.source === 'auto')
    const generatedEdges = autoElements.map((element, index) => ({
      sourceId: index === 0 ? 'start' : autoElements[index - 1].id,
      targetId: element.id,
      generatedByLayoutSwitch: true,
    }))
    setElements((current) => current.map((element, index) => element.source === 'auto'
      ? { ...element, source: 'free', position: element.position || { x: 360, y: 150 + (index * 120) } }
      : element))
    setGoToConnections((current) => {
      const explicit = current.filter((edge) => edge.generatedByLayoutSwitch !== true)
      const explicitPairs = new Set(explicit.map((edge) => `${edge.sourceId}->${edge.targetId}`))
      return [...explicit, ...generatedEdges.filter((edge) => !explicitPairs.has(`${edge.sourceId}->${edge.targetId}`))]
    })
    setLayout('free')
    setLayoutOpen(false)
    setToolboxOpen(true)
    setSelectedElementIds([])
    setConnectMode(false)
    setLayoutSwitchError('')
    setDirty(true)
  }

  const switchToAutoLayout = () => {
    if (layout === 'auto') { setLayoutOpen(false); return }
    const freeElements = elements.filter((element) => element.source === 'free')
    const incoming = new Set((goToConnections || []).map((edge) => String(edge.targetId)))
    const unsupported = freeElements.filter((element) => element.key === 'step')
    const unconnected = freeElements.filter((element) => !incoming.has(String(element.id)))
    if (unsupported.length || unconnected.length) {
      const details = [
        unsupported.length ? 'one or more unsupported Step elements' : '',
        unconnected.length ? 'one or more elements without an incoming connection' : '',
      ].filter(Boolean).join(' and ')
      setLayoutSwitchError(`This flow can’t switch to Auto-Layout because it has ${details}.`)
      setLayoutOpen(false)
      return
    }
    setElements((current) => current.map((element) => element.source === 'free'
      ? { ...element, source: 'auto', position: null }
      : element))
    setGoToConnections((current) => current.filter((edge) => edge.generatedByLayoutSwitch !== true))
    setLayout('auto')
    setLayoutOpen(false)
    setFreeSelectedIds([])
    setFreeConnectorDraft(null)
    setLayoutSwitchError('')
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

  const chooseElement = (element, source = 'auto', position = null, insertIndex = autoInsertIndex) => {
    setElementPickerOpen(false)
    setAutoInsertIndex(null)
    setDiagnosticsOpen(false)
    setStartOpen(false)
    if (!element || element.key === 'end') return
    const instance = createElementInstance(element.key, elements, { source, position })
    setElements((current) => {
      if (source !== 'auto' || insertIndex == null) return [...current, instance]
      const autoElements = current.filter((item) => item.source === 'auto')
      const nestedIds = new Set([
        ...autoElements.filter((item) => item.key === 'group').flatMap((item) => item.config?.memberIds || []),
        ...autoElements.filter((item) => item.key === 'decision').flatMap((item) => [
          ...(item.config?.outcomes || []).flatMap((outcome) => outcome.branch || []),
          ...(item.config?.defaultBranch || []),
        ]),
      ])
      const topLevelAutoElements = autoElements.filter((item) => !nestedIds.has(item.id))
      const target = topLevelAutoElements[insertIndex] || null
      if (target) {
        const globalIndex = current.findIndex((item) => item.id === target.id)
        return [...current.slice(0, globalIndex), instance, ...current.slice(globalIndex)]
      }
      const lastAuto = [...current].map((item, index) => ({ item, index })).filter((entry) => entry.item.source === 'auto').at(-1)
      if (!lastAuto) return [instance, ...current]
      return [...current.slice(0, lastAuto.index + 1), instance, ...current.slice(lastAuto.index + 1)]
    })
    setEditingElement({ id: instance.id, isNew: true })
    setDirty(true)
  }
  const openElement = (instance) => {
    setElementPickerOpen(false)
    setStartOpen(false)
    setDiagnosticsOpen(false)
    setEditingElement({ id: instance.id, isNew: false })
  }
  const addElementToGroup = (groupId, element) => {
    if (!element || element.key === 'end' || element.key === 'group') return
    const instance = createElementInstance(element.key, elements, { source: 'auto' })
    setElements((current) => {
      const groupIndex = current.findIndex((item) => item.id === groupId)
      const withMember = current.map((item) => item.id === groupId
        ? { ...item, config: { ...(item.config || {}), memberIds: [...(item.config?.memberIds || []), instance.id] } }
        : item)
      if (groupIndex < 0) return [...withMember, instance]
      return [...withMember.slice(0, groupIndex + 1), instance, ...withMember.slice(groupIndex + 1)]
    })
    setEditingElement({ id: instance.id, isNew: true })
    setDirty(true)
  }
  const addElementToDecisionBranch = (decisionId, pathId, element) => {
    if (!element || element.key === 'end' || element.key === 'group') return
    const instance = createElementInstance(element.key, elements, { source: 'auto' })
    setElements((current) => {
      const decisionIndex = current.findIndex((item) => item.id === decisionId)
      const withMember = current.map((item) => {
        if (item.id !== decisionId) return item
        const config = { ...(item.config || {}) }
        if (pathId === '__DEFAULT__') {
          config.defaultBranch = [...(Array.isArray(config.defaultBranch) ? config.defaultBranch : []), instance.id]
        } else {
          config.outcomes = (Array.isArray(config.outcomes) ? config.outcomes : []).map((outcome, index) => {
            const outcomeId = outcome.id || `outcome-${index + 1}`
            return outcomeId === pathId ? { ...outcome, branch: [...(Array.isArray(outcome.branch) ? outcome.branch : []), instance.id] } : outcome
          })
        }
        return { ...item, config }
      })
      if (decisionIndex < 0) return [...withMember, instance]
      const decision = withMember[decisionIndex]
      const pathIds = pathId === '__DEFAULT__'
        ? (decision.config?.defaultBranch || [])
        : ((decision.config?.outcomes || []).find((outcome,index) => (outcome.id || `outcome-${index + 1}`) === pathId)?.branch || [])
      const previousMemberId = pathIds.length > 1 ? pathIds[pathIds.length - 2] : null
      const previousMemberIndex = previousMemberId ? withMember.findIndex((item) => item.id === previousMemberId) : decisionIndex
      const insertionIndex = previousMemberIndex >= 0 ? previousMemberIndex + 1 : decisionIndex + 1
      return [...withMember.slice(0, insertionIndex), instance, ...withMember.slice(insertionIndex)]
    })
    setEditingElement({ id: instance.id, isNew: true })
    setDirty(true)
  }
  const deleteGroup = (groupId, deleteMembers) => {
    const group = elements.find((item) => item.id === groupId && item.key === 'group')
    if (!group) { setGroupDeleteTarget(null); return }
    const memberIds = new Set(Array.isArray(group.config?.memberIds) ? group.config.memberIds : [])
    const removed = new Set([groupId, ...(deleteMembers ? [...memberIds] : [])])
    setElements((current) => current.filter((item) => !removed.has(item.id)))
    setGoToConnections((current) => current.filter((edge) => !removed.has(edge.sourceId) && !removed.has(edge.targetId)))
    setSelectedElementIds((current) => current.filter((id) => !removed.has(id)))
    setGroupDeleteTarget(null)
    setDirty(true)
  }
  const removeSelectedAutoElements = () => {
    if (!selectedElementIds.length) return
    const selectedGroups = elements.filter((item) => selectedElementIds.includes(item.id) && item.key === 'group')
    if (selectedGroups.length) { setGroupDeleteTarget(selectedGroups[0]); return }
    const removed = new Set(selectedElementIds)
    for (const decision of elements.filter((item) => removed.has(item.id) && item.key === 'decision')) {
      for (const id of (decision.config?.outcomes || []).flatMap((outcome) => outcome.branch || [])) removed.add(id)
      for (const id of decision.config?.defaultBranch || []) removed.add(id)
    }
    setElements((current) => current.map((item) => {
      if (item.key === 'group') return { ...item, config: { ...(item.config || {}), memberIds: (item.config?.memberIds || []).filter((id) => !removed.has(id)) } }
      if (item.key === 'decision') return { ...item, config: {
        ...(item.config || {}),
        outcomes: (item.config?.outcomes || []).map((outcome) => ({ ...outcome, branch: (outcome.branch || []).filter((id) => !removed.has(id)) })),
        defaultBranch: (item.config?.defaultBranch || []).filter((id) => !removed.has(id)),
      } }
      return item
    }).filter((item) => !removed.has(item.id)))
    setGoToConnections((current) => current.filter((edge) => !removed.has(edge.sourceId) && !removed.has(edge.targetId)))
    setSelectedElementIds([])
    setDirty(true)
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
  const focusedAutoElementId = () => {
    const target = document.activeElement?.closest?.('[data-gptb-auto-focus="true"]')
    const id = target?.getAttribute?.('data-gptb-element-id') || ''
    return id && id !== 'start' ? id : ''
  }
  const copyAutoElements = (ids) => {
    const wanted = new Set(ids || [])
    const picked = elements.filter((element) => wanted.has(element.id))
    if (!picked.length) return
    setCopiedElements(JSON.parse(JSON.stringify(picked)))
  }
  const deleteAutoElements = (ids, { copyFirst = false } = {}) => {
    const removed = new Set(ids || [])
    if (!removed.size) return
    for (const decision of elements.filter((item) => removed.has(item.id) && item.key === 'decision')) {
      for (const id of (decision.config?.outcomes || []).flatMap((outcome) => outcome.branch || [])) removed.add(id)
      for (const id of decision.config?.defaultBranch || []) removed.add(id)
    }
    if (copyFirst) setCopiedElements(JSON.parse(JSON.stringify(elements.filter((element) => removed.has(element.id)))))
    setElements((current) => current
      .filter((element) => !removed.has(element.id))
      .map((element) => {
        if (element.key === 'group' && Array.isArray(element.config?.memberIds)) return { ...element, config: { ...element.config, memberIds: element.config.memberIds.filter((id) => !removed.has(id)) } }
        if (element.key === 'decision') return { ...element, config: {
          ...(element.config || {}),
          outcomes: (element.config?.outcomes || []).map((outcome) => ({ ...outcome, branch: (outcome.branch || []).filter((id) => !removed.has(id)) })),
          defaultBranch: (element.config?.defaultBranch || []).filter((id) => !removed.has(id)),
        } }
        return element
      }))
    setGoToConnections((current) => current.filter((edge) => !removed.has(edge.sourceId) && !removed.has(edge.targetId)))
    setSelectedElementIds((current) => current.filter((id) => !removed.has(id)))
    setDirty(true)
  }

  useEffect(() => {
    const onKeyDown = (event) => {
      const tag = event.target?.tagName
      if (['INPUT','TEXTAREA','SELECT'].includes(tag) || event.target?.isContentEditable) return
      const primary = event.ctrlKey || event.metaKey
      if (event.key === 'F6') { event.preventDefault(); switchPanelFocus(); return }
      if (!primary && !event.altKey && !event.shiftKey) {
        const key = String(event.key || '').toLowerCase()
        const sequence = (shortcutSequenceRef.current + key).slice(-2)
        shortcutSequenceRef.current = sequence
        if (sequence === 'gd') {
          event.preventDefault()
          const toolbox = toolboxFocusRef.current
          const tips = canvasRef.current?.querySelector('.gptb-canvas-help')
          const target = toolbox && !toolbox.contains(document.activeElement) ? toolbox : tips
          target?.focus?.()
          shortcutSequenceRef.current = ''
          return
        }
      } else shortcutSequenceRef.current = ''
      if (layout === 'auto' && primary && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setToolboxOpen(true)
        requestAnimationFrame(() => toolboxFocusRef.current?.focus?.())
        return
      }
      if (layout === 'auto') {
        const focusedId = focusedAutoElementId()
        const autoIds = selectedElementIds.length ? selectedElementIds : (focusedId ? [focusedId] : [])
        if (primary && event.key.toLowerCase() === 'c' && autoIds.length) {
          event.preventDefault(); copyAutoElements(autoIds); return
        }
        if (primary && event.key.toLowerCase() === 'x' && autoIds.length) {
          event.preventDefault(); deleteAutoElements(autoIds, { copyFirst: true }); return
        }
        if (primary && event.key.toLowerCase() === 'v' && copiedElements.length) {
          event.preventDefault(); pasteCopiedElements(); return
        }
        if ((event.key === 'Delete' || event.key === 'Backspace') && autoIds.length) {
          event.preventDefault(); deleteAutoElements(autoIds); return
        }
      }
      if (layout === 'free' && (event.key === 'Delete' || event.key === 'Backspace') && freeSelectedIds.length) {
        event.preventDefault(); removeFreeSelection(); return
      }
      if (layout === 'auto' && ['ArrowDown','ArrowUp','ArrowLeft','ArrowRight'].includes(event.key)) {
        event.preventDefault()
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') focusAutoElement(event.key === 'ArrowRight' ? 1 : -1, 'horizontal')
        else focusAutoElement(event.key === 'ArrowDown' ? 1 : -1, 'vertical')
        return
      }
      if (layout === 'auto' && primary && event.key.toLowerCase() === 'i') {
        const target = event.target?.closest?.('[data-gptb-description]')
        const description = target?.getAttribute?.('data-gptb-description')
        if (description) { event.preventDefault(); setDescriptionPopup(description); return }
      }
      if (layout === 'free' && primary && event.key === '/') { event.preventDefault(); setShortcutHelpOpen(true); return }
      if (primary && event.altKey && (event.key === '+' || event.key === '=')) { event.preventDefault(); setZoom((value) => Math.min(150, value + 10)); return }
      if (primary && event.altKey && event.key === '-') { event.preventDefault(); setZoom((value) => Math.max(25, value - 10)); return }
      if (primary && event.altKey && event.key === '0') { event.preventDefault(); setZoom(100); return }
      if (primary && event.altKey && event.key === '1') { event.preventDefault(); zoomToFit(); return }
    }
    const onWheel = (event) => {
      if (!(event.ctrlKey || event.metaKey)) return
      event.preventDefault()
      setZoom((value) => Math.max(25, Math.min(150, value + (event.deltaY < 0 ? 10 : -10))))
    }
    window.addEventListener('keydown', onKeyDown)
    const canvas = canvasRef.current
    canvas?.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      canvas?.removeEventListener('wheel', onWheel)
    }
  }, [layout, freeSelectedIds, selectedElementIds, copiedElements, zoom, elements, toolboxOpen])

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
      <div ref={toolbarRef} tabIndex="-1" className="gptb-toolbar" role="toolbar" aria-label="Flow Builder controls">
        <button className={toolboxOpen ? 'is-on' : ''} aria-label={toolboxOpen ? 'Hide Toolbox' : 'Show Toolbox'} onClick={() => setToolboxOpen((value) => !value)}><LayoutPanelLeft size={16}/></button>
        {layout === 'auto' ? <button className={selecting ? 'is-on' : ''} aria-label="Select Elements" onClick={() => { setSelecting((value) => !value); setSelectedElementIds([]); setConnectMode(false) }}><Copy size={16}/></button> : null}
        {layout === 'auto' && selecting ? <button aria-label="Copy Elements" title="Copy Elements" disabled={!selectedElementIds.length} onClick={copySelectedElements}><Copy size={16}/><em>{selectedElementIds.length || ''}</em></button> : null}
        {layout === 'free' ? <button aria-label="Duplicate Element" title="Duplicate Element" disabled={freeSelectedIds.length !== 1} onClick={duplicateFreeElement}><Copy size={16}/></button> : null}
        <span className="gptb-toolbar-separator"/>
        <button aria-label="Undo" title="Undo" disabled={!historyRef.current.length} onClick={undoFlowChange}><Undo2 size={16}/></button><button aria-label="Redo" title="Redo" disabled={!futureRef.current.length} onClick={redoFlowChange}><Redo2 size={16}/></button>
        {issues.length ? <button className={issues.some((issue) => issue.level === 'error') ? 'has-issues is-error' : 'has-issues is-warning'} aria-label={issues.some((issue) => issue.level === 'error') ? 'Show Errors' : 'Show Warnings'} title={issues.some((issue) => issue.level === 'error') ? 'Show Errors' : 'Show Warnings'} onClick={() => { setDiagnosticsOpen((value) => !value); setStartOpen(false); setEditingElement(null) }}><AlertTriangle size={16}/><em>{issues.filter((issue) => issue.level === (issues.some((row) => row.level === 'error') ? 'error' : 'warning')).length}</em></button> : null}
        <button aria-label="View Properties" title="View Properties" onClick={() => setPropertiesOpen(true)}><Settings2 size={16}/></button>
        <div className="gptb-layout-picker"><button className="gptb-layout-button" aria-haspopup="menu" aria-expanded={layoutOpen} onClick={() => setLayoutOpen((value) => !value)}>{layout === 'auto' ? 'Auto-Layout' : 'Free-Form'} <ChevronDown size={13}/></button>{layoutOpen ? <div className="gptb-layout-menu" role="menu"><button role="menuitemradio" aria-checked={layout === 'auto'} onClick={switchToAutoLayout}><span>{layout === 'auto' ? '✓' : ''}</span>Auto-Layout</button><button role="menuitemradio" aria-checked={layout === 'free'} onClick={switchToFreeForm}><span>{layout === 'free' ? '✓' : ''}</span>Free-Form</button></div> : null}</div>
        <span className="gptb-toolbar-separator"/>
        <button className="gptb-text-tool" disabled={!workflowId} title={workflowId ? 'Run the most recent saved version.' : 'Save the flow before running it.'} onClick={() => setExecutionMode('run')}><Play size={14}/> Run</button>{['record','autolaunched'].includes(flow.key) ? <button className="gptb-text-tool" disabled={!workflowId} title={workflowId ? 'View and run tests for the most recent saved version.' : 'Save the flow before testing it.'} onClick={() => setExecutionMode('test')}><Eye size={14}/> View Tests</button> : <button className="gptb-text-tool" disabled={!workflowId} title={workflowId ? 'Debug the most recent saved version.' : 'Save the flow before debugging it.'} onClick={() => setExecutionMode('debug')}><Eye size={14}/> Debug</button>}
        <button className="gptb-text-tool" disabled={saving || hasUnsavableIncomplete} title={saveBlockedReason} onClick={handleSaveRequest}><Save size={14}/> {saving ? 'Saving…' : 'Save'}</button>
        <GPTBuilderSaveAsMenu open={saveAsOpen} disabled={!workflowId || saving} onToggle={() => setSaveAsOpen((value) => !value)} onNewVersion={() => void save(flowProps, { forceNewVersion: true })} onNewFlow={() => { setSaveAsOpen(false); setSaveAsFlowOpen(true) }}/>
        {editHistorySupported ? <><button aria-label="Edit History" title="Edit History" disabled={!workflowId || saving} onClick={() => void openEditHistory()}><History size={16}/></button><button className="gptb-text-tool" disabled={!workflowId || saving} onClick={() => void openCompareVersions()}>Compare Versions</button><button className="gptb-text-tool" disabled={!workflowId || analyticsLoading} onClick={() => void openAnalytics()}>{analyticsLoading?'Loading…':'Analytics'}</button></> : null}
        <button className="gptb-text-tool is-brand" disabled={saving || !workflowId || dirty || (!activeStatus && issues.some((issue) => issue.level === 'error'))} onClick={() => void setFlowActivation(!activeStatus)}>{activeStatus ? 'Deactivate' : 'Activate'}</button>
      </div>
    </header>
    {message ? <div className="gptb-toast is-success">{message}<button aria-label="Dismiss message" onClick={() => setMessage('')}><X size={13}/></button></div> : null}
    {saveError ? <div className="gptb-toast is-error">{saveError}<button aria-label="Dismiss error" onClick={() => setSaveError('')}><X size={13}/></button></div> : null}
    {layoutSwitchError ? <div className="gptb-toast is-error" role="alert">{layoutSwitchError}<button aria-label="Dismiss layout error" onClick={() => setLayoutSwitchError('')}><X size={13}/></button></div> : null}
    <div className={`gptb-workspace ${toolboxOpen ? 'has-toolbox' : ''} ${editHistoryOpen ? 'is-history-mode' : ''}`}>
      {toolboxOpen ? <div ref={toolboxFocusRef} tabIndex="-1" className="gptb-toolbox-focus"><Toolbox key={layout} layout={layout} flowType={flow.key} startConfig={startConfig} elements={elements} resources={availableResources} goToConnections={goToConnections} onResourcesChange={applyResourceChanges} onOpenElement={openElement} onClose={() => setToolboxOpen(false)}/></div> : null}
      <main
        ref={canvasRef}
        className="gptb-canvas"
        tabIndex="-1"
        aria-label="Flow canvas"
        onDragOver={layout === 'free' ? (event) => { if (event.dataTransfer.types.includes('application/x-gptbuilder-element') || event.dataTransfer.types.includes('application/x-gptbuilder-existing')) event.preventDefault() } : undefined}
        onDrop={dropElement}
        onPointerMove={layout === 'free' && freeConnectorDraft ? (event) => { const point = canvasPoint(event.clientX, event.clientY); setFreeConnectorDraft((current) => current ? { ...current, x: point.x, y: point.y } : current) } : undefined}
        onPointerUp={layout === 'free' && freeConnectorDraft ? () => setFreeConnectorDraft(null) : undefined}
      >
        <div className="gptb-canvas-stage" style={{ transform: `scale(${zoom / 100})` }}>{layout === 'auto' ? <>
          <button className={`gptb-start-card ${!startConfigured ? 'needs-config' : ''}`} data-gptb-auto-focus="true" data-gptb-element-id="start" data-gptb-description="The Start element defines when and how the flow begins." aria-label="Start" aria-disabled={!flow.startNeedsConfiguration} onClick={flow.startNeedsConfiguration ? openStart : undefined}><span className="gptb-start-dot"/><span><strong>Start</strong><small>{startSummary(flow.key, startConfig, objects)}</small></span><ChevronRight size={14}/></button>
          {(() => {
            const autoElements = elements.filter((element) => element.source === 'auto')
            const groupMemberIds = autoElements.filter((element)=>element.key==='group').flatMap((group)=>Array.isArray(group.config?.memberIds)?group.config.memberIds:[])
            const decisionMemberIds = autoElements.filter((element)=>element.key==='decision').flatMap((decision)=>[
              ...(decision.config?.outcomes || []).flatMap((outcome)=>Array.isArray(outcome.branch)?outcome.branch:[]),
              ...(Array.isArray(decision.config?.defaultBranch)?decision.config.defaultBranch:[]),
            ])
            const memberIds = new Set([...groupMemberIds, ...decisionMemberIds])
            const visible = autoElements.filter((element)=>!memberIds.has(element.id))
            const addSlot = (index) => <div className="gptb-add-slot" key={`add-${index}`}>
              <div className="gptb-connector"/>
              <button className="gptb-add-node" aria-label={`Add element at position ${index + 1}`} aria-expanded={elementPickerOpen && autoInsertIndex === index} onClick={() => {
                const same = elementPickerOpen && autoInsertIndex === index
                setElementPickerOpen(!same)
                setAutoInsertIndex(same ? null : index)
                setStartOpen(false); setDiagnosticsOpen(false); setEditingElement(null)
              }}><Plus size={15}/></button>
              {elementPickerOpen && autoInsertIndex === index ? <ElementPicker flowType={flow.key} startConfig={startConfig} hasExistingElements={autoElements.length > 0} copiedCount={copiedElements.length} onPaste={pasteCopiedElements} onConnect={beginConnectToElement} onSelect={(element) => chooseElement(element, 'auto', null, index)} onClose={() => { setElementPickerOpen(false); setAutoInsertIndex(null) }}/>:null}
            </div>
            return <>{addSlot(0)}{visible.map((element,index)=><React.Fragment key={element.id}><div className="gptb-auto-element-slot" tabIndex="-1" data-gptb-auto-focus="true" data-gptb-element-id={element.id} data-gptb-description={element.description || `${element.label || 'Flow element'} (${element.key})`}>{element.key==='group'
              ? <AutoGroupCard group={element} members={(element.config?.memberIds||[]).map((id)=>autoElements.find((item)=>item.id===id)).filter(Boolean)} onOpenGroup={()=>openElement(element)} onOpenMember={openElement} selecting={selecting} selectedIds={selectedElementIds} onSelectToggle={toggleElementSelection} connecting={connectMode} onConnectTarget={connectToElement} flowType={flow.key} startConfig={startConfig} copiedCount={copiedElements.length} onAddElement={(picked)=>addElementToGroup(element.id,picked)} onDeleteGroup={()=>setGroupDeleteTarget(element)}/>
              : element.key==='decision'
                ? <AutoDecisionCard decision={element} elements={autoElements} onOpenDecision={()=>openElement(element)} onOpenMember={openElement} onAddElement={addElementToDecisionBranch} selecting={selecting} selectedIds={selectedElementIds} onSelectToggle={toggleElementSelection} flowType={flow.key} startConfig={startConfig} copiedCount={copiedElements.length}/>
                : <PendingElementCard instance={element} onOpen={() => openElement(element)} selecting={selecting} selected={selectedElementIds.includes(element.id)} onSelectToggle={() => toggleElementSelection(element.id)} connecting={connectMode} onConnectTarget={() => connectToElement(element.id)}/>}</div>{addSlot(index + 1)}</React.Fragment>)}</>
          })()}
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
          <button className="gptb-free-start" aria-disabled={!flow.startNeedsConfiguration} onClick={flow.startNeedsConfiguration ? openStart : undefined}><span className="gptb-start-dot"/><strong>Start</strong><span className="gptb-free-connector is-output" onPointerDown={(event) => { event.stopPropagation(); event.preventDefault(); startFreeConnector('start', event) }}/></button>
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
        <div className="gptb-canvas-help" tabIndex="-1"><CircleHelp size={14}/><span>{layout === 'auto' ? 'Auto-Layout keeps the flow arranged and connected automatically.' : 'Free-Form lets you position and connect elements manually.'}</span></div>
      </main>
      {startOpen && flow.startNeedsConfiguration ? <StartPanel flowType={flow.key} value={startDraft} onChange={setStartDraft} objects={objects} eventTypes={eventTypes} onDone={finishStart} onCancel={() => setStartOpen(false)}/> : null}
      {diagnosticsOpen ? <DiagnosticsPanel issues={issues} onClose={() => setDiagnosticsOpen(false)} onIssueClick={(issue) => {
        if (issue.targetId === 'start') { openStart(); return }
        const target = elements.find((element) => element.id === issue.targetId)
        if (target) openElement(target)
      }}/> : null}
      {executionMode ? <GPTBuilderExecutionPanel mode={executionMode} workflowId={workflowId} flowType={flow.key} objectKey={startConfig.objectKey || ''} inputContract={Array.isArray(templateAction.inputContract) ? templateAction.inputContract : []} resources={availableResources} elements={elements} onClose={() => setExecutionMode(null)}/> : null}
      {compareVersionsOpen ? <GPTBuilderCompareVersionsPanel entries={editHistoryEntries} onClose={()=>setCompareVersionsOpen(false)}/> : null}
      {analyticsOpen ? <GPTBuilderAnalyticsPanel runs={analyticsRuns} days={analyticsDays} onDaysChange={setAnalyticsDays} elements={elements} onClose={()=>setAnalyticsOpen(false)}/> : null}
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
            resources={availableResources}
            onResourcesChange={applyResourceChanges}
            onConfiguredChange={setConfigured}
          />
        : activeElement.key === 'create_records'
          ? <GPTBuilderCreateRecords
              draft={draft}
              updateConfig={updateConfig}
              objects={objects}
              resources={availableResources}
              onConfiguredChange={setConfigured}
            />
          : activeElement.key === 'update_records'
            ? <GPTBuilderUpdateRecords
                draft={draft}
                updateConfig={updateConfig}
                objects={objects}
                resources={availableResources}
                flowType={flow.key}
                startConfig={startConfig}
                onConfiguredChange={setConfigured}
              />
            : activeElement.key === 'delete_records'
              ? <GPTBuilderDeleteRecords
                  draft={draft}
                  updateConfig={updateConfig}
                  objects={objects}
                  resources={availableResources}
                  flowType={flow.key}
                  startConfig={startConfig}
                  onConfiguredChange={setConfigured}
                />
              : activeElement.key === 'assignment'
                ? <GPTBuilderAssignment
                    draft={draft}
                    updateConfig={updateConfig}
                    resources={availableResources}
                    onConfiguredChange={setConfigured}
                  />
                : activeElement.key === 'decision'
                  ? <GPTBuilderDecision
                      draft={draft}
                      updateConfig={updateConfig}
                      resources={availableResources}
                      flowType={flow.key}
                      onConfiguredChange={setConfigured}
                    />
                  : activeElement.key === 'loop'
                    ? <GPTBuilderLoop
                        draft={draft}
                        updateConfig={updateConfig}
                        resources={availableResources}
                        onConfiguredChange={setConfigured}
                      />
                    : activeElement.key === 'collection_filter'
                      ? <GPTBuilderCollectionFilter
                          draft={draft}
                          updateConfig={updateConfig}
                          resources={availableResources}
                          onConfiguredChange={setConfigured}
                        />
                      : activeElement.key === 'collection_sort'
                        ? <GPTBuilderCollectionSort
                            draft={draft}
                            updateConfig={updateConfig}
                            resources={availableResources}
                            objects={objects}
                            onConfiguredChange={setConfigured}
                          />
                        : activeElement.key === 'transform'
                          ? <GPTBuilderTransform
                              draft={draft}
                              updateConfig={updateConfig}
                              resources={availableResources}
                              objects={objects}
                              onResourcesChange={applyResourceChanges}
                              onConfiguredChange={setConfigured}
                            />
                          : activeElement.key === 'wait_duration'
                            ? <GPTBuilderWaitDuration
                                draft={draft}
                                updateConfig={updateConfig}
                                onConfiguredChange={setConfigured}
                              />
                            : activeElement.key === 'wait_conditions'
                              ? <GPTBuilderWaitConditions
                                  draft={draft}
                                  updateConfig={updateConfig}
                                  resources={availableResources}
                                  eventTypes={eventTypes}
                                  onConfiguredChange={setConfigured}
                                />
                              : activeElement.key === 'wait_until_date'
                                ? <GPTBuilderWaitUntilDate
                                    draft={draft}
                                    updateConfig={updateConfig}
                                    resources={availableResources}
                                    onConfiguredChange={setConfigured}
                                  />
                                : activeElement.key === 'custom_error'
                                  ? <GPTBuilderCustomError
                                      draft={draft}
                                      updateConfig={updateConfig}
                                      objects={objects}
                                      startConfig={startConfig}
                                      resources={availableResources}
                                      onConfiguredChange={setConfigured}
                                    />
                                  : activeElement.key === 'group'
                                    ? <GPTBuilderGroup
                                        draft={draft}
                                        updateConfig={updateConfig}
                                        elements={elements}
                                        onConfiguredChange={setConfigured}
                                      />
                                    : activeElement.key === 'action'
                                      ? <GPTBuilderAction
                                          draft={draft}
                                          updateConfig={updateConfig}
                                          resources={availableResources}
                                          object={objects.find((item) => objectKey(item) === startConfig.objectKey) || null}
                                          onResourcesChange={applyResourceChanges}
                                          onConfiguredChange={setConfigured}
                                        />
                                      : activeElement.key === 'run_agent'
                                        ? <GPTBuilderRunAgent
                                            draft={draft}
                                            updateConfig={updateConfig}
                                            resources={availableResources}
                                            onConfiguredChange={setConfigured}
                                          />
                                        : activeElement.key === 'screen'
                                          ? <GPTBuilderScreen
                                              draft={draft}
                                              updateConfig={updateConfig}
                                              resources={availableResources}
                                              onResourcesChange={applyResourceChanges}
                                              onConfiguredChange={setConfigured}
                                            />
                                          : activeElement.key === 'subflow'
                                            ? <GPTBuilderSubflow
                                                draft={draft}
                                                updateConfig={updateConfig}
                                                resources={availableResources}
                                                currentFlowType={flow.key}
                                                onConfiguredChange={setConfigured}
                                              />
                                            : null}</GPTBuilderElementProperties> : null}
    </div>
    <button className="gptb-new-flow-link" onClick={onNew}>New Automation</button>
    {propertiesOpen ? <FlowPropertiesModal value={flowProps} saved={Boolean(workflowId)} saving={saving} flowType={flow.key} availableFlows={availableFlows} onChange={(next) => {
      const changed = JSON.stringify(next) !== JSON.stringify(flowProps)
      setFlowProps(next)
      if (changed) setDirty(true)
    }} onCancel={() => setPropertiesOpen(false)} onSave={(next) => void save(next)}/> : null}
    {saveAsFlowOpen ? <GPTBuilderSaveAsFlowDialog value={flowProps} saving={saving} onCancel={() => setSaveAsFlowOpen(false)} onSave={(next) => void save(flowProps, { forceNewFlow: true, newFlow: next })}/> : null}
    {editHistoryPending ? <GPTBuilderUnsavedHistoryDialog saving={saving} onCancel={() => setEditHistoryPending(false)} onSaveAndView={() => void saveAndOpenEditHistory()}/> : null}
    {groupDeleteTarget ? <div className="gptb-modal-backdrop" role="presentation"><section className="gptb-properties-modal gptb-group-delete-modal" role="dialog" aria-modal="true" aria-labelledby="gptb-group-delete-title"><header><strong id="gptb-group-delete-title">Delete Group</strong><button className="gptb-icon-button" aria-label="Close Delete Group" onClick={()=>setGroupDeleteTarget(null)}><X size={16}/></button></header><div className="gptb-properties-body"><p>What should happen to the elements in <b>{groupDeleteTarget.label}</b>?</p></div><footer><button className="gptb-button" onClick={()=>setGroupDeleteTarget(null)}>Cancel</button><button className="gptb-button" onClick={()=>deleteGroup(groupDeleteTarget.id,false)}>Keep Elements</button><button className="gptb-button is-brand" onClick={()=>deleteGroup(groupDeleteTarget.id,true)}>Delete Group and Elements</button></footer></section></div> : null}
    {shortcutHelpOpen ? <div className="gptb-modal-backdrop" role="presentation"><section className="gptb-properties-modal gptb-shortcuts-modal" role="dialog" aria-modal="true" aria-labelledby="gptb-shortcuts-title"><header><strong id="gptb-shortcuts-title">Keyboard Shortcuts</strong><button className="gptb-icon-button" aria-label="Close Keyboard Shortcuts" onClick={() => setShortcutHelpOpen(false)}><X size={16}/></button></header><div className="gptb-properties-body"><dl className="gptb-shortcut-list"><div><dt>Zoom in / out</dt><dd>Ctrl/Cmd + Alt/Option + + / − or Ctrl/Cmd + mouse wheel</dd></div><div><dt>Zoom to fit</dt><dd>Ctrl/Cmd + Alt/Option + 1</dd></div><div><dt>Reset zoom</dt><dd>Ctrl/Cmd + Alt/Option + 0</dd></div><div><dt>Switch panel focus</dt><dd>F6</dd></div><div><dt>Toolbox / tips focus</dt><dd>g, then d</dd></div><div><dt>Navigate elements</dt><dd>Arrow keys in Auto-Layout</dd></div><div><dt>Cut / copy / paste</dt><dd>Ctrl/Cmd + X / C / V in Auto-Layout</dd></div><div><dt>Delete focused elements</dt><dd>Delete / Backspace in Auto-Layout</dd></div><div><dt>Open Toolbox</dt><dd>Ctrl/Cmd + K in Auto-Layout</dd></div><div><dt>Select multiple elements</dt><dd>Shift + Click in Free-Form</dd></div><div><dt>Delete selected elements</dt><dd>Delete / Backspace in Free-Form</dd></div><div><dt>Element description</dt><dd>Ctrl/Cmd + I in Auto-Layout</dd></div><div><dt>View keyboard shortcuts</dt><dd>Ctrl/Cmd + / in Free-Form</dd></div></dl></div><footer><button className="gptb-button is-brand" onClick={() => setShortcutHelpOpen(false)}>Close</button></footer></section></div> : null}
    {descriptionPopup ? <div className="gptb-description-popup" role="status">{descriptionPopup}<button aria-label="Close description" onClick={() => setDescriptionPopup(null)}><X size={13}/></button></div> : null}
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
