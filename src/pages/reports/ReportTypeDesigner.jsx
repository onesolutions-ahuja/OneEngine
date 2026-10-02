import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../services/api.js";
import { ReportTypeExperienceEditor } from "./ReportExperienceControls.jsx";

export function ReportTypeDesigner({ initialValue = null, onSaved, onCancel }) {
  const [objects,setObjects]=useState([]);
  const [relationships,setRelationships]=useState([]);
  const [fields,setFields]=useState([]);
  const [relatedFields,setRelatedFields]=useState([]);
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
      setRelationships(all);
    });
  },[value.primaryObjectId]);

  const update=(patch)=>setValue((current)=>({...current,...patch}));
  const objectById=useMemo(()=>new Map(objects.map((object)=>[String(object.id),object])),[objects]);
  const relationshipById=useMemo(()=>new Map(relationships.map((relationship)=>[String(relationship.id),relationship])),[relationships]);
  const selectedRelationships=value.relationships||[];
  const selected=new Set(selectedRelationships.map((item)=>String(item.relationshipId)));
  const pathNodes=useMemo(()=>{
    const rootLabel=objectById.get(String(value.primaryObjectId))?.label||objectById.get(String(value.primaryObjectId))?.object_key||"Primary object";
    const nodes=[{sourceRelationshipId:null,objectId:String(value.primaryObjectId||""),label:rootLabel,path:rootLabel,alias:null,depth:0}];
    for(const entry of selectedRelationships){
      const sourceId=entry.sourceRelationshipId?String(entry.sourceRelationshipId):null;
      const source=nodes.find((node)=>(node.sourceRelationshipId?String(node.sourceRelationshipId):null)===sourceId);
      const relationship=relationshipById.get(String(entry.relationshipId));
      if(!source||!relationship)continue;
      const parentId=String(relationship.parent_object_id||"");
      const childId=String(relationship.child_object_id||"");
      const targetId=String(source.objectId)===parentId?childId:String(source.objectId)===childId?parentId:"";
      if(!targetId)continue;
      const target=objectById.get(targetId);
      const label=target?.label||target?.object_key||relationship.relationship_key||"Related object";
      nodes.push({sourceRelationshipId:String(entry.relationshipId),objectId:targetId,label,path:`${source.path} → ${label}`,alias:entry.alias||relationship.relationship_key||"",depth:source.depth+1});
    }
    return nodes;
  },[objectById,relationshipById,selectedRelationships,value.primaryObjectId]);
  useEffect(()=>{
    let live=true;
    const nodes=pathNodes.filter((node)=>node.depth>0&&node.objectId&&node.alias);
    if(!nodes.length){setRelatedFields([]);return()=>{live=false;};}
    Promise.all(nodes.map(async(node)=>{
      const response=await apiRequest(`/api/platform/objects/${encodeURIComponent(node.objectId)}/fields`).catch(()=>null);
      return (response?.data||[]).map((field)=>({
        ...field,
        fieldKey:`${node.alias}.${field.api_name}`,
        displayPath:node.path,
        relationshipAlias:node.alias,
      }));
    })).then((groups)=>{if(live)setRelatedFields(groups.flat());}).catch(()=>{if(live)setRelatedFields([]);});
    return()=>{live=false;};
  },[pathNodes]);
  const designerFields=useMemo(()=>[
    ...fields.map((field)=>({...field,fieldKey:field.api_name,displayPath:objectById.get(String(value.primaryObjectId))?.label||"Primary object"})),
    ...relatedFields,
  ],[fields,relatedFields,objectById,value.primaryObjectId]);
  const orderedDesignerFields=useMemo(()=>{
    const layout=value.experience?.fieldLayout||[];
    const orderByKey=new Map(layout.map((entry,index)=>[String(entry.fieldKey),Number.isFinite(Number(entry.order))?Number(entry.order):index]));
    return designerFields.map((field,index)=>({field,index,key:String(field.fieldKey||field.api_name||"")})).sort((a,b)=>{
      const left=orderByKey.has(a.key)?orderByKey.get(a.key):100000+a.index;
      const right=orderByKey.has(b.key)?orderByKey.get(b.key):100000+b.index;
      return left-right;
    }).map((entry)=>entry.field);
  },[designerFields,value.experience?.fieldLayout]);
  const moveDesignerField=(fieldKey,direction)=>{
    const experience=value.experience||{};
    const layout=experience.fieldLayout||[];
    const normalized=orderedDesignerFields.map((field,index)=>{
      const key=String(field.fieldKey||field.api_name||"");
      const existing=layout.find((entry)=>String(entry.fieldKey)===key);
      return existing?{...existing,order:index}:{fieldKey:key,displayLabel:field.label||field.api_name||key,sectionKey:"fields",visible:true,defaultSelected:false,lookupPath:field.relationshipAlias?[field.relationshipAlias]:[],order:index};
    });
    const position=normalized.findIndex((entry)=>String(entry.fieldKey)===String(fieldKey));
    const target=position+direction;
    if(position<0||target<0||target>=normalized.length)return;
    [normalized[position],normalized[target]]=[normalized[target],normalized[position]];
    update({experience:{...experience,fieldLayout:normalized.map((entry,index)=>({...entry,order:index}))}});
  };
  const relationshipCandidates=useMemo(()=>{
    if(selectedRelationships.length>=3)return[];
    const rows=[];
    for(const source of pathNodes.filter((node)=>node.depth<3)){
      for(const relationship of relationships){
        if(selected.has(String(relationship.id)))continue;
        const parentId=String(relationship.parent_object_id||"");
        const childId=String(relationship.child_object_id||"");
        if(String(source.objectId)!==parentId&&String(source.objectId)!==childId)continue;
        const targetId=String(source.objectId)===parentId?childId:parentId;
        const target=objectById.get(targetId);
        rows.push({relationship,source,targetLabel:target?.label||target?.object_key||targetId});
      }
    }
    return rows;
  },[relationships,pathNodes,selectedRelationships.length,selected,objectById]);
  const safeAlias=(candidate)=>{
    const base=String(candidate.relationship.relationship_key||"related").replace(/[^A-Za-z0-9_]/g,"_").replace(/^[^A-Za-z_]+/,"")||"related";
    const prefix=candidate.source.alias?String(candidate.source.alias).replace(/[^A-Za-z0-9_]/g,"_")+"__":"";
    const root=(prefix+base).slice(0,72);
    const used=new Set(selectedRelationships.map((item)=>String(item.alias||"")));
    let alias=root,suffix=2;
    while(used.has(alias)){alias=`${root.slice(0,Math.max(1,77-String(suffix).length))}_${suffix++}`;}
    return alias;
  };
  const addRelationship=(candidate)=>{
    if(selected.has(String(candidate.relationship.id))||selectedRelationships.length>=3)return;
    update({relationships:[...selectedRelationships,{relationshipId:candidate.relationship.id,sourceRelationshipId:candidate.source.sourceRelationshipId,joinType:"WITH_OR_WITHOUT",alias:safeAlias(candidate)}]});
  };
  const removeRelationship=(relationshipId)=>{
    const removed=new Set([String(relationshipId)]);
    let changed=true;
    while(changed){changed=false;for(const item of selectedRelationships){if(item.sourceRelationshipId&&removed.has(String(item.sourceRelationshipId))&&!removed.has(String(item.relationshipId))){removed.add(String(item.relationshipId));changed=true;}}}
    update({relationships:selectedRelationships.filter((item)=>!removed.has(String(item.relationshipId)))});
  };
  const pathRequiresOptional=(entry)=>{
    let ancestorId=entry?.sourceRelationshipId?String(entry.sourceRelationshipId):null;
    while(ancestorId){
      const ancestor=selectedRelationships.find((item)=>String(item.relationshipId)===ancestorId);
      if(!ancestor)break;
      if((ancestor.joinType||"WITH_OR_WITHOUT")==="WITH_OR_WITHOUT")return true;
      ancestorId=ancestor.sourceRelationshipId?String(ancestor.sourceRelationshipId):null;
    }
    return false;
  };
  const updateJoinType=(index,joinType)=>{
    const target=selectedRelationships[index];
    const next=selectedRelationships.map((item,i)=>i===index?{...item,joinType}:item);
    if(joinType==="WITH_OR_WITHOUT"){
      const descendants=new Set([String(target.relationshipId)]);
      let changed=true;
      while(changed){changed=false;for(const item of next){if(item.sourceRelationshipId&&descendants.has(String(item.sourceRelationshipId))&&!descendants.has(String(item.relationshipId))){descendants.add(String(item.relationshipId));changed=true;}}}
      for(let i=0;i<next.length;i++)if(i!==index&&descendants.has(String(next[i].relationshipId)))next[i]={...next[i],joinType:"WITH_OR_WITHOUT"};
    }
    update({relationships:next});
  };
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
      <div><h3 className="font-semibold">Object relationships</h3><p className="text-xs" style={{color:"var(--onepos-text-muted)"}}>Build a relationship chain from the primary object. Up to three related objects can be added, and each relationship can require related records or include records without a match.</p></div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <div className="text-xs font-medium" style={{color:"var(--onepos-text-muted)"}}>Available relationships</div>
          {relationshipCandidates.map((candidate)=><button key={`${candidate.source.sourceRelationshipId||"root"}:${candidate.relationship.id}`} type="button" className="w-full rounded-lg border p-2 text-left text-sm" style={{borderColor:"var(--onepos-border)"}} onClick={()=>addRelationship(candidate)}><strong>{candidate.source.label} → {candidate.targetLabel}</strong><span className="block text-xs">{candidate.relationship.relationship_key||candidate.relationship.name} · {candidate.relationship.relationship_type}</span></button>)}
          {!relationshipCandidates.length?<div className="rounded-lg border border-dashed p-3 text-xs" style={{borderColor:"var(--onepos-border)",color:"var(--onepos-text-muted)"}}>{selectedRelationships.length>=3?"Maximum relationship depth reached.":"No additional relationships are available from the current path."}</div>:null}
        </div>
        <div className="space-y-2">
          <div className="text-xs font-medium" style={{color:"var(--onepos-text-muted)"}}>Selected relationship chain</div>
          {selectedRelationships.map((entry,index)=>{
            const relationship=relationshipById.get(String(entry.relationshipId));
            const node=pathNodes.find((item)=>String(item.sourceRelationshipId||"")===String(entry.relationshipId));
            return <div key={entry.relationshipId} className="rounded-lg border p-3 space-y-2" style={{borderColor:"var(--onepos-border)"}}>
              <div className="text-sm font-medium">{node?.path||relationship?.relationship_key||"Relationship"}</div>
              <div className="grid gap-2 md:grid-cols-2">
                <label className="onepos-label">Relationship alias<input className="onepos-input mt-1 font-mono" value={entry.alias||""} onChange={(e)=>update({relationships:selectedRelationships.map((item,i)=>i===index?{...item,alias:e.target.value.replace(/[^A-Za-z0-9_]/g,"").slice(0,80)}:item)})}/></label>
                <label className="onepos-label">Records<select className="onepos-input mt-1" value={pathRequiresOptional(entry)?"WITH_OR_WITHOUT":entry.joinType||"WITH_OR_WITHOUT"} disabled={pathRequiresOptional(entry)} onChange={(e)=>updateJoinType(index,e.target.value)}>{!pathRequiresOptional(entry)?<option value="WITH">Must have related records</option>:null}<option value="WITH_OR_WITHOUT">May or may not have related records</option></select>{pathRequiresOptional(entry)?<span className="mt-1 block text-[11px]" style={{color:"var(--onepos-text-muted)"}}>Inherited from an optional parent relationship.</span>:null}</label>
              </div>
              <div className="flex items-center justify-between"><span className="text-xs" style={{color:"var(--onepos-text-muted)"}}>Level {node?.depth||index+1} · {relationship?.relationship_type||"relationship"}</span><button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" onClick={()=>removeRelationship(entry.relationshipId)}>Remove</button></div>
            </div>;
          })}
          {!selectedRelationships.length?<div className="rounded-lg border border-dashed p-3 text-xs" style={{borderColor:"var(--onepos-border)",color:"var(--onepos-text-muted)"}}>No related objects selected.</div>:null}
        </div>
      </div>
    </section>

    <section className="onepos-card onepos-card-body space-y-3">
      <div><h3 className="font-semibold">Field exposure</h3><p className="text-xs" style={{color:"var(--onepos-text-muted)"}}>Configure primary and related-object fields from the same report-type layout.</p></div>
      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">{orderedDesignerFields.map((field,fieldIndex)=>{
        const fieldKey=field.fieldKey||field.api_name;
        const current=(value.fieldVisibility||[]).find((item)=>item.fieldKey===fieldKey)||{fieldKey,visible:true,defaultSelected:false,category:"Fields"};
        const commit=(patch)=>{const existing=value.fieldVisibility||[];update({fieldVisibility:existing.some((item)=>item.fieldKey===fieldKey)?existing.map((item)=>item.fieldKey===fieldKey?{...item,...patch}:item):[...existing,{...current,...patch}]});};
        const experience=value.experience||{}, layout=experience.fieldLayout||[];
        const item=layout.find((x)=>x.fieldKey===fieldKey)||{fieldKey,displayLabel:field.label||field.api_name||fieldKey,sectionKey:"fields",visible:true,defaultSelected:false,lookupPath:field.relationshipAlias?[field.relationshipAlias]:[],order:layout.length};
        const commitLayout=(patch)=>update({experience:{...experience,fieldLayout:layout.some((x)=>x.fieldKey===fieldKey)?layout.map((x)=>x.fieldKey===fieldKey?{...x,...patch}:x):[...layout,{...item,...patch}]}});
        return <div key={fieldKey} className="rounded-lg border p-2 space-y-2" style={{borderColor:"var(--onepos-border)"}}><div className="flex items-center gap-1"><div className="text-sm font-medium flex-1">{field.label||field.api_name||fieldKey}</div><button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" disabled={fieldIndex===0} onClick={()=>moveDesignerField(fieldKey,-1)} aria-label="Move field up">↑</button><button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" disabled={fieldIndex===orderedDesignerFields.length-1} onClick={()=>moveDesignerField(fieldKey,1)} aria-label="Move field down">↓</button></div><div className="text-[11px]" style={{color:"var(--onepos-text-muted)"}}>{field.displayPath||"Primary object"} · <span className="font-mono">{fieldKey}</span></div><label className="flex gap-2 text-xs"><input type="checkbox" checked={current.visible!==false} onChange={(e)=>commit({visible:e.target.checked})}/>Visible</label><label className="flex gap-2 text-xs"><input type="checkbox" checked={current.defaultSelected===true} onChange={(e)=>{commit({defaultSelected:e.target.checked});commitLayout({defaultSelected:e.target.checked});}}/>Selected by default</label><input className="onepos-input text-xs" value={item.displayLabel||""} onChange={(e)=>commitLayout({displayLabel:e.target.value})} placeholder="Display label"/><select className="onepos-input text-xs" value={item.sectionKey||"fields"} onChange={(e)=>commitLayout({sectionKey:e.target.value})}>{(experience.sections||[{key:"fields",label:"Fields"}]).filter((s)=>s.visible!==false).map((s)=><option key={s.key} value={s.key}>{s.label}</option>)}</select></div>;
      })}</div>
    </section>
    <div className="flex justify-end gap-2"><button type="button" className="onepos-btn onepos-btn-secondary" onClick={onCancel}>Cancel</button><button type="button" className="onepos-btn onepos-btn-primary" disabled={saving} onClick={save}>{saving?"Saving…":"Save report type"}</button></div>
  </div>;
}

