import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Search, Settings2, ShieldCheck } from 'lucide-react'
import { apiRequest, getStoredUser, setDeviceServerAddress } from '../../services/api'

const SETTINGS_CATALOG_CACHE_KEY = 'onepos.settings.catalog.v1'

function readSettingsCatalogCache() {
  try {
    const value = JSON.parse(sessionStorage.getItem(SETTINGS_CATALOG_CACHE_KEY) || 'null')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

function writeSettingsCatalogCache(rows) {
  try { sessionStorage.setItem(SETTINGS_CATALOG_CACHE_KEY, JSON.stringify(Array.isArray(rows) ? rows : [])) } catch {}
}

function objectKey(object) {
  return object?.object_key || object?.api_name || object?.key || ''
}

function objectLabel(object) {
  return object?.config?.settingsLabel || object?.label || object?.name || objectKey(object) || 'Settings'
}

function sectionKey(value) {
  return String(value || 'general').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function fieldSection(field) {
  return field?.config?.settingsSection || field?.config?.settings_section || 'General'
}

function fieldGroup(field, object) {
  return field?.config?.settingsGroup || field?.config?.settings_group || object?.config?.settingsGroup || 'System Settings'
}

function fieldValue(record, field) {
  return record?.[field.api_name] ?? ''
}

function currentDeviceKey() {
  const storageKey = 'onepos_device_key'
  try {
    let value = localStorage.getItem(storageKey)
    if (!value) {
      value = typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `device-${Date.now()}`
      localStorage.setItem(storageKey, value)
    }
    return value
  } catch {
    return 'device-local'
  }
}

function currentDeviceName() {
  try {
    return navigator.userAgentData?.platform || navigator.platform || 'This device'
  } catch {
    return 'This device'
  }
}

function displayValue(value) {
  if (value === true) return 'On'
  if (value === false) return 'Off'
  if (value == null || value === '') return '—'
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function optionRows(field) {
  return (Array.isArray(field?.options) ? field.options : []).filter((option) => option?.active !== false).map((option) => ({
    value: typeof option === 'object' ? option.value : option,
    label: typeof option === 'object' ? (option.label ?? option.value) : option,
  }))
}

function MetadataField({ field, value, disabled, onChange, lookupOptions = [] }) {
  const type = String(field?.field_type || 'text').toLowerCase()
  const options = optionRows(field)

  if (type === 'lookup' && lookupOptions.length) {
    return (
      <select value={value ?? ''} disabled={disabled} onChange={(event) => onChange(event.target.value || null)}>
        <option value="">Select…</option>
        {lookupOptions.map((option) => <option key={String(option.value)} value={option.value}>{option.label}</option>)}
      </select>
    )
  }

  if (type === 'boolean') {
    return (
      <button type="button" className={`mac-switch ${value ? 'is-on' : ''}`} disabled={disabled} onClick={() => onChange(!value)}>
        <span />
      </button>
    )
  }

  if (['select', 'picklist'].includes(type) || options.length) {
    return (
      <select value={value ?? ''} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={String(option.value)} value={option.value}>{option.label}</option>)}
      </select>
    )
  }

  if (type === 'multiselect') {
    const selected = Array.isArray(value) ? value : []
    return (
      <select multiple value={selected} disabled={disabled} onChange={(event) => onChange([...event.target.selectedOptions].map((option) => option.value))}>
        {options.map((option) => <option key={String(option.value)} value={option.value}>{option.label}</option>)}
      </select>
    )
  }

  if (['number', 'decimal', 'currency'].includes(type)) {
    return <input type="number" step={type === 'number' ? '1' : '0.01'} value={value ?? ''} disabled={disabled} onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))} />
  }

  if (type === 'date') return <input type="date" value={value ?? ''} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
  if (type === 'datetime') return <input type="datetime-local" value={value ? String(value).slice(0, 16) : ''} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
  if (type === 'email') return <input type="email" value={value ?? ''} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
  if (type === 'phone') return <input type="tel" value={value ?? ''} disabled={disabled} onChange={(event) => onChange(event.target.value)} />

  return <input type="text" value={value ?? ''} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
}

