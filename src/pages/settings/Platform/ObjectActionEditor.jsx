import { useEffect, useMemo, useState } from 'react'
import { apiRequest } from '../../../services/api'

export default function ObjectActionEditor({ object, action = null, onSaved, onCancel, onError }) {
  const [registry, setRegistry] = useState([])
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(() => ({
    label: action?.label || '',
    actionKey: action?.action_key || '',
    description: action?.description || '',
    handlerKey: action?.handler_key || '',
    requiredPermission: action?.required_permission || '',
    active: action?.active !== false,
  }))

  useEffect(() => {
    apiRequest('/api/platform/action-registry')
      .then((response) => setRegistry(Array.isArray(response?.data) ? response.data : []))
      .catch((error) => onError?.(error?.message || 'Unable to load action handlers'))
  }, [onError])

  const handlerOptions = useMemo(() => registry.filter((item) => item?.key), [registry])

  const save = async () => {
    if (!form.label.trim()) return onError?.('Enter an action label.')
    if (!form.handlerKey) return onError?.('Choose an action handler.')

    setSaving(true)
    onError?.('')
    try {
      const payload = {
        ...form,
        actionKey: form.actionKey || form.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
      }
      const url = action?.id
        ? `/api/platform/objects/${encodeURIComponent(object.id)}/registered-actions/${encodeURIComponent(action.id)}`
        : `/api/platform/objects/${encodeURIComponent(object.id)}/registered-actions`
      const response = await apiRequest(url, {
        method: action?.id ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      })
      if (response?.success === false) throw new Error(response?.message || 'Unable to save action')
      onSaved?.(response.data)
    } catch (error) {
      onError?.(error?.message || 'Unable to save action')
    } finally {
      setSaving(false)
    }
  }

  const deactivate = async () => {
    if (!action?.id) return
    setSaving(true)
    try {
      await apiRequest(
        `/api/platform/objects/${encodeURIComponent(object.id)}/registered-actions/${encodeURIComponent(action.id)}`,
        { method: 'DELETE' },
      )
      onSaved?.(null)
    } catch (error) {
      onError?.(error?.message || 'Unable to deactivate action')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="objects-rule-editor">
      <div className="objects-rule-editor-head">
        <div>
          <strong>{action?.id ? 'Edit Object Action' : 'New Object Action'}</strong>
          <span>{object?.label || object?.name || object?.object_key}</span>
        </div>
        <div className="objects-rule-editor-actions">
          {action?.id ? <button type="button" className="objects-rule-danger" disabled={saving} onClick={deactivate}>Deactivate</button> : null}
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" className="objects-rule-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>

      <div className="objects-rule-grid">
        <label>Label<input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })}/></label>
        <label>API key<input value={form.actionKey} onChange={(e) => setForm({ ...form, actionKey: e.target.value })} placeholder="Auto from label"/></label>
        <label>Handler<select value={form.handlerKey} onChange={(e) => setForm({ ...form, handlerKey: e.target.value })}>
          <option value="">Select handler</option>
          {handlerOptions.map((item) => <option key={item.key} value={item.key}>{item.displayName || item.label || item.key}</option>)}
        </select></label>
        <label>Required permission<input value={form.requiredPermission} onChange={(e) => setForm({ ...form, requiredPermission: e.target.value })} placeholder="Optional"/></label>
        <label className="objects-rule-toggle"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })}/> Active</label>
      </div>

      <label className="objects-rule-description">
        Description
        <textarea rows="3" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}/>
      </label>
    </div>
  )
}
