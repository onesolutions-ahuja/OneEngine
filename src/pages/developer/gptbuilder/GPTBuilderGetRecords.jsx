import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Database, Plus, Search, Trash2, X } from 'lucide-react'
import { apiRequest } from '../../../services/api'
import GPTBuilderRelatedRecords, { relatedRuntimeConfig, relatedSelectionErrors } from './GPTBuilderRelatedRecords'

const objectKey = (value) => String(value?.object_key || value?.api_name || value?.apiName || value?.key || value?.id || '')
const resourcePath = (resource) => resource?.path || (resource?.apiName ? `variables.${resource.apiName}` : '')
const objectLabel = (value) => value?.label || value?.name || objectKey(value)
const fieldKey = (value) => String(value?.api_name || value?.apiName || value?.field_key || value?.key || value?.id || '')
const fieldLabel = (value) => value?.label || value?.name || fieldKey(value)
const fieldType = (value) => String(value?.field_type || value?.data_type || value?.type || 'text').toLowerCase()
const resourceTypeForField = (field) => {
  const type = fieldType(field)
  if (['number','decimal'].includes(type)) return 'number'
  if (type === 'currency') return 'currency'
  if (type === 'boolean') return 'boolean'
  if (type === 'date') return 'date'
  if (type === 'datetime') return 'datetime'
  return 'text'
}
const uid = () => globalThis.crypto?.randomUUID?.() || `row-${Date.now()}-${Math.random().toString(36).slice(2)}`

export const GET_RECORDS_DEFAULTS = Object.freeze({
  objectKey: '',
  objectLabel: '',
  conditionLogic: 'all',
  customConditionLogic: '',
  conditions: [],
  sortOrder: 'none',
  sortBy: '',
  recordLimit: 'first',
  maxRecords: '',
  maxRecordsMode: 'literal',
  maxRecordsResource: '',
  storeMode: 'auto',
  selectedFields: [],
  advancedMode: 'record',
  advancedTarget: '',
  fieldAssignments: [],
  setNullOnNoRecords: false,
  relatedEnabled: false,
  relatedSelections: [],
})

export function normalizeGetRecordsConfig(config = {}) {
  return {
    ...GET_RECORDS_DEFAULTS,
    ...config,
    conditions: Array.isArray(config.conditions) ? config.conditions : [],
    selectedFields: Array.isArray(config.selectedFields) ? config.selectedFields : [],
    fieldAssignments: Array.isArray(config.fieldAssignments) ? config.fieldAssignments : [],
    relatedSelections: Array.isArray(config.relatedSelections) ? config.relatedSelections : [],
  }
}

export function getRecordsConfigErrors(config = {}) {
  const c = normalizeGetRecordsConfig(config)
  const errors = []
  if (!c.objectKey) errors.push('Select an object.')
  if (c.conditionLogic !== 'none') {
    if (!c.conditions.length) errors.push('Add at least one filter condition or choose None.')
    c.conditions.forEach((row, index) => {
      if (!row.field) errors.push(`Condition ${index + 1}: select a field.`)
      if (!row.operator) errors.push(`Condition ${index + 1}: select an operator.`)
      if (row.operator !== 'is_null' && (row.value === '' || row.value == null)) errors.push(`Condition ${index + 1}: enter or select a value.`)
      if (['in', 'not_in'].includes(row.operator) && row.valueMode !== 'resource') errors.push(`Condition ${index + 1}: In and Not In require a collection resource.`)
    })
  }
  if (c.conditionLogic === 'custom' && !String(c.customConditionLogic || '').trim()) errors.push('Enter custom condition logic.')
  if (c.sortOrder !== 'none' && !c.sortBy) errors.push('Select a field to sort by.')
  if (c.recordLimit === 'limited') {
    if (c.maxRecordsMode === 'resource') {
      if (!c.maxRecordsResource) errors.push('Select a Number resource for the maximum records.')
    } else {
      const n = Number(c.maxRecords)
      if (!Number.isInteger(n) || n < 2 || n > 20000) errors.push('Maximum records must be a whole number from 2 to 20,000.')
    }
  }
  if (c.storeMode === 'choose' && !c.selectedFields.length) errors.push('Select at least one field to store.')
  if (c.storeMode === 'advanced') {
    if (c.advancedMode === 'record' && !c.advancedTarget) errors.push('Select a record variable.')
    if (c.advancedMode === 'record' && !c.selectedFields.length) errors.push('Select at least one field to store.')
    if (c.advancedMode === 'fields' && !c.fieldAssignments.some((row) => row.field && row.resource)) errors.push('Map at least one field to a variable.')
    if (c.recordLimit !== 'first' && c.advancedMode !== 'record') errors.push('Multiple records must be stored in a record collection variable.')
  }
  if (c.relatedEnabled) {
    if (!c.relatedSelections.length) errors.push('Select at least one related object.')
    c.relatedSelections.forEach((selection) => relatedSelectionErrors(selection).forEach((error) => errors.push(`${selection.objectLabel || selection.objectKey || 'Related object'}: ${error}`)))
  }
  return errors
}

