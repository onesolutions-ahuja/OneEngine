import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, Clock3, Copy, Database, Eye, GitBranch, Group, LayoutGrid, ListFilter, Monitor, MoreVertical, Plus, Redo2, Save, Search, Settings2, Trash2, Type, Undo2, Workflow, X, Zap, ZoomIn, ZoomOut } from 'lucide-react'
import { apiRequest } from '../../services/api'
import './Builder2Page.css'
import { FLOW_TYPES, RESOURCE_TYPES, automaticResources, elementAllowed, graphTopologyIssues, validateDefinition } from './builder2Model'
import Builder2GraphCanvas from './Builder2GraphCanvas'
import Builder2AutoLayout from './Builder2AutoLayout'
import { nativeRuntimeAction, runtimeCondition } from './builder2Runtime'
import { runtimeMessageTone } from './builder2Status.js'
import { workflowInputContract, parseWorkflowInputs } from '../../../shared/workflowInputs.js'

const CORE = [
  ['GET_RECORDS','Get Records','Data','Find OneEngine records and store field values.'],
  ['CREATE_RECORDS','Create Records','Data','Create one or more OneEngine records.'],
  ['UPDATE_RECORDS','Update Records','Data','Update OneEngine records.'],
  ['DELETE_RECORDS','Delete Records','Data','Delete OneEngine records.'],
  ['ASSIGNMENT','Assignment','Logic','Set variables and record values.'],
  ['FORMULA','Formula','Logic','Calculate a value from resources and store the result.'],
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
const apiNameFromLabel=(label,fallback='Element')=>{
  const normalized=String(label||'').trim().replace(/[^A-Za-z0-9]+/g,'_').replace(/_+/g,'_').replace(/^_+|_+$/g,'')
  const base=normalized||fallback
  return /^[A-Za-z]/.test(base)?base:`${fallback}_${base}`
}
const syncedApiName=(currentApiName,currentLabel,nextLabel,legacyId='',fallback='Element')=>{
  const current=String(currentApiName||'')
  return !current||current===String(legacyId||'')||current===apiNameFromLabel(currentLabel,fallback)
    ? apiNameFromLabel(nextLabel,fallback)
    : current
}

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
  if(['UPDATE_RECORD','UPDATE_RELATED_RECORD'].includes(type))return 'UPDATE_RECORDS'
  if(type==='DELETE_RECORD')return 'DELETE_RECORDS'
  if(['ASSIGN_RECORD','SET_VARIABLE'].includes(type))return 'ASSIGNMENT'
  if(type==='CONDITION')return 'DECISION'
  return type
}
const BUILDER_NATIVE_RUNTIME_TYPES=new Set(['GET_RECORDS','CREATE_RECORD','CREATE_RELATED_RECORD','UPDATE_RECORD','UPDATE_RELATED_RECORD','DELETE_RECORD','ASSIGN_RECORD','SET_VARIABLE','ASSIGNMENT','CONDITION','LOOP','WAIT','SUBFLOW','COLLECTION_FILTER','COLLECTION_SORT','TRANSFORM','CUSTOM_ERROR','SCREEN','END'])
const OPERATOR_TO_BUILDER={equals:'Equals',not_equals:'Does Not Equal',is_empty:'Is Null',is_blank:'Is Blank',changed:'Is Changed',greater_than:'Greater Than',greater_than_or_equal:'Greater Than or Equal',less_than:'Less Than',less_than_or_equal:'Less Than or Equal',starts_with:'Starts With',ends_with:'Ends With',contains:'Contains',in:'In',not_in:'Not In',was_set:'Was Set',was_visited:'Was Visited',has_error:'Has Error'}
const OPERATOR_TO_RUNTIME=Object.fromEntries(Object.entries(OPERATOR_TO_BUILDER).map(([key,value])=>[value,key]))
const conditionToBuilder=row=>({id:row?.id||uid(),resource:row?.field||row?.resource||'',operator:OPERATOR_TO_BUILDER[row?.operator]||row?.operator||'Equals',value:row?.value??''})
const conditionToRuntime=row=>({field:row?.resource||row?.field||'',operator:OPERATOR_TO_RUNTIME[row?.operator]||String(row?.operator||'equals').toLowerCase().replaceAll(' ','_'),value:row?.value??''})
const actionInputs=x=>Object.fromEntries(Object.entries(x||{}).filter(([key])=>!['id','label','apiName','api_name','description','key','type'].includes(key)))
const LEGACY_COMMUNICATION_ACTIONS=new Set(['SEND_EMAIL','SEND_SMS','SEND_WHATSAPP','IN_APP_NOTIFICATION','SEND_APPOINTMENT_MESSAGE'])
const communicationBinding=value=>value&&typeof value==='object'&&!Array.isArray(value)&&typeof value.path==='string'?{mode:'resource',value:value.path}:{mode:'literal',value:value??''}
const communicationContextRows=context=>Object.entries(context&&typeof context==='object'&&!Array.isArray(context)?context:{}).map(([name,value])=>{const binding=communicationBinding(value);return{id:uid(),name,...binding}})
const communicationRuntimeValue=(mode,value)=>mode==='resource'&&String(value||'').trim()?{path:String(value).trim()}:value
const communicationRuntimeContext=rows=>Object.fromEntries((rows||[]).filter(row=>String(row.name||'').trim()).map(row=>[String(row.name).trim(),communicationRuntimeValue(row.mode,row.value)]))
const editableBinding=value=>value&&typeof value==='object'&&!Array.isArray(value)&&typeof value.path==='string'
  ? {mode:'resource',value:value.path,raw:value}
  : value!==null&&typeof value==='object'
    ? {mode:'structured',value:JSON.stringify(value,null,2),raw:value}
    : {mode:'literal',value:value??'',raw:value}
const actionInputRows=inputs=>Object.entries(inputs&&typeof inputs==='object'&&!Array.isArray(inputs)?inputs:{})
  .filter(([name])=>!['faultMode','faultBranch'].includes(name))
  .map(([name,value])=>({id:uid(),name,...editableBinding(value)}))
const actionRowRuntimeValue=row=>{
  if(row.mode==='resource') return {path:String(row.value||'').trim()}
  if(row.mode==='structured'){
    try{return JSON.parse(String(row.value||'{}'))}catch{throw new Error(`${row.name||'Action input'} has an invalid structured value`)}
  }
  return row.value
}
const actionRowsToInputs=rows=>Object.fromEntries((rows||[]).filter(row=>String(row.name||'').trim()).map(row=>[String(row.name).trim(),actionRowRuntimeValue(row)]))
const formulaInputRows=inputs=>Object.entries(inputs&&typeof inputs==='object'&&!Array.isArray(inputs)?inputs:{}).map(([name,value])=>({id:uid(),name,...editableBinding(value)}))
const formulaRowsToInputs=rows=>actionRowsToInputs(rows)
const builderValue=value=>{
  if(value&&typeof value==='object'&&!Array.isArray(value)&&typeof value.path==='string'&&Object.keys(value).every(key=>key==='path')) return value.path
  if(value===null||value===undefined) return ''
  if(typeof value==='object') return JSON.stringify(value)
  return value
}
const fieldMapRows=map=>Object.entries(map&&typeof map==='object'&&!Array.isArray(map)?map:{}).map(([field,value])=>({id:uid(),field,value:builderValue(value)}))
const assignmentOperatorToBuilder={set:'Equals',add:'Add',subtract:'Subtract',append:'Add Item',remove:'Remove Item'}