export function ReportTypeManager({ reportTypes=[], onRefresh, onClose }) {
  const [items,setItems]=useState(reportTypes);
  const [editing,setEditing]=useState(null);
  const [creating,setCreating]=useState(false);
  const [error,setError]=useState("");
  const loadTypes=async()=>{const response=await apiRequest("/api/reports/custom/report-types");if(response?.success)setItems(response.data||[]);};
  useEffect(()=>{void loadTypes();},[]);
  const refresh=async()=>{await Promise.all([loadTypes(),onRefresh?.()]);setEditing(null);setCreating(false);};
  const remove=async(reportType)=>{
    if(!window.confirm(`Delete report type "${reportType.label}"?`))return;
    try{
      setError("");
      const response=await apiRequest(`/api/reports/custom/report-types/${encodeURIComponent(reportType.id)}`,{method:"DELETE"});
      if(!response?.success)throw new Error(response?.message||"Unable to delete report type");
      await Promise.all([loadTypes(),onRefresh?.()]);
    }catch(err){setError(err?.message||"Unable to delete report type");}
  };
  if(creating||editing)return <ReportTypeDesigner initialValue={editing} onCancel={()=>{setCreating(false);setEditing(null);}} onSaved={refresh}/>;
  return <div className="space-y-4">
    <div className="onepos-page-header"><div><h1 className="onepos-page-title">Custom Report Types</h1><p className="onepos-page-subtitle">Control report object relationships, field layout and deployment status.</p></div><div className="flex gap-2">{onClose?<button type="button" className="onepos-btn onepos-btn-secondary" onClick={onClose}>Back</button>:null}<button type="button" className="onepos-btn onepos-btn-primary" onClick={()=>setCreating(true)}>New Report Type</button></div></div>
    {error?<div className="onepos-alert onepos-alert-error">{error}</div>:null}
    <section className="onepos-card onepos-card-body">
      <div className="space-y-2">
        {items.map((reportType)=>{
          const definition=reportType.definition||{};
          const status=definition.experience?.status||"IN_DEVELOPMENT";
          return <div key={reportType.id} className="grid gap-3 rounded-lg border p-3 md:grid-cols-[1fr_160px_auto]" style={{borderColor:"var(--onepos-border)"}}>
            <div><strong className="block text-sm">{reportType.label}{reportType.active===false?<span className="ml-2 text-[10px] uppercase" style={{color:"var(--onepos-text-muted)"}}>Inactive</span>:null}</strong><span className="text-xs" style={{color:"var(--onepos-text-muted)"}}>{reportType.type_key||definition.key} · {(definition.relationships||[]).length} related object{(definition.relationships||[]).length===1?"":"s"}</span>{reportType.description?<p className="mt-1 text-xs" style={{color:"var(--onepos-text-muted)"}}>{reportType.description}</p>:null}</div>
            <div className="text-xs"><strong>{status==="DEPLOYED"?"Deployed":"In Development"}</strong><span className="block" style={{color:"var(--onepos-text-muted)"}}>{definition.experience?.category||"Other Reports"}</span></div>
            <div className="flex items-center justify-end gap-2"><button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" onClick={()=>setEditing(reportType)}>Edit</button><button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" onClick={()=>remove(reportType)}>Delete</button></div>
          </div>;
        })}
        {!items.length?<div className="onepos-empty">No custom report types yet.</div>:null}
      </div>
    </section>
  </div>;
}

