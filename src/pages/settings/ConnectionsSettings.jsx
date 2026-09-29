import { useEffect, useState } from 'react'
import { apiRequest } from '../../services/api'

export default function ConnectionsSettings() {
  const [health, setHealth] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await apiRequest('/api/health/integrations')
      setHealth(response?.data || {})
    } catch (err) {
      setError(err?.message || 'Unable to load integration health')
      setHealth({})
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  if (loading) return <div className="settings-state-card">Loading connection health…</div>

  const entries = Object.entries(health || {})

  return (
    <div>
      {error ? <div className="settings-error">{error}</div> : null}
      <div className="settings-row">
        <div><strong>Connection health</strong><p>Current device and integration state reported by the server.</p></div>
        <button type="button" className="settings-secondary-button" onClick={load}>Refresh</button>
      </div>
      {entries.map(([name, value]) => (
        <div className="settings-row" key={name}>
          <strong>{name.replace(/([A-Z])/g, ' $1').replace(/^ /, '')}</strong>
          <span className="settings-value">{String(value)}</span>
        </div>
      ))}
      {!entries.length ? <div className="settings-row"><span className="settings-value">No integration health reported.</span></div> : null}
    </div>
  )
}
