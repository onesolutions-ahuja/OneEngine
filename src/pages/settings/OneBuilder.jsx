import { useEffect, useMemo, useState } from 'react'
import {
  BarChart3,
  CheckCircle2,
  CircleDot,
  Filter,
  Gauge,
  GripVertical,
  LayoutDashboard,
  Mail,
  MessageSquare,
  Plus,
  Search,
  Send,
  Table2,
  TextCursorInput,
  UserCheck,
  Workflow,
} from 'lucide-react'
import { apiRequest } from '../../services/api'

const TABS = [
  { key: 'workflow', label: 'Workflow', icon: Workflow },
  { key: 'approval', label: 'Approval Flow', icon: UserCheck },
  { key: 'dashboard', label: 'Dashboard Builder', icon: LayoutDashboard },
  { key: 'report', label: 'Report Builder', icon: BarChart3 },
]

const FLOW_COMPONENTS = [
  { key: 'CREATE_RECORD', label: 'Create record', category: 'Record', icon: Plus },
  { key: 'UPDATE_RECORD', label: 'Update record', category: 'Record', icon: TextCursorInput },
  { key: 'CONDITION', label: 'Condition', category: 'Logic', icon: Filter },
  { key: 'IN_APP_NOTIFICATION', label: 'In-app notification', category: 'Actions', icon: MessageSquare },
  { key: 'SEND_EMAIL', label: 'Send email', category: 'Actions', icon: Mail },
  { key: 'SEND_SMS', label: 'Send SMS', category: 'Actions', icon: Send },
  { key: 'STOP', label: 'Stop', category: 'Logic', icon: CircleDot },
]

const APPROVAL_COMPONENTS = [
  { key: 'criteria', label: 'Entry criteria', category: 'Approval', icon: Filter },
  { key: 'approver', label: 'Approver step', category: 'Approval', icon: UserCheck },
  { key: 'submission_action', label: 'Submission action', category: 'Actions', icon: Send },
  { key: 'approval_action', label: 'Approval action', category: 'Actions', icon: CheckCircle2 },
  { key: 'rejection_action', label: 'Rejection action', category: 'Actions', icon: CircleDot },
]

const REPORT_COMPONENTS = [
  { key: 'field', label: 'Field', category: 'Report', icon: TextCursorInput },
  { key: 'filter', label: 'Filter', category: 'Report', icon: Filter },
  { key: 'group', label: 'Group', category: 'Report', icon: Table2 },
  { key: 'aggregate', label: 'Aggregate', category: 'Report', icon: Gauge },
  { key: 'table', label: 'Table', category: 'Visual', icon: Table2 },
  { key: 'chart', label: 'Chart', category: 'Visual', icon: BarChart3 },
]

function normalizeRegistry(input) {
  const rows = Array.isArray(input) ? input : []
  return rows.map((row) => ({
    ...row,
    key: row.key || row.component_key || row.componentKey || row.name,
    label: row.label || row.title || row.name || row.key,
    category: row.category || 'Other',
  })).filter((row) => row.key)
}

function builderSupports(component, builder) {
  const supported = component.supportedBuilders || component.supported_builders || component.builders || []
  const values = Array.isArray(supported) ? supported : supported ? [supported] : []
  if (!values.length) return builder === 'dashboard'
  return values.map((value) => String(value).toUpperCase()).includes(builder.toUpperCase())
}

