import { useEffect, useState } from "react";
import { apiRequest } from "../../services/api.js";

const FIELD = "onepos-input";
const CARD = "rounded-xl border p-3 space-y-3";
const border = { borderColor: "var(--onepos-border)" };

function uid(prefix) {
  const random = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `${prefix}_${random}`;
}

export function FormulaEditor({ title, formulas = [], onChange, scope = "row", fieldOptions = [], maxCount = null }) {
  const add = () => onChange([...formulas, { key: uid(scope).replace(/-/g, "_"), label: `${title} ${formulas.length + 1}`, scope, expression: "", format: "number", decimals: 2 }]);
  const atLimit = Number.isFinite(Number(maxCount)) && formulas.length >= Number(maxCount);
  return <fieldset className={CARD} style={border}>
    <div className="flex items-center justify-between gap-2"><div><legend className="font-medium text-sm">{title}</legend><p className="text-xs" style={{color:"var(--onepos-text-muted)"}}>Use field/API names. Supported: + − × ÷, comparisons, IF, ABS, ROUND, MIN, MAX and COALESCE.{maxCount ? ` Up to ${maxCount}.` : ""}</p></div><button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" disabled={atLimit} onClick={add}>Add formula</button></div>
    {formulas.map((formula,index)=><div key={formula.key||index} className="grid gap-2 md:grid-cols-[160px_1fr_130px_90px_auto] items-end">
      <label className="onepos-label">Label<input className={`${FIELD} mt-1`} value={formula.label||""} onChange={(e)=>onChange(formulas.map((f,i)=>i===index?{...f,label:e.target.value}:f))}/></label>
      <label className="onepos-label">Expression<input className={`${FIELD} mt-1 font-mono`} value={formula.expression||""} placeholder={fieldOptions.length>=2?`${fieldOptions[0].key} - ${fieldOptions[1].key}`:"field_a / field_b"} onChange={(e)=>onChange(formulas.map((f,i)=>i===index?{...f,expression:e.target.value}:f))}/></label>
      <label className="onepos-label">Format<select className={`${FIELD} mt-1`} value={formula.format||"number"} onChange={(e)=>onChange(formulas.map((f,i)=>i===index?{...f,format:e.target.value}:f))}><option value="number">Number</option><option value="currency">Currency</option><option value="percent">Percent</option><option value="date">Date</option><option value="text">Text</option></select></label>
      <label className="onepos-label">Decimals<input className={`${FIELD} mt-1`} type="number" min="0" max="8" value={formula.decimals??2} onChange={(e)=>onChange(formulas.map((f,i)=>i===index?{...f,decimals:Number(e.target.value)}:f))}/></label>
      <button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" onClick={()=>onChange(formulas.filter((_,i)=>i!==index))}>Remove</button>
    </div>)}
  </fieldset>;
}