export function getRecordsRuntimeAction(instance) {
  const c = normalizeGetRecordsConfig(instance?.config)
  const filters = c.conditionLogic === 'none' ? [] : c.conditions.map((row) => ({
    field: row.field,
    operator: row.operator,
    value: row.operator === 'is_null'
      ? Boolean(row.value)
      : row.valueMode === 'resource'
        ? { path: row.value }
        : row.value,
  }))
  const action = {
    id: instance.id,
    key: 'GET_RECORDS',
    label: instance.label,
    apiName: instance.apiName,
    description: instance.description || '',
    objectKey: c.objectKey,
    filters,
    match: c.conditionLogic === 'any' ? 'any' : 'all',
    customConditionLogic: c.conditionLogic === 'custom' ? c.customConditionLogic : undefined,
    sortField: c.sortOrder === 'none' ? undefined : c.sortBy,
    sortDirection: c.sortOrder === 'none' ? undefined : c.sortOrder,
    limit: c.recordLimit === 'first'
      ? 1
      : c.recordLimit === 'limited'
        ? (c.maxRecordsMode === 'resource' ? { path: c.maxRecordsResource } : Number(c.maxRecords))
        : 20000,
    store: c.recordLimit === 'first' ? 'first' : 'all',
    fieldSelection: c.storeMode,
    selectedFields: c.storeMode === 'choose' ? c.selectedFields : c.storeMode === 'advanced' && c.advancedMode === 'record' ? c.selectedFields : undefined,
    relatedRecords: c.relatedEnabled ? c.relatedSelections.map(relatedRuntimeConfig) : undefined,
  }
  if (c.storeMode === 'advanced') {
    action.advancedAssignment = c.advancedMode === 'record'
      ? { mode: c.recordLimit === 'first' ? 'record' : 'collection', resourceName: String(c.advancedTarget || '').replace(/^variables\./, ''), fields: c.selectedFields, setNullOnNoRecords: c.setNullOnNoRecords === true }
      : { mode: 'fields', mappings: c.fieldAssignments.filter((row) => row.field && row.resource).map((row) => ({ field: row.field, resourceName: String(row.resource).replace(/^variables\./, '') })), setNullOnNoRecords: c.setNullOnNoRecords === true }
  }
  return action
}

function ObjectPicker({ objects, value, onChange }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const selected = objects.find((item) => objectKey(item) === value)
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return objects.filter((item) => !needle || `${objectLabel(item)} ${objectKey(item)}`.toLowerCase().includes(needle)).slice(0, 30)
  }, [objects, query])
  return <div className="gptb-gr-object-picker" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
    <Search size={14}/>
    <input
      role="combobox"
      aria-expanded={open}
      aria-label="Object"
      placeholder="Search objects..."
      value={open ? query : (selected ? objectLabel(selected) : '')}
      onFocus={() => { setQuery(selected ? objectLabel(selected) : ''); setOpen(true) }}
      onChange={(event) => { setQuery(event.target.value); setOpen(true) }}
      onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); if (event.key === 'Enter' && matches[0]) { event.preventDefault(); onChange(matches[0]); setOpen(false) } }}
    />
    {open ? <div className="gptb-gr-object-menu" role="listbox">
      {matches.length ? matches.map((item) => <button key={item.id || objectKey(item)} type="button" role="option" aria-selected={objectKey(item) === value} onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(item); setOpen(false) }}><span>{objectLabel(item)}</span><small>{objectKey(item)}</small></button>) : <span className="gptb-gr-empty">No objects found</span>}
    </div> : null}
  </div>
}

