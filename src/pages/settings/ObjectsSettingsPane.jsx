import { useEffect, useMemo, useState } from 'react'
import { Box, ChevronRight, Plus, Search } from 'lucide-react'
import { apiRequest } from '../../services/api'
import { loadPlatformObjects } from '../../services/settings'

const TABS = [
  ['details', 'Details'],
  ['fields', 'Fields & Relationships'],
  ['formula', 'Formula Fields'],
  ['relationships', 'Relationships'],
  ['record-types', 'Record Types'],
  ['layouts', 'Forms / Layouts'],
  ['validation', 'Validation Rules'],
  ['actions', 'Actions'],
  ['automation', 'Automation / Flows'],
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

function isRelationshipField(field) {
  const type = String(field?.field_type || field?.type || '').toLowerCase()
  return type === 'lookup'
    || type === 'master_detail'
    || Boolean(field?.relationship_id || field?.lookup_object_id || field?.config?.relationship || field?.config?.lookupObjectKey)
}

function ruleActionType(rule) {
  return String(typeof rule?.action === 'string' ? rule.action : rule?.action?.type || '').trim()
}

function isValidationRule(rule) {
  const type = ruleActionType(rule).toLowerCase()
  return type === 'validation' || type === 'validate'
}

function isWorkflowRule(rule) {
  return ruleActionType(rule).toLowerCase() === 'workflow'
}

export default function ObjectsSettingsPane() {
  const [objects, setObjects] = useState([])
  const [query, setQuery] = useState('')
  const [selectedKey, setSelectedKey] = useState('')
  const [activeTab, setActiveTab] = useState('details')
  const [fields, setFields] = useState([])
  const [objectLoading, setObjectLoading] = useState(false)
  const [objectData, setObjectData] = useState({
    relationships: [],
    recordTypes: [],
    layouts: [],
    rules: [],
    buttons: [],
    permissions: null,
  })
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
    Promise.allSettled([
      apiRequest(`/api/platform/objects/${encodeURIComponent(selectedId)}/fields`),
      apiRequest('/api/platform/relationships'),
      apiRequest(`/api/platform/objects/${encodeURIComponent(selectedId)}/record-types`),
      apiRequest('/api/platform/layouts'),
      apiRequest('/api/platform/rules'),
      apiRequest(`/api/platform/objects/${encodeURIComponent(selectedId)}/buttons`),
      apiRequest(`/api/platform/objects/${encodeURIComponent(selectedId)}/effective-permissions`),
    ])
      .then(([fieldsResult, relationshipsResult, recordTypesResult, layoutsResult, rulesResult, buttonsResult, permissionsResult]) => {
        if (!live) return

        const value = (result) => result?.status === 'fulfilled' ? result.value : null
        const fieldsRes = value(fieldsResult)
        const relationshipsRes = value(relationshipsResult)
        const recordTypesRes = value(recordTypesResult)
        const layoutsRes = value(layoutsResult)
        const rulesRes = value(rulesResult)
        const buttonsRes = value(buttonsResult)
        const permissionsRes = value(permissionsResult)

        setFields(Array.isArray(fieldsRes?.data) ? fieldsRes.data : [])

        const relationships = Array.isArray(relationshipsRes?.data) ? relationshipsRes.data : []
        const layouts = Array.isArray(layoutsRes?.data) ? layoutsRes.data : []
        const rules = Array.isArray(rulesRes?.data) ? rulesRes.data : []

        setObjectData({
          relationships: relationships.filter((row) =>
            String(row.parent_object_id) === String(selectedId) ||
            String(row.child_object_id) === String(selectedId)),
          recordTypes: Array.isArray(recordTypesRes?.data) ? recordTypesRes.data : [],
          layouts: layouts.filter((row) => String(row.object_id) === String(selectedId)),
          rules: rules.filter((row) =>
            String(row.object_id) === String(selectedId)
            || (Array.isArray(row.referenced_object_ids)
              && row.referenced_object_ids.some((objectId) => String(objectId) === String(selectedId)))),
          buttons: Array.isArray(buttonsRes?.data) ? buttonsRes.data : [],
          permissions: permissionsRes?.data || null,
        })
      })
      .finally(() => {
        if (live) setObjectLoading(false)
      })
    return () => { live = false }
  }, [selectedId])

  const normalFields = fields.filter((field) => !isFormulaField(field))
  const formulaFields = fields.filter(isFormulaField)
  const relationshipFields = fields.filter(isRelationshipField)
  const validationRules = objectData.rules.filter(isValidationRule)
  const automationRules = objectData.rules.filter(isWorkflowRule)
  const actionRules = objectData.rules.filter((rule) => !isValidationRule(rule) && !isWorkflowRule(rule))

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

                {activeTab === 'fields' ? (
                  <div className="objects-config-list">
                    <div className="objects-config-list-head">
                      <strong>Fields & Relationships</strong>
                      <button type="button"><Plus size={13} /> New Field</button>
                    </div>
                    {objectLoading ? (
                      <div className="objects-detail-placeholder">Loading fields…</div>
                    ) : normalFields.length ? (
                      <div className="objects-config-rows">
                        {normalFields.map((field) => (
                          <div key={field.id || field.field_id || field.api_name}>
                            <span>
                              <strong>{fieldName(field)}</strong>
                              <small>{field.api_name || field.field_key || '—'}</small>
                            </span>
                            <span>{isRelationshipField(field) ? `Related · ${field.field_type || field.type || 'lookup'}` : (field.field_type || field.type || 'text')}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="objects-detail-placeholder">No fields configured.</div>
                    )}
                    <div className="objects-config-subsection">
                      <div className="objects-config-list-head"><strong>Related / Lookup Fields</strong></div>
                      {relationshipFields.length ? (
                        <div className="objects-config-rows">
                          {relationshipFields.map((field) => (
                            <div key={`related-${field.id || field.field_id || field.api_name}`}>
                              <span>
                                <strong>{fieldName(field)}</strong>
                                <small>{field.api_name || field.field_key || '—'}</small>
                              </span>
                              <span>{field.lookup_object_key || field.config?.lookupObjectKey || field.field_type || 'lookup'}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="objects-detail-placeholder">No related fields configured.</div>
                      )}
                    </div>
                  </div>
                ) : null}

                {activeTab === 'formula' ? (
                  <ObjectDataList title="Formula Fields" rows={formulaFields}
                    primary={(field) => fieldName(field)}
                    secondary={(field) => field.api_name || field.field_key || '—'}
                    meta={(field) => field.field_type || field.type || 'formula'} />
                ) : null}

                {activeTab === 'relationships' ? (
                  <ObjectDataList title="Relationships" rows={objectData.relationships}
                    primary={(row) => row.relationship_key || 'Relationship'}
                    secondary={(row) => `${row.parent_object_key || ''} → ${row.child_object_key || ''}`}
                    meta={(row) => row.relationship_type || 'lookup'} />
                ) : null}

                {activeTab === 'record-types' ? (
                  <ObjectDataList title="Record Types" rows={objectData.recordTypes}
                    primary={(row) => row.label || row.name || row.record_type_key || 'Record Type'}
                    secondary={(row) => row.record_type_key || row.api_name || ''}
                    meta={(row) => row.default_record_type ? 'Default' : 'Active'} />
                ) : null}

                {activeTab === 'layouts' ? (
                  <ObjectDataList title="Layouts" rows={objectData.layouts}
                    primary={(row) => row.name || row.label || row.layout_key || 'Layout'}
                    secondary={(row) => row.layout_key || row.page_type || ''}
                    meta={(row) => row.page_type || 'layout'} />
                ) : null}

                {activeTab === 'validation' ? (
                  <ObjectDataList title="Validation Rules" rows={validationRules}
                    primary={(row) => row.name || row.rule_key || 'Validation Rule'}
                    secondary={(row) => row.description || row.trigger_key || row.trigger || ''}
                    meta={(row) => row.active === false ? 'Inactive' : 'Active'} />
                ) : null}

                {activeTab === 'actions' ? (
                  <ObjectDataList title="Actions" rows={actionRules}
                    primary={(row) => row.name || row.rule_key || 'Action'}
                    secondary={(row) => row.trigger_key || row.trigger || ''}
                    meta={(row) => ruleActionType(row) || 'action'} />
                ) : null}

                {activeTab === 'automation' ? (
                  <ObjectDataList title="Automation / Flows" rows={automationRules}
                    primary={(row) => row.name || row.rule_key || 'Flow'}
                    secondary={(row) => row.trigger_key || row.trigger || ''}
                    meta={(row) => {
                      const steps = Array.isArray(row.action?.actions) ? row.action.actions.length : 0
                      return `${row.active === false ? 'Inactive' : 'Active'} · ${steps} step${steps === 1 ? '' : 's'}`
                    }} />
                ) : null}

                {activeTab === 'buttons' ? (
                  <ObjectDataList title="Buttons" rows={objectData.buttons}
                    primary={(row) => row.label || row.button_key || 'Button'}
                    secondary={(row) => row.button_key || row.target_key || ''}
                    meta={(row) => row.placement || row.variant || 'button'} />
                ) : null}

                {activeTab === 'permissions' ? (
                  <div className="objects-permissions-card">
                    {objectData.permissions ? (
                      <>
                        <div className="objects-permission-grid">
                          {['view','create','edit','delete','import','export'].map((key) => (
                            <div key={key}>
                              <span>{key}</span>
                              <strong>{objectData.permissions[`can_${key}`] ? 'Allowed' : 'Denied'}</strong>
                            </div>
                          ))}
                        </div>
                        <div className="objects-config-list">
                          <div className="objects-config-list-head"><strong>Field Access</strong></div>
                          <div className="objects-config-rows">
                            {(objectData.permissions.fields || []).map((field) => (
                              <div key={field.fieldId || field.label}>
                                <span><strong>{field.label}</strong><small>{field.readable ? 'Visible' : 'Hidden'}</small></span>
                                <span>{field.writable ? 'Editable' : 'Read only'}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    ) : <div className="objects-detail-placeholder">No permission data.</div>}
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


function ObjectDataList({ title, rows = [], primary, secondary, meta }) {
  return (
    <div className="objects-config-list">
      <div className="objects-config-list-head">
        <strong>{title}</strong>
        <button type="button"><Plus size={13} /> New</button>
      </div>
      {rows.length ? (
        <div className="objects-config-rows">
          {rows.map((row, index) => (
            <div key={row.id || row.rule_id || row.layout_id || row.relationship_id || row.button_id || index}>
              <span>
                <strong>{primary(row)}</strong>
                <small>{secondary(row)}</small>
              </span>
              <span>{meta(row)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="objects-detail-placeholder">No {title.toLowerCase()} configured.</div>
      )}
    </div>
  )
}
