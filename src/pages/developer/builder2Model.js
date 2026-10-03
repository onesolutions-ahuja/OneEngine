export const FLOW_TYPES = {
  record: { label: 'Record-Triggered Flow', start: 'record', testMode: true },
  schedule: { label: 'Schedule-Triggered Flow', start: 'schedule', testMode: false },
  autolaunched: { label: 'Autolaunched Flow', start: 'none', testMode: true },
  screen: { label: 'Screen Flow', start: 'none', testMode: false },
  platform_event: { label: 'Platform Event-Triggered Flow', start: 'platform_event', testMode: false },
}

export const ELEMENT_RULES = {
  GET_RECORDS: { types: ['record','schedule','autolaunched','screen','platform_event'] },
  CREATE_RECORDS: { types: ['record','schedule','autolaunched','screen','platform_event'], disallowBeforeSave: true },
  UPDATE_RECORDS: { types: ['record','schedule','autolaunched','screen','platform_event'], disallowBeforeSave: true },
  DELETE_RECORDS: { types: ['record','schedule','autolaunched','screen','platform_event'], disallowBeforeSave: true },
  ASSIGNMENT: { types: ['record','schedule','autolaunched','screen','platform_event'] },
  DECISION: { types: ['record','schedule','autolaunched','screen','platform_event'] },
  LOOP: { types: ['record','schedule','autolaunched','screen','platform_event'] },
  COLLECTION_FILTER: { types: ['record','schedule','autolaunched','screen','platform_event'] },
  COLLECTION_SORT: { types: ['record','schedule','autolaunched','screen','platform_event'] },
  WAIT: { types: ['record','schedule','autolaunched','platform_event'], disallowBeforeSave: true },
  TRANSFORM: { types: ['record','schedule','autolaunched','screen','platform_event'] },
  CUSTOM_ERROR: { types: ['record'] },
  SUBFLOW: { types: ['record','schedule','autolaunched','screen','platform_event'], disallowBeforeSave: true },
  SCREEN: { types: ['screen'] },
  ACTION: { types: ['record','schedule','autolaunched','screen','platform_event'], disallowBeforeSave: true },
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

export function validateDefinition({flowType,startConfig={},nodes=[],edges=[],resources=[]}) {
  const issues=[]
  const add=(level,code,text,node='')=>issues.push({level,code,text,node})
  if (!FLOW_TYPES[flowType]) add('error','FLOW_TYPE','Select a supported flow type.')
  if (flowType==='record') {
    if (!startConfig.objectKey) add('error','START_OBJECT','Record-triggered flow requires an object.')
    if (!startConfig.trigger) add('error','START_TRIGGER','Record-triggered flow requires a trigger event.')
    if (startConfig.conditionLogic==='custom' && !String(startConfig.customConditionLogic||'').trim()) add('error','START_CUSTOM_LOGIC','Custom condition logic is required.')
    if (startConfig.conditionLogic==='formula' && !String(startConfig.formula||'').trim()) add('error','START_FORMULA','Start formula is required.')
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
    if (['GET_RECORDS','CREATE_RECORDS','UPDATE_RECORDS','DELETE_RECORDS'].includes(n.type)&&!n.config?.objectKey) add('error','OBJECT_REQUIRED',`${n.label}: Select an object.`,n.id)
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
