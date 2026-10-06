import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, Trash2 } from 'lucide-react'
import { apiRequest } from '../../../services/api'
import GPTBuilderFormulaBuilder, { basicFormulaCheck } from './GPTBuilderFormulaBuilder'

const uid=(prefix='action')=>globalThis.crypto?.randomUUID?.()||`${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
const resourcePath = (resource) => resource?.path || (resource?.apiName ? `variables.${resource.apiName}` : '')
const inputDefault = (schema = {}) => {
  if (schema.type === 'boolean') return false
  if (schema.type === 'number' || schema.type === 'integer') return ''
  return ''
}

export const ACTION_DEFAULTS = Object.freeze({
  actionKey: '',
  inputs: {},
  inputModes: {},
  inputIncluded: {},
  transforms: {},
  outputMode: 'automatic',
  manualOutputs: [],
  importedRuntimeAction: null,
  importedRuntimeActionText: '',
})

export function normalizeActionConfig(config = {}) {
  return {
    ...ACTION_DEFAULTS,
    ...config,
    inputs: config.inputs || {},
    inputModes: config.inputModes || {},
    inputIncluded: config.inputIncluded || {},
    transforms: config.transforms || {},
    manualOutputs: Array.isArray(config.manualOutputs) ? config.manualOutputs : [],
  }
}

export function actionConfigErrors(config = {}, actions = [], resources = []) {
  const c = normalizeActionConfig(config)
  const errors = []
  if (c.importedRuntimeActionText) {
    try {
      const parsed = JSON.parse(c.importedRuntimeActionText)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) errors.push('Imported runtime configuration must be a JSON object.')
    } catch {
      errors.push('Imported runtime configuration contains invalid JSON.')
    }
  }
  const selected = actions.find((action)=>action.key===c.actionKey)
  if (!selected) errors.push('Select an action.')
  const required = new Set(selected?.schema?.required || [])
  for (const [name] of Object.entries(selected?.schema?.properties || {})) {
    const includeState=required.has(name)?'specified':(c.inputIncluded[name]||'omit')
    if(includeState==='omit')continue
    if(includeState==='include')continue
    const mode=c.inputModes[name]||'value'
    const value=c.inputs[name]
    if (mode==='resource') {
      if (!resources.some((resource)=>resourcePath(resource)===value)) errors.push(`${name}: select a resource.`)
    } else if(mode==='formula') {
      const formulaError=basicFormulaCheck(value)
      if(formulaError)errors.push(`${name}: ${formulaError}`)
    } else if(mode==='transform') {
      const transform=c.transforms[name]||{}
      if(!resources.some((resource)=>resourcePath(resource)===transform.source))errors.push(`${name}: select a Transform source resource.`)
      if(!Array.isArray(transform.mappings)||!transform.mappings.length)errors.push(`${name}: add at least one Transform mapping.`)
      ;(transform.mappings||[]).forEach((mapping,index)=>{
        if(!String(mapping.targetField||'').trim()||!String(mapping.sourceField||'').trim())errors.push(`${name}, Transform mapping ${index+1}: complete target and source fields.`)
      })
    } else if (value === '' || value == null) errors.push(`${name}: enter a value.`)
  }
  if(!['automatic','manual'].includes(c.outputMode))errors.push('Select how to store output values.')
  if(c.outputMode==='manual'){
    c.manualOutputs.forEach((mapping,index)=>{
      if(!String(mapping.outputPath||'').trim())errors.push(`Output mapping ${index+1}: select or enter an output.`)
      if(!resources.some((resource)=>resourcePath(resource)===mapping.targetVariable))errors.push(`Output mapping ${index+1}: select a target variable.`)
    })
  }
  return errors
}

export function actionRuntimeAction(instance) {
  const c = normalizeActionConfig(instance?.config)
  if (c.importedRuntimeAction || c.importedRuntimeActionText) {
    const imported = c.importedRuntimeActionText ? JSON.parse(c.importedRuntimeActionText) : c.importedRuntimeAction
    return {
      ...imported,
      id: instance.id,
      key: imported.key || imported.type || c.actionKey,
      label: instance.label,
      apiName: instance.apiName,
      description: instance.description || imported.description || '',
    }
  }
  const runtimeInputs = {}
  for (const [name,value] of Object.entries(c.inputs || {})) {
    const includeState=c.inputIncluded?.[name]||'specified'
    if(includeState==='omit')continue
    if(includeState==='include'){runtimeInputs[name]=null;continue}
    const mode=c.inputModes?.[name]||'value'
    if(mode==='resource') runtimeInputs[name]={ path:value }
    else if(mode==='formula') runtimeInputs[name]={ __flowInputMode:'formula', expression:value }
    else if(mode==='transform') runtimeInputs[name]={ __flowInputMode:'transform', ...(c.transforms?.[name]||{}) }
    else runtimeInputs[name]=value
  }
  return {
    id: instance.id,
    key: c.actionKey,
    label: instance.label,
    apiName: instance.apiName,
    description: instance.description || '',
    ...runtimeInputs,
    automaticOutputVariable:c.outputMode==='automatic'?`${instance.apiName}_Outputs`:undefined,
    manualOutputMappings:c.outputMode==='manual'?c.manualOutputs:undefined,
  }
}

function TransformInput({name,schema,transform,resources,onChange}){
  const source=transform||{source:'',mappings:[]}
  const targetFields=Object.keys(schema?.properties||{})
  const patch=(changes)=>onChange({...source,...changes})
  return <div className="gptb-action-transform">
    <label><span>Source Resource <b>*</b></span><select value={source.source||''} onChange={(event)=>patch({source:event.target.value})}><option value="">Select a resource</option>{resources.map((resource)=><option key={resource.id||resource.apiName} value={resourcePath(resource)}>{resource.label||resource.apiName}{resource.secure?' — ********':''}</option>)}</select></label>
    <div className="gptb-action-transform-mappings">{(source.mappings||[]).map((mapping,index)=><div key={mapping.id}><span>{index+1}</span>{targetFields.length?<select value={mapping.targetField||''} onChange={(event)=>patch({mappings:source.mappings.map((item)=>item.id===mapping.id?{...item,targetField:event.target.value}:item)})}><option value="">Target field</option>{targetFields.map((field)=><option key={field} value={field}>{field}</option>)}</select>:<input value={mapping.targetField||''} onChange={(event)=>patch({mappings:source.mappings.map((item)=>item.id===mapping.id?{...item,targetField:event.target.value}:item)})} placeholder="Target field"/>}<input value={mapping.sourceField||''} onChange={(event)=>patch({mappings:source.mappings.map((item)=>item.id===mapping.id?{...item,sourceField:event.target.value}:item)})} placeholder="Source field/path"/><button type="button" aria-label={`Remove Transform mapping ${index+1}`} onClick={()=>patch({mappings:source.mappings.filter((item)=>item.id!==mapping.id)})}><Trash2 size={12}/></button></div>)}</div>
    <button type="button" className="gptb-inline-action" onClick={()=>patch({mappings:[...(source.mappings||[]),{id:uid('map'),targetField:'',sourceField:''}]})}><Plus size={12}/> Add Mapping</button>
  </div>
}

function ActionInput({ name, schema = {}, description, required, includeState, mode, value, transform, resources, object, onInclude, onMode, onValue, onTransform }) {
  const resourceOptions = resources.filter((resource)=>resource?.isCollection!==true)
  const providerOptions = [...new Map(resources.filter((resource)=>resource?.providerResource===true&&resource?.providerKey).map((resource)=>[resource.providerKey,{key:resource.providerKey,name:resource.providerName||resource.providerKey}])).values()]
  const specified=required||includeState==='specified'
  return <div className="gptb-action-input-block">
    <div className="gptb-action-input-head"><span><b>{name}{required?' *':''}</b>{description ? <small title={description}>ⓘ</small> : null}</span>{required?<span className="gptb-action-required">Required</span>:<select value={includeState||'omit'} onChange={(event)=>onInclude(event.target.value)}><option value="omit">Don't Include</option><option value="include">Include</option><option value="specified">Include with Specified Value</option></select>}</div>
    {specified?<><label><span>Value Mode</span><select value={mode} onChange={(event)=>onMode(event.target.value)}><option value="value">Value</option><option value="resource">Resource</option><option value="formula">Formula Mode</option><option value="transform">Transform Mode</option></select></label>
    {mode==='resource'
      ? <select value={value ?? ''} onChange={(event)=>onValue(event.target.value)}><option value="">Select a resource</option>{resourceOptions.map((resource)=><option key={resource.id||resource.apiName} value={resourcePath(resource)}>{resource.label||resource.apiName}{resource.secure?' — ********':''}</option>)}</select>
      : mode==='formula'
        ? <GPTBuilderFormulaBuilder object={object} value={value||''} onChange={onValue}/>
        : mode==='transform'
          ? <TransformInput name={name} schema={schema} transform={transform} resources={resources} onChange={onTransform}/>
          : name==='providerKey' && providerOptions.length
            ? <select value={value ?? ''} onChange={(event)=>onValue(event.target.value)}><option value="">Select provider</option>{providerOptions.map((provider)=><option key={provider.key} value={provider.key}>{provider.name}</option>)}</select>
            : schema.type==='boolean'
              ? <select value={String(value ?? false)} onChange={(event)=>onValue(event.target.value==='true')}><option value="false">False</option><option value="true">True</option></select>
              : <input type={['number','integer'].includes(schema.type)?'number':'text'} value={value ?? ''} onChange={(event)=>onValue(schema.type==='number'||schema.type==='integer'?(event.target.value===''?'':Number(event.target.value)):event.target.value)}/>}</>:includeState==='include'?<small className="gptb-help-text">The input is included without a specified value.</small>:null}
  </div>
}

export default function GPTBuilderAction({ draft, updateConfig, resources = [], object = null, onResourcesChange, onConfiguredChange }) {
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
  const httpCalloutAction=actions.find((action)=>['ONE_HTTP_REQUEST','HTTP_REQUEST'].includes(String(action.key||'').toUpperCase()))
  const selectAction=(action)=>{
    if(!action)return
    const inputs={},modes={},included={},transforms={}
    const required=new Set(action?.schema?.required||[])
    for(const [name,schema] of Object.entries(action?.schema?.properties||{})){inputs[name]=inputDefault(schema);modes[name]='value';included[name]=required.has(name)?'specified':'omit';transforms[name]={source:'',mappings:[]}}
    patch({actionKey:action.key,inputs,inputModes:modes,inputIncluded:included,transforms,outputMode:'automatic',manualOutputs:[],actionLabel:action.displayName||action.key})
  }
  const errors=useMemo(()=>actionConfigErrors(config,actions,resources),[JSON.stringify(config),JSON.stringify(actions),JSON.stringify(resources)])
  useEffect(()=>{onConfiguredChange?.(errors.length===0,errors)},[JSON.stringify(errors)])
  const patch=(changes)=>updateConfig({...config,...changes})
  const matches=actions.filter((action)=>!query.trim() || `${action.displayName||''} ${action.key||''} ${action.description||''}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0,110)
  const requiredSet=new Set(selected?.schema?.required||[])
  const outputFields=Object.keys(selected?.outputSchema?.properties||{})
  useEffect(()=>{
    if(!onResourcesChange||!draft.id)return
    const other=resources.filter((resource)=>resource.generatedByElementId!==draft.id)
    const generated=config.outputMode==='automatic'&&config.actionKey?[{
      id:`action-output-${draft.id}`,apiName:`${draft.apiName}_Outputs`,label:`Outputs from ${draft.label||draft.apiName}`,dataType:'object',isCollection:false,generatedByElementId:draft.id,generatedByElementKey:'action',writable:false,
    }]:[]
    const next=[...other,...generated]
    if(JSON.stringify(next)!==JSON.stringify(resources))onResourcesChange(next)
  },[draft.id,draft.apiName,draft.label,config.actionKey,config.outputMode])

  return <div className="gptb-gr gptb-action-editor">
    <section><h3>All Actions <small>{loading?'':actions.length}</small></h3>
      {httpCalloutAction?<button type="button" className="gptb-inline-action" onClick={()=>selectAction(httpCalloutAction)}><Plus size={12}/> Create HTTP Callout</button>:null}
      <div className="gptb-action-search"><Search size={13}/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search actions..."/></div>
      <label><span>Action <b>*</b></span><select value={config.actionKey} disabled={loading} onChange={(event)=>selectAction(actions.find((action)=>action.key===event.target.value))}><option value="">{loading?'Loading actions...':'Select an action'}</option>{matches.map((action)=><option key={action.key} value={action.key}>{action.displayName||action.key}</option>)}</select>{selected?.description?<small>{selected.description}</small>:null}</label>
    </section>
    {config.importedRuntimeAction || config.importedRuntimeActionText ? <section><h3>Runtime Configuration</h3>
      <p className="gptb-help-text">This metadata was imported from an existing Flow step. Edit the JSON to change the step without hiding logic in code.</p>
      <textarea rows={14} value={config.importedRuntimeActionText || JSON.stringify(config.importedRuntimeAction || {}, null, 2)} onChange={(event)=>patch({importedRuntimeAction:null,importedRuntimeActionText:event.target.value})}/>
    </section> : null}
    {selected && !(config.importedRuntimeAction || config.importedRuntimeActionText) ? <section><h3>Set Input Values</h3>
      {Object.entries(selected.schema?.properties||{}).map(([name,schema])=><ActionInput key={name} name={name} schema={schema} description={schema.description} required={requiredSet.has(name)} includeState={config.inputIncluded[name]||'omit'} mode={config.inputModes[name]||'value'} value={config.inputs[name]} transform={config.transforms[name]} resources={resources} object={object} onInclude={(state)=>patch({inputIncluded:{...config.inputIncluded,[name]:state}})} onMode={(mode)=>patch({inputModes:{...config.inputModes,[name]:mode},inputs:{...config.inputs,[name]:mode==='resource'||mode==='formula'?'':config.inputs[name]}})} onValue={(value)=>patch({inputs:{...config.inputs,[name]:value}})} onTransform={(value)=>patch({transforms:{...config.transforms,[name]:value}})}/>)}
      {!Object.keys(selected.schema?.properties||{}).length?<small>This action doesn't require inputs.</small>:null}
    </section>:null}
    {selected && !(config.importedRuntimeAction || config.importedRuntimeActionText) ? <section><h3>Store Output Values</h3>
      <fieldset className="gptb-gr-radio-group"><label><input type="radio" name={`action-output-${draft.id}`} checked={config.outputMode==='automatic'} onChange={()=>patch({outputMode:'automatic',manualOutputs:[]})}/><span>Automatically store all output values</span></label><label><input type="radio" name={`action-output-${draft.id}`} checked={config.outputMode==='manual'} onChange={()=>patch({outputMode:'manual'})}/><span>Manually assign variables (advanced)</span></label></fieldset>
      {config.outputMode==='automatic'?<small>Outputs are available later in the flow as <b>Outputs from {draft.label||draft.apiName}</b>.</small>:<><div className="gptb-action-output-mappings">{config.manualOutputs.map((mapping,index)=><div key={mapping.id}><span>{index+1}</span>{outputFields.length?<select value={mapping.outputPath||''} onChange={(event)=>patch({manualOutputs:config.manualOutputs.map((item)=>item.id===mapping.id?{...item,outputPath:event.target.value}:item)})}><option value="">Select output</option>{outputFields.map((field)=><option key={field} value={field}>{field}</option>)}</select>:<input value={mapping.outputPath||''} onChange={(event)=>patch({manualOutputs:config.manualOutputs.map((item)=>item.id===mapping.id?{...item,outputPath:event.target.value}:item)})} placeholder="Output name/path"/>}<select value={mapping.targetVariable||''} onChange={(event)=>patch({manualOutputs:config.manualOutputs.map((item)=>item.id===mapping.id?{...item,targetVariable:event.target.value}:item)})}><option value="">Select variable</option>{resources.filter((resource)=>resource.writable!==false&&resource.generatedByElementId!==draft.id).map((resource)=><option key={resource.id||resource.apiName} value={resourcePath(resource)}>{resource.label||resource.apiName}{resource.secure?' — ********':''}</option>)}</select><button type="button" aria-label={`Remove output mapping ${index+1}`} onClick={()=>patch({manualOutputs:config.manualOutputs.filter((item)=>item.id!==mapping.id)})}><Trash2 size={12}/></button></div>)}</div><button type="button" className="gptb-inline-action" onClick={()=>patch({manualOutputs:[...config.manualOutputs,{id:uid('output'),outputPath:'',targetVariable:''}]})}><Plus size={12}/> Add Output Mapping</button></>}
    </section>:null}
    {errors.length?<div className="gptb-gr-errors"><b>Complete this Action element</b>{errors.map((error)=><span key={error}>{error}</span>)}</div>:null}
  </div>
}