function FieldPicker({ fields, value, onChange, placeholder = 'Select a field' }) {
  return <select value={value || ''} onChange={(event) => onChange(event.target.value)} disabled={!fields.length}>
    <option value="">{fields.length ? placeholder : 'Select an object first'}</option>
    {fields.map((field) => <option key={fieldKey(field)} value={fieldKey(field)}>{fieldLabel(field)}</option>)}
  </select>
}

function operatorsFor(field) {
  const type = fieldType(field)
  const base = [
    ['equals', 'Equals'],
    ['not_equals', 'Does Not Equal'],
    ['is_null', 'Is Null'],
  ]
  const comparisons = ['number','decimal','currency','date','datetime','time'].includes(type)
    ? [['greater_than','Greater Than'],['greater_than_or_equal','Greater Than or Equal'],['less_than','Less Than'],['less_than_or_equal','Less Than or Equal']]
    : []
  const textual = ['text','email','phone','select','multiselect'].includes(type)
    ? [['contains','Contains'],['starts_with','Starts With'],['ends_with','Ends With']]
    : []
  const inOps = ['select','multiselect'].includes(type) ? [] : [['in','In'],['not_in','Not In']]
  return [...base, ...comparisons, ...textual, ...inOps]
}

function NewVariableDialog({ objectKey: targetObject, collectionDefault = false, initialDataType = '', onCreate, onClose }) {
  const [apiName, setApiName] = useState('')
  const [dataType, setDataType] = useState(initialDataType || (targetObject ? 'record' : 'text'))
  const [isCollection, setIsCollection] = useState(collectionDefault)
  const [objectKeyValue, setObjectKeyValue] = useState(targetObject || '')
  const valid = /^[A-Za-z][A-Za-z0-9_]*$/.test(apiName)
  return <div className="gptb-gr-resource-backdrop">
    <section className="gptb-gr-resource-dialog" role="dialog" aria-modal="true" aria-label="New Resource">
      <header><strong>New Resource</strong><button className="gptb-icon-button" onClick={onClose} aria-label="Close New Resource"><X size={15}/></button></header>
      <div>
        <label>Resource Type<select disabled value="Variable"><option>Variable</option></select></label>
        <label>API Name<input autoFocus value={apiName} onChange={(event) => setApiName(event.target.value)}/></label>
        <label>Data Type<select value={dataType} onChange={(event) => setDataType(event.target.value)}><option value="text">Text</option><option value="number">Number</option><option value="currency">Currency</option><option value="boolean">Boolean</option><option value="date">Date</option><option value="datetime">Date/Time</option><option value="record">Record</option></select></label>
        {dataType === 'record' ? <label>Object API Name<input value={objectKeyValue} onChange={(event) => setObjectKeyValue(event.target.value)} /></label> : null}
        <label className="gptb-gr-check"><input type="checkbox" checked={isCollection} onChange={(event) => setIsCollection(event.target.checked)}/> Allow multiple values (collection)</label>
      </div>
      <footer><button className="gptb-button" onClick={onClose}>Cancel</button><button className="gptb-button is-brand" disabled={!valid || (dataType === 'record' && !objectKeyValue)} onClick={() => onCreate({ id: uid(), apiName, label: apiName, dataType, isCollection, objectKey: dataType === 'record' ? objectKeyValue : '', source: 'variable' })}>Done</button></footer>
    </section>
  </div>
}