export function BucketEditor({ buckets = [], onChange, fields = [] }) {
  const add=()=>onChange([...buckets,{key:`bucket_${buckets.length+1}`,label:`Bucket ${buckets.length+1}`,field:fields[0]?.key||"",mode:"values",entries:[{label:"Group 1",values:[]}],otherLabel:"Other"}]);
  return <fieldset className={CARD} style={border}><div className="flex items-center justify-between"><legend className="font-medium text-sm">Bucket columns</legend><button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" onClick={add}>Add bucket</button></div>
    {buckets.map((bucket,index)=><div key={bucket.key||index} className="rounded-lg border p-3 space-y-2" style={border}>
      <div className="grid gap-2 md:grid-cols-4">
        <label className="onepos-label">Label<input className={`${FIELD} mt-1`} value={bucket.label||""} onChange={(e)=>onChange(buckets.map((b,i)=>i===index?{...b,label:e.target.value}:b))}/></label>
        <label className="onepos-label">Source field<select className={`${FIELD} mt-1`} value={bucket.field||""} onChange={(e)=>onChange(buckets.map((b,i)=>i===index?{...b,field:e.target.value}:b))}>{fields.map((field)=><option key={field.key} value={field.key}>{field.label}</option>)}</select></label>
        <label className="onepos-label">Mode<select className={`${FIELD} mt-1`} value={bucket.mode||"values"} onChange={(e)=>onChange(buckets.map((b,i)=>i===index?{...b,mode:e.target.value}:b))}><option value="values">Specific values</option><option value="ranges">Numeric ranges</option></select></label>
        <label className="onepos-label">Other label<input className={`${FIELD} mt-1`} value={bucket.otherLabel||"Other"} onChange={(e)=>onChange(buckets.map((b,i)=>i===index?{...b,otherLabel:e.target.value}:b))}/></label>
      </div>
      {(bucket.entries||[]).map((entry,entryIndex)=><div key={entryIndex} className="grid gap-2 md:grid-cols-[180px_1fr_auto] items-end">
        <label className="onepos-label">Bucket label<input className={`${FIELD} mt-1`} value={entry.label||""} onChange={(e)=>onChange(buckets.map((b,i)=>i===index?{...b,entries:b.entries.map((x,j)=>j===entryIndex?{...x,label:e.target.value}:x)}:b))}/></label>
        {bucket.mode==="ranges"?<div className="grid grid-cols-2 gap-2"><label className="onepos-label">From<input className={`${FIELD} mt-1`} value={entry.from??""} onChange={(e)=>onChange(buckets.map((b,i)=>i===index?{...b,entries:b.entries.map((x,j)=>j===entryIndex?{...x,from:e.target.value===""?null:Number(e.target.value)}:x)}:b))}/></label><label className="onepos-label">To<input className={`${FIELD} mt-1`} value={entry.to??""} onChange={(e)=>onChange(buckets.map((b,i)=>i===index?{...b,entries:b.entries.map((x,j)=>j===entryIndex?{...x,to:e.target.value===""?null:Number(e.target.value)}:x)}:b))}/></label></div>:<label className="onepos-label">Values<input className={`${FIELD} mt-1`} value={(entry.values||[]).join(", ")} onChange={(e)=>onChange(buckets.map((b,i)=>i===index?{...b,entries:b.entries.map((x,j)=>j===entryIndex?{...x,values:e.target.value.split(",").map((v)=>v.trim()).filter(Boolean)}:x)}:b))}/></label>}
        <button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" onClick={()=>onChange(buckets.map((b,i)=>i===index?{...b,entries:b.entries.filter((_,j)=>j!==entryIndex)}:b))}>Remove</button>
      </div>)}
      <div className="flex gap-2"><button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" onClick={()=>onChange(buckets.map((b,i)=>i===index?{...b,entries:[...(b.entries||[]),bucket.mode==="ranges"?{label:`Group ${(b.entries||[]).length+1}`,from:null,to:null,includeFrom:true,includeTo:true}:{label:`Group ${(b.entries||[]).length+1}`,values:[]}]}:b))}>Add bucket row</button><button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" onClick={()=>onChange(buckets.filter((_,i)=>i!==index))}>Delete bucket</button></div>
    </div>)}
  </fieldset>;
}

export function ConditionalFormattingEditor({ rules=[], onChange, fields=[] }) {
  const add=()=>onChange([...rules,{field:fields[0]?.key||"",operator:"gte",value:0,style:"accent",applyTo:"cell"}]);
  return <fieldset className={CARD} style={border}><div className="flex items-center justify-between"><legend className="font-medium text-sm">Conditional formatting</legend><button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" onClick={add}>Add rule</button></div>
    {rules.map((rule,index)=><div key={index} className="grid gap-2 md:grid-cols-[1fr_150px_1fr_130px_120px_auto] items-end">
      <label className="onepos-label">Field<select className={`${FIELD} mt-1`} value={rule.field||""} onChange={(e)=>onChange(rules.map((r,i)=>i===index?{...r,field:e.target.value}:r))}>{fields.map((field)=><option key={field.key} value={field.key}>{field.label}</option>)}</select></label>
      <label className="onepos-label">Operator<select className={`${FIELD} mt-1`} value={rule.operator||"gte"} onChange={(e)=>onChange(rules.map((r,i)=>i===index?{...r,operator:e.target.value}:r))}><option value="equals">Equals</option><option value="not_equals">Not equals</option><option value="gt">Greater than</option><option value="gte">Greater/equal</option><option value="lt">Less than</option><option value="lte">Less/equal</option><option value="between">Between</option><option value="is_blank">Blank</option><option value="is_not_blank">Not blank</option></select></label>
      <label className="onepos-label">Value<input className={`${FIELD} mt-1`} disabled={["is_blank","is_not_blank"].includes(rule.operator)} value={rule.value??""} onChange={(e)=>onChange(rules.map((r,i)=>i===index?{...r,value:e.target.value}:r))}/></label>
      <label className="onepos-label">Style<select className={`${FIELD} mt-1`} value={rule.style||"accent"} onChange={(e)=>onChange(rules.map((r,i)=>i===index?{...r,style:e.target.value}:r))}><option value="success">Success</option><option value="warning">Warning</option><option value="danger">Danger</option><option value="info">Info</option><option value="accent">Accent</option><option value="muted">Muted</option></select></label>
      <label className="onepos-label">Apply to<select className={`${FIELD} mt-1`} value={rule.applyTo||"cell"} onChange={(e)=>onChange(rules.map((r,i)=>i===index?{...r,applyTo:e.target.value}:r))}><option value="cell">Cell</option><option value="row">Row</option><option value="value">Value</option><option value="component">Component</option></select></label>
      <button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" onClick={()=>onChange(rules.filter((_,i)=>i!==index))}>Remove</button>
    </div>)}
  </fieldset>;
}

