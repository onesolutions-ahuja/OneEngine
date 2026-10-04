import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Plus, Trash2, X } from 'lucide-react'
import { apiRequest } from '../../../services/api'

const uid = (prefix = 'tf') => globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
const resourcePath = (resource) => resource ? `variables.${resource.apiName}` : ''
const resourceName = (path) => String(path || '').replace(/^variables\./, '')
const objectKey = (value) => String(value?.object_key || value?.api_name || value?.apiName || value?.key || value?.id || '')
const objectLabel = (value) => value?.label || value?.name || objectKey(value)
const fieldKey = (value) => String(value?.api_name || value?.apiName || value?.field_key || value?.key || value?.id || '')
const fieldLabel = (value) => value?.label || value?.name || fieldKey(value)

export const TRANSFORM_DEFAULTS = Object.freeze({
  sources: [],
  target: { dataType: 'record', objectKey: '', isCollection: false },
  mappings: [],
  joins: [],
})

export function normalizeTransformConfig(config = {}) {
  const legacySource = config.collection ? [config.collection] : []
  const legacyMappings = config.transformMappings && typeof config.transformMappings === 'object'
    ? Object.entries(config.transformMappings).map(([targetField, source], index) => ({ id: `legacy-map-${index + 1}`, targetField, mode: 'source', source }))
    : []
  return {
    ...TRANSFORM_DEFAULTS,
    ...config,
    sources: Array.isArray(config.sources) ? config.sources : legacySource,
    target: { ...TRANSFORM_DEFAULTS.target, ...(config.target || {}) },
    mappings: Array.isArray(config.mappings) ? config.mappings : legacyMappings,
    joins: Array.isArray(config.joins) ? config.joins : [],
  }
}

export function transformConfigErrors(config = {}, resources = []) {
  const c = normalizeTransformConfig(config)
  const errors = []
  const sourceResources = c.sources.map((path) => resources.find((resource) => resourcePath(resource) === path)).filter(Boolean)
  if (!c.sources.length) errors.push('Add at least one source resource.')
  if (c.sources.some((path) => !resources.some((resource) => resourcePath(resource) === path))) errors.push('One or more source resources are unavailable.')
  if (!c.target.dataType) errors.push('Select a target data type.')
  if (c.target.dataType === 'record' && !c.target.objectKey) errors.push('Select the target object.')
  if (c.target.isCollection && !sourceResources.some((resource) => resource?.isCollection)) errors.push('A collection target requires at least one collection source.')
  if (!c.mappings.length) errors.push('Create at least one target mapping.')
  c.mappings.forEach((row, index) => {
    if (!String(row.targetField || '').trim()) errors.push(`Mapping ${index + 1}: select a target field.`)
    if (row.mode === 'source' && !String(row.source || '').trim()) errors.push(`Mapping ${index + 1}: select a source field.`)
    if (row.mode === 'formula') {
      if (!String(row.formula || '').trim()) errors.push(`Mapping ${index + 1}: enter a formula.`)
      if (String(row.formula || '').length > 255) errors.push(`Mapping ${index + 1}: inline Transform formulas are limited to 255 characters.`)
    }
    if (row.mode === 'aggregate') {
      if (!['count','sum'].includes(row.aggregateType)) errors.push(`Mapping ${index + 1}: select Count or Sum.`)
      if (row.aggregateType === 'sum' && !String(row.aggregateField || '').trim()) errors.push(`Mapping ${index + 1}: select a field to sum.`)
    }
    if (row.mode === 'value_map' && (!String(row.source || '').trim() || !String(row.valueMap || '').trim())) errors.push(`Mapping ${index + 1}: select a source and value map.`)
  })
  if (c.sources.length > 1) {
    if (!c.target.isCollection) errors.push('Joined source collections require a collection target.')
    if (!c.joins.length) errors.push('Configure join keys for multiple source collections.')
    c.joins.forEach((join, index) => {
      if (!join.leftSource || !join.rightSource || !join.leftKey || !join.rightKey) errors.push(`Join ${index + 1}: configure both source collections and join keys.`)
    })
  }
  if (sourceResources.some((resource) => resource?.isCollection) && c.target.isCollection === false && c.mappings.some((row) => !['aggregate'].includes(row.mode))) {
    errors.push('Collection source fields can map to a single target only through an aggregate transformation.')
  }
  return errors
}

