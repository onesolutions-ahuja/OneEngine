import { useEffect, useMemo, useState } from 'react'
import { apiRequest } from '../../../services/api'

const EMPTY_CONDITION = { field: '', operator: 'equals', value: '' }

function normalizeConditions(value) {
  const conditions = Array.isArray(value?.conditions) ? value.conditions : []
  return {
    match: value?.match === 'any' ? 'any' : 'all',
    conditions: conditions.length ? conditions : [{ ...EMPTY_CONDITION }],
  }
}

export default function AssignmentRuleEditor({ object, fields = [], rule = null, onSaved, onCancel, onError }) {
  const [principals, setPrincipals] = useState({ users: [], roles: [], groups: [] })
  const [queues, setQueues] = useState([])
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(() => ({
    name: rule?.name || '',
    ruleKey: rule?.rule_key || rule?.ruleKey || '',
    targetType: rule?.target_type || rule?.targetType || 'USER',
    targetId: rule?.target_id || rule?.targetId || '',
    assignmentField: rule?.assignment_field || rule?.assignmentField || 'assigned_to',
    priority: Number(rule?.priority ?? 0),
    active: rule?.active !== false,
    conditions: normalizeConditions(rule?.conditions),
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

  const targetOptions = useMemo(() => {
    if (form.targetType === 'USER') return principals.users || []
    if (form.targetType === 'ROLE') return principals.roles || []
    return queues
  }, [form.targetType, principals, queues])

  const patchCondition = (index, patch) => {
    setForm((current) => ({
      ...current,
      conditions: {
        ...current.conditions,
        conditions: current.conditions.conditions.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
      },
    }))
  }

  const save = async () => {
    if (!form.name.trim()) return onError?.('Enter an Assignment Rule name.')
    if (!form.targetId) return onError?.('Choose an assignment target.')
    if (!form.assignmentField) return onError?.('Choose the assignment field.')

    setSaving(true)
    onError?.('')
    try {
      const payload = {
        ...form,
        ruleKey: form.ruleKey || form.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
        conditions: {
          match: form.conditions.match,
          conditions: form.conditions.conditions.filter((item) => item.field),
        },
      }
      const response = await apiRequest(
        rule?.id
          ? `/api/platform/assignment-rules/${encodeURIComponent(rule.id)}`
          : `/api/platform/objects/${encodeURIComponent(object.id)}/assignment-rules`,
        { method: rule?.id ? 'PUT' : 'POST', body: JSON.stringify(payload) },
      )
      if (response?.success === false) throw new Error(response?.message || 'Unable to save Assignment Rule')
      onSaved?.(response.data)
    } catch (error) {
      onError?.(error?.message || 'Unable to save Assignment Rule')
    } finally {
      setSaving(false)
    }
  }

  const deactivate = async () => {
    if (!rule?.id) return
    setSaving(true)
    try {
      await apiRequest(`/api/platform/assignment-rules/${encodeURIComponent(rule.id)}`, { method: 'DELETE' })
      onSaved?.(null)
    } catch (error) {
      onError?.(error?.message || 'Unable to deactivate Assignment Rule')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="objects-rule-editor">
      <div className="objects-rule-editor-head">
        <div><strong>{rule?.id ? 'Edit Assignment Rule' : 'New Assignment Rule'}</strong><span>{object?.label || object?.name || object?.object_key}</span></div>
        <div className="objects-rule-editor-actions">
          {rule?.id ? <button type="button" className="objects-rule-danger" disabled={saving} onClick={deactivate}>Deactivate</button> : null}
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" className="objects-rule-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>

      <div className="objects-rule-grid">
        <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}/></label>
        <label>API key<input value={form.ruleKey} onChange={(e) => setForm({ ...form, ruleKey: e.target.value })} placeholder="Auto from name"/></label>
        <label>Priority<input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value || 0) })}/></label>
        <label>Assignment field<select value={form.assignmentField} onChange={(e) => setForm({ ...form, assignmentField: e.target.value })}>
          <option value="">Select field</option>
          {fields.map((field) => <option key={field.id || field.api_name} value={field.api_name}>{field.label || field.api_name}</option>)}
        </select></label>
        <label>Target type<select value={form.targetType} onChange={(e) => setForm({ ...form, targetType: e.target.value, targetId: '' })}>
          <option value="USER">User</option><option value="ROLE">Role</option><option value="QUEUE">Queue</option>
        </select></label>
        <label>Target<select value={form.targetId} onChange={(e) => setForm({ ...form, targetId: e.target.value })}>
          <option value="">Select target</option>
          {targetOptions.map((item) => <option key={item.id} value={item.id}>{item.full_name || item.username || item.name || item.label}</option>)}
        </select></label>
        <label className="objects-rule-toggle"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })}/> Active</label>
      </div>

      <div className="objects-rule-conditions">
        <div className="objects-config-list-head">
          <strong>Conditions</strong>
          <div>
            <select value={form.conditions.match} onChange={(e) => setForm({ ...form, conditions: { ...form.conditions, match: e.target.value } })}>
              <option value="all">Match all</option><option value="any">Match any</option>
            </select>
            <button type="button" onClick={() => setForm((current) => ({ ...current, conditions: { ...current.conditions, conditions: [...current.conditions.conditions, { ...EMPTY_CONDITION }] } }))}>+ Condition</button>
          </div>
        </div>
        {form.conditions.conditions.map((condition, index) => (
          <div className="objects-rule-condition" key={index}>
            <select value={condition.field} onChange={(e) => patchCondition(index, { field: e.target.value })}>
              <option value="">Field</option>{fields.map((field) => <option key={field.id || field.api_name} value={field.api_name}>{field.label || field.api_name}</option>)}
            </select>
            <select value={condition.operator} onChange={(e) => patchCondition(index, { operator: e.target.value })}>
              {['equals','not_equals','greater_than','greater_than_or_equal','less_than','less_than_or_equal','is_empty','is_not_empty'].map((operator) => <option key={operator} value={operator}>{operator}</option>)}
            </select>
            <input value={condition.value ?? ''} disabled={['is_empty','is_not_empty'].includes(condition.operator)} onChange={(e) => patchCondition(index, { value: e.target.value })} placeholder="Value"/>
            <button type="button" onClick={() => setForm((current) => ({ ...current, conditions: { ...current.conditions, conditions: current.conditions.conditions.filter((_, itemIndex) => itemIndex !== index) } }))}>×</button>
          </div>
        ))}
      </div>
    </div>
  )
}