export function DrillActionEditor({ action,onChange,reports=[],fields=[] }) {
  const value=action||{type:"none",targetId:null,passFilters:true,mappings:[]};
  return <fieldset className={CARD} style={border}><legend className="font-medium text-sm">Drill action</legend><div className="grid gap-2 md:grid-cols-3">
    <label className="onepos-label">On click<select className={`${FIELD} mt-1`} value={value.type||"none"} onChange={(e)=>onChange({...value,type:e.target.value})}><option value="none">No action</option><option value="report">Open report</option><option value="record">Open record</option><option value="page">Open custom page</option><option value="url">Open URL</option></select></label>
    {value.type==="report"?<label className="onepos-label">Target report<select className={`${FIELD} mt-1`} value={value.targetId||""} onChange={(e)=>onChange({...value,targetId:e.target.value})}><option value="">Select report</option>{reports.map((report)=><option key={report.id} value={report.id}>{report.name}</option>)}</select></label>:null}
    {value.type!=="none"&&value.type!=="report"?<label className="onepos-label">Target<input className={`${FIELD} mt-1`} value={value.targetId||""} onChange={(e)=>onChange({...value,targetId:e.target.value})}/></label>:null}
    {value.type!=="none"?<label className="flex items-end gap-2 text-sm pb-2"><input type="checkbox" checked={value.passFilters!==false} onChange={(e)=>onChange({...value,passFilters:e.target.checked})}/>Pass current filters</label>:null}
  </div>{value.type!=="none"?<><div className="text-xs font-medium">Filter mappings</div>{(value.mappings||[]).map((mapping,index)=><div key={index} className="grid gap-2 md:grid-cols-[1fr_1fr_auto]"><select className={FIELD} value={mapping.source||""} onChange={(e)=>onChange({...value,mappings:value.mappings.map((m,i)=>i===index?{...m,source:e.target.value}:m)})}><option value="">Source field</option>{fields.map((field)=><option key={field.key} value={field.key}>{field.label}</option>)}</select><input className={FIELD} value={mapping.target||""} placeholder="Target filter field" onChange={(e)=>onChange({...value,mappings:value.mappings.map((m,i)=>i===index?{...m,target:e.target.value}:m)})}/><button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" onClick={()=>onChange({...value,mappings:value.mappings.filter((_,i)=>i!==index)})}>Remove</button></div>)}<button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" onClick={()=>onChange({...value,mappings:[...(value.mappings||[]),{source:fields[0]?.key||"",target:""}]})}>Add mapping</button></>:null}</fieldset>;
}

function JoinedBlockFieldSelector({ block, onChange, reportTypes = [] }) {
  const [fields,setFields]=useState([]);
  const [loading,setLoading]=useState(false);
  useEffect(()=>{
    let live=true;
    if(block.dataSource!=="platform_object"||!block.objectId){setFields([]);return()=>{live=false;};}
    setLoading(true);
    apiRequest(`/api/reports/custom/platform-objects/${encodeURIComponent(block.objectId)}/metadata${block.reportTypeId?`?reportTypeId=${encodeURIComponent(block.reportTypeId)}`:""}`)
      .then((response)=>{if(live){const root=response?.success?response.data?.fields||[]:[];const related=response?.success?(response.data?.relationships||[]).flatMap((relationship)=>(relationship.fields||[]).map((field)=>({...field,label:`${relationship.label||relationship.target_object_key||relationship.relationship_key||"Related"} · ${field.label||field.api_name||field.key}`}))):[];setFields([...root,...related]);}})
      .catch(()=>{if(live)setFields([]);})
      .finally(()=>{if(live)setLoading(false);});
    return()=>{live=false;};
  },[block.dataSource,block.objectId,block.reportTypeId]);

  if(block.dataSource!=="platform_object") {
    return <div className="grid gap-2 md:grid-cols-2">
      <label className="onepos-label">Fields<input className={`${FIELD} mt-1 font-mono`} value={(block.fields||[]).join(", ")} onChange={(e)=>onChange({...block,fields:e.target.value.split(",").map((v)=>v.trim()).filter(Boolean)})}/></label>
      <label className="onepos-label">Row groups<input className={`${FIELD} mt-1 font-mono`} value={(block.rowGroups||[]).join(", ")} onChange={(e)=>onChange({...block,rowGroups:e.target.value.split(",").map((v)=>v.trim()).filter(Boolean)})}/></label>
    </div>;
  }
  const addFilter=()=>onChange({...block,filters:[...(block.filters||[]),{field:fields[0]?.key||"",operator:"equals",value:""}]});
  const addSort=()=>onChange({...block,sort:[...(block.sort||[]),{field:fields[0]?.key||"",direction:"asc",nulls:"last"}]});
  if(loading)return <div className="text-xs" style={{color:"var(--onepos-text-muted)"}}>Loading fields…</div>;
  return <div className="space-y-3">
    {reportTypes.length?<label className="onepos-label">Report type<select className={`${FIELD} mt-1`} value={block.reportTypeId||""} onChange={(e)=>{const reportTypeId=e.target.value||null;const reportType=reportTypes.find((item)=>String(item.id)===String(reportTypeId));const objectId=reportTypeId?(reportType?.definition?.primaryObjectId||reportType?.primary_object_id||block.objectId):block.objectId;onChange({...block,reportTypeId,objectId,fields:[],filters:[],rowGroups:[],summaries:[],summaryFormulas:[],sort:[]});}}><option value="">Direct object</option>{reportTypes.map((item)=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label>:null}
    <div><div className="text-xs font-medium mb-1">Fields</div><div className="grid gap-2 md:grid-cols-3">{fields.map((field)=><label key={field.key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={(block.fields||[]).includes(field.key)} onChange={()=>onChange({...block,fields:(block.fields||[]).includes(field.key)?block.fields.filter((key)=>key!==field.key):[...(block.fields||[]),field.key]})}/>{field.label}</label>)}</div></div>
    <label className="onepos-label">Row groups<select multiple className={`${FIELD} mt-1 min-h-24`} value={block.rowGroups||[]} onChange={(e)=>onChange({...block,rowGroups:[...e.target.selectedOptions].map((o)=>o.value)})}>{(block.fields||[]).map((key)=><option key={key} value={key}>{fields.find((field)=>field.key===key)?.label||key}</option>)}</select></label>
    <div className="space-y-2"><div className="flex items-center justify-between"><span className="text-xs font-medium">Block filters</span><button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" disabled={(block.filters||[]).length>=20||!fields.length} onClick={addFilter}>Add filter</button></div>
      {(block.filters||[]).map((filter,index)=><div key={index} className="grid gap-2 md:grid-cols-[1fr_170px_1fr_auto]"><select className={FIELD} value={filter.field||""} onChange={(e)=>onChange({...block,filters:block.filters.map((item,i)=>i===index?{...item,field:e.target.value}:item)})}>{fields.map((field)=><option key={field.key} value={field.key}>{field.label}</option>)}</select><select className={FIELD} value={filter.operator||"equals"} onChange={(e)=>onChange({...block,filters:block.filters.map((item,i)=>i===index?{...item,operator:e.target.value}:item)})}>{["equals","not_equals","contains","starts_with","gt","gte","lt","lte","is_blank","is_not_blank"].map((operator)=><option key={operator} value={operator}>{operator.replaceAll("_"," ")}</option>)}</select><input className={FIELD} disabled={["is_blank","is_not_blank"].includes(filter.operator)} value={filter.value??""} onChange={(e)=>onChange({...block,filters:block.filters.map((item,i)=>i===index?{...item,value:e.target.value}:item)})}/><button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" onClick={()=>onChange({...block,filters:block.filters.filter((_,i)=>i!==index)})}>Remove</button></div>)}
      {(block.filters||[]).length>1?<label className="onepos-label">Filter logic<input className={`${FIELD} mt-1`} value={block.filterLogic||"all"} onChange={(e)=>onChange({...block,filterLogic:e.target.value})} placeholder="all, any, or 1 AND (2 OR 3)"/></label>:null}
    </div>
    <div className="space-y-2"><div className="flex items-center justify-between"><span className="text-xs font-medium">Summaries</span><button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" onClick={()=>onChange({...block,summaries:[...(block.summaries||[]),{aggregate:"COUNT",field:block.fields?.[0]||"",alias:`summary_${(block.summaries||[]).length+1}`}]})}>Add summary</button></div>
      {(block.summaries||[]).map((summary,index)=><div key={index} className="grid gap-2 md:grid-cols-[150px_1fr_1fr_auto]"><select className={FIELD} value={summary.aggregate||"COUNT"} onChange={(e)=>onChange({...block,summaries:block.summaries.map((item,i)=>i===index?{...item,aggregate:e.target.value}:item)})}>{["COUNT","COUNT_DISTINCT","SUM","AVG","MIN","MAX"].map((agg)=><option key={agg}>{agg}</option>)}</select><select className={FIELD} value={summary.field||""} onChange={(e)=>onChange({...block,summaries:block.summaries.map((item,i)=>i===index?{...item,field:e.target.value}:item)})}><option value="">Field</option>{(block.fields||[]).map((key)=><option key={key} value={key}>{fields.find((field)=>field.key===key)?.label||key}</option>)}</select><input className={FIELD} value={summary.alias||""} placeholder="Alias" onChange={(e)=>onChange({...block,summaries:block.summaries.map((item,i)=>i===index?{...item,alias:e.target.value}:item)})}/><button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" onClick={()=>onChange({...block,summaries:block.summaries.filter((_,i)=>i!==index)})}>Remove</button></div>)}
    </div>
    <FormulaEditor title="Block Summary Formula" formulas={block.summaryFormulas||[]} onChange={(summaryFormulas)=>onChange({...block,summaryFormulas})} scope="summary" fieldOptions={[...(block.fields||[]).map((key)=>fields.find((field)=>field.key===key)).filter(Boolean),...(block.summaries||[]).map((summary)=>({key:summary.alias||`${String(summary.aggregate||"count").toLowerCase()}_${summary.field}`,label:summary.alias||summary.field}))]} maxCount={10}/>
    <div className="space-y-2"><div className="flex items-center justify-between"><span className="text-xs font-medium">Sort</span><button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" disabled={!fields.length} onClick={addSort}>Add sort</button></div>
      {(block.sort||[]).map((sort,index)=><div key={index} className="grid gap-2 md:grid-cols-[1fr_140px_140px_auto]"><select className={FIELD} value={sort.field||""} onChange={(e)=>onChange({...block,sort:block.sort.map((item,i)=>i===index?{...item,field:e.target.value}:item)})}>{fields.map((field)=><option key={field.key} value={field.key}>{field.label}</option>)}</select><select className={FIELD} value={sort.direction||"asc"} onChange={(e)=>onChange({...block,sort:block.sort.map((item,i)=>i===index?{...item,direction:e.target.value}:item)})}><option value="asc">Ascending</option><option value="desc">Descending</option></select><select className={FIELD} value={sort.nulls||"last"} onChange={(e)=>onChange({...block,sort:block.sort.map((item,i)=>i===index?{...item,nulls:e.target.value}:item)})}><option value="last">Nulls last</option><option value="first">Nulls first</option></select><button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" onClick={()=>onChange({...block,sort:block.sort.filter((_,i)=>i!==index)})}>Remove</button></div>)}
    </div>
  </div>;
}

export function JoinedBlocksEditor({ blocks=[],onChange,sources=[],objects=[],reportTypes=[] }) {
  const [expanded,setExpanded]=useState(0);
  const add=()=>onChange([...blocks,{key:`block_${blocks.length+1}`,label:`Block ${blocks.length+1}`,dataSource:"platform_object",objectId:objects[0]?.id||"",reportTypeId:null,fields:[],filters:[],filterLogic:"all",rowGroups:[],summaries:[],summaryFormulas:[],sort:[]}]);
  const updateBlock=(index,next)=>onChange(blocks.map((block,i)=>i===index?next:block));
  return <fieldset className={CARD} style={border}><div className="flex items-center justify-between"><legend className="font-medium text-sm">Joined report blocks</legend><button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" disabled={blocks.length>=5} onClick={add}>Add block</button></div><div className="flex flex-wrap gap-2">{blocks.map((block,index)=><button type="button" key={block.key||index} className={`onepos-btn onepos-btn-sm ${expanded===index?"onepos-btn-primary":"onepos-btn-secondary"}`} onClick={()=>setExpanded(index)}>{block.label||`Block ${index+1}`}</button>)}</div>
    {blocks[expanded]?<div className="rounded-lg border p-3 space-y-3" style={border}>
      <div className="grid gap-2 md:grid-cols-3"><label className="onepos-label">Block label<input className={`${FIELD} mt-1`} value={blocks[expanded].label||""} onChange={(e)=>updateBlock(expanded,{...blocks[expanded],label:e.target.value})}/></label><label className="onepos-label">Data source<select className={`${FIELD} mt-1`} value={blocks[expanded].dataSource||"platform_object"} onChange={(e)=>updateBlock(expanded,{...blocks[expanded],dataSource:e.target.value,objectId:e.target.value==="platform_object"?(objects[0]?.id||""):"",fields:[],rowGroups:[],summaries:[]})}><option value="sales">Sales</option><option value="platform_object">Platform Object</option>{sources.filter((s)=>!["sales","platform_object"].includes(s.key)).map((s)=><option key={s.key} value={s.key}>{s.label}</option>)}</select></label>{blocks[expanded].dataSource==="platform_object"?<label className="onepos-label">Object<select className={`${FIELD} mt-1`} value={blocks[expanded].objectId||""} onChange={(e)=>updateBlock(expanded,{...blocks[expanded],objectId:e.target.value,fields:[],rowGroups:[],summaries:[]})}><option value="">Select object</option>{objects.map((object)=><option key={object.id} value={object.id}>{object.label||object.object_key}</option>)}</select></label>:null}</div>
      <JoinedBlockFieldSelector block={blocks[expanded]} onChange={(next)=>updateBlock(expanded,next)} reportTypes={reportTypes} />
      <button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" onClick={()=>{onChange(blocks.filter((_,i)=>i!==expanded));setExpanded(Math.max(0,expanded-1));}}>Remove block</button>
    </div>:null}
  </fieldset>;
}


export function JoinedCommonGroupsEditor({ groups = [], blocks = [], onChange }) {
  const normalized = (groups || []).map((group, index) => typeof group === "string"
    ? { key: `common_group_${index + 1}`, label: group, mappings: (blocks || []).map((block) => ({ blockKey: block.key, field: group })) }
    : { key: group?.key || `common_group_${index + 1}`, label: group?.label || group?.key || `Common group ${index + 1}`, mappings: Array.isArray(group?.mappings) ? group.mappings : [] });
  const add = () => onChange([...(normalized || []), { key: `common_group_${normalized.length + 1}`, label: `Common group ${normalized.length + 1}`, mappings: (blocks || []).map((block) => ({ blockKey: block.key, field: block.rowGroups?.[0] || block.fields?.[0] || "" })) }]);
  const update = (index, patch) => onChange(normalized.map((group, i) => i === index ? { ...group, ...patch } : group));
  return <fieldset className={CARD} style={border}>
    <div className="flex items-center justify-between"><legend className="font-medium text-sm">Common groups</legend><button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" onClick={add} disabled={!blocks.length}>Add common group</button></div>
    <p className="text-xs" style={{color:"var(--onepos-text-muted)"}}>Map the equivalent grouping field from every joined block.</p>
    {normalized.map((group,index)=><div key={group.key||index} className="rounded-lg border p-3 space-y-2" style={border}>
      <div className="grid gap-2 md:grid-cols-[1fr_auto]"><input className={FIELD} value={group.label||""} onChange={(e)=>update(index,{label:e.target.value})}/><button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" onClick={()=>onChange(normalized.filter((_,i)=>i!==index))}>Remove</button></div>
      <div className="grid gap-2 md:grid-cols-2">{(blocks||[]).map((block)=>{const mapping=(group.mappings||[]).find((item)=>String(item.blockKey)===String(block.key))||{blockKey:block.key,field:""};const options=[...(block.rowGroups||[]),...(block.fields||[])].filter((value,i,array)=>value&&array.indexOf(value)===i);return <label key={block.key} className="onepos-label">{block.label||block.key}<select className={`${FIELD} mt-1`} value={mapping.field||""} onChange={(e)=>update(index,{mappings:(blocks||[]).map((candidate)=>candidate.key===block.key?{blockKey:block.key,field:e.target.value}:{blockKey:candidate.key,field:(group.mappings||[]).find((item)=>String(item.blockKey)===String(candidate.key))?.field||""})})}><option value="">Select field</option>{options.map((field)=><option key={field} value={field}>{field}</option>)}</select></label>;})}</div>
    </div>)}
  </fieldset>;
}
