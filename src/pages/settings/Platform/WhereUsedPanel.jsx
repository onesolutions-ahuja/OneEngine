import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { apiRequest } from '../../../services/api.js'

const KIND_TAB = {
  formula: 'formula',
  rollup: 'formula',
  'field metadata': 'fields',
  workflow: 'automation',
  approval: 'approvals',
  button: 'buttons',
  'action binding': 'actions',
  layout: 'layouts',
  report: 'reports',
  records: 'details',
  fields: 'fields',
  relationships: 'relationships',
  layouts: 'layouts',
  reports: 'reports',
  rules: 'automation',
  approvals: 'approvals',
  buttons: 'buttons',
  'registered actions': 'actions',
  'action bindings': 'actions',
  'record types': 'record-types',
}

function splitReference(reference) {
  const text = String(reference || '')
  const index = text.indexOf(':')
  if (index < 0) return { kind: text.trim().toLowerCase(), label: text.trim() }
  return {
    kind: text.slice(0, index).trim().toLowerCase(),
    label: text.slice(index + 1).trim() || text.slice(0, index).trim(),
  }
}

export default function WhereUsedPanel({ objectId = '', fieldId = '', title = 'Where Used', onNavigate }) {
  const [state, setState] = useState({ loading: false, error: '', data: null })

  const load = async () => {
    if (!objectId && !fieldId) return
    setState((current) => ({ ...current, loading: true, error: '' }))
    try {
      const response = await apiRequest(
        fieldId
          ? `/api/platform/fields/${encodeURIComponent(fieldId)}/dependencies`
          : `/api/platform/objects/${encodeURIComponent(objectId)}/dependencies`,
      )
      setState({ loading: false, error: '', data: response?.data || null })
    } catch (error) {
      setState({ loading: false, error: error?.message || 'Unable to load dependencies.', data: null })
    }
  }

  useEffect(() => {
    void load()
  }, [objectId, fieldId])

  const rows = useMemo(
    () => (Array.isArray(state.data?.activeReferences) ? state.data.activeReferences : []).map((reference) => ({
      reference,
      ...splitReference(reference),
    })),
    [state.data],
  )

  return (
    <section className="where-used-panel">
      <header>
        <div>
          <strong>{title}</strong>
          <span>{rows.length ? `${rows.length} active reference${rows.length === 1 ? '' : 's'}` : 'No active references'}</span>
        </div>
        <button type="button" className="where-used-refresh" disabled={state.loading} onClick={load} aria-label="Refresh Where Used"><RefreshCw size={12}/></button>
      </header>
      {state.error ? <div className="onepos-alert onepos-alert-error">{state.error}</div> : null}
      {state.loading ? <div className="where-used-empty">Loading…</div> : rows.length ? (
        <div className="where-used-list">
          {rows.map((row, index) => {
            const tab = KIND_TAB[row.kind] || ''
            return (
              <button
                type="button"
                key={`${row.reference}-${index}`}
                className="where-used-row"
                disabled={!tab || !onNavigate}
                onClick={() => onNavigate?.(tab, row)}
              >
                <span><strong>{row.kind || 'Reference'}</strong><small>{row.label}</small></span>
                {tab && onNavigate ? <ExternalLink size={12}/> : null}
              </button>
            )
          })}
        </div>
      ) : <div className="where-used-empty">Nothing active currently depends on this {fieldId ? 'field' : 'object'}.</div>}
      <footer>
        <span>{state.data?.canDeactivate === false ? 'Deactivation is blocked while these references remain active.' : 'No active dependency blocks deactivation.'}</span>
      </footer>
      <style>{`
        .where-used-panel { border:1px solid var(--border-color,#e5e7eb); border-radius:10px; background:var(--card-background,#fff); overflow:hidden; }
        .where-used-panel > header { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 12px; border-bottom:1px solid var(--border-color,#e5e7eb); }
        .where-used-panel > header div { display:grid; gap:2px; }
        .where-used-panel > header strong { font-size:11px; }
        .where-used-panel > header span,.where-used-panel footer,.where-used-empty { color:var(--text-secondary,#64748b); font-size:9px; }
        .where-used-refresh { display:grid; place-items:center; border:1px solid var(--border-color,#d1d5db); border-radius:7px; background:transparent; padding:6px; cursor:pointer; }
        .where-used-list { display:grid; }
        .where-used-row { display:flex; align-items:center; justify-content:space-between; gap:10px; border:0; border-bottom:1px solid var(--border-color,#eef2f7); background:transparent; padding:8px 11px; color:inherit; text-align:left; }
        .where-used-row:not(:disabled) { cursor:pointer; }
        .where-used-row:not(:disabled):hover { background:var(--muted-background,#f8fafc); }
        .where-used-row:disabled { opacity:1; }
        .where-used-row span { display:grid; gap:2px; }
        .where-used-row strong { text-transform:capitalize; font-size:9px; color:var(--text-secondary,#64748b); }
        .where-used-row small { font-size:10px; }
        .where-used-empty { padding:12px; }
        .where-used-panel footer { padding:8px 11px; background:var(--muted-background,#f8fafc); }
      `}</style>
    </section>
  )
}
