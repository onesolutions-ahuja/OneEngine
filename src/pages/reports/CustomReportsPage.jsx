import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Copy, Play, Plus, Save, Trash2 } from 'lucide-react'
import {
  archiveCustomReport,createCustomReport,duplicateCustomReport,getCustomReportMetadata,getCustomReports,
  getPlatformReportFields,previewCustomReport,runCustomReport,updateCustomReport,updateCustomReportUsers,
} from '../../services/reports'

const fresh=()=>({
  name:'',description:'',dataSource:'sales',
  fields:['date','net_sales','transactions'],
  filters:[{field:'date',operator:'this_week'}],
  groupBy:['date'],sort:[{field:'date',direction:'desc'}],
  summaries:[],filterLogic:'all',userIds:[],
})
const fieldLabel=(fields,key)=>fields.find(f=>f.key===key)?.label||key

export default function CustomReportsPage({onBack}){
  const [reports,setReports]=useState([])
  const [metadata,setMetadata]=useState({fields:[],filters:[],users:[],platformObjects:[],canManage:false})
  const [definition,setDefinition]=useState(fresh)
  const [editingId,setEditingId]=useState(null)
  const [platformFields,setPlatformFields]=useState([])
  const [results,setResults]=useState(null)
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState('')
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')

  const load=async()=>{
    try{
      setLoading(true);setError('')
      const [list,meta]=await Promise.all([getCustomReports(),getCustomReportMetadata()])
      if(!list?.success||!meta?.success)throw new Error(list?.message||meta?.message||'Unable to load custom reports')
      setReports(meta.data?.reports||list.data||[])
      setMetadata({
        fields:meta.data?.fields||[],
        filters:meta.data?.filters||[],
        users:meta.data?.users||[],
        platformObjects:meta.data?.platformObjects||[],
        canManage:meta.data?.canManage===true,
      })
    }catch(err){setError(err?.message||'Unable to load custom reports')}
    finally{setLoading(false)}
  }
  useEffect(()=>{void load()},[])

  useEffect(()=>{
    if(definition.dataSource!=='platform_object'||!definition.objectId){setPlatformFields([]);return}
    let live=true
    getPlatformReportFields(definition.objectId).then(r=>{
      if(!live)return
      const direct=r?.data?.fields||[]
      const related=(r?.data?.relationships||[]).flatMap(rel=>(rel.fields||[]).map(field=>({
        ...field,
        key:`${rel.relationship_key}.${field.key||field.api_name}`,
        label:`${rel.label||rel.relationship_key} · ${field.label||field.api_name}`,
        groupable:field.groupable!==false,
      })))
      setPlatformFields([...direct,...related])
    }).catch(()=>live&&setPlatformFields([]))
    return()=>{live=false}
  },[definition.dataSource,definition.objectId])

  const fields=definition.dataSource==='platform_object'?platformFields:metadata.fields
  const selected=useMemo(()=>fields.filter(f=>definition.fields.includes(f.key)),[fields,definition.fields])
  const patch=next=>setDefinition(d=>({...d,...next}))
  const reset=()=>{setEditingId(null);setDefinition(fresh());setResults(null);setNotice('');setError('')}

  const changeSource=dataSource=>{
    if(dataSource==='sales')return patch({dataSource,objectId:'',fields:['date','net_sales','transactions'],filters:[{field:'date',operator:'this_week'}],groupBy:['date'],sort:[{field:'date',direction:'desc'}],summaries:[]})
    const objectId=metadata.platformObjects?.[0]?.id||''
    patch({dataSource,objectId,fields:[],filters:[],groupBy:[],sort:[],summaries:[]})
  }
  const toggleField=key=>patch({fields:definition.fields.includes(key)?definition.fields.filter(x=>x!==key):[...definition.fields,key]})
  const moveField=(key,dir)=>{
    const next=[...definition.fields],index=next.indexOf(key),target=index+dir
    if(index<0||target<0||target>=next.length)return
    ;[next[index],next[target]]=[next[target],next[index]]
    patch({fields:next})
  }
  const setFilter=(index,next)=>patch({filters:(definition.filters||[]).map((f,i)=>i===index?{...f,...next}:f)})
  const removeFilter=index=>patch({filters:(definition.filters||[]).filter((_,i)=>i!==index)})

  const open=report=>{
    setEditingId(report.id)
    setDefinition({...fresh(),...(report.definition||{}),name:report.name,description:report.description||'',userIds:report.user_ids||[]})
    setResults(null);setNotice('');setError('')
  }
  const run=async(report)=>{
    try{setBusy(`run-${report.id}`);setError('');const r=await runCustomReport(report.id);if(!r?.success)throw new Error(r?.message);setResults(r.data||null);open(report);setResults(r.data||null)}
    catch(err){setError(err?.message||'Unable to run report')}
    finally{setBusy('')}
  }
  const duplicate=async report=>{
    try{setBusy(`copy-${report.id}`);const r=await duplicateCustomReport(report.id);if(!r?.success)throw new Error(r?.message);setNotice('Report duplicated.');await load()}
    catch(err){setError(err?.message||'Unable to duplicate report')}finally{setBusy('')}
  }
  const archive=async report=>{
    if(!window.confirm(`Archive "${report.name}"?`))return
    try{setBusy(`archive-${report.id}`);const r=await archiveCustomReport(report.id);if(!r?.success)throw new Error(r?.message);if(editingId===report.id)reset();await load()}
    catch(err){setError(err?.message||'Unable to archive report')}finally{setBusy('')}
  }
  const preview=async()=>{
    try{setBusy('preview');setError('');const r=await previewCustomReport(definition);if(!r?.success)throw new Error(r?.message);setResults(r.data||null);setNotice('Preview generated from current data.')}
    catch(err){setError(err?.message||'Unable to preview report')}finally{setBusy('')}
  }
  const save=async(runAfter=false)=>{
    if(!definition.name.trim())return setError('Report name is required.')
    if(!definition.fields.length)return setError('Select at least one field.')
    try{
      setBusy('save');setError('');setNotice('')
      const r=editingId?await updateCustomReport(editingId,definition):await createCustomReport(definition)
      if(!r?.success)throw new Error(r?.message)
      const saved=r.data||{},id=saved.id||editingId
      if(id&&metadata.canManage){
        const map=await updateCustomReportUsers(id,definition.userIds||[])
        if(!map?.success)throw new Error(map?.message||'Unable to save report assignments')
      }
      setEditingId(id||null)
      if(saved.definition)setDefinition({...saved.definition,name:saved.name,description:saved.description||'',userIds:definition.userIds||[]})
      setNotice('Report saved.');await load()
      if(runAfter&&id){
        const rr=await runCustomReport(id,saved.definition||definition)
        if(!rr?.success)throw new Error(rr?.message)
        setResults(rr.data||null)
      }
    }catch(err){setError(err?.message||'Unable to save report')}
    finally{setBusy('')}
  }

  const resultColumns=(results?.columns||definition.fields).map(c=>typeof c==='string'?{key:c,label:fieldLabel(fields,c)}:c)
  const resultRows=results?.rows||[]

  return <section className="module-page custom-reports-page">
    <header className="module-page-header">
      <div><span>Reporting</span><h1>Custom Reports</h1><p>Saved report definitions run against current server data.</p></div>
      <div className="module-header-actions">{onBack?<button onClick={onBack}>Back to Reports</button>:null}<button className="module-primary-button" onClick={reset}><Plus size={14}/> New Report</button></div>
    </header>
    {notice?<div className="module-success module-page-message"><strong>{notice}</strong></div>:null}
    {error?<div className="module-inline-error module-page-message">{error}</div>:null}

    <section className="module-page-card custom-report-list">
      <header className="report-card-head"><div><strong>Available Reports</strong><span>{reports.length} saved</span></div></header>
      {loading?<div className="module-state">Loading custom reports…</div>:!reports.length?<div className="module-state">No saved reports.</div>:reports.map(report=><article key={report.id}>
        <div><strong>{report.name}</strong><span>{report.description||'Report'}{report.created_by_name?` · Created by ${report.created_by_name}`:''}</span></div>
        <div><button disabled={busy===`run-${report.id}`} onClick={()=>run(report)}><Play size={12}/> Run</button><button onClick={()=>open(report)}>Edit</button><button disabled={busy===`copy-${report.id}`} onClick={()=>duplicate(report)}><Copy size={12}/> Duplicate</button><button disabled={busy===`archive-${report.id}`} onClick={()=>archive(report)}><Trash2 size={12}/> Archive</button></div>
      </article>)}
    </section>

    <section className="module-page-card custom-report-builder">
      <header className="report-card-head"><div><strong>{editingId?'Edit Report':'Create Report'}</strong><span>Complex builder stays full-page.</span></div></header>
      <div className="custom-report-body">
        <div className="custom-report-grid">
          <label className="module-input-label"><span>Report name</span><input value={definition.name} onChange={e=>patch({name:e.target.value})}/></label>
          <label className="module-input-label"><span>Description</span><input value={definition.description} onChange={e=>patch({description:e.target.value})}/></label>
          <label className="module-input-label"><span>Data source</span><select value={definition.dataSource} onChange={e=>changeSource(e.target.value)}><option value="sales">Sales</option>{metadata.platformObjects.length?<option value="platform_object">Platform Object</option>:null}</select></label>
          {definition.dataSource==='platform_object'?<label className="module-input-label"><span>Object</span><select value={definition.objectId||''} onChange={e=>patch({objectId:e.target.value,fields:[],filters:[],groupBy:[],sort:[],summaries:[]})}><option value="">Select object</option>{metadata.platformObjects.map(o=><option key={o.id} value={o.id}>{o.label||o.object_key}</option>)}</select></label>:null}
        </div>

        <div className="custom-report-section"><h3>Fields</h3><div className="custom-report-field-pool">{fields.map(field=><label key={field.key}><input type="checkbox" checked={definition.fields.includes(field.key)} onChange={()=>toggleField(field.key)}/><span>{field.label}</span></label>)}</div></div>

        {selected.length?<div className="custom-report-section"><h3>Selected column order</h3><div className="custom-report-order">{definition.fields.map((key,index)=><div key={key}><span>{fieldLabel(fields,key)}</span><button disabled={index===0} onClick={()=>moveField(key,-1)}><ArrowUp size={12}/></button><button disabled={index===definition.fields.length-1} onClick={()=>moveField(key,1)}><ArrowDown size={12}/></button></div>)}</div></div>:null}

        {definition.dataSource==='sales'?<div className="custom-report-grid">
          <label className="module-input-label"><span>Date filter</span><select value={definition.filters?.[0]?.operator||'this_week'} onChange={e=>setFilter(0,{field:'date',operator:e.target.value})}>{(metadata.filters.length?metadata.filters:[{key:'this_week',label:'This week'}]).map(o=><option key={o.key} value={o.key}>{o.label}</option>)}</select></label>
          {definition.filters?.[0]?.operator==='custom'?<><label className="module-input-label"><span>From</span><input type="date" value={definition.filters[0].from||''} onChange={e=>setFilter(0,{from:e.target.value})}/></label><label className="module-input-label"><span>To</span><input type="date" value={definition.filters[0].to||''} onChange={e=>setFilter(0,{to:e.target.value})}/></label></>:null}
        </div>:<PlatformFilters definition={definition} fields={fields} patch={patch} setFilter={setFilter} removeFilter={removeFilter}/>}

        <div className="custom-report-grid">
          <label className="module-input-label"><span>Group by</span><select value={definition.groupBy?.[0]||''} onChange={e=>patch({groupBy:e.target.value?[e.target.value]:[]})}><option value="">No grouping</option>{selected.filter(f=>f.groupable!==false).map(f=><option key={f.key} value={f.key}>{f.label}</option>)}</select></label>
          <label className="module-input-label"><span>Sort field</span><select value={definition.sort?.[0]?.field||''} onChange={e=>patch({sort:e.target.value?[{field:e.target.value,direction:definition.sort?.[0]?.direction||'desc'}]:[]})}><option value="">Default</option>{selected.map(f=><option key={f.key} value={f.key}>{f.label}</option>)}</select></label>
          <label className="module-input-label"><span>Direction</span><select value={definition.sort?.[0]?.direction||'desc'} onChange={e=>patch({sort:[{field:definition.sort?.[0]?.field||definition.fields[0]||'',direction:e.target.value}]})}><option value="desc">Descending</option><option value="asc">Ascending</option></select></label>
        </div>

        {definition.dataSource==='platform_object'?<Summaries definition={definition} selected={selected} patch={patch}/>:null}
        {metadata.canManage&&editingId&&metadata.users.length?<label className="module-input-label custom-report-users"><span>Assign to users</span><select multiple value={definition.userIds||[]} onChange={e=>patch({userIds:Array.from(e.target.selectedOptions,o=>o.value)})}>{metadata.users.map(u=><option key={u.id} value={u.id}>{u.full_name||u.username}</option>)}</select></label>:null}

        <div className="custom-report-actions"><button disabled={busy} onClick={()=>save(false)} className="module-primary-button"><Save size={13}/> Save</button><button disabled={busy} onClick={()=>save(true)}>Save & Run</button>{definition.dataSource==='platform_object'?<button disabled={busy==='preview'} onClick={preview}>Preview</button>:null}</div>
      </div>
    </section>

    {results?<section className="module-page-card custom-report-results"><header className="report-card-head"><div><strong>{definition.name||'Results'}</strong><span>{resultRows.length} rows</span></div></header><div className="module-table-wrap no-border"><table><thead><tr>{resultColumns.map(c=><th key={c.key}>{c.label}</th>)}</tr></thead><tbody>{resultRows.map((row,i)=><tr key={i}>{resultColumns.map(c=><td key={c.key}>{row[c.key]??'—'}</td>)}</tr>)}</tbody></table></div></section>:null}
  </section>
}

