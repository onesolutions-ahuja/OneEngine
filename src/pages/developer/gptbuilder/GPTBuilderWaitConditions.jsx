import { useEffect, useMemo } from 'react'
import { Plus, Trash2 } from 'lucide-react'

const uid = (prefix='wc') => globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`

export const WAIT_CONDITIONS_DEFAULTS = Object.freeze({ configurations: [] })

export function normalizeWaitConditionsConfig(config = {}) {
  if (Array.isArray(config.configurations)) return { ...WAIT_CONDITIONS_DEFAULTS, ...config, configurations: config.configurations }
  if (config.waitCondition) {
    return {
      configurations: [{
        id: 'legacy-wait-1',
        label: 'Wait Configuration',
        conditionMode: config.waitCondition.match || 'all',
        customConditionLogic: config.waitCondition.conditionLogic || '',
        conditions: config.waitCondition.conditions || [],
        resumeEvent: { type: 'specific_time', baseTime: config.maxWaitUntil || '$Flow.CurrentDateTime', offsetNumber: 0, offsetUnit: 'hours' },
      }],
    }
  }
  return { ...WAIT_CONDITIONS_DEFAULTS, ...config }
}

export function waitConditionsConfigErrors(config = {}) {
  const c = normalizeWaitConditionsConfig(config)
  const errors = []
  if (!c.configurations.length) errors.push('Add at least one Wait Configuration.')
  c.configurations.forEach((row,index) => {
    const name = `Wait Configuration ${index+1}`
    if (!String(row.label || '').trim()) errors.push(`${name}: enter a label.`)
    if (!['always','all','any','custom'].includes(row.conditionMode || 'always')) errors.push(`${name}: select valid condition requirements.`)
    if (row.conditionMode !== 'always') {
      if (!Array.isArray(row.conditions) || !row.conditions.length) errors.push(`${name}: add at least one wait condition.`)
      if (row.conditionMode === 'custom' && !String(row.customConditionLogic || '').trim()) errors.push(`${name}: enter custom condition logic.`)
      ;(row.conditions || []).forEach((condition, conditionIndex) => {
        if (!String(condition.resource || '').trim()) errors.push(`${name}, condition ${conditionIndex+1}: select a resource.`)
        if (!String(condition.operator || '').trim()) errors.push(`${name}, condition ${conditionIndex+1}: select an operator.`)
        if (!['is_null','is_not_null'].includes(condition.operator) && (condition.value === '' || condition.value == null)) errors.push(`${name}, condition ${conditionIndex+1}: enter a value.`)
      })
    }
    const event = row.resumeEvent || {}
    if (!['specific_time','platform_event'].includes(event.type)) errors.push(`${name}: select a resume event.`)
    if (event.type === 'specific_time') {
      if (!String(event.baseTime || '').trim()) errors.push(`${name}: select a base time.`)
      if (event.offsetNumber !== '' && event.offsetNumber != null && !Number.isInteger(Number(event.offsetNumber))) errors.push(`${name}: offset number must be a whole number.`)
      if (event.offsetNumber !== '' && event.offsetNumber != null && !['hours','days'].includes(event.offsetUnit)) errors.push(`${name}: offset unit must be Hours or Days.`)
    }
    if (event.type === 'platform_event') {
      if (!String(event.eventType || '').trim()) errors.push(`${name}: select a platform event.`)
      ;(event.conditions || []).forEach((condition, conditionIndex) => {
        if (!condition.field || !condition.operator) errors.push(`${name}, platform event condition ${conditionIndex+1}: complete field and operator.`)
      })
    }
  })
  return errors
}

function conditionRuntime(configuration) {
  if (configuration.conditionMode === 'always') return null
  return {
    match: configuration.conditionMode === 'any' ? 'any' : configuration.conditionMode === 'custom' ? 'custom' : 'all',
    conditionLogic: configuration.conditionMode === 'custom' ? configuration.customConditionLogic || '' : '',
    conditions: (configuration.conditions || []).map((row)=>({ field: row.resource, operator: row.operator, value: row.value })),
  }
}

export function waitConditionsRuntimeAction(instance) {
  const c = normalizeWaitConditionsConfig(instance?.config)
  return {
    id: instance.id,
    key: 'WAIT_FOR_CONDITIONS',
    label: instance.label,
    apiName: instance.apiName,
    description: instance.description || '',
    waitConfigurations: c.configurations.map((row)=>({
      id: row.id,
      label: row.label,
      waitCondition: conditionRuntime(row),
      resumeEvent: row.resumeEvent,
    })),
  }
}

const OPERATORS = [
  ['equals','Equals'],['not_equals','Does Not Equal'],['greater_than','Greater Than'],['greater_than_or_equal','Greater Than or Equal'],
  ['less_than','Less Than'],['less_than_or_equal','Less Than or Equal'],['contains','Contains'],['starts_with','Starts With'],['ends_with','Ends With'],
  ['is_null','Is Null'],['is_not_null','Is Not Null'],
]

export default function GPTBuilderWaitConditions({ draft, updateConfig, eventTypes = [], onConfiguredChange }) {
  const config = normalizeWaitConditionsConfig(draft.config)
  const errors = useMemo(()=>waitConditionsConfigErrors(config),[JSON.stringify(config)])
  useEffect(()=>{ onConfiguredChange?.(errors.length===0,errors) },[JSON.stringify(errors)])
  const patch=(changes)=>updateConfig({...config,...changes})
  const patchConfiguration=(id,changes)=>patch({configurations:config.configurations.map((row)=>row.id===id?{...row,...changes}:row)})
  const patchCondition=(configId,conditionId,changes)=>patchConfiguration(configId,{conditions:(config.configurations.find((row)=>row.id===configId)?.conditions||[]).map((row)=>row.id===conditionId?{...row,...changes}:row)})
  const patchResume=(id,changes)=>{
    const row=config.configurations.find((item)=>item.id===id)
    patchConfiguration(id,{resumeEvent:{...(row?.resumeEvent||{}),...changes}})
  }

  return <div className="gptb-gr gptb-wait-conditions">
    <section><h3>Wait Configurations</h3><p className="gptb-help-text">The flow waits for the first eligible resume event. Each configuration creates a separate path from this element.</p>
      {config.configurations.map((row,index)=><div className="gptb-wait-config" key={row.id}>
        <div className="gptb-gr-sort-option-head"><strong>Wait Configuration {index+1}</strong><button type="button" aria-label={`Remove wait configuration ${index+1}`} onClick={()=>patch({configurations:config.configurations.filter((item)=>item.id!==row.id)})}><Trash2 size={13}/></button></div>
        <label><span>Label <b>*</b></span><input value={row.label||''} onChange={(event)=>patchConfiguration(row.id,{label:event.target.value})}/></label>
        <label><span>Condition Requirements</span><select value={row.conditionMode||'always'} onChange={(event)=>patchConfiguration(row.id,{conditionMode:event.target.value,customConditionLogic:event.target.value==='custom'?row.customConditionLogic||'':''})}><option value="always">Always Wait—No Conditions</option><option value="all">All Conditions Are Met (AND)</option><option value="any">Any Condition Is Met (OR)</option><option value="custom">Custom Condition Logic Is Met</option></select></label>
        {(row.conditionMode||'always')!=='always'?<>
          <div className="gptb-gr-field-assignments">{(row.conditions||[]).map((condition,conditionIndex)=><div key={condition.id}><span>{conditionIndex+1}</span><input value={condition.resource||''} onChange={(event)=>patchCondition(row.id,condition.id,{resource:event.target.value})} placeholder="Resource"/><select value={condition.operator||'equals'} onChange={(event)=>patchCondition(row.id,condition.id,{operator:event.target.value,value:['is_null','is_not_null'].includes(event.target.value)?'':condition.value})}>{OPERATORS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>{!['is_null','is_not_null'].includes(condition.operator)?<input value={condition.value??''} onChange={(event)=>patchCondition(row.id,condition.id,{value:event.target.value})} placeholder="Value"/>:<span/>}<button type="button" aria-label={`Remove condition ${conditionIndex+1}`} onClick={()=>patchConfiguration(row.id,{conditions:(row.conditions||[]).filter((item)=>item.id!==condition.id)})}><Trash2 size={13}/></button></div>)}</div>
          <button type="button" className="gptb-inline-action" onClick={()=>patchConfiguration(row.id,{conditions:[...(row.conditions||[]),{id:uid('cond'),resource:'',operator:'equals',value:''}]})}><Plus size={13}/> Add Condition</button>
          {row.conditionMode==='custom'?<label><span>Condition Logic <b>*</b></span><input maxLength={1000} value={row.customConditionLogic||''} onChange={(event)=>patchConfiguration(row.id,{customConditionLogic:event.target.value})} placeholder="Example: 1 AND NOT(2 OR 3)"/></label>:null}
        </>:null}
        <div className="gptb-wait-resume"><h4>Resume Event</h4>
          <label><span>Resume When</span><select value={row.resumeEvent?.type||'specific_time'} onChange={(event)=>patchConfiguration(row.id,{resumeEvent:event.target.value==='platform_event'?{type:'platform_event',eventType:'',conditions:[]}:{type:'specific_time',baseTime:'$Flow.CurrentDateTime',offsetNumber:0,offsetUnit:'hours'}})}><option value="specific_time">A Specified Time Occurs</option><option value="platform_event">A Platform Event Message Is Received</option></select></label>
          {(row.resumeEvent?.type||'specific_time')==='specific_time'?<>
            <label><span>Base Time <b>*</b></span><input value={row.resumeEvent?.baseTime||''} onChange={(event)=>patchResume(row.id,{baseTime:event.target.value})} placeholder="$Flow.CurrentDateTime or Date/Time resource"/></label>
            <label><span>Offset Number</span><input type="number" step="1" value={row.resumeEvent?.offsetNumber??''} onChange={(event)=>patchResume(row.id,{offsetNumber:event.target.value})}/></label>
            <label><span>Offset Unit</span><select value={row.resumeEvent?.offsetUnit||'hours'} onChange={(event)=>patchResume(row.id,{offsetUnit:event.target.value})}><option value="hours">Hours</option><option value="days">Days</option></select></label>
          </>:<>
            <label><span>Platform Event <b>*</b></span><select value={row.resumeEvent?.eventType||''} onChange={(event)=>patchResume(row.id,{eventType:event.target.value})}><option value="">Select a platform event</option>{eventTypes.map((event)=><option key={event.event_type||event.key||event.id} value={event.event_type||event.key||event.id}>{event.label||event.name||event.event_type||event.key}</option>)}</select></label>
            <small>Event-field filtering is stored with this wait configuration and evaluated when matching messages arrive.</small>
          </>}
        </div>
      </div>)}
      <button type="button" className="gptb-inline-action" onClick={()=>patch({configurations:[...config.configurations,{id:uid(),label:'',conditionMode:'always',customConditionLogic:'',conditions:[],resumeEvent:{type:'specific_time',baseTime:'$Flow.CurrentDateTime',offsetNumber:0,offsetUnit:'hours'}}]})}><Plus size={13}/> Add Wait Configuration</button>
    </section>
    <section><h3>Default Path</h3><p>If none of the wait configurations meet their wait conditions, the flow does not pause and continues on the default path.</p></section>
    {errors.length?<div className="gptb-gr-errors"><b>Complete this Wait for Conditions element</b>{errors.map((error)=><span key={error}>{error}</span>)}</div>:null}
  </div>
}
