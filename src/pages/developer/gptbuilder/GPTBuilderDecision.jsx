import { useEffect, useMemo } from 'react'
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'

const uid = () => globalThis.crypto?.randomUUID?.() || `dc-${Date.now()}-${Math.random().toString(36).slice(2)}`
const apiNameFromLabel = (label, fallback = 'Outcome') => {
  let value = String(label || '').trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '')
  if (!value) value = fallback
  if (!/^[A-Za-z]/.test(value)) value = `${fallback}_${value}`
  return value.slice(0,80).replace(/_+$/g,'')
}

export const DECISION_DEFAULTS = Object.freeze({
  logicMode: 'manual',
  splitMode: 'standard',
  splitResource: '',
  decisionInstructions: '',
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
  if (['date','field_value'].includes(c.splitMode) && !c.splitResource) errors.push(c.splitMode === 'date' ? 'Select a date resource to split.' : 'Select a resource to split by field value.')
  if (c.logicMode === 'ai' && flowType === 'record') errors.push('AI Decision isn’t supported for record-triggered flows.')
  if (c.logicMode === 'ai' && !String(c.decisionInstructions || '').trim()) errors.push('Enter Decision Instructions.')
  const apiNames = new Set()
  c.outcomes.forEach((outcome,index) => {
    if (!String(outcome.label || '').trim()) errors.push(`Outcome ${index + 1}: enter a label.`)
    const apiName = String(outcome.apiName || '')
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(apiName) || apiName.endsWith('_') || apiName.includes('__')) errors.push(`Outcome ${index + 1}: enter a valid API Name.`)
    if (apiNames.has(apiName.toLowerCase())) errors.push(`Outcome ${index + 1}: API Name must be unique.`)
    apiNames.add(apiName.toLowerCase())
    if (c.logicMode === 'ai') {
      if (!String(outcome.instructions || '').trim()) errors.push(`Outcome ${index + 1}: enter Outcome Instructions.`)
    } else {
      if (c.splitMode === 'standard' && !outcome.conditions?.length) errors.push(`Outcome ${index + 1}: add at least one condition.`)
      if (['date','field_value'].includes(c.splitMode) && (outcome.splitValue === '' || outcome.splitValue == null)) errors.push(`Outcome ${index + 1}: enter a split value.`)
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
    decisionLogic: c.logicMode,
    splitMode: c.splitMode || 'standard',
    splitResource: c.splitMode && c.splitMode !== 'standard' ? c.splitResource : undefined,
    decisionInstructions: c.logicMode === 'ai' ? c.decisionInstructions : undefined,
    outcomes: c.outcomes.map((outcome,index) => ({
      id: outcome.id || `outcome-${index + 1}`,
      label: outcome.label || `Outcome ${index + 1}`,
      apiName: outcome.apiName || apiNameFromLabel(outcome.label || `Outcome ${index + 1}`, `Outcome_${index + 1}`),
      instructions: c.logicMode === 'ai' ? outcome.instructions : undefined,
      branch: Array.isArray(outcome.branch) ? outcome.branch : [],
      splitValue: c.logicMode === 'manual' && c.splitMode !== 'standard' ? outcome.splitValue : undefined,
      condition: c.logicMode === 'manual' && c.splitMode === 'standard' ? {
        match: outcome.conditionLogic === 'any' ? 'any' : 'all',
        customConditionLogic: outcome.conditionLogic === 'custom' ? outcome.customConditionLogic : undefined,
        conditions: (outcome.conditions || []).map((row) => ({ field: row.resource, operator: row.operator, value: configuredValue(row) })),
      } : undefined,
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
    patch({ outcomes: [...config.outcomes, { id: uid(), label: `Outcome ${number}`, apiName: `Outcome_${number}`, conditionLogic: 'all', customConditionLogic: '', conditions: [], instructions: '', branch: [] }] })
  }

  return <div className="gptb-gr gptb-decision">
    <section><h3>Select Decision Logic</h3>
      <label className="gptb-gr-radio"><input type="radio" name={`dc-logic-${draft.id}`} checked={config.logicMode === 'manual'} onChange={() => patch({ logicMode: 'manual' })}/><span><b>Define Manually (Default)</b><small>Evaluate outcomes in the order shown and take the first matching path.</small></span></label>
      {flowType !== 'record' ? <label className="gptb-gr-radio"><input type="radio" name={`dc-logic-${draft.id}`} checked={config.logicMode === 'ai'} onChange={() => patch({ logicMode: 'ai' })}/><span><b>Define with AI (Advanced)</b><small>Use instructions to let AI choose the outcome.</small></span></label> : null}
    </section>

    {config.logicMode === 'manual' ? <section><h3>Decision Type</h3>
      <label><span>How to Split the Flow</span><select value={config.splitMode || 'standard'} onChange={(event) => patch({ splitMode: event.target.value, splitResource: event.target.value === 'standard' ? '' : config.splitResource })}><option value="standard">Use Conditions</option><option value="date">Split by Date</option><option value="field_value">Split by Field Value</option></select></label>
      {config.splitMode === 'date' ? <label><span>Date Resource <b>*</b></span><ResourcePicker resources={resources.filter((resource) => ['date','datetime'].includes(String(resource.dataType || '').toLowerCase()))} value={config.splitResource} onChange={(splitResource) => patch({ splitResource })}/></label> : null}
      {config.splitMode === 'field_value' ? <label><span>Resource <b>*</b></span><ResourcePicker resources={resources} value={config.splitResource} onChange={(splitResource) => patch({ splitResource })}/></label> : null}
    </section> : null}

    {config.logicMode === 'ai' ? <section><h3>Describe the Decision</h3><label><span>Decision Instructions <b>*</b></span><textarea rows={4} value={config.decisionInstructions} onChange={(event) => patch({ decisionInstructions: event.target.value })}/></label></section> : null}

    <section><h3>Outcome Order</h3>
      <div className="gptb-decision-outcomes">
        {config.outcomes.map((outcome,index) => <fieldset key={outcome.id}>
          <legend><span>Outcome {index + 1}</span><span><button type="button" aria-label={`Move outcome ${index + 1} up`} disabled={index===0} onClick={() => moveOutcome(index,-1)}><ChevronUp size={13}/></button><button type="button" aria-label={`Move outcome ${index + 1} down`} disabled={index===config.outcomes.length-1} onClick={() => moveOutcome(index,1)}><ChevronDown size={13}/></button><button type="button" aria-label={`Remove outcome ${index + 1}`} onClick={() => patch({ outcomes: config.outcomes.filter((item) => item.id !== outcome.id) })}><Trash2 size={13}/></button></span></legend>
          <label><span>Outcome Label <b>*</b></span><input value={outcome.label || ''} onChange={(event) => {
            const label = event.target.value
            patchOutcome(outcome.id,{ label, apiName: outcome.apiNameSource === 'manual' ? outcome.apiName : apiNameFromLabel(label,`Outcome_${index+1}`) })
          }}/></label>
          <label><span>Outcome API Name <b>*</b></span><input value={outcome.apiName || ''} onChange={(event) => patchOutcome(outcome.id,{apiName:event.target.value,apiNameSource:'manual'})}/></label>
          {config.logicMode === 'ai' ? <label><span>Outcome Instructions <b>*</b></span><textarea rows={3} value={outcome.instructions || ''} onChange={(event) => patchOutcome(outcome.id,{instructions:event.target.value})}/></label> : ['date','field_value'].includes(config.splitMode) ? <label><span>{config.splitMode === 'date' ? 'Date / Date-Time Value' : 'Field Value'} <b>*</b></span><input type={config.splitMode === 'date' ? 'datetime-local' : 'text'} value={outcome.splitValue ?? ''} onChange={(event) => patchOutcome(outcome.id,{splitValue:event.target.value})}/></label> : <>
            <label><span>Condition Requirements</span><select value={outcome.conditionLogic || 'all'} onChange={(event) => patchOutcome(outcome.id,{conditionLogic:event.target.value,customConditionLogic:event.target.value === 'custom' ? outcome.customConditionLogic : ''})}><option value="all">All Conditions Are Met (AND)</option><option value="any">Any Condition Is Met (OR)</option><option value="custom">Custom Condition Logic Is Met</option></select></label>
            <div className="gptb-gr-field-assignments">{(outcome.conditions || []).map((row,rowIndex) => <div key={row.id}><span>{rowIndex+1}</span><ResourcePicker resources={resources} value={row.resource} onChange={(resource) => patchOutcome(outcome.id,{conditions:outcome.conditions.map((item)=>item.id===row.id?{...item,resource}:item)})}/><select value={row.operator || 'equals'} onChange={(event) => patchOutcome(outcome.id,{conditions:outcome.conditions.map((item)=>item.id===row.id?{...item,operator:event.target.value}:item)})}><option value="equals">Equals</option><option value="not_equals">Does Not Equal</option><option value="greater_than">Greater Than</option><option value="greater_than_or_equal">Greater Than or Equal</option><option value="less_than">Less Than</option><option value="less_than_or_equal">Less Than or Equal</option><option value="contains">Contains</option><option value="starts_with">Starts With</option><option value="ends_with">Ends With</option><option value="is_null">Is Null</option></select><div className="gptb-gr-value"><button type="button" onClick={() => patchOutcome(outcome.id,{conditions:outcome.conditions.map((item)=>item.id===row.id?{...item,valueMode:item.valueMode==='resource'?'literal':'resource',value:''}:item)})}>{row.valueMode === 'resource' ? 'Resource' : 'Value'}</button><input value={row.value ?? ''} onChange={(event) => patchOutcome(outcome.id,{conditions:outcome.conditions.map((item)=>item.id===row.id?{...item,value:event.target.value}:item)})}/></div><button type="button" aria-label={`Remove outcome ${index+1} condition ${rowIndex+1}`} onClick={() => patchOutcome(outcome.id,{conditions:outcome.conditions.filter((item)=>item.id!==row.id)})}><Trash2 size={13}/></button></div>)}</div>
            <button type="button" className="gptb-inline-action" onClick={() => patchOutcome(outcome.id,{conditions:[...(outcome.conditions||[]),{id:uid(),resource:'',operator:'equals',valueMode:'literal',value:''}]})}><Plus size={13}/> Add Condition</button>
            {outcome.conditionLogic === 'custom' ? <label><span>Condition Logic <b>*</b></span><input maxLength={1000} value={outcome.customConditionLogic || ''} onChange={(event) => patchOutcome(outcome.id,{customConditionLogic:event.target.value})} placeholder="Example: 1 AND NOT(2 OR 3)"/></label> : null}
          </>}
        </fieldset>)}
      </div>
      <button type="button" className="gptb-inline-action" onClick={addOutcome}><Plus size={13}/> New Outcome</button>
      <label><span>Default Outcome Label</span><input value={config.defaultLabel} onChange={(event) => patch({defaultLabel:event.target.value})}/></label>
    </section>

    {errors.length ? <div className="gptb-gr-errors"><b>Complete this Decision element</b>{errors.map((error) => <span key={error}>{error}</span>)}</div> : null}
  </div>
}
