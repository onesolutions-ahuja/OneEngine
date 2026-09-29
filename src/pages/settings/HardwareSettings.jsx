import { useEffect, useMemo, useState } from 'react'
import { apiRequest } from '../../services/api'

const DEFINITIONS = [
  ['BARCODE_SCANNER', 'Barcode Scanner'],
  ['CASH_DRAWER', 'Cash Drawer'],
  ['RECEIPT_PRINTER', 'Receipt Printer'],
]

function blank(type) {
  return {
    deviceType: type,
    deviceName: '',
    connectionType: '',
    connectionAddress: '',
    paperWidth: '',
    active: false,
  }
}

export default function HardwareSettings() {
  const [hardware, setHardware] = useState([])
  const [forms, setForms] = useState({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [scan, setScan] = useState('')
  const [scanTime, setScanTime] = useState('')

  const load = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await apiRequest('/api/hardware')
      const rows = Array.isArray(response?.data) ? response.data : []
      setHardware(rows)
      setForms(Object.fromEntries(DEFINITIONS.map(([type]) => {
        const current = rows.find((device) => device.device_type === type)
        return [type, current ? {
          deviceType: type,
          deviceName: current.device_name || '',
          connectionType: current.connection_type || '',
          connectionAddress: current.connection_address || '',
          paperWidth: current.paper_width || '',
          active: current.active === true,
        } : blank(type)]
      })))
    } catch (err) {
      setError(err?.message || 'Unable to load hardware')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  useEffect(() => {
    let value = ''
    let timer
    const handler = (event) => {
      if (event.key === 'Enter') {
        if (value) {
          setScan(value)
          setScanTime(new Date().toLocaleString())
        }
        value = ''
        return
      }
      if (event.key.length === 1) {
        value += event.key
        clearTimeout(timer)
        timer = setTimeout(() => { value = '' }, 100)
      }
    }
    window.addEventListener('keydown', handler)
    return () => {
      window.removeEventListener('keydown', handler)
      clearTimeout(timer)
    }
  }, [])

  const updateForm = (type, patch) => setForms((current) => ({
    ...current,
    [type]: { ...(current[type] || blank(type)), ...patch },
  }))

  const save = async (type) => {
    try {
      setBusy(`save:${type}`)
      setError('')
      setMessage('')
      await apiRequest('/api/hardware', {
        method: 'PUT',
        body: JSON.stringify(forms[type] || blank(type)),
      })
      setMessage('Hardware configuration saved.')
      await load()
    } catch (err) {
      setError(err?.message || 'Unable to save hardware')
    } finally {
      setBusy('')
    }
  }

  const test = async (type) => {
    try {
      setBusy(`test:${type}`)
      setError('')
      setMessage('')
      const response = await apiRequest(`/api/hardware/${type}/test`, { method: 'POST' })
      setMessage(response?.data?.message || response?.message || 'Hardware test completed.')
      await load()
    } catch (err) {
      setError(err?.message || 'Unable to test hardware')
    } finally {
      setBusy('')
    }
  }

  const byType = useMemo(() => Object.fromEntries(hardware.map((device) => [device.device_type, device])), [hardware])

  if (loading) return <div className="settings-state-card">Loading hardware…</div>

  return (
    <div>
      {error ? <div className="settings-error">{error}</div> : null}
      {message ? <div className="settings-success">{message}</div> : null}

      {DEFINITIONS.map(([type, label]) => {
        const current = byType[type] || {}
        const form = forms[type] || blank(type)
        const scanner = type === 'BARCODE_SCANNER'
        const printer = type === 'RECEIPT_PRINTER'
        const testLabel = type === 'CASH_DRAWER' ? 'Test Open Drawer' : printer ? 'Test Print' : 'Test Scanner'

        return (
          <div key={type}>
            <div className="settings-row">
              <div>
                <strong>{label}</strong>
                <p>{current.last_test_result || (current.active ? 'Configured' : 'Not configured')}</p>
              </div>
              <span className="settings-value">{current.active ? 'Active' : 'Inactive'}</span>
            </div>
            <div className="settings-row">
              <label>Device name</label>
              <input value={form.deviceName} onChange={(event) => updateForm(type, { deviceName: event.target.value })} />
            </div>
            <div className="settings-row">
              <label>{type === 'CASH_DRAWER' ? 'Connection' : 'Mode'}</label>
              <select value={form.connectionType} onChange={(event) => updateForm(type, { connectionType: event.target.value })}>
                <option value="">Not configured</option>
                <option>Keyboard / HID</option>
                <option>Local service</option>
                <option>Network</option>
                <option>USB / Serial</option>
              </select>
            </div>
            <div className="settings-row">
              <label>Connection address</label>
              <input value={form.connectionAddress} onChange={(event) => updateForm(type, { connectionAddress: event.target.value })} />
            </div>
            {printer ? (
              <div className="settings-row">
                <label>Paper width</label>
                <select value={form.paperWidth} onChange={(event) => updateForm(type, { paperWidth: event.target.value })}>
                  <option value="">Not set</option>
                  <option>58mm</option>
                  <option>80mm</option>
                </select>
              </div>
            ) : null}
            {scanner ? (
              <div className="settings-row">
                <div><strong>Scanner test area</strong><p>Last scanned barcode: {scan || '—'} · {scanTime || 'Waiting for keyboard/HID scan'}</p></div>
                <span className="settings-value">{scan ? 'Scan received' : 'Waiting'}</span>
              </div>
            ) : null}
            <div className="settings-row">
              <strong>Configured and active</strong>
              <button type="button" className={`mac-switch ${form.active ? 'is-on' : ''}`} onClick={() => updateForm(type, { active: !form.active })}><span /></button>
            </div>
            <div className="settings-row">
              <div><strong>Hardware actions</strong><p>Save configuration or run the existing device test.</p></div>
              <div className="settings-inline-actions">
                <button type="button" className="settings-secondary-button" disabled={busy === `save:${type}`} onClick={() => save(type)}>
                  {busy === `save:${type}` ? 'Saving…' : 'Save configuration'}
                </button>
                <button type="button" className="settings-secondary-button" disabled={busy === `test:${type}`} onClick={() => test(type)}>
                  {busy === `test:${type}` ? 'Testing…' : testLabel}
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
