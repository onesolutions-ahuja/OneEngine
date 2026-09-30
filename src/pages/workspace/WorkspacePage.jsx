import { useEffect, useMemo, useState } from 'react'
import { Box, ChevronRight, History, Pencil, Plus, Save, Search, Trash2, X } from 'lucide-react'
import { apiRequest } from '../../services/api'
import { cachedGet } from '../../services/cachedApi'
import RecordListView from '../../components/RecordListView'

function objectKey(object) {
  return object?.object_key || object?.api_name || object?.key || ''
}

function objectLabel(object) {
  return object?.label || object?.name || objectKey(object) || 'Object'
}

function readableValue(value) {
  if (value === true) return 'Yes'
  if (value === false) return 'No'
  if (value == null || value === '') return '—'
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleString()
  }
  return String(value)
}

function recordTitle(record, fields) {
  const preferred = ['name','full_name','title','label','number','sale_number','invoice_number','sku','email']
  for (const key of preferred) if (record?.[key]) return String(record[key])
  for (const field of fields || []) {
    if (['text','email','phone'].includes(String(field.field_type || '').toLowerCase()) && record?.[field.api_name]) {
      return String(record[field.api_name])
    }
  }
  return record?.id ? String(record.id) : 'Record'
}

function layoutFieldKeys(layout) {
  const definition = layout?.definition || {}
  const components = Array.isArray(definition.components) ? definition.components : []
  return components
    .filter((component) => component?.type === 'field' || component?.component_key === 'field')
    .sort((a, b) => Number(a.order ?? 999) - Number(b.order ?? 999))
    .map((component) => component.field_key || component.fieldKey || component.api_name || component.props?.fieldKey || component.props?.field_key)
    .filter(Boolean)
}

function fieldsForLayout(fields, layout) {
  const readable = (fields || []).filter((field) => field.active !== false && field.readable !== false)
  const keys = layoutFieldKeys(layout)
  if (!keys.length) return readable
  const byKey = new Map(readable.map((field) => [field.api_name, field]))
  return keys.map((key) => byKey.get(key)).filter(Boolean)
}

function resolveRecordLayout(layouts, pageType, recordTypeId, fallback = null) {
  const candidates = (layouts || []).filter((layout) => layout.page_type === pageType)
  if (!candidates.length) return fallback
  if (recordTypeId) {
    const typed = candidates.filter((layout) => String(layout.record_type_id || '') === String(recordTypeId))
    const typedDefault = typed.find((layout) => layout.is_default === true) || typed[0]
    if (typedDefault) return typedDefault
  }
  return candidates.find((layout) => !layout.record_type_id && layout.is_default === true)
    || candidates.find((layout) => !layout.record_type_id)
    || fallback
    || candidates[0]
}

function makeColumns(fields, listView = null) {
  const readable = (fields || [])
    .filter((field) => field.readable !== false && field.active !== false)
    .filter((field) => field.api_name && !['company_id','store_id'].includes(field.api_name))
  const configured = Array.isArray(listView?.columns) ? listView.columns : []
  const safe = configured.length
    ? readable.filter((field) => configured.includes(field.api_name) || configured.includes(field.id))
    : readable
  return safe.map((field) => ({
    key: field.api_name,
    label: field.label || field.api_name,
    render: (row) => readableValue(row?.[field.api_name]),
  }))
}

