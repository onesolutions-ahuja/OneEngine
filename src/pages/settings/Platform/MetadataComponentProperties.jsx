const inputClass="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm";const labelClass="block text-xs font-medium text-slate-500";
function valueAt(node,key){return node?.[key]??node?.config?.[key]??""}
export default function MetadataComponentProperties({node,metadata,onChange,interactionEditor=null}){
 const fields=Array.isArray(metadata?.configurable)?metadata.configurable.filter(x=>x&&typeof x==="object"&&x.key):[];
 const set=(field,value)=>{const target=field.target==="config"?"config":"root";onChange?.(target==="config"?{config:{...(node.config||{}),[field.key]:value}}:{[field.key]:value})};
 return <div className="space-y-3">
  {fields.map(field=><div className="space-y-1" key={field.key}><label className={labelClass}>{field.label||field.key}</label>
   {field.type==="select"?<select className={inputClass} value={valueAt(node,field.key)} onChange={e=>set(field,e.target.value)}>{(field.options||[]).map(o=><option value={typeof o==="object"?o.value:o} key={typeof o==="object"?o.value:o}>{typeof o==="object"?o.label:o}</option>)}</select>
   :field.type==="boolean"?<input type="checkbox" checked={valueAt(node,field.key)===true} onChange={e=>set(field,e.target.checked)}/>
   :<input className={inputClass} type={field.type==="number"?"number":"text"} min={field.min} max={field.max} value={valueAt(node,field.key)} onChange={e=>set(field,field.type==="number"?Number(e.target.value):e.target.value)}/>}</div>)}
  {metadata?.interactions&&interactionEditor?<div className="border-t border-slate-100 pt-3">{interactionEditor}</div>:null}
 </div>
}