function ResourcePicker({ value, onChange, resources, flowType, startConfig, objects, elements, expected = null, targetObject = '', collection = null, allowNew = false, onNewResource }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [trail, setTrail] = useState(null)
  const [fields, setFields] = useState([])
  const startObject = objects.find((item) => objectKey(item) === startConfig?.objectKey)

  useEffect(() => {
    let live = true
    if (!trail?.objectId) { setFields([]); return () => { live = false } }
    apiRequest(`/api/platform/objects/${encodeURIComponent(trail.objectId)}/fields`).then((response) => {
      if (live) setFields((Array.isArray(response?.data) ? response.data : []).filter((field) => field?.active !== false))
    }).catch(() => { if (live) setFields([]) })
    return () => { live = false }
  }, [trail?.objectId])

  const variableRows = resources.filter((resource) => {
    if (expected && resource.dataType !== expected) return false
    if (collection !== null && Boolean(resource.isCollection) !== Boolean(collection)) return false
    if (targetObject && resource.dataType === 'record' && resource.objectKey !== targetObject) return false
    return true
  })
  const priorRows = expected && expected !== 'record'
    ? []
    : elements.filter((element) => element.key === 'get_records' && element.configured).map((element) => {
      const object = objects.find((item) => objectKey(item) === element.config?.objectKey)
      const first = element.config?.recordLimit === 'first'
      return {
        value: `steps.${element.apiName}.${first ? 'record' : 'records'}`,
        label: element.label,
        type: first ? 'Record' : 'Record Collection',
        children: first && Boolean(object?.id),
        objectId: first ? object?.id : '',
      }
    })
  const roots = [
    ...(flowType === 'record' && startObject ? [{ value: '$record', label: 'Current Record', type: 'Record', children: true, objectId: startObject.id }, { value: '$previous', label: 'Previous Record', type: 'Record', children: true, objectId: startObject.id }] : []),
    { value: '$user.id', label: 'Current User ID', type: 'Global Variable' },
    { value: '$now', label: 'Current Date/Time', type: 'Global Variable' },
    ...priorRows,
    ...variableRows.map((resource) => ({ value: resourcePath(resource), label: resource.label || resource.apiName, type: resource.isCollection ? `${resource.dataType} Collection` : resource.dataType })),
  ]

  const rows = trail
    ? fields.map((field) => ({ value: `${trail.value}.${fieldKey(field)}`, label: fieldLabel(field), type: fieldType(field) }))
    : roots
  const filtered = rows.filter((row) => !query || `${row.label} ${row.value}`.toLowerCase().includes(query.toLowerCase()))
  const selected = roots.find((row) => row.value === value) || (value ? { label: value, value } : null)

  return <div className="gptb-gr-resource" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); setTrail(null) } }}>
    <button type="button" className="gptb-gr-resource-button" onClick={() => setOpen((current) => !current)}><span>{selected?.label || value || 'Select a resource...'}</span><ChevronDown size={13}/></button>
    {open ? <div className="gptb-gr-resource-menu">
      <header>{trail ? <button type="button" onClick={() => { setTrail(null); setQuery('') }}><ChevronLeft size={13}/></button> : null}<strong>{trail ? trail.label : 'Select a Resource'}</strong><button type="button" onClick={() => { setOpen(false); setTrail(null) }}><X size={13}/></button></header>
      <label><Search size={13}/><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search resources..."/></label>
      <div>{filtered.length ? filtered.map((row) => <button key={row.value} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => {
        if (row.children) { setTrail(row); setQuery(''); return }
        onChange(row.value); setOpen(false); setTrail(null)
      }}><Database size={13}/><span><b>{row.label}</b><small>{row.type}</small></span>{row.children ? <ChevronRight size={13}/> : null}</button>) : <span className="gptb-gr-empty">No matching resources</span>}</div>
      {allowNew ? <button type="button" className="gptb-gr-new-resource" onClick={() => { setOpen(false); onNewResource?.() }}><Plus size={13}/> New Resource</button> : null}
    </div> : null}
  </div>
}

