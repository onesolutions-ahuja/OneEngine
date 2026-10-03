export const FLOW_TYPES = {
  record: { label: 'Record-Triggered Flow', start: 'record', testMode: true },
  schedule: { label: 'Schedule-Triggered Flow', start: 'schedule', testMode: false },
  autolaunched: { label: 'Autolaunched Flow', start: 'none', testMode: true },
  screen: { label: 'Screen Flow', start: 'none', testMode: false },
  platform_event: { label: 'Platform Event-Triggered Flow', start: 'platform_event', testMode: false },
  recommendation_strategy: { label: 'Recommendation Strategy Flow', start: 'none', testMode: true },
  instruction: { label: 'Instruction Flow', start: 'none', testMode: true },
  kiosk: { label: 'Kiosk Experience', start: 'none', testMode: false },
}

const ALL_FLOW_TYPES = Object.keys(FLOW_TYPES)

export const ELEMENT_RULES = {
  GET_RECORDS: { types: ALL_FLOW_TYPES },
  CREATE_RECORDS: { types: ALL_FLOW_TYPES, disallowBeforeSave: true },
  UPDATE_RECORDS: { types: ALL_FLOW_TYPES, disallowBeforeSave: true },
  DELETE_RECORDS: { types: ALL_FLOW_TYPES, disallowBeforeSave: true },
  ASSIGNMENT: { types: ALL_FLOW_TYPES },
  DECISION: { types: ALL_FLOW_TYPES },
  LOOP: { types: ALL_FLOW_TYPES },
  COLLECTION_FILTER: { types: ALL_FLOW_TYPES },
  COLLECTION_SORT: { types: ALL_FLOW_TYPES },
  WAIT: { types: ['record','schedule','autolaunched','platform_event'], disallowBeforeSave: true },
  TRANSFORM: { types: ALL_FLOW_TYPES },
  CUSTOM_ERROR: { types: ['record'] },
  SUBFLOW: { types: ALL_FLOW_TYPES, disallowBeforeSave: true },
  SCREEN: { types: ['screen','kiosk'] },
  ACTION: { types: ALL_FLOW_TYPES, disallowBeforeSave: true },
}

export const RESOURCE_TYPES = [
  'Variable','Constant','Formula','Text Template','Choice',
  'Record Choice Set','Collection Choice Set','Picklist Choice Set','Stage'
]

export function isBeforeSave(flowType,startConfig={}) {
  return flowType === 'record' && startConfig.optimize === 'fast'
}

export function elementAllowed(type,flowType,startConfig={}) {
  const rule = ELEMENT_RULES[type]
  if (!rule) return true
  if (!rule.types.includes(flowType)) return false
  if (rule.disallowBeforeSave && isBeforeSave(flowType,startConfig)) return false
  return true
}

export function automaticResources(flowType,startConfig={}) {
  const common = [
    {value:'$user.id',label:'Current User',type:'Global Variable'},
    {value:'$now',label:'Current Date/Time',type:'Global Variable'},
    {value:'$Flow.CurrentStage',label:'Current Stage',type:'Global Variable'},
  ]
  if (flowType === 'record') {
    common.unshift({value:'$previous',label:'Previous Record',type:'Record',children:true})
    common.unshift({value:'$record',label:'Current Record',type:'Record',children:true})
  }
  if (flowType === 'platform_event') {
    common.unshift({value:'$record',label:'Platform Event Record',type:'Record',children:true})
  }
  return common
}

export function normalizeGraph(nodes=[],edges=[]) {
  const ids = new Set(nodes.map(n=>n.id))
  return {
    nodes,
    edges: edges.filter(e=>ids.has(e.source)&&ids.has(e.target)).map(e=>({
      id:e.id||`${e.source}:${e.sourceHandle||'default'}:${e.target}`,
      source:e.source,
      target:e.target,
      sourceHandle:e.sourceHandle||'default',
      kind:e.kind||'normal',
      label:e.label||''
    }))
  }
}

