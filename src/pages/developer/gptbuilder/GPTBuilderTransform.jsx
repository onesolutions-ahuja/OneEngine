import { useEffect, useMemo } from 'react'
import { Plus, Trash2 } from 'lucide-react'

const uid = (prefix = 'tf') => globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
const resourcePath = (resource) => resource ? `variables.${resource.apiName}` : ''
const objectKey = (value) => String(value?.object_key || value?.api_name || value?.apiName || value?.key || value?.id || '')
const objectLabel = (value) => value?.label || value?.name || objectKey(value)

export const TRANSFORM_DEFAULTS = Object.freeze({
  sources: [],
  target: { dataType: 'record', objectKey: '', isCollection: false },
  mappings: [],
  joins: [],
})

export function normalizeTransformConfig(config = {}) {
  const legacySource = config.collection ? [config.collection] : []
  const legacyMappings = config.transformMappings && typeof config.transformMappings === 'object'
    ? Object.entries(config.transformMappings).map(([targetField, source]) => ({ id: uid('legacy-map'), targetField, mode: 'source', source }))
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
  if (!c.mappings.length) errors.push('Create at least one target mapping.')
  c.mappings.forEach((row, index) => {
    if (!String(row.targetField || '').trim()) errors.push(`Mapping ${index + 1}: enter a target field.`)
    if (row.mode === 'source' && !String(row.source || '').trim()) errors.push(`Mapping ${index + 1}: select a source field.`)
    if (row.mode === 'formula' && !String(row.formula || '').trim()) errors.push(`Mapping ${index + 1}: enter a formula.`)
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

export default function GPTBuilderTransform({ draft, updateConfig, resources, objects, onResourcesChange, onConfiguredChange }) {
  const config = normalizeTransformConfig(draft.config)
  const errors = useMemo(() => transformConfigErrors(config, resources), [JSON.stringify(config), JSON.stringify(resources)])
  useEffect(() => { onConfiguredChange?.(errors.length === 0, errors) }, [JSON.stringify(errors)])
  const patch = (changes) => updateConfig({ ...config, ...changes })
  const patchMapping = (id, changes) => patch({ mappings: config.mappings.map((row) => row.id === id ? { ...row, ...changes } : row) })
  const patchJoin = (id, changes) => patch({ joins: config.joins.map((row) => row.id === id ? { ...row, ...changes } : row) })
  const toggleSource = (path) => {
    const exists = config.sources.includes(path)
    const sources = exists ? config.sources.filter((item) => item !== path) : [...config.sources, path]
    patch({ sources, joins: config.joins.filter((join) => sources.includes(join.leftSource) && sources.includes(join.rightSource)) })
  }

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
      <p className="gptb-help-text">Add the flow resources that contain the data to transform.</p>
      <div className="gptb-transform-resource-list">{resources.filter((resource) => resource.generatedByElementId !== draft.id).map((resource) => {
        const path = resourcePath(resource)
        return <label className="gptb-properties-check" key={resource.id || resource.apiName}><input type="checkbox" checked={config.sources.includes(path)} onChange={()=>toggleSource(path)}/><span>{resource.label || resource.apiName}{resource.isCollection ? ' · Collection' : ''}</span></label>
      })}</div>
      {!resources.filter((resource) => resource.generatedByElementId !== draft.id).length ? <small>No flow resources are available yet.</small> : null}
    </section>

    <section><h3>Target Data</h3>
      <label><span>Data Type <b>*</b></span><select value={config.target.dataType} onChange={(event)=>patch({target:{...config.target,dataType:event.target.value,objectKey:event.target.value==='record'?config.target.objectKey:''}})}><option value="record">Record</option><option value="text">Text</option><option value="number">Number</option><option value="currency">Currency</option><option value="boolean">Boolean</option><option value="date">Date</option><option value="datetime">Date/Time</option></select></label>
      {config.target.dataType === 'record' ? <label><span>Object <b>*</b></span><select value={config.target.objectKey} onChange={(event)=>patch({target:{...config.target,objectKey:event.target.value}})}><option value="">Select an object</option>{objects.map((object)=><option key={objectKey(object)} value={objectKey(object)}>{objectLabel(object)}</option>)}</select></label> : null}
      <label className="gptb-properties-check"><input type="checkbox" checked={config.target.isCollection === true} onChange={(event)=>patch({target:{...config.target,isCollection:event.target.checked}})}/><span>Allow multiple values (collection)</span></label>
      <small>The generated target resource uses this element's API name: <b>{draft.apiName || 'Transform'}</b>.</small>
    </section>

    {config.sources.length > 1 ? <section><h3>Join Source Collections</h3>
      <p className="gptb-help-text">Transform joins collections with an inner join. Configure corresponding keys for each pair of source collections.</p>
      <div className="gptb-gr-field-assignments">{config.joins.map((row,index)=><div key={row.id}><span>{index+1}</span><select value={row.leftSource || ''} onChange={(event)=>patchJoin(row.id,{leftSource:event.target.value})}><option value="">Left source</option>{config.sources.map((path)=><option key={path} value={path}>{path.replace(/^variables\./,'')}</option>)}</select><input value={row.leftKey || ''} onChange={(event)=>patchJoin(row.id,{leftKey:event.target.value})} placeholder="Left join key"/><select value={row.rightSource || ''} onChange={(event)=>patchJoin(row.id,{rightSource:event.target.value})}><option value="">Right source</option>{config.sources.map((path)=><option key={path} value={path}>{path.replace(/^variables\./,'')}</option>)}</select><input value={row.rightKey || ''} onChange={(event)=>patchJoin(row.id,{rightKey:event.target.value})} placeholder="Right join key"/><button type="button" aria-label={`Remove join ${index+1}`} onClick={()=>patch({joins:config.joins.filter((item)=>item.id!==row.id)})}><Trash2 size={13}/></button></div>)}</div>
      <button type="button" className="gptb-inline-action" onClick={()=>patch({joins:[...config.joins,{id:uid('join'),leftSource:config.sources[0]||'',leftKey:'',rightSource:config.sources[1]||'',rightKey:''}]})}><Plus size={13}/> Add Join Keys</button>
    </section> : null}

    <section><h3>Map Source Data to Target Data</h3>
      <p className="gptb-help-text">Map a source field, fixed value, formula, aggregate, or value map to each target field.</p>
      <div className="gptb-transform-mappings">{config.mappings.map((row,index)=><div className="gptb-transform-mapping" key={row.id}>
        <div className="gptb-gr-sort-option-head"><strong>Mapping {index+1}</strong><button type="button" aria-label={`Remove mapping ${index+1}`} onClick={()=>patch({mappings:config.mappings.filter((item)=>item.id!==row.id)})}><Trash2 size={13}/></button></div>
        <label><span>Target Field <b>*</b></span><input value={row.targetField || ''} onChange={(event)=>patchMapping(row.id,{targetField:event.target.value})} placeholder={config.target.dataType === 'record' ? 'Target field API name' : 'value'}/></label>
        <label><span>Mapping Type</span><select value={row.mode || 'source'} onChange={(event)=>patchMapping(row.id,{mode:event.target.value})}><option value="source">Source Field</option><option value="fixed">Fixed Value</option><option value="formula">Formula</option><option value="aggregate">Aggregate</option><option value="value_map">Value Mapping</option></select></label>
        {row.mode === 'source' || row.mode === 'value_map' ? <label><span>Source Field <b>*</b></span><input value={row.source || ''} onChange={(event)=>patchMapping(row.id,{source:event.target.value})} placeholder="Example: item.Amount or SourceResource.Amount"/></label> : null}
        {row.mode === 'fixed' ? <label><span>Fixed Value</span><input value={row.fixedValue ?? ''} onChange={(event)=>patchMapping(row.id,{fixedValue:event.target.value})}/></label> : null}
        {row.mode === 'formula' ? <label><span>Formula <b>*</b></span><textarea rows={4} value={row.formula || ''} onChange={(event)=>patchMapping(row.id,{formula:event.target.value})} placeholder="Example: [$EachItem].Amount - 5"/><small>For collection mappings, use [$EachItem] to reference the current item.</small></label> : null}
        {row.mode === 'aggregate' ? <><label><span>Aggregate Type</span><select value={row.aggregateType || 'count'} onChange={(event)=>patchMapping(row.id,{aggregateType:event.target.value})}><option value="count">Count</option><option value="sum">Sum</option></select></label>{row.aggregateType === 'sum' ? <label><span>Field to Transform <b>*</b></span><input value={row.aggregateField || ''} onChange={(event)=>patchMapping(row.id,{aggregateField:event.target.value})} placeholder="Field API name"/></label> : null}</> : null}
        {row.mode === 'value_map' ? <label><span>Value Map <b>*</b></span><input value={row.valueMap || ''} onChange={(event)=>patchMapping(row.id,{valueMap:event.target.value})} placeholder="Value Map API name"/></label> : null}
      </div>)}</div>
      <button type="button" className="gptb-inline-action" onClick={()=>patch({mappings:[...config.mappings,{id:uid('map'),targetField:'',mode:'source',source:''}]})}><Plus size={13}/> Add Mapping</button>
    </section>

    {errors.length ? <div className="gptb-gr-errors"><b>Complete this Transform element</b>{errors.map((error)=><span key={error}>{error}</span>)}</div> : null}
  </div>
}
