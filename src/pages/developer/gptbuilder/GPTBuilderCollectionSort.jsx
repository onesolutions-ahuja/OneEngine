import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { apiRequest } from '../../../services/api'

const uid = () => globalThis.crypto?.randomUUID?.() || `cs-${Date.now()}-${Math.random().toString(36).slice(2)}`
const resourcePath = (resource) => resource?.path || (resource?.apiName ? `variables.${resource.apiName}` : '')
const objectKey = (value) => String(value?.object_key || value?.api_name || value?.apiName || value?.key || value?.id || '')
const fieldKey = (value) => String(value?.api_name || value?.apiName || value?.field_key || value?.key || value?.id || '')
const fieldLabel = (value) => value?.label || value?.name || fieldKey(value)

export const COLLECTION_SORT_DEFAULTS = Object.freeze({
  collection: '',
  sortOptions: [],
  sizeMode: 'all',
  limit: '',
})

export function normalizeCollectionSortConfig(config = {}) {
  const legacy = String(config.sortField || '').trim()
    ? [{ id: 'legacy-sort-1', field: config.sortField, direction: config.sortDirection || 'asc', nullsFirst: config.nullsFirst === true }]
    : []
  return {
    ...COLLECTION_SORT_DEFAULTS,
    ...config,
    sortOptions: Array.isArray(config.sortOptions) ? config.sortOptions : legacy,
    sizeMode: config.sizeMode || (Number(config.limit || 0) > 0 ? 'maximum' : 'all'),
  }
}

export function collectionSortConfigErrors(config = {}, resources = []) {
  const c = normalizeCollectionSortConfig(config)
  const errors = []
  const selected = resources.find((resource) => resourcePath(resource) === c.collection)
  if (!c.collection) errors.push('Select a collection variable.')
  else if (!selected?.isCollection) errors.push('Selected resource must be a collection.')

  if (selected?.objectKey) {
    if (!c.sortOptions.length) errors.push('Add at least one sort option.')
    if (c.sortOptions.length > 3) errors.push('Collection Sort supports up to 3 sort options.')
    c.sortOptions.forEach((row, index) => {
      if (!String(row.field || '').trim()) errors.push(`Sort option ${index + 1}: select a field.`)
      if (!['asc', 'desc'].includes(row.direction)) errors.push(`Sort option ${index + 1}: select a sort order.`)
    })
  }
  if (c.sizeMode === 'maximum') {
    const limit = Number(c.limit)
    if (!Number.isInteger(limit) || limit < 1) errors.push('Enter a maximum number of items greater than 0.')
  }
  return errors
}

export function collectionSortRuntimeAction(instance, resources = []) {
  const c = normalizeCollectionSortConfig(instance?.config)
  const selected = resources.find((resource) => resourcePath(resource) === c.collection)
  const options = selected?.objectKey
    ? c.sortOptions.map((row) => ({
        field: row.field,
        direction: row.direction === 'desc' ? 'desc' : 'asc',
        nullsFirst: row.nullsFirst === true,
      }))
    : [{ field: '', direction: c.sortOptions[0]?.direction === 'desc' ? 'desc' : 'asc', nullsFirst: c.sortOptions[0]?.nullsFirst === true }]
  return {
    id: instance.id,
    key: 'COLLECTION_SORT',
    label: instance.label,
    apiName: instance.apiName,
    description: instance.description || '',
    collection: c.collection,
    sortOptions: options,
    sortField: options[0]?.field || '',
    sortDirection: options[0]?.direction || 'asc',
    nullsFirst: options[0]?.nullsFirst === true,
    limit: c.sizeMode === 'maximum' ? Number(c.limit) : 0,
  }
}

