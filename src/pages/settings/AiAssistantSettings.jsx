import { useEffect, useState } from 'react'
import { apiRequest } from '../../services/api'

export default function AiAssistantSettings() {
  const [state, setState] = useState(null)
  const [permissions, setPermissions] = useState([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [allowance, setAllowance] = useState('0')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = async () => {
    try {
      setLoading(true)
      setError('')
      const [licence, permissionResponse] = await Promise.all([
        apiRequest('/api/settings/jarves').catch(() => null),
        apiRequest('/api/auth/me/permissions').catch(() => null),
      ])
      if (licence?.success) {
        setState(licence.data || null)
        setAllowance(String(licence.data?.allowance ?? 0))
      } else {
        setState(null)
      }
      if (permissionResponse?.success) {
        setPermissions(permissionResponse.data?.permissions || [])
        setIsAdmin(permissionResponse.data?.isAdmin === true)
      }
    } catch (err) {
      setError(err?.message || 'Unable to load JARVES licence state')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const canManage = isAdmin || permissions.includes('settings.manage')

  const save = async () => {
    const next = Number.parseInt(allowance, 10)
    if (!Number.isFinite(next) || next < 0 || next > 10000) {
      setError('Licence allowance must be a whole number from 0 to 10000.')
      return
    }
    try {
      setSaving(true)
      setError('')
      setMessage('')
      const response = await apiRequest('/api/settings/jarves', {
        method: 'PUT',
        body: JSON.stringify({ allowance: next }),
      })
      setState(response?.data || state)
      setAllowance(String(response?.data?.allowance ?? next))
      setMessage('JARVES licence allowance saved.')
    } catch (err) {
      setError(err?.message || 'Unable to save JARVES licence')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="settings-state-card">Loading JARVES licence state…</div>
  if (!state) return <div className="settings-state-card">You do not have permission to view the JARVES licence state.</div>

  return (
    <div>
      {error ? <div className="settings-error">{error}</div> : null}
      {message ? <div className="settings-success">{message}</div> : null}

      <div className="settings-row">
        <div><strong>Company licence allowance</strong><p>Enable JARVES per user from Users. Enabled users can never exceed this allowance.</p></div>
        <span className="settings-value">{state.enabledUsers ?? 0} / {state.allowance ?? 0}</span>
      </div>
      <div className="settings-row">
        <strong>Seats remaining</strong>
        <span className="settings-value">{state.seatsRemaining ?? 0}</span>
      </div>
      {canManage ? (
        <div className="settings-row">
          <div><strong>Licence allowance</strong><p>Lowering below the number already enabled is refused by the server.</p></div>
          <div className="settings-inline-actions">
            <input type="number" min="0" max="10000" value={allowance} onChange={(event) => setAllowance(event.target.value)} aria-label="JARVES licence allowance" />
            <button type="button" className="settings-secondary-button" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