export default function OneBuilder() {
  const [tab, setTab] = useState('workflow')
  const [registry, setRegistry] = useState([])
  const [paletteSearch, setPaletteSearch] = useState('')
  const [canvas, setCanvas] = useState({
    workflow: [],
    approval: [],
    dashboard: [],
    report: [],
  })
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let live = true
    setLoading(true)
    Promise.all([
      apiRequest('/api/platform/component-registry').catch(() => ({ data: [] })),
      apiRequest('/api/reports/custom/metadata').catch(() => ({ data: null })),
    ])
      .then(([componentResponse]) => {
        if (!live) return
        const rows = componentResponse?.data?.components || componentResponse?.data || []
        setRegistry(normalizeRegistry(rows))
      })
      .finally(() => {
        if (live) setLoading(false)
      })
    return () => { live = false }
  }, [])

  const palette = useMemo(() => {
    let rows
    if (tab === 'workflow') rows = FLOW_COMPONENTS
    else if (tab === 'approval') rows = APPROVAL_COMPONENTS
    else if (tab === 'report') rows = REPORT_COMPONENTS
    else {
      rows = registry
        .filter((component) => builderSupports(component, 'DASHBOARD'))
        .map((component) => ({
          key: component.key,
          label: component.label,
          category: component.category || 'Dashboard',
          icon: component.key === 'kpi' || component.key === 'modern_kpi_card' ? Gauge
            : component.key.includes('chart') ? BarChart3
              : component.key === 'table' ? Table2
                : LayoutDashboard,
        }))
    }

    const q = paletteSearch.trim().toLowerCase()
    return !q ? rows : rows.filter((item) =>
      `${item.label} ${item.category} ${item.key}`.toLowerCase().includes(q),
    )
  }, [tab, registry, paletteSearch])

  const items = canvas[tab] || []

  const addComponent = (component) => {
    const next = {
      id: `${tab}_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      key: component.key,
      label: component.label,
      category: component.category,
    }
    setCanvas((current) => ({ ...current, [tab]: [...(current[tab] || []), next] }))
    setMessage(`${component.label} added`)
  }

  const removeComponent = (id) => {
    setCanvas((current) => ({
      ...current,
      [tab]: (current[tab] || []).filter((item) => item.id !== id),
    }))
  }

  const dragStart = (event, component) => {
    event.dataTransfer.setData('application/x-onebuilder-component', JSON.stringify({
      key: component.key,
      label: component.label,
      category: component.category,
    }))
    event.dataTransfer.effectAllowed = 'copy'
  }

  const drop = (event) => {
    event.preventDefault()
    try {
      const raw = event.dataTransfer.getData('application/x-onebuilder-component')
      if (!raw) return
      addComponent(JSON.parse(raw))
    } catch {}
  }

  const activeTab = TABS.find((item) => item.key === tab)

  return (
    <div className="onebuilder">
      <div className="onebuilder-tabs" role="tablist" aria-label="OneBuilder tools">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`onebuilder-tab ${tab === key ? 'is-active' : ''}`}
            onClick={() => { setTab(key); setPaletteSearch(''); setMessage('') }}
          >
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className="onebuilder-gap" />

      <div className="onebuilder-workspace">
        <main
          className="onebuilder-canvas-card"
          onDragOver={(event) => event.preventDefault()}
          onDrop={drop}
        >
          <div className="onebuilder-canvas-header">
            <div>
              <strong>{activeTab?.label}</strong>
              <span>Canvas</span>
            </div>
            <button
              type="button"
              className="onebuilder-clear"
              disabled={!items.length}
              onClick={() => setCanvas((current) => ({ ...current, [tab]: [] }))}
            >
              Clear
            </button>
          </div>

          <div className="onebuilder-canvas">
            {!items.length ? (
              <div className="onebuilder-empty">
                <activeTab.icon size={34} />
                <strong>Start building</strong>
                <span>Drag components from the right panel or click one to add it.</span>
              </div>
            ) : (
              <div className="onebuilder-canvas-stack">
                {items.map((item, index) => (
                  <div className="onebuilder-node" key={item.id}>
                    <GripVertical size={15} />
                    <div>
                      <small>{index === 0 ? 'Start' : `Step ${index + 1}`}</small>
                      <strong>{item.label}</strong>
                    </div>
                    <button type="button" onClick={() => removeComponent(item.id)}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>

        <aside className="onebuilder-components">
          <div className="onebuilder-components-header">
            <strong>Components</strong>
            <span>{loading && tab === 'dashboard' ? 'Loading registry…' : `${palette.length} available`}</span>
          </div>

          <label className="onebuilder-component-search">
            <Search size={15} />
            <input
              value={paletteSearch}
              onChange={(event) => setPaletteSearch(event.target.value)}
              placeholder="Search components"
            />
          </label>

          <div className="onebuilder-component-list">
            {palette.map((component) => {
              const Icon = component.icon || LayoutDashboard
              return (
                <button
                  type="button"
                  draggable
                  className="onebuilder-component"
                  key={component.key}
                  onDragStart={(event) => dragStart(event, component)}
                  onClick={() => addComponent(component)}
                >
                  <span className="onebuilder-component-icon"><Icon size={15} /></span>
                  <span>
                    <b>{component.label}</b>
                    <small>{component.category}</small>
                  </span>
                  <Plus size={14} />
                </button>
              )
            })}
          </div>
        </aside>
      </div>

      {message ? <div className="onebuilder-message">{message}</div> : null}
    </div>
  )
}
