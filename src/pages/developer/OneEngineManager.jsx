import { useEffect, useMemo, useState } from 'react'
import { BadgeCheck, ChevronRight, RefreshCw, Search, Settings2, Rocket, KeyRound } from 'lucide-react'
import { apiRequest, getStoredSessionPermissions, loadSessionPermissions, getActingCompanyId, setActingCompanyId } from '../../services/api'
import { clearSettingsContextCache } from '../../services/settings'
import MetadataSettingsPage from '../settings/MetadataSettingsPage'
import LicensingAdmin from '../superadmin/LicensingAdmin'
import AppReleasesAdmin from '../superadmin/AppReleasesAdmin'

const SECTIONS = [
  ['settings','Settings',Settings2],
  ['licensing','Licences & Entitlements',KeyRound],
  ['releases','App Releases',Rocket],
]

export default function OneEngineManager(){
  const [clients,setClients]=useState([])
  const [selected,setSelected]=useState(()=>getActingCompanyId()||'')
  const [active,setActive]=useState('settings')
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
    }catch(e){
      setError(e?.message||'Unable to select client')
    }
  }

  const loadClients=async()=>{
    try{
      setLoading(true)
      setError('')
      const cached=getStoredSessionPermissions()
      if(cached&&!cached?.permissions?.includes('oneengine.manage'))throw new Error('OneEngine management permission required')
      const [permissions,r]=await Promise.all([
        cached?Promise.resolve(cached):loadSessionPermissions(),
        apiRequest('/api/platform/developer/companies'),
      ])
      if(!permissions?.permissions?.includes('oneengine.manage'))throw new Error('OneEngine management permission required')
      const rows=Array.isArray(r?.data)?r.data:[]
      setClients(rows)
      const current=getActingCompanyId()||selected
      if(rows.some(item=>String(item.id)===String(current)))setSelected(current)
      else if(rows[0])await chooseClient(rows[0].id)
    }catch(e){
      setError(e?.message||'Unable to load clients')
    }finally{
      setLoading(false)
    }
  }

  useEffect(()=>{void loadClients()},[])

  const selectedClient=clients.find(item=>String(item.id)===String(selected))
  const visible=useMemo(()=>{
    const needle=query.trim().toLowerCase()
    return clients.filter(item=>!needle||String(item.name||'').toLowerCase().includes(needle))
  },[clients,query])

  const content=()=>{
    if(!selected)return <div className="settings-state-card">Select a client.</div>
    if(active==='licensing')return <div className="superadmin-theme"><LicensingAdmin key={selected} companyId={selected} lockCompany/></div>
    if(active==='releases')return <div className="superadmin-theme"><AppReleasesAdmin key={selected}/></div>
    return <MetadataSettingsPage key={`settings:${selected}`} initialSection=""/>
  }

  return <div className="oneengine-manager-shell">
    <aside className="oneengine-client-pane">
      <div className="oneengine-pane-title">Clients</div>
      <label className="settings-search"><Search size={15}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search clients"/></label>
      {loading?<div className="settings-state-card">Loading clients…</div>:null}
      <div className="oneengine-client-list">{visible.map(client=><button key={client.id} type="button" className={String(client.id)===String(selected)?'is-active':''} onClick={()=>chooseClient(client.id)}><span><strong>{client.name}</strong><small>{String(client.id).slice(0,8)}</small></span><ChevronRight size={14}/></button>)}</div>
    </aside>
    <section className="oneengine-manager-main">
      <div className="oneengine-context-banner"><span>Editing client</span><strong>{selectedClient?.name||'Select a client'}</strong>{selected?<BadgeCheck size={16}/>:null}<button type="button" className="onepos-btn onepos-btn-sm" onClick={()=>void loadClients()}><RefreshCw size={13}/> Refresh</button></div>
      {error?<div className="settings-error">{error}</div>:null}
      <div className="oneengine-manager-layout">
        <nav className="oneengine-subnav">{SECTIONS.map(([key,label,Icon])=><button key={key} type="button" className={active===key?'is-active':''} onClick={()=>setActive(key)}><Icon size={16}/><span>{label}</span><ChevronRight size={13}/></button>)}</nav>
        <div className="oneengine-manager-content">{content()}</div>
      </div>
    </section>
  </div>
}