function GenericObjectSettings({ object }) {
  const key = objectKey(object)
  const [fields, setFields] = useState([])
  const [rows, setRows] = useState([])
  const [permissions, setPermissions] = useState(null)
  const [lookupOptions, setLookupOptions] = useState({})
  const [buttons, setButtons] = useState([])
  const [actionBusy, setActionBusy] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [editing, setEditing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    if (!object?.id || !key) return
    setLoading(true)
    setError('')
    try {
      const deviceScoped = object?.config?.settingsDeviceScoped === true || object?.config?.settings_device_scoped === true
      const deviceKeyField = object?.config?.settingsDeviceKeyField || object?.config?.settings_device_key_field || 'device_key'
      const filter = deviceScoped ? `&filter=${encodeURIComponent(JSON.stringify({ [deviceKeyField]: currentDeviceKey() }))}` : ''
      const [fieldRes, recordRes, permissionRes, buttonRes] = await Promise.all([
        apiRequest(`/api/platform/objects/${encodeURIComponent(object.id)}/fields`),
        apiRequest(`/api/platform/objects/${encodeURIComponent(key)}/records?page=1&pageSize=200${filter}`),
        apiRequest(`/api/platform/objects/${encodeURIComponent(object.id)}/effective-permissions`),
        apiRequest(`/api/platform/runtime/objects/${encodeURIComponent(key)}/buttons`).catch(() => ({ data: [] })),
      ])
      const nextFields = Array.isArray(fieldRes?.data) ? fieldRes.data : []
      const nextRows = Array.isArray(recordRes?.records) ? recordRes.records : Array.isArray(recordRes?.data) ? recordRes.data : []
      const lookupFields = nextFields.filter((field) => String(field.field_type || '').toLowerCase() === 'lookup' && (field?.config?.relatedObjectKey || field?.config?.related_object_key))
      const lookupPairs = await Promise.all(lookupFields.map(async (field) => {
        const relatedKey = field?.config?.relatedObjectKey || field?.config?.related_object_key
        try {
          const response = await apiRequest(`/api/platform/objects/${encodeURIComponent(relatedKey)}/records?page=1&pageSize=500`)
          const records = Array.isArray(response?.records) ? response.records : Array.isArray(response?.data) ? response.data : []
          return [field.api_name, records.map((row) => ({
            value: row.id,
            label: row.name || row.label || row.full_name || row.username || row.code || row.api_name || row.id,
          }))]
        } catch {
          return [field.api_name, []]
        }
      }))
      setFields(nextFields)
      setRows(nextRows)
      setPermissions(permissionRes?.data || null)
      setLookupOptions(Object.fromEntries(lookupPairs))
      setButtons(Array.isArray(buttonRes?.data) ? buttonRes.data : [])
      setSelectedId((current) => nextRows.some((row) => String(row.id) === String(current)) ? current : (nextRows[0]?.id || ''))
    } catch (err) {
      setError(err?.message || 'Unable to load settings object')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [object?.id, key])

  const selected = rows.find((row) => String(row.id) === String(selectedId)) || null
  const readable = fields.filter((field) => field.active !== false && field.readable !== false && !['company_id'].includes(field.api_name))
  const writable = fields.filter((field) => field.active !== false && field.writable === true && !['formula', 'rollup'].includes(String(field.field_type || '').toLowerCase()))
  const visibleReadable = readable.filter((field) => field?.config?.settingsHidden !== true && field?.config?.settings_hidden !== true)
  const visibleWritable = writable.filter((field) => field?.config?.settingsHidden !== true && field?.config?.settings_hidden !== true)
  const allowCreate = object?.config?.settingsAllowCreate !== false && object?.config?.settings_allow_create !== false
  const allowEdit = object?.config?.settingsAllowEdit !== false && object?.config?.settings_allow_edit !== false
  const allowDelete = object?.config?.settingsAllowDelete !== false && object?.config?.settings_allow_delete !== false
  const canCreate = allowCreate && permissions?.can_create === true
  const canEdit = allowEdit && permissions?.can_edit === true
  const canDelete = allowDelete && permissions?.can_delete === true

  const startEdit = () => {
    if (!selected || !canEdit) return
    setCreating(false)
    setDraft(Object.fromEntries(writable.map((field) => [field.api_name, selected[field.api_name] ?? ''])))
    setEditing(true)
  }

  const startCreate = () => {
    if (!canCreate) return
    const values = {}
    for (const field of writable) {
      const defaultValue = field?.config?.defaultValue ?? field?.config?.default_value
      if (field?.config?.defaultFromDeviceKey === true || field?.config?.default_from_device_key === true) {
        values[field.api_name] = currentDeviceKey()
      } else if (field?.config?.defaultFromDeviceName === true || field?.config?.default_from_device_name === true) {
        values[field.api_name] = currentDeviceName()
      } else {
        values[field.api_name] = defaultValue !== undefined
          ? defaultValue
          : String(field.field_type || '').toLowerCase() === 'boolean' ? false : ''
      }
    }
    setSelectedId('')
    setDraft(values)
    setCreating(true)
    setEditing(true)
  }

  const save = async (event) => {
    event.preventDefault()
    if (creating ? !canCreate : (!selected || !canEdit)) return
    try {
      const target = creating
        ? `/api/platform/objects/${encodeURIComponent(key)}/records`
        : `/api/platform/objects/${encodeURIComponent(key)}/records/${encodeURIComponent(selected.id)}`
      const response = await apiRequest(target, {
        method: creating ? 'POST' : 'PUT',
        body: JSON.stringify({ data: draft }),
      })
      const serverUrlField = object?.config?.settingsServerUrlField || object?.config?.settings_server_url_field
      if (serverUrlField && Object.prototype.hasOwnProperty.call(draft, serverUrlField)) {
        setDeviceServerAddress(draft[serverUrlField])
      }
      setEditing(false)
      setCreating(false)
      await load()
      if (creating && response?.data?.id) setSelectedId(response.data.id)
    } catch (err) {
      setError(err?.message || (creating ? 'Unable to create record' : 'Unable to save record'))
    }
  }

  const executeButton = async (button) => {
    if (!selected?.id || !button?.button_key) return
    setActionBusy(button.button_key)
    setError('')
    try {
      const response = await apiRequest(`/api/platform/objects/${encodeURIComponent(key)}/records/${encodeURIComponent(selected.id)}/buttons/${encodeURIComponent(button.button_key)}/execute`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      if (response?.success === false) throw new Error(response.message || 'Unable to execute action')
      await load()
    } catch (err) {
      setError(err?.message || 'Unable to execute action')
    } finally {
      setActionBusy('')
    }
  }

  const remove = async () => {
    if (!selected || !canDelete || !window.confirm(`Delete ${objectLabel(object)} record?`)) return
    try {
      await apiRequest(`/api/platform/objects/${encodeURIComponent(key)}/records/${encodeURIComponent(selected.id)}`, { method: 'DELETE' })
      await load()
    } catch (err) {
      setError(err?.message || 'Unable to delete record')
    }
  }

  if (loading) return <div className="settings-card settings-state-card">Loading {objectLabel(object)}…</div>

  return (
    <div className="metadata-settings-object">
      {error ? <div className="settings-error">{error}</div> : null}
      <div className="metadata-settings-object-toolbar">
        <label><Search size={14}/><select value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setEditing(false); setCreating(false) }}>
          <option value="">Select record…</option>
          {rows.map((row) => <option key={row.id} value={row.id}>{row.name || row.full_name || row.username || row.code || row.id}</option>)}
        </select></label>
        {selected ? buttons.filter((button) => ['record','settings_record'].includes(button.placement) || !button.placement).map((button) => (
          <button key={button.id || button.button_key} type="button" disabled={actionBusy === button.button_key} onClick={() => executeButton(button)}>{button.label}</button>
        )) : null}
        {canCreate ? <button type="button" onClick={startCreate}>New</button> : null}
        {selected && canEdit && !creating ? <button type="button" onClick={startEdit}>Edit</button> : null}
        {selected && canDelete ? <button type="button" className="is-danger" onClick={remove}>Delete</button> : null}
      </div>

      {editing ? (
        <form className="settings-card metadata-settings-form" onSubmit={save}>
          {visibleWritable.map((field) => (
            <div className="settings-row" key={field.id || field.api_name}>
              <div><strong>{field.label || field.api_name}</strong>{field.description ? <p>{field.description}</p> : null}</div>
              <MetadataField field={field} value={draft[field.api_name]} disabled={false} lookupOptions={lookupOptions[field.api_name] || []} onChange={(value) => setDraft((current) => ({ ...current, [field.api_name]: value }))} />
            </div>
          ))}
          <div className="metadata-settings-form-actions">
            <button type="button" onClick={() => { setEditing(false); setCreating(false) }}>Cancel</button>
            <button type="submit" className="is-primary">{creating ? 'Create' : 'Save'}</button>
          </div>
        </form>
      ) : !selected ? <div className="settings-card settings-state-card">Select a record.</div> : (
        <div className="settings-card">
          {visibleReadable.map((field) => <div className="settings-row" key={field.id || field.api_name}><strong>{field.label || field.api_name}</strong><span className="settings-value">{displayValue(fieldValue(selected, field))}</span></div>)}
        </div>
      )}
    </div>
  )
}

