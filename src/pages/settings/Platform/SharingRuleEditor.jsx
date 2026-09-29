import { useEffect, useMemo, useState } from 'react'
import { apiRequest } from '../../../services/api'

const EMPTY_CONDITION = { field: '', operator: 'equals', value: '' }

function normalizeCriteria(value) {
  const conditions = Array.isArray(value?.conditions) ? value.conditions : []
  return { match: value?.match === 'any' ? 'any' : 'all', conditions: conditions.length ? conditions : [{ ...EMPTY_CONDITION }] }
}

export default function SharingRuleEditor({ object, fields = [], rule = null, onSaved, onCancel, onError }) {
  const [principals, setPrincipals] = useState({ users: [], roles: [], groups: [] })
  const [queues, setQueues] = useState([])
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(() => ({
    name: rule?.name || '',
    ruleKey: rule?.rule_key || rule?.ruleKey || '',
    ruleType: rule?.rule_type || rule?.ruleType || 'criteria',
    sourceOwnerType: rule?.source_owner_type || rule?.sourceOwnerType || 'ANY',
    sourceOwnerId: rule?.source_owner_id || rule?.sourceOwnerId || '',
    targetType: rule?.target_type || rule?.targetType || 'ROLE',
    targetId: rule?.target_id || rule?.targetId || '',
    accessLevel: rule?.access_level || rule?.accessLevel || 'READ',
    executionOrder: Number(rule?.execution_order ?? 100),
    active: rule?.active !== false,
    criteria: normalizeCriteria(rule?.criteria),
  }))

  useEffect(() => {
    Promise.all([
      apiRequest('/api/platform/security/principals').catch(() => ({ data: {} })),
      apiRequest('/api/platform/security/queues').catch(() => ({ data: [] })),
    ]).then(([principalResponse, queueResponse]) => {
      setPrincipals(principalResponse?.data || { users: [], roles: [], groups: [] })
      setQueues(Array.isArray(queueResponse?.data) ? queueResponse.data : [])
    })
  }, [])

  const optionsFor = (type) => {
    if (type === 'USER') return principals.users || []
    if (type === 'ROLE') return principals.roles || []
    if (type === 'GROUP') return principals.groups || []
    if (type === 'QUEUE') return queues
    return []
  }
  const sourceOptions = useMemo(() => optionsFor(form.sourceOwnerType), [form.sourceOwnerType, principals, queues])
  const targetOptions = useMemo(() => optionsFor(form.targetType), [form.targetType, principals, queues])

  const patchCondition = (index, patch) => setForm((current) => ({
    ...current,
    criteria: { ...current.criteria, conditions: current.criteria.conditions.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) },
  }))

  const save = async () => {
    if (!form.name.trim()) return onError?.('Enter a Sharing Rule name.')
    if (!form.targetId) return onError?.('Choose who receives access.')
    if (form.ruleType === 'owner' && form.sourceOwnerType !== 'ANY' && !form.sourceOwnerId) return onError?.('Choose the source owner.')

    setSaving(true)
    onError?.('')
    try {
      const payload = {
        ...form,
        ruleKey: form.ruleKey || form.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
        criteria: {
          match: form.criteria.match,
          conditions: form.criteria.conditions.filter((item) => item.field),
        },
      }
      const response = await apiRequest(
        rule?.id
          ? `/api/platform/security/sharing-rules/${encodeURIComponent(rule.id)}`
          : `/api/platform/security/objects/${encodeURIComponent(object.id)}/sharing-rules`,
        { method: rule?.id ? 'PUT' : 'POST', body: JSON.stringify(payload) },
      )
      if (response?.success === false) throw new Error(response?.message || 'Unable to save Sharing Rule')
      onSaved?.(response.data)
    } catch (error) {
      onError?.(error?.message || 'Unable to save Sharing Rule')
    } finally {
      setSaving(false)
    }
  }

  const deactivate = async () => {
    if (!rule?.id) return
    setSaving(true)
    try {
      await apiRequest(`/api/platform/security/sharing-rules/${encodeURIComponent(rule.id)}`, { method: 'DELETE' })
      onSaved?.(null)
    } catch (error) {
      onError?.(error?.message || 'Unable to deactivate Sharing Rule')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="objects-rule-editor">
      <div className="objects-rule-editor-head">
        <div><strong>{rule?.id ? 'Edit Sharing Rule' : 'New Sharing Rule'}</strong><span>{object?.label || object?.name || object?.object_key}</span></div>
        <div className="objects-rule-editor-actions">
          {rule?.id ? <button type="button" className="objects-rule-danger" disabled={saving} onClick={deactivate}>Deactivate</button> : null}
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" className="objects-rule-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>

      <div className="objects-rule-grid">
        <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}/></label>
        <label>API key<input value={form.ruleKey} onChange={(e) => setForm({ ...form, ruleKey: e.target.value })} placeholder="Auto from name"/></label>
        <label>Rule type<select value={form.ruleType} onChange={(e) => setForm({ ...form, ruleType: e.target.value })}><option value="criteria">Criteria based</option><option value="owner">Owner based</option></select></label>
        <label>Access<select value={form.accessLevel} onChange={(e) => setForm({ ...form, accessLevel: e.target.value })}><option value="READ">Read</option><option value="READ_WRITE">Read / Write</option></select></label>
        <label>Target type<select value={form.targetType} onChange={(e) => setForm({ ...form, targetType: e.target.value, targetId: '' })}><option value="USER">User</option><option value="ROLE">Role</option><option value="GROUP">Public Group</option><option value="QUEUE">Queue</option></select></label>
        <label>Share with<select value={form.targetId} onChange={(e) => setForm({ ...form, targetId: e.target.value })}><option value="">Select target</option>{targetOptions.map((item) => <option key={item.id} value={item.id}>{item.full_name || item.username || item.name || item.label}</option>)}</select></label>
        <label>Execution order<input type="number" value={form.executionOrder} onChange={(e) => setForm({ ...form, executionOrder: Number(e.target.value || 100) })}/></label>
        <label className="objects-rule-toggle"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })}/> Active</label>
      </div>

      {form.ruleType === 'owner' ? (
        <div className="objects-rule-grid">
          <label>Source owner type<select value={form.sourceOwnerType} onChange={(e) => setForm({ ...form, sourceOwnerType: e.target.value, sourceOwnerId: '' })}><option value="ANY">Any owner</option><option value="USER">User</option><option value="ROLE">Role</option><option value="GROUP">Public Group</option><option value="QUEUE">Queue</option></select></label>
          {form.sourceOwnerType !== 'ANY' ? <label>Source owner<select value={form.sourceOwnerId} onChange={(e) => setForm({ ...form, sourceOwnerId: e.target.value })}><option value="">Select source</option>{sourceOptions.map((item) => <option key={item.id} value={item.id}>{item.full_name || item.username || item.name || item.label}</option>)}</select></label> : null}
        </div>
      ) : (
        <div className="objects-rule-conditions">
          <div className="objects-config-list-head">
            <strong>Criteria</strong>
            <div>
              <select value={form.criteria.match} onChange={(e) => setForm({ ...form, criteria: { ...form.criteria, match: e.target.value } })}><option value="all">Match all</option><option value="any">Match any</option></select>
              <button type="button" onClick={() => setForm((current) => ({ ...current, criteria: { ...current.criteria, conditions: [...current.criteria.conditions, { ...EMPTY_CONDITION }] } }))}>+ Condition</button>
            </div>
          </div>
          {form.criteria.conditions.map((condition, index) => (
            <div className="objects-rule-condition" key={index}>
              <select value={condition.field} onChange={(e) => patchCondition(index, { field: e.target.value })}><option value="">Field</option>{fields.map((field) => <option key={field.id || field.api_name} value={field.api_name}>{field.label || field.api_name}</option>)}</select>
              <select value={condition.operator} onChange={(e) => patchCondition(index, { operator: e.target.value })}>{['equals','not_equals','greater_than','greater_than_or_equal','less_than','less_than_or_equal','is_empty','is_not_empty'].map((operator) => <option key={operator} value={operator}>{operator}</option>)}</select>
              <input value={condition.value ?? ''} disabled={['is_empty','is_not_empty'].includes(condition.operator)} onChange={(e) => patchCondition(index, { value: e.target.value })} placeholder="Value"/>
              <button type="button" onClick={() => setForm((current) => ({ ...current, criteria: { ...current.criteria, conditions: current.criteria.conditions.filter((_, itemIndex) => itemIndex !== index) } }))}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