function LiteralValue({ field, value, onChange }) {
  const type = fieldType(field)
  if (type === 'boolean') return <select value={String(value ?? false)} onChange={(event) => onChange(event.target.value === 'true')}><option value="false">False</option><option value="true">True</option></select>
  if (['number','decimal','currency'].includes(type)) return <input type="number" value={value ?? ''} onChange={(event) => onChange(event.target.value === '' ? '' : Number(event.target.value))}/>
  if (type === 'date') return <input type="date" value={value || ''} onChange={(event) => onChange(event.target.value)}/>
  if (type === 'datetime') return <input type="datetime-local" value={value || ''} onChange={(event) => onChange(event.target.value)}/>
  return <input value={value ?? ''} onChange={(event) => onChange(event.target.value)}/>
}

export default function GPTBuilderGetRecords({
  draft,
  updateConfig,
  objects,
  flowType,
  startConfig,
  elements,
  resources,
  onResourcesChange,
  onConfiguredChange,
}) {
  const config = normalizeGetRecordsConfig(draft.config)
  const [fields, setFields] = useState([])
  const [loadingFields, setLoadingFields] = useState(false)
  const [newResource, setNewResource] = useState(null)
  const [relatedOpen, setRelatedOpen] = useState(false)
  const selectedObject = objects.find((item) => objectKey(item) === config.objectKey)

  useEffect(() => {
    let live = true
    if (!selectedObject?.id) { setFields([]); return () => { live = false } }
    setLoadingFields(true)
    apiRequest(`/api/platform/objects/${encodeURIComponent(selectedObject.id)}/fields`).then((response) => {
      if (live) setFields((Array.isArray(response?.data) ? response.data : []).filter((field) => field?.active !== false && field?.readable !== false))
    }).catch(() => { if (live) setFields([]) }).finally(() => { if (live) setLoadingFields(false) })
    return () => { live = false }
  }, [selectedObject?.id])

  useEffect(() => {
    const errors = getRecordsConfigErrors(config)
    onConfiguredChange?.(errors.length === 0, errors)
  }, [JSON.stringify(config)])

  const patch = (changes) => updateConfig({ ...config, ...changes })
  const patchCondition = (id, changes) => patch({ conditions: config.conditions.map((row) => row.id === id ? { ...row, ...changes } : row) })
  const addCondition = () => patch({ conditions: [...config.conditions, { id: uid(), field: '', operator: 'equals', valueMode: 'literal', value: '' }] })
  const setObject = (object) => patch({ ...GET_RECORDS_DEFAULTS, objectKey: objectKey(object), objectLabel: objectLabel(object) })
  const errors = getRecordsConfigErrors(config)

  const storeResource = (resource) => {
    onResourcesChange?.([...resources, resource])
    if (newResource?.purpose === 'advancedTarget') patch({ advancedTarget: resourcePath(resource) })
    if (newResource?.purpose?.startsWith('assignment:')) {
      const id = newResource.purpose.split(':')[1]
      patch({ fieldAssignments: config.fieldAssignments.map((row) => row.id === id ? { ...row, resource: resourcePath(resource) } : row) })
    }
    setNewResource(null)
  }

  return <div className="gptb-gr">
    <section><h3>Get Records of This Object</h3><label><span>Object <b>*</b></span><ObjectPicker objects={objects} value={config.objectKey} onChange={setObject}/></label></section>

    <section><h3>Filter {config.objectLabel || 'Object'} Records</h3>
      <label><span>Condition Requirements</span><select value={config.conditionLogic} onChange={(event) => patch({ conditionLogic: event.target.value, customConditionLogic: event.target.value === 'custom' ? config.customConditionLogic : '' })}>
        <option value="all">All Conditions Are Met (AND)</option>
        <option value="any">Any Condition Is Met (OR)</option>
        <option value="custom">Custom Condition Logic Is Met</option>
        <option value="none">None — Get All Records</option>
      </select></label>
      {config.conditionLogic !== 'none' ? <div className="gptb-gr-conditions">
        {config.conditions.map((row, index) => {
          const metadata = fields.find((field) => fieldKey(field) === row.field)
          const operators = operatorsFor(metadata)
          return <div className="gptb-gr-condition" key={row.id}>
            <span className="gptb-gr-row-number">{index + 1}</span>
            <FieldPicker fields={fields} value={row.field} onChange={(field) => patchCondition(row.id, { field, operator: 'equals', value: '', valueMode: 'literal' })}/>
            <select value={row.operator || 'equals'} onChange={(event) => patchCondition(row.id, { operator: event.target.value, value: event.target.value === 'is_null' ? true : '', valueMode: ['in','not_in'].includes(event.target.value) ? 'resource' : row.valueMode })}>{operators.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
            {row.operator === 'is_null' ? <select value={String(row.value ?? true)} onChange={(event) => patchCondition(row.id, { value: event.target.value === 'true' })}><option value="true">True</option><option value="false">False</option></select> : <div className="gptb-gr-value">
              {!['in','not_in'].includes(row.operator) ? <button type="button" onClick={() => patchCondition(row.id, { valueMode: row.valueMode === 'resource' ? 'literal' : 'resource', value: '' })}>{row.valueMode === 'resource' ? 'Resource' : 'Value'}</button> : null}
              {row.valueMode === 'resource' || ['in','not_in'].includes(row.operator)
                ? <ResourcePicker value={row.value || ''} onChange={(value) => patchCondition(row.id, { value, valueMode: 'resource' })} {...{resources,flowType,startConfig,objects,elements}} expected={metadata ? resourceTypeForField(metadata) : null} collection={['in','not_in'].includes(row.operator) ? true : null}/>
                : <LiteralValue field={metadata} value={row.value} onChange={(value) => patchCondition(row.id, { value })}/>}
            </div>}
            <button type="button" className="gptb-gr-remove" aria-label={`Remove condition ${index + 1}`} onClick={() => patch({ conditions: config.conditions.filter((item) => item.id !== row.id) })}><Trash2 size={13}/></button>
          </div>
        })}
        <button type="button" className="gptb-inline-action" onClick={addCondition}><Plus size={13}/> Add Condition</button>
        {config.conditionLogic === 'custom' ? <label><span>Condition Logic <b>*</b></span><input value={config.customConditionLogic} onChange={(event) => patch({ customConditionLogic: event.target.value })} placeholder="Example: 1 AND (2 OR 3)"/></label> : null}
      </div> : null}
    </section>

    <section><h3>Sort {config.objectLabel || 'Object'} Records</h3>
      <label><span>Sort Order</span><select value={config.sortOrder} onChange={(event) => patch({ sortOrder: event.target.value, sortBy: event.target.value === 'none' ? '' : config.sortBy })}><option value="none">Not Sorted</option><option value="asc">Ascending</option><option value="desc">Descending</option></select></label>
      {config.sortOrder !== 'none' ? <label><span>Sort By <b>*</b></span><FieldPicker fields={fields} value={config.sortBy} onChange={(sortBy) => patch({ sortBy })}/></label> : null}
    </section>

    <section><h3>How Many Records to Store</h3>
      <label className="gptb-gr-radio"><input type="radio" name={`gr-limit-${draft.id}`} checked={config.recordLimit === 'first'} onChange={() => patch({ recordLimit: 'first', maxRecords: '', advancedMode: config.storeMode === 'advanced' ? config.advancedMode : 'record' })}/><span>Only the first record</span></label>
      <label className="gptb-gr-radio"><input type="radio" name={`gr-limit-${draft.id}`} checked={config.recordLimit === 'all'} onChange={() => patch({ recordLimit: 'all', maxRecords: '', advancedMode: config.storeMode === 'advanced' ? 'record' : config.advancedMode })}/><span>All records</span></label>
      <label className="gptb-gr-radio"><input type="radio" name={`gr-limit-${draft.id}`} checked={config.recordLimit === 'limited'} onChange={() => patch({ recordLimit: 'limited', advancedMode: config.storeMode === 'advanced' ? 'record' : config.advancedMode })}/><span>All records, up to a specified limit</span></label>
      {config.recordLimit === 'limited' ? <label><span>Maximum Number of Records to Store <b>*</b></span><div className="gptb-gr-value"><button type="button" onClick={() => patch({ maxRecordsMode: config.maxRecordsMode === 'resource' ? 'literal' : 'resource', maxRecords: '', maxRecordsResource: '' })}>{config.maxRecordsMode === 'resource' ? 'Resource' : 'Value'}</button>{config.maxRecordsMode === 'resource'
        ? <ResourcePicker value={config.maxRecordsResource || ''} onChange={(maxRecordsResource) => patch({ maxRecordsResource, maxRecordsMode: 'resource' })} resources={resources} flowType={flowType} startConfig={startConfig} objects={objects} elements={elements} expected="number" collection={false}/>
        : <input type="number" min="2" max="20000" value={config.maxRecords} onChange={(event) => patch({ maxRecords: event.target.value, maxRecordsMode: 'literal' })}/>}</div><small>Enter a value from 2 through 20,000, or select a Number resource.</small></label> : null}
    </section>

    <section><h3>How to Store Record Data</h3>
      <label className="gptb-gr-radio"><input type="radio" name={`gr-store-${draft.id}`} checked={config.storeMode === 'auto'} onChange={() => patch({ storeMode: 'auto', selectedFields: [], advancedTarget: '', fieldAssignments: [] })}/><span><b>Automatically store all fields</b><small>Make fields from the retrieved record or records available to later flow elements.</small></span></label>
      <label className="gptb-gr-radio"><input type="radio" name={`gr-store-${draft.id}`} checked={config.storeMode === 'choose'} onChange={() => patch({ storeMode: 'choose', advancedTarget: '', fieldAssignments: [] })}/><span><b>Choose fields and let OneEngine do the rest</b><small>Store only the fields that this flow needs.</small></span></label>
      <label className="gptb-gr-radio"><input type="radio" name={`gr-store-${draft.id}`} checked={config.storeMode === 'advanced'} onChange={() => patch({ storeMode: 'advanced', advancedMode: config.recordLimit === 'first' ? 'record' : 'record' })}/><span><b>Choose fields and assign variables (advanced)</b><small>Store the retrieved values in variables that you select.</small></span></label>

      {config.storeMode === 'choose' ? <div className="gptb-gr-field-list">
        <h4>Select {config.objectLabel || 'Object'} Fields to Store in Variable</h4>
        {config.selectedFields.map((field, index) => <div key={`${field}-${index}`}><FieldPicker fields={fields.filter((item) => !config.selectedFields.includes(fieldKey(item)) || fieldKey(item) === field)} value={field} onChange={(next) => patch({ selectedFields: config.selectedFields.map((item, itemIndex) => itemIndex === index ? next : item) })}/><button type="button" aria-label={`Remove stored field ${index + 1}`} onClick={() => patch({ selectedFields: config.selectedFields.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 size={13}/></button></div>)}
        <button type="button" className="gptb-inline-action" onClick={() => patch({ selectedFields: [...config.selectedFields, ''] })}><Plus size={13}/> Add Field</button>
      </div> : null}

      {config.storeMode === 'advanced' ? <div className="gptb-gr-advanced">
        {config.recordLimit === 'first' ? <label><span>How to Store Field Values</span><select value={config.advancedMode} onChange={(event) => patch({ advancedMode: event.target.value, advancedTarget: '', fieldAssignments: [] })}><option value="record">Together in a record variable</option><option value="fields">In separate variables</option></select></label> : <p>Multiple records are stored together in a record collection variable.</p>}
        {config.advancedMode === 'record' || config.recordLimit !== 'first' ? <>
          <label><span>{config.recordLimit === 'first' ? 'Record Variable' : 'Record Collection Variable'} <b>*</b></span><ResourcePicker value={config.advancedTarget} onChange={(advancedTarget) => patch({ advancedTarget })} resources={resources} flowType={flowType} startConfig={startConfig} objects={objects} elements={elements} expected="record" targetObject={config.objectKey} collection={config.recordLimit !== 'first'} allowNew onNewResource={() => setNewResource({ purpose: 'advancedTarget', objectKey: config.objectKey, collection: config.recordLimit !== 'first' })}/></label>
          <div className="gptb-gr-field-list"><h4>Select Fields to Store</h4>{config.selectedFields.map((field, index) => <div key={`adv-${index}`}><FieldPicker fields={fields.filter((item) => !config.selectedFields.includes(fieldKey(item)) || fieldKey(item) === field)} value={field} onChange={(next) => patch({ selectedFields: config.selectedFields.map((item, itemIndex) => itemIndex === index ? next : item) })}/><button type="button" aria-label={`Remove advanced field ${index + 1}`} onClick={() => patch({ selectedFields: config.selectedFields.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 size={13}/></button></div>)}<button type="button" className="gptb-inline-action" onClick={() => patch({ selectedFields: [...config.selectedFields, ''] })}><Plus size={13}/> Add Field</button></div>
        </> : <div className="gptb-gr-field-assignments">
          {config.fieldAssignments.map((row, index) => <div key={row.id}><span>{index + 1}</span><FieldPicker fields={fields} value={row.field} onChange={(field) => patch({ fieldAssignments: config.fieldAssignments.map((item) => item.id === row.id ? { ...item, field } : item) })}/><ResourcePicker value={row.resource} onChange={(resource) => patch({ fieldAssignments: config.fieldAssignments.map((item) => item.id === row.id ? { ...item, resource } : item) })} resources={resources} flowType={flowType} startConfig={startConfig} objects={objects} elements={elements} expected={resourceTypeForField(fields.find((field) => fieldKey(field) === row.field))} collection={false} allowNew onNewResource={() => setNewResource({ purpose: `assignment:${row.id}`, dataType: resourceTypeForField(fields.find((field) => fieldKey(field) === row.field)) })}/><button type="button" aria-label={`Remove assignment ${index + 1}`} onClick={() => patch({ fieldAssignments: config.fieldAssignments.filter((item) => item.id !== row.id) })}><Trash2 size={13}/></button></div>)}
          <button type="button" className="gptb-inline-action" onClick={() => patch({ fieldAssignments: [...config.fieldAssignments, { id: uid(), field: '', resource: '' }] })}><Plus size={13}/> Add Field Assignment</button>
        </div>}
        <label className="gptb-gr-check"><input type="checkbox" checked={config.setNullOnNoRecords === true} onChange={(event) => patch({ setNullOnNoRecords: event.target.checked })}/> When no records are returned, set specified variables to null</label>
      </div> : null}
    </section>


    {flowType === 'autolaunched' && config.objectKey ? <section className="gptb-gr-related-section"><h3>Related Records</h3><label className="gptb-gr-related-toggle"><input type="checkbox" checked={config.relatedEnabled === true} onChange={(event) => patch({ relatedEnabled: event.target.checked, relatedSelections: event.target.checked ? config.relatedSelections : [] })}/><span><b>Also add related records (beta)</b><small>Retrieve child collections related to the records returned by this Get Records element.</small></span></label>{config.relatedEnabled ? <><button type="button" className="gptb-button gptb-gr-related-button" onClick={() => setRelatedOpen(true)}>Select Related Records</button>{config.relatedSelections.length ? <div className="gptb-gr-related-summary">{config.relatedSelections.map((selection) => <span key={selection.id}>{selection.objectLabel || selection.objectKey}<small>{selection.relationshipKey}</small></span>)}</div> : null}</> : null}</section> : null}

    {loadingFields ? <div className="gptb-gr-loading">Loading object fields…</div> : null}
    {errors.length ? <div className="gptb-gr-errors"><b>Complete this Get Records element</b>{errors.map((error) => <span key={error}>{error}</span>)}</div> : null}
    {newResource ? <NewVariableDialog objectKey={newResource.objectKey || ''} collectionDefault={Boolean(newResource.collection)} initialDataType={newResource.dataType || ''} onCreate={storeResource} onClose={() => setNewResource(null)}/> : null}
    <GPTBuilderRelatedRecords open={relatedOpen} onClose={() => setRelatedOpen(false)} config={config} patchRoot={patch} objects={objects} rootFields={fields} resources={resources} elements={elements}/>
  </div>
}
