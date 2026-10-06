import { useEffect, useMemo, useState } from 'react'
import { BadgeCheck, ChevronRight, Search } from 'lucide-react'
import { apiRequest, getStoredSessionPermissions, loadSessionPermissions, getActingCompanyId, setActingCompanyId } from '../../services/api'
import { clearSettingsContextCache } from '../../services/settings'
import MetadataSettingsPage from '../settings/MetadataSettingsPage'

export default function OneEngineManager(){
  const [clients,setClients]=useState([])
  const [selected,setSelected]=useState(()=>getActingCompanyId()||'')
  const [query,setQuery]=useState('')
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')

  const chooseClient=async(id)=>{
    if(!id)return
    try{
      setError('')
      await apiRequest('/api/platform/developer/acting-company',{method:'PUT',body:JSON.stringify({actingCompanyId:id})})
      setActingCompanyId(id)
      clearSettingsContextCache()
      setSelected(id)
    }catch(e){setError(e?.message||'Unable to select client')}
  }

  const loadClients=async()=>{
    try{
      setLoading(true)
      setError('')
      const cached=getStoredSessionPermissions()
      if(cached&&!cached?.permissions?.includes('oneengine.manage'))throw new Error('OneEngine management permission required')
      const [permissions,r]=await Promise.all([
        cached?Promise.resolve(cached):loadSessionPermissions(),
        apiRequest('/api/platform/developer/companies')
      ])
      if(!permissions?.permissions?.includes('oneengine.manage'))throw new Error('OneEngine management permission required')
      const rows=Array.isArray(r?.data)?r.data:[]
      setClients(rows)
      const current=getActingCompanyId()||selected
      if(!rows.some(x=>String(x.id)===String(current))&&rows[0])await chooseClient(rows[0].id)
    }catch(e){setError(e?.message||'Unable to load clients')}
    finally{setLoading(false)}
  }

  useEffect(()=>{void loadClients()},[])

  const selectedClient=clients.find(x=>String(x.id)===String(selected))
  const visible=useMemo(
    ()=>clients.filter(x=>!query.trim()||String(x.name||'').toLowerCase().includes(query.trim().toLowerCase())),
    [clients,query]
  )

  return <div className="oneengine-manager-shell">
    <aside className="oneengine-client-pane">
      <div className="oneengine-pane-title">Clients</div>
      <label className="settings-search"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search clients"/></label>
      {loading?<div className="settings-state-card">Loading clients…</div>:null}
      <div className="oneengine-client-list">
        {visible.map(c=><button key={c.id} type="button" className={String(c.id)===String(selected)?'is-active':''} onClick={()=>chooseClient(c.id)}>
          <span><strong>{c.name}</strong><small>{String(c.id).slice(0,8)}</small></span><ChevronRight size={14}/>
        </button>)}
      </div>
    </aside>
    <section className="oneengine-manager-main">
      <div className="oneengine-context-banner">
        <span>Editing client</span><strong>{selectedClient?.name||'Select a client'}</strong>{selected?<BadgeCheck size={16}/>:null}
      </div>
      {error?<div className="settings-error">{error}</div>:null}
      <div className="oneengine-manager-content">
        {selected?<MetadataSettingsPage key={selected}/>:<div className="settings-state-card">Select a client.</div>}
      </div>
    </section>
  </div>
}
