import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, Clock3, Copy, Database, Eye, GitBranch, Group, LayoutGrid, ListFilter, Monitor, MoreVertical, Plus, Redo2, Save, Search, Settings2, Trash2, Type, Undo2, Workflow, X, Zap, ZoomIn, ZoomOut } from 'lucide-react'
import { apiRequest } from '../../services/api'
import './Builder2Page.css'
import { FLOW_TYPES, RESOURCE_TYPES, automaticResources, elementAllowed, requiresRuntimeRecordEditor, validateDefinition } from './builder2Model'
import Builder2GraphCanvas from './Builder2GraphCanvas'

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
  ['TEXT_AREA','Long Text Area','Input','Collect multiple lines of text.'],
  ['EMAIL','Email','Input','Collect and validate an email address.'],
  ['PHONE','Phone','Input','Collect a phone number.'],
  ['PASSWORD','Password','Input','Collect masked text.'],
  ['NUMBER','Number','Input','Collect a numeric value.'],
  ['CURRENCY','Currency','Input','Collect a currency amount.'],
  ['DATE','Date','Input','Collect a date.'],
  ['TIME','Time','Input','Collect a time.'],
  ['DATETIME','Date & Time','Input','Collect a date and time.'],
  ['CHECKBOX','Checkbox','Input','Collect a true or false value.'],
  ['TOGGLE','Toggle','Input','Collect a true or false value with a switch.'],
  ['ADDRESS','Address','Input','Collect a structured address.'],
  ['SLIDER','Slider','Input','Collect a value from a numeric range.'],
  ['RECORD_PICKER','Record Picker','Input','Search and select a record.'],
  ['FILE_UPLOAD','File Upload','Input','Upload files to a target record.'],
  ['RADIO','Radio Buttons','Choice','Select one choice.'],
  ['CHECKBOX_GROUP','Checkbox Group','Choice','Select one or more choices.'],
  ['SELECT','Picklist','Choice','Select one choice from a list.'],
  ['MULTI_SELECT','Multi-Select Picklist','Choice','Select multiple choices.'],
  ['DATA_TABLE','Data Table','Display','Display or select records from a collection.'],
  ['IMAGE','Image','Display','Display an image.'],
  ['LINK','Link','Display','Display a link.'],
  ['PROGRESS','Progress Indicator','Display','Show the current flow stage.'],
  ['SECTION','Section','Layout','Group components in a collapsible section.'],
  ['COLUMNS','Columns','Layout','Arrange child components in columns.'],
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
const BUILDER_NATIVE_RUNTIME_TYPES=new Set(['GET_RECORDS','CREATE_RECORD','UPDATE_RECORD','BULK_UPDATE_RECORDS','DELETE_RECORD','ASSIGNMENT','CONDITION','LOOP','WAIT','WAIT_FOR_CONDITIONS','WAIT_UNTIL_DATE','RUN_SUBFLOW','COLLECTION_FILTER','COLLECTION_SORT','TRANSFORM','CUSTOM_ERROR','SCREEN','END'])
const OPERATOR_TO_BUILDER={equals:'Equals',not_equals:'Does Not Equal',is_empty:'Is Null',is_not_empty:'Is Null',changed:'Is Changed',greater_than:'Greater Than',greater_than_or_equal:'Greater Than or Equal',less_than:'Less Than',less_than_or_equal:'Less Than or Equal',contains:'Contains'}
const OPERATOR_TO_RUNTIME=Object.fromEntries(Object.entries(OPERATOR_TO_BUILDER).map(([key,value])=>[value,key]))
const conditionToBuilder=row=>({id:row?.id||uid(),resource:row?.field||row?.resource||'',operator:OPERATOR_TO_BUILDER[row?.operator]||row?.operator||'Equals',value:row?.operator==='is_not_empty'?'false':row?.operator==='is_empty'?'true':row?.value??''})
const conditionToRuntime=row=>{
  const operator=row?.operator==='Is Null'
    ? (String(row?.value||'true')==='false'?'is_not_empty':'is_empty')
    : OPERATOR_TO_RUNTIME[row?.operator]||String(row?.operator||'equals').toLowerCase().replaceAll(' ','_')
  return {field:row?.resource||row?.field||'',operator,...(!['is_empty','is_not_empty','changed'].includes(operator)?{value:row?.value??''}:{})}
}
const actionInputs=x=>Object.fromEntries(Object.entries(x||{}).filter(([key])=>!['id','label','apiName','api_name','description','key','type','_builder','_builderResource','faultMode','faultBranch','retryCount'].includes(key)))
const parseObjectText=(value='')=>{try{const parsed=JSON.parse(String(value||'{}'));return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{}}catch{return {}}}
const fieldRows=value=>Object.entries(value&&typeof value==='object'&&!Array.isArray(value)?value:{}).map(([field,rowValue])=>({id:uid(),field,value:rowValue}))
const fieldValueMap=(rows=[])=>Object.fromEntries(rows.filter(row=>row?.field).map(row=>[row.field,row.value]))
const assignmentOperatorToRuntime=value=>({'Equals':'set','Add':'add','Subtract':'subtract','Add Item':'append'}[String(value||'')]||'set')
const assignmentOperatorToBuilder=value=>({set:'Equals',add:'Add',subtract:'Subtract',append:'Add Item'}[String(value||'').toLowerCase()]||'Equals')
const resourceVariableType=(value,resources=[])=>{
  const resource=resources.find(item=>item.value===value||item.apiName===String(value||'').replace(/^variables\./,''))
  if(resource?.isCollection)return 'collection'
  const type=String(resource?.dataType||resource?.type||'text').toLowerCase()
  if(type.includes('number')||type.includes('currency')||type.includes('decimal'))return 'number'
  if(type.includes('bool'))return 'boolean'
  if(type.includes('date/time')||type.includes('datetime'))return 'datetime'
  if(type==='date')return 'date'
  if(type.includes('record'))return 'record'
  return 'text'
}
const waitParts=seconds=>{
  const total=Math.max(0,Number(seconds||0))
  if(total&&total%86400===0)return {amount:total/86400,unit:'days'}
  if(total&&total%3600===0)return {amount:total/3600,unit:'hours'}
  return {amount:Math.max(1,Math.round(total/60)||1),unit:'minutes'}
}
const branchTargets=(edges=[],sourceId,handle)=>edges.filter(edge=>String(edge.source)===String(sourceId)&&String(edge.sourceHandle||'default')===String(handle||'default')).map(edge=>String(edge.target)).filter(Boolean)
const runtimeActionToBuilderNode=x=>{
  const authored=x?._builder&&typeof x._builder==='object'?x._builder:null
  const rawType=String(x?.type||x?.key||'').toUpperCase()
  const base={id:x?.id||uid(),label:x?.label||x?.displayName||rawType||'Element',apiName:x?.apiName||x?.api_name||x?.id||rawType||'Element',description:x?.description||''}
  if(authored?.type)return {...base,type:authored.type,config:authored.config&&typeof authored.config==='object'?authored.config:{}}
  if(rawType==='CONDITION'){
    return {...base,type:'DECISION',config:{
      evaluation:'first',
      outcomes:(x?.outcomes||[]).map((outcome,index)=>({
        id:outcome?.id||uid(),label:outcome?.label||('Outcome '+(index+1)),apiName:outcome?.apiName||outcome?.id||('Outcome_'+(index+1)),
        conditionLogic:outcome?.condition?.match||'all',
        conditions:(outcome?.condition?.conditions||[]).map(conditionToBuilder),
        branch:Array.isArray(outcome?.branch)?outcome.branch:[],
      })),
      defaultOutcomeLabel:x?.defaultLabel||'Default Outcome',
      defaultBranch:Array.isArray(x?.defaultBranch)?x.defaultBranch:[],
    }}
  }
  if(rawType==='GET_RECORDS')return {...base,type:'GET_RECORDS',config:{objectKey:x.objectKey||x.object||'',conditionLogic:(x.filters||[]).length?(x.match||'all'):'none',conditions:(x.filters||[]).map(conditionToBuilder),sortOrder:x.sortDirection||'none',sortBy:x.sortField||'',limit:String(x.store||'first').toLowerCase()==='all'?(Number(x.limit||50)!==50?'limited':'all'):'first',maxRecords:x.limit||''}}
  if(rawType==='CREATE_RECORD')return {...base,type:'CREATE_RECORDS',config:{objectKey:x.objectKey||x.object||'',createCount:'one',valueMode:'manual',fieldValues:fieldRows(x.fieldValues)}}
  if(rawType==='UPDATE_RECORD')return {...base,type:'UPDATE_RECORDS',config:{objectKey:x.objectKey||x.object||'',updateMode:'record',sourceRecord:x.recordId||'',fieldValues:fieldRows(x.fieldValues)}}
  if(rawType==='BULK_UPDATE_RECORDS')return {...base,type:'UPDATE_RECORDS',config:{objectKey:x.objectKey||x.object||'',updateMode:'collection',sourceRecord:x.recordIds||'',fieldValues:fieldRows(x.fieldValues)}}
  if(rawType==='DELETE_RECORD')return {...base,type:'DELETE_RECORDS',config:{objectKey:x.objectKey||x.object||'',deleteMode:'record',sourceRecord:x.recordId||''}}
  if(rawType==='ASSIGNMENT'){
    const rows=Array.isArray(x.assignments)&&x.assignments.length?x.assignments:[{variable:'variables.'+(x.variableName||''),variableType:x.variableType||'text',operator:x.operator||'set',value:x.value}]
    return {...base,type:'ASSIGNMENT',config:{assignments:rows.map(row=>({id:uid(),resource:String(row.variable||'').startsWith('variables.')?row.variable:'variables.'+(row.variable||''),operator:assignmentOperatorToBuilder(row.operator),value:row.value??''}))}}
  }
  if(rawType==='LOOP')return {...base,type:'LOOP',config:{collection:x.collection||'',itemVariable:x.itemVariable||'',direction:String(x.iterationOrder||'FIRST_TO_LAST').toUpperCase()==='LAST_TO_FIRST'?'last':'first',bodyBranch:Array.isArray(x.bodyBranch)?x.bodyBranch:[]}}
  if(rawType==='COLLECTION_FILTER')return {...base,type:'COLLECTION_FILTER',config:{collection:x.collection||'',conditionLogic:x.match||'all',conditions:(x.filters||[]).map(conditionToBuilder)}}
  if(rawType==='COLLECTION_SORT')return {...base,type:'COLLECTION_SORT',config:{collection:x.collection||'',sortField:x.sortField||'',order:x.sortDirection||'asc',max:x.limit||''}}
  if(rawType==='WAIT')return {...base,type:'WAIT',config:{waitType:'duration',...waitParts(x.durationSeconds??x.waitSeconds)}}
  if(rawType==='WAIT_UNTIL_DATE')return {...base,type:'WAIT',config:{waitType:'date',dateResource:x.resumeAt||''}}
  if(rawType==='WAIT_FOR_CONDITIONS')return {...base,type:'WAIT',config:{waitType:'conditions',conditionLogic:x.waitCondition?.match||'all',conditions:(x.waitCondition?.conditions||[]).map(conditionToBuilder),pollSeconds:x.pollSeconds||60}}
  if(rawType==='TRANSFORM')return {...base,type:'TRANSFORM',config:{source:x.collection||'',mappingsText:JSON.stringify(x.transformMappings||{},null,2)}}
  if(rawType==='CUSTOM_ERROR')return {...base,type:'CUSTOM_ERROR',config:{location:x.errorField?'field':'record',field:x.errorField||'',message:x.errorMessage||''}}
  if(rawType==='RUN_SUBFLOW')return {...base,type:'SUBFLOW',config:{flow:x.workflowId||x.subflowId||'',inputs:x.inputs||x.workflowInputs||{},outputs:x.outputMappings||x.outputs||{}}}
  if(rawType==='SCREEN'){
    const screen=x.screen||{}
    const navigation=x.allowFinish===true?'finish':x.allowBack===false?'next':'both'
    return {...base,type:'SCREEN',config:{...screen,components:Array.isArray(screen.components)?screen.components:[],showFooter:x.showFooter!==false,navigation}}
  }
  const normalized=normalizeNodeType(rawType)
  if(!BUILDER_NATIVE_RUNTIME_TYPES.has(rawType)||requiresRuntimeRecordEditor(x)){
    const inputs=actionInputs(x)
    return {...base,type:'ACTION',config:{actionKey:rawType,inputs,inputsText:JSON.stringify(inputs,null,2)}}
  }
  return {...base,type:normalized,config:x?.config||actionInputs(x)}
}
const builderNodeToRuntimeAction=(node,{edges=[],resources=[]}={})=>{
  const p=node.config||{}
  const faultBranch=Array.isArray(p.faultBranch)&&p.faultBranch.length?p.faultBranch:branchTargets(edges,node.id,'fault')
  const base={id:node.id,label:node.label,apiName:node.apiName,description:node.description||'',_builder:{type:node.type,config:p},...(p.faultMode?{faultMode:p.faultMode,faultBranch,...(p.faultMode==='RETRY'?{retryCount:Number(p.retryCount||1)}:{})}:{})}
  if(node.type==='GET_RECORDS')return {...base,type:'GET_RECORDS',objectKey:p.objectKey,filters:p.conditionLogic==='none'?[]:(p.conditions||[]).filter(row=>row?.resource).map(conditionToRuntime),match:p.conditionLogic==='any'?'any':'all',sortField:p.sortBy||undefined,sortDirection:p.sortOrder&&p.sortOrder!=='none'?p.sortOrder:undefined,limit:p.limit==='limited'?Number(p.maxRecords||50):p.limit==='all'?50:1,store:p.limit==='first'||!p.limit?'first':'all'}
  if(node.type==='CREATE_RECORDS')return {...base,type:'CREATE_RECORD',objectKey:p.objectKey,fieldValues:fieldValueMap(p.fieldValues)}
  if(node.type==='UPDATE_RECORDS')return p.updateMode==='collection'
    ? {...base,type:'BULK_UPDATE_RECORDS',objectKey:p.objectKey,recordIds:p.sourceRecord,fieldValues:fieldValueMap(p.fieldValues)}
    : {...base,type:'UPDATE_RECORD',objectKey:p.objectKey,recordId:p.sourceRecord,fieldValues:fieldValueMap(p.fieldValues)}
  if(node.type==='DELETE_RECORDS')return {...base,type:'DELETE_RECORD',objectKey:p.objectKey,recordId:p.sourceRecord}
  if(node.type==='ASSIGNMENT'){
    const rows=p.assignments?.length?p.assignments:[{resource:p.resource||'',operator:p.operator||'Equals',value:p.value||''}]
    return {...base,type:'ASSIGNMENT',assignments:rows.filter(row=>row.resource).map(row=>({variable:String(row.resource||'').startsWith('variables.')?row.resource:'variables.'+(row.resource||''),variableType:resourceVariableType(row.resource,resources),operator:assignmentOperatorToRuntime(row.operator),value:row.value}))}
  }
  if(node.type==='DECISION')return {...base,type:'CONDITION',outcomes:(p.outcomes||[]).map((outcome,index)=>({id:outcome.id||('outcome-'+(index+1)),label:outcome.label||('Outcome '+(index+1)),condition:{match:outcome.conditionLogic==='any'?'any':'all',conditions:(outcome.conditions||[]).filter(row=>row?.resource).map(conditionToRuntime)},branch:Array.isArray(outcome.branch)&&outcome.branch.length?outcome.branch:branchTargets(edges,node.id,'outcome:'+(outcome.id||index))})),defaultLabel:p.defaultOutcomeLabel||'Default Outcome',defaultBranch:Array.isArray(p.defaultBranch)&&p.defaultBranch.length?p.defaultBranch:branchTargets(edges,node.id,'default')}
  if(node.type==='LOOP')return {...base,type:'LOOP',collection:p.collection,itemVariable:p.itemVariable||(node.apiName||'Loop')+'_Item',iterationOrder:p.direction==='last'?'LAST_TO_FIRST':'FIRST_TO_LAST',bodyBranch:Array.isArray(p.bodyBranch)&&p.bodyBranch.length?p.bodyBranch:branchTargets(edges,node.id,'body')}
  if(node.type==='COLLECTION_FILTER')return {...base,type:'COLLECTION_FILTER',collection:p.collection,filters:(p.conditions||[]).filter(row=>row?.resource).map(conditionToRuntime),match:p.conditionLogic==='any'?'any':'all'}
  if(node.type==='COLLECTION_SORT')return {...base,type:'COLLECTION_SORT',collection:p.collection,sortField:p.sortField,sortDirection:p.order||'asc',limit:Number(p.max||0)}
  if(node.type==='WAIT'){
    if(p.waitType==='date')return {...base,type:'WAIT_UNTIL_DATE',resumeAt:p.dateResource}
    if(p.waitType==='conditions')return {...base,type:'WAIT_FOR_CONDITIONS',waitCondition:{match:p.conditionLogic==='any'?'any':'all',conditions:(p.conditions||[]).filter(row=>row?.resource).map(conditionToRuntime)},pollSeconds:Number(p.pollSeconds||60)}
    const seconds=Math.max(0,Number(p.amount||0))*(p.unit==='days'?86400:p.unit==='hours'?3600:60)
    return {...base,type:'WAIT',durationSeconds:seconds}
  }
  if(node.type==='TRANSFORM')return {...base,type:'TRANSFORM',collection:p.source,transformMappings:parseObjectText(p.mappingsText)}
  if(node.type==='CUSTOM_ERROR')return {...base,type:'CUSTOM_ERROR',errorMessage:p.message,errorField:p.location==='field'?p.field:undefined}
  if(node.type==='SUBFLOW')return {...base,type:'RUN_SUBFLOW',workflowId:p.flow,inputs:p.inputs||parseObjectText(p.inputsText),outputMappings:p.outputs||parseObjectText(p.outputsText)}
  if(node.type==='SCREEN')return {...base,type:'SCREEN',screen:{...p,label:node.label,apiName:node.apiName,components:(p.components||[]).map(item=>({...item,name:item.name||item.apiName||item.id}))},allowBack:p.navigation!=='next'&&p.navigation!=='finish',allowNext:p.navigation!=='finish',allowFinish:p.navigation==='finish',allowPause:p.allowPause===true,showFooter:p.showFooter!==false}
  if(node.type==='ACTION'){
    let inputs=p.inputs&&typeof p.inputs==='object'?p.inputs:{}
    if(String(p.inputsText||'').trim()){
      try{inputs=JSON.parse(p.inputsText)}catch{throw new Error((node.label||'Action')+' has invalid Input Values JSON')}
    }
    return {...base,type:p.actionKey,...inputs}
  }
  return {...base,type:node.type,...p}
}
const resourceNameOf=resource=>String(resource?.apiName||resource?.label||resource?.value||'').replace(/^variables\./,'').trim()
const resourceTypeOf=resource=>{
  const type=String(resource?.dataType||'Text').toLowerCase()
  if(type.includes('number')||type.includes('currency')||type.includes('decimal'))return 'number'
  if(type.includes('bool'))return 'boolean'
  if(type.includes('date/time')||type.includes('datetime'))return 'datetime'
  if(type==='date')return 'date'
  if(type.includes('record'))return 'record'
  return 'text'
}
const serializeResourcePrelude=(resources=[])=>resources.flatMap(resource=>{
  const name=resourceNameOf(resource)
  if(!name)return []
  const common={id:'resource:'+name,label:resource.label||name,apiName:name,_builderResource:true}
  if(resource.type==='Variable'&&resource.defaultValue!=='')return [{...common,type:'ASSIGNMENT',assignments:[{variable:'variables.'+name,variableType:resource.isCollection?'collection':resourceTypeOf(resource),operator:'set',value:resource.defaultValue}]}]
  if(resource.type==='Constant')return [{...common,type:'CONSTANT',resourceName:name,resourceType:resourceTypeOf(resource),value:resource.defaultValue}]
  if(resource.type==='Formula')return [{...common,type:'FORMULA',resourceName:name,resultType:resourceTypeOf(resource),expression:String(resource.defaultValue||''),inputs:resource.inputs||{}}]
  if(resource.type==='Text Template')return [{...common,type:'TEXT_TEMPLATE',resourceName:name,templateText:String(resource.defaultValue||'')}]
  if(resource.type==='Choice')return [{...common,type:'CHOICE',resourceName:name,choiceLabel:resource.label||name,choiceValue:resource.defaultValue,choiceDataType:resourceTypeOf(resource)}]
  if(resource.type==='Record Choice Set'&&resource.objectKey&&resource.labelPath&&resource.valuePath)return [{...common,type:'RECORD_CHOICE_SET',resourceName:name,object:resource.objectKey,choiceLabelField:resource.labelPath,choiceValueField:resource.valuePath,limit:Math.max(1,Math.min(Number(resource.limit||50),200))}]
  if(resource.type==='Collection Choice Set'&&resource.defaultValue&&resource.labelPath&&resource.valuePath)return [{...common,type:'COLLECTION_CHOICE_SET',resourceName:name,collection:resource.defaultValue,choiceLabelPath:resource.labelPath,choiceValuePath:resource.valuePath}]
  if(resource.type==='Picklist Choice Set'&&resource.objectKey&&resource.defaultValue)return [{...common,type:'PICKLIST_CHOICE_SET',resourceName:name,object:resource.objectKey,fieldApiName:resource.defaultValue}]
  if(resource.type==='Stage')return [{...common,type:'STAGE',resourceName:name,stageLabel:resource.stageLabel||resource.label||name,stageValue:name,stageOrder:Math.max(1,Number(resource.defaultValue||1))}]
  return []
})
const workflowInputContract=(resources=[])=>resources.filter(resource=>resource.type==='Variable'&&resource.availableInput===true).map(resource=>({name:resourceNameOf(resource),label:resource.label||resourceNameOf(resource),type:resource.isCollection?'collection':resourceTypeOf(resource),required:false}))
const workflowOutputContract=(resources=[])=>resources.filter(resource=>resource.type==='Variable'&&resource.availableOutput===true).map(resource=>({name:resourceNameOf(resource),label:resource.label||resourceNameOf(resource),type:resource.isCollection?'collection':resourceTypeOf(resource)}))
const recordStartFromTrigger=(triggerKey='',objectKey='',action={})=>{
  const key=String(triggerKey||'').toLowerCase()
  const trigger=key.includes('delete')?'deleted':key.includes('create')&&!key.includes('update')?'created':key.includes('update')&&!key.includes('create')?'updated':'created_or_updated'
  return {objectKey,trigger,conditionLogic:action.match||'all',conditions:[],optimize:key.startsWith('before_')||key==='before_save'?'fast':'actions'}
}

