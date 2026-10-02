import { useEffect, useState } from "react";
import { apiRequest } from "../../services/api.js";
import { ReportTypeExperienceEditor } from "./ReportExperienceControls.jsx";

export function ReportTypeDesigner({ initialValue = null, onSaved, onCancel }) {
  const [objects,setObjects]=useState([]);
  const [relationships,setRelationships]=useState([]);
  const [fields,setFields]=useState([]);
  const [error,setError]=useState("");
  const [saving,setSaving]=useState(false);
  const [value,setValue]=useState(()=>initialValue?.definition||{
    label:"",key:"",description:"",primaryObjectId:"",active:true,
    relationships:[],fieldVisibility:[],
    experience:{status:"IN_DEVELOPMENT",category:"Other Reports",sections:[{key:"fields",label:"Fields",visible:true,order:0}],fieldLayout:[]},
  });

  useEffect(()=>{apiRequest("/api/platform/objects").then((r)=>setObjects(r?.data||[])).catch(()=>setObjects([]));},[]);
  useEffect(()=>{
    if(!value.primaryObjectId){setRelationships([]);setFields([]);return;}
    Promise.all([
      apiRequest(`/api/platform/objects/${encodeURIComponent(value.primaryObjectId)}/fields`).catch(()=>null),
      apiRequest("/api/platform/relationships").catch(()=>null),
    ]).then(([fieldResult,relationshipResult])=>{
      setFields(fieldResult?.data||[]);
      const all=relationshipResult?.data||[];
      setRelationships(all.filter((relationship)=>String(relationship.parent_object_id)===String(value.primaryObjectId)||String(relationship.child_object_id)===String(value.primaryObjectId)));
    });
  },[value.primaryObjectId]);

  const update=(patch)=>setValue((current)=>({...current,...patch}));
  const selected=new Set((value.relationships||[]).map((item)=>String(item.relationshipId)));
  const addRelationship=(relationship)=>{if(selected.has(String(relationship.id)))return;update({relationships:[...(value.relationships||[]),{relationshipId:relationship.id,joinType:"WITH_OR_WITHOUT",alias:relationship.relationship_key||null}]});};
  const save=async()=>{
    try{
      setSaving(true);setError("");
      const response=await apiRequest(initialValue?.id?`/api/reports/custom/report-types/${encodeURIComponent(initialValue.id)}`:"/api/reports/custom/report-types",{method:initialValue?.id?"PUT":"POST",body:JSON.stringify(value)});
      if(!response?.success)throw new Error(response?.message||"Unable to save report type");
      onSaved?.(response.data);
    }catch(err){setError(err?.message||"Unable to save report type");}finally{setSaving(false);}
  };

  return <div className="space-y-4">
    {error?<div className="onepos-alert onepos-alert-error">{error}</div>:null}
    <section className="onepos-card onepos-card-body space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="onepos-label">Label<input className="onepos-input mt-1" value={value.label||""} onChange={(e)=>update({label:e.target.value})}/></label>
        <label className="onepos-label">API key<input className="onepos-input mt-1 font-mono" value={value.key||""} onChange={(e)=>update({key:e.target.value.replace(/\s+/g,"_")})}/></label>
        <label className="onepos-label md:col-span-2">Description<input className="onepos-input mt-1" value={value.description||""} onChange={(e)=>update({description:e.target.value})}/></label>
        <label className="onepos-label">Primary object<select className="onepos-input mt-1" value={value.primaryObjectId||""} onChange={(e)=>update({primaryObjectId:e.target.value,relationships:[],fieldVisibility:[]})}><option value="">Select object</option>{objects.map((object)=><option key={object.id} value={object.id}>{object.label||object.object_key}</option>)}</select></label>
        <label className="flex items-end gap-2 text-sm pb-2"><input type="checkbox" checked={value.active!==false} onChange={(e)=>update({active:e.target.checked})}/>Active</label>
      </div>
      <ReportTypeExperienceEditor value={value.experience||{}} onChange={(experience)=>update({experience})}/>
    </section>

    <section className="onepos-card onepos-card-body space-y-3">
      <div><h3 className="font-semibold">Object relationships</h3><p className="text-xs" style={{color:"var(--onepos-text-muted)"}}>Choose whether related records are required or optional.</p></div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">{relationships.filter((r)=>!selected.has(String(r.id))).map((r)=><button key={r.id} type="button" className="w-full rounded-lg border p-2 text-left text-sm" style={{borderColor:"var(--onepos-border)"}} onClick={()=>addRelationship(r)}><strong>{r.relationship_key||r.name}</strong><span className="block text-xs">{r.relationship_type}</span></button>)}</div>
        <div className="space-y-2">{(value.relationships||[]).map((entry,index)=><div key={entry.relationshipId} className="grid gap-2 md:grid-cols-[1fr_190px_auto] items-center"><span className="text-sm">{relationships.find((r)=>String(r.id)===String(entry.relationshipId))?.relationship_key||entry.alias||"Relationship"}</span><select className="onepos-input" value={entry.joinType||"WITH_OR_WITHOUT"} onChange={(e)=>update({relationships:value.relationships.map((item,i)=>i===index?{...item,joinType:e.target.value}:item)})}><option value="WITH">Must have related records</option><option value="WITH_OR_WITHOUT">May or may not have related records</option></select><button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" onClick={()=>update({relationships:value.relationships.filter((_,i)=>i!==index)})}>Remove</button></div>)}</div>
      </div>
    </section>

    <section className="onepos-card onepos-card-body space-y-3">
      <h3 className="font-semibold">Field exposure</h3>
      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">{fields.map((field)=>{
        const current=(value.fieldVisibility||[]).find((item)=>item.fieldKey===field.api_name)||{fieldKey:field.api_name,visible:true,defaultSelected:false,category:"Fields"};
        const commit=(patch)=>{const existing=value.fieldVisibility||[];update({fieldVisibility:existing.some((item)=>item.fieldKey===field.api_name)?existing.map((item)=>item.fieldKey===field.api_name?{...item,...patch}:item):[...existing,{...current,...patch}]});};
        const experience=value.experience||{}, layout=experience.fieldLayout||[];
        const item=layout.find((x)=>x.fieldKey===field.api_name)||{fieldKey:field.api_name,displayLabel:field.label||field.api_name,sectionKey:"fields",visible:true,defaultSelected:false,lookupPath:[],order:layout.length};
        const commitLayout=(patch)=>update({experience:{...experience,fieldLayout:layout.some((x)=>x.fieldKey===field.api_name)?layout.map((x)=>x.fieldKey===field.api_name?{...x,...patch}:x):[...layout,{...item,...patch}]}});
        return <div key={field.api_name} className="rounded-lg border p-2 space-y-2" style={{borderColor:"var(--onepos-border)"}}><div className="text-sm font-medium">{field.label||field.api_name}</div><label className="flex gap-2 text-xs"><input type="checkbox" checked={current.visible!==false} onChange={(e)=>commit({visible:e.target.checked})}/>Visible</label><label className="flex gap-2 text-xs"><input type="checkbox" checked={current.defaultSelected===true} onChange={(e)=>commit({defaultSelected:e.target.checked})}/>Selected by default</label><input className="onepos-input text-xs" value={item.displayLabel||""} onChange={(e)=>commitLayout({displayLabel:e.target.value})} placeholder="Display label"/><select className="onepos-input text-xs" value={item.sectionKey||"fields"} onChange={(e)=>commitLayout({sectionKey:e.target.value})}>{(experience.sections||[{key:"fields",label:"Fields"}]).filter((s)=>s.visible!==false).map((s)=><option key={s.key} value={s.key}>{s.label}</option>)}</select></div>;
      })}</div>
    </section>
    <div className="flex justify-end gap-2"><button type="button" className="onepos-btn onepos-btn-secondary" onClick={onCancel}>Cancel</button><button type="button" className="onepos-btn onepos-btn-primary" disabled={saving} onClick={save}>{saving?"Saving…":"Save report type"}</button></div>
  </div>;
}

