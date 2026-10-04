import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, Clock3, Copy, Database, Eye, GitBranch, Group, LayoutGrid, ListFilter, Monitor, MoreVertical, Plus, Redo2, Save, Search, Settings2, Trash2, Type, Undo2, Workflow, X, Zap, ZoomIn, ZoomOut } from 'lucide-react'
import { apiRequest } from '../../services/api'
import './Builder2Page.css'
import { FLOW_TYPES, RESOURCE_TYPES, automaticResources, elementAllowed, requiresRuntimeRecordEditor, validateDefinition } from './builder2Model'
import Builder2GraphCanvas from './Builder2GraphCanvas'
import Builder2AutoLayout from './Builder2AutoLayout'
import { nativeRuntimeAction, runtimeCondition } from './builder2Runtime'

const CORE = [
  ['GET_RECORDS','Get Records','Data','Find OneEngine records and store field values.'],
  ['CREATE_RECORDS','Create Records','Data','Create one or more OneEngine records.'],
  ['UPDATE_RECORDS','Update Records','Data','Update OneEngine records.'],
  ['DELETE_RECORDS','Delete Records','Data','Delete OneEngine records.'],
  ['ASSIGNMENT','Assignment','Logic','Set variables and record values.'],
  ['DECISION','Decision','Logic','Route the flow based on conditions.'],
  ['LOOP','Loop','Logic','Iterate through a collection.'],
  ['COLLECTION_FILTER','Collection Filter','Logic','Filter a collection using conditions.'],
  ['COLLECTION_SORT','Collection Sort','Logic','Sort a collection and optionally limit results.'],
  ['WAIT','Wait','Logic','Pause until conditions or time requirements are met.'],
  ['TRANSFORM','Transform','Logic','Map source data to a target structure.'],
  ['CUSTOM_ERROR','Custom Error','Logic','Surface a flow error to the user.'],
  ['SUBFLOW','Subflow','Interaction','Run another flow and use its outputs.'],
  ['SCREEN','Screen','Interaction','Collect information from or display information to the user.'],
]

const SCREEN_COMPONENTS = [
  ['DISPLAY_TEXT','Display Text','Display','Show formatted text on the screen.'],
  ['TEXT','Text','Input','Collect a single line of text.'],
  ['TEXTAREA','Long Text Area','Input','Collect multiple lines of text.'],
  ['NUMBER','Number','Input','Collect a numeric value.'],
  ['CURRENCY','Currency','Input','Collect a currency value.'],
  ['DATE','Date','Input','Collect a date.'],
  ['DATETIME','Date & Time','Input','Collect a date and time.'],
  ['CHECKBOX','Checkbox','Input','Collect a true or false value.'],
  ['RADIO','Radio Buttons','Choice','Select one choice.'],
  ['SELECT','Picklist','Choice','Select one choice from a list.'],
  ['MULTISELECT','Multi-Select Picklist','Choice','Select multiple choices.'],
  ['SECTION','Section','Layout','Arrange components into columns.'],
]
const TYPES = RESOURCE_TYPES
const keyOf=o=>String(o?.object_key||o?.objectKey||o?.api_name||o?.apiName||o?.id||'')
const labelOf=o=>o?.label||o?.name||keyOf(o)
const uid=()=>Math.random().toString(36).slice(2)+Date.now().toString(36)

function ObjectSearchPicker({objects,value,onChange,placeholder='Search objects…',ariaLabel='Search objects'}) {
  const [query,setQuery]=useState('')
  const [open,setOpen]=useState(false)
  const selected=useMemo(()=>objects.find(object=>keyOf(object)===String(value||''))||null,[objects,value])
  const selectedLabel=selected?labelOf(selected):''
  const matches=useMemo(()=>{
    const needle=String(query||'').trim().toLowerCase()
    return objects.filter(object=>{
      if(!needle)return true
      return `${labelOf(object)} ${keyOf(object)}`.toLowerCase().includes(needle)
    }).slice(0,12)
  },[objects,query])
  useEffect(()=>{if(!open)setQuery(selectedLabel)},[open,selectedLabel])
  const choose=object=>{
    const key=keyOf(object)
    onChange(key)
    setQuery(labelOf(object))
    setOpen(false)
  }
  return <div className="b2-object-picker" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setOpen(false)}}>
    <Search size={15}/>
    <input
      type="search"
      role="combobox"
      aria-label={ariaLabel}
      aria-autocomplete="list"
      aria-expanded={open}
      data-object-key={String(value||'')}
      value={open?query:selectedLabel}
      placeholder={placeholder}
      onFocus={()=>{setQuery(selectedLabel);setOpen(true)}}
      onChange={event=>{setQuery(event.target.value);if(value)onChange('');setOpen(true)}}
      onKeyDown={event=>{
        if(event.key==='Escape'){setOpen(false);event.currentTarget.blur()}
        if(event.key==='Enter'&&open&&matches[0]){event.preventDefault();choose(matches[0])}
      }}
    />
    {open?<div className="b2-object-picker-menu" role="listbox">
      {matches.length?matches.map(object=>{
        const key=keyOf(object)
        return <button type="button" role="option" aria-selected={String(value||'')===key} data-object-key={key} key={key} onMouseDown={event=>event.preventDefault()} onClick={()=>choose(object)}>
          <span>{labelOf(object)}</span><small>{key}</small>
        </button>
      }):<div className="b2-object-picker-empty">No objects found</div>}
    </div>:null}
  </div>
}
const normalizeFlowType=value=>{
  const raw=String(value||'').trim()
  if(FLOW_TYPES[raw])return raw
  const key=raw.toUpperCase()
  if(key==='RECORD_TRIGGERED')return 'record'
  if(key==='SCHEDULE_TRIGGERED')return 'schedule'
  if(key==='SCREEN_FLOW')return 'screen'
  if(key==='PLATFORM_EVENT_TRIGGERED'||key==='EVENT_TRIGGERED')return 'platform_event'
  if(key==='RECOMMENDATION_STRATEGY')return 'recommendation_strategy'
  if(key==='INSTRUCTION_FLOW')return 'instruction'
  if(key==='KIOSK_EXPERIENCE')return 'kiosk'
  return 'autolaunched'
}
const normalizeNodeType=value=>{
  const type=String(value||'').toUpperCase()
  if(['CREATE_RECORD','CREATE_RELATED_RECORD'].includes(type))return 'CREATE_RECORDS'
  if(['UPDATE_RECORD','UPDATE_RELATED_RECORD','BULK_UPDATE_RECORDS'].includes(type))return 'UPDATE_RECORDS'
  if(type==='DELETE_RECORD')return 'DELETE_RECORDS'
  if(['ASSIGN_RECORD','SET_VARIABLE'].includes(type))return 'ASSIGNMENT'
  if(type==='CONDITION')return 'DECISION'
  if(type==='RUN_SUBFLOW')return 'SUBFLOW'
  if(['WAIT_FOR_CONDITIONS','WAIT_UNTIL_DATE'].includes(type))return 'WAIT'
  return type
}
const BUILDER_NATIVE_RUNTIME_TYPES=new Set(['GET_RECORDS','CREATE_RECORD','CREATE_RELATED_RECORD','UPDATE_RECORD','UPDATE_RELATED_RECORD','BULK_UPDATE_RECORDS','DELETE_RECORD','ASSIGN_RECORD','SET_VARIABLE','ASSIGNMENT','CONDITION','LOOP','WAIT','WAIT_FOR_CONDITIONS','WAIT_UNTIL_DATE','RUN_SUBFLOW','SUBFLOW','COLLECTION_FILTER','COLLECTION_SORT','TRANSFORM','CUSTOM_ERROR','SCREEN','END'])
const OPERATOR_TO_BUILDER={equals:'Equals',not_equals:'Does Not Equal',is_empty:'Is Null',changed:'Is Changed',greater_than:'Greater Than',greater_than_or_equal:'Greater Than or Equal',less_than:'Less Than',less_than_or_equal:'Less Than or Equal'}
const OPERATOR_TO_RUNTIME=Object.fromEntries(Object.entries(OPERATOR_TO_BUILDER).map(([key,value])=>[value,key]))
const conditionToBuilder=row=>({id:row?.id||uid(),resource:row?.field||row?.resource||'',operator:OPERATOR_TO_BUILDER[row?.operator]||row?.operator||'Equals',value:row?.value??''})
const conditionToRuntime=row=>({field:row?.resource||row?.field||'',operator:OPERATOR_TO_RUNTIME[row?.operator]||String(row?.operator||'equals').toLowerCase().replaceAll(' ','_'),value:row?.value??''})
const actionInputs=x=>Object.fromEntries(Object.entries(x||{}).filter(([key])=>!['id','label','apiName','api_name','description','key','type'].includes(key)))
const LEGACY_COMMUNICATION_ACTIONS=new Set(['SEND_EMAIL','SEND_SMS','SEND_WHATSAPP','IN_APP_NOTIFICATION','SEND_APPOINTMENT_MESSAGE'])
const communicationBinding=value=>value&&typeof value==='object'&&!Array.isArray(value)&&typeof value.path==='string'?{mode:'resource',value:value.path}:{mode:'literal',value:value??''}
const communicationContextRows=context=>Object.entries(context&&typeof context==='object'&&!Array.isArray(context)?context:{}).map(([name,value])=>{const binding=communicationBinding(value);return{id:uid(),name,...binding}})
const communicationRuntimeValue=(mode,value)=>mode==='resource'&&String(value||'').trim()?{path:String(value).trim()}:value
const communicationRuntimeContext=rows=>Object.fromEntries((rows||[]).filter(row=>String(row.name||'').trim()).map(row=>[String(row.name).trim(),communicationRuntimeValue(row.mode,row.value)]))
const runtimeActionToBuilderNode=x=>{
  const rawType=String(x?.type||x?.key||'').toUpperCase()
  const base={id:x?.id||uid(),label:x?.label||x?.displayName||rawType||'Element',apiName:x?.apiName||x?.api_name||x?.id||rawType||'Element',description:x?.description||''}
  if(rawType==='CONDITION'){
    return {...base,type:'DECISION',config:{
      evaluation:'first',
      outcomes:(x?.outcomes||[]).map((outcome,index)=>({
        id:outcome?.id||uid(),label:outcome?.label||`Outcome ${index+1}`,apiName:outcome?.apiName||outcome?.id||`Outcome_${index+1}`,
        conditionLogic:outcome?.condition?.match||'all',
        conditions:(outcome?.condition?.conditions||[]).map(conditionToBuilder),
        branch:Array.isArray(outcome?.branch)?outcome.branch:[],
      })),
      defaultOutcomeLabel:x?.defaultLabel||'Default Outcome',
      defaultBranch:Array.isArray(x?.defaultBranch)?x.defaultBranch:[],
    }}
  }
  if(rawType==='RUN_SUBFLOW'){
    const inputs=x?.inputs||x?.workflowInputs||x?.inputMap||{}
    const outputs=x?.outputs||x?.outputMappings||x?.outputMap||{}
    return {...base,type:'SUBFLOW',config:{flow:x?.workflowId||x?.subflowId||'',inputs,outputs,inputsText:Object.keys(inputs).length?JSON.stringify(inputs,null,2):'',outputsText:Object.keys(outputs).length?JSON.stringify(outputs,null,2):''}}
  }
  if(rawType==='WAIT_UNTIL_DATE')return {...base,type:'WAIT',config:{waitType:'date',dateResource:x?.resumeAt||''}}
  if(rawType==='WAIT_FOR_CONDITIONS')return {...base,type:'WAIT',config:{waitType:'conditions',conditionLogic:x?.waitCondition?.match||x?.condition?.match||'all',conditions:(x?.waitCondition?.conditions||x?.condition?.conditions||[]).map(conditionToBuilder),pollSeconds:x?.pollSeconds||60}}
  const normalized=normalizeNodeType(rawType)
  if(rawType==='SEND_COMMUNICATION'){
    const inputs=actionInputs(x), channel=communicationBinding(inputs.channel), recipient=communicationBinding(inputs.recipient??inputs.to)
    return {...base,type:'ACTION',config:{
      actionKey:rawType,inputs,inputsText:'',
      channelMode:channel.mode,channelValue:channel.value,
      recipientMode:recipient.mode,recipientValue:recipient.value,
      subject:inputs.subject||'',title:inputs.title||'',
      message:inputs.message??inputs.body??inputs.text??'',
      template:inputs.templateId??inputs.templateKey??inputs.template??'',
      templateContextRows:communicationContextRows(inputs.templateContext),
    }}
  }
  if(!BUILDER_NATIVE_RUNTIME_TYPES.has(rawType)||requiresRuntimeRecordEditor(x)){
    const inputs=actionInputs(x)
    return {...base,type:'ACTION',config:{actionKey:rawType,inputs,inputsText:JSON.stringify(inputs,null,2)}}
  }
  return {...base,type:normalized,config:x?.config||actionInputs(x)}
}
const builderNodeToRuntimeAction=(node,resources=[])=>{
  const native=nativeRuntimeAction(node,resources)
  if(native)return native
  const base={id:node.id,label:node.label,apiName:node.apiName,description:node.description||''}
  const p=node.config||{}
  if(node.type==='DECISION'){
    return {...base,key:'CONDITION',
      outcomes:(p.outcomes||[]).map((outcome,index)=>({
        id:outcome.id||`outcome-${index+1}`,
        label:outcome.label||`Outcome ${index+1}`,
        condition:{match:outcome.conditionLogic||'all',conditions:(outcome.conditions||[]).map(runtimeCondition)},
        branch:Array.isArray(outcome.branch)?outcome.branch:[],
      })),
      defaultLabel:p.defaultOutcomeLabel||'Default Outcome',
      defaultBranch:Array.isArray(p.defaultBranch)?p.defaultBranch:[],
    }
  }
  if(node.type==='ACTION'&&p.actionKey==='SEND_COMMUNICATION'){
    const inherited=p.inputs&&typeof p.inputs==='object'?p.inputs:{}
    return {...base,...inherited,key:'SEND_COMMUNICATION',
      channel:communicationRuntimeValue(p.channelMode||'literal',p.channelValue||''),
      recipient:communicationRuntimeValue(p.recipientMode||'literal',p.recipientValue||''),
      subject:p.subject||undefined,title:p.title||undefined,message:p.message||undefined,
      templateKey:p.template||undefined,
      templateContext:communicationRuntimeContext(p.templateContextRows),
    }
  }
  if(node.type==='ACTION'){
    let inputs=p.inputs&&typeof p.inputs==='object'?p.inputs:{}
    if(String(p.inputsText||'').trim()){
      try{inputs=JSON.parse(p.inputsText)}catch{throw new Error(`${node.label||'Action'} has invalid Input Values JSON`)}
    }
    return {...base,key:p.actionKey,...inputs}
  }
  if(node.type==='SUBFLOW'){
    let inputs=p.inputs&&typeof p.inputs==='object'?p.inputs:{}, outputs=p.outputs&&typeof p.outputs==='object'?p.outputs:{}
    if(String(p.inputsText||'').trim()){try{inputs=JSON.parse(p.inputsText)}catch{throw new Error(`${node.label||'Subflow'} has invalid Input Values JSON`)}}
    if(String(p.outputsText||'').trim()){try{outputs=JSON.parse(p.outputsText)}catch{throw new Error(`${node.label||'Subflow'} has invalid Output Values JSON`)}}
    return {...base,key:'RUN_SUBFLOW',workflowId:p.flow,inputs,outputs}
  }
  if(node.type==='WAIT'){
    if(p.waitType==='date')return {...base,key:'WAIT_UNTIL_DATE',resumeAt:p.dateResource}
    if(p.waitType==='conditions')return {...base,key:'WAIT_FOR_CONDITIONS',waitCondition:{match:p.conditionLogic==='any'?'any':'all',conditions:(p.conditions||[]).map(runtimeCondition)},pollSeconds:Number(p.pollSeconds||60)}
    return {...base,key:'WAIT',durationSeconds:Math.max(0,Number(p.amount||0))*(p.unit==='days'?86400:p.unit==='hours'?3600:60)}
  }
  return {...base,type:node.type,config:p}
}
const recordStartFromTrigger=(triggerKey='',objectKey='',action={})=>{
  const key=String(triggerKey||'').toLowerCase()
  const trigger=key.includes('delete')?'deleted':key.includes('create')&&!key.includes('update')?'created':key.includes('update')&&!key.includes('create')?'updated':'created_or_updated'
  return {objectKey,trigger,conditionLogic:action.match||'all',conditions:[],optimize:key.startsWith('before_')||key==='before_save'?'fast':'actions'}
}