function sourceExpression(row) {
  if (row.mode === 'fixed') return { fixed: row.fixedValue ?? '' }
  if (row.mode === 'formula') return { formula: row.formula || '' }
  if (row.mode === 'aggregate') return { aggregate: row.aggregateType || 'count', field: row.aggregateField || '' }
  if (row.mode === 'value_map') return { valueMap: row.valueMap || '', source: row.source || '' }
  return row.source || ''
}

export function transformRuntimeAction(instance) {
  const c = normalizeTransformConfig(instance?.config)
  return {
    id: instance.id,
    key: 'TRANSFORM',
    label: instance.label,
    apiName: instance.apiName,
    description: instance.description || '',
    collection: c.sources[0] || '',
    sources: c.sources,
    target: c.target,
    joins: c.joins,
    outputVariable: instance.apiName,
    transformMappings: Object.fromEntries(c.mappings.map((row) => [row.targetField, sourceExpression(row)])),
  }
}

function MetadataFieldPicker({ objectApiKey, objects, value, onChange, placeholder = 'Select a field', allowBlank = true }) {
  const object = objects.find((item) => objectKey(item) === objectApiKey || String(item?.id || '') === String(objectApiKey || ''))
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
  return <select value={value || ''} disabled={!object || loading || !fields.length} onChange={(event)=>onChange(event.target.value)}>
    {allowBlank ? <option value="">{loading ? 'Loading fields...' : fields.length ? placeholder : object ? 'No fields available' : 'Select an object first'}</option> : null}
    {fields.map((field)=><option key={fieldKey(field)} value={fieldKey(field)}>{fieldLabel(field)}</option>)}
  </select>
}

function SourceFieldPicker({ sources, resources, objects, value, onChange }) {
  const options = []
  const [fieldSets, setFieldSets] = useState({})
  useEffect(() => {
    let live = true
    const selected = sources.map((path)=>resources.find((resource)=>resourcePath(resource)===path)).filter(Boolean)
    Promise.all(selected.map(async (resource) => {
      const object = objects.find((item)=>objectKey(item)===resource.objectKey || String(item?.id||'')===String(resource.objectKey||''))
      if (!object?.id) return [resource.apiName, []]
      try {
        const response = await apiRequest(`/api/platform/objects/${encodeURIComponent(object.id)}/fields`)
        return [resource.apiName, (Array.isArray(response?.data) ? response.data : []).filter((field)=>field?.active!==false && field?.readable!==false)]
      } catch { return [resource.apiName, []] }
    })).then((sets)=>{ if (live) setFieldSets(Object.fromEntries(sets)) })
    return () => { live = false }
  }, [JSON.stringify(sources), JSON.stringify(resources.map((resource)=>[resource.apiName,resource.objectKey])), JSON.stringify(objects.map((object)=>[object.id,objectKey(object)]))])
  sources.forEach((path)=>{
    const resource=resources.find((item)=>resourcePath(item)===path)
    if (!resource) return
    const fields=fieldSets[resource.apiName] || []
    if (fields.length) fields.forEach((field)=>options.push({ value:`${resource.apiName}.${fieldKey(field)}`, label:`${resource.label || resource.apiName} › ${fieldLabel(field)}` }))
    else if (!resource.objectKey) options.push({ value:resource.apiName, label:resource.label || resource.apiName })
  })
  return <select value={value || ''} onChange={(event)=>onChange(event.target.value)}><option value="">Select a source field</option>{options.map((option)=><option key={option.value} value={option.value}>{option.label}</option>)}</select>
}

