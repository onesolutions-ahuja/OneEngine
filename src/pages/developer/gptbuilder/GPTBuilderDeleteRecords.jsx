import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { apiRequest } from '../../../services/api'

const objectKey = (value) => String(value?.object_key || value?.api_name || value?.apiName || value?.key || value?.id || '')
const objectLabel = (value) => value?.label || value?.name || objectKey(value)
const fieldKey = (value) => String(value?.api_name || value?.apiName || value?.field_key || value?.key || value?.id || '')
const fieldLabel = (value) => value?.label || value?.name || fieldKey(value)
const uid = () => globalThis.crypto?.randomUUID?.() || `dr-${Date.now()}-${Math.random().toString(36).slice(2)}`

export const DELETE_RECORDS_DEFAULTS = Object.freeze({
  findMode: 'resource',
  resourceKind: 'record',
  recordResource: '',
  recordCollectionResource: '',
  objectKey: '',
  objectLabel: '',
  conditionLogic: 'all',
  conditions: [],
})

export function normalizeDeleteRecordsConfig(config = {}) {
  return {
    ...DELETE_RECORDS_DEFAULTS,
    ...config,
    conditions: Array.isArray(config.conditions) ? config.conditions : [],
  }
}

export function deleteRecordsConfigErrors(config = {}) {
  const c = normalizeDeleteRecordsConfig(config)
  const errors = []
  if (c.findMode === 'resource') {
    if (c.resourceKind === 'record' && !c.recordResource) errors.push('Select a record variable.')
    if (c.resourceKind === 'collection' && !c.recordCollectionResource) errors.push('Select a record collection variable.')
  } else {
    if (!c.objectKey) errors.push('Select an object.')
    if (!c.conditions.length) errors.push('Add at least one filter condition.')
    c.conditions.forEach((row,index) => {
      if (!row.field) errors.push(`Condition ${index + 1}: select a field.`)
      if (row.value === '' || row.value == null) errors.push(`Condition ${index + 1}: enter or select a value.`)
    })
  }
  return errors
}

const configuredValue = (row) => row.valueMode === 'resource' ? { path: row.value } : row.value

export function deleteRecordsRuntimeAction(instance) {
  const c = normalizeDeleteRecordsConfig(instance?.config)
  return {
    id: instance.id,
    key: 'DELETE_RECORD',
    label: instance.label,
    apiName: instance.apiName,
    description: instance.description || '',
    deleteMode: c.findMode,
    objectKey: c.objectKey || undefined,
    recordResource: c.findMode === 'resource' && c.resourceKind === 'record' ? { path: c.recordResource } : undefined,
    recordCollectionResource: c.findMode === 'resource' && c.resourceKind === 'collection' ? { path: c.recordCollectionResource } : undefined,
    match: c.conditionLogic === 'any' ? 'any' : 'all',
    conditions: c.findMode === 'conditions'
      ? c.conditions.map((row) => ({ field: row.field, operator: row.operator || 'equals', value: configuredValue(row) }))
      : undefined,
  }
}

function ResourceSelect({ resources, value, onChange, collection = false, flowType, startConfig }) {
  const rows = resources.filter((resource) => resource.dataType === 'record' && Boolean(resource.isCollection) === Boolean(collection))
  return <select value={value || ''} onChange={(event) => onChange(event.target.value)}>
    <option value="">{collection ? 'Select a record collection variable' : 'Select a record variable'}</option>
    {!collection && flowType === 'record' && startConfig?.objectKey ? <option value="$record">Current Record ($Record)</option> : null}
    {!collection && flowType === 'schedule' && startConfig?.objectKey ? <option value="$record">Current Scheduled Record ($Record)</option> : null}
    {rows.map((resource) => <option key={resource.id || resource.apiName} value={`variables.${resource.apiName}`}>{resource.label || resource.apiName}</option>)}
  </select>
}

