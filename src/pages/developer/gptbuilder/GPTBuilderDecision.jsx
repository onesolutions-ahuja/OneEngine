import { useEffect, useMemo } from 'react'
import { ChevronUp, ChevronDown, Plus, Trash2 } from 'lucide-react'

const uid = () => globalThis.crypto?.randomUUID?.() || `dc-${Date.now()}-${Math.random().toString(36).slice(2)}`
const apiNameFromLabel = (label, fallback = 'Outcome') => {
  let value = String(label || '').trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '')
  if (!value) value = fallback
  if (!/^[A-Za-z]/.test(value)) value = `${fallback}_${value}`
  return value.slice(0,80).replace(/_+$/g,'')
}

export const DECISION_DEFAULTS = Object.freeze({
  logicMode: 'manual',
  outcomes: [],
  defaultLabel: 'Default Outcome',
  defaultBranch: [],
})

export function normalizeDecisionConfig(config = {}) {
  return {
    ...DECISION_DEFAULTS,
    ...config,
    outcomes: Array.isArray(config.outcomes) ? config.outcomes : [],
  }
}

export function decisionConfigErrors(config = {}, flowType = '') {
  const c = normalizeDecisionConfig(config)
  const errors = []
  if (!c.outcomes.length) errors.push('Add at least one outcome.')
  const apiNames = new Set()
  c.outcomes.forEach((outcome,index) => {
    if (!String(outcome.label || '').trim()) errors.push(`Outcome ${index + 1}: enter a label.`)
    const apiName = String(outcome.apiName || '')
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(apiName) || apiName.endsWith('_') || apiName.includes('__')) errors.push(`Outcome ${index + 1}: enter a valid API Name.`)
    if (apiNames.has(apiName.toLowerCase())) errors.push(`Outcome ${index + 1}: API Name must be unique.`)
    apiNames.add(apiName.toLowerCase())
    {
      if (!outcome.conditions?.length) errors.push(`Outcome ${index + 1}: add at least one condition.`)
      if (outcome.conditionLogic === 'custom' && !String(outcome.customConditionLogic || '').trim()) errors.push(`Outcome ${index + 1}: enter custom condition logic.`)
      ;(outcome.conditions || []).forEach((row,rowIndex) => {
        if (!row.resource) errors.push(`Outcome ${index + 1}, condition ${rowIndex + 1}: select a resource.`)
        if (!row.operator) errors.push(`Outcome ${index + 1}, condition ${rowIndex + 1}: select an operator.`)
        if (row.value === '' || row.value == null) errors.push(`Outcome ${index + 1}, condition ${rowIndex + 1}: enter or select a value.`)
      })
    }
  })
  return errors
}

const configuredValue = (row) => row.valueMode === 'resource' ? { path: row.value } : row.value
const resourcePath = (resource) => resource?.path || (resource?.apiName ? 'variables.' + resource.apiName : '')

export function decisionRuntimeAction(instance) {
  const c = normalizeDecisionConfig(instance?.config)
  return {
    id: instance.id,
    key: 'CONDITION',
    label: instance.label,
    apiName: instance.apiName,
    description: instance.description || '',
    decisionLogic: 'manual',
    outcomes: c.outcomes.map((outcome,index) => ({
      id: outcome.id || `outcome-${index + 1}`,
      label: outcome.label || `Outcome ${index + 1}`,
      apiName: outcome.apiName || apiNameFromLabel(outcome.label || `Outcome ${index + 1}`, `Outcome_${index + 1}`),
      branch: Array.isArray(outcome.branch) ? outcome.branch : [],
      condition: {
        match: outcome.conditionLogic === 'any' ? 'any' : 'all',
        customConditionLogic: outcome.conditionLogic === 'custom' ? outcome.customConditionLogic : undefined,
        conditions: (outcome.conditions || []).map((row) => ({ field: row.resource, operator: row.operator, value: configuredValue(row) })),
      },
    })),
    defaultLabel: c.defaultLabel || 'Default Outcome',
    defaultBranch: Array.isArray(c.defaultBranch) ? c.defaultBranch : [],
  }
}

function ResourcePicker({ resources, value, onChange }) {
  return <select value={value || ''} onChange={(event) => onChange(event.target.value)}>
    <option value="">Select a resource</option>
    {resources.map((item) => <option key={item.id || item.apiName} value={resourcePath(item)}>{item.label || item.apiName}</option>)}
  </select>
}

