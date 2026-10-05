import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { apiRequest } from '../../../services/api'

const objectKey = (value) => String(value?.object_key || value?.api_name || value?.apiName || value?.key || value?.id || '')
const objectLabel = (value) => value?.label || value?.name || objectKey(value)
const fieldKey = (value) => String(value?.api_name || value?.apiName || value?.field_key || value?.key || value?.id || '')
const fieldLabel = (value) => value?.label || value?.name || fieldKey(value)
const uid = () => globalThis.crypto?.randomUUID?.() || `ur-${Date.now()}-${Math.random().toString(36).slice(2)}`

export const UPDATE_RECORDS_DEFAULTS = Object.freeze({
  findMode: 'resource',
  objectKey: '',
  objectLabel: '',
  recordResource: '',
  recordCollectionResource: '',
  resourceKind: 'record',
  conditionLogic: 'all',
  conditions: [],
  fieldValues: [],
})

export function normalizeUpdateRecordsConfig(config = {}) {
  return {
    ...UPDATE_RECORDS_DEFAULTS,
    ...config,
    conditions: Array.isArray(config.conditions) ? config.conditions : [],
    fieldValues: Array.isArray(config.fieldValues) ? config.fieldValues : [],
  }
}

export function updateRecordsConfigErrors(config = {}) {
  const c = normalizeUpdateRecordsConfig(config)
  const errors = []
  if (c.findMode === 'resource') {
    if (c.resourceKind === 'record' && !c.recordResource) errors.push('Select a record variable.')
    if (c.resourceKind === 'collection' && !c.recordCollectionResource) errors.push('Select a record collection variable.')
  } else {
    if (!c.objectKey) errors.push('Select an object.')
    if (c.conditionLogic !== 'none' && !c.conditions.length) errors.push('Add at least one filter condition or choose None.')
    c.conditions.forEach((row,index) => {
      if (!row.field) errors.push(`Condition ${index + 1}: select a field.`)
      if (row.value === '' || row.value == null) errors.push(`Condition ${index + 1}: enter or select a value.`)
    })
    if (!c.fieldValues.some((row) => row.field && row.value !== '' && row.value != null)) errors.push('Set at least one field value.')
  }
  return errors
}

const configuredValue = (row) => row.valueMode === 'resource' ? { path: row.value } : row.value
const resourcePath = (resource) => resource?.path || (resource?.apiName ? `variables.${resource.apiName}` : '')

export function updateRecordsRuntimeAction(instance) {
  const c = normalizeUpdateRecordsConfig(instance?.config)
  return {
    id: instance.id,
    key: 'UPDATE_RECORD',
    label: instance.label,
    apiName: instance.apiName,
    description: instance.description || '',
    updateMode: c.findMode,
    objectKey: c.objectKey || undefined,
    recordResource: c.findMode === 'resource' && c.resourceKind === 'record' ? { path: c.recordResource } : undefined,
    recordCollectionResource: c.findMode === 'resource' && c.resourceKind === 'collection' ? { path: c.recordCollectionResource } : undefined,
    match: c.conditionLogic === 'any' ? 'any' : 'all',
    conditions: c.findMode === 'conditions' && c.conditionLogic !== 'none'
      ? c.conditions.map((row) => ({ field: row.field, operator: row.operator || 'equals', value: configuredValue(row) }))
      : [],
    fieldValues: c.findMode === 'conditions'
      ? Object.fromEntries(c.fieldValues.filter((row) => row.field).map((row) => [row.field, configuredValue(row)]))
      : undefined,
  }
}