function ResourcePicker({objects, objectKey, value, onChange, resources, onNew, flowType='record', startConfig={}}) {
  const [open,setOpen]=useState(false), [search,setSearch]=useState(''), [trail,setTrail]=useState([])
  const object=objects.find(o=>keyOf(o)===objectKey)
  const automatic=automaticResources(flowType,startConfig)
  const rootRows=[...automatic,...resources]
  const childRoot=trail.length?rootRows.find(r=>r.label===trail[0]):null
  const childRows=childRoot?[{value:childRoot.value,label:`${childRoot.label} (Entire Record)`,type:childRoot.type,leaf:true},...resources.filter(r=>String(r.value||'').startsWith(`${childRoot.value}.`))]:[]
  const rows=(trail.length?childRows:rootRows).filter(r=>!search||String(r.label||r.value).toLowerCase().includes(search.toLowerCase()))
  const selected=[...automatic,...resources].find(r=>r.value===value)
  return <div className="b2-resource">
    <button type="button" className="b2-combobox" onClick={()=>setOpen(v=>!v)}><span>{selected?.label||value||'Select a resource…'}</span><ChevronDown size={14}/></button>
    {open?<div className="b2-resource-menu">
      <div className="b2-resource-head">{trail.length?<button onClick={()=>setTrail(t=>t.slice(0,-1))}><ChevronLeft size={14}/></button>:null}<span>{trail.length?trail.join(' › '):'Select a Resource'}</span><button onClick={()=>{setOpen(false);setTrail([])}}><X size={14}/></button></div>
      <label className="b2-resource-search"><Search size={14}/><input autoFocus value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search resources…"/></label>
      <div className="b2-resource-list">
        {!rows.length?<div className="b2-empty-small">No matching resources</div>:rows.map(r=><button key={r.value} className={r.value===value?'is-selected':''} onClick={()=>{if(r.children&&!trail.length){setTrail([r.label]);setSearch('');return}onChange(r.value);setOpen(false);setTrail([])}}><span className="b2-resource-icon"><Database size={14}/></span><span><b>{r.label}</b><small>{r.type||'Resource'}{r.value==='$record'&&object? ` · ${labelOf(object)}`:''}</small></span>{r.value===value?<span>✓</span>:r.children?<ChevronRight size={14}/>:null}</button>)}
      </div>
      <button className="b2-new-resource" onClick={()=>{setOpen(false);onNew()}}><Plus size={14}/> New Resource</button>
    </div>:null}
  </div>
}

function ResourceDialog({onClose,onCreate}) {
  const [type,setType]=useState('Variable'),[name,setName]=useState(''),[dataType,setDataType]=useState('Text'),[value,setValue]=useState(''),[isCollection,setIsCollection]=useState(false),[availableInput,setAvailableInput]=useState(false),[availableOutput,setAvailableOutput]=useState(false),[objectKey,setObjectKey]=useState('')
  return <div className="b2-modal-backdrop"><div className="b2-modal"><header><div><h3>New Resource</h3><p>Create a resource for this flow.</p></div><button onClick={onClose}><X size={18}/></button></header>
    <div className="b2-form">
      <label>Resource Type<select value={type} onChange={e=>setType(e.target.value)}>{TYPES.map(x=><option key={x}>{x}</option>)}</select></label>
      <label>API Name<input value={name} onChange={e=>setName(e.target.value)} placeholder="Resource_API_Name"/></label>
      {!['Text Template'].includes(type)?<label>Data Type<select value={dataType} onChange={e=>setDataType(e.target.value)}><option>Text</option><option>Number</option><option>Currency</option><option>Boolean</option><option>Date</option><option>Date/Time</option><option>Record</option></select></label>:null}
      {type==='Variable'?<><label className="b2-check"><input type="checkbox" checked={isCollection} onChange={e=>setIsCollection(e.target.checked)}/> Allow multiple values (collection)</label><label className="b2-check"><input type="checkbox" checked={availableInput} onChange={e=>setAvailableInput(e.target.checked)}/> Available for input</label><label className="b2-check"><input type="checkbox" checked={availableOutput} onChange={e=>setAvailableOutput(e.target.checked)}/> Available for output</label>{dataType==='Record'?<label>Object API Name<input value={objectKey} onChange={e=>setObjectKey(e.target.value)} placeholder="Object API name"/></label>:null}</>:null}
      {type==='Formula'?<label>Formula<textarea value={value} onChange={e=>setValue(e.target.value)} rows={6} placeholder="Enter formula…"/></label>:type==='Text Template'?<label>Body<textarea value={value} onChange={e=>setValue(e.target.value)} rows={8} placeholder="Enter text and resources…"/></label>:type==='Choice'?<label>Choice Value<input value={value} onChange={e=>setValue(e.target.value)} placeholder="Stored value"/></label>:type==='Record Choice Set'?<><label>Object API Name<input value={objectKey} onChange={e=>setObjectKey(e.target.value)} placeholder="Object API name"/></label><label>Filter / Label / Value Configuration<textarea value={value} onChange={e=>setValue(e.target.value)} rows={5} placeholder="Metadata-driven choice configuration"/></label></>:type==='Collection Choice Set'?<label>Collection Resource<input value={value} onChange={e=>setValue(e.target.value)} placeholder="Collection resource API name"/></label>:type==='Picklist Choice Set'?<><label>Object API Name<input value={objectKey} onChange={e=>setObjectKey(e.target.value)} placeholder="Object API name"/></label><label>Picklist Field API Name<input value={value} onChange={e=>setValue(e.target.value)} placeholder="Field API name"/></label></>:type==='Stage'?<label>Stage Order<input type="number" min="1" value={value} onChange={e=>setValue(e.target.value)}/></label>:<label>Default Value<input value={value} onChange={e=>setValue(e.target.value)}/></label>}
    </div><footer><button onClick={onClose}>Cancel</button><button className="is-primary" disabled={!name.trim()} onClick={()=>onCreate({value:`${name.trim()}`,apiName:name.trim(),label:name.trim(),type,dataType,defaultValue:value,isCollection,availableInput,availableOutput,objectKey})}>Done</button></footer>
  </div></div>
}

function MetadataFieldPicker({objects=[],objectKey='',value,onChange,placeholder='Select a field…'}) {
  const [fields,setFields]=useState([]),[loading,setLoading]=useState(false)
  const object=objects.find(o=>keyOf(o)===objectKey)
  const objectId=object?.id||''
  useEffect(()=>{let live=true;if(!objectId){setFields([]);return()=>{live=false}};setLoading(true);apiRequest(`/api/platform/objects/${encodeURIComponent(objectId)}/fields`).then(r=>{if(live)setFields((Array.isArray(r?.data)?r.data:[]).filter(x=>x?.active!==false))}).catch(()=>{if(live)setFields([])}).finally(()=>{if(live)setLoading(false)});return()=>{live=false}},[objectId])
  return <select value={value||''} disabled={!objectKey||loading} onChange={e=>onChange(e.target.value)}><option value="">{loading?'Loading fields…':objectKey?placeholder:'Select an object first'}</option>{fields.map(field=>{const key=field.api_name||field.apiName||field.field_key||field.key||field.id;return <option key={key} value={key}>{field.label||field.name||key}</option>})}</select>
}