function SystemSettingsSection({ object, fields, record, permissions, section, onSaved }) {
  const visible = fields.filter((field) => field.active !== false && field.readable !== false && fieldSection(field) === section && !['id', 'company_id', 'updated_at'].includes(field.api_name))
  const canEdit = permissions?.can_edit === true
  const [saving, setSaving] = useState('')
  const [error, setError] = useState('')

  const update = async (field, value) => {
    if (!canEdit || !field.writable || !record?.id) return
    setSaving(field.api_name)
    setError('')
    try {
      await apiRequest(`/api/platform/objects/${encodeURIComponent(objectKey(object))}/records/${encodeURIComponent(record.id)}`, {
        method: 'PUT',
        body: JSON.stringify({ data: { [field.api_name]: value } }),
      })
      await onSaved()
    } catch (err) {
      setError(err?.message || 'Unable to save setting')
    } finally {
      setSaving('')
    }
  }

  return (
    <>
      {error ? <div className="settings-error">{error}</div> : null}
      <div className="settings-card">
        {visible.map((field) => (
          <div className="settings-row" key={field.id || field.api_name}>
            <div><strong>{field.label || field.api_name}</strong>{field.description ? <p>{field.description}</p> : null}</div>
            {field.writable ? (
              <MetadataField field={field} value={fieldValue(record, field)} disabled={!canEdit || saving === field.api_name} onChange={(value) => update(field, value)} />
            ) : <span className="settings-value">{displayValue(fieldValue(record, field))}</span>}
          </div>
        ))}
      </div>
    </>
  )
}

