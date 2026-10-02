import { useEffect, useState } from 'react'
import { apiRequest, getPasskeyOptions, verifyMfa, verifyPasskey } from '../../services/api'

export default function MfaAdministrationSettings(){
  const [users,setUsers]=useState([])
  const [userId,setUserId]=useState('')
  const [methods,setMethods]=useState([])
  const [devices,setDevices]=useState([])
  const [history,setHistory]=useState([])
  const [hours,setHours]=useState(1)
  const [generated,setGenerated]=useState(null)
  const [error,setError]=useState('')
  const [stepUp,setStepUp]=useState(null)
  const [stepCode,setStepCode]=useState('')
  const [pendingAction,setPendingAction]=useState(null)

  const load=async()=>{
    setError('')
    const [u,d,h]=await Promise.all([
      apiRequest('/api/security/mfa/users'),
      apiRequest('/api/security/trusted-devices/all'),
      apiRequest('/api/security/identity-verification-history?limit=250'),
    ])
    setUsers(u.data||[]);setDevices(d.data||[]);setHistory(h.data||[])
  }
  useEffect(()=>{void load().catch(e=>setError(e.message))},[])

  const decode=(value)=>{
    const text=String(value||'').replace(/-/g,'+').replace(/_/g,'/')
    const padded=text+'='.repeat((4-text.length%4)%4)
    return Uint8Array.from(atob(padded),ch=>ch.charCodeAt(0)).buffer
  }
  const encode=(value)=>value?btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''):null
  const credentialJson=(credential)=>({
    id:credential.id,rawId:encode(credential.rawId),type:credential.type,authenticatorAttachment:credential.authenticatorAttachment||undefined,
    clientExtensionResults:credential.getClientExtensionResults?.()||{},
    response:{clientDataJSON:encode(credential.response?.clientDataJSON),authenticatorData:encode(credential.response?.authenticatorData),
      signature:encode(credential.response?.signature),userHandle:encode(credential.response?.userHandle)},
  })

  const guarded=async(action)=>{
    try{return await action()}
    catch(e){
      if(e?.status===428&&e?.payload?.resourceKey){
        const start=await apiRequest('/api/auth/step-up/start',{method:'POST',body:JSON.stringify({resourceKey:e.payload.resourceKey})})
        if(start?.required){
          setPendingAction(()=>action);setStepUp(start);return null
        }
        return action()
      }
      throw e
    }
  }

  const completeStepUp=async(methodType)=>{
    try{
      const method=stepUp?.availableMethods?.find(m=>m.type===methodType)
      if(methodType==='PASSKEY'){
        const options=await getPasskeyOptions(stepUp.challengeId)
        const publicKey={...options.data,challenge:decode(options.data.challenge),
          allowCredentials:(options.data.allowCredentials||[]).map(item=>({...item,id:decode(item.id)}))}
        const credential=await navigator.credentials.get({publicKey})
        await verifyPasskey({challengeId:stepUp.challengeId,credential:credentialJson(credential)})
      }else{
        await verifyMfa({challengeId:stepUp.challengeId,methodId:method?.id,methodType,code:stepCode})
      }
      const retry=pendingAction;setStepUp(null);setPendingAction(null);setStepCode('')
      if(retry)await retry()
      await load();if(userId)await loadMethods(userId)
    }catch(e){setError(e.message||'Additional verification failed')}
  }

  const loadMethods=async(id)=>{
    setUserId(id);setGenerated(null)
    if(!id){setMethods([]);return}
    const r=await apiRequest(`/api/security/mfa/users/${id}/methods`);setMethods(r.data||[])
  }

  return <div className="space-y-4">
    {error?<div className="settings-error">{error}</div>:null}
    {stepUp?<section className="settings-card">
      <h3 className="font-semibold">Additional Verification Required</h3>
      <p className="text-sm text-slate-500">This MFA administration action requires a fresh High-Assurance verification.</p>
      <div className="flex flex-wrap gap-2 items-center">
        {stepUp.availableMethods?.some(m=>m.type==='PASSKEY')?<button type="button" onClick={()=>void completeStepUp('PASSKEY')}>Verify with passkey</button>:null}
        {stepUp.availableMethods?.some(m=>m.type==='TOTP')?<><input inputMode="numeric" placeholder="Authenticator code" value={stepCode} onChange={e=>setStepCode(e.target.value)}/><button type="button" onClick={()=>void completeStepUp('TOTP')}>Verify</button></>:null}
        {!stepUp.availableMethods?.length?<span>No enrolled method can satisfy High Assurance. Enrol a passkey or security key first.</span>:null}
      </div>
    </section>:null}
    <section className="settings-card">
      <h3 className="font-semibold">MFA Administration</h3>
      <p className="text-sm text-slate-500">Delegated MFA support without access to password, network, provider or other security configuration.</p>
      <div className="settings-row"><strong>User</strong><select value={userId} onChange={e=>void loadMethods(e.target.value)}><option value="">Select user…</option>{users.map(u=><option key={u.id} value={u.id}>{u.full_name||u.username} · {u.method_count||0} methods</option>)}</select></div>
      {userId?<div className="settings-row"><div><strong>Temporary Verification Code</strong><p>Valid for 1–24 hours. It cannot activate an unknown device.</p></div><div className="flex gap-2"><input type="number" min="1" max="24" value={hours} onChange={e=>setHours(Math.min(24,Math.max(1,Number(e.target.value)||1)))}/><button type="button" onClick={async()=>{try{const r=await guarded(()=>apiRequest(`/api/security/mfa/users/${userId}/temporary-code`,{method:'POST',body:JSON.stringify({expiresHours:hours})}));if(r){setGenerated(r.data||null);await loadMethods(userId);await load()}}catch(e){setError(e.message)}}}>Generate</button></div></div>:null}
      {generated?<div className="settings-row"><div><strong>Temporary code — copy now</strong><p>Expires {new Date(generated.expiresAt).toLocaleString()}.</p></div><code>{generated.code}</code></div>:null}
      {methods.map(m=><div className="settings-row" key={m.id}><div><strong>{m.label||m.method_type}</strong><p>{m.method_type}{m.authenticator_kind?` · ${m.authenticator_kind}`:''}{m.last_used_at?` · last used ${new Date(m.last_used_at).toLocaleString()}`:''}</p></div>{m.method_type==='TEMPORARY_CODE'?<button type="button" onClick={async()=>{const r=await guarded(()=>apiRequest(`/api/security/mfa/users/${userId}/temporary-code/expire`,{method:'POST',body:'{}'}));if(r){setGenerated(null);await loadMethods(userId);await load()}}}>Expire</button>:m.active?<button type="button" onClick={async()=>{await apiRequest(`/api/security/mfa/users/${userId}/methods/${m.id}/disconnect`,{method:'POST',body:'{}'});await loadMethods(userId);await load()}}>Disconnect</button>:<span>Disconnected</span>}</div>)}
    </section>

    <section className="settings-card">
      <h3 className="font-semibold">Trusted Devices</h3>
      {devices.length?devices.map(d=><div className="settings-row" key={d.id}><div><strong>{d.device_name||d.browser||'Device'}</strong><p>{d.full_name||d.username} · {d.platform||'Unknown'} / {d.browser||'Unknown'} · trusted until {new Date(d.trusted_until).toLocaleString()}</p></div>{!d.revoked_at?<button type="button" onClick={async()=>{await apiRequest(`/api/security/trusted-devices/${d.id}/admin-revoke`,{method:'POST',body:'{}'});await load()}}>Revoke</button>:<span>Revoked</span>}</div>):<p>No trusted devices.</p>}
    </section>

    <section className="settings-card overflow-x-auto">
      <h3 className="font-semibold">Identity Verification History</h3>
      <table className="onepos-table w-full text-sm"><thead><tr><th>When</th><th>User</th><th>Event</th><th>Method</th><th>Status</th><th>Assurance</th></tr></thead><tbody>{history.map(r=><tr key={r.id}><td>{new Date(r.occurred_at).toLocaleString()}</td><td>{r.full_name||r.username||'—'}</td><td>{r.event_type}</td><td>{r.method||'—'}</td><td>{r.status}</td><td>{r.assurance_level||'—'}</td></tr>)}</tbody></table>
      {!history.length?<p>No verification events yet.</p>:null}
    </section>
  </div>
}
