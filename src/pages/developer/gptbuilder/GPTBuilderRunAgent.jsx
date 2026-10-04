import { useEffect, useMemo } from 'react'
import { Plus, Trash2 } from 'lucide-react'

const uid = (prefix='agent') => globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
const resourcePath = (resource) => resource ? `variables.${resource.apiName}` : ''

export const RUN_AGENT_DEFAULTS = Object.freeze({
  agentMode: 'existing',
  agentKey: 'oneengine_assistant',
  createdAgent: { label: '', apiName: '', description: '', userAccess: '', instructions: '', actions: [] },
  requestMode: 'value',
  request: '',
  sessionIdMode: 'none',
  sessionId: '',
  structuredEnabled: false,
  structuredFields: [],
})

export function normalizeRunAgentConfig(config = {}) {
  return {
    ...RUN_AGENT_DEFAULTS,
    ...config,
    createdAgent: { ...RUN_AGENT_DEFAULTS.createdAgent, ...(config.createdAgent || {}) },
    structuredFields: Array.isArray(config.structuredFields) ? config.structuredFields : [],
  }
}

export function runAgentConfigErrors(config = {}, resources = []) {
  const c = normalizeRunAgentConfig(config)
  const errors = []
  if (!['existing','create'].includes(c.agentMode)) errors.push('Select an agent option.')
  if (c.agentMode === 'existing' && !c.agentKey) errors.push('Select an active agent.')
  if (c.agentMode === 'create') {
    if (!String(c.createdAgent.label || '').trim()) errors.push('New Agent: enter a Label.')
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(String(c.createdAgent.apiName || '')) || String(c.createdAgent.apiName || '').endsWith('_') || String(c.createdAgent.apiName || '').includes('__')) errors.push('New Agent: enter a valid API Name.')
    if (!String(c.createdAgent.instructions || '').trim()) errors.push('New Agent: enter Instructions.')
  }
  if (c.requestMode === 'resource') {
    if (!resources.some((resource)=>resourcePath(resource)===c.request && resource.isCollection!==true)) errors.push('Select an Agent Request resource.')
  } else if (!String(c.request || '').trim()) errors.push('Enter an Agent Request.')
  if (c.sessionIdMode === 'resource' && !resources.some((resource)=>resourcePath(resource)===c.sessionId && resource.isCollection!==true)) errors.push('Select a Session ID resource.')
  if (c.structuredEnabled) {
    if (!c.structuredFields.length) errors.push('Add at least one structured output field.')
    const names=new Set()
    c.structuredFields.forEach((field,index)=>{
      const name=String(field.name||'')
      if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) errors.push(`Structured output ${index+1}: enter a valid field name.`)
      if (names.has(name.toLowerCase())) errors.push(`Structured output ${index+1}: field names must be unique.`)
      names.add(name.toLowerCase())
      if (!['text','number','boolean','date','datetime'].includes(field.dataType)) errors.push(`Structured output ${index+1}: select a data type.`)
    })
  }
  return errors
}

export function runAgentRuntimeAction(instance) {
  const c=normalizeRunAgentConfig(instance?.config)
  const structuredFields=c.structuredEnabled?c.structuredFields:[]
  return {
    id: instance.id,
    key: 'RUN_AGENT',
    label: instance.label,
    apiName: instance.apiName,
    description: instance.description || '',
    agentKey: c.agentMode==='existing'?c.agentKey:c.createdAgent.apiName,
    agentDefinition: c.agentMode==='create'?c.createdAgent:undefined,
    agentPrompt: c.requestMode==='resource'?{path:c.request}:c.request,
    sessionId: c.sessionIdMode==='resource'?{path:c.sessionId}:undefined,
    structuredOutput: structuredFields.map((field)=>({name:field.name,dataType:field.dataType,description:field.description||''})),
    agentResponseVariable: `${instance.apiName}_AgentResponse`,
    agentSessionVariable: `${instance.apiName}_SessionId`,
    structuredResponseVariable: `${instance.apiName}_StructuredAgentResponse`,
  }
}

function apiNameFromLabel(label){
  let value=String(label||'').trim().replace(/[^A-Za-z0-9]+/g,'_').replace(/_+/g,'_').replace(/^_+|_+$/g,'')
  if(!value)value='New_Agent'
  if(!/^[A-Za-z]/.test(value))value=`Agent_${value}`
  return value.slice(0,80).replace(/_+$/g,'')
}

