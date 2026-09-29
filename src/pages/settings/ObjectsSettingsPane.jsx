import { useEffect, useMemo, useState } from 'react'
import { Box, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { apiRequest } from '../../services/api'
import { loadPlatformObjects } from '../../services/settings'

const TABS = [
  ['details', 'Details'],
  ['fields', 'Fields & Relationships'],
  ['formula', 'Formula Fields'],
  ['relationships', 'Relationships'],
  ['record-types', 'Record Types'],
  ['layouts', 'Forms / Layouts'],
  ['list-views', 'List Views'],
  ['validation', 'Validation Rules'],
  ['actions', 'Actions & Bindings'],
  ['automation', 'Automation / Flows'],
  ['approvals', 'Approval Processes'],
  ['assignment', 'Assignment Rules'],
  ['buttons', 'Buttons'],
  ['reports', 'Reports'],
  ['sharing', 'Sharing'],
  ['automation-logs', 'Automation Logs'],
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
  const [mobileStage, setMobileStage] = useState('objects')
  const [fields, setFields] = useState([])
  const [objectLoading, setObjectLoading] = useState(false)
  const [objectData, setObjectData] = useState({
    relationships: [],
    recordTypes: [],
    layouts: [],
    listViews: [],
    rules: [],
    buttons: [],
    registeredActions: [],
    actionBindings: [],
    approvalProcesses: [],
    assignmentRules: [],
    reports: [],
    sharingSettings: null,
    sharingRules: [],
    automationLogs: [],
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
      apiRequest('/api/platform/rules'),
      apiRequest(`/api/platform/objects/${encodeURIComponent(selectedId)}/effective-permissions`),
      apiRequest(`/api/platform/objects/${encodeURIComponent(selectedId)}/configuration`),
    ])
      .then(([fieldsResult, relationshipsResult, rulesResult, permissionsResult, configurationResult]) => {
        if (!live) return

        const value = (result) => result?.status === 'fulfilled' ? result.value : null
        const fieldsRes = value(fieldsResult)
        const relationshipsRes = value(relationshipsResult)
        const rulesRes = value(rulesResult)
        const permissionsRes = value(permissionsResult)
        const configurationRes = value(configurationResult)

        setFields(Array.isArray(fieldsRes?.data) ? fieldsRes.data : [])

        const relationships = Array.isArray(relationshipsRes?.data) ? relationshipsRes.data : []
        const rules = Array.isArray(rulesRes?.data) ? rulesRes.data : []
        const configuration = configurationRes?.data || {}

        setObjectData({
          relationships: relationships.filter((row) =>
            String(row.parent_object_id) === String(selectedId) ||
            String(row.child_object_id) === String(selectedId)),
          recordTypes: Array.isArray(configuration.recordTypes) ? configuration.recordTypes : [],
          layouts: Array.isArray(configuration.layouts) ? configuration.layouts : [],
          listViews: Array.isArray(configuration.listViews) ? configuration.listViews : [],
          rules: rules.filter((row) =>
            String(row.object_id) === String(selectedId)
            || (Array.isArray(row.referenced_object_ids)
              && row.referenced_object_ids.some((objectId) => String(objectId) === String(selectedId)))),
          buttons: Array.isArray(configuration.buttons) ? configuration.buttons : [],
          registeredActions: Array.isArray(configuration.registeredActions) ? configuration.registeredActions : [],
          actionBindings: Array.isArray(configuration.actionBindings) ? configuration.actionBindings : [],
          approvalProcesses: Array.isArray(configuration.approvalProcesses) ? configuration.approvalProcesses : [],
          assignmentRules: Array.isArray(configuration.assignmentRules) ? configuration.assignmentRules : [],
          reports: Array.isArray(configuration.reports) ? configuration.reports : [],
          sharingSettings: configuration.sharingSettings || null,
          sharingRules: Array.isArray(configuration.sharingRules) ? configuration.sharingRules : [],
          automationLogs: Array.isArray(configuration.automationLogs) ? configuration.automationLogs : [],
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
  const actionRows = [
    ...objectData.registeredActions.map((row) => ({ ...row, _kind: 'Registered Action' })),
    ...objectData.actionBindings.map((row) => ({ ...row, _kind: 'Action Binding' })),
    ...actionRules.map((row) => ({ ...row, _kind: 'Rule Action' })),
  ]

  return (
    <div className={`objects-settings-shell mobile-stage-${mobileStage}`}>
      <aside className="objects-list-pane">
        <div className="objects-pane-header">
          <div>
            <strong>Objects</strong>
            <span>{objects.length} configured</span>
          </div>
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
                onClick={() => { setSelectedKey(key); setMobileStage('menu') }}
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
              <button
                type="button"
                className="objects-mobile-back objects-mobile-back--objects"
                onClick={() => setMobileStage('objects')}
                aria-label="Back to Objects"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                className="objects-mobile-back objects-mobile-back--menu"
                onClick={() => setMobileStage('menu')}
                aria-label="Back to object menu"
              >
                <ChevronLeft size={16} />
              </button>
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
                    onClick={() => { setActiveTab(key); setMobileStage('detail') }}
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
                  <ObjectDataList title="Actions & Bindings" rows={actionRows}
                    primary={(row) => row.label || row.name || row.action_key || row.event_key || row.rule_key || 'Action'}
                    secondary={(row) => row.description || row.handler_key || row.event_key || row.trigger_key || row.action_key || ''}
                    meta={(row) => row._kind || ruleActionType(row) || 'action'} />
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

                {activeTab === 'list-views' ? (
                  <ObjectDataList title="List Views" rows={objectData.listViews}
                    primary={(row) => row.label || row.name || row.view_key || 'List View'}
                    secondary={(row) => row.view_key || row.description || ''}
                    meta={(row) => row.is_default ? 'Default' : (row.active === false ? 'Inactive' : 'Active')} />
                ) : null}

                {activeTab === 'approvals' ? (
                  <ObjectDataList title="Approval Processes" rows={objectData.approvalProcesses}
                    primary={(row) => row.name || 'Approval Process'}
                    secondary={(row) => {
                      const steps = Array.isArray(row.steps) ? row.steps : []
                      return steps.length ? steps.map((step) => `${step.step_order}. ${step.label}${step.role_name ? ` · ${step.role_name}` : ''}`).join('  •  ') : 'No approval steps'
                    }}
                    meta={(row) => `${row.lifecycle_status || (row.active === false ? 'INACTIVE' : 'ACTIVE')} · ${Array.isArray(row.steps) ? row.steps.length : 0} step${Array.isArray(row.steps) && row.steps.length === 1 ? '' : 's'}`} />
                ) : null}

                {activeTab === 'assignment' ? (
                  <ObjectDataList title="Assignment Rules" rows={objectData.assignmentRules}
                    primary={(row) => row.name || row.rule_key || 'Assignment Rule'}
                    secondary={(row) => row.rule_key || row.assignment_field || ''}
                    meta={(row) => `${row.target_type || 'Target'} · priority ${row.priority ?? 0}`} />
                ) : null}

                {activeTab === 'reports' ? (
                  <ObjectDataList title="Reports" rows={objectData.reports}
                    primary={(row) => row.label || row.name || row.report_key || 'Report'}
                    secondary={(row) => row.report_key || row.description || ''}
                    meta={(row) => row.active === false ? 'Inactive' : 'Active'} />
                ) : null}

                {activeTab === 'sharing' ? (
                  <div className="objects-config-list">
                    <div className="objects-config-list-head"><strong>Sharing</strong></div>
                    <div className="objects-detail-card">
                      <div><span>Default access</span><strong>{objectData.sharingSettings?.default_access || 'Not configured'}</strong></div>
                      <div><span>Owner field</span><strong>{objectData.sharingSettings?.owner_field_api_name || '—'}</strong></div>
                    </div>
                    <ObjectDataList title="Sharing Rules" rows={objectData.sharingRules}
                      primary={(row) => row.name || row.rule_key || 'Sharing Rule'}
                      secondary={(row) => row.description || row.rule_key || ''}
                      meta={(row) => row.access_level || (row.active === false ? 'Inactive' : 'Active')} />
                  </div>
                ) : null}

                {activeTab === 'automation-logs' ? (
                  <ObjectDataList title="Automation Logs" rows={objectData.automationLogs}
                    primary={(row) => row.rule_name || row.action_type || row.status || 'Automation Run'}
                    secondary={(row) => row.message || row.error_message || row.record_id || ''}
                    meta={(row) => row.status || row.created_at || 'Run'} />
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