function Conditions({value=[],onChange,resources=[],objects=[],objectKey='',onNew=()=>{},flowType='record',startConfig={}}) {
  const rows=value.length?value:[{id:uid(),resource:'',operator:'Equals',value:''}]
  const patch=(id,p)=>onChange(rows.map(r=>r.id===id?{...r,...p}:r))
  return <div className="b2-condition-block">{rows.map((r,i)=><div className="b2-condition" key={r.id}><span>{i+1}</span><button type="button" aria-label={`Use resource path for condition ${i+1}`} onClick={()=>patch(r.id,{resourceMode:r.resourceMode==='path'?'field':'path',resource:''})}>{r.resourceMode==='path'?'Field':'Resource'}</button>{r.resourceMode==='path'||!objectKey||String(r.resource||'').startsWith('steps.')||String(r.resource||'').startsWith('variables.')?<input value={r.resource||''} onChange={e=>patch(r.id,{resource:e.target.value})} placeholder="Step or variable path"/>:<MetadataFieldPicker objects={objects} objectKey={objectKey} value={r.resource} onChange={v=>patch(r.id,{resource:v})}/>} <select value={r.operator} onChange={e=>patch(r.id,{operator:e.target.value})}><option>Equals</option><option>Does Not Equal</option><option>Is Null</option><option>Is Changed</option><option>Greater Than</option><option>Greater Than or Equal</option><option>Less Than</option><option>Less Than or Equal</option><option>Starts With</option><option>Ends With</option><option>Contains</option><option>In</option><option>Not In</option></select>{r.operator==='Is Null'?<select value={String(r.value||'false')} onChange={e=>patch(r.id,{value:e.target.value})}><option value="false">False</option><option value="true">True</option></select>:<input value={r.value} onChange={e=>patch(r.id,{value:e.target.value})} placeholder="Value"/>}<button onClick={()=>onChange(rows.filter(x=>x.id!==r.id))}><Trash2 size={13}/></button></div>)}<button className="b2-text-action" onClick={()=>onChange([...rows,{id:uid(),resource:'',operator:'Equals',value:''}])}><Plus size={13}/> Add Condition</button></div>
}

function BranchSteps({label,value,nodes,onChange,onAdd}) {
  return <fieldset className="b2-branch-steps"><legend>{label} Path</legend>{value.map((id,i)=><div key={id} className="b2-path-step"><span>{i+1}. {nodes.find(n=>n.id===id)?.label||id}</span><button type="button" aria-label={`Remove path step ${i+1}`} onClick={()=>onChange(value.filter((_,j)=>j!==i))}><Trash2 size={13}/></button></div>)}<label>Connect existing element<select value="" onChange={e=>{if(e.target.value)onChange([...value,e.target.value])}}><option value="">Select element?</option>{nodes.filter(n=>!value.includes(n.id)).map(n=><option value={n.id} key={n.id}>{n.label}</option>)}</select></label>{onAdd?<button type="button" onClick={onAdd}><Plus size={13}/> Add Element to Path</button>:null}</fieldset>
}

