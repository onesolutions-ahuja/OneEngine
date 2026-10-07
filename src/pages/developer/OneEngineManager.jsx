import { useEffect, useMemo, useState } from 'react'
import { BadgeCheck, ChevronRight, Rocket, Search, Settings2, Users } from 'lucide-react'
import { apiRequest, getStoredSessionPermissions, loadSessionPermissions, getActingCompanyId, setActingCompanyId } from '../../services/api'
import { createRole, createUser, loadPermissions, loadRolePermissions, loadRoles, loadUsers, saveRolePermissions, updateRole, updateUser } from '../../services/settings'
import MetadataSettingsPage from '../settings/MetadataSettingsPage'
import LicensingAdmin from '../platform-admin/LicensingAdmin'
import AppReleasesAdmin from '../platform-admin/AppReleasesAdmin'

const ITEMS=[
  ['settings','Settings',Settings2],
  ['users','Users & Roles',Users],
  ['licensing','Licences & Entitlements',BadgeCheck],
  ['releases','App Releases',Rocket],
]

function CoreCompanySettings() {
  return <MetadataSettingsPage />
}

function UsersRoles({companyId}){
  const [users,setUsers]=useState([]),[roles,setRoles]=useState([]),[error,setError]=useState('')
  const load=async()=>{try{setError('');const [u,r]=await Promise.all([loadUsers(),loadRoles()]);setUsers(u);setRoles(r)}catch(e){setError(e?.message||'Unable to load users and roles')}}
  useEffect(()=>{void load()},[companyId])
  return <div>{error?<div className="settings-error">{error}</div>:null}
    <div className="settings-section-header"><div><h3>Users & Roles</h3><p>Tenant users and their RBAC roles for the selected client.</p></div></div>
    <div className="oneengine-user-grid">
      <section className="onepos-card"><h3>Users</h3>{users.map(u=><div className="oneengine-list-row" key={u.id}><span><strong>{u.full_name||u.username}</strong><small>{u.email||u.username}</small></span><span>{u.role_name||'No role'}</span></div>)}</section>
      <section className="onepos-card"><h3>Roles</h3>{roles.map(r=><div className="oneengine-list-row" key={r.id}><span><strong>{r.name}</strong><small>{r.description||'RBAC role'}</small></span><span>{r.user_count||0} users</span></div>)}</section>
    </div>
  </div>
}

export default function OneEngineManager(){
  const [clients,setClients]=useState([]),[selected,setSelected]=useState(()=>getActingCompanyId()||''),[active,setActive]=useState('settings'),[query,setQuery]=useState(''),[loading,setLoading]=useState(true),[error,setError]=useState('')
  const loadClients=async()=>{try{setLoading(true);setError('');const cached=getStoredSessionPermissions();if(cached&&!cached?.permissions?.includes('oneengine.manage'))throw new Error('OneEngine management permission required');const [permissions,r]=await Promise.all([cached?Promise.resolve(cached):loadSessionPermissions(),apiRequest('/api/platform/developer/companies')]);if(!permissions?.permissions?.includes('oneengine.manage'))throw new Error('OneEngine management permission required');const rows=Array.isArray(r?.data)?r.data:[];setClients(rows);const valid=rows.some(x=>String(x.id)===String(selected));if(!valid&&rows[0])await chooseClient(rows[0].id)}catch(e){setError(e?.message||'Unable to load clients')}finally{setLoading(false)}}
  useEffect(()=>{void loadClients()},[])
  const chooseClient=async(id)=>{if(!id)return;try{setError('');await apiRequest('/api/platform/developer/acting-company',{method:'PUT',body:JSON.stringify({actingCompanyId:id})});setActingCompanyId(id);setSelected(id)}catch(e){setError(e?.message||'Unable to select client')}}
  const selectedClient=clients.find(x=>String(x.id)===String(selected))
  const visible=useMemo(()=>clients.filter(x=>!query.trim()||String(x.name||'').toLowerCase().includes(query.trim().toLowerCase())),[clients,query])
  const render=()=>{
    const key=`${active}:${selected}`
    if(!selected)return <div className="settings-state-card">Select a client.</div>
    if(active==='settings')return <CoreCompanySettings key={key} companyId={selected}/>
    if(active==='users')return <UsersRoles key={key} companyId={selected}/>
    if(active==='licensing')return <div className="superadmin-theme"><LicensingAdmin key={key} companyId={selected} lockCompany/></div>
    if(active==='releases')return <div className="superadmin-theme"><AppReleasesAdmin key={key}/></div>
    return <CoreCompanySettings key={key} companyId={selected}/>
  }
  return <div className="oneengine-manager-shell">
    <aside className="oneengine-client-pane">
      <div className="oneengine-pane-title">Clients</div>
      <label className="settings-search"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search clients"/></label>
      {loading?<div className="settings-state-card">Loading clients…</div>:null}
      <div className="oneengine-client-list">{visible.map(c=><button key={c.id} type="button" className={String(c.id)===String(selected)?'is-active':''} onClick={()=>chooseClient(c.id)}><span><strong>{c.name}</strong><small>{String(c.id).slice(0,8)}</small></span><ChevronRight size={14}/></button>)}</div>
    </aside>
    <section className="oneengine-manager-main">
      <div className="oneengine-context-banner"><span>Editing client</span><strong>{selectedClient?.name||'Select a client'}</strong>{selected?<BadgeCheck size={16}/>:null}</div>
      {error?<div className="settings-error">{error}</div>:null}
      <div className="oneengine-manager-layout">
        <nav className="oneengine-subnav">{ITEMS.map(([key,label,Icon])=><button key={key} type="button" className={active===key?'is-active':''} onClick={()=>setActive(key)}><Icon size={16}/><span>{label}</span><ChevronRight size={13}/></button>)}</nav>
        <div className="oneengine-manager-content">{render()}</div>
      </div>
    </section>
  </div>
}
