import { useEffect, useState } from 'react'
import { ChevronLeft, UserRound } from 'lucide-react'
import { apiRequest, getPasskeyOptions, verifyMfa, verifyPasskey } from '../../services/api'

function valueLabel(value) {
  if (value === true) return 'Yes'
  if (value === false) return 'No'
  if (value == null || value === '') return '—'
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) return date.toLocaleString()
  }
  return String(value)
}

export default function ProfilePage({ onBack }) {
  const [runtime, setRuntime] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [mfaMethods,setMfaMethods]=useState([])
  const [trustedDevices,setTrustedDevices]=useState([])
  const [stepUp,setStepUp]=useState(null)
  const [stepCode,setStepCode]=useState('')
  const [pendingDisconnect,setPendingDisconnect]=useState(null)

  useEffect(() => {
    let live = true
    setLoading(true)
    Promise.all([
      apiRequest('/api/platform/runtime/my-record'),
      apiRequest('/api/security/mfa/methods').catch(()=>({data:[]})),
      apiRequest('/api/security/trusted-devices').catch(()=>({data:[]})),
    ])
      .then(([response,methods,devices]) => {
        if (!live) return
        setRuntime(response?.data || null)
        setMfaMethods(methods?.data||[])
        setTrustedDevices(devices?.data||[])
        setError('')
      })
      .catch((err) => {
        if (!live) return
        setRuntime(null)
        setError(err?.message || 'Unable to load your profile')
      })
      .finally(() => live && setLoading(false))
    return () => { live = false }
  }, [])

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

  const disconnectMethod=async(methodId)=>{
    try{
      await apiRequest(`/api/security/mfa/methods/${methodId}/disconnect`,{method:'POST',body:'{}'})
      const r=await apiRequest('/api/security/mfa/methods');setMfaMethods(r.data||[])
    }catch(e){
      if(e?.status===428&&e?.payload?.resourceKey){
        const challenge=await apiRequest('/api/auth/step-up/start',{method:'POST',body:JSON.stringify({resourceKey:e.payload.resourceKey})})
        setStepUp(challenge);setPendingDisconnect(methodId);return
      }
      setError(e.message||'Unable to disconnect method')
    }
  }

  const completeStepUp=async(methodType)=>{
    try{
      const method=stepUp?.availableMethods?.find(m=>m.type===methodType)
      if(methodType==='PASSKEY'){
        const options=await getPasskeyOptions(stepUp.challengeId)
        const publicKey={...options.data,challenge:decode(options.data.challenge),allowCredentials:(options.data.allowCredentials||[]).map(item=>({...item,id:decode(item.id)}))}
        const credential=await navigator.credentials.get({publicKey})
        await verifyPasskey({challengeId:stepUp.challengeId,credential:credentialJson(credential)})
      }else{
        await verifyMfa({challengeId:stepUp.challengeId,methodId:method?.id,methodType,code:stepCode})
      }
      const target=pendingDisconnect;setStepUp(null);setPendingDisconnect(null);setStepCode('')
      if(target)await disconnectMethod(target)
    }catch(e){setError(e.message||'Additional verification failed')}
  }

  const record = runtime?.record || null
  const fields = Array.isArray(runtime?.fields)
    ? runtime.fields.filter((field) => field?.active !== false && field?.readable !== false)
    : []
  const title = record?.full_name || record?.name || record?.username || record?.email || 'Profile'

  return <section className="profile-page">
    <header className="profile-page-header">
      <button type="button" onClick={onBack} aria-label="Back"><ChevronLeft size={16}/> Back</button>
      <div><UserRound size={22}/><span>My Profile</span></div>
    </header>

    {stepUp?<div className="profile-card">
      <div className="profile-card-title"><div><strong>Additional Verification Required</strong><span>Verify at High Assurance before disconnecting an MFA method.</span></div></div>
      <div className="profile-fields">
        {stepUp.availableMethods?.some(m=>m.type==='PASSKEY')?<div className="profile-field-row"><span>Passkey or security key</span><button type="button" onClick={()=>void completeStepUp('PASSKEY')}>Verify</button></div>:null}
        {stepUp.availableMethods?.some(m=>m.type==='TOTP')?<div className="profile-field-row"><span>Authenticator code</span><span><input inputMode="numeric" value={stepCode} onChange={e=>setStepCode(e.target.value.replace(/\D/g,'').slice(0,6))}/><button type="button" onClick={()=>void completeStepUp('TOTP')}>Verify</button></span></div>:null}
      </div>
    </div>:null}

    {loading ? <div className="profile-state">Loading profile…</div> : error ? <div className="profile-state is-error">{error}</div> : record ? (
      <div className="profile-card">
        <div className="profile-card-title">
          <div className="profile-card-avatar">{String(title).trim().charAt(0).toUpperCase() || 'U'}</div>
          <div><strong>{title}</strong><span>{runtime?.object?.label || runtime?.objectKey || 'User'}</span></div>
        </div>
        <div className="profile-fields">
          {fields.map((field) => (
            <div className="profile-field-row" key={field.id || field.api_name}>
              <span>{field.label || field.api_name}</span>
              <strong>{valueLabel(record?.[field.api_name])}</strong>
            </div>
          ))}
        </div>
        <div className="profile-fields">
          <div className="profile-field-row"><span>Identity verification methods</span><strong>{mfaMethods.length}</strong></div>
          {mfaMethods.map((method)=><div className="profile-field-row" key={method.id}><span>{method.label||method.type||method.method_type}</span><button type="button" onClick={()=>void disconnectMethod(method.id)}>Disconnect</button></div>)}
          <div className="profile-field-row"><span>Trusted devices</span><strong>{trustedDevices.filter(d=>!d.revoked_at).length}</strong></div>
          {trustedDevices.filter(d=>!d.revoked_at).map((device)=><div className="profile-field-row" key={device.id}><span>{device.device_name||device.browser||'Device'}</span><button type="button" onClick={async()=>{try{await apiRequest(`/api/security/trusted-devices/${device.id}/revoke`,{method:'POST',body:'{}'});const r=await apiRequest('/api/security/trusted-devices');setTrustedDevices(r.data||[])}catch(e){setError(e.message||'Unable to revoke trusted device')}}}>Revoke</button></div>)}
        </div>
      </div>
    ) : <div className="profile-state">Your user record is not available.</div>}
  </section>
}