export function validateDefinition({flowType,startConfig={},nodes=[],edges=[],resources=[],actions=[],subflows=[]}) {
  const issues=[]
  const add=(level,code,text,node='')=>issues.push({level,code,text,node})
  if (!FLOW_TYPES[flowType]) add('error','FLOW_TYPE','Select a supported flow type.')
  if (flowType==='record') {
    if (!startConfig.objectKey) add('error','START_OBJECT','Record-triggered flow requires an object.')
    if (!startConfig.trigger) add('error','START_TRIGGER','Record-triggered flow requires a trigger event.')
    if ((startConfig.conditionLogic||'all')!=='none' && !(startConfig.conditions||[]).some(row=>row?.resource)) add('error','START_CONDITION_REQUIRED','Add a Start condition or choose None — Always Run.')
  }
  if (flowType==='schedule') {
    if (!startConfig.schedule?.frequency) add('error','START_SCHEDULE','Schedule-triggered flow requires a frequency.')
    if (!startConfig.schedule?.startDate) add('error','START_DATE','Schedule-triggered flow requires a start date.')
    if (!startConfig.schedule?.startTime) add('error','START_TIME','Schedule-triggered flow requires a start time.')
  }
  if (flowType==='platform_event' && !startConfig.eventKey) add('error','START_EVENT','Platform Event-triggered flow requires an event.')
  for (const n of nodes) {
    if (!String(n.label||'').trim()) add('error','ELEMENT_LABEL','Element label is required.',n.id)
    if (!elementAllowed(n.type,flowType,startConfig)) add('error','ELEMENT_NOT_ALLOWED',`${n.label||n.type} isn't available for this flow configuration.`,n.id)
    if (n.type==='ACTION'&&!n.config?.actionKey) add('error','ACTION_REQUIRED',`${n.label}: Select an action.`,n.id)
    if (n.type==='ACTION'&&n.config?.actionKey) {
      const definition=actions.find(action=>String(action?.key)===String(n.config.actionKey))
      for (const key of definition?.schema?.required||[]) if (n.config?.inputs?.[key]===undefined||n.config?.inputs?.[key]===null||n.config?.inputs?.[key]==='') add('error','ACTION_INPUT_REQUIRED',`${n.label}: ${key} is required.`,n.id)
    }
    if (n.type==='SUBFLOW'&&!String(n.config?.flow||'').trim()) add('error','SUBFLOW_REQUIRED',`${n.label}: Select a subflow.`,n.id)
    if (n.type==='SUBFLOW'&&n.config?.flow) {
      const flow=subflows.find(item=>String(item?.id)===String(n.config.flow)||String(item?.apiName)===String(n.config.flow))
      for (const input of flow?.inputContract||[]) if(input?.required===true&&(n.config?.inputs?.[input.name]===undefined||n.config?.inputs?.[input.name]===null||n.config?.inputs?.[input.name]==='')) add('error','SUBFLOW_INPUT_REQUIRED',`${n.label}: ${input.label||input.name} is required.`,n.id)
    }
    if (n.type==='LOOP'&&!n.config?.collection) add('error','LOOP_COLLECTION_REQUIRED',`${n.label}: Select a collection variable.`,n.id)
    if (n.type==='LOOP'&&!String(n.config?.itemVariable||'').trim()) add('error','LOOP_ITEM_REQUIRED',`${n.label}: Enter the Current Item Variable.`,n.id)
    if (n.type==='LOOP'&&!(n.config?.bodyBranchTargets||[]).length&&!n.config?.bodyBranchTarget) add('error','LOOP_BODY_REQUIRED',`${n.label}: Select at least one element in the loop body.`,n.id)
    if (n.type==='COLLECTION_SORT'&&!n.config?.collection) add('error','SORT_COLLECTION_REQUIRED',`${n.label}: Select a collection.`,n.id)
    if (n.type==='COLLECTION_SORT'&&!String(n.config?.sortField||'').trim()) add('error','SORT_FIELD_REQUIRED',`${n.label}: Enter a sort field.`,n.id)
    if (n.type==='COLLECTION_FILTER'&&!n.config?.collection) add('error','FILTER_COLLECTION_REQUIRED',`${n.label}: Select a collection.`,n.id)
    if (n.type==='COLLECTION_FILTER'&&!(n.config?.conditions||[]).some(row=>row?.resource)) add('error','FILTER_CONDITION_REQUIRED',`${n.label}: Add at least one filter condition.`,n.id)
    if (n.type==='TRANSFORM') {
      if(!n.config?.source) add('error','TRANSFORM_SOURCE_REQUIRED',`${n.label}: Select source data.`,n.id)
      try { const parsed=JSON.parse(String(n.config?.mappingsText||'{}')); if(!parsed||Array.isArray(parsed)||!Object.keys(parsed).length) add('error','TRANSFORM_MAPPING_REQUIRED',`${n.label}: Add at least one field mapping.`,n.id) } catch { add('error','TRANSFORM_MAPPING_INVALID',`${n.label}: Field Mappings must be valid JSON.`,n.id) }
    }
    if (n.type==='CUSTOM_ERROR'&&!String(n.config?.message||'').trim()) add('error','CUSTOM_ERROR_MESSAGE_REQUIRED',`${n.label}: Enter an error message.`,n.id)
    if (['GET_RECORDS','CREATE_RECORDS','UPDATE_RECORDS','DELETE_RECORDS'].includes(n.type)&&!n.config?.objectKey) add('error','OBJECT_REQUIRED',`${n.label}: Select an object.`,n.id)
    if (n.type==='GET_RECORDS' && (n.config?.conditionLogic||'all')!=='none' && !(n.config?.conditions||[]).some(x=>x?.resource)) add('error','CONDITION_REQUIRED',`${n.label}: Configure at least one field condition or choose None — Get All Records.`,n.id)
    if (n.type==='GET_RECORDS' && n.config?.sortOrder && n.config.sortOrder!=='none' && !n.config?.sortBy) add('error','GET_SORT_FIELD_REQUIRED',`${n.label}: Select a field to sort by.`,n.id)
    if (n.type==='GET_RECORDS' && n.config?.limit==='limited' && !(Number(n.config?.maxRecords)>=2)) add('error','RECORD_LIMIT_REQUIRED',`${n.label}: Enter a maximum number of records.`,n.id)
    if (n.type==='CREATE_RECORDS' && !(n.config?.fieldValues||[]).some(x=>x?.field)) add('error','CREATE_FIELD_REQUIRED',`${n.label}: Add at least one field value.`,n.id)
    if (n.type==='UPDATE_RECORDS' && !n.config?.sourceRecord) add('error','UPDATE_RECORD_REQUIRED',`${n.label}: Select a record or record collection.`,n.id)
    if (n.type==='UPDATE_RECORDS' && !(n.config?.fieldValues||[]).some(x=>x?.field)) add('error','UPDATE_FIELD_REQUIRED',`${n.label}: Add at least one field value to update.`,n.id)
    if (n.type==='DELETE_RECORDS' && !n.config?.sourceRecord) add('error','DELETE_RECORD_REQUIRED',`${n.label}: Select a record or record ID.`,n.id)
    if (n.type==='ASSIGNMENT' && !(n.config?.assignments||[]).some(row=>row?.resource)) add('error','ASSIGNMENT_REQUIRED',`${n.label}: Add at least one variable assignment.`,n.id)
    if (n.type==='DECISION' && !(n.config?.outcomes||[]).length) add('error','DECISION_OUTCOME_REQUIRED',`${n.label}: Add at least one outcome.`,n.id)
    if (n.type==='DECISION') (n.config?.outcomes||[]).forEach((o,i)=>{if(!String(o?.label||'').trim()) add('error','DECISION_OUTCOME_LABEL',`${n.label}: Outcome ${i+1} needs a label.`,n.id);if(!(o?.conditions||[]).some(x=>x?.resource)) add('error','DECISION_OUTCOME_CONDITION',`${n.label}: ${o?.label||`Outcome ${i+1}`} needs conditions.`,n.id)})
    if (n.type==='WAIT' && (n.config?.waitType||'duration')==='duration' && !(Number(n.config?.amount)>0)) add('error','WAIT_DURATION_REQUIRED',`${n.label}: Enter a wait duration.`,n.id)
    if (n.type==='WAIT' && n.config?.waitType==='date' && !n.config?.dateResource) add('error','WAIT_DATE_REQUIRED',`${n.label}: Select a date/time resource.`,n.id)
    if (n.type==='WAIT' && n.config?.waitType==='conditions' && !(n.config?.conditions||[]).some(row=>row?.resource)) add('error','WAIT_CONDITION_REQUIRED',`${n.label}: Add at least one wait condition.`,n.id)
    if (['ROUTE','RETRY'].includes(String(n.config?.faultMode||'').toUpperCase())&&!(n.config?.faultBranchTargets||[]).length&&!n.config?.faultBranchTarget) add('error','FAULT_PATH_REQUIRED',`${n.label}: Select at least one element in the error path.`,n.id)
    if (String(n.config?.faultMode||'').toUpperCase()==='RETRY' && (Number(n.config?.retryCount||0)<1||Number(n.config?.retryCount||0)>3)) add('error','FAULT_RETRY_INVALID',`${n.label}: Retry Count must be between 1 and 3.`,n.id)
    if (n.type==='SCREEN'&&!(n.config?.components||[]).length) add('warning','EMPTY_SCREEN',`${n.label}: Screen has no components.`,n.id)
  }
  const names=new Set()
  for (const r of resources) {
    const name=String(r.label||r.apiName||'').trim().toLowerCase()
    if (!name) add('error','RESOURCE_NAME','Resource API name is required.')
    else if (names.has(name)) add('error','RESOURCE_DUPLICATE',`Duplicate resource API name: ${r.label||r.apiName}.`)
    else names.add(name)
  }
  const graph=normalizeGraph(nodes,edges)
  for (const e of graph.edges) {
    if (e.kind==='fault' && !e.source) add('error','FAULT_SOURCE','Fault connector requires a source element.')
  }
  return issues
}
