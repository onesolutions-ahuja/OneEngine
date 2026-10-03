import { validateDefinition } from './builder3Model.js'

export const runtimeType = type => ({CREATE_RECORDS:'CREATE_RECORD',UPDATE_RECORDS:'UPDATE_RECORD',DELETE_RECORDS:'DELETE_RECORD',DECISION:'CONDITION',SUBFLOW:'RUN_SUBFLOW'}[type] || type)
const operatorMap = {'Equals':'equals','Does Not Equal':'not_equals','Is Null':'is_empty','Is Changed':'changed','Greater Than':'greater_than','Greater Than or Equal':'greater_than_or_equal','Less Than':'less_than','Less Than or Equal':'less_than_or_equal','Starts With':'starts_with','Ends With':'ends_with','Contains':'contains','In':'in','Not In':'not_in'}
export const compileConditions = conditions => (conditions || []).filter(c=>c.resource).map(c=>({field:c.resource,operator:operatorMap[c.operator]||c.operator,value:c.value}))
const resourceType = resource => resource.isCollection ? 'collection' : ({Text:'text',Number:'number',Currency:'number',Boolean:'boolean',Date:'date','Date/Time':'datetime',Record:'record'}[resource.dataType] || 'text')
export function compileBuilder3(nodes=[],resources=[],edges=[]) {
  const initializers = resources.filter(r=>!r.availableInput).map(r=>{
    const c=r.choiceConfig||{},base={id:`resource_${r.apiName}`,label:r.label,resourceName:r.apiName};
    if(r.type==='Choice')return {...base,type:'CHOICE',choiceLabel:r.label,choiceValue:r.defaultValue,choiceDataType:resourceType(r)};
    if(r.type==='Record Choice Set')return {...base,type:'RECORD_CHOICE_SET',object:r.objectKey,choiceLabelField:c.labelField,choiceValueField:c.valueField,filters:compileConditions(c.conditions),sortField:c.sortField,sortDirection:c.sortDirection||'asc',limit:c.limit||50};
    if(r.type==='Collection Choice Set')return {...base,type:'COLLECTION_CHOICE_SET',collection:r.defaultValue,choiceLabelPath:c.labelField,choiceValuePath:c.valueField};
    if(r.type==='Picklist Choice Set')return {...base,type:'PICKLIST_CHOICE_SET',object:r.objectKey,fieldApiName:r.defaultValue};
    if(r.type==='Stage')return {...base,type:'STAGE',stageLabel:r.label,stageValue:r.apiName,stageOrder:Number(r.defaultValue)};
    return {...base,type:r.type==='Formula'?'FORMULA':r.type==='Text Template'?'TEXT_TEMPLATE':'CONSTANT',resourceType:resourceType(r),resultType:resourceType(r),value:r.defaultValue,templateText:r.defaultValue,expression:r.defaultValue,inputs:r.inputs||{}};
  })
  return [...initializers,...nodes.map(n=>{
    const c=n.config||{}
    const base={...c,id:n.id,label:n.label,apiName:n.apiName,description:n.description,type:n.type==='ACTION'?c.actionKey:runtimeType(n.type),store:n.apiName}
    if(n.type==='ACTION')return {...base,...c.inputs,builder3InputFields:Object.keys(c.inputs||{})}
    if(n.type==='GET_RECORDS')return {...base,filters:compileConditions(c.conditions),match:c.conditionLogic==='any'?'any':'all',builder3Data:c.store&&c.store!=='auto'?{mode:c.store,fields:(c.selectedFields||[]).filter(Boolean),assignments:c.fieldAssignments||[]}:undefined,builder3AllRecords:c.limit==='all',builder3RecordLimit:c.limit==='limited',store:c.limit==='all'||c.limit==='limited'?'all':'first',sortField:c.sortBy,sortDirection:c.sortOrder==='none'?undefined:c.sortOrder,limit:c.limit==='all'?20000:c.limit==='limited'?Number(c.maxRecords):1}
    if(n.type==='CREATE_RECORDS'||n.type==='UPDATE_RECORDS')return {...base,builder3Data:n.type==='CREATE_RECORDS'&&c.valueMode&&c.valueMode!=='manual'?{source:c.sourceRecord}:n.type==='UPDATE_RECORDS'&&!c.recordId?{mode:c.updateMode||'conditions',source:c.updateMode==='record'?c.sourceRecord:undefined,filters:compileConditions(c.conditions),match:c.conditionLogic==='any'?'any':'all'}:undefined,recordId:c.recordId||'$record.id',fieldValues:Object.fromEntries((c.fieldValues||[]).filter(x=>x.field).map(x=>[x.field,x.value]))}
    if(n.type==='DELETE_RECORDS')return {...base,builder3Data:!c.recordId?{mode:c.deleteMode||'conditions',source:c.deleteMode==='record'?c.sourceRecord:undefined,filters:compileConditions(c.conditions),match:c.conditionLogic==='any'?'any':'all'}:undefined,recordId:c.recordId||'$record.id'}
    if(n.type==='ASSIGNMENT')return {...base,assignments:(c.assignments||[{variable:c.resource,operator:c.operator,value:c.value}]).map(r=>({variable:r.variable?.startsWith('variables.')?r.variable:`variables.${r.variable}`,variableType:resourceType(resources.find(x=>x.value===r.variable||`variables.${x.apiName}`===r.variable||x.apiName===r.variable)||{}),operator:{Equals:'set',Add:'add',Subtract:'subtract','Add Item':'append'}[r.operator]||r.operator||'set',value:r.value}))}
    if(n.type==='DECISION')return {...base,outcomes:(c.outcomes||[]).map(o=>({...o,condition:{match:o.conditionLogic==='any'?'any':'all',conditions:compileConditions(o.conditions)},branch:edges.filter(e=>e.source===n.id&&e.sourceHandle===o.id).map(e=>e.target)})),defaultBranch:edges.filter(e=>e.source===n.id&&e.sourceHandle==='default').map(e=>e.target)}
    if(n.type==='LOOP')return {...base,itemVariable:c.itemVariable||`CurrentItem_${n.apiName}`,iterationOrder:c.direction==='last'?'LAST_TO_FIRST':'FIRST_TO_LAST',bodyBranch:edges.filter(e=>e.source===n.id&&e.sourceHandle==='body').map(e=>e.target)}
    if(n.type==='COLLECTION_FILTER')return {...base,filters:compileConditions(c.conditions),match:c.conditionLogic==='any'?'any':'all'}
    if(n.type==='COLLECTION_SORT')return {...base,sortField:c.sortBy,sortDirection:c.order||'asc',limit:c.max?Number(c.max):undefined}
    if(n.type==='TRANSFORM')return {...base,collection:c.source,transformMappings:c.mappings||{}}
    if(n.type==='CUSTOM_ERROR')return {...base,errorMessage:c.message,errorField:c.field}
    if(n.type==='SCREEN')return {...base,screen:{...c,label:n.label,apiName:n.apiName,components:(c.components||[]).map(x=>({...x,name:x.apiName}))}}
    if(n.type==='WAIT'&&c.waitType==='conditions')return {...base,type:'WAIT_FOR_CONDITIONS',waitCondition:{match:c.conditionLogic==='any'?'any':'all',conditions:compileConditions(c.conditions)},pollSeconds:Number(c.pollSeconds)||60}
    if(n.type==='WAIT')return {...base,type:c.waitType==='date'?'WAIT_UNTIL_DATE':'WAIT',durationSeconds:(Number(c.amount)||0)*({minutes:60,hours:3600,days:86400}[c.unit||'minutes']),resumeAt:c.waitType==='date'?c.dateResource:undefined}
    if(n.type==='SUBFLOW')return {...base,workflowId:c.flow,workflowInputs:c.inputs||{},outputMappings:c.outputs||{}}
    return base
  })]
}
function schemaIssues(schema,value,path='') {
  const errors=[]
  for(const key of schema.required||[])if(value?.[key]===undefined||value?.[key]===null||value?.[key]==='')errors.push(`${path}${key} is required.`)
  for(const [key,field] of Object.entries(schema.properties||{})) {
    const v=value?.[key];if(v===undefined||v===null||v==='')continue
    if(typeof v==='string'&&/^(\$|variables\.|steps\.)/.test(v))continue
    if(field.enum&&!field.enum.includes(v))errors.push(`${path}${key} has an invalid value.`)
    if(field.type==='array'&&!Array.isArray(v))errors.push(`${path}${key} must be a collection.`)
    if(field.type==='object'&&(typeof v!=='object'||Array.isArray(v)))errors.push(`${path}${key} must be a mapping.`)
    if(['number','integer'].includes(field.type)&&(!Number.isFinite(Number(v))||(field.type==='integer'&&!Number.isInteger(Number(v)))))errors.push(`${path}${key} must be ${field.type}.`)
    if(field.type==='object'&&v&&typeof v==='object')errors.push(...schemaIssues(field,v,`${path}${key}.`))
    if(field.type==='array'&&Array.isArray(v)&&field.items?.properties)v.forEach((item,i)=>errors.push(...schemaIssues(field.items,item,`${path}${key}[${i+1}].`)))
  }
  return errors
}
export function validateBuilder3(definition) {
  const {nodes=[],resources=[],edges=[],actions=[],startConfig={}}=definition
  const issues=validateDefinition(definition)
  if(!nodes.length)issues.push({level:'error',code:'EMPTY_FLOW',text:'Add at least one element before activating the flow.',node:''})
  const add=(text,node='',code='BUILDER3')=>issues.push({level:'error',code,text,node})
  const names=new Set()
  for(const item of [...nodes,...resources]) {
    if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(item.apiName||''))add(`${item.label||'Resource'}: Enter a valid API name.`,item.id)
    const key=String(item.apiName||'').toLowerCase();if(names.has(key))add(`Duplicate API name: ${item.apiName}.`,item.id);names.add(key)
  }
  for(const r of resources){
    if(['Record Choice Set','Picklist Choice Set'].includes(r.type)&&!r.objectKey)add(`${r.label}: Select an object.`);
    if(['Record Choice Set','Collection Choice Set'].includes(r.type)&&(!r.choiceConfig?.labelField||!r.choiceConfig?.valueField))add(`${r.label}: Select choice label and value fields.`);
    if(r.type==='Collection Choice Set'&&!r.defaultValue)add(`${r.label}: Select a collection.`);
    if(r.type==='Picklist Choice Set'&&!r.defaultValue)add(`${r.label}: Select a picklist field.`);
  }
  const ids=new Set(nodes.map(n=>n.id))
  for(const edge of edges)if(!ids.has(edge.source)||!ids.has(edge.target))add('A connector references a deleted element.',edge.source,'BROKEN_CONNECTION')
  const known=new Set(resources.flatMap(r=>[r.apiName,r.value,`variables.${r.apiName}`]))
  function references(value,node) {
    if(typeof value==='string'&&value.startsWith('variables.')&&!known.has(value.split('.').slice(0,2).join('.')))add(`Unknown resource: ${value}.`,node,'BROKEN_RESOURCE')
    else if(value&&typeof value==='object')Object.values(value).forEach(v=>references(v,node))
  }
  for(const n of nodes) {
    const c=n.config||{};references(c,n.id)
    if(n.type==='ACTION') {
      const a=actions.find(a=>a.key===c.actionKey)
      if(c.actionKey&&!a)add(`${n.label}: The action is no longer registered.`,n.id)
      else if(a&&!a.schema?.properties)add(`${n.label}: This action needs a registered configuration schema.`,n.id)
      else if(a){
        schemaIssues(a.schema,c.inputs||{}).forEach(e=>add(`${n.label}: ${e}`,n.id,'ACTION_INPUT'))
        const checkTypes=(schema,value)=>{for(const [key,field] of Object.entries(schema.properties||{})){
          const v=value?.[key];if(typeof v==='string'&&v.startsWith('variables.')){
            const resource=resources.find(r=>r.apiName===v.split('.')[1]);
            if(resource&&v.split('.').length===2){const actual=resourceType(resource),expected=field.type;
              if(expected==='array'&&actual!=='collection'||expected==='object'&&actual!=='record'||['number','integer'].includes(expected)&&actual!=='number'||expected==='boolean'&&actual!=='boolean')add(`${n.label}: ${key} requires ${expected}; ${resource.apiName} is ${actual}.`,n.id,'RESOURCE_TYPE');
            }
          }else if(field.type==='object'&&v&&typeof v==='object')checkTypes(field,v);
          else if(field.type==='array'&&Array.isArray(v)&&field.items?.properties)v.forEach(item=>checkTypes(field.items,item));
        }};checkTypes(a.schema,c.inputs||{});
      }
    }
    if(n.type==='COLLECTION_FILTER'&&c.filterMode==='formula')add(`${n.label}: Formula collection filters require a runtime adapter.`,n.id,'RUNTIME_CAPABILITY')
    if(n.type==='COLLECTION_SORT'&&!c.sortBy)add(`${n.label}: Select a sort field.`,n.id)
    if(n.type==='GET_RECORDS'&&c.limit==='limited'&&(!Number.isInteger(Number(c.maxRecords))||Number(c.maxRecords)<1))add(`${n.label}: Enter a positive record limit.`,n.id)
    if(n.type==='LOOP'&&!edges.some(e=>e.source===n.id&&e.sourceHandle==='body'))add(`${n.label}: Connect at least one loop body element.`,n.id)
    // These UI modes need execution capabilities which the current registry does not supply.
    if(['GET_RECORDS','COLLECTION_FILTER'].includes(n.type)&&['custom','formula'].includes(c.conditionLogic))add(`${n.label}: The current runtime does not support this filter mode.`,n.id,'RUNTIME_CAPABILITY')
    if(n.type==='GET_RECORDS'&&c.store==='choose'&&!(c.selectedFields||[]).some(Boolean))add(`${n.label}: Select at least one field.`,n.id)
    if(n.type==='GET_RECORDS'&&c.store==='advanced'&&!(c.fieldAssignments||[]).some(r=>r.field&&r.resource))add(`${n.label}: Add a field-to-variable assignment.`,n.id)
    if(['CREATE_RECORDS','UPDATE_RECORDS'].includes(n.type)&&(!c.valueMode||c.valueMode==='manual')&&(!c.updateMode||c.updateMode==='conditions')&&!(c.fieldValues||[]).some(r=>r.field))add(`${n.label}: Add at least one field value.`,n.id)
    if(n.type==='CREATE_RECORDS'&&c.createCount==='multiple'&&c.valueMode!=='collection')add(`${n.label}: Multiple records require a collection.`,n.id)
    if(n.type==='CREATE_RECORDS'&&c.valueMode&&c.valueMode!=='manual'&&!c.sourceRecord)add(`${n.label}: Select a record resource.`,n.id)
    if(['UPDATE_RECORDS','DELETE_RECORDS'].includes(n.type)&&!c.recordId&&(c.updateMode==='record'||c.deleteMode==='record')&&!c.sourceRecord)add(`${n.label}: Select a record resource.`,n.id)
    if(n.type==='ASSIGNMENT'&&!(c.assignments||[{variable:c.resource}]).some(r=>r.variable))add(`${n.label}: Select a variable.`,n.id)
    if(n.type==='WAIT'&&c.waitType==='event')add(`${n.label}: Event/condition wait needs a runtime adapter.`,n.id,'RUNTIME_CAPABILITY')
    if(n.type==='TRANSFORM'&&!Object.keys(c.mappings||{}).length)add(`${n.label}: Add a source-to-target mapping.`,n.id)
    if(n.type==='CUSTOM_ERROR'&&!actions.some(a=>a.key==='CUSTOM_ERROR'))add(`${n.label}: Custom Error is not registered in this runtime.`,n.id,'RUNTIME_CAPABILITY')
  }
  if(['formula','custom'].includes(startConfig.conditionLogic))add('Start: Custom/formula entry logic needs a runtime adapter.','','RUNTIME_CAPABILITY')
  return issues
}
