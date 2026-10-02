import { useEffect, useMemo, useState } from "react";
import {
  archiveCustomReport,
  createCustomReport,
  duplicateCustomReport,
  exportCustomReport,
  getCustomReport,
  getCustomReportMetadata,
  getCustomReports,
  getPlatformReportFields,
  previewCustomReport,
  runCustomReport,
  updateCustomReport,
  updateCustomReportUsers,
} from "../../services/customReports.js";
import {
  BucketEditor,
  ConditionalFormattingEditor,
  DrillActionEditor,
  FormulaEditor,
  JoinedBlocksEditor,
} from "./ReportAdvancedEditors.jsx";
import {
  HistoricalTrendEditor,
  PreviewControls,
  ReportExportDialog,
} from "./ReportExperienceControls.jsx";
import { AdvancedFilterEditor, ReportTypeDesigner } from "./ReportTypeDesigner.jsx";
import ReportManagementPanel from "./ReportManagementPanel.jsx";

const fresh = () => ({
  name: "",
  description: "",
  dataSource: "sales",
  reportTypeId: null,
  objectId: "",
  format: "tabular",
  fields: ["date", "net_sales", "transactions"],
  filters: [{ field: "date", operator: "this_week" }],
  filterLogic: "all",
  crossFilters: [],
  rowGroups: ["date"],
  columnGroups: [],
  groupBy: ["date"],
  summaries: [],
  sort: [{ field: "date", direction: "desc", nulls: "last" }],
  rowLimit: 1000,
  showDetails: true,
  showSubtotals: true,
  showGrandTotal: true,
  buckets: [],
  rowFormulas: [],
  summaryFormulas: [],
  crossBlockFormulas: [],
  conditionalFormatting: [],
  drillAction: null,
  blocks: [],
  commonGroups: [],
  presentation: { type: "table", xField: null, yField: null, seriesField: null, stacked: false },
  previewPreference: { autoPreview: true, sampleLimit: 50 },
  historicalTrend: { enabled: false, snapshotDates: [], historicalFilters: [] },
  userIds: [],
});

const errorMessage = (error) => error?.message || "Unable to complete this report action";
const fieldLabel = (fields, key) => fields.find((field) => field.key === key)?.label || key;

