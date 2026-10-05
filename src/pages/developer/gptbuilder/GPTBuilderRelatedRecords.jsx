import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, Database, Plus, Search, Trash2, X } from 'lucide-react'
import { apiRequest } from '../../../services/api'

const objectKey = (value) => String(value?.object_key || value?.api_name || value?.apiName || value?.key || value?.id || '')
const resourcePath = (resource) => resource?.path || (resource?.apiName ? resourcePath(resource) : '')
const objectLabel = (value) => value?.label || value?.name || objectKey(value)
const fieldKey = (value) => String(value?.api_name || value?.apiName || value?.field_key || value?.key || value?.id || '')
const fieldLabel = (value) => value?.label || value?.name || fieldKey(value)
const fieldType = (value) => String(value?.field_type || value?.data_type || value?.type || 'text').toLowerCase()
const uid = () => globalThis.crypto?.randomUUID?.() || `related-${Date.now()}-${Math.random().toString(36).slice(2)}`

export const relatedDefaults = () => ({
  id: uid(),
  relationshipId: '',
  relationshipKey: '',
  objectKey: '',
  objectLabel: '',
  selectedFields: [],
  storeMode: 'auto',
  conditionLogic: 'none',
  customConditionLogic: '',
  conditions: [],
  sortOrder: 'none',
  sortBy: '',
  recordLimit: 'all',
  maxRecords: '',
})

export function relatedSelectionErrors(selection = {}) {
  const errors = []
  if (!selection.relationshipKey || !selection.objectKey) errors.push('Select a related object.')
  if (selection.storeMode === 'choose' && !(selection.selectedFields || []).length) errors.push('Select at least one field to store.')
  if (selection.conditionLogic !== 'none') {
    if (!(selection.conditions || []).length) errors.push('Add at least one filter condition or choose None.')
    ;(selection.conditions || []).forEach((row, index) => {
      if (!row.field) errors.push(`Condition ${index + 1}: select a field.`)
      if (!row.operator) errors.push(`Condition ${index + 1}: select an operator.`)
      if (row.operator !== 'is_null' && (row.value === '' || row.value == null)) errors.push(`Condition ${index + 1}: enter or select a value.`)
      if (['in','not_in'].includes(row.operator) && row.valueMode !== 'resource') errors.push(`Condition ${index + 1}: In and Not In require a collection resource.`)
    })
  }
  if (selection.conditionLogic === 'custom' && !String(selection.customConditionLogic || '').trim()) errors.push('Enter custom condition logic.')
  if (selection.sortOrder !== 'none' && !selection.sortBy) errors.push('Select a field to sort by.')
  if (selection.recordLimit === 'limited') {
    const n = Number(selection.maxRecords)
    if (!Number.isInteger(n) || n < 1 || n > 20000) errors.push('Maximum records must be a whole number from 1 to 20,000.')
  }
  return errors
}

export function relatedRuntimeConfig(selection = {}) {
  return {
    relationshipId: selection.relationshipId || undefined,
    relationshipKey: selection.relationshipKey,
    objectKey: selection.objectKey,
    filters: selection.conditionLogic === 'none' ? [] : (selection.conditions || []).map((row) => ({
      field: row.field,
      operator: row.operator,
      value: row.operator === 'is_null'
        ? Boolean(row.value)
        : row.valueMode === 'resource'
          ? { path: row.value }
          : row.value,
    })),
    match: selection.conditionLogic === 'any' ? 'any' : 'all',
    customConditionLogic: selection.conditionLogic === 'custom' ? selection.customConditionLogic : undefined,
    sortField: selection.sortOrder === 'none' ? undefined : selection.sortBy,
    sortDirection: selection.sortOrder === 'none' ? undefined : selection.sortOrder,
    limit: selection.recordLimit === 'first' ? 1 : selection.recordLimit === 'limited' ? Number(selection.maxRecords) : 20000,
    fieldSelection: selection.storeMode,
    selectedFields: selection.storeMode === 'choose' ? selection.selectedFields : undefined,
  }
}

function operatorsFor(field) {
  const type = fieldType(field)
  const base = [['equals','Equals'],['not_equals','Does Not Equal'],['is_null','Is Null']]
  const comparison = ['number','decimal','currency','date','datetime','time'].includes(type)
    ? [['greater_than','Greater Than'],['greater_than_or_equal','Greater Than or Equal'],['less_than','Less Than'],['less_than_or_equal','Less Than or Equal']]
    : []
  const text = ['text','email','phone','select','multiselect'].includes(type)
    ? [['contains','Contains'],['starts_with','Starts With'],['ends_with','Ends With']]
    : []
  const membership = ['select','multiselect'].includes(type) ? [] : [['in','In'],['not_in','Not In']]
  return [...base, ...comparison, ...text, ...membership]
}

