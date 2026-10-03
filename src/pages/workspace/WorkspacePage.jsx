import { useEffect, useMemo, useState } from 'react'
import { Box, ChevronRight, History, Pencil, Plus, Save, Search, Trash2, X } from 'lucide-react'
import { apiRequest } from '../../services/api'
import { cachedGet } from '../../services/cachedApi'
import RecordListView from '../../components/RecordListView'
import { evaluatePlatformCondition } from '../../utils/platformConditions.js'

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

function fieldsForLayout(fields, layout, context = {}) {
  const readable = (fields || []).filter((field) => field.active !== false && field.readable !== false)
  const definition = layout?.definition || {}
  const components = Array.isArray(definition.components) ? definition.components : []
  const sections = Array.isArray(definition.sections) ? definition.sections : []
  const visibleKeys = []

  if (sections.length) {
    for (const section of [...sections].sort((a, b) => Number(a.order || 0) - Number(b.order || 0))) {
      if (section?.visible === false) continue
      if (!evaluatePlatformCondition(section?.visibilityCondition, readable, context)) continue
      const items = Array.isArray(section.items)
        ? section.items
        : Array.isArray(section.components)
          ? section.components
          : components.filter((component) => component?.section_id === section.id)
      for (const component of items) {
        if (component?.visible === false) continue
        if (!evaluatePlatformCondition(component?.visibilityCondition, readable, context)) continue
        const key = component.field_key || component.fieldKey || component.api_name || component.props?.fieldKey || component.props?.field_key
        if (key) visibleKeys.push(key)
      }
    }
  } else {
    for (const component of components) {
      if (component?.visible === false) continue
      if (!evaluatePlatformCondition(component?.visibilityCondition, readable, context)) continue
      const key = component.field_key || component.fieldKey || component.api_name || component.props?.fieldKey || component.props?.field_key
      if (key) visibleKeys.push(key)
    }
  }

  const keys = visibleKeys.length ? visibleKeys : layoutFieldKeys(layout)
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

const INTERNAL_FIELD_KEYS = new Set(['id','company_id','store_id','record_type_id','recordtypeid','created_by','updated_by','deleted_by'])

function isInternalField(field) {
  const key = String(field?.api_name || '').trim().toLowerCase()
  return !key || INTERNAL_FIELD_KEYS.has(key)
}

function makeColumns(fields, listView = null) {
  const readable = (fields || [])
    .filter((field) => field.readable !== false && field.active !== false)
    .filter((field) => !isInternalField(field))
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

export default function WorkspacePage({ initialObjectKey = '', initialRecordId = '', appKey = '', onRouteChange = null }) {
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
  const [uiContext, setUiContext] = useState({ permissions: [], entitlements: [] })
  const [formFactor, setFormFactor] = useState(() => {
    if (typeof window === 'undefined') return 'desktop'
    if (window.innerWidth <= 650) return 'mobile'
    if (window.innerWidth <= 1024) return 'tablet'
    return 'desktop'
  })

  useEffect(() => {
    let live = true
    setLoadingObjects(true)

    // Workspace is the metadata-backed object manager, not the application
    // navigation menu. A platform object must not disappear here just because
    // it has no Platform Page (or its app/package is not currently exposed in
    // navigation). /api/platform/objects is already protected by
    // oneengine.manage and tenant scoping, while record endpoints enforce the
    // object's own RBAC again when the object is opened.
    cachedGet('/api/platform/objects', {
      cacheKey: 'workspace:object-metadata',
      forceRefresh: true,
    })
      .then((objectResponse) => {
        if (!live) return
        const data = objectResponse?.data?.objects || objectResponse?.data || []
        const list = (Array.isArray(data) ? data : [])
          .filter((item) => item?.active !== false && item?.source_table)
        setObjects(list)

        const requested = initialObjectKey && list.some((item) => objectKey(item) === initialObjectKey)
          ? initialObjectKey
          : ''
        const currentVisible = selectedKey && list.some((item) => objectKey(item) === selectedKey)
        if (requested) setSelectedKey(requested)
        else if (!currentVisible) setSelectedKey(list.length ? objectKey(list[0]) : '')
      })
      .catch((err) => live && setError(err?.message || 'Unable to load Workspace objects'))
      .finally(() => live && setLoadingObjects(false))
    return () => { live = false }
  }, [])

  useEffect(() => {
    let live = true
    apiRequest('/api/platform/runtime/ui-context')
      .then((response) => {
        if (!live) return
        const data = response?.data || {}
        setUiContext({
          ...data,
          permissions: Array.isArray(data.permissions) ? data.permissions : [],
          entitlements: Array.isArray(data.entitlements) ? data.entitlements : [],
        })
      })
      .catch(() => live && setUiContext({ permissions: [], entitlements: [] }))
    return () => { live = false }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const update = () => {
      const next = window.innerWidth <= 650 ? 'mobile' : window.innerWidth <= 1024 ? 'tablet' : 'desktop'
      setFormFactor((current) => current === next ? current : next)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => {
    if (!initialObjectKey || loadingObjects) return
    if (objects.some((item) => objectKey(item) === initialObjectKey) && initialObjectKey !== selectedKey) {
      setSelectedKey(initialObjectKey)
    }
  }, [initialObjectKey, loadingObjects, objects, selectedKey])

  useEffect(() => {
    if (initialRecordId && initialRecordId !== selectedId) setSelectedId(initialRecordId)
  }, [initialRecordId])

  useEffect(() => {
    if (!selectedKey) return
    onRouteChange?.(selectedKey, selectedId || '', appKey || '')
  }, [selectedKey, selectedId, appKey])

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
    apiRequest(`/api/platform/runtime/record-page?objectKey=${encodeURIComponent(objectKey(selectedObject))}&recordId=${encodeURIComponent(selectedId)}&formFactor=${encodeURIComponent(formFactor)}${appKey ? `&appKey=${encodeURIComponent(appKey)}` : ''}`)
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
  }, [selectedId, selectedKey, formFactor])

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

  const fetchEffectiveLayout = async (pageType, recordTypeId = '', targetObject = selectedObject) => {
    if (!targetObject?.id) return null
    const query = new URLSearchParams({
      objectId: String(targetObject.id),
      pageType,
      formFactor,
    })
    if (recordTypeId) query.set('recordTypeId', recordTypeId)
    if (appKey) query.set('appKey', appKey)
    const response = await apiRequest(`/api/platform/layouts/effective?${query.toString()}`)
    return response?.data || null
  }

  const createLayout = runtimeMeta.defaultCreateLayout || null
  const quickCreateLayout = createLayout

  const openCreate = async () => {
    const recordTypeId = defaultRecordTypeId
    const layout = await fetchEffectiveLayout('create', recordTypeId).catch(() => createLayout)
    setEditor({
      mode: 'create',
      values: {},
      recordTypeId,
      resolvedLayout: layout,
      targetKey: objectKey(selectedObject),
      targetLabel: objectLabel(selectedObject),
      targetFields: fields,
      targetRecordTypes: runtimeMeta.recordTypes,
      targetObject: selectedObject,
    })
  }

  const openQuickCreate = async () => {
    const recordTypeId = defaultRecordTypeId
    const layout = await fetchEffectiveLayout('quick_create', recordTypeId).catch(() => quickCreateLayout)
    setEditor({
      mode: 'quick_create',
      values: {},
      recordTypeId,
      resolvedLayout: layout || quickCreateLayout,
      targetKey: objectKey(selectedObject),
      targetLabel: objectLabel(selectedObject),
      targetFields: fields,
      targetRecordTypes: runtimeMeta.recordTypes,
      targetObject: selectedObject,
    })
  }

  const openEdit = async (row) => {
    const recordTypeId = row.recordTypeId || row.record_type_id || ''
    const layout = await fetchEffectiveLayout('edit', recordTypeId).catch(() => detailLayout)
    setEditor({
      mode: 'edit',
      id: row.id,
      values: { ...row },
      recordTypeId,
      resolvedLayout: layout || detailLayout,
      targetKey: objectKey(selectedObject),
      targetLabel: objectLabel(selectedObject),
      targetFields: fields,
      targetRecordTypes: runtimeMeta.recordTypes,
      targetObject: selectedObject,
    })
  }

  const changeEditorRecordType = async (recordTypeId) => {
    setEditor((current) => current ? { ...current, recordTypeId } : current)
    if (!editor) return
    const pageType = editor.mode === 'quick_create' ? 'quick_create' : editor.mode === 'edit' ? 'edit' : 'create'
    const targetObject = editor.targetObject || selectedObject
    try {
      const layout = await fetchEffectiveLayout(pageType, recordTypeId, targetObject)
      setEditor((current) => current ? { ...current, recordTypeId, resolvedLayout: layout } : current)
    } catch {
      setEditor((current) => current ? { ...current, recordTypeId } : current)
    }
  }

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
  const detailLayout = detail?.layout || resolveRecordLayout(runtimeMeta.layouts, 'detail', detailRecordTypeId, runtimeMeta.defaultDetailLayout)
  const visibilityContext = {
    ...uiContext,
    device: formFactor,
    formFactor,
    companyId: uiContext.companyId || null,
    recordTypeId: detailRecordTypeId || '',
    record: detailRecord || {},
    object: selectedObject || {},
    objectState: selectedObject || {},
  }
  const detailFields = fieldsForLayout(rawDetailFields, detailLayout, visibilityContext)
  const outboundRelationships = runtimeMeta.relationships.filter((relationship) => String(relationship.parent_object_id) === String(selectedObject?.id))
  const selectedRecordType = runtimeMeta.recordTypes.find((item) => String(item.id) === String(detailRecord?.recordTypeId || detailRecord?.record_type_id || '')) || null

  const runMetadataButton = async (button) => {
    if (!selectedObject || !selectedId || !button?.button_key) return
    setActionBusy(button.button_key)
    setError('')
    try {
      const response = await apiRequest(`/api/platform/objects/${encodeURIComponent(objectKey(selectedObject))}/records/${encodeURIComponent(selectedId)}/buttons/${encodeURIComponent(button.button_key)}/execute?formFactor=${encodeURIComponent(formFactor)}${appKey ? `&appKey=${encodeURIComponent(appKey)}` : ''}`, {
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
    .filter(({ component }) => evaluatePlatformCondition(component?.visibilityCondition, rawDetailFields, visibilityContext))

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
      const response = await apiRequest(`/api/platform/objects/${encodeURIComponent(objectKey(selectedObject))}/records/${encodeURIComponent(selectedId)}/actions/${encodeURIComponent(actionKey)}/execute?formFactor=${encodeURIComponent(formFactor)}${appKey ? `&appKey=${encodeURIComponent(appKey)}` : ''}`, {
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
      const childObject = meta.object || null
      const resolvedLayout = childObject?.id
        ? await fetchEffectiveLayout('create', recordTypeId, childObject).catch(() => meta.defaultCreateLayout || null)
        : (meta.defaultCreateLayout || null)
      setEditor({
        mode: 'create_related',
        values: { [relationship.child_field_api_name]: selectedId },
        recordTypeId,
        targetKey: relationship.child_object_key,
        targetLabel: relationship.child_object_label || relationship.child_object_key,
        targetFields: childFields,
        targetLayouts: childLayouts,
        targetRecordTypes: childTypes,
        targetObject: childObject,
        resolvedLayout,
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
              <button key={object.id || key} type="button" title={objectLabel(object)} className={key === selectedKey ? 'is-active' : ''} onClick={() => {
                if (key === selectedKey) return
                setSelectedKey(key)
                setSelectedId('')
                setDetail(null)
                setRows([])
                setFields([])
                setDetailTab('details')
                setRelatedState({ key: '', loading: false, rows: [], error: '' })
                setHistoryState({ loading: false, rows: [], error: '' })
                onRouteChange?.(key, '', appKey || '')
              }}>
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
                
              </div>
              <div className="workspace-detail-actions">
                {canCreate && quickCreateLayout ? <button type="button" onClick={openQuickCreate}><Plus size={13}/> Quick Create</button> : null}
                {runtimeMeta.buttons
                  .filter((button) => ['record','workspace_record','detail'].includes(button.placement) || !button.placement)
                  .filter((button) => evaluatePlatformCondition(button.visibility_rule, fields, visibilityContext))
                  .map((button) => (
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
                      <strong>{recordTitle(row, fields)}</strong>
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
                    {(detailFields || []).filter((field) => field.readable !== false && !isInternalField(field)).map((field) => (
                      <div className="workspace-detail-row" key={field.id || field.api_name}>
                        <span>{field.label || field.api_name}</span>
                        <strong>{readableValue(detailRecord?.[field.api_name])}</strong>
                      </div>
                    ))}
                  </section>
                  <section className="workspace-detail-card">
                    <h3>Record Information</h3>
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
              {(editor.targetRecordTypes || runtimeMeta.recordTypes).length ? <label><span>Record Type</span><select value={editor.recordTypeId || ''} onChange={(e) => void changeEditorRecordType(e.target.value)}><option value="">Default</option>{(editor.targetRecordTypes || runtimeMeta.recordTypes).map((type) => <option key={type.id} value={type.id}>{type.name || type.label || type.record_type_key}</option>)}</select></label> : null}
              {fieldsForLayout(
                (editor.targetFields || fields).filter((field) => field.active !== false && field.writable !== false && !['formula','rollup'].includes(field.field_type)),
                editor.resolvedLayout || (
                  editor.mode === 'quick_create' ? quickCreateLayout : editor.mode === 'edit' ? detailLayout : createLayout
                ),
                {
                  ...uiContext,
                  device: formFactor,
                  formFactor,
                  companyId: uiContext.companyId || null,
                  recordTypeId: editor.recordTypeId || '',
                  record: editor.values || {},
                  object: editor.targetObject || selectedObject || {},
                  objectState: editor.targetObject || selectedObject || {},
                },
              )
                .filter((field) => evaluatePlatformCondition(field?.config?.visibilityCondition, editor.targetFields || fields, {
                  ...uiContext,
                  device: formFactor,
                  formFactor,
                  companyId: uiContext.companyId || null,
                  recordTypeId: editor.recordTypeId || '',
                  record: editor.values || {},
                  object: editor.targetObject || selectedObject || {},
                  objectState: editor.targetObject || selectedObject || {},
                }))
                .map((field) => (
                <WorkspaceField
                  key={field.id || field.api_name}
                  field={field}
                  value={editor.values?.[field.api_name]}
                  values={editor.values || {}}
                  onChange={(value) => setEditor((current) => {
                    const nextValues = { ...current.values, [field.api_name]: value };
                    for (const candidate of current.targetFields || fields) {
                      const dependent = candidate?.config?.dependentPicklist || candidate?.config?.dependent_picklist;
                      const controllingField = dependent?.controllingField || dependent?.controlling_field;
                      if (controllingField !== field.api_name) continue;
                      const currentValue = nextValues[candidate.api_name];
                      if (currentValue === null || currentValue === undefined || currentValue === "") continue;
                      const allowed = dependent?.mappings?.[String(currentValue)];
                      if (!Array.isArray(allowed) || !allowed.map(String).includes(String(value))) nextValues[candidate.api_name] = "";
                    }
                    return { ...current, values: nextValues };
                  })}
                />
              ))}
            </div>
            <footer><button type="button" onClick={() => setEditor(null)}>Cancel</button><button type="submit" className="workspace-save"><Save size={13}/> Save</button></footer>
          </form>
        </div>
      ) : null}
    </section>
  )
}

function WorkspaceField({ field, value, values = {}, onChange }) {
  const type = String(field.field_type || 'text').toLowerCase()
  if (type === 'boolean') {
    return <label className="workspace-editor-check"><input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} /><span>{field.label || field.api_name}</span></label>
  }
  if (['picklist','select'].includes(type)) {
    const dependent = field?.config?.dependentPicklist || field?.config?.dependent_picklist
    const controllingField = dependent?.controllingField || dependent?.controlling_field || ''
    const controllingValue = controllingField ? values?.[controllingField] : null
    const options = (Array.isArray(field.options) ? field.options : [])
      .filter((option) => option?.active !== false)
      .filter((option) => {
        if (!controllingField) return true
        if (controllingValue === null || controllingValue === undefined || controllingValue === '') return false
        const optionValue = String(option?.value ?? option?.key ?? option?.label ?? option)
        const allowed = dependent?.mappings?.[optionValue]
        return Array.isArray(allowed) && allowed.map(String).includes(String(controllingValue))
      })
    return <label><span>{field.label || field.api_name}</span><select value={value ?? ''} onChange={(e) => onChange(e.target.value)}><option value="">Select…</option>{options.map((o) => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o.value ?? o}</option>)}</select></label>
  }
  if (type === 'address') {
    const address = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
    const patch = (key, nextValue) => onChange({ ...address, [key]: nextValue })
    return <fieldset className="workspace-editor-structured"><legend>{field.label || field.api_name}</legend><input value={address.line1 || ''} placeholder="Address line 1" onChange={(e) => patch('line1', e.target.value)}/><input value={address.line2 || ''} placeholder="Address line 2" onChange={(e) => patch('line2', e.target.value)}/><input value={address.city || ''} placeholder="City" onChange={(e) => patch('city', e.target.value)}/><input value={address.region || ''} placeholder="County / Region" onChange={(e) => patch('region', e.target.value)}/><input value={address.postcode || ''} placeholder="Postcode" onChange={(e) => patch('postcode', e.target.value)}/><input value={address.country || ''} placeholder="Country" onChange={(e) => patch('country', e.target.value)}/></fieldset>
  }
  if (type === 'location') {
    const location = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
    return <fieldset className="workspace-editor-structured"><legend>{field.label || field.api_name}</legend><input type="number" step="any" min="-90" max="90" value={location.latitude ?? location.lat ?? ''} placeholder="Latitude" onChange={(e) => onChange({ ...location, latitude: e.target.value === '' ? '' : Number(e.target.value) })}/><input type="number" step="any" min="-180" max="180" value={location.longitude ?? location.lng ?? location.lon ?? ''} placeholder="Longitude" onChange={(e) => onChange({ ...location, longitude: e.target.value === '' ? '' : Number(e.target.value) })}/></fieldset>
  }
  if (type === 'auto_number') return <label><span>{field.label || field.api_name}</span><output>{value || 'Generated on save'}</output></label>
  if (['text_area','long_text','rich_text'].includes(type)) return <label><span>{field.label || field.api_name}</span><textarea rows={type === 'rich_text' ? 6 : 4} maxLength={Number(field?.config?.maxLength ?? field?.config?.max_length) || (type === 'text_area' ? 255 : 32768)} value={value ?? ''} onChange={(e) => onChange(e.target.value)}/></label>
  if (type === 'json') return <label><span>{field.label || field.api_name}</span><textarea rows="6" value={typeof value === 'string' ? value : JSON.stringify(value ?? {}, null, 2)} onChange={(e) => { try { onChange(JSON.parse(e.target.value)) } catch {} }}/></label>
  const htmlType = ['number','decimal','currency','percent'].includes(type) ? 'number' : type === 'date' ? 'date' : type === 'datetime' ? 'datetime-local' : type === 'time' ? 'time' : type === 'email' ? 'email' : type === 'phone' ? 'tel' : type === 'url' ? 'url' : 'text'
  return <label><span>{field.label || field.api_name}</span><input type={htmlType} step={type === 'time' ? '0.001' : ['number','decimal','currency','percent'].includes(type) ? (Number.isFinite(Number(field?.config?.scale)) ? String(1 / (10 ** Number(field.config.scale))) : 'any') : undefined} maxLength={Number(field?.config?.maxLength ?? field?.config?.max_length) || ({ text:255, email:80, phone:40, url:255 }[type]) || undefined} value={value ?? ''} required={field.required === true && type !== 'auto_number'} onChange={(e) => onChange(['number','decimal','currency','percent'].includes(type) && e.target.value !== '' ? Number(e.target.value) : e.target.value)} /></label>
}