function CommunicationActionFields({p,patch,resources,objects,objectKey,onNew,flowType,startConfig}) {
  const rows=Array.isArray(p.templateContextRows)?p.templateContextRows:[]
  const updateRow=(id,changes)=>patch({templateContextRows:rows.map(row=>row.id===id?{...row,...changes}:row)})
  return <>
    <label>Channel Source<select value={p.channelMode||'literal'} onChange={e=>patch({channelMode:e.target.value,channelValue:''})}><option value="literal">Fixed channel</option><option value="resource">Flow resource</option></select></label>
    {p.channelMode==='resource'?<label>Channel<ResourcePicker {...{resources,objects,objectKey,onNew,flowType,startConfig}} value={p.channelValue||''} onChange={value=>patch({channelValue:value})}/></label>:<label>Channel<select value={p.channelValue||''} onChange={e=>patch({channelValue:e.target.value})}><option value="">Select channel…</option><option value="EMAIL">Email</option><option value="SMS">SMS</option><option value="WHATSAPP">WhatsApp</option><option value="IN_APP">In-app notification</option></select></label>}
    <label>Recipient Source<select value={p.recipientMode||'literal'} onChange={e=>patch({recipientMode:e.target.value,recipientValue:''})}><option value="literal">Fixed value</option><option value="resource">Flow resource</option></select></label>
    {p.recipientMode==='resource'?<label>Recipient<ResourcePicker {...{resources,objects,objectKey,onNew,flowType,startConfig}} value={p.recipientValue||''} onChange={value=>patch({recipientValue:value})}/></label>:<label>Recipient<input value={p.recipientValue||''} onChange={e=>patch({recipientValue:e.target.value})} placeholder={p.channelValue==='IN_APP'?'User ID or CURRENT_USER':'Address, number or recipient value'}/></label>}
    <label>Subject / Title<input value={p.subject||p.title||''} onChange={e=>patch({subject:e.target.value,title:e.target.value})} placeholder="Optional subject or notification title"/></label>
    <label>Template API Name<input value={p.template||''} onChange={e=>patch({template:e.target.value})} placeholder="Optional communication template"/></label>
    <label>Message<textarea rows={7} value={p.message||''} onChange={e=>patch({message:e.target.value})} placeholder="Message body. Merge fields are supplied below."/></label>
    <div className="b2-condition-block"><b>Template Variables</b>{rows.map((row,index)=><div className="b2-condition" key={row.id}><span>{index+1}</span><input value={row.name||''} onChange={e=>updateRow(row.id,{name:e.target.value})} placeholder="Variable name"/><select value={row.mode||'literal'} onChange={e=>updateRow(row.id,{mode:e.target.value,value:''})}><option value="literal">Value</option><option value="resource">Resource</option></select>{row.mode==='resource'?<ResourcePicker {...{resources,objects,objectKey,onNew,flowType,startConfig}} value={row.value||''} onChange={value=>updateRow(row.id,{value})}/>:<input value={row.value||''} onChange={e=>updateRow(row.id,{value:e.target.value})} placeholder="Value"/>}<button onClick={()=>patch({templateContextRows:rows.filter(x=>x.id!==row.id)})}><Trash2 size={13}/></button></div>)}<button className="b2-text-action" onClick={()=>patch({templateContextRows:[...rows,{id:uid(),name:'',mode:'resource',value:''}]})}><Plus size={13}/> Add Template Variable</button></div>
  </>
}
function ActionFaultPath({node,nodes,patch}) {
  let inputs
  try { inputs=node.config?.inputsText?JSON.parse(node.config.inputsText):node.config?.inputs||{} } catch { return null }
  const update=changes=>{const next={...inputs,...changes};patch({inputs:next,inputsText:JSON.stringify(next,null,2)})}
  return <><label>On Error<select value={inputs.faultMode||'FAIL'} onChange={e=>update({faultMode:e.target.value,...(e.target.value==='FAIL'?{faultBranch:[]}: {})})}><option value="FAIL">Stop with error</option><option value="ROUTE">Follow Fault Recovery</option></select></label>{inputs.faultMode==='ROUTE'?<BranchSteps label="Fault Recovery" value={inputs.faultBranch||[]} nodes={nodes.filter(n=>n.id!==node.id)} onChange={faultBranch=>update({faultBranch})}/>:null}</>
}
function Properties({node,onPatch,nodes=[],onAddBranch,objects,resources,onNew,actions,flowType='record',startConfig={}}) {
  if(!node)return <div className="b2-properties-empty"><Settings2 size={26}/><b>Select an element</b><span>Its properties appear here.</span></div>
  const p=node.config||{}, patch=x=>onPatch({...node,config:{...p,...x}})
  const objectKey=p.objectKey||(node.type==='DECISION'?startConfig.objectKey:'')||''
  const common=<><label>Label<input value={node.label||''} onChange={e=>onPatch({...node,label:e.target.value})}/></label><label>API Name<input value={node.apiName||''} onChange={e=>onPatch({...node,apiName:e.target.value})}/></label><label>Description<textarea rows={3} value={node.description||''} onChange={e=>onPatch({...node,description:e.target.value})} placeholder="Describe this element…"/></label></>
  const object=<label>Object<ObjectSearchPicker objects={objects} value={objectKey} onChange={value=>patch({objectKey:value})} /></label>
  const cond=<><label>Condition Requirements<select value={p.conditionLogic||'all'} onChange={e=>patch({conditionLogic:e.target.value})}><option value="all">All Conditions Are Met (AND)</option><option value="any">Any Condition Is Met (OR)</option><option value="custom">Custom Condition Logic Is Met</option><option value="formula">Formula Evaluates to True</option>{node.type==='GET_RECORDS'?<option value="none">None — Get All Records</option>:null}</select></label>{p.conditionLogic==='formula'?<label>Formula<textarea rows={5} value={p.formula||''} onChange={e=>patch({formula:e.target.value})} placeholder="Enter a Boolean formula…"/></label>:p.conditionLogic==='none'?null:<><Conditions value={p.conditions} onChange={v=>patch({conditions:v})} {...{resources,objects,objectKey,onNew,flowType,startConfig}}/>{p.conditionLogic==='custom'?<label>Custom Condition Logic<input value={p.customConditionLogic||''} onChange={e=>patch({customConditionLogic:e.target.value})} placeholder="Example: 1 AND (2 OR 3)"/></label>:null}</>}</>
  return <div className="b2-form">{common}
    {['GET_RECORDS','CREATE_RECORDS','UPDATE_RECORDS','DELETE_RECORDS'].includes(node.type)?object:null}
    {['GET_RECORDS','UPDATE_RECORDS','DELETE_RECORDS','COLLECTION_FILTER','WAIT'].includes(node.type)?cond:null}
    {node.type==='CREATE_RECORDS'?<><label>How Many Records to Create<select value={p.createCount||'one'} onChange={e=>patch({createCount:e.target.value})}><option value="one">One</option><option value="multiple">Multiple</option></select></label><label>How to Set Record Field Values<select value={p.valueMode||'manual'} onChange={e=>patch({valueMode:e.target.value})}><option value="manual">Manually</option><option value="record">From a Record Variable</option><option value="collection">From a Record Collection</option></select></label>{p.valueMode==='manual'||!p.valueMode?<div className="b2-condition-block">{(p.fieldValues||[{id:'field-1',field:'',value:''}]).map((row,i)=><div className="b2-condition" key={row.id||i}><span>{i+1}</span><MetadataFieldPicker objects={objects} objectKey={objectKey} value={row.field} onChange={v=>patch({fieldValues:(p.fieldValues||[{id:'field-1',field:'',value:''}]).map((x,j)=>j===i?{...x,field:v}:x)})}/><input value={row.value||''} onChange={e=>patch({fieldValues:(p.fieldValues||[{id:'field-1',field:'',value:''}]).map((x,j)=>j===i?{...x,value:e.target.value}:x)})} placeholder="Value or resource"/><button onClick={()=>patch({fieldValues:(p.fieldValues||[]).filter((_,j)=>j!==i)})}><Trash2 size={13}/></button></div>)}<button className="b2-text-action" onClick={()=>patch({fieldValues:[...(p.fieldValues||[]),{id:uid(),field:'',value:''}]})}><Plus size={13}/> Add Field</button></div>:<label>{p.valueMode==='collection'?'Record Collection':'Record'}<ResourcePicker {...{resources,objects,objectKey,onNew,flowType,startConfig}} value={p.sourceRecord||''} onChange={v=>patch({sourceRecord:v})}/></label>}</>:null}
    {node.type==='GET_RECORDS'?<><label>Sort Order<select value={p.sortOrder||'none'} onChange={e=>patch({sortOrder:e.target.value})}><option value="none">Not Sorted</option><option value="asc">Ascending</option><option value="desc">Descending</option></select></label>{p.sortOrder&&p.sortOrder!=='none'?<label>Sort By<MetadataFieldPicker objects={objects} objectKey={objectKey} value={p.sortBy||''} onChange={v=>patch({sortBy:v})}/></label>:null}<label>How Many Records to Store<select value={p.limit||'first'} onChange={e=>patch({limit:e.target.value})}><option value="first">Only the first record</option><option value="all">All records</option><option value="limited">All records, up to a specified limit</option></select></label>{p.limit==='limited'?<label>Maximum Number of Records to Store<input type="number" min="2" max="20000" value={p.maxRecords||''} onChange={e=>patch({maxRecords:e.target.value})}/></label>:null}<label>How to Store Record Data<select value={p.store||'auto'} onChange={e=>patch({store:e.target.value,selectedFields:[],fieldAssignments:[]})}><option value="auto">Automatically store all fields</option><option value="choose">Choose fields and let OneEngine do the rest</option><option value="advanced">Choose fields and assign variables (advanced)</option></select></label>{p.store==='choose'?<div className="b2-condition-block">{(p.selectedFields||['']).map((field,i)=><div className="b2-condition" key={i}><span>{i+1}</span><MetadataFieldPicker objects={objects} objectKey={objectKey} value={field} onChange={v=>patch({selectedFields:(p.selectedFields||['']).map((x,j)=>j===i?v:x)})}/><button onClick={()=>patch({selectedFields:(p.selectedFields||[]).filter((_,j)=>j!==i)})}><Trash2 size={13}/></button></div>)}<button className="b2-text-action" onClick={()=>patch({selectedFields:[...(p.selectedFields||[]),'']})}><Plus size={13}/> Add Field</button></div>:null}{p.store==='advanced'?<div className="b2-condition-block">{(p.fieldAssignments||[{id:'assign-1',field:'',resource:''}]).map((row,i)=><div className="b2-condition" key={row.id||i}><span>{i+1}</span><MetadataFieldPicker objects={objects} objectKey={objectKey} value={row.field} onChange={v=>patch({fieldAssignments:(p.fieldAssignments||[{id:'assign-1',field:'',resource:''}]).map((x,j)=>j===i?{...x,field:v}:x)})}/><ResourcePicker {...{resources,objects,objectKey,onNew,flowType,startConfig}} value={row.resource||''} onChange={v=>patch({fieldAssignments:(p.fieldAssignments||[{id:'assign-1',field:'',resource:''}]).map((x,j)=>j===i?{...x,resource:v}:x)})}/><button onClick={()=>patch({fieldAssignments:(p.fieldAssignments||[]).filter((_,j)=>j!==i)})}><Trash2 size={13}/></button></div>)}<button className="b2-text-action" onClick={()=>patch({fieldAssignments:[...(p.fieldAssignments||[]),{id:uid(),field:'',resource:''}]})}><Plus size={13}/> Add Field Assignment</button></div>:null}</>:null}
    {node.type==='UPDATE_RECORDS'?<><label>Record ID<input value={p.recordId||''} onChange={e=>patch({recordId:e.target.value})} placeholder="steps.get_session.record.id"/></label><label>How to Find Records to Update<select value={p.updateMode||'conditions'} onChange={e=>patch({updateMode:e.target.value})}><option value="conditions">Specify conditions to identify records, and set fields individually</option><option value="record">Use the IDs and all field values from a record or record collection</option></select></label>{p.updateMode==='record'?<label>Record or Record Collection<ResourcePicker {...{resources,objects,objectKey,onNew,flowType,startConfig}} value={p.sourceRecord||''} onChange={v=>patch({sourceRecord:v})}/></label>:<><div className="b2-condition-block">{(p.fieldValues||[{id:'update-field-1',field:'',value:''}]).map((row,i)=><div className="b2-condition" key={row.id||i}><span>{i+1}</span><MetadataFieldPicker objects={objects} objectKey={objectKey} value={row.field} onChange={v=>patch({fieldValues:(p.fieldValues||[{id:'update-field-1',field:'',value:''}]).map((x,j)=>j===i?{...x,field:v}:x)})}/><input value={row.value||''} onChange={e=>patch({fieldValues:(p.fieldValues||[{id:'update-field-1',field:'',value:''}]).map((x,j)=>j===i?{...x,value:e.target.value}:x)})} placeholder="Value or resource"/><button onClick={()=>patch({fieldValues:(p.fieldValues||[]).filter((_,j)=>j!==i)})}><Trash2 size={13}/></button></div>)}<button className="b2-text-action" onClick={()=>patch({fieldValues:[...(p.fieldValues||[]),{id:uid(),field:'',value:''}]})}><Plus size={13}/> Add Field</button></div></>}</>:null}
    {node.type==='DELETE_RECORDS'?<label>How to Find Records to Delete<select value={p.deleteMode||'conditions'} onChange={e=>patch({deleteMode:e.target.value})}><option value="conditions">Specify conditions</option><option value="record">Use a record or record collection</option></select>{p.deleteMode==='record'?<ResourcePicker {...{resources,objects,objectKey,onNew,flowType,startConfig}} value={p.sourceRecord||''} onChange={v=>patch({sourceRecord:v})}/>:null}</label>:null}
    {node.type==='DECISION'?<><label>Outcome Evaluation<select value={p.evaluation||'first'} onChange={e=>patch({evaluation:e.target.value})}><option value="first">First outcome whose conditions are met</option></select></label><div className="b2-outcomes">{(p.outcomes||[{id:'outcome-1',label:'Outcome 1',apiName:'Outcome_1',conditionLogic:'all',conditions:[]}]).map((outcome,i)=><fieldset key={outcome.id||i}><legend>Outcome {i+1}</legend><label>Label<input value={outcome.label||''} onChange={e=>patch({outcomes:(p.outcomes||[]).map((x,j)=>j===i?{...x,label:e.target.value}:x)})}/></label><label>API Name<input value={outcome.apiName||''} onChange={e=>patch({outcomes:(p.outcomes||[]).map((x,j)=>j===i?{...x,apiName:e.target.value}:x)})}/></label><Conditions value={outcome.conditions||[]} onChange={v=>patch({outcomes:(p.outcomes||[]).map((x,j)=>j===i?{...x,conditions:v}:x)})} {...{resources,objects,objectKey,onNew,flowType,startConfig}}/><BranchSteps label={outcome.label} value={outcome.branch||[]} nodes={nodes.filter(x=>x.id!==node.id)} onChange={branch=>patch({outcomes:p.outcomes.map((x,j)=>j===i?{...x,branch}:x)})} onAdd={()=>onAddBranch({nodeId:node.id,outcomeId:outcome.id})}/><button type="button" className="b2-text-action" onClick={()=>patch({outcomes:(p.outcomes||[]).filter((_,j)=>j!==i)})}><Trash2 size={13}/> Remove Outcome</button></fieldset>)}</div><button type="button" className="b2-text-action" onClick={()=>patch({outcomes:[...(p.outcomes||[]),{id:uid(),label:`Outcome ${(p.outcomes||[]).length+1}`,apiName:`Outcome_${(p.outcomes||[]).length+1}`,conditionLogic:'all',conditions:[]}]})}><Plus size={13}/> New Outcome</button><label>Default Outcome Label<input value={p.defaultOutcomeLabel||'Default Outcome'} onChange={e=>patch({defaultOutcomeLabel:e.target.value})}/></label></>:null}
    {node.type==='DECISION'?<BranchSteps label={p.defaultOutcomeLabel||'Default Outcome'} value={p.defaultBranch||[]} nodes={nodes.filter(x=>x.id!==node.id)} onChange={defaultBranch=>patch({defaultBranch})} onAdd={()=>onAddBranch({nodeId:node.id,outcomeId:'default'})}/>:null}
    {node.type==='WAIT'?<><label>Wait Type<select value={p.waitType||'duration'} onChange={e=>patch({waitType:e.target.value})}><option value="duration">Wait for Amount of Time</option><option value="date">Wait Until Date</option><option value="conditions">Wait for Conditions</option><option value="event">Wait Until Event</option></select></label>{p.waitType==='duration'||!p.waitType?<><label>Amount<input type="number" min="1" value={p.amount||''} onChange={e=>patch({amount:e.target.value})}/></label><label>Unit<select value={p.unit||'minutes'} onChange={e=>patch({unit:e.target.value})}><option value="minutes">Minutes</option><option value="hours">Hours</option><option value="days">Days</option></select></label></>:p.waitType==='date'?<label>Date/Time Resource<ResourcePicker {...{resources,objects,objectKey,onNew,flowType,startConfig}} value={p.dateResource||''} onChange={v=>patch({dateResource:v})}/></label>:p.waitType==='event'?<label>Event API Name<input value={p.eventKey||''} onChange={e=>patch({eventKey:e.target.value})}/></label>:<Conditions value={p.conditions||[]} onChange={v=>patch({conditions:v})} {...{resources,objects,objectKey,onNew,flowType,startConfig}}/>}</>:null}
    {node.type==='ASSIGNMENT'?<><label>Variable<ResourcePicker {...{resources,objects,objectKey,onNew,flowType,startConfig}} value={p.resource||''} onChange={v=>patch({resource:v})}/></label><label>Operator<select value={p.operator||'Equals'} onChange={e=>patch({operator:e.target.value})}><option>Equals</option><option>Add</option><option>Subtract</option><option>Add Item</option><option>Remove Item</option></select></label><label>Value<input value={p.value||''} onChange={e=>patch({value:e.target.value})}/></label></>:null}
    {node.type==='LOOP'?<><label>Collection Variable<ResourcePicker {...{resources,objects,objectKey,onNew,flowType,startConfig}} value={p.collection||''} onChange={v=>patch({collection:v})}/></label><label>Direction<select value={p.direction||'first'} onChange={e=>patch({direction:e.target.value})}><option value="first">First item to last item</option><option value="last">Last item to first item</option></select></label></>:null}
    {node.type==='COLLECTION_FILTER'?<><label>Collection<ResourcePicker {...{resources,objects,objectKey,onNew,flowType,startConfig}} value={p.collection||''} onChange={v=>patch({collection:v})}/></label><label>Filter Mode<select value={p.filterMode||'conditions'} onChange={e=>patch({filterMode:e.target.value})}><option value="conditions">Conditions</option><option value="formula">Formula</option></select></label>{p.filterMode==='formula'?<label>Formula<textarea rows={5} value={p.filterFormula||''} onChange={e=>patch({filterFormula:e.target.value})}/></label>:null}</>:null}
    {node.type==='COLLECTION_SORT'?<><label>Collection<ResourcePicker {...{resources,objects,objectKey,onNew,flowType,startConfig}} value={p.collection||''} onChange={v=>patch({collection:v})}/></label><label>Sort Order<select value={p.order||'asc'} onChange={e=>patch({order:e.target.value})}><option value="asc">Ascending</option><option value="desc">Descending</option></select></label><label>Maximum Items<input type="number" min="0" value={p.max||''} onChange={e=>patch({max:e.target.value})}/></label></>:null}
    {node.type==='TRANSFORM'?<div className="b2-transform"><div><b>Source Data</b><ResourcePicker {...{resources,objects,objectKey,onNew,flowType,startConfig}} value={p.source||''} onChange={v=>patch({source:v})}/></div><div><b>Target Data</b><ResourcePicker {...{resources,objects,objectKey,onNew,flowType,startConfig}} value={p.target||''} onChange={v=>patch({target:v})}/></div><label>Field Mappings<textarea rows={6} value={p.mappingsText||''} onChange={e=>patch({mappingsText:e.target.value})} placeholder="Map source fields/resources to target fields"/></label></div>:null}
    {node.type==='CUSTOM_ERROR'?<><label>Where to Show the Error<select value={p.location||'record'} onChange={e=>patch({location:e.target.value})}><option value="record">In a window on the record page</option><option value="field">Inline on a field</option></select></label>{p.location==='field'?<label>Field<ResourcePicker {...{resources,objects,objectKey,onNew,flowType,startConfig}} value={p.field||''} onChange={v=>patch({field:v})}/></label>:null}<label>Error Message<textarea rows={4} value={p.message||''} onChange={e=>patch({message:e.target.value})}/></label></>:null}
    {node.type==='ACTION'?<><label>Action<select value={p.actionKey||''} onChange={e=>patch({actionKey:e.target.value,inputs:{},inputsText:'',channelMode:'literal',channelValue:'',recipientMode:'literal',recipientValue:'',subject:'',title:'',message:'',template:'',templateContextRows:[]})}><option value="">Select action…</option>{actions.filter(a=>!LEGACY_COMMUNICATION_ACTIONS.has(String(a.key||'').toUpperCase())).map(a=><option key={a.key} value={a.key}>{a.displayName||a.label||a.key}</option>)}</select></label>{p.actionKey==='SEND_COMMUNICATION'?<CommunicationActionFields {...{p,patch,resources,objects,objectKey,onNew,flowType,startConfig}}/>:null}{p.actionKey&&p.actionKey!=='SEND_COMMUNICATION'?<label>Input Values (JSON)<textarea rows={7} value={p.inputsText||''} onChange={e=>patch({inputsText:e.target.value})} placeholder='{"field":"value or resource binding"}'/></label>:null}<ActionFaultPath {...{node,nodes,patch}}/><p className="b2-help">{p.actionKey==='SEND_COMMUNICATION'?'Channel, recipient, template and message are stored directly in Flow metadata. Provider credentials remain secured in the installed connector.':"Actions come from OneEngine's metadata action registry."}</p></>:null}
    {node.type==='SUBFLOW'?<><label>Flow API Name<input value={p.flow||''} onChange={e=>patch({flow:e.target.value})} placeholder="Active autolaunched flow API name"/></label><label>Input Values<textarea rows={5} value={p.inputsText||''} onChange={e=>patch({inputsText:e.target.value})} placeholder="Map available input variables"/></label><label>Output Values<textarea rows={5} value={p.outputsText||''} onChange={e=>patch({outputsText:e.target.value})} placeholder="Map output variables"/></label></>:null}
  </div>
}




