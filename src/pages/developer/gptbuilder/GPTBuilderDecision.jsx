import { useEffect, useMemo, useState } from 'react'
import { ChevronUp, ChevronDown, Plus, Search, Trash2 } from 'lucide-react'
import { compatibleDecisionResources, decisionConfigErrors, decisionOperators, decisionResourcePath, decisionResourceType, normalizeDecisionConfig } from './GPTBuilderDecisionLogic'
export { DECISION_DEFAULTS, decisionConfigErrors, normalizeDecisionConfig } from './GPTBuilderDecisionLogic'

const uid = () => globalThis.crypto?.randomUUID?.() || `dc-${Date.now()}-${Math.random().toString(36).slice(2)}`
const apiNameFromLabel = (label, fallback = 'Outcome') => {
  let value = String(label || '').trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '')
  if (!value) value = fallback
  if (!/^[A-Za-z]/.test(value)) value = `${fallback}_${value}`
  return value.slice(0,80).replace(/_+$/g,'')
}

const configuredValue = (row) => row.valueMode === 'resource' ? { path: row.value } : row.value

export function decisionRuntimeAction(instance) {
  const c = normalizeDecisionConfig(instance?.config)
  return {
    id: instance.id,
    key: 'CONDITION',
    label: instance.label,
    apiName: instance.apiName,
    description: instance.description || '',
    decisionLogic: c.logicMode,
    splitResource: c.logicMode === 'manual' ? undefined : c.splitResource,
    outcomes: c.outcomes.map((outcome,index) => ({
      id: outcome.id || `outcome-${index + 1}`,
      label: outcome.label || `Outcome ${index + 1}`,
      apiName: outcome.apiName || apiNameFromLabel(outcome.label || `Outcome ${index + 1}`, `Outcome_${index + 1}`),
      branch: Array.isArray(outcome.branch) ? outcome.branch : [],
      splitValue: c.logicMode === 'manual' ? undefined : outcome.splitValue,
      condition: c.logicMode === 'manual' ? {
        match: outcome.conditionLogic === 'any' ? 'any' : 'all',
        customConditionLogic: outcome.conditionLogic === 'custom' ? outcome.customConditionLogic : undefined,
        conditions: (outcome.conditions || []).map((row) => ({ field: row.resource, operator: row.operator, value: configuredValue(row) })),
      } : undefined,
    })),
    defaultLabel: c.defaultLabel || 'Default Outcome',
    defaultBranch: Array.isArray(c.defaultBranch) ? c.defaultBranch : [],
  }
}

function ResourcePicker({ resources, value, onChange, allowedResources = resources }) {
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const visible = allowedResources.filter((item) => {
    if (!needle) return true
    return `${item.label || ''} ${item.apiName || ''} ${decisionResourcePath(item)} ${item.dataType || ''}`.toLowerCase().includes(needle)
  })
  const selected = allowedResources.find((item) => decisionResourcePath(item) === value)
  const options = selected && !visible.some((item) => decisionResourcePath(item) === value) ? [selected, ...visible] : visible
  return <div className="gptb-resource-picker">
    <label className="gptb-resource-search"><Search size={12}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search resources and fields..." aria-label="Search resources and fields"/></label>
    <select value={value || ''} onChange={(event) => onChange(event.target.value)} aria-label="Resource">
      <option value="">Select a resource</option>
      {options.map((item) => <option key={item.id || item.apiName || decisionResourcePath(item)} value={decisionResourcePath(item)}>{item.label || item.apiName}{item.path && item.path !== item.label ? ` · ${item.path}` : ''}</option>)}
    </select>
  </div>
}