function ResourcePicker({objects, objectKey, value, onChange, resources, onNew, flowType='record', startConfig={}}) {
  const [open,setOpen]=useState(false), [search,setSearch]=useState(''), [trail,setTrail]=useState([]), [childFields,setChildFields]=useState([])
  const object=objects.find(o=>keyOf(o)===objectKey)
  const automatic=automaticResources(flowType,startConfig)
  const rootRows=[...automatic,...resources.map(resource=>({...resource,children:resource.children===true||String(resource.dataType||'').toLowerCase()==='record'}))]
  const childRoot=trail.length?rootRows.find(r=>r.label===trail[0]):null
  const childObjectKey=childRoot?.objectKey||(['$record','$previous'].includes(childRoot?.value)?objectKey:'')
  useEffect(()=>{let live=true;const childObject=objects.find(o=>keyOf(o)===childObjectKey);if(!childRoot?.children||!childObject?.id){setChildFields([]);return()=>{live=false}};apiRequest(`/api/platform/objects/${encodeURIComponent(childObject.id)}/fields`).then(result=>{if(live)setChildFields((Array.isArray(result?.data)?result.data:[]).filter(field=>field?.active!==false))}).catch(()=>{if(live)setChildFields([])});return()=>{live=false}},[childRoot?.value,childRoot?.children,childObjectKey,objects])
  const metadataChildren=childRoot?childFields.map(field=>{const key=field.api_name||field.apiName||field.field_key||field.key||field.id;return {value:`${childRoot.value}.${key}`,label:field.label||field.name||key,type:field.field_type||field.type||'Field',leaf:true}}):[]
  const childRows=childRoot?[{value:childRoot.value,label:`${childRoot.label} (Entire Record)`,type:childRoot.type,leaf:true},...metadataChildren,...resources.filter(r=>String(r.value||'').startsWith(`${childRoot.value}.`))]:[]
  const rows=(trail.length?childRows:rootRows).filter(r=>!search||[r.label,r.value,r.type].filter(Boolean).join(' ').toLowerCase().includes(search.toLowerCase()))
  const selected=[...automatic,...resources,...metadataChildren].find(r=>r.value===value)
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

function ResourceDialog({onClose,onCreate,objects=[]}) {
  const [type,setType]=useState('Variable'),[name,setName]=useState(''),[dataType,setDataType]=useState('Text'),[value,setValue]=useState(''),[isCollection,setIsCollection]=useState(false),[availableInput,setAvailableInput]=useState(false),[availableOutput,setAvailableOutput]=useState(false),[objectKey,setObjectKey]=useState(''),[labelPath,setLabelPath]=useState(''),[valuePath,setValuePath]=useState(''),[formulaInputs,setFormulaInputs]=useState('{}'),[limit,setLimit]=useState(50)
  const objectOptions=objects.map(o=>({key:keyOf(o),label:labelOf(o)})).filter(o=>o.key)
  const typedOptions=type==='Variable'?['Text','Number','Currency','Boolean','Date','Date/Time','Record']:type==='Constant'||type==='Formula'?['Text','Number','Currency','Boolean','Date','Date/Time']:['Text']
  return <div className="b2-modal-backdrop"><div className="b2-modal"><header><div><h3>New Resource</h3><p>Create a resource for this flow.</p></div><button onClick={onClose}><X size={18}/></button></header>
    <div className="b2-form">
      <label>Resource Type<select value={type} onChange={e=>setType(e.target.value)}>{TYPES.map(x=><option key={x}>{x}</option>)}</select></label>
      <label>API Name<input value={name} onChange={e=>setName(e.target.value)} placeholder="Resource_API_Name"/></label>
      {['Variable','Constant','Formula'].includes(type)?<label>Data Type<select value={dataType} onChange={e=>setDataType(e.target.value)}>{typedOptions.map(option=><option key={option}>{option}</option>)}</select></label>:null}
      {type==='Variable'?<><label className="b2-check"><input type="checkbox" checked={isCollection} onChange={e=>setIsCollection(e.target.checked)}/> Allow multiple values (collection)</label><label className="b2-check"><input type="checkbox" checked={availableInput} onChange={e=>setAvailableInput(e.target.checked)}/> Available for input</label><label className="b2-check"><input type="checkbox" checked={availableOutput} onChange={e=>setAvailableOutput(e.target.checked)}/> Available for output</label>{dataType==='Record'?<label>Object<ObjectSearchPicker objects={objects} value={objectKey} onChange={setObjectKey}/></label>:null}</>:null}
      {type==='Formula'?<><label>Formula<textarea value={value} onChange={e=>setValue(e.target.value)} rows={6} placeholder="Example: price * quantity"/></label><label>Named Inputs (JSON)<textarea value={formulaInputs} onChange={e=>setFormulaInputs(e.target.value)} rows={4} placeholder={'{"price":"$record.price","quantity":"variables.qty"}'}/></label></>:type==='Text Template'?<label>Body<textarea value={value} onChange={e=>setValue(e.target.value)} rows={8} placeholder="Enter text and {!$Record.Field} merge resources…"/></label>:type==='Choice'?<label>Choice Value<input value={value} onChange={e=>setValue(e.target.value)} placeholder="Stored value"/></label>:type==='Record Choice Set'?<><label>Object<ObjectSearchPicker objects={objects} value={objectKey} onChange={setObjectKey}/></label><label>Choice Label Field<input value={labelPath} onChange={e=>setLabelPath(e.target.value)} placeholder="name"/></label><label>Choice Value Field<input value={valuePath} onChange={e=>setValuePath(e.target.value)} placeholder="id"/></label><label>Maximum Choices<input type="number" min="1" max="200" value={limit} onChange={e=>setLimit(Number(e.target.value)||50)}/></label></>:type==='Collection Choice Set'?<><label>Collection Resource<input value={value} onChange={e=>setValue(e.target.value)} placeholder="variables.records"/></label><label>Choice Label Path<input value={labelPath} onChange={e=>setLabelPath(e.target.value)} placeholder="name"/></label><label>Choice Value Path<input value={valuePath} onChange={e=>setValuePath(e.target.value)} placeholder="id"/></label></>:type==='Picklist Choice Set'?<><label>Object<ObjectSearchPicker objects={objects} value={objectKey} onChange={setObjectKey}/></label><label>Picklist Field API Name<input value={value} onChange={e=>setValue(e.target.value)} placeholder="status"/></label></>:type==='Stage'?<><label>Stage Label<input value={labelPath} onChange={e=>setLabelPath(e.target.value)} placeholder="Stage label"/></label><label>Stage Order<input type="number" min="1" value={value} onChange={e=>setValue(e.target.value)}/></label></>:<label>Default Value<input value={value} onChange={e=>setValue(e.target.value)}/></label>}
    </div><footer><button onClick={onClose}>Cancel</button><button className="is-primary" disabled={!name.trim()} onClick={()=>onCreate({value:`variables.${name.trim()}`,apiName:name.trim(),label:name.trim(),type,dataType,defaultValue:value,isCollection,availableInput,availableOutput,objectKey,labelPath,valuePath,limit,inputs:parseObjectText(formulaInputs),stageLabel:labelPath||name.trim(),children:dataType==='Record'})}>Done</button></footer>
  </div></div>
}

function MetadataFieldPicker({objects=[],objectKey='',value,onChange,placeholder='Select a field…'}) {
  const [fields,setFields]=useState([]),[loading,setLoading]=useState(false)
  const object=objects.find(o=>keyOf(o)===objectKey)
  const objectId=object?.id||''
  useEffect(()=>{let live=true;if(!objectId){setFields([]);return()=>{live=false}};setLoading(true);apiRequest(`/api/platform/objects/${encodeURIComponent(objectId)}/fields`).then(r=>{if(live)setFields((Array.isArray(r?.data)?r.data:[]).filter(x=>x?.active!==false))}).catch(()=>{if(live)setFields([])}).finally(()=>{if(live)setLoading(false)});return()=>{live=false}},[objectId])
  return <select value={value||''} disabled={!objectKey||loading} onChange={e=>onChange(e.target.value)}><option value="">{loading?'Loading fields…':objectKey?placeholder:'Select an object first'}</option>{fields.map(field=>{const key=field.api_name||field.apiName||field.field_key||field.key||field.id;return <option key={key} value={key}>{field.label||field.name||key}</option>})}</select>
}

function Conditions({value=[],onChange,resources=[],objects=[],objectKey='',onNew=()=>{},flowType='record',startConfig={},pathMode=false,allowChanged=false}) {
  const rows=value.length?value:[{id:uid(),resource:'',operator:'Equals',value:''}]
  const patch=(id,p)=>onChange(rows.map(r=>r.id===id?{...r,...p}:r))
  return <div className="b2-condition-block">{rows.map((r,i)=><div className="b2-condition" key={r.id}><span>{i+1}</span>{pathMode||String(r.resource||'').startsWith('steps.')||String(r.resource||'').startsWith('variables.')?<input value={r.resource||''} onChange={e=>patch(r.id,{resource:e.target.value})} placeholder="Field or resource path"/>:<MetadataFieldPicker objects={objects} objectKey={objectKey} value={r.resource} onChange={v=>patch(r.id,{resource:v})}/>} <select value={r.operator} onChange={e=>patch(r.id,{operator:e.target.value})}><option>Equals</option><option>Does Not Equal</option><option>Is Null</option>{allowChanged?<option>Is Changed</option>:null}<option>Greater Than</option><option>Greater Than or Equal</option><option>Less Than</option><option>Less Than or Equal</option><option>Contains</option></select>{r.operator==='Is Null'?<select value={String(r.value||'false')} onChange={e=>patch(r.id,{value:e.target.value})}><option value="false">False</option><option value="true">True</option></select>:<input value={r.value} onChange={e=>patch(r.id,{value:e.target.value})} placeholder="Value"/>}<button onClick={()=>onChange(rows.filter(x=>x.id!==r.id))}><Trash2 size={13}/></button></div>)}<button className="b2-text-action" onClick={()=>onChange([...rows,{id:uid(),resource:'',operator:'Equals',value:''}])}><Plus size={13}/> Add Condition</button></div>
}

function ActionPicker({actions=[],value,onChange}) {
  const [open,setOpen]=useState(false), [query,setQuery]=useState('')
  const selected=actions.find(a=>String(a.key)===String(value))
  const rows=actions.filter(a=>!query||[a.displayName,a.label,a.key,a.category,a.description].filter(Boolean).join(' ').toLowerCase().includes(query.toLowerCase()))
  return <div className="b2-action-picker">
    <button type="button" className="b2-combobox" onClick={()=>setOpen(v=>!v)}><span>{selected?.displayName||selected?.label||selected?.key||'Select an action…'}</span><ChevronDown size={14}/></button>
    {open?<div className="b2-action-menu"><label className="b2-resource-search"><Search size={14}/><input autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search actions…"/></label><div className="b2-action-results">{!rows.length?<div className="b2-empty-small">No matching actions</div>:rows.map(a=><button type="button" key={a.key} onClick={()=>{onChange(a.key);setOpen(false);setQuery('')}}><span className="b2-resource-icon"><Zap size={14}/></span><span><b>{a.displayName||a.label||a.key}</b><small>{a.category||'Action'}{a.description?' · '+a.description:''}</small></span></button>)}</div></div>:null}
  </div>
}
function SubflowPicker({flows=[],value,onChange}) {
  const [open,setOpen]=useState(false), [query,setQuery]=useState('')
  const selected=flows.find(flow=>String(flow.apiName)===String(value)||String(flow.id)===String(value))
  const rows=flows.filter(flow=>!query||[flow.label,flow.apiName,flow.description].filter(Boolean).join(' ').toLowerCase().includes(query.toLowerCase()))
  return <div className="b2-action-picker">
    <button type="button" className="b2-combobox" onClick={()=>setOpen(v=>!v)}><span>{selected?.label||value||'Select a subflow…'}</span><ChevronDown size={14}/></button>
    {open?<div className="b2-action-menu"><label className="b2-resource-search"><Search size={14}/><input autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search subflows…"/></label><div className="b2-action-results">{!rows.length?<div className="b2-empty-small">No matching active autolaunched flows</div>:rows.map(flow=><button type="button" key={flow.id||flow.apiName} onClick={()=>{onChange(flow.id);setOpen(false);setQuery('')}}><span className="b2-resource-icon"><Workflow size={14}/></span><span><b>{flow.label}</b><small>{flow.apiName}{flow.description?' · '+flow.description:''}</small></span></button>)}</div></div>:null}
  </div>
}
function ActionInputs({action,config,onPatch,resources,objects,objectKey,onNew,flowType,startConfig}) {
  const properties=action?.schema?.properties||{}, required=new Set(action?.schema?.required||[])
  const inputs=config.inputs&&typeof config.inputs==='object'?config.inputs:{}, modes=config.inputModes&&typeof config.inputModes==='object'?config.inputModes:{}
  const setInput=(name,value)=>onPatch({inputs:{...inputs,[name]:value}})
  const setMode=(name,mode)=>onPatch({inputModes:{...modes,[name]:mode},inputs:{...inputs,[name]:mode==='resource'?'':inputs[name]}})
  if(!Object.keys(properties).length)return <p className="b2-help">This action has no configurable inputs.</p>
  return <div className="b2-schema-fields">{Object.entries(properties).map(([name,spec])=>{const title=spec?.title||name.replace(/([A-Z])/g,' $1').replace(/^./,x=>x.toUpperCase());const mode=modes[name]||((typeof inputs[name]==='string'&&/^(?:\$|variables\.|steps\.)/.test(inputs[name]))?'resource':'literal');const value=inputs[name];return <fieldset key={name}><legend>{title}{required.has(name)?' *':''}</legend>{spec?.type!=='boolean'?<label className="b2-binding-mode">Value Source<select value={mode} onChange={e=>setMode(name,e.target.value)}><option value="literal">Literal Value</option><option value="resource">Resource</option></select></label>:null}{mode==='resource'?<ResourcePicker {...{resources,objects,objectKey,onNew,flowType,startConfig}} value={value||''} onChange={v=>setInput(name,v)}/>:Array.isArray(spec?.enum)?<select value={value??''} onChange={e=>setInput(name,e.target.value)}><option value="">Select…</option>{spec.enum.map(option=><option key={String(option)} value={option}>{String(option)}</option>)}</select>:spec?.type==='boolean'?<label className="b2-check"><input type="checkbox" checked={value===true} onChange={e=>setInput(name,e.target.checked)}/>{title}</label>:['number','integer'].includes(spec?.type)?<input type="number" value={value??''} onChange={e=>setInput(name,e.target.value===''?'':Number(e.target.value))}/>:['object','array'].includes(spec?.type)?<textarea rows={4} value={value?JSON.stringify(value,null,2):''} placeholder={spec.type==='array'?'[]':'{}'} onChange={e=>{try{setInput(name,e.target.value.trim()?JSON.parse(e.target.value):spec.type==='array'?[]:{})}catch{}}}/>:<input value={value??''} onChange={e=>setInput(name,e.target.value)}/>}</fieldset>})}</div>
}

function SubflowInputs({flow,config,onPatch,resources,objects,objectKey,onNew,flowType,startConfig}) {
  if(!flow)return null
  const inputs=config.inputs&&typeof config.inputs==='object'?config.inputs:{}, outputs=config.outputs&&typeof config.outputs==='object'?config.outputs:{}
  const inputContract=Array.isArray(flow.inputContract)?flow.inputContract:[], outputContract=Array.isArray(flow.outputContract)?flow.outputContract:[]
  return <div className="b2-schema-fields">{inputContract.length?<><h4>Input Values</h4>{inputContract.map(item=><fieldset key={item.name}><legend>{item.label||item.name}{item.required?' *':''}</legend><ResourcePicker {...{resources,objects,objectKey,onNew,flowType,startConfig}} value={inputs[item.name]||''} onChange={v=>onPatch({inputs:{...inputs,[item.name]:v}})}/></fieldset>)}</>:<p className="b2-help">This subflow has no declared input variables.</p>}{outputContract.length?<><h4>Output Values</h4>{outputContract.map(item=><fieldset key={item.name}><legend>{item.label||item.name}</legend><ResourcePicker {...{resources,objects,objectKey,onNew,flowType,startConfig}} value={outputs[item.name]||''} onChange={v=>onPatch({outputs:{...outputs,[item.name]:v}})}/></fieldset>)}</>:null}</div>
}

function NodeTargetSelect({nodes=[],currentId='',value,onChange,placeholder='Continue on the main path'}) {
  const currentIndex=nodes.findIndex(node=>node.id===currentId)
  const rows=nodes.filter((node,index)=>node.id!==currentId&&(currentIndex<0||index>currentIndex))
  return <select value={value||''} onChange={e=>onChange(e.target.value)}><option value="">{placeholder}</option>{rows.map(node=><option key={node.id} value={node.id}>{node.label} · {node.type.replaceAll('_',' ')}</option>)}</select>
}
function NodeTargetMultiSelect({nodes=[],currentId='',values=[],onChange,emptyLabel='No path steps selected'}) {
  const currentIndex=nodes.findIndex(node=>node.id===currentId)
  const rows=nodes.filter((node,index)=>node.id!==currentId&&(currentIndex<0||index>currentIndex))
  const selected=new Set((Array.isArray(values)?values:[]).map(String))
  const toggle=id=>onChange(selected.has(String(id))?(values||[]).filter(value=>String(value)!==String(id)):[...(values||[]),id])
  return <div className="b2-node-targets">{!rows.length?<span>{emptyLabel}</span>:rows.map(node=><label key={node.id}><input type="checkbox" checked={selected.has(String(node.id))} onChange={()=>toggle(node.id)}/><span><b>{node.label}</b><small>{node.type.replaceAll('_',' ')}</small></span></label>)}</div>
}
function Properties({node,onPatch,objects,resources,onNew,actions,subflows=[],nodes=[],flowType='record',startConfig={}}) {
  if(!node)return <div className="b2-properties-empty"><Settings2 size={26}/><b>Select an element</b><span>Its properties appear here.</span></div>
  const p=node.config||{}, patch=x=>onPatch({...node,config:{...p,...x}})
  const objectKey=p.objectKey||''
  const selectedAction=actions.find(action=>String(action.key)===String(p.actionKey||''))
  const selectedSubflow=subflows.find(flow=>String(flow.id)===String(p.flow||'')||String(flow.apiName)===String(p.flow||''))
  const faultCapable=['GET_RECORDS','CREATE_RECORDS','UPDATE_RECORDS','DELETE_RECORDS','ACTION','SUBFLOW'].includes(node.type)
  const common=<><label>Label<input value={node.label||''} onChange={e=>onPatch({...node,label:e.target.value})}/></label><label>API Name<input value={node.apiName||''} onChange={e=>onPatch({...node,apiName:e.target.value})}/></label><label>Description<textarea rows={3} value={node.description||''} onChange={e=>onPatch({...node,description:e.target.value})} placeholder="Describe this element…"/></label></>
  const object=<label>Object<ObjectSearchPicker objects={objects} value={objectKey} onChange={value=>patch({objectKey:value})}/></label>
  const cond=<><label>Condition Requirements<select value={p.conditionLogic||'all'} onChange={e=>patch({conditionLogic:e.target.value})}><option value="all">All Conditions Are Met (AND)</option><option value="any">Any Condition Is Met (OR)</option>{node.type==='GET_RECORDS'?<option value="none">None — Get All Records</option>:null}</select></label>{p.conditionLogic==='none'?null:<Conditions pathMode={node.type==='COLLECTION_FILTER'} value={p.conditions} onChange={v=>patch({conditions:v})} {...{resources,objects,objectKey,onNew,flowType,startConfig}}/>}</>
  return <div className="b2-form">{common}
    {['GET_RECORDS','CREATE_RECORDS','UPDATE_RECORDS','DELETE_RECORDS'].includes(node.type)?object:null}
    {['GET_RECORDS','COLLECTION_FILTER'].includes(node.type)?cond:null}
    {node.type==='CREATE_RECORDS'?<><p className="b2-help">Create Records currently creates one record per element. Use Loop + Create Records for collection creation.</p><div className="b2-condition-block">{(p.fieldValues||[{id:'field-1',field:'',value:''}]).map((row,i)=><div className="b2-condition" key={row.id||i}><span>{i+1}</span><MetadataFieldPicker objects={objects} objectKey={objectKey} value={row.field} onChange={v=>patch({fieldValues:(p.fieldValues||[{id:'field-1',field:'',value:''}]).map((x,j)=>j===i?{...x,field:v}:x)})}/><input value={row.value||''} onChange={e=>patch({fieldValues:(p.fieldValues||[{id:'field-1',field:'',value:''}]).map((x,j)=>j===i?{...x,value:e.target.value}:x)})} placeholder="Literal or resource"/><button onClick={()=>patch({fieldValues:(p.fieldValues||[]).filter((_,j)=>j!==i)})}><Trash2 size={13}/></button></div>)}<button className="b2-text-action" onClick={()=>patch({fieldValues:[...(p.fieldValues||[]),{id:uid(),field:'',value:''}]})}><Plus size={13}/> Add Field</button></div></>:null}
    {node.type==='GET_RECORDS'?<><label>Sort Order<select value={p.sortOrder||'none'} onChange={e=>patch({sortOrder:e.target.value})}><option value="none">Not Sorted</option><option value="asc">Ascending</option><option value="desc">Descending</option></select></label>{p.sortOrder&&p.sortOrder!=='none'?<label>Sort By<MetadataFieldPicker objects={objects} objectKey={objectKey} value={p.sortBy||''} onChange={v=>patch({sortBy:v})}/></label>:null}<label>How Many Records to Store<select value={p.limit||'first'} onChange={e=>patch({limit:e.target.value})}><option value="first">Only the first record</option><option value="all">All records</option><option value="limited">All records, up to a specified limit</option></select></label>{p.limit==='limited'?<label>Maximum Number of Records to Store<input type="number" min="2" max="20000" value={p.maxRecords||''} onChange={e=>patch({maxRecords:e.target.value})}/></label>:null}<label>How to Store Record Data<select value={p.store||'auto'} onChange={e=>patch({store:e.target.value,selectedFields:[],fieldAssignments:[]})}><option value="auto">Automatically store all fields</option><option value="choose">Choose fields and let OneEngine do the rest</option><option value="advanced">Choose fields and assign variables (advanced)</option></select></label>{p.store==='choose'?<div className="b2-condition-block">{(p.selectedFields||['']).map((field,i)=><div className="b2-condition" key={i}><span>{i+1}</span><MetadataFieldPicker objects={objects} objectKey={objectKey} value={field} onChange={v=>patch({selectedFields:(p.selectedFields||['']).map((x,j)=>j===i?v:x)})}/><button onClick={()=>patch({selectedFields:(p.selectedFields||[]).filter((_,j)=>j!==i)})}><Trash2 size={13}/></button></div>)}<button className="b2-text-action" onClick={()=>patch({selectedFields:[...(p.selectedFields||[]),'']})}><Plus size={13}/> Add Field</button></div>:null}{p.store==='advanced'?<div className="b2-condition-block">{(p.fieldAssignments||[{id:'assign-1',field:'',resource:''}]).map((row,i)=><div className="b2-condition" key={row.id||i}><span>{i+1}</span><MetadataFieldPicker objects={objects} objectKey={objectKey} value={row.field} onChange={v=>patch({fieldAssignments:(p.fieldAssignments||[{id:'assign-1',field:'',resource:''}]).map((x,j)=>j===i?{...x,field:v}:x)})}/><ResourcePicker {...{resources,objects,objectKey,onNew,flowType,startConfig}} value={row.resource||''} onChange={v=>patch({fieldAssignments:(p.fieldAssignments||[{id:'assign-1',field:'',resource:''}]).map((x,j)=>j===i?{...x,resource:v}:x)})}/><button onClick={()=>patch({fieldAssignments:(p.fieldAssignments||[]).filter((_,j)=>j!==i)})}><Trash2 size={13}/></button></div>)}<button className="b2-text-action" onClick={()=>patch({fieldAssignments:[...(p.fieldAssignments||[]),{id:uid(),field:'',resource:''}]})}><Plus size={13}/> Add Field Assignment</button></div>:null}</>:null}
    {node.type==='UPDATE_RECORDS'?<><label>Update Target<select value={p.updateMode||'record'} onChange={e=>patch({updateMode:e.target.value,sourceRecord:''})}><option value="record">One record resource or record ID</option><option value="collection">Record collection</option></select></label><label>{p.updateMode==='collection'?'Record Collection':'Record / Record ID'}<ResourcePicker {...{resources,objects,objectKey,onNew,flowType,startConfig}} value={p.sourceRecord||''} onChange={v=>patch({sourceRecord:v})}/></label><div className="b2-condition-block">{(p.fieldValues||[{id:'update-field-1',field:'',value:''}]).map((row,i)=><div className="b2-condition" key={row.id||i}><span>{i+1}</span><MetadataFieldPicker objects={objects} objectKey={objectKey} value={row.field} onChange={v=>patch({fieldValues:(p.fieldValues||[{id:'update-field-1',field:'',value:''}]).map((x,j)=>j===i?{...x,field:v}:x)})}/><input value={row.value||''} onChange={e=>patch({fieldValues:(p.fieldValues||[{id:'update-field-1',field:'',value:''}]).map((x,j)=>j===i?{...x,value:e.target.value}:x)})} placeholder="Literal or resource"/><button onClick={()=>patch({fieldValues:(p.fieldValues||[]).filter((_,j)=>j!==i)})}><Trash2 size={13}/></button></div>)}<button className="b2-text-action" onClick={()=>patch({fieldValues:[...(p.fieldValues||[]),{id:uid(),field:'',value:''}]})}><Plus size={13}/> Add Field</button></div></>:null}
    {node.type==='DELETE_RECORDS'?<label>Record / Record ID<ResourcePicker {...{resources,objects,objectKey,onNew,flowType,startConfig}} value={p.sourceRecord||''} onChange={v=>patch({sourceRecord:v})}/></label>:null}
    {node.type==='DECISION'?<><label>Outcome Evaluation<select value={p.evaluation||'first'} onChange={e=>patch({evaluation:e.target.value})}><option value="first">First outcome whose conditions are met</option></select></label><div className="b2-outcomes">{(p.outcomes||[{id:'outcome-1',label:'Outcome 1',apiName:'Outcome_1',conditionLogic:'all',conditions:[]}]).map((outcome,i)=><fieldset key={outcome.id||i}><legend>Outcome {i+1}</legend><label>Label<input value={outcome.label||''} onChange={e=>patch({outcomes:(p.outcomes||[]).map((x,j)=>j===i?{...x,label:e.target.value}:x)})}/></label><label>API Name<input value={outcome.apiName||''} onChange={e=>patch({outcomes:(p.outcomes||[]).map((x,j)=>j===i?{...x,apiName:e.target.value}:x)})}/></label><label>Condition Requirements<select value={outcome.conditionLogic||'all'} onChange={e=>patch({outcomes:(p.outcomes||[]).map((x,j)=>j===i?{...x,conditionLogic:e.target.value}:x)})}><option value="all">All Conditions Are Met (AND)</option><option value="any">Any Condition Is Met (OR)</option></select></label><Conditions pathMode value={outcome.conditions||[]} onChange={v=>patch({outcomes:(p.outcomes||[]).map((x,j)=>j===i?{...x,conditions:v}:x)})} {...{resources,objects,objectKey,onNew,flowType,startConfig}}/><label>Outcome Path<NodeTargetMultiSelect nodes={nodes} currentId={node.id} values={outcome.branch||[]} onChange={values=>patch({outcomes:(p.outcomes||[]).map((x,j)=>j===i?{...x,branch:values}:x)})}/></label><button type="button" className="b2-text-action" onClick={()=>patch({outcomes:(p.outcomes||[]).filter((_,j)=>j!==i)})}><Trash2 size={13}/> Remove Outcome</button></fieldset>)}</div><button type="button" className="b2-text-action" onClick={()=>patch({outcomes:[...(p.outcomes||[]),{id:uid(),label:`Outcome ${(p.outcomes||[]).length+1}`,apiName:`Outcome_${(p.outcomes||[]).length+1}`,conditionLogic:'all',conditions:[]}]})}><Plus size={13}/> New Outcome</button><label>Default Outcome Label<input value={p.defaultOutcomeLabel||'Default Outcome'} onChange={e=>patch({defaultOutcomeLabel:e.target.value})}/></label><label>Default Path<NodeTargetMultiSelect nodes={nodes} currentId={node.id} values={p.defaultBranch||[]} onChange={values=>patch({defaultBranch:values})}/></label></>:null}
    {node.type==='WAIT'?<><label>Wait Type<select value={p.waitType||'duration'} onChange={e=>patch({waitType:e.target.value})}><option value="duration">Wait for Amount of Time</option><option value="date">Wait Until Date</option><option value="conditions">Wait for Conditions</option></select></label>{p.waitType==='duration'||!p.waitType?<><label>Amount<input type="number" min="1" value={p.amount||''} onChange={e=>patch({amount:e.target.value})}/></label><label>Unit<select value={p.unit||'minutes'} onChange={e=>patch({unit:e.target.value})}><option value="minutes">Minutes</option><option value="hours">Hours</option><option value="days">Days</option></select></label></>:p.waitType==='date'?<label>Date/Time Resource<ResourcePicker {...{resources,objects,objectKey,onNew,flowType,startConfig}} value={p.dateResource||''} onChange={v=>patch({dateResource:v})}/></label>:<><Conditions pathMode value={p.conditions||[]} onChange={v=>patch({conditions:v})} {...{resources,objects,objectKey,onNew,flowType,startConfig}}/><label>Check Every (seconds)<input type="number" min="30" value={p.pollSeconds||60} onChange={e=>patch({pollSeconds:e.target.value})}/></label></>}</>:null}
    {node.type==='ASSIGNMENT'?<><div className="b2-assignment-list">{(p.assignments||[{id:'assignment-1',resource:p.resource||'',operator:p.operator||'Equals',value:p.value||''}]).map((row,i)=><fieldset key={row.id||i}><legend>Assignment {i+1}</legend><label>Variable<ResourcePicker {...{resources,objects,objectKey,onNew,flowType,startConfig}} value={row.resource||''} onChange={v=>patch({assignments:(p.assignments||[{id:'assignment-1',resource:p.resource||'',operator:p.operator||'Equals',value:p.value||''}]).map((x,j)=>j===i?{...x,resource:v}:x)})}/></label><label>Operator<select value={row.operator||'Equals'} onChange={e=>patch({assignments:(p.assignments||[]).map((x,j)=>j===i?{...x,operator:e.target.value}:x)})}><option>Equals</option><option>Add</option><option>Subtract</option><option>Add Item</option></select></label><label>Value<input value={row.value||''} onChange={e=>patch({assignments:(p.assignments||[]).map((x,j)=>j===i?{...x,value:e.target.value}:x)})}/></label><button type="button" className="b2-text-action" onClick={()=>patch({assignments:(p.assignments||[]).filter((_,j)=>j!==i)})}><Trash2 size={13}/> Remove</button></fieldset>)}</div><button type="button" className="b2-text-action" onClick={()=>patch({assignments:[...(p.assignments||[]),{id:uid(),resource:'',operator:'Equals',value:''}]})}><Plus size={13}/> Add Assignment</button></>:null}
    {node.type==='LOOP'?<><label>Collection Variable<ResourcePicker {...{resources,objects,objectKey,onNew,flowType,startConfig}} value={p.collection||''} onChange={v=>patch({collection:v})}/></label><label>Current Item Variable<input value={p.itemVariable||''} onChange={e=>patch({itemVariable:e.target.value})} placeholder="Current_Item"/></label><label>Direction<select value={p.direction||'first'} onChange={e=>patch({direction:e.target.value})}><option value="first">First item to last item</option><option value="last">Last item to first item</option></select></label><label>Loop Body<NodeTargetMultiSelect nodes={nodes} currentId={node.id} values={p.bodyBranch||[]} onChange={values=>patch({bodyBranch:values})}/></label></>:null}
    {node.type==='COLLECTION_FILTER'?<label>Collection<ResourcePicker {...{resources,objects,objectKey,onNew,flowType,startConfig}} value={p.collection||''} onChange={v=>patch({collection:v})}/></label>:null}
    {node.type==='COLLECTION_SORT'?<><label>Collection<ResourcePicker {...{resources,objects,objectKey,onNew,flowType,startConfig}} value={p.collection||''} onChange={v=>patch({collection:v})}/></label><label>Sort By Field<input value={p.sortField||''} onChange={e=>patch({sortField:e.target.value})} placeholder="Record field API name"/></label><label>Sort Order<select value={p.order||'asc'} onChange={e=>patch({order:e.target.value})}><option value="asc">Ascending</option><option value="desc">Descending</option></select></label><label>Maximum Items<input type="number" min="0" value={p.max||''} onChange={e=>patch({max:e.target.value})}/></label></>:null}
    {node.type==='TRANSFORM'?<div className="b2-transform"><div><b>Source Data</b><ResourcePicker {...{resources,objects,objectKey,onNew,flowType,startConfig}} value={p.source||''} onChange={v=>patch({source:v})}/></div><label>Field Mappings (JSON)<textarea rows={7} value={p.mappingsText||''} onChange={e=>patch({mappingsText:e.target.value})} placeholder={'{"TargetField":"item.SourceField"}'}/></label><p>Each key is a target path; each value can be an item path, resource, or literal.</p></div>:null}
    {node.type==='CUSTOM_ERROR'?<><label>Where to Show the Error<select value={p.location||'record'} onChange={e=>patch({location:e.target.value})}><option value="record">In a window on the record page</option><option value="field">Inline on a field</option></select></label>{p.location==='field'?<label>Field<ResourcePicker {...{resources,objects,objectKey,onNew,flowType,startConfig}} value={p.field||''} onChange={v=>patch({field:v})}/></label>:null}<label>Error Message<textarea rows={4} value={p.message||''} onChange={e=>patch({message:e.target.value})}/></label></>:null}
    {node.type==='ACTION'?<><label>Action<ActionPicker actions={actions} value={p.actionKey||''} onChange={actionKey=>patch({actionKey,inputs:{},inputModes:{}})}/></label>{p.actionKey?<ActionInputs action={selectedAction} config={p} onPatch={patch} {...{resources,objects,objectKey,onNew,flowType,startConfig}}/>:null}<p className="b2-help">Actions are loaded from OneEngine's workflow registry and saved with their executable runtime key.</p></>:null}
    {node.type==='SUBFLOW'?<><label>Subflow<SubflowPicker flows={subflows} value={p.flow||''} onChange={flow=>patch({flow,inputs:{},outputs:{}})}/></label><SubflowInputs flow={selectedSubflow} config={p} onPatch={patch} {...{resources,objects,objectKey,onNew,flowType,startConfig}}/></>:null}
    {faultCapable?<fieldset className="b2-fault-config"><legend>On Error</legend><label>Behaviour<select value={p.faultMode||'FAIL'} onChange={e=>patch({faultMode:e.target.value})}><option value="FAIL">Fail the flow</option><option value="CONTINUE">Continue</option><option value="STOP">Stop</option><option value="ROUTE">Route to error path</option><option value="RETRY">Retry, then route</option></select></label>{['ROUTE','RETRY'].includes(p.faultMode)?<><label>Error Path<NodeTargetMultiSelect nodes={nodes} currentId={node.id} values={p.faultBranch||[]} onChange={values=>patch({faultBranch:values})}/></label>{p.faultMode==='RETRY'?<label>Retry Count<input type="number" min="1" max="3" value={p.retryCount||1} onChange={e=>patch({retryCount:Number(e.target.value)})}/></label>:null}</>:null}</fieldset>:null}
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
    <label>Condition Requirements<select value={p.conditionLogic||'all'} onChange={e=>patch({conditionLogic:e.target.value})}><option value="all">All Conditions Are Met (AND)</option><option value="any">Any Condition Is Met (OR)</option><option value="none">None — Always Run</option></select></label>
    {p.conditionLogic==='none'?null:<Conditions allowChanged value={p.conditions} onChange={conditions=>patch({conditions})} resources={[]} objects={objects} objectKey={p.objectKey||''} onNew={()=>{}} flowType={flowType} startConfig={p}/>}
    {['updated','created_or_updated'].includes(p.trigger||'created_or_updated')?<label>When to Run for Updated Records<select value={p.updateMode||'every'} onChange={e=>patch({updateMode:e.target.value})}><option value="every">Every time a record is updated and meets the condition requirements</option><option value="transition">Only when a record is updated to meet the condition requirements</option></select></label>:null}
    {p.trigger==='deleted'?<p className="b2-help">Deleted-record flows run after the record is deleted.</p>:<fieldset><legend>Optimize the Flow For</legend><label className="b2-radio"><input type="radio" checked={(p.optimize||'actions')==='fast'} onChange={()=>patch({optimize:'fast'})}/>Fast Field Updates</label><label className="b2-radio"><input type="radio" checked={(p.optimize||'actions')==='actions'} onChange={()=>patch({optimize:'actions'})}/>Actions and Related Records</label></fieldset>}
  </div></div>
}

function ScreenEditor({node,onPatch,onClose,resources=[],objects=[],objectKey='',onNewResource=()=>{}}) {
  const [selected,setSelected]=useState(''),[search,setSearch]=useState(''),[side,setSide]=useState('properties')
  const config=node.config||{}, components=Array.isArray(config.components)?config.components:[]
  const selectedComponent=components.find(item=>item.id===selected)
  const patchConfig=patch=>onPatch({...node,config:{...config,...patch}})
  const patchComponent=patch=>patchConfig({components:components.map(item=>item.id===selected?{...item,...patch}:item)})
  const inputTypes=new Set(['TEXT','TEXT_AREA','EMAIL','PHONE','PASSWORD','NUMBER','CURRENCY','DATE','TIME','DATETIME','CHECKBOX','TOGGLE','ADDRESS','SLIDER','RECORD_PICKER','FILE_UPLOAD','RADIO','CHECKBOX_GROUP','SELECT','MULTI_SELECT','DATA_TABLE'])
  const screenResources=[...resources,...components.filter(item=>inputTypes.has(item.type)&&item.id!==selected).map(item=>({value:'variables.'+(item.name||item.apiName||item.id),apiName:item.name||item.apiName||item.id,label:item.label||item.name||item.apiName,type:'Screen Component',dataType:'Text'}))]
  const add=definition=>{
    const [type,label]=definition,index=components.length+1,name=type+'_'+index
    const item={id:uid(),type,label,apiName:name,name,required:false,width:'full',input:inputTypes.has(type),visibilityOperator:'truthy',options:[],columnCount:2,columnGap:'standard',selectionMode:'single',min:0,max:100,step:1,maxFiles:1,searchMinChars:2,showStageLabels:true}
    patchConfig({components:[...components,item]});setSelected(item.id);setSide('properties')
  }
  const palette=SCREEN_COMPONENTS.filter(item=>!search||item.join(' ').toLowerCase().includes(search.toLowerCase()))
  const widthPercent=value=>value==='1/2'?50:value==='1/3'?33.333:value==='2/3'?66.667:100
  const choiceTypes=['RADIO','CHECKBOX_GROUP','SELECT','MULTI_SELECT']
  const compareVisibility=['equals','not_equals','contains','not_contains','greater_than','greater_or_equal','less_than','less_or_equal']
  const containers=components.filter(item=>['SECTION','COLUMNS'].includes(item.type)&&item.id!==selected)
  const optionsText=(selectedComponent?.options||[]).map(option=>typeof option==='object'?(String(option.label??option.value)+' | '+String(option.value??option.label)):String(option)).join('\n')
  const updateOptions=text=>patchComponent({options:text.split('\n').map(line=>line.trim()).filter(Boolean).map(line=>{const parts=line.split('|');const label=String(parts[0]||'').trim();const value=String(parts[1]??parts[0]??'').trim();return {label,value}})})
  const removeSelected=()=>{
    if(!selected)return
    patchConfig({components:components.filter(item=>item.id!==selected).map(item=>item.layoutParentId===selected?{...item,layoutParentId:'',layoutColumn:1}:item)})
    setSelected('')
  }
  const moveSelected=delta=>{
    const index=components.findIndex(item=>item.id===selected),target=index+delta
    if(index<0||target<0||target>=components.length)return
    const next=[...components],[item]=next.splice(index,1);next.splice(target,0,item);patchConfig({components:next})
  }
  const preview=item=>{
    if(item.type==='DISPLAY_TEXT')return <p>{item.text||'Display text'}</p>
    if(item.type==='IMAGE')return <div className="b2-screen-input">Image · {item.source||'Choose source'}</div>
    if(item.type==='LINK')return <div className="b2-screen-input">Link · {item.href||'Choose URL'}</div>
    if(item.type==='PROGRESS')return <div className="b2-screen-input">Progress · {item.progressStyle||'path'}</div>
    if(item.type==='SECTION')return <div className="b2-screen-section"><span>{item.heading||item.label}</span><small>{components.filter(child=>child.layoutParentId===item.id).length} components</small></div>
    if(item.type==='COLUMNS')return <div className="b2-screen-section">{Array.from({length:Number(item.columnCount||2)}).map((_,index)=><span key={index}>Column {index+1}</span>)}</div>
    if(['CHECKBOX','TOGGLE'].includes(item.type))return <span className="b2-screen-checkbox">□ {item.toggleLabel||item.placeholder||item.label}</span>
    if(item.type==='FILE_UPLOAD')return <div className="b2-screen-input">Choose file…</div>
    if(item.type==='DATA_TABLE')return <div className="b2-screen-input">Data Table · {item.dataResource||'Choose collection'}</div>
    if(item.type==='RECORD_PICKER')return <div className="b2-screen-input">Search records…</div>
    if(choiceTypes.includes(item.type))return <div className="b2-screen-input">{(item.options||[]).length?String((item.options||[])[0]?.label||(item.options||[])[0]):'Choose options…'}</div>
    return <div className="b2-screen-input">{item.placeholder||item.label}</div>
  }
  return <div className="b2-screen-editor">
    <header className="b2-screen-top"><div><button onClick={onClose}><ChevronLeft size={16}/></button><span><b>{node.label}</b><small>Screen</small></span></div><div><button className={side==='properties'?'is-active':''} onClick={()=>setSide('properties')}>Properties</button><button className={side==='style'?'is-active':''} onClick={()=>setSide('style')}>Style</button><button className="is-primary" onClick={onClose}>Done</button></div></header>
    <div className="b2-screen-grid">
      <aside className="b2-screen-palette"><label className="b2-search"><Search size={14}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search components…"/></label>{['Input','Choice','Display','Layout'].map(group=><section key={group}><h4>{group}</h4>{palette.filter(item=>item[2]===group).map(item=><button key={item[0]} onClick={()=>add(item)}><span>{group==='Layout'?<LayoutGrid size={14}/>:group==='Display'?<Type size={14}/>:<Monitor size={14}/>}</span><span><b>{item[1]}</b><small>{item[3]}</small></span></button>)}</section>)}</aside>
      <main className="b2-screen-preview"><div className="b2-screen-device">
        <button className={selected===''?'b2-screen-header is-selected':'b2-screen-header'} onClick={()=>setSelected('')}>{config.showHeader===false?<span>Header hidden</span>:<><b>{config.screenTitle||node.label}</b><span>{config.description||'Screen header'}</span></>}</button>
        <div className="b2-screen-canvas">{!components.length?<div className="b2-screen-empty"><Monitor size={32}/><b>Build the screen</b><span>Add components from the palette.</span></div>:components.map(item=><button key={item.id} className={'b2-screen-component '+(selected===item.id?'is-selected':'')} style={{width:String(widthPercent(item.width))+'%'}} onClick={()=>setSelected(item.id)}>
          <span className="b2-screen-component-label">{item.label}{item.required?' *':''}</span>{item.layoutParentId?<small className="b2-screen-parent-note">Inside {components.find(parent=>parent.id===item.layoutParentId)?.label||'layout'}{item.layoutColumn?' · column '+item.layoutColumn:''}</small>:null}{preview(item)}{item.visibilityResource?<Eye size={12} className="b2-visibility-icon"/>:null}
        </button>)}</div>
        {config.showFooter===false?null:<footer className="b2-screen-footer">{config.navigation!=='next'&&config.navigation!=='finish'?<button>Previous</button>:null}{config.allowPause?<button>Pause</button>:null}<button className="is-primary">{config.navigation==='finish'?'Finish':'Next'}</button></footer>}
      </div></main>
      <aside className="b2-screen-properties">{side==='style'?<div className="b2-form"><h3>Style</h3>{selectedComponent?<><label>Width<select value={selectedComponent.width||'full'} onChange={e=>patchComponent({width:e.target.value})}><option value="full">Full Width</option><option value="1/2">1/2</option><option value="1/3">1/3</option><option value="2/3">2/3</option></select></label><label>Layout Container<select value={selectedComponent.layoutParentId||''} onChange={e=>patchComponent({layoutParentId:e.target.value,layoutColumn:1})}><option value="">Screen body</option>{containers.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label>{selectedComponent.layoutParentId&&components.find(item=>item.id===selectedComponent.layoutParentId)?.type==='COLUMNS'?<label>Column<select value={selectedComponent.layoutColumn||1} onChange={e=>patchComponent({layoutColumn:Number(e.target.value)})}>{Array.from({length:Number(components.find(item=>item.id===selectedComponent.layoutParentId)?.columnCount||2)}).map((_,index)=><option key={index+1} value={index+1}>{index+1}</option>)}</select></label>:null}</>:<p>Select a component to edit its layout.</p>}</div>:selectedComponent?<div className="b2-form"><h3>{selectedComponent.label}</h3><label>Label<input value={selectedComponent.label||''} onChange={e=>patchComponent({label:e.target.value})}/></label><label>API Name<input value={selectedComponent.apiName||selectedComponent.name||''} onChange={e=>patchComponent({apiName:e.target.value,name:e.target.value})}/></label>
        {inputTypes.has(selectedComponent.type)?<><label>Help Text<input value={selectedComponent.helpText||''} onChange={e=>patchComponent({helpText:e.target.value})}/></label>{!['CHECKBOX','TOGGLE','ADDRESS','FILE_UPLOAD','DATA_TABLE'].includes(selectedComponent.type)?<label>Placeholder<input value={selectedComponent.placeholder||''} onChange={e=>patchComponent({placeholder:e.target.value})}/></label>:null}<label>Default Value<ResourcePicker resources={screenResources} objects={objects} objectKey={objectKey} onNew={onNewResource} flowType="screen" startConfig={{objectKey}} value={selectedComponent.defaultValue||''} onChange={value=>patchComponent({defaultValue:value})}/></label><label className="b2-check"><input type="checkbox" checked={selectedComponent.required===true} onChange={e=>patchComponent({required:e.target.checked})}/> Required</label>{selectedComponent.required?<label>Required Message<input value={selectedComponent.requiredMessage||''} onChange={e=>patchComponent({requiredMessage:e.target.value})}/></label>:null}<label className="b2-check"><input type="checkbox" checked={selectedComponent.disabled===true} onChange={e=>patchComponent({disabled:e.target.checked})}/> Disabled</label></>:null}
        {selectedComponent.type==='DISPLAY_TEXT'?<label>Text<textarea rows={6} value={selectedComponent.text||''} onChange={e=>patchComponent({text:e.target.value})}/></label>:null}
        {selectedComponent.type==='SECTION'?<><label>Heading<input value={selectedComponent.heading||''} onChange={e=>patchComponent({heading:e.target.value})}/></label><label className="b2-check"><input type="checkbox" checked={selectedComponent.collapsible===true} onChange={e=>patchComponent({collapsible:e.target.checked})}/> Collapsible</label></>:null}
        {selectedComponent.type==='COLUMNS'?<><label>Columns<select value={selectedComponent.columnCount||2} onChange={e=>patchComponent({columnCount:Number(e.target.value)})}><option value="2">2</option><option value="3">3</option><option value="4">4</option></select></label><label>Column Gap<select value={selectedComponent.columnGap||'standard'} onChange={e=>patchComponent({columnGap:e.target.value})}><option value="compact">Compact</option><option value="standard">Standard</option><option value="wide">Wide</option></select></label></>:null}
        {choiceTypes.includes(selectedComponent.type)?<><label>Choice Source<select value={selectedComponent.choiceSource||'manual'} onChange={e=>patchComponent({choiceSource:e.target.value})}><option value="manual">Manual Choices</option><option value="resource">Choice Resource</option></select></label>{selectedComponent.choiceSource==='resource'?<label>Choice Resource<ResourcePicker resources={screenResources} objects={objects} objectKey={objectKey} onNew={onNewResource} flowType="screen" startConfig={{objectKey}} value={selectedComponent.choiceResource||''} onChange={value=>patchComponent({choiceResource:value})}/></label>:<label>Choices<textarea rows={6} value={optionsText} onChange={e=>updateOptions(e.target.value)} placeholder="Label | value&#10;Second label | second_value"/></label>}<label>Controlled By<select value={selectedComponent.controllingComponent||''} onChange={e=>patchComponent({controllingComponent:e.target.value})}><option value="">None</option>{components.filter(item=>item.id!==selected&&inputTypes.has(item.type)).map(item=><option key={item.id} value={item.name||item.apiName}>{item.label}</option>)}</select></label></>:null}
        {['TEXT','TEXT_AREA','EMAIL','PHONE','PASSWORD'].includes(selectedComponent.type)?<><label>Minimum Length<input type="number" min="0" value={selectedComponent.minLength??''} onChange={e=>patchComponent({minLength:e.target.value})}/></label><label>Maximum Length<input type="number" min="1" value={selectedComponent.maxLength??''} onChange={e=>patchComponent({maxLength:e.target.value})}/></label><label>Pattern<input value={selectedComponent.pattern||''} onChange={e=>patchComponent({pattern:e.target.value})} placeholder="Optional regular expression"/></label></>:null}
        {['NUMBER','CURRENCY','SLIDER'].includes(selectedComponent.type)?<><label>Minimum<input type="number" value={selectedComponent.min??''} onChange={e=>patchComponent({min:e.target.value})}/></label><label>Maximum<input type="number" value={selectedComponent.max??''} onChange={e=>patchComponent({max:e.target.value})}/></label><label>Step<input type="number" value={selectedComponent.step??''} onChange={e=>patchComponent({step:e.target.value})}/></label></>:null}
        {selectedComponent.type==='FILE_UPLOAD'?<><label>Accepted Types<input value={(selectedComponent.acceptedTypes||[]).join(', ')} onChange={e=>patchComponent({acceptedTypes:e.target.value.split(',').map(value=>value.trim()).filter(Boolean)})} placeholder=".pdf, image/*"/></label><label>Maximum Files<input type="number" min="1" max="10" value={selectedComponent.maxFiles||1} onChange={e=>patchComponent({maxFiles:Number(e.target.value)||1})}/></label><label>Target Object<ObjectSearchPicker objects={objects} value={selectedComponent.fileObjectKey||objectKey} onChange={value=>patchComponent({fileObjectKey:value})}/></label><label>Target Record<ResourcePicker resources={screenResources} objects={objects} objectKey={selectedComponent.fileObjectKey||objectKey} onNew={onNewResource} flowType="screen" startConfig={{objectKey:selectedComponent.fileObjectKey||objectKey}} value={selectedComponent.fileRecordResource||''} onChange={value=>patchComponent({fileRecordResource:value})}/></label><label>Category<input value={selectedComponent.fileCategory||''} onChange={e=>patchComponent({fileCategory:e.target.value})}/></label></>:null}
        {selectedComponent.type==='RECORD_PICKER'?<><label>Search Minimum Characters<input type="number" min="1" max="5" value={selectedComponent.searchMinChars??2} onChange={e=>patchComponent({searchMinChars:Number(e.target.value)||2})}/></label><label className="b2-check"><input type="checkbox" checked={selectedComponent.allowClear!==false} onChange={e=>patchComponent({allowClear:e.target.checked})}/> Allow Clear</label><label>No Results Message<input value={selectedComponent.noResultsMessage||''} onChange={e=>patchComponent({noResultsMessage:e.target.value})}/></label></>:null}
        {selectedComponent.type==='DATA_TABLE'?<><label>Data Resource<ResourcePicker resources={screenResources} objects={objects} objectKey={objectKey} onNew={onNewResource} flowType="screen" startConfig={{objectKey}} value={selectedComponent.dataResource||''} onChange={value=>patchComponent({dataResource:value})}/></label><label>Columns<input value={(selectedComponent.columns||[]).join(', ')} onChange={e=>patchComponent({columns:e.target.value.split(',').map(value=>value.trim()).filter(Boolean)})} placeholder="name, status, amount"/></label><label>Selection Mode<select value={selectedComponent.selectionMode||'single'} onChange={e=>patchComponent({selectionMode:e.target.value})}><option value="none">No Selection</option><option value="single">Single</option><option value="multiple">Multiple</option></select></label></>:null}
        {selectedComponent.type==='IMAGE'?<><label>Image Source<input value={selectedComponent.source||''} onChange={e=>patchComponent({source:e.target.value})} placeholder="URL or resource"/></label><label>Alt Text<input value={selectedComponent.altText||''} onChange={e=>patchComponent({altText:e.target.value})}/></label></>:null}
        {selectedComponent.type==='LINK'?<><label>URL<input value={selectedComponent.href||''} onChange={e=>patchComponent({href:e.target.value})} placeholder="URL or resource"/></label><label>Open<select value={selectedComponent.linkTarget||'same'} onChange={e=>patchComponent({linkTarget:e.target.value})}><option value="same">Same Window</option><option value="new">New Window</option></select></label></>:null}
        {selectedComponent.type==='PROGRESS'?<><label>Stage Resource<ResourcePicker resources={screenResources} objects={objects} objectKey={objectKey} onNew={onNewResource} flowType="screen" startConfig={{objectKey}} value={selectedComponent.stageResource||''} onChange={value=>patchComponent({stageResource:value})}/></label><label>Style<select value={selectedComponent.progressStyle||'path'} onChange={e=>patchComponent({progressStyle:e.target.value})}><option value="path">Path</option><option value="bar">Progress Bar</option><option value="compact">Compact</option></select></label><label className="b2-check"><input type="checkbox" checked={selectedComponent.showStageLabels!==false} onChange={e=>patchComponent({showStageLabels:e.target.checked})}/> Show Stage Labels</label></>:null}
        {!['DISPLAY_TEXT','IMAGE','LINK','PROGRESS','SECTION','COLUMNS'].includes(selectedComponent.type)?<><fieldset><legend>Component Visibility</legend><label>Resource<ResourcePicker resources={screenResources} objects={objects} objectKey={objectKey} onNew={onNewResource} flowType="screen" startConfig={{objectKey}} value={selectedComponent.visibilityResource||''} onChange={value=>patchComponent({visibilityResource:value})}/></label>{selectedComponent.visibilityResource?<><label>Operator<select value={selectedComponent.visibilityOperator||'truthy'} onChange={e=>patchComponent({visibilityOperator:e.target.value})}><option value="truthy">Is True / Has Value</option><option value="falsy">Is False / Empty</option><option value="is_empty">Is Empty</option><option value="is_not_empty">Is Not Empty</option><option value="equals">Equals</option><option value="not_equals">Does Not Equal</option><option value="contains">Contains</option><option value="not_contains">Does Not Contain</option><option value="greater_than">Greater Than</option><option value="greater_or_equal">Greater Than or Equal</option><option value="less_than">Less Than</option><option value="less_or_equal">Less Than or Equal</option></select></label>{compareVisibility.includes(selectedComponent.visibilityOperator)?<label>Compare Value<input value={selectedComponent.visibilityValue??''} onChange={e=>patchComponent({visibilityValue:e.target.value})}/></label>:null}</>:null}</fieldset><label>Validate Input Formula<textarea rows={4} value={selectedComponent.validationFormula||''} onChange={e=>patchComponent({validationFormula:e.target.value})} placeholder="Boolean formula; true means valid"/></label>{selectedComponent.validationFormula?<label>Validation Message<input value={selectedComponent.validationMessage||''} onChange={e=>patchComponent({validationMessage:e.target.value})}/></label>:null}</>:null}
        <div className="b2-component-actions"><button onClick={()=>moveSelected(-1)} disabled={components.findIndex(item=>item.id===selected)<=0}>Move Up</button><button onClick={()=>moveSelected(1)} disabled={components.findIndex(item=>item.id===selected)>=components.length-1}>Move Down</button><button className="b2-delete-component" onClick={removeSelected}><Trash2 size={13}/> Delete Component</button></div>
      </div>:<div className="b2-form"><h3>Screen</h3><label>Title<input value={config.screenTitle||node.label} onChange={e=>patchConfig({screenTitle:e.target.value})}/></label><label>Description<textarea rows={4} value={config.description||''} onChange={e=>patchConfig({description:e.target.value})}/></label><label className="b2-check"><input type="checkbox" checked={config.showHeader!==false} onChange={e=>patchConfig({showHeader:e.target.checked})}/> Show Header</label><label className="b2-check"><input type="checkbox" checked={config.showFooter!==false} onChange={e=>patchConfig({showFooter:e.target.checked})}/> Show Footer</label><label>Navigation<select value={config.navigation||'both'} onChange={e=>patchConfig({navigation:e.target.value})}><option value="both">Previous and Next</option><option value="next">Next only</option><option value="finish">Finish</option></select></label><label className="b2-check"><input type="checkbox" checked={config.allowPause===true} onChange={e=>patchConfig({allowPause:e.target.checked})}/> Allow Pause</label><p className="b2-help">Select a component on the canvas to configure it.</p></div>}</aside>
    </div>
  </div>
}

function DrawerFrame({title,onClose,width=480,onWidth,children}) {
  const resize=event=>{const startX=event.clientX,startWidth=width;const move=e=>onWidth?.(Math.max(380,Math.min(760,startWidth+(startX-e.clientX))));const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up)};window.addEventListener('pointermove',move);window.addEventListener('pointerup',up)}
  return <div className="b2-drawer" style={{width}}><button className="b2-drawer-resize" aria-label="Resize panel" onPointerDown={resize}/><header><b>{title}</b><button onClick={onClose}><X size={16}/></button></header>{children}</div>
}

function DebugDetails({result,onSelectNode}) {
  if(!result)return <div className="b2-debug-empty"><Monitor size={24}/><b>No results yet</b><span>Run the flow to inspect its executed path, resources, and assertions.</span></div>
  const steps=Array.isArray(result.steps)?result.steps:[], assertionRows=result.assertionResult?.results||result.assertionResult?.assertions||[]
  return <div className="b2-debug-results"><div className={`b2-debug-status ${String(result.status||'').toLowerCase()}`}><b>{result.status||'Completed'}</b><span>{result.rolledBack?'Changes rolled back · ':''}{result.externalActionsSimulated?'External actions simulated':''}</span></div>{result.friendlyError?<div className="b2-debug-error"><b>{result.friendlyError.title||'Debug stopped'}</b><span>{result.friendlyError.whatHappened||''}</span>{result.friendlyError.howToFix?<small>{result.friendlyError.howToFix}</small>:null}</div>:null}<section><h4>Executed Elements</h4>{!steps.length?<p>No workflow elements executed.</p>:steps.map((step,index)=>{const id=String(step.step_identifier||'').split('@')[0];return <button key={step.id||index} onClick={()=>id&&onSelectNode?.(id)}><span>{index+1}</span><span><b>{step.action_type||id||'Step'}</b><small>{step.status}{step.error_text?` · ${step.error_text}`:''}</small></span><ChevronRight size={12}/></button>})}</section>{assertionRows.length?<section><h4>Assertions</h4>{assertionRows.map((row,index)=><div className="b2-assertion-result" key={index}><span>{row.passed===false?'✕':'✓'}</span><span><b>{row.label||row.type||`Assertion ${index+1}`}</b><small>{row.message||String(row.actual??'')}</small></span></div>)}</section>:null}<section><h4>Resources</h4><pre>{JSON.stringify(result.variables?.variables||{},null,2)}</pre></section></div>
}

function TestEditorDialog({draft,setDraft,nodes,resources,onClose,onSave,busy}) {
  const assertions=Array.isArray(draft.assertions)?draft.assertions:[]
  const patchAssertion=(index,patch)=>setDraft(current=>({...current,assertions:assertions.map((item,i)=>i===index?{...item,...patch}:item)}))
  const addAssertion=()=>setDraft(current=>({...current,assertions:[...assertions,{id:uid(),type:'RUN_STATUS',expected:'COMPLETED'}]}))
  return <div className="b2-modal-backdrop"><div className="b2-modal b2-test-editor"><header><div><h3>{draft.id?'Edit Test':'New Flow Test'}</h3><p>Create a reusable test with assertions.</p></div><button onClick={onClose}><X size={18}/></button></header><div className="b2-form"><label>Test Name<input value={draft.name||''} onChange={e=>setDraft(current=>({...current,name:e.target.value}))}/></label><label>Record<select value={draft.recordMode||'latest'} onChange={e=>setDraft(current=>({...current,recordMode:e.target.value}))}><option value="latest">Use latest available record</option><option value="specific">Use a specific record ID</option></select></label>{draft.recordMode==='specific'?<label>Record ID<input value={draft.recordId||''} onChange={e=>setDraft(current=>({...current,recordId:e.target.value}))}/></label>:null}<div className="b2-test-assertions"><h4>Assertions</h4>{assertions.map((assertion,index)=><fieldset key={assertion.id||index}><legend>Assertion {index+1}</legend><label>Type<select value={assertion.type||'RUN_STATUS'} onChange={e=>patchAssertion(index,{type:e.target.value,stepId:'',resource:'',expected:e.target.value==='RUN_STATUS'?'COMPLETED':''})}><option value="RUN_STATUS">Run Status</option><option value="STEP_STATUS">Element Status</option><option value="DECISION_OUTCOME">Decision Outcome</option><option value="RESOURCE_EQUALS">Resource Equals</option></select></label>{['STEP_STATUS','DECISION_OUTCOME'].includes(assertion.type)?<label>Element<select value={assertion.stepId||''} onChange={e=>patchAssertion(index,{stepId:e.target.value})}><option value="">Select element…</option>{nodes.filter(node=>assertion.type!=='DECISION_OUTCOME'||node.type==='DECISION').map(node=><option key={node.id} value={node.id}>{node.label}</option>)}</select></label>:null}{assertion.type==='RESOURCE_EQUALS'?<label>Resource<select value={assertion.resource||''} onChange={e=>patchAssertion(index,{resource:e.target.value})}><option value="">Select resource…</option>{resources.map(resource=><option key={resource.value} value={resource.value}>{resource.label}</option>)}</select></label>:null}<label>Expected<input value={assertion.expected??''} onChange={e=>patchAssertion(index,{expected:e.target.value})} placeholder={assertion.type==='DECISION_OUTCOME'?'Outcome ID or __DEFAULT__':'Expected value'}/></label><button className="b2-text-action" onClick={()=>setDraft(current=>({...current,assertions:assertions.filter((_,i)=>i!==index)}))}><Trash2 size={13}/> Remove</button></fieldset>)}<button className="b2-text-action" onClick={addAssertion}><Plus size={13}/> Add Assertion</button></div></div><footer><button onClick={onClose}>Cancel</button><button className="is-primary" disabled={busy||!String(draft.name||'').trim()||!assertions.length} onClick={onSave}>Save Test</button></footer></div></div>
}
export default function Builder2Page({initialWorkflowId='',initialFlowType='',initialObjectKey='',onClose,onSaved}){
  const [objects,setObjects]=useState([]),[actions,setActions]=useState([]),[subflows,setSubflows]=useState([]),[nodes,setNodes]=useState([]),[edges,setEdges]=useState([]),[selected,setSelected]=useState(''),[selector,setSelector]=useState(false),[toolboxSearch,setToolboxSearch]=useState(''),[addSearch,setAddSearch]=useState(''),[managerSearch,setManagerSearch]=useState(''),[insertIndex,setInsertIndex]=useState(null),[resources,setResources]=useState([]),[flowTests,setFlowTests]=useState([]),[resourceDialog,setResourceDialog]=useState(false),[tab,setTab]=useState('elements'),[error,setError]=useState(''),[screenEditing,setScreenEditing]=useState(''),[supportPanel,setSupportPanel]=useState(''),[startOpen,setStartOpen]=useState(()=>normalizeFlowType(initialFlowType)==='record'),[startConfig,setStartConfig]=useState(()=>({trigger:'created_or_updated',conditionLogic:'all',optimize:'actions',...(initialObjectKey?{objectKey:initialObjectKey}:{})})),[zoom,setZoom]=useState(100),[history,setHistory]=useState([]),[future,setFuture]=useState([]),[dirty,setDirty]=useState(false),[nodeMenu,setNodeMenu]=useState(''),[saveMenu,setSaveMenu]=useState(false),[active,setActive]=useState(false),[clipboard,setClipboard]=useState([]),[multiSelect,setMultiSelect]=useState(false),[selectedMany,setSelectedMany]=useState([]),[managerFilter,setManagerFilter]=useState('all'),[managerDetail,setManagerDetail]=useState(''),[editHistory,setEditHistory]=useState([]),[actionEditing,setActionEditing]=useState(''),[toolboxOpen,setToolboxOpen]=useState(true),[layoutMode,setLayoutMode]=useState('auto'),[flowType,setFlowType]=useState(()=>normalizeFlowType(initialFlowType||'record')),[flowProps,setFlowProps]=useState({label:'New Flow',apiName:'New_Flow',description:'',apiVersion:'68.0',runContext:'default'}),[flowPropsOpen,setFlowPropsOpen]=useState(false),[historyPreview,setHistoryPreview]=useState(''),[groups,setGroups]=useState([]),[groupDialog,setGroupDialog]=useState(false),[branchCollapsed,setBranchCollapsed]=useState({}),[workflowId,setWorkflowId]=useState(()=>String(initialWorkflowId||'')),[busy,setBusy]=useState(false),[runtimeMessage,setRuntimeMessage]=useState(''),[drawerWidth,setDrawerWidth]=useState(500),[debugResult,setDebugResult]=useState(null),[debugTab,setDebugTab]=useState('setup'),[debugRecordId,setDebugRecordId]=useState(''),[debugInputs,setDebugInputs]=useState({}),[versions,setVersions]=useState([]),[testDialog,setTestDialog]=useState(false),[testDraft,setTestDraft]=useState({name:'',recordMode:'latest',recordId:'',assertions:[{id:'assert-1',type:'RUN_STATUS',expected:'COMPLETED'}]})
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
      setSubflows(rows.filter(x=>x?.action?.type==='workflow'&&x.active!==false&&normalizeFlowType(x?.action?.flowType||'autolaunched')==='autolaunched').map(x=>({id:x.id,label:x.name||x?.action?.apiName||x.id,apiName:x?.action?.apiName||x.name||x.id,description:x?.action?.description||'',inputContract:Array.isArray(x?.action?.inputContract)?x.action.inputContract:[],outputContract:Array.isArray(x?.action?.outputContract)?x.action.outputContract:[]})))
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
      setNodes(savedActions.filter(x=>x?._builderResource!==true&&normalizeNodeType(x.type||x.key)!=='END').map(runtimeActionToBuilderNode))
      setEdges(Array.isArray(layout.edges)?layout.edges:[])
      setResources((Array.isArray(action.resources)?action.resources:[]).map(resource=>({...resource,value:String(resource.value||'').startsWith('variables.')||String(resource.value||'').charAt(0)===String.fromCharCode(36)?resource.value:'variables.'+resourceNameOf(resource)})))
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
  const toolboxFiltered=availableElements.filter(e=>!toolboxSearch||[e.label,e.category,e.description].join(' ').toLowerCase().includes(toolboxSearch.toLowerCase()))
  const addFiltered=availableElements.filter(e=>!addSearch||[e.label,e.category,e.description].join(' ').toLowerCase().includes(addSearch.toLowerCase()))
  const paletteGroups=[...new Set(availableElements.map(e=>e.category))]
  const cleanNodeReferences=next=>{
    const ids=new Set(next.map(node=>String(node.id)))
    return next.map(node=>{
      const config={...(node.config||{})}
      for(const key of ['defaultBranch','bodyBranch','faultBranch']) if(Array.isArray(config[key])) config[key]=config[key].filter(id=>ids.has(String(id)))
      if(Array.isArray(config.outcomes)) config.outcomes=config.outcomes.map(outcome=>({...outcome,branch:Array.isArray(outcome.branch)?outcome.branch.filter(id=>ids.has(String(id))):[]}))
      return {...node,config}
    })
  }
  const commitNodes=next=>{
    const cleaned=cleanNodeReferences(next)
    const ids=new Set(cleaned.map(node=>String(node.id)))
    setHistory(h=>[...h,nodes]);setFuture([]);setNodes(cleaned)
    setEdges(current=>current.filter(edge=>ids.has(String(edge.source))&&ids.has(String(edge.target))))
    setDirty(true)
  }
  const buildPayload=(lifecycle='DRAFT')=>({name:flowProps.label||'New Flow',objectId:startConfig.objectKey||null,objectKey:startConfig.objectKey||null,triggerKey:flowType==='schedule'?'scheduled':flowType==='platform_event'?(startConfig.eventKey||''):flowType==='record'?(startConfig.trigger==='created'?(startConfig.optimize==='fast'?'before_create':'after_create'):startConfig.trigger==='updated'?(startConfig.optimize==='fast'?'before_update':'after_update'):startConfig.trigger==='deleted'?'after_delete':startConfig.optimize==='fast'?'before_save':'after_save'):'manual',active:lifecycle==='ACTIVE',lifecycleStatus:lifecycle,conditions:(startConfig.conditionLogic==='none'?[]:(startConfig.conditions||[]).filter(row=>row?.resource).map(conditionToRuntime)),action:{type:'workflow',builder2:true,apiName:flowProps.apiName,description:flowProps.description,apiVersion:flowProps.apiVersion,flowType,runContext:flowProps.runContext,start:startConfig,optimize:startConfig.optimize||'actions',match:startConfig.conditionLogic==='any'?'any':'all',entryTransition:startConfig.updateMode==='transition'?'UPDATED_TO_MEET':'EVERY_TIME',builderLayout:{mode:layoutMode==='free'?'FREE_FORM':'AUTO',positions:Object.fromEntries(nodes.map((n,i)=>[n.id,n.position||{x:320,y:120+i*120}])),edges},builderGroups:groups,resources,tests:flowTests,inputContract:workflowInputContract(resources),outputContract:workflowOutputContract(resources),actions:[...serializeResourcePrelude(resources),...nodes.map(node=>builderNodeToRuntimeAction(node,{edges,resources}))]}})
  const persistWorkflow=async(lifecycle='DRAFT',forceNewVersion=false,forceNewFlow=false)=>{setBusy(true);setRuntimeMessage('');try{const payload={...buildPayload(lifecycle),...(forceNewVersion?{forceNewVersion:true}:{}),...(forceNewFlow?{name:`${flowProps.label||'New Flow'} Copy`,action:{...buildPayload(lifecycle).action,apiName:`${flowProps.apiName||'New_Flow'}_Copy_${Date.now()}`}}:{})};const response=workflowId&&!forceNewFlow?await apiRequest(`/api/platform/rules/${workflowId}`,{method:'PUT',body:JSON.stringify(payload)}):await apiRequest('/api/platform/rules',{method:'POST',body:JSON.stringify(payload)});const saved=response?.data||{};if(saved.id)setWorkflowId(saved.id);onSaved?.(saved,{keepOpen:true});setActive(lifecycle==='ACTIVE');setDirty(false);setEditHistory(h=>[{id:uid(),label:lifecycle==='ACTIVE'?'Activated':'Saved',at:new Date().toISOString(),nodes:nodes.length,snapshot:JSON.parse(JSON.stringify(nodes)),summary:{added:nodes.length,edited:0,deleted:0}},...h].slice(0,100));setRuntimeMessage(lifecycle==='ACTIVE'?'Flow activated.':'Flow saved.');setSaveMenu(false);return saved}catch(e){setError(e?.message||'Unable to save flow');return null}finally{setBusy(false)}}
  const saveDraft=label=>{const action=String(label||'').toLowerCase();return persistWorkflow('DRAFT',action.includes('version'),action.includes('new flow'))}
  const loadSavedTests=async(id=workflowId)=>{if(!id){setFlowTests([]);return}try{const response=await apiRequest(`/api/platform/rules/${id}/tests`);setFlowTests(Array.isArray(response?.data)?response.data:[])}catch{setFlowTests([])}}
  useEffect(()=>{void loadSavedTests(workflowId)},[workflowId])
  const openHistory=async()=>{setSupportPanel('history');setHistoryPreview('');if(!workflowId){setVersions([]);return}try{const response=await apiRequest(`/api/platform/rules/${workflowId}/versions`);setVersions(Array.isArray(response?.data)?response.data:[])}catch(e){setError(e?.message||'Unable to load workflow versions');setVersions([])}}
  const restoreVersion=async version=>{if(!workflowId||busy)return;setBusy(true);try{const response=await apiRequest(`/api/platform/rules/${workflowId}/versions/${version}/restore`,{method:'POST'});setRuntimeMessage(`Version ${version} restored as a new draft version.`);onSaved?.(response?.data||null,{keepOpen:false});onClose?.()}catch(e){setError(e?.message||'Unable to restore workflow version')}finally{setBusy(false)}}
  const runDiagnostic=async(mode='debug',{saved=false,assertions=[]}={})=>{setBusy(true);setError('');setDebugResult(null);try{const endpoint=saved&&mode==='run'&&workflowId?`/api/platform/rules/${workflowId}/run`:(workflowId?`/api/platform/rules/${workflowId}/debug`:'/api/platform/rules/debug');const body={mode,inputs:debugInputs,...(debugRecordId?{recordId:debugRecordId}:{}),...(assertions.length?{assertions}:{}),...(!saved?{definition:buildPayload('DRAFT')}:{})};const response=await apiRequest(endpoint,{method:'POST',body:JSON.stringify(body)});setDebugResult(response?.data||null);setDebugTab('details');setRuntimeMessage(`${mode==='test'?'Test':mode==='run'?'Run':'Debug'}: ${response?.data?.status||'completed'}`);return response?.data||null}catch(e){setError(e?.message||`${mode==='test'?'Test':mode==='run'?'Run':'Debug'} failed`);return null}finally{setBusy(false)}}
  const openNewTest=()=>{setTestDraft({name:'',recordMode:'latest',recordId:'',assertions:[{id:uid(),type:'RUN_STATUS',expected:'COMPLETED'}]});setTestDialog(true)}
  const editTest=test=>{const config=test?.config||{};setTestDraft({id:test.id,name:test.name||'',recordMode:config.recordMode||'latest',recordId:config.recordId||'',assertions:Array.isArray(config.assertions)&&config.assertions.length?config.assertions.map(item=>({...item,id:item.id||uid()})):[{id:uid(),type:'RUN_STATUS',expected:'COMPLETED'}]});setTestDialog(true)}
  const saveTest=async()=>{if(!workflowId||busy)return;setBusy(true);try{const payload={name:testDraft.name,config:{recordMode:testDraft.recordMode||'latest',...(testDraft.recordMode==='specific'?{recordId:testDraft.recordId}:{}),assertions:(testDraft.assertions||[]).map(({id,...assertion})=>assertion)}};await apiRequest(testDraft.id?`/api/platform/rules/${workflowId}/tests/${testDraft.id}`:`/api/platform/rules/${workflowId}/tests`,{method:testDraft.id?'PUT':'POST',body:JSON.stringify(payload)});setTestDialog(false);await loadSavedTests(workflowId)}catch(e){setError(e?.message||'Unable to save flow test')}finally{setBusy(false)}}
  const runSavedTest=async test=>{if(!workflowId||busy)return;setBusy(true);setError('');try{const response=await apiRequest(`/api/platform/rules/${workflowId}/tests/${test.id}/run`,{method:'POST',body:JSON.stringify({definition:buildPayload('DRAFT')})});setDebugResult(response?.data||null);setSupportPanel('testmode');setDebugTab('details');await loadSavedTests(workflowId)}catch(e){setError(e?.message||'Unable to run saved test')}finally{setBusy(false)}}
  const deleteSavedTest=async test=>{if(!workflowId||busy)return;setBusy(true);try{await apiRequest(`/api/platform/rules/${workflowId}/tests/${test.id}`,{method:'DELETE'});await loadSavedTests(workflowId)}catch(e){setError(e?.message||'Unable to delete saved test')}finally{setBusy(false)}}
  const inputResources=resources.filter(resource=>resource.type==='Variable'&&resource.availableInput===true)
  const copySelected=()=>{const ids=selectedMany.length?selectedMany:selected?[selected]:[];setClipboard(nodes.filter(n=>ids.includes(n.id)).map(node=>JSON.parse(JSON.stringify(node))))}
  const pasteClipboard=()=>{if(!clipboard.length)return;const copies=clipboard.map(n=>({...JSON.parse(JSON.stringify(n)),id:uid(),label:n.label+' Copy',apiName:n.apiName+'_Copy_'+uid().slice(0,4)}));commitNodes([...nodes,...copies]);setSelectedMany(copies.map(x=>x.id))}
  const groupSelected=()=>{if(selectedMany.length<2)return;setGroupDialog(true)}
  const createGroup=(name,description)=>{const groupId=uid();setGroups(g=>[...g,{id:groupId,name,description,collapsed:false}]);commitNodes(nodes.map(n=>selectedMany.includes(n.id)?{...n,groupId}:n));setSelectedMany([]);setGroupDialog(false)}
  const toggleGroup=id=>setGroups(gs=>gs.map(g=>g.id===id?{...g,collapsed:!g.collapsed}:g))
  const add=e=>{const n={id:uid(),type:e.type,label:e.label,apiName:e.type+'_'+(nodes.length+1),config:e.actionKey?{actionKey:e.actionKey}:{}};const at=Number.isInteger(insertIndex)?Math.max(0,Math.min(nodes.length,insertIndex)):nodes.length;const next=[...nodes];next.splice(at,0,n);commitNodes(next);setSelected(n.id);setSelector(false);setAddSearch('');setInsertIndex(null);if(e.type==='SCREEN')setScreenEditing(n.id)}
  const addFreeForm=(e,position)=>{const n={id:uid(),type:e.type,label:e.label,apiName:e.type+'_'+(nodes.length+1),config:e.actionKey?{actionKey:e.actionKey}:{},position};commitNodes([...nodes,n]);setSelected(n.id);if(e.type==='SCREEN')setScreenEditing(n.id)}
  const openSelectorAt=at=>{setInsertIndex(Math.max(0,Math.min(nodes.length,at)));setAddSearch('');setSelector(true)}
  const pasteClipboardAt=at=>{if(!clipboard.length)return;const copies=clipboard.map(n=>({...JSON.parse(JSON.stringify(n)),id:uid(),label:n.label+' Copy',apiName:n.apiName+'_Copy_'+uid().slice(0,4)}));const next=[...nodes];next.splice(Math.max(0,Math.min(nodes.length,at)),0,...copies);commitNodes(next);setSelectedMany(copies.map(x=>x.id));setSelector(false);setInsertIndex(null);setAddSearch('')}
  const current=nodes.find(n=>n.id===selected)
  const patch=n=>{commitNodes(nodes.map(v=>v.id===n.id?n:v))}
  const undo=()=>{if(!history.length)return;const prev=history[history.length-1];setFuture(f=>[nodes,...f]);setHistory(h=>h.slice(0,-1));setNodes(prev);setDirty(true)}
  const redo=()=>{if(!future.length)return;const next=future[0];setHistory(h=>[...h,nodes]);setFuture(f=>f.slice(1));setNodes(next);setDirty(true)}
  const removeNode=id=>{commitNodes(nodes.filter(n=>n.id!==id));if(selected===id)setSelected('');setNodeMenu('')}
  const duplicateNode=id=>{const source=nodes.find(n=>n.id===id);if(!source)return;const copy={...JSON.parse(JSON.stringify(source)),id:uid(),label:source.label+' Copy',apiName:source.apiName+'_Copy'};commitNodes([...nodes,copy]);setSelected(copy.id);setNodeMenu('')}
  useEffect(()=>{const onKey=e=>{const mod=e.ctrlKey||e.metaKey;if(mod&&e.altKey&&(e.key==='+'||e.key==='=')){e.preventDefault();setZoom(z=>Math.min(150,z+10))}else if(mod&&e.altKey&&e.key==='-'){e.preventDefault();setZoom(z=>Math.max(50,z-10))}else if(mod&&e.altKey&&e.key==='0'){e.preventDefault();setZoom(100)}else if(mod&&e.key.toLowerCase()==='x'){e.preventDefault();copySelected();const ids=selectedMany.length?selectedMany:selected?[selected]:[];if(ids.length)commitNodes(nodes.filter(n=>!ids.includes(n.id)))}else if(mod&&e.key.toLowerCase()==='c'){e.preventDefault();copySelected()}else if(mod&&e.key.toLowerCase()==='v'){e.preventDefault();pasteClipboard()}else if(['ArrowUp','ArrowLeft','ArrowDown','ArrowRight'].includes(e.key)&&document.activeElement?.closest?.('.b2-node')){e.preventDefault();const i=nodes.findIndex(n=>n.id===selected);const d=['ArrowUp','ArrowLeft'].includes(e.key)?-1:1;const next=nodes[Math.max(0,Math.min(nodes.length-1,i+d))];if(next){setSelected(next.id);setTimeout(()=>document.querySelector(`[data-node-id="${next.id}"]`)?.focus(),0)}}else if((e.key==='Delete'||e.key==='Backspace')&&selected&&!['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)){removeNode(selected)}};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[nodes,selected,selectedMany,clipboard,history,future])
  const issues=useMemo(()=>validateDefinition({flowType,startConfig,nodes,edges,resources,actions,subflows}),[flowType,startConfig,nodes,edges,resources,actions,subflows])
  const autoRows=useMemo(()=>{const seen=new Set(),rows=[];nodes.forEach((node,index)=>{const group=node.groupId?groups.find(g=>g.id===node.groupId):null;if(group&&!seen.has(group.id)){rows.push({kind:'group',group,index});seen.add(group.id)}if(group?.collapsed)return;rows.push({kind:'node',node,index})});return rows},[nodes,groups])
  const nodeLabelById=useMemo(()=>new Map(nodes.map(node=>[String(node.id),node.label||node.apiName||node.id])),[nodes])
  const pathSummaryFor=node=>{
    const p=node.config||{}, rows=[]
    if(node.type==='DECISION'){
      for(const outcome of p.outcomes||[]) if((outcome.branch||[]).length) rows.push({label:outcome.label||'Outcome',targets:outcome.branch,kind:'outcome'})
      if((p.defaultBranch||[]).length) rows.push({label:p.defaultOutcomeLabel||'Default Outcome',targets:p.defaultBranch,kind:'default'})
    }
    if(node.type==='LOOP'&&(p.bodyBranch||[]).length) rows.push({label:'For Each',targets:p.bodyBranch,kind:'loop'})
    if(['ROUTE','RETRY'].includes(String(p.faultMode||'').toUpperCase())&&(p.faultBranch||[]).length) rows.push({label:p.faultMode==='RETRY'?'Retry → Error Path':'Error Path',targets:p.faultBranch,kind:'fault'})
    return rows
  }
  if(screenEditing){const n=nodes.find(x=>x.id===screenEditing);if(n)return <ScreenEditor node={n} onPatch={patch} onClose={()=>setScreenEditing('')} resources={resources} objects={objects} objectKey={startConfig.objectKey||''} onNewResource={()=>setResourceDialog(true)}/>}
  return <div className="b2-shell">
    <header className="b2-top"><div className="b2-title">{onClose?<button className="b2-back" title="Back to flows" aria-label="Back to flows" onClick={onClose}><ChevronLeft size={16}/></button>:null}<Workflow size={20}/><span><b>Workflow Builder</b><small>Flow Builder workspace</small></span></div><div className="b2-buttonbar"><button title="Select Elements" className={multiSelect?'is-on':''} onClick={()=>{setMultiSelect(v=>!v);setSelectedMany([])}}><Copy size={15}/></button>{multiSelect?<><button title="Copy Elements" disabled={!selectedMany.length} onClick={copySelected}><Copy size={15}/></button><button title="Group Elements" disabled={selectedMany.length<2} onClick={groupSelected}><Group size={15}/></button></>:null}{clipboard.length?<button title={`Paste ${clipboard.length} Elements`} onClick={pasteClipboard}><Plus size={15}/></button>:null}<button title="Edit History" onClick={openHistory}><Clock3 size={15}/></button><button title="Undo" disabled={!history.length} onClick={undo}><Undo2 size={15}/></button><button title="Redo" disabled={!future.length} onClick={redo}><Redo2 size={15}/></button><button title="Toggle Toolbox" onClick={()=>setToolboxOpen(v=>!v)}><ChevronLeft size={15}/></button><button title="Flow Properties" onClick={()=>setFlowPropsOpen(true)}><Settings2 size={15}/></button><select className="b2-layout-select" value={layoutMode} onChange={e=>setLayoutMode(e.target.value)}><option value="auto">Auto-Layout</option><option value="free">Free-Form</option></select></div><div className="b2-top-actions"><button onClick={()=>setSupportPanel(supportPanel==='issues'?'':'issues')} className={issues.length?'has-issues':''}><AlertTriangle size={13}/> Errors & Warnings {issues.length?`(${issues.length})`:''}</button><button onClick={()=>setSupportPanel('run')}>Run</button>{['autolaunched','record'].includes(flowType)?<button onClick={()=>setSupportPanel('testmode')}>Test Mode</button>:<button onClick={()=>setSupportPanel('debug')}>Debug</button>}<button onClick={()=>setSupportPanel('tests')}>View Tests</button><div className="b2-save-wrap"><button className="is-primary" disabled={busy} onClick={()=>saveDraft('Saved')}><Save size={13}/> Save{dirty?' *':''}</button><button className="is-primary b2-save-chevron" onClick={()=>setSaveMenu(v=>!v)}><ChevronDown size={13}/></button>{saveMenu?<div className="b2-save-menu"><button onClick={()=>saveDraft('Saved')}>Save</button><button onClick={()=>saveDraft('Saved as new version')}>Save As New Version</button><button onClick={()=>saveDraft('Saved as new flow')}>Save As New Flow</button></div>:null}</div><button disabled={busy} onClick={()=>persistWorkflow(active?'DRAFT':'ACTIVE')}>{active?'Deactivate':'Activate'}</button></div></header>
    {error?<div className="b2-error">{error}</div>:null}{runtimeMessage?<div className="b2-runtime-message">{runtimeMessage}</div>:null}
    <div className={`b2-workspace ${toolboxOpen?'':'toolbox-closed'}`}>
      {toolboxOpen?<aside className="b2-toolbox"><div className="b2-tabs"><button className={tab==='elements'?'is-active':''} onClick={()=>setTab('elements')}>Elements</button><button className={tab==='manager'?'is-active':''} onClick={()=>setTab('manager')}>Manager</button></div>
        {supportPanel==='issues'?<div className="b2-issues"><h3>Errors & Warnings</h3>{!issues.length?<div className="b2-empty-small">No issues found.</div>:issues.map((i,x)=><button key={x} onClick={()=>{setSelected(i.node);setSupportPanel('')}}><AlertTriangle size={14}/><span><b>{i.level==='error'?'Error':'Warning'}</b><small>{i.text}</small></span></button>)}</div>:tab==='elements'?<><label className="b2-search"><Search size={14}/><input aria-label="Search flow elements" value={toolboxSearch} onChange={e=>setToolboxSearch(e.target.value)} placeholder="Search elements…"/></label>{paletteGroups.map(g=><section className="b2-palette-group" key={g}><h4>{g}</h4>{toolboxFiltered.filter(e=>e.category===g).map(e=><button key={e.key} draggable={layoutMode==='free'} onDragStart={event=>{if(layoutMode!=='free')return;event.dataTransfer.effectAllowed='copy';event.dataTransfer.setData('application/x-oneengine-flow-element',JSON.stringify(e))}} onClick={()=>add(e)}><span className="b2-palette-icon">{g==='Logic'?<GitBranch size={15}/>:g==='Actions'?<Zap size={15}/>:<Database size={15}/>}</span><span><b>{e.label}</b><small>{e.description}</small></span></button>)}</section>)}</>:<div className="b2-manager"><button onClick={()=>setResourceDialog(true)}><Plus size={14}/> New Resource</button><label className="b2-manager-search"><Search size={14}/><input aria-label="Search this flow" value={managerSearch} onChange={e=>setManagerSearch(e.target.value)} placeholder="Search this flow…"/></label><label className="b2-manager-filter">Show<select value={managerFilter} onChange={e=>setManagerFilter(e.target.value)}><option value="all">All Resources</option><option value="unused">Unused Resources</option></select></label><section className="b2-manager-section"><h4>Resources</h4>{resources.filter(r=>(managerFilter==='all'||!nodes.some(n=>JSON.stringify(n.config||{}).includes(r.value)))&&(!managerSearch||[r.label,r.type,r.dataType,r.value].join(' ').toLowerCase().includes(managerSearch.toLowerCase()))).map(r=><button className="b2-manager-row" key={r.value} onClick={()=>setManagerDetail('resource:'+r.value)}><Database size={13}/><span><b>{r.label}</b><small>{r.type} · {r.dataType||''}</small></span><ChevronRight size={12}/></button>)}</section><section className="b2-manager-section"><h4>Elements</h4>{nodes.filter(n=>!managerSearch||[n.label,n.type,n.apiName].join(' ').toLowerCase().includes(managerSearch.toLowerCase())).map(n=><button className="b2-manager-row" key={n.id} onClick={()=>{setSelected(n.id);setManagerDetail('node:'+n.id)}}><Workflow size={13}/><span><b>{n.label}</b><small>{n.type.replaceAll('_',' ')} · {n.apiName}</small></span><ChevronRight size={12}/></button>)}</section>{managerDetail?<div className="b2-manager-detail">{managerDetail.startsWith('resource:')?(()=>{const value=managerDetail.slice(9),resource=resources.find(item=>String(item.value)===value);if(!resource)return null;const usedBy=nodes.filter(node=>JSON.stringify(node.config||{}).includes(value));return <><header><b>{resource.label}</b><button onClick={()=>setManagerDetail('')}><X size={13}/></button></header><dl><div><dt>API Name</dt><dd>{resource.apiName||resourceNameOf(resource)}</dd></div><div><dt>Type</dt><dd>{resource.type}</dd></div><div><dt>Data Type</dt><dd>{resource.dataType||'Text'}{resource.isCollection?' Collection':''}</dd></div><div><dt>Used By</dt><dd>{usedBy.length}</dd></div></dl>{resource.availableInput?<span className="b2-detail-badge">Input</span>:null}{resource.availableOutput?<span className="b2-detail-badge">Output</span>:null}{usedBy.map(node=><button key={node.id} onClick={()=>{setSelected(node.id);setTab('elements')}}><Workflow size={12}/>{node.label}</button>)}</>})():(()=>{const id=managerDetail.slice(5),node=nodes.find(item=>String(item.id)===id);if(!node)return null;const incoming=edges.filter(edge=>String(edge.target)===id),outgoing=edges.filter(edge=>String(edge.source)===id);return <><header><b>{node.label}</b><button onClick={()=>setManagerDetail('')}><X size={13}/></button></header><dl><div><dt>API Name</dt><dd>{node.apiName}</dd></div><div><dt>Type</dt><dd>{node.type.replaceAll('_',' ')}</dd></div><div><dt>Incoming</dt><dd>{incoming.length}</dd></div><div><dt>Outgoing</dt><dd>{outgoing.length}</dd></div></dl><button onClick={()=>{setSelected(node.id);setTab('elements')}}><Settings2 size={12}/> Open Properties</button></>})()}</div>:null}</div>}
      </aside>:null}
      <main className="b2-canvas">{layoutMode==='free'?<Builder2GraphCanvas nodes={nodes} edges={edges} onSelect={setSelected} onOpen={id=>setSelected(id)} onDropElement={addFreeForm} onNodesChangeExternal={positions=>{setNodes(ns=>ns.map(n=>positions[n.id]?{...n,position:positions[n.id]}:n));setDirty(true)}} onEdgesChangeExternal={next=>{setEdges(next);setDirty(true)}}/>:<><div className="b2-zoom"><button onClick={()=>setZoom(z=>Math.max(50,z-10))}><ZoomOut size={14}/></button><span>{zoom}%</span><button onClick={()=>setZoom(z=>Math.min(150,z+10))}><ZoomIn size={14}/></button></div><div className={`b2-flow ${layoutMode==='free'?'is-free-form':''}`} style={{transform:`scale(${zoom/100})`,transformOrigin:'top center'}}><button className={`b2-start ${startOpen?'is-selected':''}`} onClick={()=>setStartOpen(true)}><span>Start</span><small>{startConfig.objectKey?`${startConfig.objectKey} · ${String(startConfig.trigger).replaceAll('_',' ')}`:'Configure Trigger'}</small></button><div className="b2-line"/>
        {autoRows.map(row=>{const n=row.node,i=row.index;if(row.kind==='group')return <div key={'group:'+row.group.id} className="b2-group-header"><button type="button" onClick={()=>toggleGroup(row.group.id)}><span>{row.group.collapsed?<ChevronRight size={14}/>:<ChevronDown size={14}/>}</span><span><b>{row.group.name}</b><small>{row.group.description||'Element group'}</small></span><small>{nodes.filter(node=>node.groupId===row.group.id).length}</small></button></div>;return <div key={n.id} className={`b2-step-wrap ${branchCollapsed[n.id]?'is-branch-collapsed':''}`}><button className="b2-add" aria-label={`Add element at position ${i+1}`} onClick={()=>openSelectorAt(i)}><Plus size={14}/></button><div className="b2-line"/><button data-node-id={n.id} className={`b2-node ${selected===n.id||selectedMany.includes(n.id)?'is-selected':''} ${n.groupId?'is-grouped':''}`} onClick={()=>{if(multiSelect){setSelectedMany(v=>v.includes(n.id)?v.filter(x=>x!==n.id):[...v,n.id]);return}setSelected(n.id);if(n.type==='SCREEN')setScreenEditing(n.id);if(n.type==='ACTION')setActionEditing(n.id)}}><span className="b2-node-icon">{n.type==='DECISION'?<GitBranch size={16}/>:n.type==='COLLECTION_FILTER'?<ListFilter size={16}/>:n.type==='ACTION'?<Zap size={16}/>:<Database size={16}/>}</span><span><b>{n.label}</b><small>{n.type.replaceAll('_',' ')}</small>{n.description?<span className="b2-node-description" title={n.description}>ⓘ</span>:null}</span>{['DECISION','LOOP'].includes(n.type)||['ROUTE','RETRY'].includes(String(n.config?.faultMode||'').toUpperCase())?<span role="button" tabIndex={0} className="b2-branch-toggle" title="Collapse or expand paths" onClick={e=>{e.stopPropagation();setBranchCollapsed(x=>({...x,[n.id]:!x[n.id]}))}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();setBranchCollapsed(x=>({...x,[n.id]:!x[n.id]}))}}}>{branchCollapsed[n.id]?<ChevronRight size={13}/>:<ChevronDown size={13}/>}</span>:null}<span className="b2-node-menu" onClick={e=>{e.stopPropagation();setNodeMenu(nodeMenu===n.id?'':n.id)}}><MoreVertical size={15}/>{nodeMenu===n.id?<span className="b2-node-popover"><button onClick={e=>{e.stopPropagation();duplicateNode(n.id)}}><Copy size={13}/> Copy</button><button onClick={e=>{e.stopPropagation();removeNode(n.id)}}><Trash2 size={13}/> Delete</button></span>:null}</span></button>{!branchCollapsed[n.id]&&pathSummaryFor(n).length?<div className="b2-path-summary">{pathSummaryFor(n).map((path,index)=><button key={path.kind+':'+index} onClick={()=>path.targets?.[0]&&setSelected(path.targets[0])}><span>{path.label}</span><ChevronRight size={11}/><b>{(path.targets||[]).map(id=>nodeLabelById.get(String(id))||'Missing element').join(' → ')}</b></button>)}</div>:null}<div className="b2-line"/></div>})}
        <button className="b2-add" aria-label="Add element before End" onClick={()=>openSelectorAt(nodes.length)}><Plus size={14}/></button><div className="b2-line"/><div className="b2-end">■ <span>End</span></div>
      </div></>} </main>
      <aside className="b2-properties"><header><div><b>{current?.label||'Properties'}</b><small>{current?current.type.replaceAll('_',' '):'Select an element'}</small></div>{current?<button onClick={()=>setSelected('')}><X size={16}/></button>:null}</header><Properties node={current} onPatch={patch} {...{objects,resources,actions,subflows,nodes,flowType,startConfig}} onNew={()=>setResourceDialog(true)}/></aside>
    </div>
    {selector?<div className="b2-selector"><header><div><h3>Add Element</h3><p>Select what the flow should do next.</p></div><button onClick={()=>{setSelector(false);setInsertIndex(null);setAddSearch('')}}><X size={18}/></button></header><label className="b2-selector-search"><Search size={15}/><input aria-label="Search add element" autoFocus value={addSearch} onChange={e=>setAddSearch(e.target.value)} placeholder="Search elements…"/></label>{clipboard.length?<button className="b2-paste-here" onClick={()=>pasteClipboardAt(Number.isInteger(insertIndex)?insertIndex:nodes.length)}><Copy size={14}/> Paste {clipboard.length} Element{clipboard.length===1?'':'s'} Here</button>:null}<div className="b2-selector-body">{paletteGroups.map(g=><section key={g}><h4>{g}</h4><div>{addFiltered.filter(e=>e.category===g).map(e=><button key={e.key} onClick={()=>add(e)}><span>{g==='Logic'?<GitBranch/>:g==='Actions'?<Zap/>:<Database/>}</span><span><b>{e.label}</b><small>{e.description}</small></span></button>)}</div></section>)}</div></div>:null}
    {startOpen?<StartProperties value={startConfig} onChange={v=>{setStartConfig(v);setDirty(true)}} objects={objects} flowType={flowType} onClose={()=>setStartOpen(false)}/>:null}
    {flowPropsOpen?<div className="b2-modal-backdrop"><div className="b2-modal"><header><div><h3>Flow Properties</h3><p>Version properties and execution context.</p></div><button onClick={()=>setFlowPropsOpen(false)}><X size={18}/></button></header><div className="b2-form"><label>Flow Type<input value={FLOW_TYPES[flowType]?.label||flowType} disabled readOnly/></label><label>Label<input value={flowProps.label} onChange={e=>setFlowProps(p=>({...p,label:e.target.value}))}/></label><label>API Name<input value={flowProps.apiName} onChange={e=>setFlowProps(p=>({...p,apiName:e.target.value}))}/></label><label>Description<textarea rows={4} value={flowProps.description} onChange={e=>setFlowProps(p=>({...p,description:e.target.value}))}/></label><label>API Version<input value={flowProps.apiVersion} onChange={e=>setFlowProps(p=>({...p,apiVersion:e.target.value}))}/></label><label>Run Context<select value={flowProps.runContext} onChange={e=>setFlowProps(p=>({...p,runContext:e.target.value}))}><option value="default">Default</option><option value="user">User Context — Enforces User Permissions</option><option value="system">System Context</option></select></label></div><footer><button onClick={()=>setFlowPropsOpen(false)}>Cancel</button><button className="is-primary" onClick={()=>{setFlowPropsOpen(false);setDirty(true)}}>Done</button></footer></div></div>:null}
    {groupDialog?<GroupDialog onClose={()=>setGroupDialog(false)} onCreate={createGroup}/>:null}
    {actionEditing?<div className="b2-action-dialog b2-modal-backdrop"><div className="b2-modal"><header><div><h3>Action</h3><p>Configure the selected OneEngine metadata action.</p></div><button onClick={()=>setActionEditing('')}><X size={18}/></button></header><Properties node={nodes.find(n=>n.id===actionEditing)} onPatch={patch} {...{objects,resources,actions,subflows,nodes,flowType,startConfig}} onNew={()=>setResourceDialog(true)}/><footer><button onClick={()=>setActionEditing('')}>Cancel</button><button className="is-primary" onClick={()=>setActionEditing('')}>Done</button></footer></div></div>:null}
    {supportPanel==='history'?<DrawerFrame title="Edit History" width={drawerWidth} onWidth={setDrawerWidth} onClose={()=>setSupportPanel('')}><div className="b2-history">{!workflowId?<p>Save the flow to create version history.</p>:!versions.length?<p>No saved versions yet.</p>:versions.map(version=><div key={version.id||version.version} className={String(historyPreview)===String(version.version)?'is-selected':''}><Clock3 size={13}/><span><button className="b2-history-title" onClick={()=>setHistoryPreview(version.version)}><b>Version {version.version}</b><small>{version.lifecycle_status||'DRAFT'} · {version.created_at?new Date(version.created_at).toLocaleString():'Saved version'}</small></button>{String(historyPreview)===String(version.version)?<span className="b2-history-actions"><small>{(version.definition?.action?.actions||[]).filter(action=>action?._builderResource!==true).length} elements · {version.definition?.name||flowProps.label}</small><button disabled={busy} onClick={()=>restoreVersion(version.version)}>Restore as New Draft Version</button></span>:null}</span></div>)}</div></DrawerFrame>:null}
    {supportPanel==='debug'?<DrawerFrame title="Debug" width={drawerWidth} onWidth={setDrawerWidth} onClose={()=>setSupportPanel('')}><div className="b2-debug-tabs"><button className={debugTab==='setup'?'is-active':''} onClick={()=>setDebugTab('setup')}>Setup</button><button className={debugTab==='details'?'is-active':''} onClick={()=>setDebugTab('details')}>Details</button></div>{debugTab==='setup'?<div className="b2-drawer-body"><p>Debug the current draft safely. Database changes are rolled back and external actions are simulated.</p>{flowType==='record'?<label>Triggering Record ID<input value={debugRecordId} onChange={e=>setDebugRecordId(e.target.value)} placeholder="Leave blank to use the latest matching record"/></label>:null}{inputResources.map(resource=><label key={resource.value}>{resource.label}<input value={debugInputs[resourceNameOf(resource)]??''} onChange={e=>setDebugInputs(current=>({...current,[resourceNameOf(resource)]:e.target.value}))}/></label>)}<button className="is-primary" disabled={busy||issues.some(issue=>issue.level==='error')} onClick={()=>runDiagnostic('debug')}>Run Debug</button></div>:<DebugDetails result={debugResult} onSelectNode={id=>{setSelected(id);setSupportPanel('')}}/>}</DrawerFrame>:null}
    {supportPanel==='testmode'?<DrawerFrame title="Test Mode" width={drawerWidth} onWidth={setDrawerWidth} onClose={()=>setSupportPanel('')}><div className="b2-debug-tabs"><button className={debugTab==='setup'?'is-active':''} onClick={()=>setDebugTab('setup')}>Setup</button><button className={debugTab==='details'?'is-active':''} onClick={()=>setDebugTab('details')}>Results</button></div>{debugTab==='setup'?<div className="b2-drawer-body"><p>Run the current draft as a rollback-safe test. Use View Tests for reusable assertion-based scenarios.</p>{flowType==='record'?<label>Triggering Record ID<input value={debugRecordId} onChange={e=>setDebugRecordId(e.target.value)} placeholder="Leave blank to use the latest matching record"/></label>:null}{inputResources.map(resource=><label key={resource.value}>{resource.label}<input value={debugInputs[resourceNameOf(resource)]??''} onChange={e=>setDebugInputs(current=>({...current,[resourceNameOf(resource)]:e.target.value}))}/></label>)}<button className="is-primary" disabled={busy||issues.some(issue=>issue.level==='error')} onClick={()=>runDiagnostic('test')}>Run Test</button></div>:<DebugDetails result={debugResult} onSelectNode={id=>{setSelected(id);setSupportPanel('')}}/>}</DrawerFrame>:null}
    {supportPanel==='run'?<DrawerFrame title="Run Flow" width={drawerWidth} onWidth={setDrawerWidth} onClose={()=>setSupportPanel('')}><div className="b2-drawer-body"><p>Run the most recently saved version. Unsaved Builder changes are not included.</p>{flowType==='record'?<label>Triggering Record ID<input value={debugRecordId} onChange={e=>setDebugRecordId(e.target.value)} placeholder="Leave blank to use the latest matching record"/></label>:null}<button className="is-primary" disabled={!workflowId||busy} onClick={()=>runDiagnostic('run',{saved:true})}>Run Saved Version</button>{debugResult?<DebugDetails result={debugResult} onSelectNode={id=>{setSelected(id);setSupportPanel('')}}/>:null}</div></DrawerFrame>:null}
    {supportPanel==='tests'?<DrawerFrame title="Flow Tests" width={drawerWidth} onWidth={setDrawerWidth} onClose={()=>setSupportPanel('')}><div className="b2-tests-panel">{!workflowId?<p>Save this flow before creating reusable tests.</p>:!flowTests.length?<div className="b2-debug-empty"><Monitor size={24}/><b>No saved tests</b><span>Create a scenario with one or more assertions.</span></div>:flowTests.map(test=><article key={test.id}><span><b>{test.name}</b><small>{test.last_status||'Not run'}{test.last_run_at?' · '+new Date(test.last_run_at).toLocaleString():''}</small></span><div><button disabled={busy} onClick={()=>runSavedTest(test)}>Run</button><button disabled={busy} onClick={()=>editTest(test)}>Edit</button><button disabled={busy} onClick={()=>deleteSavedTest(test)}>Delete</button></div>{test.last_result?.assertionResult?<small>{test.last_result.assertionResult.passed===false?'Assertions failed':'Assertions passed'}</small>:null}</article>)}<button className="is-primary" disabled={!workflowId||busy} onClick={openNewTest}><Plus size={13}/> Create Test</button></div></DrawerFrame>:null}
    {testDialog?<TestEditorDialog draft={testDraft} setDraft={setTestDraft} nodes={nodes} resources={resources} onClose={()=>setTestDialog(false)} onSave={saveTest} busy={busy}/>:null}
    {resourceDialog?<ResourceDialog objects={objects} onClose={()=>setResourceDialog(false)} onCreate={r=>{setResources(x=>[...x,r]);setResourceDialog(false)}}/>:null}
  </div>
}