export default function GPTBuilderDecision({ draft, updateConfig, resources, flowType, onConfiguredChange }) {
  const config = normalizeDecisionConfig(draft.config)
  const errors = useMemo(() => decisionConfigErrors(config, flowType), [JSON.stringify(config), flowType])
  useEffect(() => { onConfiguredChange?.(errors.length === 0, errors) }, [JSON.stringify(errors)])

  const patch = (changes) => updateConfig({ ...config, ...changes })
  const patchOutcome = (id, changes) => patch({ outcomes: config.outcomes.map((outcome) => outcome.id === id ? { ...outcome, ...changes } : outcome) })
  const moveOutcome = (index, direction) => {
    const target = index + direction
    if (target < 0 || target >= config.outcomes.length) return
    const next = [...config.outcomes]
    ;[next[index],next[target]] = [next[target],next[index]]
    patch({ outcomes: next })
  }
  const addOutcome = () => {
    const number = config.outcomes.length + 1
    patch({ outcomes: [...config.outcomes, { id: uid(), label: `Outcome ${number}`, apiName: `Outcome_${number}`, conditionLogic: 'all', customConditionLogic: '', conditions: [], branch: [] }] })
  }

  return <div className="gptb-gr gptb-decision">
    <section><h3>Outcome Order</h3>
      <div className="gptb-decision-outcomes">
        {config.outcomes.map((outcome,index) => <fieldset key={outcome.id}>
          <legend><span>Outcome {index + 1}</span><span><button type="button" aria-label={`Move outcome ${index + 1} up`} disabled={index===0} onClick={() => moveOutcome(index,-1)}><ChevronUp size={13}/></button><button type="button" aria-label={`Move outcome ${index + 1} down`} disabled={index===config.outcomes.length-1} onClick={() => moveOutcome(index,1)}><ChevronDown size={13}/></button><button type="button" aria-label={`Remove outcome ${index + 1}`} onClick={() => patch({ outcomes: config.outcomes.filter((item) => item.id !== outcome.id) })}><Trash2 size={13}/></button></span></legend>
          <label><span>Outcome Label <b>*</b></span><input value={outcome.label || ''} onChange={(event) => {
            const label = event.target.value
            patchOutcome(outcome.id,{ label, apiName: outcome.apiNameSource === 'manual' ? outcome.apiName : apiNameFromLabel(label,`Outcome_${index+1}`) })
          }}/></label>
          <label><span>Outcome API Name <b>*</b></span><input value={outcome.apiName || ''} onChange={(event) => patchOutcome(outcome.id,{apiName:event.target.value,apiNameSource:'manual'})}/></label>
          <>
            <label><span>Condition Requirements</span><select value={outcome.conditionLogic || 'all'} onChange={(event) => patchOutcome(outcome.id,{conditionLogic:event.target.value,customConditionLogic:event.target.value === 'custom' ? outcome.customConditionLogic : ''})}><option value="all">All Conditions Are Met (AND)</option><option value="any">Any Condition Is Met (OR)</option><option value="custom">Custom Condition Logic Is Met</option></select></label>
            <div className="gptb-gr-field-assignments">{(outcome.conditions || []).map((row,rowIndex) => <div key={row.id}><span>{rowIndex+1}</span><ResourcePicker resources={resources} value={row.resource} onChange={(resource) => patchOutcome(outcome.id,{conditions:outcome.conditions.map((item)=>item.id===row.id?{...item,resource}:item)})}/><select value={row.operator || 'equals'} onChange={(event) => patchOutcome(outcome.id,{conditions:outcome.conditions.map((item)=>item.id===row.id?{...item,operator:event.target.value}:item)})}><option value="equals">Equals</option><option value="not_equals">Does Not Equal</option><option value="greater_than">Greater Than</option><option value="greater_than_or_equal">Greater Than or Equal</option><option value="less_than">Less Than</option><option value="less_than_or_equal">Less Than or Equal</option><option value="contains">Contains</option><option value="starts_with">Starts With</option><option value="ends_with">Ends With</option><option value="is_null">Is Null</option></select><div className="gptb-gr-value"><button type="button" onClick={() => patchOutcome(outcome.id,{conditions:outcome.conditions.map((item)=>item.id===row.id?{...item,valueMode:item.valueMode==='resource'?'literal':'resource',value:''}:item)})}>{row.valueMode === 'resource' ? 'Resource' : 'Value'}</button><input value={row.value ?? ''} onChange={(event) => patchOutcome(outcome.id,{conditions:outcome.conditions.map((item)=>item.id===row.id?{...item,value:event.target.value}:item)})}/></div><button type="button" aria-label={`Remove outcome ${index+1} condition ${rowIndex+1}`} onClick={() => patchOutcome(outcome.id,{conditions:outcome.conditions.filter((item)=>item.id!==row.id)})}><Trash2 size={13}/></button></div>)}</div>
            <button type="button" className="gptb-inline-action" onClick={() => patchOutcome(outcome.id,{conditions:[...(outcome.conditions||[]),{id:uid(),resource:'',operator:'equals',valueMode:'literal',value:''}]})}><Plus size={13}/> Add Condition</button>
            {outcome.conditionLogic === 'custom' ? <label><span>Condition Logic <b>*</b></span><input maxLength={1000} value={outcome.customConditionLogic || ''} onChange={(event) => patchOutcome(outcome.id,{customConditionLogic:event.target.value})} placeholder="Example: 1 AND NOT(2 OR 3)"/></label> : null}
          </>
        </fieldset>)}
      </div>
      <button type="button" className="gptb-inline-action" onClick={addOutcome}><Plus size={13}/> New Outcome</button>
      <label><span>Default Outcome Label</span><input value={config.defaultLabel} onChange={(event) => patch({defaultLabel:event.target.value})}/></label>
    </section>

    {errors.length ? <div className="gptb-gr-errors"><b>Complete this Decision element</b>{errors.map((error) => <span key={error}>{error}</span>)}</div> : null}
  </div>
}