function GroupDialog({onClose,onCreate}) {
  const [name,setName]=useState(''),[description,setDescription]=useState('')
  return <div className="b2-modal-backdrop"><div className="b2-modal"><header><div><h3>New Group</h3><p>Organize selected elements into a collapsible section.</p></div><button onClick={onClose}><X size={18}/></button></header><div className="b2-form"><label>Label<input autoFocus value={name} onChange={e=>setName(e.target.value)}/></label><label>Description<textarea rows={4} value={description} onChange={e=>setDescription(e.target.value)}/></label></div><footer><button onClick={onClose}>Cancel</button><button className="is-primary" disabled={!name.trim()} onClick={()=>onCreate(name.trim(),description.trim())}>Done</button></footer></div></div>
}

function StartProperties({value,onChange,objects,onClose,flowType='record'}) {
  const p=value||{}, patch=x=>onChange({...p,...x})
  const meta=FLOW_TYPES[flowType]||FLOW_TYPES.record
  if(meta.start==='none') return <div className="b2-start-panel"><header><div><b>Start</b><small>{meta.label}</small></div><button onClick={onClose}><X size={16}/></button></header><div className="b2-form"><p className="b2-help">This flow starts when invoked. Configure input variables in Manager and connect the first element from Start.</p></div></div>
  if(meta.start==='schedule') return <div className="b2-start-panel"><header><div><b>Configure Start</b><small>{meta.label}</small></div><button onClick={onClose}><X size={16}/></button></header><div className="b2-form"><label>Frequency<select value={p.schedule?.frequency||''} onChange={e=>patch({schedule:{...(p.schedule||{}),frequency:e.target.value}})}><option value="">Select frequency…</option><option value="once">Once</option><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label><label>Start Date<input type="date" value={p.schedule?.startDate||''} onChange={e=>patch({schedule:{...(p.schedule||{}),startDate:e.target.value}})}/></label><label>Start Time<input type="time" value={p.schedule?.startTime||''} onChange={e=>patch({schedule:{...(p.schedule||{}),startTime:e.target.value}})}/></label><label>Object (optional)<ObjectSearchPicker objects={objects} value={p.objectKey||''} onChange={value=>patch({objectKey:value})} placeholder="Search optional object…" ariaLabel="Search optional object" /></label></div></div>
  if(meta.start==='platform_event') return <div className="b2-start-panel"><header><div><b>Configure Start</b><small>{meta.label}</small></div><button onClick={onClose}><X size={16}/></button></header><div className="b2-form"><label>Platform Event API Name<input value={p.eventKey||''} onChange={e=>patch({eventKey:e.target.value})} placeholder="Event API name"/></label></div></div>
  return <div className="b2-start-panel"><header><div><b>Configure Start</b><small>{meta.label}</small></div><button onClick={onClose}><X size={16}/></button></header><div className="b2-form">
    <label>Object<ObjectSearchPicker objects={objects} value={p.objectKey||''} onChange={value=>patch({objectKey:value})} /></label>
    <fieldset><legend>Trigger the Flow When</legend>{[['created','A record is created'],['updated','A record is updated'],['created_or_updated','A record is created or updated'],['deleted','A record is deleted']].map(([v,l])=><label className="b2-radio" key={v}><input type="radio" checked={(p.trigger||'created_or_updated')===v} onChange={()=>patch({trigger:v})}/>{l}</label>)}</fieldset>
    <label>Condition Requirements<select value={p.conditionLogic||'all'} onChange={e=>patch({conditionLogic:e.target.value})}><option value="all">All Conditions Are Met (AND)</option><option value="any">Any Condition Is Met (OR)</option><option value="custom">Custom Condition Logic Is Met</option><option value="formula">Formula Evaluates to True</option><option value="none">None — Always Run</option></select></label>
    {p.conditionLogic==='formula'?<label>Formula<textarea rows={5} value={p.formula||''} onChange={e=>patch({formula:e.target.value})}/></label>:p.conditionLogic==='none'?null:<><Conditions value={p.conditions} onChange={conditions=>patch({conditions})} resources={[]} objects={objects} objectKey={p.objectKey||''} onNew={()=>{}} flowType={flowType} startConfig={p}/>{p.conditionLogic==='custom'?<label>Custom Condition Logic<input value={p.customConditionLogic||''} onChange={e=>patch({customConditionLogic:e.target.value})} placeholder="Example: 1 AND (2 OR 3)"/></label>:null}</>}
    {['updated','created_or_updated'].includes(p.trigger||'created_or_updated')?<label>When to Run for Updated Records<select value={p.updateMode||'every'} onChange={e=>patch({updateMode:e.target.value})}><option value="every">Every time a record is updated and meets the condition requirements</option><option value="transition">Only when a record is updated to meet the condition requirements</option></select></label>:null}
    {p.trigger==='deleted'?<p className="b2-help">Deleted-record flows run after the record is deleted.</p>:<fieldset><legend>Optimize the Flow For</legend><label className="b2-radio"><input type="radio" checked={(p.optimize||'actions')==='fast'} onChange={()=>patch({optimize:'fast'})}/>Fast Field Updates</label><label className="b2-radio"><input type="radio" checked={(p.optimize||'actions')==='actions'} onChange={()=>patch({optimize:'actions'})}/>Actions and Related Records</label></fieldset>}
  </div></div>
}

function ScreenEditor({node,onPatch,onClose}) {
  const [selected,setSelected]=useState(''),[search,setSearch]=useState(''),[side,setSide]=useState('properties')
  const config=node.config||{}, components=config.components||[]
  const selectedComponent=components.find(x=>x.id===selected)
  const patchConfig=p=>onPatch({...node,config:{...config,...p}})
  const patchComponent=p=>patchConfig({components:components.map(x=>x.id===selected?{...x,...p}:x)})
  const add=definition=>{const [type,label]=definition;const item={id:uid(),type,label,apiName:`${type}_${components.length+1}`,required:false,width:12,alignment:'left',visibleWhen:'',validateFormula:'',validationMessage:'',reactive:true,choices:[]};patchConfig({components:[...components,item]});setSelected(item.id)}
  const palette=SCREEN_COMPONENTS.filter(x=>!search||x.join(' ').toLowerCase().includes(search.toLowerCase()))
  return <div className="b2-screen-editor">
    <header className="b2-screen-top"><div><button onClick={onClose}><ChevronLeft size={16}/></button><span><b>{node.label}</b><small>Screen</small></span></div><div><button className={side==='properties'?'is-active':''} onClick={()=>setSide('properties')}>Properties</button><button className={side==='style'?'is-active':''} onClick={()=>setSide('style')}>Style</button><button className="is-primary" onClick={onClose}>Done</button></div></header>
    <div className="b2-screen-grid">
      <aside className="b2-screen-palette"><label className="b2-search"><Search size={14}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search components…"/></label>{['Input','Choice','Display','Layout'].map(group=><section key={group}><h4>{group}</h4>{palette.filter(x=>x[2]===group).map(x=><button key={x[0]} onClick={()=>add(x)}><span>{x[2]==='Layout'?<LayoutGrid size={14}/>:x[2]==='Display'?<Type size={14}/>:<Monitor size={14}/>}</span><span><b>{x[1]}</b><small>{x[3]}</small></span></button>)}</section>)}</aside>
      <main className="b2-screen-preview"><div className="b2-screen-device">
        {config.showHeader===false?<button className={selected===''?'b2-screen-header is-selected':'b2-screen-header'} onClick={()=>setSelected('')}><span>Header hidden</span></button>:<button className={selected===''?'b2-screen-header is-selected':'b2-screen-header'} onClick={()=>setSelected('')}><b>{config.screenTitle||node.label}</b><span>Screen header</span></button>}
        <div className="b2-screen-canvas">{!components.length?<div className="b2-screen-empty"><Monitor size={32}/><b>Build the screen</b><span>Add components from the palette.</span></div>:components.map(item=><button key={item.id} className={`b2-screen-component ${selected===item.id?'is-selected':''}`} style={{width:`${Math.max(1,Math.min(12,item.width||12))/12*100}%`}} onClick={()=>setSelected(item.id)}>
          <span className="b2-screen-component-label">{item.label}{item.required?' *':''}</span>{item.type==='DISPLAY_TEXT'?<p>{item.text||'Display text'}</p>:item.type==='CHECKBOX'?<span className="b2-screen-checkbox">□ {item.placeholder||'Checkbox'}</span>:item.type==='SECTION'?<div className="b2-screen-section">{Array.from({length:item.columns||2}).map((_,i)=><span key={i}>Column {i+1}</span>)}</div>:<div className="b2-screen-input">{item.placeholder||item.label}</div>}{item.visibleWhen?<Eye size={12} className="b2-visibility-icon"/>:null}
        </button>)}</div>
        {config.showFooter===false?null:<footer className="b2-screen-footer">{config.navigation!=='next'&&config.navigation!=='finish'?<button>Previous</button>:null}<button className="is-primary">{config.navigation==='finish'?'Finish':'Next'}</button></footer>}
      </div></main>
      <aside className="b2-screen-properties">{side==='style'?<div className="b2-form"><h3>Style</h3><label>Width<select value={selectedComponent?.width||12} disabled={!selectedComponent} onChange={e=>patchComponent({width:Number(e.target.value)})}>{[12,10,8,6,4,3].map(v=><option key={v} value={v}>{v} columns</option>)}</select></label><label>Alignment<select value={selectedComponent?.alignment||'left'} disabled={!selectedComponent} onChange={e=>patchComponent({alignment:e.target.value})}><option>left</option><option>center</option><option>right</option></select></label><label>Region<select value={config.region||'default'} onChange={e=>patchConfig({region:e.target.value})}><option value="default">Default</option><option value="header">Header</option><option value="footer">Footer</option></select></label></div>:selectedComponent?<div className="b2-form"><h3>{selectedComponent.label}</h3><label>Label<input value={selectedComponent.label} onChange={e=>patchComponent({label:e.target.value})}/></label><label>API Name<input value={selectedComponent.apiName} onChange={e=>patchComponent({apiName:e.target.value})}/></label>{selectedComponent.type==='DISPLAY_TEXT'?<label>Text<textarea rows={5} value={selectedComponent.text||''} onChange={e=>patchComponent({text:e.target.value})}/></label>:null}{selectedComponent.type==='SECTION'?<label>Columns<select value={selectedComponent.columns||2} onChange={e=>patchComponent({columns:Number(e.target.value)})}><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option></select></label>:null}{['RADIO','SELECT','MULTISELECT'].includes(selectedComponent.type)?<><label>Choice Source<select value={selectedComponent.choiceSource||'manual'} onChange={e=>patchComponent({choiceSource:e.target.value})}><option value="manual">Manual Choices</option><option value="resource">Choice Resource</option></select></label>{selectedComponent.choiceSource==='resource'?<label>Choice Resource API Name<input value={selectedComponent.choiceResource||''} onChange={e=>patchComponent({choiceResource:e.target.value})}/></label>:<label>Choices<textarea rows={5} value={(selectedComponent.choices||[]).join('\n')} onChange={e=>patchComponent({choices:e.target.value.split('\n').filter(Boolean)})} placeholder="One choice per line"/></label>}</>:null}<label className="b2-check"><input type="checkbox" checked={selectedComponent.required===true} onChange={e=>patchComponent({required:e.target.checked})}/> Required</label><label>Component Visibility<input value={selectedComponent.visibleWhen||''} onChange={e=>patchComponent({visibleWhen:e.target.value})} placeholder="Boolean formula or condition"/></label><label>Validate Input<input value={selectedComponent.validateFormula||''} onChange={e=>patchComponent({validateFormula:e.target.value})} placeholder="Boolean formula"/></label>{selectedComponent.validateFormula?<label>Error Message<input value={selectedComponent.validationMessage||''} onChange={e=>patchComponent({validationMessage:e.target.value})}/></label>:null}<label className="b2-check"><input type="checkbox" checked={selectedComponent.reactive!==false} onChange={e=>patchComponent({reactive:e.target.checked})}/> Reactive to same-screen changes</label><button className="b2-delete-component" onClick={()=>{patchConfig({components:components.filter(x=>x.id!==selected)});setSelected('')}}><Trash2 size={13}/> Delete Component</button></div>:<div className="b2-form"><h3>Screen Properties</h3><label>Label<input value={node.label} onChange={e=>onPatch({...node,label:e.target.value})}/></label><label>API Name<input value={node.apiName} onChange={e=>onPatch({...node,apiName:e.target.value})}/></label><label className="b2-check"><input type="checkbox" checked={config.showHeader!==false} onChange={e=>patchConfig({showHeader:e.target.checked})}/> Show Header</label><label className="b2-check"><input type="checkbox" checked={config.showFooter!==false} onChange={e=>patchConfig({showFooter:e.target.checked})}/> Show Footer</label><label>When User Revisits<select value={config.revisit||'retain'} onChange={e=>patchConfig({revisit:e.target.value})}><option value="retain">Use values from when the user last visited</option><option value="refresh">Refresh inputs to incorporate changes elsewhere</option></select></label><label>Navigation<select value={config.navigation||'both'} onChange={e=>patchConfig({navigation:e.target.value})}><option value="both">Previous and Next</option><option value="next">Next only</option><option value="finish">Finish</option></select></label></div>}</aside>
    </div>
  </div>
}

