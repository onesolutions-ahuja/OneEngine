import { resolveRecordPathValue } from "./platformRecordPaths.js";

export const PAGE_RESOURCE_TYPES = Object.freeze([
  "current_user","current_record","page_parameter","page_variable",
  "component_value","selected_record","flow_output","constant","formula",
]);
const API_NAME=/^[A-Za-z_][A-Za-z0-9_]*$/;
const PATH=/^[A-Za-z_][A-Za-z0-9_]*(\.(?:[A-Za-z_][A-Za-z0-9_]*|\d+))*$/;

export class PageResourceError extends Error {
  constructor(message){super(message);this.code="INVALID_PAGE_RESOURCE";}
}
const fail=(message)=>{throw new PageResourceError(message);};

export function normalizePageResource(resource){
  if(resource===null||resource===undefined||["string","number","boolean"].includes(typeof resource))return {type:"constant",value:resource};
  if(!resource||typeof resource!=="object"||Array.isArray(resource))fail("Page resource must be a resource object or constant");
  const type=String(resource.type||"constant");
  if(!PAGE_RESOURCE_TYPES.includes(type))fail(`Unsupported page resource type: ${type}`);
  if(type==="constant")return {type,value:resource.value??null};
  if(type==="formula"){
    const expression=String(resource.expression||"").trim();
    if(!expression||expression.length>2000)fail("Formula resource requires a valid expression");
    return {type,expression};
  }
  const key=String(resource.key||resource.name||"").trim();
  const field=String(resource.field||"").trim();
  if(["page_parameter","page_variable","component_value","selected_record","flow_output"].includes(type)&&!API_NAME.test(key))fail(`${type} requires a valid key`);
  if(field&&!PATH.test(field))fail("Page resource field path is invalid");
  return {type,...(key?{key}:{}),...(field?{field}:{})};
}

export function resolvePageResource(resource,context={}){
  const normalized=normalizePageResource(resource);
  const {type,key,field}=normalized;
  if(type==="constant")return normalized.value;
  if(type==="formula"){
    if(typeof context.resolveFormula!=="function")fail("Formula resolver is unavailable");
    return context.resolveFormula(normalized.expression,context);
  }
  if(type==="current_user")return field?resolveRecordPathValue(context.currentUser,field):context.currentUser;
  if(type==="current_record")return field?resolveRecordPathValue(context.currentRecord,field):context.currentRecord;
  if(type==="page_parameter")return context.pageParameters?.[key];
  if(type==="page_variable")return context.pageVariables?.[key];
  if(type==="component_value")return context.components?.[key]?.value;
  if(type==="selected_record"){
    const record=context.components?.[key]?.selectedRecord;
    return field?resolveRecordPathValue(record,field):record;
  }
  if(type==="flow_output"){
    const output=context.flowOutputs?.[key];
    return field?resolveRecordPathValue(output,field):output;
  }
  return undefined;
}

export function resolvePageBindingTree(value,context={}){
  if(Array.isArray(value))return value.map(item=>resolvePageBindingTree(item,context));
  if(!value||typeof value!=="object")return value;
  if(typeof value.type==="string"&&PAGE_RESOURCE_TYPES.includes(value.type))return resolvePageResource(value,context);
  return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,resolvePageBindingTree(item,context)]));
}