function LiteralValue({ field, value, onChange }) {
  const type = fieldType(field)
  if (type === 'boolean') return <select value={String(value ?? false)} onChange={(event) => onChange(event.target.value === 'true')}><option value="false">False</option><option value="true">True</option></select>
  if (['number','decimal','currency'].includes(type)) return <input type="number" value={value ?? ''} onChange={(event) => onChange(event.target.value === '' ? '' : Number(event.target.value))}/>
  if (type === 'date') return <input type="date" value={value || ''} onChange={(event) => onChange(event.target.value)}/>
  if (type === 'datetime') return <input type="datetime-local" value={value || ''} onChange={(event) => onChange(event.target.value)}/>
  return <input value={value ?? ''} onChange={(event) => onChange(event.target.value)}/>
}

function CompactResourcePicker({ value, onChange, resources, elements, collection = false }) {
  const options = useMemo(() => {
    const variableRows = (resources || [])
      .filter((resource) => collection ? resource.isCollection === true : true)
      .map((resource) => ({ value: resourcePath(resource), label: resource.label || resource.apiName }))
    const stepRows = (elements || [])
      .filter((element) => element.configured && element.key === 'get_records')
      .map((element) => ({
        value: `steps.${element.apiName}.${element.config?.recordLimit === 'first' ? 'record' : 'records'}`,
        label: element.label,
      }))
    return [{ value: '$now', label: 'Current Date/Time' }, { value: '$user.id', label: 'Current User ID' }, ...stepRows, ...variableRows]
  }, [resources, elements, collection])
  return <select value={value || ''} onChange={(event) => onChange(event.target.value)}>
    <option value="">Select a resource...</option>
    {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
  </select>
}

function FieldChecklist({ fields, selectedFields, auto, onChange }) {
  return <div className="gptb-related-fields">
    {auto ? <p>All readable fields are included. Clear “Automatically store all fields” on Filter, Sort, Store to choose specific fields.</p> : null}
    {fields.map((field) => {
      const key = fieldKey(field)
      const checked = auto || selectedFields.includes(key)
      return <label key={key}><input type="checkbox" checked={checked} disabled={auto} onChange={(event) => onChange(event.target.checked ? [...selectedFields, key] : selectedFields.filter((item) => item !== key))}/><span><b>{fieldLabel(field)}</b><small>{key} · {fieldType(field)}</small></span></label>
    })}
  </div>
}

function FiltersEditor({ selection, fields, patch, resources, elements }) {
  const rows = selection.conditions || []
  const update = (id, changes) => patch({ conditions: rows.map((row) => row.id === id ? { ...row, ...changes } : row) })
  return <>
    <label><span>Condition Requirements</span><select value={selection.conditionLogic || 'none'} onChange={(event) => patch({ conditionLogic: event.target.value, customConditionLogic: event.target.value === 'custom' ? selection.customConditionLogic : '' })}>
      <option value="all">All Conditions Are Met (AND)</option>
      <option value="any">Any Condition Is Met (OR)</option>
      <option value="custom">Custom Condition Logic Is Met</option>
      <option value="none">None — Get All Related Records</option>
    </select></label>
    {selection.conditionLogic !== 'none' ? <div className="gptb-related-conditions">
      {rows.map((row, index) => {
        const metadata = fields.find((field) => fieldKey(field) === row.field)
        return <div className="gptb-related-condition" key={row.id}>
          <span>{index + 1}</span>
          <select value={row.field || ''} onChange={(event) => update(row.id, { field: event.target.value, operator: 'equals', valueMode: 'literal', value: '' })}><option value="">Select a field</option>{fields.map((field) => <option key={fieldKey(field)} value={fieldKey(field)}>{fieldLabel(field)}</option>)}</select>
          <select value={row.operator || 'equals'} onChange={(event) => update(row.id, { operator: event.target.value, valueMode: ['in','not_in'].includes(event.target.value) ? 'resource' : row.valueMode, value: event.target.value === 'is_null' ? true : '' })}>{operatorsFor(metadata).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
          {row.operator === 'is_null' ? <select value={String(row.value ?? true)} onChange={(event) => update(row.id, { value: event.target.value === 'true' })}><option value="true">True</option><option value="false">False</option></select> : <div className="gptb-related-value">
            {!['in','not_in'].includes(row.operator) ? <button type="button" onClick={() => update(row.id, { valueMode: row.valueMode === 'resource' ? 'literal' : 'resource', value: '' })}>{row.valueMode === 'resource' ? 'Resource' : 'Value'}</button> : null}
            {row.valueMode === 'resource' || ['in','not_in'].includes(row.operator)
              ? <CompactResourcePicker value={row.value} onChange={(value) => update(row.id, { value, valueMode: 'resource' })} resources={resources} elements={elements} collection={['in','not_in'].includes(row.operator)}/>
              : <LiteralValue field={metadata} value={row.value} onChange={(value) => update(row.id, { value })}/>}
          </div>}
          <button type="button" aria-label={`Remove related condition ${index + 1}`} onClick={() => patch({ conditions: rows.filter((item) => item.id !== row.id) })}><Trash2 size={13}/></button>
        </div>
      })}
      <button type="button" className="gptb-inline-action" onClick={() => patch({ conditions: [...rows, { id: uid(), field: '', operator: 'equals', valueMode: 'literal', value: '' }] })}><Plus size={13}/> Add Condition</button>
      {selection.conditionLogic === 'custom' ? <label><span>Condition Logic <b>*</b></span><input value={selection.customConditionLogic || ''} onChange={(event) => patch({ customConditionLogic: event.target.value })} placeholder="Example: 1 AND (2 OR 3)"/></label> : null}
    </div> : null}
  </>
}

function RelatedObjectEditor({ selection, fields, patch, resources, elements, tab, setTab, root = false, rootConfig, patchRoot }) {
  const activeSelection = root ? rootConfig : selection
  const errors = root ? [] : relatedSelectionErrors(selection)
  const storeMode = root ? rootConfig.storeMode : selection.storeMode
  const selectedFields = root ? rootConfig.selectedFields : selection.selectedFields
  const fieldPatch = (selected) => root ? patchRoot({ selectedFields: selected, storeMode: 'choose' }) : patch({ selectedFields: selected })
  const edit = root ? patchRoot : patch

  if (tab === 'preview') return <div className="gptb-related-preview">
    <h4>Data Structure Preview</h4>
    <div className="gptb-related-preview-node"><Database size={15}/><span><b>{root ? rootConfig.objectLabel || rootConfig.objectKey : selection.objectLabel || selection.objectKey}</b><small>{root ? 'Object / collection returned by Get Records' : 'Related record collection'}</small></span></div>
    <ul>{storeMode === 'auto' ? fields.map((field) => <li key={fieldKey(field)}>{fieldLabel(field)} <small>{fieldKey(field)}</small></li>) : selectedFields.map((key) => <li key={key}>{fieldLabel(fields.find((field) => fieldKey(field) === key)) || key} <small>{key}</small></li>)}</ul>
    {!root ? <p>Runtime path: <code>{'{!Get_Records.' + selection.relationshipKey + '}'}</code></p> : null}
  </div>

  if (tab === 'fields') return <FieldChecklist fields={fields} selectedFields={selectedFields || []} auto={storeMode === 'auto'} onChange={fieldPatch}/>

  return <div className="gptb-related-filter-store">
    <FiltersEditor selection={activeSelection} fields={fields} patch={edit} resources={resources} elements={elements}/>
    <label><span>Sort Order</span><select value={activeSelection.sortOrder || 'none'} onChange={(event) => edit({ sortOrder: event.target.value, sortBy: event.target.value === 'none' ? '' : activeSelection.sortBy })}><option value="none">Not Sorted</option><option value="asc">Ascending</option><option value="desc">Descending</option></select></label>
    {activeSelection.sortOrder !== 'none' ? <label><span>Sort By <b>*</b></span><select value={activeSelection.sortBy || ''} onChange={(event) => edit({ sortBy: event.target.value })}><option value="">Select a field</option>{fields.map((field) => <option key={fieldKey(field)} value={fieldKey(field)}>{fieldLabel(field)}</option>)}</select></label> : null}
    <label><span>How Many Records to Store</span><select value={activeSelection.recordLimit || (root ? 'first' : 'all')} onChange={(event) => edit({ recordLimit: event.target.value, maxRecords: event.target.value === 'limited' ? activeSelection.maxRecords : '' })}><option value="first">Only the first record</option><option value="all">All records</option><option value="limited">All records, up to a specified limit</option></select></label>
    {activeSelection.recordLimit === 'limited' ? <label><span>Maximum Number of Records to Store <b>*</b></span><input type="number" min="1" max="20000" value={activeSelection.maxRecords || ''} onChange={(event) => edit({ maxRecords: event.target.value })}/></label> : null}
    <label><span>How to Store Record Data</span><select value={storeMode || 'auto'} onChange={(event) => edit({ storeMode: event.target.value, selectedFields: event.target.value === 'auto' ? [] : selectedFields })}><option value="auto">Automatically store all fields</option><option value="choose">Choose fields and let OneEngine do the rest</option></select></label>
    {!root && errors.length ? <div className="gptb-gr-errors">{errors.map((error) => <span key={error}>{error}</span>)}</div> : null}
  </div>
}

export default function GPTBuilderRelatedRecords({
  open,
  onClose,
  config,
  patchRoot,
  objects,
  rootFields,
  resources,
  elements,
}) {
  const [relationships, setRelationships] = useState([])
  const [fieldsByObject, setFieldsByObject] = useState({})
  const [selectedId, setSelectedId] = useState('root')
  const [tab, setTab] = useState('fields')
  const [addOpen, setAddOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [candidateId, setCandidateId] = useState('')
  const [snapshot, setSnapshot] = useState(null)

  useEffect(() => {
    if (open) setSnapshot(JSON.parse(JSON.stringify(config)))
  }, [open])

  const cancel = () => {
    if (snapshot) patchRoot(snapshot)
    onClose()
  }

  const rootObject = objects.find((object) => objectKey(object) === config.objectKey)
  const selections = Array.isArray(config.relatedSelections) ? config.relatedSelections : []

  useEffect(() => {
    if (!open || !rootObject?.id) return
    let live = true
    apiRequest('/api/platform/relationships').then((response) => {
      if (!live) return
      setRelationships((Array.isArray(response?.data) ? response.data : []).filter((relationship) =>
        relationship?.active !== false
        && String(relationship.parent_object_id) === String(rootObject.id)
        && relationship.child_field_id
      ))
    }).catch(() => { if (live) setRelationships([]) })
    return () => { live = false }
  }, [open, rootObject?.id])

  const selected = selectedId === 'root' ? null : selections.find((item) => item.id === selectedId) || null
  const selectedObject = selected ? objects.find((object) => objectKey(object) === selected.objectKey) : rootObject

  useEffect(() => {
    if (!open || selectedId === 'root' || !selectedObject?.id || fieldsByObject[selected.objectKey]) return
    let live = true
    apiRequest(`/api/platform/objects/${encodeURIComponent(selectedObject.id)}/fields`).then((response) => {
      if (live) setFieldsByObject((current) => ({ ...current, [selected.objectKey]: (Array.isArray(response?.data) ? response.data : []).filter((field) => field?.active !== false && field?.readable !== false) }))
    }).catch(() => { if (live) setFieldsByObject((current) => ({ ...current, [selected.objectKey]: [] })) })
    return () => { live = false }
  }, [open, selectedId, selectedObject?.id, selected?.objectKey])

  const candidates = useMemo(() => relationships.filter((relationship) => {
    if (selections.some((selection) => String(selection.relationshipId) === String(relationship.id))) return false
    const child = objects.find((object) => String(object.id) === String(relationship.child_object_id))
    if (!child) return false
    const needle = search.trim().toLowerCase()
    return !needle || `${relationship.label || relationship.relationship_key} ${objectLabel(child)} ${objectKey(child)}`.toLowerCase().includes(needle)
  }), [relationships, selections, objects, search])

  const addRelationship = (relationship) => {
    const child = objects.find((object) => String(object.id) === String(relationship.child_object_id))
    if (!child) return
    const next = {
      ...relatedDefaults(),
      relationshipId: relationship.id,
      relationshipKey: relationship.relationship_key,
      objectKey: objectKey(child),
      objectLabel: objectLabel(child),
    }
    patchRoot({ relatedSelections: [...selections, next] })
    setSelectedId(next.id)
    setTab('fields')
    setAddOpen(false)
    setSearch('')
    setCandidateId('')
  }

  const removeSelection = (id) => {
    patchRoot({ relatedSelections: selections.filter((item) => item.id !== id) })
    if (selectedId === id) setSelectedId('root')
  }

  const patchSelection = (changes) => {
    if (!selected) return
    patchRoot({ relatedSelections: selections.map((item) => item.id === selected.id ? { ...item, ...changes } : item) })
  }

  const activeFields = selectedId === 'root' ? rootFields : (fieldsByObject[selected?.objectKey] || [])
  const allErrors = selections.flatMap((selection) => relatedSelectionErrors(selection).map((error) => `${selection.objectLabel || selection.objectKey}: ${error}`))

  if (!open) return null
  return <div className="gptb-related-backdrop">
    <section className="gptb-related-dialog" role="dialog" aria-modal="true" aria-label="Select Related Objects and Fields">
      <header><div><h3>Select Related Objects and Fields</h3><p>Choose fields, filters, sort order, and storage for the object and its related collections.</p></div><button className="gptb-icon-button" onClick={cancel} aria-label="Close Select Related Records"><X size={16}/></button></header>
      <div className="gptb-related-layout">
        <aside>
          <div className="gptb-related-aside-title"><b>Object</b></div>
          <button type="button" className={selectedId === 'root' ? 'is-active' : ''} onClick={() => { setSelectedId('root'); setTab('fields') }}><Database size={14}/><span><b>{config.objectLabel || config.objectKey}</b><small>Primary object</small></span></button>
          {selections.map((selection) => <div className="gptb-related-object-row" key={selection.id}><button type="button" className={selectedId === selection.id ? 'is-active' : ''} onClick={() => { setSelectedId(selection.id); setTab('fields') }}><Database size={14}/><span><b>{selection.objectLabel || selection.objectKey}</b><small>{selection.relationshipKey}</small></span></button><button type="button" aria-label={`Remove ${selection.objectLabel || selection.objectKey}`} onClick={() => removeSelection(selection.id)}><Trash2 size={12}/></button></div>)}
          <button type="button" className="gptb-related-add" onClick={() => setAddOpen(true)}><Plus size={13}/> Add Related Object</button>
        </aside>
        <main>
          <div className="gptb-related-current"><span>{selectedId === 'root' ? 'Object' : 'Collection'}</span><b>{selectedId === 'root' ? config.objectLabel || config.objectKey : selected?.objectLabel || selected?.objectKey}</b></div>
          <nav><button className={tab === 'fields' ? 'is-active' : ''} onClick={() => setTab('fields')}>Fields</button><button className={tab === 'filter' ? 'is-active' : ''} onClick={() => setTab('filter')}>Filter, Sort, Store</button><button className={tab === 'preview' ? 'is-active' : ''} onClick={() => setTab('preview')}>Preview</button></nav>
          <div className="gptb-related-content"><RelatedObjectEditor selection={selected} fields={activeFields} patch={patchSelection} resources={resources} elements={elements} tab={tab} setTab={setTab} root={selectedId === 'root'} rootConfig={config} patchRoot={patchRoot}/></div>
        </main>
      </div>
      <footer>{allErrors.length ? <span>{allErrors[0]}{allErrors.length > 1 ? ` (+${allErrors.length - 1} more)` : ''}</span> : <span>{selections.length} related object{selections.length === 1 ? '' : 's'} selected</span>}<div><button className="gptb-button" onClick={cancel}>Cancel</button><button className="gptb-button is-brand" disabled={Boolean(allErrors.length) || !selections.length} onClick={onClose}>Done</button></div></footer>

      {addOpen ? <div className="gptb-related-add-panel"><header><button type="button" onClick={() => { setAddOpen(false); setCandidateId('') }}><ChevronLeft size={14}/></button><strong>Add Related Object</strong><button type="button" onClick={() => { setAddOpen(false); setCandidateId('') }}><X size={14}/></button></header><label><Search size={13}/><input autoFocus value={search} onChange={(event) => { setSearch(event.target.value); setCandidateId('') }} placeholder={`Search objects related to ${config.objectLabel || config.objectKey}...`}/></label><div>{candidates.length ? candidates.map((relationship) => {
        const child = objects.find((object) => String(object.id) === String(relationship.child_object_id))
        return <button type="button" key={relationship.id} className={candidateId === String(relationship.id) ? 'is-selected' : ''} onClick={() => setCandidateId(String(relationship.id))}><Database size={14}/><span><b>{objectLabel(child)}</b><small>{relationship.label || relationship.relationship_key} · {objectKey(child)}</small></span></button>
      }) : <p>No more related objects are available.</p>}</div><footer><button className="gptb-button" onClick={() => { setAddOpen(false); setCandidateId('') }}>Cancel</button><button className="gptb-button is-brand" disabled={!candidateId} onClick={() => { const relationship = candidates.find((item) => String(item.id) === candidateId); if (relationship) addRelationship(relationship) }}>Select Object</button></footer></div> : null}
    </section>
  </div>
}