function FlowTestPanel({workflowId,busy,setBusy,buildPayload,setError,setRuntimeMessage,onClose}) {
  const [recordJson,setRecordJson]=useState('{}'),[result,setResult]=useState(null)
  return <div className="b2-drawer"><header><b>Test Mode</b><button onClick={onClose}><X size={16}/></button></header><div>
    <p>Test the draft with an inbound trigger record. Database changes are rolled back and connector sends are simulated.</p>
    <label>Trigger Record (JSON)<textarea rows={10} value={recordJson} onChange={e=>setRecordJson(e.target.value)}/></label>
    <button className="is-primary" disabled={!workflowId||busy} onClick={async()=>{setBusy(true);setError('');try{
      const recordOverride=JSON.parse(recordJson)
      if(!recordOverride||Array.isArray(recordOverride)||typeof recordOverride!=='object')throw new Error('Trigger Record must be a JSON object')
      const r=await apiRequest(`/api/platform/rules/${workflowId}/debug`,{method:'POST',body:JSON.stringify({definition:buildPayload('DRAFT'),recordOverride,mode:'test',debugOptions:{rollbackMode:true}})})
      setResult(r?.data||r);setRuntimeMessage(`Test: ${r?.data?.status||'completed'}`)
    }catch(e){setError(e?.message||'Test failed')}finally{setBusy(false)}}}>Run Test</button>
    {result?<><h4>Execution Result</h4><pre className="b2-test-result">{JSON.stringify(result,null,2)}</pre></>:null}
  </div></div>
}
export default function Builder2Page({initialWorkflowId='',initialFlowType='',initialObjectKey='',onClose,onSaved}){
  const [objects,setObjects]=useState([]),[actions,setActions]=useState([]),[nodes,setNodes]=useState([]),[edges,setEdges]=useState([]),[selected,setSelected]=useState(''),[selector,setSelector]=useState(false),[search,setSearch]=useState(''),[resources,setResources]=useState([]),[flowTests,setFlowTests]=useState([]),[resourceDialog,setResourceDialog]=useState(false),[tab,setTab]=useState('elements'),[error,setError]=useState(''),[screenEditing,setScreenEditing]=useState(''),[supportPanel,setSupportPanel]=useState(''),[startOpen,setStartOpen]=useState(()=>normalizeFlowType(initialFlowType)==='record'),[startConfig,setStartConfig]=useState(()=>({trigger:'created_or_updated',conditionLogic:'all',optimize:'actions',...(initialObjectKey?{objectKey:initialObjectKey}:{})})),[zoom,setZoom]=useState(100),[history,setHistory]=useState([]),[future,setFuture]=useState([]),[dirty,setDirty]=useState(false),[nodeMenu,setNodeMenu]=useState(''),[saveMenu,setSaveMenu]=useState(false),[active,setActive]=useState(false),[clipboard,setClipboard]=useState([]),[multiSelect,setMultiSelect]=useState(false),[selectedMany,setSelectedMany]=useState([]),[managerFilter,setManagerFilter]=useState('all'),[editHistory,setEditHistory]=useState([]),[actionEditing,setActionEditing]=useState(''),[toolboxOpen,setToolboxOpen]=useState(true),[layoutMode,setLayoutMode]=useState('auto'),[flowType,setFlowType]=useState(()=>normalizeFlowType(initialFlowType||'record')),[flowProps,setFlowProps]=useState({label:'New Flow',apiName:'New_Flow',description:'',apiVersion:'68.0',runContext:'default'}),[flowPropsOpen,setFlowPropsOpen]=useState(false),[historyPreview,setHistoryPreview]=useState(''),[groups,setGroups]=useState([]),[groupDialog,setGroupDialog]=useState(false),[branchCollapsed,setBranchCollapsed]=useState({}),[workflowId,setWorkflowId]=useState(()=>String(initialWorkflowId||'')),[busy,setBusy]=useState(false),[runtimeMessage,setRuntimeMessage]=useState(''),[debugResult,setDebugResult]=useState(null),[debugRollback,setDebugRollback]=useState(true)
  const canvasRef=useRef(null), centeredWorkflowRef=useRef('')
  useEffect(()=>{
    let live=true
    const selectedId=String(initialWorkflowId||'')
    const requestedType=normalizeFlowType(initialFlowType||'record')
    setError('')
    setWorkflowId(selectedId)
    setNodes([])
    setEdges([])
    setResources([])
    setFlowTests([])
    setGroups([])
    setActive(false)
    setFlowType(requestedType)
    setFlowProps({label:'New Flow',apiName:'New_Flow',description:'',apiVersion:'68.0',runContext:'default'})
    setStartConfig({trigger:'created_or_updated',conditionLogic:'all',optimize:'actions',...(initialObjectKey?{objectKey:initialObjectKey}:{})})
    setStartOpen(requestedType==='record')
    Promise.all([apiRequest('/api/platform/objects'),apiRequest('/api/platform/workflow-actions'),apiRequest('/api/platform/rules')]).then(([o,a,r])=>{
      if(!live)return
      setObjects(o?.data?.objects||o?.data||[])
      setActions(Array.isArray(a?.data)?a.data:[])
      if(!selectedId)return
      const rows=Array.isArray(r?.data)?r.data:[]
      const saved=rows.find(x=>String(x?.id||'')===selectedId)
      if(!saved){setError('Flow definition is no longer available. Return to the flow list and refresh.');return}
      const action=saved.action||{}
      const triggerKey=String(saved.trigger_key||saved.triggerKey||'')
      const inferredType=action.flowType||(triggerKey==='scheduled'?'schedule':triggerKey==='manual'?'autolaunched':triggerKey?'record':requestedType)
      const storedType=normalizeFlowType(inferredType)
      const objectKey=String(saved.object_key||saved.objectKey||saved.object||action.objectKey||'')
      const storedStart=action.start||action.startConfig||null
      const nextStart=storedStart&&typeof storedStart==='object'
        ? {...storedStart,...(!storedStart.objectKey&&objectKey?{objectKey}:{})}
        : recordStartFromTrigger(triggerKey,objectKey,action)
      nextStart.conditions=Array.isArray(nextStart.conditions)&&nextStart.conditions.length?nextStart.conditions:(Array.isArray(saved.conditions)?saved.conditions:[])
      if(storedType==='schedule'&&action.schedule&&!nextStart.schedule){
        const definition=action.schedule?.definition||{}
        nextStart.schedule={frequency:String(action.schedule?.scheduleType||'daily').toLowerCase(),startDate:definition.startDate||definition.date||'',startTime:definition.time||''}
      }
      if(storedType==='platform_event'&&!nextStart.eventKey)nextStart.eventKey=triggerKey
      const savedActions=Array.isArray(action.actions)?action.actions:[]
      const layout=action.builderLayout||{}
      setFlowType(storedType)
      setWorkflowId(selectedId)
      setFlowProps({label:saved.name||'New Flow',apiName:action.apiName||'New_Flow',description:action.description||'',apiVersion:String(action.apiVersion||'68.0'),runContext:action.runContext||'default'})
      setStartConfig(nextStart)
      setNodes(savedActions.filter(x=>normalizeNodeType(x.type||x.key)!=='END').map(runtimeActionToBuilderNode))
      setEdges(Array.isArray(layout.edges)?layout.edges:[])
      setResources(Array.isArray(action.resources)?action.resources:[])
      setFlowTests(Array.isArray(action.tests)?action.tests:[])
      setGroups(Array.isArray(action.builderGroups)?action.builderGroups:[])
      setLayoutMode(String(layout.mode||'AUTO').toUpperCase()==='FREE_FORM'?'free':'auto')
      setActive(saved.runtime_active===true||saved.runtimeActive===true||saved.active===true)
      setStartOpen(false)
    }).catch(e=>{if(live)setError(e?.message||'Unable to load workflow metadata')})
    return()=>{live=false}
  },[initialWorkflowId,initialFlowType,initialObjectKey])
  const actionElements=useMemo(()=>actions.map(a=>({key:`ACTION:${a.key}`,type:'ACTION',label:a.displayName||a.label||a.key,category:'Actions',description:a.description||'OneEngine registered action',actionKey:a.key})),[actions])
  const elements=useMemo(()=>[...CORE.map(([key,label,category,description])=>({key,type:key,label,category,description})),...actionElements],[actionElements])
  const availableElements=elements.filter(e=>elementAllowed(e.type,flowType,startConfig))
  const filtered=availableElements.filter(e=>!search||[e.label,e.category,e.description].join(' ').toLowerCase().includes(search.toLowerCase()))
  const paletteGroups=[...new Set(filtered.map(e=>e.category))]
  const commitNodes=next=>{setHistory(h=>[...h,nodes]);setFuture([]);setNodes(next);setDirty(true)}
  const buildPayload=(lifecycle='DRAFT')=>({name:flowProps.label||'New Flow',objectId:objects.find(o=>keyOf(o)===startConfig.objectKey)?.id||null,objectKey:startConfig.objectKey||null,triggerKey:flowType==='schedule'?'scheduled':flowType==='platform_event'?(startConfig.eventKey||''):flowType==='record'?(startConfig.trigger==='created'?(startConfig.optimize==='fast'?'before_create':'after_create'):startConfig.trigger==='updated'?(startConfig.optimize==='fast'?'before_update':'after_update'):startConfig.trigger==='deleted'?'after_delete':startConfig.optimize==='fast'?'before_save':'after_save'):'manual',active:lifecycle==='ACTIVE',lifecycleStatus:lifecycle,conditions:(startConfig.conditions||[]).filter(c=>c.resource||c.field).map(conditionToRuntime),action:{match:startConfig.conditionLogic==='any'?'any':'all',entryTransition:startConfig.updateMode==='transition'?'UPDATED_TO_MEET':'EVERY_TIME',type:'workflow',builder2:true,apiName:flowProps.apiName,description:flowProps.description,apiVersion:flowProps.apiVersion,flowType,runContext:flowProps.runContext,start:startConfig,optimize:startConfig.optimize||'actions',builderLayout:{mode:layoutMode==='free'?'FREE_FORM':'AUTO',positions:Object.fromEntries(nodes.map((n,i)=>[n.id,n.position||{x:320,y:120+i*120}])),edges},builderGroups:groups,resources,tests:flowTests,actions:nodes.map(n=>builderNodeToRuntimeAction(n,resources))}})
  const persistWorkflow=async(lifecycle='DRAFT',forceNewVersion=false,forceNewFlow=false)=>{setBusy(true);setRuntimeMessage('');try{const payload={...buildPayload(lifecycle),...(forceNewVersion?{forceNewVersion:true}:{}),...(forceNewFlow?{name:`${flowProps.label||'New Flow'} Copy`,action:{...buildPayload(lifecycle).action,apiName:`${flowProps.apiName||'New_Flow'}_Copy_${Date.now()}`}}:{})};const response=workflowId&&!forceNewFlow?await apiRequest(`/api/platform/rules/${workflowId}`,{method:'PUT',body:JSON.stringify(payload)}):await apiRequest('/api/platform/rules',{method:'POST',body:JSON.stringify(payload)});const saved=response?.data||{};if(saved.id)setWorkflowId(saved.id);onSaved?.(saved,{keepOpen:true});setActive(lifecycle==='ACTIVE');setDirty(false);setEditHistory(h=>[{id:uid(),label:lifecycle==='ACTIVE'?'Activated':'Saved',at:new Date().toISOString(),nodes:nodes.length,snapshot:JSON.parse(JSON.stringify(nodes)),summary:{added:nodes.length,edited:0,deleted:0}},...h].slice(0,100));setRuntimeMessage(lifecycle==='ACTIVE'?'Flow activated.':'Flow saved.');setSaveMenu(false);return saved}catch(e){setError(e?.message||'Unable to save flow');return null}finally{setBusy(false)}}
  const saveDraft=label=>{const action=String(label||'').toLowerCase();return persistWorkflow('DRAFT',action.includes('version'),action.includes('new flow'))}
  const loadVersionHistory=async()=>{
    if(!workflowId){setEditHistory([]);return}
    try{
      const response=await apiRequest('/api/platform/rules/'+workflowId+'/versions')
      const rows=Array.isArray(response?.data)?response.data:[]
      setEditHistory(rows.map(row=>{
        const actions=Array.isArray(row?.definition?.action?.actions)?row.definition.action.actions:[]
        return {id:'version:'+row.version,version:row.version,label:'Version '+row.version,at:row.created_at,nodes:actions.length,summary:{added:0,edited:0,deleted:0},snapshot:actions.filter(action=>normalizeNodeType(action.type||action.key)!=='END').map(runtimeActionToBuilderNode),serverVersion:true}
      }))
    }catch(error){setError(error?.message||'Unable to load workflow version history')}
  }
  const restoreVersion=async version=>{
    if(!workflowId||busy)return
    setBusy(true);setError('')
    try{
      const response=await apiRequest('/api/platform/rules/'+workflowId+'/versions/'+version+'/restore',{method:'POST'})
      setRuntimeMessage('Version '+version+' restored as a new draft version.')
      onSaved?.(response?.data||null,{keepOpen:false})
      onClose?.()
    }catch(error){setError(error?.message||'Unable to restore workflow version')}
    finally{setBusy(false)}
  }
  const loadSavedTests=async()=>{
    if(!workflowId){setFlowTests([]);return}
    try{
      const response=await apiRequest('/api/platform/rules/'+workflowId+'/tests')
      setFlowTests((Array.isArray(response?.data)?response.data:[]).map(row=>({...row,label:row.name||'Flow Test',description:row.config?.description||row.last_status||'Flow test',serverTest:true})))
    }catch(error){setError(error?.message||'Unable to load saved flow tests')}
  }
  const runSavedTest=async test=>{
    if(!workflowId||!test?.id||busy)return
    setBusy(true);setError('')
    try{
      const response=await apiRequest('/api/platform/rules/'+workflowId+'/tests/'+test.id+'/run',{method:'POST',body:JSON.stringify({definition:buildPayload('DRAFT')})})
      setRuntimeMessage('Test "'+(test.label||test.name||'Flow Test')+'": '+(response?.data?.testPassed===false?'FAILED':'PASSED'))
      await loadSavedTests()
    }catch(error){setError(error?.message||'Test failed')}
    finally{setBusy(false)}
  }
  const deleteSavedTest=async test=>{
    if(!workflowId||!test?.id||busy)return
    setBusy(true);setError('')
    try{await apiRequest('/api/platform/rules/'+workflowId+'/tests/'+test.id,{method:'DELETE'});await loadSavedTests()}
    catch(error){setError(error?.message||'Unable to delete flow test')}
    finally{setBusy(false)}
  }
  const createSavedTest=async()=>{
    if(!workflowId||busy)return
    const label=window.prompt('Test label')
    if(!label?.trim())return
    const description=window.prompt('Test description (optional)')||''
    setBusy(true);setError('')
    try{
      await apiRequest('/api/platform/rules/'+workflowId+'/tests',{method:'POST',body:JSON.stringify({name:label.trim(),config:{description,recordMode:'latest',assertions:[{type:'RUN_STATUS',expected:'COMPLETED'}]}})})
      await loadSavedTests()
    }catch(error){setError(error?.message||'Unable to create flow test')}
    finally{setBusy(false)}
  }

  const copySelected=()=>{const ids=selectedMany.length?selectedMany:selected?[selected]:[];setClipboard(nodes.filter(n=>ids.includes(n.id)))}
  const pasteClipboard=()=>{if(!clipboard.length)return;const copies=clipboard.map(n=>({...n,id:uid(),label:`${n.label} Copy`,apiName:`${n.apiName}_Copy_${uid().slice(0,4)}`}));commitNodes([...nodes,...copies]);setSelectedMany(copies.map(x=>x.id))}
  const groupSelected=()=>{if(selectedMany.length<2)return;setGroupDialog(true)}
  const createGroup=(name,description)=>{const groupId=uid();setGroups(g=>[...g,{id:groupId,name,description,collapsed:false}]);commitNodes(nodes.map(n=>selectedMany.includes(n.id)?{...n,groupId}:n));setSelectedMany([]);setGroupDialog(false)}
  const toggleGroup=id=>setGroups(gs=>gs.map(g=>g.id===id?{...g,collapsed:!g.collapsed}:g))
  const [placement,setPlacement]=useState(null)
  const addToPath=path=>{setPlacement(path);setSelector(true)}
  const add=e=>{const n={id:uid(),type:e.type,label:e.label,apiName:`${e.type}_${nodes.length+1}`,config:e.actionKey?{actionKey:e.actionKey}:e.type==='DECISION'?{outcomes:[{id:uid(),label:'Outcome 1',apiName:'Outcome_1',conditionLogic:'all',conditions:[],branch:[]}],defaultBranch:[]}:{}};const next=placement?nodes.map(x=>x.id===placement.nodeId?{...x,config:placement.outcomeId==='default'?{...x.config,defaultBranch:[...(x.config.defaultBranch||[]),n.id]}:{...x.config,outcomes:x.config.outcomes.map(o=>o.id===placement.outcomeId?{...o,branch:[...(o.branch||[]),n.id]}:o)}}:x):nodes;commitNodes([...next,n]);setPlacement(null);setSelected(n.id);setSelector(false);setSearch('');if(e.type==='SCREEN')setScreenEditing(n.id)}
  const current=nodes.find(n=>n.id===selected)
  const patch=n=>{commitNodes(nodes.map(v=>v.id===n.id?n:v))}
  const undo=()=>{if(!history.length)return;const prev=history[history.length-1];setFuture(f=>[nodes,...f]);setHistory(h=>h.slice(0,-1));setNodes(prev);setDirty(true)}
  const redo=()=>{if(!future.length)return;const next=future[0];setHistory(h=>[...h,nodes]);setFuture(f=>f.slice(1));setNodes(next);setDirty(true)}
  const removeNode=id=>{commitNodes(nodes.filter(n=>n.id!==id));if(selected===id)setSelected('');setNodeMenu('')}
  const duplicateNode=id=>{const source=nodes.find(n=>n.id===id);if(!source)return;const copy={...source,id:uid(),label:`${source.label} Copy`,apiName:`${source.apiName}_Copy`};commitNodes([...nodes,copy]);setSelected(copy.id);setNodeMenu('')}
  useEffect(()=>{const onKey=e=>{const mod=e.ctrlKey||e.metaKey;if(mod&&e.altKey&&(e.key==='+'||e.key==='=')){e.preventDefault();setZoom(z=>Math.min(150,z+10))}else if(mod&&e.altKey&&e.key==='-'){e.preventDefault();setZoom(z=>Math.max(50,z-10))}else if(mod&&e.altKey&&e.key==='0'){e.preventDefault();setZoom(100)}else if(mod&&e.key.toLowerCase()==='x'){e.preventDefault();copySelected();const ids=selectedMany.length?selectedMany:selected?[selected]:[];if(ids.length)commitNodes(nodes.filter(n=>!ids.includes(n.id)))}else if(mod&&e.key.toLowerCase()==='c'){e.preventDefault();copySelected()}else if(mod&&e.key.toLowerCase()==='v'){e.preventDefault();pasteClipboard()}else if(['ArrowUp','ArrowLeft','ArrowDown','ArrowRight'].includes(e.key)&&document.activeElement?.closest?.('.b2-node')){e.preventDefault();const i=nodes.findIndex(n=>n.id===selected);const d=['ArrowUp','ArrowLeft'].includes(e.key)?-1:1;const next=nodes[Math.max(0,Math.min(nodes.length-1,i+d))];if(next){setSelected(next.id);setTimeout(()=>document.querySelector(`[data-node-id="${next.id}"]`)?.focus(),0)}}else if((e.key==='Delete'||e.key==='Backspace')&&selected&&!['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)){removeNode(selected)}};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[nodes,selected,selectedMany,clipboard,history,future])
  useEffect(()=>{
    if(layoutMode!=='auto'||!nodes.length)return
    const canvas=canvasRef.current
    if(!canvas)return
    const centerKey=`${workflowId||'draft'}:${nodes.length}`
    if(centeredWorkflowRef.current===centerKey)return
    const frame=requestAnimationFrame(()=>{
      const start=canvas.querySelector('.b2-start')
      if(!start)return
      const canvasRect=canvas.getBoundingClientRect()
      const startRect=start.getBoundingClientRect()
      const startCenter=canvas.scrollLeft+(startRect.left-canvasRect.left)+(startRect.width/2)
      canvas.scrollLeft=Math.max(0,startCenter-(canvas.clientWidth/2))
      canvas.scrollTop=0
      centeredWorkflowRef.current=centerKey
    })
    return()=>cancelAnimationFrame(frame)
  },[workflowId,nodes.length,layoutMode])
  const issues=useMemo(()=>validateDefinition({flowType,startConfig,nodes,edges,resources}),[flowType,startConfig,nodes,edges,resources])
  if(screenEditing){const n=nodes.find(x=>x.id===screenEditing);if(n)return <ScreenEditor node={n} onPatch={patch} onClose={()=>setScreenEditing('')}/>}
  return <div className="b2-shell">
    <header className="b2-top"><div className="b2-title">{onClose?<button className="b2-back" title="Back to flows" aria-label="Back to flows" onClick={onClose}><ChevronLeft size={16}/></button>:null}<Workflow size={20}/><span><b>Workflow Builder</b><small>Flow Builder workspace</small></span></div><div className="b2-buttonbar"><button title="Select Elements" className={multiSelect?'is-on':''} onClick={()=>{setMultiSelect(v=>!v);setSelectedMany([])}}><Copy size={15}/></button>{multiSelect?<><button title="Copy Elements" disabled={!selectedMany.length} onClick={copySelected}><Copy size={15}/></button><button title="Group Elements" disabled={selectedMany.length<2} onClick={groupSelected}><Group size={15}/></button></>:null}{clipboard.length?<button title={`Paste ${clipboard.length} Elements`} onClick={pasteClipboard}><Plus size={15}/></button>:null}<button title="Edit History" onClick={()=>{setSupportPanel('history');void loadVersionHistory()}}><Clock3 size={15}/></button><button title="Undo" disabled={!history.length} onClick={undo}><Undo2 size={15}/></button><button title="Redo" disabled={!future.length} onClick={redo}><Redo2 size={15}/></button><button title="Toggle Toolbox" onClick={()=>setToolboxOpen(v=>!v)}><ChevronLeft size={15}/></button><button title="Flow Properties" onClick={()=>setFlowPropsOpen(true)}><Settings2 size={15}/></button><select className="b2-layout-select" value={layoutMode} onChange={e=>setLayoutMode(e.target.value)}><option value="auto">Auto-Layout</option><option value="free">Free-Form</option></select></div><div className="b2-top-actions"><button onClick={()=>setSupportPanel(supportPanel==='issues'?'':'issues')} className={issues.length?'has-issues':''}><AlertTriangle size={13}/> Errors & Warnings {issues.length?`(${issues.length})`:''}</button><button onClick={()=>setSupportPanel('run')}>Run</button>{['autolaunched','record'].includes(flowType)?<button onClick={()=>setSupportPanel('testmode')}>Test Mode</button>:<button onClick={()=>setSupportPanel('debug')}>Debug</button>}<button onClick={()=>{setSupportPanel('tests');void loadSavedTests()}}>View Tests</button><div className="b2-save-wrap"><button className="is-primary" disabled={busy} onClick={()=>saveDraft('Saved')}><Save size={13}/> Save{dirty?' *':''}</button><button className="is-primary b2-save-chevron" onClick={()=>setSaveMenu(v=>!v)}><ChevronDown size={13}/></button>{saveMenu?<div className="b2-save-menu"><button onClick={()=>saveDraft('Saved')}>Save</button><button onClick={()=>saveDraft('Saved as new version')}>Save As New Version</button><button onClick={()=>saveDraft('Saved as new flow')}>Save As New Flow</button></div>:null}</div><button disabled={busy} onClick={()=>persistWorkflow(active?'DRAFT':'ACTIVE')}>{active?'Deactivate':'Activate'}</button></div></header>
    {error?<div className="b2-error">{error}</div>:null}{runtimeMessage?<div className="b2-runtime-message">{runtimeMessage}</div>:null}
    <div className={`b2-workspace ${toolboxOpen?'':'toolbox-closed'}`}>
      {toolboxOpen?<aside className="b2-toolbox"><div className="b2-tabs"><button className={tab==='elements'?'is-active':''} onClick={()=>setTab('elements')}>Elements</button><button className={tab==='manager'?'is-active':''} onClick={()=>setTab('manager')}>Manager</button></div>
        {supportPanel==='issues'?<div className="b2-issues"><h3>Errors & Warnings</h3>{!issues.length?<div className="b2-empty-small">No issues found.</div>:issues.map((i,x)=><button key={x} onClick={()=>{setSelected(i.node);setSupportPanel('')}}><AlertTriangle size={14}/><span><b>{i.level==='error'?'Error':'Warning'}</b><small>{i.text}</small></span></button>)}</div>:tab==='elements'?<><label className="b2-search"><Search size={14}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search elements…"/></label>{paletteGroups.map(g=><section className="b2-palette-group" key={g}><h4>{g}</h4>{filtered.filter(e=>e.category===g).map(e=><button key={e.key} onClick={()=>add(e)}><span className="b2-palette-icon">{g==='Logic'?<GitBranch size={15}/>:g==='Actions'?<Zap size={15}/>:<Database size={15}/>}</span><span><b>{e.label}</b><small>{e.description}</small></span></button>)}</section>)}</>:<div className="b2-manager"><button onClick={()=>setResourceDialog(true)}><Plus size={14}/> New Resource</button><label className="b2-manager-filter">Show<select value={managerFilter} onChange={e=>setManagerFilter(e.target.value)}><option value="all">All Resources</option><option value="unused">Unused Resources</option></select></label>{resources.filter(r=>managerFilter==='all'||!nodes.some(n=>JSON.stringify(n.config||{}).includes(r.value))).map(r=><button className="b2-manager-row" key={r.value} onClick={()=>setSelected('')}><Database size={13}/><span><b>{r.label}</b><small>{r.type} · {r.dataType||''}</small></span><ChevronRight size={12}/></button>)}</div>}
      </aside>:null}
      <main ref={canvasRef} className="b2-canvas">{layoutMode==='free'?<Builder2GraphCanvas nodes={nodes} edges={edges} onSelect={setSelected} onOpen={id=>setSelected(id)} onNodesChangeExternal={positions=>{setNodes(ns=>ns.map(n=>positions[n.id]?{...n,position:positions[n.id]}:n));setDirty(true)}} onEdgesChangeExternal={next=>{setEdges(next);setDirty(true)}}/>:<><div className="b2-zoom"><button onClick={()=>setZoom(z=>Math.max(50,z-10))}><ZoomOut size={14}/></button><span>{zoom}%</span><button onClick={()=>setZoom(z=>Math.min(150,z+10))}><ZoomIn size={14}/></button></div><Builder2AutoLayout nodes={nodes} selected={selected} selectedMany={selectedMany} groups={groups} collapsed={branchCollapsed} onToggle={id=>setBranchCollapsed(x=>({...x,[id]:!x[id]}))} onCopy={duplicateNode} onDelete={removeNode} zoom={zoom} startConfig={startConfig} onStart={()=>setStartOpen(true)} onAdd={addToPath} onSelect={n=>{if(multiSelect){setSelectedMany(v=>v.includes(n.id)?v.filter(x=>x!==n.id):[...v,n.id]);return}setSelected(n.id);if(n.type==='ACTION')setActionEditing(n.id);if(n.type==='SCREEN')setScreenEditing(n.id)}}/></>} </main>
      <aside className="b2-properties"><header><div><b>{current?.label||'Properties'}</b><small>{current?current.type.replaceAll('_',' '):'Select an element'}</small></div>{current?<button onClick={()=>setSelected('')}><X size={16}/></button>:null}</header><Properties node={current} onPatch={patch} nodes={nodes} onAddBranch={addToPath} {...{objects,resources,actions,flowType,startConfig}} onNew={()=>setResourceDialog(true)}/></aside>
    </div>
    {selector?<div className="b2-selector"><header><div><h3>Add Element</h3><p>Select what the flow should do next.</p></div><button onClick={()=>setSelector(false)}><X size={18}/></button></header><label className="b2-selector-search"><Search size={15}/><input autoFocus value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search elements…"/></label><div className="b2-selector-body">{paletteGroups.map(g=><section key={g}><h4>{g}</h4><div>{filtered.filter(e=>e.category===g).map(e=><button key={e.key} onClick={()=>add(e)}><span>{g==='Logic'?<GitBranch/>:g==='Actions'?<Zap/>:<Database/>}</span><span><b>{e.label}</b><small>{e.description}</small></span></button>)}</div></section>)}</div></div>:null}
    {startOpen?<StartProperties value={startConfig} onChange={v=>{setStartConfig(v);setDirty(true)}} objects={objects} flowType={flowType} onClose={()=>setStartOpen(false)}/>:null}
    {flowPropsOpen?<div className="b2-modal-backdrop"><div className="b2-modal"><header><div><h3>Flow Properties</h3><p>Version properties and execution context.</p></div><button onClick={()=>setFlowPropsOpen(false)}><X size={18}/></button></header><div className="b2-form"><label>Flow Type<input value={FLOW_TYPES[flowType]?.label||flowType} disabled readOnly/></label><label>Label<input value={flowProps.label} onChange={e=>setFlowProps(p=>({...p,label:e.target.value}))}/></label><label>API Name<input value={flowProps.apiName} onChange={e=>setFlowProps(p=>({...p,apiName:e.target.value}))}/></label><label>Description<textarea rows={4} value={flowProps.description} onChange={e=>setFlowProps(p=>({...p,description:e.target.value}))}/></label><label>API Version<input value={flowProps.apiVersion} onChange={e=>setFlowProps(p=>({...p,apiVersion:e.target.value}))}/></label><label>Run Context<select value={flowProps.runContext} onChange={e=>setFlowProps(p=>({...p,runContext:e.target.value}))}><option value="default">Default</option><option value="user">User Context — Enforces User Permissions</option><option value="system">System Context</option></select></label></div><footer><button onClick={()=>setFlowPropsOpen(false)}>Cancel</button><button className="is-primary" onClick={()=>{setFlowPropsOpen(false);setDirty(true)}}>Done</button></footer></div></div>:null}
    {groupDialog?<GroupDialog onClose={()=>setGroupDialog(false)} onCreate={createGroup}/>:null}
    {actionEditing?<div className="b2-action-dialog b2-modal-backdrop"><div className="b2-modal"><header><div><h3>Action</h3><p>Configure the selected OneEngine metadata action.</p></div><button onClick={()=>setActionEditing('')}><X size={18}/></button></header><Properties node={nodes.find(n=>n.id===actionEditing)} onPatch={patch} {...{objects,resources,actions,flowType,startConfig}} onNew={()=>setResourceDialog(true)}/><footer><button onClick={()=>setActionEditing('')}>Cancel</button><button className="is-primary" onClick={()=>setActionEditing('')}>Done</button></footer></div></div>:null}
    {supportPanel==='history'?<div className="b2-drawer"><header><b>Edit History</b><button onClick={()=>setSupportPanel('')}><X size={16}/></button></header><div className="b2-history">{!editHistory.length?<p>No saved changes yet.</p>:editHistory.map(h=><div key={h.id} className={historyPreview===h.id?'is-selected':''}><Clock3 size={13}/><span><button className="b2-history-title" onClick={()=>setHistoryPreview(h.id)}><b>{h.label}</b><small>{new Date(h.at).toLocaleString()} · {h.nodes} elements</small></button>{historyPreview===h.id?<span className="b2-history-actions"><small>Added {h.summary?.added||0} · Edited {h.summary?.edited||0} · Deleted {h.summary?.deleted||0}</small><button onClick={()=>{if(h.serverVersion){void restoreVersion(h.version);return}setNodes(JSON.parse(JSON.stringify(h.snapshot||[])));setDirty(true);setSupportPanel('');setHistoryPreview('')}}>Restore</button><button onClick={()=>{if(h.serverVersion){void restoreVersion(h.version);return}setNodes(JSON.parse(JSON.stringify(h.snapshot||[])));saveDraft('Restored as new version');setSupportPanel('')}}>Save as New Version</button><button onClick={()=>{setNodes(JSON.parse(JSON.stringify(h.snapshot||[])));saveDraft('Restored as new flow');setSupportPanel('')}}>Save as New Flow</button></span>:null}</span></div>)}</div></div>:null}
    {supportPanel==='debug'?<div className="b2-drawer"><header><b>Debug</b><button onClick={()=>setSupportPanel('')}><X size={16}/></button></header><div><p>Debug the most recent saved version with input values, rollback options, and execution details.</p><label className="b2-check"><input type="checkbox" checked={debugRollback} onChange={e=>setDebugRollback(e.target.checked)}/> Roll back changes after debugging</label><button className="is-primary" disabled={!workflowId||busy} onClick={async()=>{setBusy(true);try{const r=await apiRequest(`/api/platform/rules/${workflowId}/debug`,{method:'POST',body:JSON.stringify({definition:buildPayload('DRAFT'),mode:'debug',inputs:{},debugOptions:{rollbackMode:debugRollback}})});setDebugResult(r?.data||r);setRuntimeMessage(r?.data?.status?`Debug: ${r.data.status}`:'Debug completed.')}catch(e){setError(e?.message||'Debug failed')}finally{setBusy(false)}}}>Run Debug</button></div></div>:null}
    {supportPanel==='testmode'?<FlowTestPanel {...{workflowId,busy,setBusy,buildPayload,setError,setRuntimeMessage}} onClose={()=>setSupportPanel('')}/>:null}
    {supportPanel==='run'?<div className="b2-drawer"><header><b>Run Flow</b><button onClick={()=>setSupportPanel('')}><X size={16}/></button></header><div><p>Run the current flow version with the configured inputs.</p><button className="is-primary" disabled={!workflowId||busy} onClick={async()=>{setBusy(true);try{const r=await apiRequest(`/api/platform/rules/${workflowId}/debug`,{method:'POST',body:JSON.stringify({mode:'debug'})});setRuntimeMessage(r?.data?.status?`Run: ${r.data.status}`:'Run completed.')}catch(e){setError(e?.message||'Run failed')}finally{setBusy(false)}}}>Run</button></div></div>:null}
    {supportPanel==='tests'?<div className="b2-drawer"><header><b>Tests</b><button onClick={()=>setSupportPanel('')}><X size={16}/></button></header><div>{!flowTests.length?<p>No tests have been created for this draft.</p>:flowTests.map(t=><div key={t.id}><b>{t.label}</b><small>{t.description||'Flow test'}</small><button disabled={!workflowId||busy} onClick={()=>{if(t.serverTest){void runSavedTest(t);return}}}>Run</button><button onClick={()=>{if(t.serverTest){void deleteSavedTest(t);return}setFlowTests(v=>v.filter(x=>x.id!==t.id));setDirty(true)}}>Delete</button></div>)}<button className="is-primary" onClick={()=>void createSavedTest()}>Create Test</button></div></div>:null}
    {resourceDialog?<ResourceDialog onClose={()=>setResourceDialog(false)} onCreate={r=>{setResources(x=>[...x,r]);setResourceDialog(false)}}/>:null}
  </div>
}
