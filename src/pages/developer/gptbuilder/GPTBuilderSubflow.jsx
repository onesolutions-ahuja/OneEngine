import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, Search } from 'lucide-react'
import { apiRequest } from '../../../services/api'

const resourcePath=(resource)=>resource?`variables.${resource.apiName}`:''
export const SUBFLOW_DEFAULTS=Object.freeze({workflowId:'',workflowApiName:'',flowLabel:'',inputMappings:{},inputModes:{},outputMappings:{}})
export function normalizeSubflowConfig(config={}){return{...SUBFLOW_DEFAULTS,...config,inputMappings:config.inputMappings||{},inputModes:config.inputModes||{},outputMappings:config.outputMappings||{}}}
export function subflowConfigErrors(config={},flows=[],resources=[]){
  const c=normalizeSubflowConfig(config),errors=[]
  const flow=flows.find((item)=>String(item.id)===String(c.workflowId))
  if(!flow)errors.push('Select a referenced flow.')
  const inputs=flow?.action?.inputContract||[]
  inputs.filter((input)=>input.required===true).forEach((input)=>{
    const value=c.inputMappings[input.name]
    if(c.inputModes[input.name]==='resource'){
      if(!resources.some((resource)=>resourcePath(resource)===value))errors.push(`${input.label||input.name}: select a resource.`)
    }else if(value===''||value==null)errors.push(`${input.label||input.name}: enter a value.`)
  })
  return errors
}
export function subflowRuntimeAction(instance){
  const c=normalizeSubflowConfig(instance?.config),inputs={}
  for(const [name,value] of Object.entries(c.inputMappings||{}))inputs[name]=c.inputModes?.[name]==='resource'?{path:value}:value
  return{id:instance.id,key:'RUN_SUBFLOW',label:instance.label,apiName:instance.apiName,description:instance.description||'',workflowId:c.workflowId,subflowApiName:c.workflowApiName,workflowInputs:inputs,outputMappings:c.outputMappings}
}
function hasWait(flow){
  return (flow?.action?.gptBuilderElements||flow?.action?.actions||[]).some((element)=>['wait_duration','wait_conditions','wait_until_date','WAIT_DURATION','WAIT_FOR_CONDITIONS','WAIT_UNTIL_DATE','WAIT'].includes(element?.key))
}
export default function GPTBuilderSubflow({draft,updateConfig,resources=[],currentFlowType,onConfiguredChange}){
  const config=normalizeSubflowConfig(draft.config)
  const [flows,setFlows]=useState([]),[query,setQuery]=useState(''),[loading,setLoading]=useState(true)
  useEffect(()=>{let live=true;setLoading(true);apiRequest('/api/platform/rules').then((response)=>{if(!live)return;const list=(Array.isArray(response?.data)?response.data:[]).filter((item)=>item?.action?.type==='workflow'&&item?.action?.isTemplate!==true&&item?.id!==draft.workflowId);setFlows(list)}).catch(()=>{if(live)setFlows([])}).finally(()=>{if(live)setLoading(false)});return()=>{live=false}},[])
  const selectable=flows.filter((flow)=>{
    const type=flow?.action?.flowType
    if(currentFlowType==='autolaunched'&&type==='screen')return false
    if(hasWait(flow))return false
    return true
  })
  const selected=selectable.find((flow)=>String(flow.id)===String(config.workflowId))
  const errors=useMemo(()=>subflowConfigErrors(config,selectable,resources),[JSON.stringify(config),JSON.stringify(selectable),JSON.stringify(resources)])
  useEffect(()=>{onConfiguredChange?.(errors.length===0,errors)},[JSON.stringify(errors)])
  const patch=(changes)=>updateConfig({...config,...changes})
  const scalar=resources.filter((resource)=>resource?.isCollection!==true)
  const matches=selectable.filter((flow)=>!query.trim()||`${flow.name||''} ${flow.action?.apiName||''}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0,40)

  return <div className="gptb-gr gptb-subflow-editor">
    <section><h3>Referenced Flow</h3>
      <div className="gptb-action-search"><Search size={13}/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search flows by label or API name..."/></div>
      <label><span>Referenced Flow <b>*</b></span><select value={config.workflowId} disabled={loading} onChange={(event)=>{const flow=selectable.find((item)=>String(item.id)===event.target.value);patch({workflowId:event.target.value,workflowApiName:flow?.action?.apiName||'',flowLabel:flow?.name||'',inputMappings:{},inputModes:{},outputMappings:{}})}}><option value="">{loading?'Loading flows...':'Select a flow'}</option>{matches.map((flow)=><option key={flow.id} value={flow.id}>{flow.name} · {flow.action?.apiName||'Workflow'}</option>)}</select>{selected?<small>{selected.active||selected.runtime_active?'Active version':'Latest version'} · {selected.action?.flowType||'Flow'}</small>:null}</label>
      {selected?<button type="button" className="gptb-inline-action" onClick={()=>window.open(`/developer/gptbuilder?workflowId=${encodeURIComponent(selected.id)}`,'_blank','noopener,noreferrer')}><ExternalLink size={12}/> Open Referenced Flow</button>:null}
    </section>
    {selected?.action?.inputContract?.length?<section><h3>Select Input Values</h3>{selected.action.inputContract.map((input)=><div className="gptb-subflow-contract-row" key={input.name}><label><span>{input.label||input.name}{input.required?' *':''}</span><select value={config.inputModes[input.name]||'value'} onChange={(event)=>patch({inputModes:{...config.inputModes,[input.name]:event.target.value},inputMappings:{...config.inputMappings,[input.name]:''}})}><option value="value">Value</option><option value="resource">Resource</option></select></label>{(config.inputModes[input.name]||'value')==='resource'?<select value={config.inputMappings[input.name]||''} onChange={(event)=>patch({inputMappings:{...config.inputMappings,[input.name]:event.target.value}})}><option value="">Select a resource</option>{resources.map((resource)=><option key={resource.id||resource.apiName} value={resourcePath(resource)}>{resource.label||resource.apiName}</option>)}</select>:<input value={config.inputMappings[input.name]??''} onChange={(event)=>patch({inputMappings:{...config.inputMappings,[input.name]:event.target.value}})}/>}<small>{input.description||input.type||'Input'}</small></div>)}</section>:selected?<section><h3>Select Input Values</h3><small>The referenced flow has no exposed inputs.</small></section>:null}
    {selected?.action?.outputContract?.length?<section><h3>Store Output Values</h3>{selected.action.outputContract.map((output)=><div className="gptb-subflow-output-row" key={output.name}><span><b>{output.label||output.name}</b><small>{output.description||output.type||'Output'}</small></span><select value={config.outputMappings[output.name]||''} onChange={(event)=>patch({outputMappings:{...config.outputMappings,[output.name]:event.target.value}})}><option value="">Don't store</option>{scalar.map((resource)=><option key={resource.id||resource.apiName} value={resourcePath(resource)}>{resource.label||resource.apiName}</option>)}</select></div>)}</section>:null}
    {errors.length?<div className="gptb-gr-errors"><b>Complete this Subflow element</b>{errors.map((error)=><span key={error}>{error}</span>)}</div>:null}
  </div>
}