export default function GPTBuilderDecision({ draft, updateConfig, resources, flowType, onConfiguredChange }) {
  const config = normalizeDecisionConfig(draft.config)
  const [keyboardOutcome,setKeyboardOutcome]=useState(null)
  const errors = useMemo(() => decisionConfigErrors(config, flowType, resources), [JSON.stringify(config), flowType, JSON.stringify(resources)])
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

  const splitCandidates = resources.filter((resource) => !resource?.isCollection && (config.logicMode !== 'date' || ['date','datetime'].includes(decisionResourceType(resource))))

  return <div className="gptb-gr gptb-decision">
    <section><h3>Decision Mode</h3>
      <label><span>How to Determine Outcomes</span><select value={config.logicMode || 'manual'} onChange={(event) => patch({logicMode:event.target.value,splitResource:'',outcomes:config.outcomes.map((outcome)=>({...outcome,splitValue:''}))})}><option value="manual">Conditions</option><option value="date">Split by Date</option><option value="field_value">Split by Field Value</option></select></label>
      {config.logicMode !== 'manual' ? <label><span>{config.logicMode === 'date' ? 'Date / Date-Time Resource' : 'Resource'} <b>*</b></span><ResourcePicker resources={resources} allowedResources={splitCandidates} value={config.splitResource} onChange={(splitResource)=>patch({splitResource})}/></label> : null}
    </section>
    <section><h3>Outcome Order</h3>
      <p className="gptb-help-text">To reorder a row, press Spacebar. To move the selected row, use the arrow keys.</p>
      <div className="gptb-decision-outcomes">
        {config.outcomes.map((outcome,index) => <fieldset key={outcome.id} tabIndex={0} aria-label={`Outcome ${index+1}: ${outcome.label||'Untitled'}`} data-keyboard-reorder={keyboardOutcome===index?'selected':'idle'} onKeyDown={(event)=>{if(event.target!==event.currentTarget)return;if(event.key===' '){event.preventDefault();setKeyboardOutcome((current)=>current===index?null:index);return}if(keyboardOutcome===index&&['ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();const direction=event.key==='ArrowUp'?-1:1;const target=index+direction;if(target>=0&&target<config.outcomes.length){moveOutcome(index,direction);setKeyboardOutcome(target)}}}}>
          <legend><span>Outcome {index + 1}</span><span><button type="button" aria-label={`Move outcome ${index + 1} up`} disabled={index===0} onClick={() => moveOutcome(index,-1)}><ChevronUp size={13}/></button><button type="button" aria-label={`Move outcome ${index + 1} down`} disabled={index===config.outcomes.length-1} onClick={() => moveOutcome(index,1)}><ChevronDown size={13}/></button><button type="button" aria-label={`Remove outcome ${index + 1}`} onClick={() => patch({ outcomes: config.outcomes.filter((item) => item.id !== outcome.id) })}><Trash2 size={13}/></button></span></legend>
          <label><span>Outcome Label <b>*</b></span><input value={outcome.label || ''} onChange={(event) => {
            const label = event.target.value
            patchOutcome(outcome.id,{ label, apiName: outcome.apiNameSource === 'manual' ? outcome.apiName : apiNameFromLabel(label,`Outcome_${index+1}`) })
          }}/></label>
          <label><span>Outcome API Name <b>*</b></span><input value={outcome.apiName || ''} onChange={(event) => patchOutcome(outcome.id,{apiName:event.target.value,apiNameSource:'manual'})}/></label>
          {config.logicMode !== 'manual' ? <label><span>{config.logicMode === 'date' ? 'Date / Date-Time Value' : 'Value'} <b>*</b></span><input type={config.logicMode === 'date' ? 'datetime-local' : 'text'} value={outcome.splitValue ?? ''} onChange={(event)=>patchOutcome(outcome.id,{splitValue:event.target.value})}/></label> : <>
            <label><span>Condition Requirements</span><select value={outcome.conditionLogic || 'all'} onChange={(event) => patchOutcome(outcome.id,{conditionLogic:event.target.value,customConditionLogic:event.target.value === 'custom' ? outcome.customConditionLogic : ''})}><option value="all">All Conditions Are Met (AND)</option><option value="any">Any Condition Is Met (OR)</option><option value="custom">Custom Condition Logic Is Met</option></select></label>
            <div className="gptb-gr-field-assignments">{(outcome.conditions || []).map((row,rowIndex) => <div key={row.id}><span>{rowIndex+1}</span>{(() => { const selectedResource = resources.find((item) => decisionResourcePath(item) === row.resource); const ops = decisionOperators(decisionResourceType(selectedResource)); return <><ResourcePicker resources={resources} value={row.resource} onChange={(resource) => patchOutcome(outcome.id,{conditions:outcome.conditions.map((item)=>item.id===row.id?{...item,resource,operator:'equals',value:'',valueMode:'literal'}:item)})}/><select value={row.operator || 'equals'} onChange={(event) => patchOutcome(outcome.id,{conditions:outcome.conditions.map((item)=>item.id===row.id?{...item,operator:event.target.value,value:event.target.value==='is_null'?true:'',valueMode:'literal'}:item)})}>{ops.map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select>{row.operator === 'is_null' ? <select value={String(row.value ?? true)} onChange={(event) => patchOutcome(outcome.id,{conditions:outcome.conditions.map((item)=>item.id===row.id?{...item,value:event.target.value==='true'}:item)})}><option value="true">True</option><option value="false">False</option></select> : <div className="gptb-gr-value"><button type="button" onClick={() => patchOutcome(outcome.id,{conditions:outcome.conditions.map((item)=>item.id===row.id?{...item,valueMode:item.valueMode==='resource'?'literal':'resource',value:''}:item)})}>{row.valueMode === 'resource' ? 'Resource' : 'Value'}</button>{row.valueMode === 'resource' ? <ResourcePicker resources={resources} allowedResources={compatibleDecisionResources(resources, selectedResource)} value={row.value} onChange={(value) => patchOutcome(outcome.id,{conditions:outcome.conditions.map((item)=>item.id===row.id?{...item,value}:item)})}/> : <input value={row.value ?? ''} onChange={(event) => patchOutcome(outcome.id,{conditions:outcome.conditions.map((item)=>item.id===row.id?{...item,value:event.target.value}:item)})}/>}</div>}</> })()}<button type="button" aria-label={`Remove outcome ${index+1} condition ${rowIndex+1}`} onClick={() => patchOutcome(outcome.id,{conditions:outcome.conditions.filter((item)=>item.id!==row.id)})}><Trash2 size={13}/></button></div>)}</div>
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
