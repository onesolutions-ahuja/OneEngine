import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, Trash2, WandSparkles } from 'lucide-react'
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

function inferJsonSchema(value){
  if(Array.isArray(value))return{type:'array',items:value.length?inferJsonSchema(value[0]):{}}
  if(value===null)return{type:['null']}
  if(typeof value==='object')return{type:'object',properties:Object.fromEntries(Object.entries(value).map(([key,item])=>[key,inferJsonSchema(item)]))}
  if(typeof value==='number')return{type:Number.isInteger(value)?'integer':'number'}
  if(typeof value==='boolean')return{type:'boolean'}
  return{type:'string'}
}

function HttpCalloutWizard({ integrations, onCancel, onCreate }){
  const [step,setStep]=useState(1),[integrationId,setIntegrationId]=useState(''),[method,setMethod]=useState('GET'),[endpoint,setEndpoint]=useState(''),[headers,setHeaders]=useState('{}'),[query,setQuery]=useState('{}'),[body,setBody]=useState('{}'),[sample,setSample]=useState('{}'),[schema,setSchema]=useState(null),[testState,setTestState]=useState(null)
  const selected=integrations.find((item)=>String(item.id)===String(integrationId))
  const parse=(text)=>{try{return JSON.parse(text||'{}')}catch{return null}}
  const infer=()=>{const value=parse(sample);if(value===null)return;setSchema(inferJsonSchema(value));setStep(3)}
  const test=async()=>{if(!integrationId)return;setTestState({loading:true});try{const response=await apiRequest(`/api/integrations/${encodeURIComponent(integrationId)}/test-connection`,{method:'POST'});const result=response?.data||{};setTestState({ok:result.ok===true||result.success===true,message:result.message||`HTTP ${result.status||'OK'}`})}catch(error){setTestState({ok:false,message:error.message||'Connection test failed.'})}}
  const create=()=>onCreate({providerKey:selected?.providerKey||selected?.provider_key||selected?.type||selected?.name||'',connectionKey:integrationId,method,endpoint,headers:parse(headers)||{},query:parse(query)||{},body:parse(body)||{},responseSchema:schema||inferJsonSchema(parse(sample)||{}),sampleResponse:parse(sample)||{}})
  return <div className="gptb-modal-backdrop"><section className="gptb-properties-modal gptb-http-wizard" role="dialog" aria-modal="true" aria-label="New HTTP Callout">
    <header><strong>New HTTP Callout</strong><span>Step {step} of 3</span></header>
    <div className="gptb-properties-body">
      {step===1?<><h3>Select Connection</h3><label><span>Connection <b>*</b></span><select value={integrationId} onChange={(event)=>setIntegrationId(event.target.value)}><option value="">Select a connection</option>{integrations.map((item)=><option key={item.id} value={item.id}>{item.name||item.provider_name||item.type||item.id}</option>)}</select></label><button type="button" className="gptb-button" disabled={!integrationId||testState?.loading} onClick={test}>Test Connection</button>{testState?<small className={testState.ok?'gptb-http-test-ok':'gptb-manager-error'}>{testState.loading?'Testing…':testState.message}</small>:null}</>:null}
      {step===2?<><h3>Configure Request</h3><label><span>Method</span><select value={method} onChange={(event)=>setMethod(event.target.value)}>{['GET','POST','PUT','PATCH','DELETE'].map((item)=><option key={item}>{item}</option>)}</select></label><label><span>Endpoint <b>*</b></span><input value={endpoint} onChange={(event)=>setEndpoint(event.target.value)} placeholder="/v1/resource/{id}"/></label><label><span>Headers (JSON)</span><textarea rows={4} value={headers} onChange={(event)=>setHeaders(event.target.value)}/></label><label><span>Query Parameters (JSON)</span><textarea rows={4} value={query} onChange={(event)=>setQuery(event.target.value)}/></label><label><span>Request Body (JSON)</span><textarea rows={6} value={body} onChange={(event)=>setBody(event.target.value)}/></label></>:null}
      {step===3?<><h3>Configure Response</h3><label><span>Sample JSON Response</span><textarea rows={10} value={sample} onChange={(event)=>setSample(event.target.value)}/></label><button type="button" className="gptb-button" onClick={infer}>Connect for Schema</button>{schema?<pre className="gptb-http-schema">{JSON.stringify(schema,null,2)}</pre>:null}</>:null}
    </div>
    <footer><button className="gptb-button" onClick={onCancel}>Cancel</button>{step>1?<button className="gptb-button" onClick={()=>setStep(step-1)}>Previous</button>:null}{step<3?<button className="gptb-button is-brand" disabled={step===1?!integrationId:!endpoint} onClick={()=>setStep(step+1)}>Next</button>:<button className="gptb-button is-brand" disabled={!integrationId||!endpoint} onClick={create}>Done</button>}</footer>
  </section></div>
}

