import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { apiRequest } from '../../../services/api.js'

const MATCH_OPERATORS = [
  ['exact', 'Exact'],
  ['normalized_text', 'Normalized text'],
  ['normalized_email', 'Normalized email'],
  ['normalized_phone', 'Normalized phone'],
  ['fuzzy_text', 'Fuzzy text'],
  ['fuzzy_name', 'Fuzzy name / word order'],
]

function safeKey(value, fallback = 'rule') {
  const key = String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return /^[a-z][a-z0-9_]*$/.test(key) ? key : fallback
}

const emptyMatching = () => ({
  id: null,
  label: '',
  ruleKey: '',
  description: '',
  matchMode: 'ALL',
  fields: [{ fieldApiName: '', operator: 'exact', threshold: 0.85 }],
})

const emptyDuplicate = () => ({
  id: null,
  label: '',
  ruleKey: '',
  description: '',
  matchingRuleId: '',
  action: 'BLOCK',
})

export default function DuplicateRulesAdmin({ object, fields = [] }) {
  const objectId = object?.id || object?.object_id
  const [data, setData] = useState({ matchingRules: [], duplicateRules: [] })
  const [matchingEditor, setMatchingEditor] = useState(null)
  const [duplicateEditor, setDuplicateEditor] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const usableFields = useMemo(
    () => fields.filter((field) => field?.active !== false && !['formula', 'rollup', 'json'].includes(field?.field_type)),
    [fields],
  )

  const load = async () => {
    if (!objectId) return
    setLoading(true)
    setError('')
    try {
      const response = await apiRequest(`/api/platform/objects/${encodeURIComponent(objectId)}/duplicate-management`)
      setData({
        matchingRules: Array.isArray(response?.data?.matchingRules) ? response.data.matchingRules : [],
        duplicateRules: Array.isArray(response?.data?.duplicateRules) ? response.data.duplicateRules : [],
      })
    } catch (err) {
      setError(err?.message || 'Unable to load duplicate management.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [objectId])

  const editMatching = (rule) => setMatchingEditor({
    id: rule.id,
    label: rule.label || '',
    ruleKey: rule.rule_key || '',
    description: rule.description || '',
    matchMode: rule.match_mode || 'ALL',
    fields: Array.isArray(rule.fields) && rule.fields.length
      ? rule.fields.map((field) => ({
          fieldApiName: field.fieldApiName || '',
          operator: field.operator || 'exact',
          threshold: Number(field.threshold ?? 0.85),
        }))
      : [{ fieldApiName: '', operator: 'exact', threshold: 0.85 }],
  })

  const editDuplicate = (rule) => setDuplicateEditor({
    id: rule.id,
    label: rule.label || '',
    ruleKey: rule.rule_key || '',
    description: rule.description || '',
    matchingRuleId: rule.matching_rule_id || '',
    action: rule.action || 'BLOCK',
  })

  const saveMatching = async () => {
    if (!matchingEditor?.label?.trim()) return setError('Enter a matching rule name.')
    if (!matchingEditor.fields?.length || matchingEditor.fields.some((row) => !row.fieldApiName)) return setError('Choose every matching field.')
    setSaving(true)
    setError('')
    try {
      const payload = {
        label: matchingEditor.label.trim(),
        ruleKey: matchingEditor.ruleKey || safeKey(matchingEditor.label, 'matching_rule'),
        description: matchingEditor.description || '',
        matchMode: matchingEditor.matchMode,
        fields: matchingEditor.fields.map((row) => ({
          fieldApiName: row.fieldApiName,
          operator: row.operator,
          ...(['fuzzy_text', 'fuzzy_name'].includes(row.operator) ? { threshold: Number(row.threshold || 0.85) } : {}),
        })),
      }
      await apiRequest(
        matchingEditor.id
          ? `/api/platform/matching-rules/${encodeURIComponent(matchingEditor.id)}`
          : `/api/platform/objects/${encodeURIComponent(objectId)}/matching-rules`,
        { method: matchingEditor.id ? 'PUT' : 'POST', body: JSON.stringify(payload) },
      )
      setMatchingEditor(null)
      await load()
    } catch (err) {
      setError(err?.message || 'Unable to save matching rule.')
    } finally {
      setSaving(false)
    }
  }

  const saveDuplicate = async () => {
    if (!duplicateEditor?.label?.trim() || !duplicateEditor.matchingRuleId) return setError('Enter a duplicate rule name and choose a matching rule.')
    setSaving(true)
    setError('')
    try {
      const payload = {
        label: duplicateEditor.label.trim(),
        ruleKey: duplicateEditor.ruleKey || safeKey(duplicateEditor.label, 'duplicate_rule'),
        description: duplicateEditor.description || '',
        matchingRuleId: duplicateEditor.matchingRuleId,
        action: duplicateEditor.action,
      }
      await apiRequest(
        duplicateEditor.id
          ? `/api/platform/duplicate-rules/${encodeURIComponent(duplicateEditor.id)}`
          : `/api/platform/objects/${encodeURIComponent(objectId)}/duplicate-rules`,
        { method: duplicateEditor.id ? 'PUT' : 'POST', body: JSON.stringify(payload) },
      )
      setDuplicateEditor(null)
      await load()
    } catch (err) {
      setError(err?.message || 'Unable to save duplicate rule.')
    } finally {
      setSaving(false)
    }
  }

  const deactivate = async (kind, id) => {
    if (!id || !window.confirm(`Deactivate this ${kind === 'matching' ? 'matching' : 'duplicate'} rule?`)) return
    setError('')
    try {
      await apiRequest(
        kind === 'matching'
          ? `/api/platform/matching-rules/${encodeURIComponent(id)}`
          : `/api/platform/duplicate-rules/${encodeURIComponent(id)}`,
        { method: 'DELETE' },
      )
      await load()
    } catch (err) {
      setError(err?.message || 'Unable to deactivate rule.')
    }
  }

  const matchingById = new Map(data.matchingRules.map((rule) => [String(rule.id), rule]))

  return (
    <div className="duplicate-admin">
      {error ? <div className="onepos-alert onepos-alert-error">{error}</div> : null}
      <section className="duplicate-admin-section">
        <header>
          <div><strong>Matching Rules</strong><span>Define how records are considered the same.</span></div>
          <button type="button" className="onepos-btn onepos-btn-sm onepos-btn-primary" onClick={() => setMatchingEditor(emptyMatching())}><Plus size={12}/> New Matching Rule</button>
        </header>
        {loading ? <div className="duplicate-admin-empty">Loading…</div> : data.matchingRules.length ? data.matchingRules.map((rule) => (
          <div className="duplicate-admin-row" key={rule.id}>
            <button type="button" className="duplicate-admin-row-main" onClick={() => editMatching(rule)}>
              <strong>{rule.label}</strong>
              <span>{rule.match_mode} · {(Array.isArray(rule.fields) ? rule.fields : []).map((item) => `${item.fieldApiName}: ${item.operator}${item.threshold ? ` @ ${item.threshold}` : ''}`).join(' · ')}</span>
            </button>
            <button type="button" className="duplicate-admin-icon" onClick={() => deactivate('matching', rule.id)}><Trash2 size={13}/></button>
          </div>
        )) : <div className="duplicate-admin-empty">No matching rules. Create one to define exact, normalized, or fuzzy matching.</div>}
      </section>

      <section className="duplicate-admin-section">
        <header>
          <div><strong>Duplicate Rules</strong><span>Choose what happens when a Matching Rule finds a record.</span></div>
          <button type="button" className="onepos-btn onepos-btn-sm onepos-btn-primary" disabled={!data.matchingRules.length} onClick={() => setDuplicateEditor({ ...emptyDuplicate(), matchingRuleId: data.matchingRules[0]?.id || '' })}><Plus size={12}/> New Duplicate Rule</button>
        </header>
        {data.duplicateRules.length ? data.duplicateRules.map((rule) => (
          <div className="duplicate-admin-row" key={rule.id}>
            <button type="button" className="duplicate-admin-row-main" onClick={() => editDuplicate(rule)}>
              <strong>{rule.label}</strong>
              <span>{rule.action} · {rule.matching_rule_label || matchingById.get(String(rule.matching_rule_id))?.label || 'Matching rule'}</span>
            </button>
            <button type="button" className="duplicate-admin-icon" onClick={() => deactivate('duplicate', rule.id)}><Trash2 size={13}/></button>
          </div>
        )) : <div className="duplicate-admin-empty">No duplicate rules.</div>}
      </section>

      {matchingEditor ? (
        <div className="duplicate-editor">
          <header><strong>{matchingEditor.id ? 'Edit Matching Rule' : 'New Matching Rule'}</strong></header>
          <div className="duplicate-editor-grid">
            <label><span>Name</span><input value={matchingEditor.label} onChange={(event) => setMatchingEditor((current) => ({ ...current, label: event.target.value }))}/></label>
            <label><span>API key</span><input value={matchingEditor.ruleKey} placeholder="Auto from name" onChange={(event) => setMatchingEditor((current) => ({ ...current, ruleKey: event.target.value }))}/></label>
            <label><span>Match</span><select value={matchingEditor.matchMode} onChange={(event) => setMatchingEditor((current) => ({ ...current, matchMode: event.target.value }))}><option value="ALL">All fields</option><option value="ANY">Any field</option></select></label>
          </div>
          <label className="duplicate-wide"><span>Description</span><textarea rows="2" value={matchingEditor.description} onChange={(event) => setMatchingEditor((current) => ({ ...current, description: event.target.value }))}/></label>
          <div className="duplicate-match-fields">
            {matchingEditor.fields.map((row, index) => (
              <div className="duplicate-match-field" key={index}>
                <select value={row.fieldApiName} onChange={(event) => setMatchingEditor((current) => ({ ...current, fields: current.fields.map((item, itemIndex) => itemIndex === index ? { ...item, fieldApiName: event.target.value } : item) }))}>
                  <option value="">Select field</option>
                  {usableFields.map((field) => <option key={field.id || field.api_name} value={field.api_name}>{field.label} ({field.api_name})</option>)}
                </select>
                <select value={row.operator} onChange={(event) => setMatchingEditor((current) => ({ ...current, fields: current.fields.map((item, itemIndex) => itemIndex === index ? { ...item, operator: event.target.value } : item) }))}>
                  {MATCH_OPERATORS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                {['fuzzy_text', 'fuzzy_name'].includes(row.operator) ? <label className="duplicate-threshold"><span>Threshold</span><input type="number" min="0.5" max="1" step="0.01" value={row.threshold ?? 0.85} onChange={(event) => setMatchingEditor((current) => ({ ...current, fields: current.fields.map((item, itemIndex) => itemIndex === index ? { ...item, threshold: event.target.value } : item) }))}/></label> : <span/>}
                <button type="button" className="duplicate-admin-icon" disabled={matchingEditor.fields.length === 1} onClick={() => setMatchingEditor((current) => ({ ...current, fields: current.fields.filter((_, itemIndex) => itemIndex !== index) }))}><Trash2 size={13}/></button>
              </div>
            ))}
            <button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" onClick={() => setMatchingEditor((current) => ({ ...current, fields: [...current.fields, { fieldApiName: '', operator: 'exact', threshold: 0.85 }] }))}><Plus size={12}/> Field</button>
          </div>
          <footer><button type="button" className="onepos-btn onepos-btn-secondary" onClick={() => setMatchingEditor(null)}>Cancel</button><button type="button" className="onepos-btn onepos-btn-primary" disabled={saving} onClick={saveMatching}>{saving ? 'Saving…' : 'Save Matching Rule'}</button></footer>
        </div>
      ) : null}

      {duplicateEditor ? (
        <div className="duplicate-editor">
          <header><strong>{duplicateEditor.id ? 'Edit Duplicate Rule' : 'New Duplicate Rule'}</strong></header>
          <div className="duplicate-editor-grid">
            <label><span>Name</span><input value={duplicateEditor.label} onChange={(event) => setDuplicateEditor((current) => ({ ...current, label: event.target.value }))}/></label>
            <label><span>API key</span><input value={duplicateEditor.ruleKey} placeholder="Auto from name" onChange={(event) => setDuplicateEditor((current) => ({ ...current, ruleKey: event.target.value }))}/></label>
            <label><span>Matching Rule</span><select value={duplicateEditor.matchingRuleId} onChange={(event) => setDuplicateEditor((current) => ({ ...current, matchingRuleId: event.target.value }))}>{data.matchingRules.map((rule) => <option key={rule.id} value={rule.id}>{rule.label}</option>)}</select></label>
            <label><span>Action</span><select value={duplicateEditor.action} onChange={(event) => setDuplicateEditor((current) => ({ ...current, action: event.target.value }))}><option value="ALLOW">Allow</option><option value="WARN">Warn</option><option value="BLOCK">Block</option></select></label>
          </div>
          <label className="duplicate-wide"><span>Description</span><textarea rows="2" value={duplicateEditor.description} onChange={(event) => setDuplicateEditor((current) => ({ ...current, description: event.target.value }))}/></label>
          <footer><button type="button" className="onepos-btn onepos-btn-secondary" onClick={() => setDuplicateEditor(null)}>Cancel</button><button type="button" className="onepos-btn onepos-btn-primary" disabled={saving} onClick={saveDuplicate}>{saving ? 'Saving…' : 'Save Duplicate Rule'}</button></footer>
        </div>
      ) : null}

      <style>{`
        .duplicate-admin { display:grid; gap:14px; }
        .duplicate-admin-section,.duplicate-editor { border:1px solid var(--border-color,#e5e7eb); border-radius:12px; background:var(--card-background,#fff); overflow:hidden; }
        .duplicate-admin-section > header,.duplicate-editor > header { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:12px; border-bottom:1px solid var(--border-color,#e5e7eb); }
        .duplicate-admin-section > header div { display:grid; gap:2px; }
        .duplicate-admin-section > header span,.duplicate-admin-row-main span,.duplicate-admin-empty { color:var(--text-secondary,#64748b); font-size:10px; }
        .duplicate-admin-row { display:flex; align-items:center; gap:8px; border-top:1px solid var(--border-color,#eef2f7); padding:8px 10px; }
        .duplicate-admin-row:first-of-type { border-top:0; }
        .duplicate-admin-row-main { display:grid; flex:1; gap:3px; border:0; background:transparent; color:inherit; text-align:left; cursor:pointer; }
        .duplicate-admin-row-main strong { font-size:11px; }
        .duplicate-admin-icon { display:grid; place-items:center; border:1px solid var(--border-color,#d1d5db); border-radius:7px; background:transparent; padding:6px; cursor:pointer; }
        .duplicate-admin-empty { padding:14px; }
        .duplicate-editor { padding-bottom:12px; }
        .duplicate-editor-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; padding:12px; }
        .duplicate-editor label,.duplicate-wide { display:grid; gap:5px; font-size:10px; font-weight:600; }
        .duplicate-editor input,.duplicate-editor select,.duplicate-editor textarea { width:100%; box-sizing:border-box; border:1px solid var(--border-color,#d1d5db); border-radius:7px; background:var(--card-background,#fff); color:inherit; padding:8px; font:inherit; }
        .duplicate-wide { margin:0 12px 12px; }
        .duplicate-match-fields { display:grid; gap:7px; padding:0 12px 12px; }
        .duplicate-match-field { display:grid; grid-template-columns:1.3fr 1fr .75fr auto; gap:7px; align-items:end; }
        .duplicate-threshold { min-width:0; }
        .duplicate-editor footer { display:flex; justify-content:flex-end; gap:8px; padding:0 12px; }
        @media(max-width:760px){ .duplicate-editor-grid,.duplicate-match-field { grid-template-columns:1fr; } }
      `}</style>
    </div>
  )
}
