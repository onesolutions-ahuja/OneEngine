import { useEffect, useMemo, useState } from 'react'
import { apiRequest } from '../../services/api'

const TABS=[['health','Security Health'],['api','API & OAuth'],['apps','Connected Apps'],['origins','Trusted Origins'],['vault','Credential Vault'],['certificates','Certificates & Keys']]
const fmt=(value)=>{if(!value)return '—';const d=new Date(value);return Number.isNaN(d.getTime())?String(value):d.toLocaleString()}

export default function SecurityGovernanceSettings(){
  const [tab,setTab]=useState('health')
  const [health,setHealth]=useState(null)
  const [policy,setPolicy]=useState({})
  const [apps,setApps]=useState([])
  const [origins,setOrigins]=useState([])
  const [vault,setVault]=useState([])
  const [certs,setCerts]=useState([])
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [origin,setOrigin]=useState({origin:'',originType:'CORS',description:''})
  const [vaultDraft,setVaultDraft]=useState({name:'',purpose:'',secret:'',secretKind:'GENERIC',expiresAt:''})
  const [cert,setCert]=useState({name:'',purpose:'',certificatePem:'',privateKeyPem:''})
  const [app,setApp]=useState(null)

  const load=async()=>{
    setError('')
    const [h,p,a,o,v,c]=await Promise.all([
      apiRequest('/api/security/governance/health').catch(()=>({data:null})),
      apiRequest('/api/security/governance/api-policy'),
      apiRequest('/api/security/governance/connected-apps'),
      apiRequest('/api/security/governance/trusted-origins'),
      apiRequest('/api/security/governance/vault').catch(()=>({data:[]})),
      apiRequest('/api/security/governance/certificates'),
    ])
    setHealth(h.data||null);setPolicy(p.data||{});setApps(a.data||[]);setOrigins(o.data||[]);setVault(v.data||[]);setCerts(c.data||[])
  }
  useEffect(()=>{void load().catch(e=>setError(e.message||'Unable to load Security Governance'))},[])
  const activeFindings=useMemo(()=>health?.findings?.filter(f=>!f.healthy&&!f.waived)||[],[health])

  const savePolicy=async()=>{
    try{
      await apiRequest('/api/security/governance/api-policy',{method:'PUT',body:JSON.stringify({
        enforceConnectedAppPolicy:policy.enforce_connected_app_policy===true,
        requirePkce:policy.require_pkce!==false,
        requireHighAssuranceForAppAdmin:policy.require_high_assurance_for_app_admin!==false,
        defaultRefreshTokenDays:Number(policy.default_refresh_token_days||30),
        maxRefreshTokenDays:Number(policy.max_refresh_token_days||180),
        allowedGrantTypes:policy.allowed_grant_types||['authorization_code','refresh_token'],
      })})
      setNotice('API & OAuth policy saved.');await load()
    }catch(e){setError(e.message)}
  }

  return <div className="space-y-4">
    <div className="settings-card"><div className="flex flex-wrap gap-2">{TABS.map(([key,label])=><button type="button" key={key} className={tab===key?'is-primary':''} onClick={()=>setTab(key)}>{label}</button>)}</div></div>
    {error?<div className="settings-error">{error}</div>:null}
    {notice?<div className="settings-card"><strong>{notice}</strong></div>:null}

    {tab==='health'?<section className="settings-card">
      <div className="settings-row"><div><strong>Security Health</strong><p>Tenant posture against the OneEngine security baseline.</p></div><strong>{health?health.score+'/100':'—'}</strong></div>
      {health?.findings?.map(f=><div className="settings-row" key={f.key}><div><strong>{f.healthy?'✓ ':f.waived?'Waived · ':'⚠ '}{f.title}</strong><p>{f.detail}</p>{!f.healthy?<p>{f.remediation}</p>:null}</div><span>{f.severity}</span></div>)}
      {health&&!activeFindings.length?<p>No active baseline findings.</p>:null}
    </section>:null}

    {tab==='api'?<section className="settings-card">
      <div className="settings-row"><div><strong>Connected-app enforcement</strong><p>Keep OFF while approving existing apps. ON blocks unapproved OAuth apps/scopes.</p></div><input type="checkbox" checked={policy.enforce_connected_app_policy===true} onChange={e=>setPolicy(p=>({...p,enforce_connected_app_policy:e.target.checked}))}/></div>
      <div className="settings-row"><strong>Require PKCE</strong><input type="checkbox" checked={policy.require_pkce!==false} onChange={e=>setPolicy(p=>({...p,require_pkce:e.target.checked}))}/></div>
      <div className="settings-row"><strong>High Assurance for app administration</strong><input type="checkbox" checked={policy.require_high_assurance_for_app_admin!==false} onChange={e=>setPolicy(p=>({...p,require_high_assurance_for_app_admin:e.target.checked}))}/></div>
      <div className="settings-row"><strong>Default refresh-token days</strong><input type="number" min="1" max="3650" value={policy.default_refresh_token_days||30} onChange={e=>setPolicy(p=>({...p,default_refresh_token_days:Number(e.target.value)}))}/></div>
      <div className="settings-row"><strong>Maximum refresh-token days</strong><input type="number" min="1" max="3650" value={policy.max_refresh_token_days||180} onChange={e=>setPolicy(p=>({...p,max_refresh_token_days:Number(e.target.value)}))}/></div>
      <div className="metadata-settings-form-actions"><button type="button" className="is-primary" onClick={savePolicy}>Save policy</button></div>
    </section>:null}

    {tab==='apps'?<div className="space-y-4">
      <section className="settings-card"><h3 className="font-semibold">Connected Apps</h3><p>Inventory integrations and approve their OAuth/API access before enabling enforcement.</p>
        {apps.map(a=><div className="settings-row" key={a.id||a.app_key}><div><strong>{a.display_name||a.app_key}</strong><p>{(a.provider_name||a.app_key)+' · '+(a.connection_status||'Policy only')+' · '+(a.active===true?'Governed':'Not governed')}</p></div><button type="button" onClick={()=>setApp({appKey:a.app_key,displayName:a.display_name||a.app_key,integrationConnectionId:a.integration_connection_id||'',active:a.active!==false,permittedUserMode:a.permitted_user_mode||'ALL_AUTHORISED',allowedScopes:Array.isArray(a.allowed_scopes)?a.allowed_scopes.join(' '):'',refreshTokenDays:a.refresh_token_days||'',ipPolicy:a.ip_policy||'ENFORCE',requireHighAssurance:a.require_high_assurance===true,revokeOnPolicyChange:a.revoke_on_policy_change!==false})}>Edit policy</button></div>)}
      </section>
      {app?<section className="settings-card">
        <div className="settings-row"><strong>Name</strong><input value={app.displayName} onChange={e=>setApp(d=>({...d,displayName:e.target.value}))}/></div>
        <div className="settings-row"><strong>Permitted users</strong><select value={app.permittedUserMode} onChange={e=>setApp(d=>({...d,permittedUserMode:e.target.value}))}><option value="ALL_AUTHORISED">All authorised users</option><option value="ADMIN_APPROVED">Admin approved</option></select></div>
        <div className="settings-row"><div><strong>Approved scopes</strong><p>Space- or comma-separated. Empty means no scope restriction after app approval.</p></div><textarea value={app.allowedScopes} onChange={e=>setApp(d=>({...d,allowedScopes:e.target.value}))}/></div>
        <div className="settings-row"><strong>Refresh-token days</strong><input type="number" value={app.refreshTokenDays} onChange={e=>setApp(d=>({...d,refreshTokenDays:e.target.value}))}/></div>
        <div className="settings-row"><strong>IP policy</strong><select value={app.ipPolicy} onChange={e=>setApp(d=>({...d,ipPolicy:e.target.value}))}><option value="ENFORCE">Enforce</option><option value="RELAX">Relax</option></select></div>
        <div className="settings-row"><strong>Require High Assurance</strong><input type="checkbox" checked={app.requireHighAssurance} onChange={e=>setApp(d=>({...d,requireHighAssurance:e.target.checked}))}/></div>
        <div className="metadata-settings-form-actions"><button type="button" className="is-primary" onClick={async()=>{try{await apiRequest('/api/security/governance/connected-apps/'+encodeURIComponent(app.appKey),{method:'PUT',body:JSON.stringify({...app,allowedScopes:app.allowedScopes.split(/[\s,]+/).filter(Boolean),refreshTokenDays:app.refreshTokenDays?Number(app.refreshTokenDays):null})});setApp(null);await load()}catch(e){setError(e.message)}}}>Save connected-app policy</button></div>
      </section>:null}
    </div>:null}

    {tab==='origins'?<section className="settings-card">
      <h3 className="font-semibold">Trusted Origins</h3><p>Exact HTTPS origins for CORS, outbound connections, redirect URIs or webhooks.</p>
      {origins.map(o=><div className="settings-row" key={o.id}><div><strong>{o.origin}</strong><p>{o.origin_type+(o.description?' · '+o.description:'')}</p></div>{o.active?<button type="button" onClick={async()=>{await apiRequest('/api/security/governance/trusted-origins/'+o.id,{method:'DELETE'});await load()}}>Disable</button>:<span>Disabled</span>}</div>)}
      <div className="settings-row"><strong>Origin</strong><input placeholder="https://app.example.com" value={origin.origin} onChange={e=>setOrigin(d=>({...d,origin:e.target.value}))}/></div>
      <div className="settings-row"><strong>Type</strong><select value={origin.originType} onChange={e=>setOrigin(d=>({...d,originType:e.target.value}))}><option>CORS</option><option>CSP_CONNECT</option><option>REDIRECT_URI</option><option>WEBHOOK</option></select></div>
      <div className="settings-row"><strong>Description</strong><input value={origin.description} onChange={e=>setOrigin(d=>({...d,description:e.target.value}))}/></div>
      <button type="button" onClick={async()=>{try{await apiRequest('/api/security/governance/trusted-origins',{method:'POST',body:JSON.stringify(origin)});setOrigin({origin:'',originType:'CORS',description:''});await load()}catch(e){setError(e.message)}}}>Add trusted origin</button>
    </section>:null}

    {tab==='vault'?<section className="settings-card">
      <h3 className="font-semibold">Credential Vault</h3><p>Secrets are write-only in the UI and encrypted at rest.</p>
      {vault.map(v=><div className="settings-row" key={v.id}><div><strong>{v.name}</strong><p>{v.secret_kind+' · rotated '+fmt(v.rotated_at)+' · expires '+fmt(v.expires_at)}</p></div>{v.active?<button type="button" onClick={async()=>{await apiRequest('/api/security/governance/vault/'+v.id,{method:'DELETE'});await load()}}>Disable</button>:<span>Disabled</span>}</div>)}
      <div className="settings-row"><strong>Name</strong><input value={vaultDraft.name} onChange={e=>setVaultDraft(d=>({...d,name:e.target.value}))}/></div>
      <div className="settings-row"><strong>Purpose</strong><input value={vaultDraft.purpose} onChange={e=>setVaultDraft(d=>({...d,purpose:e.target.value}))}/></div>
      <div className="settings-row"><strong>Secret</strong><input type="password" autoComplete="new-password" value={vaultDraft.secret} onChange={e=>setVaultDraft(d=>({...d,secret:e.target.value}))}/></div>
      <div className="settings-row"><strong>Type</strong><input value={vaultDraft.secretKind} onChange={e=>setVaultDraft(d=>({...d,secretKind:e.target.value}))}/></div>
      <button type="button" onClick={async()=>{try{await apiRequest('/api/security/governance/vault',{method:'POST',body:JSON.stringify({...vaultDraft,expiresAt:vaultDraft.expiresAt||null})});setVaultDraft({name:'',purpose:'',secret:'',secretKind:'GENERIC',expiresAt:''});await load()}catch(e){setError(e.message)}}}>Save / rotate secret</button>
    </section>:null}

    {tab==='certificates'?<section className="settings-card">
      <h3 className="font-semibold">Certificates & Keys</h3><p>Private keys are encrypted and are never returned to the browser.</p>
      {certs.map(c=><div className="settings-row" key={c.id}><div><strong>{c.name}</strong><p>{'SHA-256 '+c.fingerprint_sha256+' · expires '+fmt(c.not_after)+' · private key '+(c.has_private_key?'stored':'not stored')}</p></div>{c.active?<button type="button" onClick={async()=>{await apiRequest('/api/security/governance/certificates/'+c.id,{method:'DELETE'});await load()}}>Disable</button>:<span>Disabled</span>}</div>)}
      <div className="settings-row"><strong>Name</strong><input value={cert.name} onChange={e=>setCert(d=>({...d,name:e.target.value}))}/></div>
      <div className="settings-row"><strong>Purpose</strong><input value={cert.purpose} onChange={e=>setCert(d=>({...d,purpose:e.target.value}))}/></div>
      <div className="settings-row"><strong>Certificate PEM</strong><textarea rows="7" value={cert.certificatePem} onChange={e=>setCert(d=>({...d,certificatePem:e.target.value}))}/></div>
      <div className="settings-row"><strong>Private key PEM</strong><textarea rows="5" value={cert.privateKeyPem} onChange={e=>setCert(d=>({...d,privateKeyPem:e.target.value}))}/></div>
      <button type="button" onClick={async()=>{try{await apiRequest('/api/security/governance/certificates',{method:'POST',body:JSON.stringify(cert)});setCert({name:'',purpose:'',certificatePem:'',privateKeyPem:''});await load()}catch(e){setError(e.message)}}}>Save certificate</button>
    </section>:null}
  </div>
}
