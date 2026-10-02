import { useEffect, useState } from 'react'
import { ChevronLeft, UserRound } from 'lucide-react'
import { apiRequest } from '../../services/api'

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
          {mfaMethods.map((method)=><div className="profile-field-row" key={method.id}><span>{method.label||method.type||method.method_type}</span><button type="button" onClick={async()=>{try{await apiRequest(`/api/security/mfa/methods/${method.id}/disconnect`,{method:'POST',body:'{}'});const r=await apiRequest('/api/security/mfa/methods');setMfaMethods(r.data||[])}catch(e){setError(e.message||'Unable to disconnect method')}}}>Disconnect</button></div>)}
          <div className="profile-field-row"><span>Trusted devices</span><strong>{trustedDevices.filter(d=>!d.revoked_at).length}</strong></div>
          {trustedDevices.filter(d=>!d.revoked_at).map((device)=><div className="profile-field-row" key={device.id}><span>{device.device_name||device.browser||'Device'}</span><button type="button" onClick={async()=>{try{await apiRequest(`/api/security/trusted-devices/${device.id}/revoke`,{method:'POST',body:'{}'});const r=await apiRequest('/api/security/trusted-devices');setTrustedDevices(r.data||[])}catch(e){setError(e.message||'Unable to revoke trusted device')}}}>Revoke</button></div>)}
        </div>
      </div>
    ) : <div className="profile-state">Your user record is not available.</div>}
  </section>
}