export default function MetadataSettingsPage({ initialSection = '' }) {
  const cachedCatalog = useMemo(() => readSettingsCatalogCache(), [])
  const [query, setQuery] = useState('')
  const [objects, setObjects] = useState(cachedCatalog)
  const [objectPermissions, setObjectPermissions] = useState(() => Object.fromEntries(cachedCatalog.map((object) => [object.id, object.permissions || null])))
  const [sectionedData, setSectionedData] = useState(() => Object.fromEntries(cachedCatalog
    .filter((object) => object?.config?.settingsSectionSource === 'field-config' || object?.config?.settings_section_source === 'field-config')
    .map((object) => [object.id, { fields: Array.isArray(object.fields) ? object.fields : [], rows: [] }])))
  const [active, setActive] = useState(initialSection || '')
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(cachedCatalog.length === 0)
  const [error, setError] = useState('')

  const sectionedObjects = objects.filter((object) => object?.config?.settingsSectionSource === 'field-config' || object?.config?.settings_section_source === 'field-config')

  const loadSectionedRows = async (object) => {
    if (!object?.id) return
    const key = objectKey(object)
    const response = await apiRequest(`/api/platform/objects/${encodeURIComponent(key)}/records?page=1&pageSize=10`)
    const records = Array.isArray(response?.records) ? response.records : Array.isArray(response?.data) ? response.data : []
    setSectionedData((current) => ({
      ...current,
      [object.id]: { ...(current[object.id] || {}), rows: records },
    }))
  }

  useEffect(() => {
    let live = true
    if (!cachedCatalog.length) setLoading(true)
    setError('')
    Promise.all([
      apiRequest('/api/platform/runtime/settings-catalog'),
      Promise.resolve({ user: getStoredUser() }),
    ]).then(async ([catalogRes, meRes]) => {
      if (!live) return
      const hosts = Array.isArray(catalogRes?.data) ? catalogRes.data : []
      writeSettingsCatalogCache(hosts)
      setObjects(hosts)
      setObjectPermissions(Object.fromEntries(hosts.map((object) => [object.id, object.permissions || null])))
      setUser(meRes?.user || meRes?.data?.user || null)

      const sectioned = hosts.filter((object) => object?.config?.settingsSectionSource === 'field-config' || object?.config?.settings_section_source === 'field-config')
      setSectionedData((current) => Object.fromEntries(sectioned.map((object) => [object.id, {
        ...(current[object.id] || {}),
        fields: Array.isArray(object.fields) ? object.fields : [],
        rows: current[object.id]?.rows || [],
      }])))

      const sectionedPairs = await Promise.all(sectioned.map(async (object) => {
        try {
          const recordRes = await apiRequest(`/api/platform/objects/${encodeURIComponent(objectKey(object))}/records?page=1&pageSize=10`)
          return [object.id, {
            fields: Array.isArray(object.fields) ? object.fields : [],
            rows: Array.isArray(recordRes?.records) ? recordRes.records : Array.isArray(recordRes?.data) ? recordRes.data : [],
          }]
        } catch {
          return [object.id, {
            fields: Array.isArray(object.fields) ? object.fields : [],
            rows: [],
          }]
        }
      }))
      if (!live) return
      setSectionedData(Object.fromEntries(sectionedPairs))
    }).catch((err) => live && setError(err?.message || 'Unable to refresh Settings metadata')).finally(() => live && setLoading(false))
    return () => { live = false }
  }, [])

  const entries = useMemo(() => {
    const rows = []
    for (const sectionedObject of sectionedObjects) {
      const sections = new Map()
      const fields = sectionedData[sectionedObject.id]?.fields || []
      for (const field of fields) {
        if (field.active === false || field.readable === false) continue
        const label = fieldSection(field)
        const key = sectionKey(label)
        if (!sections.has(key)) sections.set(key, { key: `sectioned:${objectKey(sectionedObject)}:${key}`, label, group: fieldGroup(field, sectionedObject), type: 'system', section: label, object: sectionedObject })
      }
      rows.push(...sections.values())
    }
    for (const object of objects) {
      if (sectionedObjects.includes(object)) continue
      rows.push({
        key: `object:${objectKey(object)}`,
        label: objectLabel(object),
        group: object?.config?.settingsGroup || 'Settings',
        order: Number(object?.config?.settingsOrder || 999),
        type: 'object',
        object,
      })
    }
    return rows.sort((a, b) => (a.order || 0) - (b.order || 0) || a.label.localeCompare(b.label))
  }, [objects, sectionedData, sectionedObjects])

  const permittedEntries = entries.filter((entry) => {
    const permission = objectPermissions[entry.object?.id]
    return permission?.can_view === true
  })

  const visibleEntries = permittedEntries.filter((entry) => !query.trim() || `${entry.label} ${entry.group}`.toLowerCase().includes(query.trim().toLowerCase()))
  const current = permittedEntries.find((entry) => entry.key === active || sectionKey(entry.label) === sectionKey(active)) || visibleEntries[0] || permittedEntries[0] || null

  useEffect(() => {
    if (!active && current) setActive(current.key)
  }, [current?.key, active])

  const groups = useMemo(() => {
    const result = new Map()
    for (const entry of visibleEntries) {
      if (!result.has(entry.group)) result.set(entry.group, [])
      result.get(entry.group).push(entry)
    }
    return [...result.entries()]
  }, [visibleEntries])

  const profileName = user?.name || user?.full_name || user?.username || 'User'
  const profileRole = user?.role || 'User'
  const initial = profileName.trim().charAt(0).toUpperCase() || 'U'

  return (
    <section className="settings-page">
      <aside className="settings-sidebar">
        <div className="settings-window-title">Settings</div>
        <label className="settings-search"><Search size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" /></label>
        <div className="settings-profile"><div className="settings-avatar">{initial}</div><div><strong>{profileName}</strong><span>{profileRole}</span></div></div>
        <div className="settings-nav">
          {groups.map(([group, items]) => (
            <div className="settings-group" key={group}>
              <div className="metadata-settings-group-label">{group}</div>
              {items.map((entry) => (
                <button key={entry.key} type="button" className={`settings-nav-item ${current?.key === entry.key ? 'is-active' : ''}`} onClick={() => setActive(entry.key)}>
                  <span className="settings-nav-icon settings-nav-icon--gray">{entry.type === 'object' ? <ShieldCheck size={16}/> : <Settings2 size={16}/>}</span>
                  <span>{entry.label}</span><ChevronRight size={14} className="settings-chevron"/>
                </button>
              ))}
            </div>
          ))}
        </div>
      </aside>

      <div className="settings-content">
        <div className="settings-content-header"><h2>{current?.label || 'Settings'}</h2></div>
        <div className="settings-content-body">
          {error ? <div className="settings-error">{error}</div> : null}
          {loading && !current ? <div className="settings-card settings-state-card">Loading Settings…</div> : !current ? (
            <div className="settings-card settings-state-card">No Settings metadata is available for this user.</div>
          ) : current.type === 'system' ? (
            <SystemSettingsSection
              object={current.object}
              fields={sectionedData[current.object.id]?.fields || []}
              record={sectionedData[current.object.id]?.rows?.[0] || null}
              permissions={objectPermissions[current.object.id]}
              section={current.section}
              onSaved={() => loadSectionedRows(current.object)}
            />
          ) : (
            <GenericObjectSettings object={current.object} />
          )}
        </div>
      </div>
    </section>
  )
}
