import { useEffect, useMemo, useState } from 'react'
import { apiRequest, getPasskeyOptions, startPasskeyRegistration, verifyMfa, verifyPasskey } from '../../services/api'

const STEP_UP_RESOURCES = [
  ['REPORTS_DASHBOARDS','Reports and dashboards'],
  ['MANAGE_ENCRYPTION_KEYS','Manage encryption keys'],
  ['MANAGE_AUTH_PROVIDERS','Manage authentication providers'],
  ['MANAGE_CERTIFICATES','Manage certificates and keys'],
  ['MANAGE_CONNECTED_APPS','Manage connected apps'],
  ['MANAGE_DATA_EXPORT','Manage data export'],
  ['MANAGE_IP_ADDRESSES','Manage IP addresses'],
  ['MANAGE_USERS','Manage users'],
  ['UNLOCK_RESET_PASSWORDS','Unlock users and reset passwords'],
  ['VIEW_HEALTH_CHECK','View security health check'],
  ['SECURITY_CONFIGURATION','Other security configuration'],
  ['ACCESS_CONTROL_ADMIN','Access-control administration'],
  ['DEPLOYMENT_ADMIN','Deployments and releases'],
]

function Toggle({checked,onChange,label}) {
  return <button type="button" className={`mac-switch ${checked?'is-on':''}`} aria-pressed={checked} aria-label={label} onClick={()=>onChange(!checked)}><span/></button>
}
function NumberRow({label,help,value,onChange,min=0,max=3650}) {
  return <div className="settings-row"><div><strong>{label}</strong><p>{help}</p></div><input type="number" min={min} max={max} value={value??0} onChange={e=>onChange(Number(e.target.value))}/></div>
}
function emptyProvider() {
  return {
    name:'',providerKey:'',providerType:'OIDC',enabled:false,showOnLogin:true,useOneEngineMfa:false,assuranceLevel:'STANDARD',
    configuration:{usePkce:true,requireEmailVerified:true,scopes:['openid','email','profile']},
    credentials:{clientId:'',clientSecret:''},
  }
}
function publicKeyRequest(options) {
  const decode=(value)=>{
    const text=String(value||'').replace(/-/g,'+').replace(/_/g,'/')
    const padded=text+'='.repeat((4-text.length%4)%4)
    return Uint8Array.from(atob(padded),c=>c.charCodeAt(0)).buffer
  }
  return {...options,challenge:decode(options.challenge),allowCredentials:(options.allowCredentials||[]).map(x=>({...x,id:decode(x.id)}))}
}
function credentialJson(credential) {
  const encode=(value)=>value?btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''):null
  const response=credential.response||{}
  return {
    id:credential.id,rawId:encode(credential.rawId),type:credential.type,authenticatorAttachment:credential.authenticatorAttachment||undefined,
    clientExtensionResults:credential.getClientExtensionResults?.()||{},
    response:{
      clientDataJSON:encode(response.clientDataJSON),
      authenticatorData:encode(response.authenticatorData),
      signature:encode(response.signature),
      userHandle:encode(response.userHandle),
    },
  }
}