export default function GPTBuilderDeleteRecords({ draft, updateConfig, objects, resources, flowType, startConfig, onConfiguredChange }) {
  const config = normalizeDeleteRecordsConfig(draft.config)
  const [fields, setFields] = useState([])
  const selectedObject = objects.find((item) => objectKey(item) === config.objectKey)

  useEffect(() => {
    let live = true
    if (!selectedObject?.id) { setFields([]); return () => { live = false } }
    apiRequest(`/api/platform/objects/${encodeURIComponent(selectedObject.id)}/fields`)
      .then((response) => {
        if (!live) return
        setFields((Array.isArray(response?.data) ? response.data : []).filter((field) => field?.active !== false && field?.readable !== false))
      })
      .catch(() => { if (live) setFields([]) })
    return () => { live = false }
  }, [selectedObject?.id])

  const errors = useMemo(() => deleteRecordsConfigErrors(config), [JSON.stringify(config)])
  useEffect(() => { onConfiguredChange?.(errors.length === 0, errors) }, [JSON.stringify(errors)])
  const patch = (changes) => updateConfig({ ...config, ...changes })
  const patchCondition = (id, changes) => patch({ conditions: config.conditions.map((row) => row.id === id ? { ...row, ...changes } : row) })
  const setObject = (nextObjectKey) => {
    const object = objects.find((item) => objectKey(item) === nextObjectKey)
    patch({ ...DELETE_RECORDS_DEFAULTS, findMode: 'conditions', objectKey: nextObjectKey, objectLabel: object ? objectLabel(object) : '' })
  }

  return <div className="gptb-gr gptb-delete-records">
    <section><h3>How to Find Records to Delete</h3>
      <label className="gptb-gr-radio"><input type="radio" name={`dr-mode-${draft.id}`} checked={config.findMode === 'resource'} onChange={() => patch({ findMode: 'resource', objectKey: '', objectLabel: '', conditions: [] })}/><span><b>Use the IDs stored in a record variable or record collection variable</b><small>Delete the records identified by the IDs in the selected resource.</small></span></label>
      <label className="gptb-gr-radio"><input type="radio" name={`dr-mode-${draft.id}`} checked={config.findMode === 'conditions'} onChange={() => patch({ findMode: 'conditions', recordResource: '', recordCollectionResource: '' })}/><span><b>Specify conditions</b><small>Choose an object and filter the records to delete.</small></span></label>
    </section>

    {config.findMode === 'resource' ? <section><h3>Record or Record Collection</h3>
      <label className="gptb-gr-radio"><input type="radio" name={`dr-kind-${draft.id}`} checked={config.resourceKind === 'record'} onChange={() => patch({ resourceKind: 'record', recordCollectionResource: '' })}/><span>Record</span></label>
      <label className="gptb-gr-radio"><input type="radio" name={`dr-kind-${draft.id}`} checked={config.resourceKind === 'collection'} onChange={() => patch({ resourceKind: 'collection', recordResource: '' })}/><span>Record Collection</span></label>
      {config.resourceKind === 'record' ? <label><span>Record <b>*</b></span><ResourceSelect resources={resources} value={config.recordResource} onChange={(recordResource) => patch({ recordResource })} flowType={flowType} startConfig={startConfig}/></label> : <label><span>Record Collection <b>*</b></span><ResourceSelect resources={resources} value={config.recordCollectionResource} onChange={(recordCollectionResource) => patch({ recordCollectionResource })} collection flowType={flowType} startConfig={startConfig}/></label>}
    </section> : <>
      <section><h3>Delete Records of This Object Type</h3><label><span>Object <b>*</b></span><select value={config.objectKey} onChange={(event) => setObject(event.target.value)}><option value="">Select an object</option>{objects.map((object) => <option key={object.id || objectKey(object)} value={objectKey(object)}>{objectLabel(object)}</option>)}</select></label></section>
      <section><h3>Filter {config.objectLabel || 'Object'} Records</h3><label><span>Condition Requirements</span><select value={config.conditionLogic} onChange={(event) => patch({ conditionLogic: event.target.value })}><option value="all">All Conditions Are Met (AND)</option><option value="any">Any Condition Is Met (OR)</option></select></label>
        <div className="gptb-gr-field-assignments">{config.conditions.map((row,index) => <div key={row.id}><span>{index + 1}</span><select value={row.field || ''} onChange={(event) => patchCondition(row.id,{field:event.target.value})}><option value="">Select a field</option>{fields.map((field) => <option key={fieldKey(field)} value={fieldKey(field)}>{fieldLabel(field)}</option>)}</select><select value={row.operator || 'equals'} onChange={(event) => patchCondition(row.id,{operator:event.target.value})}><option value="equals">Equals</option><option value="not_equals">Does Not Equal</option><option value="greater_than">Greater Than</option><option value="greater_than_or_equal">Greater Than or Equal</option><option value="less_than">Less Than</option><option value="less_than_or_equal">Less Than or Equal</option><option value="contains">Contains</option><option value="starts_with">Starts With</option><option value="ends_with">Ends With</option></select><div className="gptb-gr-value"><button type="button" onClick={() => patchCondition(row.id,{valueMode:row.valueMode === 'resource' ? 'literal' : 'resource',value:''})}>{row.valueMode === 'resource' ? 'Resource' : 'Value'}</button><input value={row.value ?? ''} onChange={(event) => patchCondition(row.id,{value:event.target.value})}/></div><button type="button" aria-label={`Remove condition ${index + 1}`} onClick={() => patch({ conditions: config.conditions.filter((item) => item.id !== row.id) })}><Trash2 size={13}/></button></div>}</div>
        <button type="button" className="gptb-inline-action" onClick={() => patch({ conditions: [...config.conditions,{id:uid(),field:'',operator:'equals',valueMode:'literal',value:''}] })}><Plus size={13}/> Add Condition</button>
      </section>
    </>}

    {errors.length ? <div className="gptb-gr-errors"><b>Complete this Delete Records element</b>{errors.map((error) => <span key={error}>{error}</span>)}</div> : null}
  </div>
}
