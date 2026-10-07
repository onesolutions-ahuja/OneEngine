/*
 * Canonical OneEngine page-resource contract.
 *
 * Business pages store resource REFERENCES, never executable JavaScript or
 * business-specific field wiring. The same vocabulary is consumed by Page
 * Builder, runtime conditions/data queries and Flow input/output mappings.
 */
export const PAGE_RESOURCE_TYPES = Object.freeze([
  "current_user",
  "current_record",
  "page_parameter",
  "page_variable",
  "component_value",
  "selected_record",
  "flow_output",
  "constant",
  "formula",
]);

const API_NAME=/^[A-Za-z_][A-Za-z0-9_]*$/;
const PATH=/^[A-Za-z_][A-Za-z0-9_]*(\.(?:[A-Za-z_][A-Za-z0-9_]*|\d+))*$/;

export function pageResourcePath(resource={}) {
  const type=String(resource.type||"");
  const key=String(resource.key||resource.name||"").trim();
  const field=String(resource.field||"").trim();
  if(type==="current_user") return field ? `$user.${field}` : "$user";
  if(type==="current_record") return field ? `$record.${field}` : "$record";
  if(type==="page_parameter") return key ? `$page.params.${key}` : "$page.params";
  if(type==="page_variable") return key ? `$page.variables.${key}` : "$page.variables";
  if(type==="component_value") return key ? `$components.${key}.value` : "";
  if(type==="selected_record") return key ? `$components.${key}.selectedRecord${field?`.${field}`:""}` : "";
  if(type==="flow_output") return key ? `$flows.${key}${field?`.${field}`:""}` : "";
  return "";
}

export function normalizePageResource(resource) {
  if(resource===null||resource===undefined||["string","number","boolean"].includes(typeof resource)){
    return {type:"constant",value:resource};
  }
  if(!resource||typeof resource!=="object"||Array.isArray(resource)) return null;
  const type=PAGE_RESOURCE_TYPES.includes(resource.type)?resource.type:"constant";
  if(type==="constant") return {type,value:resource.value??null};
  if(type==="formula"){
    const expression=String(resource.expression||"").trim().slice(0,2000);
    return expression?{type,expression}:null;
  }
  const key=String(resource.key||resource.name||"").trim();
  const field=String(resource.field||"").trim();
  if(["page_parameter","page_variable","component_value","selected_record","flow_output"].includes(type)&&!API_NAME.test(key)) return null;
  if(field&&!PATH.test(field)) return null;
  return {type,...(key?{key}:{}),...(field?{field}:{})};
}

export function normalizePageResourceDefinitions(value={}) {
  const source=value&&typeof value==="object"&&!Array.isArray(value)?value:{};
  const parameters=Array.isArray(source.parameters)?source.parameters:[];
  const variables=Array.isArray(source.variables)?source.variables:[];
  const normalizeDefinition=(item,index)=> {
    const key=String(item?.key||item?.name||"").trim();
    if(!API_NAME.test(key)) return null;
    return {key,label:String(item?.label||key).slice(0,120),dataType:String(item?.dataType||item?.data_type||"text"),defaultValue:item?.defaultValue??item?.default_value??null,order:Number.isFinite(Number(item?.order))?Number(item.order):index};
  };
  return {
    parameters:parameters.map(normalizeDefinition).filter(Boolean).slice(0,50),
    variables:variables.map(normalizeDefinition).filter(Boolean).slice(0,100),
  };
}

function readPath(value,path){
  if(!path)return value;
  return String(path).split(".").reduce((current,part)=>current==null?undefined:current[part],value);
}

/* Client runtime resolver. Formula evaluation is deliberately delegated to the
   platform formula engine; arbitrary JS/eval is never executed here. */
export function resolvePageResource(resource,context={}) {
  const normalized=normalizePageResource(resource);
  if(!normalized)return undefined;
  const {type,key,field}=normalized;
  if(type==="constant")return normalized.value;
  if(type==="formula")return context.resolveFormula?.(normalized.expression);
  if(type==="current_user")return readPath(context.currentUser,field);
  if(type==="current_record")return readPath(context.currentRecord,field);
  if(type==="page_parameter")return context.pageParameters?.[key];
  if(type==="page_variable")return context.pageVariables?.[key];
  if(type==="component_value")return context.components?.[key]?.value;
  if(type==="selected_record")return readPath(context.components?.[key]?.selectedRecord,field);
  if(type==="flow_output")return readPath(context.flowOutputs?.[key],field);
  return undefined;
}

export function pageResourceOptions({ definitions = {}, components = [] } = {}) {
  const normalized = normalizePageResourceDefinitions(definitions);
  return [
    { group: "Context", type: "current_user", label: "Current User" },
    { group: "Context", type: "current_record", label: "Current Record" },
    ...normalized.parameters.map((item) => ({ group: "Page Parameters", type: "page_parameter", key: item.key, label: item.label })),
    ...normalized.variables.map((item) => ({ group: "Page Variables", type: "page_variable", key: item.key, label: item.label })),
    ...components.map((item) => ({ group: "Components", type: "component_value", key: item.id, label: `${item.label} · Value` })),
    ...components.map((item) => ({ group: "Components", type: "selected_record", key: item.id, label: `${item.label} · Selected Record` })),
    ...components.map((item) => ({ group: "Flow Outputs", type: "flow_output", key: item.id, label: `${item.label} · Flow Output` })),
    { group: "Other", type: "constant", label: "Constant" },
    { group: "Other", type: "formula", label: "Formula" },
  ];
}
