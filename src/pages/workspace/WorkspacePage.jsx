import { useEffect, useMemo, useState } from 'react'
import {
  Box,
  ChevronRight,
  Grid3X3,
  LayoutGrid,
  List,
  MoreHorizontal,
  Pencil,
  Search,
  ShoppingBag,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Store,
  Users,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { apiRequest } from '../../services/api'

function objectKey(object) {
  return object?.object_key || object?.api_name || object?.key || ''
}

function objectLabel(object) {
  return object?.label || object?.name || objectKey(object) || 'Object'
}

function groupLabel(object) {
  return object?.category
    || object?.group
    || object?.module_label
    || object?.module_name
    || object?.package_name
    || object?.package_key
    || ''
}

function titleCase(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function readableDate(value) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed)
}

const appNav = [
  { key: 'workspace', label: 'Workspace', icon: Box },
  { key: 'store', label: 'Store', icon: Store },
  { key: 'builder', label: 'Builder', icon: LayoutGrid },
  { key: 'contacts', label: 'Contacts', icon: Users },
  { key: 'jarves', label: 'Jarvis', icon: Sparkles },
  { key: 'till', label: 'Till', icon: ShoppingCart },
]

export default function WorkspacePage({ onNavigate }) {
  const [objects, setObjects] = useState([])
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState('')
  const [selectedKey, setSelectedKey] = useState('')
  const [selectedTab, setSelectedTab] = useState('details')
  const [viewMode, setViewMode] = useState('list')
  const [showFilter, setShowFilter] = useState(false)
  const [filterMode, setFilterMode] = useState('all')
  const [loading, setLoading] = useState(true)
  const [metaLoading, setMetaLoading] = useState(false)
  const [error, setError] = useState('')
  const [metadata, setMetadata] = useState({
    fields: [],
    relationships: [],
    recordTypes: [],
    layouts: [],
    rules: [],
    buttons: [],
    permissions: null,
  })

  useEffect(() => {
    let live = true
    setLoading(true)
    apiRequest('/api/platform/objects')
      .then((response) => {
        if (!live) return
        const data = response?.data?.objects || response?.data || []
        const rows = Array.isArray(data) ? data.filter((item) => item?.active !== false || item?.active === false) : []
        setObjects(rows)
        if (!selectedKey && rows.length) setSelectedKey(objectKey(rows[0]))
      })
      .catch((err) => live && setError(err?.message || 'Unable to load objects'))
      .finally(() => live && setLoading(false))
    return () => { live = false }
  }, [])

  const selected = objects.find((item) => objectKey(item) === selectedKey) || null
  const selectedId = selected?.id || selected?.object_id || ''

  useEffect(() => {
    if (!selectedId) {
      setMetadata({ fields: [], relationships: [], recordTypes: [], layouts: [], rules: [], buttons: [], permissions: null })
      return undefined
    }
    let live = true
    setMetaLoading(true)
    Promise.all([
      apiRequest(`/api/platform/objects/${encodeURIComponent(selectedId)}/fields`).catch(() => ({ data: [] })),
      apiRequest('/api/platform/relationships').catch(() => ({ data: [] })),
      apiRequest(`/api/platform/objects/${encodeURIComponent(selectedId)}/record-types`).catch(() => ({ data: [] })),
      apiRequest('/api/platform/layouts').catch(() => ({ data: [] })),
      apiRequest('/api/platform/rules').catch(() => ({ data: [] })),
      apiRequest(`/api/platform/objects/${encodeURIComponent(selectedId)}/buttons`).catch(() => ({ data: [] })),
      apiRequest(`/api/platform/objects/${encodeURIComponent(selectedId)}/effective-permissions`).catch(() => ({ data: null })),
    ]).then(([fieldsRes, relationshipsRes, recordTypesRes, layoutsRes, rulesRes, buttonsRes, permissionsRes]) => {
      if (!live) return
      const relationships = Array.isArray(relationshipsRes?.data) ? relationshipsRes.data : []
      const layouts = Array.isArray(layoutsRes?.data) ? layoutsRes.data : []
      const rules = Array.isArray(rulesRes?.data) ? rulesRes.data : []
      setMetadata({
        fields: Array.isArray(fieldsRes?.data) ? fieldsRes.data : [],
        relationships: relationships.filter((row) =>
          String(row.parent_object_id) === String(selectedId) || String(row.child_object_id) === String(selectedId)),
        recordTypes: Array.isArray(recordTypesRes?.data) ? recordTypesRes.data : [],
        layouts: layouts.filter((row) => String(row.object_id) === String(selectedId)),
        rules: rules.filter((row) => String(row.object_id) === String(selectedId)),
        buttons: Array.isArray(buttonsRes?.data) ? buttonsRes.data : [],
        permissions: permissionsRes?.data || null,
      })
    }).finally(() => live && setMetaLoading(false))
    return () => { live = false }
  }, [selectedId])

  const groups = useMemo(() => {
    const counts = new Map()
    for (const object of objects) {
      const label = groupLabel(object)
      if (!label) continue
      counts.set(label, (counts.get(label) || 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [objects])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return objects.filter((object) => {
      if (group && groupLabel(object) !== group) return false
      if (filterMode === 'standard' && object.company_id) return false
      if (filterMode === 'custom' && !object.company_id) return false
      if (filterMode === 'active' && object.active === false) return false
      if (filterMode === 'inactive' && object.active !== false) return false
      if (!q) return true
      return `${objectLabel(object)} ${objectKey(object)} ${object.description || ''} ${groupLabel(object)}`.toLowerCase().includes(q)
    })
  }, [objects, query, group, filterMode])

  const selectObject = (object) => {
    setSelectedKey(objectKey(object))
    setSelectedTab('details')
  }

  const tabs = [
    ['details', 'Details', null],
    ['fields', 'Fields', metadata.fields.length],
    ['relationships', 'Relationships', metadata.relationships.length],
    ['layouts', 'Layouts', metadata.layouts.length],
    ['rules', 'Rules', metadata.rules.length],
  ]

  return (
    <section className="workspace-page workspace-object-manager">
      <aside className="workspace-app-rail">
        <nav>
          {appNav.map(({ key, label, icon: Icon }, index) => (
            <motion.button
              key={key}
              type="button"
              className={key === 'workspace' ? 'is-active' : ''}
              onClick={() => key !== 'workspace' && onNavigate?.(key)}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ type: 'spring', mass: .12, stiffness: 260, damping: 22, delay: index * .025 }}
              whileHover={{ x: 3, scale: 1.01 }}
              whileTap={{ scale: .97 }}
            >
              <span className={`workspace-app-icon workspace-app-icon--${key}`}><Icon size={16} /></span>
              <strong>{label}</strong>
            </motion.button>
          ))}
        </nav>
      </aside>

      <main className="workspace-manager-main">
        <header className="workspace-manager-header">
          <div className="workspace-breadcrumb">
            <span>⌂</span><ChevronRight size={12}/><span>Workspace</span><ChevronRight size={12}/><strong>Objects</strong>
          </div>
          <div className="workspace-title-row">
            <div>
              <h1>Objects</h1>
              <p>Manage your data objects, fields, layouts, and rules</p>
            </div>
            <div className="workspace-title-actions">
              <label className="workspace-header-search"><Search size={15}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search objects..." /></label>
              <div className="workspace-view-toggle">
                <button type="button" className={viewMode === 'list' ? 'is-active' : ''} onClick={() => setViewMode('list')}><List size={16}/></button>
                <button type="button" className={viewMode === 'grid' ? 'is-active' : ''} onClick={() => setViewMode('grid')}><Grid3X3 size={15}/></button>
              </div>
              <div className="workspace-filter-wrap">
                <button type="button" className={showFilter ? 'is-active' : ''} onClick={() => setShowFilter((value) => !value)}><SlidersHorizontal size={15}/> Filter</button>
                {showFilter ? (
                  <motion.div className="workspace-filter-popover" initial={{ opacity: 0, y: -6, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }}>
                    {[
                      ['all', 'All objects'],
                      ['standard', 'Standard'],
                      ['custom', 'Custom'],
                      ['active', 'Active'],
                      ['inactive', 'Inactive'],
                    ].map(([key, label]) => <button key={key} type="button" className={filterMode === key ? 'is-active' : ''} onClick={() => { setFilterMode(key); setShowFilter(false) }}>{label}</button>)}
                  </motion.div>
                ) : null}
              </div>
              <button type="button" className="workspace-new-object" onClick={() => onNavigate?.('builder')}><span>＋</span> New Object</button>
            </div>
          </div>
        </header>

        <div className="workspace-manager-body">
          <aside className="workspace-group-pane">
            <button type="button" className={!group ? 'is-active' : ''} onClick={() => setGroup('')}>
              <span><Box size={14}/> All Objects</span><b>{objects.length}</b>
            </button>
            {groups.map(([name, count]) => (
              <button key={name} type="button" className={group === name ? 'is-active' : ''} onClick={() => setGroup(name)}>
                <span><ShoppingBag size={14}/> {titleCase(name)}</span><b>{count}</b>
              </button>
            ))}
          </aside>

          <section className={`workspace-object-table-wrap ${viewMode === 'grid' ? 'is-grid' : ''}`}>
            {loading ? <div className="workspace-state">Loading objects…</div> : error ? <div className="workspace-state">{error}</div> : viewMode === 'list' ? (
              <table className="workspace-object-table">
                <thead><tr><th>Label ↕</th><th>API Name</th><th>Type</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {filtered.map((object) => {
                    const key = objectKey(object)
                    const active = key === selectedKey
                    return (
                      <tr key={object.id || key} className={active ? 'is-selected' : ''} onClick={() => selectObject(object)}>
                        <td><span className="workspace-table-object-icon"><Box size={14}/></span><strong>{objectLabel(object)}</strong></td>
                        <td>{key}</td>
                        <td><span className="workspace-type-chip">{object.company_id ? 'Custom' : 'Standard'}</span></td>
                        <td><span className={`workspace-status-chip ${object.active === false ? 'is-off' : ''}`}><i/>{object.active === false ? 'Inactive' : 'Active'}</span></td>
                        <td><MoreHorizontal size={15}/></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : (
              <div className="workspace-object-grid">
                {filtered.map((object, index) => {
                  const key = objectKey(object)
                  return (
                    <motion.button key={object.id || key} type="button" className={key === selectedKey ? 'is-selected' : ''} onClick={() => selectObject(object)}
                      initial={{ opacity: 0, y: 8, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ type: 'spring', mass: .12, stiffness: 250, damping: 22, delay: Math.min(.16, index * .018) }}>
                      <span className="workspace-grid-icon"><Box size={21}/></span>
                      <strong>{objectLabel(object)}</strong><small>{key}</small>
                    </motion.button>
                  )
                })}
              </div>
            )}
            {!loading && !filtered.length ? <div className="workspace-state">No matching objects.</div> : null}
          </section>

          <aside className="workspace-object-detail">
            {!selected ? <div className="workspace-state">Select an object.</div> : (
              <>
                <div className="workspace-object-detail-head">
                  <div className="workspace-detail-title-icon"><ShoppingCart size={21}/></div>
                  <div className="workspace-detail-title-copy"><strong>{objectLabel(selected)}</strong><span>{objectKey(selected)}</span></div>
                  <button type="button" onClick={() => onNavigate?.('builder')}><Pencil size={13}/> Edit</button>
                  <button type="button" className="workspace-detail-more"><MoreHorizontal size={15}/></button>
                </div>
                <div className="workspace-object-tabs">
                  {tabs.map(([key, label, count]) => (
                    <button key={key} type="button" className={selectedTab === key ? 'is-active' : ''} onClick={() => setSelectedTab(key)}>
                      {label}{count != null ? <small>{count}</small> : null}
                    </button>
                  ))}
                </div>
                <div className="workspace-object-detail-scroll">
                  {metaLoading ? <div className="workspace-state">Loading metadata…</div> : selectedTab === 'details' ? (
                    <>
                      <section className="workspace-detail-section">
                        <h3>Basic Information</h3>
                        <dl>
                          <div><dt>Label</dt><dd>{objectLabel(selected)}</dd></div>
                          <div><dt>API Name</dt><dd>{objectKey(selected)}</dd></div>
                          <div><dt>Type</dt><dd><span className="workspace-type-chip">{selected.company_id ? 'Custom' : 'Standard'}</span></dd></div>
                          <div><dt>Status</dt><dd><span className={`workspace-status-chip ${selected.active === false ? 'is-off' : ''}`}><i/>{selected.active === false ? 'Inactive' : 'Active'}</span></dd></div>
                          <div><dt>Description</dt><dd>{selected.description || '—'}</dd></div>
                          <div><dt>Created</dt><dd>{readableDate(selected.created_at)}</dd></div>
                          <div><dt>Last Modified</dt><dd>{readableDate(selected.updated_at)}</dd></div>
                        </dl>
                      </section>
                      <section className="workspace-detail-section">
                        <h3>Configuration</h3>
                        <dl>
                          <div><dt>Record Types</dt><dd>{metadata.recordTypes.length}</dd></div>
                          <div><dt>Page Layouts</dt><dd>{metadata.layouts.length}</dd></div>
                          <div><dt>Validation Rules</dt><dd>{metadata.rules.filter((row) => String(row.rule_type || row.type || '').toLowerCase().includes('valid')).length}</dd></div>
                          <div><dt>Automation Triggers</dt><dd>{metadata.rules.filter((row) => !String(row.rule_type || row.type || '').toLowerCase().includes('valid')).length}</dd></div>
                          <div><dt>Buttons & Actions</dt><dd>{metadata.buttons.length}</dd></div>
                        </dl>
                      </section>
                    </>
                  ) : (
                    <section className="workspace-detail-section workspace-detail-list-section">
                      <h3>{tabs.find(([key]) => key === selectedTab)?.[1]}</h3>
                      {(metadata[selectedTab] || []).length ? (metadata[selectedTab] || []).map((row, index) => (
                        <div className="workspace-meta-row" key={row.id || row.api_name || row.name || index}>
                          <strong>{row.label || row.name || row.api_name || row.layout_key || row.rule_key || row.button_key || 'Item'}</strong>
                          <small>{row.api_name || row.field_type || row.page_type || row.trigger_key || row.action_key || row.type || ''}</small>
                        </div>
                      )) : <div className="workspace-state">No {tabs.find(([key]) => key === selectedTab)?.[1].toLowerCase()} configured.</div>}
                    </section>
                  )}
                </div>
              </>
            )}
          </aside>
        </div>
      </main>
    </section>
  )
}
