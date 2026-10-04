import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { apiRequest } from '../../../services/api'

const resourcePath = (resource) => resource ? `variables.${resource.apiName}` : ''
const inputDefault = (schema = {}) => {
  if (schema.type === 'boolean') return false
  if (schema.type === 'number' || schema.type === 'integer') return ''
  return ''
}

export const ACTION_DEFAULTS = Object.freeze({ actionKey: '', inputs: {}, inputModes: {} })

export function normalizeActionConfig(config = {}) {
  return { ...ACTION_DEFAULTS, ...config, inputs: config.inputs || {}, inputModes: config.inputModes || {} }
}

export function actionConfigErrors(config = {}, actions = [], resources = []) {
  const c = normalizeActionConfig(config)
  const errors = []
  const selected = actions.find((action)=>action.key===c.actionKey)
  if (!selected) errors.push('Select an action.')
  const required = selected?.schema?.required || []
  required.forEach((name)=>{
    const mode=c.inputModes[name]||'value'
    const value=c.inputs[name]
    if (mode==='resource') {
      if (!resources.some((resource)=>resourcePath(resource)===value)) errors.push(`${name}: select a resource.`)
    } else if (value === '' || value == null) errors.push(`${name}: enter a value.`)
  })
  return errors
}

export function actionRuntimeAction(instance) {
  const c = normalizeActionConfig(instance?.config)
  const runtimeInputs = {}
  for (const [name,value] of Object.entries(c.inputs || {})) {
    runtimeInputs[name] = c.inputModes?.[name] === 'resource' ? { path: value } : value
  }
  return {
    id: instance.id,
    key: c.actionKey,
    label: instance.label,
    apiName: instance.apiName,
    description: instance.description || '',
    ...runtimeInputs,
  }
}

function ActionInput({ name, schema = {}, description, mode, value, resources, onMode, onValue }) {
  const resourceOptions = resources.filter((resource)=>resource?.isCollection!==true)
  return <div className="gptb-action-input">
    <label><span>{name}{description ? <small title={description}>ⓘ</small> : null}</span>
      <select value={mode} onChange={(event)=>onMode(event.target.value)}><option value="value">Value</option><option value="resource">Resource</option></select>
    </label>
    {mode==='resource'
      ? <select value={value ?? ''} onChange={(event)=>onValue(event.target.value)}><option value="">Select a resource</option>{resourceOptions.map((resource)=><option key={resource.id||resource.apiName} value={resourcePath(resource)}>{resource.label||resource.apiName}</option>)}</select>
      : schema.type==='boolean'
        ? <select value={String(value ?? false)} onChange={(event)=>onValue(event.target.value==='true')}><option value="false">False</option><option value="true">True</option></select>
        : <input type={['number','integer'].includes(schema.type)?'number':'text'} value={value ?? ''} onChange={(event)=>onValue(schema.type==='number'||schema.type==='integer'?(event.target.value===''?'':Number(event.target.value)):event.target.value)}/>
    }
  </div>
}

export default function GPTBuilderAction({ draft, updateConfig, resources = [], onConfiguredChange }) {
  const config = normalizeActionConfig(draft.config)
  const [actions,setActions]=useState([])
  const [query,setQuery]=useState('')
  const [loading,setLoading]=useState(true)
  useEffect(()=>{
    let live=true
    setLoading(true)
    apiRequest('/api/platform/workflow-actions').then((response)=>{
      if(!live)return
      setActions((Array.isArray(response?.data)?response.data:[]).filter((action)=>action?.builderVisible!==false && !['RUN_AGENT','SCREEN','RUN_SUBFLOW'].includes(action.key)))
    }).catch(()=>{if(live)setActions([])}).finally(()=>{if(live)setLoading(false)})
    return()=>{live=false}
  },[])
  const selected=actions.find((action)=>action.key===config.actionKey)
  const errors=useMemo(()=>actionConfigErrors(config,actions,resources),[JSON.stringify(config),JSON.stringify(actions),JSON.stringify(resources)])
  useEffect(()=>{onConfiguredChange?.(errors.length===0,errors)},[JSON.stringify(errors)])
  const patch=(changes)=>updateConfig({...config,...changes})
  const matches=actions.filter((action)=>!query.trim() || `${action.displayName||''} ${action.key||''} ${action.description||''}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0,60)

  return <div className="gptb-gr gptb-action-editor">
    <section><h3>Action</h3>
      <div className="gptb-action-search"><Search size={13}/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search actions..."/></div>
      <label><span>Action <b>*</b></span><select value={config.actionKey} disabled={loading} onChange={(event)=>{
        const next=actions.find((action)=>action.key===event.target.value)
        const inputs={}
        const modes={}
        for(const [name,schema] of Object.entries(next?.schema?.properties||{})){inputs[name]=inputDefault(schema);modes[name]='value'}
        patch({actionKey:event.target.value,inputs,inputModes:modes,actionLabel:next?.displayName||event.target.value})
      }}><option value="">{loading?'Loading actions...':'Select an action'}</option>{matches.map((action)=><option key={action.key} value={action.key}>{action.displayName||action.key}</option>)}</select>{selected?.description?<small>{selected.description}</small>:null}</label>
    </section>
    {selected?<section><h3>Set Input Values</h3>
      {Object.entries(selected.schema?.properties||{}).map(([name,schema])=><ActionInput key={name} name={name} schema={schema} description={schema.description} mode={config.inputModes[name]||'value'} value={config.inputs[name]} resources={resources} onMode={(mode)=>patch({inputModes:{...config.inputModes,[name]:mode},inputs:{...config.inputs,[name]:mode==='resource'?'':config.inputs[name]}})} onValue={(value)=>patch({inputs:{...config.inputs,[name]:value}})}/>)}
      {!Object.keys(selected.schema?.properties||{}).length?<small>This action doesn't require inputs.</small>:null}
    </section>:null}
    {errors.length?<div className="gptb-gr-errors"><b>Complete this Action element</b>{errors.map((error)=><span key={error}>{error}</span>)}</div>:null}
  </div>
}
