import { useEffect, useMemo, useState } from 'react'
import { BadgeCheck, Building2, ChevronRight, CreditCard, HardDrive, Mail, MessageSquare, Rocket, Search, Settings2, ShieldCheck, ShoppingCart, Smartphone, Store, Users } from 'lucide-react'
import { apiRequest, getStoredSessionPermissions, loadSessionPermissions, getActingCompanyId, setActingCompanyId } from '../../services/api'
import { clearSettingsContextCache, createRole, createUser, loadPermissions, loadRolePermissions, loadRoles, loadUsers, patchCompanySettings, patchSettings, saveRolePermissions, updateRole, updateUser } from '../../services/settings'
import ClientWebShopSettings from '../settings/ClientWebShopSettings'
import MetadataSettingsSection from '../settings/MetadataSettingsSection'
import PaymentTerminalSettings from '../settings/PaymentTerminalSettings'
import HardwareSettings from '../settings/HardwareSettings'
import AiAssistantSettings from '../settings/AiAssistantSettings'
import ConnectionsSettings from '../settings/ConnectionsSettings'
import GoogleConnectSettings from '../settings/GoogleConnectSettings'
import WhatsAppAssistantSettings from '../settings/WhatsAppAssistantSettings'
import LicensingAdmin from '../superadmin/LicensingAdmin'
import AppReleasesAdmin from '../superadmin/AppReleasesAdmin'

const ITEMS=[
  ['company','Company & Regional',Building2],
  ['users','Users & Roles',Users],
  ['store-till','Store & Till',Store],
  ['web-shop','Client Web Shop',ShoppingCart],
  ['payment-terminals','Payment Terminals',CreditCard],
  ['hardware','Hardware',HardDrive],
  ['ai','AI Assistant',ShieldCheck],
  ['connections','Connections',Settings2],
  ['google','Google Connect',ShieldCheck],
  ['email','Email Delivery',Mail],
  ['sms','SMS Delivery',Smartphone],
  ['whatsapp','WhatsApp',MessageSquare],
  ['licensing','Licences & Entitlements',BadgeCheck],
  ['releases','App Releases',Rocket],
]

function CoreCompanySettings({companyId}){
  const [data,setData]=useState(null),[draft,setDraft]=useState({}),[error,setError]=useState(''),[message,setMessage]=useState('')
  const load=async()=>{try{setError('');const r=await apiRequest('/api/settings');setData(r?.data||{});setDraft({name:r?.data?.company?.name||'',legalName:r?.data?.company?.legalName||'',email:r?.data?.company?.email||'',phone:r?.data?.company?.phone||'',currency:r?.data?.company?.currency||'GBP',timezone:r?.data?.company?.timezone||'Europe/London',dateFormat:r?.data?.general?.dateFormat||'DD/MM/YYYY',vatEnabled:r?.data?.tax?.vatEnabled!==false,defaultVatRate:String(r?.data?.tax?.defaultVatRate??20)})}catch(e){setError(e?.message||'Unable to load company settings')}}
  useEffect(()=>{void load()},[companyId])
  const save=async()=>{try{setError('');setMessage('');await patchCompanySettings({name:draft.name,legalName:draft.legalName||null,email:draft.email||null,phone:draft.phone||null,currency:draft.currency,timezone:draft.timezone});await patchSettings({dateFormat:draft.dateFormat,vatEnabled:draft.vatEnabled,defaultVatRate:Number(draft.defaultVatRate)});setMessage('Company settings saved.');await load()}catch(e){setError(e?.message||'Unable to save company settings')}}
  if(!data)return <div className="settings-state-card">{error||'Loading company settings…'}</div>
  return <div className="oneengine-form">
    {error?<div className="settings-error">{error}</div>:null}{message?<div className="settings-success">{message}</div>:null}
    <div className="oneengine-form-grid">
      {['name','legalName','email','phone','currency','timezone','dateFormat','defaultVatRate'].map(k=><label key={k}><span>{k.replace(/([A-Z])/g,' $1').replace(/^./,m=>m.toUpperCase())}</span><input value={draft[k]??''} onChange={e=>setDraft({...draft,[k]:e.target.value})}/></label>)}
      <label className="oneengine-check"><input type="checkbox" checked={draft.vatEnabled===true} onChange={e=>setDraft({...draft,vatEnabled:e.target.checked})}/><span>VAT enabled</span></label>
    </div>
    <button type="button" className="onepos-btn onepos-btn-primary" onClick={save}>Save settings</button>
  </div>
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
  const [clients,setClients]=useState([]),[selected,setSelected]=useState(()=>getActingCompanyId()||''),[active,setActive]=useState('company'),[query,setQuery]=useState(''),[loading,setLoading]=useState(true),[error,setError]=useState('')
  const loadClients=async()=>{try{setLoading(true);setError('');const cached=getStoredSessionPermissions();if(cached&&!cached?.permissions?.includes('oneengine.manage'))throw new Error('OneEngine management permission required');const [permissions,r]=await Promise.all([cached?Promise.resolve(cached):loadSessionPermissions(),apiRequest('/api/platform/developer/companies')]);if(!permissions?.permissions?.includes('oneengine.manage'))throw new Error('OneEngine management permission required');const rows=Array.isArray(r?.data)?r.data:[];setClients(rows);const valid=rows.some(x=>String(x.id)===String(selected));if(!valid&&rows[0])await chooseClient(rows[0].id)}catch(e){setError(e?.message||'Unable to load clients')}finally{setLoading(false)}}
  useEffect(()=>{void loadClients()},[])
  const chooseClient=async(id)=>{if(!id)return;try{setError('');await apiRequest('/api/platform/developer/acting-company',{method:'PUT',body:JSON.stringify({actingCompanyId:id})});setActingCompanyId(id);clearSettingsContextCache();setSelected(id)}catch(e){setError(e?.message||'Unable to select client')}}
  const selectedClient=clients.find(x=>String(x.id)===String(selected))
  const visible=useMemo(()=>clients.filter(x=>!query.trim()||String(x.name||'').toLowerCase().includes(query.trim().toLowerCase())),[clients,query])
  const render=()=>{
    const key=`${active}:${selected}`
    if(!selected)return <div className="settings-state-card">Select a client.</div>
    if(active==='company')return <CoreCompanySettings key={key} companyId={selected}/>
    if(active==='users')return <UsersRoles key={key} companyId={selected}/>
    if(active==='store-till')return <MetadataSettingsSection key={key} section="store-till"/>
    if(active==='web-shop')return <ClientWebShopSettings key={key}/>
    if(active==='payment-terminals')return <PaymentTerminalSettings key={key}/>
    if(active==='hardware')return <HardwareSettings key={key}/>
    if(active==='ai')return <AiAssistantSettings key={key}/>
    if(active==='connections')return <ConnectionsSettings key={key}/>
    if(active==='google')return <GoogleConnectSettings key={key}/>
    if(active==='email')return <MetadataSettingsSection key={key} section="email"/>
    if(active==='sms')return <MetadataSettingsSection key={key} section="sms"/>
    if(active==='whatsapp')return <WhatsAppAssistantSettings key={key}/>
    if(active==='licensing')return <div className="superadmin-theme"><LicensingAdmin key={key} companyId={selected} lockCompany/></div>
    if(active==='releases')return <div className="superadmin-theme"><AppReleasesAdmin key={key}/></div>
    return null
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