export default function GPTBuilderAction({ draft, updateConfig, resources = [], object = null, onResourcesChange, onConfiguredChange }) {
  const config = normalizeActionConfig(draft.config)
  const [actions,setActions]=useState([])
  const [query,setQuery]=useState('')
  const [loading,setLoading]=useState(true)
  const [integrations,setIntegrations]=useState([])
  const [httpWizardOpen,setHttpWizardOpen]=useState(false)
  useEffect(()=>{
    let live=true
    setLoading(true)
    apiRequest('/api/integrations').then((response)=>setIntegrations(Array.isArray(response?.data)?response.data:[])).catch(()=>setIntegrations([]))
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
    <section><div className="gptb-action-title-row"><h3>Action</h3><button type="button" className="gptb-inline-action" onClick={()=>setHttpWizardOpen(true)}><WandSparkles size={12}/> New HTTP Callout</button></div>
      <div className="gptb-action-search"><Search size={13}/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search actions..."/></div>
      <label><span>Action <b>*</b></span><select value={config.actionKey} disabled={loading} onChange={(event)=>{
        const next=actions.find((action)=>action.key===event.target.value)
        const inputs={},modes={},included={},transforms={}
        const required=new Set(next?.schema?.required||[])
        for(const [name,schema] of Object.entries(next?.schema?.properties||{})){inputs[name]=inputDefault(schema);modes[name]='value';included[name]=required.has(name)?'specified':'omit';transforms[name]={source:'',mappings:[]}}
        patch({actionKey:event.target.value,inputs,inputModes:modes,inputIncluded:included,transforms,outputMode:'automatic',manualOutputs:[],actionLabel:next?.displayName||event.target.value})
      }}><option value="">{loading?'Loading actions...':'Select an action'}</option>{matches.map((action)=><option key={action.key} value={action.key}>{action.displayName||action.key}</option>)}</select>{selected?.description?<small>{selected.description}</small>:null}</label>
    </section>
    {selected?<section><h3>Set Input Values</h3>
      {Object.entries(selected.schema?.properties||{}).map(([name,schema])=><ActionInput key={name} name={name} schema={schema} description={schema.description} required={requiredSet.has(name)} includeState={config.inputIncluded[name]||'omit'} mode={config.inputModes[name]||'value'} value={config.inputs[name]} transform={config.transforms[name]} resources={resources} object={object} onInclude={(state)=>patch({inputIncluded:{...config.inputIncluded,[name]:state}})} onMode={(mode)=>patch({inputModes:{...config.inputModes,[name]:mode},inputs:{...config.inputs,[name]:mode==='resource'||mode==='formula'?'':config.inputs[name]}})} onValue={(value)=>patch({inputs:{...config.inputs,[name]:value}})} onTransform={(value)=>patch({transforms:{...config.transforms,[name]:value}})}/>)}
      {!Object.keys(selected.schema?.properties||{}).length?<small>This action doesn't require inputs.</small>:null}
    </section>:null}
    {selected?<section><h3>Store Output Values</h3>
      <fieldset className="gptb-gr-radio-group"><label><input type="radio" name={`action-output-${draft.id}`} checked={config.outputMode==='automatic'} onChange={()=>patch({outputMode:'automatic',manualOutputs:[]})}/><span>Automatically store all output values</span></label><label><input type="radio" name={`action-output-${draft.id}`} checked={config.outputMode==='manual'} onChange={()=>patch({outputMode:'manual'})}/><span>Manually assign variables (advanced)</span></label></fieldset>
      {config.outputMode==='automatic'?<small>Outputs are available later in the flow as <b>Outputs from {draft.label||draft.apiName}</b>.</small>:<><div className="gptb-action-output-mappings">{config.manualOutputs.map((mapping,index)=><div key={mapping.id}><span>{index+1}</span>{outputFields.length?<select value={mapping.outputPath||''} onChange={(event)=>patch({manualOutputs:config.manualOutputs.map((item)=>item.id===mapping.id?{...item,outputPath:event.target.value}:item)})}><option value="">Select output</option>{outputFields.map((field)=><option key={field} value={field}>{field}</option>)}</select>:<input value={mapping.outputPath||''} onChange={(event)=>patch({manualOutputs:config.manualOutputs.map((item)=>item.id===mapping.id?{...item,outputPath:event.target.value}:item)})} placeholder="Output name/path"/>}<select value={mapping.targetVariable||''} onChange={(event)=>patch({manualOutputs:config.manualOutputs.map((item)=>item.id===mapping.id?{...item,targetVariable:event.target.value}:item)})}><option value="">Select variable</option>{resources.filter((resource)=>resource.writable!==false&&resource.generatedByElementId!==draft.id).map((resource)=><option key={resource.id||resource.apiName} value={resourcePath(resource)}>{resource.label||resource.apiName}{resource.secure?' — ********':''}</option>)}</select><button type="button" aria-label={`Remove output mapping ${index+1}`} onClick={()=>patch({manualOutputs:config.manualOutputs.filter((item)=>item.id!==mapping.id)})}><Trash2 size={12}/></button></div>)}</div><button type="button" className="gptb-inline-action" onClick={()=>patch({manualOutputs:[...config.manualOutputs,{id:uid('output'),outputPath:'',targetVariable:''}]})}><Plus size={12}/> Add Output Mapping</button></>}
    </section>:null}
    {errors.length?<div className="gptb-gr-errors"><b>Complete this Action element</b>{errors.map((error)=><span key={error}>{error}</span>)}</div>:null}
    {httpWizardOpen?<HttpCalloutWizard integrations={integrations} onCancel={()=>setHttpWizardOpen(false)} onCreate={(callout)=>{
      const http=actions.find((action)=>action.key==='ONE_HTTP_REQUEST')
      const inputs={},modes={},included={},transforms={}
      for(const [name,schema] of Object.entries(http?.schema?.properties||{})){inputs[name]=Object.prototype.hasOwnProperty.call(callout,name)?callout[name]:inputDefault(schema);modes[name]='value';included[name]=(http?.schema?.required||[]).includes(name)||Object.prototype.hasOwnProperty.call(callout,name)?'specified':'omit';transforms[name]={source:'',mappings:[]}}
      patch({actionKey:'ONE_HTTP_REQUEST',actionLabel:'HTTP Callout',inputs,inputModes:modes,inputIncluded:included,transforms,outputMode:'automatic',manualOutputs:[],httpCallout:{connectionKey:callout.connectionKey,responseSchema:callout.responseSchema,sampleResponse:callout.sampleResponse}})
      setHttpWizardOpen(false)
    }}/>:null}
  </div>
}
