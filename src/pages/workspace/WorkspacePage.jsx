import { useEffect, useMemo, useState } from 'react'
import { Box, ChevronRight, Pencil, Save, Search, Trash2, X } from 'lucide-react'
import { apiRequest } from '../../services/api'
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

function makeColumns(fields) {
  const safe = (fields || [])
    .filter((field) => field.readable !== false && field.active !== false)
    .filter((field) => field.api_name && !['company_id','store_id'].includes(field.api_name))
    .slice(0, 8)
  return safe.map((field) => ({
    key: field.api_name,
    label: field.label || field.api_name,
    render: (row) => readableValue(row?.[field.api_name]),
  }))
}

export default function WorkspacePage() {
  const [objects, setObjects] = useState([])
  const [query, setQuery] = useState('')
  const [selectedKey, setSelectedKey] = useState('')
  const [fields, setFields] = useState([])
  const [rows, setRows] = useState([])
  const [permissions, setPermissions] = useState(null)
  const [selectedId, setSelectedId] = useState('')
  const [detail, setDetail] = useState(null)
  const [loadingObjects, setLoadingObjects] = useState(true)
  const [loadingRows, setLoadingRows] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [error, setError] = useState('')
  const [editor, setEditor] = useState(null)

  useEffect(() => {
    let live = true
    setLoadingObjects(true)
    apiRequest('/api/platform/objects')
      .then((response) => {
        if (!live) return
        const data = response?.data?.objects || response?.data || []
        const list = Array.isArray(data) ? data.filter((item) => item?.active !== false && item?.source_table) : []
        setObjects(list)
        if (!selectedKey && list.length) setSelectedKey(objectKey(list[0]))
      })
      .catch((err) => live && setError(err?.message || 'Unable to load Workspace objects'))
      .finally(() => live && setLoadingObjects(false))
    return () => { live = false }
  }, [])

  const selectedObject = objects.find((item) => objectKey(item) === selectedKey) || null

  const loadObject = async (object = selectedObject) => {
    if (!object) return
    const key = objectKey(object)
    setLoadingRows(true)
    setError('')
    try {
      const [fieldRes, recordRes, permissionRes] = await Promise.all([
        apiRequest(`/api/platform/objects/${encodeURIComponent(object.id)}/fields`),
        apiRequest(`/api/platform/objects/${encodeURIComponent(key)}/records?page=1&pageSize=200`),
        apiRequest(`/api/platform/objects/${encodeURIComponent(object.id)}/effective-permissions`),
      ])
      const nextFields = Array.isArray(fieldRes?.data) ? fieldRes.data : []
      const nextRows = Array.isArray(recordRes?.records)
        ? recordRes.records
        : Array.isArray(recordRes?.data)
          ? recordRes.data
          : []
      setFields(nextFields)
      setRows(nextRows)
      setPermissions(permissionRes?.data || null)
      const first = nextRows[0]?.id || ''
      setSelectedId((current) => nextRows.some((row) => String(row.id) === String(current)) ? current : first)
    } catch (err) {
      setFields([])
      setRows([])
      setPermissions(null)
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

  const filteredObjects = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return objects
    return objects.filter((object) =>
      `${objectLabel(object)} ${objectKey(object)} ${object.description || ''}`.toLowerCase().includes(q),
    )
  }, [objects, query])

  const columns = useMemo(() => makeColumns(fields), [fields])
  const searchKeys = useMemo(() => columns.map((column) => column.key), [columns])
  const canCreate = permissions?.can_create === true
  const canEdit = permissions?.can_edit === true
  const canDelete = permissions?.can_delete === true

  const openCreate = () => setEditor({ mode: 'create', values: {} })
  const openEdit = (row) => setEditor({ mode: 'edit', id: row.id, values: { ...row } })

  const saveRecord = async (event) => {
    event.preventDefault()
    if (!selectedObject || !editor) return
    const values = { ...editor.values }
    for (const key of Object.keys(values)) {
      if (values[key] === '') values[key] = null
    }
    try {
      const key = objectKey(selectedObject)
      const url = editor.mode === 'create'
        ? `/api/platform/objects/${encodeURIComponent(key)}/records`
        : `/api/platform/objects/${encodeURIComponent(key)}/records/${encodeURIComponent(editor.id)}`
      const response = await apiRequest(url, {
        method: editor.mode === 'create' ? 'POST' : 'PUT',
        body: JSON.stringify({ data: values }),
      })
      if (response?.success === false) throw new Error(response.message || 'Unable to save record')
      setEditor(null)
      await loadObject(selectedObject)
      const savedId = response?.data?.id
      if (savedId) setSelectedId(savedId)
    } catch (err) {
      setEditor((current) => ({ ...current, error: err?.message || 'Unable to save record' }))
    }
  }

  const deleteRecord = async () => {
    if (!selectedObject || !selectedId || !canDelete || !window.confirm('Delete this record?')) return
    try {
      await apiRequest(`/api/platform/objects/${encodeURIComponent(objectKey(selectedObject))}/records/${encodeURIComponent(selectedId)}`, { method: 'DELETE' })
      await loadObject(selectedObject)
    } catch (err) {
      setError(err?.message || 'Unable to delete record')
    }
  }

  const detailRecord = detail?.record || rows.find((row) => String(row.id) === String(selectedId)) || null
  const detailFields = detail?.fields || fields

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
              <button key={object.id || key} type="button" className={key === selectedKey ? 'is-active' : ''} onClick={() => setSelectedKey(key)}>
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
            onDataChanged={() => loadObject(selectedObject)}
            selectedRowId={selectedId}
            onRowSelect={(row) => setSelectedId(row.id)}
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
                {canEdit ? <button type="button" onClick={() => openEdit(detailRecord)}><Pencil size={13}/> Edit</button> : null}
                {canDelete ? <button type="button" className="is-danger" onClick={deleteRecord}><Trash2 size={13}/></button> : null}
              </div>
            </div>
            <div className="workspace-detail-scroll">
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
                {detailRecord.created_at ? <div className="workspace-detail-row"><span>Created</span><strong>{readableValue(detailRecord.created_at)}</strong></div> : null}
                {detailRecord.updated_at ? <div className="workspace-detail-row"><span>Last modified</span><strong>{readableValue(detailRecord.updated_at)}</strong></div> : null}
              </section>
            </div>
          </>
        ) : (
          <div className="workspace-state">Select a record to see its details.</div>
        )}
      </aside>

      {editor ? (
        <div className="workspace-editor-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setEditor(null)}>
          <form className="workspace-editor" onSubmit={saveRecord}>
            <header><div><strong>{editor.mode === 'create' ? 'New' : 'Edit'} {objectLabel(selectedObject)}</strong></div><button type="button" onClick={() => setEditor(null)}><X size={15}/></button></header>
            <div className="workspace-editor-body">
              {editor.error ? <div className="workspace-editor-error">{editor.error}</div> : null}
              {fields.filter((field) => field.active !== false && field.writable !== false && !['formula','rollup'].includes(field.field_type)).map((field) => (
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