function PlatformFilters({definition,fields,patch,setFilter,removeFilter}){
  const operatorsFor=field=>{
    const type=String(field?.type||field?.field_type||'text').toLowerCase()
    if(['number','decimal','currency'].includes(type))return [['equals','Equals'],['not_equals','Not equals'],['gt','Greater than'],['gte','Greater/equal'],['lt','Less than'],['lte','Less/equal'],['between','Between']]
    if(['date','datetime'].includes(type))return [['equals','Equals'],['gt','After'],['lt','Before'],['between','Between']]
    if(type==='boolean')return [['equals','True/false']]
    return [['equals','Equals'],['not_equals','Not equals'],['contains','Contains'],['starts_with','Starts with'],['is_blank','Blank'],['is_not_blank','Not blank'],['in','In']]
  }
  return <div className="custom-report-section"><div className="custom-report-section-head"><h3>Filters</h3><select value={definition.filterLogic||'all'} onChange={e=>patch({filterLogic:e.target.value})}><option value="all">Match all</option><option value="any">Match any</option></select></div>
    <div className="custom-report-filter-list">{(definition.filters||[]).map((filter,index)=>{
      const field=fields.find(f=>f.key===filter.field),ops=operatorsFor(field),blank=['is_blank','is_not_blank'].includes(filter.operator)
      return <div key={index}><select value={filter.field||''} onChange={e=>setFilter(index,{field:e.target.value,operator:'equals',value:''})}><option value="">Field</option>{fields.map(f=><option key={f.key} value={f.key}>{f.label}</option>)}</select><select value={filter.operator||'equals'} onChange={e=>setFilter(index,{operator:e.target.value})}>{ops.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>{!blank?<input value={filter.value??''} onChange={e=>setFilter(index,{value:e.target.value})} placeholder={filter.operator==='between'?'from,to':'Value'}/>:null}<button onClick={()=>removeFilter(index)}><Trash2 size={12}/></button></div>
    })}</div><button onClick={()=>patch({filters:[...(definition.filters||[]),{field:fields[0]?.key||'',operator:'equals',value:''}]})}><Plus size={12}/> Add filter</button>
  </div>
}

function Summaries({definition,selected,patch}){
  const update=(i,next)=>patch({summaries:(definition.summaries||[]).map((s,index)=>index===i?{...s,...next}:s)})
  return <div className="custom-report-section"><h3>Summaries</h3><div className="custom-report-summary-list">{(definition.summaries||[]).map((s,i)=><div key={i}><select value={s.aggregate} onChange={e=>update(i,{aggregate:e.target.value})}>{['COUNT','SUM','AVG','MIN','MAX'].map(a=><option key={a}>{a}</option>)}</select><select value={s.field} onChange={e=>update(i,{field:e.target.value})}>{selected.map(f=><option key={f.key} value={f.key}>{f.label}</option>)}</select><button onClick={()=>patch({summaries:definition.summaries.filter((_,x)=>x!==i)})}><Trash2 size={12}/></button></div>)}</div><div className="custom-report-summary-buttons">{['COUNT','SUM','AVG','MIN','MAX'].map(a=><button key={a} disabled={!selected.length} onClick={()=>patch({summaries:[...(definition.summaries||[]),{aggregate:a,field:selected[0]?.key||''}]})}>{a}</button>)}</div></div>
}
