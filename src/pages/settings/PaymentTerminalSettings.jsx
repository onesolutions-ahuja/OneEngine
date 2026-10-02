import { useEffect, useState } from 'react'
import { apiRequest } from '../../services/api'

const EMPTY = {
  id: '',
  provider: '',
  name: '',
  terminalIdentifier: '',
  connectionUrl: '',
  apiCredentials: '',
  hasCredentials: false,
  active: true,
}

export default function PaymentTerminalSettings() {
  const [terminals, setTerminals] = useState([])
  const [form, setForm] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await apiRequest('/api/payment-terminals')
      setTerminals(Array.isArray(response?.data) ? response.data : [])
    } catch (err) {
      setError(err?.message || 'Unable to load payment terminals')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const beginCreate = () => setForm(EMPTY)
  const beginEdit = (terminal) => setForm({
    id: terminal.id,
    provider: terminal.provider || '',
    name: terminal.name || '',
    terminalIdentifier: terminal.terminal_identifier || '',
    connectionUrl: terminal.connection_url || '',
    apiCredentials: '',
    hasCredentials: terminal.has_credentials === true,
    linkedToThisDevice: terminal.linked_to_this_device === true,
    unassigned: terminal.unassigned === true,
    active: terminal.active !== false,
  })

  const save = async (event) => {
    event?.preventDefault()
    if (!form.provider.trim() || !form.name.trim() || !form.terminalIdentifier.trim()) {
      setError('Provider, terminal name and terminal ID are required.')
      return
    }
    try {
      setSaving(true)
      setError('')
      setMessage('')
      await apiRequest(form.id ? `/api/payment-terminals/${form.id}` : '/api/payment-terminals', {
        method: form.id ? 'PUT' : 'POST',
        body: JSON.stringify({
          provider: form.provider.trim(),
          name: form.name.trim(),
          terminalIdentifier: form.terminalIdentifier.trim(),
          connectionUrl: form.connectionUrl.trim() || null,
          apiCredentials: form.apiCredentials || undefined,
          active: form.active !== false,
          linkToThisDevice: form.id ? form.linkedToThisDevice === true : true,
        }),
      })
      setMessage('Payment terminal saved.')
      setForm(EMPTY)
      await load()
    } catch (err) {
      setError(err?.message || 'Unable to save payment terminal')
    } finally {
      setSaving(false)
    }
  }

  const test = async (terminal) => {
    try {
      setTesting(terminal.id)
      setError('')
      setMessage('')
      const response = await apiRequest(`/api/payment-terminals/${terminal.id}/test`, { method: 'POST' })
      setMessage(response?.data?.message || response?.message || 'Connection test completed.')
      await load()
    } catch (err) {
      setError(err?.message || 'Unable to test payment terminal')
    } finally {
      setTesting('')
    }
  }

  if (loading) return <div className="settings-state-card">Loading payment terminals…</div>

  return (
    <div>
      {error ? <div className="settings-error">{error}</div> : null}
      {message ? <div className="settings-success">{message}</div> : null}

      <div className="settings-row">
        <div><strong>Configured terminals</strong><p>{terminals.filter((terminal) => terminal.active !== false).length} active of {terminals.length} configured.</p></div>
        <button type="button" className="settings-secondary-button" onClick={beginCreate}>Add terminal</button>
      </div>

      {terminals.map((terminal) => (
        <div className="settings-row" key={terminal.id}>
          <div>
            <strong>{terminal.name}</strong>
            <p>{terminal.provider}{terminal.terminal_identifier ? ` · ${terminal.terminal_identifier}` : ''}{terminal.has_credentials ? ' · credentials configured' : ''}</p>
          </div>
          <div className="settings-inline-actions">
            <span className="settings-value">{terminal.linked_to_this_device ? 'Linked to this device' : terminal.unassigned ? 'Not linked yet' : 'Linked elsewhere'}</span>
            <span className="settings-value">{terminal.active !== false ? 'Active' : 'Inactive'}</span>
            <button type="button" className="settings-secondary-button" onClick={() => beginEdit(terminal)}>Edit</button>
            <button type="button" className="settings-secondary-button" disabled={testing === terminal.id} onClick={() => test(terminal)}>
              {testing === terminal.id ? 'Testing…' : 'Test Connection'}
            </button>
          </div>
        </div>
      ))}

      {!terminals.length ? <div className="settings-row"><span className="settings-value">No payment terminals configured yet.</span></div> : null}

      <form onSubmit={save}>
        <div className="settings-row">
          <div><strong>{form.id ? 'Edit terminal' : 'Add terminal'}</strong><p>Credentials are stored securely on the server and are never shown again.</p></div>
          <span className="settings-value">{form.id ? form.name || 'Selected terminal' : 'New terminal'}</span>
        </div>
        <div className="settings-row">
          <label>Provider</label>
          <input required value={form.provider} onChange={(event) => setForm((current) => ({ ...current, provider: event.target.value }))} />
        </div>
        <div className="settings-row">
          <label>Terminal name</label>
          <input required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
        </div>
        <div className="settings-row">
          <label>Terminal ID</label>
          <input required value={form.terminalIdentifier} onChange={(event) => setForm((current) => ({ ...current, terminalIdentifier: event.target.value }))} />
        </div>
        <div className="settings-row">
          <label>Connection / API URL</label>
          <input value={form.connectionUrl} onChange={(event) => setForm((current) => ({ ...current, connectionUrl: event.target.value }))} />
        </div>
        <div className="settings-row">
          <div><strong>API credentials</strong><p>{form.hasCredentials ? 'Leave blank to keep existing credentials.' : 'Enter provider credentials if required.'}</p></div>
          <input type="password" value={form.apiCredentials} onChange={(event) => setForm((current) => ({ ...current, apiCredentials: event.target.value }))} />
        </div>
        {form.id ? (
          <div className="settings-row">
            <div><strong>Workstation assignment</strong><p>{form.linkedToThisDevice ? 'This terminal is linked to this workstation.' : 'Linking prevents this terminal appearing on other workstations.'}</p></div>
            <button type="button" className="settings-secondary-button" disabled={form.linkedToThisDevice} onClick={() => setForm((current) => ({ ...current, linkedToThisDevice: true }))}>{form.linkedToThisDevice ? 'Linked' : 'Link to this device'}</button>
          </div>
        ) : null}
        <div className="settings-row">
          <strong>Active</strong>
          <button type="button" className={`mac-switch ${form.active ? 'is-on' : ''}`} onClick={() => setForm((current) => ({ ...current, active: !current.active }))}><span /></button>
        </div>
        <div className="settings-row">
          <div><strong>Save terminal</strong><p>Create or update this terminal configuration.</p></div>
          <div className="settings-inline-actions">
            {form.id ? <button type="button" className="settings-secondary-button" onClick={beginCreate}>Cancel edit</button> : null}
            <button type="submit" className="settings-secondary-button" disabled={saving}>{saving ? 'Saving…' : 'Save terminal'}</button>
          </div>
        </div>
      </form>
    </div>
  )
}
