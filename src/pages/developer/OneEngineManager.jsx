import { useEffect, useMemo, useState } from 'react'
import { BadgeCheck, ChevronRight, Search } from 'lucide-react'
import { apiRequest, getStoredSessionPermissions, loadSessionPermissions, getActingCompanyId, setActingCompanyId } from '../../services/api'
import { clearSettingsContextCache } from '../../services/settings'
import MetadataSettingsPage from '../settings/MetadataSettingsPage'

export default function OneEngineManager() {
  const [clients, setClients] = useState([])
  const [selected, setSelected] = useState(() => getActingCompanyId() || '')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const chooseClient = async (id) => {
    if (!id) return
    try {
      setError('')
      await apiRequest('/api/platform/developer/acting-company', { method: 'PUT', body: JSON.stringify({ actingCompanyId: id }) })
      setActingCompanyId(id)
      clearSettingsContextCache()
      setSelected(id)
    } catch (err) {
      setError(err?.message || 'Unable to select client')
    }
  }

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        setLoading(true)
        setError('')
        const cached = getStoredSessionPermissions()
        const [permissions, response] = await Promise.all([
          cached ? Promise.resolve(cached) : loadSessionPermissions(),
          apiRequest('/api/platform/developer/companies'),
        ])
        if (!permissions?.permissions?.includes('oneengine.manage')) throw new Error('OneEngine management permission required')
        const rows = Array.isArray(response?.data) ? response.data : []
        if (!live) return
        setClients(rows)
        if (!rows.some((row) => String(row.id) === String(selected)) && rows[0]) await chooseClient(rows[0].id)
      } catch (err) {
        if (live) setError(err?.message || 'Unable to load clients')
      } finally {
        if (live) setLoading(false)
      }
    })()
    return () => { live = false }
  }, [])

  const selectedClient = clients.find((row) => String(row.id) === String(selected))
  const visible = useMemo(() => clients.filter((row) => !query.trim() || String(row.name || '').toLowerCase().includes(query.trim().toLowerCase())), [clients, query])

  return <div className="oneengine-manager-shell">
    <aside className="oneengine-client-pane">
      <div className="oneengine-pane-title">Clients</div>
      <label className="settings-search"><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search clients"/></label>
      {loading ? <div className="settings-state-card">Loading clients…</div> : null}
      <div className="oneengine-client-list">{visible.map((client) => <button key={client.id} type="button" className={String(client.id) === String(selected) ? 'is-active' : ''} onClick={() => chooseClient(client.id)}><span><strong>{client.name}</strong><small>{String(client.id).slice(0, 8)}</small></span><ChevronRight size={14}/></button>)}</div>
    </aside>
    <section className="oneengine-manager-main">
      <div className="oneengine-context-banner"><span>Editing client</span><strong>{selectedClient?.name || 'Select a client'}</strong>{selected ? <BadgeCheck size={16}/> : null}</div>
      {error ? <div className="settings-error">{error}</div> : null}
      {selected ? <MetadataSettingsPage key={selected} /> : <div className="settings-state-card">Select a client.</div>}
    </section>
  </div>
}