export function AdvancedFilterEditor({ filters=[],crossFilters=[],fields=[],relationships=[],onChange }) {
  const updateFilter=(index,patch)=>onChange({filters:filters.map((item,i)=>i===index?{...item,...patch}:item),crossFilters});
  const operators=[["equals","Equals"],["not_equals","Not equals"],["contains","Contains"],["starts_with","Starts with"],["gt","Greater than"],["gte","Greater/equal"],["lt","Less than"],["lte","Less/equal"],["between","Between"],["is_blank","Blank"],["is_not_blank","Not blank"],["equals_field","Equals field"],["not_equals_field","Not equals field"],["gt_field","Greater than field"],["gte_field","Greater/equal field"],["lt_field","Less than field"],["lte_field","Less/equal field"],["relative_date","Relative date"]];
  return <div className="space-y-4">
    <fieldset className="rounded-xl border p-3 space-y-3" style={{borderColor:"var(--onepos-border)"}}><div className="flex items-center justify-between"><legend className="font-medium text-sm">Advanced filters</legend><button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" onClick={()=>onChange({filters:[...filters,{field:fields[0]?.key||"",operator:"equals",value:""}],crossFilters})}>Add filter</button></div>
      {filters.map((filter,index)=>{const compare=String(filter.operator||"").endsWith("_field"), relative=filter.operator==="relative_date";return <div key={index} className="grid gap-2 md:grid-cols-[1fr_180px_1fr_auto] items-end"><select className="onepos-input" value={filter.field||""} onChange={(e)=>updateFilter(index,{field:e.target.value})}>{fields.map((field)=><option key={field.key} value={field.key}>{field.label}</option>)}</select><select className="onepos-input" value={filter.operator||"equals"} onChange={(e)=>updateFilter(index,{operator:e.target.value,compareField:null,relativeDate:null})}>{operators.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>{compare?<select className="onepos-input" value={filter.compareField||""} onChange={(e)=>updateFilter(index,{compareField:e.target.value})}><option value="">Compare with field…</option>{fields.map((field)=><option key={field.key} value={field.key}>{field.label}</option>)}</select>:relative?<div className="grid grid-cols-3 gap-1"><select className="onepos-input" value={filter.relativeDate?.direction||"LAST"} onChange={(e)=>updateFilter(index,{relativeDate:{...(filter.relativeDate||{}),direction:e.target.value}})}><option>LAST</option><option>NEXT</option><option>CURRENT</option></select><input type="number" min="1" className="onepos-input" value={filter.relativeDate?.count||1} onChange={(e)=>updateFilter(index,{relativeDate:{...(filter.relativeDate||{}),count:Number(e.target.value)}})}/><select className="onepos-input" value={filter.relativeDate?.unit||"MONTH"} onChange={(e)=>updateFilter(index,{relativeDate:{...(filter.relativeDate||{}),unit:e.target.value}})}><option>DAY</option><option>WEEK</option><option>MONTH</option><option>QUARTER</option><option>YEAR</option></select></div>:<input className="onepos-input" value={filter.value??""} onChange={(e)=>updateFilter(index,{value:e.target.value})}/>}<button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" onClick={()=>onChange({filters:filters.filter((_,i)=>i!==index),crossFilters})}>Remove</button></div>;})}
    </fieldset>
    <fieldset className="rounded-xl border p-3 space-y-3" style={{borderColor:"var(--onepos-border)"}}><div className="flex items-center justify-between"><legend className="font-medium text-sm">Cross filters</legend><button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" disabled={crossFilters.length>=5||!relationships.length} onClick={()=>onChange({filters,crossFilters:[...crossFilters,{type:"WITH",relationshipKey:relationships[0]?.key||relationships[0]?.relationship_key||"",subfilters:[]}]})}>Add cross filter</button></div>
      {crossFilters.map((cross,index)=><div key={index} className="grid gap-2 md:grid-cols-[120px_1fr_auto]"><select className="onepos-input" value={cross.type||"WITH"} onChange={(e)=>onChange({filters,crossFilters:crossFilters.map((item,i)=>i===index?{...item,type:e.target.value}:item)})}><option value="WITH">WITH</option><option value="WITHOUT">WITHOUT</option></select><select className="onepos-input" value={cross.relationshipKey||""} onChange={(e)=>onChange({filters,crossFilters:crossFilters.map((item,i)=>i===index?{...item,relationshipKey:e.target.value,subfilters:[]}:item)})}>{relationships.map((rel)=><option key={rel.key||rel.relationship_key} value={rel.key||rel.relationship_key}>{rel.label||rel.relationship_key}</option>)}</select><button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" onClick={()=>onChange({filters,crossFilters:crossFilters.filter((_,i)=>i!==index)})}>Remove</button></div>)}
    </fieldset>
  </div>;
}