export default function GPTBuilderTransform({ draft, updateConfig, resources, objects, onResourcesChange, onConfiguredChange }) {
  const config = normalizeTransformConfig(draft.config)
  const [sourceToAdd, setSourceToAdd] = useState('')
  const [pendingMapSource, setPendingMapSource] = useState('')
  const [visualFieldSets, setVisualFieldSets] = useState({})
  const [visualTargetFields, setVisualTargetFields] = useState([])
  const errors = useMemo(() => transformConfigErrors(config, resources), [JSON.stringify(config), JSON.stringify(resources)])
  useEffect(() => { onConfiguredChange?.(errors.length === 0, errors) }, [JSON.stringify(errors)])
  const patch = (changes) => updateConfig({ ...config, ...changes })
  const patchMapping = (id, changes) => patch({ mappings: config.mappings.map((row) => row.id === id ? { ...row, ...changes } : row) })
  const patchJoin = (id, changes) => patch({ joins: config.joins.map((row) => row.id === id ? { ...row, ...changes } : row) })
  const availableResources = resources.filter((resource) => resource.generatedByElementId !== draft.id)
  const selectedResources = config.sources.map((path)=>resources.find((resource)=>resourcePath(resource)===path)).filter(Boolean)
  const hasCollectionSource = selectedResources.some((resource)=>resource.isCollection)
  useEffect(() => {
    let live = true
    Promise.all(selectedResources.map(async (resource) => {
      const object = objects.find((item)=>objectKey(item)===resource.objectKey || String(item?.id||'')===String(resource.objectKey||''))
      if (!object?.id) return [resource.apiName, []]
      try {
        const response = await apiRequest(`/api/platform/objects/${encodeURIComponent(object.id)}/fields`)
        return [resource.apiName, (Array.isArray(response?.data) ? response.data : []).filter((field)=>field?.active!==false && field?.readable!==false)]
      } catch { return [resource.apiName, []] }
    })).then((sets)=>{ if(live)setVisualFieldSets(Object.fromEntries(sets)) })
    const targetObject = objects.find((item)=>objectKey(item)===config.target.objectKey || String(item?.id||'')===String(config.target.objectKey||''))
    if (config.target.dataType==='record' && targetObject?.id) {
      apiRequest(`/api/platform/objects/${encodeURIComponent(targetObject.id)}/fields`)
        .then((response)=>{ if(live)setVisualTargetFields((Array.isArray(response?.data)?response.data:[]).filter((field)=>field?.active!==false&&field?.writable!==false)) })
        .catch(()=>{ if(live)setVisualTargetFields([]) })
    } else setVisualTargetFields([])
    return()=>{live=false}
  },[JSON.stringify(selectedResources.map((resource)=>[resource.apiName,resource.objectKey])),config.target.dataType,config.target.objectKey,JSON.stringify(objects.map((object)=>[object.id,objectKey(object)]))])

  const visualSources = selectedResources.flatMap((resource) => {
    const fields=visualFieldSets[resource.apiName]||[]
    if(fields.length)return fields.map((field)=>({key:`${resource.apiName}.${fieldKey(field)}`,label:fieldLabel(field),resourceLabel:resource.label||resource.apiName,collection:resource.isCollection===true}))
    return [{key:resource.apiName,label:resource.label||resource.apiName,resourceLabel:resource.label||resource.apiName,collection:resource.isCollection===true}]
  })
  const visualTargets = config.target.dataType==='record'
    ? visualTargetFields.map((field)=>({key:fieldKey(field),label:fieldLabel(field)}))
    : [{key:'value',label:draft.apiName||'Value'}]
  const mapVisualTarget=(targetKey)=>{
    if(!pendingMapSource)return
    const existing=config.mappings.find((row)=>row.targetField===targetKey)
    if(existing)patchMapping(existing.id,{mode:'source',source:pendingMapSource})
    else patch({mappings:[...config.mappings,{id:uid('map'),targetField:targetKey,mode:'source',source:pendingMapSource}]})
    setPendingMapSource('')
  }

  const addSource = () => {
    if (!sourceToAdd || config.sources.includes(sourceToAdd)) return
    patch({ sources: [...config.sources, sourceToAdd] })
    setSourceToAdd('')
  }
  const removeSource = (path) => patch({
    sources: config.sources.filter((item)=>item!==path),
    joins: config.joins.filter((join)=>join.leftSource!==path && join.rightSource!==path),
  })

  useEffect(() => {
    if (!draft.apiName || errors.length) return
    const generated = {
      id: `transform-${draft.id}`,
      apiName: draft.apiName,
      label: draft.label || draft.apiName,
      dataType: config.target.dataType === 'record' ? 'record' : config.target.dataType,
      objectKey: config.target.dataType === 'record' ? config.target.objectKey : '',
      isCollection: config.target.isCollection === true,
      generatedByElementId: draft.id,
      generatedByElementKey: 'transform',
      writable: false,
    }
    const withoutSelf = resources.filter((resource) => resource.generatedByElementId !== draft.id)
    const next = [...withoutSelf, generated]
    if (JSON.stringify(next) !== JSON.stringify(resources)) onResourcesChange?.(next)
  }, [draft.id, draft.apiName, draft.label, JSON.stringify(config.target), JSON.stringify(errors)])

  return <div className="gptb-gr gptb-transform">
    <section><h3>Source Data</h3>
      <p className="gptb-help-text">Add the flow resources to map or transform.</p>
      <div className="gptb-transform-add-resource"><select value={sourceToAdd} onChange={(event)=>setSourceToAdd(event.target.value)}><option value="">Select a resource</option>{availableResources.filter((resource)=>!config.sources.includes(resourcePath(resource))).map((resource)=><option key={resource.id || resource.apiName} value={resourcePath(resource)}>{resource.label || resource.apiName}{resource.isCollection ? ' · Collection' : ''}</option>)}</select><button type="button" className="gptb-inline-action" disabled={!sourceToAdd} onClick={addSource}><Plus size={13}/> Add Resource</button></div>
      <div className="gptb-transform-selected-resources">{selectedResources.map((resource)=><div key={resource.id || resource.apiName}><span><b>{resource.label || resource.apiName}</b><small>{resource.objectKey || resource.dataType || 'Resource'}{resource.isCollection ? ' · Collection' : ''}</small></span><button type="button" aria-label={`Remove ${resource.label || resource.apiName}`} onClick={()=>removeSource(resourcePath(resource))}><X size={13}/></button></div>)}</div>
      {!availableResources.length ? <small>No flow resources are available yet.</small> : null}
    </section>

    <section><h3>Target Data</h3>
      <label><span>Data Type <b>*</b></span><select value={config.target.dataType} onChange={(event)=>patch({target:{...config.target,dataType:event.target.value,objectKey:event.target.value==='record'?config.target.objectKey:''}})}><option value="record">Record</option><option value="text">Text</option><option value="number">Number</option><option value="currency">Currency</option><option value="boolean">Boolean</option><option value="date">Date</option><option value="datetime">Date/Time</option></select></label>
      {config.target.dataType === 'record' ? <label><span>Object <b>*</b></span><select value={config.target.objectKey} onChange={(event)=>patch({target:{...config.target,objectKey:event.target.value}})}><option value="">Select an object</option>{objects.map((object)=><option key={objectKey(object)} value={objectKey(object)}>{objectLabel(object)}</option>)}</select></label> : null}
      <label className="gptb-properties-check"><input type="checkbox" disabled={!hasCollectionSource} checked={config.target.isCollection === true} onChange={(event)=>patch({target:{...config.target,isCollection:event.target.checked}})}/><span>Allow multiple values (collection)</span></label>
      {!hasCollectionSource ? <small>Add a collection source before creating a collection target.</small> : null}
      <small>The generated target resource is <b>{draft.apiName || 'Transform'}</b>.</small>
    </section>

    {config.sources.length > 1 ? <section><h3>Join Source Collections</h3>
      <p className="gptb-help-text">Join uses an inner join. Select a key from each source collection, then map fields from the joined sources to the target.</p>
      <div className="gptb-transform-joins">{config.joins.map((row,index)=>{
        const left = resources.find((resource)=>resourcePath(resource)===row.leftSource)
        const right = resources.find((resource)=>resourcePath(resource)===row.rightSource)
        return <div className="gptb-transform-join" key={row.id}><div className="gptb-gr-sort-option-head"><strong>Join {index+1}</strong><button type="button" aria-label={`Remove join ${index+1}`} onClick={()=>patch({joins:config.joins.filter((item)=>item.id!==row.id)})}><Trash2 size={13}/></button></div><label><span>Left Collection</span><select value={row.leftSource || ''} onChange={(event)=>patchJoin(row.id,{leftSource:event.target.value,leftKey:''})}><option value="">Select source</option>{config.sources.map((path)=><option key={path} value={path}>{resourceName(path)}</option>)}</select></label><label><span>Left Join Key</span><MetadataFieldPicker objectApiKey={left?.objectKey} objects={objects} value={row.leftKey} onChange={(value)=>patchJoin(row.id,{leftKey:value})}/></label><label><span>Right Collection</span><select value={row.rightSource || ''} onChange={(event)=>patchJoin(row.id,{rightSource:event.target.value,rightKey:''})}><option value="">Select source</option>{config.sources.map((path)=><option key={path} value={path}>{resourceName(path)}</option>)}</select></label><label><span>Right Join Key</span><MetadataFieldPicker objectApiKey={right?.objectKey} objects={objects} value={row.rightKey} onChange={(value)=>patchJoin(row.id,{rightKey:value})}/></label></div>
      })}</div>
      <button type="button" className="gptb-inline-action" onClick={()=>patch({joins:[...config.joins,{id:uid('join'),leftSource:config.sources[0]||'',leftKey:'',rightSource:config.sources[1]||'',rightKey:''}]})}><Plus size={13}/> Add Join</button>
    </section> : null}

    <section><h3>Map Source Data to Target Data</h3>
      <p className="gptb-help-text">Select the Map socket next to a source field, then select the Map socket next to the target field. Existing mappings are shown between the two data structures.</p>
      <div className="gptb-transform-visual-map">
        <div className="gptb-transform-tree is-source"><header><strong>Source Data</strong><small>{selectedResources.length} resource{selectedResources.length===1?'':'s'}</small></header><div>{visualSources.map((field)=><div className={pendingMapSource===field.key?'is-pending':''} key={field.key}><span><b>{field.label}</b><small>{field.resourceLabel}{field.collection?' · Collection':''}</small></span><button type="button" className="gptb-transform-socket" aria-label={`Map source ${field.label}`} title="Map" onClick={()=>setPendingMapSource(field.key)}>●</button></div>)}</div></div>
        <div className="gptb-transform-connections">{config.mappings.filter((row)=>row.mode==='source'&&row.source&&row.targetField).map((row)=><div key={row.id}><span>{row.source}</span><i>→</i><span>{row.targetField}</span></div>)}{pendingMapSource?<p>Select a target field for <b>{pendingMapSource}</b>.</p>:null}</div>
        <div className="gptb-transform-tree is-target"><header><strong>Target Data</strong><small>{config.target.isCollection?'Collection':config.target.dataType}</small></header><div>{visualTargets.map((field)=>{const mapped=config.mappings.find((row)=>row.targetField===field.key);return <div className={mapped?'is-mapped':''} key={field.key}><button type="button" className="gptb-transform-socket" aria-label={`Map target ${field.label}`} title={pendingMapSource?'Map selected source':'Select a source field first'} disabled={!pendingMapSource} onClick={()=>mapVisualTarget(field.key)}>●</button><span><b>{field.label}</b>{mapped?<small>Mapped from {mapped.source||mapped.mode}</small>:null}</span></div>})}</div></div>
      </div>
      <details className="gptb-transform-mapping-details" open><summary>Mapping Details</summary>
      <div className="gptb-transform-mappings">{config.mappings.map((row,index)=>{
        const rowErrors = transformConfigErrors({ ...config, mappings:[row] }, resources).filter((error)=>error.startsWith('Mapping 1:')).map((error)=>error.replace('Mapping 1:', `Mapping ${index+1}:`))
        const aggregateResource = selectedResources.find((resource)=>resource.isCollection && resource.objectKey)
        return <div className={`gptb-transform-mapping${rowErrors.length ? ' has-error' : ''}`} key={row.id}>
          <div className="gptb-gr-sort-option-head"><strong>Mapping {index+1}</strong><span>{rowErrors.length ? <span title={rowErrors.join(' ')}><AlertCircle size={14}/></span> : null}<button type="button" aria-label={`Remove mapping ${index+1}`} onClick={()=>patch({mappings:config.mappings.filter((item)=>item.id!==row.id)})}><Trash2 size={13}/></button></span></div>
          <div className="gptb-transform-map-grid">
            <label><span>Target Field <b>*</b></span>{config.target.dataType === 'record' ? <MetadataFieldPicker objectApiKey={config.target.objectKey} objects={objects} value={row.targetField} onChange={(value)=>patchMapping(row.id,{targetField:value})}/> : <select value={row.targetField || ''} onChange={(event)=>patchMapping(row.id,{targetField:event.target.value})}><option value="">Select target</option><option value="value">Value</option></select>}</label>
            <label><span>Input Mode</span><select value={row.mode || 'source'} onChange={(event)=>patchMapping(row.id,{mode:event.target.value})}><option value="source">Source Field</option><option value="fixed">Fixed Value</option><option value="formula">Formula</option><option value="aggregate">Aggregate</option><option value="value_map">Value Mapping</option></select></label>
          </div>
          {row.mode === 'source' || row.mode === 'value_map' ? <label><span>Source Field <b>*</b></span><SourceFieldPicker sources={config.sources} resources={resources} objects={objects} value={row.source} onChange={(value)=>patchMapping(row.id,{source:value})}/></label> : null}
          {row.mode === 'fixed' ? <label><span>Fixed Value</span><input value={row.fixedValue ?? ''} onChange={(event)=>patchMapping(row.id,{fixedValue:event.target.value})}/></label> : null}
          {row.mode === 'formula' ? <label><span>Formula <b>*</b></span><textarea rows={4} maxLength={255} value={row.formula || ''} onChange={(event)=>patchMapping(row.id,{formula:event.target.value})} placeholder="Example: {!Orders[$EachItem].Amount} - 5"/><small>{String(row.formula || '').length}/255 · Use [$EachItem] for each item in a collection.</small></label> : null}
          {row.mode === 'aggregate' ? <><label><span>Aggregate Type</span><select value={row.aggregateType || 'count'} onChange={(event)=>patchMapping(row.id,{aggregateType:event.target.value})}><option value="count">Count</option><option value="sum">Sum</option></select></label>{row.aggregateType === 'sum' ? <label><span>Field to Transform <b>*</b></span><MetadataFieldPicker objectApiKey={aggregateResource?.objectKey} objects={objects} value={row.aggregateField} onChange={(value)=>patchMapping(row.id,{aggregateField:value})}/></label> : null}</> : null}
          {row.mode === 'value_map' ? <label><span>Value Map <b>*</b></span><input value={row.valueMap || ''} onChange={(event)=>patchMapping(row.id,{valueMap:event.target.value})} placeholder="Select or enter a Value Map API name"/></label> : null}
          {rowErrors.length ? <div className="gptb-transform-mapping-tip" role="alert">{rowErrors.map((error)=><span key={error}>{error}</span>)}</div> : null}
        </div>
      })}</div>
      <button type="button" className="gptb-inline-action" onClick={()=>patch({mappings:[...config.mappings,{id:uid('map'),targetField:'',mode:'source',source:''}]})}><Plus size={13}/> Add Mapping</button>
      </details>
    </section>

    {errors.length ? <div className="gptb-gr-errors"><b>Complete this Transform element</b>{errors.map((error)=><span key={error}>{error}</span>)}</div> : null}
  </div>
}
