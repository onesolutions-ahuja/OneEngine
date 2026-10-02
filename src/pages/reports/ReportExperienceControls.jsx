export function PreviewControls({ value = { autoPreview: true, sampleLimit: 50 }, onChange, onRefresh, refreshing = false }) {
  return <div className="flex flex-wrap items-center gap-3">
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value.autoPreview !== false} onChange={(e) => onChange({ ...value, autoPreview: e.target.checked })} />Update preview automatically</label>
    <label className="onepos-label">Preview rows<select className="onepos-input ml-2 w-auto" value={value.sampleLimit || 50} onChange={(e) => onChange({ ...value, sampleLimit: Number(e.target.value) })}>{[25,50,75,100,200].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
    {value.autoPreview === false ? <button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" disabled={refreshing} onClick={onRefresh}>{refreshing ? "Refreshing…" : "Refresh preview"}</button> : null}
  </div>;
}

export function HistoricalTrendEditor({ value = {}, onChange, fields = [] }) {
  const dates=value.snapshotDates||[], filters=value.historicalFilters||[];
  return <fieldset className="rounded-xl border p-3 space-y-3" style={{borderColor:"var(--onepos-border)"}}>
    <div className="flex items-center justify-between"><legend className="font-medium text-sm">Historical trend</legend><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value.enabled===true} onChange={(e)=>onChange({...value,enabled:e.target.checked})}/>Enable</label></div>
    {value.enabled ? <>
      <div><div className="text-xs font-medium mb-1">Snapshot dates (max 5)</div><div className="flex flex-wrap gap-2">
        {dates.map((date,index)=><span key={index} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs" style={{borderColor:"var(--onepos-border)"}}><input type="date" value={date} onChange={(e)=>onChange({...value,snapshotDates:dates.map((d,i)=>i===index?e.target.value:d)})}/><button type="button" onClick={()=>onChange({...value,snapshotDates:dates.filter((_,i)=>i!==index)})}>×</button></span>)}
        {dates.length<5?<button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" onClick={()=>onChange({...value,snapshotDates:[...dates,new Date().toISOString().slice(0,10)]})}>Add snapshot</button>:null}
      </div></div>
      <div className="space-y-2"><div className="text-xs font-medium">Historical filters (max 4)</div>
        {filters.map((filter,index)=><div key={index} className="grid gap-2 md:grid-cols-[1fr_160px_1fr_150px_auto]">
          <select className="onepos-input" value={filter.field||""} onChange={(e)=>onChange({...value,historicalFilters:filters.map((f,i)=>i===index?{...f,field:e.target.value}:f)})}><option value="">Field</option>{fields.map((field)=><option key={field.key} value={field.key}>{field.label}</option>)}</select>
          <select className="onepos-input" value={filter.operator||"equals"} onChange={(e)=>onChange({...value,historicalFilters:filters.map((f,i)=>i===index?{...f,operator:e.target.value}:f)})}><option value="equals">Equals</option><option value="not_equals">Not equals</option><option value="gt">Greater than</option><option value="gte">Greater/equal</option><option value="lt">Less than</option><option value="lte">Less/equal</option></select>
          <input className="onepos-input" value={filter.value??""} onChange={(e)=>onChange({...value,historicalFilters:filters.map((f,i)=>i===index?{...f,value:e.target.value}:f)})}/>
          <select className="onepos-input" value={filter.snapshotMode||"SPECIFIC"} onChange={(e)=>onChange({...value,historicalFilters:filters.map((f,i)=>i===index?{...f,snapshotMode:e.target.value}:f)})}><option value="SPECIFIC">Specific snapshot</option><option value="ANY">Any snapshot</option><option value="ALL">All snapshots</option></select>
          <button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" onClick={()=>onChange({...value,historicalFilters:filters.filter((_,i)=>i!==index)})}>Remove</button>
        </div>)}
        {filters.length<4?<button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" onClick={()=>onChange({...value,historicalFilters:[...filters,{field:fields[0]?.key||"",operator:"equals",value:"",snapshotMode:"SPECIFIC"}]})}>Add historical filter</button>:null}
      </div>
    </>:null}
  </fieldset>;
}

export function ReportExportDialog({ format="tabular", onExport, onClose }) {
  const joined=format==="joined";
  return <div className="onepos-card onepos-card-body space-y-3"><h3 className="font-semibold">Export report</h3><div className="grid gap-3 md:grid-cols-2">
    <button type="button" className="rounded-xl border p-4 text-left" style={{borderColor:"var(--onepos-border)"}} onClick={()=>onExport?.({view:"FORMATTED",format:"XLSX"})}><strong className="block">Formatted report</strong><span className="text-xs" style={{color:"var(--onepos-text-muted)"}}>XLSX with report headings, groupings, filters and summary presentation.</span></button>
    <button type="button" disabled={joined} className="rounded-xl border p-4 text-left disabled:opacity-50" style={{borderColor:"var(--onepos-border)"}} onClick={()=>onExport?.({view:"DETAILS",format:"CSV"})}><strong className="block">Details only</strong><span className="text-xs" style={{color:"var(--onepos-text-muted)"}}>{joined?"Not available for joined reports.":"Raw detail rows for spreadsheet analysis."}</span></button>
  </div><button type="button" className="onepos-btn onepos-btn-secondary" onClick={onClose}>Cancel</button></div>;
}

export function ReportTypeExperienceEditor({ value={}, onChange }) {
  const sections=value.sections||[];
  return <div className="space-y-3"><div className="grid gap-3 md:grid-cols-2">
    <label className="onepos-label">Deployment status<select className="onepos-input mt-1" value={value.status||"IN_DEVELOPMENT"} onChange={(e)=>onChange({...value,status:e.target.value})}><option value="IN_DEVELOPMENT">In Development</option><option value="DEPLOYED">Deployed</option></select></label>
    <label className="onepos-label">Category<input className="onepos-input mt-1" value={value.category||"Other Reports"} onChange={(e)=>onChange({...value,category:e.target.value})}/></label>
  </div><div className="space-y-2"><div className="flex items-center justify-between"><span className="text-sm font-medium">Layout sections</span><button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" onClick={()=>onChange({...value,sections:[...sections,{key:`section_${sections.length+1}`,label:`Section ${sections.length+1}`,visible:true,order:sections.length}]})}>Add section</button></div>
    {sections.map((section,index)=><div key={section.key} className="grid gap-2 md:grid-cols-[1fr_120px_auto] items-center"><input className="onepos-input" value={section.label||""} onChange={(e)=>onChange({...value,sections:sections.map((s,i)=>i===index?{...s,label:e.target.value}:s)})}/><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={section.visible!==false} onChange={(e)=>onChange({...value,sections:sections.map((s,i)=>i===index?{...s,visible:e.target.checked}:s)})}/>Visible</label><button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" onClick={()=>onChange({...value,sections:sections.filter((_,i)=>i!==index)})}>Remove</button></div>)}
  </div></div>;
}
