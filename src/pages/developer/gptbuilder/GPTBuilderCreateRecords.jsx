import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { apiRequest } from '../../../services/api'

const objectKey = (value) => String(value?.object_key || value?.api_name || value?.apiName || value?.key || value?.id || '')
const resourcePath = (resource) => resource?.path || (resource?.apiName ? resourcePath(resource) : '')
const objectLabel = (value) => value?.label || value?.name || objectKey(value)
const fieldKey = (value) => String(value?.api_name || value?.apiName || value?.field_key || value?.key || value?.id || '')
const fieldLabel = (value) => value?.label || value?.name || fieldKey(value)
const uid = () => globalThis.crypto?.randomUUID?.() || `cr-${Date.now()}-${Math.random().toString(36).slice(2)}`

export const CREATE_RECORDS_DEFAULTS = Object.freeze({
  valueMode: 'manual',
  howMany: 'one',
  objectKey: '',
  objectLabel: '',
  recordResource: '',
  recordCollectionResource: '',
  fieldValues: [],
  updateExisting: false,
  matchField: '',
  checkMatchingRecords: false,
  matchLogic: 'all',
  matchConditions: [],
  matchAction: 'skip',
})

export function normalizeCreateRecordsConfig(config = {}) {
  return {
    ...CREATE_RECORDS_DEFAULTS,
    ...config,
    fieldValues: Array.isArray(config.fieldValues) ? config.fieldValues : [],
    matchConditions: Array.isArray(config.matchConditions) ? config.matchConditions : [],
  }
}

export function createRecordsConfigErrors(config = {}) {
  const c = normalizeCreateRecordsConfig(config)
  const errors = []
  if (!c.objectKey) errors.push('Select an object.')
  if (c.valueMode === 'manual') {
    if (c.howMany !== 'one') errors.push('Manual field values can create only one record.')
    if (!c.fieldValues.some((row) => row.field && (row.value !== '' && row.value != null))) errors.push('Set at least one field value.')
  } else if (c.howMany === 'one' && !c.recordResource) errors.push('Select a record variable.')
  else if (c.howMany === 'multiple' && !c.recordCollectionResource) errors.push('Select a record collection variable.')
  if (c.updateExisting && !c.matchField) errors.push('Select the field that identifies existing records.')
  if (c.checkMatchingRecords) {
    if (!c.matchConditions.length) errors.push('Add at least one matching condition.')
    c.matchConditions.forEach((row, index) => {
      if (!row.field) errors.push(`Matching condition ${index + 1}: select a field.`)
      if (row.value === '' || row.value == null) errors.push(`Matching condition ${index + 1}: enter or select a value.`)
    })
  }
  return errors
}

const configuredValue = (row) => row.valueMode === 'resource' ? { path: row.value } : row.value

export function createRecordsRuntimeAction(instance) {
  const c = normalizeCreateRecordsConfig(instance?.config)
  const fieldValues = Object.fromEntries(c.fieldValues.filter((row) => row.field).map((row) => [row.field, configuredValue(row)]))
  return {
    id: instance.id,
    key: 'CREATE_RECORD',
    label: instance.label,
    apiName: instance.apiName,
    description: instance.description || '',
    objectKey: c.objectKey,
    createMode: c.valueMode,
    howMany: c.howMany,
    fieldValues: c.valueMode === 'manual' ? fieldValues : undefined,
    recordResource: c.valueMode === 'record_variable' && c.howMany === 'one' ? { path: c.recordResource } : undefined,
    recordCollectionResource: c.valueMode === 'record_variable' && c.howMany === 'multiple' ? { path: c.recordCollectionResource } : undefined,
    updateExisting: c.updateExisting === true,
    matchField: c.updateExisting ? c.matchField : undefined,
    checkMatchingRecords: c.checkMatchingRecords === true,
    match: c.matchLogic === 'any' ? 'any' : 'all',
    matchConditions: c.checkMatchingRecords ? c.matchConditions.map((row) => ({ field: row.field, value: configuredValue(row) })) : undefined,
    matchAction: c.checkMatchingRecords ? c.matchAction : undefined,
  }
}

