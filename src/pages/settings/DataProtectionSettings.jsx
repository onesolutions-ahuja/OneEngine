import { useEffect, useState } from 'react'
import { apiFetch, apiRequest } from '../../services/api'

const TABS=[['export','Data Export'],['retention','Data Retention'],['email','Email Security'],['delegated','Delegated Administration']]

export default function DataProtectionSettings(){
  const [tab,setTab]=useState('export')
  const [exportSettings,setExportSettings]=useState({})
  const [exports,setExports]=useState([])
  const [retention,setRetention]=useState([])
  const [email,setEmail]=useState({deliverability:{},domains:[],addresses:[],roles:[]})
  const [delegated,setDelegated]=useState({groups:[],users:[],roles:[]})
  const [retentionDraft,setRetentionDraft]=useState({name:'',objectKey:'',ageDays:365,action:'DELETE',dateField:'created_at',anonymizeFields:'',enabled:false})
  const [domain,setDomain]=useState('')
  const [address,setAddress]=useState({email:'',displayName:'',purpose:'GENERAL',allowAllUsers:false})
  const [group,setGroup]=useState({name:'',description:'',memberIds:[],scopeRoleIds:[],assignableRoleIds:[],allowLoginAccess:false,active:true})
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')

  const load=async()=>{
    setError('')
    const [s,e,r,m,d]=await Promise.all([
      apiRequest('/api/security/data/export-settings'),
      apiRequest('/api/security/data/exports'),
      apiRequest('/api/security/data/retention'),
      apiRequest('/api/security/email/settings'),
      apiRequest('/api/security/delegated-admin'),
    ])
    setExportSettings(s.data||{});setExports(e.data||[]);setRetention(r.data||[]);setEmail(m.data||{deliverability:{},domains:[],addresses:[],roles:[]});setDelegated(d.data||{groups:[],users:[],roles:[]})
  }
  useEffect(()=>{void load().catch(e=>setError(e.message||'Unable to load data protection settings'))},[])

  const downloadExport=async(id)=>{
    try{
      const response=await apiFetch('/api/security/data/exports/'+encodeURIComponent(id)+'/download')
      if(!response.ok)throw new Error('Unable to download export')
      const blob=await response.blob()
      const url=URL.createObjectURL(blob)
      const a=document.createElement('a')
      a.href=url
      a.download='oneengine-export-'+id+'.json.gz'
      document.body.appendChild(a);a.click();a.remove()
      setTimeout(()=>URL.revokeObjectURL(url),1000)
    }catch(e){setError(e.message||'Unable to download export')}
  }

  const saveExport=async()=>{
    try{
      await apiRequest('/api/security/data/export-settings',{method:'PUT',body:JSON.stringify({
        enabled:exportSettings.enabled===true,frequency:exportSettings.frequency||'MANUAL',
        includeAttachments:exportSettings.include_attachments===true,includeAuditLogs:exportSettings.include_audit_logs!==false,
        nextRunAt:exportSettings.next_run_at||null,
      })})
      setNotice('Data export settings saved.');await load()
    }catch(e){setError(e.message)}
  }

  const toggle=(list,id)=>list.includes(id)?list.filter(x=>x!==id):[...list,id]

  return <div className="space-y-4">
    <div className="settings-card"><div className="flex flex-wrap gap-2">{TABS.map(([key,label])=><button type="button" key={key} className={tab===key?'is-primary':''} onClick={()=>setTab(key)}>{label}</button>)}</div></div>
    {error?<div className="settings-error">{error}</div>:null}
    {notice?<div className="settings-card"><strong>{notice}</strong></div>:null}

    {tab==='export'?<div className="space-y-4">
      <section className="settings-card">
        <h3 className="font-semibold">Data Export</h3>
        <div className="settings-row"><div><strong>Scheduled export</strong><p>Manual by default. Weekly/monthly schedules can be enabled explicitly.</p></div><input type="checkbox" checked={exportSettings.enabled===true} onChange={e=>setExportSettings(s=>({...s,enabled:e.target.checked}))}/></div>
        <div className="settings-row"><strong>Frequency</strong><select value={exportSettings.frequency||'MANUAL'} onChange={e=>setExportSettings(s=>({...s,frequency:e.target.value}))}><option>MANUAL</option><option>WEEKLY</option><option>MONTHLY</option></select></div>
        <div className="settings-row"><strong>Include audit logs</strong><input type="checkbox" checked={exportSettings.include_audit_logs!==false} onChange={e=>setExportSettings(s=>({...s,include_audit_logs:e.target.checked}))}/></div>
        <div className="metadata-settings-form-actions"><button type="button" onClick={saveExport}>Save</button><button type="button" className="is-primary" onClick={async()=>{try{await apiRequest('/api/security/data/exports',{method:'POST',body:'{}'});setNotice('Data export generated.');await load()}catch(e){setError(e.message)}}}>Generate export now</button></div>
      </section>
      <section className="settings-card"><h3 className="font-semibold">Export History</h3>{exports.map(x=><div className="settings-row" key={x.id}><div><strong>{new Date(x.created_at).toLocaleString()}</strong><p>{x.row_count} rows · expires {new Date(x.expires_at).toLocaleString()}</p></div><button type="button" onClick={()=>void downloadExport(x.id)}>Download</button></div>)}</section>
    </div>:null}

    {tab==='retention'?<div className="space-y-4">
      <section className="settings-card"><h3 className="font-semibold">Retention Policies</h3>
        {retention.map(p=><div className="settings-row" key={p.id}><div><strong>{p.name}</strong><p>{p.object_key} · {p.action} after {p.age_days} days · {p.enabled?'Enabled':'Disabled'}</p></div><button type="button" onClick={async()=>{try{const r=await apiRequest('/api/security/data/retention/'+p.id+'/run',{method:'POST',body:'{}'});setNotice('Retention run affected '+(r.data?.affected||0)+' records.');await load()}catch(e){setError(e.message)}}}>Run now</button></div>)}
      </section>
      <section className="settings-card">
        <h3 className="font-semibold">Create / Update Policy</h3>
        <div className="settings-row"><strong>Name</strong><input value={retentionDraft.name} onChange={e=>setRetentionDraft(d=>({...d,name:e.target.value}))}/></div>
        <div className="settings-row"><strong>Object API key</strong><input placeholder="customer" value={retentionDraft.objectKey} onChange={e=>setRetentionDraft(d=>({...d,objectKey:e.target.value}))}/></div>
        <div className="settings-row"><strong>Age in days</strong><input type="number" min="1" value={retentionDraft.ageDays} onChange={e=>setRetentionDraft(d=>({...d,ageDays:Number(e.target.value)}))}/></div>
        <div className="settings-row"><strong>Action</strong><select value={retentionDraft.action} onChange={e=>setRetentionDraft(d=>({...d,action:e.target.value}))}><option>DELETE</option><option>ANONYMIZE</option></select></div>
        <div className="settings-row"><strong>Date field</strong><input value={retentionDraft.dateField} onChange={e=>setRetentionDraft(d=>({...d,dateField:e.target.value}))}/></div>
        {retentionDraft.action==='ANONYMIZE'?<div className="settings-row"><div><strong>Fields to anonymize</strong><p>Comma-separated platform field API names.</p></div><input value={retentionDraft.anonymizeFields} onChange={e=>setRetentionDraft(d=>({...d,anonymizeFields:e.target.value}))}/></div>:null}
        <div className="settings-row"><strong>Enabled</strong><input type="checkbox" checked={retentionDraft.enabled} onChange={e=>setRetentionDraft(d=>({...d,enabled:e.target.checked}))}/></div>
        <button type="button" onClick={async()=>{try{await apiRequest('/api/security/data/retention',{method:'POST',body:JSON.stringify({...retentionDraft,anonymizeFields:retentionDraft.anonymizeFields.split(',').map(x=>x.trim()).filter(Boolean)})});setRetentionDraft({name:'',objectKey:'',ageDays:365,action:'DELETE',dateField:'created_at',anonymizeFields:'',enabled:false});await load()}catch(e){setError(e.message)}}}>Save retention policy</button>
      </section>
    </div>:null}

    {tab==='email'?<div className="space-y-4">
      <section className="settings-card"><h3 className="font-semibold">Email Deliverability</h3>
        <div className="settings-row"><strong>Access level</strong><select value={email.deliverability?.access_level||'ALL_EMAIL'} onChange={e=>setEmail(m=>({...m,deliverability:{...m.deliverability,access_level:e.target.value}}))}><option>NO_EMAIL</option><option>SYSTEM_ONLY</option><option>ALL_EMAIL</option></select></div>
        <div className="settings-row"><strong>Require verified sender</strong><input type="checkbox" checked={email.deliverability?.require_verified_sender!==false} onChange={e=>setEmail(m=>({...m,deliverability:{...m.deliverability,require_verified_sender:e.target.checked}}))}/></div>
        <button type="button" onClick={async()=>{try{await apiRequest('/api/security/email/deliverability',{method:'PUT',body:JSON.stringify({accessLevel:email.deliverability?.access_level||'ALL_EMAIL',requireVerifiedSender:email.deliverability?.require_verified_sender!==false,useSubstituteForUnverified:email.deliverability?.use_substitute_for_unverified===true,noReplyAddressId:email.deliverability?.no_reply_address_id||null})});await load()}catch(e){setError(e.message)}}}>Save deliverability</button>
      </section>
      <section className="settings-card"><h3 className="font-semibold">Sending Domains / DKIM</h3>
        {email.domains.map(d=><div className="settings-row" key={d.id}><div><strong>{d.domain}</strong><p>{d.status}</p></div><button type="button" onClick={async()=>{try{await apiRequest('/api/security/email/domains/'+d.id+'/verify',{method:'POST',body:'{}'});await load()}catch(e){setError(e.message)}}}>Verify DNS</button></div>)}
        <div className="settings-row"><strong>Domain</strong><input placeholder="example.com" value={domain} onChange={e=>setDomain(e.target.value)}/></div>
        <button type="button" onClick={async()=>{try{const r=await apiRequest('/api/security/email/domains',{method:'POST',body:JSON.stringify({domain})});setNotice('Add TXT '+r.data?.verificationHost+' = '+r.data?.verificationValue);setDomain('');await load()}catch(e){setError(e.message)}}}>Add domain</button>
      </section>
      <section className="settings-card"><h3 className="font-semibold">Organization-Wide Email Addresses</h3>
        {email.addresses.map(a=><div className="settings-row" key={a.id}><div><strong>{a.display_name||a.email}</strong><p>{a.email} · {a.purpose} · {a.verified?'Verified':'Unverified'} · {a.allow_all_users?'All users':'Restricted'}</p></div></div>)}
        <div className="settings-row"><strong>Email</strong><input value={address.email} onChange={e=>setAddress(d=>({...d,email:e.target.value}))}/></div>
        <div className="settings-row"><strong>Display name</strong><input value={address.displayName} onChange={e=>setAddress(d=>({...d,displayName:e.target.value}))}/></div>
        <div className="settings-row"><strong>Purpose</strong><select value={address.purpose} onChange={e=>setAddress(d=>({...d,purpose:e.target.value}))}><option>GENERAL</option><option>NO_REPLY</option><option>SUPPORT</option><option>BILLING</option><option>MARKETING</option></select></div>
        <div className="settings-row"><strong>Allow all users</strong><input type="checkbox" checked={address.allowAllUsers} onChange={e=>setAddress(d=>({...d,allowAllUsers:e.target.checked}))}/></div>
        <button type="button" onClick={async()=>{try{await apiRequest('/api/security/email/addresses',{method:'POST',body:JSON.stringify(address)});setAddress({email:'',displayName:'',purpose:'GENERAL',allowAllUsers:false});await load()}catch(e){setError(e.message)}}}>Add sender address</button>
      </section>
    </div>:null}

    {tab==='delegated'?<div className="space-y-4">
      <section className="settings-card"><h3 className="font-semibold">Delegated Administration Groups</h3>{delegated.groups.map(g=><div className="settings-row" key={g.id}><div><strong>{g.name}</strong><p>{g.member_ids?.length||0} admins · {g.scope_role_ids?.length||0} scoped roles · {g.assignable_role_ids?.length||0} assignable roles</p></div></div>)}</section>
      <section className="settings-card"><h3 className="font-semibold">Create / Update Delegated Group</h3>
        <div className="settings-row"><strong>Name</strong><input value={group.name} onChange={e=>setGroup(g=>({...g,name:e.target.value}))}/></div>
        <div className="settings-row"><strong>Description</strong><input value={group.description} onChange={e=>setGroup(g=>({...g,description:e.target.value}))}/></div>
        <div className="settings-row"><div><strong>Delegated admins</strong><p>Users who receive the scoped administration filter.</p></div><div>{delegated.users.map(u=><label key={u.id} className="block"><input type="checkbox" checked={group.memberIds.includes(u.id)} onChange={()=>setGroup(g=>({...g,memberIds:toggle(g.memberIds,u.id)}))}/> {u.full_name||u.username}</label>)}</div></div>
        <div className="settings-row"><div><strong>Managed role tree</strong><p>Users in these roles and subordinate roles are in scope.</p></div><div>{delegated.roles.map(r=><label key={r.id} className="block"><input type="checkbox" checked={group.scopeRoleIds.includes(r.id)} onChange={()=>setGroup(g=>({...g,scopeRoleIds:toggle(g.scopeRoleIds,r.id)}))}/> {r.name}</label>)}</div></div>
        <div className="settings-row"><div><strong>Assignable roles</strong><p>Delegated admins can assign only these roles.</p></div><div>{delegated.roles.map(r=><label key={r.id} className="block"><input type="checkbox" checked={group.assignableRoleIds.includes(r.id)} onChange={()=>setGroup(g=>({...g,assignableRoleIds:toggle(g.assignableRoleIds,r.id)}))}/> {r.name}</label>)}</div></div>
        <button type="button" onClick={async()=>{try{await apiRequest('/api/security/delegated-admin',{method:'POST',body:JSON.stringify(group)});setGroup({name:'',description:'',memberIds:[],scopeRoleIds:[],assignableRoleIds:[],allowLoginAccess:false,active:true});await load()}catch(e){setError(e.message)}}}>Save delegated group</button>
      </section>
    </div>:null}
  </div>
}
