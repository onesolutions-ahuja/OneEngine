import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Search, Shield, X } from 'lucide-react'
import { apiRequest } from '../../services/api'

function formatDateTime(value){
  if(!value)return '—'
  try{return new Date(value).toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'})}
  catch{return String(value)}
}
function resultClass(value){
  if(value==='success')return 'is-active'
  if(value==='failure')return 'is-danger'
  if(value==='denied')return 'is-warning'
  return 'is-neutral'
}

export default function AuditLogPage({hospitalityOnly=false}){
  const [rows,setRows]=useState([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [filters,setFilters]=useState({
    action:'',actor:'',entityType:'',entityId:'',application:'',package:'',source:'',
    severity:'',type:'',result:'',from:'',to:'',storeId:'',hospitality:hospitalityOnly?'true':'',
  })
  const [page,setPage]=useState(1)
  const [total,setTotal]=useState(0)
  const [selected,setSelected]=useState(null)
  const pageSize=50

  const load=useCallback(async()=>{
    try{
      setLoading(true);setError('')
      const qs=new URLSearchParams()
      Object.entries(filters).forEach(([key,value])=>{if(value)qs.set(key,value)})
      qs.set('limit',String(pageSize))
      qs.set('offset',String((page-1)*pageSize))
      const r=await apiRequest(`/api/audit-logs?${qs}`)
      if(!r?.success)throw new Error(r?.message||'Failed to load audit log')
      setRows(r.data?.rows||[])
      setTotal(Number(r.data?.total||0))
    }catch(err){
      setRows([])
      setTotal(0)
      setError(err?.status===403?'You do not have permission to view the audit log.':err?.message||'Failed to load audit log')
    }finally{setLoading(false)}
  },[filters,page])

  useEffect(()=>{void load()},[load])

  const change=(key,value)=>{setFilters(f=>({...f,[key]:value}));setPage(1)}
  const reset=()=>{setFilters({action:'',actor:'',entityType:'',entityId:'',application:'',package:'',source:'',severity:'',type:'',result:'',from:'',to:'',storeId:'',hospitality:hospitalityOnly?'true':''});setPage(1)}
  const from=(page-1)*pageSize+1,to=Math.min(page*pageSize,total)

  return <section className="module-page audit-page">
    <header className="module-page-header">
      <div><span>Security & Staff</span><h1>Audit Log</h1><p>{hospitalityOnly?'Hospitality actions for this company and store.':'Staff actions and system events. Sensitive detail is scrubbed by the server.'}</p></div>
      <div className="module-header-actions"><button onClick={load} disabled={loading}><RefreshCw size={14} className={loading?'is-spinning':''}/> Refresh</button></div>
    </header>

    <section className="module-panel audit-filters">
      <label className="module-search"><Search size={13}/><input value={filters.action} onChange={e=>change('action',e.target.value)} placeholder="Action"/></label>
      <label className="module-search"><Search size={13}/><input value={filters.actor} onChange={e=>change('actor',e.target.value)} placeholder="Actor"/></label>
      <label className="module-search"><Search size={13}/><input value={filters.entityType} onChange={e=>change('entityType',e.target.value)} placeholder="Entity type"/></label>
      <input value={filters.entityId} onChange={e=>change('entityId',e.target.value)} placeholder="Record ID"/>
      <input value={filters.application} onChange={e=>change('application',e.target.value)} placeholder="Application"/>
      <input value={filters.package} onChange={e=>change('package',e.target.value)} placeholder="Package"/>
      <input value={filters.source} onChange={e=>change('source',e.target.value)} placeholder="Source"/>
      <input value={filters.type} onChange={e=>change('type',e.target.value)} placeholder="Type"/>
      <input value={filters.severity} onChange={e=>change('severity',e.target.value)} placeholder="Severity"/>
      <input value={filters.storeId} onChange={e=>change('storeId',e.target.value)} placeholder="Store ID"/>
      <select value={filters.result} onChange={e=>change('result',e.target.value)}><option value="">All results</option><option value="success">Success</option><option value="failure">Failure</option><option value="denied">Denied</option></select>
      <input type="date" value={filters.from} onChange={e=>change('from',e.target.value)}/>
      <input type="date" value={filters.to} onChange={e=>change('to',e.target.value)}/>
      <div className="audit-filter-actions"><button onClick={reset}>Reset</button><button className="module-primary-button" onClick={()=>{setPage(1);void load()}}>Apply</button></div>
    </section>

    {error?<div className="module-inline-error module-page-message">{error}</div>:null}

    <section className="module-page-card">
      {loading?<div className="module-state">Loading audit records…</div>:!rows.length?<div className="module-state">No audit records match the current filters.</div>:<div className="module-table-wrap no-border"><table><thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Record</th><th>Application / package</th><th>Result</th><th>Store</th><th></th></tr></thead><tbody>{rows.map(row=><tr key={row.id}>
        <td>{formatDateTime(row.created_at)}</td>
        <td><code>{row.actor_username||(row.user_id?'system user':'system')}</code></td>
        <td><code>{row.action}</code></td>
        <td>{row.entity_type?`${row.entity_type}:${String(row.entity_id||'').slice(0,8)}`:'—'}</td>
        <td>{[row.details?.application||row.details?.app,row.details?.package||row.details?.packageName].filter(Boolean).join(' / ')||'—'}</td>
        <td><span className={`module-status-pill ${resultClass(row.result)}`}>{row.result||'success'}</span></td>
        <td>{row.store_id?String(row.store_id).slice(0,8):'—'}</td>
        <td><button className="audit-view-button" onClick={()=>setSelected(row)}><Shield size={12}/> View</button></td>
      </tr>)}</tbody></table></div>}
      <footer className="audit-pagination"><span>Showing {total?from:0}–{to} of {total}</span><div><button disabled={page===1||loading} onClick={()=>setPage(p=>p-1)}>Previous</button><button disabled={page*pageSize>=total||loading} onClick={()=>setPage(p=>p+1)}>Next</button></div></footer>
    </section>

    {selected?<AuditDetail row={selected} onClose={()=>setSelected(null)}/>:null}
  </section>
}

function AuditDetail({row,onClose}){
  const details=row.details||{}
  return <div className="module-modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
    <section className="module-modal audit-detail-modal">
      <header><div><strong>Audit entry {String(row.id||'').slice(0,8)}</strong><span>{formatDateTime(row.created_at)}</span></div><button onClick={onClose}><X size={16}/></button></header>
      <div className="module-modal-body audit-detail-body">
        <div><span>Action</span><code>{row.action}</code></div>
        <div><span>Actor</span><strong>{row.actor_username||row.user_id||'system'}</strong></div>
        <div><span>Entity</span><strong>{row.entity_type||'—'} / {row.entity_id||'—'}</strong></div>
        <div><span>Result</span><strong>{row.result||'success'}</strong></div>
        <div><span>IP</span><strong>{row.ip_address||'—'}</strong></div>
        <div><span>Application / package</span><strong>{[details.application||details.app,details.package||details.packageName].filter(Boolean).join(' / ')||'—'}</strong></div>
        <div><span>Source</span><strong>{details.source||'—'}</strong></div>
        <div><span>Workflow / correlation / request</span><strong>{details.workflowId||details.workflow_id||details.correlationId||details.correlation_id||details.requestId||details.request_id||'—'}</strong></div>
        {(details.before!==undefined||details.after!==undefined||details.oldValues!==undefined||details.newValues!==undefined)?<div className="audit-detail-full"><span>Change summary</span><pre>{JSON.stringify({before:details.before??details.oldValues,after:details.after??details.newValues},null,2)}</pre></div>:null}
        <div className="audit-detail-full"><span>Details (server scrubbed)</span><pre>{JSON.stringify(details,null,2)}</pre></div>
      </div>
      <footer className="module-modal-footer"><button onClick={onClose}>Close</button></footer>
    </section>
  </div>
}