export default function WorkspacePage({ initialObjectKey = '', initialRecordId = '', onRouteChange = null }) {
  const [objects, setObjects] = useState([])
  const [query, setQuery] = useState('')
  const [selectedKey, setSelectedKey] = useState(initialObjectKey || '')
  const [fields, setFields] = useState([])
  const [rows, setRows] = useState([])
  const [permissions, setPermissions] = useState(null)
  const [runtimeMeta, setRuntimeMeta] = useState({ listViews: [], defaultListView: null, recordTypes: [], relationships: [], layouts: [], buttons: [] })
  const [selectedId, setSelectedId] = useState(initialRecordId || '')
  const [detail, setDetail] = useState(null)
  const [loadingObjects, setLoadingObjects] = useState(true)
  const [loadingRows, setLoadingRows] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [error, setError] = useState('')
  const [editor, setEditor] = useState(null)
  const [detailTab, setDetailTab] = useState('details')
  const [relatedState, setRelatedState] = useState({ key: '', loading: false, rows: [], error: '' })
  const [historyState, setHistoryState] = useState({ loading: false, rows: [], error: '' })
  const [actionBusy, setActionBusy] = useState('')

  useEffect(() => {
    let live = true
    setLoadingObjects(true)
    cachedGet('/api/platform/objects',{cacheKey:'workspace:objects',onFresh:(response)=>{ const data=response?.data?.objects||response?.data||[]; const list=Array.isArray(data)?data.filter((item)=>item?.active!==false&&item?.source_table):[]; setObjects(list) }})
      .then((response) => {
        if (!live) return
        const data = response?.data?.objects || response?.data || []
        const list = Array.isArray(data) ? data.filter((item) => item?.active !== false && item?.source_table) : []
        setObjects(list)
        if (!selectedKey && !initialObjectKey && list.length) setSelectedKey(objectKey(list[0]))
      })
      .catch((err) => live && setError(err?.message || 'Unable to load Workspace objects'))
      .finally(() => live && setLoadingObjects(false))
    return () => { live = false }
  }, [])

  useEffect(() => {
    if (initialObjectKey && initialObjectKey !== selectedKey) setSelectedKey(initialObjectKey)
  }, [initialObjectKey])

  useEffect(() => {
    if (initialRecordId && initialRecordId !== selectedId) setSelectedId(initialRecordId)
  }, [initialRecordId])

  useEffect(() => {
    if (!selectedKey) return
    onRouteChange?.(selectedKey, selectedId || '')
  }, [selectedKey, selectedId])

  const selectedObject = objects.find((item) => objectKey(item) === selectedKey) || null

  const loadObject = async (object = selectedObject, forceRefresh = false) => {
    if (!object) return
    const key = objectKey(object)
    setLoadingRows(true)
    setError('')
    try {
      const [workspaceRes, permissionRes] = await Promise.all([
        cachedGet(`/api/platform/runtime/objects/${encodeURIComponent(key)}/workspace`, { cacheKey: `workspace:meta:${key}`, forceRefresh }),
        apiRequest(`/api/platform/objects/${encodeURIComponent(object.id)}/effective-permissions`),
      ])
      const meta = workspaceRes?.data || {}
      const listViewId = meta?.defaultListView?.id || ''
      const recordPath = `/api/platform/objects/${encodeURIComponent(key)}/records?page=1&pageSize=200${listViewId ? `&listViewId=${encodeURIComponent(listViewId)}` : ''}`
      const recordRes = await cachedGet(recordPath, {
        cacheKey: `workspace:records:${key}:${listViewId || 'default'}`,
        forceRefresh,
        onFresh: (fresh) => {
          const nextRows = Array.isArray(fresh?.records) ? fresh.records : Array.isArray(fresh?.data) ? fresh.data : []
          setRows(nextRows)
        },
      })
      const nextFields = Array.isArray(meta.fields) ? meta.fields : []
      const nextRows = Array.isArray(recordRes?.records)
        ? recordRes.records
        : Array.isArray(recordRes?.data)
          ? recordRes.data
          : []
      setFields(nextFields)
      setRows(nextRows)
      setRuntimeMeta({
        listViews: meta.listViews || [],
        defaultListView: meta.defaultListView || null,
        recordTypes: meta.recordTypes || [],
        relationships: meta.relationships || [],
        layouts: meta.layouts || [],
        defaultDetailLayout: meta.defaultDetailLayout || null,
        defaultCreateLayout: meta.defaultCreateLayout || null,
        buttons: meta.buttons || [],
      })
      setPermissions(permissionRes?.data || null)
      const first = nextRows[0]?.id || ''
      setSelectedId((current) => {
        if (current && nextRows.some((row) => String(row.id) === String(current))) return current
        if (initialRecordId && nextRows.some((row) => String(row.id) === String(initialRecordId))) return initialRecordId
        return first
      })
    } catch (err) {
      setFields([])
      setRows([])
      setPermissions(null)
      setRuntimeMeta({ listViews: [], defaultListView: null, recordTypes: [], relationships: [], layouts: [], buttons: [] })
      setSelectedId('')
      setDetail(null)
      setError(err?.message || 'Unable to load records')
    } finally {
      setLoadingRows(false)
    }
  }

  useEffect(() => {
    void loadObject()
  }, [selectedKey])

  useEffect(() => {
    if (!selectedObject || !selectedId) {
      setDetail(null)
      return
    }
    let live = true
    setLoadingDetail(true)
    apiRequest(`/api/platform/runtime/record-page?objectKey=${encodeURIComponent(objectKey(selectedObject))}&recordId=${encodeURIComponent(selectedId)}`)
      .then((response) => {
        if (live) setDetail(response?.data || null)
      })
      .catch((err) => {
        if (live) {
          setDetail(null)
          setError(err?.message || 'Unable to load record')
        }
      })
      .finally(() => live && setLoadingDetail(false))
    return () => { live = false }
  }, [selectedId, selectedKey])

  useEffect(() => {
    if (!selectedObject || !selectedId) {
      setHistoryState({ loading: false, rows: [], error: '' })
      return
    }
    let live = true
    setHistoryState({ loading: true, rows: [], error: '' })
    apiRequest(`/api/platform/objects/${encodeURIComponent(objectKey(selectedObject))}/records/${encodeURIComponent(selectedId)}/history`)
      .then((response) => {
        if (live) setHistoryState({ loading: false, rows: Array.isArray(response?.data) ? response.data : [], error: '' })
      })
      .catch((err) => {
        if (live) setHistoryState({ loading: false, rows: [], error: err?.message || 'Unable to load record history' })
      })
    return () => { live = false }
  }, [selectedId, selectedKey])

  const filteredObjects = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return objects
    return objects.filter((object) =>
      `${objectLabel(object)} ${objectKey(object)} ${object.description || ''}`.toLowerCase().includes(q),
    )
  }, [objects, query])

  const columns = useMemo(() => makeColumns(fields, runtimeMeta.defaultListView), [fields, runtimeMeta.defaultListView])
  const searchKeys = useMemo(() => columns.map((column) => column.key), [columns])
  const canCreate = permissions?.can_create === true
  const canEdit = permissions?.can_edit === true
  const canDelete = permissions?.can_delete === true

  const defaultRecordTypeId = runtimeMeta.recordTypes.find((item) => item.is_default === true)?.id || ''
  const createLayout = resolveRecordLayout(runtimeMeta.layouts, 'create', defaultRecordTypeId, runtimeMeta.defaultCreateLayout)
  const quickCreateLayout = resolveRecordLayout(runtimeMeta.layouts, 'quick_create', defaultRecordTypeId, createLayout)
  const openCreate = () => setEditor({
    mode: 'create',
    values: {},
    recordTypeId: defaultRecordTypeId,
    targetKey: objectKey(selectedObject),
    targetLabel: objectLabel(selectedObject),
    targetFields: fields,
    targetLayouts: runtimeMeta.layouts,
    targetRecordTypes: runtimeMeta.recordTypes,
  })
  const openQuickCreate = () => setEditor({
    mode: 'quick_create',
    values: {},
    recordTypeId: defaultRecordTypeId,
    targetKey: objectKey(selectedObject),
    targetLabel: objectLabel(selectedObject),
    targetFields: fields,
    targetLayouts: runtimeMeta.layouts,
    targetRecordTypes: runtimeMeta.recordTypes,
  })
  const openEdit = (row) => setEditor({
    mode: 'edit',
    id: row.id,
    values: { ...row },
    recordTypeId: row.recordTypeId || row.record_type_id || '',
    targetKey: objectKey(selectedObject),
    targetLabel: objectLabel(selectedObject),
    targetFields: fields,
    targetLayouts: runtimeMeta.layouts,
    targetRecordTypes: runtimeMeta.recordTypes,
  })

  const saveRecord = async (event) => {
    event.preventDefault()
    if (!selectedObject || !editor) return
    const values = { ...editor.values }
    for (const key of Object.keys(values)) {
      if (values[key] === '') values[key] = null
    }
    try {
      const key = editor.targetKey || objectKey(selectedObject)
      const creating = editor.mode === 'create' || editor.mode === 'quick_create' || editor.mode === 'create_related'
      const url = creating
        ? `/api/platform/objects/${encodeURIComponent(key)}/records`
        : `/api/platform/objects/${encodeURIComponent(key)}/records/${encodeURIComponent(editor.id)}`
      const response = await apiRequest(url, {
        method: creating ? 'POST' : 'PUT',
        body: JSON.stringify({ data: values, recordTypeId: editor.recordTypeId || null }),
      })
      if (response?.success === false) throw new Error(response.message || 'Unable to save record')
      const relatedToRefresh = editor.relatedRelationship || null
      setEditor(null)
      await loadObject(selectedObject, true)
      const savedId = response?.data?.id
      if (savedId && key === objectKey(selectedObject)) setSelectedId(savedId)
      if (relatedToRefresh) await loadRelated(relatedToRefresh)
    } catch (err) {
      setEditor((current) => ({ ...current, error: err?.message || 'Unable to save record' }))
    }
  }

  const deleteRecord = async () => {
    if (!selectedObject || !selectedId || !canDelete || !window.confirm('Delete this record?')) return
    try {
      await apiRequest(`/api/platform/objects/${encodeURIComponent(objectKey(selectedObject))}/records/${encodeURIComponent(selectedId)}`, { method: 'DELETE' })
      await loadObject(selectedObject, true)
    } catch (err) {
      setError(err?.message || 'Unable to delete record')
    }
  }

  const detailRecord = detail?.record || rows.find((row) => String(row.id) === String(selectedId)) || null
  const rawDetailFields = detail?.fields || fields
  const detailRecordTypeId = detailRecord?.recordTypeId || detailRecord?.record_type_id || null
  const detailLayout = resolveRecordLayout(runtimeMeta.layouts, 'detail', detailRecordTypeId, runtimeMeta.defaultDetailLayout)
  const detailFields = fieldsForLayout(rawDetailFields, detailLayout)
  const outboundRelationships = runtimeMeta.relationships.filter((relationship) => String(relationship.parent_object_id) === String(selectedObject?.id))
  const selectedRecordType = runtimeMeta.recordTypes.find((item) => String(item.id) === String(detailRecord?.recordTypeId || detailRecord?.record_type_id || '')) || null

  const runMetadataButton = async (button) => {
    if (!selectedObject || !selectedId || !button?.button_key) return
    setActionBusy(button.button_key)
    setError('')
    try {
      const response = await apiRequest(`/api/platform/objects/${encodeURIComponent(objectKey(selectedObject))}/records/${encodeURIComponent(selectedId)}/buttons/${encodeURIComponent(button.button_key)}/execute`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      if (response?.success === false) throw new Error(response.message || 'Action failed')
      await loadObject(selectedObject, true)
    } catch (err) {
      setError(err?.message || 'Unable to execute action')
    } finally {
      setActionBusy('')
    }
  }

  const layoutActionComponents = (detailLayout?.definition?.components || [])
    .map((component, index) => ({ component, index }))
    .filter(({ component }) => component?.type === 'action' && component?.visible !== false)

  const runConfiguredAction = async (component, index) => {
    if (!selectedObject || !selectedId) return
    if (component.action === 'edit') return openEdit(detailRecord)
    if (component.action === 'delete') return deleteRecord()
    if (component.action === 'create_related') {
      const relationship = outboundRelationships.find((item) => item.relationship_key === component.relationship_key)
      if (relationship) return createRelatedRecord(relationship)
      return setError('Related record configuration is incomplete')
    }
    const actionKey = String(component?.id || component?.key || `${component?.action || 'action'}:${index}`)
    if (!['run_workflow', 'call_function'].includes(String(component.action || '').toLowerCase())) {
      return setError(`${component.label || component.action || 'Action'} is configured, but no safe executor is available.`)
    }
    setActionBusy(actionKey)
    setError('')
    try {
      const response = await apiRequest(`/api/platform/objects/${encodeURIComponent(objectKey(selectedObject))}/records/${encodeURIComponent(selectedId)}/actions/${encodeURIComponent(actionKey)}/execute`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      if (response?.success === false) throw new Error(response.message || 'Action failed')
      await loadObject(selectedObject, true)
    } catch (err) {
      setError(err?.message || 'Unable to execute configured action')
    } finally {
      setActionBusy('')
    }
  }

  const createRelatedRecord = async (relationship) => {
    if (!relationship?.child_object_key || !relationship?.child_field_api_name || !selectedId) {
      setError('Related record configuration is incomplete')
      return
    }
    try {
      setActionBusy(`related:${relationship.relationship_key}`)
      setError('')
      const response = await apiRequest(`/api/platform/runtime/objects/${encodeURIComponent(relationship.child_object_key)}/workspace`)
      const meta = response?.data || {}
      const childFields = Array.isArray(meta.fields) ? meta.fields : []
      const childTypes = Array.isArray(meta.recordTypes) ? meta.recordTypes : []
      const childLayouts = Array.isArray(meta.layouts) ? meta.layouts : []
      const recordTypeId = childTypes.find((item) => item.is_default === true)?.id || ''
      setEditor({
        mode: 'create_related',
        values: { [relationship.child_field_api_name]: selectedId },
        recordTypeId,
        targetKey: relationship.child_object_key,
        targetLabel: relationship.child_object_label || relationship.child_object_key,
        targetFields: childFields,
        targetLayouts: childLayouts,
        targetRecordTypes: childTypes,
        relatedRelationship: relationship,
      })
    } catch (err) {
      setError(err?.message || 'Unable to prepare related record')
    } finally {
      setActionBusy('')
    }
  }

  const loadRelated = async (relationship) => {
    if (!selectedObject || !selectedId || !relationship?.relationship_key) return
    setDetailTab('related')
    setRelatedState({ key: relationship.relationship_key, loading: true, rows: [], error: '' })
    try {
      const response = await apiRequest(`/api/platform/objects/${encodeURIComponent(objectKey(selectedObject))}/records/${encodeURIComponent(selectedId)}/related/${encodeURIComponent(relationship.relationship_key)}?pageSize=100`)
      setRelatedState({ key: relationship.relationship_key, loading: false, rows: response?.records || response?.data || [], error: '' })
    } catch (err) {
      setRelatedState({ key: relationship.relationship_key, loading: false, rows: [], error: err?.message || 'Unable to load related records' })
    }
  }

  return (
    <section className="workspace-page">
      <aside className="workspace-object-pane">
        <div className="workspace-pane-title">
          <div><strong>Workspace</strong><span>{objects.length} objects</span></div>
        </div>
        <label className="workspace-object-search"><Search size={14}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search objects" /></label>
        <div className="workspace-object-list">
          {loadingObjects ? <div className="workspace-state">Loading…</div> : filteredObjects.map((object) => {
            const key = objectKey(object)
            return (
              <button key={object.id || key} type="button" title={objectLabel(object)} className={key === selectedKey ? 'is-active' : ''} onClick={() => { setSelectedKey(key); setSelectedId(''); setDetailTab('details') }}>
                <span className="workspace-object-icon"><Box size={14}/></span>
                <span><strong>{objectLabel(object)}</strong><small>{key}</small></span>
                <ChevronRight size={13}/>
              </button>
            )
          })}
        </div>
      </aside>

      <main className="workspace-record-pane">
        {selectedObject ? (
          <RecordListView
            title={objectLabel(selectedObject)}
            subtitle={`${rows.length} records`}
            rows={rows}
            columns={columns}
            searchKeys={searchKeys}
            canCreate={canCreate}
            canEdit={canEdit}
            onCreate={openCreate}
            onEdit={openEdit}
            loading={loadingRows}
            error={error}
            objectKey={objectKey(selectedObject)}
            objectLabel={objectLabel(selectedObject)}
            onDataChanged={() => loadObject(selectedObject, true)}
            selectedRowId={selectedId}
            onRowSelect={(row) => { setSelectedId(row.id); setDetailTab('details') }}
          />
        ) : <div className="workspace-state">Select an object.</div>}
      </main>

      <aside className="workspace-detail-pane">
        {!selectedObject ? null : loadingDetail ? (
          <div className="workspace-state">Loading record…</div>
        ) : detailRecord ? (
          <>
            <div className="workspace-detail-header">
              <div>
                <span>{objectLabel(selectedObject)}</span>
                <strong>{recordTitle(detailRecord, detailFields)}</strong>
                <small>{detailRecord.id}</small>
              </div>
              <div className="workspace-detail-actions">
                {canCreate && quickCreateLayout ? <button type="button" onClick={openQuickCreate}><Plus size={13}/> Quick Create</button> : null}
                {runtimeMeta.buttons.filter((button) => ['record','workspace_record','detail'].includes(button.placement) || !button.placement).map((button) => (
                  <button key={button.id || button.button_key} type="button" disabled={actionBusy === button.button_key} onClick={() => runMetadataButton(button)}>
                    {button.label}
                  </button>
                ))}
                {layoutActionComponents.map(({ component, index }) => {
                  const actionKey = String(component?.id || component?.key || `${component?.action || 'action'}:${index}`)
                  return <button key={actionKey} type="button" disabled={Boolean(actionBusy)} onClick={() => runConfiguredAction(component, index)}>
                    {actionBusy === actionKey ? 'Working…' : (component.label || component.action)}
                  </button>
                })}
                {canEdit ? <button type="button" onClick={() => openEdit(detailRecord)}><Pencil size={13}/> Edit</button> : null}
                {canDelete ? <button type="button" className="is-danger" onClick={deleteRecord}><Trash2 size={13}/></button> : null}
              </div>
            </div>
            <div className="workspace-detail-scroll">
              <div className="workspace-detail-tabs">
                <button type="button" className={detailTab === 'details' ? 'is-active' : ''} onClick={() => setDetailTab('details')}>Details</button>
                <button type="button" className={detailTab === 'history' ? 'is-active' : ''} onClick={() => setDetailTab('history')}><History size={12}/> History</button>
                {outboundRelationships.map((relationship) => (
                  <button key={relationship.id || relationship.relationship_key} type="button" className={detailTab === 'related' && relatedState.key === relationship.relationship_key ? 'is-active' : ''} onClick={() => loadRelated(relationship)}>
                    {relationship.label || relationship.child_object_label || relationship.relationship_key}
                  </button>
                ))}
              </div>
              {detailTab === 'related' ? (
                <section className="workspace-detail-card">
                  <div className="workspace-related-heading">
                    <h3>Related Records</h3>
                    {(() => {
                      const relationship = outboundRelationships.find((item) => item.relationship_key === relatedState.key)
                      return relationship && canCreate ? <button type="button" disabled={Boolean(actionBusy)} onClick={() => createRelatedRecord(relationship)}><Plus size={12}/> New</button> : null
                    })()}
                  </div>
                  {relatedState.loading ? <div className="workspace-state">Loading related records…</div> : relatedState.error ? <div className="workspace-state">{relatedState.error}</div> : relatedState.rows.length ? relatedState.rows.map((row) => (
                    <button className="workspace-related-row" type="button" key={row.id}>
                      <strong>{recordTitle(row, fields)}</strong><span>{row.id}</span>
                    </button>
                  )) : <div className="workspace-state">No related records.</div>}
                </section>
              ) : detailTab === 'history' ? (
                <section className="workspace-detail-card">
                  <h3>Record History</h3>
                  {historyState.loading ? <div className="workspace-state">Loading history…</div> : historyState.error ? <div className="workspace-state">{historyState.error}</div> : historyState.rows.length ? historyState.rows.map((item) => (
                    <div className="workspace-history-row" key={item.id}>
                      <div><strong>{item.action || 'Change'} {item.field_api_name || 'record'}</strong><span>{readableValue(item.old_value)} → {readableValue(item.new_value)}</span></div>
                      <time>{readableValue(item.created_at)}</time>
                    </div>
                  )) : <div className="workspace-state">No history available.</div>}
                </section>
              ) : (
                <>
                  <section className="workspace-detail-card">
                    <h3>Details</h3>
                    {(detailFields || []).filter((field) => field.readable !== false).map((field) => (
                      <div className="workspace-detail-row" key={field.id || field.api_name}>
                        <span>{field.label || field.api_name}</span>
                        <strong>{readableValue(detailRecord?.[field.api_name])}</strong>
                      </div>
                    ))}
                  </section>
                  <section className="workspace-detail-card">
                    <h3>Record Information</h3>
                    <div className="workspace-detail-row"><span>ID</span><strong>{detailRecord.id}</strong></div>
                    {selectedRecordType ? <div className="workspace-detail-row"><span>Record Type</span><strong>{selectedRecordType.name || selectedRecordType.label || selectedRecordType.record_type_key}</strong></div> : null}
                    {detailRecord.created_at ? <div className="workspace-detail-row"><span>Created</span><strong>{readableValue(detailRecord.created_at)}</strong></div> : null}
                    {detailRecord.updated_at ? <div className="workspace-detail-row"><span>Last modified</span><strong>{readableValue(detailRecord.updated_at)}</strong></div> : null}
                  </section>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="workspace-state">Select a record to see its details.</div>
        )}
      </aside>

      {editor ? (
        <div className="workspace-editor-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setEditor(null)}>
          <form className="workspace-editor" onSubmit={saveRecord}>
            <header><div><strong>{editor.mode === 'edit' ? 'Edit' : editor.mode === 'quick_create' ? 'Quick Create' : 'New'} {editor.targetLabel || objectLabel(selectedObject)}</strong></div><button type="button" onClick={() => setEditor(null)}><X size={15}/></button></header>
            <div className="workspace-editor-body">
              {editor.error ? <div className="workspace-editor-error">{editor.error}</div> : null}
              {(editor.targetRecordTypes || runtimeMeta.recordTypes).length ? <label><span>Record Type</span><select value={editor.recordTypeId || ''} onChange={(e) => setEditor((current) => ({ ...current, recordTypeId: e.target.value }))}><option value="">Default</option>{(editor.targetRecordTypes || runtimeMeta.recordTypes).map((type) => <option key={type.id} value={type.id}>{type.name || type.label || type.record_type_key}</option>)}</select></label> : null}
              {fieldsForLayout(
                (editor.targetFields || fields).filter((field) => field.active !== false && field.writable !== false && !['formula','rollup'].includes(field.field_type)),
                resolveRecordLayout(
                  editor.targetLayouts || runtimeMeta.layouts,
                  editor.mode === 'quick_create' ? 'quick_create' : editor.mode === 'edit' ? 'edit' : 'create',
                  editor.recordTypeId,
                  editor.mode === 'quick_create' ? quickCreateLayout : editor.mode === 'edit' ? detailLayout : createLayout,
                ),
              ).map((field) => (
                <WorkspaceField key={field.id || field.api_name} field={field} value={editor.values?.[field.api_name]} onChange={(value) => setEditor((current) => ({ ...current, values: { ...current.values, [field.api_name]: value } }))} />
              ))}
            </div>
            <footer><button type="button" onClick={() => setEditor(null)}>Cancel</button><button type="submit" className="workspace-save"><Save size={13}/> Save</button></footer>
          </form>
        </div>
      ) : null}
    </section>
  )
}

function WorkspaceField({ field, value, onChange }) {
  const type = String(field.field_type || 'text').toLowerCase()
  if (type === 'boolean') {
    return <label className="workspace-editor-check"><input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} /><span>{field.label || field.api_name}</span></label>
  }
  if (['picklist','select'].includes(type)) {
    const options = Array.isArray(field.options) ? field.options : []
    return <label><span>{field.label || field.api_name}</span><select value={value ?? ''} onChange={(e) => onChange(e.target.value)}><option value="">Select…</option>{options.filter((o) => o.active !== false).map((o) => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o.value ?? o}</option>)}</select></label>
  }
  const htmlType = ['number','decimal','currency'].includes(type) ? 'number' : type === 'date' ? 'date' : type === 'datetime' ? 'datetime-local' : type === 'email' ? 'email' : type === 'phone' ? 'tel' : 'text'
  return <label><span>{field.label || field.api_name}</span><input type={htmlType} value={value ?? ''} required={field.required === true} onChange={(e) => onChange(e.target.value)} /></label>
}
