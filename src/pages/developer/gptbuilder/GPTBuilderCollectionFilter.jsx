import { useEffect, useMemo } from 'react'
import { Plus, Trash2 } from 'lucide-react'

const uid = () => globalThis.crypto?.randomUUID?.() || `cf-${Date.now()}-${Math.random().toString(36).slice(2)}`
const resourcePath = (resource) => resource ? `variables.${resource.apiName}` : ''

export const COLLECTION_FILTER_DEFAULTS = Object.freeze({
  collection: '',
  conditionMode: 'all',
  customConditionLogic: '',
  formula: '',
  conditions: [],
})

export function normalizeCollectionFilterConfig(config = {}) {
  return { ...COLLECTION_FILTER_DEFAULTS, ...config, conditions: Array.isArray(config.conditions) ? config.conditions : [] }
}

export function collectionFilterConfigErrors(config = {}, resources = []) {
  const c = normalizeCollectionFilterConfig(config)
  const errors = []
  const selected = resources.find((resource) => resourcePath(resource) === c.collection)
  if (!c.collection) errors.push('Select a collection.')
  else if (!selected?.isCollection) errors.push('Selected resource must be a collection.')
  if (c.conditionMode === 'formula') {
    if (!String(c.formula || '').trim()) errors.push('Enter a formula.')
  } else {
    if (!c.conditions.length) errors.push('Add at least one condition.')
    if (c.conditionMode === 'custom' && !String(c.customConditionLogic || '').trim()) errors.push('Enter custom condition logic.')
    c.conditions.forEach((row,index) => {
      if (!row.field) errors.push(`Condition ${index + 1}: select a field or current-item value.`)
      if (!row.operator) errors.push(`Condition ${index + 1}: select an operator.`)
      if (!['is_empty','is_not_empty'].includes(row.operator) && (row.value === '' || row.value == null)) errors.push(`Condition ${index + 1}: enter or select a value.`)
    })
  }
  return errors
}

const configuredValue = (row) => row.valueMode === 'resource' ? { path: row.value } : row.value

export function collectionFilterRuntimeAction(instance, resources = []) {
  const c = normalizeCollectionFilterConfig(instance?.config)
  const selected = resources.find((resource) => resourcePath(resource) === c.collection)
  const api = String(instance?.apiName || 'CollectionFilter').replace(/[^A-Za-z0-9_]/g,'_')
  return {
    id: instance.id,
    key: 'COLLECTION_FILTER',
    label: instance.label,
    apiName: instance.apiName,
    description: instance.description || '',
    collection: c.collection,
    currentItemVariable: `CurrentItem_${api}`,
    outputVariable: api,
    itemType: selected?.dataType || 'text',
    itemObjectKey: selected?.objectKey || '',
    mode: c.conditionMode,
    match: c.conditionMode === 'any' ? 'any' : 'all',
    customConditionLogic: c.conditionMode === 'custom' ? c.customConditionLogic : undefined,
    formula: c.conditionMode === 'formula' ? c.formula : undefined,
    filters: c.conditionMode === 'formula' ? [] : c.conditions.map((row) => ({
      field: row.field,
      operator: row.operator,
      value: ['is_empty','is_not_empty'].includes(row.operator) ? undefined : configuredValue(row),
    })),
  }
}