function ResourceSelect({ resources, value, onChange, collection = false, flowType, startConfig }) {
  const rows = resources.filter((resource) => resource.dataType === 'record' && Boolean(resource.isCollection) === Boolean(collection))
  return <select value={value || ''} onChange={(event) => onChange(event.target.value)}>
    <option value="">{collection ? 'Select a record collection variable' : 'Select a record variable'}</option>
    {!collection && flowType === 'record' && startConfig?.objectKey ? <option value="$record">Current Record ($Record)</option> : null}
    {!collection && flowType === 'schedule' && startConfig?.objectKey ? <option value="$record">Current Scheduled Record ($Record)</option> : null}
    {rows.map((resource) => <option key={resource.id || resource.apiName} value={resourcePath(resource)}>{resource.label || resource.apiName}</option>)}
  </select>
}

export default function GPTBuilderUpdateRecords({ draft, updateConfig, objects, resources, flowType, startConfig, onConfiguredChange }) {
  const config = normalizeUpdateRecordsConfig(draft.config)
  const [fields, setFields] = useState([])
  const selectedObject = objects.find((item) => objectKey(item) === config.objectKey)

  useEffect(() => {
    let live = true
    if (!selectedObject?.id) { setFields([]); return () => { live = false } }
    apiRequest(`/api/platform/objects/${encodeURIComponent(selectedObject.id)}/fields`)
      .then((response) => {
        if (!live) return
        setFields((Array.isArray(response?.data) ? response.data : []).filter((field) => field?.active !== false && field?.writable !== false))
      })
      .catch(() => { if (live) setFields([]) })
    return () => { live = false }
  }, [selectedObject?.id])

  const errors = useMemo(() => updateRecordsConfigErrors(config), [JSON.stringify(config)])
  useEffect(() => { onConfiguredChange?.(errors.length === 0, errors) }, [JSON.stringify(errors)])
  const patch = (changes) => updateConfig({ ...config, ...changes })
  const patchRow = (name,id,changes) => patch({ [name]: config[name].map((row) => row.id === id ? { ...row, ...changes } : row) })
  const setObject = (nextObjectKey) => {
    const object = objects.find((item) => objectKey(item) === nextObjectKey)
    patch({ ...UPDATE_RECORDS_DEFAULTS, findMode: 'conditions', objectKey: nextObjectKey, objectLabel: object ? objectLabel(object) : '' })
  }

  return <div className="gptb-gr gptb-update-records">
    <section><h3>How to Find Records to Update and Set Their Values</h3>
      <label className="gptb-gr-radio"><input type="radio" name={`ur-mode-${draft.id}`} checked={config.findMode === 'resource'} onChange={() => patch({ findMode: 'resource', objectKey: '', objectLabel: '', conditions: [], fieldValues: [] })}/><span><b>Use the IDs and all field values from a record or record collection</b><small>Choose a record resource whose ID identifies each record to update.</small></span></label>
      <label className="gptb-gr-radio"><input type="radio" name={`ur-mode-${draft.id}`} checked={config.findMode === 'conditions'} onChange={() => patch({ findMode: 'conditions', recordResource: '', recordCollectionResource: '' })}/><span><b>Specify conditions to identify records, and set fields individually</b><small>Find records by criteria and set the values in this element.</small></span></label>
    </section>

    {config.findMode === 'resource' ? <section><h3>Record or Record Collection</h3>
      <label className="gptb-gr-radio"><input type="radio" name={`ur-kind-${draft.id}`} checked={config.resourceKind === 'record'} onChange={() => patch({ resourceKind: 'record', recordCollectionResource: '' })}/><span>Record</span></label>
      <label className="gptb-gr-radio"><input type="radio" name={`ur-kind-${draft.id}`} checked={config.resourceKind === 'collection'} onChange={() => patch({ resourceKind: 'collection', recordResource: '' })}/><span>Record Collection</span></label>
      {config.resourceKind === 'record' ? <label><span>Record <b>*</b></span><ResourceSelect resources={resources} value={config.recordResource} onChange={(recordResource) => patch({ recordResource })} flowType={flowType} startConfig={startConfig}/></label> : <label><span>Record Collection <b>*</b></span><ResourceSelect resources={resources} value={config.recordCollectionResource} onChange={(recordCollectionResource) => patch({ recordCollectionResource })} collection flowType={flowType} startConfig={startConfig}/></label>}
    </section> : <>
      <section><h3>Object</h3><label><span>Object <b>*</b></span><select value={config.objectKey} onChange={(event) => setObject(event.target.value)}><option value="">Select an object</option>{objects.map((object) => <option key={object.id || objectKey(object)} value={objectKey(object)}>{objectLabel(object)}</option>)}</select></label></section>
      <section><h3>Filter {config.objectLabel || 'Object'} Records</h3><label><span>Condition Requirements</span><select value={config.conditionLogic} onChange={(event) => patch({ conditionLogic: event.target.value })}><option value="all">All Conditions Are Met (AND)</option><option value="any">Any Condition Is Met (OR)</option><option value="none">None — Update All Records</option></select></label>
        {config.conditionLogic !== 'none' ? <div className="gptb-gr-field-assignments">{config.conditions.map((row,index) => <div key={row.id}><span>{index + 1}</span><select value={row.field || ''} onChange={(event) => patchRow('conditions',row.id,{field:event.target.value})}><option value="">Select a field</option>{fields.map((field) => <option key={fieldKey(field)} value={fieldKey(field)}>{fieldLabel(field)}</option>)}</select><select value={row.operator || 'equals'} onChange={(event) => patchRow('conditions',row.id,{operator:event.target.value})}><option value="equals">Equals</option><option value="not_equals">Does Not Equal</option><option value="greater_than">Greater Than</option><option value="less_than">Less Than</option></select><div className="gptb-gr-value"><button type="button" onClick={() => patchRow('conditions',row.id,{valueMode:row.valueMode === 'resource' ? 'literal' : 'resource',value:''})}>{row.valueMode === 'resource' ? 'Resource' : 'Value'}</button><input value={row.value ?? ''} onChange={(event) => patchRow('conditions',row.id,{value:event.target.value})}/></div><button type="button" aria-label={`Remove condition ${index + 1}`} onClick={() => patch({ conditions: config.conditions.filter((item) => item.id !== row.id) })}><Trash2 size={13}/></button></div>)}<button type="button" className="gptb-inline-action" onClick={() => patch({ conditions: [...config.conditions,{id:uid(),field:'',operator:'equals',valueMode:'literal',value:''}] })}><Plus size={13}/> Add Condition</button></div> : null}
      </section>
      <section><h3>Set Field Values for the {config.objectLabel || 'Records'}</h3><div className="gptb-gr-field-assignments">{config.fieldValues.map((row,index) => <div key={row.id}><span>{index + 1}</span><select value={row.field || ''} onChange={(event) => patchRow('fieldValues',row.id,{field:event.target.value})}><option value="">Select a field</option>{fields.map((field) => <option key={fieldKey(field)} value={fieldKey(field)}>{fieldLabel(field)}</option>)}</select><div className="gptb-gr-value"><button type="button" onClick={() => patchRow('fieldValues',row.id,{valueMode:row.valueMode === 'resource' ? 'literal' : 'resource',value:''})}>{row.valueMode === 'resource' ? 'Resource' : 'Value'}</button><input value={row.value ?? ''} onChange={(event) => patchRow('fieldValues',row.id,{value:event.target.value})}/></div><button type="button" aria-label={`Remove field value ${index + 1}`} onClick={() => patch({ fieldValues: config.fieldValues.filter((item) => item.id !== row.id) })}><Trash2 size={13}/></button></div>)}</div><button type="button" className="gptb-inline-action" onClick={() => patch({ fieldValues: [...config.fieldValues,{id:uid(),field:'',valueMode:'literal',value:''}] })}><Plus size={13}/> Add Field</button></section>
    </>}

    {errors.length ? <div className="gptb-gr-errors"><b>Complete this Update Records element</b>{errors.map((error) => <span key={error}>{error}</span>)}</div> : null}
  </div>
}