const runtimeActionToBuilderNode=x=>{
  const rawType=String(x?.type||x?.key||'').toUpperCase()
  const label=x?.label||x?.displayName||rawType||'Element'
  const base={id:x?.id||uid(),label,apiName:x?.apiName||x?.api_name||apiNameFromLabel(label,rawType||'Element'),description:x?.description||''}
  if(rawType==='CONDITION'){
    return {...base,type:'DECISION',config:{
      evaluation:'first',
      outcomes:(x?.outcomes||[]).map((outcome,index)=>{
        const outcomeLabel=outcome?.label||`Outcome ${index+1}`
        return {
        id:outcome?.id||uid(),label:outcomeLabel,apiName:outcome?.apiName||outcome?.api_name||apiNameFromLabel(outcomeLabel,`Outcome_${index+1}`),
        conditionLogic:outcome?.condition?.match||'all',
        conditions:(outcome?.condition?.conditions||[]).map(conditionToBuilder),
        branch:Array.isArray(outcome?.branch)?outcome.branch:[],
        }
      }),
      defaultOutcomeLabel:x?.defaultLabel||'Default Outcome',
      defaultBranch:Array.isArray(x?.defaultBranch)?x.defaultBranch:[],
    }}
  }
  const normalized=normalizeNodeType(rawType)
  if(rawType==='GET_RECORDS'){
    const inputs=actionInputs(x)
    const limit=Number(inputs.limit||1)
    return {...base,type:'GET_RECORDS',config:{
      objectKey:inputs.objectKey||inputs.object_key||'',
      conditionLogic:(inputs.match||'all')==='any'?'any':((inputs.filters||[]).length?'all':'none'),
      conditions:(inputs.filters||[]).map(conditionToBuilder),
      sortOrder:inputs.sortDirection||'none',
      sortBy:inputs.sortField||'',
      limit:limit<=1?'first':limit>=200?'all':'limited',
      maxRecords:limit>1&&limit<200?limit:'',
      store:'auto',
    }}
  }
  if(['CREATE_RECORD','CREATE_RELATED_RECORD'].includes(rawType)){
    const inputs=actionInputs(x)
    return {...base,type:'CREATE_RECORDS',config:{
      objectKey:inputs.objectKey||inputs.object_key||'',
      createCount:'one',
      valueMode:'manual',
      fieldValues:fieldMapRows(inputs.fieldValues),
    }}
  }
  if(['UPDATE_RECORD','UPDATE_RELATED_RECORD'].includes(rawType)){
    const inputs=actionInputs(x)
    return {...base,type:'UPDATE_RECORDS',config:{
      objectKey:inputs.objectKey||inputs.object_key||'',
      recordId:builderValue(inputs.recordId||inputs.record_id||''),
      updateMode:'conditions',
      conditionLogic:'none',
      conditions:[],
      fieldValues:fieldMapRows(inputs.fieldValues),
    }}
  }
  if(['ASSIGNMENT','SET_VARIABLE','ASSIGN_RECORD'].includes(rawType)){
    const inputs=actionInputs(x)
    return {...base,type:'ASSIGNMENT',config:{
      resource:inputs.variableName?('variables.'+inputs.variableName):(inputs.resource||''),
      operator:assignmentOperatorToBuilder[String(inputs.operator||'set').toLowerCase()]||'Equals',
      value:builderValue(inputs.value),
    }}
  }
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
  if(rawType==='FORMULA'){
    const inputs=actionInputs(x)
    return {...base,type:'FORMULA',config:{
      resourceName:inputs.resourceName||inputs.output||'',
      resultType:inputs.resultType||inputs.dataType||'text',
      expression:inputs.expression||inputs.formula||'',
      inputRows:formulaInputRows(inputs.inputs||{}),
      faultMode:inputs.faultMode||'FAIL',
      faultBranch:Array.isArray(inputs.faultBranch)?inputs.faultBranch:[],
    }}
  }
  if(!BUILDER_NATIVE_RUNTIME_TYPES.has(rawType)){
    const inputs=actionInputs(x)
    const httpMessage=rawType==='ONE_HTTP_REQUEST'&&String(inputs.providerKey||'').toLowerCase()==='whatsapp'&&typeof inputs.body?.text?.body==='string'
      ? inputs.body.text.body
      : undefined
    return {...base,type:'ACTION',config:{
      actionKey:rawType,
      inputs,
      actionRows:actionInputRows(inputs),
      ...(httpMessage!==undefined?{message:httpMessage}:{}),
      faultMode:inputs.faultMode||'FAIL',
      faultBranch:Array.isArray(inputs.faultBranch)?inputs.faultBranch:[],
    }}
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
        apiName:outcome.apiName||apiNameFromLabel(outcome.label||`Outcome ${index+1}`,`Outcome_${index+1}`),
        condition:{match:outcome.conditionLogic||'all',conditions:(outcome.conditions||[]).map(runtimeCondition)},
        branch:Array.isArray(outcome.branch)?outcome.branch:[],
      })),
      defaultLabel:p.defaultOutcomeLabel||'Default Outcome',
      defaultBranch:Array.isArray(p.defaultBranch)?p.defaultBranch:[],
    }
  }
  if(node.type==='FORMULA'){
    return {...base,key:'FORMULA',
      resourceName:p.resourceName||undefined,
      resultType:p.resultType||'text',
      expression:p.expression||'',
      inputs:formulaRowsToInputs(p.inputRows),
      faultMode:p.faultMode||'FAIL',
      faultBranch:p.faultMode==='ROUTE'?(p.faultBranch||[]):undefined,
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
      faultMode:p.faultMode||inherited.faultMode,
      faultBranch:(p.faultMode||inherited.faultMode)==='ROUTE'?(p.faultBranch||inherited.faultBranch||[]):undefined,
    }
  }
  if(node.type==='ACTION'){
    let inputs=(p.actionRows||[]).length?actionRowsToInputs(p.actionRows):(p.inputs&&typeof p.inputs==='object'?p.inputs:{})
    if(p.actionKey==='ONE_HTTP_REQUEST'&&String(inputs.providerKey||'').toLowerCase()==='whatsapp'&&inputs.body?.text&&Object.prototype.hasOwnProperty.call(p,'message')){
      inputs={...inputs,body:{...inputs.body,text:{...inputs.body.text,body:p.message}}}
    }
    return {...base,key:p.actionKey,...inputs,
      faultMode:p.faultMode||inputs.faultMode,
      faultBranch:(p.faultMode||inputs.faultMode)==='ROUTE'?(p.faultBranch||inputs.faultBranch||[]):undefined,
    }
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

const RESOURCE_API_RE=/^[A-Za-z][A-Za-z0-9_]*$/
const resourceApiIssue=(name,resources=[],original='')=>{
  const api=String(name||'').trim()
  if(!api)return 'API Name is required.'
  if(!RESOURCE_API_RE.test(api)||api.endsWith('_')||api.includes('__'))return 'Use letters, numbers, and underscores; start with a letter; do not end with _ or use __.'
  if(resources.some(resource=>String(resource.apiName||resource.value||'')===api&&String(resource.apiName||resource.value||'')!==String(original||'')))return 'A resource with this API Name already exists.'
  return ''
}
const resourceUsage=(resource,nodes=[],startConfig={},flowTests=[],inputContract=[],outputContract=[])=>{
  const api=String(resource?.apiName||resource?.value||'').trim()
  if(!api)return []
  const needles=[api,\`variables.\${api}\`,\`{!\${api}}\`]
  const hits=[]
  const scan=(label,value)=>{const text=JSON.stringify(value??{});if(needles.some(needle=>text.includes(needle)))hits.push(label)}
  nodes.forEach(node=>scan(node.label||node.apiName||node.id,node.config||{}))
  scan('Start',startConfig);scan('Tests',flowTests);scan('Input contract',inputContract);scan('Output contract',outputContract)
  return [...new Set(hits)]
}
const replaceResourceReference=(value,from,to)=>{
  if(Array.isArray(value))return value.map(item=>replaceResourceReference(item,from,to))
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,replaceResourceReference(item,from,to)]))
  if(typeof value!=='string')return value
  if(value===from)return to
  return value.replaceAll(\`variables.\${from}\`,\`variables.\${to}\`).replaceAll(\`{!\${from}}\`,\`{!\${to}}\`)
}

const FLOW_FORMULA_FUNCTIONS=['ABS','AND','BLANKVALUE','CASE','CONTAINS','DATE','DATETIMEVALUE','DATEVALUE','IF','ISBLANK','ISNULL','LEFT','LEN','LOWER','MAX','MIN','MOD','NOT','NOW','OR','RIGHT','ROUND','TEXT','TODAY','TRIM','UPPER','VALUE']
const FLOW_FORMULA_OPERATORS=['+','-','*','/','^','=','<>','<','>','<=','>=','&&','||','!']
const formulaSyntaxIssue=value=>{
  const formula=String(value||'').trim()
  if(!formula)return 'Formula is required.'
  if(formula.length>3900)return 'Formula exceeds the 3,900 character Flow formula limit.'
  const pairs={')':'(',']':'[','}':'{'}, stack=[]
  let quote=''
  for(let i=0;i<formula.length;i++){const ch=formula[i];if(quote){if(ch===quote&&formula[i-1]!=='\\\\')quote='';continue}if(ch==='"'||ch==="'"){quote=ch;continue}if('([{'.includes(ch))stack.push(ch);else if(')]}'.includes(ch)&&stack.pop()!==pairs[ch])return 'Formula has mismatched brackets.'}
  if(quote)return 'Formula has an unterminated text value.'
  if(stack.length)return 'Formula has an unclosed bracket.'
  return ''
}
function FormulaBuilder({value,onChange,resources=[],flowType='record',startConfig={},label='Formula'}) {
  const [syntax,setSyntax]=useState('')
  const automatic=automaticResources(flowType,startConfig)
  const insert=text=>onChange(`${value||''}${text}`)
  return <div className="b2-formula-builder"><label>{label}<textarea rows={7} value={value||''} onChange={e=>{onChange(e.target.value);setSyntax('')}} placeholder="Build a Flow formula…"/></label><div className="b2-formula-tools"><label>Insert a Resource<select value="" onChange={e=>{if(e.target.value)insert(`{!${e.target.value}}`)}}><option value="">Select resource…</option>{[...automatic,...resources].map(r=><option key={r.value} value={r.value}>{r.label}</option>)}</select></label><label>Insert a Function<select value="" onChange={e=>{if(e.target.value)insert(`${e.target.value}()`)}}><option value="">All Functions…</option>{FLOW_FORMULA_FUNCTIONS.map(fn=><option key={fn} value={fn}>{fn}</option>)}</select></label><label>Insert an Operator<select value="" onChange={e=>{if(e.target.value)insert(` ${e.target.value} `)}}><option value="">Operator…</option>{FLOW_FORMULA_OPERATORS.map(op=><option key={op} value={op}>{op}</option>)}</select></label></div><button type="button" className="b2-text-action" onClick={()=>setSyntax(formulaSyntaxIssue(value)||'Syntax check passed.')}>Check Syntax</button>{syntax?<div className={syntax==='Syntax check passed.'?'b2-formula-ok':'b2-field-error'} role={syntax==='Syntax check passed.'?'status':'alert'}>{syntax}</div>:null}</div>
}

function ResourceDialog({onClose,onCreate,initialResource,resources=[]}) {
  const [type,setType]=useState(initialResource?.type||'Variable'),[name,setName]=useState(initialResource?.apiName||initialResource?.value||''),[description,setDescription]=useState(initialResource?.description||''),[dataType,setDataType]=useState(initialResource?.dataType||'Text'),[value,setValue]=useState(initialResource?.defaultValue??''),[isCollection,setIsCollection]=useState(initialResource?.isCollection===true),[availableInput,setAvailableInput]=useState(initialResource?.availableInput===true),[availableOutput,setAvailableOutput]=useState(initialResource?.availableOutput===true),[objectKey,setObjectKey]=useState(initialResource?.objectKey||''),[decimalPlaces,setDecimalPlaces]=useState(initialResource?.decimalPlaces??0),[choiceLabel,setChoiceLabel]=useState(initialResource?.choiceLabel||''),[choiceValue,setChoiceValue]=useState(initialResource?.choiceValue||''),[sortBy,setSortBy]=useState(initialResource?.sortBy||''),[sortOrder,setSortOrder]=useState(initialResource?.sortOrder||'asc')
  const apiIssue=resourceApiIssue(name,resources,initialResource?.apiName||initialResource?.value||'')
  const typeIssue=type==='Formula'?formulaSyntaxIssue(value):type==='Record Choice Set'&&(!objectKey||!choiceLabel)?'Choose an object and Choice Label for the Record Choice Set.':type==='Collection Choice Set'&&!String(value||'').trim()?'Choose a collection resource.':type==='Picklist Choice Set'&&(!objectKey||!String(value||'').trim())?'Choose an object and picklist field.':type==='Stage'&&(!Number.isInteger(Number(value))||Number(value)<1)?'Stage Order must be a positive whole number.':''
  const validationIssue=apiIssue||typeIssue
  return <div className="b2-modal-backdrop"><div className="b2-modal"><header><div><h3>{initialResource?'Edit Resource':'New Resource'}</h3><p>Configure a resource for this flow.</p></div><button onClick={onClose}><X size={18}/></button></header>
    <div className="b2-form">
      <label>Resource Type<select value={type} onChange={e=>setType(e.target.value)}>{TYPES.map(x=><option key={x}>{x}</option>)}</select></label>
      <label>API Name<input value={name} onChange={e=>setName(e.target.value)} placeholder="Resource_API_Name"/></label><label>Description<textarea rows={3} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Describe this resource…"/></label>
      {!['Text Template'].includes(type)?<label>Data Type<select value={dataType} onChange={e=>setDataType(e.target.value)}><option>Text</option><option>Number</option><option>Currency</option><option>Boolean</option><option>Date</option><option>Date/Time</option><option>Record</option></select></label>:null}
      {type==='Variable'?<><label className="b2-check"><input type="checkbox" checked={isCollection} onChange={e=>setIsCollection(e.target.checked)}/> Allow multiple values (collection)</label><label className="b2-check"><input type="checkbox" checked={availableInput} onChange={e=>setAvailableInput(e.target.checked)}/> Available for input</label><label className="b2-check"><input type="checkbox" checked={availableOutput} onChange={e=>setAvailableOutput(e.target.checked)}/> Available for output</label>{dataType==='Record'?<label>Object API Name<input value={objectKey} onChange={e=>setObjectKey(e.target.value)} placeholder="Object API name"/></label>:null}</>:null}
      {type==='Formula'?<><FormulaBuilder value={value} onChange={setValue} resources={resources}/>{['Number','Currency'].includes(dataType)?<label>Decimal Places<input type="number" min="0" max="17" value={decimalPlaces} onChange={e=>setDecimalPlaces(Math.max(0,Math.min(17,Number(e.target.value))))}/></label>:null}</>:type==='Text Template'?<label>Body<textarea value={value} onChange={e=>setValue(e.target.value)} rows={8} placeholder="Enter text and resources…"/></label>:type==='Choice'?<label>Choice Value<input value={value} onChange={e=>setValue(e.target.value)} placeholder="Stored value"/></label>:type==='Record Choice Set'?<><label>Object API Name<input value={objectKey} onChange={e=>setObjectKey(e.target.value)} placeholder="Object API name"/></label><label>Choice Label Field<input value={choiceLabel} onChange={e=>setChoiceLabel(e.target.value)} placeholder="Field API name"/></label><label>Choice Value Field<input value={choiceValue} onChange={e=>setChoiceValue(e.target.value)} placeholder="Optional; label is used when blank"/></label><label>Filter Criteria<textarea value={value} onChange={e=>setValue(e.target.value)} rows={4} placeholder="Metadata-driven filter criteria"/></label><label>Sort By<input value={sortBy} onChange={e=>setSortBy(e.target.value)} placeholder="Optional field API name"/></label>{sortBy?<label>Sort Order<select value={sortOrder} onChange={e=>setSortOrder(e.target.value)}><option value="asc">Ascending</option><option value="desc">Descending</option></select></label>:null}</>:type==='Collection Choice Set'?<label>Collection Resource<input value={value} onChange={e=>setValue(e.target.value)} placeholder="Collection resource API name"/></label>:type==='Picklist Choice Set'?<><label>Object API Name<input value={objectKey} onChange={e=>setObjectKey(e.target.value)} placeholder="Object API name"/></label><label>Picklist Field API Name<input value={value} onChange={e=>setValue(e.target.value)} placeholder="Field API name"/></label></>:type==='Stage'?<label>Stage Order<input type="number" min="1" value={value} onChange={e=>setValue(e.target.value)}/></label>:<label>Default Value<input value={value} onChange={e=>setValue(e.target.value)}/></label>}
      {validationIssue?<div className="b2-field-error" role="alert">{validationIssue}</div>:null}
    </div><footer><button onClick={onClose}>Cancel</button><button className="is-primary" disabled={Boolean(validationIssue)} onClick={()=>onCreate({value:`${name.trim()}`,apiName:name.trim(),label:name.trim(),description,type,dataType,defaultValue:value,isCollection,availableInput,availableOutput,objectKey,decimalPlaces,choiceLabel,choiceValue,sortBy,sortOrder})}>Done</button></footer>
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
  return <div className="b2-condition-block">{rows.map((r,i)=><div className="b2-condition" key={r.id}><span>{i+1}</span><button type="button" aria-label={`Use resource path for condition ${i+1}`} onClick={()=>patch(r.id,{resourceMode:r.resourceMode==='path'?'field':'path',resource:''})}>{r.resourceMode==='path'?'Field':'Resource'}</button>{r.resourceMode==='path'||!objectKey||String(r.resource||'').startsWith('steps.')||String(r.resource||'').startsWith('variables.')?<input value={r.resource||''} onChange={e=>patch(r.id,{resource:e.target.value})} placeholder="Step or variable path"/>:<MetadataFieldPicker objects={objects} objectKey={objectKey} value={r.resource} onChange={v=>patch(r.id,{resource:v})}/>} <select value={r.operator} onChange={e=>patch(r.id,{operator:e.target.value})}><option>Equals</option><option>Does Not Equal</option><option>Is Null</option><option>Is Changed</option><option>Greater Than</option><option>Greater Than or Equal</option><option>Less Than</option><option>Less Than or Equal</option><option>Starts With</option><option>Ends With</option><option>Contains</option><option>In</option><option>Not In</option><option>Is Blank</option><option>Was Set</option><option>Was Visited</option><option>Has Error</option></select>{['Is Null','Is Blank','Was Set','Was Visited','Has Error'].includes(r.operator)?<select value={String(r.value||'false')} onChange={e=>patch(r.id,{value:e.target.value})}><option value="false">False</option><option value="true">True</option></select>:<input value={r.value} onChange={e=>patch(r.id,{value:e.target.value})} placeholder="Value"/>}<button onClick={()=>onChange(rows.filter(x=>x.id!==r.id))}><Trash2 size={13}/></button></div>)}<button className="b2-text-action" onClick={()=>onChange([...rows,{id:uid(),resource:'',operator:'Equals',value:''}])}><Plus size={13}/> Add Condition</button></div>
}

function BranchSteps({label,value,nodes,onChange,onAdd,onSelectNode}) {
  return <fieldset className="b2-branch-steps"><legend>{label} Path</legend>{value.map((id,i)=><div key={id} className="b2-path-step"><button type="button" className="b2-path-step-link" onClick={()=>onSelectNode?.(id)}>{i+1}. {nodes.find(n=>n.id===id)?.label||id}</button><button type="button" aria-label={`Remove path step ${i+1}`} onClick={()=>onChange(value.filter((_,j)=>j!==i))}><Trash2 size={13}/></button></div>)}<label>Connect existing element<select value="" onChange={e=>{if(e.target.value)onChange([...value,e.target.value])}}><option value="">Select element?</option>{nodes.filter(n=>!value.includes(n.id)).map(n=><option value={n.id} key={n.id}>{n.label}</option>)}</select></label>{onAdd?<button type="button" onClick={onAdd}><Plus size={13}/> Add Element to Path</button>:null}</fieldset>
}

function CommunicationActionFields({p,patch,resources,objects,objectKey,onNew,flowType,startConfig}) {
  const rows=Array.isArray(p.templateContextRows)?p.templateContextRows:[]
  const updateRow=(id,changes)=>patch({templateContextRows:rows.map(row=>row.id===id?{...row,...changes}:row)})
  return <>
    <label>Channel Source<select aria-label="Channel Source" value={p.channelMode||'literal'} onChange={e=>patch({channelMode:e.target.value,channelValue:''})}><option value="literal">Fixed channel</option><option value="resource">Flow resource</option></select></label>
    {p.channelMode==='resource'?<label>Channel<ResourcePicker {...{resources,objects,objectKey,onNew,flowType,startConfig}} value={p.channelValue||''} onChange={value=>patch({channelValue:value})}/></label>:<label>Channel<select aria-label="Channel" value={p.channelValue||''} onChange={e=>patch({channelValue:e.target.value})}><option value="">Select channel…</option><option value="EMAIL">Email</option><option value="SMS">SMS</option><option value="WHATSAPP">WhatsApp</option><option value="IN_APP">In-app notification</option></select></label>}
    <label>Recipient Source<select aria-label="Recipient Source" value={p.recipientMode||'literal'} onChange={e=>patch({recipientMode:e.target.value,recipientValue:''})}><option value="literal">Fixed value</option><option value="resource">Flow resource</option></select></label>
    {p.recipientMode==='resource'?<label>Recipient<ResourcePicker {...{resources,objects,objectKey,onNew,flowType,startConfig}} value={p.recipientValue||''} onChange={value=>patch({recipientValue:value})}/></label>:<label>Recipient<input aria-label="Recipient" value={p.recipientValue||''} onChange={e=>patch({recipientValue:e.target.value})} placeholder={p.channelValue==='IN_APP'?'User ID or CURRENT_USER':'Address, number or recipient value'}/></label>}
    <label>Subject / Title<input aria-label="Subject / Title" value={p.subject||p.title||''} onChange={e=>patch({subject:e.target.value,title:e.target.value})} placeholder="Optional subject or notification title"/></label>
    <label>Template API Name<input aria-label="Template API Name" value={p.template||''} onChange={e=>patch({template:e.target.value})} placeholder="Optional communication template"/></label>
    <label>Message<textarea aria-label="Message" rows={7} value={p.message||''} onChange={e=>patch({message:e.target.value})} placeholder="Message body. Merge fields are supplied below."/></label>
    <div className="b2-condition-block"><b>Template Variables</b>{rows.map((row,index)=><div className="b2-condition" key={row.id}><span>{index+1}</span><input value={row.name||''} onChange={e=>updateRow(row.id,{name:e.target.value})} placeholder="Variable name"/><select value={row.mode||'literal'} onChange={e=>updateRow(row.id,{mode:e.target.value,value:''})}><option value="literal">Value</option><option value="resource">Resource</option></select>{row.mode==='resource'?<ResourcePicker {...{resources,objects,objectKey,onNew,flowType,startConfig}} value={row.value||''} onChange={value=>updateRow(row.id,{value})}/>:<input value={row.value||''} onChange={e=>updateRow(row.id,{value:e.target.value})} placeholder="Value"/>}<button onClick={()=>patch({templateContextRows:rows.filter(x=>x.id!==row.id)})}><Trash2 size={13}/></button></div>)}<button className="b2-text-action" onClick={()=>patch({templateContextRows:[...rows,{id:uid(),name:'',mode:'resource',value:''}]})}><Plus size={13}/> Add Template Variable</button></div>
  </>
}
function ActionFaultPath({node,nodes,patch}) {
  const p=node.config||{}
  const mode=p.faultMode||p.inputs?.faultMode||'FAIL'
  const branch=p.faultBranch||p.inputs?.faultBranch||[]
  return <><label>On Error<select value={mode} onChange={e=>patch({faultMode:e.target.value,...(e.target.value==='FAIL'?{faultBranch:[]}: {})})}><option value="FAIL">Stop with error</option><option value="ROUTE">Follow Fault Recovery</option></select></label>{mode==='ROUTE'?<BranchSteps label="Fault Recovery" value={branch} nodes={nodes.filter(n=>n.id!==node.id)} onChange={faultBranch=>patch({faultBranch})}/>:null}</>
}
function WhatsAppHttpActionFields({p,patch,resources,objects,objectKey,onNew,flowType,startConfig}) {
  const inputs=(p.actionRows||[]).length?actionRowsToInputs(p.actionRows):(p.inputs||{})
  const variables=inputs.variables&&typeof inputs.variables==='object'?inputs.variables:{}
  const variableRows=Object.entries(variables).map(([name,value])=>({name,value}))
  return <>
    <div className="b2-message-editor">
      <div><b>WhatsApp Message Template</b><small>Editable text sent by this Flow. The API request remains visible and configurable below.</small></div>
      <textarea aria-label="WhatsApp Message Template" rows={8} value={p.message??inputs.body?.text?.body??''} onChange={e=>patch({message:e.target.value})} placeholder="Enter the WhatsApp message…"/>
      {variableRows.length?<div className="b2-template-hints"><b>Available merge fields</b>{variableRows.map(row=><code key={row.name}>{`{{${row.name}}}`}</code>)}</div>:null}
    </div>
    <details className="b2-advanced-action"><summary>Advanced API configuration</summary><GenericActionFields {...{p,patch,resources,objects,objectKey,onNew,flowType,startConfig}}/></details>
  </>
}

function GenericActionFields({p,patch,resources,objects,objectKey,onNew,flowType,startConfig}) {
  const rows=p.actionRows||actionInputRows(p.inputs||{})
  const update=(id,changes)=>patch({actionRows:rows.map(row=>row.id===id?{...row,...changes}:row)})
  return <div className="b2-condition-block"><b>Inputs</b>{rows.map((row,index)=><div className="b2-condition" key={row.id}><span>{index+1}</span><input value={row.name||''} onChange={e=>update(row.id,{name:e.target.value})} placeholder="Input"/><select value={row.mode||'literal'} onChange={e=>update(row.id,{mode:e.target.value,value:''})}><option value="resource">Resource</option><option value="literal">Value</option><option value="structured">Structured Value</option></select>{row.mode==='resource'?<ResourcePicker {...{resources,objects,objectKey,onNew,flowType,startConfig}} value={row.value||''} onChange={value=>update(row.id,{value})}/>:row.mode==='structured'?<textarea rows={3} value={row.value||''} onChange={e=>update(row.id,{value:e.target.value})} placeholder="Structured value"/>:<input value={row.value??''} onChange={e=>update(row.id,{value:e.target.value})} placeholder="Value"/>}<button type="button" onClick={()=>patch({actionRows:rows.filter(x=>x.id!==row.id)})}><Trash2 size={13}/></button></div>)}<button type="button" className="b2-text-action" onClick={()=>patch({actionRows:[...rows,{id:uid(),name:'',mode:'resource',value:''}]})}><Plus size={13}/> Add Input</button></div>
}
function FormulaFields({p,patch,resources,objects,objectKey,onNew,flowType,startConfig}) {
  const rows=p.inputRows||[]
  const update=(id,changes)=>patch({inputRows:rows.map(row=>row.id===id?{...row,...changes}:row)})
  return <><label>Store Result In<input value={p.resourceName||''} onChange={e=>patch({resourceName:e.target.value})} placeholder="Variable API name"/></label><label>Result Type<select value={p.resultType||'text'} onChange={e=>patch({resultType:e.target.value})}><option value="text">Text</option><option value="number">Number</option><option value="boolean">Boolean</option><option value="date">Date</option><option value="datetime">Date/Time</option></select></label><div className="b2-condition-block"><b>Formula Inputs</b>{rows.map((row,index)=><div className="b2-condition" key={row.id}><span>{index+1}</span><input value={row.name||''} onChange={e=>update(row.id,{name:e.target.value})} placeholder="Name"/><select value={row.mode||'resource'} onChange={e=>update(row.id,{mode:e.target.value,value:''})}><option value="resource">Resource</option><option value="literal">Value</option></select>{row.mode==='resource'?<ResourcePicker {...{resources,objects,objectKey,onNew,flowType,startConfig}} value={row.value||''} onChange={value=>update(row.id,{value})}/>:<input value={row.value??''} onChange={e=>update(row.id,{value:e.target.value})} placeholder="Value"/>}<button type="button" onClick={()=>patch({inputRows:rows.filter(x=>x.id!==row.id)})}><Trash2 size={13}/></button></div>)}<button type="button" className="b2-text-action" onClick={()=>patch({inputRows:[...rows,{id:uid(),name:'',mode:'resource',value:''}]})}><Plus size={13}/> Add Formula Input</button></div><FormulaBuilder value={p.expression||''} onChange={expression=>patch({expression})} resources={resources} flowType={flowType} startConfig={startConfig} label="Formula"/></>
}
function Properties({node,onPatch,nodes=[],onAddBranch,onSelectNode,objects,resources,onNew,actions,flowType='record',startConfig={}}) {
  if(!node)return <div className="b2-properties-empty"><Settings2 size={26}/><b>Select an element</b><span>Its properties appear here.</span></div>
  const p=node.config||{}, patch=x=>onPatch({...node,config:{...p,...x}})
  const objectKey=p.objectKey||(node.type==='DECISION'?startConfig.objectKey:'')||''
  const common=<><label>Label<input value={node.label||''} onChange={e=>{const label=e.target.value;onPatch({...node,label,apiName:syncedApiName(node.apiName,node.label,label,node.id,node.type||'Element')})}}/></label><label>API Name<input value={node.apiName||''} onChange={e=>onPatch({...node,apiName:e.target.value})}/></label><label>Description<textarea rows={3} value={node.description||''} onChange={e=>onPatch({...node,description:e.target.value})} placeholder="Describe this element…"/></label></>
  const object=<label>Object<ObjectSearchPicker objects={objects} value={objectKey} onChange={value=>patch({objectKey:value})} /></label>
  const cond=<><label>Condition Requirements<select value={p.conditionLogic||'all'} onChange={e=>patch({conditionLogic:e.target.value})}><option value="all">All Conditions Are Met (AND)</option><option value="any">Any Condition Is Met (OR)</option><option value="custom">Custom Condition Logic Is Met</option><option value="formula">Formula Evaluates to True</option>{node.type==='GET_RECORDS'?<option value="none">None — Get All Records</option>:null}</select></label>{p.conditionLogic==='formula'?<label>Formula<textarea rows={5} value={p.formula||''} onChange={e=>patch({formula:e.target.value})} placeholder="Enter a Boolean formula…"/></label>:p.conditionLogic==='none'?null:<><Conditions value={p.conditions} onChange={v=>patch({conditions:v})} {...{resources,objects,objectKey,onNew,flowType,startConfig}}/>{p.conditionLogic==='custom'?<label>Custom Condition Logic<input value={p.customConditionLogic||''} onChange={e=>patch({customConditionLogic:e.target.value})} placeholder="Example: 1 AND (2 OR 3)"/></label>:null}</>}</>
  return <div className="b2-form">{common}
    {['GET_RECORDS','CREATE_RECORDS','UPDATE_RECORDS','DELETE_RECORDS'].includes(node.type)?object:null}
    {['GET_RECORDS','UPDATE_RECORDS','DELETE_RECORDS','COLLECTION_FILTER','WAIT'].includes(node.type)?cond:null}
    {node.type==='CREATE_RECORDS'?<><label>How Many Records to Create<select value={p.createCount||'one'} onChange={e=>patch({createCount:e.target.value})}><option value="one">One</option><option value="multiple">Multiple</option></select></label><label>How to Set Record Field Values<select value={p.valueMode||'manual'} onChange={e=>patch({valueMode:e.target.value})}><option value="manual">Manually</option><option value="record">From a Record Variable</option><option value="collection">From a Record Collection</option></select></label>{p.valueMode==='manual'||!p.valueMode?<div className="b2-condition-block">{(p.fieldValues||[{id:'field-1',field:'',value:''}]).map((row,i)=><div className="b2-condition" key={row.id||i}><span>{i+1}</span><MetadataFieldPicker objects={objects} objectKey={objectKey} value={row.field} onChange={v=>patch({fieldValues:(p.fieldValues||[{id:'field-1',field:'',value:''}]).map((x,j)=>j===i?{...x,field:v}:x)})}/><input value={row.value||''} onChange={e=>patch({fieldValues:(p.fieldValues||[{id:'field-1',field:'',value:''}]).map((x,j)=>j===i?{...x,value:e.target.value}:x)})} placeholder="Value or resource"/><button onClick={()=>patch({fieldValues:(p.fieldValues||[]).filter((_,j)=>j!==i)})}><Trash2 size={13}/></button></div>)}<button className="b2-text-action" onClick={()=>patch({fieldValues:[...(p.fieldValues||[]),{id:uid(),field:'',value:''}]})}><Plus size={13}/> Add Field</button></div>:<label>{p.valueMode==='collection'?'Record Collection':'Record'}<ResourcePicker {...{resources,objects,objectKey,onNew,flowType,startConfig}} value={p.sourceRecord||''} onChange={v=>patch({sourceRecord:v})}/></label>}</>:null}
    {node.type==='GET_RECORDS'?<><label>Sort Order<select value={p.sortOrder||'none'} onChange={e=>patch({sortOrder:e.target.value})}><option value="none">Not Sorted</option><option value="asc">Ascending</option><option value="desc">Descending</option></select></label>{p.sortOrder&&p.sortOrder!=='none'?<label>Sort By<MetadataFieldPicker objects={objects} objectKey={objectKey} value={p.sortBy||''} onChange={v=>patch({sortBy:v})}/></label>:null}<label>How Many Records to Store<select value={p.limit||'first'} onChange={e=>patch({limit:e.target.value})}><option value="first">Only the first record</option><option value="all">All records</option><option value="limited">All records, up to a specified limit</option></select></label>{p.limit==='limited'?<label>Maximum Number of Records to Store<input type="number" min="2" max="20000" value={p.maxRecords||''} onChange={e=>patch({maxRecords:e.target.value})}/></label>:null}<label>How to Store Record Data<select value={p.store||'auto'} onChange={e=>patch({store:e.target.value,selectedFields:[],fieldAssignments:[]})}><option value="auto">Automatically store all fields</option><option value="choose">Choose fields and let OneEngine do the rest</option><option value="advanced">Choose fields and assign variables (advanced)</option></select></label>{p.store==='choose'?<div className="b2-condition-block">{(p.selectedFields||['']).map((field,i)=><div className="b2-condition" key={i}><span>{i+1}</span><MetadataFieldPicker objects={objects} objectKey={objectKey} value={field} onChange={v=>patch({selectedFields:(p.selectedFields||['']).map((x,j)=>j===i?v:x)})}/><button onClick={()=>patch({selectedFields:(p.selectedFields||[]).filter((_,j)=>j!==i)})}><Trash2 size={13}/></button></div>)}<button className="b2-text-action" onClick={()=>patch({selectedFields:[...(p.selectedFields||[]),'']})}><Plus size={13}/> Add Field</button></div>:null}{p.store==='advanced'?<div className="b2-condition-block">{(p.fieldAssignments||[{id:'assign-1',field:'',resource:''}]).map((row,i)=><div className="b2-condition" key={row.id||i}><span>{i+1}</span><MetadataFieldPicker objects={objects} objectKey={objectKey} value={row.field} onChange={v=>patch({fieldAssignments:(p.fieldAssignments||[{id:'assign-1',field:'',resource:''}]).map((x,j)=>j===i?{...x,field:v}:x)})}/><ResourcePicker {...{resources,objects,objectKey,onNew,flowType,startConfig}} value={row.resource||''} onChange={v=>patch({fieldAssignments:(p.fieldAssignments||[{id:'assign-1',field:'',resource:''}]).map((x,j)=>j===i?{...x,resource:v}:x)})}/><button onClick={()=>patch({fieldAssignments:(p.fieldAssignments||[]).filter((_,j)=>j!==i)})}><Trash2 size={13}/></button></div>)}<button className="b2-text-action" onClick={()=>patch({fieldAssignments:[...(p.fieldAssignments||[]),{id:uid(),field:'',resource:''}]})}><Plus size={13}/> Add Field Assignment</button></div>:null}</>:null}
    {node.type==='UPDATE_RECORDS'?<><label>Record ID<input value={p.recordId||''} onChange={e=>patch({recordId:e.target.value})} placeholder="steps.get_session.record.id"/></label><label>How to Find Records to Update<select value={p.updateMode||'conditions'} onChange={e=>patch({updateMode:e.target.value})}><option value="conditions">Specify conditions to identify records, and set fields individually</option><option value="record">Use the IDs and all field values from a record or record collection</option></select></label>{p.updateMode==='record'?<label>Record or Record Collection<ResourcePicker {...{resources,objects,objectKey,onNew,flowType,startConfig}} value={p.sourceRecord||''} onChange={v=>patch({sourceRecord:v})}/></label>:<><div className="b2-condition-block">{(p.fieldValues||[{id:'update-field-1',field:'',value:''}]).map((row,i)=><div className="b2-condition" key={row.id||i}><span>{i+1}</span><MetadataFieldPicker objects={objects} objectKey={objectKey} value={row.field} onChange={v=>patch({fieldValues:(p.fieldValues||[{id:'update-field-1',field:'',value:''}]).map((x,j)=>j===i?{...x,field:v}:x)})}/><input value={row.value||''} onChange={e=>patch({fieldValues:(p.fieldValues||[{id:'update-field-1',field:'',value:''}]).map((x,j)=>j===i?{...x,value:e.target.value}:x)})} placeholder="Value or resource"/><button onClick={()=>patch({fieldValues:(p.fieldValues||[]).filter((_,j)=>j!==i)})}><Trash2 size={13}/></button></div>)}<button className="b2-text-action" onClick={()=>patch({fieldValues:[...(p.fieldValues||[]),{id:uid(),field:'',value:''}]})}><Plus size={13}/> Add Field</button></div></>}</>:null}
    {node.type==='DELETE_RECORDS'?<label>How to Find Records to Delete<select value={p.deleteMode||'conditions'} onChange={e=>patch({deleteMode:e.target.value})}><option value="conditions">Specify conditions</option><option value="record">Use a record or record collection</option></select>{p.deleteMode==='record'?<ResourcePicker {...{resources,objects,objectKey,onNew,flowType,startConfig}} value={p.sourceRecord||''} onChange={v=>patch({sourceRecord:v})}/>:null}</label>:null}
    {node.type==='DECISION'?<><label>Outcome Evaluation<select value={p.evaluation||'first'} onChange={e=>patch({evaluation:e.target.value})}><option value="first">First outcome whose conditions are met</option></select></label><div className="b2-outcomes">{(p.outcomes||[{id:'outcome-1',label:'Outcome 1',apiName:'Outcome_1',conditionLogic:'all',conditions:[]}]).map((outcome,i)=><fieldset key={outcome.id||i}><legend>Outcome {i+1}</legend><label>Label<input value={outcome.label||''} onChange={e=>{const label=e.target.value;patch({outcomes:(p.outcomes||[]).map((x,j)=>j===i?{...x,label,apiName:syncedApiName(x.apiName,x.label,label,x.id,`Outcome_${i+1}`)}:x)})}}/></label><label>API Name<input value={outcome.apiName||apiNameFromLabel(outcome.label||`Outcome ${i+1}`,`Outcome_${i+1}`)} onChange={e=>patch({outcomes:(p.outcomes||[]).map((x,j)=>j===i?{...x,apiName:e.target.value}:x)})}/></label><Conditions value={outcome.conditions||[]} onChange={v=>patch({outcomes:(p.outcomes||[]).map((x,j)=>j===i?{...x,conditions:v}:x)})} {...{resources,objects,objectKey,onNew,flowType,startConfig}}/><BranchSteps label={outcome.label} value={outcome.branch||[]} nodes={nodes.filter(x=>x.id!==node.id)} onChange={branch=>patch({outcomes:p.outcomes.map((x,j)=>j===i?{...x,branch}:x)})} onAdd={()=>onAddBranch({nodeId:node.id,outcomeId:outcome.id})} onSelectNode={onSelectNode}/><button type="button" className="b2-text-action" onClick={()=>patch({outcomes:(p.outcomes||[]).filter((_,j)=>j!==i)})}><Trash2 size={13}/> Remove Outcome</button></fieldset>)}</div><button type="button" className="b2-text-action" onClick={()=>patch({outcomes:[...(p.outcomes||[]),{id:uid(),label:`Outcome ${(p.outcomes||[]).length+1}`,apiName:`Outcome_${(p.outcomes||[]).length+1}`,conditionLogic:'all',conditions:[]}]})}><Plus size={13}/> New Outcome</button><label>Default Outcome Label<input value={p.defaultOutcomeLabel||'Default Outcome'} onChange={e=>patch({defaultOutcomeLabel:e.target.value})}/></label></>:null}
    {node.type==='DECISION'?<BranchSteps label={p.defaultOutcomeLabel||'Default Outcome'} value={p.defaultBranch||[]} nodes={nodes.filter(x=>x.id!==node.id)} onChange={defaultBranch=>patch({defaultBranch})} onAdd={()=>onAddBranch({nodeId:node.id,outcomeId:'default'})} onSelectNode={onSelectNode}/>:null}
    {node.type==='WAIT'?<><label>Wait Type<select value={p.waitType||'duration'} onChange={e=>patch({waitType:e.target.value})}><option value="duration">Wait for Amount of Time</option><option value="date">Wait Until Date</option><option value="conditions">Wait for Conditions</option><option value="event">Wait Until Event</option></select></label>{p.waitType==='duration'||!p.waitType?<><label>Amount<input type="number" min="1" value={p.amount||''} onChange={e=>patch({amount:e.target.value})}/></label><label>Unit<select value={p.unit||'minutes'} onChange={e=>patch({unit:e.target.value})}><option value="minutes">Minutes</option><option value="hours">Hours</option><option value="days">Days</option></select></label></>:p.waitType==='date'?<label>Date/Time Resource<ResourcePicker {...{resources,objects,objectKey,onNew,flowType,startConfig}} value={p.dateResource||''} onChange={v=>patch({dateResource:v})}/></label>:p.waitType==='event'?<label>Event API Name<input value={p.eventKey||''} onChange={e=>patch({eventKey:e.target.value})}/></label>:<Conditions value={p.conditions||[]} onChange={v=>patch({conditions:v})} {...{resources,objects,objectKey,onNew,flowType,startConfig}}/>}</>:null}
    {node.type==='ASSIGNMENT'?<><label>Variable<ResourcePicker {...{resources,objects,objectKey,onNew,flowType,startConfig}} value={p.resource||''} onChange={v=>patch({resource:v})}/></label><label>Operator<select value={p.operator||'Equals'} onChange={e=>patch({operator:e.target.value})}><option>Equals</option><option>Add</option><option>Subtract</option><option>Add Item</option><option>Remove Item</option></select></label><label>Value<input value={p.value||''} onChange={e=>patch({value:e.target.value})}/></label></>:null}
    {node.type==='LOOP'?<><label>Collection Variable<ResourcePicker {...{resources,objects,objectKey,onNew,flowType,startConfig}} value={p.collection||''} onChange={v=>patch({collection:v})}/></label><label>Direction<select value={p.direction||'first'} onChange={e=>patch({direction:e.target.value})}><option value="first">First item to last item</option><option value="last">Last item to first item</option></select></label></>:null}
    {node.type==='COLLECTION_FILTER'?<><label>Collection<ResourcePicker {...{resources,objects,objectKey,onNew,flowType,startConfig}} value={p.collection||''} onChange={v=>patch({collection:v})}/></label><label>Filter Mode<select value={p.filterMode||'conditions'} onChange={e=>patch({filterMode:e.target.value})}><option value="conditions">Conditions</option><option value="formula">Formula</option></select></label>{p.filterMode==='formula'?<FormulaBuilder value={p.filterFormula||''} onChange={filterFormula=>patch({filterFormula})} resources={resources} flowType={flowType} startConfig={startConfig} label="Formula"/>:null}</>:null}
    {node.type==='COLLECTION_SORT'?<><label>Collection<ResourcePicker {...{resources,objects,objectKey,onNew,flowType,startConfig}} value={p.collection||''} onChange={v=>patch({collection:v})}/></label><label>Sort Order<select value={p.order||'asc'} onChange={e=>patch({order:e.target.value})}><option value="asc">Ascending</option><option value="desc">Descending</option></select></label><label>Maximum Items<input type="number" min="0" value={p.max||''} onChange={e=>patch({max:e.target.value})}/></label></>:null}
    {node.type==='TRANSFORM'?<div className="b2-transform"><div><b>Source Data</b><ResourcePicker {...{resources,objects,objectKey,onNew,flowType,startConfig}} value={p.source||''} onChange={v=>patch({source:v})}/></div><div><b>Target Data</b><ResourcePicker {...{resources,objects,objectKey,onNew,flowType,startConfig}} value={p.target||''} onChange={v=>patch({target:v})}/></div><label>Field Mappings<textarea rows={6} value={p.mappingsText||''} onChange={e=>patch({mappingsText:e.target.value})} placeholder="Map source fields/resources to target fields"/></label></div>:null}
    {node.type==='CUSTOM_ERROR'?<><label>Where to Show the Error<select value={p.location||'record'} onChange={e=>patch({location:e.target.value})}><option value="record">In a window on the record page</option><option value="field">Inline on a field</option></select></label>{p.location==='field'?<label>Field<ResourcePicker {...{resources,objects,objectKey,onNew,flowType,startConfig}} value={p.field||''} onChange={v=>patch({field:v})}/></label>:null}<label>Error Message<textarea rows={4} value={p.message||''} onChange={e=>patch({message:e.target.value})}/></label></>:null}
    {node.type==='FORMULA'?<><FormulaFields {...{p,patch,resources,objects,objectKey,onNew,flowType,startConfig}}/><ActionFaultPath {...{node,nodes,patch}}/><p className="b2-help">Choose Flow resources as formula inputs. OneEngine stores the technical binding in metadata; builders do not edit an action payload.</p></>:null}
    {node.type==='ACTION'?<><label>Action<select value={p.actionKey||''} onChange={e=>patch({actionKey:e.target.value,inputs:{},actionRows:[],faultMode:'FAIL',faultBranch:[],channelMode:'literal',channelValue:'',recipientMode:'literal',recipientValue:'',subject:'',title:'',message:'',template:'',templateContextRows:[]})}><option value="">Select action…</option>{actions.filter(a=>!LEGACY_COMMUNICATION_ACTIONS.has(String(a.key||'').toUpperCase())).map(a=><option key={a.key} value={a.key}>{a.displayName||a.label||a.key}</option>)}</select></label>{p.actionKey==='SEND_COMMUNICATION'?<CommunicationActionFields {...{p,patch,resources,objects,objectKey,onNew,flowType,startConfig}}/>:null}{p.actionKey==='ONE_HTTP_REQUEST'&&String((p.inputs?.providerKey??actionRowsToInputs(p.actionRows||[]).providerKey)||'').toLowerCase()==='whatsapp'&&((p.inputs?.body?.text?.body!=null)||p.message!=null)?<WhatsAppHttpActionFields {...{p,patch,resources,objects,objectKey,onNew,flowType,startConfig}}/>:null}{p.actionKey&&p.actionKey!=='SEND_COMMUNICATION'&&!(p.actionKey==='ONE_HTTP_REQUEST'&&String((p.inputs?.providerKey??actionRowsToInputs(p.actionRows||[]).providerKey)||'').toLowerCase()==='whatsapp'&&((p.inputs?.body?.text?.body!=null)||p.message!=null))?<GenericActionFields {...{p,patch,resources,objects,objectKey,onNew,flowType,startConfig}}/>:null}<ActionFaultPath {...{node,nodes,patch}}/><p className="b2-help">{p.actionKey==='SEND_COMMUNICATION'?'Channel, recipient, template and message are stored directly in Flow metadata. Provider credentials remain secured in the installed connector.':"Select resources or values for each registered action input. Runtime metadata stays behind the builder."}</p></>:null}
    {node.type==='SUBFLOW'?<><label>Flow API Name<input value={p.flow||''} onChange={e=>patch({flow:e.target.value})} placeholder="Active autolaunched flow API name"/></label><label>Input Values<textarea rows={5} value={p.inputsText||''} onChange={e=>patch({inputsText:e.target.value})} placeholder="Map available input variables"/></label><label>Output Values<textarea rows={5} value={p.outputsText||''} onChange={e=>patch({outputsText:e.target.value})} placeholder="Map output variables"/></label></>:null}
  </div>
}




function GroupDialog({onClose,onCreate}) {
  const [name,setName]=useState(''),[description,setDescription]=useState('')
  return <div className="b2-modal-backdrop"><div className="b2-modal"><header><div><h3>New Group</h3><p>Organize selected elements into a collapsible section.</p></div><button onClick={onClose}><X size={18}/></button></header><div className="b2-form"><label>Label<input autoFocus value={name} onChange={e=>setName(e.target.value)}/></label><label>Description<textarea rows={4} value={description} onChange={e=>setDescription(e.target.value)}/></label></div><footer><button onClick={onClose}>Cancel</button><button className="is-primary" disabled={!name.trim()} onClick={()=>onCreate(name.trim(),description.trim())}>Done</button></footer></div></div>
}

function StartProperties({value,onChange,objects,onClose,resources=[],flowType='record'}) {
  const p=value||{}, patch=x=>onChange({...p,...x})
  const meta=FLOW_TYPES[flowType]||FLOW_TYPES.record
  if(meta.start==='none') return <div className="b2-start-panel"><header><div><b>Start</b><small>{meta.label}</small></div><button onClick={onClose}><X size={16}/></button></header><div className="b2-form"><p className="b2-help">This flow starts when invoked. Configure input variables in Manager and connect the first element from Start.</p></div></div>
  if(meta.start==='schedule') return <div className="b2-start-panel"><header><div><b>Configure Start</b><small>{meta.label}</small></div><button onClick={onClose}><X size={16}/></button></header><div className="b2-form"><label>Frequency<select value={p.schedule?.frequency||''} onChange={e=>patch({schedule:{...(p.schedule||{}),frequency:e.target.value}})}><option value="">Select frequency…</option><option value="once">Once</option><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label><label>Start Date<input type="date" value={p.schedule?.startDate||''} onChange={e=>patch({schedule:{...(p.schedule||{}),startDate:e.target.value}})}/></label><label>Start Time<input type="time" value={p.schedule?.startTime||''} onChange={e=>patch({schedule:{...(p.schedule||{}),startTime:e.target.value}})}/></label><label>Object (optional)<ObjectSearchPicker objects={objects} value={p.objectKey||''} onChange={value=>patch({objectKey:value})} placeholder="Search optional object…" ariaLabel="Search optional object" /></label></div></div>
  if(meta.start==='platform_event') return <div className="b2-start-panel"><header><div><b>Configure Start</b><small>{meta.label}</small></div><button onClick={onClose}><X size={16}/></button></header><div className="b2-form"><label>Platform Event API Name<input value={p.eventKey||''} onChange={e=>patch({eventKey:e.target.value})} placeholder="Event API name"/></label></div></div>
  return <div className="b2-start-panel"><header><div><b>Configure Start</b><small>{meta.label}</small></div><button onClick={onClose}><X size={16}/></button></header><div className="b2-form">
    <label>Object<ObjectSearchPicker objects={objects} value={p.objectKey||''} onChange={value=>patch({objectKey:value})} /></label>
    <fieldset><legend>Trigger the Flow When</legend>{[['created','A record is created'],['updated','A record is updated'],['created_or_updated','A record is created or updated'],['deleted','A record is deleted']].map(([v,l])=><label className="b2-radio" key={v}><input type="radio" checked={(p.trigger||'created_or_updated')===v} onChange={()=>patch({trigger:v})}/>{l}</label>)}</fieldset>
    <label>Condition Requirements<select value={p.conditionLogic||'all'} onChange={e=>patch({conditionLogic:e.target.value})}><option value="all">All Conditions Are Met (AND)</option><option value="any">Any Condition Is Met (OR)</option><option value="custom">Custom Condition Logic Is Met</option><option value="formula">Formula Evaluates to True</option><option value="none">None — Always Run</option></select></label>
    {p.conditionLogic==='formula'?<FormulaBuilder value={p.formula||''} onChange={formula=>patch({formula})} resources={resources} flowType={flowType} startConfig={p} label="Formula"/>:p.conditionLogic==='none'?null:<><Conditions value={p.conditions} onChange={conditions=>patch({conditions})} resources={[]} objects={objects} objectKey={p.objectKey||''} onNew={()=>{}} flowType={flowType} startConfig={p}/>{p.conditionLogic==='custom'?<label>Custom Condition Logic<input value={p.customConditionLogic||''} onChange={e=>patch({customConditionLogic:e.target.value})} placeholder="Example: 1 AND (2 OR 3)"/></label>:null}</>}
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

function FlowDebugPanel({workflowId,busy,setBusy,buildPayload,inputContract,setError,setRuntimeMessage,onClose}) {
  const initialInputs=()=>Object.fromEntries((inputContract||[]).filter(input=>input?.name).map(input=>[input.name,typeof input.defaultValue==='object'?JSON.stringify(input.defaultValue):input.defaultValue??'']))
  const [inputs,setInputs]=useState(initialInputs),[result,setResult]=useState(null)
  const contractSignature=JSON.stringify(inputContract)
  useEffect(()=>setInputs(current=>({...initialInputs(),...current})),[contractSignature])
  const setValue=(input,value)=>setInputs(current=>({...current,[input.name]:input.type==='number'&&value!==''?Number(value):input.type==='boolean'?value==='true':value}))
  return <div className="b2-drawer"><header><b>Debug</b><button aria-label="Close Debug" onClick={onClose}><X size={16}/></button></header><div>
    <p>Debug the most recent saved version with input values. Database changes are rolled back and connector sends are simulated.</p>
    {(inputContract||[]).map(input=><label key={input.name}>{input.label||input.name}{input.required?<span> *</span>:null}{input.type==='boolean'
      ?<select aria-label={input.label||input.name} value={String(inputs[input.name]??false)} onChange={e=>setValue(input,e.target.value)}><option value="false">False</option><option value="true">True</option></select>
      :['record','object','collection'].includes(input.type)?<textarea aria-label={input.label||input.name} rows={6} value={inputs[input.name]??''} onChange={e=>setValue(input,e.target.value)}/>:<input aria-label={input.label||input.name} type={input.type==='number'?'number':'text'} value={inputs[input.name]??''} onChange={e=>setValue(input,e.target.value)}/>}</label>)}
    <label className="b2-check"><input type="checkbox" checked readOnly/> Roll back changes after debugging</label>
    <button className="is-primary" disabled={!workflowId||busy} onClick={async()=>{setBusy(true);setError('');try{
      const r=await apiRequest(`/api/platform/rules/${workflowId}/debug`,{method:'POST',body:JSON.stringify({definition:buildPayload('DRAFT'),mode:'debug',rollback:true,inputs:parseWorkflowInputs(inputContract,inputs)})})
      const data=r?.data||r;setResult(data);setRuntimeMessage(data?.status?`Debug v${data?.executionVersion||data?.run?.workflow_version||'?'}: ${data.status}`:'Debug completed.')
    }catch(e){setError(e?.message||'Debug failed')}finally{setBusy(false)}}}>Run Debug</button>
    {result?<><h4>Execution Result</h4><pre className="b2-test-result">{JSON.stringify(result,null,2)}</pre></>:null}
  </div></div>
}

function FlowTestPanel({workflowId,busy,setBusy,buildPayload,inputContract,setError,setRuntimeMessage,onClose}) {
  const initialInputs=()=>Object.fromEntries((inputContract||[]).filter(input=>input?.name).map(input=>[input.name,typeof input.defaultValue==='object'?JSON.stringify(input.defaultValue):input.defaultValue??'']))
  const [recordJson,setRecordJson]=useState('{}'),[inputs,setInputs]=useState(initialInputs),[result,setResult]=useState(null)
  const contractSignature=JSON.stringify(inputContract)
  useEffect(()=>setInputs(current=>({...initialInputs(),...current})),[contractSignature])
  const setValue=(input,value)=>setInputs(current=>({...current,[input.name]:input.type==='number'&&value!==''?Number(value):input.type==='boolean'?value==='true':value}))
  return <div className="b2-drawer"><header><b>Test Mode</b><button aria-label="Close Test Mode" onClick={onClose}><X size={16}/></button></header><div>
    <p>Test the draft with input values and an optional inbound trigger record. Database changes are rolled back and connector sends are simulated.</p>
    {(inputContract||[]).map(input=><label key={input.name}>{input.label||input.name}{input.required?<span> *</span>:null}{input.type==='boolean'
      ?<select aria-label={input.label||input.name} value={String(inputs[input.name]??false)} onChange={e=>setValue(input,e.target.value)}><option value="false">False</option><option value="true">True</option></select>
      :['record','object','collection'].includes(input.type)?<textarea aria-label={input.label||input.name} rows={6} value={inputs[input.name]??''} onChange={e=>setValue(input,e.target.value)}/>:<input aria-label={input.label||input.name} type={input.type==='number'?'number':'text'} value={inputs[input.name]??''} onChange={e=>setValue(input,e.target.value)}/>}</label>)}
    <label>Trigger Record (JSON)<textarea rows={6} value={recordJson} onChange={e=>setRecordJson(e.target.value)}/></label>
    <button className="is-primary" disabled={!workflowId||busy} onClick={async()=>{setBusy(true);setError('');try{
      const recordOverride=JSON.parse(recordJson)
      if(!recordOverride||Array.isArray(recordOverride)||typeof recordOverride!=='object')throw new Error('Trigger Record must be a JSON object')
      const r=await apiRequest(`/api/platform/rules/${workflowId}/debug`,{method:'POST',body:JSON.stringify({definition:buildPayload('DRAFT'),recordOverride,inputs:parseWorkflowInputs(inputContract,inputs),mode:'test',rollback:true})})
      const data=r?.data||r;setResult(data);setRuntimeMessage(`Test v${data?.executionVersion||data?.run?.workflow_version||'?'}: ${data?.status||'completed'}${data?.results?.some(row=>row.result?.simulated)?' (external actions simulated)':''}`)
    }catch(e){setError(e?.message||'Test failed')}finally{setBusy(false)}}}>Run Test</button>
    {result?<><h4>Execution Result</h4><pre className="b2-test-result">{JSON.stringify(result,null,2)}</pre></>:null}
  </div></div>
}
export default function Builder2Page({initialWorkflowId='',initialFlowType='',initialObjectKey='',onClose,onSaved}){
  const [objects,setObjects]=useState([]),[actions,setActions]=useState([]),[nodes,setNodes]=useState([]),[edges,setEdges]=useState([]),[selected,setSelected]=useState(''),[selector,setSelector]=useState(false),[search,setSearch]=useState(''),[resources,setResources]=useState([]),[inputContract,setInputContract]=useState([]),[outputContract,setOutputContract]=useState([]),[flowTests,setFlowTests]=useState([]),[resourceDialog,setResourceDialog]=useState(false),[tab,setTab]=useState('elements'),[error,setError]=useState(''),[screenEditing,setScreenEditing]=useState(''),[supportPanel,setSupportPanel]=useState(''),[startOpen,setStartOpen]=useState(()=>normalizeFlowType(initialFlowType)==='record'),[startConfig,setStartConfig]=useState(()=>({trigger:'created_or_updated',conditionLogic:'all',optimize:'actions',...(initialObjectKey?{objectKey:initialObjectKey}:{})})),[zoom,setZoom]=useState(100),[history,setHistory]=useState([]),[future,setFuture]=useState([]),[dirty,setDirty]=useState(false),[nodeMenu,setNodeMenu]=useState(''),[saveMenu,setSaveMenu]=useState(false),[active,setActive]=useState(false),[clipboard,setClipboard]=useState([]),[multiSelect,setMultiSelect]=useState(false),[selectedMany,setSelectedMany]=useState([]),[managerFilter,setManagerFilter]=useState('all'),[editHistory,setEditHistory]=useState([]),[actionEditing,setActionEditing]=useState(''),[toolboxOpen,setToolboxOpen]=useState(true),[layoutMode,setLayoutMode]=useState('auto'),[flowType,setFlowType]=useState(()=>normalizeFlowType(initialFlowType||'record')),[flowProps,setFlowProps]=useState({label:'New Flow',apiName:'New_Flow',description:'',apiVersion:'66.0',runContext:'default'}),[flowPropsOpen,setFlowPropsOpen]=useState(false),[historyPreview,setHistoryPreview]=useState(''),[groups,setGroups]=useState([]),[groupDialog,setGroupDialog]=useState(false),[branchCollapsed,setBranchCollapsed]=useState({}),[workflowId,setWorkflowId]=useState(()=>String(initialWorkflowId||'')),[busy,setBusy]=useState(false),[runtimeMessage,setRuntimeMessage]=useState(''),[resourceDelete,setResourceDelete]=useState(null),[shortcutsOpen,setShortcutsOpen]=useState(false)
  const canvasRef=useRef(null), centeredWorkflowRef=useRef('')
  const fitFlowToCanvas=()=>{
    if(layoutMode!=='auto')return
    const canvas=canvasRef.current
    const flow=canvas?.querySelector('.b2-flow')
    if(!canvas||!flow)return
    const scale=Math.max(.01,zoom/100)
    const flowRect=flow.getBoundingClientRect()
    const visualItems=[...flow.querySelectorAll('.b2-start,.b2-node,.b2-decision-path>strong,.b2-path-reference,.b2-end')]
    let minLeft=0,maxRight=Math.max(flow.scrollWidth,flowRect.width)/scale
    if(visualItems.length){
      minLeft=Infinity
      maxRight=-Infinity
      for(const item of visualItems){
        const rect=item.getBoundingClientRect()
        minLeft=Math.min(minLeft,(rect.left-flowRect.left)/scale)
        maxRight=Math.max(maxRight,(rect.right-flowRect.left)/scale)
      }
    }
    const rawWidth=Math.max(1,maxRight-minLeft)
    const target=Math.max(20,Math.min(100,Math.floor(((canvas.clientWidth-56)/rawWidth)*100)))
    setZoom(target)
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      const anchor=(selected&&canvas.querySelector(`[data-node-id="${selected}"]`))||canvas.querySelector('.b2-start')
      if(!anchor)return
      const canvasRect=canvas.getBoundingClientRect(), anchorRect=anchor.getBoundingClientRect()
      const anchorCenter=canvas.scrollLeft+(anchorRect.left-canvasRect.left)+(anchorRect.width/2)
      canvas.scrollLeft=Math.max(0,anchorCenter-(canvas.clientWidth/2))
      if(!selected)canvas.scrollTop=0
    }))
  }
  const selectCanvasNode=(id,{openAction=true}={})=>{
    const node=nodes.find(n=>n.id===id)
    if(!node)return
    setSelected(id)
    if(node.type==='DECISION')setBranchCollapsed(current=>({...current,[id]:false}))
    if(openAction&&node.type==='ACTION')setActionEditing(id)
    if(node.type==='SCREEN')setScreenEditing(id)
    requestAnimationFrame(()=>requestAnimationFrame(()=>document.querySelector(`[data-node-id="${id}"]`)?.scrollIntoView({behavior:'smooth',block:'center',inline:'center'})))
  }
  useEffect(()=>{
    let live=true
    const selectedId=String(initialWorkflowId||'')
    const requestedType=normalizeFlowType(initialFlowType||'record')
    setError('')
    setWorkflowId(selectedId)
    setNodes([])
    setEdges([])
    setResources([])
    setInputContract([])
    setOutputContract([])
    setFlowTests([])
    setGroups([])
    setActive(false)
    setFlowType(requestedType)
    setFlowProps({label:'New Flow',apiName:'New_Flow',description:'',apiVersion:'66.0',runContext:'default'})
    setStartConfig({trigger:'created_or_updated',conditionLogic:'all',optimize:'actions',...(initialObjectKey?{objectKey:initialObjectKey}:{})})
    setStartOpen(requestedType==='record')
    Promise.all([apiRequest('/api/platform/objects'),apiRequest('/api/platform/workflow-actions'),apiRequest('/api/platform/rules')]).then(([o,a,r])=>{
      if(!live)return
      setObjects(o?.data?.objects||o?.data||[])
      setActions(Array.isArray(a?.data)?a.data:[])
      if(!selectedId)return
      const rows=Array.isArray(r?.data)?r.data:[]
      let saved=rows.find(x=>String(x?.id||'')===selectedId)
      if(!saved){setError('Flow definition is no longer available. Return to the flow list and refresh.');return}
      let resolvedWorkflowId=String(saved?.id||selectedId)
      const selectedApiName=String(saved?.action?.apiName||'').trim()
      const selectedIsLive=saved?.runtime_active===true||saved?.runtimeActive===true||saved?.active===true
      if(selectedApiName&&!selectedIsLive){
        const activeTwin=rows.find(x=>String(x?.id||'')!==String(saved.id||'')&&String(x?.action?.apiName||'').trim()===selectedApiName&&(x?.runtime_active===true||x?.runtimeActive===true||x?.active===true))
        if(activeTwin){
          saved=activeTwin
          resolvedWorkflowId=String(activeTwin.id||'')
          setRuntimeMessage('Opened the active flow. This link pointed to a retired duplicate.')
          try{
            const url=new URL(window.location.href)
            url.searchParams.set('workflowId',resolvedWorkflowId)
            window.history.replaceState(window.history.state,'',url.pathname+url.search+url.hash)
          }catch{}
        }
      }
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
      setWorkflowId(resolvedWorkflowId)
      setFlowProps({label:saved.name||'New Flow',apiName:action.apiName||'New_Flow',description:action.description||'',apiVersion:String(action.apiVersion||'66.0'),runContext:action.runContext||'default'})
      setStartConfig(nextStart)
      setNodes(savedActions.filter(x=>normalizeNodeType(x.type||x.key)!=='END').map(runtimeActionToBuilderNode))
      setEdges(Array.isArray(layout.edges)?layout.edges:[])
      setResources(Array.isArray(action.resources)?action.resources:[])
      setInputContract(Array.isArray(action.inputContract)?action.inputContract:[])
      setOutputContract(Array.isArray(action.outputContract)?action.outputContract:[])
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
  const buildPayload=(lifecycle='DRAFT')=>({name:flowProps.label||'New Flow',objectId:objects.find(o=>keyOf(o)===startConfig.objectKey)?.id||null,objectKey:startConfig.objectKey||null,triggerKey:flowType==='schedule'?'scheduled':flowType==='platform_event'?(startConfig.eventKey||''):flowType==='record'?(startConfig.trigger==='created'?(startConfig.optimize==='fast'?'before_create':'after_create'):startConfig.trigger==='updated'?(startConfig.optimize==='fast'?'before_update':'after_update'):startConfig.trigger==='deleted'?'after_delete':startConfig.optimize==='fast'?'before_save':'after_save'):'manual',active:lifecycle==='ACTIVE',lifecycleStatus:lifecycle,conditions:(startConfig.conditions||[]).filter(c=>c.resource||c.field).map(conditionToRuntime),action:{match:startConfig.conditionLogic==='any'?'any':'all',entryTransition:startConfig.updateMode==='transition'?'UPDATED_TO_MEET':'EVERY_TIME',type:'workflow',builder2:true,apiName:flowProps.apiName,description:flowProps.description,apiVersion:flowProps.apiVersion,flowType,runContext:flowProps.runContext,start:startConfig,optimize:startConfig.optimize||'actions',builderLayout:{mode:layoutMode==='free'?'FREE_FORM':'AUTO',positions:Object.fromEntries(nodes.map((n,i)=>[n.id,n.position||{x:320,y:120+i*120}])),edges},builderGroups:groups,resources,inputContract:workflowInputContract(inputContract,resources),outputContract,tests:flowTests,actions:nodes.map(n=>builderNodeToRuntimeAction(n,resources))}})
  const persistWorkflow=async(lifecycle='DRAFT',forceNewVersion=false,forceNewFlow=false)=>{setBusy(true);setRuntimeMessage('');try{setError('');const payload={...buildPayload(lifecycle),...(forceNewVersion?{forceNewVersion:true}:{}),...(forceNewFlow?{name:`${flowProps.label||'New Flow'} Copy`,action:{...buildPayload(lifecycle).action,apiName:`${flowProps.apiName||'New_Flow'}_Copy_${Date.now()}`}}:{})};const response=workflowId&&!forceNewFlow?await apiRequest(`/api/platform/rules/${workflowId}`,{method:'PUT',body:JSON.stringify(payload)}):await apiRequest('/api/platform/rules',{method:'POST',body:JSON.stringify(payload)});const saved=response?.data||{};if(saved.id)setWorkflowId(saved.id);onSaved?.(saved,{keepOpen:true});setActive(lifecycle==='ACTIVE');setDirty(false);setEditHistory(h=>[{id:uid(),label:lifecycle==='ACTIVE'?'Activated':'Saved',at:new Date().toISOString(),nodes:nodes.length,snapshot:JSON.parse(JSON.stringify(nodes)),summary:{added:nodes.length,edited:0,deleted:0}},...h].slice(0,100));setRuntimeMessage(lifecycle==='ACTIVE'?'Flow activated.':'Flow saved.');setSaveMenu(false);return saved}catch(e){setError(e?.message||'Unable to save flow');return null}finally{setBusy(false)}}
  const saveDraft=label=>{const action=String(label||'').toLowerCase();return persistWorkflow('DRAFT',action.includes('version'),action.includes('new flow'))}
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
  useEffect(()=>{const onKey=e=>{const mod=e.ctrlKey||e.metaKey;const tag=document.activeElement?.tagName;const editing=['INPUT','TEXTAREA','SELECT'].includes(tag)||document.activeElement?.isContentEditable
    if(mod&&e.key.toLowerCase()==='k'){e.preventDefault();setToolboxOpen(true);setTimeout(()=>document.querySelector('.b2-toolbox input')?.focus(),0)}
    else if(e.key==='F6'){e.preventDefault();const panels=[...document.querySelectorAll('[data-b2-panel]')].filter(el=>el.offsetParent!==null);if(panels.length){const current=panels.findIndex(el=>el===document.activeElement||el.contains(document.activeElement));const next=panels[(current+1)%panels.length];(next.querySelector('button,input,select,textarea,[tabindex]')||next).focus()}}
    else if(!editing&&e.key==='?'&&!mod){e.preventDefault();setShortcutsOpen(true)}
    else if(mod&&e.key.toLowerCase()==='s'){e.preventDefault();saveDraft('Saved')}
    else if(mod&&e.altKey&&e.key.toLowerCase()==='f'){e.preventDefault();fitFlowToCanvas()}
    else if(mod&&e.altKey&&(e.key==='+'||e.key==='=')){e.preventDefault();setZoom(z=>Math.min(150,z+10))}
    else if(mod&&e.altKey&&e.key==='-'){e.preventDefault();setZoom(z=>Math.max(30,z-10))}
    else if(mod&&e.altKey&&e.key==='0'){e.preventDefault();setZoom(100)}
    else if(!editing&&mod&&e.key.toLowerCase()==='x'){e.preventDefault();copySelected();const ids=selectedMany.length?selectedMany:selected?[selected]:[];if(ids.length)commitNodes(nodes.filter(n=>!ids.includes(n.id)))}
    else if(!editing&&mod&&e.key.toLowerCase()==='c'){e.preventDefault();copySelected()}
    else if(!editing&&mod&&e.key.toLowerCase()==='v'){e.preventDefault();pasteClipboard()}
    else if(['ArrowUp','ArrowLeft','ArrowDown','ArrowRight'].includes(e.key)&&document.activeElement?.closest?.('.b2-node')){e.preventDefault();const i=nodes.findIndex(n=>n.id===selected);const d=['ArrowUp','ArrowLeft'].includes(e.key)?-1:1;const next=nodes[Math.max(0,Math.min(nodes.length-1,i+d))];if(next){setSelected(next.id);setTimeout(()=>document.querySelector(`[data-node-id="${next.id}"]`)?.focus(),0)}}
    else if((e.key==='Delete'||e.key==='Backspace')&&selected&&!editing){removeNode(selected)}
  };window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[nodes,selected,selectedMany,clipboard,history,future,dirty,workflowId])
  useEffect(()=>{
    if(layoutMode!=='auto'||!nodes.length)return
    const centerKey=`${workflowId||'draft'}:${nodes.length}:${Object.values(branchCollapsed).filter(Boolean).length}`
    if(centeredWorkflowRef.current===centerKey)return
    let inner=0
    const outer=requestAnimationFrame(()=>{
      inner=requestAnimationFrame(()=>{
        fitFlowToCanvas()
        centeredWorkflowRef.current=centerKey
      })
    })
    return()=>{cancelAnimationFrame(outer);if(inner)cancelAnimationFrame(inner)}
  },[workflowId,nodes.length,layoutMode,branchCollapsed])
  const issues=useMemo(()=>validateDefinition({flowType,startConfig,nodes,edges,resources}),[flowType,startConfig,nodes,edges,resources])
  const errorCount=issues.filter(issue=>issue.level==='error').length, warningCount=issues.filter(issue=>issue.level!=='error').length
  const changeLayoutMode=next=>{
    if(next===layoutMode)return
    if(layoutMode==='free'&&next==='auto'){
      const topology=graphTopologyIssues(nodes,edges)
      if(topology.length){setError('Resolve Free-Form connector errors before switching to Auto-Layout.');setSupportPanel('issues');return}
    }
    setError('');setLayoutMode(next);setDirty(true)
  }
  if(screenEditing){const n=nodes.find(x=>x.id===screenEditing);if(n)return <ScreenEditor node={n} onPatch={patch} onClose={()=>setScreenEditing('')}/>}
  return <div className="b2-shell">
    <header className="b2-top" data-b2-panel tabIndex="-1"><div className="b2-title">{onClose?<button className="b2-back" title="Back to flows" aria-label="Back to flows" onClick={onClose}><ChevronLeft size={16}/></button>:null}<Workflow size={20}/><span><b>Workflow Builder</b><small>{flowProps.label}</small></span></div><div className="b2-buttonbar"><button title="Select Elements" className={multiSelect?'is-on':''} onClick={()=>{setMultiSelect(v=>!v);setSelectedMany([])}}><Copy size={15}/></button>{multiSelect?<><button title="Copy Elements" disabled={!selectedMany.length} onClick={copySelected}><Copy size={15}/></button><button title="Group Elements" disabled={selectedMany.length<2} onClick={groupSelected}><Group size={15}/></button></>:null}{clipboard.length?<button title={`Paste ${clipboard.length} Elements`} onClick={pasteClipboard}><Plus size={15}/></button>:null}<button title="Edit History" onClick={()=>setSupportPanel('history')}><Clock3 size={15}/></button><button title="Undo" disabled={!history.length} onClick={undo}><Undo2 size={15}/></button><button title="Redo" disabled={!future.length} onClick={redo}><Redo2 size={15}/></button><button title="Toggle Toolbox" onClick={()=>setToolboxOpen(v=>!v)}><ChevronLeft size={15}/></button><button title="Flow Properties" onClick={()=>setFlowPropsOpen(true)}><Settings2 size={15}/></button><select className="b2-layout-select" value={layoutMode} onChange={e=>changeLayoutMode(e.target.value)}><option value="auto">Auto-Layout</option><option value="free">Free-Form</option></select></div><div className="b2-top-actions"><button onClick={()=>setSupportPanel(supportPanel==='issues'?'':'issues')} className={issues.length?'has-issues':''}><AlertTriangle size={13}/> Errors & Warnings {issues.length?`(${errorCount} / ${warningCount})`:''}</button><button onClick={()=>setSupportPanel('run')}>Run</button>{['autolaunched','record'].includes(flowType)?<button onClick={()=>setSupportPanel('testmode')}>Test Mode</button>:<button onClick={()=>setSupportPanel('debug')}>Debug</button>}<button onClick={()=>setSupportPanel('tests')}>View Tests</button><div className="b2-save-wrap"><button className="is-primary" disabled={busy} onClick={()=>saveDraft('Saved')}><Save size={13}/> Save{dirty?' *':''}</button><button aria-label="Save options" className="is-primary b2-save-chevron" onClick={()=>setSaveMenu(v=>!v)}><ChevronDown size={13}/></button>{saveMenu?<div className="b2-save-menu"><button onClick={()=>saveDraft('Saved')}>Save</button><button onClick={()=>saveDraft('Saved as new version')}>Save As New Version</button><button onClick={()=>saveDraft('Saved as new flow')}>Save As New Flow</button></div>:null}</div><button disabled={busy} onClick={()=>persistWorkflow(active?'DRAFT':'ACTIVE')}>{active?'Deactivate':'Activate'}</button></div></header>
    {error?<div className="b2-error">{error}</div>:null}{runtimeMessage?<div className={"b2-runtime-message is-"+runtimeMessageTone(runtimeMessage)} role={runtimeMessageTone(runtimeMessage)==="error"?"alert":"status"}>{runtimeMessage}</div>:null}
    <div className={`b2-workspace ${toolboxOpen?'':'toolbox-closed'}`}>
      {toolboxOpen?<aside className="b2-toolbox" data-b2-panel tabIndex="-1"><div className="b2-tabs"><button className={tab==='elements'?'is-active':''} onClick={()=>setTab('elements')}>Elements</button><button className={tab==='manager'?'is-active':''} onClick={()=>setTab('manager')}>Manager</button></div>
        {supportPanel==='issues'?<div className="b2-issues"><h3>Errors & Warnings</h3><div className="b2-issue-summary"><span><b>{errorCount}</b> Errors</span><span><b>{warningCount}</b> Warnings</span></div>{!issues.length?<div className="b2-empty-small">No issues found.</div>:issues.map((i,x)=><button key={x} onClick={()=>{setSelected(i.node);setSupportPanel('')}}><AlertTriangle size={14}/><span><b>{i.level==='error'?'Error':'Warning'}</b><small>{i.text}</small></span></button>)}</div>:tab==='elements'?<><label className="b2-search"><Search size={14}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search elements…"/></label>{paletteGroups.map(g=><section className="b2-palette-group" key={g}><h4>{g}</h4>{filtered.filter(e=>e.category===g).map(e=><button key={e.key} onClick={()=>add(e)}><span className="b2-palette-icon">{g==='Logic'?<GitBranch size={15}/>:g==='Actions'?<Zap size={15}/>:<Database size={15}/>}</span><span><b>{e.label}</b><small>{e.description}</small></span></button>)}</section>)}</>:<div className="b2-manager"><button onClick={()=>setResourceDialog(true)}><Plus size={14}/> New Resource</button><label className="b2-manager-filter">Show<select value={managerFilter} onChange={e=>setManagerFilter(e.target.value)}><option value="all">All Resources</option><option value="unused">Unused Resources</option></select></label>{resources.filter(r=>managerFilter==='all'||resourceUsage(r,nodes,startConfig,flowTests,inputContract,outputContract).length===0).map(r=>{const usage=resourceUsage(r,nodes,startConfig,flowTests,inputContract,outputContract);return <div className="b2-manager-row" key={r.value}><button type="button" onClick={()=>setResourceDialog(r)}><Database size={13}/><span><b>{r.label}</b><small>{r.type} · {r.dataType||''}{usage.length?\` · Used by \${usage.length}\`:' · Unused'}</small></span><ChevronRight size={12}/></button><button type="button" aria-label={\`Delete resource \${r.label}\`} onClick={()=>setResourceDelete({resource:r,usage})}><Trash2 size={12}/></button></div>})}</div>}
      </aside>:null}
      <main ref={canvasRef} className="b2-canvas" data-b2-panel tabIndex="-1">{layoutMode==='free'?<Builder2GraphCanvas nodes={nodes} edges={edges} onSelect={setSelected} onOpen={id=>setSelected(id)} onNodesChangeExternal={positions=>{setNodes(ns=>ns.map(n=>positions[n.id]?{...n,position:positions[n.id]}:n));setDirty(true)}} onEdgesChangeExternal={next=>{setEdges(next);setDirty(true)}} onInvalidConnection={message=>{setError(message);setSupportPanel('issues')}}/>:<><div className="b2-zoom"><button onClick={()=>setZoom(z=>Math.max(30,z-10))}><ZoomOut size={14}/></button><span>{zoom}%</span><button onClick={()=>setZoom(z=>Math.min(150,z+10))}><ZoomIn size={14}/></button><button type="button" className="b2-fit-flow" onClick={fitFlowToCanvas}>Fit</button></div><Builder2AutoLayout nodes={nodes} selected={selected} selectedMany={selectedMany} groups={groups} collapsed={branchCollapsed} onToggle={id=>setBranchCollapsed(x=>({...x,[id]:!x[id]}))} onCopy={duplicateNode} onDelete={removeNode} zoom={zoom} startConfig={startConfig} onStart={()=>setStartOpen(true)} onAdd={addToPath} onSelect={n=>{if(multiSelect){setSelectedMany(v=>v.includes(n.id)?v.filter(x=>x!==n.id):[...v,n.id]);return}selectCanvasNode(n.id)}}/></>} </main>
      <aside className="b2-properties" data-b2-panel tabIndex="-1"><header><div><b>{current?.label||'Properties'}</b><small>{current?current.type.replaceAll('_',' '):'Select an element'}</small></div>{current?<button onClick={()=>setSelected('')}><X size={16}/></button>:null}</header><Properties node={current} onPatch={patch} nodes={nodes} onAddBranch={addToPath} onSelectNode={id=>selectCanvasNode(id)} {...{objects,resources,actions,flowType,startConfig}} onNew={()=>setResourceDialog(true)}/></aside>
    </div>
    {selector?<div className="b2-selector"><header><div><h3>Add Element</h3><p>Select what the flow should do next.</p></div><button onClick={()=>setSelector(false)}><X size={18}/></button></header><label className="b2-selector-search"><Search size={15}/><input autoFocus value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search elements…"/></label><div className="b2-selector-body">{paletteGroups.map(g=><section key={g}><h4>{g}</h4><div>{filtered.filter(e=>e.category===g).map(e=><button key={e.key} onClick={()=>add(e)}><span>{g==='Logic'?<GitBranch/>:g==='Actions'?<Zap/>:<Database/>}</span><span><b>{e.label}</b><small>{e.description}</small></span></button>)}</div></section>)}</div></div>:null}
    {startOpen?<StartProperties value={startConfig} onChange={v=>{setStartConfig(v);setDirty(true)}} objects={objects} resources={resources} flowType={flowType} onClose={()=>setStartOpen(false)}/>:null}
    {flowPropsOpen?<div className="b2-modal-backdrop"><div className="b2-modal"><header><div><h3>Flow Properties</h3><p>Version properties and execution context.</p></div><button onClick={()=>setFlowPropsOpen(false)}><X size={18}/></button></header><div className="b2-form"><label>Flow Type<input value={FLOW_TYPES[flowType]?.label||flowType} disabled readOnly/></label><label>Label<input value={flowProps.label} onChange={e=>setFlowProps(p=>({...p,label:e.target.value}))}/></label><label>API Name<input value={flowProps.apiName} onChange={e=>setFlowProps(p=>({...p,apiName:e.target.value}))}/></label><label>Description<textarea rows={4} value={flowProps.description} onChange={e=>setFlowProps(p=>({...p,description:e.target.value}))}/></label><label>API Version<input value={flowProps.apiVersion} onChange={e=>setFlowProps(p=>({...p,apiVersion:e.target.value}))}/></label><label>Run Context<select value={flowProps.runContext} onChange={e=>setFlowProps(p=>({...p,runContext:e.target.value}))}><option value="default">Default</option><option value="user">User Context — Enforces User Permissions</option><option value="system">System Context</option></select></label></div><footer><button onClick={()=>setFlowPropsOpen(false)}>Cancel</button><button className="is-primary" onClick={()=>{setFlowPropsOpen(false);setDirty(true)}}>Done</button></footer></div></div>:null}
    {groupDialog?<GroupDialog onClose={()=>setGroupDialog(false)} onCreate={createGroup}/>:null}
    {actionEditing?<div className="b2-action-dialog b2-modal-backdrop"><div className="b2-modal"><header><div><h3>Action</h3><p>Configure the selected OneEngine metadata action.</p></div><button onClick={()=>setActionEditing('')}><X size={18}/></button></header><Properties node={nodes.find(n=>n.id===actionEditing)} onPatch={patch} nodes={nodes} onAddBranch={addToPath} onSelectNode={id=>{setActionEditing('');selectCanvasNode(id)}} {...{objects,resources,actions,flowType,startConfig}} onNew={()=>setResourceDialog(true)}/><footer><button onClick={()=>setActionEditing('')}>Cancel</button><button className="is-primary" onClick={()=>setActionEditing('')}>Done</button></footer></div></div>:null}
    {supportPanel==='history'?<div className="b2-drawer"><header><b>Edit History</b><button onClick={()=>setSupportPanel('')}><X size={16}/></button></header><div className="b2-history">{!editHistory.length?<p>No saved changes yet.</p>:editHistory.map(h=><div key={h.id} className={historyPreview===h.id?'is-selected':''}><Clock3 size={13}/><span><button className="b2-history-title" onClick={()=>setHistoryPreview(h.id)}><b>{h.label}</b><small>{new Date(h.at).toLocaleString()} · {h.nodes} elements</small></button>{historyPreview===h.id?<span className="b2-history-actions"><small>Added {h.summary?.added||0} · Edited {h.summary?.edited||0} · Deleted {h.summary?.deleted||0}</small><button onClick={()=>{setNodes(JSON.parse(JSON.stringify(h.snapshot||[])));setDirty(true);setSupportPanel('');setHistoryPreview('')}}>Restore</button><button onClick={()=>{setNodes(JSON.parse(JSON.stringify(h.snapshot||[])));saveDraft('Restored as new version');setSupportPanel('')}}>Save as New Version</button><button onClick={()=>{setNodes(JSON.parse(JSON.stringify(h.snapshot||[])));saveDraft('Restored as new flow');setSupportPanel('')}}>Save as New Flow</button></span>:null}</span></div>)}</div></div>:null}
    {supportPanel==='debug'?<FlowDebugPanel {...{workflowId,busy,setBusy,buildPayload,setError,setRuntimeMessage}} inputContract={workflowInputContract(inputContract,resources)} onClose={()=>setSupportPanel('')}/>:null}
    {supportPanel==='testmode'?<FlowTestPanel {...{workflowId,busy,setBusy,buildPayload,setError,setRuntimeMessage}} inputContract={workflowInputContract(inputContract,resources)} onClose={()=>setSupportPanel('')}/>:null}
    {supportPanel==='run'?<div className="b2-drawer"><header><b>Run Flow</b><button onClick={()=>setSupportPanel('')}><X size={16}/></button></header><div><p>Run the current flow version with the configured inputs.</p><button className="is-primary" disabled={!workflowId||busy} onClick={async()=>{setBusy(true);try{const r=await apiRequest(`/api/platform/rules/${workflowId}/run`,{method:'POST',body:JSON.stringify({})});const data=r?.data||r;setRuntimeMessage(data?.status?`Run v${data?.executionVersion||data?.run?.workflow_version||'?'}: ${data.status}`:'Run completed.')}catch(e){setError(e?.message||'Run failed')}finally{setBusy(false)}}}>Run</button></div></div>:null}
    {supportPanel==='tests'?<div className="b2-drawer"><header><b>Tests</b><button onClick={()=>setSupportPanel('')}><X size={16}/></button></header><div>{!flowTests.length?<p>No tests have been created for this draft.</p>:flowTests.map(t=><div key={t.id}><b>{t.label}</b><small>{t.description||'Flow test'}</small><button disabled={!workflowId||busy} onClick={async()=>{setBusy(true);try{await apiRequest(`/api/platform/rules/${workflowId}/debug`,{method:'POST',body:JSON.stringify({definition:buildPayload('DRAFT'),test:t})});setRuntimeMessage(`Test "${t.label}" completed.`)}catch(e){setError(e?.message||'Test failed')}finally{setBusy(false)}}}>Run</button><button onClick={()=>{setFlowTests(v=>v.filter(x=>x.id!==t.id));setDirty(true)}}>Delete</button></div>)}<button className="is-primary" onClick={()=>{const label=window.prompt('Test label');if(!label?.trim())return;const description=window.prompt('Test description (optional)')||'';setFlowTests(v=>[...v,{id:uid(),label:label.trim(),description}]);setDirty(true)}}>Create Test</button></div></div>:null}
    {shortcutsOpen?<div className="b2-modal-backdrop"><div className="b2-modal b2-shortcuts"><header><div><h3>Keyboard Shortcuts</h3><p>Workflow Builder navigation and editing shortcuts.</p></div><button aria-label="Close keyboard shortcuts" onClick={()=>setShortcutsOpen(false)}><X size={18}/></button></header><div className="b2-shortcut-grid"><span>Switch panel focus</span><kbd>F6</kbd><span>Open Toolbox search</span><kbd>Ctrl/Cmd + K</kbd><span>Save</span><kbd>Ctrl/Cmd + S</kbd><span>Copy / Cut / Paste</span><kbd>Ctrl/Cmd + C / X / V</kbd><span>Zoom in / out</span><kbd>Ctrl/Cmd + Alt + + / −</kbd><span>Reset zoom</span><kbd>Ctrl/Cmd + Alt + 0</kbd><span>Fit flow</span><kbd>Ctrl/Cmd + Alt + F</kbd><span>Move between Auto-Layout elements</span><kbd>Arrow keys</kbd><span>Delete selected element</span><kbd>Delete / Backspace</kbd><span>Show shortcuts</span><kbd>?</kbd></div><footer><button className="is-primary" onClick={()=>setShortcutsOpen(false)}>Done</button></footer></div></div>:null}
    {resourceDialog?<ResourceDialog resources={resources} initialResource={typeof resourceDialog==='object'?resourceDialog:null} onClose={()=>setResourceDialog(false)} onCreate={r=>{const previous=typeof resourceDialog==='object'?String(resourceDialog.apiName||resourceDialog.value||''):'';const renamed=previous&&previous!==r.apiName;setResources(x=>typeof resourceDialog==='object'?x.map(item=>item.value===resourceDialog.value?r:item):[...x,r]);if(renamed){setNodes(x=>replaceResourceReference(x,previous,r.apiName));setStartConfig(x=>replaceResourceReference(x,previous,r.apiName));setFlowTests(x=>replaceResourceReference(x,previous,r.apiName));setOutputContract(x=>replaceResourceReference(x,previous,r.apiName))}setInputContract(x=>workflowInputContract(replaceResourceReference(x.filter(input=>input.name!==previous),previous,r.apiName),[r]));setDirty(true);setResourceDialog(false)}}/>:null}
    {resourceDelete?<div className="b2-modal-backdrop"><div className="b2-modal"><header><div><h3>Delete Resource</h3><p>{resourceDelete.resource.label}</p></div><button onClick={()=>setResourceDelete(null)}><X size={18}/></button></header><div className="b2-form">{resourceDelete.usage.length?<div role="alert">This resource is referenced by {resourceDelete.usage.join(', ')}. Remove those references before deleting it.</div>:<p>This resource is unused and can be deleted safely.</p>}</div><footer><button onClick={()=>setResourceDelete(null)}>Cancel</button><button className="is-primary" disabled={resourceDelete.usage.length>0} onClick={()=>{const api=String(resourceDelete.resource.apiName||resourceDelete.resource.value||'');setResources(x=>x.filter(item=>item!==resourceDelete.resource));setInputContract(x=>x.filter(input=>input.name!==api));setOutputContract(x=>x.filter(output=>output.name!==api));setDirty(true);setResourceDelete(null)}}>Delete</button></footer></div></div>:null}
  </div>
}
