import { useEffect, useState } from 'react'
import { ChevronLeft, UserRound } from 'lucide-react'
import { apiRequest, getPasskeyOptions, startPasskeyRegistration, verifyMfa, verifyPasskey } from '../../services/api'

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
  const [passkeyPolicy,setPasskeyPolicy]=useState({allowPasskeyLogin:false,allowPlatformPasskeys:false,allowSecurityKeys:false})
  const [passkeyBusy,setPasskeyBusy]=useState(false)
  const [message,setMessage]=useState('')

  useEffect(() => {
    let live = true
    setLoading(true)

    // The profile record is the only blocking payload. Security methods,
    // trusted devices and passkey policy enrich the page after first paint and
    // must never delay the user's profile becoming usable.
    apiRequest('/api/platform/runtime/my-record')
      .then((response) => {
        if (!live) return
        setRuntime(response?.data || null)
        setError('')
      })
      .catch((err) => {
        if (!live) return
        setRuntime(null)
        setError(err?.message || 'Unable to load your profile')
      })
      .finally(() => live && setLoading(false))

    void Promise.all([
      apiRequest('/api/security/mfa/methods').catch(()=>({data:[]})),
      apiRequest('/api/security/trusted-devices').catch(()=>({data:[]})),
      apiRequest('/api/auth/mfa/passkey/policy').catch(()=>({data:{}})),
    ]).then(([methods,devices,passkey]) => {
      if (!live) return
      setMfaMethods(methods?.data||[])
      setTrustedDevices(devices?.data||[])
      setPasskeyPolicy({
        allowPasskeyLogin:passkey?.data?.allowPasskeyLogin===true,
        allowPlatformPasskeys:passkey?.data?.allowPlatformPasskeys===true,
        allowSecurityKeys:passkey?.data?.allowSecurityKeys===true,
      })
    })

    return () => { live = false }
  }, [])

  const decode=(value)=>{
    const text=String(value||'').replace(/-/g,'+').replace(/_/g,'/')
    const padded=text+'='.repeat((4-text.length%4)%4)
    return Uint8Array.from(atob(padded),ch=>ch.charCodeAt(0)).buffer
  }
  const encode=(value)=>value?btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''):null
  const credentialJson=(credential)=>{
    const response=credential.response||{}
    return {
      id:credential.id,rawId:encode(credential.rawId),type:credential.type,authenticatorAttachment:credential.authenticatorAttachment||undefined,
      clientExtensionResults:credential.getClientExtensionResults?.()||{},
      response:{
        clientDataJSON:encode(response.clientDataJSON),
        attestationObject:encode(response.attestationObject),
        authenticatorData:encode(response.authenticatorData),
        signature:encode(response.signature),
        userHandle:encode(response.userHandle),
        transports:typeof response.getTransports==='function'?response.getTransports():undefined,
      },
    }
  }

  const creationOptions=(options)=>({
    ...options,
    challenge:decode(options.challenge),
    user:{...options.user,id:decode(options.user?.id)},
    excludeCredentials:(options.excludeCredentials||[]).map(item=>({...item,id:decode(item.id)})),
  })

  const addPasskey=async(authenticatorKind='PLATFORM')=>{
    try{
      setPasskeyBusy(true);setError('');setMessage('')
      if(!window.PublicKeyCredential||!navigator.credentials)throw new Error('Passkeys are not supported on this browser or device.')
      const start=await apiRequest('/api/auth/mfa/passkeys/enrollment/start',{method:'POST',body:'{}'})
      const options=await startPasskeyRegistration(start.challengeId,authenticatorKind)
      const credential=await navigator.credentials.create({publicKey:creationOptions(options.data)})
      await apiRequest('/api/auth/mfa/passkey/registration-verify',{method:'POST',body:JSON.stringify({
        challengeId:start.challengeId,
        credential:credentialJson(credential),
        label:authenticatorKind==='SECURITY_KEY'?'Security Key':'Built-in Passkey',
      })})
      const methods=await apiRequest('/api/security/mfa/methods')
      setMfaMethods(methods.data||[])
      setMessage(authenticatorKind==='SECURITY_KEY'?'Security key added.':'Passkey added. You can now use Face ID, Touch ID, Windows Hello or your device biometric when supported.')
    }catch(e){setError(e.message||'Unable to add passkey')}
    finally{setPasskeyBusy(false)}
  }

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
          {message?<div className="profile-field-row"><span>Passkeys</span><strong>{message}</strong></div>:null}
          {passkeyPolicy.allowPlatformPasskeys?<div className="profile-field-row"><span>Face ID / Touch ID / Windows Hello / device biometric</span><button type="button" disabled={passkeyBusy} onClick={()=>void addPasskey('PLATFORM')}>{passkeyBusy?'Working…':'Add passkey'}</button></div>:null}
          {passkeyPolicy.allowSecurityKeys?<div className="profile-field-row"><span>Physical FIDO2 security key</span><button type="button" disabled={passkeyBusy} onClick={()=>void addPasskey('SECURITY_KEY')}>{passkeyBusy?'Working…':'Add security key'}</button></div>:null}
          {passkeyPolicy.allowPasskeyLogin?<div className="profile-field-row"><span>Passwordless sign-in</span><strong>Enabled by company policy</strong></div>:<div className="profile-field-row"><span>Passwordless sign-in</span><strong>Disabled by company policy</strong></div>}
          {mfaMethods.map((method)=><div className="profile-field-row" key={method.id}><span>{method.label||method.type||method.method_type}</span><button type="button" onClick={()=>void disconnectMethod(method.id)}>Disconnect</button></div>)}
          <div className="profile-field-row"><span>Trusted devices</span><strong>{trustedDevices.filter(d=>!d.revoked_at).length}</strong></div>
          {trustedDevices.filter(d=>!d.revoked_at).map((device)=><div className="profile-field-row" key={device.id}><span>{device.device_name||device.browser||'Device'}</span><button type="button" onClick={async()=>{try{await apiRequest(`/api/security/trusted-devices/${device.id}/revoke`,{method:'POST',body:'{}'});const r=await apiRequest('/api/security/trusted-devices');setTrustedDevices(r.data||[])}catch(e){setError(e.message||'Unable to revoke trusted device')}}}>Revoke</button></div>)}
        </div>
      </div>
    ) : <div className="profile-state">Your user record is not available.</div>}
  </section>
}