function ResourceSelect({ resources, value, onChange, objectKey: targetObject, collection = false }) {
  const rows = resources.filter((resource) =>
    resource.dataType === 'record'
    && Boolean(resource.isCollection) === Boolean(collection)
    && (!targetObject || !resource.objectKey || resource.objectKey === targetObject)
  )
  return <select value={value || ''} onChange={(event) => onChange(event.target.value)}>
    <option value="">Select a {collection ? 'record collection' : 'record'} variable</option>
    {rows.map((resource) => <option key={resource.id || resource.apiName} value={resourcePath(resource)}>{resource.label || resource.apiName}</option>)}
  </select>
}

export default function GPTBuilderCreateRecords({ draft, updateConfig, objects, resources, onConfiguredChange }) {
  const config = normalizeCreateRecordsConfig(draft.config)
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

  const errors = useMemo(() => createRecordsConfigErrors(config), [JSON.stringify(config)])
  useEffect(() => { onConfiguredChange?.(errors.length === 0, errors) }, [JSON.stringify(errors)])

  const patch = (changes) => updateConfig({ ...config, ...changes })
  const resetForObject = (nextObjectKey) => {
    const object = objects.find((item) => objectKey(item) === nextObjectKey)
    patch({
      ...CREATE_RECORDS_DEFAULTS,
      objectKey: nextObjectKey,
      objectLabel: object ? objectLabel(object) : '',
      valueMode: config.valueMode,
      howMany: config.howMany,
    })
  }
  const patchRow = (name, id, changes) => patch({ [name]: config[name].map((row) => row.id === id ? { ...row, ...changes } : row) })

  return <div className="gptb-gr gptb-create-records">
    <section><h3>How to Set Record Field Values</h3>
      <label className="gptb-gr-radio"><input type="radio" name={`cr-mode-${draft.id}`} checked={config.valueMode === 'manual'} onChange={() => patch({ valueMode: 'manual', howMany: 'one', recordResource: '', recordCollectionResource: '' })}/><span><b>Manually</b><small>Select the object and set field values in this element.</small></span></label>
      <label className="gptb-gr-radio"><input type="radio" name={`cr-mode-${draft.id}`} checked={config.valueMode === 'record_variable'} onChange={() => patch({ valueMode: 'record_variable', fieldValues: [] })}/><span><b>From a Record Variable</b><small>Use values already stored in a record or record collection variable.</small></span></label>
    </section>

    <section><h3>How Many Records to Create</h3>
      <label className="gptb-gr-radio"><input type="radio" name={`cr-many-${draft.id}`} checked={config.howMany === 'one'} onChange={() => patch({ howMany: 'one', recordCollectionResource: '' })}/><span>One</span></label>
      <label className="gptb-gr-radio"><input type="radio" name={`cr-many-${draft.id}`} disabled={config.valueMode === 'manual'} checked={config.howMany === 'multiple'} onChange={() => patch({ howMany: 'multiple', recordResource: '' })}/><span>Multiple</span></label>
    </section>

    <section><h3>Record Data</h3>
      <label><span>Object <b>*</b></span><select value={config.objectKey} onChange={(event) => resetForObject(event.target.value)}><option value="">Select an object</option>{objects.map((object) => <option key={object.id || objectKey(object)} value={objectKey(object)}>{objectLabel(object)}</option>)}</select></label>
      {config.valueMode === 'record_variable' && config.howMany === 'one' ? <label><span>Record <b>*</b></span><ResourceSelect resources={resources} value={config.recordResource} onChange={(recordResource) => patch({ recordResource })} objectKey={config.objectKey}/></label> : null}
      {config.valueMode === 'record_variable' && config.howMany === 'multiple' ? <label><span>Record Collection <b>*</b></span><ResourceSelect resources={resources} value={config.recordCollectionResource} onChange={(recordCollectionResource) => patch({ recordCollectionResource })} objectKey={config.objectKey} collection/></label> : null}
      {config.valueMode === 'manual' ? <div className="gptb-gr-field-assignments"><h4>Set Field Values for the {config.objectLabel || 'Record'}</h4>{config.fieldValues.map((row,index) => <div key={row.id}><span>{index + 1}</span><select value={row.field || ''} onChange={(event) => patchRow('fieldValues', row.id, { field: event.target.value })}><option value="">Select a field</option>{fields.map((field) => <option key={fieldKey(field)} value={fieldKey(field)}>{fieldLabel(field)}</option>)}</select><div className="gptb-gr-value"><button type="button" onClick={() => patchRow('fieldValues', row.id, { valueMode: row.valueMode === 'resource' ? 'literal' : 'resource', value: '' })}>{row.valueMode === 'resource' ? 'Resource' : 'Value'}</button><input value={row.value ?? ''} placeholder={row.valueMode === 'resource' ? 'variables.resourceName' : 'Enter value'} onChange={(event) => patchRow('fieldValues', row.id, { value: event.target.value })}/></div><button type="button" aria-label={`Remove field value ${index + 1}`} onClick={() => patch({ fieldValues: config.fieldValues.filter((item) => item.id !== row.id) })}><Trash2 size={13}/></button></div>)}<button type="button" className="gptb-inline-action" onClick={() => patch({ fieldValues: [...config.fieldValues, { id: uid(), field: '', valueMode: 'literal', value: '' }] })}><Plus size={13}/> Add Field</button></div> : null}
    </section>

    {config.valueMode === 'record_variable' ? <section><h3>Update Existing Records</h3><label className="gptb-gr-check"><input type="checkbox" checked={config.updateExisting} onChange={(event) => patch({ updateExisting: event.target.checked, matchField: event.target.checked ? config.matchField : '' })}/> Update existing records when a matching record is found</label>{config.updateExisting ? <label><span>Field That Uniquely Identifies Existing Records <b>*</b></span><select value={config.matchField} onChange={(event) => patch({ matchField: event.target.value })}><option value="">Select a field</option>{fields.map((field) => <option key={fieldKey(field)} value={fieldKey(field)}>{fieldLabel(field)}</option>)}</select></label> : null}</section> : null}

    <section><h3>Check for Matching Records</h3>
      <label className="gptb-gr-check"><input type="checkbox" checked={config.checkMatchingRecords} onChange={(event) => patch({ checkMatchingRecords: event.target.checked, matchConditions: event.target.checked ? config.matchConditions : [] })}/> Check for records that match specified conditions</label>
      {config.checkMatchingRecords ? <>
        <label><span>Condition Requirements</span><select value={config.matchLogic} onChange={(event) => patch({ matchLogic: event.target.value })}><option value="all">All Conditions Are Met (AND)</option><option value="any">Any Condition Is Met (OR)</option></select></label>
        <div className="gptb-gr-field-assignments">{config.matchConditions.map((row,index) => <div key={row.id}><span>{index + 1}</span><select value={row.field || ''} onChange={(event) => patchRow('matchConditions', row.id, { field: event.target.value })}><option value="">Select a field</option>{fields.map((field) => <option key={fieldKey(field)} value={fieldKey(field)}>{fieldLabel(field)}</option>)}</select><div className="gptb-gr-value"><button type="button" onClick={() => patchRow('matchConditions', row.id, { valueMode: row.valueMode === 'resource' ? 'literal' : 'resource', value: '' })}>{row.valueMode === 'resource' ? 'Resource' : 'Value'}</button><input value={row.value ?? ''} onChange={(event) => patchRow('matchConditions', row.id, { value: event.target.value })}/></div><button type="button" aria-label={`Remove matching condition ${index + 1}`} onClick={() => patch({ matchConditions: config.matchConditions.filter((item) => item.id !== row.id) })}><Trash2 size={13}/></button></div>)}</div>
        <button type="button" className="gptb-inline-action" onClick={() => patch({ matchConditions: [...config.matchConditions, { id: uid(), field: '', valueMode: 'literal', value: '' }] })}><Plus size={13}/> Add Condition</button>
        <label><span>If a Matching Record Is Found</span><select value={config.matchAction} onChange={(event) => patch({ matchAction: event.target.value })}><option value="skip">Skip the matching record</option><option value="update">Update the matching record</option></select></label>
      </> : null}
    </section>

    {errors.length ? <div className="gptb-gr-errors"><b>Complete this Create Records element</b>{errors.map((error) => <span key={error}>{error}</span>)}</div> : null}
  </div>
}
