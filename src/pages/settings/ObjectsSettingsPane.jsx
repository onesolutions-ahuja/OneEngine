import { useEffect, useMemo, useState } from 'react'
import { Box, ChevronLeft, ChevronRight, Ellipsis, ExternalLink, Pencil, Plus, Search, X } from 'lucide-react'
import { apiRequest } from '../../services/api'
import { loadPlatformObjects } from '../../services/settings'
import FieldEditor from './Platform/FieldEditor.jsx'
import RelationshipEditor from './Platform/RelationshipEditor.jsx'
import RecordTypeEditor from './Platform/RecordTypeEditor.jsx'
import LayoutEditor from './Platform/LayoutEditor.jsx'
import RuleEditor from './Platform/RuleEditor.jsx'
import WorkflowAdmin from './Platform/WorkflowAdmin.jsx'
import ActionsAdmin from './Platform/ActionsAdmin.jsx'
import ObjectActionEditor from './Platform/ObjectActionEditor.jsx'
import ApprovalProcessBuilder from './Platform/ApprovalProcessBuilder.jsx'
import ObjectReportsAdmin from './Platform/ObjectReportsAdmin.jsx'
import PermissionSetsAdmin from './Platform/PermissionSetsAdmin.jsx'
import AccessControlAdmin from './Platform/AccessControlAdmin.jsx'
import AssignmentRuleEditor from './Platform/AssignmentRuleEditor.jsx'
import SharingRuleEditor from './Platform/SharingRuleEditor.jsx'
import DuplicateRulesAdmin from './Platform/DuplicateRulesAdmin.jsx'
import WhereUsedPanel from './Platform/WhereUsedPanel.jsx'

