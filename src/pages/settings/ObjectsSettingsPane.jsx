import { useEffect, useMemo, useState } from 'react'
import { Box, ChevronRight, Plus, Search } from 'lucide-react'
import { apiRequest } from '../../services/api'
import { loadPlatformObjects } from '../../services/settings'

const TABS = [
  ['details', 'Details'],
  ['fields', 'Fields'],
  ['formula', 'Formula Fields'],
  ['relationships', 'Relationships'],
  ['record-types', 'Record Types'],
  ['layouts', 'Layouts'],
  ['validation', 'Validation'],
  ['triggers', 'Triggers'],
  ['buttons', 'Buttons'],
  ['permissions', 'Permissions'],
]

function objectName(object) {
  return object?.name || object?.label || object?.object_name || object?.object_key || object?.key || 'Unnamed Object'
}

function objectKey(object) {
  return object?.object_key || object?.key || object?.api_name || ''
}

function fieldName(field) {
  return field?.label || field?.name || field?.api_name || field?.field_key || 'Unnamed field'
}

function isFormulaField(field) {
  const type = String(field?.field_type || field?.type || '').toLowerCase()
  return type === 'formula' || type === 'rollup' || Boolean(field?.formula || field?.config?.formula || field?.formula_expression)
}

export default function ObjectsSettingsPane() {
  const [objects, setObjects] = useState([])
  const [query, setQuery] = useState('')
  const [selectedKey, setSelectedKey] = useState('')
  const [activeTab, setActiveTab] = useState('details')
  const [fields, setFields] = useState([])
  const [objectLoading, setObjectLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    setLoading(true)
    setError('')
    loadPlatformObjects()
      .then((rows) => {
        if (!live) return
        setObjects(rows)
        if (!selectedKey && rows.length) setSelectedKey(objectKey(rows[0]))
      })
      .catch((err) => {
        if (live) setError(err?.message || 'Unable to load objects')
      })
      .finally(() => {
        if (live) setLoading(false)
      })
    return () => { live = false }
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return objects
    return objects.filter((object) =>
      [
        objectName(object),
        objectKey(object),
        object?.description,
        object?.source_table,
      ].filter(Boolean).join(' ').toLowerCase().includes(q),
    )
  }, [objects, query])

  const selected = objects.find((object) => objectKey(object) === selectedKey) || filtered[0] || null
  const selectedId = selected?.id || selected?.object_id || ''

  useEffect(() => {
    setActiveTab('details')
    setFields([])
    if (!selectedId) return
    let live = true
    setObjectLoading(true)
    apiRequest(`/api/platform/objects/${encodeURIComponent(selectedId)}/fields`)
      .then((response) => {
        if (live) setFields(Array.isArray(response?.data) ? response.data : [])
      })
      .catch(() => {
        if (live) setFields([])
      })
      .finally(() => {
        if (live) setObjectLoading(false)
      })
    return () => { live = false }
  }, [selectedId])

  const normalFields = fields.filter((field) => !isFormulaField(field))
  const formulaFields = fields.filter(isFormulaField)

  return (
    <div className="objects-settings-shell">
      <aside className="objects-list-pane">
        <div className="objects-pane-header">
          <div>
            <strong>Objects</strong>
            <span>{objects.length} configured</span>
          </div>
          <button type="button" className="objects-new-icon" title="New Object" aria-label="New Object">
            <Plus size={15} />
          </button>
        </div>

        <label className="objects-pane-search">
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search objects"
          />
        </label>

        <div className="objects-pane-list">
          {loading ? <div className="objects-pane-state">Loading objects…</div> : null}
          {error ? <div className="objects-pane-state is-error">{error}</div> : null}
          {!loading && !error && filtered.map((object) => {
            const key = objectKey(object)
            const active = key === objectKey(selected)
            return (
              <button
                key={object.id || key}
                type="button"
                className={`objects-list-item ${active ? 'is-active' : ''}`}
                onClick={() => setSelectedKey(key)}
              >
                <span className="objects-list-icon"><Box size={14} /></span>
                <span className="objects-list-copy">
                  <strong>{objectName(object)}</strong>
                  <small>{key}</small>
                </span>
                <ChevronRight size={13} />
              </button>
            )
          })}
          {!loading && !error && !filtered.length ? (
            <div className="objects-pane-state">No matching objects.</div>
          ) : null}
        </div>
      </aside>

      <section className="objects-detail-pane">
        {selected ? (
          <>
            <div className="objects-detail-header">
              <div className="objects-detail-icon"><Box size={18} /></div>
              <div>
                <strong>{objectName(selected)}</strong>
                <span>{objectKey(selected)}</span>
              </div>
            </div>

            <div className="objects-config-workspace">
              <nav className="objects-config-tabs" aria-label="Object configuration">
                {TABS.map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className={activeTab === key ? 'is-active' : ''}
                    onClick={() => setActiveTab(key)}
                  >
                    <span>{label}</span>
                    <ChevronRight size={12} />
                  </button>
                ))}
              </nav>

              <div className="objects-config-content">
                {activeTab === 'details' ? (
                  <div className="objects-detail-card">
                    <div><span>API name</span><strong>{objectKey(selected)}</strong></div>
                    <div><span>Source table</span><strong>{selected.source_table || 'Metadata object'}</strong></div>
                    <div><span>Type</span><strong>{selected.company_id ? 'Custom' : 'Standard'}</strong></div>
                    <div><span>Status</span><strong>{selected.active === false ? 'Inactive' : 'Active'}</strong></div>
                  </div>
                ) : null}

                {activeTab === 'fields' || activeTab === 'formula' ? (
                  <div className="objects-config-list">
                    <div className="objects-config-list-head">
                      <strong>{activeTab === 'fields' ? 'Fields' : 'Formula Fields'}</strong>
                      <button type="button"><Plus size={13} /> New</button>
                    </div>
                    {objectLoading ? (
                      <div className="objects-detail-placeholder">Loading fields…</div>
                    ) : (activeTab === 'fields' ? normalFields : formulaFields).length ? (
                      <div className="objects-config-rows">
                        {(activeTab === 'fields' ? normalFields : formulaFields).map((field) => (
                          <div key={field.id || field.field_id || field.api_name}>
                            <span>
                              <strong>{fieldName(field)}</strong>
                              <small>{field.api_name || field.field_key || '—'}</small>
                            </span>
                            <span>{field.field_type || field.type || 'text'}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="objects-detail-placeholder">
                        No {activeTab === 'fields' ? 'fields' : 'formula fields'} configured.
                      </div>
                    )}
                  </div>
                ) : null}

                {!['details', 'fields', 'formula'].includes(activeTab) ? (
                  <div className="objects-detail-placeholder">
                    {TABS.find(([key]) => key === activeTab)?.[1]} configuration for {objectName(selected)} will render here.
                  </div>
                ) : null}
              </div>
            </div>
          </>
        ) : (
          <div className="objects-detail-placeholder">Select an object.</div>
        )}
      </section>
    </div>
  )
}