export default function IdentityAssuranceSettings({mode='assurance'}) {
  const [data,setData]=useState(null)
  const [draft,setDraft]=useState({})
  const [providers,setProviders]=useState([])
  const [providerId,setProviderId]=useState('')
  const [providerDraft,setProviderDraft]=useState(emptyProvider())
  const [devices,setDevices]=useState([])
  const [mfaUsers,setMfaUsers]=useState([])
  const [userId,setUserId]=useState('')
  const [userMethods,setUserMethods]=useState([])
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  const [stepUp,setStepUp]=useState(null)
  const [stepCode,setStepCode]=useState('')
  const [pendingAction,setPendingAction]=useState(null)
  const [tempCodeHours,setTempCodeHours]=useState(1)
  const [generatedTempCode,setGeneratedTempCode]=useState(null)

  const load=async()=>{
    setError('')
    const [a,p,d,u]=await Promise.all([
      apiRequest('/api/security/assurance'),
      apiRequest('/api/security/auth-providers'),
      apiRequest('/api/security/trusted-devices/all'),
      apiRequest('/api/security/mfa/users'),
    ])
    setData(a.data||{})
    setDraft(a.data?.settings||{})
    setProviders(p.data||[])
    setDevices(d.data||[])
    setMfaUsers(u.data||[])
  }
  useEffect(()=>{void load().catch(e=>setError(e.message))},[])

  const selectedProvider=useMemo(()=>providers.find(p=>p.id===providerId)||null,[providers,providerId])
  useEffect(()=>{
    if(!selectedProvider)return
    setProviderDraft({
      ...selectedProvider,
      configuration:{...(selectedProvider.configuration||{})},
      credentials:{clientId:'',clientSecret:''},
    })
  },[selectedProvider?.id])

  const guarded=async(action,onRetryResult=null)=>{
    try{return await action()}
    catch(e){
      if(e?.status===428&&e?.payload?.resourceKey){
        const start=await apiRequest('/api/auth/step-up/start',{method:'POST',body:JSON.stringify({resourceKey:e.payload.resourceKey})})
        if(start?.required){
          setPendingAction(()=>async()=>{
            const result=await action()
            if(onRetryResult)await onRetryResult(result)
            return result
          })
          setStepUp({resourceKey:e.payload.resourceKey,...start})
          return null
        }
        return action()
      }
      throw e
    }
  }
  const completeStep=async(methodType='TOTP')=>{
    try{
      setBusy(true);setError('')
      const method=stepUp?.availableMethods?.find(x=>x.type===methodType)
      if(methodType==='PASSKEY'){
        const options=await getPasskeyOptions(stepUp.challengeId)
        const credential=await navigator.credentials.get({publicKey:publicKeyRequest(options.data)})
        await verifyPasskey({challengeId:stepUp.challengeId,credential:credentialJson(credential)})
      }else{
        await verifyMfa({challengeId:stepUp.challengeId,methodId:method?.id,methodType,code:stepCode})
      }
      const retry=pendingAction
      setStepUp(null);setPendingAction(null);setStepCode('')
      if(retry)await retry()
      await load()
    }catch(e){setError(e.message||'Additional verification failed')}
    finally{setBusy(false)}
  }

  const registerStepPasskey=async(authenticatorKind='PLATFORM')=>{
    try{
      setBusy(true);setError('')
      const options=await startPasskeyRegistration(stepUp.challengeId,authenticatorKind)
      const credential=await navigator.credentials.create({publicKey:{
        ...options.data,
        challenge:publicKeyRequest({challenge:options.data.challenge,allowCredentials:[]}).challenge,
        user:{...options.data.user,id:(()=>{
          const text=String(options.data.user.id||'').replace(/-/g,'+').replace(/_/g,'/')
          const padded=text+'='.repeat((4-text.length%4)%4)
          return Uint8Array.from(atob(padded),ch=>ch.charCodeAt(0)).buffer
        })()},
        excludeCredentials:(options.data.excludeCredentials||[]).map(item=>{
          const text=String(item.id||'').replace(/-/g,'+').replace(/_/g,'/')
          const padded=text+'='.repeat((4-text.length%4)%4)
          return {...item,id:Uint8Array.from(atob(padded),ch=>ch.charCodeAt(0)).buffer}
        }),
      }})
      await apiRequest('/api/auth/mfa/passkey/registration-verify',{method:'POST',body:JSON.stringify({
        challengeId:stepUp.challengeId,credential:credentialJson(credential),
        label:authenticatorKind==='SECURITY_KEY'?'Security Key':'Built-in Passkey',authenticatorKind,
      })})
      const retry=pendingAction
      setStepUp(null);setPendingAction(null);setStepCode('')
      if(retry)await retry()
      await load()
    }catch(e){setError(e.message||'Passkey enrollment failed')}
    finally{setBusy(false)}
  }

  const saveAssurance=async()=>{
    setBusy(true);setError('');setMessage('')
    try{
      await guarded(()=>apiRequest('/api/security/assurance',{method:'PUT',body:JSON.stringify({
        mfaRequired:draft.mfa_required,
        phishingResistantMfaRequired:draft.phishing_resistant_mfa_required,
        trustSsoMfa:draft.trust_sso_mfa,
        trustedDeviceDays:draft.trusted_device_days,
        deviceActivationRequired:draft.device_activation_required,
        skipDeviceActivationOnTrustedNetwork:draft.skip_device_activation_on_trusted_network,
        stepUpPeriodMinutes:draft.step_up_period_minutes,
        requiredLoginAssurance:draft.required_login_assurance,
        passwordAssurance:draft.password_assurance,
        totpAssurance:draft.totp_assurance,
        passkeyAssurance:draft.passkey_assurance,
        ssoAssurance:draft.sso_assurance,
        allowTotp:draft.allow_totp,
        allowPlatformPasskeys:draft.allow_platform_passkeys,
        allowSecurityKeys:draft.allow_security_keys,
        allowRecoveryCodes:draft.allow_recovery_codes,
      })}))
      setMessage('Identity assurance settings saved.');await load()
    }catch(e){setError(e.message)}finally{setBusy(false)}
  }

  const saveStepPolicy=async(resourceKey,patch)=>{
    try{
      await guarded(()=>apiRequest(`/api/security/step-up/${resourceKey}`,{method:'PUT',body:JSON.stringify(patch)}))
      await load()
    }catch(e){setError(e.message)}
  }

  const newProvider=()=>{setProviderId('');setProviderDraft(emptyProvider())}
  const saveProvider=async()=>{
    setBusy(true);setError('');setMessage('')
    try{
      const payload={...providerDraft,configuration:{...(providerDraft.configuration||{})},credentials:providerDraft.credentials}
      const response=await guarded(()=>apiRequest(providerId?`/api/security/auth-providers/${providerId}`:'/api/security/auth-providers',{
        method:providerId?'PUT':'POST',body:JSON.stringify(payload),
      }))
      setMessage('Authentication provider saved.');await load()
      if(response?.data?.id)setProviderId(response.data.id)
    }catch(e){setError(e.message)}finally{setBusy(false)}
  }
  const testProvider=async()=>{
    if(!providerId)return
    try{
      setBusy(true);setError('')
      const r=await guarded(()=>apiRequest(`/api/security/auth-providers/${providerId}/test`,{method:'POST',body:'{}'}))
      if(r)setMessage(r.data?.message||'Provider configuration is valid.')
    }catch(e){setError(e.message)}finally{setBusy(false)}
  }
  const removeProvider=async()=>{
    if(!providerId)return
    try{
      await guarded(()=>apiRequest(`/api/security/auth-providers/${providerId}`,{method:'DELETE'}))
      setProviderId('');setProviderDraft(emptyProvider());await load()
    }catch(e){setError(e.message)}
  }

  const loadMethods=async(id)=>{
    setUserId(id)
    if(!id){setUserMethods([]);return}
    const r=await apiRequest(`/api/security/mfa/users/${id}/methods`);setUserMethods(r.data||[])
  }

  const generateTempCode=async()=>{
    if(!userId)return
    setGeneratedTempCode(null);setError('')
    const applyResult=async(response)=>{
      if(response?.data){
        setGeneratedTempCode(response.data)
        await loadMethods(userId)
      }
    }
    try{
      const response=await guarded(
        ()=>apiRequest(`/api/security/mfa/users/${userId}/temporary-code`,{method:'POST',body:JSON.stringify({expiresHours:tempCodeHours})}),
        applyResult,
      )
      if(response)await applyResult(response)
    }catch(e){setError(e.message||'Unable to generate temporary verification code')}
  }

  const expireTempCode=async()=>{
    if(!userId)return
    try{
      await guarded(()=>apiRequest(`/api/security/mfa/users/${userId}/temporary-code/expire`,{method:'POST',body:'{}'}))
      setGeneratedTempCode(null);await loadMethods(userId)
    }catch(e){setError(e.message||'Unable to expire temporary verification code')}
  }

  const stepPolicies=Object.fromEntries((data?.stepUpPolicies||[]).map(x=>[x.resource_key,x]))

  return <div className="space-y-4">
    {error?<div className="settings-error">{error}</div>:null}
    {message?<div className="settings-card"><strong>{message}</strong></div>:null}

    {mode==='assurance'?<>
      <section className="settings-card">
        <h3 className="font-semibold">Multi-Factor Authentication</h3>
        <div className="settings-row"><div><strong>Require MFA</strong><p>Users must complete an enrolled second factor unless a more specific access policy overrides this value.</p></div><Toggle label="Require MFA" checked={draft.mfa_required===true} onChange={v=>setDraft(d=>({...d,mfa_required:v}))}/></div>
        <div className="settings-row"><div><strong>Require phishing-resistant MFA</strong><p>Only WebAuthn/passkey methods satisfy this policy.</p></div><Toggle label="Require phishing-resistant MFA" checked={draft.phishing_resistant_mfa_required===true} onChange={v=>setDraft(d=>({...d,phishing_resistant_mfa_required:v}))}/></div>
        <div className="settings-row"><div><strong>Trust MFA performed by SSO provider</strong><p>When enabled, an SSO provider mapped to High Assurance can satisfy MFA without a second OneEngine challenge.</p></div><Toggle label="Trust SSO MFA" checked={draft.trust_sso_mfa!==false} onChange={v=>setDraft(d=>({...d,trust_sso_mfa:v}))}/></div>
        <NumberRow label="Trusted device lifetime (days)" help="How long a device remains in the trusted-device registry. 0 disables device trust." value={draft.trusted_device_days??30} min={0} max={3650} onChange={v=>setDraft(d=>({...d,trusted_device_days:v}))}/>
        <div className="settings-row"><div><strong>Require device activation</strong><p>Unknown browsers/devices must complete identity verification before a session is issued.</p></div><Toggle label="Require device activation" checked={draft.device_activation_required===true} onChange={v=>setDraft(d=>({...d,device_activation_required:v}))}/></div>
        <div className="settings-row"><div><strong>Skip device activation on trusted networks</strong><p>Users on a configured trusted IP range can sign in from a new device without the separate activation challenge.</p></div><Toggle label="Skip device activation on trusted networks" checked={draft.skip_device_activation_on_trusted_network!==false} onChange={v=>setDraft(d=>({...d,skip_device_activation_on_trusted_network:v}))}/></div>
        <div className="settings-row"><div><strong>Allow authenticator apps (TOTP)</strong><p>Third-party apps that generate RFC 6238 codes. Default assurance is Standard.</p></div><Toggle label="Allow TOTP" checked={draft.allow_totp!==false} onChange={v=>setDraft(d=>({...d,allow_totp:v}))}/></div>
        <div className="settings-row"><div><strong>Allow built-in passkeys</strong><p>Platform authenticators such as Windows Hello, Face ID, Touch ID and Android device authentication.</p></div><Toggle label="Allow built-in passkeys" checked={draft.allow_platform_passkeys!==false} onChange={v=>setDraft(d=>({...d,allow_platform_passkeys:v}))}/></div>
        <div className="settings-row"><div><strong>Allow physical security keys</strong><p>Cross-platform FIDO2/WebAuthn security keys such as USB or NFC keys.</p></div><Toggle label="Allow security keys" checked={draft.allow_security_keys!==false} onChange={v=>setDraft(d=>({...d,allow_security_keys:v}))}/></div>
        <div className="settings-row"><div><strong>Allow recovery codes</strong><p>One-time emergency recovery codes generated on first MFA enrollment.</p></div><Toggle label="Allow recovery codes" checked={draft.allow_recovery_codes!==false} onChange={v=>setDraft(d=>({...d,allow_recovery_codes:v}))}/></div>
      </section>

      <section className="settings-card">
        <h3 className="font-semibold">Session Security Levels</h3>
        {[
          ['required_login_assurance','Security level required at login'],
          ['password_assurance','Username + password'],
          ['totp_assurance','Authenticator / TOTP'],
          ['passkey_assurance','Passkey / WebAuthn'],
          ['sso_assurance','Authentication provider / SSO default'],
        ].map(([key,label])=><div className="settings-row" key={key}><div><strong>{label}</strong><p>Map this authentication method to Standard or High Assurance.</p></div><select value={draft[key]||'STANDARD'} onChange={e=>setDraft(d=>({...d,[key]:e.target.value}))}><option value="STANDARD">Standard</option><option value="HIGH">High Assurance</option></select></div>)}
        <NumberRow label="Default step-up re-verification period (minutes)" help="After this period, a sensitive operation can require identity verification again." value={draft.step_up_period_minutes??15} min={1} max={1440} onChange={v=>setDraft(d=>({...d,step_up_period_minutes:v}))}/>
        <div className="metadata-settings-form-actions"><button className="is-primary" disabled={busy} onClick={saveAssurance}>{busy?'Saving…':'Save MFA & assurance'}</button></div>
      </section>

      <section className="settings-card">
        <h3 className="font-semibold">Sensitive Operation Policies</h3>
        {STEP_UP_RESOURCES.map(([key,label])=>{
          const p=stepPolicies[key]||{}
          return <div className="settings-row" key={key}><div><strong>{label}</strong><p>{key}</p></div><div className="flex flex-wrap gap-2"><select value={p.action||'ALLOW'} onChange={e=>saveStepPolicy(key,{action:e.target.value,requiredAssurance:p.required_assurance||'HIGH',reverifyAfterMinutes:p.reverify_after_minutes??draft.step_up_period_minutes??15})}><option value="ALLOW">Allow</option><option value="RAISE">Raise to High Assurance</option><option value="BLOCK">Block</option></select>{(p.action||'ALLOW')==='RAISE'?<input type="number" min="1" max="1440" defaultValue={p.reverify_after_minutes??draft.step_up_period_minutes??15} onBlur={e=>saveStepPolicy(key,{action:'RAISE',requiredAssurance:'HIGH',reverifyAfterMinutes:Number(e.target.value)})} aria-label={`${label} reverify minutes`}/>:null}</div></div>
        })}
      </section>

      <section className="settings-card">
        <h3 className="font-semibold">User MFA Methods</h3>
        <div className="settings-row"><strong>User</strong><select value={userId} onChange={e=>{setGeneratedTempCode(null);loadMethods(e.target.value)}}><option value="">Select user…</option>{mfaUsers.map(u=><option key={u.id} value={u.id}>{u.full_name||u.username} · {u.method_count||0} methods</option>)}</select></div>
        {userId?<div className="settings-row"><div><strong>Temporary Verification Code</strong><p>MFA recovery only. Valid for 1–24 hours and cannot activate an unknown device.</p></div><div className="flex flex-wrap gap-2"><input type="number" min="1" max="24" value={tempCodeHours} onChange={e=>setTempCodeHours(Math.min(24,Math.max(1,Number(e.target.value)||1)))} aria-label="Temporary code hours"/><button type="button" onClick={generateTempCode}>Generate</button></div></div>:null}
        {generatedTempCode?<div className="settings-row"><div><strong>Temporary code — copy now</strong><p>This code won’t be shown again. Expires {new Date(generatedTempCode.expiresAt).toLocaleString()}.</p></div><code>{generatedTempCode.code}</code></div>:null}
        {userMethods.map(m=><div className="settings-row" key={m.id}><div><strong>{m.label||m.method_type}</strong><p>{m.method_type}{m.authenticator_kind?` · ${m.authenticator_kind==='PLATFORM'?'built-in authenticator':'physical security key'}`:''}{m.phishing_resistant?' · phishing resistant':''}{m.expires_at?` · expires ${new Date(m.expires_at).toLocaleString()}`:''}{m.last_used_at?` · last used ${new Date(m.last_used_at).toLocaleString()}`:''}</p></div>{m.method_type==='TEMPORARY_CODE'?<button type="button" onClick={expireTempCode}>Expire now</button>:m.active?<button type="button" onClick={async()=>{await guarded(()=>apiRequest(`/api/security/mfa/users/${userId}/methods/${m.id}/disconnect`,{method:'POST',body:'{}'}));await loadMethods(userId);await load()}}>Disconnect</button>:<span>Disconnected</span>}</div>)}
      </section>

      <section className="settings-card">
        <h3 className="font-semibold">Trusted Devices</h3>
        {devices.length?devices.map(d=><div className="settings-row" key={d.id}><div><strong>{d.device_name||d.browser||'Device'}</strong><p>{d.full_name||d.username} · {d.platform||'Unknown'} / {d.browser||'Unknown'} · last IP {d.last_ip||'—'} · trusted until {new Date(d.trusted_until).toLocaleString()}</p></div>{!d.revoked_at?<button type="button" onClick={async()=>{await guarded(()=>apiRequest(`/api/security/trusted-devices/${d.id}/admin-revoke`,{method:'POST',body:'{}'}));await load()}}>Revoke</button>:<span>Revoked</span>}</div>):<p>No trusted devices.</p>}
      </section>
    </>:null}

    {mode==='providers'?<div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
      <section className="settings-card">
        <div className="flex items-center"><strong>Authentication Providers</strong><button type="button" className="ml-auto" onClick={newProvider}>New</button></div>
        {providers.map(p=><button type="button" key={p.id} className={`w-full text-left border-t py-2 ${providerId===p.id?'font-semibold':''}`} onClick={()=>setProviderId(p.id)}><span>{p.name}</span><small className="block text-slate-500">{p.providerType} · {p.enabled?'Enabled':'Disabled'} · {p.assuranceLevel}</small></button>)}
      </section>
      <section className="settings-card">
        <div className="settings-row"><strong>Name</strong><input value={providerDraft.name||''} onChange={e=>setProviderDraft(d=>({...d,name:e.target.value}))}/></div>
        {!providerId?<><div className="settings-row"><strong>Provider key</strong><input value={providerDraft.providerKey||''} onChange={e=>setProviderDraft(d=>({...d,providerKey:e.target.value}))} placeholder="azure-ad"/></div><div className="settings-row"><strong>Type</strong><select value={providerDraft.providerType||'OIDC'} onChange={e=>setProviderDraft(d=>({...d,providerType:e.target.value}))}><option value="OIDC">OpenID Connect</option><option value="SAML">SAML 2.0</option><option value="APPLE">Apple (OIDC)</option><option value="GOOGLE">Google (OIDC)</option></select></div></>:null}
        <div className="settings-row"><div><strong>Enabled</strong><p>Provider can be used to authenticate users.</p></div><Toggle label="Provider enabled" checked={providerDraft.enabled===true} onChange={v=>setProviderDraft(d=>({...d,enabled:v}))}/></div>
        <div className="settings-row"><div><strong>Show on login page</strong><p>Expose the provider as a sign-in option for matching users.</p></div><Toggle label="Show provider on login" checked={providerDraft.showOnLogin!==false} onChange={v=>setProviderDraft(d=>({...d,showOnLogin:v}))}/></div>
        <div className="settings-row"><div><strong>Use OneEngine MFA after SSO</strong><p>Force OneEngine MFA even after the external identity provider authenticates the user.</p></div><Toggle label="Use OneEngine MFA after SSO" checked={providerDraft.useOneEngineMfa===true} onChange={v=>setProviderDraft(d=>({...d,useOneEngineMfa:v}))}/></div>
        <div className="settings-row"><strong>Session assurance</strong><select value={providerDraft.assuranceLevel||'STANDARD'} onChange={e=>setProviderDraft(d=>({...d,assuranceLevel:e.target.value}))}><option value="STANDARD">Standard</option><option value="HIGH">High Assurance</option></select></div>

        {providerDraft.providerType==='SAML'?<>
          <div className="settings-row"><strong>IdP SSO URL / Entry Point</strong><input value={providerDraft.configuration?.entryPoint||''} onChange={e=>setProviderDraft(d=>({...d,configuration:{...d.configuration,entryPoint:e.target.value}}))}/></div>
          <div className="settings-row"><strong>SP Entity ID / Issuer</strong><input value={providerDraft.configuration?.issuer||''} onChange={e=>setProviderDraft(d=>({...d,configuration:{...d.configuration,issuer:e.target.value}}))}/></div>
          <div className="settings-row"><strong>ACS / Callback URL</strong><input value={providerDraft.configuration?.callbackUrl||''} onChange={e=>setProviderDraft(d=>({...d,configuration:{...d.configuration,callbackUrl:e.target.value}}))}/></div>
          <div className="settings-row"><strong>Email attribute</strong><input value={providerDraft.configuration?.emailAttribute||'email'} onChange={e=>setProviderDraft(d=>({...d,configuration:{...d.configuration,emailAttribute:e.target.value}}))}/></div>
          <div className="settings-row"><div><strong>IdP signing certificate</strong><p>PEM certificate used to validate signed SAML assertions/responses.</p></div><textarea rows="6" value={providerDraft.configuration?.idpCert||''} onChange={e=>setProviderDraft(d=>({...d,configuration:{...d.configuration,idpCert:e.target.value}}))}/></div>
          <div className="settings-row"><strong>Require signed assertions</strong><Toggle label="Require signed assertions" checked={providerDraft.configuration?.wantAssertionsSigned!==false} onChange={v=>setProviderDraft(d=>({...d,configuration:{...d.configuration,wantAssertionsSigned:v}}))}/></div>
          <div className="settings-row"><strong>Require signed response</strong><Toggle label="Require signed SAML response" checked={providerDraft.configuration?.wantAuthnResponseSigned===true} onChange={v=>setProviderDraft(d=>({...d,configuration:{...d.configuration,wantAuthnResponseSigned:v}}))}/></div>
        </>:<>
          <div className="settings-row"><strong>Discovery URL</strong><input value={providerDraft.configuration?.discoveryUrl||''} onChange={e=>setProviderDraft(d=>({...d,configuration:{...d.configuration,discoveryUrl:e.target.value}}))}/></div>
          <div className="settings-row"><strong>Authorization endpoint</strong><input value={providerDraft.configuration?.authorizationEndpoint||''} onChange={e=>setProviderDraft(d=>({...d,configuration:{...d.configuration,authorizationEndpoint:e.target.value}}))}/></div>
          <div className="settings-row"><strong>Token endpoint</strong><input value={providerDraft.configuration?.tokenEndpoint||''} onChange={e=>setProviderDraft(d=>({...d,configuration:{...d.configuration,tokenEndpoint:e.target.value}}))}/></div>
          <div className="settings-row"><strong>User Info endpoint</strong><input value={providerDraft.configuration?.userInfoEndpoint||''} onChange={e=>setProviderDraft(d=>({...d,configuration:{...d.configuration,userInfoEndpoint:e.target.value}}))}/></div>
          <div className="settings-row"><strong>Redirect URI</strong><input value={providerDraft.configuration?.redirectUri||''} onChange={e=>setProviderDraft(d=>({...d,configuration:{...d.configuration,redirectUri:e.target.value}}))}/></div>
          <div className="settings-row"><strong>Scopes</strong><input value={(providerDraft.configuration?.scopes||[]).join(' ')} onChange={e=>setProviderDraft(d=>({...d,configuration:{...d.configuration,scopes:e.target.value.split(/\s+/).filter(Boolean)}}))}/></div>
          <div className="settings-row"><strong>Email claim</strong><input value={providerDraft.configuration?.emailClaim||'email'} onChange={e=>setProviderDraft(d=>({...d,configuration:{...d.configuration,emailClaim:e.target.value}}))}/></div>
          <div className="settings-row"><strong>Use PKCE</strong><Toggle label="Use PKCE" checked={providerDraft.configuration?.usePkce!==false} onChange={v=>setProviderDraft(d=>({...d,configuration:{...d.configuration,usePkce:v}}))}/></div>
          <div className="settings-row"><strong>Require verified email</strong><Toggle label="Require verified email" checked={providerDraft.configuration?.requireEmailVerified!==false} onChange={v=>setProviderDraft(d=>({...d,configuration:{...d.configuration,requireEmailVerified:v}}))}/></div>
          <div className="settings-row"><strong>Client ID</strong><input value={providerDraft.credentials?.clientId||''} onChange={e=>setProviderDraft(d=>({...d,credentials:{...d.credentials,clientId:e.target.value}}))} placeholder={providerDraft.hasCredentials?'Leave blank to keep saved credential':''}/></div>
          <div className="settings-row"><strong>Client Secret</strong><input type="password" value={providerDraft.credentials?.clientSecret||''} onChange={e=>setProviderDraft(d=>({...d,credentials:{...d.credentials,clientSecret:e.target.value}}))} placeholder={providerDraft.hasCredentials?'Leave blank to keep saved credential':''}/></div>
        </>}

        <div className="metadata-settings-form-actions">
          {providerId?<button type="button" onClick={testProvider} disabled={busy}>Test</button>:null}
          {providerId?<button type="button" className="is-danger" onClick={removeProvider} disabled={busy}>Delete</button>:null}
          <button type="button" className="is-primary" onClick={saveProvider} disabled={busy}>{busy?'Saving…':providerId?'Save provider':'Create provider'}</button>
        </div>
      </section>
    </div>:null}

    {stepUp?.required?<div className="record-dialog-backdrop"><section className="record-dialog">
      <div className="record-dialog-header"><div><strong>Additional verification required</strong><span>{stepUp.resourceKey}</span></div></div>
      <div className="record-dialog-body">
        {stepUp.availableMethods?.some(x=>x.type==='PASSKEY')?<button type="button" className="login-submit" onClick={()=>completeStep('PASSKEY')} disabled={busy}>Verify with passkey</button>:null}
        {stepUp.availableMethods?.some(x=>x.type==='TOTP')?<><label>Authenticator code<input value={stepCode} onChange={e=>setStepCode(e.target.value.replace(/\D/g,'').slice(0,6))}/></label><button type="button" className="login-submit" onClick={()=>completeStep('TOTP')} disabled={busy||stepCode.length!==6}>Verify</button></>:null}
        {stepUp.enrollmentRequired&&stepUp.allowedEnrollmentMethods?.includes('PLATFORM_PASSKEY')?<button type="button" onClick={()=>registerStepPasskey('PLATFORM')} disabled={busy}>Set up built-in passkey</button>:null}
        {stepUp.enrollmentRequired&&stepUp.allowedEnrollmentMethods?.includes('SECURITY_KEY')?<button type="button" onClick={()=>registerStepPasskey('SECURITY_KEY')} disabled={busy}>Set up physical security key</button>:null}
      </div>
      <div className="record-dialog-footer"><button type="button" onClick={()=>{setStepUp(null);setPendingAction(null);setStepCode('')}}>Cancel</button></div>
    </section></div>:null}
  </div>
}
