// Builder 3 composes existing secured CRUD executors; it does not write SQL.
// The caller supplies metadata and the canonical action executor.
export async function executeBuilder3Data({action,context,resolve,execute,writableFields}) {
 const config=action.builder3Data;
 if(!config)return null;
 const assign=(path,value)=>{
  const parts=String(path||'').replace(/^variables\./,'').split('.');
  if(!parts.every(p=>/^[A-Za-z_][A-Za-z0-9_]*$/.test(p)&&!['__proto__','constructor','prototype'].includes(p)))throw new Error('Invalid output variable');
  let cursor=(context.workflowVariables||={}).variables||={};
  for(const part of parts.slice(0,-1))cursor=cursor[part]||={};
  cursor[parts.at(-1)]=value;
 };
 const plain={...action};delete plain.builder3Data;
 if(action.type==='GET_RECORDS'){
  const result=await execute(plain);
  const fields=config.fields||[];
  if(config.mode==='advanced')for(const mapping of config.assignments||[])assign(mapping.resource,action.store==='all'?(result.records||[]).map(r=>r[mapping.field]):result.record?.[mapping.field]);
  if(config.mode==='choose'){
   const project=r=>r&&Object.fromEntries(['id',...fields].filter((key,i,all)=>all.indexOf(key)===i).map(key=>{if(!Object.hasOwn(r,key))throw new Error(`Selected field "${key}" is unavailable`);return [key,r[key]]}));
   return {...result,record:project(result.record),records:(result.records||[]).map(project)};
  }
  return result;
 }
 let records;
 if(config.source){const source=resolve(config.source);if(!source||typeof source!=='object')throw new Error('Record resource was not produced');records=Array.isArray(source)?source:[source]}
 else if(config.mode==='conditions'){
  const result=await execute({type:'GET_RECORDS',objectKey:action.objectKey,objectId:action.objectId,filters:config.filters,match:config.match,store:'all',builder3AllRecords:true});records=result.records||[];
 }else throw new Error('Select a record resource or matching conditions');
 const allowed=action.type==='DELETE_RECORD'?null:await writableFields();
 const results=[];
 for(const record of records){
  if(!record||typeof record!=='object')throw new Error('The collection must contain records');
  const recordValues=Object.fromEntries(Object.entries(record).filter(([key])=>key!=='id'&&allowed?.has(key)));
  const next={...plain,recordId:record.id,fieldValues:config.source?recordValues:action.fieldValues};
  if(action.type!=='CREATE_RECORD'&&!next.recordId)throw new Error('A record resource has no ID');
  results.push(await execute(next));
 }
 return {status:'completed',count:results.length,records:results.map(r=>r.record||r.updated||r.deleted).filter(Boolean),results};
}