export default function GPTBuilderCollectionFilter({ draft, updateConfig, resources, onConfiguredChange }) {
  const config = normalizeCollectionFilterConfig(draft.config)
  const selected = resources.find((resource) => resourcePath(resource) === config.collection)
  const errors = useMemo(() => collectionFilterConfigErrors(config, resources), [JSON.stringify(config), JSON.stringify(resources)])
  useEffect(() => { onConfiguredChange?.(errors.length === 0, errors) }, [JSON.stringify(errors)])
  const patch = (changes) => updateConfig({ ...config, ...changes })
  const patchCondition = (id, changes) => patch({ conditions: config.conditions.map((row) => row.id === id ? { ...row, ...changes } : row) })
  const api = String(draft.apiName || 'CollectionFilter').replace(/[^A-Za-z0-9_]/g,'_')

  return <div className="gptb-gr gptb-collection-filter">
    <section><h3>Filter Collection</h3>
      <label><span>Collection <b>*</b></span><select value={config.collection} onChange={(event) => patch({collection:event.target.value,conditions:[],formula:'',customConditionLogic:''})}><option value="">Select a collection</option>{resources.filter((resource)=>resource.isCollection).map((resource)=><option key={resource.id || resource.apiName} value={resourcePath(resource)}>{resource.label || resource.apiName}</option>)}</select>{selected ? <small>{selected.objectKey ? `Record Collection · ${selected.objectKey}` : `${selected.dataType || 'Text'} Collection`}</small> : null}</label>
    </section>
    <section><h3>Apply Filter Conditions</h3>
      <label><span>Condition Requirements</span><select value={config.conditionMode} onChange={(event)=>patch({conditionMode:event.target.value,customConditionLogic:'',formula:''})}><option value="all">All Conditions Are Met (AND)</option><option value="any">Any Condition Is Met (OR)</option><option value="custom">Custom Condition Logic Is Met</option><option value="formula">Formula Evaluates to True</option></select></label>
      {config.conditionMode === 'formula' ? <label><span>Formula <b>*</b></span><textarea rows={5} value={config.formula} onChange={(event)=>patch({formula:event.target.value})} placeholder={`Example: CurrentItem_${api}.Amount > 100`}/><small>The formula must evaluate to true or false for each item.</small></label> : <>
        <div className="gptb-gr-field-assignments">{config.conditions.map((row,index)=><div key={row.id}><span>{index+1}</span><input value={row.field || ''} placeholder={selected?.objectKey ? 'Field API Name' : 'Current Item'} onChange={(event)=>patchCondition(row.id,{field:event.target.value})}/><select value={row.operator || 'equals'} onChange={(event)=>patchCondition(row.id,{operator:event.target.value,value:['is_empty','is_not_empty'].includes(event.target.value)?'':row.value})}><option value="equals">Equals</option><option value="not_equals">Does Not Equal</option><option value="greater_than">Greater Than</option><option value="greater_than_or_equal">Greater Than or Equal</option><option value="less_than">Less Than</option><option value="less_than_or_equal">Less Than or Equal</option><option value="contains">Contains</option><option value="is_empty">Is Empty</option><option value="is_not_empty">Is Not Empty</option></select>{!['is_empty','is_not_empty'].includes(row.operator) ? <div className="gptb-gr-value"><button type="button" onClick={()=>patchCondition(row.id,{valueMode:row.valueMode==='resource'?'literal':'resource',value:''})}>{row.valueMode==='resource'?'Resource':'Value'}</button><input value={row.value ?? ''} onChange={(event)=>patchCondition(row.id,{value:event.target.value})}/></div> : <span/>}<button type="button" aria-label={`Remove condition ${index+1}`} onClick={()=>patch({conditions:config.conditions.filter((item)=>item.id!==row.id)})}><Trash2 size={13}/></button></div>)}</div>
        <button type="button" className="gptb-inline-action" onClick={()=>patch({conditions:[...config.conditions,{id:uid(),field:'',operator:'equals',valueMode:'literal',value:''}]})}><Plus size={13}/> Add Condition</button>
        {config.conditionMode === 'custom' ? <label><span>Condition Logic <b>*</b></span><input value={config.customConditionLogic} onChange={(event)=>patch({customConditionLogic:event.target.value})} placeholder="Example: 1 AND (2 OR 3)"/></label> : null}
      </>}
    </section>
    <section><h3>Generated Resources</h3><p><b>Output Collection:</b> {draft.apiName || 'CollectionFilter'}</p><p><b>Current Item:</b> CurrentItem_{api}</p><small>The source collection is unchanged. These resources become available after this element runs.</small></section>
    {errors.length ? <div className="gptb-gr-errors"><b>Complete this Collection Filter element</b>{errors.map((error)=><span key={error}>{error}</span>)}</div> : null}
  </div>
}