export default function GPTBuilderRunAgent({ draft, updateConfig, resources = [], onConfiguredChange }) {
  const config=normalizeRunAgentConfig(draft.config)
  const errors=useMemo(()=>runAgentConfigErrors(config,resources),[JSON.stringify(config),JSON.stringify(resources)])
  useEffect(()=>{onConfiguredChange?.(errors.length===0,errors)},[JSON.stringify(errors)])
  const patch=(changes)=>updateConfig({...config,...changes})
  const patchCreated=(changes)=>patch({createdAgent:{...config.createdAgent,...changes}})
  const scalar=resources.filter((resource)=>resource?.isCollection!==true)

  return <div className="gptb-gr gptb-run-agent">
    <section><h3>Agent</h3>
      <fieldset className="gptb-gr-radio-group">
        <label><input type="radio" name={`run-agent-mode-${draft.id}`} checked={config.agentMode==='existing'} onChange={()=>patch({agentMode:'existing'})}/><span>Select an existing agent</span></label>
        <label><input type="radio" name={`run-agent-mode-${draft.id}`} checked={config.agentMode==='create'} onChange={()=>patch({agentMode:'create'})}/><span>Create Agent</span></label>
      </fieldset>
      {config.agentMode==='existing'?<label><span>Agent <b>*</b></span><select value={config.agentKey} onChange={(event)=>patch({agentKey:event.target.value})}><option value="oneengine_assistant">OneEngine Assistant · Active</option></select><small>Only active agents are available.</small></label>:<div className="gptb-agent-create">
        <label><span>Label <b>*</b></span><input value={config.createdAgent.label} onChange={(event)=>patchCreated({label:event.target.value,apiName:apiNameFromLabel(event.target.value)})}/></label>
        <label><span>API Name <b>*</b></span><input value={config.createdAgent.apiName} onChange={(event)=>patchCreated({apiName:event.target.value})}/></label>
        <label><span>Description</span><textarea rows={2} value={config.createdAgent.description} onChange={(event)=>patchCreated({description:event.target.value})}/></label>
        <label><span>User Access</span><input value={config.createdAgent.userAccess} onChange={(event)=>patchCreated({userAccess:event.target.value})} placeholder="Running user or agent user"/></label>
        <label><span>Instructions <b>*</b></span><textarea rows={5} value={config.createdAgent.instructions} onChange={(event)=>patchCreated({instructions:event.target.value})} placeholder="Describe what the agent does and how it should reason."/></label>
        <small>Create & Activate is represented in the flow metadata when this element is saved.</small>
      </div>}
    </section>

    <section><h3>Set Input Values</h3>
      <label><span>Agent Request <b>*</b></span><select value={config.requestMode} onChange={(event)=>patch({requestMode:event.target.value,request:''})}><option value="value">Value</option><option value="resource">Resource</option></select></label>
      {config.requestMode==='resource'?<select value={config.request} onChange={(event)=>patch({request:event.target.value})}><option value="">Select a resource</option>{scalar.map((resource)=><option key={resource.id||resource.apiName} value={resourcePath(resource)}>{resource.label||resource.apiName}</option>)}</select>:<textarea rows={3} value={config.request} onChange={(event)=>patch({request:event.target.value})} placeholder="Question or request to send to the agent"/>}
      <label><span>Session ID</span><select value={config.sessionIdMode} onChange={(event)=>patch({sessionIdMode:event.target.value,sessionId:''})}><option value="none">Start a new conversation</option><option value="resource">Use Session ID resource</option></select></label>
      {config.sessionIdMode==='resource'?<select value={config.sessionId} onChange={(event)=>patch({sessionId:event.target.value})}><option value="">Select a resource</option>{scalar.map((resource)=><option key={resource.id||resource.apiName} value={resourcePath(resource)}>{resource.label||resource.apiName}</option>)}</select>:null}
    </section>

    <section><h3>Configure Structured Output</h3>
      <label className="gptb-properties-check"><input type="checkbox" checked={config.structuredEnabled} onChange={(event)=>patch({structuredEnabled:event.target.checked})}/><span>Return structured agent response</span></label>
      {config.structuredEnabled?<><div className="gptb-agent-structured-list">{config.structuredFields.map((field,index)=><div key={field.id}><span>{index+1}</span><input value={field.name||''} onChange={(event)=>patch({structuredFields:config.structuredFields.map((item)=>item.id===field.id?{...item,name:event.target.value}:item)})} placeholder="Field name"/><select value={field.dataType||'text'} onChange={(event)=>patch({structuredFields:config.structuredFields.map((item)=>item.id===field.id?{...item,dataType:event.target.value}:item)})}><option value="text">Text</option><option value="number">Number</option><option value="boolean">Boolean</option><option value="date">Date</option><option value="datetime">Date/Time</option></select><input value={field.description||''} onChange={(event)=>patch({structuredFields:config.structuredFields.map((item)=>item.id===field.id?{...item,description:event.target.value}:item)})} placeholder="Description"/><button type="button" aria-label={`Remove structured output ${index+1}`} onClick={()=>patch({structuredFields:config.structuredFields.filter((item)=>item.id!==field.id)})}><Trash2 size={13}/></button></div>)}</div><button type="button" className="gptb-inline-action" onClick={()=>patch({structuredFields:[...config.structuredFields,{id:uid('field'),name:'',dataType:'text',description:''}]})}><Plus size={13}/> Add Structured Output Field</button><small>Each field also exposes a related Boolean <code>_set</code> flag at runtime.</small></>:null}
    </section>

    <section><h3>Outputs</h3><dl className="gptb-agent-outputs"><div><dt>Agent Response</dt><dd>{draft.apiName}_AgentResponse</dd></div><div><dt>Session ID</dt><dd>{draft.apiName}_SessionId</dd></div><div><dt>Structured Agent Response</dt><dd>{draft.apiName}_StructuredAgentResponse</dd></div></dl></section>
    {errors.length?<div className="gptb-gr-errors"><b>Complete this Run Agent element</b>{errors.map((error)=><span key={error}>{error}</span>)}</div>:null}
  </div>
}