export default function CustomReportsAdmin({ embedded = false, initialReport = null, onClose, onSaved } = {}) {
  const [reports,setReports]=useState([]);
  const [metadata,setMetadata]=useState({ fields:[],filters:[],stores:[],users:[],platformObjects:[],reportTypes:[],sources:[],relationships:[],canManage:false });
  const [platformFields,setPlatformFields]=useState([]);
  const [platformRelationships,setPlatformRelationships]=useState([]);
  const [editingId,setEditingId]=useState(initialReport?.id||null);
  const [definition,setDefinition]=useState(()=>initialReport?.definition?{...fresh(),...initialReport.definition,name:initialReport.name||"",description:initialReport.description||""}:fresh());
  const [results,setResults]=useState(null);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [running,setRunning]=useState("");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [showExport,setShowExport]=useState(false);
  const [showReportTypeDesigner,setShowReportTypeDesigner]=useState(false);

  const load=async()=>{
    try{
      setLoading(true);setError("");
      const [meta,list]=await Promise.all([getCustomReportMetadata(),getCustomReports()]);
      if(!meta?.success)throw new Error(meta?.message||"Unable to load report metadata");
      setMetadata({
        fields:meta.data?.fields||[],filters:meta.data?.filters||[],stores:meta.data?.stores||[],users:meta.data?.users||[],
        platformObjects:meta.data?.platformObjects||[],reportTypes:meta.data?.reportTypes||[],sources:meta.data?.sources||[],
        canManage:meta.data?.canManage===true,
      });
      setReports(list?.success?list.data||[]:[]);
    }catch(e){setError(errorMessage(e));}finally{setLoading(false);}
  };
  useEffect(()=>{void load();},[]);

  useEffect(()=>{
    const objectId=definition.objectId;
    if(definition.dataSource!=="platform_object"||!objectId){setPlatformFields([]);setPlatformRelationships([]);return;}
    getPlatformReportFields(objectId).then((response)=>{
      if(response?.success){setPlatformFields(response.data?.fields||[]);setPlatformRelationships(response.data?.relationships||[]);}
    }).catch(()=>{setPlatformFields([]);setPlatformRelationships([]);});
  },[definition.dataSource,definition.objectId]);

  const availableFields=definition.dataSource==="platform_object"?platformFields:metadata.fields;
  const selectedFields=useMemo(()=>definition.fields.map((key)=>availableFields.find((field)=>field.key===key)).filter(Boolean),[definition.fields,availableFields]);
  const update=(patch)=>setDefinition((current)=>({...current,...patch}));

  const reset=()=>{setEditingId(null);setDefinition(fresh());setResults(null);setNotice("");setError("");};
  const open=async(report)=>{
    try{
      setError("");const response=await getCustomReport(report.id);if(!response?.success)throw new Error(response?.message);
      const data=response.data;setEditingId(data.id);setDefinition({...fresh(),...(data.definition||{}),name:data.name||"",description:data.description||"",userIds:data.user_ids||data.userIds||[]});setResults(null);
    }catch(e){setError(errorMessage(e));}
  };
  const changeSource=(dataSource)=>{
    if(dataSource==="sales")update({dataSource,reportTypeId:null,objectId:"",fields:["date","net_sales","transactions"],rowGroups:["date"],groupBy:["date"],columnGroups:[],summaries:[],filters:[{field:"date",operator:"this_week"}],crossFilters:[],sort:[{field:"date",direction:"desc",nulls:"last"}]});
    else update({dataSource,reportTypeId:null,objectId:metadata.platformObjects?.[0]?.id||"",fields:[],rowGroups:[],groupBy:[],columnGroups:[],summaries:[],filters:[],crossFilters:[],sort:[]});
  };
  const changeReportType=(reportTypeId)=>{
    if(!reportTypeId)return update({reportTypeId:null});
    const reportType=(metadata.reportTypes||[]).find((item)=>String(item.id)===String(reportTypeId));
    const typeDefinition=reportType?.definition||{};
    const experience=typeDefinition.experience||{};
    const defaults=[...(typeDefinition.fieldVisibility||[]).filter((item)=>item.visible!==false&&item.defaultSelected===true).map((item)=>item.fieldKey),...(experience.fieldLayout||[]).filter((item)=>item.visible!==false&&item.defaultSelected===true).map((item)=>item.fieldKey)];
    update({dataSource:"platform_object",reportTypeId,objectId:typeDefinition.primaryObjectId||reportType?.primary_object_id||"",fields:[...new Set(defaults)],rowGroups:[],groupBy:[],columnGroups:[],summaries:[],filters:[],crossFilters:[],sort:[]});
  };
  const changeObject=(objectId)=>update({objectId,reportTypeId:null,fields:[],rowGroups:[],groupBy:[],columnGroups:[],summaries:[],filters:[],crossFilters:[],sort:[]});
  const toggleField=(key)=>update({fields:definition.fields.includes(key)?definition.fields.filter((item)=>item!==key):[...definition.fields,key]});

  const preview=async()=>{
    try{setRunning("preview");setError("");const response=await previewCustomReport(definition);if(!response?.success)throw new Error(response?.message);setResults(response.data);}catch(e){setError(errorMessage(e));}finally{setRunning("");}
  };
  useEffect(()=>{
    if(definition.previewPreference?.autoPreview===false||!definition.fields?.length)return undefined;
    const timer=window.setTimeout(()=>{void preview();},500);
    return()=>window.clearTimeout(timer);
  },[definition.dataSource,definition.objectId,definition.reportTypeId,JSON.stringify(definition.fields),JSON.stringify(definition.filters),definition.filterLogic,JSON.stringify(definition.rowGroups),JSON.stringify(definition.columnGroups),JSON.stringify(definition.summaries),definition.format]);

  const save=async(runAfter=false)=>{
    try{
      setSaving(true);setError("");setNotice("");
      const payload={...definition,groupBy:definition.rowGroups||definition.groupBy||[]};
      const response=editingId?await updateCustomReport(editingId,payload):await createCustomReport(payload);
      if(!response?.success)throw new Error(response?.message);
      const id=response.data?.id||editingId;
      if(metadata.canManage&&id&&definition.userIds)await updateCustomReportUsers(id,definition.userIds);
      setEditingId(id);setNotice("Report saved.");await load();onSaved?.();
      if(runAfter&&id){const run=await runCustomReport(id);if(!run?.success)throw new Error(run?.message);setResults(run.data);}
    }catch(e){setError(errorMessage(e));}finally{setSaving(false);}
  };
  const run=async(id)=>{
    try{setRunning(id);setError("");const response=await runCustomReport(id);if(!response?.success)throw new Error(response?.message);setResults(response.data);const report=reports.find((item)=>item.id===id);if(report&&!editingId)await open(report);}catch(e){setError(errorMessage(e));}finally{setRunning("");}
  };
  const duplicate=async(report)=>{try{const response=await duplicateCustomReport(report.id);if(!response?.success)throw new Error(response?.message);setNotice("Report duplicated.");await load();}catch(e){setError(errorMessage(e));}};
  const archive=async(report)=>{if(!window.confirm(`Archive "${report.name}"?`))return;try{const response=await archiveCustomReport(report.id);if(!response?.success)throw new Error(response?.message);if(editingId===report.id)reset();await load();}catch(e){setError(errorMessage(e));}};

  const addSummary=()=>update({summaries:[...(definition.summaries||[]),{aggregate:"COUNT",field:selectedFields[0]?.key||"",alias:`summary_${(definition.summaries||[]).length+1}`}]});
  const outputRows=results?.rows||[];
  const outputColumns=(results?.columns||definition.fields||[]).map((column)=>typeof column==="string"?{key:column,label:fieldLabel(availableFields,column)}:column);

  if(loading)return <div className="onepos-empty">Loading custom reports…</div>;
  if(showReportTypeDesigner)return <ReportTypeDesigner onCancel={()=>setShowReportTypeDesigner(false)} onSaved={async()=>{setShowReportTypeDesigner(false);await load();}}/>;

  return <div className="space-y-5">
    <div className="onepos-page-header"><div><h1 className="onepos-page-title">{embedded?(editingId?"Edit Report":"Create Report"):"Report Builder"}</h1><p className="onepos-page-subtitle">One metadata definition for reports, dashboards and embedded analytics.</p></div><div className="flex gap-2">{metadata.canManage?<button type="button" className="onepos-btn onepos-btn-secondary" onClick={()=>setShowReportTypeDesigner(true)}>Report Types</button>:null}{!embedded?<button type="button" className="onepos-btn onepos-btn-primary" onClick={reset}>Create Report</button>:<button type="button" className="onepos-btn onepos-btn-secondary" onClick={()=>onClose?.()}>Close</button>}</div></div>
    {error?<div className="onepos-alert onepos-alert-error">{error}</div>:null}{notice?<div className="onepos-alert onepos-alert-success">{notice}</div>:null}

    {!embedded?<ReportManagementPanel
      reports={reports}
      currentReportId={editingId}
      canManage={metadata.canManage}
      onOpenReport={open}
      onRunReport={run}
      onDuplicateReport={duplicate}
      onArchiveReport={archive}
      onRefresh={load}
    />:null}

    <section className="onepos-card onepos-card-body space-y-5">
      <PreviewControls value={definition.previewPreference||{autoPreview:true,sampleLimit:50}} onChange={(previewPreference)=>update({previewPreference})} onRefresh={preview} refreshing={running==="preview"}/>
      <div className="grid md:grid-cols-2 gap-3"><label className="onepos-label">Report name<input className="onepos-input mt-1" value={definition.name} onChange={(e)=>update({name:e.target.value})}/></label><label className="onepos-label">Description<input className="onepos-input mt-1" value={definition.description} onChange={(e)=>update({description:e.target.value})}/></label></div>
      <div className="grid md:grid-cols-3 gap-3">
        <label className="onepos-label">Data source<select className="onepos-input mt-1" value={definition.dataSource} onChange={(e)=>changeSource(e.target.value)}><option value="sales">Sales</option><option value="platform_object">Platform Object</option></select></label>
        {definition.dataSource==="platform_object"?<label className="onepos-label">Report type<select className="onepos-input mt-1" value={definition.reportTypeId||""} onChange={(e)=>changeReportType(e.target.value)}><option value="">Direct Object report</option>{(metadata.reportTypes||[]).map((item)=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label>:null}
        {definition.dataSource==="platform_object"?<label className="onepos-label">Object<select className="onepos-input mt-1" disabled={Boolean(definition.reportTypeId)} value={definition.objectId||""} onChange={(e)=>changeObject(e.target.value)}><option value="">Select object</option>{metadata.platformObjects.map((object)=><option key={object.id} value={object.id}>{object.label||object.object_key}</option>)}</select></label>:null}
      </div>
      <div className="grid md:grid-cols-4 gap-3"><label className="onepos-label">Format<select className="onepos-input mt-1" value={definition.format||"tabular"} onChange={(e)=>update({format:e.target.value})}><option value="tabular">Tabular</option><option value="summary">Summary</option><option value="matrix">Matrix</option><option value="joined">Joined</option></select></label><label className="onepos-label">Row limit<input type="number" min="1" max="1000" className="onepos-input mt-1" value={definition.rowLimit||1000} onChange={(e)=>update({rowLimit:Number(e.target.value)})}/></label><label className="flex items-end gap-2 text-sm pb-2"><input type="checkbox" checked={definition.showDetails!==false} onChange={(e)=>update({showDetails:e.target.checked})}/>Detail rows</label><label className="flex items-end gap-2 text-sm pb-2"><input type="checkbox" checked={definition.showSubtotals!==false} onChange={(e)=>update({showSubtotals:e.target.checked})}/>Subtotals</label><label className="flex items-end gap-2 text-sm pb-2"><input type="checkbox" checked={definition.showGrandTotal!==false} onChange={(e)=>update({showGrandTotal:e.target.checked})}/>Grand total</label></div>

      <fieldset><legend className="text-sm font-medium mb-2">Fields</legend><div className="grid grid-cols-2 md:grid-cols-4 gap-2">{availableFields.map((field)=><label key={field.key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={definition.fields.includes(field.key)} onChange={()=>toggleField(field.key)}/>{field.label}</label>)}</div></fieldset>
      {selectedFields.length?<div className="space-y-1"><div className="text-sm font-medium">Column order</div>{selectedFields.map((field,index)=><div key={field.key} className="flex items-center gap-2 text-sm"><span className="flex-1">{field.label}</span><button type="button" disabled={index===0} onClick={()=>{const next=[...definition.fields];[next[index-1],next[index]]=[next[index],next[index-1]];update({fields:next});}}>↑</button><button type="button" disabled={index===selectedFields.length-1} onClick={()=>{const next=[...definition.fields];[next[index],next[index+1]]=[next[index+1],next[index]];update({fields:next});}}>↓</button></div>)}</div>:null}

      {definition.dataSource==="platform_object"?<AdvancedFilterEditor filters={definition.filters||[]} crossFilters={definition.crossFilters||[]} fields={availableFields} relationships={platformRelationships} onChange={({filters,crossFilters})=>update({filters,crossFilters})}/>:<div className="grid md:grid-cols-2 gap-3"><label className="onepos-label">Date range<select className="onepos-input mt-1" value={definition.filters?.[0]?.operator||"this_week"} onChange={(e)=>update({filters:[{field:"date",operator:e.target.value}]})}>{metadata.filters.map((item)=><option key={item.key} value={item.key}>{item.label}</option>)}</select></label></div>}

      <div className="grid md:grid-cols-3 gap-3">
        <label className="onepos-label">Row groups<select multiple className="onepos-input mt-1 min-h-28" value={definition.rowGroups||[]} onChange={(e)=>{const rowGroups=[...e.target.selectedOptions].map((o)=>o.value);update({rowGroups,groupBy:rowGroups})}}>{selectedFields.map((field)=><option key={field.key} value={field.key}>{field.label}</option>)}</select></label>
        <label className="onepos-label">Column groups<select multiple className="onepos-input mt-1 min-h-28" value={definition.columnGroups||[]} onChange={(e)=>update({columnGroups:[...e.target.selectedOptions].map((o)=>o.value)})}>{selectedFields.map((field)=><option key={field.key} value={field.key}>{field.label}</option>)}</select></label>
        <label className="onepos-label">Filter logic<input className="onepos-input mt-1" value={definition.filterLogic||"all"} onChange={(e)=>update({filterLogic:e.target.value})} placeholder="all, any, or 1 AND (2 OR 3)"/></label>
      </div>

      <fieldset className="rounded-xl border p-3 space-y-2" style={{borderColor:"var(--onepos-border)"}}><div className="flex justify-between"><legend className="text-sm font-medium">Summaries</legend><button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" onClick={addSummary}>Add summary</button></div>{(definition.summaries||[]).map((summary,index)=><div key={index} className="grid gap-2 md:grid-cols-[150px_1fr_1fr_auto]"><select className="onepos-input" value={summary.aggregate} onChange={(e)=>update({summaries:definition.summaries.map((item,i)=>i===index?{...item,aggregate:e.target.value}:item)})}>{["COUNT","COUNT_DISTINCT","SUM","AVG","MIN","MAX"].map((agg)=><option key={agg}>{agg}</option>)}</select><select className="onepos-input" value={summary.field} onChange={(e)=>update({summaries:definition.summaries.map((item,i)=>i===index?{...item,field:e.target.value}:item)})}>{selectedFields.map((field)=><option key={field.key} value={field.key}>{field.label}</option>)}</select><input className="onepos-input" value={summary.alias||""} placeholder="Alias" onChange={(e)=>update({summaries:definition.summaries.map((item,i)=>i===index?{...item,alias:e.target.value}:item)})}/><button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" onClick={()=>update({summaries:definition.summaries.filter((_,i)=>i!==index)})}>Remove</button></div>)}</fieldset>

      <BucketEditor buckets={definition.buckets||[]} onChange={(buckets)=>update({buckets})} fields={availableFields}/>
      <FormulaEditor title="Row Formula" formulas={definition.rowFormulas||[]} onChange={(rowFormulas)=>update({rowFormulas})} scope="row" fieldOptions={availableFields}/>
      <FormulaEditor title="Summary Formula" formulas={definition.summaryFormulas||[]} onChange={(summaryFormulas)=>update({summaryFormulas})} scope="summary" fieldOptions={[...availableFields,...(definition.summaries||[]).map((s)=>({key:s.alias||`${String(s.aggregate).toLowerCase()}_${s.field}`,label:s.alias||s.field}))]}/>
      {definition.format==="joined"?<><JoinedBlocksEditor blocks={definition.blocks||[]} onChange={(blocks)=>update({blocks})} sources={metadata.sources} objects={metadata.platformObjects}/><label className="onepos-label">Common groups<input className="onepos-input mt-1" value={(definition.commonGroups||[]).join(", ")} onChange={(e)=>update({commonGroups:e.target.value.split(",").map((v)=>v.trim()).filter(Boolean)})}/></label><FormulaEditor title="Cross-block Formula" formulas={definition.crossBlockFormulas||[]} onChange={(crossBlockFormulas)=>update({crossBlockFormulas})} scope="cross_block" fieldOptions={[]}/></>:null}
      <ConditionalFormattingEditor rules={definition.conditionalFormatting||[]} onChange={(conditionalFormatting)=>update({conditionalFormatting})} fields={[...availableFields,...(definition.rowFormulas||[]).map((f)=>({key:f.key,label:f.label||f.key})),...(definition.summaryFormulas||[]).map((f)=>({key:f.key,label:f.label||f.key}))]}/>
      <DrillActionEditor action={definition.drillAction} onChange={(drillAction)=>update({drillAction})} reports={reports} fields={availableFields}/>
      <HistoricalTrendEditor value={definition.historicalTrend||{enabled:false,snapshotDates:[],historicalFilters:[]}} onChange={(historicalTrend)=>update({historicalTrend,snapshot:historicalTrend.enabled===true})} fields={availableFields}/>

      <fieldset className="rounded-xl border p-3" style={{borderColor:"var(--onepos-border)"}}><legend className="text-sm font-medium">Chart</legend><div className="grid md:grid-cols-4 gap-3"><label className="onepos-label">Type<select className="onepos-input mt-1" value={definition.presentation?.type||"table"} onChange={(e)=>update({presentation:{...(definition.presentation||{}),type:e.target.value}})}>{["table","summary","bar","line","pie","donut","gauge","funnel","scatter"].map((type)=><option key={type} value={type}>{type}</option>)}</select></label><label className="onepos-label">X / category<select className="onepos-input mt-1" value={definition.presentation?.xField||""} onChange={(e)=>update({presentation:{...(definition.presentation||{}),xField:e.target.value}})}><option value="">None</option>{selectedFields.map((field)=><option key={field.key} value={field.key}>{field.label}</option>)}</select></label><label className="onepos-label">Y / value<select className="onepos-input mt-1" value={definition.presentation?.yField||""} onChange={(e)=>update({presentation:{...(definition.presentation||{}),yField:e.target.value}})}><option value="">None</option>{selectedFields.map((field)=><option key={field.key} value={field.key}>{field.label}</option>)}</select></label><label className="flex items-end gap-2 text-sm pb-2"><input type="checkbox" checked={definition.presentation?.stacked===true} onChange={(e)=>update({presentation:{...(definition.presentation||{}),stacked:e.target.checked}})}/>Stacked</label></div></fieldset>

      {metadata.canManage&&editingId?<label className="onepos-label">Assign users<select multiple className="onepos-input mt-1 min-h-24" value={definition.userIds||[]} onChange={(e)=>update({userIds:[...e.target.selectedOptions].map((option)=>option.value)})}>{metadata.users.map((user)=><option key={user.id} value={user.id}>{user.full_name||user.username}</option>)}</select></label>:null}
      <div className="flex flex-wrap gap-2"><button type="button" className="onepos-btn onepos-btn-primary" disabled={saving} onClick={()=>save(false)}>{saving?"Saving…":"Save"}</button><button type="button" className="onepos-btn onepos-btn-secondary" disabled={saving} onClick={()=>save(true)}>Save & Run</button><button type="button" className="onepos-btn onepos-btn-secondary" disabled={running==="preview"} onClick={preview}>{running==="preview"?"Previewing…":"Preview"}</button>{editingId?<button type="button" className="onepos-btn onepos-btn-secondary" onClick={()=>setShowExport(true)}>Export</button>:null}</div>
    </section>

    {showExport&&editingId?<ReportExportDialog format={definition.format||"tabular"} onClose={()=>setShowExport(false)} onExport={async({view,format})=>{try{const download=await exportCustomReport(editingId,{view,format});const url=URL.createObjectURL(download.blob);const anchor=document.createElement("a");anchor.href=url;anchor.download=download.filename;document.body.appendChild(anchor);anchor.click();anchor.remove();URL.revokeObjectURL(url);setShowExport(false);}catch(e){setError(errorMessage(e));}}}/>:null}

    {results?<section className="onepos-card onepos-card-body overflow-auto"><div className="flex items-center justify-between mb-3"><h2 className="font-semibold">Results</h2>{results.totals&&Object.keys(results.totals).length?<span className="text-xs" style={{color:"var(--onepos-text-muted)"}}>Grand totals available</span>:null}</div><table className="onepos-table w-full"><thead><tr>{outputColumns.map((column)=><th key={column.key}>{column.label||column.key}</th>)}</tr></thead><tbody>{outputRows.map((row,index)=><tr key={index}>{outputColumns.map((column)=><td key={column.key}>{String(row?.[column.key]??"")}</td>)}</tr>)}</tbody></table></section>:null}
  </div>;
}
