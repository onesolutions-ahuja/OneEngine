import { useEffect, useMemo, useRef, useState } from 'react'
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
    fieldType: field.field_type || 'text',
    options: Array.isArray(field.options) ? field.options : [],
    editable: field.writable !== false && !['formula','rollup','lookup','multiselect','json'].includes(String(field.field_type || '').toLowerCase()),
    render: (row) => readableValue(row?.[field.api_name]),
  }))
}

function savedViewFiltersToUi(filters) {
  const normalized = Array.isArray(filters)
    ? filters
    : filters && typeof filters === 'object'
      ? Object.entries(filters).map(([field, value]) => ({
          field,
          operator: Array.isArray(value) ? 'in' : 'equals',
          value,
        }))
      : []
  const result = {}
  for (const item of normalized) {
    if (!item?.field) continue
    const current = result[item.field] || { values: [], operator: '', value: '' }
    if (item.operator === 'in') {
      const values = Array.isArray(item.value) ? item.value : [item.value]
      current.values = values.map((value) => JSON.stringify(value))
    } else {
      current.operator = item.operator || 'equals'
      current.value = ['is_blank','is_not_blank'].includes(current.operator) ? '' : (item.value ?? '')
    }
    result[item.field] = current
  }
  return result
}

function uiFiltersToMetadata(filters = {}) {
  const result = []
  for (const [field, config] of Object.entries(filters || {})) {
    const selected = Array.isArray(config?.values) ? config.values : []
    if (selected.length) {
      result.push({
        field,
        operator: 'in',
        value: selected.map((item) => {
          try { return JSON.parse(item) } catch { return item }
        }),
      })
    }
    if (config?.operator) {
      result.push({
        field,
        operator: config.operator,
        value: ['is_blank','is_not_blank'].includes(config.operator) ? null : config.value,
      })
    }
  }
  return result
}