export default function GPTBuilderCollectionSort({ draft, updateConfig, resources, objects = [], onConfiguredChange }) {
  const config = normalizeCollectionSortConfig(draft.config)
  const selected = resources.find((resource) => resourcePath(resource) === config.collection)
  const selectedObject = objects.find((item) => objectKey(item) === selected?.objectKey || String(item?.id || '') === String(selected?.objectKey || ''))
  const [fields, setFields] = useState([])
  const [fieldsLoading, setFieldsLoading] = useState(false)
  useEffect(() => {
    let live = true
    if (!selected?.objectKey || !selectedObject?.id) { setFields([]); return () => { live = false } }
    setFieldsLoading(true)
    apiRequest(`/api/platform/objects/${encodeURIComponent(selectedObject.id)}/fields`)
      .then((response) => { if (live) setFields((Array.isArray(response?.data) ? response.data : []).filter((field) => field?.active !== false && field?.readable !== false)) })
      .catch(() => { if (live) setFields([]) })
      .finally(() => { if (live) setFieldsLoading(false) })
    return () => { live = false }
  }, [selectedObject?.id, selected?.objectKey])
  const errors = useMemo(() => collectionSortConfigErrors(config, resources), [JSON.stringify(config), JSON.stringify(resources)])
  useEffect(() => { onConfiguredChange?.(errors.length === 0, errors) }, [JSON.stringify(errors)])
  const patch = (changes) => updateConfig({ ...config, ...changes })
  const options = config.sortOptions
  const patchOption = (id, changes) => patch({ sortOptions: options.map((row) => row.id === id ? { ...row, ...changes } : row) })
  const ensureScalarOption = () => options.length ? options : [{ id: uid(), field: '', direction: 'asc', nullsFirst: false }]
  const onCollection = (value) => {
    const resource = resources.find((item) => resourcePath(item) === value)
    patch({
      collection: value,
      sortOptions: [{ id: uid(), field: '', direction: 'asc', nullsFirst: false }],
    })
  }

  return <div className="gptb-gr gptb-collection-sort">
    <section><h3>Sort Options</h3>
      <label><span>Collection Variable <b>*</b></span><select value={config.collection} onChange={(event) => onCollection(event.target.value)}><option value="">Select a collection</option>{resources.filter((resource) => resource.isCollection).map((resource)=><option key={resource.id || resource.apiName} value={resourcePath(resource)}>{resource.label || resource.apiName}</option>)}</select>{selected ? <small>{selected.objectKey ? `Record Collection · ${selected.objectKey}` : `${selected.dataType || 'Text'} Collection`}</small> : null}</label>
      {selected && !selected.objectKey ? <div className="gptb-gr-sort-option">
        <label><span>Sort Order <b>*</b></span><select value={ensureScalarOption()[0].direction} onChange={(event)=>patch({sortOptions:[{...ensureScalarOption()[0],direction:event.target.value}]})}><option value="asc">Ascending</option><option value="desc">Descending</option></select></label>
        <label className="gptb-properties-check"><input type="checkbox" checked={ensureScalarOption()[0].nullsFirst === true} onChange={(event)=>patch({sortOptions:[{...ensureScalarOption()[0],nullsFirst:event.target.checked}]})}/><span>Put empty string and null values first</span></label>
      </div> : null}
      {selected?.objectKey ? <>
        <div className="gptb-gr-sort-options">{options.map((row,index)=><div className="gptb-gr-sort-option" key={row.id}>
          <div className="gptb-gr-sort-option-head"><strong>Sort Option {index + 1}</strong>{options.length > 1 ? <button type="button" aria-label={`Remove sort option ${index + 1}`} onClick={()=>patch({sortOptions:options.filter((item)=>item.id!==row.id)})}><Trash2 size={13}/></button> : null}</div>
          <label><span>Sort By <b>*</b></span><select value={row.field || ''} disabled={fieldsLoading || !fields.length} onChange={(event)=>patchOption(row.id,{field:event.target.value})}><option value="">{fieldsLoading ? 'Loading fields...' : fields.length ? 'Select a field' : 'No fields available'}</option>{fields.map((field)=><option key={fieldKey(field)} value={fieldKey(field)}>{fieldLabel(field)}</option>)}</select></label>
          <label><span>Sort Order <b>*</b></span><select value={row.direction || 'asc'} onChange={(event)=>patchOption(row.id,{direction:event.target.value})}><option value="asc">Ascending</option><option value="desc">Descending</option></select></label>
          <label className="gptb-properties-check"><input type="checkbox" checked={row.nullsFirst === true} onChange={(event)=>patchOption(row.id,{nullsFirst:event.target.checked})}/><span>Put empty string and null values first</span></label>
        </div>)}</div>
        {options.length < 3 ? <button type="button" className="gptb-inline-action" onClick={()=>patch({sortOptions:[...options,{id:uid(),field:'',direction:'asc',nullsFirst:false}]})}><Plus size={13}/> Add Sort Option</button> : null}
      </> : null}
    </section>
    <section><h3>Control the Collection Size</h3>
      <fieldset className="gptb-gr-radio-group"><legend>How Many Items to Keep After Sorting</legend>
        <label><input type="radio" name={`collection-sort-size-${draft.id}`} checked={config.sizeMode === 'all'} onChange={()=>patch({sizeMode:'all',limit:''})}/> <span>Keep all items</span></label>
        <label><input type="radio" name={`collection-sort-size-${draft.id}`} checked={config.sizeMode === 'maximum'} onChange={()=>patch({sizeMode:'maximum'})}/> <span>Set the maximum number of items</span></label>
      </fieldset>
      {config.sizeMode === 'maximum' ? <label><span>Maximum Number of Items <b>*</b></span><input type="number" min="1" step="1" value={config.limit} onChange={(event)=>patch({limit:event.target.value})}/></label> : null}
    </section>
    <section><h3>Collection Behavior</h3><p>The selected collection is changed directly. Collection Sort does not create a new collection resource.</p></section>
    {errors.length ? <div className="gptb-gr-errors"><b>Complete this Collection Sort element</b>{errors.map((error)=><span key={error}>{error}</span>)}</div> : null}
  </div>
}
