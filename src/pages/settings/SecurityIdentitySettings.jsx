import { useEffect, useMemo, useState } from 'react'
import { apiRequest } from '../../services/api'

const DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']
const title = (value) => value.charAt(0).toUpperCase() + value.slice(1)

const emptyPolicy = () => ({
  name: 'New Access Policy', description: '', scopeType: 'ROLE', scopeId: '', priority: 100,
  timezone: 'Europe/London', enforceLoginIp: false, active: true, loginHours: {},
})

function Toggle({ checked, onChange, disabled=false, label }) {
  return <button type="button" className={`mac-switch ${checked ? 'is-on' : ''}`} aria-pressed={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}><span /></button>
}

function NumberSetting({ label, help, value, min=0, max=10000, onChange }) {
  return <div className="settings-row"><div><strong>{label}</strong><p>{help}</p></div><input type="number" min={min} max={max} value={value} onChange={(e)=>onChange(Number(e.target.value))} /></div>
}

export default function SecurityIdentitySettings() {
  const [tab,setTab]=useState('password')
  const [data,setData]=useState(null)
  const [principals,setPrincipals]=useState({roles:[],users:[]})
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [saving,setSaving]=useState(false)
  const [settingsDraft,setSettingsDraft]=useState({})
  const [policyId,setPolicyId]=useState('')
  const [policyDraft,setPolicyDraft]=useState(emptyPolicy())
  const [policyRanges,setPolicyRanges]=useState([])
  const [rangeDraft,setRangeDraft]=useState({label:'',startIp:'',endIp:''})
  const [trustedDraft,setTrustedDraft]=useState({label:'',startIp:'',endIp:''})
  const [loginHistory,setLoginHistory]=useState([])
  const [sessions,setSessions]=useState([])

  const load=async()=>{
    setLoading(true); setError('')
    try{
      const [security,principalRes]=await Promise.all([
        apiRequest('/api/security/settings'),
        apiRequest('/api/security/principals'),
      ])
      setData(security.data)
      setSettingsDraft(security.data?.settings||{})
      setPrincipals(principalRes.data||{roles:[],users:[]})
      const first=security.data?.policies?.[0]
      if(first && !policyId){ setPolicyId(first.id); setPolicyDraft(fromPolicy(first)) }
    }catch(e){setError(e.message||'Unable to load security settings')}
    finally{setLoading(false)}
  }

  useEffect(()=>{void load()},[])

  const selectedPolicy=useMemo(()=>data?.policies?.find((p)=>p.id===policyId)||null,[data,policyId])

  useEffect(()=>{
    if(!selectedPolicy) return
    setPolicyDraft(fromPolicy(selectedPolicy))
    apiRequest(`/api/security/policies/${selectedPolicy.id}/ip-ranges`)
      .then((r)=>setPolicyRanges(r.data||[])).catch((e)=>setError(e.message))
  },[selectedPolicy?.id])

  useEffect(()=>{
    if(tab==='history') apiRequest('/api/security/login-history?limit=250').then(r=>setLoginHistory(r.data||[])).catch(e=>setError(e.message))
    if(tab==='sessions') apiRequest('/api/security/sessions').then(r=>setSessions(r.data||[])).catch(e=>setError(e.message))
  },[tab])

  const saveSettings=async()=>{
    setSaving(true); setError('')
    try{
      await apiRequest('/api/security/settings',{method:'PUT',body:JSON.stringify({
        passwordExpiryDays:settingsDraft.password_expiry_days,
        passwordHistoryCount:settingsDraft.password_history_count,
        minimumPasswordLength:settingsDraft.minimum_password_length,
        passwordComplexity:settingsDraft.password_complexity,
        maximumInvalidLoginAttempts:settingsDraft.maximum_invalid_login_attempts,
        lockoutMinutes:settingsDraft.lockout_minutes,
        minimumPasswordLifetimeHours:settingsDraft.minimum_password_lifetime_hours,
        sessionInactivityMinutes:settingsDraft.session_inactivity_minutes,
        maximumSessionHours:settingsDraft.maximum_session_hours,
        enforceLoginIpEveryRequest:settingsDraft.enforce_login_ip_every_request,
        lockSessionToIp:settingsDraft.lock_session_to_ip,
        terminateSessionsOnPasswordReset:settingsDraft.terminate_sessions_on_password_reset,
      })})
      await load()
    }catch(e){setError(e.message)}finally{setSaving(false)}
  }

  const savePolicy=async()=>{
    setSaving(true); setError('')
    try{
      const payload={...policyDraft}
      const result=await apiRequest(policyId? `/api/security/policies/${policyId}`:'/api/security/policies',{method:policyId?'PUT':'POST',body:JSON.stringify(payload)})
      await load()
      if(result?.data?.id)setPolicyId(result.data.id)
    }catch(e){setError(e.message)}finally{setSaving(false)}
  }

  const addPolicyRange=async()=>{
    if(!policyId)return
    try{
      await apiRequest(`/api/security/policies/${policyId}/ip-ranges`,{method:'POST',body:JSON.stringify(rangeDraft)})
      setRangeDraft({label:'',startIp:'',endIp:''})
      const r=await apiRequest(`/api/security/policies/${policyId}/ip-ranges`); setPolicyRanges(r.data||[])
      await load()
    }catch(e){setError(e.message)}
  }

  const addTrusted=async()=>{
    try{
      await apiRequest('/api/security/trusted-ranges',{method:'POST',body:JSON.stringify(trustedDraft)})
      setTrustedDraft({label:'',startIp:'',endIp:''}); await load()
    }catch(e){setError(e.message)}
  }

  const removeRange=async(id)=>{
    try{await apiRequest(`/api/security/ip-ranges/${id}`,{method:'DELETE'}); await load(); if(policyId){const r=await apiRequest(`/api/security/policies/${policyId}/ip-ranges`);setPolicyRanges(r.data||[])}}catch(e){setError(e.message)}
  }

  if(loading&&!data)return <div className="settings-card settings-state-card">Loading Security & Identity…</div>

  const tabs=[['password','Password Policies'],['session','Session Settings'],['access','Login Access Policies'],['network','Network Access'],['history','Login History'],['sessions','Active Sessions']]

  return <div className="space-y-4 min-w-0">
    {error?<div className="settings-error">{error}</div>:null}
    <div className="flex flex-wrap gap-2 border-b" role="tablist" aria-label="Security and Identity">
      {tabs.map(([key,label])=><button key={key} type="button" role="tab" aria-selected={tab===key} onClick={()=>setTab(key)} className={`px-3 py-2 text-sm ${tab===key?'border-b-2 border-blue-600 text-blue-700':'text-slate-500'}`}>{label}</button>)}
    </div>

    {tab==='password'?<div className="settings-card">
      <NumberSetting label="Expire passwords after" help="0 means passwords never expire. Users with expired passwords are forced into the password-change flow." value={settingsDraft.password_expiry_days??90} min={0} max={3650} onChange={(v)=>setSettingsDraft(d=>({...d,password_expiry_days:v}))}/>
      <NumberSetting label="Enforce password history" help="Number of previous passwords that cannot be reused." value={settingsDraft.password_history_count??5} min={0} max={24} onChange={(v)=>setSettingsDraft(d=>({...d,password_history_count:v}))}/>
      <NumberSetting label="Minimum password length" help="Applied to registration, password reset and password changes." value={settingsDraft.minimum_password_length??12} min={8} max={128} onChange={(v)=>setSettingsDraft(d=>({...d,minimum_password_length:v}))}/>
      <div className="settings-row"><div><strong>Password complexity</strong><p>Salesforce-style complexity choices.</p></div><select value={settingsDraft.password_complexity||'THREE_OF_FOUR'} onChange={e=>setSettingsDraft(d=>({...d,password_complexity:e.target.value}))}><option value="NONE">No complexity requirement</option><option value="LETTER_NUMBER">Letters and numbers</option><option value="THREE_OF_FOUR">3 of lowercase / uppercase / number / special</option><option value="ALL_FOUR">All 4 character groups</option></select></div>
      <NumberSetting label="Maximum invalid login attempts" help="0 disables automatic lockout." value={settingsDraft.maximum_invalid_login_attempts??3} min={0} max={100} onChange={(v)=>setSettingsDraft(d=>({...d,maximum_invalid_login_attempts:v}))}/>
      <NumberSetting label="Lockout effective period (minutes)" help="How long a user remains locked after reaching the invalid-attempt limit." value={settingsDraft.lockout_minutes??15} min={0} max={10080} onChange={(v)=>setSettingsDraft(d=>({...d,lockout_minutes:v}))}/>
      <NumberSetting label="Minimum password lifetime (hours)" help="Prevents cycling passwords rapidly to defeat password history." value={settingsDraft.minimum_password_lifetime_hours??24} min={0} max={720} onChange={(v)=>setSettingsDraft(d=>({...d,minimum_password_lifetime_hours:v}))}/>
      <div className="metadata-settings-form-actions"><button className="is-primary" disabled={saving} onClick={saveSettings}>{saving?'Saving…':'Save password policy'}</button></div>
    </div>:null}

    {tab==='session'?<div className="settings-card">
      <NumberSetting label="Session inactivity timeout (minutes)" help="No API action is permitted after this idle period; the tracked session is revoked." value={settingsDraft.session_inactivity_minutes??120} min={0} max={10080} onChange={(v)=>setSettingsDraft(d=>({...d,session_inactivity_minutes:v}))}/>
      <NumberSetting label="Maximum session duration (hours)" help="Hard server-side maximum lifetime for newly issued sessions." value={settingsDraft.maximum_session_hours??12} min={1} max={720} onChange={(v)=>setSettingsDraft(d=>({...d,maximum_session_hours:v}))}/>
      <div className="settings-row"><div><strong>Enforce login IP ranges on every request</strong><p>Rechecks the assigned policy allowlist after login, including API requests.</p></div><Toggle label="Enforce login IP ranges on every request" checked={settingsDraft.enforce_login_ip_every_request===true} onChange={(v)=>setSettingsDraft(d=>({...d,enforce_login_ip_every_request:v}))}/></div>
      <div className="settings-row"><div><strong>Lock sessions to originating IP</strong><p>If the source IP changes, revoke the tracked session.</p></div><Toggle label="Lock session to IP" checked={settingsDraft.lock_session_to_ip===true} onChange={(v)=>setSettingsDraft(d=>({...d,lock_session_to_ip:v}))}/></div>
      <div className="settings-row"><div><strong>Terminate sessions after password reset</strong><p>Revokes all active sessions when a password reset succeeds.</p></div><Toggle label="Terminate sessions on password reset" checked={settingsDraft.terminate_sessions_on_password_reset!==false} onChange={(v)=>setSettingsDraft(d=>({...d,terminate_sessions_on_password_reset:v}))}/></div>
      <div className="metadata-settings-form-actions"><button className="is-primary" disabled={saving} onClick={saveSettings}>{saving?'Saving…':'Save session settings'}</button></div>
    </div>:null}

    {tab==='access'?<div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
      <section className="settings-card">
        <div className="flex items-center gap-2"><strong>Access Policies</strong><button type="button" className="ml-auto" onClick={()=>{setPolicyId('');setPolicyDraft(emptyPolicy());setPolicyRanges([])}}>New</button></div>
        {(data?.policies||[]).map(p=><button type="button" key={p.id} className={`w-full text-left border-t py-2 ${policyId===p.id?'font-semibold':''}`} onClick={()=>setPolicyId(p.id)}><span>{p.name}</span><small className="block text-slate-500">{p.scope_type} · {p.scope_name||'Company'} · {p.login_ip_range_count} IP ranges</small></button>)}
      </section>
      <div className="space-y-4">
        <section className="settings-card">
          <div className="settings-row"><strong>Name</strong><input value={policyDraft.name||''} onChange={e=>setPolicyDraft(d=>({...d,name:e.target.value}))}/></div>
          <div className="settings-row"><strong>Description</strong><input value={policyDraft.description||''} onChange={e=>setPolicyDraft(d=>({...d,description:e.target.value}))}/></div>
          {!policyId?<><div className="settings-row"><strong>Scope</strong><select value={policyDraft.scopeType} onChange={e=>setPolicyDraft(d=>({...d,scopeType:e.target.value,scopeId:''}))}><option value="COMPANY">Company default</option><option value="ROLE">Role</option><option value="USER">User</option></select></div>
          {policyDraft.scopeType!=='COMPANY'?<div className="settings-row"><strong>{policyDraft.scopeType==='ROLE'?'Role':'User'}</strong><select value={policyDraft.scopeId||''} onChange={e=>setPolicyDraft(d=>({...d,scopeId:e.target.value}))}><option value="">Select…</option>{(policyDraft.scopeType==='ROLE'?principals.roles:principals.users).map(x=><option key={x.id} value={x.id}>{x.name||x.full_name||x.username}</option>)}</select></div>:null}</>:null}
          <div className="settings-row"><div><strong>Policy timezone</strong><p>Login hours stay anchored to this timezone even if company timezone later changes.</p></div><input value={policyDraft.timezone||''} onChange={e=>setPolicyDraft(d=>({...d,timezone:e.target.value}))}/></div>
          <div className="settings-row"><div><strong>Restrict login IP addresses</strong><p>When enabled, login is denied unless the source IP is inside an allowed range below.</p></div><Toggle label="Restrict login IP" checked={policyDraft.enforceLoginIp===true} onChange={v=>setPolicyDraft(d=>({...d,enforceLoginIp:v}))}/></div>
          <div className="settings-row"><strong>Active</strong><Toggle label="Policy active" checked={policyDraft.active!==false} onChange={v=>setPolicyDraft(d=>({...d,active:v}))}/></div>
          <div className="metadata-settings-form-actions"><button className="is-primary" disabled={saving} onClick={savePolicy}>{policyId?'Save policy':'Create policy'}</button></div>
        </section>
        <section className="settings-card">
          <h3 className="font-semibold">Login Hours</h3>
          <p className="text-sm text-slate-500">00:00–00:00 blocks the day. An empty day means unrestricted.</p>
          {DAYS.map(day=>{const rule=policyDraft.loginHours?.[day]; const enabled=rule?rule.enabled!==false:false; return <div className="settings-row" key={day}><strong>{title(day)}</strong><div className="flex items-center gap-2"><Toggle label={`${day} restricted`} checked={enabled} onChange={(v)=>setPolicyDraft(d=>({...d,loginHours:{...(d.loginHours||{}),[day]:v?{enabled:true,start:'09:00',end:'17:00'}:undefined}}))}/>{enabled?<><input type="time" value={rule?.start||'09:00'} onChange={e=>setDay(setPolicyDraft,day,'start',e.target.value)}/><span>to</span><input type="time" value={rule?.end||'17:00'} onChange={e=>setDay(setPolicyDraft,day,'end',e.target.value)}/></>:<span className="text-sm text-slate-500">Unrestricted</span>}</div></div>})}
        </section>
        {policyId?<section className="settings-card"><h3 className="font-semibold">Allowed Login IP Ranges</h3>
          {policyRanges.map(r=><div className="settings-row" key={r.id}><div><strong>{r.label||'Allowed range'}</strong><p>{r.start_ip} — {r.end_ip}</p></div><button type="button" onClick={()=>removeRange(r.id)}>Delete</button></div>)}
          <div className="grid gap-2 md:grid-cols-4"><input placeholder="Label" value={rangeDraft.label} onChange={e=>setRangeDraft(d=>({...d,label:e.target.value}))}/><input placeholder="Start IP" value={rangeDraft.startIp} onChange={e=>setRangeDraft(d=>({...d,startIp:e.target.value}))}/><input placeholder="End IP (optional)" value={rangeDraft.endIp} onChange={e=>setRangeDraft(d=>({...d,endIp:e.target.value}))}/><button type="button" onClick={addPolicyRange}>Add range</button></div>
        </section>:null}
      </div>
    </div>:null}

    {tab==='network'?<div className="settings-card"><h3 className="font-semibold">Trusted IP Ranges</h3><p className="text-sm text-slate-500">These ranges identify trusted networks. They do not hard-block external login; Phase 2 identity verification uses them to decide when an extra challenge can be skipped.</p>
      {(data?.trustedRanges||[]).map(r=><div className="settings-row" key={r.id}><div><strong>{r.label||'Trusted range'}</strong><p>{r.start_ip} — {r.end_ip}</p></div><button type="button" onClick={()=>removeRange(r.id)}>Delete</button></div>)}
      <div className="grid gap-2 md:grid-cols-4"><input placeholder="Label" value={trustedDraft.label} onChange={e=>setTrustedDraft(d=>({...d,label:e.target.value}))}/><input placeholder="Start IP" value={trustedDraft.startIp} onChange={e=>setTrustedDraft(d=>({...d,startIp:e.target.value}))}/><input placeholder="End IP (optional)" value={trustedDraft.endIp} onChange={e=>setTrustedDraft(d=>({...d,endIp:e.target.value}))}/><button type="button" onClick={addTrusted}>Add trusted range</button></div>
    </div>:null}

    {tab==='history'?<div className="settings-card overflow-x-auto"><table className="onepos-table w-full text-sm"><thead><tr><th>When</th><th>User</th><th>Status</th><th>Reason</th><th>IP</th><th>Method</th></tr></thead><tbody>{loginHistory.map(r=><tr key={r.id}><td>{new Date(r.occurred_at).toLocaleString()}</td><td>{r.full_name||r.username||r.login_identifier||'Unknown'}</td><td>{r.status}</td><td>{r.reason||'—'}</td><td>{r.ip_address||'—'}</td><td>{r.auth_method}</td></tr>)}</tbody></table></div>:null}

    {tab==='sessions'?<div className="settings-card overflow-x-auto"><table className="onepos-table w-full text-sm"><thead><tr><th>User</th><th>Issued</th><th>Last activity</th><th>IP</th><th>Method</th><th>Status</th><th></th></tr></thead><tbody>{sessions.map(r=><tr key={r.id}><td>{r.full_name||r.username}</td><td>{new Date(r.issued_at).toLocaleString()}</td><td>{new Date(r.last_seen_at).toLocaleString()}</td><td>{r.ip_address||'—'}</td><td>{r.auth_method}</td><td>{r.revoked_at?`Revoked · ${r.revoke_reason||''}`:(new Date(r.expires_at)<new Date()?'Expired':'Active')}</td><td>{!r.revoked_at&&new Date(r.expires_at)>new Date()?<button type="button" onClick={async()=>{await apiRequest(`/api/security/sessions/${r.id}/revoke`,{method:'POST'});const x=await apiRequest('/api/security/sessions');setSessions(x.data||[])}}>Revoke</button>:null}</td></tr>)}</tbody></table></div>:null}
  </div>
}

function fromPolicy(p){
  return {
    name:p.name||'',description:p.description||'',scopeType:p.scope_type||'COMPANY',scopeId:p.scope_id||'',
    priority:p.priority??100,timezone:p.timezone||'Europe/London',enforceLoginIp:p.enforce_login_ip===true,
    active:p.active!==false,loginHours:p.login_hours||{},
  }
}

function setDay(setter,day,key,value){
  setter(d=>({...d,loginHours:{...(d.loginHours||{}),[day]:{...(d.loginHours?.[day]||{enabled:true,start:'09:00',end:'17:00'}),enabled:true,[key]:value}}}))
}