export function AdvancedFilterEditor({ filters=[],crossFilters=[],fields=[],relationships=[],allowFieldComparisons=true,onChange }) {
  const baseOperators=[["equals","Equals"],["not_equals","Not equals"],["contains","Contains"],["starts_with","Starts with"],["gt","Greater than"],["gte","Greater/equal"],["lt","Less than"],["lte","Less/equal"],["between","Between"],["is_blank","Blank"],["is_not_blank","Not blank"]];
  const fieldOperators=[["equals_field","Equals field"],["not_equals_field","Not equals field"],["gt_field","Greater than field"],["gte_field","Greater/equal field"],["lt_field","Less than field"],["lte_field","Less/equal field"]];
  const fieldComparisonCount=filters.filter((filter)=>String(filter?.operator||"").endsWith("_field")).length;
  const updateFilter=(index,patch)=>onChange({filters:filters.map((item,i)=>i===index?{...item,...patch}:item),crossFilters});
  const crossOperators=[["equals","Equals"],["not_equals","Not equals"],["gt","Greater than"],["gte","Greater/equal"],["lt","Less than"],["lte","Less/equal"],["is_blank","Blank"],["is_not_blank","Not blank"],["equals_field","Equals field"],["not_equals_field","Not equals field"],["gt_field","Greater than field"],["gte_field","Greater/equal field"],["lt_field","Less than field"],["lte_field","Less/equal field"],["relative_date","Relative date"]];
  const updateCross=(index,patch)=>onChange({filters,crossFilters:crossFilters.map((item,i)=>i===index?{...item,...patch}:item)});
  return <div className="space-y-4">
    <fieldset className="rounded-xl border p-3 space-y-3" style={{borderColor:"var(--onepos-border)"}}><div className="flex items-center justify-between"><legend className="font-medium text-sm">Advanced filters</legend><button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" disabled={filters.length>=20} onClick={()=>onChange({filters:[...filters,{field:fields[0]?.key||"",operator:"equals",value:""}],crossFilters})}>Add filter</button></div>
      {filters.map((filter,index)=>{const compare=String(filter.operator||"").endsWith("_field"), relative=filter.operator==="relative_date";return <div key={index} className="grid gap-2 md:grid-cols-[1fr_180px_1fr_auto] items-end"><select className="onepos-input" value={filter.field||""} onChange={(e)=>updateFilter(index,{field:e.target.value})}>{fields.map((field)=><option key={field.key} value={field.key}>{field.label}</option>)}</select><select className="onepos-input" value={filter.operator||"equals"} onChange={(e)=>updateFilter(index,{operator:e.target.value,compareField:null,relativeDate:null})}>{[...baseOperators,...(allowFieldComparisons&&(fieldComparisonCount<4||compare)?fieldOperators:[]),["relative_date","Relative date"]].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>{compare?<select className="onepos-input" value={filter.compareField||""} onChange={(e)=>updateFilter(index,{compareField:e.target.value})}><option value="">Compare with field…</option>{fields.map((field)=><option key={field.key} value={field.key}>{field.label}</option>)}</select>:relative?<div className="space-y-1"><div className="grid grid-cols-3 gap-1"><select className="onepos-input" value={filter.relativeDate?.direction||"LAST"} onChange={(e)=>updateFilter(index,{relativeDate:{...(filter.relativeDate||{}),direction:e.target.value}})}><option>LAST</option><option>NEXT</option><option>CURRENT</option></select><input type="number" min="1" className="onepos-input" value={filter.relativeDate?.count||1} disabled={(filter.relativeDate?.direction||"LAST")==="CURRENT"} onChange={(e)=>updateFilter(index,{relativeDate:{...(filter.relativeDate||{}),count:Number(e.target.value)}})}/><select className="onepos-input" value={filter.relativeDate?.unit||"MONTH"} onChange={(e)=>updateFilter(index,{relativeDate:{...(filter.relativeDate||{}),unit:e.target.value}})}><option>DAY</option><option>WEEK</option><option>MONTH</option><option>QUARTER</option><option>YEAR</option></select></div><label className="flex items-center gap-2 text-[11px]"><input type="checkbox" checked={filter.relativeDate?.includeCurrent!==false} onChange={(e)=>updateFilter(index,{relativeDate:{...(filter.relativeDate||{}),includeCurrent:e.target.checked}})}/>Include current period</label></div>:<input className="onepos-input" value={filter.value??""} onChange={(e)=>updateFilter(index,{value:e.target.value})}/>}<button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" onClick={()=>onChange({filters:filters.filter((_,i)=>i!==index),crossFilters})}>Remove</button></div>;})}
    </fieldset>

    <fieldset className="rounded-xl border p-3 space-y-3" style={{borderColor:"var(--onepos-border)"}}><div className="flex items-center justify-between"><legend className="font-medium text-sm">Cross filters</legend><button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" disabled={crossFilters.length>=3||!relationships.length} onClick={()=>onChange({filters,crossFilters:[...crossFilters,{type:"WITH",relationshipKey:relationships[0]?.key||relationships[0]?.relationship_key||"",subfilters:[]}]})}>Add cross filter</button></div>
      {crossFilters.map((cross,index)=>{
        const relationship=relationships.find((rel)=>(rel.key||rel.relationship_key)===cross.relationshipKey)||relationships[0];
        const relatedFields=relationship?.fields||[];
        return <div key={index} className="rounded-lg border p-3 space-y-3" style={{borderColor:"var(--onepos-border)"}}>
          <div className="grid gap-2 md:grid-cols-[120px_1fr_auto]"><select className="onepos-input" value={cross.type||"WITH"} onChange={(e)=>updateCross(index,{type:e.target.value})}><option value="WITH">WITH</option><option value="WITHOUT">WITHOUT</option></select><select className="onepos-input" value={cross.relationshipKey||""} onChange={(e)=>updateCross(index,{relationshipKey:e.target.value,subfilters:[]})}>{relationships.map((rel)=><option key={rel.key||rel.relationship_key} value={rel.key||rel.relationship_key}>{rel.label||rel.relationship_key}</option>)}</select><button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" onClick={()=>onChange({filters,crossFilters:crossFilters.filter((_,i)=>i!==index)})}>Remove</button></div>
          <div className="space-y-2"><div className="flex items-center justify-between"><span className="text-xs font-medium">Related-record conditions</span><button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" disabled={!relatedFields.length||(cross.subfilters||[]).length>=5} onClick={()=>updateCross(index,{subfilters:[...(cross.subfilters||[]),{field:relatedFields[0]?.key||relatedFields[0]?.api_name||"",operator:"equals",value:""}]})}>Add condition</button></div>
            {(cross.subfilters||[]).map((subfilter,subIndex)=>{
              const relative=subfilter.operator==="relative_date";
              const compare=String(subfilter.operator||"").endsWith("_field");
              const patchSub=(patch)=>updateCross(index,{subfilters:cross.subfilters.map((item,i)=>i===subIndex?{...item,...patch}:item)});
              return <div key={subIndex} className="grid gap-2 md:grid-cols-[1fr_160px_1fr_auto] items-end"><select className="onepos-input" value={subfilter.field||""} onChange={(e)=>patchSub({field:e.target.value})}>{relatedFields.map((field)=><option key={field.key||field.api_name} value={field.key||field.api_name}>{field.label||field.api_name}</option>)}</select><select className="onepos-input" value={subfilter.operator||"equals"} onChange={(e)=>patchSub({operator:e.target.value,relativeDate:null,compareField:null})}>{crossOperators.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>{compare?<select className="onepos-input" value={subfilter.compareField||""} onChange={(e)=>patchSub({compareField:e.target.value})}><option value="">Compare with field…</option>{relatedFields.map((field)=><option key={field.key||field.api_name} value={field.key||field.api_name}>{field.label||field.api_name}</option>)}</select>:relative?<div className="space-y-1"><div className="grid grid-cols-3 gap-1"><select className="onepos-input" value={subfilter.relativeDate?.direction||"LAST"} onChange={(e)=>patchSub({relativeDate:{...(subfilter.relativeDate||{}),direction:e.target.value}})}><option>LAST</option><option>NEXT</option><option>CURRENT</option></select><input type="number" min="1" className="onepos-input" disabled={(subfilter.relativeDate?.direction||"LAST")==="CURRENT"} value={subfilter.relativeDate?.count||1} onChange={(e)=>patchSub({relativeDate:{...(subfilter.relativeDate||{}),count:Number(e.target.value)}})}/><select className="onepos-input" value={subfilter.relativeDate?.unit||"MONTH"} onChange={(e)=>patchSub({relativeDate:{...(subfilter.relativeDate||{}),unit:e.target.value}})}><option>DAY</option><option>WEEK</option><option>MONTH</option><option>QUARTER</option><option>YEAR</option></select></div><label className="flex items-center gap-2 text-[11px]"><input type="checkbox" checked={subfilter.relativeDate?.includeCurrent!==false} onChange={(e)=>patchSub({relativeDate:{...(subfilter.relativeDate||{}),includeCurrent:e.target.checked}})}/>Include current period</label></div>:<input className="onepos-input" disabled={["is_blank","is_not_blank"].includes(subfilter.operator)} value={subfilter.value??""} onChange={(e)=>patchSub({value:e.target.value})}/>}<button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" onClick={()=>updateCross(index,{subfilters:cross.subfilters.filter((_,i)=>i!==subIndex)})}>Remove</button></div>;
            })}
          </div>
        </div>;
      })}
    </fieldset>
  </div>;
}