function savedViewSortToUi(sort) {
  return {
    key: typeof sort?.field === 'string' ? sort.field : '',
    direction: String(sort?.direction || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc',
  }
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
  const [bulkEditor, setBulkEditor] = useState(null)
  const [detailTab, setDetailTab] = useState('details')
  const [relatedState, setRelatedState] = useState({ key: '', loading: false, rows: [], error: '' })
  const [historyState, setHistoryState] = useState({ loading: false, rows: [], error: '' })
  const [actionBusy, setActionBusy] = useState('')
  const [activeListViewId, setActiveListViewId] = useState('')
  const [listSearch, setListSearch] = useState('')
  const [listFilters, setListFilters] = useState({})
  const [listSort, setListSort] = useState({ key: '', direction: 'asc' })
  const [pageInfo, setPageInfo] = useState({ page: 1, pageSize: 50, total: 0, pages: 0 })
  const rowRequestRef = useRef(0)
  const searchTimerRef = useRef(null)

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
    onRouteChange?.(selectedKey, selectedId || '')
  }, [selectedKey, selectedId])

  const selectedObject = objects.find((item) => objectKey(item) === selectedKey) || null

  useEffect(() => () => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
  }, [])

  const loadRows = async ({
    object = selectedObject,
    listViewId = activeListViewId,
    page = 1,
    search = listSearch,
    filters = listFilters,
    sort = listSort,
  } = {}) => {
    if (!object) return
    const requestId = ++rowRequestRef.current
    const key = objectKey(object)
    setLoadingRows(true)
    setError('')
    try {
      const params = new URLSearchParams()
      params.set('page', String(Math.max(1, Number(page) || 1)))
      if (listViewId) params.set('listViewId', listViewId)
      if (search?.trim()) params.set('search', search.trim())
      params.set('viewFilters', JSON.stringify(uiFiltersToMetadata(filters)))
      if (sort?.key) {
        params.set('sortField', sort.key)
        params.set('sortDirection', sort.direction === 'desc' ? 'desc' : 'asc')
      }
      const response = await apiRequest(`/api/platform/objects/${encodeURIComponent(key)}/records?${params.toString()}`)
      if (requestId !== rowRequestRef.current) return
      const nextRows = Array.isArray(response?.records)
        ? response.records
        : Array.isArray(response?.data)
          ? response.data
          : []
      setRows(nextRows)
      setPageInfo({
        page: Number(response?.page || page || 1),
        pageSize: Number(response?.pageSize || 50),
        total: Number(response?.total || 0),
        pages: Number(response?.pages || 0),
      })
      setSelectedId((current) => {
        if (current && nextRows.some((row) => String(row.id) === String(current))) return current
        if (initialRecordId && current && String(current) === String(initialRecordId)) return current
        return nextRows[0]?.id || ''
      })
    } catch (err) {
      if (requestId !== rowRequestRef.current) return
      setRows([])
      setPageInfo({ page: 1, pageSize: 50, total: 0, pages: 0 })
      setError(err?.message || 'Unable to load records')
    } finally {
      if (requestId === rowRequestRef.current) setLoadingRows(false)
    }
  }

  const loadObject = async (object = selectedObject, forceRefresh = false, preferredListViewId = '') => {
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
      const nextFields = Array.isArray(meta.fields) ? meta.fields : []
      const nextViews = Array.isArray(meta.listViews) ? meta.listViews : []
      const preferred = nextViews.find((view) => String(view.id) === String(preferredListViewId || activeListViewId || ''))
      const selectedView = preferred || meta.defaultListView || nextViews[0] || null
      const nextViewId = selectedView?.id || ''
      const nextFilters = savedViewFiltersToUi(selectedView?.filters)
      const nextSort = savedViewSortToUi(selectedView?.sort)

      setFields(nextFields)
      setRuntimeMeta({
        listViews: nextViews,
        defaultListView: meta.defaultListView || null,
        recordTypes: meta.recordTypes || [],
        relationships: meta.relationships || [],
        layouts: meta.layouts || [],
        defaultDetailLayout: meta.defaultDetailLayout || null,
        defaultCreateLayout: meta.defaultCreateLayout || null,
        buttons: meta.buttons || [],
      })
      setPermissions(permissionRes?.data || null)
      setActiveListViewId(nextViewId)
      setListSearch('')
      setListFilters(nextFilters)
      setListSort(nextSort)
      await loadRows({ object, listViewId: nextViewId, page: 1, search: '', filters: nextFilters, sort: nextSort })
    } catch (err) {
      setFields([])
      setRows([])
      setPermissions(null)
      setRuntimeMeta({ listViews: [], defaultListView: null, recordTypes: [], relationships: [], layouts: [], buttons: [] })
      setActiveListViewId('')
      setListSearch('')
      setListFilters({})
      setListSort({ key: '', direction: 'asc' })
      setPageInfo({ page: 1, pageSize: 50, total: 0, pages: 0 })
      setSelectedId('')
      setDetail(null)
      setError(err?.message || 'Unable to load records')
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

  const handleListViewChange = async (viewId) => {
    if (!selectedObject) return
    const view = runtimeMeta.listViews.find((item) => String(item.id) === String(viewId)) || null
    const nextFilters = savedViewFiltersToUi(view?.filters)
    const nextSort = savedViewSortToUi(view?.sort)
    setActiveListViewId(view?.id || '')
    setListSearch('')
    setListFilters(nextFilters)
    setListSort(nextSort)
    await loadRows({ object: selectedObject, listViewId: view?.id || '', page: 1, search: '', filters: nextFilters, sort: nextSort })
  }

  const handleListSearchChange = (value) => {
    setListSearch(value)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      void loadRows({ object: selectedObject, listViewId: activeListViewId, page: 1, search: value, filters: listFilters, sort: listSort })
    }, 250)
  }

  const handleListFiltersChange = (next) => {
    setListFilters(next)
    void loadRows({ object: selectedObject, listViewId: activeListViewId, page: 1, search: listSearch, filters: next, sort: listSort })
  }

  const handleListSortChange = (next) => {
    setListSort(next)
    void loadRows({ object: selectedObject, listViewId: activeListViewId, page: 1, search: listSearch, filters: listFilters, sort: next })
  }

  const handlePageChange = (page) => {
    void loadRows({ object: selectedObject, listViewId: activeListViewId, page, search: listSearch, filters: listFilters, sort: listSort })
  }

  const saveListView = async (state, mode) => {
    if (!selectedObject) return
    const activeView = runtimeMeta.listViews.find((item) => String(item.id) === String(activeListViewId)) || null
    let label = activeView?.label || 'My View'
    if (mode === 'new') {
      label = window.prompt('Name this personal list view', activeView?.label ? `${activeView.label} Copy` : `My ${objectLabel(selectedObject)}`)?.trim()
      if (!label) return
    }
    try {
      setError('')
      const payload = {
        label,
        columns: state.columns,
        filters: state.filters,
        sort: state.sort,
        pageSize: state.pageSize,
        ...(mode === 'new' ? { scope: 'PERSONAL' } : {}),
      }
      const response = await apiRequest(
        mode === 'new'
          ? `/api/platform/objects/${encodeURIComponent(selectedObject.id)}/list-views`
          : `/api/platform/list-views/${encodeURIComponent(activeListViewId)}`,
        {
          method: mode === 'new' ? 'POST' : 'PUT',
          body: JSON.stringify(payload),
        },
      )
      const saved = response?.data || null
      await loadObject(selectedObject, true, saved?.id || activeListViewId)
    } catch (err) {
      setError(err?.message || 'Unable to save list view')
    }
  }

  const filteredObjects = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return objects
    return objects.filter((object) =>
      `${objectLabel(object)} ${objectKey(object)} ${object.description || ''}`.toLowerCase().includes(q),
    )
  }, [objects, query])

  const activeListView = runtimeMeta.listViews.find((item) => String(item.id) === String(activeListViewId)) || runtimeMeta.defaultListView || null
  const columns = useMemo(() => makeColumns(fields, activeListView), [fields, activeListView])
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
      await loadRows({ object: selectedObject, listViewId: activeListViewId, page: pageInfo.page, search: listSearch, filters: listFilters, sort: listSort })
      const savedId = response?.data?.id
      if (savedId && key === objectKey(selectedObject)) setSelectedId(savedId)
      if (relatedToRefresh) await loadRelated(relatedToRefresh)
    } catch (err) {
      setEditor((current) => ({ ...current, error: err?.message || 'Unable to save record' }))
    }
  }

  const inlineEditRecord = async (row, column, value) => {
    if (!selectedObject || !row?.id || !column?.key || !canEdit) return
    const type = String(column.fieldType || '').toLowerCase()
    let nextValue = value
    if (['number','decimal','currency'].includes(type)) nextValue = value === '' ? null : Number(value)
    if (value === '') nextValue = null
    try {
      const response = await apiRequest(`/api/platform/objects/${encodeURIComponent(objectKey(selectedObject))}/records/${encodeURIComponent(row.id)}`, {
        method: 'PUT',
        body: JSON.stringify({ data: { [column.key]: nextValue }, recordTypeId: row.recordTypeId || row.record_type_id || null }),
      })
      if (response?.success === false) throw new Error(response.message || 'Unable to update record')
      await loadRows({ object: selectedObject, listViewId: activeListViewId, page: pageInfo.page, search: listSearch, filters: listFilters, sort: listSort })
      if (String(selectedId) === String(row.id)) {
        const detailResponse = await apiRequest(`/api/platform/runtime/record-page?objectKey=${encodeURIComponent(objectKey(selectedObject))}&recordId=${encodeURIComponent(row.id)}`)
        setDetail(detailResponse?.data || null)
      }
    } catch (err) {
      setError(err?.message || 'Unable to update record')
    }
  }

  const openBulkEdit = (ids) => {
    const writable = fields.filter((field) => field.active !== false && field.writable !== false && !['formula','rollup','json'].includes(String(field.field_type || '').toLowerCase()))
    setBulkEditor({ ids, fieldKey: writable[0]?.api_name || '', value: '', error: '' })
  }

  const saveBulkEdit = async (event) => {
    event.preventDefault()
    if (!selectedObject || !bulkEditor?.ids?.length || !bulkEditor.fieldKey) return
    const field = fields.find((item) => item.api_name === bulkEditor.fieldKey)
    if (!field) return
    let value = bulkEditor.value
    const type = String(field.field_type || '').toLowerCase()
    if (['number','decimal','currency'].includes(type)) value = value === '' ? null : Number(value)
    if (value === '') value = null
    try {
      for (const id of bulkEditor.ids) {
        const row = rows.find((item) => String(item.id) === String(id))
        await apiRequest(`/api/platform/objects/${encodeURIComponent(objectKey(selectedObject))}/records/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: JSON.stringify({ data: { [bulkEditor.fieldKey]: value }, recordTypeId: row?.recordTypeId || row?.record_type_id || null }),
        })
      }
      setBulkEditor(null)
      await loadRows({ object: selectedObject, listViewId: activeListViewId, page: pageInfo.page, search: listSearch, filters: listFilters, sort: listSort })
    } catch (err) {
      setBulkEditor((current) => ({ ...current, error: err?.message || 'Unable to update selected records' }))
    }
  }

  const bulkDeleteRecords = async (ids) => {
    if (!selectedObject || !ids?.length || !canDelete || !window.confirm(`Delete ${ids.length} selected record${ids.length === 1 ? '' : 's'}?`)) return
    try {
      for (const id of ids) {
        await apiRequest(`/api/platform/objects/${encodeURIComponent(objectKey(selectedObject))}/records/${encodeURIComponent(id)}`, { method: 'DELETE' })
      }
      await loadRows({ object: selectedObject, listViewId: activeListViewId, page: pageInfo.page, search: listSearch, filters: listFilters, sort: listSort })
    } catch (err) {
      setError(err?.message || 'Unable to delete selected records')
    }
  }

  const deleteRecord = async () => {
    if (!selectedObject || !selectedId || !canDelete || !window.confirm('Delete this record?')) return
    try {
      await apiRequest(`/api/platform/objects/${encodeURIComponent(objectKey(selectedObject))}/records/${encodeURIComponent(selectedId)}`, { method: 'DELETE' })
      await loadRows({ object: selectedObject, listViewId: activeListViewId, page: pageInfo.page, search: listSearch, filters: listFilters, sort: listSort })
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
      await loadRows({ object: selectedObject, listViewId: activeListViewId, page: pageInfo.page, search: listSearch, filters: listFilters, sort: listSort })
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
      await loadRows({ object: selectedObject, listViewId: activeListViewId, page: pageInfo.page, search: listSearch, filters: listFilters, sort: listSort })
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
            subtitle={`${pageInfo.total} records`}
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
            onDataChanged={() => loadRows({ object: selectedObject, listViewId: activeListViewId, page: pageInfo.page, search: listSearch, filters: listFilters, sort: listSort })}
            selectedRowId={selectedId}
            onRowSelect={(row) => { setSelectedId(row.id); setDetailTab('details') }}
            listViews={runtimeMeta.listViews}
            activeListViewId={activeListViewId}
            onListViewChange={handleListViewChange}
            onSaveListView={saveListView}
            canUpdateActiveView={Boolean(activeListView?.owner_user_id || activeListView?.scope === 'PERSONAL')}
            serverMode
            searchValue={listSearch}
            onSearchChange={handleListSearchChange}
            sortValue={listSort}
            onSortChange={handleListSortChange}
            filtersValue={listFilters}
            onFiltersChange={handleListFiltersChange}
            pageInfo={pageInfo}
            onPageChange={handlePageChange}
            onInlineEdit={canEdit ? inlineEditRecord : null}
            onBulkEdit={canEdit ? openBulkEdit : null}
            onBulkDelete={canDelete ? bulkDeleteRecords : null}
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

      {bulkEditor ? (
        <div className="workspace-editor-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setBulkEditor(null)}>
          <form className="workspace-editor" onSubmit={saveBulkEdit}>
            <header>
              <div><strong>Edit {bulkEditor.ids.length} selected record{bulkEditor.ids.length === 1 ? '' : 's'}</strong></div>
              <button type="button" onClick={() => setBulkEditor(null)}><X size={15}/></button>
            </header>
            <div className="workspace-editor-body">
              {bulkEditor.error ? <div className="workspace-editor-error">{bulkEditor.error}</div> : null}
              <label>
                <span>Field</span>
                <select value={bulkEditor.fieldKey} onChange={(event) => setBulkEditor((current) => ({ ...current, fieldKey: event.target.value, value: '' }))}>
                  {fields.filter((field) => field.active !== false && field.writable !== false && !['formula','rollup','json'].includes(String(field.field_type || '').toLowerCase())).map((field) => (
                    <option key={field.id || field.api_name} value={field.api_name}>{field.label || field.api_name}</option>
                  ))}
                </select>
              </label>
              {(() => {
                const field = fields.find((item) => item.api_name === bulkEditor.fieldKey)
                return field ? <WorkspaceField field={field} value={bulkEditor.value} onChange={(value) => setBulkEditor((current) => ({ ...current, value }))} /> : null
              })()}
            </div>
            <footer>
              <button type="button" onClick={() => setBulkEditor(null)}>Cancel</button>
              <button type="submit" className="workspace-save"><Save size={13}/> Apply to selected</button>
            </footer>
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
  if (type === 'lookup') {
    return <WorkspaceLookupField field={field} value={value} onChange={onChange} />
  }
  const htmlType = ['number','decimal','currency'].includes(type) ? 'number' : type === 'date' ? 'date' : type === 'datetime' ? 'datetime-local' : type === 'email' ? 'email' : type === 'phone' ? 'tel' : 'text'
  return <label><span>{field.label || field.api_name}</span><input type={htmlType} value={value ?? ''} required={field.required === true} onChange={(e) => onChange(e.target.value)} /></label>
}

function WorkspaceLookupField({ field, value, onChange }) {
  const targetKey = field?.config?.relatedObjectKey || field?.config?.related_object_key || ''
  const [text, setText] = useState('')
  const [options, setOptions] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const lookupTimerRef = useRef(null)

  useEffect(() => {
    if (!value || !targetKey) {
      setText(value ? String(value) : '')
      return
    }
    let live = true
    apiRequest(`/api/platform/objects/${encodeURIComponent(targetKey)}/records/${encodeURIComponent(value)}`)
      .then((response) => {
        if (!live) return
        const record = response?.data?.record || response?.data || response?.record || null
        if (record && typeof record === 'object') setText(recordTitle(record, []))
        else setText(String(value))
      })
      .catch(() => live && setText(String(value)))
    return () => { live = false }
  }, [value, targetKey])

  useEffect(() => () => {
    if (lookupTimerRef.current) clearTimeout(lookupTimerRef.current)
  }, [])

  const search = (next) => {
    setText(next)
    setOpen(true)
    if (!targetKey) return
    if (lookupTimerRef.current) clearTimeout(lookupTimerRef.current)
    lookupTimerRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ page: '1', pageSize: '20' })
        if (next.trim()) params.set('search', next.trim())
        const response = await apiRequest(`/api/platform/objects/${encodeURIComponent(targetKey)}/records?${params.toString()}`)
        setOptions(Array.isArray(response?.records) ? response.records : Array.isArray(response?.data) ? response.data : [])
      } catch {
        setOptions([])
      } finally {
        setLoading(false)
      }
    }, 200)
  }

  const choose = (record) => {
    onChange(record.id)
    setText(recordTitle(record, []))
    setOpen(false)
  }

  return (
    <label className="workspace-lookup-field">
      <span>{field.label || field.api_name}</span>
      <div className="workspace-lookup-input">
        <input
          type="search"
          value={text}
          required={field.required === true}
          placeholder={targetKey ? `Search ${targetKey}…` : 'Search records…'}
          onFocus={() => { setOpen(true); if (!options.length) search('') }}
          onChange={(event) => { onChange(''); search(event.target.value) }}
          onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false) }}
        />
        {value ? <button type="button" onClick={() => { onChange(''); setText(''); setOptions([]) }}>Clear</button> : null}
        {open ? (
          <div className="workspace-lookup-results">
            {loading ? <div>Searching…</div> : options.length ? options.map((record) => (
              <button key={record.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => choose(record)}>
                <strong>{recordTitle(record, [])}</strong>
                <small>{record.id}</small>
              </button>
            )) : <div>No matching records.</div>}
          </div>
        ) : null}
      </div>
    </label>
  )
}