const TABS = [
  ['details', 'Details'],
  ['fields', 'Fields & Relationships'],
  ['formula', 'Formula Fields'],
  ['relationships', 'Relationships'],
  ['record-types', 'Record Types'],
  ['layouts', 'Forms / Layouts'],
  ['compact-layouts', 'Compact Layouts'],
  ['list-views', 'List Views'],
  ['validation', 'Validation Rules'],
  ['duplicates', 'Duplicate Management'],
  ['actions', 'Actions & Bindings'],
  ['automation', 'Automation / Flows'],
  ['approvals', 'Approval Processes'],
  ['assignment', 'Assignment Rules'],
  ['buttons', 'Buttons'],
  ['reports', 'Reports'],
  ['sharing', 'Sharing'],
  ['automation-logs', 'Automation Logs'],
  ['permissions', 'Permissions'],
  ['where-used', 'Where Used'],
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

export default function ObjectsSettingsPane({ initialTab = 'details' } = {}) {
  const focusedTab = initialTab === 'assignment' || initialTab === 'sharing' ? initialTab : ''
  const [objects, setObjects] = useState([])
  const [query, setQuery] = useState('')
  const [selectedKey, setSelectedKey] = useState('')
  const [activeTab, setActiveTab] = useState(initialTab || 'details')
  const [mobileStage, setMobileStage] = useState(focusedTab ? 'detail' : 'objects')
  const [fields, setFields] = useState([])
  const [editor, setEditor] = useState(null)
  const [objectLoading, setObjectLoading] = useState(false)
  const [loadedSections, setLoadedSections] = useState({})
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
  const [permissionView, setPermissionView] = useState('effective')
  const [showMoreTabs, setShowMoreTabs] = useState(false)
  const [objectModal, setObjectModal] = useState(null)
  const [objectSaving, setObjectSaving] = useState(false)
  const [objectForm, setObjectForm] = useState({
    label: '',
    pluralLabel: '',
    objectKey: '',
    apiName: '',
    description: '',
    sourceTable: '',
    active: true,
  })

  useEffect(() => {
    if (!initialTab) return
    setEditor(null)
    setActiveTab(initialTab)
    setMobileStage(focusedTab ? 'detail' : 'objects')
  }, [initialTab])

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
    setEditor(null)
    setFields([])
    setLoadedSections({})
    setObjectLoading(false)
    setObjectData({
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
  }, [selectedId])

  useEffect(() => {
    if (!selectedId) return undefined

    const wantsFields = activeTab === 'details' || activeTab === 'fields' || activeTab === 'formula' || activeTab === 'assignment' || activeTab === 'sharing' || activeTab === 'duplicates'
    const wantsRelationships = activeTab === 'details' || activeTab === 'relationships'
    const wantsRules = activeTab === 'details' || activeTab === 'validation' || activeTab === 'actions' || activeTab === 'automation'
    const wantsPermissions = activeTab === 'permissions'
    const wantsConfiguration = activeTab === 'details' || [
      'record-types',
      'layouts',
      'compact-layouts',
      'list-views',
      'actions',
      'approvals',
      'assignment',
      'buttons',
      'reports',
      'sharing',
      'automation-logs',
    ].includes(activeTab)

    const requests = []
    if (wantsFields && !loadedSections.fields) {
      requests.push(['fields', apiRequest(`/api/platform/objects/${encodeURIComponent(selectedId)}/fields`)])
    }
    if (wantsRelationships && !loadedSections.relationships) {
      requests.push(['relationships', apiRequest('/api/platform/relationships')])
    }
    if (wantsRules && !loadedSections.rules) {
      requests.push(['rules', apiRequest('/api/platform/rules')])
    }
    if (wantsPermissions && !loadedSections.permissions) {
      requests.push(['permissions', apiRequest(`/api/platform/objects/${encodeURIComponent(selectedId)}/effective-permissions`)])
    }
    if (wantsConfiguration && !loadedSections.configuration) {
      requests.push(['configuration', apiRequest(`/api/platform/objects/${encodeURIComponent(selectedId)}/configuration`)])
    }

    if (!requests.length) return undefined

    let live = true
    setObjectLoading(true)

    Promise.allSettled(requests.map(([, request]) => request))
      .then((results) => {
        if (!live) return
        const completed = {}

        results.forEach((result, index) => {
          const key = requests[index][0]
          if (result.status !== 'fulfilled') return
          const payload = result.value
          completed[key] = true

          if (key === 'fields') {
            setFields(Array.isArray(payload?.data) ? payload.data : [])
            return
          }

          if (key === 'relationships') {
            const relationships = Array.isArray(payload?.data) ? payload.data : []
            setObjectData((current) => ({
              ...current,
              relationships: relationships.filter((row) =>
                String(row.parent_object_id) === String(selectedId) ||
                String(row.child_object_id) === String(selectedId)),
            }))
            return
          }

          if (key === 'rules') {
            const rules = Array.isArray(payload?.data) ? payload.data : []
            setObjectData((current) => ({
              ...current,
              rules: rules.filter((row) =>
                String(row.object_id) === String(selectedId)
                || (Array.isArray(row.referenced_object_ids)
                  && row.referenced_object_ids.some((objectId) => String(objectId) === String(selectedId)))),
            }))
            return
          }

          if (key === 'permissions') {
            setObjectData((current) => ({ ...current, permissions: payload?.data || null }))
            return
          }

          if (key === 'configuration') {
            const configuration = payload?.data || {}
            setObjectData((current) => ({
              ...current,
              recordTypes: Array.isArray(configuration.recordTypes) ? configuration.recordTypes : [],
              layouts: Array.isArray(configuration.layouts) ? configuration.layouts : [],
              listViews: Array.isArray(configuration.listViews) ? configuration.listViews : [],
              buttons: Array.isArray(configuration.buttons) ? configuration.buttons : [],
              registeredActions: Array.isArray(configuration.registeredActions) ? configuration.registeredActions : [],
              actionBindings: Array.isArray(configuration.actionBindings) ? configuration.actionBindings : [],
              approvalProcesses: Array.isArray(configuration.approvalProcesses) ? configuration.approvalProcesses : [],
              assignmentRules: Array.isArray(configuration.assignmentRules) ? configuration.assignmentRules : [],
              reports: Array.isArray(configuration.reports) ? configuration.reports : [],
              sharingSettings: configuration.sharingSettings || null,
              sharingRules: Array.isArray(configuration.sharingRules) ? configuration.sharingRules : [],
              automationLogs: Array.isArray(configuration.automationLogs) ? configuration.automationLogs : [],
            }))
          }
        })

        if (Object.keys(completed).length) {
          setLoadedSections((current) => ({ ...current, ...completed }))
        }
      })
      .finally(() => {
        if (live) setObjectLoading(false)
      })

    return () => { live = false }
  }, [activeTab, selectedId, loadedSections])

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

  const refreshFields = async () => {
    if (!selectedId) return
    const response = await apiRequest(`/api/platform/objects/${encodeURIComponent(selectedId)}/fields`)
    setFields(Array.isArray(response?.data) ? response.data : [])
    setLoadedSections((current) => ({ ...current, fields: true }))
  }

  const refreshRelationships = async () => {
    if (!selectedId) return
    const response = await apiRequest('/api/platform/relationships')
    const relationships = Array.isArray(response?.data) ? response.data : []
    setObjectData((current) => ({
      ...current,
      relationships: relationships.filter((row) =>
        String(row.parent_object_id) === String(selectedId)
        || String(row.child_object_id) === String(selectedId)),
    }))
    setLoadedSections((current) => ({ ...current, relationships: true }))
  }

  const closeEditor = () => setEditor(null)

  const saveField = async () => {
    await refreshFields()
    closeEditor()
  }

  const saveRelationship = async () => {
    await refreshRelationships()
    closeEditor()
  }

  const refreshConfiguration = async () => {
    if (!selectedId) return
    const response = await apiRequest(`/api/platform/objects/${encodeURIComponent(selectedId)}/configuration`)
    const configuration = response?.data || {}
    setObjectData((current) => ({
      ...current,
      recordTypes: Array.isArray(configuration.recordTypes) ? configuration.recordTypes : [],
      layouts: Array.isArray(configuration.layouts) ? configuration.layouts : [],
      listViews: Array.isArray(configuration.listViews) ? configuration.listViews : [],
      buttons: Array.isArray(configuration.buttons) ? configuration.buttons : [],
      registeredActions: Array.isArray(configuration.registeredActions) ? configuration.registeredActions : [],
      actionBindings: Array.isArray(configuration.actionBindings) ? configuration.actionBindings : [],
      approvalProcesses: Array.isArray(configuration.approvalProcesses) ? configuration.approvalProcesses : [],
      assignmentRules: Array.isArray(configuration.assignmentRules) ? configuration.assignmentRules : [],
      reports: Array.isArray(configuration.reports) ? configuration.reports : [],
      sharingSettings: configuration.sharingSettings || null,
      sharingRules: Array.isArray(configuration.sharingRules) ? configuration.sharingRules : [],
      automationLogs: Array.isArray(configuration.automationLogs) ? configuration.automationLogs : [],
    }))
    setLoadedSections((current) => ({ ...current, configuration: true }))
  }

  const saveLayout = async () => {
    await refreshConfiguration()
    closeEditor()
  }

  const refreshRules = async () => {
    if (!selectedId) return
    const response = await apiRequest('/api/platform/rules')
    const rules = Array.isArray(response?.data) ? response.data : []
    setObjectData((current) => ({
      ...current,
      rules: rules.filter((row) =>
        String(row.object_id) === String(selectedId)
        || (Array.isArray(row.referenced_object_ids)
          && row.referenced_object_ids.some((objectId) => String(objectId) === String(selectedId)))),
    }))
    setLoadedSections((current) => ({ ...current, rules: true }))
  }

  const saveRule = async () => {
    await refreshRules()
    closeEditor()
  }


  const mainTabs = [
    ['details', 'Details'],
    ['fields', 'Fields'],
    ['relationships', 'Relationships'],
    ['record-types', 'Record Types'],
    ['layouts', 'Layouts'],
    ['list-views', 'List Views'],
    ['validation', 'Validation Rules'],
    ['actions', 'Actions & Bindings'],
  ]
  const moreTabs = TABS.filter(([key]) => !mainTabs.some(([mainKey]) => mainKey === key))

  const refreshObjects = async (preferredKey = '') => {
    const rows = await loadPlatformObjects()
    setObjects(rows)
    const nextKey = preferredKey || selectedKey || objectKey(rows[0])
    if (nextKey) setSelectedKey(nextKey)
    return rows
  }

  const openNewObject = () => {
    setObjectModal('create')
    setObjectForm({
      label: '',
      pluralLabel: '',
      objectKey: '',
      apiName: '',
      description: '',
      sourceTable: '',
      active: true,
    })
  }

  const openEditObject = () => {
    if (!selected) return
    setObjectModal('edit')
    setObjectForm({
      label: objectName(selected),
      pluralLabel: selected.plural_label || '',
      objectKey: objectKey(selected),
      apiName: selected.api_name || objectKey(selected),
      description: selected.description || '',
      sourceTable: selected.source_table || '',
      active: selected.active !== false,
    })
  }

  const saveObject = async (event) => {
    event.preventDefault()
    setObjectSaving(true)
    setError('')
    try {
      const creating = objectModal === 'create'
      const response = await apiRequest(
        creating ? '/api/platform/objects' : `/api/platform/objects/${encodeURIComponent(selectedId)}`,
        {
          method: creating ? 'POST' : 'PUT',
          body: JSON.stringify({
            label: objectForm.label,
            pluralLabel: objectForm.pluralLabel || undefined,
            objectKey: objectForm.objectKey || undefined,
            apiName: objectForm.apiName || undefined,
            description: objectForm.description || undefined,
            sourceTable: objectForm.sourceTable || null,
            active: objectForm.active,
          }),
        },
      )
      const saved = response?.data || null
      await refreshObjects(saved ? objectKey(saved) : objectKey(selected))
      setObjectModal(null)
    } catch (err) {
      setError(err?.message || 'Unable to save object')
    } finally {
      setObjectSaving(false)
    }
  }

  const openRecords = () => {
    if (!selected) return
    const path = window.location.pathname || ''
    const base = path.includes('/developer') ? path.slice(0, path.indexOf('/developer')) : ''
    window.location.assign(`${base}/workspace/${encodeURIComponent(objectKey(selected))}`)
  }

  const defaultRecordType = objectData.recordTypes.find((row) => row.is_default === true) || objectData.recordTypes[0] || null
  const defaultLayout = objectData.layouts.find((row) => row.is_default === true || row.page_type === 'detail') || objectData.layouts[0] || null
  const sharing = objectData.sharingSettings || {}

  return (
    <div className={`objects-settings-shell mobile-stage-${mobileStage}`}>
      <aside className="objects-list-pane">
        <div className="objects-pane-header">
          <div>
            <strong>Objects</strong>
            <span>{objects.length} configured</span>
          </div>
          <button type="button" className="objects-primary-action" onClick={openNewObject}><Plus size={14}/> New Object</button>
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
                onClick={() => { setSelectedKey(key); setActiveTab(focusedTab || 'details'); setMobileStage(focusedTab ? 'detail' : 'menu') }}
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
            <div className="objects-detail-header objects-detail-header--hero">
              <button
                type="button"
                className="objects-mobile-back objects-mobile-back--objects"
                onClick={() => setMobileStage('objects')}
                aria-label="Back to Objects"
              >
                <ChevronLeft size={16} />
              </button>
              <div className="objects-detail-icon"><Box size={19} /></div>
              <div className="objects-hero-copy">
                <div className="objects-hero-title">
                  <strong>{objectName(selected)}</strong>
                  <span className={`objects-status-pill ${selected.active === false ? 'is-inactive' : 'is-active'}`}>
                    {selected.active === false ? 'Inactive' : 'Active'}
                  </span>
                </div>
                <span>{objectKey(selected)}</span>
                <p>{selected.description || `${objectName(selected)} object configuration and metadata.`}</p>
              </div>
              <div className="objects-hero-actions">
                <button type="button" className="objects-icon-action" onClick={() => setShowMoreTabs((value) => !value)} aria-label="More options"><Ellipsis size={16}/></button>
                <button type="button" className="objects-secondary-action" onClick={openRecords}><ExternalLink size={14}/> View Records</button>
                <button type="button" className="objects-primary-action" onClick={openEditObject}><Pencil size={14}/> Edit Object</button>
              </div>
            </div>

            {!focusedTab ? (
              <div className="objects-horizontal-tabs-wrap">
                <nav className="objects-horizontal-tabs" aria-label="Object configuration">
                  {mainTabs.map(([key, label]) => (
                    <button key={key} type="button" className={activeTab === key ? 'is-active' : ''} onClick={() => { setActiveTab(key); setMobileStage('detail') }}>
                      {label}
                    </button>
                  ))}
                  <div className="objects-more-tabs">
                    <button type="button" className={moreTabs.some(([key]) => key === activeTab) ? 'is-active' : ''} onClick={() => setShowMoreTabs((value) => !value)} aria-label="More object configuration">
                      <Ellipsis size={16}/>
                    </button>
                    {showMoreTabs ? (
                      <div className="objects-more-menu">
                        {moreTabs.map(([key, label]) => (
                          <button key={key} type="button" className={activeTab === key ? 'is-active' : ''} onClick={() => { setActiveTab(key); setShowMoreTabs(false); setMobileStage('detail') }}>
                            {label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </nav>
              </div>
            ) : null}

            <div className="objects-config-workspace objects-config-workspace--two-panel">
              <div className="objects-config-content">
                {editor?.kind === 'field' ? (
                  <FieldEditor
                    object={selected}
                    field={editor.item || null}
                    fields={fields}
                    onSave={saveField}
                    onCancel={closeEditor}
                    onNavigateDependency={(tab) => {
                      closeEditor()
                      setActiveTab(tab)
                      setMobileStage('detail')
                    }}
                  />
                ) : editor?.kind === 'relationship' ? (
                  <RelationshipEditor
                    relationship={editor.item || null}
                    objects={objects}
                    initialObjectId={selectedId}
                    onSave={saveRelationship}
                    onCancel={closeEditor}
                  />
                ) : editor?.kind === 'layout' ? (
                  <LayoutEditor
                    layout={editor.item || null}
                    objects={objects}
                    initialObjectId={selectedId}
                    initialPageType={editor.pageType || 'detail'}
                    onSave={saveLayout}
                    onCancel={closeEditor}
                  />
                ) : editor?.kind === 'rule' ? (
                  <RuleEditor
                    rule={editor.item || null}
                    objects={objects}
                    initialObjectId={selectedId}
                    onSave={saveRule}
                    onCancel={closeEditor}
                  />
                ) : editor?.kind === 'workflow' ? (
                  <WorkflowAdmin
                    embedded
                    initialWorkflow={editor.item || { object_id: selectedId, object_key: objectKey(selected), objectKey: objectKey(selected), trigger_key: 'after_update', active: false, action: { type: 'workflow', match: 'all', actions: [] } }}
                    onMessage={() => {}}
                    onError={(value) => setError(value || '')}
                    onClose={closeEditor}
                    onSaved={saveRule}
                  />
                ) : editor?.kind === 'approval' ? (
                  <ApprovalProcessBuilder
                    embedded
                    initialProcess={editor.item || null}
                    initialObjectId={selectedId}
                    onMessage={() => {}}
                    onError={(value) => setError(value || '')}
                    onClose={closeEditor}
                    onSaved={async () => { await refreshConfiguration(); closeEditor() }}
                  />
                ) : editor?.kind === 'assignment' ? (
                  <AssignmentRuleEditor
                    object={{ ...selected, id: selectedId }}
                    fields={fields}
                    rule={editor.item || null}
                    onError={(value) => setError(value || '')}
                    onCancel={closeEditor}
                    onSaved={async () => { await refreshConfiguration(); closeEditor() }}
                  />
                ) : editor?.kind === 'sharing' ? (
                  <SharingRuleEditor
                    object={{ ...selected, id: selectedId }}
                    fields={fields}
                    rule={editor.item || null}
                    onError={(value) => setError(value || '')}
                    onCancel={closeEditor}
                    onSaved={async () => { await refreshConfiguration(); closeEditor() }}
                  />
                ) : editor?.kind === 'object-action' ? (
                  <ObjectActionEditor
                    object={{ ...selected, id: selectedId }}
                    action={editor.item || null}
                    onError={(value) => setError(value || '')}
                    onCancel={closeEditor}
                    onSaved={async () => { await refreshConfiguration(); closeEditor() }}
                  />
                ) : activeTab === 'details' ? (
                  <div className="objects-overview-grid">
                    <section className="objects-overview-card">
                      <header><strong>Basic Information</strong><button type="button" onClick={openEditObject} aria-label="Edit object"><Pencil size={13}/></button></header>
                      <div className="objects-overview-rows">
                        <div><span>Label</span><strong>{objectName(selected)}</strong></div>
                        <div><span>API Name</span><strong>{objectKey(selected)}</strong></div>
                        <div><span>Description</span><strong>{selected.description || '—'}</strong></div>
                        <div><span>Object Type</span><strong><em className="objects-info-pill">{selected.company_id ? 'Custom' : 'Standard'}</em></strong></div>
                        <div><span>Status</span><strong><em className={`objects-status-pill ${selected.active === false ? 'is-inactive' : 'is-active'}`}>{selected.active === false ? 'Inactive' : 'Active'}</em></strong></div>
                        <div><span>Source Table</span><strong>{selected.source_table || 'Metadata object'}</strong></div>
                        <div><span>Created Date</span><strong>{selected.created_at ? new Date(selected.created_at).toLocaleString() : '—'}</strong></div>
                        <div><span>Last Modified</span><strong>{selected.updated_at ? new Date(selected.updated_at).toLocaleString() : '—'}</strong></div>
                      </div>
                    </section>

                    <section className="objects-overview-card">
                      <header><strong>Usage</strong></header>
                      <div className="objects-overview-rows">
                        <button type="button" onClick={() => setActiveTab('fields')}><span>Fields</span><strong>{fields.length}</strong></button>
                        <button type="button" onClick={() => setActiveTab('relationships')}><span>Relationships</span><strong>{objectData.relationships.length}</strong></button>
                        <button type="button" onClick={() => setActiveTab('record-types')}><span>Record Types</span><strong>{objectData.recordTypes.length}</strong></button>
                        <button type="button" onClick={() => setActiveTab('layouts')}><span>Page Layouts</span><strong>{objectData.layouts.length}</strong></button>
                        <button type="button" onClick={() => setActiveTab('list-views')}><span>List Views</span><strong>{objectData.listViews.length}</strong></button>
                        <button type="button" onClick={() => setActiveTab('validation')}><span>Validation Rules</span><strong>{validationRules.length}</strong></button>
                        <button type="button" onClick={() => setActiveTab('automation')}><span>Automation / Flows</span><strong>{automationRules.length}</strong></button>
                      </div>
                    </section>

                    <section className="objects-overview-card">
                      <header><strong>Default Settings</strong></header>
                      <div className="objects-overview-rows">
                        <div><span>Default Record Type</span><strong>{defaultRecordType?.label || defaultRecordType?.name || 'Master'}</strong></div>
                        <div><span>Default Page Layout</span><strong>{defaultLayout?.name || defaultLayout?.label || defaultLayout?.layout_key || '—'}</strong></div>
                        <div><span>Allow Search</span><strong><em className="objects-yes-pill">Yes</em></strong></div>
                        <div><span>Allow Reports</span><strong><em className="objects-yes-pill">Yes</em></strong></div>
                        <div><span>Allow Activities</span><strong><em className="objects-yes-pill">Yes</em></strong></div>
                      </div>
                    </section>

                    <section className="objects-overview-card">
                      <header><strong>Sharing & Access</strong><button type="button" onClick={() => setActiveTab('sharing')} aria-label="Edit sharing"><Pencil size={13}/></button></header>
                      <div className="objects-overview-rows">
                        <div><span>Organization Default</span><strong>{sharing.default_access || sharing.defaultAccess || 'Private'}</strong></div>
                        <div><span>External Access</span><strong><em className={sharing.external_access || sharing.externalAccess ? 'objects-yes-pill' : 'objects-no-pill'}>{sharing.external_access || sharing.externalAccess ? 'Yes' : 'No'}</em></strong></div>
                        <div><span>Allow Sharing Rules</span><strong><em className="objects-yes-pill">Yes</em></strong></div>
                        <div><span>Assignment Rules</span><strong>{objectData.assignmentRules.length}</strong></div>
                      </div>
                    </section>
                  </div>
                ) : null}

                {activeTab === 'fields' ? (
                  <div className="objects-config-list">
                    <div className="objects-config-list-head">
                      <strong>Fields & Relationships</strong>
                      <button type="button" className="objects-config-add" onClick={() => setEditor({ kind: 'field', item: null })}><Plus size={13}/> Field</button>
                    </div>
                    {objectLoading ? (
                      <div className="objects-detail-placeholder">Loading fields…</div>
                    ) : normalFields.length ? (
                      <div className="objects-config-rows">
                        {normalFields.map((field) => (
                          <button type="button" className="objects-config-row-button" key={field.id || field.field_id || field.api_name} onClick={() => setEditor({ kind: 'field', item: field })}>
                            <span>
                              <strong>{fieldName(field)}</strong>
                              <small>{field.api_name || field.field_key || '—'}</small>
                            </span>
                            <span>{isRelationshipField(field) ? `Related · ${field.field_type || field.type || 'lookup'}` : (field.field_type || field.type || 'text')}</span>
                          </button>
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
                            <button type="button" className="objects-config-row-button" key={`related-${field.id || field.field_id || field.api_name}`} onClick={() => setEditor({ kind: 'field', item: field })}>
                              <span>
                                <strong>{fieldName(field)}</strong>
                                <small>{field.api_name || field.field_key || '—'}</small>
                              </span>
                              <span>{field.lookup_object_key || field.config?.lookupObjectKey || field.field_type || 'lookup'}</span>
                            </button>
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
                    meta={(field) => field.field_type || field.type || 'formula'}
                    actionLabel="Formula"
                    onAdd={() => setEditor({ kind: 'field', item: { field_type: 'formula', config: {} } })}
                    onRowClick={(field) => setEditor({ kind: 'field', item: field })} />
                ) : null}

                {activeTab === 'relationships' ? (
                  <ObjectDataList title="Relationships" rows={objectData.relationships}
                    primary={(row) => row.relationship_key || 'Relationship'}
                    secondary={(row) => `${row.parent_object_key || ''} → ${row.child_object_key || ''}`}
                    meta={(row) => row.relationship_type || 'lookup'}
                    actionLabel="Relationship"
                    onAdd={() => setEditor({ kind: 'relationship', item: null })}
                    onRowClick={(row) => setEditor({ kind: 'relationship', item: row })} />
                ) : null}

                {activeTab === 'record-types' ? (
                  <RecordTypeEditor object={{ ...selected, id: selectedId }} fields={fields} />
                ) : null}

                {activeTab === 'layouts' ? (
                  <ObjectDataList title="Forms / Layouts" rows={objectData.layouts.filter((row) => row.page_type !== 'compact')}
                    primary={(row) => row.name || row.label || row.layout_key || 'Layout'}
                    secondary={(row) => row.layout_key || row.page_type || ''}
                    meta={(row) => row.page_type || 'layout'}
                    actionLabel="Layout"
                    onAdd={() => setEditor({ kind: 'layout', item: null, pageType: 'detail' })}
                    onRowClick={(row) => setEditor({ kind: 'layout', item: row })} />
                ) : null}

                {activeTab === 'compact-layouts' ? (
                  <ObjectDataList title="Compact Layouts" rows={objectData.layouts.filter((row) => row.page_type === 'compact')}
                    primary={(row) => row.name || row.label || row.layout_key || 'Compact Layout'}
                    secondary={(row) => row.layout_key || ''}
                    meta={(row) => row.is_default ? 'Primary' : (row.active === false ? 'Inactive' : 'Active')}
                    actionLabel="Compact Layout"
                    onAdd={() => setEditor({ kind: 'layout', item: null, pageType: 'compact' })}
                    onRowClick={(row) => setEditor({ kind: 'layout', item: row })} />
                ) : null}

                {activeTab === 'validation' ? (
                  <ObjectDataList title="Validation Rules" rows={validationRules}
                    primary={(row) => row.name || row.rule_key || 'Validation Rule'}
                    secondary={(row) => row.description || row.trigger_key || row.trigger || ''}
                    meta={(row) => row.active === false ? 'Inactive' : 'Active'}
                    actionLabel="Rule"
                    onAdd={() => setEditor({ kind: 'rule', item: null })}
                    onRowClick={(row) => setEditor({ kind: 'rule', item: row })} />
                ) : null}

                {activeTab === 'duplicates' ? (
          objectLoading && !loadedSections.fields ? (
            <div className="objects-detail-placeholder">Loading fields…</div>
          ) : (
            <DuplicateRulesAdmin object={{ ...selected, id: selectedId }} fields={fields} />
          )
        ) : null}

        {activeTab === 'actions' ? (
                  <div className="objects-config-list objects-config-list--stacked">
                    <ObjectDataList title="Object Actions" rows={objectData.registeredActions}
                      primary={(row) => row.label || row.action_key || 'Action'}
                      secondary={(row) => row.description || row.handler_key || row.action_key || ''}
                      meta={(row) => row.handler_key || 'action'}
                      actionLabel="Action"
                      onAdd={() => setEditor({ kind: 'object-action', item: null })}
                      onRowClick={(row) => setEditor({ kind: 'object-action', item: row })} />
                    <ObjectDataList title="Action Bindings" rows={objectData.actionBindings}
                      primary={(row) => row.event_key || row.action_key || 'Binding'}
                      secondary={(row) => row.action_key || ''}
                      meta={(row) => `Order ${row.execution_order ?? 100}`} />
                  </div>
                ) : null}

                {activeTab === 'automation' ? (
                  <ObjectDataList title="Automation / Flows" rows={automationRules}
                    primary={(row) => row.name || row.rule_key || 'Flow'}
                    secondary={(row) => row.trigger_key || row.trigger || ''}
                    meta={(row) => {
                      const steps = Array.isArray(row.action?.actions) ? row.action.actions.length : 0
                      return `${row.active === false ? 'Inactive' : 'Active'} · ${steps} step${steps === 1 ? '' : 's'}`
                    }}
                    actionLabel="Workflow"
                    onAdd={() => setEditor({ kind: 'workflow', item: null })}
                    onRowClick={(row) => setEditor({ kind: 'workflow', item: row })} />
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
                    meta={(row) => `${row.lifecycle_status || (row.active === false ? 'INACTIVE' : 'ACTIVE')} · ${Array.isArray(row.steps) ? row.steps.length : 0} step${Array.isArray(row.steps) && row.steps.length === 1 ? '' : 's'}`}
                    actionLabel="Approval"
                    onAdd={() => setEditor({ kind: 'approval', item: null })}
                    onRowClick={(row) => setEditor({ kind: 'approval', item: row })} />
                ) : null}

                {activeTab === 'assignment' ? (
                  <ObjectDataList title="Assignment Rules" rows={objectData.assignmentRules}
                    primary={(row) => row.name || row.rule_key || 'Assignment Rule'}
                    secondary={(row) => row.rule_key || row.assignment_field || ''}
                    meta={(row) => `${row.target_type || 'Target'} · priority ${row.priority ?? 0}${row.active === false ? ' · Inactive' : ''}`}
                    actionLabel="Assignment Rule"
                    onAdd={() => setEditor({ kind: 'assignment', item: null })}
                    onRowClick={(row) => setEditor({ kind: 'assignment', item: row })} />
                ) : null}

                {activeTab === 'reports' ? (
                  <ObjectReportsAdmin
                    object={{ ...selected, id: selectedId }}
                    onMessage={() => { void refreshConfiguration() }}
                    onError={(value) => setError(value || '')}
                  />
                ) : null}

                {activeTab === 'sharing' ? (
                  <div className="objects-config-list objects-config-list--stacked">
                    <div className="objects-config-list-head"><strong>Sharing</strong></div>
                    <div className="objects-detail-card">
                      <div><span>Default access</span><strong>{objectData.sharingSettings?.default_access || 'Not configured'}</strong></div>
                      <div><span>Owner field</span><strong>{objectData.sharingSettings?.owner_field_api_name || '—'}</strong></div>
                    </div>
                    <ObjectDataList title="Sharing Rules" rows={objectData.sharingRules}
                      primary={(row) => row.name || row.rule_key || 'Sharing Rule'}
                      secondary={(row) => row.rule_type === 'owner' ? `Owner based · ${row.rule_key || ''}` : `Criteria based · ${row.rule_key || ''}`}
                      meta={(row) => `${row.access_level || 'READ'}${row.active === false ? ' · Inactive' : ''}`}
                      actionLabel="Sharing Rule"
                      onAdd={() => setEditor({ kind: 'sharing', item: null })}
                      onRowClick={(row) => setEditor({ kind: 'sharing', item: row })} />
                  </div>
                ) : null}

                {activeTab === 'automation-logs' ? (
                  <ObjectDataList title="Automation Logs" rows={objectData.automationLogs}
                    primary={(row) => row.rule_name || row.action_type || row.status || 'Automation Run'}
                    secondary={(row) => row.message || row.error_message || row.record_id || ''}
                    meta={(row) => row.status || row.created_at || 'Run'} />
                ) : null}

                {activeTab === 'buttons' ? (
                  <div className="objects-config-list">
                    <div className="objects-config-list-head">
                      <strong>Buttons</strong>
                      <button type="button" className="objects-config-add" onClick={() => { setActiveTab('layouts'); setEditor({ kind: 'layout', item: null, pageType: 'detail' }) }}><Plus size={13}/> Open Layout Builder</button>
                    </div>
                    <ObjectDataList title="Configured Buttons" rows={objectData.buttons}
                      primary={(row) => row.label || row.button_key || 'Button'}
                      secondary={(row) => row.button_key || row.target_key || ''}
                      meta={(row) => row.placement || row.variant || 'button'} />
                    <div className="objects-detail-placeholder">Buttons and record-action bindings are authored in Forms / Layouts, where placement, variant and target metadata are stored.</div>
                  </div>
                ) : null}

                {activeTab === 'where-used' ? (
          <WhereUsedPanel
            objectId={selectedId}
            title="Where Used"
            onNavigate={(tab) => {
              setActiveTab(tab)
              setMobileStage('detail')
            }}
          />
        ) : null}

        {activeTab === 'permissions' ? (
                  <div className="objects-permissions-card">
                    <div className="objects-permission-tabs">
                      <button type="button" className={permissionView === 'effective' ? 'is-active' : ''} onClick={() => setPermissionView('effective')}>Effective Access</button>
                      <button type="button" className={permissionView === 'sets' ? 'is-active' : ''} onClick={() => setPermissionView('sets')}>Permission Sets</button>
                      <button type="button" className={permissionView === 'access' ? 'is-active' : ''} onClick={() => setPermissionView('access')}>Public Groups & Queues</button>
                    </div>

                    {permissionView === 'effective' ? (
                      objectData.permissions ? (
                        <>
                          <div className="objects-permission-grid">
                            {['view','create','edit','delete','import','export'].map((key) => (
                              <div key={key}>
                                <span>{key}</span>
                                <strong>{objectData.permissions[`can_${key}`] ? 'Allowed' : 'Denied'}</strong>
                              </div>
                            ))}
                          </div>
                          <div className="objects-detail-card">
                            <div><span>Source</span><strong>{objectData.permissions.source || 'default_deny'}</strong></div>
                            <div><span>Permission sets</span><strong>{(objectData.permissions.permissionSets || []).map((set) => set.name).join(', ') || 'None'}</strong></div>
                            <div><span>Permission groups</span><strong>{(objectData.permissions.permissionSetGroups || []).map((group) => group.name).join(', ') || 'None'}</strong></div>
                            <div><span>OneEngine manager</span><strong>{objectData.permissions.canManageOneEngine ? 'Yes' : 'No'}</strong></div>
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
                      ) : <div className="objects-detail-placeholder">No permission data.</div>
                    ) : permissionView === 'sets' ? (
                      <PermissionSetsAdmin
                        onMessage={() => { void apiRequest(`/api/platform/objects/${encodeURIComponent(selectedId)}/effective-permissions`).then((response) => setObjectData((current) => ({ ...current, permissions: response?.data || null }))).catch(() => {}) }}
                        onError={(value) => setError(value || '')}
                      />
                    ) : (
                      <AccessControlAdmin
                        onMessage={() => {}}
                        onError={(value) => setError(value || '')}
                      />
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </>
        ) : (
          <div className="objects-detail-placeholder">Select an object.</div>
        )}
      </section>

      {objectModal ? (
        <div className="record-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setObjectModal(null) }}>
          <form className="record-dialog objects-object-dialog" onSubmit={saveObject}>
            <div className="record-dialog-header">
              <div><strong>{objectModal === 'create' ? 'New Object' : 'Edit Object'}</strong><span>{objectModal === 'create' ? 'Create platform metadata object' : objectName(selected)}</span></div>
              <button type="button" className="record-dialog-close" onClick={() => setObjectModal(null)} aria-label="Close"><X size={18}/></button>
            </div>
            <div className="record-dialog-body">
              <label>Label<input value={objectForm.label} onChange={(event) => setObjectForm((current) => ({ ...current, label: event.target.value }))} required /></label>
              <label>Plural Label<input value={objectForm.pluralLabel} onChange={(event) => setObjectForm((current) => ({ ...current, pluralLabel: event.target.value }))} /></label>
              <label>Object Key<input value={objectForm.objectKey} onChange={(event) => setObjectForm((current) => ({ ...current, objectKey: event.target.value }))} placeholder="address" required /></label>
              <label>API Name<input value={objectForm.apiName} onChange={(event) => setObjectForm((current) => ({ ...current, apiName: event.target.value }))} placeholder="address" required /></label>
              <label>Source Table<input value={objectForm.sourceTable} onChange={(event) => setObjectForm((current) => ({ ...current, sourceTable: event.target.value }))} placeholder="Optional" /></label>
              <label>Description<textarea rows={3} value={objectForm.description} onChange={(event) => setObjectForm((current) => ({ ...current, description: event.target.value }))} /></label>
              <label className="record-dialog-checkbox"><input type="checkbox" checked={objectForm.active} onChange={(event) => setObjectForm((current) => ({ ...current, active: event.target.checked }))}/> Active</label>
            </div>
            <div className="record-dialog-footer">
              <button type="button" className="record-dialog-secondary" onClick={() => setObjectModal(null)}>Cancel</button>
              <button type="submit" className="record-dialog-primary" disabled={objectSaving}>{objectSaving ? 'Saving…' : objectModal === 'create' ? 'Create Object' : 'Save Changes'}</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}


function ObjectDataList({ title, rows = [], primary, secondary, meta, onAdd, actionLabel = 'New', onRowClick }) {
  return (
    <div className="objects-config-list">
      <div className="objects-config-list-head">
        <strong>{title}</strong>
        {onAdd ? <button type="button" className="objects-config-add" onClick={onAdd}><Plus size={13}/> {actionLabel}</button> : null}
      </div>
      {rows.length ? (
        <div className="objects-config-rows">
          {rows.map((row, index) => (
            onRowClick ? (
              <button type="button" className="objects-config-row-button" key={row.id || row.rule_id || row.layout_id || row.relationship_id || row.button_id || index} onClick={() => onRowClick(row)}>
                <span>
                  <strong>{primary(row)}</strong>
                  <small>{secondary(row)}</small>
                </span>
                <span>{meta(row)}</span>
              </button>
            ) : (
              <div key={row.id || row.rule_id || row.layout_id || row.relationship_id || row.button_id || index}>
                <span>
                  <strong>{primary(row)}</strong>
                  <small>{secondary(row)}</small>
                </span>
                <span>{meta(row)}</span>
              </div>
            )
          ))}
        </div>
      ) : (
        <div className="objects-detail-placeholder">No {title.toLowerCase()} configured.</div>
      )}
    </div>
  )
}
